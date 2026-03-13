import { CnpjData } from '../types';

const normalizeFromBrasilAPI = (data: any): CnpjData => ({
    razaoSocial: data.razao_social,
    nomeFantasia: data.nome_fantasia || '',
    cnaePrincipal: { codigo: String(data.cnae_fiscal), descricao: data.cnae_fiscal_descricao },
    cnaesSecundarios: (data.cnaes_secundarios || []).map((c: any) => ({ codigo: String(c.codigo), descricao: c.descricao })),
    logradouro: data.logradouro, numero: data.numero,
    bairro: data.bairro, municipio: data.municipio, uf: data.uf, cep: data.cep,
});

const normalizeFromCnpjWs = (data: any): CnpjData => {
    const est = data.estabelecimento || {};
    return {
        razaoSocial: data.razao_social,
        nomeFantasia: est.nome_fantasia || '',
        cnaePrincipal: { codigo: String(est.cnae_fiscal || ''), descricao: est.cnae_fiscal_descricao || '' },
        cnaesSecundarios: (est.cnaes_secundarios || []).map((c: any) => ({ codigo: String(c.codigo), descricao: c.descricao })),
        logradouro: est.logradouro, numero: est.numero,
        bairro: est.bairro, municipio: est.cidade?.nome || '', uf: est.estado?.sigla || '', cep: est.cep,
    };
};

export const fetchCnpjFromBrasilAPI = async (cnpj: string): Promise<CnpjData> => {
    const cleanCnpj = cnpj.replace(/\D/g, '');

    if (cleanCnpj.length !== 14) {
        throw new Error('CNPJ deve conter 14 dígitos.');
    }

    // Tenta BrasilAPI primeiro, fallback para CNPJ.ws
    const sources = [
        { url: `https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`, normalize: normalizeFromBrasilAPI },
        { url: `https://publica.cnpj.ws/cnpj/${cleanCnpj}`, normalize: normalizeFromCnpjWs },
    ];

    for (const source of sources) {
        try {
            const response = await fetch(source.url, { signal: AbortSignal.timeout(15000) });

            if (response.status === 404) throw new Error('CNPJ não encontrado na base de dados da Receita Federal.');
            if (response.status === 429) throw new Error('Muitas requisições. Tente novamente em alguns instantes.');
            if (!response.ok) continue; // tenta próxima fonte

            const data = await response.json();
            return source.normalize(data);

        } catch (error: any) {
            if (error.message.includes('não encontrado') || error.message.includes('Muitas requisições')) throw error;
            console.warn(`Falha em ${source.url}:`, error.message);
        }
    }

    throw new Error('Erro de conexão com os serviços de consulta CNPJ. Verifique sua internet e tente novamente.');
};
