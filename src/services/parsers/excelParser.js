/**
 * Parser — Excel / CSV
 * Lê planilhas enviadas pelo cliente e normaliza para o formato do motor
 * Dependência: npm install xlsx
 */

import XLSX from 'xlsx';

// ─────────────────────────────────────────────
// Mapeamento flexível de colunas
// Aceita variações de nome que clientes costumam usar
// ─────────────────────────────────────────────
const MAPA_COLUNAS = {
  chave:        ['chave','chave nfe','chave_nfe','chave de acesso','chave acesso'],
  numero:       ['numero','número','num nota','nf','nota','nº'],
  emitente:     ['emitente','fornecedor','razao social','razão social','nome'],
  cnpjEmitente: ['cnpj emitente','cnpj fornecedor','cnpj','cpf/cnpj'],
  cfop:         ['cfop'],
  cst:          ['cst','csosn','cst pis','cst cofins','cst/csosn'],
  natureza:     ['natureza','natureza operacao','natureza da operação','descrição','descricao'],
  valorTotal:   ['valor total','total nf','valor nf','valor nota','total','valor'],
  baseCalculo:  ['base calculo','base de cálculo','base','bc'],
  valorIcms:    ['valor icms','icms','vl icms'],
  baseIcms:     ['base icms','bc icms','base calculo icms'],
  aliquotaIcms: ['aliq icms','aliquota icms','% icms'],
  valorPis:     ['valor pis','pis','vl pis'],
  valorCofins:  ['valor cofins','cofins','vl cofins'],
  valorIss:     ['valor iss','iss','vl iss'],
  ufEmitente:   ['uf emitente','uf','estado emitente'],
  tipo:         ['tipo','tipo nota','tipo nf','produto/servico','produto/serviço'],
  regimeFornecedor: ['regime fornecedor','simples','optante simples'],
};

// ─────────────────────────────────────────────
// Detecta o índice real da coluna na planilha
// ─────────────────────────────────────────────
function mapearCabecalhos(cabecalhos) {
  const mapa = {};
  const cabLower = cabecalhos.map(c => String(c || '').toLowerCase().trim());

  for (const [campo, variantes] of Object.entries(MAPA_COLUNAS)) {
    const idx = cabLower.findIndex(c => variantes.includes(c));
    if (idx !== -1) mapa[campo] = idx;
  }

  return mapa;
}

// ─────────────────────────────────────────────
// Normaliza CNPJ (remove pontuação)
// ─────────────────────────────────────────────
function normalizarCnpj(valor) {
  if (!valor) return '';
  return String(valor).replace(/\D/g, '').padStart(14, '0');
}

// ─────────────────────────────────────────────
// Normaliza valor monetário
// ─────────────────────────────────────────────
function normalizarValor(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;
  const str = String(valor).replace(/[R$\s]/g, '').replace(',', '.');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

// ─────────────────────────────────────────────
// Converte linha da planilha em objeto nota
// ─────────────────────────────────────────────
function linhaParaNota(linha, mapaIdx) {
  const get = (campo) => {
    const idx = mapaIdx[campo];
    return idx !== undefined ? linha[idx] : undefined;
  };

  const tipo = String(get('tipo') || '').toUpperCase();

  return {
    chave:            String(get('chave') || '').trim(),
    numero:           String(get('numero') || '').trim(),
    emitente:         String(get('emitente') || '').trim(),
    cnpjEmitente:     normalizarCnpj(get('cnpjEmitente')),
    cfop:             String(get('cfop') || '').trim(),
    cst:              String(get('cst') || '').trim(),
    natureza:         String(get('natureza') || '').trim(),
    valorTotal:       normalizarValor(get('valorTotal')),
    baseCalculo:      normalizarValor(get('baseCalculo')),
    valorIcms:        normalizarValor(get('valorIcms')),
    baseIcms:         normalizarValor(get('baseIcms')),
    aliquotaIcms:     normalizarValor(get('aliquotaIcms')),
    valorPis:         normalizarValor(get('valorPis')),
    valorCofins:      normalizarValor(get('valorCofins')),
    valorIss:         normalizarValor(get('valorIss')),
    ufEmitente:       String(get('ufEmitente') || '').toUpperCase().trim(),
    tipo:             tipo.includes('SERV') ? 'SERVICO' : 'PRODUTO',
    fornecedorSimples: String(get('regimeFornecedor') || '').toUpperCase().includes('SIMPLES'),
    origem:           'EXCEL',
  };
}

// ─────────────────────────────────────────────
// PARSE PRINCIPAL — Buffer ou caminho do arquivo
// ─────────────────────────────────────────────
function parseExcel(bufferOuCaminho) {
  let workbook;

  if (Buffer.isBuffer(bufferOuCaminho)) {
    workbook = XLSX.read(bufferOuCaminho, { type: 'buffer' });
  } else {
    workbook = XLSX.readFile(bufferOuCaminho);
  }

  const nomePlanilha = workbook.SheetNames[0];
  const sheet        = workbook.Sheets[nomePlanilha];
  const dados        = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (dados.length < 2) {
    throw new Error('Planilha vazia ou sem dados suficientes (mínimo: cabeçalho + 1 linha)');
  }

  const cabecalhos = dados[0];
  const mapaIdx    = mapearCabecalhos(cabecalhos);

  // Valida colunas mínimas
  const camposObrigatorios = ['cfop', 'valorTotal'];
  const faltando = camposObrigatorios.filter(c => mapaIdx[c] === undefined);
  if (faltando.length > 0) {
    throw new Error(`Colunas obrigatórias não encontradas: ${faltando.join(', ')}. Verifique o cabeçalho da planilha.`);
  }

  // Processa linhas (ignora linhas vazias)
  const notas = dados
    .slice(1)
    .filter(linha => linha.some(cel => cel !== '' && cel !== null))
    .map(linha => linhaParaNota(linha, mapaIdx));

  return {
    notas,
    totalLinhas: notas.length,
    planilha:    nomePlanilha,
    cabecalhosMapeados: Object.keys(mapaIdx),
    cabecalhosNaoMapeados: cabecalhos
      .map(c => String(c).toLowerCase().trim())
      .filter(c => c && !Object.values(MAPA_COLUNAS).flat().includes(c)),
  };
}

// ─────────────────────────────────────────────
// PARSE CSV (usa o mesmo mecanismo do XLSX)
// ─────────────────────────────────────────────
function parseCsv(bufferOuTexto) {
  let workbook;

  if (typeof bufferOuTexto === 'string') {
    workbook = XLSX.read(bufferOuTexto, { type: 'string' });
  } else {
    workbook = XLSX.read(bufferOuTexto, { type: 'buffer' });
  }

  const nomePlanilha = workbook.SheetNames[0];
  const sheet        = workbook.Sheets[nomePlanilha];
  const dados        = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

  if (dados.length < 2) throw new Error('CSV vazio ou inválido');

  const cabecalhos = dados[0];
  const mapaIdx    = mapearCabecalhos(cabecalhos);
  const notas      = dados
    .slice(1)
    .filter(linha => linha.some(cel => cel !== ''))
    .map(linha => linhaParaNota(linha, mapaIdx));

  return { notas, totalLinhas: notas.length };
}

export { parseExcel, parseCsv, normalizarCnpj, normalizarValor };
