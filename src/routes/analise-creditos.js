/**
 * Route — /api/analise-creditos
 * Recebe notas via Excel, XML ou JSON manual
 * Retorna análise de créditos PIS/COFINS + ICMS + ISS
 * Dependências: npm install multer xlsx xml2js
 */

const express   = require('express');
const multer    = require('multer');
const router    = express.Router();

const { analisarCreditos }      = require('../services/motorCreditos/index');
const { parseExcel, parseCsv }  = require('../services/parsers/excelParser');
const { parseXmlNfe }           = require('../services/parsers/xmlNfeParser');

// Multer — upload em memória (sem salvar disco)
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const permitidos = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'text/xml',
      'application/xml',
    ];
    const extPermitida = /\.(xlsx|xls|csv|xml)$/i.test(file.originalname);
    if (permitidos.includes(file.mimetype) || extPermitida) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não suportado. Use .xlsx, .csv ou .xml'));
    }
  },
});

// ─────────────────────────────────────────────
// POST /api/analise-creditos/upload
// Upload de arquivo (Excel, CSV ou XML NF-e)
// ─────────────────────────────────────────────
router.post('/upload', upload.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ erro: 'Nenhum arquivo enviado' });
    }

    // Perfil do cliente (vem no body como JSON)
    let perfilCliente;
    try {
      perfilCliente = JSON.parse(req.body.perfil || '{}');
    } catch {
      return res.status(400).json({ erro: 'Perfil do cliente inválido — envie JSON no campo "perfil"' });
    }

    if (!perfilCliente.regime) {
      return res.status(400).json({ erro: 'Campo "regime" obrigatório no perfil do cliente (LUCRO_REAL | LUCRO_PRESUMIDO | SIMPLES)' });
    }

    // Parse do arquivo
    let parsed;
    const nomeArquivo = req.file.originalname.toLowerCase();

    if (nomeArquivo.endsWith('.xml')) {
      parsed = await parseXmlNfe(req.file.buffer);
    } else if (nomeArquivo.endsWith('.csv')) {
      parsed = parseCsv(req.file.buffer);
    } else {
      parsed = parseExcel(req.file.buffer);
    }

    if (!parsed.notas || parsed.notas.length === 0) {
      return res.status(422).json({ erro: 'Nenhuma nota encontrada no arquivo enviado' });
    }

    // Analisa créditos
    const resultado = await analisarCreditos(parsed.notas, perfilCliente);

    return res.json({
      sucesso: true,
      arquivo: req.file.originalname,
      totalNotas: parsed.totalLinhas,
      resultado,
    });

  } catch (err) {
    console.error('[analise-creditos/upload]', err.message);
    return res.status(500).json({ erro: err.message });
  }
});

// ─────────────────────────────────────────────
// POST /api/analise-creditos/manual
// Envio de notas via JSON (digitação manual / frontend)
// ─────────────────────────────────────────────
router.post('/manual', async (req, res) => {
  try {
    const { notas, perfilCliente } = req.body;

    if (!notas || !Array.isArray(notas) || notas.length === 0) {
      return res.status(400).json({ erro: 'Envie um array "notas" com ao menos uma nota' });
    }

    if (!perfilCliente || !perfilCliente.regime) {
      return res.status(400).json({ erro: 'Perfil do cliente com "regime" é obrigatório' });
    }

    const resultado = await analisarCreditos(notas, perfilCliente);

    return res.json({ sucesso: true, totalNotas: notas.length, resultado });

  } catch (err) {
    console.error('[analise-creditos/manual]', err.message);
    return res.status(500).json({ erro: err.message });
  }
});

// ─────────────────────────────────────────────
// GET /api/analise-creditos/cfops
// Retorna lista de CFOPs mapeados (útil para o frontend)
// ─────────────────────────────────────────────
router.get('/cfops', (req, res) => {
  const { CFOP_CREDITO_PERMITIDO, CFOP_ATIVO_IMOBILIZADO, ALIQUOTAS } = require('../services/motorCreditos/pisCofins');
  const { CFOP_ICMS_PERMITIDO } = require('../services/motorCreditos/icms');

  res.json({
    pisCofins: {
      permitidos:     CFOP_CREDITO_PERMITIDO,
      ativoImob:      CFOP_ATIVO_IMOBILIZADO,
      aliquotas:      ALIQUOTAS,
    },
    icms: {
      permitidos:     CFOP_ICMS_PERMITIDO,
    },
  });
});

module.exports = router;
