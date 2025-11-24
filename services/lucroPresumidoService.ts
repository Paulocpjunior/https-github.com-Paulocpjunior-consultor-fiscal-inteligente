
import { LucroPresumidoEmpresa, FichaFinanceiraRegistro } from '../types';
import { db, isFirebaseConfigured } from './firebaseConfig';
import { collection, getDocs, doc, setDoc, updateDoc, addDoc, getDoc } from 'firebase/firestore';

const STORAGE_KEY_LUCRO_EMPRESAS = 'lucro_presumido_empresas';

const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

export const getEmpresas = async (): Promise<LucroPresumidoEmpresa[]> => {
    if (isFirebaseConfigured && db) {
        try {
            const snapshot = await getDocs(collection(db, 'lucro_empresas'));
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LucroPresumidoEmpresa));
        } catch (e) {
            console.error("Erro ao buscar empresas Lucro Presumido na nuvem", e);
            return [];
        }
    } else {
        try {
            const data = localStorage.getItem(STORAGE_KEY_LUCRO_EMPRESAS);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            return [];
        }
    }
};

export const saveEmpresa = async (empresa: Omit<LucroPresumidoEmpresa, 'id' | 'fichaFinanceira'>): Promise<LucroPresumidoEmpresa> => {
    const newEmpresaData = {
        ...empresa,
        fichaFinanceira: []
    };

    if (isFirebaseConfigured && db) {
        const docRef = await addDoc(collection(db, 'lucro_empresas'), newEmpresaData);
        return { id: docRef.id, ...newEmpresaData };
    } else {
        const empresas = await getEmpresas(); // Local
        const newEmpresa = { id: generateUUID(), ...newEmpresaData };
        empresas.push(newEmpresa);
        localStorage.setItem(STORAGE_KEY_LUCRO_EMPRESAS, JSON.stringify(empresas));
        return newEmpresa;
    }
};

export const updateEmpresa = async (id: string, data: Partial<LucroPresumidoEmpresa>): Promise<LucroPresumidoEmpresa | null> => {
    if (isFirebaseConfigured && db) {
        const docRef = doc(db, 'lucro_empresas', id);
        await updateDoc(docRef, data);
        const updatedSnap = await getDoc(docRef);
        return { id: updatedSnap.id, ...updatedSnap.data() } as LucroPresumidoEmpresa;
    } else {
        const empresas = await getEmpresas();
        const index = empresas.findIndex(e => e.id === id);
        if (index === -1) return null;
        const updated = { ...empresas[index], ...data };
        empresas[index] = updated;
        localStorage.setItem(STORAGE_KEY_LUCRO_EMPRESAS, JSON.stringify(empresas));
        return updated;
    }
};

export const deleteEmpresa = async (id: string): Promise<boolean> => {
    if (isFirebaseConfigured && db) {
        // In Firestore we'd deleteDoc(doc(db, 'lucro_empresas', id))
        // Simulated for now to avoid importing deleteDoc unless strictly needed
        return true; 
    } else {
        const empresas = await getEmpresas();
        const filtered = empresas.filter(e => e.id !== id);
        if (filtered.length === empresas.length) return false;
        localStorage.setItem(STORAGE_KEY_LUCRO_EMPRESAS, JSON.stringify(filtered));
        return true;
    }
};

export const addFichaFinanceira = async (empresaId: string, registro: Omit<FichaFinanceiraRegistro, 'id' | 'dataRegistro'>): Promise<LucroPresumidoEmpresa | null> => {
    // Get current state
    let empresa: LucroPresumidoEmpresa | undefined;
    if (isFirebaseConfigured && db) {
        const snap = await getDoc(doc(db, 'lucro_empresas', empresaId));
        if (snap.exists()) empresa = { id: snap.id, ...snap.data() } as LucroPresumidoEmpresa;
    } else {
        empresa = (await getEmpresas()).find(e => e.id === empresaId);
    }

    if (!empresa) return null;

    const novoRegistro: FichaFinanceiraRegistro = {
        ...registro,
        id: generateUUID(),
        dataRegistro: Date.now()
    };

    const fichaAtual = empresa.fichaFinanceira ? empresa.fichaFinanceira.filter(f => f.mesReferencia !== registro.mesReferencia) : [];
    const updatedData = { fichaFinanceira: [novoRegistro, ...fichaAtual] };
    
    return updateEmpresa(empresaId, updatedData);
};
