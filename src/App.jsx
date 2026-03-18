import React, { useEffect, useState } from "react";
import { auth, provider } from "./firebase";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "firebase/auth";

// vibração segura
const hapticFeedback = (ms) => {
  if (navigator.vibrate) navigator.vibrate(ms);
};

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const loginGoogle = async () => {
    setError("");
    setLoading(true);
    hapticFeedback(30);

    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error(err);
      setError("Erro no login com Google");
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  if (loading) {
    return (
      <div style={styles.center}>
        <p style={{ color: "white" }}>Carregando...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={styles.center}>
        <h1 style={{ color: "white" }}>Planner Full</h1>

        {error && <p style={{ color: "red" }}>{error}</p>}

        <button onClick={loginGoogle} style={styles.button}>
          Entrar com Google
        </button>
      </div>
    );
  }

  return (
    <div style={styles.center}>
      <h2 style={{ color: "white" }}>Bem-vindo</h2>
      <p style={{ color: "white" }}>{user.email}</p>

      <button onClick={logout} style={styles.button}>
        Sair
      </button>
    </div>
  );
}

const styles = {
  center: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    background: "#0f172a"
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
