
import { LucroInput, LucroResult, DetalheImposto, PlanoCotas, ItemFinanceiroAvulso } from '../types';

// Alíquotas Base
const ALIQ_PIS_CUMULATIVO = 0.0065; // 0.65%
const ALIQ_COFINS_CUMULATIVO = 0.03; // 3.00%

const ALIQ_PIS_NAO_CUMULATIVO = 0.0165; // 1.65%
const ALIQ_COFINS_NAO_CUMULATIVO = 0.076; // 7.60%

const ALIQ_IRPJ = 0.15; // 15%
const ADICIONAL_IRPJ = 0.10; // 10%
const ALIQ_CSLL = 0.09; // 9%

// Alíquotas Especiais (Solicitadas pelo usuário)
const ALIQ_PIS_APLICACAO = 0.0065; // 0.65%
const ALIQ_COFINS_APLICACAO = 0.04; // 4.00%
const ALIQ_PIS_IMPORTACAO = 0.021; // 2.10%
const ALIQ_COFINS_IMPORTACAO = 0.0965; // 9.65%

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

// Formatador Helper
const fmt = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

export const calcularLucro = (input: LucroInput): LucroResult => {
    if (input.regimeSelecionado === 'Real') {
        return calcularLucroReal(input);
    }
    return calcularLucroPresumido(input);
};

// Helper para calcular Cotas
const calcularCotas = (valorImposto: number, periodo: 'Mensal' | 'Trimestral'): PlanoCotas | undefined => {
    if (periodo === 'Trimestral' && valorImposto > 100) {
        const valorCota = valorImposto / 3;
        return {
            disponivel: true,
            numeroCotas: 3,
            valorPrimeiraCota: valorCota,
            valorDemaisCotas: valorCota,
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
        
        return {
            imposto: 'ISS-SUP (Fixo)',
            baseCalculo: qtde, 
            aliquota: 0, 
            valor: total,
            observacao: `Sociedade Uniprofissional: ${qtde} sócio(s) x ${fmt(valorPorSocio)}`
        };
    } else {
        const aliquota = input.issConfig.aliquota || 5; 
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
    
    const issItem = calcularISS(input);
    if (issItem) detalhamento.push(issItem);

    if (receitaTotal === 0 && !issItem && (!input.itensAvulsos || input.itensAvulsos.length === 0)) {
        return emptyResult('Presumido', input.periodoApuracao);
    }

    const retencaoPis = input.retencaoPis || 0;
    const retencaoCofins = input.retencaoCofins || 0;
    const retencaoIrpj = input.retencaoIrpj || 0;
    const retencaoCsll = input.retencaoCsll || 0;

    const presuncaoIrpjServico = input.isEquiparacaoHospitalar ? PRESUNCAO_IRPJ_HOSPITALAR : PRESUNCAO_IRPJ_SERVICO;
    const presuncaoCsllServico = input.isEquiparacaoHospitalar ? PRESUNCAO_CSLL_HOSPITALAR : PRESUNCAO_CSLL_SERVICO;

    // 1. PIS/COFINS (Cumulativo)
    const basePisCofins = Math.max(0, receitaTotal - (input.faturamentoMonofasico || 0));
    
    if (basePisCofins > 0 || retencaoPis > 0 || retencaoCofins > 0) {
        // PIS
        const valorPisBruto = basePisCofins * ALIQ_PIS_CUMULATIVO;
        const valorPisLiquido = Math.max(0, valorPisBruto - retencaoPis);
        const saldoCredorPis = Math.max(0, retencaoPis - valorPisBruto);
        
        let obsPis = [];
        if (input.faturamentoMonofasico && input.faturamentoMonofasico > 0) obsPis.push(`Base sem Monofásico`);
        if (retencaoPis > 0) obsPis.push(`Apuração: ${fmt(valorPisBruto)} - Retenção: ${fmt(retencaoPis)}`);
        if (saldoCredorPis > 0) obsPis.push(`Saldo Credor: ${fmt(saldoCredorPis)}`);

        detalhamento.push({
            imposto: 'PIS (Cumulativo)',
            baseCalculo: basePisCofins,
            aliquota: ALIQ_PIS_CUMULATIVO * 100,
            valor: valorPisLiquido,
            observacao: obsPis.length > 0 ? obsPis.join(' | ') : undefined
        });

        // COFINS
        const valorCofinsBruto = basePisCofins * ALIQ_COFINS_CUMULATIVO;
        const valorCofinsLiquido = Math.max(0, valorCofinsBruto - retencaoCofins);
        const saldoCredorCofins = Math.max(0, retencaoCofins - valorCofinsBruto);

        let obsCofins = [];
        if (input.faturamentoMonofasico && input.faturamentoMonofasico > 0) obsCofins.push(`Base sem Monofásico`);
        if (retencaoCofins > 0) obsCofins.push(`Apuração: ${fmt(valorCofinsBruto)} - Retenção: ${fmt(retencaoCofins)}`);
        if (saldoCredorCofins > 0) obsCofins.push(`Saldo Credor: ${fmt(saldoCredorCofins)}`);

        detalhamento.push({
            imposto: 'COFINS (Cumulativo)',
            baseCalculo: basePisCofins,
            aliquota: ALIQ_COFINS_CUMULATIVO * 100,
            valor: valorCofinsLiquido,
            observacao: obsCofins.length > 0 ? obsCofins.join(' | ') : undefined
        });
    }

    // 1.1 Itens Avulsos Especiais (PIS/COFINS diferenciados)
    processarItensEspeciais(input.itensAvulsos, detalhamento);

    // 2. IRPJ (Presumido)
    const baseIrpj = (input.faturamentoComercio * PRESUNCAO_IRPJ_COMERCIO) + (input.faturamentoServico * presuncaoIrpjServico);
    let valorIrpj = baseIrpj * ALIQ_IRPJ;
    const limiteAdicional = input.periodoApuracao === 'Trimestral' ? LIMITE_ADICIONAL_TRIMESTRAL : LIMITE_ADICIONAL_MENSAL;
    if (baseIrpj > limiteAdicional) valorIrpj += (baseIrpj - limiteAdicional) * ADICIONAL_IRPJ;

    const valorIrpjLiquido = Math.max(0, valorIrpj - retencaoIrpj);
    detalhamento.push({
        imposto: 'IRPJ (Presumido)',
        baseCalculo: baseIrpj,
        aliquota: ALIQ_IRPJ * 100,
        valor: valorIrpjLiquido,
        observacao: `Base Serviço: ${(presuncaoIrpjServico * 100)}%` + (retencaoIrpj > 0 ? `. Deduzido ${fmt(retencaoIrpj)} retenção.` : ``),
        cotaInfo: calcularCotas(valorIrpjLiquido, input.periodoApuracao)
    });

    // 3. CSLL (Presumido)
    const baseCsll = (input.faturamentoComercio * PRESUNCAO_CSLL_COMERCIO) + (input.faturamentoServico * presuncaoCsllServico);
    const valorCsllLiquido = Math.max(0, (baseCsll * ALIQ_CSLL) - retencaoCsll);
    detalhamento.push({
        imposto: 'CSLL (Presumido)',
        baseCalculo: baseCsll,
        aliquota: ALIQ_CSLL * 100,
        valor: valorCsllLiquido,
        cotaInfo: calcularCotas(valorCsllLiquido, input.periodoApuracao),
        observacao: `Base Serviço: ${(presuncaoCsllServico * 100)}%`
    });

    // 4. ICMS (Estimativa)
    if (input.faturamentoComercio > 0) {
        detalhamento.push({
            imposto: 'ICMS (Saldo Est.)',
            baseCalculo: input.faturamentoComercio,
            aliquota: 4, 
            valor: input.faturamentoComercio * 0.04,
            observacao: 'Estimativa de saldo a pagar após créditos'
        });
    }

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

    if (receitaTotal === 0 && !issItem && (!input.itensAvulsos || input.itensAvulsos.length === 0)) {
        return emptyResult('Real', input.periodoApuracao);
    }

    const extraDespesasDedutiveis = (input.itensAvulsos || [])
        .filter(i => i.tipo === 'despesa' && i.dedutivelIrpj)
        .reduce((acc, i) => acc + i.valor, 0);

    const extraBaseCredito = (input.itensAvulsos || [])
        .filter(i => i.tipo === 'despesa' && i.geraCreditoPisCofins && i.categoriaEspecial === 'padrao')
        .reduce((acc, i) => acc + i.valor, 0);

    const extraReceitasPadrao = (input.itensAvulsos || [])
        .filter(i => i.tipo === 'receita' && i.categoriaEspecial === 'padrao')
        .reduce((acc, i) => acc + i.valor, 0);

    const totalReceitas = receitaTotal + (input.itensAvulsos || []).filter(i => i.tipo === 'receita').reduce((acc, i) => acc + i.valor, 0);

    // 1. PIS/COFINS (Não Cumulativo)
    const basePisCofins = Math.max(0, receitaTotal - (input.faturamentoMonofasico || 0)) + extraReceitasPadrao;
    const baseCredito = input.despesasDedutiveis + extraBaseCredito; 
    
    const retencaoPis = input.retencaoPis || 0;
    const retencaoCofins = input.retencaoCofins || 0;

    const pisFinal = Math.max(0, (basePisCofins * ALIQ_PIS_NAO_CUMULATIVO) - (baseCredito * ALIQ_PIS_NAO_CUMULATIVO) - retencaoPis);
    const cofinsFinal = Math.max(0, (basePisCofins * ALIQ_COFINS_NAO_CUMULATIVO) - (baseCredito * ALIQ_COFINS_NAO_CUMULATIVO) - retencaoCofins);

    if (basePisCofins > 0 || baseCredito > 0 || retencaoPis > 0) {
        detalhamento.push({
            imposto: 'PIS (Não Cumulativo)',
            baseCalculo: basePisCofins,
            aliquota: ALIQ_PIS_NAO_CUMULATIVO * 100,
            valor: pisFinal,
            observacao: `Deduzido Créditos/Retenções`
        });
    }

    if (basePisCofins > 0 || baseCredito > 0 || retencaoCofins > 0) {
        detalhamento.push({
            imposto: 'COFINS (Não Cumulativo)',
            baseCalculo: basePisCofins,
            aliquota: ALIQ_COFINS_NAO_CUMULATIVO * 100,
            valor: cofinsFinal,
            observacao: `Deduzido Créditos/Retenções`
        });
    }

    // 1.1 Itens Avulsos Especiais (Aplicação Financeira e Importações)
    processarItensEspeciais(input.itensAvulsos, detalhamento);

    // 2. IRPJ / CSLL (Lucro Real)
    const despesasTotaisDedutiveis = input.despesasOperacionais + input.despesasDedutiveis + extraDespesasDedutiveis;
    const lucroContabil = totalReceitas - input.custoMercadoriaVendida - input.folhaPagamento - despesasTotaisDedutiveis;
    
    if (lucroContabil > 0) {
        let valorIrpj = lucroContabil * ALIQ_IRPJ;
        const limiteAdicional = input.periodoApuracao === 'Trimestral' ? LIMITE_ADICIONAL_TRIMESTRAL : LIMITE_ADICIONAL_MENSAL;
        if (lucroContabil > limiteAdicional) valorIrpj += (lucroContabil - limiteAdicional) * ADICIONAL_IRPJ;
        
        const retIrpj = input.retencaoIrpj || 0;
        const irpjLiquido = Math.max(0, valorIrpj - retIrpj);
        
        const retCsll = input.retencaoCsll || 0;
        const csllLiquida = Math.max(0, (lucroContabil * ALIQ_CSLL) - retCsll);

        detalhamento.push({
            imposto: 'IRPJ (Lucro Real)',
            baseCalculo: lucroContabil,
            aliquota: ALIQ_IRPJ * 100,
            valor: irpjLiquido,
            observacao: retIrpj > 0 ? `Bruto: ${fmt(valorIrpj)} - Retenção: ${fmt(retIrpj)}` : undefined,
            cotaInfo: calcularCotas(irpjLiquido, input.periodoApuracao)
        });

        detalhamento.push({
            imposto: 'CSLL (Lucro Real)',
            baseCalculo: lucroContabil,
            aliquota: ALIQ_CSLL * 100,
            valor: csllLiquida,
            cotaInfo: calcularCotas(csllLiquida, input.periodoApuracao)
        });
    } else {
        detalhamento.push({
            imposto: 'IRPJ/CSLL',
            baseCalculo: lucroContabil,
            aliquota: 0,
            valor: 0,
            observacao: 'Prejuízo Fiscal Apurado'
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

// Helper para processar itens especiais (Aplicação Financeira e Importação)
const processarItensEspeciais = (itens: ItemFinanceiroAvulso[] | undefined, detalhamento: DetalheImposto[]) => {
    if (!itens) return;

    // Aplicação Financeira (Receita)
    const baseAplicacao = itens.filter(i => i.tipo === 'receita' && i.categoriaEspecial === 'aplicacao_financeira').reduce((acc, i) => acc + i.valor, 0);
    if (baseAplicacao > 0) {
        detalhamento.push({
            imposto: 'PIS (Sobre Aplicação Fin.)',
            baseCalculo: baseAplicacao,
            aliquota: ALIQ_PIS_APLICACAO * 100,
            valor: baseAplicacao * ALIQ_PIS_APLICACAO,
            observacao: 'Alíquota reduzida conforme Dec. 8.426/2015'
        });
        detalhamento.push({
            imposto: 'COFINS (Sobre Aplicação Fin.)',
            baseCalculo: baseAplicacao,
            aliquota: ALIQ_COFINS_APLICACAO * 100,
            valor: baseAplicacao * ALIQ_COFINS_APLICACAO,
            observacao: 'Alíquota reduzida conforme Dec. 8.426/2015'
        });
    }

    // Importações (Despesa que gera débito tributário específico)
    const baseImportacao = itens.filter(i => i.tipo === 'despesa' && i.categoriaEspecial === 'importacao').reduce((acc, i) => acc + i.valor, 0);
    if (baseImportacao > 0) {
        detalhamento.push({
            imposto: 'PIS (Importação)',
            baseCalculo: baseImportacao,
            aliquota: ALIQ_PIS_IMPORTACAO * 100,
            valor: baseImportacao * ALIQ_PIS_IMPORTACAO,
            observacao: 'Incidência sobre Importações'
        });
        detalhamento.push({
            imposto: 'COFINS (Importação)',
            baseCalculo: baseImportacao,
            aliquota: ALIQ_COFINS_IMPORTACAO * 100,
            valor: baseImportacao * ALIQ_COFINS_IMPORTACAO,
            observacao: 'Incidência sobre Importações'
        });
    }
};

const emptyResult = (regime: 'Presumido' | 'Real', periodo: 'Mensal' | 'Trimestral'): LucroResult => ({
    regime,
    periodo,
    detalhamento: [],
    totalImpostos: 0, 
    cargaTributaria: 0, 
    lucroLiquidoEstimado: 0
});
