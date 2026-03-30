/**
 * Orquestrador — Motor de Créditos Fiscais
 * Consolida PIS/COFINS + ICMS + ISS em uma única análise
 */

const { analisarLotePisCofins } = require('./pisCofins');
const { analisarLoteIcms }      = require('./icms');

// ─────────────────────────────────────────────
// ISS — não gera crédito, apenas valida retenção
// ─────────────────────────────────────────────
function analisarIss(notas, perfilCliente) {
  return notas.map(nota => {
    const valorIss = Number(nota.valorIss) || 0;
    const resultado = {
      chaveNota:   nota.chave || nota.numero || 'N/A',
      emitente:    nota.emitente || '',
      credito:     false,
      tipo:        'NEGADO',
      valorIss,
      retencaoDevida: false,
      observacao:  'ISS não gera crédito para o tomador do serviço',
      fundamentoLegal: 'LC 116/2003',
      avisos:      [],
    };

    // Verifica se há retenção na fonte devida
    if (valorIss > 0 && perfilCliente.responsavelRetencaoIss) {
      resultado.retencaoDevida = true;
      resultado.avisos.push(`ISS retido na fonte: R$ ${valorIss.toFixed(2)} — recolher via guia municipal`);
    }

    return resultado;
  });
}

// ─────────────────────────────────────────────
// ANÁLISE COMPLETA — entrada principal
// ─────────────────────────────────────────────
async function analisarCreditos(notas, perfilCliente) {
  if (!notas || notas.length === 0) {
    throw new Error('Nenhuma nota fiscal informada para análise');
  }

  if (!perfilCliente || !perfilCliente.regime) {
    throw new Error('Perfil do cliente incompleto — regime tributário obrigatório');
  }

  // Separa notas por tipo (produto vs serviço)
  const notasProduto  = notas.filter(n => n.tipo !== 'SERVICO');
  const notasServico  = notas.filter(n => n.tipo === 'SERVICO');

  // ── Analisa cada tributo ──
  const pisCofins = analisarLotePisCofins(notas, perfilCliente.regime);
  const icms      = analisarLoteIcms(notasProduto, perfilCliente);
  const iss       = analisarIss(notasServico, perfilCliente);

  // ── Consolida totais ──
  const totaisConsolidados = {
    creditoPIS:    pisCofins.totais.creditoPIS,
    creditoCOFINS: pisCofins.totais.creditoCOFINS,
    creditoIcms:   icms.totais.creditoIcms,
    creditoTotal:  +(pisCofins.totais.creditoTotal + icms.totais.creditoIcms).toFixed(2),
    notasAnalisadas: notas.length,
    resumo: {
      pisCofins: pisCofins.totais,
      icms:      icms.totais,
    },
  };

  // ── Monta relatório por nota (join dos resultados) ──
  const relatorioDetalhado = notas.map((_, idx) => ({
    nota:     notas[idx],
    pisCofins: pisCofins.resultados[idx]  || null,
    icms:      icms.resultados[idx]       || null,
    iss:       iss[idx]                   || null,
  }));

  return {
    cliente:    perfilCliente,
    dataAnalise: new Date().toISOString(),
    totais:     totaisConsolidados,
    detalhes:   relatorioDetalhado,
    alertas:    gerarAlertas(pisCofins, icms, perfilCliente),
  };
}

// ─────────────────────────────────────────────
// Gera alertas gerais da análise
// ─────────────────────────────────────────────
function gerarAlertas(pisCofins, icms, perfilCliente) {
  const alertas = [];

  if (pisCofins.totais.totalRevisar > 0) {
    alertas.push({
      nivel: 'ATENCAO',
      mensagem: `${pisCofins.totais.totalRevisar} nota(s) com PIS/COFINS a revisar manualmente`,
    });
  }

  if (icms.totais.totalRevisar > 0) {
    alertas.push({
      nivel: 'ATENCAO',
      mensagem: `${icms.totais.totalRevisar} nota(s) com ICMS a revisar manualmente`,
    });
  }

  if (icms.totais.totalParcial > 0) {
    alertas.push({
      nivel: 'INFO',
      mensagem: `${icms.totais.totalParcial} nota(s) com ativo imobilizado — controlar CIAP`,
    });
  }

  if (perfilCliente.regime === 'LUCRO_PRESUMIDO') {
    alertas.push({
      nivel: 'INFO',
      mensagem: 'Regime cumulativo — PIS/COFINS não geram crédito (Lucro Presumido)',
    });
  }

  return alertas;
}

module.exports = { analisarCreditos };
