import { GoogleGenAI } from "@google/genai";
import { SearchType, type SearchResult, type GroundingSource, type ComparisonResult, type NewsAlert, type SimilarService, type CnaeSuggestion, type SimplesNacionalEmpresa, type SimplesNacionalResumo, CnaeTaxDetail } from '../types';

const MODEL_NAME = 'gemini-3-pro-preview';

const cleanJsonString = (str: string) => {
    return str.replace(/```json/g, '').replace(/```/g, '').trim();
};

export const fetchFiscalData = async (
    type: SearchType, 
    query: string, 
    municipio?: string, 
    alias?: string, 
    responsavel?: string, 
    cnae?: string,
    regimeTributario?: string,
    reformaQuery?: string,
    aliquotaIcms?: string,
    aliquotaPisCofins?: string,
    aliquotaIss?: string
): Promise<SearchResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Build context string from optional inputs
  let contextParts = [];
  if (municipio) contextParts.push(`Município Prestador: ${municipio}`);
  if (alias) contextParts.push(`Tomador/Cliente: ${alias}`);
  if (regimeTributario) contextParts.push(`Regime Tributário: ${regimeTributario}`);
  
  // Add specific tax rates if provided
  if (aliquotaIcms) contextParts.push(`Alíquota ICMS informada pelo usuário: ${aliquotaIcms}%`);
  if (aliquotaPisCofins) contextParts.push(`Alíquota PIS/COFINS informada pelo usuário: ${aliquotaPisCofins}%`);
  if (aliquotaIss) contextParts.push(`Alíquota ISS informada pelo usuário: ${aliquotaIss}%`);

  const contextInfo = contextParts.length > 0 ? `\nCONSIDERE OS SEGUINTES DADOS ESPECÍFICOS PARA O CÁLCULO/ANÁLISE: ${contextParts.join('; ')}.` : '';

  const prompt = `Analise "${query}" no contexto de ${type}.${contextInfo}\nForneça detalhes tributários completos, base legal e se há retenções obrigatórias considerando os dados informados.`;
  
  let tools: any[] = [];
  if ([SearchType.REFORMA_TRIBUTARIA, SearchType.SERVICO, SearchType.CFOP, SearchType.NCM].includes(type)) {
      tools = [{ googleSearch: {} }];
  }

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: { tools, temperature: 0.4 }
    });

    let sources: GroundingSource[] = [];
    if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
        sources = response.candidates[0].groundingMetadata.groundingChunks
            .filter((c: any) => c.web)
            .map((c: any) => ({ web: { uri: c.web.uri, title: c.web.title } }));
    }

    return {
      text: response.text || 'Não foi possível gerar a análise.',
      sources,
      query,
      timestamp: Date.now(),
      context: { aliquotaIcms, aliquotaPisCofins, aliquotaIss }
    };
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    // Propagar o erro original para que o App.tsx possa tratar códigos específicos (ex: 429)
    throw error;
  }
};

export const fetchComparison = async (type: SearchType, query1: string, query2: string): Promise<ComparisonResult> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `Compare ${type}: "${query1}" vs "${query2}".`;
    try {
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] }
        });
        return {
            summary: response.text || 'Comparativo indisponível',
            result1: { text: 'Ver resumo comparativo', sources: [], query: query1 },
            result2: { text: 'Ver resumo comparativo', sources: [], query: query2 }
        };
    } catch (e) {
        throw e;
    }
};

export const fetchSimilarServices = async (query: string): Promise<SimilarService[]> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `Liste 4 códigos da LC 116/03 similares a: "${query}". JSON Array: [{ "code": "X.XX", "description": "..." }]`;
    try {
        const response = await ai.models.generateContent({ model: MODEL_NAME, contents: prompt });
        return JSON.parse(cleanJsonString(response.text || '[]'));
    } catch (e) { return []; }
};

export const fetchCnaeSuggestions = async (query: string): Promise<CnaeSuggestion[]> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `Sugira 5 CNAEs válidos para: "${query}". JSON Array: [{ "code": "XXXX-X/XX", "description": "..." }]`;
    try {
        const response = await ai.models.generateContent({ model: MODEL_NAME, contents: prompt, config: { tools: [{ googleSearch: {} }] } });
        return JSON.parse(cleanJsonString(response.text || '[]'));
    } catch (e) { return []; }
};

export const fetchNewsAlerts = async (): Promise<NewsAlert[]> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `Liste 3 notícias fiscais Brasil recentes (semana/mês). JSON Array: [{ "title": "...", "summary": "...", "source": "..." }]`;
    try {
        const response = await ai.models.generateContent({ model: MODEL_NAME, contents: prompt, config: { tools: [{ googleSearch: {} }] } });
        return JSON.parse(cleanJsonString(response.text || '[]'));
    } catch (e) { return []; }
};

export const fetchSimplesNacionalExplanation = async (empresa: SimplesNacionalEmpresa, resumo: SimplesNacionalResumo, question: string): Promise<SearchResult> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const context = `Empresa: ${empresa.nome}, CNAE: ${empresa.cnae}, Anexo: ${empresa.anexo}, RBT12: ${resumo.rbt12}, Aliq: ${resumo.aliq_eff}%`;
    const prompt = `Contexto: ${context}. Pergunta: "${question}"`;
    try {
        const response = await ai.models.generateContent({ model: MODEL_NAME, contents: prompt });
        return { text: response.text || '', query: question, sources: [] };
    } catch (e: any) { throw e; }
};

export const fetchCnaeDescription = async (cnae: string): Promise<SearchResult> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `Analise detalhadamente o CNAE ${cnae} para o Simples Nacional.
    Estruture a resposta com os seguintes tópicos em Markdown:
    1. **Descrição Oficial**: A descrição completa.
    2. **Anexo Sugerido**: Qual o Anexo do Simples Nacional (I, II, III, IV ou V) mais provável para esta atividade.
    3. **Fator R**: Informe se esta atividade está sujeita ao Fator R (Anexo V podendo ser III ou vice-versa).
    4. **Atividades Compreendidas**: Lista do que este CNAE engloba.
    5. **Atividades NÃO Compreendidas**: Lista do que NÃO engloba.`;
    
    try {
        const response = await ai.models.generateContent({ model: MODEL_NAME, contents: prompt, config: { tools: [{ googleSearch: {} }] } });
        return { text: response.text || '', query: cnae, sources: [] };
    } catch (e: any) { throw e; }
};

export const fetchCnaeTaxDetails = async (cnae: string, manualRates?: { icms: string; pisCofins: string; iss: string }): Promise<CnaeTaxDetail[]> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    let prompt = `Para CNAE ${cnae}, gere tabela JSON impostos (ICMS, ISS, PIS, COFINS) Regime Geral. 
    Retorne: JSON Array: [{ "tributo": "...", "incidencia": "...", "aliquotaMedia": "...", "baseLegal": "..." }]`;

    if (manualRates) {
        prompt += `\nConsidere também estas alíquotas informadas pelo usuário para refinar a resposta: 
        ICMS: ${manualRates.icms || 'Padrão'}, PIS/COFINS: ${manualRates.pisCofins || 'Padrão'}, ISS: ${manualRates.iss || 'Padrão'}.`;
    }

    try {
        const response = await ai.models.generateContent({ model: MODEL_NAME, contents: prompt, config: { tools: [{ googleSearch: {} }] } });
        return JSON.parse(cleanJsonString(response.text || '[]'));
    } catch (e) { return []; }
};

export const extractDocumentData = async (base64Data: string, mimeType: string = 'application/pdf'): Promise<any[]> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `Extract invoices/transactions from this document (PDF, Excel, or Image).
    Handle complex tables by inferring rows and aligning data even if formatting is messy.
    Look for columns like Date, Value, Description/Product, Origin/Provider.
    Prioritize "Base de Cálculo" as value if available.
    Return JSON Array: [{ "data": "YYYY-MM-DD", "valor": number, "descricao": "...", "origem": "..." }]`;
    
    try {
        const response = await ai.models.generateContent({ 
            model: MODEL_NAME, 
            contents: [
                { inlineData: { mimeType: mimeType, data: base64Data } }, 
                { text: prompt }
            ] 
        });
        return JSON.parse(cleanJsonString(response.text || '[]'));
    } catch (e: any) { throw new Error("Erro na extração IA: " + e.message); }
};

export const extractInvoiceDataFromPdf = async (base64Pdf: string): Promise<any[]> => {
    return extractDocumentData(base64Pdf, 'application/pdf');
}

export const extractPgdasDataFromPdf = async (base64Pdf: string): Promise<any> => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `Analise este PDF do Simples Nacional (PGDAS-D).
    Localize especificamente o campo "2.2 - Receitas Brutas Anteriores" (ou similar "Receita Bruta Acumulada nos 12 Meses Anteriores").
    Extraia a tabela de histórico com os valores mensais dos últimos 12 meses.
    Se a tabela for complexa, tente alinhar o "Período de Apuração" (PA) com a "Receita Bruta Total" (RBT) ou "Valor".
    Retorne estritamente um JSON Array: [{ "periodo": "YYYY-MM", "valor": number }]
    Se não encontrar, retorne []`;
    try {
        const response = await ai.models.generateContent({ model: MODEL_NAME, contents: [{ inlineData: { mimeType: "application/pdf", data: base64Pdf } }, { text: prompt }] });
        return JSON.parse(cleanJsonString(response.text || '[]'));
    } catch (e) { return []; }
};