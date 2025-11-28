import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, initializeAuth, browserLocalPersistence, inMemoryPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// --- CONFIGURAÇÃO DO FIREBASE ---
// Chaves configuradas para o projeto consultorfiscalapp

const firebaseConfig = {
  apiKey: "AIzaSyDIqWgUuLjkrrg1vQe5FuN1TY22WHoPQQs",
  authDomain: "consultorfiscalapp.firebaseapp.com",
  projectId: "consultorfiscalapp",
  storageBucket: "consultorfiscalapp.firebasestorage.app",
  messagingSenderId: "631239634290",
  appId: "1:631239634290:web:1edfcab8ba8e21f27c41eb",
  measurementId: "G-25WMQ139GN"
};

// Verifica se a chave de API foi preenchida (ignora string vazia ou placeholders)
let isFirebaseConfigured = !!firebaseConfig.apiKey && firebaseConfig.apiKey !== "" && !firebaseConfig.apiKey.includes("COLE_AQUI");

let app;
let auth: any;
let db: any;

if (isFirebaseConfigured) {
    try {
        // Previne inicialização duplicada (Erro comum em React Strict Mode / HMR)
        // Isso corrige o erro: "Failed to execute 'transaction' on 'IDBDatabase'"
        if (getApps().length === 0) {
            app = initializeApp(firebaseConfig);
            
            // Tenta inicializar com persistência Local (Padrão)
            try {
                auth = initializeAuth(app, {
                    persistence: browserLocalPersistence
                });
            } catch (authError) {
                console.warn("Auth persistence error, falling back to standard getAuth:", authError);
                // Fallback seguro: usa getAuth padrão se a inicialização explícita falhar
                auth = getAuth(app); 
            }
        } else {
            // Se já existe, reutiliza a instância (evita crash)
            app = getApp();
            auth = getAuth(app);
        }

        db = getFirestore(app);
        console.log("Firebase conectado com sucesso (Nuvem Ativa).");
    } catch (e) {
        console.error("Erro Crítico ao inicializar Firebase:", e);
        // Fallback para evitar crash total se as chaves estiverem erradas ou erro de rede grave
        isFirebaseConfigured = false;
    }
} else {
    console.warn("Firebase não configurado ou chaves inválidas. A aplicação rodará em modo LOCAL (LocalStorage).");
}

export { auth, db, isFirebaseConfigured };