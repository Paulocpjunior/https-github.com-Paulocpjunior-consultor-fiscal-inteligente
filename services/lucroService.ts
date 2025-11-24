
import { LucroInput, LucroResult } from '../types';

// Alíquotas Base (Estimativas Gerais)
const ALIQ_PIS_CUMULATIVO = 0.0065; // 0.65%
const ALIQ_COFINS_CUMULATIVO = 0.03; // 3.00%

const ALIQ_PIS_NAO_CUMULATIVO = 0.0165; // 1.65%
const ALIQ_COFINS_NAO_CUMULATIVO = 0.076; // 7.60%

const ALIQ_IRPJ = 0.15; // 15%
const ADICIONAL_IRPJ = 0.10; // 10% sobre excedente de 20k/mês
const ALIQ_CSLL = 0.09; // 9%

const PRESUNCAO_IRPJ_COMERCIO = 0.08; // 8%
const PRESUNCAO_IRPJ_SERVICO = 0.32; // 32%

const PRESUNCAO_CSLL_COMERCIO = 0.12; // 12%
const PRESUNCAO_CSLL_SERVICO = 0.32; // 32%

// Estimativas médias para ISS e ICMS (variam por município/estado)
const ALIQ_ISS_MEDIA = 0.05; // 5%
const ALIQ_ICMS_MEDIA = 0.18; // 18% (ignoring credits for simplistic estimation)

export const calcularLucroPresumido = (input: LucroInput): LucroResult => {
    const receitaTotal = input.faturamentoComercio + input.faturamentoServico;
    if (receitaTotal === 0) return emptyResult('Presumido');

    // PIS/COFINS (Cumulativo)
    const pis = receitaTotal * ALIQ_PIS_CUMULATIVO;
    const cofins = receitaTotal * ALIQ_COFINS_CUMULATIVO;

    // IRPJ
    const baseIrpj = (input.faturamentoComercio * PRESUNCAO_IRPJ_COMERCIO) + (input.faturamentoServico * PRESUNCAO_IRPJ_SERVICO);
    let irpj = baseIrpj * ALIQ_IRPJ;
    
    // Adicional IRPJ (Excedente de 20k mês -> 60k trimestre, mas aqui calculamos mensal simplificado)
    if (baseIrpj > 20000) {
        irpj += (baseIrpj - 20000) * ADICIONAL_IRPJ;
    }

    // CSLL
    const baseCsll = (input.faturamentoComercio * PRESUNCAO_CSLL_COMERCIO) + (input.faturamentoServico * PRESUNCAO_CSLL_SERVICO);
    const csll = baseCsll * ALIQ_CSLL;

    // ISS / ICMS
    const iss = input.faturamentoServico * ALIQ_ISS_MEDIA;
    // ICMS Simplificado (Débito - Crédito não simulado detalhadamente aqui, usando taxa efetiva reduzida ou full dependendo da complexidade desejada.
    // Para comparação, usamos um valor aproximado sobre venda de mercadoria)
    const icms = input.faturamentoComercio * 0.04; // Estimativa conservadora de saldo a pagar

    const totalImpostos = pis + cofins + irpj + csll + iss + icms;
    const lucroLiquido = receitaTotal - input.custoMercadoriaVendida - input.despesasOperacionais - input.folhaPagamento - totalImpostos;

    return {
        regime: 'Presumido',
        pis,
        cofins,
        irpj,
        csll,
        iss,
        icms,
        totalImpostos,
        cargaTributaria: (totalImpostos / receitaTotal) * 100,
        lucroLiquidoEstimado: lucroLiquido
    };
};

export const calcularLucroReal = (input: LucroInput): LucroResult => {
    const receitaTotal = input.faturamentoComercio + input.faturamentoServico;
    if (receitaTotal === 0) return emptyResult('Real');

    // Lucro Contábil Antes dos Impostos (LAIR aproximado)
    const lucroOperacional = receitaTotal - input.custoMercadoriaVendida - input.despesasOperacionais - input.folhaPagamento;

    // PIS/COFINS (Não Cumulativo - Crédito sobre insumos/despesas aceitas)
    // Simplificação: Crédito sobre 70% das despesas + CMV (Estimativa)
    const baseCredito = input.custoMercadoriaVendida + (input.despesasOperacionais * 0.5); 
    
    const debitoPis = receitaTotal * ALIQ_PIS_NAO_CUMULATIVO;
    const creditoPis = baseCredito * ALIQ_PIS_NAO_CUMULATIVO;
    const pis = Math.max(0, debitoPis - creditoPis);

    const debitoCofins = receitaTotal * ALIQ_COFINS_NAO_CUMULATIVO;
    const creditoCofins = baseCredito * ALIQ_COFINS_NAO_CUMULATIVO;
    const cofins = Math.max(0, debitoCofins - creditoCofins);

    // IRPJ / CSLL (Sobre Lucro Real)
    // Se prejuízo, imposto é zero
    let irpj = 0;
    let csll = 0;

    if (lucroOperacional > 0) {
        irpj = lucroOperacional * ALIQ_IRPJ;
        if (lucroOperacional > 20000) {
            irpj += (lucroOperacional - 20000) * ADICIONAL_IRPJ;
        }
        csll = lucroOperacional * ALIQ_CSLL;
    }

    // ISS / ICMS
    const iss = input.faturamentoServico * ALIQ_ISS_MEDIA;
    const icms = input.faturamentoComercio * 0.04; // Estimativa saldo devedor

    const totalImpostos = pis + cofins + irpj + csll + iss + icms;
    const lucroLiquido = lucroOperacional - (pis + cofins + irpj + csll + iss + icms); // Ajuste pois PIS/COFINS já deduziram do caixa no conceito, mas aqui subtraímos do operacional bruto

    return {
        regime: 'Real',
        pis,
        cofins,
        irpj,
        csll,
        iss,
        icms,
        totalImpostos,
        cargaTributaria: (totalImpostos / receitaTotal) * 100,
        lucroLiquidoEstimado: lucroLiquido
    };
};

const emptyResult = (regime: 'Presumido' | 'Real'): LucroResult => ({
    regime,
    pis: 0, cofins: 0, irpj: 0, csll: 0, iss: 0, icms: 0,
    totalImpostos: 0, cargaTributaria: 0, lucroLiquidoEstimado: 0
});
