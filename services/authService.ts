
import { User, UserRole, AccessLog } from '../types';

const STORAGE_KEY_USERS = 'app_users';
const STORAGE_KEY_LOGS = 'app_access_logs';
const STORAGE_KEY_SESSION = 'app_current_session';

const REQUIRED_DOMAIN = '@spassessoriacontabil.com.br';
const MASTER_ADMIN_EMAIL = 'junior@spassessoriacontabil.com.br';

// Helper safe for UTF-8 characters to Base64
const hashPassword = (password: string) => {
    try {
        // MDN solution for Unicode strings to Base64
        const binary = encodeURIComponent(password).replace(/%([0-9A-F]{2})/g,
            function toSolidBytes(match, p1) {
                return String.fromCharCode(parseInt(p1, 16));
        });
        return btoa(binary);
    } catch (e) {
        console.warn("Password hash error, using fallback");
        return btoa(password); // Fallback (works for ASCII)
    }
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const preparePassword = (password: string) => password.trim();

export const register = async (name: string, email: string, password: string): Promise<{ user: User }> => {
    const cleanEmail = normalizeEmail(email);
    const cleanPassword = preparePassword(password);

    if (!cleanEmail.endsWith(REQUIRED_DOMAIN)) {
        throw new Error(`Cadastro permitido apenas para e-mails ${REQUIRED_DOMAIN}`);
    }

    const users = getUsers();
    // Check existence case-insensitively
    const emailExists = users.some(u => normalizeEmail(u.email) === cleanEmail);
    if (emailExists) {
        throw new Error('E-mail já cadastrado. Tente fazer login.');
    }

    if (!cleanPassword) {
        throw new Error('A senha não pode ser vazia.');
    }

    // First user is Admin, OR if it matches the Master Admin email
    const isMaster = cleanEmail === normalizeEmail(MASTER_ADMIN_EMAIL);
    const role: UserRole = (users.length === 0 || isMaster) ? 'admin' : 'colaborador';

    const newUser: User & { passwordHash: string } = {
        id: crypto.randomUUID(),
        name: name.trim(),
        email: cleanEmail, // Save normalized
        role,
        passwordHash: hashPassword(cleanPassword),
        isVerified: true, // Auto-verify (Email verification disabled)
    };

    users.push(newUser);
    localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
    
    // Return the public user object (without password)
    const { passwordHash, ...safeUser } = newUser;
    return { user: safeUser };
};

export const login = async (email: string, password: string): Promise<{ user: User }> => {
    const cleanEmail = normalizeEmail(email);
    const cleanPassword = preparePassword(password);

    if (!cleanEmail.endsWith(REQUIRED_DOMAIN)) {
        throw new Error(`Domínio inválido. Use um e-mail ${REQUIRED_DOMAIN}`);
    }

    const users = getUsers();
    
    // 1. First find the user by email
    const userIndex = users.findIndex(u => normalizeEmail(u.email) === cleanEmail);
    const user = users[userIndex];

    if (!user) {
        console.warn(`Login failed for ${cleanEmail}: User not found`);
        throw new Error('Usuário não encontrado. Verifique o e-mail ou realize o cadastro.');
    }

    // 2. Then check password
    const targetHash = hashPassword(cleanPassword);
    if (user.passwordHash !== targetHash) {
        console.warn(`Login failed for ${cleanEmail}: Password mismatch`);
        throw new Error('Senha incorreta. Tente novamente.');
    }

    // 3. Auto-Verify logic (Fix for stuck users from previous versions)
    if (!user.isVerified) {
        user.isVerified = true;
        users[userIndex] = user;
        localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
    }

    createSession(user);
    logAction(user, 'login');

    const { passwordHash, ...safeUser } = user;
    return { user: safeUser };
};

export const logout = () => {
    const user = getCurrentUser();
    if (user) {
        logAction(user, 'logout');
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

export const getAccessLogs = (): AccessLog[] => {
    try {
        const logs = localStorage.getItem(STORAGE_KEY_LOGS);
        return logs ? JSON.parse(logs) : [];
    } catch (e) {
        return [];
    }
};

export const logAction = (user: User, action: string) => {
    const logs = getAccessLogs();
    const newLog: AccessLog = {
        id: crypto.randomUUID(),
        userId: user.id,
        userName: user.name,
        timestamp: Date.now(),
        action,
    };
    
    // Keep last 1000 logs
    const updatedLogs = [newLog, ...logs].slice(0, 1000);
    localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(updatedLogs));
};

// --- Private Helpers ---

const getUsers = (): (User & { passwordHash: string, isVerified?: boolean, verificationCode?: string })[] => {
    try {
        const usersStr = localStorage.getItem(STORAGE_KEY_USERS);
        const parsed = usersStr ? JSON.parse(usersStr) : [];
        const userList = Array.isArray(parsed) ? parsed : [];

        // Auto-seed Master Admin if missing (Robustez para evitar 'User not found')
        const masterEmailNormalized = normalizeEmail(MASTER_ADMIN_EMAIL);
        if (!userList.some((u: any) => normalizeEmail(u.email) === masterEmailNormalized)) {
            const defaultPass = '123456';
            console.info(`[Auth] Master Admin criado automaticamente. Senha padrão: ${defaultPass}`);
            
            const masterUser = {
                id: 'master-admin-seed',
                name: 'Administrador Master',
                email: MASTER_ADMIN_EMAIL, // Keep original case for display
                role: 'admin',
                passwordHash: hashPassword(defaultPass),
                isVerified: true
            };
            userList.push(masterUser);
            localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(userList));
        }

        return userList;
    } catch (e) {
        console.error("Error reading users from storage", e);
        return [];
    }
};

const createSession = (user: User) => {
    // Ensure we don't accidentally save the hash in the session
    const { passwordHash, ...safeUser } = user as any;
    localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(safeUser));
};
