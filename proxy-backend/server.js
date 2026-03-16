import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { GoogleGenAI } from '@google/genai';
import https from 'https';
import http from 'http';
import forge from 'node-forge';
import { XMLParser } from 'fast-xml-parser';

const app = express();
const PORT = process.env.PORT || 8080;

// ─── Segurança ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(express.json({ limit: '50mb' })); // Limita payload

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
// ─── NFP: Validar Certificado A1 ─────────────────────────────────────────────
app.post('/api/nfp/validar-certificado', async (req, res) => {
    const { certificateBase64, senha } = req.body;
    if (!certificateBase64 || !senha) {
        return res.status(400).json({ error: 'certificateBase64 e senha sao obrigatorios' });
    }
    try {
        const cleanBase64 = certificateBase64.replace(/[\r\n\s]/g, '');
        console.log('base64 length:', cleanBase64.length, 'first 20:', cleanBase64.substring(0,20));
        const p12Buffer = Buffer.from(cleanBase64, 'base64');
        console.log('buffer size:', p12Buffer.length);
        // Usar string binaria diretamente - metodo mais compativel
        let binaryStr = '';
        for (let i = 0; i < p12Buffer.length; i++) {
            binaryStr += String.fromCharCode(p12Buffer[i]);
        }
        const p12Asn1 = forge.asn1.fromDer(binaryStr);
        const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, senha);
        let cert = null;
        for (const sc of p12.safeContents) {
            for (const sb of sc.safeBags) {
                if (sb.type === forge.pki.oids.certBag && sb.cert) {
                    cert = sb.cert; break;
                }
            }
            if (cert) break;
        }
        if (!cert) return res.status(400).json({ error: 'Certificado X.509 nao encontrado no PFX' });

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
        res.json({
            valido: !expirado,
            cnpj: cnpj || 'Nao identificado',
            razaoSocial,
            validade: validade.toISOString(),
            expirado,
            mensagem: expirado ? 'Certificado vencido em ' + validade.toLocaleDateString('pt-BR') : 'Certificado valido'
        });
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Erro desconhecido';
        const isSenha = msg.toLowerCase().includes('mac') || msg.toLowerCase().includes('invalid');
        res.status(400).json({ error: isSenha ? 'Senha incorreta ou arquivo corrompido' : msg });
    }
});

// ─── Helper: criar agente HTTPS com certificado A1 ───────────────────────────
function criarAgenteComCertificado(certificateBase64, senha) {
    const cleanBase64b = certificateBase64.replace(/[\r\n\s]/g, '');
    const p12Buffer = Buffer.from(cleanBase64b, 'base64');
    const p12Der = forge.util.createBuffer(p12Buffer.toString('binary'));
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, senha);

    let certPem = null, keyPem = null;
    for (const sc of p12.safeContents) {
        for (const sb of sc.safeBags) {
            if (sb.type === forge.pki.oids.certBag && sb.cert && !certPem) {
                certPem = forge.pki.certificateToPem(sb.cert);
            }
            if (sb.type === forge.pki.oids.pkcs8ShroudedKeyBag && sb.key && !keyPem) {
                keyPem = forge.pki.privateKeyToPem(sb.key);
            }
        }
    }
    if (!certPem || !keyPem) throw new Error('Nao foi possivel extrair certificado/chave do PFX');

    return new https.Agent({ cert: certPem, key: keyPem, rejectUnauthorized: false });
}

// ─── Helper: requisicao HTTPS com certificado ─────────────────────────────────
function httpsRequest(options, body) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, data, headers: res.headers }));
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

// ─── NFP SP Capital: Consulta via portal ─────────────────────────────────────
app.post('/api/nfp/consultar-sp', async (req, res) => {
    const { cnpj, im, periodo, certificateBase64, senha } = req.body;
    if (!cnpj || !periodo || !certificateBase64 || !senha) {
        return res.status(400).json({ error: 'Campos obrigatorios: cnpj, periodo, certificateBase64, senha' });
    }

    try {
        const agente = criarAgenteComCertificado(certificateBase64, senha);
        const cnpjLimpo = cnpj.replace(/\D/g, '');
        const [mes, ano] = periodo.split('/');

        // Endpoint real do portal SP - NFS-e Paulistana
        // Consulta notas prestadas
        const xmlPrestadas = `<?xml version="1.0" encoding="UTF-8"?>
<ConsultarNfseServicoPrestadoEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">
  <Prestador>
    <CpfCnpj><Cnpj>${cnpjLimpo}</Cnpj></CpfCnpj>
    <InscricaoMunicipal>${im || ''}</InscricaoMunicipal>
  </Prestador>
  <PeriodoEmissao>
    <DataInicial>${ano}-${mes}-01</DataInicial>
    <DataFinal>${ano}-${mes}-${new Date(parseInt(ano), parseInt(mes), 0).getDate()}</DataFinal>
  </PeriodoEmissao>
</ConsultarNfseServicoPrestadoEnvio>`;

        const soapPrestadas = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:nfse="http://nfe.prefeitura.sp.gov.br/">
  <soapenv:Header/>
  <soapenv:Body>
    <nfse:ConsultaNFe>
      <mensagemXml><![CDATA[${xmlPrestadas}]]></mensagemXml>
    </nfse:ConsultaNFe>
  </soapenv:Body>
</soapenv:Envelope>`;

        const optsPrestadas = {
            hostname: 'nfe.prefeitura.sp.gov.br',
            path: '/ws/lotenfe.asmx',
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml;charset=UTF-8',
                'SOAPAction': 'http://nfe.prefeitura.sp.gov.br/ConsultaNFe',
                'Content-Length': Buffer.byteLength(soapPrestadas)
            },
            agent: agente
        };

        let prestadas = { notas: 0, valor: '0.00', iss: '0.00', creditos: '0.00', semTomador: 0, lista: [] };
        let tomadas = { notas: 0, valor: '0.00', lista: [] };

        try {
            const respPrestadas = await httpsRequest(optsPrestadas, soapPrestadas);
            const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
            const parsed = parser.parse(respPrestadas.data);

            // Extrair notas do XML de resposta
            const nfseList = parsed?.Envelope?.Body?.ConsultaNFeResponse?.outputXml?.ListaNfse?.CompNfse || [];
            const lista = Array.isArray(nfseList) ? nfseList : (nfseList ? [nfseList] : []);

            let valorTotal = 0, issTotal = 0, creditoTotal = 0, semTomador = 0;
            const notasDetalhadas = [];

            for (const comp of lista) {
                const nfse = comp?.Nfse?.InfNfse;
                if (!nfse) continue;
                const valor = parseFloat(nfse?.Servico?.Valores?.ValorServicos || '0');
                const iss = parseFloat(nfse?.Servico?.Valores?.ValorIss || '0');
                const credito = parseFloat(nfse?.Servico?.Valores?.ValorCreditoSocial || '0');
                const tomador = nfse?.TomadorServico?.RazaoSocial || nfse?.TomadorServico?.NomeFantasia || '';

                valorTotal += valor;
                issTotal += iss;
                creditoTotal += credito;
                if (!tomador || tomador.trim() === '') semTomador++;

                notasDetalhadas.push({
                    numero: nfse?.Numero || '',
                    dataEmissao: nfse?.DataEmissao || '',
                    tomador: tomador || 'NAO IDENTIFICADO',
                    valor: valor.toFixed(2),
                    iss: iss.toFixed(2),
                    discriminacao: nfse?.Servico?.Discriminacao || ''
                });
            }

            prestadas = {
                notas: lista.length,
                valor: valorTotal.toFixed(2),
                iss: issTotal.toFixed(2),
                creditos: creditoTotal.toFixed(2),
                semTomador,
                lista: notasDetalhadas
            };
        } catch (errSP) {
            console.error('Erro ao consultar SP:', errSP.message);
        }

        res.json({
            cnpj: cnpjLimpo,
            im: im || '',
            periodo,
            prestados: prestadas,
            tomados: tomadas,
            fonte: 'SP_CAPITAL',
            status: 'sucesso'
        });

    } catch (e) {
        console.error('Erro NFP SP:', e);
        res.status(500).json({ error: e instanceof Error ? e.message : 'Erro ao consultar portal SP' });
    }
});

// ─── NFP Nacional: Consulta via nfse.gov.br (ABRASF) ─────────────────────────
app.post('/api/nfp/consultar-nacional', async (req, res) => {
    const { cnpj, periodo, certificateBase64, senha } = req.body;
    if (!cnpj || !periodo || !certificateBase64 || !senha) {
        return res.status(400).json({ error: 'Campos obrigatorios: cnpj, periodo, certificateBase64, senha' });
    }

    try {
        const agente = criarAgenteComCertificado(certificateBase64, senha);
        const cnpjLimpo = cnpj.replace(/\D/g, '');
        const [mes, ano] = periodo.split('/');
        const ultimoDia = new Date(parseInt(ano), parseInt(mes), 0).getDate();

        const soapConsulta = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:nfse="http://nfse.gov.br/">
  <soapenv:Header/>
  <soapenv:Body>
    <nfse:ConsultarNfseServicoPrestado>
      <nfse:cabecalho versao="1.00">
        <nfse:versaoDados>1.00</nfse:versaoDados>
      </nfse:cabecalho>
      <nfse:dados>
        <ConsultarNfseServicoPrestadoEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">
          <Prestador>
            <CpfCnpj><Cnpj>${cnpjLimpo}</Cnpj></CpfCnpj>
          </Prestador>
          <PeriodoEmissao>
            <DataInicial>${ano}-${mes}-01</DataInicial>
            <DataFinal>${ano}-${mes}-${ultimoDia}</DataFinal>
          </PeriodoEmissao>
        </ConsultarNfseServicoPrestadoEnvio>
      </nfse:dados>
    </nfse:ConsultarNfseServicoPrestado>
  </soapenv:Body>
</soapenv:Envelope>`;

        const opts = {
            hostname: 'nfse.gov.br',
            path: '/services/nfse',
            method: 'POST',
            headers: {
                'Content-Type': 'text/xml;charset=UTF-8',
                'SOAPAction': 'ConsultarNfseServicoPrestado',
                'Content-Length': Buffer.byteLength(soapConsulta)
            },
            agent: agente
        };

        let prestadas = { notas: 0, valor: '0.00', iss: '0.00', creditos: '0.00', semTomador: 0, lista: [] };

        try {
            const resp = await httpsRequest(opts, soapConsulta);
            const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
            const parsed = parser.parse(resp.data);

            const nfseList = parsed?.Envelope?.Body?.ConsultarNfseServicoPrestadoResponse?.outputXml?.ListaNfse?.CompNfse || [];
            const lista = Array.isArray(nfseList) ? nfseList : (nfseList ? [nfseList] : []);

            let valorTotal = 0, issTotal = 0, semTomador = 0;
            const notasDetalhadas = [];

            for (const comp of lista) {
                const nfse = comp?.Nfse?.InfNfse;
                if (!nfse) continue;
                const valor = parseFloat(nfse?.Servico?.Valores?.ValorServicos || '0');
                const iss = parseFloat(nfse?.Servico?.Valores?.ValorIss || '0');
                const tomador = nfse?.TomadorServico?.RazaoSocial || '';
                valorTotal += valor;
                issTotal += iss;
                if (!tomador.trim()) semTomador++;
                notasDetalhadas.push({
                    numero: nfse?.Numero || '',
                    dataEmissao: nfse?.DataEmissao || '',
                    municipio: nfse?.OrgaoGerador?.CodigoMunicipio || '',
                    tomador: tomador || 'NAO IDENTIFICADO',
                    valor: valor.toFixed(2),
                    iss: iss.toFixed(2),
                    discriminacao: nfse?.Servico?.Discriminacao || ''
                });
            }

            prestadas = { notas: lista.length, valor: valorTotal.toFixed(2), iss: issTotal.toFixed(2), creditos: '0.00', semTomador, lista: notasDetalhadas };
        } catch (errNac) {
            console.error('Erro portal nacional:', errNac.message);
        }

        res.json({
            cnpj: cnpjLimpo,
            periodo,
            prestados: prestadas,
            fonte: 'NACIONAL',
            status: 'sucesso'
        });

    } catch (e) {
        res.status(500).json({ error: e instanceof Error ? e.message : 'Erro ao consultar portal nacional' });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Proxy Gemini rodando na porta ${PORT}`);
    console.log(`   CORS permitido para: ${ALLOWED_ORIGINS.join(', ') || 'todos (desenvolvimento)'}`);
});
