import express    from 'express';
import multer     from 'multer';
import { analisarCreditos }     from '../services/motorCreditos/index.js';
import { parseExcel, parseCsv } from '../services/parsers/excelParser.js';
import { parseXmlNfe }          from '../services/parsers/xmlNfeParser.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const extPermitida = /\.(xlsx|xls|csv|xml)$/i.test(file.originalname);
    extPermitida ? cb(null, true) : cb(new Error('Use .xlsx, .csv ou .xml'));
  },
});

// POST /api/analise-creditos/upload
router.post('/upload', upload.single('arquivo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado' });

    let perfilCliente;
    try { perfilCliente = JSON.parse(req.body.perfil || '{}'); }
    catch { return res.status(400).json({ erro: 'Perfil inválido — envie JSON no campo "perfil"' }); }

    if (!perfilCliente.regime) return res.status(400).json({ erro: '"regime" obrigatório (LUCRO_REAL | LUCRO_PRESUMIDO | SIMPLES)' });

    const nome = req.file.originalname.toLowerCase();
    let parsed;
    if (nome.endsWith('.xml'))       parsed = await parseXmlNfe(req.file.buffer);
    else if (nome.endsWith('.csv'))  parsed = parseCsv(req.file.buffer);
    else                             parsed = parseExcel(req.file.buffer);

    if (!parsed.notas?.length) return res.status(422).json({ erro: 'Nenhuma nota encontrada no arquivo' });

    const resultado = await analisarCreditos(parsed.notas, perfilCliente);
    return res.json({ sucesso: true, arquivo: req.file.originalname, totalNotas: parsed.totalLinhas, resultado });
  } catch (err) {
    console.error('[analise-creditos/upload]', err.message);
    return res.status(500).json({ erro: err.message });
  }
});

// POST /api/analise-creditos/manual
router.post('/manual', async (req, res) => {
  try {
    const { notas, perfilCliente } = req.body;
    if (!notas?.length)           return res.status(400).json({ erro: 'Envie um array "notas"' });
    if (!perfilCliente?.regime)   return res.status(400).json({ erro: 'Perfil com "regime" obrigatório' });

    const resultado = await analisarCreditos(notas, perfilCliente);
    return res.json({ sucesso: true, totalNotas: notas.length, resultado });
  } catch (err) {
    console.error('[analise-creditos/manual]', err.message);
    return res.status(500).json({ erro: err.message });
  }
});

// GET /api/analise-creditos/cfops
router.get('/cfops', async (req, res) => {
  const { CFOP_CREDITO_PERMITIDO, CFOP_ATIVO_IMOBILIZADO, ALIQUOTAS } = await import('../services/motorCreditos/pisCofins.js');
  const { CFOP_ICMS_PERMITIDO } = await import('../services/motorCreditos/icms.js');
  res.json({ pisCofins: { permitidos: CFOP_CREDITO_PERMITIDO, ativoImob: CFOP_ATIVO_IMOBILIZADO, aliquotas: ALIQUOTAS }, icms: { permitidos: CFOP_ICMS_PERMITIDO } });
});

export default router;
