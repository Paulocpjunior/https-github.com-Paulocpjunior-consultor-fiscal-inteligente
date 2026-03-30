/**
 * Motor de Regras — ICMS
 * Base legal: Lei Complementar 87/1996 (Lei Kandir) e legislação estadual
 * Crédito permitido: entradas destinadas à atividade operacional
 */

// ─────────────────────────────────────────────
// CSTs ICMS — identifica o tipo de operação
// ─────────────────────────────────────────────
const CST_ICMS_COM_CREDITO = [
  '00', // Tributada integralmente
  '20', // Com redução de base de cálculo
  '51', // Diferimento (parcial)
  '70', // Com redução de BC e cobrança do ICMS por ST
  '90', // Outras (verificar caso a caso)
];

const CST_ICMS_SEM_CREDITO = [
  '10', // Tributada e com cobrança de ICMS por ST → crédito somente do ICMS próprio
  '30', // Isenta/não tributada + ST
  '40', // Isenta
  '41', // Não tributada
  '50', // Suspensão
  '60', // ICMS cobrado anteriormente por ST
];

// CSOSN — Simples Nacional
const CSOSN_COM_CREDITO    = ['101','102','103','201','202','203','300','400','500','900'];
const CSOSN_SEM_CREDITO    = ['300','400','500']; // depende do estado e do adquirente

// ─────────────────────────────────────────────
// CFOPs — ICMS
// ─────────────────────────────────────────────
const CFOP_ICMS_PERMITIDO = [
  // Compras para comercialização / industrialização
  '1101','1102','1111','1116','1117','1118','1120','1121','1122',
  '2101','2102','2111','2116','2117','2118','2120','2121','2122',
  '1401','1403','2401','2403',
  // Ativo imobilizado (CIAP — crédito 1/48 avos)
  '1406','1407','1408','1551','1552','1553',
  '2406','2407','2408','2551','2552','2553',
  // Energia elétrica (permitida quando insumo industrial ou uso e consumo com previsão estadual)
  '1252','2252',
  // Devoluções
  '1201','1202','1410','1411','2201','2202','2410','2411',
];

const CFOP_ICMS_USO_CONSUMO = [
  '1556','2556', // Uso e consumo — crédito vedado até 31/12/2032 (LC 171/2019)
];

const CFOP_ICMS_ATIVO = [
  '1406','1407','1408','1551','1552','1553',
  '2406','2407','2408','2551','2552','2553',
];

// ─────────────────────────────────────────────
// Alíquotas interestaduais padrão (ICMS)
// ─────────────────────────────────────────────
const ALIQ_INTERESTADUAL = {
  'SP_N_NE_CO': 0.07,   // SP para Norte/Nordeste/Centro-Oeste
  'SP_SUL_SE':  0.12,   // SP para Sul/Sudeste (exceto ES)
  'OUTROS':     0.12,
};

// Diferencial de alíquota — DIFAL (EC 87/2015)
function calcularDifal(aliqInterna, aliqInterestadual) {
  const difal = aliqInterna - aliqInterestadual;
  return difal > 0 ? +difal.toFixed(4) : 0;
}

// ─────────────────────────────────────────────
// FUNÇÃO PRINCIPAL — analisa ICMS de uma nota
// ─────────────────────────────────────────────
function analisarNotaIcms(nota, perfilCliente) {
  const resultado = {
    chaveNota:       nota.chave || nota.numero || 'N/A',
    emitente:        nota.emitente || '',
    cfop:            nota.cfop || '',
    cst:             nota.cst || nota.csosn || '',
    valorIcms:       Number(nota.valorIcms)   || 0,
    baseCalculoIcms: Number(nota.baseIcms || nota.baseCalculo || nota.valorTotal) || 0,
    aliquotaIcms:    Number(nota.aliquotaIcms) || 0,
    creditoIcms:     0,
    credito:         false,
    tipo:            'NEGADO',
    observacao:      '',
    fundamentoLegal: '',
    avisos:          [],
    difal:           null,
  };

  const cfop = String(nota.cfop   || '').trim();
  const cst  = String(nota.cst    || nota.csosn || '').trim().padStart(2,'0');
  const ufEmitente  = String(nota.ufEmitente  || '').toUpperCase();
  const ufDestinatario = String(perfilCliente.uf || '').toUpperCase();
  const regimeCliente  = perfilCliente.regime || '';

  // ── Uso e Consumo → vedado até 2032 ──
  if (CFOP_ICMS_USO_CONSUMO.includes(cfop)) {
    resultado.tipo = 'NEGADO';
    resultado.observacao = 'Uso e consumo — crédito de ICMS vedado até 31/12/2032';
    resultado.fundamentoLegal = 'Art. 33, I — LC 87/1996 / LC 171/2019';
    return resultado;
  }

  // ── CST sem crédito ──
  if (CST_ICMS_SEM_CREDITO.includes(cst)) {
    resultado.tipo = 'NEGADO';
    resultado.observacao = `CST/CSOSN ${cst} — operação sem geração de crédito de ICMS`;
    resultado.fundamentoLegal = 'Art. 20 — LC 87/1996';
    return resultado;
  }

  // ── Ativo Imobilizado → CIAP (1/48 avos por mês) ──
  if (CFOP_ICMS_ATIVO.includes(cfop)) {
    const creditoTotal = resultado.valorIcms || (resultado.baseCalculoIcms * resultado.aliquotaIcms / 100);
    resultado.creditoIcms   = +(creditoTotal / 48).toFixed(2);
    resultado.credito       = true;
    resultado.tipo          = 'PARCIAL';
    resultado.observacao    = `Ativo imobilizado — crédito via CIAP em 1/48 avos. Total ICMS: R$ ${creditoTotal.toFixed(2)} | Parcela mensal: R$ ${resultado.creditoIcms}`;
    resultado.fundamentoLegal = 'Art. 20, §5º — LC 87/1996 (CIAP)';
    resultado.avisos.push('Escriturar no CIAP e controlar as 48 parcelas');
    return resultado;
  }

  // ── Operação interestadual — verificar DIFAL ──
  if (ufEmitente && ufDestinatario && ufEmitente !== ufDestinatario) {
    const aliqInterna = perfilCliente.aliqInternaIcms || 0.18; // SP default 18%
    const aliqInter   = resultado.aliquotaIcms / 100 || 0.12;
    const difalCalc   = calcularDifal(aliqInterna, aliqInter);

    if (difalCalc > 0) {
      resultado.difal = {
        aliqInterna:       aliqInterna,
        aliqInterestadual: aliqInter,
        percentualDifal:   difalCalc,
        valorDifal:        +(resultado.baseCalculoIcms * difalCalc).toFixed(2),
      };
      resultado.avisos.push(`DIFAL aplicável: ${(difalCalc * 100).toFixed(2)}% — Verificar partilha FECP`);
    }
  }

  // ── CFOP com crédito permitido ──
  if (CFOP_ICMS_PERMITIDO.includes(cfop) && CST_ICMS_COM_CREDITO.includes(cst)) {
    resultado.creditoIcms   = resultado.valorIcms > 0
      ? resultado.valorIcms
      : +(resultado.baseCalculoIcms * resultado.aliquotaIcms / 100).toFixed(2);
    resultado.credito       = true;
    resultado.tipo          = 'APROVADO';
    resultado.observacao    = `Crédito de ICMS aprovado — R$ ${resultado.creditoIcms.toFixed(2)}`;
    resultado.fundamentoLegal = 'Art. 20 — LC 87/1996';
    return resultado;
  }

  // ── Não mapeado ──
  resultado.tipo = 'REVISAR';
  resultado.observacao = `CFOP ${cfop} / CST ${cst} — revisar enquadramento manual`;
  resultado.fundamentoLegal = 'Art. 20 — LC 87/1996';
  resultado.avisos.push('Operação fora dos padrões mapeados — análise manual recomendada');
  return resultado;
}

// ─────────────────────────────────────────────
// Analisa um lote de notas — ICMS
// ─────────────────────────────────────────────
function analisarLoteIcms(notas, perfilCliente) {
  const resultados = notas.map(nota => analisarNotaIcms(nota, perfilCliente));

  const totais = resultados.reduce((acc, r) => {
    acc.creditoIcms   += r.creditoIcms;
    acc.totalAprovado += r.tipo === 'APROVADO' ? 1 : 0;
    acc.totalParcial  += r.tipo === 'PARCIAL'  ? 1 : 0;
    acc.totalNegado   += r.tipo === 'NEGADO'   ? 1 : 0;
    acc.totalRevisar  += r.tipo === 'REVISAR'  ? 1 : 0;
    return acc;
  }, { creditoIcms: 0, totalAprovado: 0, totalParcial: 0, totalNegado: 0, totalRevisar: 0 });

  totais.creditoIcms = +totais.creditoIcms.toFixed(2);

  return { resultados, totais };
}

export {
  analisarNotaIcms,
  analisarLoteIcms,
  calcularDifal,
  CFOP_ICMS_PERMITIDO,
  CFOP_ICMS_ATIVO,
  CST_ICMS_COM_CREDITO,
};
