import { z } from 'zod';

export enum SearchType {
  CFOP = 'CFOP',
  NCM = 'NCM',
  SERVICO = 'Serviço',
  REFORMA_TRIBUTARIA = 'Reforma Tributária',
  SIMPLES_NACIONAL = 'Simples Nacional',
}

export const SearchTypeSchema = z.nativeEnum(SearchType);

export const GroundingSourceSchema = z.object({
  web: z.object({
    uri: z.string(),
    title: z.string(),
  }),
});
export type GroundingSource = z.infer<typeof GroundingSourceSchema>;

export const SearchResultSchema = z.object({
  text: z.string(),
  sources: z.array(GroundingSourceSchema),
  query: z.string(),
  description: z.string().optional(), // Optional description for favorites
  timestamp: z.number().optional(),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

export const ComparisonResultSchema = z.object({
    summary: z.string(),
    result1: SearchResultSchema,
    result2: SearchResultSchema,
});
export type ComparisonResult = z.infer<typeof ComparisonResultSchema>;

export const FavoriteItemSchema = z.object({
    code: z.string(),
    description: z.string(),
    type: SearchTypeSchema,
});
export type FavoriteItem = z.infer<typeof FavoriteItemSchema>;

export const HistoryItemSchema = z.object({
    id: z.string(), // Unique ID for each history item
    queries: z.array(z.string()),
    type: SearchTypeSchema,
    mode: z.enum(['single', 'compare']),
    timestamp: z.number(),
    // Optional fields for service searches
    municipio: z.string().optional(),
    alias: z.string().optional(),
    responsavel: z.string().optional(),
    regimeTributario: z.string().optional(),
    aliquotaIcms: z.string().optional(),
    aliquotaPisCofins: z.string().optional(),
    aliquotaIss: z.string().optional(),
    // Optional field for Reforma Tributária
    cnae: z.string().optional(),
    reformaQuery: z.string().optional(),
});
export type HistoryItem = z.infer<typeof HistoryItemSchema>;

export const NewsAlertSchema = z.object({
  title: z.string(),
  summary: z.string(),
  source: z.string(),
});
export type NewsAlert = z.infer<typeof NewsAlertSchema>;

export const SimilarServiceSchema = z.object({
    code: z.string(),
    description: z.string(),
});
export type SimilarService = z.infer<typeof SimilarServiceSchema>;

export const CnaeSuggestionSchema = z.object({
  code: z.string(),
  description: z.string(),
});
export type CnaeSuggestion = z.infer<typeof CnaeSuggestionSchema>;

// --- Tipos para o Módulo Simples Nacional ---

export const SimplesNacionalAnexoSchema = z.enum(['I', 'II', 'III', 'IV', 'V', 'III_V']);
export type SimplesNacionalAnexo = z.infer<typeof SimplesNacionalAnexoSchema>;

export const CnpjDataSchema = z.object({
    razaoSocial: z.string(),
    nomeFantasia: z.string(),
});
export type CnpjData = z.infer<typeof CnpjDataSchema>;

export const SimplesHistoricoCalculoSchema = z.object({
    id: z.string(),
    dataCalculo: z.number(), // Timestamp de quando foi salvo
    mesReferencia: z.string(), // "2024-01"
    rbt12: z.number(),
    aliq_eff: z.number(),
    fator_r: z.number(),
    das_mensal: z.number(),
    anexo_efetivo: z.string(),
});
export type SimplesHistoricoCalculo = z.infer<typeof SimplesHistoricoCalculoSchema>;

export const SimplesNacionalEmpresaSchema = z.object({
    id: z.string(),
    nome: z.string(),
    cnpj: z.string(),
    cnae: z.string(),
    anexo: SimplesNacionalAnexoSchema,
    folha12: z.number(),
    faturamentoManual: z.record(z.string(), z.number()).optional(),
    historicoCalculos: z.array(SimplesHistoricoCalculoSchema).optional(),
});
export type SimplesNacionalEmpresa = z.infer<typeof SimplesNacionalEmpresaSchema>;

export const SimplesNacionalNotaSchema = z.object({
    id: z.string(),
    empresaId: z.string(),
    data: z.number(), // Stored as timestamp
    valor: z.number(),
    origem: z.enum(['CSV', 'XML NFe', 'Manual']),
    descricao: z.string().optional(),
});
export type SimplesNacionalNota = z.infer<typeof SimplesNacionalNotaSchema>;

export const SimplesNacionalResumoSchema = z.object({
    rbt12: z.number(),
    aliq_nom: z.number(),
    aliq_eff: z.number(),
    das: z.number(), // DAS Estimado 12 meses (projeção)
    das_mensal: z.number(), // Valor do DAS referente ao mês de apuração
    mensal: z.record(z.string(), z.number()),
    anexo_efetivo: z.enum(['I', 'II', 'III', 'IV', 'V']),
    fator_r: z.number(),
    folha_12: z.number(),
    ultrapassou_sublimite: z.boolean(), // Novo campo para alerta de sub-limite
});
export type SimplesNacionalResumo = z.infer<typeof SimplesNacionalResumoSchema>;