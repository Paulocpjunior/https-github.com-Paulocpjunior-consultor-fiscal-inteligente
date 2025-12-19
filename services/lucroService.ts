
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

// Limites Adicional IRPJ
const LIMITE_ADICIONAL_MENSAL = 20000;
const LIMITE_ADICIONAL_TRIMESTRAL = 60000;

// Presunção Lucro Presumido
const PRESUNCAO_IRPJ_COMERCIO = 0.08; 
const PRESUNCAO_IRPJ_SERVICO = 0.32; 
const PRESUNCAO_CSLL_COMERCIO = 0.12; 
const PRESUNCAO_CSLL_SERVICO = 0.32; 

// Presunção Equiparação Hospitalar
const PRESUNCAO_IRPJ_HOSPITALAR = 0.08; 
const PRESUNCAO_CSLL_HOSPITALAR = 0.12; 

const fmt = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

// Lógica de Cotas atualizada para os limites solicitados
export const calcularCotasDisponiveis = (valorImposto: number, periodo: 'Mensal' | 'Trimestral'): PlanoCotas | undefined => {
    const limite = periodo === 'Trimestral' ? 30000 : 10000;
    
    if (valorImposto >= limite) {
        const valorCota = valorImposto / 3;
        // Pela lei, a cota não pode ser inferior a R$ 1.000,00
        const numCotasPossiveis = valorCota < 1000 ? Math.floor(valorImposto / 1000) : 3;
        
        if (numCotasPossiveis < 1) return undefined;

        return {
            disponivel: true,
            numeroCotas: numCotasPossiveis,
            valorPrimeiraCota: valorImposto / numCotasPossiveis,
            valorDemaisCotas: valorImposto / numCotasPossiveis,
            vencimentos: Array.from({ length: numCotasPossiveis }, (_, i) => `Cota ${i + 1}`)
        };
    }
    return undefined;
};

export const calcularLucro = (input: LucroInput): LucroResult => {
    let result: LucroResult;
    if (input.regimeSelecionado === 'Real') {
        result = calcularLucroReal(input);
    } else {
        result = calcularLucroPresumido(input);
    }

    // Aplica lógica de cotas nos impostos federais de renda
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
    const receitaTotal = input.faturamentoComercio + input.faturamentoServico;
    const detalhamento: DetalheImposto[] = [];
    
    // ISS
    const issItem = calcularISS(input);
    if (issItem) detalhamento.push(issItem);

    const retencaoPis = input.retencaoPis || 0;
    const retencaoCofins = input.retencaoCofins || 0;
    const retencaoIrpj = input.retencaoIrpj || 0;
    const retencaoCsll = input.retencaoCsll || 0;

    const presuncaoIrpjServico = input.isEquiparacaoHospitalar ? PRESUNCAO_IRPJ_HOSPITALAR : PRESUNCAO_IRPJ_SERVICO;
    const presuncaoCsllServico = input.isEquiparacaoHospitalar ? PRESUNCAO_CSLL_HOSPITALAR : PRESUNCAO_CSLL_SERVICO;

    // PIS/COFINS
    const basePisCofins = Math.max(0, receitaTotal - (input.faturamentoMonofasico || 0));
    if (basePisCofins > 0 || retencaoPis > 0 || retencaoCofins > 0) {
        detalhamento.push({
            imposto: 'PIS (Cumulativo)',
            baseCalculo: basePisCofins,
            aliquota: ALIQ_PIS_CUMULATIVO * 100,
            valor: Math.max(0, (basePisCofins * ALIQ_PIS_CUMULATIVO) - retencaoPis),
            observacao: retencaoPis > 0 ? `Retenção de ${fmt(retencaoPis)} deduzida` : undefined
        });
        detalhamento.push({
            imposto: 'COFINS (Cumulativo)',
            baseCalculo: basePisCofins,
            aliquota: ALIQ_COFINS_CUMULATIVO * 100,
            valor: Math.max(0, (basePisCofins * ALIQ_COFINS_CUMULATIVO) - retencaoCofins),
            observacao: retencaoCofins > 0 ? `Retenção de ${fmt(retencaoCofins)} deduzida` : undefined
        });
    }

    processarItensEspeciais(input.itensAvulsos, detalhamento);

    // IRPJ
    const baseIrpj = (input.faturamentoComercio * PRESUNCAO_IRPJ_COMERCIO) + (input.faturamentoServico * presuncaoIrpjServico);
    let valorIrpj = baseIrpj * ALIQ_IRPJ;
    const limiteAdicional = input.periodoApuracao === 'Trimestral' ? LIMITE_ADICIONAL_TRIMESTRAL : LIMITE_ADICIONAL_MENSAL;
    if (baseIrpj > limiteAdicional) valorIrpj += (baseIrpj - limiteAdicional) * ADICIONAL_IRPJ;

    detalhamento.push({
        imposto: 'IRPJ (Presumido)',
        baseCalculo: baseIrpj,
        aliquota: ALIQ_IRPJ * 100,
        valor: Math.max(0, valorIrpj - retencaoIrpj),
        observacao: `Base Serviço: ${(presuncaoIrpjServico * 100)}%`
    });

    // CSLL
    const baseCsll = (input.faturamentoComercio * PRESUNCAO_CSLL_COMERCIO) + (input.faturamentoServico * presuncaoCsllServico);
    detalhamento.push({
        imposto: 'CSLL (Presumido)',
        baseCalculo: baseCsll,
        aliquota: ALIQ_CSLL * 100,
        valor: Math.max(0, (baseCsll * ALIQ_CSLL) - retencaoCsll)
    });

    const totalImpostos = detalhamento.reduce((acc, item) => acc + item.valor, 0);
    const extraReceitas = (input.itensAvulsos || []).filter(i => i.tipo === 'receita').reduce((acc, i) => acc + i.valor, 0);
    const extraDespesas = (input.itensAvulsos || []).filter(i => i.tipo === 'despesa').reduce((acc, i) => acc + i.valor, 0);
    const lucroLiquido = (receitaTotal + extraReceitas) - input.custoMercadoriaVendida - input.despesasOperacionais - input.folhaPagamento - extraDespesas - totalImpostos;

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

    const extraDespesasDedutiveis = (input.itensAvulsos || [])
        .filter(i => i.tipo === 'despesa' && i.dedutivelIrpj)
        .reduce((acc, i) => acc + i.valor, 0);

    const extraBaseCredito = (input.itensAvulsos || [])
        .filter(i => i.tipo === 'despesa' && i.geraCreditoPisCofins)
        .reduce((acc, i) => acc + i.valor, 0);

    const totalReceitas = receitaTotal + (input.itensAvulsos || []).filter(i => i.tipo === 'receita').reduce((acc, i) => acc + i.valor, 0);

    // PIS/COFINS (Não Cumulativo)
    const basePisCofins = Math.max(0, receitaTotal - (input.faturamentoMonofasico || 0));
    const baseCredito = input.despesasDedutiveis + extraBaseCredito; 
    
    detalhamento.push({
        imposto: 'PIS (Não Cumulativo)',
        baseCalculo: basePisCofins,
        aliquota: ALIQ_PIS_NAO_CUMULATIVO * 100,
        valor: Math.max(0, (basePisCofins * ALIQ_PIS_NAO_CUMULATIVO) - (baseCredito * ALIQ_PIS_NAO_CUMULATIVO) - (input.retencaoPis || 0))
    });

    detalhamento.push({
        imposto: 'COFINS (Não Cumulativo)',
        baseCalculo: basePisCofins,
        aliquota: ALIQ_COFINS_NAO_CUMULATIVO * 100,
        valor: Math.max(0, (basePisCofins * ALIQ_COFINS_NAO_CUMULATIVO) - (baseCredito * ALIQ_COFINS_NAO_CUMULATIVO) - (input.retencaoCofins || 0))
    });

    processarItensEspeciais(input.itensAvulsos, detalhamento);

    // IRPJ / CSLL (Lucro Real)
    const despesasTotaisDedutiveis = input.despesasOperacionais + input.despesasDedutiveis + extraDespesasDedutiveis;
    const lucroContabil = totalReceitas - input.custoMercadoriaVendida - input.folhaPagamento - despesasTotaisDedutiveis;
    
    if (lucroContabil > 0) {
        let valorIrpj = lucroContabil * ALIQ_IRPJ;
        const limiteAdicional = input.periodoApuracao === 'Trimestral' ? LIMITE_ADICIONAL_TRIMESTRAL : LIMITE_ADICIONAL_MENSAL;
        if (lucroContabil > limiteAdicional) valorIrpj += (lucroContabil - limiteAdicional) * ADICIONAL_IRPJ;
        
        detalhamento.push({
            imposto: 'IRPJ (Lucro Real)',
            baseCalculo: lucroContabil,
            aliquota: ALIQ_IRPJ * 100,
            valor: Math.max(0, valorIrpj - (input.retencaoIrpj || 0))
        });

        detalhamento.push({
            imposto: 'CSLL (Lucro Real)',
            baseCalculo: lucroContabil,
            aliquota: ALIQ_CSLL * 100,
            valor: Math.max(0, (lucroContabil * ALIQ_CSLL) - (input.retencaoCsll || 0))
        });
    } else {
        detalhamento.push({
            imposto: 'IRPJ/CSLL',
            baseCalculo: lucroContabil,
            aliquota: 0,
            valor: 0,
            observacao: 'Prejuízo Fiscal'
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

const calcularISS = (input: LucroInput): DetalheImposto | null => {
    if (input.faturamentoServico <= 0 && input.issConfig.tipo !== 'sup_fixo') return null;

    if (input.issConfig.tipo === 'sup_fixo') {
        const total = (input.issConfig.qtdeSocios || 1) * (input.issConfig.valorPorSocio || 0);
        return {
            imposto: 'ISS-SUP (Fixo)',
            baseCalculo: input.issConfig.qtdeSocios || 1, 
            aliquota: 0, 
            valor: total,
            observacao: `${input.issConfig.qtdeSocios} sócios`
        };
    } else {
        const aliq = input.issConfig.aliquota || 5; 
        return {
            imposto: `ISS (${aliq}%)`,
            baseCalculo: input.faturamentoServico,
            aliquota: aliq,
            valor: input.faturamentoServico * (aliq / 100)
        };
    }
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
