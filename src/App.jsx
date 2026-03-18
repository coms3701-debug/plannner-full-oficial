// 🔥 IMPORTS (ATUALIZADO)
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Home, CheckSquare, Activity, Briefcase, CalendarClock, Plus, Check, ChevronLeft, ChevronRight, 
  Trash2, Edit2, X, User, Settings, Download, ListTodo, CheckCircle2,
  Cloud, CloudOff, RefreshCw, Mail, Lock, ShieldCheck, AlertCircle
} from 'lucide-react';

import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';

import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';


// 🔥 FIX HAPTIC (BUG CRÍTICO)
const hapticFeedback = (ms) => {
  if (navigator.vibrate) navigator.vibrate(ms);
};

// 🔥 DEBUG GLOBAL (REMOVE DEPOIS)
window.onerror = function (msg) {
  console.error("Erro global:", msg);
};


// ==========================================
// APP PRINCIPAL
// ==========================================

export default function App() {

  const [firebaseUser, setFirebaseUser] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const authRef = useRef(null);
  const dbRef = useRef(null);

  // 🔥 FIREBASE INIT CORRIGIDO
  useEffect(() => {

    try {
      const firebaseConfig = {
        apiKey: "AIzaSyBIEMS3WhSNKmHsd4XTp-B3gA7vfRDyMwU",
        authDomain: "planner-full.firebaseapp.com",
        projectId: "planner-full",
        storageBucket: "planner-full.appspot.com",
        messagingSenderId: "904119329848",
        appId: "1:904119329848:web:8b3e8a0ff8f7e4f419b2cd"
      };

      const app = initializeApp(firebaseConfig);
      const auth = getAuth(app);

      // 🔥 mantém logado
      setPersistence(auth, browserLocalPersistence);

      authRef.current = auth;
      dbRef.current = getFirestore(app);

      const unsubscribe = onAuthStateChanged(auth, (user) => {
        setFirebaseUser(user);
        setIsInitializing(false);
      });

      return () => unsubscribe();

    } catch (err) {
      console.error("Erro Firebase:", err);
      setIsInitializing(false);
    }

  }, []);


  // 🔥 PROTEÇÃO (EVITA TELA BRANCA)
  if (!authRef.current || isInitializing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
      </div>
    );
  }

  // 🔐 LOGIN
  if (!firebaseUser) {
    return <AuthScreen auth={authRef.current} />;
  }

  // ==============================
  // 🔥 AQUI CONTINUA SEU APP NORMAL
  // (mantive simplificado aqui só para exemplo visual)
  // ==============================

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center">
      <h1 className="text-2xl font-bold mb-4">Planner Full</h1>

      <p className="mb-6">{firebaseUser.email}</p>

      <button
        onClick={() => signOut(authRef.current)}
        className="bg-red-500 px-4 py-2 rounded"
      >
        Sair
      </button>
    </div>
  );
}


// ==========================================
// 🔐 AUTH SCREEN (SEU ORIGINAL + FIX)
// ==========================================

const AuthScreen = ({ auth }) => {

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);


  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError("Erro no login");
    } finally {
      setLoading(false);
    }
  };


  // 🔥 GOOGLE FIX (O MAIS IMPORTANTE)
  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    hapticFeedback(30);

    try {
      const provider = new GoogleAuthProvider();

      await signInWithPopup(auth, provider);

    } catch (err) {
      console.error(err);

      if (err.code === "auth/popup-blocked") {
        setError("Popup bloqueado");
      } else if (err.code === "auth/unauthorized-domain") {
        setError("Domínio não autorizado no Firebase");
      } else {
        setError("Erro no login Google");
      }

    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white p-6">
      <h1 className="text-3xl font-bold mb-6">Planner Full</h1>

      {error && <p className="text-red-400 mb-4">{error}</p>}

      <button
        onClick={handleGoogleLogin}
        className="bg-white text-black px-6 py-3 rounded font-bold"
      >
        {loading ? "Carregando..." : "Entrar com Google"}
      </button>
    </div>
  );
};
