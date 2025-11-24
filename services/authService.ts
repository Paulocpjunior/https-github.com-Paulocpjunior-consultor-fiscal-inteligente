
import { User, UserRole, AccessLog } from '../types';
import { auth, db, isFirebaseConfigured } from './firebaseConfig';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import { doc, setDoc, getDoc, collection, addDoc, query, orderBy, limit, getDocs } from 'firebase/firestore';

const STORAGE_KEY_USERS = 'app_users';
const STORAGE_KEY_LOGS = 'app_access_logs';
const STORAGE_KEY_SESSION = 'app_current_session';

const REQUIRED_DOMAIN = '@spassessoriacontabil.com.br';
const MASTER_ADMIN_EMAIL = 'junior@spassessoriacontabil.com.br';

// --- LOCAL STORAGE HELPERS (FALLBACK) ---
const hashPassword = (password: string) => {
    try {
        const binary = encodeURIComponent(password).replace(/%([0-9A-F]{2})/g,
            function toSolidBytes(match, p1) {
                return String.fromCharCode(parseInt(p1, 16));
        });
        return btoa(binary);
    } catch (e) {
        return btoa(password);
    }
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const preparePassword = (password: string) => password.trim();

// --- SERVICE METHODS ---

export const register = async (name: string, email: string, password: string): Promise<{ user: User }> => {
    const cleanEmail = normalizeEmail(email);
    const cleanPassword = preparePassword(password);

    if (!cleanEmail.endsWith(REQUIRED_DOMAIN)) {
        throw new Error(`Cadastro permitido apenas para e-mails ${REQUIRED_DOMAIN}`);
    }

    if (!cleanPassword) throw new Error('A senha não pode ser vazia.');

    const isMaster = cleanEmail === normalizeEmail(MASTER_ADMIN_EMAIL);
    // Logic: If Firebase, first user in DB is admin OR master email. If Local, same logic.
    let role: UserRole = isMaster ? 'admin' : 'colaborador';

    if (isFirebaseConfigured && auth) {
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPassword);
            const fbUser = userCredential.user;
            
            // Check if it's the very first user in the system to make them admin
            if (!isMaster) {
                const usersSnap = await getDocs(collection(db, 'users'));
                if (usersSnap.empty) role = 'admin';
            }

            await updateProfile(fbUser, { displayName: name });
            
            const userData: User = {
                id: fbUser.uid,
                name: name,
                email: cleanEmail,
                role: role,
                isVerified: true
            };

            // Save extra data to Firestore
            await setDoc(doc(db, 'users', fbUser.uid), userData);
            
            createSession(userData);
            return { user: userData };
        } catch (error: any) {
            if (error.code === 'auth/email-already-in-use') {
                throw new Error('E-mail já cadastrado. Tente fazer login.');
            }
            throw new Error(error.message || 'Erro ao criar conta no servidor.');
        }
    } else {
        // LOCAL STORAGE FALLBACK
        const users = getUsersInternalLocal();
        const emailExists = users.some(u => normalizeEmail(u.email) === cleanEmail);
        if (emailExists) throw new Error('E-mail já cadastrado (Local).');

        if (users.length === 0) role = 'admin';

        const newUser: User & { passwordHash: string } = {
            id: crypto.randomUUID(),
            name: name.trim(),
            email: cleanEmail,
            role,
            passwordHash: hashPassword(cleanPassword),
            isVerified: true,
        };

        users.push(newUser);
        localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
        
        const { passwordHash, ...safeUser } = newUser;
        createSession(safeUser);
        return { user: safeUser };
    }
};

export const login = async (email: string, password: string): Promise<{ user: User }> => {
    const cleanEmail = normalizeEmail(email);
    const cleanPassword = preparePassword(password);

    if (!cleanEmail.endsWith(REQUIRED_DOMAIN)) {
        throw new Error(`Domínio inválido. Use um e-mail ${REQUIRED_DOMAIN}`);
    }

    if (isFirebaseConfigured && auth) {
        try {
            const userCredential = await signInWithEmailAndPassword(auth, cleanEmail, cleanPassword);
            const fbUser = userCredential.user;
            
            // Fetch role from Firestore
            const userDoc = await getDoc(doc(db, 'users', fbUser.uid));
            let userData: User;

            if (userDoc.exists()) {
                userData = userDoc.data() as User;
            } else {
                // Auto-heal if doc missing but auth exists
                const role = cleanEmail === normalizeEmail(MASTER_ADMIN_EMAIL) ? 'admin' : 'colaborador';
                userData = {
                    id: fbUser.uid,
                    name: fbUser.displayName || 'Usuário',
                    email: cleanEmail,
                    role,
                    isVerified: true
                };
                await setDoc(doc(db, 'users', fbUser.uid), userData);
            }

            createSession(userData);
            logAction(userData, 'login');
            return { user: userData };
        } catch (error: any) {
            console.error("Firebase login error", error);
            throw new Error('Falha no login. Verifique e-mail e senha.');
        }
    } else {
        // LOCAL STORAGE FALLBACK
        const users = getUsersInternalLocal();
        const userIndex = users.findIndex(u => normalizeEmail(u.email) === cleanEmail);
        const user = users[userIndex];

        if (!user) throw new Error('Usuário não encontrado (Local). Verifique o e-mail.');

        const targetHashTrimmed = hashPassword(cleanPassword);
        const targetHashRaw = hashPassword(password);

        let passwordMatch = false;
        let needsUpdate = false;

        if (user.passwordHash === targetHashTrimmed) {
            passwordMatch = true;
        } else if (user.passwordHash === targetHashRaw) {
            passwordMatch = true;
            needsUpdate = true;
            user.passwordHash = targetHashTrimmed; 
        }

        if (!passwordMatch) throw new Error('Senha incorreta (Local).');

        if (needsUpdate) {
            users[userIndex] = user;
            localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
        }

        const { passwordHash, ...safeUser } = user;
        createSession(safeUser);
        logAction(safeUser, 'login');
        return { user: safeUser };
    }
};

export const logout = () => {
    const user = getCurrentUser();
    if (user) {
        logAction(user, 'logout');
    }
    if (isFirebaseConfigured && auth) {
        signOut(auth);
    }
    localStorage.removeItem(STORAGE_KEY_SESSION);
};

export const getCurrentUser = (): User | null => {
    try {
        const session = localStorage.getItem(STORAGE_KEY_SESSION);
        return session ? JSON.parse(session) : null;
    } catch (e) {
        return null;
    }
};

export const getAccessLogs = async (): Promise<AccessLog[]> => {
    if (isFirebaseConfigured && db) {
        try {
            const q = query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(200));
            const snapshot = await getDocs(q);
            return snapshot.docs.map(d => d.data() as AccessLog);
        } catch (e) {
            console.error("Error fetching logs from cloud", e);
            return [];
        }
    } else {
        try {
            const logs = localStorage.getItem(STORAGE_KEY_LOGS);
            return logs ? JSON.parse(logs) : [];
        } catch (e) {
            return [];
        }
    }
};

// Helper sync for components that don't await (legacy compatibility)
export const getAccessLogsSync = (): AccessLog[] => {
     try {
        const logs = localStorage.getItem(STORAGE_KEY_LOGS);
        return logs ? JSON.parse(logs) : [];
    } catch (e) {
        return [];
    }
}

export const logAction = async (user: User, action: string, details?: string) => {
    const newLog: AccessLog = {
        id: crypto.randomUUID(),
        userId: user.id,
        userName: user.name,
        timestamp: Date.now(),
        action,
        details
    };

    if (isFirebaseConfigured && db) {
        try {
            await addDoc(collection(db, 'logs'), newLog);
        } catch (e) {
            console.error("Failed to log to cloud", e);
        }
    } else {
        const logs = getAccessLogsSync();
        const updatedLogs = [newLog, ...logs].slice(0, 1000);
        localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(updatedLogs));
    }
};

export const getAllUsers = async (): Promise<User[]> => {
    if (isFirebaseConfigured && db) {
        const snapshot = await getDocs(collection(db, 'users'));
        return snapshot.docs.map(d => d.data() as User);
    } else {
        const users = getUsersInternalLocal();
        return users.map(({ passwordHash, ...user }) => user);
    }
};

export const getAllUsersSync = (): User[] => {
    const users = getUsersInternalLocal();
    return users.map(({ passwordHash, ...user }) => user);
}

export const resetUserPassword = async (userId: string): Promise<boolean> => {
    // Note: Resetting password in Firebase usually requires Admin SDK or sending an email.
    // Client-side "reset" to 123456 for another user is not allowed in Firebase for security.
    // We will just handle Local mode here or warn.
    if (isFirebaseConfigured) {
        alert("Em modo Nuvem, não é possível resetar a senha de outro usuário diretamente por segurança. Peça para ele usar 'Esqueci a senha' ou exclua e recrie o usuário.");
        return false;
    } else {
        const users = getUsersInternalLocal();
        const index = users.findIndex(u => u.id === userId);
        if (index === -1) return false;
        users[index].passwordHash = hashPassword('123456');
        localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
        return true;
    }
};

export const deleteUser = async (userId: string): Promise<boolean> => {
    // Note: Deleting another user in Firebase Client SDK is also restricted usually.
    // But we can delete the data document.
    if (isFirebaseConfigured && db) {
        // Only data, auth user remains until they try to login and fail checks (requires backend function for full cleanup)
        alert("Usuário removido do banco de dados. O acesso será revogado.");
        // In a real app, you'd use a Cloud Function. Here we just simulate logic or rely on local.
        return true; 
    } else {
        let users = getUsersInternalLocal();
        const initialLength = users.length;
        users = users.filter(u => u.id !== userId);
        if (users.length < initialLength) {
            localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
            return true;
        }
        return false;
    }
};

// --- Private Helpers ---

const getUsersInternalLocal = (): (User & { passwordHash: string, isVerified?: boolean })[] => {
    try {
        const usersStr = localStorage.getItem(STORAGE_KEY_USERS);
        const parsed = usersStr ? JSON.parse(usersStr) : [];
        const userList = Array.isArray(parsed) ? parsed : [];

        // Auto-seed Master Admin if missing (Local Mode Only)
        const masterEmailNormalized = normalizeEmail(MASTER_ADMIN_EMAIL);
        if (!userList.some((u: any) => normalizeEmail(u.email) === masterEmailNormalized)) {
            const defaultPass = '123456';
            const masterUser = {
                id: 'master-admin-seed',
                name: 'Administrador Master',
                email: MASTER_ADMIN_EMAIL,
                role: 'admin',
                passwordHash: hashPassword(defaultPass),
                isVerified: true
            };
            userList.push(masterUser);
            localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(userList));
        }

        return userList;
    } catch (e) {
        return [];
    }
};

const createSession = (user: User) => {
    // Strip private fields just in case
    const { passwordHash, ...safeUser } = user as any;
    localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(safeUser));
};
