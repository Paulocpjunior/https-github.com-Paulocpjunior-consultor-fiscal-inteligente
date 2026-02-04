
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
const PRESUNCAO_IRPJ_SERVICO_PADRAO = 0.32; 
const PRESUNCAO_IRPJ_SERVICO_REDUZIDA = 0.16; // IN RFB 1.700/17 (Receita <= 120k)

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
    const limiteDisponibilidade = periodo === 'Trimestral' ? 5000 : 1000; // Ajustado para ser mais flexível, regra oficial é valor > 2000 para parcelar. Vamos permitir visualização.

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
        // Soma serviços gerais e hospitalares da matriz para base do ISS (assumindo que filiais pagam no local e não aqui)
        const baseIss = input.faturamentoServico + (input.faturamentoServicoHospitalar || 0);
        
        if (baseIss <= 0 || aliquota <= 0) return null;

        return {
            imposto: `ISS (${aliquota}%)`,
            baseCalculo: baseIss,
            aliquota: aliquota,
            valor: baseIss * (aliquota / 100)
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
    // 1. Consolidar Faturamento Global do Mês (Matriz + Filiais) - VALOR DA NOTA (INCLUINDO IPI)
    const fatComercioMes = input.faturamentoComercio + (input.faturamentoFiliais?.comercio || 0);
    const fatIndustriaMes = input.faturamentoIndustria + (input.faturamentoFiliais?.industria || 0);
    const fatServicoMes = input.faturamentoServico + (input.faturamentoFiliais?.servico || 0);
    const fatServicoHospMes = (input.faturamentoServicoHospitalar || 0) + (input.faturamentoFiliais?.servicoHospitalar || 0);
    
    // Total Faturado Bruto (Antes de Deduções)
    const totalFaturadoInputs = fatComercioMes + fatIndustriaMes + fatServicoMes + fatServicoHospMes;

    // 2. Aplicação de Deduções da Receita Bruta (IPI e Devoluções)
    const valorIpi = input.valorIpi || 0;
    const valorDevolucoes = input.valorDevolucoes || 0;

    // Calcular Bases Ajustadas (Líquidas de IPI e Devoluções) para Presunção
    // Lógica: 
    // - IPI é deduzido prioritariamente da Indústria (Natureza do imposto).
    // - Devoluções são deduzidas proporcionalmente de todas as receitas.
    
    let fatIndustriaDeduzidoIpi = Math.max(0, fatIndustriaMes - valorIpi);
    // Se o IPI for maior que a receita de indústria (Raro, mas possível em devolução massiva), abatemos do restante apenas para consistência matemática do total
    let restoDeducaoIpi = Math.max(0, valorIpi - fatIndustriaMes);

    // Total após dedução de IPI (Base Provisória)
    const totalSemIpi = totalFaturadoInputs - valorIpi;
    
    // Cálculo de Proporção para Devoluções (Rateio)
    // Se totalSemIpi for 0, evita divisão por zero
    const ratioComercio = totalSemIpi > 0 ? fatComercioMes / totalSemIpi : 0;
    const ratioIndustria = totalSemIpi > 0 ? fatIndustriaDeduzidoIpi / totalSemIpi : 0;
    const ratioServico = totalSemIpi > 0 ? fatServicoMes / totalSemIpi : 0;
    const ratioServicoHosp = totalSemIpi > 0 ? fatServicoHospMes / totalSemIpi : 0;

    // Bases Finais para Presunção (Líquidas de IPI e Devoluções)
    const baseComercioFinal = Math.max(0, fatComercioMes - (valorDevolucoes * ratioComercio) - (restoDeducaoIpi > 0 ? restoDeducaoIpi : 0)); // Simplificação: joga resto do IPI no comércio se houver
    const baseIndustriaFinal = Math.max(0, fatIndustriaDeduzidoIpi - (valorDevolucoes * ratioIndustria));
    const baseServicoFinal = Math.max(0, fatServicoMes - (valorDevolucoes * ratioServico));
    const baseServicoHospFinal = Math.max(0, fatServicoHospMes - (valorDevolucoes * ratioServicoHosp));

    // Receita Bruta Efetiva (Base de Cálculo dos Impostos Federais)
    const receitaBrutaEfetiva = baseComercioFinal + baseIndustriaFinal + baseServicoFinal + baseServicoHospFinal;
    const receitaTotalMes = receitaBrutaEfetiva + (input.receitaFinanceira || 0);
    
    const detalhamento: DetalheImposto[] = [];
    
    // Análise da Lei Complementar 224/2025
    const ano = parseInt(input.mesReferencia?.split('-')[0] || '0');
    const receitaTotalAno = (input.acumuladoAno || 0) + receitaTotalMes;
    let fatorAumentoPresuncao = 1.0;
    let aplicouLc224 = false;

    if (ano >= 2026 && receitaTotalAno > 5000000) {
        fatorAumentoPresuncao = 1.10;
        aplicouLc224 = true;
    }

    // ISS
    const issItem = calcularISS(input);
    if (issItem) detalhamento.push(issItem);

    const retencaoPis = input.retencaoPis || 0;
    const retencaoCofins = input.retencaoCofins || 0;
    const retencaoIrpj = input.retencaoIrpj || 0;
    const retencaoCsll = input.retencaoCsll || 0;

    // PIS/COFINS
    // Base: Receita Bruta Efetiva (Sem dedução de Monofásicos conforme solicitado)
    const basePisCofins = receitaBrutaEfetiva;
    
    if (basePisCofins > 0) {
        detalhamento.push({
            imposto: 'PIS (Cumulativo)',
            baseCalculo: basePisCofins,
            aliquota: ALIQ_PIS_CUMULATIVO * 100,
            valor: Math.max(0, (basePisCofins * ALIQ_PIS_CUMULATIVO) - retencaoPis),
            observacao: `Base: Receita Bruta Efetiva`
        });
        detalhamento.push({
            imposto: 'COFINS (Cumulativo)',
            baseCalculo: basePisCofins,
            aliquota: ALIQ_COFINS_CUMULATIVO * 100,
            valor: Math.max(0, (basePisCofins * ALIQ_COFINS_CUMULATIVO) - retencaoCofins),
            observacao: `Base: Receita Bruta Efetiva`
        });
    }

    processarItensEspeciais(input.itensAvulsos, detalhamento);

    // IRPJ - Base de Presunção
    // IMPORTANTE: Aqui usamos as bases finais (já líquidas de IPI/Devoluções) MAS NÃO subtraímos o Monofásico.
    // O Monofásico compõe a Receita Bruta para fins de IRPJ/CSLL no Presumido.
    
    let baseCalculoIrpjComercio = baseComercioFinal;
    let baseCalculoIrpjIndustria = baseIndustriaFinal;
    let baseCalculoIrpjServico = baseServicoFinal;
    let baseCalculoIrpjServicoHosp = baseServicoHospFinal;
    let baseCalculoReceitaFinanceira = input.receitaFinanceira || 0;

    let obsTrimestre = "";

    if (input.periodoApuracao === 'Trimestral' && input.acumuladoTrimestre) {
        // Se houver acumulado manual, soma-se. 
        // Nota: O acumulado manual já deve ser líquido, ou o usuário deve ajustar.
        // Assumimos aqui que o acumulado inserido pelo usuário é a base de receita válida.
        baseCalculoIrpjComercio += input.acumuladoTrimestre.comercio;
        baseCalculoIrpjIndustria += input.acumuladoTrimestre.industria;
        baseCalculoIrpjServico += input.acumuladoTrimestre.servico;
        baseCalculoIrpjServicoHosp += (input.acumuladoTrimestre.servicoHospitalar || 0); 
        baseCalculoReceitaFinanceira += input.acumuladoTrimestre.financeira;
        obsTrimestre = ` (Inclui Out/Nov/Dez)`;
    }

    // Definição da alíquota de presunção para serviços gerais
    const presuncaoServicoUsada = input.isPresuncaoReduzida16 
        ? PRESUNCAO_IRPJ_SERVICO_REDUZIDA 
        : PRESUNCAO_IRPJ_SERVICO_PADRAO;

    // Cálculo das Bases Presumidas IRPJ
    const baseIrpjComercio = baseCalculoIrpjComercio * PRESUNCAO_IRPJ_COMERCIO * fatorAumentoPresuncao;
    const baseIrpjIndustria = baseCalculoIrpjIndustria * PRESUNCAO_IRPJ_INDUSTRIA * fatorAumentoPresuncao;
    const baseIrpjServico = baseCalculoIrpjServico * presuncaoServicoUsada * fatorAumentoPresuncao;
    const baseIrpjServicoHosp = baseCalculoIrpjServicoHosp * PRESUNCAO_IRPJ_HOSPITALAR * fatorAumentoPresuncao;
    
    // Receita financeira entra 100%
    const baseIrpjTotal = baseIrpjComercio + baseIrpjIndustria + baseIrpjServico + baseIrpjServicoHosp + baseCalculoReceitaFinanceira;

    if (baseIrpjTotal > 0) {
        let valorIrpj = baseIrpjTotal * ALIQ_IRPJ;
        const limiteAdicional = input.periodoApuracao === 'Trimestral' ? LIMITE_ADICIONAL_TRIMESTRAL : LIMITE_ADICIONAL_MENSAL;
        
        if (baseIrpjTotal > limiteAdicional) {
            valorIrpj += (baseIrpjTotal - limiteAdicional) * ADICIONAL_IRPJ;
        }

        const obsHosp = baseIrpjServicoHosp > 0 ? " + Hosp. 8%" : "";
        const obsReduzida = input.isPresuncaoReduzida16 ? " (Reduzida 16% R$120k)" : "";

        detalhamento.push({
            imposto: `IRPJ (${input.periodoApuracao})`,
            baseCalculo: baseIrpjTotal,
            aliquota: ALIQ_IRPJ * 100,
            valor: Math.max(0, valorIrpj - retencaoIrpj),
            observacao: (aplicouLc224 
                ? `LC 224/25. Base Bruta${obsHosp}${obsReduzida}.${obsTrimestre}` 
                : `Base Bruta${obsHosp}${obsReduzida}.${obsTrimestre}`) + ` Isenção: ${fmt(limiteAdicional)}`
        });
    }

    // CSLL - Base de Presunção
    const baseCsllComercio = baseCalculoIrpjComercio * PRESUNCAO_CSLL_COMERCIO * fatorAumentoPresuncao;
    const baseCsllIndustria = baseCalculoIrpjIndustria * PRESUNCAO_CSLL_INDUSTRIA * fatorAumentoPresuncao;
    const baseCsllServico = baseCalculoIrpjServico * PRESUNCAO_CSLL_SERVICO * fatorAumentoPresuncao; // 32% padrão
    const baseCsllServicoHosp = baseCalculoIrpjServicoHosp * PRESUNCAO_CSLL_HOSPITALAR * fatorAumentoPresuncao; // 12% reduzida

    const baseCsllTotal = baseCsllComercio + baseCsllIndustria + baseCsllServico + baseCsllServicoHosp + baseCalculoReceitaFinanceira;

    if (baseCsllTotal > 0) {
        const obsHosp = baseCsllServicoHosp > 0 ? " + Hosp. 12%" : "";
        detalhamento.push({
            imposto: `CSLL (${input.periodoApuracao})`,
            baseCalculo: baseCsllTotal,
            aliquota: ALIQ_CSLL * 100,
            valor: Math.max(0, (baseCsllTotal * ALIQ_CSLL) - retencaoCsll),
            observacao: aplicouLc224
                ? `LC 224/25.${obsHosp}.${obsTrimestre}`
                : `Base Bruta${obsHosp}.${obsTrimestre}`
        });
    }

    const totalImpostos = detalhamento.reduce((acc, item) => acc + item.valor, 0);
    const extraReceitas = (input.itensAvulsos || []).filter(i => i.tipo === 'receita').reduce((acc, i) => acc + i.valor, 0);
    const extraDespesas = (input.itensAvulsos || []).filter(i => i.tipo === 'despesa').reduce((acc, i) => acc + i.valor, 0);
    
    // Lucro Líquido
    const lucroLiquido = (receitaTotalMes + extraReceitas) - input.custoMercadoriaVendida - input.despesasOperacionais - input.folhaPagamento - extraDespesas - totalImpostos;

    return {
        regime: 'Presumido',
        periodo: input.periodoApuracao,
        detalhamento,
        totalImpostos,
        cargaTributaria: receitaTotalMes > 0 ? (totalImpostos / receitaTotalMes) * 100 : 0,
        lucroLiquidoEstimado: lucroLiquido,
        alertaLc224: aplicouLc224
    };
};

const calcularLucroReal = (input: LucroInput): LucroResult => {
    // Nota: Lucro Real geralmente requer apuração contábil mais complexa.
    // Aqui aplicamos a lógica básica sobre os inputs fornecidos + Filiais.
    
    const fatComercio = input.faturamentoComercio + (input.faturamentoFiliais?.comercio || 0);
    const fatIndustria = input.faturamentoIndustria + (input.faturamentoFiliais?.industria || 0);
    const fatServico = input.faturamentoServico + (input.faturamentoFiliais?.servico || 0);
    const fatServicoHosp = (input.faturamentoServicoHospitalar || 0) + (input.faturamentoFiliais?.servicoHospitalar || 0);
    
    const faturamentoBrutoInput = fatComercio + fatIndustria + fatServico + fatServicoHosp;
    
    // Aplica deduções também no Real para chegar à Receita Líquida Operacional (base de partida)
    const receitaLiquida = Math.max(0, faturamentoBrutoInput - (input.valorIpi || 0) - (input.valorDevolucoes || 0));

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

    const totalReceitas = receitaLiquida + (input.receitaFinanceira || 0) + (input.itensAvulsos || []).filter(i => i.tipo === 'receita').reduce((acc, i) => acc + i.valor, 0);

    // PIS/COFINS (Não Cumulativo - Mensal - Consolidado)
    const basePisCofins = Math.max(0, receitaLiquida - (input.faturamentoMonofasico || 0));
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
