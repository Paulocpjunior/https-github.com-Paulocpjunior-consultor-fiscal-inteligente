import express from 'express';
import forge from 'node-forge';
import https from 'https';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { GoogleGenAI } from '@google/genai';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

// ─── Rota de Análise de Créditos Fiscais ─────────────────────────────────────
import analiseCreditosRouter from './routes/analise-creditos.js';

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 8080;

// ─── Segurança ────────────────────────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com", "https://*.firebaseapp.com", "https://apis.google.com", "https://aistudiocdn.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
            connectSrc: ["'self'", "https://*.googleapis.com", "https://*.firebaseio.com", "https://*.google.com", "https://brasilapi.com.br", "https://publica.cnpj.ws", "https://aistudiocdn.com", "https://www.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            fontSrc: ["'self'", "https:", "data:"],
            frameSrc: ["https://*.firebaseapp.com", "https://accounts.google.com", "https://apis.google.com"],
        },
    },
}));
app.use(express.json({ limit: '50mb' }));

// CORS
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`CORS bloqueado para origin: ${origin}`));
        }
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas requisições. Aguarde um momento.' },
});
app.use('/api/', limiter);

// ─── Gemini Client ────────────────────────────────────────────────────────────
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

// ─── Rotas: Análise de Créditos Fiscais ──────────────────────────────────────
app.use('/api/analise-creditos', analiseCreditosRouter);

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
        const response = await ai.models.generateContent({ model, contents: prompt });
        return res.json({ text: response.text ?? '' });
    } catch (err) {
        console.error('Erro Gemini:', err?.message);
        const status = err?.status || 500;
        return res.status(status >= 400 && status < 600 ? status : 500).json({ error: err?.message || 'Erro ao comunicar com a IA.' });
    }
});

// ─── Proxy endpoint: Comparação ───────────────────────────────────────────────
app.post('/api/fiscal/compare', async (req, res) => {
    const { prompt, model = 'gemini-2.0-flash' } = req.body;

    if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Campo "prompt" é obrigatório.' });
    }

    try {
        const response = await ai.models.generateContent({ model, contents: prompt });
        const text = response.text ?? '';
        return res.json({
            candidates: [{ content: { parts: [{ text }], role: 'model' }, finishReason: 'STOP', index: 0 }],
            text
        });
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
        const response = await ai.models.generateContent({ model, contents: prompt });
        const text = response.text ?? '';
        return res.json({
            candidates: [{ content: { parts: [{ text }], role: 'model' }, finishReason: 'STOP', index: 0 }],
            text
        });
    } catch (err) {
        console.error('Erro Gemini (similar):', err?.message);
        return res.status(500).json({ error: err?.message || 'Erro interno.' });
    }
});

// ─── Proxy genérico Gemini ────────────────────────────────────────────────────
app.post('/api/gemini/v1beta/models/:modelAndAction', async (req, res) => {
    const { model } = req.params;
    const body = req.body;
    const prompt = body?.contents?.[0]?.parts?.[0]?.text || body?.contents || '';

    try {
        const response = await ai.models.generateContent({ model: model || 'gemini-2.0-flash', contents: prompt });
        const text = response.text ?? '';
        return res.json({
            candidates: [{ content: { parts: [{ text }], role: 'model' }, finishReason: 'STOP', index: 0 }],
            text
        });
    } catch (err) {
        console.error('Erro Gemini (generic):', err?.message);
        return res.status(500).json({ error: err?.message || 'Erro interno.' });
    }
});

// ─── NFP: Validar Certificado A1 ─────────────────────────────────────────────
app.post('/api/nfp/validar-certificado', async (req, res) => {
    const { certificateBase64, senha } = req.body;
    if (!certificateBase64 || !senha) return res.status(400).json({ error: 'certificateBase64 e senha obrigatorios' });
    try {
        const cleanBase64 = certificateBase64.replace(/[^A-Za-z0-9+/=]/g, '');
        const p12Buffer = Buffer.from(cleanBase64, 'base64');
        let binaryStr = '';
        for (let i = 0; i < p12Buffer.length; i++) binaryStr += String.fromCharCode(p12Buffer[i]);
        const p12Asn1 = forge.asn1.fromDer(binaryStr);
        const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, senha);
        let cert = null;
        for (const sc of p12.safeContents) {
            for (const sb of sc.safeBags) {
                if (sb.type === forge.pki.oids.certBag && sb.cert) { cert = sb.cert; break; }
            }
            if (cert) break;
        }
        if (!cert) return res.status(400).json({ error: 'Certificado X.509 nao encontrado' });
        const cnAttr = cert.subject.getField('CN');
        const razaoSocial = cnAttr ? cnAttr.value : 'Nao identificado';
        const validade = cert.validity.notAfter;
        let cnpj = '';
        for (const attr of cert.subject.attributes) {
            const val = String(attr.value || '');
            const match = val.match(/\d{14}/);
            if (match) { cnpj = match[0]; break; }
        }
        const expirado = validade < new Date();
        res.json({ valido: !expirado, cnpj: cnpj || '', razaoSocial, validade: validade.toISOString(), expirado, mensagem: expirado ? 'Vencido' : 'Valido' });
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Erro';
        const isSenha = msg.toLowerCase().includes('mac') || msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('pattern');
        res.status(400).json({ error: isSenha ? 'Senha incorreta ou arquivo corrompido' : msg });
    }
});

// ─── NFP: Consultar SP Capital ────────────────────────────────────────────────
app.post('/api/nfp/consultar-sp', async (req, res) => {
    const { cnpj, im, periodo, certificateBase64, senha } = req.body;
    if (!cnpj || !periodo || !certificateBase64 || !senha) return res.status(400).json({ error: 'Campos obrigatorios: cnpj, periodo, certificateBase64, senha' });
    try {
        const cleanBase64 = certificateBase64.replace(/[^A-Za-z0-9+/=]/g, '');
        const p12Buffer = Buffer.from(cleanBase64, 'base64');
        let binaryStr = '';
        for (let i = 0; i < p12Buffer.length; i++) binaryStr += String.fromCharCode(p12Buffer[i]);
        const p12Asn1 = forge.asn1.fromDer(binaryStr);
        const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, senha);
        let certPem = null, keyPem = null;
        for (const sc of p12.safeContents) {
            for (const sb of sc.safeBags) {
                if (sb.type === forge.pki.oids.certBag && sb.cert && !certPem) certPem = forge.pki.certificateToPem(sb.cert);
                if (sb.type === forge.pki.oids.pkcs8ShroudedKeyBag && sb.key && !keyPem) keyPem = forge.pki.privateKeyToPem(sb.key);
            }
        }
        if (!certPem || !keyPem) return res.status(400).json({ error: 'Nao foi possivel extrair certificado/chave' });
        const cnpjLimpo = cnpj.replace(/\D/g, '');
        const [mes, ano] = periodo.split('/');
        const ultimoDia = new Date(parseInt(ano), parseInt(mes), 0).getDate();
        const agente = new https.Agent({ cert: certPem, key: keyPem, rejectUnauthorized: false });
        const soapBody = `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:nfse="http://nfe.prefeitura.sp.gov.br/"><soapenv:Header/><soapenv:Body><nfse:ConsultaNFe><mensagemXml><![CDATA[<?xml version="1.0" encoding="UTF-8"?><ConsultarNfseServicoPrestadoEnvio xmlns="http://www.abrasf.org.br/nfse.xsd"><Prestador><CpfCnpj><Cnpj>${cnpjLimpo}</Cnpj></CpfCnpj><InscricaoMunicipal>${im||''}</InscricaoMunicipal></Prestador><PeriodoEmissao><DataInicial>${ano}-${mes}-01</DataInicial><DataFinal>${ano}-${mes}-${ultimoDia}</DataFinal></PeriodoEmissao></ConsultarNfseServicoPrestadoEnvio>]]></mensagemXml></nfse:ConsultaNFe></soapenv:Body></soapenv:Envelope>`;
        const result = await new Promise((resolve, reject) => {
            const req2 = https.request({ hostname: 'www.nfse.gov.br', path: '/AbrasNfse/AbrasNfse.svc', method: 'POST', headers: { 'Content-Type': 'text/xml;charset=UTF-8', 'SOAPAction': 'ConsultarNfseServicoPrestado', 'Content-Length': Buffer.byteLength(soapBody) }, agent: agente }, (r) => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>resolve(d)); });
            req2.on('error', reject); req2.write(soapBody); req2.end();
        });
        const resultStr = String(result);
        console.log('SP Response length:', resultStr.length, 'preview:', resultStr.substring(0,500));
        const notasMatch = resultStr.match(/<Numero>(\d+)<\/Numero>/g) || [];
        const valoresMatch = String(result).match(/<ValorServicos>([\d.]+)<\/ValorServicos>/g) || [];
        const issMatch = String(result).match(/<ValorIss>([\d.]+)<\/ValorIss>/g) || [];
        const totalValor = valoresMatch.reduce((a,v)=>a+parseFloat(v.replace(/<\/?ValorServicos>/g,'')),0);
        const totalIss = issMatch.reduce((a,v)=>a+parseFloat(v.replace(/<\/?ValorIss>/g,'')),0);
        res.json({ cnpj: cnpjLimpo, im: im||'', periodo, prestados: { notas: notasMatch.length, valor: totalValor.toFixed(2), iss: totalIss.toFixed(2), creditos: (totalValor*0.02).toFixed(2), semTomador: 0, lista: [] }, tomados: { notas: 0, valor: '0.00' }, fonte: 'SP_CAPITAL_REAL', status: 'sucesso' });
    } catch (e) {
        console.error('Erro NFP SP:', e.message);
        res.status(500).json({ error: e instanceof Error ? e.message : 'Erro ao consultar portal SP' });
    }
});

// ─── Focus NFe: Consultar NFS-e ──────────────────────────────────────────────
const FOCUS_NFE_TOKEN = process.env.FOCUS_NFE_TOKEN || 'A08FSwJyqtWfDna3EbZroKvVTZLnfE5Y';
const FOCUS_NFE_BASE = 'https://homologacao.focusnfe.com.br/v2';

app.post('/api/nfp/consultar-focus', async (req, res) => {
    const { cnpj, periodo } = req.body;
    if (!cnpj || !periodo) return res.status(400).json({ error: 'cnpj e periodo obrigatorios' });

    try {
        const cnpjLimpo = cnpj.replace(/\D/g, '');
        const [mes, ano] = periodo.split('/');
        const dataInicio = `${ano}-${mes}-01`;
        const ultimoDia = new Date(parseInt(ano), parseInt(mes), 0).getDate();
        const dataFim = `${ano}-${mes}-${ultimoDia}`;
        const auth = Buffer.from(FOCUS_NFE_TOKEN + ':').toString('base64');

        const urlPrestadas = `${FOCUS_NFE_BASE}/nfse?cnpj_prestador=${cnpjLimpo}&data_emissao_inicial=${dataInicio}&data_emissao_final=${dataFim}&completo=1`;
        console.log('Focus NFe URL:', urlPrestadas);

        const respPrestadas = await fetch(urlPrestadas, {
            headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' }
        });

        const textPrestadas = await respPrestadas.text();
        console.log('Focus NFe status:', respPrestadas.status, 'preview:', textPrestadas.substring(0, 300));

        let prestadas = { notas: 0, valor: '0.00', iss: '0.00', creditos: '0.00', semTomador: 0, lista: [] };
        let tomadas = { notas: 0, valor: '0.00', lista: [] };

        if (respPrestadas.ok) {
            const dataPrestadas = JSON.parse(textPrestadas);
            const lista = Array.isArray(dataPrestadas) ? dataPrestadas : (dataPrestadas.nfse || []);
            let totalValor = 0, totalIss = 0, semTomador = 0;
            const notasList = [];
            for (const nfse of lista) {
                const valor = parseFloat(nfse.valor_servicos || nfse.valor_total || '0');
                const iss = parseFloat(nfse.valor_iss || nfse.valor_iss_retido || '0');
                const tomador = nfse.tomador_razao_social || nfse.tomador_nome || '';
                totalValor += valor;
                totalIss += iss;
                if (!tomador.trim()) semTomador++;
                notasList.push({
                    numero: nfse.numero || nfse.numero_nfse || '',
                    dataEmissao: nfse.data_emissao || '',
                    tomador: tomador || 'NAO IDENTIFICADO',
                    valor: valor.toFixed(2),
                    iss: iss.toFixed(2),
                    discriminacao: nfse.discriminacao || nfse.descricao_servico || '',
                    municipio: nfse.municipio_prestacao || 'SP',
                    status: nfse.status || ''
                });
            }
            prestadas = { notas: notasList.length, valor: totalValor.toFixed(2), iss: totalIss.toFixed(2), creditos: (totalValor * 0.02).toFixed(2), semTomador, lista: notasList };
        }

        const urlTomadas = `${FOCUS_NFE_BASE}/nfse?cnpj_tomador=${cnpjLimpo}&data_emissao_inicial=${dataInicio}&data_emissao_final=${dataFim}`;
        const respTomadas = await fetch(urlTomadas, {
            headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' }
        });
        if (respTomadas.ok) {
            const dataTomadas = JSON.parse(await respTomadas.text());
            const listaTomadas = Array.isArray(dataTomadas) ? dataTomadas : (dataTomadas.nfse || []);
            const totalTomado = listaTomadas.reduce((a, n) => a + parseFloat(n.valor_servicos || n.valor_total || '0'), 0);
            tomadas = { notas: listaTomadas.length, valor: totalTomado.toFixed(2) };
        }

        res.json({ cnpj: cnpjLimpo, periodo, prestados: prestadas, tomados: tomadas, fonte: 'FOCUS_NFE_REAL', status: 'sucesso' });
    } catch (e) {
        console.error('Erro Focus NFe:', e.message);
        res.status(500).json({ error: e instanceof Error ? e.message : 'Erro ao consultar Focus NFe' });
    }
});

// ─── Serve Frontend estático ──────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const distPath = join(__dirname, '../dist');
if (existsSync(distPath)) {
    const { default: serveStatic } = await import('serve-static');
    app.use(serveStatic(distPath));
    app.get('/{*path}', (_req, res) => res.sendFile(join(distPath, 'index.html')));
}

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
    console.log(`   CORS permitido para: ${ALLOWED_ORIGINS.join(', ') || 'todos (desenvolvimento)'}`);
});
