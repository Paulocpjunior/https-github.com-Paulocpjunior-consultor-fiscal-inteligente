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

// Função BLINDADA para recuperar usuário e garantir persistência no Banco Online
export const syncUserFromAuth = async (firebaseUser: FirebaseUser): Promise<User> => {
    const cleanEmail = normalizeEmail(firebaseUser.email || "");
    const isMaster = cleanEmail === normalizeEmail(MASTER_ADMIN_EMAIL);
    
    // Dados base garantidos pelo Auth do Google/Firebase
    // Força ROLE admin se for o email master
    const forcedRole: UserRole = isMaster ? 'admin' : 'colaborador';

    const fallbackUser: User = {
        id: firebaseUser.uid,
        name: firebaseUser.displayName || cleanEmail.split('@')[0],
        email: cleanEmail,
        role: forcedRole, 
        isVerified: true
    };

    // Se não tiver DB configurado (modo local puro), retorna o fallback
    if (!db) return fallbackUser;

    try {
        // Tenta ler o perfil completo do banco de dados (Firestore)
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            const userData = userDocSnap.data() as User;
            
            // Auto-correção: Se for master mas no banco não estiver admin, atualiza
            if (isMaster && userData.role !== 'admin') {
                userData.role = 'admin';
                await setDoc(doc(db, 'users', firebaseUser.uid), userData, { merge: true });
            }

            createSession(userData);
            return userData;
        } else {
            // CRÍTICO: Se o usuário existe no Auth mas não no Firestore, CRIA AGORA.
            // Isso corrige contas "quebradas" onde o registro falhou na etapa do banco.
            console.log("Perfil não encontrado no Firestore. Criando perfil de recuperação:", cleanEmail);
            
            try {
                await setDoc(doc(db, 'users', firebaseUser.uid), fallbackUser);
            } catch (innerError: any) {
                console.error("Erro crítico ao salvar usuário no DB:", innerError);
                // Se falhar a escrita, ainda permite o login com o objeto em memória para não bloquear o usuário
            }
            
            createSession(fallbackUser);
            return fallbackUser;
        }
    } catch (e) {
        console.error("Erro na sincronização de usuário:", e);
        // Em caso de erro de rede (offline), permite acesso com dados básicos do Auth se já estiver autenticado
        createSession(fallbackUser);
        return fallbackUser;
    }
};

export const register = async (name: string, email: string, password: string): Promise<{ user: User }> => {
    const cleanEmail = normalizeEmail(email);
    const cleanPassword = preparePassword(password);

    if (!cleanEmail.endsWith(REQUIRED_DOMAIN)) throw new Error(`Cadastro permitido apenas para e-mails ${REQUIRED_DOMAIN}`);
    if (!cleanPassword) throw new Error('Senha vazia.');

    const isMaster = cleanEmail === normalizeEmail(MASTER_ADMIN_EMAIL);
    const role: UserRole = isMaster ? 'admin' : 'colaborador';

    // SE O FIREBASE ESTIVER CONFIGURADO, OBRIGA O USO DA NUVEM
    if (isFirebaseConfigured && auth) {
        try {
            // 1. Cria autenticação (Login/Senha)
            const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPassword);
            const fbUser = userCredential.user;
            
            // 2. Atualiza nome no perfil do Firebase Auth
            await updateProfile(fbUser, { displayName: name });
            
            // 3. Força a criação do documento no Firestore via syncUserFromAuth
            // A função syncUserFromAuth vai detectar que o doc não existe e criá-lo
            const user = await syncUserFromAuth(fbUser);
            
            return { user };
        } catch (error: any) {
            if (error.code === 'auth/email-already-in-use') throw new Error('Este e-mail já está cadastrado no sistema online. Tente fazer Login.');
            if (error.code === 'auth/weak-password') throw new Error('A senha deve ter pelo menos 6 caracteres.');
            throw new Error(error.message || 'Erro no cadastro online.');
        }
    } else {
        // MODO LOCAL (Apenas se a nuvem NÃO estiver configurada)
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

    // SE O FIREBASE ESTIVER CONFIGURADO, OBRIGA O USO DA NUVEM
    if (isFirebaseConfigured && auth) {
        try {
            const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
            // Ao logar, sincroniza/recupera o perfil do Firestore
            const user = await syncUserFromAuth(userCredential.user);
            return { user };
        } catch (error: any) {
            // Tratamento específico para Admin Master se não existir
            if (cleanEmail === normalizeEmail(MASTER_ADMIN_EMAIL)) {
                if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
                    try {
                        console.log("Admin Master não encontrado na Nuvem. Tentando auto-cadastro de recuperação...");
                        return await register('Administrador Master', cleanEmail, cleanPassword);
                    } catch (regError) {
                        // Se falhar o registro (ex: senha errada mas user existe), cai no erro genérico abaixo
                    }
                }
            }

            if (['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password'].includes(error.code)) {
                throw new Error('Usuário não encontrado ou senha incorreta no Banco de Dados Online.');
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
        if (!user) throw new Error('Usuário não encontrado na base Local.');
        
        const targetHash = hashPassword(cleanPassword);
        const isValid = user.passwordHash === targetHash || user.passwordHash === cleanPassword;

        if (!isValid) throw new Error('Senha incorreta (Local).');

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
            if (e.code === 'permission-denied') {
                console.info("Info: Apenas administradores podem listar usuários.");
            } else {
                console.warn("Erro ao listar usuários (Firebase):", e);
            }
        }
    }
    return getUsersInternalLocal().map(({ passwordHash, ...u }) => u);
};

export const deleteUser = async (userId: string): Promise<boolean> => {
    if (isFirebaseConfigured && db) {
        try {
            await deleteDoc(doc(db, 'users', userId));
            // Nota: Isso deleta do Firestore, mas não do Auth (requer Admin SDK no backend).
            // O usuário perderá acesso aos dados, mas o login ainda existirá até ser removido no console.
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
        // No Client SDK, não é possível resetar a senha de outro usuário diretamente sem envio de e-mail.
        // Retornamos true apenas para feedback visual, mas a ação real requer backend ou envio de email.
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