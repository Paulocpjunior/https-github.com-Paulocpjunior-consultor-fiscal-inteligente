
import { LucroPresumidoEmpresa, FichaFinanceiraRegistro } from '../types';

const STORAGE_KEY_LUCRO_EMPRESAS = 'lucro_presumido_empresas';

// Robust UUID generator fallback
const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

export const getEmpresas = (): LucroPresumidoEmpresa[] => {
    try {
        const data = localStorage.getItem(STORAGE_KEY_LUCRO_EMPRESAS);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error('Erro ao carregar empresas do Lucro Presumido', e);
        return [];
    }
};

export const getEmpresaById = (id: string): LucroPresumidoEmpresa | undefined => {
    const empresas = getEmpresas();
    return empresas.find(e => e.id === id);
};

export const saveEmpresa = (empresa: Omit<LucroPresumidoEmpresa, 'id' | 'fichaFinanceira'>): LucroPresumidoEmpresa => {
    const empresas = getEmpresas();
    
    const newEmpresa: LucroPresumidoEmpresa = {
        ...empresa,
        id: generateUUID(),
        fichaFinanceira: []
    };
    
    empresas.push(newEmpresa);
    localStorage.setItem(STORAGE_KEY_LUCRO_EMPRESAS, JSON.stringify(empresas));
    return newEmpresa;
};

export const updateEmpresa = (id: string, data: Partial<LucroPresumidoEmpresa>): LucroPresumidoEmpresa | null => {
    const empresas = getEmpresas();
    const index = empresas.findIndex(e => e.id === id);
    if (index === -1) return null;

    const updated = { ...empresas[index], ...data };
    empresas[index] = updated;
    localStorage.setItem(STORAGE_KEY_LUCRO_EMPRESAS, JSON.stringify(empresas));
    return updated;
};

export const deleteEmpresa = (id: string): boolean => {
    const empresas = getEmpresas();
    const filtered = empresas.filter(e => e.id !== id);
    if (filtered.length === empresas.length) return false;
    
    localStorage.setItem(STORAGE_KEY_LUCRO_EMPRESAS, JSON.stringify(filtered));
    return true;
};

export const addFichaFinanceira = (empresaId: string, registro: Omit<FichaFinanceiraRegistro, 'id' | 'dataRegistro'>): LucroPresumidoEmpresa | null => {
    const empresas = getEmpresas();
    const index = empresas.findIndex(e => e.id === empresaId);
    if (index === -1) return null;

    const empresa = empresas[index];
    const novoRegistro: FichaFinanceiraRegistro = {
        ...registro,
        id: generateUUID(),
        dataRegistro: Date.now()
    };

    // Remove registro existente para o mesmo mês (substituição)
    const fichaAtual = empresa.fichaFinanceira ? empresa.fichaFinanceira.filter(f => f.mesReferencia !== registro.mesReferencia) : [];
    
    const empresaAtualizada = { ...empresa, fichaFinanceira: [novoRegistro, ...fichaAtual] };
    empresas[index] = empresaAtualizada;
    
    localStorage.setItem(STORAGE_KEY_LUCRO_EMPRESAS, JSON.stringify(empresas));
    
    return empresaAtualizada;
};
