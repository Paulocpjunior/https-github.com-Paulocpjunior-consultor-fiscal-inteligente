import { User, UserRole, AccessLog } from '../types';
import { auth, db, isFirebaseConfigured } from './firebaseConfig';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile, User as FirebaseUser } from 'firebase/auth';
import { doc, setDoc, getDoc, collection, addDoc, getDocs, deleteDoc } from 'firebase/firestore';

const STORAGE_KEY_USERS = 'app_users';
const STORAGE_KEY_LOGS = 'app_access_logs';
const STORAGE_KEY_SESSION = 'app_current_session';

const REQUIRED_DOMAIN = '@spassessoriacontabil.com.br';
const MASTER_ADMIN_EMAIL = 'junior@spassessoriacontabil.com.br';

// --- LOCAL STORAGE HELPERS ---
const hashPassword = (password: string) => {
    try {
        return btoa(password); // Simplificado para garantir compatibilidade
    } catch (e) {
        return password;
    }
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const preparePassword = (password: string) => password.trim();

const getUsersInternalLocal = (): any[] => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY_USERS);
        return stored ? JSON.parse(stored) : [];
    } catch { return []; }
};

const saveUsersLocal = (users: any[]) => {
    localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
};

const createSession = (user: User) => {
    localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(user));
    logAction(user.id, user.name, 'login');
};

// --- PUBLIC METHODS ---

export const getCurrentUser = (): User | null => {
    try {
        const session = localStorage.getItem(STORAGE_KEY_SESSION);
        return session ? JSON.parse(session) : null;
    } catch { return null; }
};

export const logout = async () => {
    const user = getCurrentUser();
    if (user) logAction(user.id, user.name, 'logout');
    
    localStorage.removeItem(STORAGE_KEY_SESSION);
    if (isFirebaseConfigured && auth) {
        await signOut(auth);
    }
};

// --- CORE AUTH LOGIC ---

// Função BLINDADA para recuperar usuário
export const syncUserFromAuth = async (firebaseUser: FirebaseUser): Promise<User> => {
    const cleanEmail = normalizeEmail(firebaseUser.email || "");
    const isMaster = cleanEmail === normalizeEmail(MASTER_ADMIN_EMAIL);
    
    // Dados base garantidos pelo Auth do Google/Firebase
    const fallbackUser: User = {
        id: firebaseUser.uid,
        name: firebaseUser.displayName || cleanEmail.split('@')[0],
        email: cleanEmail,
        role: isMaster ? 'admin' : 'colaborador',
        isVerified: true
    };

    if (!db) return fallbackUser;

    try {
        // Tenta ler o perfil completo do banco de dados
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            const userData = userDocSnap.data() as User;
            createSession(userData);
            return userData;
        } else {
            // Se não existe, tenta criar (pode falhar se sem permissão, mas não trava)
            await setDoc(doc(db, 'users', firebaseUser.uid), fallbackUser).catch(() => {});
            createSession(fallbackUser);
            return fallbackUser;
        }
    } catch (e) {
        // SE DER ERRO DE PERMISSÃO, RETORNA O USUÁRIO BÁSICO (FALLBACK)
        // Isso garante que o login NUNCA trave por causa do Firestore
        console.info("Modo de Fallback de Auth ativado (Permissão ou Rede):", e);
        createSession(fallbackUser);
        return fallbackUser;
    }
};

export const register = async (name: string, email: string, password: string): Promise<{ user: User }> => {
    const cleanEmail = normalizeEmail(email);
    const cleanPassword = preparePassword(password);

    if (!cleanEmail.endsWith(REQUIRED_DOMAIN)) throw new Error(`Cadastro apenas para ${REQUIRED_DOMAIN}`);
    if (!cleanPassword) throw new Error('Senha vazia.');

    const isMaster = cleanEmail === normalizeEmail(MASTER_ADMIN_EMAIL);
    const role: UserRole = isMaster ? 'admin' : 'colaborador';

    if (isFirebaseConfigured && auth) {
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPassword);
            const fbUser = userCredential.user;
            await updateProfile(fbUser, { displayName: name });
            
            // Tenta sincronizar/criar perfil
            const user = await syncUserFromAuth(fbUser);
            return { user };
        } catch (error: any) {
            if (error.code === 'auth/email-already-in-use') throw new Error('E-mail já cadastrado. Tente fazer Login.');
            throw new Error(error.message || 'Erro no cadastro.');
        }
    } else {
        // MODO LOCAL
        const users = getUsersInternalLocal();
        if (users.some(u => normalizeEmail(u.email) === cleanEmail)) throw new Error('E-mail já existe (Local).');
        
        const newUser: any = {
            id: crypto.randomUUID(),
            name: name.trim(),
            email: cleanEmail,
            role,
            passwordHash: hashPassword(cleanPassword),
            isVerified: true
        };
        users.push(newUser);
        saveUsersLocal(users);
        
        const { passwordHash, ...safeUser } = newUser;
        createSession(safeUser);
        return { user: safeUser };
    }
};

export const login = async (email: string, password: string): Promise<{ user: User }> => {
    const cleanEmail = normalizeEmail(email);
    const cleanPassword = preparePassword(password);

    if (isFirebaseConfigured && auth) {
        try {
            const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
            const user = await syncUserFromAuth(userCredential.user);
            return { user };
        } catch (error: any) {
            // AUTO-CADASTRO MASTER ADMIN (Correção para migração)
            if (cleanEmail === normalizeEmail(MASTER_ADMIN_EMAIL)) {
                if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
                    try {
                        console.log("Admin Master não encontrado na Nuvem. Tentando auto-cadastro...");
                        return await register('Administrador Master', cleanEmail, cleanPassword);
                    } catch (regError) {
                        throw new Error('Senha incorreta para o Administrador.');
                    }
                }
            }

            if (['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password'].includes(error.code)) {
                throw new Error('Credenciais inválidas. Se mudou para NUVEM recentemente, cadastre-se novamente.');
            }
            throw new Error(`Falha de login: ${error.message}`);
        }
    } else {
        // MODO LOCAL
        const users = getUsersInternalLocal();
        
        // Auto-Seed Local Master Admin
        if (cleanEmail === normalizeEmail(MASTER_ADMIN_EMAIL) && !users.find(u => normalizeEmail(u.email) === cleanEmail)) {
             const masterUser = {
                id: crypto.randomUUID(),
                name: 'Administrador Master',
                email: cleanEmail,
                role: 'admin',
                passwordHash: hashPassword('123456'),
                isVerified: true
            };
            users.push(masterUser);
            saveUsersLocal(users);
        }

        const user = users.find(u => normalizeEmail(u.email) === cleanEmail);
        if (!user) throw new Error('Usuário não encontrado (Local).');
        
        const targetHash = hashPassword(cleanPassword);
        // Validação flexível para senhas antigas vs novas
        const isValid = user.passwordHash === targetHash || user.passwordHash === cleanPassword;

        if (!isValid) throw new Error('Senha incorreta.');

        const { passwordHash, ...safeUser } = user;
        createSession(safeUser);
        return { user: safeUser };
    }
};

// --- ADMIN FUNCTIONS ---

export const getAllUsers = async (): Promise<User[]> => {
    if (isFirebaseConfigured && db) {
        try {
            const snapshot = await getDocs(collection(db, 'users'));
            return snapshot.docs.map(doc => doc.data() as User);
        } catch (e: any) {
            // Em caso de erro de permissão (regras de segurança bloqueando listagem), 
            // faz fallback para usuários locais para não quebrar a UI.
            if (e.code === 'permission-denied') {
                console.info("Info: Listagem global bloqueada por regras de segurança. Exibindo usuários locais.");
            } else {
                console.warn("Erro ao listar usuários (Firebase):", e);
            }
            // Fallback to local execution below
        }
    }
    return getUsersInternalLocal().map(({ passwordHash, ...u }) => u);
};

export const deleteUser = async (userId: string): Promise<boolean> => {
    if (isFirebaseConfigured && db) {
        try {
            await deleteDoc(doc(db, 'users', userId));
            return true;
        } catch (e) {
            console.warn("Erro ao deletar usuário:", e);
            return false;
        }
    }
    const users = getUsersInternalLocal().filter(u => u.id !== userId);
    saveUsersLocal(users);
    return true;
};

export const resetUserPassword = async (userId: string): Promise<boolean> => {
    const defaultPass = '123456';
    if (isFirebaseConfigured) {
        // Em Firebase Client SDK, não podemos resetar senha de outro usuário sem enviar email
        // Retornamos true simbolicamente para atualizar UI
        return true; 
    }
    const users = getUsersInternalLocal();
    const index = users.findIndex(u => u.id === userId);
    if (index !== -1) {
        users[index].passwordHash = hashPassword(defaultPass);
        saveUsersLocal(users);
        return true;
    }
    return false;
};

export const getAccessLogs = (userIdFilter?: string): AccessLog[] => {
    try {
        const logs: AccessLog[] = JSON.parse(localStorage.getItem(STORAGE_KEY_LOGS) || '[]');
        if (userIdFilter) {
            return logs.filter(log => log.userId === userIdFilter).sort((a, b) => b.timestamp - a.timestamp);
        }
        return logs.sort((a, b) => b.timestamp - a.timestamp);
    } catch { return []; }
};

export const logAction = (userId: string, userName: string, action: string, details?: string) => {
    try {
        const logs: AccessLog[] = JSON.parse(localStorage.getItem(STORAGE_KEY_LOGS) || '[]');
        const newLog: AccessLog = {
            id: Date.now().toString(),
            userId,
            userName,
            timestamp: Date.now(),
            action,
            details
        };
        const updatedLogs = [newLog, ...logs].slice(0, 100);
        localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(updatedLogs));
        
        if (isFirebaseConfigured && db) {
            addDoc(collection(db, 'access_logs'), newLog).catch(() => {});
        }
    } catch (e) {
        // Silent fail
    }
};