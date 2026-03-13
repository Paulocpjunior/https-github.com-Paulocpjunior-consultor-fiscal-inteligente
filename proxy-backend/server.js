import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { GoogleGenAI } from '@google/genai';

const app = express();
const PORT = process.env.PORT || 8080;

// ─── Segurança ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(express.json({ limit: '10kb' })); // Limita payload

// CORS: aceita apenas o domínio do seu frontend no Cloud Run
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        // Permite chamadas sem origin (server-to-server) e origins permitidas
        if (!origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`CORS bloqueado para origin: ${origin}`));
        }
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
}));

// Rate limiting: 60 req/min por IP
const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas requisições. Aguarde um momento.' },
});
app.use('/api/', limiter);

// ─── Gemini Client (chave fica APENAS no servidor) ───────────────────────────
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY não configurada!');
    process.exit(1);
}
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Proxy endpoint: Consulta Fiscal ─────────────────────────────────────────
app.post('/api/fiscal/query', async (req, res) => {
    const { prompt, model = 'gemini-2.0-flash' } = req.body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        return res.status(400).json({ error: 'Campo "prompt" é obrigatório.' });
    }

    if (prompt.length > 4000) {
        return res.status(400).json({ error: 'Prompt muito longo (máx 4000 chars).' });
    }

    try {
        const response = await ai.models.generateContent({
            model,
            contents: prompt,
        });

        const text = response.text ?? '';
        return res.json({ text });
    } catch (err) {
        console.error('Erro Gemini:', err?.message);

        const status = err?.status || 500;
        const message = err?.message || 'Erro ao comunicar com a IA.';

        return res.status(status >= 400 && status < 600 ? status : 500).json({ error: message });
    }
});

// ─── Proxy endpoint: Comparação ───────────────────────────────────────────────
app.post('/api/fiscal/compare', async (req, res) => {
    const { prompt, model = 'gemini-2.0-flash' } = req.body;

    if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Campo "prompt" é obrigatório.' });
    }

    try {
        const response = await ai.models.generateContent({
            model,
            contents: prompt,
        });

        return res.json({ text: response.text ?? '' });
    } catch (err) {
        console.error('Erro Gemini (compare):', err?.message);
        return res.status(500).json({ error: err?.message || 'Erro interno.' });
    }
});

// ─── Proxy endpoint: Serviços similares ──────────────────────────────────────
app.post('/api/fiscal/similar', async (req, res) => {
    const { prompt, model = 'gemini-2.0-flash' } = req.body;

    if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Campo "prompt" é obrigatório.' });
    }

    try {
        const response = await ai.models.generateContent({
            model,
            contents: prompt,
        });

        return res.json({ text: response.text ?? '' });
    } catch (err) {
        console.error('Erro Gemini (similar):', err?.message);
        return res.status(500).json({ error: err?.message || 'Erro interno.' });
    }
});

// ─── Proxy endpoint: Consulta CNPJ ───────────────────────────────────────────
app.get('/api/cnpj/:cnpj', async (req, res) => {
    const cnpj = req.params.cnpj.replace(/\D/g, '');

    if (cnpj.length !== 14) {
        return res.status(400).json({ error: 'CNPJ deve conter 14 dígitos.' });
    }

    const apis = [
        `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
        `https://publica.cnpj.ws/cnpj/${cnpj}`,
    ];

    for (const url of apis) {
        try {
            const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
            if (!response.ok) continue;
            const data = await response.json();

            if (url.includes('brasilapi')) {
                return res.json({
                    razaoSocial: data.razao_social,
                    nomeFantasia: data.nome_fantasia || '',
                    cnaePrincipal: { codigo: String(data.cnae_fiscal), descricao: data.cnae_fiscal_descricao },
                    cnaesSecundarios: (data.cnaes_secundarios || []).map(c => ({ codigo: String(c.codigo), descricao: c.descricao })),
                    logradouro: data.logradouro, numero: data.numero,
                    bairro: data.bairro, municipio: data.municipio,
                    uf: data.uf, cep: data.cep,
                });
            } else {
                const est = data.estabelecimento || {};
                return res.json({
                    razaoSocial: data.razao_social,
                    nomeFantasia: est.nome_fantasia || '',
                    cnaePrincipal: { codigo: String(est.cnae_fiscal || ''), descricao: est.cnae_fiscal_descricao || '' },
                    cnaesSecundarios: (est.cnaes_secundarios || []).map(c => ({ codigo: String(c.codigo), descricao: c.descricao })),
                    logradouro: est.logradouro, numero: est.numero,
                    bairro: est.bairro, municipio: est.cidade?.nome || '',
                    uf: est.estado?.sigla || '', cep: est.cep,
                });
            }
        } catch (err) {
            console.warn(`Falha CNPJ em ${url}:`, err?.message);
        }
    }

    return res.status(502).json({ error: 'Não foi possível consultar o CNPJ. Tente novamente.' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`✅ Proxy Gemini rodando na porta ${PORT}`);
    console.log(`   CORS permitido para: ${ALLOWED_ORIGINS.join(', ') || 'todos (desenvolvimento)'}`);
});
