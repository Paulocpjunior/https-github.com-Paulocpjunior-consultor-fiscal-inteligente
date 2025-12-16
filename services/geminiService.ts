
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
    aliquotaIss?: string,
    userNotes?: string
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

  // Add user notes
  if (userNotes) contextParts.push(`Notas/Observações do Usuário: ${userNotes}`);

  const contextInfo = contextParts.length > 0 ? `\nCONSIDERE OS SEGUINTES DADOS ESPECÍFICOS PARA O CÁLCULO/ANÁLISE: ${contextParts.join('; ')}.` : '';

  const prompt = `Analise "${query}" no contexto de ${type}.${contextInfo}
  1. Forneça detalhes tributários completos, base legal e se há retenções obrigatórias considerando os dados informados.
  2. AO FINAL DA RESPOSTA, inclua um bloco JSON ESTRITAMENTE com a estimativa de carga tributária média aproximada (IBPT/De Olho no Imposto) para este item no seguinte formato:
  
  \`\`\`json
  {
    "ibpt": {
      "nacional": 0.00,
      "importado": 0.00,
      "estadual": 0.00,
      "municipal": 0.00
    }
  }
  \`\`\`
  
  Substitua 0.00 pelas alíquotas estimadas percentuais (ex: 13.45). Se for serviço, estadual é 0 e municipal > 0. Se for mercadoria, municipal é 0.`;
  
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

    let text = response.text || 'Não foi possível gerar a análise.';
    let ibptData = undefined;

    // Extract JSON block for IBPT if exists
    const jsonMatch = text.match(/```json\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch && jsonMatch[1]) {
        try {
            const parsed = JSON.parse(jsonMatch[1]);
            if (parsed.ibpt) {
                ibptData = parsed.ibpt;
                // Optional: Clean the JSON block from the text to avoid duplication in UI
                text = text.replace(jsonMatch[0], '').trim();
            }
        } catch (e) {
            console.warn("Failed to parse IBPT JSON", e);
        }
    }

    let sources: GroundingSource[] = [];
    if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
        sources = response.candidates[0].groundingMetadata.groundingChunks
            .filter((c: any) => c.web)
            .map((c: any) => ({ web: { uri: c.web.uri, title: c.web.title } }));
    }

    return {
      text: text,
      sources,
      query,
      timestamp: Date.now(),
      context: { aliquotaIcms, aliquotaPisCofins, aliquotaIss, userNotes },
      ibpt: ibptData
    };
  } catch (error: any) {
    console.error("Gemini API Error:", error);
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
    const prompt = `Analise este documento (PDF, Excel, Imagem ou XML) para extrair dados financeiros de notas fiscais ou faturamento.
    
    **Objetivo:** Extrair uma lista de transações/notas.
    
    **Instruções Avançadas:**
    1. **Tabelas Complexas:** Se houver tabelas com linhas quebradas, mescladas ou cabeçalhos repetidos (quebra de página), tente reconstruir a linha lógica da transação.
    2. **Correção OCR:** Se o documento for escaneado, corrija erros comuns (ex: 'S' em vez de '5', 'O' em vez de '0', ',' mal posicionadas).
    3. **Excel/XML:** Se for uma planilha ou XML, identifique as colunas/tags relevantes (Data Emissão, Valor Total, Descrição, Tomador/Emitente).
    4. **Campos Obrigatórios:** Para cada item, tente extrair:
       - "data": Data da emissão (formato YYYY-MM-DD).
       - "valor": Valor monetário numérico (float). Priorize "Base de Cálculo" ou "Valor Total da Nota".
       - "descricao": Descrição do serviço ou produto.
       - "origem": Nome do Prestador/Emitente ou Tomador (dependendo do contexto, quem gerou a receita).
    
    **Retorno:** Apenas um JSON Array puro.
    Exemplo: [{ "data": "2023-10-25", "valor": 1500.50, "descricao": "Consultoria TI", "origem": "Cliente X" }]`;
    
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
    const prompt = `Analise este PDF, que deve ser um **Extrato PGDAS-D** ou **Declaração do Simples Nacional**.
    
    **Missão:** Extrair o histórico de receita bruta dos últimos 12 meses (RBT12).
    
    **Instruções Específicas:**
    1. Localize a tabela ou seção geralmente intitulada "2.2 - Receitas Brutas Anteriores" ou "Receita Bruta Acumulada nos 12 Meses Anteriores ao do Período de Apuração (RBT12)".
    2. Esta tabela geralmente contém colunas como "Período de Apuração (PA)" e "Receita Bruta Total (RBT)".
    3. Ignore linhas de totalização ou cabeçalhos repetidos por quebra de página.
    4. Ignore valores zerados se houver duplicatas, mas mantenha meses com faturamento zero se listados explicitamente.
    5. Se o documento for um Recibo de Entrega ou Declaração, procure pelo campo "Receita Bruta Acumulada" ou similar que liste mês a mês.
    
    **Retorno:** Estritamente um JSON Array.
    Formato: [{ "periodo": "MM/AAAA", "valor": number }]
    Exemplo: [{ "periodo": "01/2024", "valor": 15000.00 }, { "periodo": "02/2024", "valor": 20000.50 }]
    
    Se não encontrar dados compatíveis com um extrato do Simples Nacional, retorne [].`;

    try {
        const response = await ai.models.generateContent({ model: MODEL_NAME, contents: [{ inlineData: { mimeType: "application/pdf", data: base64Pdf } }, { text: prompt }] });
        return JSON.parse(cleanJsonString(response.text || '[]'));
    } catch (e) { return []; }
};
