
import { z } from 'zod';

export enum SearchType {
  CFOP = 'CFOP',
  NCM = 'NCM',
  SERVICO = 'Serviço',
  REFORMA_TRIBUTARIA = 'Reforma Tributária',
  SIMPLES_NACIONAL = 'Simples Nacional',
  LUCRO_PRESUMIDO_REAL = 'Lucro Presumido / Real',
}

export const SearchTypeSchema = z.nativeEnum(SearchType);

export const GroundingSourceSchema = z.object({
  web: z.object({
    uri: z.string(),
    title: z.string(),
  }),
});
export type GroundingSource = z.infer<typeof GroundingSourceSchema>;

export interface IbptRates {
    nacional: number;
    importado: number;
    estadual: number;
    municipal: number;
}

export const SearchResultSchema = z.object({
  text: z.string(),
  sources: z.array(GroundingSourceSchema),
  query: z.string(),
  description: z.string().optional(), // Optional description for favorites
  timestamp: z.number().optional(),
  context: z.object({
      aliquotaIcms: z.string().optional(),
      aliquotaPisCofins: z.string().optional(),
      aliquotaIss: z.string().optional(),
      userNotes: z.string().optional(),
  }).optional(),
  ibpt: z.object({
      nacional: z.number(),
      importado: z.number(),
      estadual: z.number(),
      municipal: z.number(),
  }).optional(),
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
    userNotes?: string;
    entityId?: string;
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
    cnaePrincipal?: { codigo: string; descricao: string };
    cnaesSecundarios?: { codigo: string; descricao: string }[];
    logradouro?: string;
    numero?: string;
    bairro?: string;
    municipio?: string;
    uf?: string;
    cep?: string;
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

export interface SimplesNacionalAtividade {
    cnae: string;
    anexo: SimplesNacionalAnexo;
}

export interface SimplesNacionalEmpresa {
    id: string;
    nome: string;
    cnpj: string;
    cnae: string; // CNAE Principal
    anexo: SimplesNacionalAnexo; // Anexo Principal
    atividadesSecundarias?: SimplesNacionalAtividade[]; // Outros CNAEs
    folha12: number;
    faturamentoManual?: { [key: string]: number }; // Total YYYY-MM -> Valor
    faturamentoMensalDetalhado?: { [mesIso: string]: { [cnae: string]: number } }; // Detalhe YYYY-MM -> { CNAE -> Valor }
    historicoCalculos?: SimplesHistoricoCalculo[];
    createdBy?: string;
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

export interface DetalhamentoAnexo {
    cnae?: string; // NEW field to track origin
    anexo: SimplesNacionalAnexo;
    faturamento: number;
    aliquotaNominal: number; 
    aliquotaEfetiva: number;
    valorDas: number;
    issRetido?: boolean;
    icmsSt?: boolean;
    isMonofasico?: boolean;
}

export interface SimplesItemCalculo {
    cnae: string;
    anexo: SimplesNacionalAnexo;
    valor: number;
    issRetido: boolean;
    icmsSt: boolean;
    isSup?: boolean; // Sociedade Uniprofissional (ISS Fixo)
    isMonofasico?: boolean; // PIS/COFINS Monofásico (Revenda)
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
    faixa_index: number; // Índice da faixa (0-5) para cálculo de repartição
    detalhamento_anexos?: DetalhamentoAnexo[]; // Breakdown per Annex for current month
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

// --- Lucro Presumido / Real Types ---

export interface IssConfig {
    tipo: 'aliquota_municipal' | 'sup_fixo';
    aliquota?: number; // Para alíquota municipal (ex: 2%, 5%)
    valorPorSocio?: number; // Para SUP
    qtdeSocios?: number; // Para SUP
}

export type CategoriaItemEspecial = 'padrao' | 'aplicacao_financeira' | 'importacao';

export interface ItemFinanceiroAvulso {
    id: string;
    descricao: string;
    valor: number;
    tipo: 'receita' | 'despesa';
    dedutivelIrpj?: boolean; // Se true, abate da base de IRPJ/CSLL (Lucro Real)
    geraCreditoPisCofins?: boolean; // Se true, soma à base de crédito de PIS/COFINS (Lucro Real)
    categoriaEspecial?: CategoriaItemEspecial; // Novo campo para PIS/COFINS específicos
}

export interface LucroInput {
    regimeSelecionado: 'Presumido' | 'Real';
    periodoApuracao: 'Mensal' | 'Trimestral';
    faturamentoComercio: number;
    faturamentoServico: number;
    faturamentoMonofasico: number; 
    despesasOperacionais: number;
    despesasDedutiveis: number; 
    folhaPagamento: number;
    custoMercadoriaVendida: number; 
    issConfig: IssConfig;
    // Campos de Retenção (Dedução do valor final)
    retencaoPis?: number;
    retencaoCofins?: number;
    retencaoIrpj?: number;
    retencaoCsll?: number;
    // Feature: Equiparação Hospitalar
    isEquiparacaoHospitalar?: boolean;
    // Feature: Campos Dinâmicos
    itensAvulsos?: ItemFinanceiroAvulso[];
}

export interface PlanoCotas {
    disponivel: boolean;
    numeroCotas: number;
    valorPrimeiraCota: number;
    valorDemaisCotas?: number;
    vencimentos?: string[];
}

export interface DetalheImposto {
    imposto: string;
    baseCalculo: number;
    aliquota: number;
    valor: number;
    observacao?: string; 
    cotaInfo?: PlanoCotas; // Info de pagamento em cotas para IRPJ/CSLL
}

export interface LucroResult {
    regime: 'Presumido' | 'Real';
    periodo: 'Mensal' | 'Trimestral';
    detalhamento: DetalheImposto[];
    totalImpostos: number;
    cargaTributaria: number; 
    lucroLiquidoEstimado: number;
}

export interface FichaFinanceiraRegistro {
    id: string;
    dataRegistro: number;
    mesReferencia: string; // YYYY-MM
    regime: 'Presumido' | 'Real'; 
    periodoApuracao?: 'Mensal' | 'Trimestral';
    issTipo?: 'aliquota_municipal' | 'sup_fixo';
    issValorOuAliquota?: number; // Salva o valor usado (rate ou fixo)
    acumuladoAno: number;
    faturamentoMesComercio: number;
    faturamentoMesServico: number;
    faturamentoMonofasico?: number; 
    faturamentoMesTotal: number;
    totalGeral: number; 
    despesas: number;
    despesasDedutiveis?: number; 
    folha: number;
    cmv: number;
    // Retenções Salvas
    retencaoPis?: number;
    retencaoCofins?: number;
    retencaoPisCofins?: number; // Legacy
    retencaoIrpj?: number;
    retencaoCsll?: number;
    // Configurações Especiais
    isEquiparacaoHospitalar?: boolean;
    // Itens Dinâmicos
    itensAvulsos?: ItemFinanceiroAvulso[];
    // Analise
    totalImpostos?: number;
    cargaTributaria?: number;
}

export interface LucroPresumidoEmpresa {
    id: string;
    nome: string;
    cnpj: string;
    nomeFantasia?: string;
    endereco?: string;
    cnaePrincipal?: { codigo: string; descricao: string };
    cnaesSecundarios?: { codigo: string; descricao: string }[];
    fichaFinanceira?: FichaFinanceiraRegistro[];
    tiposAtividade?: { comercio: boolean; industria: boolean; servico: boolean };
    regimePadrao?: 'Presumido' | 'Real';
    issPadraoConfig?: IssConfig; // Configuração padrão da empresa
    isEquiparacaoHospitalar?: boolean; // Configuração padrão da empresa
    createdBy?: string;
}

// --- Auth Types ---

export type UserRole = 'admin' | 'colaborador';

export interface User {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    isVerified?: boolean; // New field for email verification
    verificationCode?: string; // Temporary code for verification
}

export interface AccessLog {
    id: string;
    userId: string;
    userName: string;
    timestamp: number;
    action: string;
    details?: string;
}
