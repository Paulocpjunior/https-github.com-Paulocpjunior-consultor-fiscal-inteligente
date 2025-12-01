import { LucroPresumidoEmpresa, FichaFinanceiraRegistro, User } from '../types';
import { db, isFirebaseConfigured, auth } from './firebaseConfig';
import { collection, getDocs, doc, updateDoc, setDoc, addDoc, getDoc, query, where, deleteDoc } from 'firebase/firestore';

const STORAGE_KEY_LUCRO_EMPRESAS = 'lucro_presumido_empresas';
const MASTER_ADMIN_EMAIL = 'junior@spassessoriacontabil.com.br';

const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

// Helper to remove undefined values which Firestore dislikes
const sanitizePayload = (obj: any) => {
    return JSON.parse(JSON.stringify(obj));
};

const getLocalEmpresas = (): LucroPresumidoEmpresa[] => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY_LUCRO_EMPRESAS);
        return stored ? JSON.parse(stored) : [];
    } catch { return []; }
};

const saveLocalEmpresas = (empresas: LucroPresumidoEmpresa[]) => {
    localStorage.setItem(STORAGE_KEY_LUCRO_EMPRESAS, JSON.stringify(empresas));
};

export const getEmpresas = async (currentUser?: User | null): Promise<LucroPresumidoEmpresa[]> => {
    if (!currentUser) return [];
    let firebaseEmpresas: LucroPresumidoEmpresa[] = [];
    
    // Check master email case-insensitive
    const isMasterAdmin = currentUser.role === 'admin' || currentUser.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase();

    if (isFirebaseConfigured && db && auth?.currentUser) {
        try {
            let q;
            const uid = auth.currentUser.uid;
            
            if (isMasterAdmin) {
                q = collection(db, 'lucro_empresas');
            } else {
                q = query(collection(db, 'lucro_empresas'), where('createdBy', '==', uid));
            }
            const snapshot = await getDocs(q);
            firebaseEmpresas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LucroPresumidoEmpresa));
        } catch (e: any) {
            // Fallback silencioso
            if (e.code !== 'permission-denied' && e.code !== 'failed-precondition') {
                console.warn("Firestore Warning:", e.message);
            }
        }
    }

    const localEmpresas = getLocalEmpresas();
    let filteredLocal = localEmpresas;
    
    if (!isMasterAdmin) {
         // FIX: Include items created by this user OR legacy items without owner
        filteredLocal = localEmpresas.filter(e => e.createdBy === currentUser.id || !e.createdBy);
    }

    // Mescla Inteligente
    const empresaMap = new Map<string, LucroPresumidoEmpresa>();
    
    firebaseEmpresas.forEach(e => empresaMap.set(e.id, e));
    
    filteredLocal.forEach(e => {
        if (!empresaMap.has(e.id)) {
            empresaMap.set(e.id, e);
        }
    });

    return Array.from(empresaMap.values());
};

export const saveEmpresa = async (empresa: any, userId: string): Promise<LucroPresumidoEmpresa> => {
    const newEmpresaData = { 
        id: generateUUID(),
        ...empresa, 
        fichaFinanceira: [], 
        createdBy: userId 
    };

    // 1. Save Local
    const localEmpresas = getLocalEmpresas();
    localEmpresas.push(newEmpresaData);
    saveLocalEmpresas(localEmpresas);

    // 2. Try Firebase (Blindado com setDoc)
    if (isFirebaseConfigured && db && auth?.currentUser) {
        try {
            newEmpresaData.createdBy = auth.currentUser.uid;
            
            const payload = sanitizePayload(newEmpresaData);
            // Use setDoc para garantir que o ID gerado seja o usado como chave do documento
            await setDoc(doc(db, 'lucro_empresas', newEmpresaData.id), payload);
        } catch (e: any) { 
            if (e.code !== 'permission-denied') {
                console.warn("Erro ao salvar na nuvem:", e);
            }
        }
    }

    return newEmpresaData;
};

export const updateEmpresa = async (id: string, data: Partial<LucroPresumidoEmpresa>): Promise<LucroPresumidoEmpresa | null> => {
    const localEmpresas = getLocalEmpresas();
    const index = localEmpresas.findIndex(e => e.id === id);
    if (index !== -1) {
        localEmpresas[index] = { ...localEmpresas[index], ...data };
        saveLocalEmpresas(localEmpresas);
    }

    if (isFirebaseConfigured && db && auth?.currentUser) {
        try {
            const docRef = doc(db, 'lucro_empresas', id);
            
            // IMPORTANTE: Remove campos que as regras de segurança podem bloquear alteração (ownership)
            const { id: _, createdBy: __, ...safeData } = data as any;
            
            if (Object.keys(safeData).length > 0) {
                const payload = sanitizePayload(safeData);
                await updateDoc(docRef, payload);
            }
        } catch (e: any) { 
            if (e.code !== 'permission-denied') {
                console.warn("Cloud update failed:", e);
            }
        }
    }

    return index !== -1 ? localEmpresas[index] : null;
};

export const deleteEmpresa = async (id: string): Promise<boolean> => {
    const localEmpresas = getLocalEmpresas();
    const filtered = localEmpresas.filter(e => e.id !== id);
    saveLocalEmpresas(filtered);

    if (isFirebaseConfigured && db) {
        try {
            await deleteDoc(doc(db, 'lucro_empresas', id));
        } catch(e) {}
    }
    return true;
};

export const addFichaFinanceira = async (empresaId: string, registro: any) => {
    const empresas = await getEmpresas({ id: 'dummy', role: 'admin', name: '', email: '' } as User);
    const emp = empresas.find(e => e.id === empresaId);
    const currentFicha = emp?.fichaFinanceira || [];
    return updateEmpresa(empresaId, { fichaFinanceira: [...currentFicha, registro] });
};