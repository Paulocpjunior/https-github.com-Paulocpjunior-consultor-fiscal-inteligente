
import { LucroInput, LucroResult, DetalheImposto, PlanoCotas, ItemFinanceiroAvulso } from '../types';

// Alíquotas Base
const ALIQ_PIS_CUMULATIVO = 0.0065; // 0.65%
const ALIQ_COFINS_CUMULATIVO = 0.03; // 3.00%

const ALIQ_PIS_NAO_CUMULATIVO = 0.0165; // 1.65%
const ALIQ_COFINS_NAO_CUMULATIVO = 0.076; // 7.60%

const ALIQ_IRPJ = 0.15; // 15%
const ADICIONAL_IRPJ = 0.10; // 10%
const ALIQ_CSLL = 0.09; // 9%

// Alíquotas Especiais
const ALIQ_PIS_APLICACAO = 0.0065; 
const ALIQ_COFINS_APLICACAO = 0.04; 
const ALIQ_PIS_IMPORTACAO = 0.021; 
const ALIQ_COFINS_IMPORTACAO = 0.0965; 

// Limites Adicional IRPJ (Conforme Legislação)
const LIMITE_ADICIONAL_MENSAL = 20000;
const LIMITE_ADICIONAL_TRIMESTRAL = 60000;

// Presunção Lucro Presumido
const PRESUNCAO_IRPJ_COMERCIO = 0.08; 
const PRESUNCAO_IRPJ_INDUSTRIA = 0.08; 
const PRESUNCAO_IRPJ_SERVICO = 0.32; 

const PRESUNCAO_CSLL_COMERCIO = 0.12; 
const PRESUNCAO_CSLL_INDUSTRIA = 0.12; 
const PRESUNCAO_CSLL_SERVICO = 0.32; 

// Presunção Equiparação Hospitalar
const PRESUNCAO_IRPJ_HOSPITALAR = 0.08; 
const PRESUNCAO_CSLL_HOSPITALAR = 0.12; 

const fmt = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

/**
 * Calcula se o imposto pode ser parcelado em quotas
 * Regra Solicitada: > 10k (Mensal) ou > 30k (Trimestral)
 * Regra Legal Mínima: Parcela > R$ 1.000,00
 */
export const calcularCotasDisponiveis = (valorImposto: number, periodo: 'Mensal' | 'Trimestral'): PlanoCotas | undefined => {
    const limiteDisponibilidade = periodo === 'Trimestral' ? 30000 : 10000;

    if (valorImposto > limiteDisponibilidade) {
        const numCotas = 3;
        const valorCota = valorImposto / numCotas;

        // Lei exige parcela mínima de 1000 reais
        if (valorCota < 1000) return undefined;

        return {
            disponivel: true,
            numeroCotas: numCotas,
            valorPrimeiraCota: valorCota,
            valorDemaisCotas: valorCota,
            vencimentos: [
                'Quota Única ou 1ª Quota (Sem Juros)',
                '2ª Quota (Juros 1%)',
                '3ª Quota (Juros 1% + SELIC)'
            ]
        };
    }
    return undefined;
};

const calcularISS = (input: LucroInput): DetalheImposto | null => {
    if (input.issConfig.tipo === 'sup_fixo') {
        const qtde = input.issConfig.qtdeSocios || 0;
        const valorPorSocio = input.issConfig.valorPorSocio || 0;
        const valorTotal = qtde * valorPorSocio;
        
        if (valorTotal <= 0) return null;

        return {
            imposto: 'ISS-SUP (Fixo por Sócio)',
            baseCalculo: qtde,
            aliquota: 0,
            valor: valorTotal,
            observacao: `${qtde} sócio(s) x ${fmt(valorPorSocio)}`
        };
    } else {
        const aliquota = input.issConfig.aliquota || 0;
        if (input.faturamentoServico <= 0 || aliquota <= 0) return null;

        return {
            imposto: `ISS (${aliquota}%)`,
            baseCalculo: input.faturamentoServico,
            aliquota: aliquota,
            valor: input.faturamentoServico * (aliquota / 100)
        };
    }
};

export const calcularLucro = (input: LucroInput): LucroResult => {
    let result: LucroResult;
    if (input.regimeSelecionado === 'Real') {
        result = calcularLucroReal(input);
    } else {
        result = calcularLucroPresumido(input);
    }

    // Aplica lógica de cotas nos impostos federais (IRPJ/CSLL)
    result.detalhamento = result.detalhamento.map(det => {
        if (det.imposto.includes('IRPJ') || det.imposto.includes('CSLL')) {
            return {
                ...det,
                cotaInfo: calcularCotasDisponiveis(det.valor, input.periodoApuracao)
            };
        }
        return det;
    });

    return result;
};

const calcularLucroPresumido = (input: LucroInput): LucroResult => {
    // 1. Definição das Bases de Cálculo
    // PIS/COFINS usam SEMPRE o faturamento do MÊS (input direto)
    const faturamentoBrutoMensal = input.faturamentoComercio + input.faturamentoIndustria + input.faturamentoServico;
    
    // IRPJ/CSLL usam o acumulado se for Trimestral e tiver dados anteriores disponíveis
    let baseComercioIrpj = input.faturamentoComercio;
    let baseIndustriaIrpj = input.faturamentoIndustria;
    let baseServicoIrpj = input.faturamentoServico;
    let baseFinanceiraIrpj = input.receitaFinanceira || 0;
    
    const isTrimestralComAcumulado = input.periodoApuracao === 'Trimestral' && input.acumuladoTrimestre;

    if (isTrimestralComAcumulado && input.acumuladoTrimestre) {
        // Soma o mês atual com o acumulado dos meses anteriores do trimestre
        baseComercioIrpj += input.acumuladoTrimestre.comercio;
        baseIndustriaIrpj += input.acumuladoTrimestre.industria;
        baseServicoIrpj += input.acumuladoTrimestre.servico;
        baseFinanceiraIrpj += input.acumuladoTrimestre.financeira;
    }

    const receitaTotal = faturamentoBrutoMensal + (input.receitaFinanceira || 0);
    const detalhamento: DetalheImposto[] = [];
    
    // Análise da Lei Complementar 224/2025
    // Regra: A partir de 2026, empresas com faturamento > 5.000.000,00 tem majoração de 10% na presunção
    const ano = parseInt(input.mesReferencia?.split('-')[0] || '0');
    // Considera o faturamento acumulado + o faturamento do mês atual para projeção
    const receitaTotalAno = (input.acumuladoAno || 0) + receitaTotal;
    let fatorAumentoPresuncao = 1.0;
    let aplicouLc224 = false;

    if (ano >= 2026 && receitaTotalAno > 5000000) {
        fatorAumentoPresuncao = 1.10; // Aumento de 10% nos percentuais de presunção
        aplicouLc224 = true;
    }

    // ISS (Base Mensal)
    const issItem = calcularISS(input);
    if (issItem) detalhamento.push(issItem);

    const retencaoPis = input.retencaoPis || 0;
    const retencaoCofins = input.retencaoCofins || 0;
    const retencaoIrpj = input.retencaoIrpj || 0;
    const retencaoCsll = input.retencaoCsll || 0;

    const presuncaoIrpjServico = input.isEquiparacaoHospitalar ? PRESUNCAO_IRPJ_HOSPITALAR : PRESUNCAO_IRPJ_SERVICO;
    const presuncaoCsllServico = input.isEquiparacaoHospitalar ? PRESUNCAO_CSLL_HOSPITALAR : PRESUNCAO_CSLL_SERVICO;

    // PIS/COFINS (Sempre Mensal - Cumulativo no Presumido)
    const basePisCofins = Math.max(0, faturamentoBrutoMensal - (input.faturamentoMonofasico || 0));
    if (basePisCofins > 0) {
        detalhamento.push({
            imposto: 'PIS (Cumulativo)',
            baseCalculo: basePisCofins,
            aliquota: ALIQ_PIS_CUMULATIVO * 100,
            valor: Math.max(0, (basePisCofins * ALIQ_PIS_CUMULATIVO) - retencaoPis),
            observacao: `Base Mensal - Alíquota 0,65%`
        });
        detalhamento.push({
            imposto: 'COFINS (Cumulativo)',
            baseCalculo: basePisCofins,
            aliquota: ALIQ_COFINS_CUMULATIVO * 100,
            valor: Math.max(0, (basePisCofins * ALIQ_COFINS_CUMULATIVO) - retencaoCofins),
            observacao: `Base Mensal - Alíquota 3,00%`
        });
    }

    processarItensEspeciais(input.itensAvulsos, detalhamento);

    // IRPJ - Base de Presunção (Pode ser Trimestral Acumulada)
    const basePresumidaComercio = baseComercioIrpj * PRESUNCAO_IRPJ_COMERCIO * fatorAumentoPresuncao;
    const basePresumidaIndustria = baseIndustriaIrpj * PRESUNCAO_IRPJ_INDUSTRIA * fatorAumentoPresuncao;
    const basePresumidaServico = baseServicoIrpj * presuncaoIrpjServico * fatorAumentoPresuncao;
    
    // RECEITA FINANCEIRA ENTRA 100% NA BASE (SEM PRESUNÇÃO)
    const baseIrpjTotal = basePresumidaComercio + basePresumidaIndustria + basePresumidaServico + baseFinanceiraIrpj;

    if (baseIrpjTotal > 0) {
        let valorIrpj = baseIrpjTotal * ALIQ_IRPJ;
        const limiteAdicional = input.periodoApuracao === 'Trimestral' ? LIMITE_ADICIONAL_TRIMESTRAL : LIMITE_ADICIONAL_MENSAL;
        
        if (baseIrpjTotal > limiteAdicional) {
            valorIrpj += (baseIrpjTotal - limiteAdicional) * ADICIONAL_IRPJ;
        }

        let obsIrpj = isTrimestralComAcumulado 
            ? `Fechamento Trimestral (Soma ${input.acumuladoTrimestre?.mesesConsiderados.length ? 'Mês Atual + Anteriores' : 'Mês Atual'}).`
            : `Base Presumida do Período.`;

        if (aplicouLc224) obsIrpj += ` LC 224/25: Base majorada 10%.`;
        obsIrpj += ` Isenção Adicional: ${fmt(limiteAdicional)}`;

        detalhamento.push({
            imposto: `IRPJ (${input.periodoApuracao})`,
            baseCalculo: baseIrpjTotal,
            aliquota: ALIQ_IRPJ * 100,
            valor: Math.max(0, valorIrpj - retencaoIrpj),
            observacao: obsIrpj
        });
    }

    // CSLL - Base de Presunção (Pode ser Trimestral Acumulada)
    const basePresumidaCsllComercio = baseComercioIrpj * PRESUNCAO_CSLL_COMERCIO * fatorAumentoPresuncao;
    const basePresumidaCsllIndustria = baseIndustriaIrpj * PRESUNCAO_CSLL_INDUSTRIA * fatorAumentoPresuncao;
    const basePresumidaCsllServico = baseServicoIrpj * presuncaoCsllServico * fatorAumentoPresuncao;
    
    const baseCsllTotal = basePresumidaCsllComercio + basePresumidaCsllIndustria + basePresumidaCsllServico + baseFinanceiraIrpj;

    if (baseCsllTotal > 0) {
        let obsCsll = isTrimestralComAcumulado 
            ? `Fechamento Trimestral. Base Acumulada.` 
            : `Base Presumida do Período.`;
            
        if (aplicouLc224) obsCsll += ` LC 224/25: Base majorada.`;

        detalhamento.push({
            imposto: `CSLL (${input.periodoApuracao})`,
            baseCalculo: baseCsllTotal,
            aliquota: ALIQ_CSLL * 100,
            valor: Math.max(0, (baseCsllTotal * ALIQ_CSLL) - retencaoCsll),
            observacao: obsCsll
        });
    }

    const totalImpostos = detalhamento.reduce((acc, item) => acc + item.valor, 0);
    const extraReceitas = (input.itensAvulsos || []).filter(i => i.tipo === 'receita').reduce((acc, i) => acc + i.valor, 0);
    const extraDespesas = (input.itensAvulsos || []).filter(i => i.tipo === 'despesa').reduce((acc, i) => acc + i.valor, 0);
    
    // Lucro Liquido (apenas informativo, considera o mês atual)
    const lucroLiquido = (receitaTotal + extraReceitas) - input.custoMercadoriaVendida - input.despesasOperacionais - input.folhaPagamento - extraDespesas - totalImpostos;

    return {
        regime: 'Presumido',
        periodo: input.periodoApuracao,
        detalhamento,
        totalImpostos,
        cargaTributaria: receitaTotal > 0 ? (totalImpostos / receitaTotal) * 100 : 0,
        lucroLiquidoEstimado: lucroLiquido,
        alertaLc224: aplicouLc224
    };
};

const calcularLucroReal = (input: LucroInput): LucroResult => {
    const faturamentoBruto = input.faturamentoComercio + input.faturamentoIndustria + input.faturamentoServico;
    const detalhamento: DetalheImposto[] = [];
    
    // ISS
    const issItem = calcularISS(input);
    if (issItem) detalhamento.push(issItem);

    const extraDespesasDedutiveis = (input.itensAvulsos || [])
        .filter(i => i.tipo === 'despesa' && i.dedutivelIrpj)
        .reduce((acc, i) => acc + i.valor, 0);

    const extraBaseCredito = (input.itensAvulsos || [])
        .filter(i => i.tipo === 'despesa' && i.geraCreditoPisCofins)
        .reduce((acc, i) => acc + i.valor, 0);

    const totalReceitas = faturamentoBruto + (input.receitaFinanceira || 0) + (input.itensAvulsos || []).filter(i => i.tipo === 'receita').reduce((acc, i) => acc + i.valor, 0);

    // PIS/COFINS (Não Cumulativo - Mensal)
    const basePisCofins = Math.max(0, faturamentoBruto - (input.faturamentoMonofasico || 0));
    const baseCredito = input.despesasDedutiveis + extraBaseCredito; 
    
    detalhamento.push({
        imposto: 'PIS (Lucro Real)',
        baseCalculo: basePisCofins,
        aliquota: ALIQ_PIS_NAO_CUMULATIVO * 100,
        valor: Math.max(0, (basePisCofins * ALIQ_PIS_NAO_CUMULATIVO) - (baseCredito * ALIQ_PIS_NAO_CUMULATIVO) - (input.retencaoPis || 0)),
        observacao: `Mensal - Crédito sobre despesas dedutíveis`
    });

    detalhamento.push({
        imposto: 'COFINS (Lucro Real)',
        baseCalculo: basePisCofins,
        aliquota: ALIQ_COFINS_NAO_CUMULATIVO * 100,
        valor: Math.max(0, (basePisCofins * ALIQ_COFINS_NAO_CUMULATIVO) - (baseCredito * ALIQ_COFINS_NAO_CUMULATIVO) - (input.retencaoCofins || 0)),
        observacao: `Mensal - Crédito sobre despesas dedutíveis`
    });

    // PIS/COFINS sobre Receita Financeira (Regime Não-Cumulativo)
    // Alíquotas: PIS 0,65% e COFINS 4,00% (Dec. 8.426/2015)
    if (input.receitaFinanceira && input.receitaFinanceira > 0) {
        detalhamento.push({
            imposto: 'PIS (Rec. Financeira)',
            baseCalculo: input.receitaFinanceira,
            aliquota: ALIQ_PIS_APLICACAO * 100, // 0.65%
            valor: input.receitaFinanceira * ALIQ_PIS_APLICACAO
        });
        detalhamento.push({
            imposto: 'COFINS (Rec. Financeira)',
            baseCalculo: input.receitaFinanceira,
            aliquota: ALIQ_COFINS_APLICACAO * 100, // 4.00%
            valor: input.receitaFinanceira * ALIQ_COFINS_APLICACAO
        });
    }

    processarItensEspeciais(input.itensAvulsos, detalhamento);

    // IRPJ / CSLL (Lucro Real - Ajustado por Período)
    // Nota: A lógica de Lucro Real Trimestral também acumula, mas é baseada no Lucro Contábil acumulado.
    // Simplificação atual mantendo a lógica de input, mas idealmente deveria somar os lucros anteriores se for trimestral.
    const despesasTotaisDedutiveis = input.despesasOperacionais + input.despesasDedutiveis + extraDespesasDedutiveis;
    const lucroContabil = totalReceitas - input.custoMercadoriaVendida - input.folhaPagamento - despesasTotaisDedutiveis;
    
    if (lucroContabil > 0) {
        let valorIrpj = lucroContabil * ALIQ_IRPJ;
        const limiteAdicional = input.periodoApuracao === 'Trimestral' ? LIMITE_ADICIONAL_TRIMESTRAL : LIMITE_ADICIONAL_MENSAL;
        if (lucroContabil > limiteAdicional) valorIrpj += (lucroContabil - limiteAdicional) * ADICIONAL_IRPJ;
        
        detalhamento.push({
            imposto: `IRPJ (Lucro Real ${input.periodoApuracao})`,
            baseCalculo: lucroContabil,
            aliquota: ALIQ_IRPJ * 100,
            valor: Math.max(0, valorIrpj - (input.retencaoIrpj || 0)),
            observacao: `Lucro Tributável Real. Isenção Adicional: ${fmt(limiteAdicional)}`
        });

        detalhamento.push({
            imposto: `CSLL (Lucro Real ${input.periodoApuracao})`,
            baseCalculo: lucroContabil,
            aliquota: ALIQ_CSLL * 100,
            valor: Math.max(0, (lucroContabil * ALIQ_CSLL) - (input.retencaoCsll || 0))
        });
    } else {
        detalhamento.push({
            imposto: 'IRPJ/CSLL (Lucro Real)',
            baseCalculo: lucroContabil,
            aliquota: 0,
            valor: 0,
            observacao: 'Prejuízo Fiscal no Período'
        });
    }

    const totalImpostos = detalhamento.reduce((acc, item) => acc + item.valor, 0);
    const extraDespesasNaoDedutiveis = (input.itensAvulsos || []).filter(i => i.tipo === 'despesa' && !i.dedutivelIrpj).reduce((acc, i) => acc + i.valor, 0);
    const lucroFinal = totalReceitas - input.custoMercadoriaVendida - input.folhaPagamento - despesasTotaisDedutiveis - extraDespesasNaoDedutiveis - totalImpostos;

    return {
        regime: 'Real',
        periodo: input.periodoApuracao,
        detalhamento,
        totalImpostos,
        cargaTributaria: totalReceitas > 0 ? (totalImpostos / totalReceitas) * 100 : 0,
        lucroLiquidoEstimado: lucroFinal
    };
};

const processarItensEspeciais = (itens: ItemFinanceiroAvulso[] | undefined, detalhamento: DetalheImposto[]) => {
    if (!itens) return;
    const baseAplicacao = itens.filter(i => i.tipo === 'receita' && i.categoriaEspecial === 'aplicacao_financeira').reduce((acc, i) => acc + i.valor, 0);
    if (baseAplicacao > 0) {
        detalhamento.push({
            imposto: 'PIS (Aplicações)',
            baseCalculo: baseAplicacao,
            aliquota: ALIQ_PIS_APLICACAO * 100,
            valor: baseAplicacao * ALIQ_PIS_APLICACAO
        });
        detalhamento.push({
            imposto: 'COFINS (Aplicações)',
            baseCalculo: baseAplicacao,
            aliquota: ALIQ_COFINS_APLICACAO * 100,
            valor: baseAplicacao * ALIQ_COFINS_APLICACAO
        });
    }
    const baseImportacao = itens.filter(i => i.tipo === 'despesa' && i.categoriaEspecial === 'importacao').reduce((acc, i) => acc + i.valor, 0);
    if (baseImportacao > 0) {
        detalhamento.push({
            imposto: 'PIS (Importação)',
            baseCalculo: baseImportacao,
            aliquota: ALIQ_PIS_IMPORTACAO * 100,
            valor: baseImportacao * ALIQ_PIS_IMPORTACAO
        });
        detalhamento.push({
            imposto: 'COFINS (Importação)',
            baseCalculo: baseImportacao,
            aliquota: ALIQ_COFINS_IMPORTACAO * 100,
            valor: baseImportacao * ALIQ_COFINS_IMPORTACAO
        });
    }
};
