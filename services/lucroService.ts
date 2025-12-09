
import { LucroInput, LucroResult, DetalheImposto, PlanoCotas } from '../types';

// Alíquotas Base
const ALIQ_PIS_CUMULATIVO = 0.0065; // 0.65%
const ALIQ_COFINS_CUMULATIVO = 0.03; // 3.00%

const ALIQ_PIS_NAO_CUMULATIVO = 0.0165; // 1.65%
const ALIQ_COFINS_NAO_CUMULATIVO = 0.076; // 7.60%

const ALIQ_IRPJ = 0.15; // 15%
const ADICIONAL_IRPJ = 0.10; // 10%
const ALIQ_CSLL = 0.09; // 9%

// Limites Adicional IRPJ
const LIMITE_ADICIONAL_MENSAL = 20000;
const LIMITE_ADICIONAL_TRIMESTRAL = 60000;

// Presunção Lucro Presumido
const PRESUNCAO_IRPJ_COMERCIO = 0.08; // 8%
const PRESUNCAO_IRPJ_SERVICO = 0.32; // 32%
const PRESUNCAO_CSLL_COMERCIO = 0.12; // 12%
const PRESUNCAO_CSLL_SERVICO = 0.32; // 32%

// Presunção Equiparação Hospitalar (Regra de Exceção)
const PRESUNCAO_IRPJ_HOSPITALAR = 0.08; // Reduz de 32% para 8%
const PRESUNCAO_CSLL_HOSPITALAR = 0.12; // Reduz de 32% para 12%

export const calcularLucro = (input: LucroInput): LucroResult => {
    if (input.regimeSelecionado === 'Real') {
        return calcularLucroReal(input);
    }
    return calcularLucroPresumido(input);
};

// Helper para calcular Cotas
const calcularCotas = (valorImposto: number, periodo: 'Mensal' | 'Trimestral'): PlanoCotas | undefined => {
    // Regra geral: IRPJ/CSLL trimestral pode ser em 3 cotas se valor > R$ 2.000,00 (exemplo prático, valor min R$ 10,00)
    // Para simulação, assumimos que trimestral sempre oferece cotas se houver valor relevante.
    if (periodo === 'Trimestral' && valorImposto > 100) {
        const valorCota = valorImposto / 3;
        return {
            disponivel: true,
            numeroCotas: 3,
            valorPrimeiraCota: valorCota, // Sem juros
            valorDemaisCotas: valorCota, // Na prática tem Selic acumulada, mas para simulação exibe o principal
            vencimentos: ['Mês +1', 'Mês +2 (+1% Juros)', 'Mês +3 (+Selic)']
        };
    }
    return {
        disponivel: false,
        numeroCotas: 1,
        valorPrimeiraCota: valorImposto
    };
};

// Helper para calcular ISS
const calcularISS = (input: LucroInput): DetalheImposto | null => {
    if (input.faturamentoServico <= 0 && input.issConfig.tipo !== 'sup_fixo') return null;

    if (input.issConfig.tipo === 'sup_fixo') {
        const qtde = input.issConfig.qtdeSocios || 1;
        const valorPorSocio = input.issConfig.valorPorSocio || 0;
        const total = qtde * valorPorSocio;
        
        // SUP geralmente é mensal ou trimestral fixo, independente do faturamento
        return {
            imposto: 'ISS-SUP (Fixo)',
            baseCalculo: qtde, // Qtde Sócios
            aliquota: 0, // Fixo
            valor: total,
            observacao: `Sociedade Uniprofissional: ${qtde} sócio(s) x ${new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(valorPorSocio)}`
        };
    } else {
        const aliquota = input.issConfig.aliquota || 5; // Default 5%
        const valor = input.faturamentoServico * (aliquota / 100);
        return {
            imposto: `ISS (${aliquota}%)`,
            baseCalculo: input.faturamentoServico,
            aliquota: aliquota,
            valor: valor,
            observacao: 'Alíquota Municipal Variável'
        };
    }
};

const calcularLucroPresumido = (input: LucroInput): LucroResult => {
    const receitaTotal = input.faturamentoComercio + input.faturamentoServico;
    const detalhamento: DetalheImposto[] = [];
    
    // Mesmo sem receita, pode ter ISS Fixo SUP
    const issItem = calcularISS(input);
    if (issItem) detalhamento.push(issItem);

    if (receitaTotal === 0 && !issItem) return emptyResult('Presumido', input.periodoApuracao);

    // Valores de Retenção (se houver)
    const retencaoPisCofinsTotal = input.retencaoPisCofins || 0;
    // Rateio proporcional simples para PIS/COFINS (Baseado na proporção 0.65 vs 3.00)
    // Fator PIS = 0.65 / 3.65 (~17.8%), Fator COFINS = 3.00 / 3.65 (~82.2%)
    const fatorPis = ALIQ_PIS_CUMULATIVO / (ALIQ_PIS_CUMULATIVO + ALIQ_COFINS_CUMULATIVO);
    const retencaoPis = retencaoPisCofinsTotal * fatorPis;
    const retencaoCofins = retencaoPisCofinsTotal * (1 - fatorPis);

    const retencaoIrpj = input.retencaoIrpj || 0;
    const retencaoCsll = input.retencaoCsll || 0;

    // Determina coeficientes de presunção para Serviços com base na Equiparação Hospitalar
    const presuncaoIrpjServico = input.isEquiparacaoHospitalar ? PRESUNCAO_IRPJ_HOSPITALAR : PRESUNCAO_IRPJ_SERVICO;
    const presuncaoCsllServico = input.isEquiparacaoHospitalar ? PRESUNCAO_CSLL_HOSPITALAR : PRESUNCAO_CSLL_SERVICO;

    // 1. PIS/COFINS (Cumulativo)
    const basePisCofins = Math.max(0, receitaTotal - (input.faturamentoMonofasico || 0));
    
    if (basePisCofins > 0) {
        // PIS
        const valorPisBruto = basePisCofins * ALIQ_PIS_CUMULATIVO;
        const valorPisLiquido = Math.max(0, valorPisBruto - retencaoPis);
        
        detalhamento.push({
            imposto: 'PIS (Cumulativo)',
            baseCalculo: basePisCofins,
            aliquota: ALIQ_PIS_CUMULATIVO * 100,
            valor: valorPisLiquido,
            observacao: retencaoPis > 0 
                ? `Deduzido R$ ${retencaoPis.toFixed(2)} retenção${input.faturamentoMonofasico > 0 ? ' + Monofásico' : ''}`
                : (input.faturamentoMonofasico > 0 ? `Deduzido Monofásico` : undefined)
        });

        // COFINS
        const valorCofinsBruto = basePisCofins * ALIQ_COFINS_CUMULATIVO;
        const valorCofinsLiquido = Math.max(0, valorCofinsBruto - retencaoCofins);

        detalhamento.push({
            imposto: 'COFINS (Cumulativo)',
            baseCalculo: basePisCofins,
            aliquota: ALIQ_COFINS_CUMULATIVO * 100,
            valor: valorCofinsLiquido,
            observacao: retencaoCofins > 0 
                ? `Deduzido R$ ${retencaoCofins.toFixed(2)} retenção${input.faturamentoMonofasico > 0 ? ' + Monofásico' : ''}`
                : (input.faturamentoMonofasico > 0 ? `Deduzido Monofásico` : undefined)
        });
    }

    // 2. IRPJ (Presumido)
    // Aplica presunção diferenciada se for equiparação hospitalar
    const baseIrpj = (input.faturamentoComercio * PRESUNCAO_IRPJ_COMERCIO) + (input.faturamentoServico * presuncaoIrpjServico);
    let valorIrpj = baseIrpj * ALIQ_IRPJ;
    
    // Limite Adicional (Mensal vs Trimestral)
    const limiteAdicional = input.periodoApuracao === 'Trimestral' ? LIMITE_ADICIONAL_TRIMESTRAL : LIMITE_ADICIONAL_MENSAL;
    
    if (baseIrpj > limiteAdicional) { 
        valorIrpj += (baseIrpj - limiteAdicional) * ADICIONAL_IRPJ;
    }

    // Deduz Retenção IRPJ
    const valorIrpjLiquido = Math.max(0, valorIrpj - retencaoIrpj);
    const cotasIrpj = calcularCotas(valorIrpjLiquido, input.periodoApuracao);

    detalhamento.push({
        imposto: 'IRPJ (Presumido)',
        baseCalculo: baseIrpj,
        aliquota: ALIQ_IRPJ * 100,
        valor: valorIrpjLiquido,
        observacao: `Base Serviço: ${(presuncaoIrpjServico * 100)}%` + (retencaoIrpj > 0 
            ? `. Deduzido R$ ${new Intl.NumberFormat('pt-BR', {minimumFractionDigits:2}).format(retencaoIrpj)} retenção.` 
            : ``) + (baseIrpj > limiteAdicional ? `. Com Adicional.` : ``),
        cotaInfo: cotasIrpj
    });

    // 3. CSLL (Presumido)
    // Aplica presunção diferenciada se for equiparação hospitalar
    const baseCsll = (input.faturamentoComercio * PRESUNCAO_CSLL_COMERCIO) + (input.faturamentoServico * presuncaoCsllServico);
    const valorCsll = baseCsll * ALIQ_CSLL;
    
    // Deduz Retenção CSLL
    const valorCsllLiquido = Math.max(0, valorCsll - retencaoCsll);
    const cotasCsll = calcularCotas(valorCsllLiquido, input.periodoApuracao);

    detalhamento.push({
        imposto: 'CSLL (Presumido)',
        baseCalculo: baseCsll,
        aliquota: ALIQ_CSLL * 100,
        valor: valorCsllLiquido,
        cotaInfo: cotasCsll,
        observacao: `Base Serviço: ${(presuncaoCsllServico * 100)}%` + (retencaoCsll > 0 ? `. Deduzido R$ ${new Intl.NumberFormat('pt-BR', {minimumFractionDigits:2}).format(retencaoCsll)} retenção.` : ``)
    });

    // 4. ICMS (Estimativa)
    if (input.faturamentoComercio > 0) {
        const valorIcms = input.faturamentoComercio * 0.04; 
        detalhamento.push({
            imposto: 'ICMS (Saldo Est.)',
            baseCalculo: input.faturamentoComercio,
            aliquota: 4, 
            valor: valorIcms,
            observacao: 'Estimativa de saldo a pagar após créditos'
        });
    }

    const totalImpostos = detalhamento.reduce((acc, item) => acc + item.valor, 0);
    const lucroLiquido = receitaTotal - input.custoMercadoriaVendida - input.despesasOperacionais - input.folhaPagamento - totalImpostos;

    return {
        regime: 'Presumido',
        periodo: input.periodoApuracao,
        detalhamento,
        totalImpostos,
        cargaTributaria: receitaTotal > 0 ? (totalImpostos / receitaTotal) * 100 : 0,
        lucroLiquidoEstimado: lucroLiquido
    };
};

const calcularLucroReal = (input: LucroInput): LucroResult => {
    const receitaTotal = input.faturamentoComercio + input.faturamentoServico;
    const detalhamento: DetalheImposto[] = [];

    const issItem = calcularISS(input);
    if (issItem) detalhamento.push(issItem);

    if (receitaTotal === 0 && !issItem) return emptyResult('Real', input.periodoApuracao);

    // 1. PIS/COFINS (Não Cumulativo)
    const basePisCofins = Math.max(0, receitaTotal - (input.faturamentoMonofasico || 0));
    
    // Créditos: Sobre Insumos/Despesas Dedutíveis informadas
    const baseCredito = input.despesasDedutiveis; 
    
    const debitoPis = basePisCofins * ALIQ_PIS_NAO_CUMULATIVO;
    const creditoPis = baseCredito * ALIQ_PIS_NAO_CUMULATIVO;
    const pisFinal = Math.max(0, debitoPis - creditoPis);

    if (pisFinal > 0) {
        detalhamento.push({
            imposto: 'PIS (Não Cumulativo)',
            baseCalculo: basePisCofins,
            aliquota: ALIQ_PIS_NAO_CUMULATIVO * 100,
            valor: pisFinal,
            observacao: `Crédito de R$ ${creditoPis.toFixed(2)} sobre despesas`
        });
    }

    const debitoCofins = basePisCofins * ALIQ_COFINS_NAO_CUMULATIVO;
    const creditoCofins = baseCredito * ALIQ_COFINS_NAO_CUMULATIVO;
    const cofinsFinal = Math.max(0, debitoCofins - creditoCofins);

    if (cofinsFinal > 0) {
        detalhamento.push({
            imposto: 'COFINS (Não Cumulativo)',
            baseCalculo: basePisCofins,
            aliquota: ALIQ_COFINS_NAO_CUMULATIVO * 100,
            valor: cofinsFinal,
            observacao: `Crédito de R$ ${creditoCofins.toFixed(2)} sobre despesas`
        });
    }

    // 2. IRPJ / CSLL (Lucro Real)
    // LAIR Simplificado = Receita - Custos - Despesas Operacionais (Gerais)
    // No Lucro Real, as despesas dedutíveis informadas aqui são usadas para ajuste do lucro tributável
    // Assumimos que 'despesasDedutiveis' e 'despesasOperacionais' compõem o total de deduções do lucro.
    // Lógica Simplificada: Lucro = Receita - CMV - Despesas Totais
    const despesasTotais = input.despesasOperacionais + input.despesasDedutiveis;
    const lucroContabil = receitaTotal - input.custoMercadoriaVendida - input.folhaPagamento - despesasTotais;
    
    let irpj = 0;
    let csll = 0;

    if (lucroContabil > 0) {
        let valorIrpj = lucroContabil * ALIQ_IRPJ;
        
        // Limite Adicional (Mensal vs Trimestral)
        const limiteAdicional = input.periodoApuracao === 'Trimestral' ? LIMITE_ADICIONAL_TRIMESTRAL : LIMITE_ADICIONAL_MENSAL;

        if (lucroContabil > limiteAdicional) {
            valorIrpj += (lucroContabil - limiteAdicional) * ADICIONAL_IRPJ;
        }
        
        // Aplica Retenção se houver (Lucro Real também aproveita retenção)
        irpj = Math.max(0, valorIrpj - (input.retencaoIrpj || 0));
        
        // CSLL
        const valorCsll = lucroContabil * ALIQ_CSLL;
        csll = Math.max(0, valorCsll - (input.retencaoCsll || 0));

        const cotasIrpj = calcularCotas(irpj, input.periodoApuracao);
        const cotasCsll = calcularCotas(csll, input.periodoApuracao);

        detalhamento.push({
            imposto: 'IRPJ (Lucro Real)',
            baseCalculo: lucroContabil,
            aliquota: ALIQ_IRPJ * 100,
            valor: irpj,
            observacao: input.retencaoIrpj ? `Deduzido R$ ${input.retencaoIrpj} retenção` : `Sobre Lucro Líquido`,
            cotaInfo: cotasIrpj
        });

        detalhamento.push({
            imposto: 'CSLL (Lucro Real)',
            baseCalculo: lucroContabil,
            aliquota: ALIQ_CSLL * 100,
            valor: csll,
            observacao: input.retencaoCsll ? `Deduzido R$ ${input.retencaoCsll} retenção` : undefined,
            cotaInfo: cotasCsll
        });
    } else {
        detalhamento.push({
            imposto: 'IRPJ/CSLL',
            baseCalculo: lucroContabil,
            aliquota: 0,
            valor: 0,
            observacao: 'Prejuízo Fiscal Apurado - Sem imposto a pagar'
        });
    }

    // 3. ICMS
    if (input.faturamentoComercio > 0) {
        detalhamento.push({
            imposto: 'ICMS (Saldo Est.)',
            baseCalculo: input.faturamentoComercio,
            aliquota: 4,
            valor: input.faturamentoComercio * 0.04
        });
    }

    const totalImpostos = detalhamento.reduce((acc, item) => acc + item.valor, 0);
    const lucroFinal = lucroContabil - (pisFinal + cofinsFinal + irpj + csll + (issItem?.valor || 0) + (input.faturamentoComercio * 0.04));

    return {
        regime: 'Real',
        periodo: input.periodoApuracao,
        detalhamento,
        totalImpostos,
        cargaTributaria: receitaTotal > 0 ? (totalImpostos / receitaTotal) * 100 : 0,
        lucroLiquidoEstimado: lucroFinal
    };
};

const emptyResult = (regime: 'Presumido' | 'Real', periodo: 'Mensal' | 'Trimestral'): LucroResult => ({
    regime,
    periodo,
    detalhamento: [],
    totalImpostos: 0, 
    cargaTributaria: 0, 
    lucroLiquidoEstimado: 0
});
