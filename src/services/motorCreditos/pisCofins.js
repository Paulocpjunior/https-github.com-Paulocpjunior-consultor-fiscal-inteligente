/**
 * Motor de Regras — PIS/COFINS
 * Base legal: Lei 10.637/2002 (PIS) e Lei 10.833/2003 (COFINS)
 * Regime Não-Cumulativo: Lucro Real
 * Regime Cumulativo: Lucro Presumido / Simples Nacional
 */

// ─────────────────────────────────────────────
// CFOPs que permitem crédito de PIS/COFINS
// (entradas de mercadorias e serviços para uso na atividade)
// ─────────────────────────────────────────────
const CFOP_CREDITO_PERMITIDO = [
  // Compras para industrialização
  '1101','1102','1111','1116','1117','1118','1120','1121','1122',
  '2101','2102','2111','2116','2117','2118','2120','2121','2122',
  // Compras para comercialização
  '1401','1403','1652',
  '2401','2403','2652',
  // Ativo imobilizado
  '1406','1407','1408','1551','1552','1553',
  '2406','2407','2408','2551','2552','2553',
  // Energia elétrica
  '1252','2252',
  // Serviços (fretes, aluguéis)
  '1301','1302','1303','1304','1351','1352','1353','1354',
  '2301','2302','2303','2304','2351','2352','2353','2354',
  // Devoluções de vendas
  '1201','1202','1203','1204','1410','1411',
  '2201','2202','2203','2204','2410','2411',
];

// ─────────────────────────────────────────────
// CFOPs que NÃO geram crédito
// ─────────────────────────────────────────────
const CFOP_SEM_CREDITO = [
  // Uso e consumo (vedado até regulamentação)
  '1556','2556',
  // Brindes e doações
  '1910','1911','1912','1913',
  // Transferências internas
  '1151','1152','1153','2151','2152','2153',
];

// ─────────────────────────────────────────────
// CSTs PIS/COFINS — identifica se a nota
// já indica crédito na origem
// ─────────────────────────────────────────────
const CST_COM_CREDITO = ['50','51','52','53','54','55','56','60','61','62','63','64','65','66','67','70','71','72','73','74','75','98','99'];
const CST_SEM_CREDITO  = ['01','02','03','04','05','06','07','08','09'];

// ─────────────────────────────────────────────
// Alíquotas
// ─────────────────────────────────────────────
const ALIQUOTAS = {
  nao_cumulativo: { pis: 0.0165, cofins: 0.076  },
  cumulativo:     { pis: 0.0065, cofins: 0.03   },
};

// ─────────────────────────────────────────────
// Tipos de ativo imobilizado → crédito em 1/48
// ─────────────────────────────────────────────
const CFOP_ATIVO_IMOBILIZADO = ['1406','1407','1408','1551','1552','1553','2406','2407','2408','2551','2552','2553'];

// ─────────────────────────────────────────────
// Naturezas de despesa que geram crédito (Art. 3º Lei 10.833/03)
// ─────────────────────────────────────────────
const NATUREZAS_COM_CREDITO = [
  { codigo: 'INSUMO',        descricao: 'Insumos — Art. 3º, II',                  legal: 'Art. 3º, II — Lei 10.833/03'  },
  { codigo: 'ENERGIA',       descricao: 'Energia elétrica e térmica',             legal: 'Art. 3º, III — Lei 10.833/03' },
  { codigo: 'ALUGUEL_PJ',    descricao: 'Aluguéis de PJ (prédios/máquinas)',      legal: 'Art. 3º, IV — Lei 10.833/03'  },
  { codigo: 'ARRENDAMENTO',  descricao: 'Arrendamento mercantil (leasing)',        legal: 'Art. 3º, V — Lei 10.833/03'   },
  { codigo: 'ATIVO_IMOB',    descricao: 'Máquinas/equipamentos — ativo imob.',    legal: 'Art. 3º, VI — Lei 10.833/03'  },
  { codigo: 'EDIFICACAO',    descricao: 'Edificações/benfeitorias imóveis',        legal: 'Art. 3º, VII — Lei 10.833/03' },
  { codigo: 'DEVOLUCAO',     descricao: 'Bens recebidos em devolução',            legal: 'Art. 3º, VIII — Lei 10.833/03'},
  { codigo: 'FRETE_VENDA',   descricao: 'Armazenagem e frete — operação de venda',legal: 'Art. 3º, IX — Lei 10.833/03'  },
  { codigo: 'VALE_TRANSPORTE','descricao':'Vale-transporte / Vale-refeição',      legal: 'Art. 3º, X — Lei 10.833/03'   },
];

const NATUREZAS_SEM_CREDITO = [
  { codigo: 'USO_CONSUMO',   motivo: 'Uso e consumo — crédito vedado (Art. 3º, §2º, I)'              },
  { codigo: 'ALUGUEL_PF',    motivo: 'Aluguel pago a pessoa física — não gera crédito'               },
  { codigo: 'MAO_OBRA_PF',   motivo: 'Mão de obra de pessoa física — não gera crédito'              },
  { codigo: 'SIMPLES_FORN',  motivo: 'Fornecedor optante do Simples Nacional — vedado (Art. 3º, §2º, I)'},
  { codigo: 'BRINDE',        motivo: 'Brindes/amostras — não vinculado à atividade produtiva'        },
];

// ─────────────────────────────────────────────
// FUNÇÃO PRINCIPAL
// Recebe uma nota (objeto normalizado) e o regime do cliente
// Retorna o resultado da análise de crédito
// ─────────────────────────────────────────────
function analisarNotaPisCofins(nota, regimeCliente) {
  const resultado = {
    chaveNota:     nota.chave || nota.numero || 'N/A',
    emitente:      nota.emitente || '',
    cfop:          nota.cfop || '',
    cst:           nota.cst || '',
    natureza:      nota.natureza || '',
    valorTotal:    Number(nota.valorTotal) || 0,
    baseCalculo:   Number(nota.baseCalculo || nota.valorTotal) || 0,
    creditoPIS:    0,
    creditoCOFINS: 0,
    credito:       false,
    tipo:          'NEGADO',   // APROVADO | PARCIAL | NEGADO
    observacao:    '',
    fundamentoLegal: '',
    avisos:        [],
  };

  // ── Regime Cumulativo → não gera crédito ──
  if (regimeCliente === 'LUCRO_PRESUMIDO' || regimeCliente === 'SIMPLES') {
    resultado.tipo = 'NEGADO';
    resultado.observacao = 'Regime cumulativo — PIS/COFINS não geram crédito';
    resultado.fundamentoLegal = 'Art. 8º Lei 10.637/02 / Art. 10 Lei 10.833/03';
    return resultado;
  }

  // ── Lucro Real — Regime Não-Cumulativo ──
  const aliq = ALIQUOTAS.nao_cumulativo;
  const cfop = String(nota.cfop || '').trim();
  const cst  = String(nota.cst  || '').trim().padStart(2,'0');
  const nat  = String(nota.natureza || '').toUpperCase();

  // Verifica fornecedor do Simples Nacional
  if (nota.fornecedorSimples === true || nota.regimeFornecedor === 'SIMPLES') {
    resultado.tipo = 'NEGADO';
    resultado.observacao = 'Fornecedor optante do Simples Nacional — crédito vedado';
    resultado.fundamentoLegal = 'Art. 3º, §2º, I — Lei 10.833/03';
    resultado.avisos.push('Confirmar regime tributário do fornecedor');
    return resultado;
  }

  // Verifica CST vedante
  if (CST_SEM_CREDITO.includes(cst)) {
    resultado.tipo = 'NEGADO';
    resultado.observacao = `CST ${cst} indica operação sem direito a crédito`;
    resultado.fundamentoLegal = 'Tabela CST PIS/COFINS — IN RFB 1.009/2009';
    return resultado;
  }

  // Verifica CFOP vedante
  if (CFOP_SEM_CREDITO.includes(cfop)) {
    resultado.tipo = 'NEGADO';
    resultado.observacao = `CFOP ${cfop} — natureza vedada para crédito de PIS/COFINS`;
    resultado.fundamentoLegal = 'Art. 3º, §2º — Lei 10.833/03';
    return resultado;
  }

  // Verifica ativo imobilizado → crédito em 1/48
  if (CFOP_ATIVO_IMOBILIZADO.includes(cfop) || nat.includes('ATIVO') || nat.includes('IMOBILIZADO')) {
    const creditoTotal = resultado.baseCalculo * (aliq.pis + aliq.cofins);
    resultado.creditoPIS    = +(resultado.baseCalculo * aliq.pis    / 48).toFixed(2);
    resultado.creditoCOFINS = +(resultado.baseCalculo * aliq.cofins / 48).toFixed(2);
    resultado.credito       = true;
    resultado.tipo          = 'PARCIAL';
    resultado.observacao    = `Ativo imobilizado — crédito em 1/48 avos por competência. Total a apropriar: R$ ${creditoTotal.toFixed(2)}`;
    resultado.fundamentoLegal = 'Art. 3º, VI c/c Art. 7º — Lei 10.833/03';
    resultado.avisos.push(`Crédito mensal: PIS R$ ${resultado.creditoPIS} | COFINS R$ ${resultado.creditoCOFINS}`);
    return resultado;
  }

  // Verifica CFOP com crédito permitido
  const cfopPermitido = CFOP_CREDITO_PERMITIDO.includes(cfop);
  const cstPermitido  = CST_COM_CREDITO.includes(cst);

  if (cfopPermitido || cstPermitido) {
    resultado.creditoPIS    = +(resultado.baseCalculo * aliq.pis).toFixed(2);
    resultado.creditoCOFINS = +(resultado.baseCalculo * aliq.cofins).toFixed(2);
    resultado.credito       = true;
    resultado.tipo          = 'APROVADO';

    // Busca natureza correspondente para fundamento legal
    const naturezaMatch = NATUREZAS_COM_CREDITO.find(n =>
      nat.includes(n.codigo) || cfop.startsWith('1252') || cfop.startsWith('2252')
    );
    resultado.fundamentoLegal = naturezaMatch
      ? naturezaMatch.legal
      : 'Art. 3º — Lei 10.833/03 (Lei 10.637/02 para PIS)';
    resultado.observacao = `Crédito aprovado — PIS: R$ ${resultado.creditoPIS} | COFINS: R$ ${resultado.creditoCOFINS}`;
    return resultado;
  }

  // CFOP não mapeado → sinaliza para revisão manual
  resultado.tipo = 'REVISAR';
  resultado.observacao = `CFOP ${cfop} não mapeado — revisar enquadramento manual`;
  resultado.fundamentoLegal = 'Verificar Art. 3º — Lei 10.833/03';
  resultado.avisos.push('CFOP fora da lista mapeada — análise manual recomendada');
  return resultado;
}

// ─────────────────────────────────────────────
// Analisa um lote de notas
// ─────────────────────────────────────────────
function analisarLotePisCofins(notas, regimeCliente) {
  const resultados = notas.map(nota => analisarNotaPisCofins(nota, regimeCliente));

  const totais = resultados.reduce((acc, r) => {
    acc.creditoPIS    += r.creditoPIS;
    acc.creditoCOFINS += r.creditoCOFINS;
    acc.totalAprovado += r.tipo === 'APROVADO' ? 1 : 0;
    acc.totalParcial  += r.tipo === 'PARCIAL'  ? 1 : 0;
    acc.totalNegado   += r.tipo === 'NEGADO'   ? 1 : 0;
    acc.totalRevisar  += r.tipo === 'REVISAR'  ? 1 : 0;
    return acc;
  }, { creditoPIS: 0, creditoCOFINS: 0, totalAprovado: 0, totalParcial: 0, totalNegado: 0, totalRevisar: 0 });

  totais.creditoPIS    = +totais.creditoPIS.toFixed(2);
  totais.creditoCOFINS = +totais.creditoCOFINS.toFixed(2);
  totais.creditoTotal  = +(totais.creditoPIS + totais.creditoCOFINS).toFixed(2);

  return { resultados, totais };
}

export {
  analisarNotaPisCofins,
  analisarLotePisCofins,
  CFOP_CREDITO_PERMITIDO,
  CFOP_ATIVO_IMOBILIZADO,
  NATUREZAS_COM_CREDITO,
  NATUREZAS_SEM_CREDITO,
  ALIQUOTAS,
};
