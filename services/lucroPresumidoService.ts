
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

// --- CRUD ---

export const getEmpresas = async (currentUser?: User | null): Promise<LucroPresumidoEmpresa[]> => {
    if (!currentUser) return [];
    
    // Check master email case-insensitive
    const isMasterAdmin = currentUser.role === 'admin' || currentUser.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase();

    // 1. Tenta buscar da Nuvem (Prioridade)
    if (isFirebaseConfigured && db && auth?.currentUser) {
        try {
            const uid = auth.currentUser.uid;
            
            // ATUALIZAÇÃO DE SEGURANÇA:
            // Filtra explicitamente por createdBy para satisfazer regras de segurança do Firestore.
            // Isso evita o erro "Missing or insufficient permissions" mesmo para admins, 
            // pois as regras padrão geralmente validam if request.auth.uid == resource.data.createdBy.
            const q = query(collection(db, 'lucro_empresas'), where('createdBy', '==', uid));
            
            const snapshot = await getDocs(q);
            const cloudEmpresas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LucroPresumidoEmpresa));
            
            // Se conseguiu buscar da nuvem, atualiza o cache local para ter um backup
            if (cloudEmpresas.length > 0) {
                // Mescla com locais que talvez não estejam na nuvem (modo offline anterior)
                const local = getLocalEmpresas();
                const merged = [...cloudEmpresas];
                local.forEach(l => {
                    if (!merged.find(c => c.id === l.id)) merged.push(l);
                });
                saveLocalEmpresas(merged);
                return cloudEmpresas;
            }
        } catch (e: any) {
            // Fallback silencioso apenas se erro de rede/permissão
            if (e.code !== 'permission-denied' && e.code !== 'failed-precondition') {
                console.warn("Firestore Warning:", e.message);
            } else {
                console.warn("Firestore Permission Error (getEmpresas Lucro):", e.code);
            }
        }
    }

    // 2. Fallback Local (Se nuvem falhar ou não configurada)
    const localEmpresas = getLocalEmpresas();
    if (!isMasterAdmin) {
        return localEmpresas.filter(e => e.createdBy === currentUser.id || !e.createdBy);
    }
    return localEmpresas;
};

export const saveEmpresa = async (empresa: any, userId: string): Promise<LucroPresumidoEmpresa> => {
    // Garante ID
    const id = empresa.id || generateUUID();
    
    const newEmpresaData: LucroPresumidoEmpresa = { 
        ...empresa, 
        id,
        fichaFinanceira: empresa.fichaFinanceira || [], 
        createdBy: userId 
    };

    // 1. Tenta salvar na Nuvem (Fonte da Verdade)
    if (isFirebaseConfigured && db && auth?.currentUser) {
        try {
            // Garante que o createdBy seja o UID do Auth atual para consistência
            newEmpresaData.createdBy = auth.currentUser.uid;
            const payload = sanitizePayload(newEmpresaData);
            
            // Usa setDoc com o ID específico para criar ou substituir
            await setDoc(doc(db, 'lucro_empresas', id), payload);
        } catch (e: any) { 
            console.error("Erro ao salvar na nuvem:", e);
            if (e.code === 'permission-denied') throw new Error("Sem permissão para salvar na nuvem.");
        }
    }

    // 2. Salva Local (Backup/Cache)
    const localEmpresas = getLocalEmpresas();
    const existingIndex = localEmpresas.findIndex(e => e.id === id);
    if (existingIndex >= 0) {
        localEmpresas[existingIndex] = newEmpresaData;
    } else {
        localEmpresas.push(newEmpresaData);
    }
    saveLocalEmpresas(localEmpresas);

    return newEmpresaData;
};

export const updateEmpresa = async (id: string, data: Partial<LucroPresumidoEmpresa>): Promise<LucroPresumidoEmpresa | null> => {
    // 1. Update Cloud
    if (isFirebaseConfigured && db && auth?.currentUser) {
        try {
            const docRef = doc(db, 'lucro_empresas', id);
            const { id: _, createdBy: __, ...safeData } = data as any; // Remove campos imutáveis
            
            if (Object.keys(safeData).length > 0) {
                const payload = sanitizePayload(safeData);
                await updateDoc(docRef, payload);
            }
        } catch (e: any) { 
            console.warn("Cloud update failed:", e);
        }
    }

    // 2. Update Local
    const localEmpresas = getLocalEmpresas();
    const index = localEmpresas.findIndex(e => e.id === id);
    if (index !== -1) {
        localEmpresas[index] = { ...localEmpresas[index], ...data };
        saveLocalEmpresas(localEmpresas);
        return localEmpresas[index];
    }

    return null;
};

export const deleteEmpresa = async (id: string): Promise<boolean> => {
    if (isFirebaseConfigured && db) {
        try {
            await deleteDoc(doc(db, 'lucro_empresas', id));
        } catch(e) {
            console.error("Erro ao deletar da nuvem", e);
        }
    }
    
    const localEmpresas = getLocalEmpresas();
    const filtered = localEmpresas.filter(e => e.id !== id);
    saveLocalEmpresas(filtered);

    return true;
};

// Função Crítica: Garante que o histórico financeiro seja anexado corretamente na nuvem
export const addFichaFinanceira = async (empresaId: string, registro: FichaFinanceiraRegistro): Promise<LucroPresumidoEmpresa | null> => {
    
    // 1. Se estiver online, busca o documento atualizado primeiro para não perder histórico de outras sessões
    if (isFirebaseConfigured && db && auth?.currentUser) {
        try {
            const docRef = doc(db, 'lucro_empresas', empresaId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const empresaData = docSnap.data() as LucroPresumidoEmpresa;
                const currentFicha = empresaData.fichaFinanceira || [];
                
                // Remove registro existente do mesmo mês (se houver) para substituir pelo novo
                const fichaAtualizada = currentFicha.filter(f => f.mesReferencia !== registro.mesReferencia);
                fichaAtualizada.push(registro);

                // Ordena por data (opcional, mas bom para organização)
                fichaAtualizada.sort((a, b) => a.mesReferencia.localeCompare(b.mesReferencia));

                await updateDoc(docRef, { fichaFinanceira: sanitizePayload(fichaAtualizada) });
                
                // Atualiza local também para refletir
                const localEmpresas = getLocalEmpresas();
                const idx = localEmpresas.findIndex(e => e.id === empresaId);
                if (idx !== -1) {
                    localEmpresas[idx].fichaFinanceira = fichaAtualizada;
                    saveLocalEmpresas(localEmpresas);
                    return localEmpresas[idx];
                }
                return { ...empresaData, fichaFinanceira: fichaAtualizada };
            }
        } catch (e) {
            console.error("Erro ao salvar ficha na nuvem:", e);
            throw new Error("Erro de conexão ao salvar cálculo. Verifique sua internet.");
        }
    }

    // 2. Fallback Local (apenas se offline)
    const localEmpresas = getLocalEmpresas();
    const index = localEmpresas.findIndex(e => e.id === empresaId);
    
    if (index !== -1) {
        const currentFicha = localEmpresas[index].fichaFinanceira || [];
        const fichaAtualizada = currentFicha.filter(f => f.mesReferencia !== registro.mesReferencia);
        fichaAtualizada.push(registro);
        
        localEmpresas[index].fichaFinanceira = fichaAtualizada;
        saveLocalEmpresas(localEmpresas);
        return localEmpresas[index];
    }

    return null;
};
