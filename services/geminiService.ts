
import { GoogleGenAI } from "@google/genai";
import { SearchType, type SearchResult, type GroundingSource, type ComparisonResult } from '../types';

const getGeminiPrompt = (type: SearchType, query: string, municipio?: string, alias?: string, responsavel?: string): string => {
  const basePrompt = `Você é um especialista em contabilidade fiscal brasileira. Sua tarefa é fornecer uma análise detalhada e atualizada sobre o código fiscal fornecido, utilizando a busca do Google para garantir a precisão das informações.`;
  
  if (type === SearchType.CFOP) {
    return `${basePrompt}

    Analise o CFOP: "${query}".

    Sua resposta DEVE incluir os seguintes tópicos, claramente separados por títulos em markdown (**Título**):
    1.  **Código e Descrição:** O número do CFOP e sua descrição oficial completa.
    2.  **Aplicação:** Uma explicação clara de quando este CFOP deve ser utilizado, com exemplos práticos.
    3.  **Incidência de Impostos:** Um resumo sobre a incidência de impostos (ICMS, IPI, PIS/COFINS) para operações com este CFOP.`;
  }

  if (type === SearchType.NCM) {
    return `${basePrompt}

    Analise o NCM: "${query}".

    Sua resposta DEVE incluir os seguintes tópicos, claramente separados por títulos em markdown (**Título**):
    1.  **Código e Descrição:** O número do NCM e sua descrição oficial completa.
    2.  **Incidência de Impostos:** Detalhes sobre as alíquotas e regimes de tributação para IPI, PIS/COFINS e ICMS (considerando regras gerais).
    3.  **Exemplos de Produtos:** Uma lista de produtos que se enquadram neste NCM.`;
  }
  
  const locationPrompt = municipio ? ` para o município de ${municipio}` : '';
  const locationConsideration = municipio ? `\n\n**LEGISLAÇÃO MUNICIPAL:** Dê atenção especial às regras específicas, alíquotas e exceções previstas na legislação de ${municipio}. Se houver um Código de Serviço específico no município para este subitem, mencione-o.` : '';
  const aliasInstruction = alias ? `O usuário também forneceu o alias/termo de busca: "${alias}". Use este termo para ajudar a identificar o subitem correto da LC 116/2003 se o campo principal não for um código, ou como contexto adicional para a análise.` : '';
  const responsavelInstruction = responsavel ? `\n\n**CONTEXTO DO RESPONSÁVEL TRIBUTÁRIO:** A análise deve ser focada na perspectiva de que o responsável pelo recolhimento é o **'${responsavel}'**. Dê ênfase especial a como isso afeta a obrigação de reter o ISS.` : '';
  const finalQuery = query || alias || "serviço não especificado";

  return `Você é um especialista em legislação tributária brasileira, focado em Imposto Sobre Serviços (ISS). Sua tarefa é analisar o subitem da Lista de Serviços anexa à Lei Complementar 116/2003 e detalhar as regras de retenção de ISS${locationPrompt}, utilizando a busca do Google para informações atualizadas e específicas do local.${responsavelInstruction}
    ${aliasInstruction}

    Analise o Subitem da LC 116/2003 relacionado a: "${finalQuery}"${locationPrompt}.

    Sua resposta DEVE incluir os seguintes tópicos, claramente separados por títulos em markdown (**Título**):
    1.  **Descrição do Serviço:** A descrição completa do subitem identificado.
    2.  **Retenção de ISS?:** **DESTAQUE MÁXIMO AQUI.** Uma resposta clara e direta (Ex: **Sim, há retenção na fonte.** ou **Não, via de regra.** ou **Depende das seguintes condições:**) em negrito e em uma linha separada. Justifique a resposta com base na LC 116/2003 e, se um município for informado, na legislação municipal. Esta é a informação mais crucial.
    3.  **Base Legal:** O artigo da LC 116/2003 e a base legal municipal (número da lei, artigo, etc.) se um município for informado.
    4.  **Local de Incidência:** A regra geral (estabelecimento do prestador) e as exceções aplicáveis a este serviço, considerando a legislação federal e a municipal.
    5.  **Condições e Exceções:** Detalhes sobre quando o tomador é o responsável tributário, regras para MEI/Simples Nacional, etc. **REGRA CRÍTICA:** Se a resposta para "Retenção de ISS?" for 'Depende...', esta seção é OBRIGATORIAMENTE formatada como uma lista de bullet points claros e detalhados (iniciando com \`* \`). Cada ponto deve explicar uma condição específica que define se a retenção deve ou não deve ocorrer.
    6.  **Observações Operacionais:** Dicas práticas sobre o preenchimento da NFS-e, particularidades do município informado ou tipos de tomadores (ex: órgãos públicos).${locationConsideration}`;
};

export const fetchFiscalData = async (type: SearchType, query: string, municipio?: string, alias?: string, responsavel?: string): Promise<SearchResult> => {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY is not configured.");
  }
  
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const finalQuery = query || alias || '';
  const prompt = getGeminiPrompt(type, finalQuery, municipio, alias, responsavel);

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const text = response.text;
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const sources: GroundingSource[] = groundingChunks?.filter((chunk: any) => chunk.web) || [];

    return { text, sources, query: finalQuery };
  } catch (error) {
    console.error("Error fetching data from Gemini API:", error);
    if (error instanceof Error) {
        throw new Error(`Erro ao consultar a API para "${finalQuery}": ${error.message}`);
    }
    throw new Error(`Ocorreu um erro desconhecido ao consultar a API para "${finalQuery}".`);
  }
};

const getComparisonPrompt = (type: SearchType, result1: SearchResult, result2: SearchResult): string => {
    const typeName = type === SearchType.SERVICO ? 'subitens de serviço da LC 116/2003' : `códigos ${type}`;

    return `Você é um especialista em contabilidade fiscal brasileira. Compare os dois ${typeName} a seguir, detalhados abaixo.
Sua resposta deve ser concisa e focada nos pontos principais para ajudar um profissional da área a decidir qual usar. Responda em português.

Formate a resposta com Markdown. A resposta DEVE conter EXATAMENTE as seguintes seções:
1.  **Visão Geral e Principal Diferença:** Um parágrafo explicando a principal distinção de uso entre os dois códigos.
2.  **Semelhanças:** Uma lista de pontos em comum, especialmente em relação à tributação ou tipo de operação.
3.  **Diferenças Chave:** Uma lista de diferenças cruciais na aplicação.
4.  **Quando Usar Cada Um:** Uma recomendação clara sobre o cenário ideal para cada código, com exemplos se possível.

---
**Código 1: ${result1.query}**
${result1.text}
---
**Código 2: ${result2.query}**
${result2.text}
---
`;
}


export const fetchComparison = async (type: SearchType, query1: string, query2: string, municipio?: string, responsavel?: string): Promise<ComparisonResult> => {
    if (!process.env.API_KEY) {
        throw new Error("API_KEY is not configured.");
    }

    // 1. Fetch data for both codes in parallel
    const [result1, result2] = await Promise.all([
        fetchFiscalData(type, query1, municipio, undefined, responsavel),
        fetchFiscalData(type, query2, municipio, undefined, responsavel)
    ]);

    // 2. Create a new prompt for comparison
    const comparisonPrompt = getComparisonPrompt(type, result1, result2);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // 3. Call Gemini for the comparison analysis
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: comparisonPrompt,
        });
        const summary = response.text;
        return { summary, result1, result2 };
    } catch (error) {
        console.error("Error fetching comparison from Gemini API:", error);
        if (error instanceof Error) {
            throw new Error(`Erro ao gerar a comparação: ${error.message}`);
        }
        throw new Error("Ocorreu um erro desconhecido ao gerar a comparação.");
    }
};
