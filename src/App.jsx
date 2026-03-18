import React, { useState, useEffect, useMemo, useRef } from 'react';
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

// 🔥 HAPTIC FIX
const hapticFeedback = (ms) => {
  if (navigator.vibrate) navigator.vibrate(ms);
};

// 🔥 DEBUG GLOBAL
window.onerror = function (msg) {
  alert("Erro detectado: " + msg);
};

// 🔥 LOCAL STORAGE
function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(key)) || initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = (value) => {
    const val = value instanceof Function ? value(storedValue) : value;
    setStoredValue(val);
    localStorage.setItem(key, JSON.stringify(val));
  };

  return [storedValue, setValue];
}

// 🔐 CONFIG FIREBASE (SEU)
const firebaseConfig = {
  apiKey: "AIzaSyBIEMS3WhSNKmHsd4XTp-B3gA7vfRDyMwU",
  authDomain: "planner-full.firebaseapp.com",
  projectId: "planner-full",
  storageBucket: "planner-full.appspot.com",
  messagingSenderId: "904119329848",
  appId: "1:904119329848:web:8b3e8a0ff8f7e4f419b2cd"
};

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);

  const authRef = useRef(null);
  const dbRef = useRef(null);

  // 🔥 INIT FIREBASE CORRIGIDO
  useEffect(() => {
    try {
      const app = initializeApp(firebaseConfig);
      const auth = getAuth(app);

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
    }
  }, []);

  // 🔥 LOADING PROTECTION
  if (!authRef.current || isInitializing) {
    return (
      <div style={styles.center}>
        <h2 style={{color:"white"}}>Inicializando...</h2>
      </div>
    );
  }

  // 🔐 LOGIN SCREEN
  if (!firebaseUser) {
    return <AuthScreen auth={authRef.current} />;
  }

  // 🧠 APP PRINCIPAL
  return (
    <div style={styles.center}>
      <h1 style={{color:"white"}}>Planner Full</h1>
      <p style={{color:"white"}}>{firebaseUser.email}</p>

      <button onClick={() => signOut(authRef.current)} style={styles.button}>
        Sair
      </button>
    </div>
  );
}

// 🔐 AUTH SCREEN
const AuthScreen = ({ auth }) => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
        setError("Erro no login com Google");
      }

    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.center}>
      <h1 style={{color:"white"}}>Planner Full</h1>

      {error && <p style={{color:"red"}}>{error}</p>}

      <button onClick={handleGoogleLogin} style={styles.button}>
        {loading ? "Carregando..." : "Entrar com Google"}
      </button>
    </div>
  );
};

// 🎨 STYLE
const styles = {
  center: {
    minHeight: "100vh",
    background: "#0f172a",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center"
  },
  button: {
    marginTop: 20,
    padding: "12px 20px",
    borderRadius: 10,
    border: "none",
    cursor: "pointer",
    fontWeight: "bold"
  }
};
