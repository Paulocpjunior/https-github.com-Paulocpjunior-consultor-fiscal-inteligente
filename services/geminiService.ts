
import { GoogleGenAI } from "@google/genai";
import { SearchType, type SearchResult, type GroundingSource } from '../types';

const getGeminiPrompt = (type: SearchType, query: string): string => {
  const basePrompt = `Você é um especialista em contabilidade fiscal brasileira. Sua tarefa é fornecer uma análise detalhada e atualizada sobre o código fiscal fornecido, utilizando a busca do Google para garantir a precisão das informações.`;
  
  if (type === SearchType.CFOP) {
    return `${basePrompt}

    Analise o CFOP: "${query}".

    Sua resposta DEVE incluir os seguintes tópicos, claramente separados:
    1.  **Código e Descrição:** O número do CFOP e sua descrição oficial completa.
    2.  **Aplicação:** Uma explicação clara de quando este CFOP deve ser utilizado, com exemplos práticos.
    3.  **Incidência de Impostos:** Um resumo sobre a incidência de impostos (ICMS, IPI, PIS/COFINS) para operações com este CFOP.
    
    Formate a resposta de forma clara e legível.`;
  }
  
  return `${basePrompt}

    Analise o NCM: "${query}".

    Sua resposta DEVE incluir os seguintes tópicos, claramente separados:
    1.  **Código e Descrição:** O número do NCM e sua descrição oficial completa.
    2.  **Incidência de Impostos:** Detalhes sobre as alíquotas e regimes de tributação para IPI, PIS/COFINS e ICMS (considerando regras gerais).
    3.  **Exemplos de Produtos:** Uma lista de produtos que se enquadram neste NCM.

    Formate a resposta de forma clara e legível.`;
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

    return { text, sources };
  } catch (error) {
    console.error("Error fetching data from Gemini API:", error);
    if (error instanceof Error) {
        return { text: `Erro ao consultar a API: ${error.message}`, sources: [] };
    }
    return { text: "Ocorreu um erro desconhecido ao consultar a API.", sources: [] };
  }
};
