


import { GoogleGenAI, Type } from "@google/genai";
import { SearchType, type SearchResult, type GroundingSource, type ComparisonResult, type NewsAlert, type SimilarService, type CnaeSuggestion, type SimplesNacionalEmpresa, type SimplesNacionalResumo, CnpjData } from '../types';

// Separators for parsing the combined comparison response
const ANALYSIS_1_SEPARATOR = '---ANALYSIS_1_START---';
const ANALYSIS_2_SEPARATOR = '---ANALYSIS_2_START---';
const SUMMARY_SEPARATOR_COMPARE = '---SUMMARY_START---';

// New separators for Reforma Tributária CNAE analysis
const REFORMA_CNAE_DETAIL_SEPARATOR = '---DETALHAMENTO_CNAE---';
const REFORMA_SUMMARY_SEPARATOR = '---RESUMO_EXECUTIVO---';
const REFORMA_CRUCIAL_SEPARATOR = '---MUDANCAS_CRUCIAIS---';
const REFORMA_ATUAL_SEPARATOR = '---CENARIO_ATUAL---';
const REFORMA_NOVO_SEPARATOR = '---NOVO_CENARIO---';
const REFORMA_OPORTUNIDADES_SEPARATOR = '---OPORTUNIDADES---';


/**
 * Checks if an error is transient and can be retried.
 * Looks for 429 (rate limit) or 503 (service unavailable) errors.
 */
const isRetryableError = (error: unknown): boolean => {
    if (!error) return false;
    const errorString = String(error).toLowerCase();
    return (
        errorString.includes("resource_exhausted") ||
        errorString.includes("429") || // Rate limit
        errorString.includes("503") || // Service unavailable
        errorString.includes("model is overloaded")
    );
};


// Retry logic constants
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

// Helper function for async sleep
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getAnalysisInstructions = (type: SearchType, query: string, municipio?: string, alias?: string, responsavel?: string, cnae?: string, regimeTributario?: string, reformaQuery?: string, aliquotaIcms?: string, aliquotaPisCofins?: string, aliquotaIss?: string): string => {
  if (type === SearchType.CFOP) {
    return `Analise o CFOP: "${query}".

    Sua resposta DEVE incluir os seguintes tópicos, claramente separados por títulos em markdown (**Título**):
    1.  **Código e Descrição:** O número do CFOP e sua descrição oficial completa.
    2.  **Aplicação:** Uma explicação clara de quando este CFOP deve ser utilizado, com exemplos práticos.
    3.  **Incidência de Impostos:** Um resumo sobre a incidência de impostos (ICMS, IPI, PIS/COFINS) para operações com este CFOP.`;
  }

  if (type === SearchType.NCM) {
    return `Analise o NCM: "${query}".

    Sua resposta DEVE incluir os seguintes tópicos, claramente separados por títulos em markdown (**Título**):
    1.  **Código e Descrição:** O número do NCM e sua descrição oficial completa.
    2.  **Incidência de Impostos:** Detalhes sobre as alíquotas e regimes de tributação para IPI, PIS/COFINS e ICMS (considerando regras gerais).
    3.  **Exemplos de Produtos:** Uma lista de produtos que se enquadram neste NCM.`;
  }

  if (type === SearchType.REFORMA_TRIBUTARIA) {
    if (!cnae) return '# Erro: CNAE é obrigatório para esta análise.';

    const queryInstruction = reformaQuery
        ? `\n# Foco da Análise
O usuário inseriu uma pergunta específica: "${reformaQuery}". A análise deve usar o CNAE como o contexto da empresa, mas o foco principal da resposta deve ser responder a esta pergunta de forma detalhada e completa dentro da estrutura abaixo.`
        : '';
    
    return `# Identidade e Contexto
Você é um consultor tributário sênior, especialista na Reforma Tributária brasileira (EC 132/2023). Sua missão é fornecer uma análise clara e objetiva do impacto da reforma para uma empresa com um CNAE específico. Use a busca do Google para garantir que todas as informações, incluindo os detalhes do CNAE, alíquotas e regras estejam absolutamente atualizadas.

# Tarefa
Analise o impacto da Reforma Tributária para o CNAE: "${cnae}".${queryInstruction}

# Estrutura Obrigatória da Resposta
Formate a resposta em Markdown, seguindo RIGOROSAMENTE as seções abaixo, usando os separadores exatos:

${REFORMA_CNAE_DETAIL_SEPARATOR}
**Descrição Completa do CNAE:** Usando a busca, forneça a descrição oficial e detalhada da atividade conforme o CONCLA/IBGE.
**Atividades Compreendidas:** Em formato de lista (bullet points), detalhe as atividades que estão incluídas neste CNAE.
**Atividades Não Compreendidas:** Em formato de lista (bullet points), liste atividades que frequentemente causam confusão mas não pertencerem a este CNAE.

${REFORMA_SUMMARY_SEPARATOR}
**Resumo Executivo para o Empresário**: Em dois parágrafos curtos e diretos, explique as principais mudanças práticas (carga tributária, complexidade, oportunidades) para uma PME com este CNAE. Use uma linguagem simples.

${REFORMA_CRUCIAL_SEPARATOR}
**Mudanças Cruciais em Destaque**: Em formato de lista (bullet points), resuma os 3 pontos de mudança mais críticos e de maior impacto (positivo ou negativo) para este CNAE. Seja direto e objetivo.

${REFORMA_ATUAL_SEPARATOR}
**Cenário Atual (Pré-Reforma)**
*   **Tributos Principais:** Liste os principais tributos federais (PIS, COFINS, IPI) e estaduais/municipais (ICMS, ISS) que incidem sobre a atividade.
*   **Regime de Apuração:** Descreva o regime de apuração comum para PMEs neste CNAE (ex: Simples Nacional, Lucro Presumido, e a sistemática de créditos de PIS/COFINS e ICMS).
*   **Alíquotas Efetivas Médias:** Forneça uma estimativa da carga tributária média sobre o faturamento.
*   **Principais Obrigações Acessórias:** **DESTAQUE OBRIGATÓRIO E DETALHADO.** Liste as declarações mais comuns para este CNAE (ex: EFD Contribuições, EFD ICMS/IPI, SPED Fiscal, DEFIS, DCTF). Para cada obrigação, **explique claramente sua finalidade (o que ela informa ao fisco) e o impacto prático no dia a dia da empresa** (ex: complexidade, tempo gasto, necessidade de software específico). Use negrito para os nomes das declarações.

${REFORMA_NOVO_SEPARATOR}
**Novo Cenário (Pós-Reforma)**
*   **Novos Tributos e Imposto Seletivo (IS):** Explique a incidência da CBS (federal) e do IBS (estadual/municipal). **Detalhe a aplicabilidade e as possíveis alíquotas do Imposto Seletivo (IS)**, explicando para quais tipos de produtos ou serviços ele pode ser aplicado com base no CNAE fornecido.
*   **Alíquotas Estimadas:** Com base nas informações atuais, estime a alíquota aplicável (padrão, reduzida, zerada, regime específico).
*   **Regimes para PMEs (Simples Nacional):** **Destaque as mudanças específicas e o impacto para empresas deste CNAE optantes pelo Simples Nacional**, incluindo regras de transição, novas alíquotas ou opções de adesão ao novo sistema.
*   **Sistema de Créditos:** Detalhe como funcionará o sistema de crédito amplo (crédito financeiro) e o que muda em relação ao sistema atual para este CNAE.
*   **Impacto no Fluxo de Caixa:** Analise o impacto esperado no caixa da empresa.
*   **Novas Obrigações e Simplificação:** **DESTAQUE OBRIGATÓRIO E DETALHADO.** Descreva com clareza o destino de CADA UMA das obrigações listadas no cenário anterior. **Liste explicitamente quais serão extintas, quais serão substituídas e o que as substituirá** (ex: "A **EFD Contribuições** será extinta e suas informações farão parte da nova Declaração do IBS/CBS"). Detalhe como será o novo modelo de declaração unificada e explique o **impacto prático e quantificável da simplificação** (ex: redução estimada de X horas mensais, diminuição de Y% no custo com software fiscal, etc.).

${REFORMA_OPORTUNIDADES_SEPARATOR}
**Incentivos Fiscais e Oportunidades**: Com base no CNAE, pesquise e descreva possíveis incentivos fiscais setoriais que possam ser mantidos ou criados, e sugira oportunidades de planejamento tributário ou linhas de crédito BNDES/FINEP que a empresa poderia explorar. Formate como uma lista de bullet points.`;
  }
  
  const locationPrompt = municipio ? ` para o município de ${municipio}` : '';
  const locationConsideration = municipio ? `\n\n**LEGISLAÇÃO MUNICIPAL:** Dê atenção especial às regras específicas, alíquotas e exceções previstas na legislação de ${municipio}. Se houver um Código de Serviço específico no município para este subitem, mencione-o.` : '';
  const aliasInstruction = alias ? `O usuário também forneceu o alias/termo de busca: "${alias}". Use este termo para ajudar a identificar o subitem correto da LC 116/2003 se o campo principal não for um código, ou como contexto adicional para a análise.` : '';
  const responsavelInstruction = responsavel ? `\n\n**CONTEXTO DO RESPONSÁVEL TRIBUTÁRIO:** A análise deve ser focada na perspectiva de que o responsável pelo recolhimento é o **'${responsavel}'**. Dê ênfase especial a como isso afeta a obrigação de reter o ISS.` : '';
  const regimeInstruction = regimeTributario ? `\n\n**CONTEXTO DO REGIME TRIBUTÁRIO:** A análise deve considerar que a empresa é optante pelo regime do **'${regimeTributario}'**. Dê ênfase a como isso impacta as regras de retenção do ISS, incluindo exceções ou particularidades.` : '';
  const icmsInstruction = aliquotaIcms ? `\n\n**CONTEXTO DE ALÍQUOTAS (ICMS):** Considere uma alíquota de ICMS de **${aliquotaIcms}%** e explique se há impacto ou relação com o serviço prestado.` : '';
  const pisCofinsInstruction = aliquotaPisCofins ? `\n\n**CONTEXTO DE ALÍQUOTAS (PIS/COFINS):** Considere uma alíquota de PIS/COFINS de **${aliquotaPisCofins}%** e explique o impacto no serviço, especialmente em relação a retenções.` : '';
  const issInstruction = aliquotaIss ? `\n\n**CONTEXTO DE ALÍQUOTA (ISS):** A análise deve considerar a alíquota de ISS de **${aliquotaIss}%** informada pelo usuário ao discutir a carga tributária e o valor a ser retido.` : '';
  const finalQuery = query || alias || "serviço não especificado";

  return `Analise o Subitem da LC 116/2003 relacionado a: "${finalQuery}"${locationPrompt}.

    Sua resposta DEVE incluir os seguintes tópicos, claramente separados por títulos em markdown (**Título**):
    1.  **Descrição do Serviço:** A descrição completa do subitem identificado.
    2.  **Retenção de ISS?:** **DESTAQUE MÁXIMO AQUI.** Uma resposta clara e direta (Ex: **Sim, há retenção na fonte.** ou **Não, via de regra.** ou **Depende das seguintes condições:**) em negrito e em uma linha separada. Justifique a resposta com base na LC 116/2003 e, se um município for informado, na legislação municipal. Esta é a informação mais crucial.
    3.  **Base Legal:** O artigo da LC 116/2003 e a base legal municipal (número da lei, artigo, etc.) se um município for informado.
    4.  **Local de Incidência:** A regra geral (estabelecimento do prestador) e as exceções aplicáveis a este serviço, considerando a legislação federal e a municipal.
    5.  **Condições e Exceções:** Detalhes sobre quando o tomador é o responsável tributário, regras para MEI/Simples Nacional, etc. **REGRA CRÍTICA:** Se a resposta para "Retenção de ISS?" for 'Depende...', esta seção é OBRIGATÓRIO formatada como uma lista de bullet points claros e detalhados (iniciando com \`* \`). Cada ponto deve explicar uma condição específica que define se a retenção deve ou não deve ocorrer.
    6.  **Observações Operacionais:** Dicas práticas sobre o preenchimento da NFS-e, particularidades do município informado ou tipos de tomadores (ex: órgãos públicos).${locationConsideration}${regimeInstruction}${icmsInstruction}${pisCofinsInstruction}${issInstruction}`;
};


const getGeminiPrompt = (type: SearchType, query: string, municipio?: string, alias?: string, responsavel?: string, cnae?: string, regimeTributario?: string, reformaQuery?: string, aliquotaIcms?: string, aliquotaPisCofins?: string, aliquotaIss?: string): string => {
  let basePrompt: string;
  let instructions: string;

  if (type === SearchType.REFORMA_TRIBUTARIA) {
    // Reforma uses a completely different prompt structure that includes the persona.
    return getAnalysisInstructions(type, '', undefined, undefined, undefined, cnae, undefined, reformaQuery);
  } else if (type === SearchType.SERVICO) {
    basePrompt = `Você é um especialista em legislação tributária brasileira, focado em Imposto Sobre Serviços (ISS). Sua tarefa é analisar o subitem da Lista de Serviços anexa à Lei Complementar 116/2003 e detalhar as regras de retenção de ISS, utilizando a busca do Google para informações atualizadas e específicas do local.`;
    const responsavelInstruction = responsavel ? `\n\n**CONTEXTO DO RESPONSÁVEL TRIBUTÁRIO:** A análise deve ser focada na perspectiva de que o responsável pelo recolhimento é o **'${responsavel}'**. Dê ênfase especial a como isso afeta a obrigação de reter o ISS.` : '';
    const aliasInstruction = alias ? `O usuário também forneceu o alias/termo de busca: "${alias}". Use este termo para ajudar a identificar o subitem correto da LC 116/2003 se o campo principal não for um código, ou como contexto adicional para a análise.` : '';
    instructions = `${responsavelInstruction}\n${aliasInstruction}\n\n${getAnalysisInstructions(type, query, municipio, alias, responsavel, undefined, regimeTributario, undefined, aliquotaIcms, aliquotaPisCofins, aliquotaIss)}`;
  } else {
    basePrompt = `Você é um especialista em contabilidade fiscal brasileira. Sua tarefa é fornecer uma análise detalhada e atualizada sobre o código fiscal fornecido, utilizando a busca do Google para garantir a precisão das informações.`;
    instructions = getAnalysisInstructions(type, query, municipio, alias, responsavel);
  }
  
  return `${basePrompt}\n\n${instructions}`;
};

const handleGeminiError = (error: unknown, context: string): Error => {
    console.error(`Error during Gemini API call for "${context}":`, error);
    
    const errorString = String(error).toLowerCase();

    if (errorString.includes("503") || errorString.includes("model is overloaded")) {
        return new Error("O serviço da IA está sobrecarregado no momento (Erro 503). Por favor, tente novamente mais tarde.");
    }
     if (errorString.includes("429") || errorString.includes("resource_exhausted")) {
        return new Error("Muitas solicitações foram feitas em um curto período (Erro 429). Por favor, aguarde um momento antes de tentar novamente.");
    }
    if (errorString.includes("permission_denied") || errorString.includes("403")) {
        return new Error("Erro de permissão (403). Verifique se sua chave de API (API_KEY) é válida e tem as permissões necessárias.");
    }
    if (errorString.includes("internal") || errorString.includes("500")) {
        return new Error("Ocorreu um erro interno no servidor da API (500). Por favor, tente novamente mais tarde.");
    }

    if (error instanceof Error) {
        return new Error(`Erro ao consultar a API para "${context}": ${error.message}`);
    }

    return new Error(`Ocorreu um erro desconhecido ao consultar a API para "${context}".`);
};


export const fetchFiscalData = async (type: SearchType, query: string, municipio?: string, alias?: string, responsavel?: string, cnae?: string, regimeTributario?: string, reformaQuery?: string, aliquotaIcms?: string, aliquotaPisCofins?: string, aliquotaIss?: string): Promise<SearchResult> => {
  if (!process.env.API_KEY) {
    throw new Error("A API_KEY não está configurada.");
  }
  
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const finalQuery = type === SearchType.REFORMA_TRIBUTARIA ? `Análise para CNAE ${cnae}` : (query || alias || '');
  const prompt = getGeminiPrompt(type, query, municipio, alias, responsavel, cnae, regimeTributario, reformaQuery, aliquotaIcms, aliquotaPisCofins, aliquotaIss);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
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

        return { text, sources, query: finalQuery || 'Análise Geral', timestamp: Date.now() };
    } catch (error) {
        if (isRetryableError(error) && attempt < MAX_RETRIES - 1) {
            const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
            console.warn(`Retryable error caught. Retrying in ${delay}ms... (Attempt ${attempt + 1}/${MAX_RETRIES})`);
            await sleep(delay);
            continue; // Retry the loop
        }
        
        // For other errors or if max retries are reached
        throw handleGeminiError(error, finalQuery || 'Análise Geral');
    }
  }
  // This part should be unreachable if logic is correct, but as a fallback:
  throw new Error('Falha na consulta após múltiplas tentativas.');
};

const getSingleCallComparisonPrompt = (type: SearchType, query1: string, query2: string, municipio?: string, responsavel?: string, regimeTributario?: string, aliquotaIcms?: string, aliquotaPisCofins?: string, aliquotaIss?: string): string => {
    if (type === SearchType.REFORMA_TRIBUTARIA) {
        // query1 and query2 are CNAEs
        const analysisInstructions1 = getAnalysisInstructions(type, '', undefined, undefined, undefined, query1);
        const analysisInstructions2 = getAnalysisInstructions(type, '', undefined, undefined, undefined, query2);
        const comparisonSummaryPrompt = `Agora, forneça uma análise comparativa concisa do impacto da Reforma Tributária entre os dois CNAEs. A resposta DEVE conter EXATAMENTE as seguintes seções:\n1. **Visão Geral e Principal Diferença de Impacto**\n2. **Comparativo de Alíquotas e Regimes**\n3. **Oportunidades e Riscos Divergentes**\n4. **Recomendação Estratégica**`;

        return `Você é um consultor tributário sênior, especialista na Reforma Tributária brasileira. Sua tarefa é analisar e comparar o impacto da reforma para dois CNAEs distintos. Utilize a busca do Google para garantir a precisão das informações.

Siga estas instruções ESTRITAMENTE:
1.  Primeiro, forneça a análise completa para o CNAE 1 ("${query1}"), conforme as instruções de análise abaixo. Inicie esta seção EXATAMENTE com a linha: \`${ANALYSIS_1_SEPARATOR}\`.
2.  Depois, forneça a análise completa para o CNAE 2 ("${query2}"), conforme as instruções de análise. Inicie esta seção EXATAMENTE com a linha: \`${ANALYSIS_2_SEPARATOR}\`.
3.  Finalmente, forneça a análise comparativa. Inicie esta seção EXATAMENTE com a linha: \`${SUMMARY_SEPARATOR_COMPARE}\`.

---
**INSTRUÇÕES PARA ANÁLISE DO CNAE 1:**
${analysisInstructions1}
---
**INSTRUÇÕES PARA ANÁLISE DO CNAE 2:**
${analysisInstructions2}
---
**INSTRUÇÕES PARA ANÁLISE COMPARATIVA:**
${comparisonSummaryPrompt}
---
`;
    }

    const analysisInstructions1 = getAnalysisInstructions(type, query1, municipio, undefined, responsavel, undefined, regimeTributario, undefined, aliquotaIcms, aliquotaPisCofins, aliquotaIss);
    const analysisInstructions2 = getAnalysisInstructions(type, query2, municipio, undefined, responsavel, undefined, regimeTributario, undefined, aliquotaIcms, aliquotaPisCofins, aliquotaIss);
    const comparisonSummaryPrompt = `Agora, forneça uma análise comparativa concisa entre os dois. A resposta DEVE conter EXATAMENTE as seguintes seções:\n1. **Visão Geral e Principal Diferença**\n2. **Semelhanças**\n3. **Diferenças Chave**\n4. **Quando Usar Cada Um**`;

    return `Você é um especialista em contabilidade fiscal brasileira. Sua tarefa é analisar e comparar dois itens fiscais. Utilize a busca do Google para garantir a precisão das informações.

Siga estas instruções ESTRITAMENTE:
1.  Primeiro, forneça a análise completa para o Item 1, conforme as instruções de análise abaixo. Inicie esta seção EXATAMENTE com a linha: \`${ANALYSIS_1_SEPARATOR}\`.
2.  Depois, forneça a análise completa para o Item 2, conforme as instruções de análise. Inicie esta seção EXATAMENTE com a linha: \`${ANALYSIS_2_SEPARATOR}\`.
3.  Finalmente, forneça a análise comparativa. Inicie esta seção EXATAMENTE com a linha: \`${SUMMARY_SEPARATOR_COMPARE}\`.

---
**INSTRUÇÕES PARA ANÁLISE DO ITEM 1:**
${analysisInstructions1}
---
**INSTRUÇÕES PARA ANÁLISE DO ITEM 2:**
${analysisInstructions2}
---
**INSTRUÇÕES PARA ANÁLISE COMPARATIVA:**
${comparisonSummaryPrompt}
---
`;
}


export const fetchComparison = async (type: SearchType, query1: string, query2: string, municipio?: string, responsavel?: string, regimeTributario?: string, aliquotaIcms?: string, aliquotaPisCofins?: string, aliquotaIss?: string): Promise<ComparisonResult> => {
    if (!process.env.API_KEY) {
        throw new Error("A API_KEY não está configurada.");
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = getSingleCallComparisonPrompt(type, query1, query2, municipio, responsavel, regimeTributario, aliquotaIcms, aliquotaPisCofins, aliquotaIss);

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
                config: {
                tools: [{ googleSearch: {} }],
                },
            });

            const fullText = response.text;
            const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
            const sources: GroundingSource[] = groundingChunks?.filter((chunk: any) => chunk.web) || [];

            // Safer parsing logic
            const start1 = fullText.indexOf(ANALYSIS_1_SEPARATOR);
            const start2 = fullText.indexOf(ANALYSIS_2_SEPARATOR);
            const startSummary = fullText.indexOf(SUMMARY_SEPARATOR_COMPARE);

            if (start1 === -1 || start2 === -1 || startSummary === -1) {
                console.error("Failed to parse API response. Response text:", fullText);
                throw new Error("Falha ao analisar a resposta da API. Os separadores necessários não foram encontrados.");
            }

            const analysis1Text = fullText.substring(start1 + ANALYSIS_1_SEPARATOR.length, start2).trim();
            const analysis2Text = fullText.substring(start2 + ANALYSIS_2_SEPARATOR.length, startSummary).trim();
            const summaryText = fullText.substring(startSummary + SUMMARY_SEPARATOR_COMPARE.length).trim();
            
            const now = Date.now();
            const result1: SearchResult = { text: analysis1Text, sources, query: type === SearchType.REFORMA_TRIBUTARIA ? `CNAE ${query1}` : query1, timestamp: now };
            const result2: SearchResult = { text: analysis2Text, sources, query: type === SearchType.REFORMA_TRIBUTARIA ? `CNAE ${query2}` : query2, timestamp: now };

            return { summary: summaryText, result1, result2 };

        } catch (error) {
            if (isRetryableError(error) && attempt < MAX_RETRIES - 1) {
                const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
                console.warn(`Retryable error caught. Retrying in ${delay}ms... (Attempt ${attempt + 1}/${MAX_RETRIES})`);
                await sleep(delay);
                continue;
            }
            
            throw handleGeminiError(error, `comparação entre "${query1}" e "${query2}"`);
        }
    }
     // This part should be unreachable if logic is correct, but as a fallback:
    throw new Error('Falha na comparação após múltiplas tentativas.');
};

export const fetchNewsAlerts = async (): Promise<NewsAlert[]> => {
    if (!process.env.API_KEY) {
        throw new Error("A API_KEY não está configurada.");
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `Você é um editor de notícias fiscais para contadores no Brasil. Com base nas informações mais recentes que você possui, liste as 3 notícias ou atualizações regulatórias mais impactantes sobre tributos (CFOP, NCM, ICMS, IPI, PIS/COFINS, etc.) no Brasil. Para cada uma, forneça um título chamativo, um resumo conciso de 2-3 frases, e o link da fonte principal.`;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                title: {
                                    type: Type.STRING,
                                    description: 'O título da notícia ou atualização fiscal.',
                                },
                                summary: {
                                    type: Type.STRING,
                                    description: 'Um resumo conciso da notícia em 2-3 frases.',
                                },
                                source: {
                                    type: Type.STRING,
                                    description: 'A URL da fonte principal da notícia.',
                                },
                            },
                            required: ["title", "summary", "source"],
                        },
                    },
                },
            });
            
            const jsonText = response.text.trim();
            // A simple validation to ensure it's an array-like structure
            if (jsonText.startsWith('[') && jsonText.endsWith(']')) {
                 return JSON.parse(jsonText) as NewsAlert[];
            } else {
                console.error("Gemini did not return a valid JSON array for news alerts:", jsonText);
                throw new Error("A resposta da API para as notícias não estava no formato esperado.");
            }
        } catch (error) {
            if (isRetryableError(error) && attempt < MAX_RETRIES - 1) {
                const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
                console.warn(`Retryable error on news alerts. Retrying in ${delay}ms... (Attempt ${attempt + 1}/${MAX_RETRIES})`);
                await sleep(delay);
                continue;
            }

            // For other errors or if max retries are reached, use the centralized handler
            throw handleGeminiError(error, "últimas atualizações fiscais");
        }
    }
    
    // This part should be unreachable if logic is correct, but as a fallback:
    throw new Error('Falha ao buscar notícias após múltiplas tentativas.');
};

export const fetchSimilarServices = async (serviceQuery: string): Promise<SimilarService[]> => {
    if (!process.env.API_KEY) {
        throw new Error("A API_KEY não está configurada.");
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `Com base no serviço "${serviceQuery}", liste 5 subitens da Lei Complementar 116/2003 que sejam funcionalmente similares, relacionados ou complementares. Sua resposta DEVE ser um array JSON de objetos, onde cada objeto tem as chaves "code" e "description".`;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                code: {
                                    type: Type.STRING,
                                    description: 'O código do subitem do serviço (ex: "7.02").',
                                },
                                description: {
                                    type: Type.STRING,
                                    description: 'A descrição oficial do serviço.',
                                },
                            },
                            required: ["code", "description"],
                        },
                    },
                },
            });

            const jsonText = response.text.trim();
            if (jsonText.startsWith('[') && jsonText.endsWith(']')) {
                return JSON.parse(jsonText) as SimilarService[];
            } else {
                console.error("Gemini did not return a valid JSON array for similar services:", jsonText);
                throw new Error("A resposta da API para serviços similares não estava no formato esperado.");
            }
        } catch (error) {
            if (isRetryableError(error) && attempt < MAX_RETRIES - 1) {
                const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
                console.warn(`Retryable error on similar services. Retrying in ${delay}ms... (Attempt ${attempt + 1}/${MAX_RETRIES})`);
                await sleep(delay);
                continue;
            }
            throw handleGeminiError(error, `busca por serviços similares a "${serviceQuery}"`);
        }
    }
    throw new Error('Falha ao buscar serviços similares após múltiplas tentativas.');
};

export const fetchCnaeSuggestions = async (searchTerm: string): Promise<CnaeSuggestion[]> => {
    if (!process.env.API_KEY) {
        throw new Error("A API_KEY não está configurada.");
    }
    if (searchTerm.trim().length < 3) {
        return []; // Don't search for very short terms
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `Atue como uma API de consulta de CNAE (Classificação Nacional de Atividades Econômicas) do Brasil. Com base no termo de busca "${searchTerm}", retorne uma lista de até 7 CNAEs relevantes. A resposta DEVE ser um array JSON de objetos, onde cada objeto tem as chaves "code" (o código formatado, ex: "47.11-3-02") e "description" (a descrição da atividade).`;
    
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            code: {
                                type: Type.STRING,
                                description: 'O código CNAE formatado (ex: 47.11-3-02).',
                            },
                            description: {
                                type: Type.STRING,
                                description: 'A descrição oficial da atividade do CNAE.',
                            },
                        },
                        required: ["code", "description"],
                    },
                },
            },
        });

        const jsonText = response.text.trim();
        if (jsonText.startsWith('[') && jsonText.endsWith(']')) {
            return JSON.parse(jsonText) as CnaeSuggestion[];
        } else {
            console.error("Gemini did not return a valid JSON array for CNAE suggestions:", jsonText);
            throw new Error("A resposta da API para sugestões de CNAE não estava no formato esperado.");
        }
    } catch (error) {
        // Use a simpler error handler for this non-critical lookup
        console.error(`Error fetching CNAE suggestions for "${searchTerm}":`, error);
        throw new Error('Não foi possível buscar as sugestões de CNAE no momento.');
    }
};

export const fetchCnaeDescription = async (cnae: string): Promise<SearchResult> => {
    if (!process.env.API_KEY) {
        throw new Error("A API_KEY não está configurada.");
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `Usando a busca do Google, forneça a descrição oficial e completa da atividade para o CNAE ${cnae} conforme a classificação do CONCLA/IBGE. Formate a resposta em Markdown com os seguintes tópicos: **Descrição Completa**, **Atividades Compreendidas** (em lista), e **Atividades Não Compreendidas** (em lista).`;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
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
            return { text, sources, query: cnae };
        } catch (error) {
            if (isRetryableError(error) && attempt < MAX_RETRIES - 1) {
                const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
                console.warn(`Retryable error caught. Retrying in ${delay}ms... (Attempt ${attempt + 1}/${MAX_RETRIES})`);
                await sleep(delay);
                continue;
            }
            throw handleGeminiError(error, `descrição para o CNAE ${cnae}`);
        }
    }
    throw new Error(`Falha ao buscar descrição para o CNAE ${cnae} após múltiplas tentativas.`);
};


export const fetchSimplesNacionalExplanation = async (empresa: SimplesNacionalEmpresa, resumo: SimplesNacionalResumo, pergunta: string): Promise<SearchResult> => {
    if (!process.env.API_KEY) {
        throw new Error("A API_KEY não está configurada.");
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const prompt = `Você é um assistente tributário sênior especializado em Simples Nacional no Brasil.

Dados da empresa para análise:
- Nome: ${empresa.nome}
- CNPJ: ${empresa.cnpj}
- CNAE: ${empresa.cnae}
- Anexo base: ${empresa.anexo}
- Anexo efetivo aplicado (calculado): ${resumo.anexo_efetivo}
- Fator R (calculado): ${(resumo.fator_r * 100).toFixed(1)}%
- RBT12 (faturamento acumulado 12m): R$ ${resumo.rbt12.toFixed(2)}
- Alíquota efetiva (calculada): ${resumo.aliq_eff.toFixed(2)}%
- DAS estimado (últimos 12 meses): R$ ${resumo.das.toFixed(2)}

Pergunta do contador: ${pergunta}

Sua Tarefa:
Responda à pergunta do contador de forma clara, objetiva e em português. **Use a busca do Google para fundamentar sua resposta com as leis, regras e tabelas mais atuais do Simples Nacional.**

Estrutura da Resposta:
1.  **Resposta Direta:** Comece respondendo diretamente à pergunta do usuário.
2.  **Análise Detalhada:** Elabore a resposta, explicando o raciocínio. Destaque os seguintes pontos, quando relevantes:
    *   Como o valor do DAS foi formado (de forma conceitual).
    *   Se há risco de mudança de faixa/alíquota com base no faturamento e Fator R atuais.
    *   Quais cuidados práticos o contador e o empresário devem ter nos próximos meses.
3.  **Fundamentação Legal (Baseada na Busca):** Cite as informações encontradas na busca que suportam sua análise.

**Importante:** Foque em orientação prática e não cite apenas números de artigos de lei sem explicar o conceito por trás deles.`;
    
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    tools: [{ googleSearch: {} }],
                }
            });
            const text = response.text;
            const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
            const sources: GroundingSource[] = groundingChunks?.filter((chunk: any) => chunk.web) || [];

            return { text, sources, query: pergunta };
        } catch (error) {
            if (isRetryableError(error) && attempt < MAX_RETRIES - 1) {
                const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
                console.warn(`Retryable error caught. Retrying in ${delay}ms... (Attempt ${attempt + 1}/${MAX_RETRIES})`);
                await sleep(delay);
                continue;
            }
            throw handleGeminiError(error, "explicação sobre Simples Nacional");
        }
    }
    throw new Error('Falha ao buscar explicação sobre Simples Nacional após múltiplas tentativas.');
};
