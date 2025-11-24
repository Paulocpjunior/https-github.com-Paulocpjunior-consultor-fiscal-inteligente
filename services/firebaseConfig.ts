import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
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
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        console.log("Firebase conectado com sucesso.");
    } catch (e) {
        console.error("Erro ao inicializar Firebase:", e);
        // Fallback para evitar crash total se as chaves estiverem erradas
        isFirebaseConfigured = false;
    }
} else {
    console.warn("Firebase não configurado ou chaves inválidas. A aplicação rodará em modo LOCAL (LocalStorage).");
}

export { auth, db, isFirebaseConfigured };