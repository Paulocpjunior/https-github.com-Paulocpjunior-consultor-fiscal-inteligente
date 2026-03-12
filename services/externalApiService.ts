
import { CnpjData } from '../types';

const parseBrasilAPIResponse = (data: any): CnpjData => ({
    razaoSocial: data.razao_social,
    nomeFantasia: data.nome_fantasia || '',
    cnaePrincipal: {
        codigo: String(data.cnae_fiscal),
        descricao: data.cnae_fiscal_descricao
    },
    cnaesSecundarios: data.cnaes_secundarios?.map((c: any) => ({
        codigo: String(c.codigo),
        descricao: c.descricao
    })) || [],
    logradouro: data.logradouro,
    numero: data.numero,
    bairro: data.bairro,
    municipio: data.municipio,
    uf: data.uf,
    cep: data.cep
});

const parseReceitaWSResponse = (data: any): CnpjData => ({
    razaoSocial: data.nome || '',
    nomeFantasia: data.fantasia || '',
    cnaePrincipal: {
        codigo: String(data.atividade_principal?.[0]?.code || '').replace(/[.\-/]/g, ''),
        descricao: data.atividade_principal?.[0]?.text || ''
    },
    cnaesSecundarios: (data.atividades_secundarias || []).map((c: any) => ({
        codigo: String(c.code || '').replace(/[.\-/]/g, ''),
        descricao: c.text || ''
    })),
    logradouro: data.logradouro,
    numero: data.numero,
    bairro: data.bairro,
    municipio: data.municipio,
    uf: data.uf,
    cep: data.cep
});

const fetchFromBrasilAPI = async (cleanCnpj: string): Promise<CnpjData> => {
    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);

    if (!response.ok) {
        if (response.status === 404) {
            throw new Error('CNPJ não encontrado na base de dados da Receita Federal.');
        }
        if (response.status === 429) {
            throw new Error('Muitas requisições. Tente novamente em alguns instantes.');
        }
        throw new Error(`BrasilAPI retornou status ${response.status}`);
    }

    const data = await response.json();
    return parseBrasilAPIResponse(data);
};

const fetchFromReceitaWS = async (cleanCnpj: string): Promise<CnpjData> => {
    const response = await fetch(`https://receitaws.com.br/v1/cnpj/${cleanCnpj}`);

    if (!response.ok) {
        if (response.status === 404) {
            throw new Error('CNPJ não encontrado na base de dados da Receita Federal.');
        }
        if (response.status === 429) {
            throw new Error('Muitas requisições. Tente novamente em alguns instantes.');
        }
        throw new Error(`ReceitaWS retornou status ${response.status}`);
    }

    const data = await response.json();

    if (data.status === 'ERROR') {
        throw new Error(data.message || 'Erro na consulta ReceitaWS.');
    }

    return parseReceitaWSResponse(data);
};

export const fetchCnpjFromBrasilAPI = async (cnpj: string): Promise<CnpjData> => {
    // Remove caracteres não numéricos
    const cleanCnpj = cnpj.replace(/\D/g, '');

    if (cleanCnpj.length !== 14) {
        throw new Error('CNPJ deve conter 14 dígitos.');
    }

    // Tenta BrasilAPI primeiro, depois ReceitaWS como fallback
    const apis = [
        { name: 'BrasilAPI', fn: () => fetchFromBrasilAPI(cleanCnpj) },
        { name: 'ReceitaWS', fn: () => fetchFromReceitaWS(cleanCnpj) },
    ];

    let lastError: any = null;

    for (const api of apis) {
        try {
            const result = await api.fn();
            return result;
        } catch (error: any) {
            console.warn(`${api.name} falhou:`, error.message);
            // Se o erro for "CNPJ não encontrado", não tenta o próximo (é definitivo)
            if (error.message?.includes('não encontrado')) {
                throw error;
            }
            lastError = error;
        }
    }

    // Se ambas falharam, retorna erro amigável
    const msg = lastError?.message || '';
    if (msg === 'Failed to fetch' || msg.includes('NetworkError') || msg.includes('fetch')) {
        throw new Error('Erro de conexão com os serviços de consulta CNPJ. Verifique sua internet e tente novamente.');
    }
    throw new Error(lastError?.message || 'Não foi possível consultar o CNPJ. Tente novamente.');
};
