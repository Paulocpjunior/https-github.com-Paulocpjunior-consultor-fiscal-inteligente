
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// --- CONFIGURAÇÃO DO FIREBASE ---
// Para tornar a aplicação multi-usuário REAL, você deve:
// 1. Ir em console.firebase.google.com
// 2. Criar um projeto novo
// 3. Adicionar um app "Web"
// 4. Copiar as chaves geradas e substituir abaixo:

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "", // Cole sua apiKey aqui se não usar env
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.FIREBASE_APP_ID || ""
};

// Verifica se a configuração está presente
const isFirebaseConfigured = !!firebaseConfig.apiKey;

let app;
let auth: any;
let db: any;

if (isFirebaseConfigured) {
    try {
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        console.log("Firebase conectado com sucesso.");
    } catch (e) {
        console.error("Erro ao inicializar Firebase:", e);
    }
} else {
    console.warn("Firebase não configurado. A aplicação está rodando em modo LOCAL (LocalStorage). Para ativar o modo multi-usuário, configure o services/firebaseConfig.ts");
}

export { auth, db, isFirebaseConfigured };
