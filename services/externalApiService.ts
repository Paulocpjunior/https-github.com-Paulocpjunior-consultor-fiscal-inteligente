
import { CnpjData } from '../types';

export const fetchCnpjFromBrasilAPI = async (cnpj: string): Promise<CnpjData> => {
    // Remove caracteres não numéricos
    const cleanCnpj = cnpj.replace(/\D/g, '');
    
    if (cleanCnpj.length !== 14) {
        throw new Error('CNPJ deve conter 14 dígitos.');
    }

    try {
        // BrasilAPI é uma fonte confiável de dados públicos brasileiros
        const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
        
        if (!response.ok) {
            if (response.status === 404) {
                 throw new Error('CNPJ não encontrado na base de dados da Receita Federal.');
            }
            if (response.status === 429) {
                throw new Error('Muitas requisições. Tente novamente em alguns instantes.');
            }
            throw new Error('Erro ao consultar o serviço de CNPJ.');
        }

        const data = await response.json();
        
        return {
            razaoSocial: data.razao_social,
            nomeFantasia: data.nome_fantasia || '',
        };
    } catch (error: any) {
        console.error("Erro na consulta de CNPJ:", error);
        if (error.message === 'Failed to fetch') {
             throw new Error('Erro de conexão com a API da Receita. Verifique sua internet.');
        }
        throw error;
    }
};
