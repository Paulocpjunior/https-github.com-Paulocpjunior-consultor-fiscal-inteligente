import { CnpjData } from '../types';

// Usa o backend como proxy para evitar CORS e proteger a origem das requisições
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';

export const fetchCnpjFromBrasilAPI = async (cnpj: string): Promise<CnpjData> => {
    const cleanCnpj = cnpj.replace(/\D/g, '');

    if (cleanCnpj.length !== 14) {
        throw new Error('CNPJ deve conter 14 dígitos.');
    }

    try {
        const response = await fetch(`${BACKEND_URL}/api/cnpj/${cleanCnpj}`, {
            signal: AbortSignal.timeout(20000),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            if (response.status === 404) throw new Error('CNPJ não encontrado na base de dados da Receita Federal.');
            if (response.status === 429) throw new Error('Muitas requisições. Tente novamente em alguns instantes.');
            throw new Error(err.error || 'Erro ao consultar o serviço de CNPJ.');
        }

        return await response.json() as CnpjData;

    } catch (error: any) {
        console.error('Erro na consulta de CNPJ:', error);
        if (error.message === 'Failed to fetch' || error.name === 'TimeoutError') {
            throw new Error('Erro de conexão com os serviços de consulta CNPJ. Verifique sua internet e tente novamente.');
        }
        throw error;
    }
};
