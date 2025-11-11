
import { GoogleGenAI } from "@google/genai";
import { SearchType, type SearchResult, type GroundingSource, type ComparisonResult } from '../types';

const getGeminiPrompt = (type: SearchType, query: string): string => {
  const basePrompt = `Você é um especialista em contabilidade fiscal brasileira. Sua tarefa é fornecer uma análise detalhada e atualizada sobre o código fiscal fornecido, utilizando a busca do Google para garantir a precisão das informações.`;
  
  if (type === SearchType.CFOP) {
    return `${basePrompt}

    Analise o CFOP: "${query}".

    Sua resposta DEVE incluir os seguintes tópicos, claramente separados por títulos em markdown (**Título**):
    1.  **Código e Descrição:** O número do CFOP e sua descrição oficial completa.
    2.  **Aplicação:** Uma explicação clara de quando este CFOP deve ser utilizado, com exemplos práticos.
    3.  **Incidência de Impostos:** Um resumo sobre a incidência de impostos (ICMS, IPI, PIS/COFINS) para operações com este CFOP.`;
  }
  
  return `${basePrompt}

    Analise o NCM: "${query}".

    Sua resposta DEVE incluir os seguintes tópicos, claramente separados por títulos em markdown (**Título**):
    1.  **Código e Descrição:** O número do NCM e sua descrição oficial completa.
    2.  **Incidência de Impostos:** Detalhes sobre as alíquotas e regimes de tributação para IPI, PIS/COFINS e ICMS (considerando regras gerais).
    3.  **Exemplos de Produtos:** Uma lista de produtos que se enquadram neste NCM.`;
};

export const fetchFiscalData = async (type: SearchType, query: string): Promise<SearchResult> => {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY is not configured.");
  }
  
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = getGeminiPrompt(type, query);

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

    return { text, sources, query };
  } catch (error) {
    console.error("Error fetching data from Gemini API:", error);
    if (error instanceof Error) {
        throw new Error(`Erro ao consultar a API para "${query}": ${error.message}`);
    }
    throw new Error(`Ocorreu um erro desconhecido ao consultar a API para "${query}".`);
  }
};

const getComparisonPrompt = (type: SearchType, result1: SearchResult, result2: SearchResult): string => {
    return `Você é um especialista em contabilidade fiscal brasileira. Compare os dois códigos ${type} a seguir, detalhados abaixo.
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


export const fetchComparison = async (type: SearchType, query1: string, query2: string): Promise<ComparisonResult> => {
    if (!process.env.API_KEY) {
        throw new Error("API_KEY is not configured.");
    }

    // 1. Fetch data for both codes in parallel
    const [result1, result2] = await Promise.all([
        fetchFiscalData(type, query1),
        fetchFiscalData(type, query2)
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
