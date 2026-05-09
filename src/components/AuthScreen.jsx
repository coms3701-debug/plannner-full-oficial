import React, { useState, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  getRedirectResult,
  signInWithPopup
} from 'firebase/auth';
import { Mail, Lock, AlertCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { hapticFeedback } from '../utils/notifications';

export const AuthScreen = ({ auth }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getRedirectResult(auth)
      .then((result) => {
        if (result) {
          console.log("Login com Google bem-sucedido via redirect");
        }
      })
      .catch((err) => {
        console.error(err);
        if (err.code === 'auth/operation-not-allowed') {
          setError('ERRO: O método de login não está ativado no Firebase.');
        }
      });
  }, [auth]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    hapticFeedback(30);

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('Email ou senha incorretos.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('Este email já está registado. Escolha a opção "Faça Login".');
      } else if (err.code === 'auth/weak-password') {
        setError('A senha deve ter pelo menos 6 caracteres.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('O login por Email/Senha não está ativado no seu Firebase.');
      } else {
        setError('Ocorreu um erro de autenticação.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    hapticFeedback(30);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('O login com Google foi cancelado.');
      } else if (err.code === 'auth/popup-blocked') {
        setError('Pop-up bloqueado. O seu telemóvel não permite janelas flutuantes. Por favor, use Email e Senha.');
      } else {
        setError('Erro com o Google. O Firebase suporta o domínio atual?');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-900 flex flex-col justify-center items-center p-6 font-sans overflow-hidden relative">
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-blue-600/20 rounded-full blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-emerald-600/10 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-700 relative z-10">

        <div className="flex flex-col items-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-700 rounded-[1.5rem] flex items-center justify-center shadow-[0_10px_30px_rgba(59,130,246,0.4)] mb-5 transform rotate-3 transition-transform hover:rotate-0 duration-300">
            <span className="text-white text-4xl font-black">P</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-white flex items-center gap-2 drop-shadow-md">
            Planner<span className="text-blue-500">Full</span>
          </h1>
          <p className="text-slate-400 mt-3 text-sm text-center font-medium max-w-[280px]">
            Organize a sua vida e preserve os seus dados na nuvem oficial.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-slate-800/60 backdrop-blur-xl p-6 sm:p-8 rounded-[2rem] border border-slate-700/50 shadow-2xl space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-2xl text-sm flex items-center gap-3 animate-in shake font-medium shadow-inner">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span className="leading-tight">{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider pl-1">Email</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-700 rounded-2xl py-4 pl-12 pr-4 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all shadow-inner"
                  placeholder="seu@email.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1.5 uppercase tracking-wider pl-1">Senha</label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-blue-400 transition-colors" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-900/80 border border-slate-700 rounded-2xl py-4 pl-12 pr-4 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all shadow-inner"
                  placeholder="••••••••"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-50 text-white py-4 rounded-2xl font-bold shadow-[0_10px_20px_rgba(59,130,246,0.3)] transition-all active:scale-[0.98] mt-4 flex justify-center items-center gap-2 text-base"
          >
            {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : (isLogin ? 'Entrar no Planner' : 'Criar Conta')}
          </button>

          <div className="pt-2 text-center">
            <p className="text-sm text-slate-400 font-medium">
              {isLogin ? "Ainda não tem conta? " : "Já tem uma conta? "}
              <button
                type="button"
                onClick={() => { setIsLogin(!isLogin); setError(''); }}
                className="text-blue-400 font-bold hover:text-blue-300 transition-colors"
                disabled={loading}
              >
                {isLogin ? 'Registe-se aqui' : 'Faça Login'}
              </button>
            </p>
          </div>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-700/80"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-slate-800 text-slate-500 font-bold uppercase tracking-widest text-[10px] rounded-full">Ou</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full bg-white hover:bg-slate-100 disabled:bg-slate-300 text-slate-800 py-3.5 rounded-2xl font-bold shadow-md transition-all active:scale-[0.98] flex justify-center items-center gap-3 text-[15px]"
          >
            {loading ? <RefreshCw className="w-5 h-5 animate-spin text-blue-500" /> : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continuar com o Google
              </>
            )}
          </button>
        </form>

        <div className="mt-8 flex items-center justify-center gap-2 text-slate-500 opacity-60 text-[10px] uppercase font-bold tracking-widest">
          <ShieldCheck className="w-4 h-4" />
          <span>Segurança Firebase Oficial</span>
        </div>
      </div>
    </div>
  );
};
