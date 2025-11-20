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

export interface HistoryItem {
    id: string;
    timestamp: number;
    queries: string[];
    type: SearchType;
    mode: 'single' | 'compare';
    municipio?: string;
    alias?: string;
    responsavel?: string;
    cnae?: string;
    regimeTributario?: string;
    reformaQuery?: string;
    aliquotaIcms?: string;
    aliquotaPisCofins?: string;
    aliquotaIss?: string;
}

export interface NewsAlert {
    title: string;
    summary: string;
    source: string;
}

export interface SimilarService {
    code: string;
    description: string;
}

export interface CnaeSuggestion {
    code: string;
    description: string;
}

export interface CnpjData {
    razaoSocial: string;
    nomeFantasia: string;
}

export type SimplesNacionalAnexo = 'I' | 'II' | 'III' | 'IV' | 'V' | 'III_V';

export interface SimplesHistoricoCalculo {
    id: string;
    dataCalculo: number;
    mesReferencia: string;
    rbt12: number;
    aliq_eff: number;
    fator_r: number;
    das_mensal: number;
    anexo_efetivo: string;
}

export interface SimplesNacionalEmpresa {
    id: string;
    nome: string;
    cnpj: string;
    cnae: string;
    anexo: SimplesNacionalAnexo;
    folha12: number;
    faturamentoManual?: { [key: string]: number };
    historicoCalculos?: SimplesHistoricoCalculo[];
}

export interface SimplesNacionalNota {
    id: string;
    empresaId: string;
    data: number;
    valor: number;
    origem: string;
    descricao: string;
}

export interface SimplesCalculoMensal {
    competencia: string; // YYYY-MM
    label: string; // Mes/Ano
    faturamento: number;
    rbt12: number;
    aliquotaEfetiva: number;
    fatorR: number;
    dasCalculado: number;
    anexoAplicado: string;
}

export interface SimplesNacionalResumo {
    rbt12: number;
    aliq_nom: number;
    aliq_eff: number;
    das: number;
    das_mensal: number;
    mensal: { [key: string]: number };
    historico_simulado: SimplesCalculoMensal[];
    anexo_efetivo: SimplesNacionalAnexo;
    fator_r: number;
    folha_12: number;
    ultrapassou_sublimite: boolean;
}

export interface CnaeTaxDetail {
    tributo: string;
    incidencia: string;
    aliquotaMedia: string;
    baseLegal: string;
    observacao: string;
}

export interface SimplesNacionalImportResult {
    successCount: number;
    failCount: number;
    errors: string[];
}
