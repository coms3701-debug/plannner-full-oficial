import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Home, CheckSquare, Activity, Briefcase, CalendarClock, Plus, Check, ChevronLeft, ChevronRight, 
  Trash2, Edit2, X, User, Settings, BellRing, AlertCircle, Clock, GripVertical,
  Cloud, CloudOff, RefreshCw, LogOut, Mail, Lock, ShieldCheck, ListTodo, CheckCircle2,
  Eye, EyeOff // <-- NOVOS ÍCONES IMPORTADOS AQUI
} from 'lucide-react';

// --- IMPORTS DO FIREBASE ---
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  GoogleAuthProvider,
  signInWithRedirect,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence,
  signInWithPopup
} from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

// --- UTILITÁRIOS NATIVOS E BLINDADOS ---
const hapticFeedback = (pattern = 40) => {
  try {
    if (typeof window !== 'undefined' && window.navigator && typeof window.navigator.vibrate === 'function') {
      window.navigator.vibrate(pattern);
    }
  } catch (e) {}
};

const playBeep = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); 
    gainNode.gain.setValueAtTime(0.1, ctx.currentTime); 
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {}
};

const requestNotificationPermission = () => {
  try {
    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
      Notification.requestPermission();
    }
  } catch (e) {}
};

const sendNativeNotification = (title, body) => {
  try {
    if (!("Notification" in window)) return;
    if (Notification.permission === "granted") {
      new Notification(title, { body, icon: '/icon.png' });
      playBeep();
      hapticFeedback([100, 50, 100]);
    }
  } catch (e) {}
};

// FORMATAÇÃO SEGURA DE DATAS
const parseLocalDate = (dateStr) => {
  try {
    if (!dateStr || typeof dateStr !== 'string') return new Date(0);
    if (dateStr.includes('/')) {
       const parts = dateStr.split('/');
       if (parts.length === 3) return new Date(parts[2], parts[1] - 1, parts[0]);
    }
    const [y, m, d] = dateStr.split('-');
    if (!y || !m || !d) return new Date(0);
    return new Date(y, m - 1, d);
  } catch (e) { return new Date(0); }
};

const formatDateLocal = (dateStr) => {
  try {
    if (!dateStr || typeof dateStr !== 'string') return '';
    if (dateStr.includes('/')) return dateStr; 
    const [y, m, d] = dateStr.split('-');
    if (!y || !m || !d) return dateStr;
    return `${d}/${m}/${y}`;
  } catch (e) { return ''; }
};

function useLocalStorage(key, initialValue) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      return initialValue;
    }
  });

  const setValue = (value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) { }
  };

  return [storedValue, setValue];
}

const INITIAL_HABITS_LIST = [
  { id: 'estudo', label: 'Estudo/conhecimento' },
  { id: 'reserva', label: 'Reserva de emergência' },
  { id: 'invest', label: 'Investimentos' }
];

const INITIAL_CATEGORIES = [
  { id: 'meta', label: 'Meta' },
  { id: 'pagamento', label: 'Pagamento' },
  { id: 'estudo', label: 'Estudo' },
  { id: 'investimento', label: 'Investimento' }
];

const INITIAL_PORTFOLIO_CATEGORIES = [
  { id: 'reserva', label: 'Reserva de Emergência' },
  { id: 'acoes_br', label: 'Ações Nacionais' },
  { id: 'fii', label: 'Fundos Imobiliários' }
];

const formatCurrencyInput = (value) => {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  const numberValue = Number(digits) / 100;
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numberValue);
};

const parseCurrencyToNumber = (formattedValue) => {
  if (!formattedValue) return 0;
  const digits = String(formattedValue).replace(/\D/g, '');
  return Number(digits) / 100 || 0;
};

// --- COMPONENTE DESLIZE SEGURO ---
const SwipeableItem = ({ onEdit, onDeleteRequest, children, frontClass = "bg-slate-800 border-slate-700", wrapperClass = "mb-3", isDragDisabled = false }) => {
  const [offset, setOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const isDragging = useRef(false);

  const handleStart = (e) => {
    if (isDragDisabled || !e) return;
    try {
      const tagName = typeof e?.target?.tagName === 'string' ? e.target.tagName.toLowerCase() : '';
      if (['input', 'textarea', 'button', 'select'].includes(tagName)) return;
    } catch(err) {}
    
    const isMouse = typeof e?.type === 'string' && e.type.includes('mouse');
    const clientX = isMouse ? e.clientX : (e?.touches?.[0]?.clientX || 0);
    const clientY = isMouse ? e.clientY : (e?.touches?.[0]?.clientY || 0);
    
    startX.current = clientX;
    startY.current = clientY;
    isDragging.current = true;
    setIsSwiping(true);
  };

  const handleMove = (e) => {
    if (!isDragging.current || isDragDisabled || !e) return;
    
    const isMouse = typeof e?.type === 'string' && e.type.includes('mouse');
    const clientX = isMouse ? e.clientX : (e?.touches?.[0]?.clientX || 0);
    const clientY = isMouse ? e.clientY : (e?.touches?.[0]?.clientY || 0);
    
    const diffX = clientX - startX.current;
    const diffY = clientY - startY.current;

    if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 10) {
      isDragging.current = false;
      setOffset(0);
      return;
    }
    let newOffset = diffX;
    if (newOffset > 100) newOffset = 100 + (newOffset - 100) * 0.2;
    if (newOffset < -100) newOffset = -100 + (newOffset + 100) * 0.2;
    setOffset(newOffset);
  };

  const handleEnd = () => {
    if (isDragDisabled || !isDragging.current) return;
    isDragging.current = false;
    setIsSwiping(false);
    if (offset > 70) { hapticFeedback([30, 50]); onEdit(); }
    else if (offset < -70) { hapticFeedback([30, 50]); onDeleteRequest(); }
    setOffset(0);
  };

  return (
    <div className={`relative w-full rounded-xl bg-slate-900 overflow-hidden shadow-sm ${wrapperClass}`}>
      <div className="absolute inset-0 flex justify-between items-center px-4 rounded-xl font-medium text-white pointer-events-none">
        <div className={`flex items-center gap-2 transition-all duration-200 ${offset > 20 ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'} text-blue-400`}>
          <Edit2 className="w-5 h-5" /> <span className="text-sm">Editar</span>
        </div>
        <div className={`flex items-center gap-2 transition-all duration-200 ${offset < -20 ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'} text-red-500`}>
          <span className="text-sm">Excluir</span> <Trash2 className="w-5 h-5" />
        </div>
      </div>
      <div
        onTouchStart={handleStart} onTouchMove={handleMove} onTouchEnd={handleEnd}
        onMouseDown={handleStart} onMouseMove={handleMove} onMouseUp={handleEnd} onMouseLeave={handleEnd}
        style={{ transform: `translateX(${offset}px)`, touchAction: isDragDisabled ? 'auto' : 'pan-y' }}
        className={`relative w-full rounded-xl border transition-transform ${!isSwiping ? 'duration-300 ease-out' : 'duration-0'} ${frontClass}`}
      >
        {children}
      </div>
    </div>
  );
};

const SwipeHint = () => (
  <div className="flex items-center justify-center gap-2 mb-3 mt-1 text-slate-500 opacity-70 text-[10px] uppercase font-bold tracking-widest">
    <ChevronRight className="w-3 h-3 animate-pulse" />
    <span>Deslize para gerir</span>
    <ChevronLeft className="w-3 h-3 animate-pulse" />
  </div>
);

class TabErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }
  static getDerivedStateFromError(error) { 
    return { hasError: true, errorMsg: typeof error === 'object' ? (error.message || 'Erro Desconhecido') : String(error) }; 
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-red-900/20 border border-red-500/50 rounded-2xl text-center mt-10 animate-in fade-in">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-red-400 font-black text-xl mb-2">Ops! Erro na Aba</h2>
          <p className="text-sm text-slate-300 mb-4">Ocorreu um erro interno.</p>
          <div className="p-3 bg-black/50 rounded-lg text-xs text-red-300 font-mono text-left overflow-auto mb-6 max-h-32">
            {this.state.errorMsg}
          </div>
          <button onClick={() => window.location.reload()} className="w-full bg-red-600 hover:bg-red-500 text-white py-3 rounded-xl font-bold">Recarregar Página</button>
        </div>
      );
    }
    return this.props.children; 
  }
}

// --- TELA DE LOGIN / REGISTRO PREMIUM ---
const AuthScreen = ({ auth }) => {
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
          <span>Segurança Firebase (V4.0)</span>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// APLICATIVO PRINCIPAL (APP)
// ==========================================

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  // --- CONFIGURAÇÃO DO GOOGLE FIREBASE ---
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [syncStatus, setSyncStatus] = useState('offline');
  const dbRef = useRef(null);
  const authRef = useRef(null);
  const syncTimeoutRef = useRef(null);

  // --- NOVO: ESTADO PARA OCULTAR SALDO (V4.0) ---
  const [isBalanceVisible, setIsBalanceVisible] = useLocalStorage('planner_v4_balance_visible', true);

  useEffect(() => {
    // AS SUAS CHAVES OFICIAIS DO FIREBASE
    const vercelFirebaseConfig = {
      apiKey: "AIzaSyBIEMS3WhSNKmHsd4XTp-B3gA7vfRDyMwU",
      authDomain: "planner-full.firebaseapp.com",
      projectId: "planner-full",
      storageBucket: "planner-full.firebasestorage.app",
      messagingSenderId: "904119329848",
      appId: "1:904119329848:web:8b3e8a0ff8f7e4f419b2cd"
    };

    let finalConfig = vercelFirebaseConfig;
    if (typeof __firebase_config !== 'undefined') {
      finalConfig = JSON.parse(__firebase_config);
    }

    if (!finalConfig.apiKey && !finalConfig.projectId) {
      console.warn("Chaves do Firebase não encontradas.");
      setIsInitializing(false);
      return;
    }

    const app = initializeApp(finalConfig);
    const auth = getAuth(app);
    
    setPersistence(auth, browserLocalPersistence)
      .then(() => {})
      .catch((err) => { console.warn("Aviso de persistência:", err); });

    authRef.current = auth;
    dbRef.current = getFirestore(app);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setIsInitializing(false);
      if (user) {
        setSyncStatus('online');
        loadDataFromCloud(user);
      }
    });

    return () => unsubscribe();
  }, []);

  // --- ESTADOS DO APLICATIVO ---
  const [tasksRaw, setTasks] = useLocalStorage('planner_v3_tasks', []);
  const [taskCategoriesRaw, setTaskCategories] = useLocalStorage('planner_v3_categories', INITIAL_CATEGORIES);
  const [habitsListRaw, setHabitsList] = useLocalStorage('planner_v3_habitsList', INITIAL_HABITS_LIST);
  const [habits, setHabits] = useLocalStorage('planner_v3_habits', {});
  const [dailyTasks, setDailyTasks] = useLocalStorage('planner_v3_dailyTasks', {}); 
  const [portfolioCategoriesRaw, setPortfolioCategories] = useLocalStorage('planner_v3_portfolioCats', INITIAL_PORTFOLIO_CATEGORIES);
  const [portfolioUpdateDate, setPortfolioUpdateDate] = useLocalStorage('planner_v3_portfolioDate', new Date().toISOString().split('T')[0]);
  const [prevPortfolioBalance, setPrevPortfolioBalance] = useLocalStorage('planner_v3_prevBalance', '');
  const [portfolio, setPortfolio] = useLocalStorage('planner_v3_portfolio', {});

  // Proteções de Array
  const tasks = (Array.isArray(tasksRaw) ? tasksRaw : []).filter(t => t && typeof t === 'object' && t.id);
  const taskCategories = (Array.isArray(taskCategoriesRaw) ? taskCategoriesRaw : INITIAL_CATEGORIES).filter(c => c && typeof c === 'object' && c.id);
  const habitsList = (Array.isArray(habitsListRaw) ? habitsListRaw : INITIAL_HABITS_LIST).filter(h => h && typeof h === 'object' && h.id);
  const portfolioCategories = (Array.isArray(portfolioCategoriesRaw) ? portfolioCategoriesRaw : INITIAL_PORTFOLIO_CATEGORIES).filter(c => c && typeof c === 'object' && c.id);
  const safeHabits = typeof habits === 'object' && habits !== null && !Array.isArray(habits) ? habits : {};
  const safeDailyTasks = typeof dailyTasks === 'object' && dailyTasks !== null && !Array.isArray(dailyTasks) ? dailyTasks : {};
  const safePortfolio = typeof portfolio === 'object' && portfolio !== null && !Array.isArray(portfolio) ? portfolio : {};

  // Estados de Interface
  const [isEditingCategories, setIsEditingCategories] = useState(false);
  const [newCategoryLabel, setNewCategoryLabel] = useState('');
  const [showAddTask, setShowAddTask] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [newTask, setNewTask] = useState({ title: '', category: 'meta', dueDate: '', dueTime: '', hasReminder: false, recurrence: 'none' });
  const [showAddHabit, setShowAddHabit] = useState(false);
  const [newHabitLabel, setNewHabitLabel] = useState('');
  const [newDailyTask, setNewDailyTask] = useState('');
  const [newDailyTaskTime, setNewDailyTaskTime] = useState('');
  const [newDailyTaskReminder, setNewDailyTaskReminder] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date()); 
  const [isEditingPortfolioCats, setIsEditingPortfolioCats] = useState(false);
  const [newPortfolioCatLabel, setNewPortfolioCatLabel] = useState('');
  const [deletePrompt, setDeletePrompt] = useState(null); 
  const [editPrompt, setEditPrompt] = useState(null); 
  const [activeDailyDrag, setActiveDailyDrag] = useState(null);

  // --- LÓGICA DE SINCRONIZAÇÃO COM A NUVEM ---
  const loadDataFromCloud = async (user) => {
    if (!dbRef.current || !user) return;
    setSyncStatus('syncing');
    try {
      // IMPORTANTE: MANTIDO 'main_v3' PARA NÃO PERDER NENHUM DADO ANTERIOR
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'planner-v3';
      const docPath = doc(dbRef.current, 'artifacts', appId, 'users', user.uid, 'plannerData', 'main_v3');
      const snapshot = await getDoc(docPath);
      
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.tasks) setTasks(data.tasks);
        if (data.taskCategories) setTaskCategories(data.taskCategories);
        if (data.habitsList) setHabitsList(data.habitsList);
        if (data.habits !== undefined) setHabits(data.habits || {});
        if (data.dailyTasks !== undefined) setDailyTasks(data.dailyTasks || {});
        if (data.portfolioCategories) setPortfolioCategories(data.portfolioCategories);
        if (data.portfolio) setPortfolio(data.portfolio);
        if (data.portfolioUpdateDate) setPortfolioUpdateDate(data.portfolioUpdateDate);
        if (data.prevPortfolioBalance) setPrevPortfolioBalance(data.prevPortfolioBalance);
      }
      setSyncStatus('online');
    } catch (error) {
      console.error("Erro ao carregar da nuvem:", error);
      setSyncStatus('offline');
    }
  };

  useEffect(() => {
    if (!firebaseUser || !dbRef.current) return;

    const saveDataToCloud = async () => {
      setSyncStatus('syncing');
      try {
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'planner-v3';
        const docPath = doc(dbRef.current, 'artifacts', appId, 'users', firebaseUser.uid, 'plannerData', 'main_v3');
        await setDoc(docPath, {
          tasks, taskCategories, habitsList, habits, dailyTasks, 
          portfolioCategories, portfolio, portfolioUpdateDate, prevPortfolioBalance,
          lastUpdated: new Date().toISOString()
        }, { merge: true });
        setSyncStatus('online');
      } catch (error) {
        console.error("Erro ao salvar na nuvem:", error);
        setSyncStatus('offline');
      }
    };

    clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => { saveDataToCloud(); }, 2000);
    return () => clearTimeout(syncTimeoutRef.current);
  }, [tasks, taskCategories, habitsList, habits, dailyTasks, portfolioCategories, portfolio, portfolioUpdateDate, prevPortfolioBalance, firebaseUser]);

  // --- LOGOUT ---
  const handleLogout = async () => {
    if (authRef.current) {
      await signOut(authRef.current);
      setIsSidebarOpen(false);
      setTasks([]);
      setHabits({});
      setDailyTasks({});
      setPortfolio({});
    }
  };

  // --- PWA E ALERTAS ---
  const todayObj = new Date(); 
  todayObj.setHours(0, 0, 0, 0);
  const todayStr = new Date(todayObj.getTime() - (todayObj.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      let updatedTasks = false;
      const newTasks = tasks.map(task => {
        if (!task || task.completed || !task.hasReminder || !task.dueDate || !task.dueTime) return task;
        try {
          const [y, m, d] = task.dueDate.split('-');
          const [h, min] = task.dueTime.split(':');
          const taskDateTime = new Date(y, m-1, d, h, min);
          const diffMs = taskDateTime - now;
          const diffHours = diffMs / (1000 * 60 * 60);

          let t = { ...task };
          if (diffHours <= 24 && diffHours > 23 && !t.notif1d) {
            sendNativeNotification("Metas de Amanhã", `Alerta: ${t.title}`);
            t.notif1d = true; updatedTasks = true;
          }
          if (diffHours <= 1 && diffHours > 0 && !t.notif1h) {
            sendNativeNotification("Atenção", `A meta "${t.title}" vence em 1 hora!`);
            t.notif1h = true; updatedTasks = true;
          }
          return t;
        } catch(e) { return task; }
      });
      if (updatedTasks) setTasks(newTasks);
    }, 60000); 
    return () => clearInterval(interval);
  }, [tasks]);

  const getTaskStatus = (dueDateStr, completed) => {
    if (completed) return 'completed';
    const dueDate = parseLocalDate(dueDateStr);
    const diffTime = Math.ceil((dueDate - todayObj) / (1000 * 60 * 60 * 24));
    if (diffTime < 0) return 'overdue';
    if (diffTime === 0) return 'today';
    if (diffTime <= 3) return 'upcoming-urgent'; 
    if (diffTime <= 7) return 'upcoming';      
    return 'normal';
  };

  const getStatusColors = (status) => {
    const dict = {
      'overdue': 'border-red-500/50 bg-[#2a1616] text-red-400',
      'today': 'border-blue-500/40 bg-blue-500/10 text-blue-400',
      'upcoming-urgent': 'border-yellow-500/40 bg-[#2a2411] text-yellow-400',
      'upcoming': 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
      'normal': 'border-slate-700 bg-slate-800 text-slate-300',
      'completed': 'border-slate-800 bg-slate-900 opacity-60 text-slate-500 line-through'
    };
    return dict[status] || dict['normal'];
  };

  const dashboardAgendaTasks = useMemo(() => {
    return [...tasks].filter(t => {
      if (!t || typeof t !== 'object') return false;
      const isCompletedToday = t.completed && parseLocalDate(t.dueDate).getTime() === todayObj.getTime();
      return !t.completed || isCompletedToday; 
    }).sort((a, b) => {
      const dateA = parseLocalDate(a?.dueDate).getTime();
      const dateB = parseLocalDate(b?.dueDate).getTime();
      if (isNaN(dateA) && isNaN(dateB)) return 0;
      if (isNaN(dateA)) return 1;
      if (isNaN(dateB)) return -1;
      return dateA - dateB;
    });
  }, [tasks, todayObj]);

  const sortedTasksGlobally = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const dateA = parseLocalDate(a.dueDate).getTime();
      const dateB = parseLocalDate(b.dueDate).getTime();
      if (isNaN(dateA) && isNaN(dateB)) return 0;
      if (isNaN(dateA)) return 1;
      if (isNaN(dateB)) return -1;
      return dateA - dateB;
    });
  }, [tasks]);

  const dayTasksForDashboard = Array.isArray(safeDailyTasks[todayStr]) ? safeDailyTasks[todayStr] : [];
  const hasUrgentTasks = dayTasksForDashboard.some(t => t && !t.completed) || dashboardAgendaTasks.some(t => t && !t.completed && (getTaskStatus(t.dueDate, false) === 'today' || getTaskStatus(t.dueDate, false) === 'overdue'));

  const currentPortfolioTotal = portfolioCategories.reduce((acc, cat) => acc + parseCurrencyToNumber(safePortfolio[cat.id]), 0);
  const prevTotalNum = parseCurrencyToNumber(prevPortfolioBalance);
  const portfolioDifference = currentPortfolioTotal - prevTotalNum;
  const isPortfolioPositive = portfolioDifference >= 0;

  // --- HANDLERS PRINCIPAIS ---
  const confirmDelete = () => {
    if (!deletePrompt) return;
    if (deletePrompt.type === 'task') {
      setTasks(tasks.filter(t => t.id !== deletePrompt.id));
    } else if (deletePrompt.type === 'habit') {
      setHabitsList(habitsList.filter(h => h.id !== deletePrompt.id));
    } else if (deletePrompt.type === 'category') {
      setTaskCategories(taskCategories.filter(c => c.id !== deletePrompt.id));
      if (newTask.category === deletePrompt.id) setNewTask({ ...newTask, category: taskCategories[0]?.id || '' });
    } else if (deletePrompt.type === 'portfolioCat') {
      setPortfolioCategories(portfolioCategories.filter(c => c.id !== deletePrompt.id));
    } else if (deletePrompt.type === 'dailyTask') {
      setDailyTasks(prev => ({ ...prev, [deletePrompt.dateStr]: (prev[deletePrompt.dateStr] || []).filter(t => t.id !== deletePrompt.id) }));
    }
    setDeletePrompt(null);
  };

  const handleSaveSimpleEdit = (e) => {
    e.preventDefault();
    if (!editPrompt || !editPrompt.label.trim()) return;
    if (editPrompt.type === 'habit') {
      setHabitsList(habitsList.map(h => h.id === editPrompt.id ? { ...h, label: editPrompt.label } : h));
    } else if (editPrompt.type === 'category') {
      setTaskCategories(taskCategories.map(c => c.id === editPrompt.id ? { ...c, label: editPrompt.label } : c));
    } else if (editPrompt.type === 'portfolioCat') {
      setPortfolioCategories(portfolioCategories.map(c => c.id === editPrompt.id ? { ...c, label: editPrompt.label } : c));
    } else if (editPrompt.type === 'dailyTask') {
      setDailyTasks(prev => {
        const dStr = editPrompt.dateStr;
        const dayList = prev[dStr] || [];
        return { ...prev, [dStr]: dayList.map(t => t.id === editPrompt.id ? { ...t, text: editPrompt.label, time: editPrompt.time } : t) };
      });
    }
    setEditPrompt(null);
  };

  const calculateNextDate = (dateStr, recurrence) => {
    const d = parseLocalDate(dateStr); 
    if (recurrence === 'daily') d.setDate(d.getDate() + 1);
    if (recurrence === 'weekly') d.setDate(d.getDate() + 7);
    if (recurrence === 'monthly') d.setMonth(d.getMonth() + 1);
    if (recurrence === 'yearly') d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split('T')[0];
  };

  const toggleTask = (id) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    if (!task.completed && task.recurrence && task.recurrence !== 'none') {
       const nextDate = calculateNextDate(task.dueDate, task.recurrence);
       const nextTask = { ...task, id: Date.now(), dueDate: nextDate, completed: false };
       const updatedCurrent = { ...task, completed: true, recurrence: 'none' };
       setTasks(prev => prev.map(t => t.id === id ? updatedCurrent : t).concat(nextTask));
    } else {
       setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
    }
  };

  const handleSaveTask = (e) => {
    e.preventDefault();
    if (!newTask.title || !newTask.dueDate || !newTask.category) return;
    if (editingTaskId) {
      setTasks(tasks.map(t => t.id === editingTaskId ? { ...t, ...newTask } : t));
    } else {
      setTasks([...tasks, { ...newTask, id: Date.now(), completed: false }]);
    }
    setNewTask({ title: '', category: taskCategories[0]?.id || 'meta', dueDate: '', dueTime: '', recurrence: 'none', hasReminder: false });
    setShowAddTask(false);
    setEditingTaskId(null);
  };

  const startEditTask = (task) => {
    setNewTask({ title: task.title, category: task.category, dueDate: task.dueDate, dueTime: task.dueTime || '', recurrence: task.recurrence || 'none', hasReminder: task.hasReminder || false });
    setEditingTaskId(task.id);
    setShowAddTask(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEditTask = () => {
    setNewTask({ title: '', category: taskCategories[0]?.id || 'meta', dueDate: '', recurrence: 'none' });
    setEditingTaskId(null);
    setShowAddTask(false);
    setIsEditingCategories(false);
  };

  const handleAddCategory = () => {
    if (!newCategoryLabel.trim()) return;
    const newId = newCategoryLabel.trim().toLowerCase().replace(/\s+/g, '_');
    if (!taskCategories.some(c => c.id === newId)) {
      setTaskCategories([...taskCategories, { id: newId, label: newCategoryLabel.trim() }]);
    }
    setNewCategoryLabel('');
  };

  const handleAddHabit = (e) => {
    e.preventDefault();
    if (!newHabitLabel.trim()) return;
    setHabitsList([...habitsList, { id: `habit_${Date.now()}`, label: newHabitLabel.trim() }]);
    setNewHabitLabel('');
    setShowAddHabit(false);
  };

  const toggleHabit = (dateStr, habitId) => {
    setHabits(prev => {
      const safePrev = prev || {};
      return {
        ...safePrev,
        [dateStr]: {
          ...(safePrev[dateStr] || {}),
          [habitId]: !(safePrev[dateStr]?.[habitId])
        }
      };
    });
  };

  const handleAddDailyTask = (e) => {
    e.preventDefault();
    if (!newDailyTask.trim()) return;
    const dateStr = selectedDate.toISOString().split('T')[0];
    const nTask = { id: Date.now(), text: newDailyTask.trim(), time: newDailyTaskTime, hasReminder: newDailyTaskReminder, completed: false };
    setDailyTasks(prev => ({ ...prev, [dateStr]: [...(prev[dateStr] || []), nTask] }));
    setNewDailyTask('');
    setNewDailyTaskTime('');
    setNewDailyTaskReminder(false);
    if(newDailyTaskReminder) requestNotificationPermission();
  };

  const toggleDailyTask = (dateStr, taskId) => {
    setDailyTasks(prev => ({ ...prev, [dateStr]: (prev[dateStr] || []).map(t => t.id === taskId ? { ...t, completed: !t.completed } : t) }));
  };

  // --- DRAG AND DROP (TAREFAS DIÁRIAS) ---
  const draggingDailyId = useRef(null);
  const handleDailyDragStart = (e, id) => {
    e.stopPropagation();
    draggingDailyId.current = id;
    setActiveDailyDrag(id);
    hapticFeedback(20);
  };
  const handleDailyDragMove = (e) => {
    if (!draggingDailyId.current) return;
    e.preventDefault();
    const isMouse = typeof e?.type === 'string' && e.type.includes('mouse');
    const clientX = isMouse ? e.clientX : (e?.touches?.[0]?.clientX || 0);
    const clientY = isMouse ? e.clientY : (e?.touches?.[0]?.clientY || 0);
    const targetElement = document.elementFromPoint(clientX, clientY);
    const dropZone = targetElement?.closest('[data-daily-drag-id]');
    if (dropZone && dropZone.dataset.dailyDragId !== String(draggingDailyId.current)) {
      const targetId = Number(dropZone.dataset.dailyDragId);
      setDailyTasks(prev => {
        const activeStr = selectedDate ? selectedDate.toISOString().split('T')[0] : todayStr;
        const todayList = prev[activeStr] || [];
        const arr = [...todayList];
        const idx1 = arr.findIndex(t => t && t.id === draggingDailyId.current);
        const idx2 = arr.findIndex(t => t && t.id === targetId);
        if (idx1 >= 0 && idx2 >= 0) {
          const temp = arr[idx1];
          arr.splice(idx1, 1);
          arr.splice(idx2, 0, temp);
          return { ...prev, [activeStr]: arr };
        }
        return prev;
      });
      hapticFeedback(15);
    }
  };
  const handleDailyDragEnd = (e) => {
    e.stopPropagation();
    if (draggingDailyId.current) hapticFeedback(20);
    draggingDailyId.current = null;
    setActiveDailyDrag(null);
  };

  // --- ECRÃS DE VISUALIZAÇÃO ---
  const renderDashboard = () => (
    <div className="animate-in fade-in pb-20 relative space-y-8">
      <div className="bg-slate-800 p-5 rounded-3xl border border-emerald-500/40 shadow-[0_15px_40px_-10px_rgba(16,185,129,0.25)] relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-6 -mt-6 w-32 h-32 bg-emerald-500/20 rounded-full blur-2xl pointer-events-none"></div>
        <div className="relative z-10 flex flex-col justify-center">
          
          {/* TÍTULO E BOTÃO DE OCULTAR SALDO V4.0 */}
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400/90 flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5"/> Total Investido
            </p>
            <button 
              onClick={() => { setIsBalanceVisible(!isBalanceVisible); hapticFeedback(10); }} 
              className="p-1.5 text-emerald-400/80 hover:text-emerald-300 transition-colors rounded-full hover:bg-emerald-500/10 active:scale-90"
            >
              {isBalanceVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
          </div>
          
          <p className="text-3xl sm:text-4xl font-bold font-mono tracking-tighter break-words text-white drop-shadow-md">
            {isBalanceVisible 
              ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(currentPortfolioTotal)
              : 'R$ •••••'
            }
          </p>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-bold uppercase tracking-widest text-blue-400 mb-4 px-1 flex items-center gap-2"><AlertCircle className="w-4 h-4" /> Foco do Dia</h2>
        {dayTasksForDashboard.length === 0 ? (
          <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl text-center border-dashed"><p className="text-slate-400 font-medium text-sm">A sua lista de foco está limpa! ✨</p></div>
        ) : (
          <div className="space-y-2">
            {dayTasksForDashboard.map(task => {
              const isDraggingThis = activeDailyDrag === task.id;
              const dragClasses = isDraggingThis ? 'scale-[1.02] shadow-2xl shadow-blue-500/20 ring-1 ring-blue-500 z-50 rounded-xl transition-all duration-200' : 'transition-all duration-200';
              return (
                <div key={task.id} data-daily-drag-id={task.id} className={dragClasses}>
                  <SwipeableItem 
                    onEdit={() => setEditPrompt({ type: 'dailyTask', id: task.id, label: task.text, dateStr: todayStr, time: task.time || '' })} 
                    onDeleteRequest={() => setDeletePrompt({ type: 'dailyTask', id: task.id, title: task.text, dateStr: todayStr })} 
                    frontClass="bg-slate-800/80 border-slate-700/80 p-3.5 flex items-center justify-between" wrapperClass="mb-0"
                  >
                    <label className="flex items-center gap-3 cursor-pointer flex-1 w-full min-w-0 pr-2">
                      <div className="relative flex items-center justify-center w-6 h-6 shrink-0">
                        <input type="checkbox" checked={!!task.completed} onChange={() => toggleDailyTask(todayStr, task.id)} className="peer sr-only"/>
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-200 active:scale-75 ${task.completed ? 'bg-blue-500 border-blue-500' : 'border-slate-500'}`}>{task.completed && <Check className="w-3.5 h-3.5 text-white" />}</div>
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className={`text-sm font-medium truncate transition-colors ${task.completed ? 'text-slate-500 line-through' : 'text-slate-200'}`}>{task.text}</span>
                        {(task.time || task.hasReminder) && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {task.time && <span className="text-[10px] text-blue-400 font-mono tracking-wider bg-blue-500/10 px-1 rounded flex items-center gap-0.5"><Clock className="w-2.5 h-2.5"/> {task.time}</span>}
                            {task.hasReminder && !task.completed && <BellRing className="w-2.5 h-2.5 text-blue-400" />}
                          </div>
                        )}
                      </div>
                    </label>
                    {!task.completed && <div className="p-3 -mr-3 cursor-grab text-slate-500 hover:text-blue-400 transition-colors" style={{ touchAction: 'none' }} onTouchStart={(e) => handleDailyDragStart(e, task.id)} onTouchMove={handleDailyDragMove} onTouchEnd={handleDailyDragEnd} onMouseDown={(e) => handleDailyDragStart(e, task.id)} onMouseMove={handleDailyDragMove} onMouseUp={handleDailyDragEnd} onMouseLeave={handleDailyDragEnd}><GripVertical className="w-5 h-5 pointer-events-none" /></div>}
                  </SwipeableItem>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4 px-1 flex items-center gap-2"><CalendarClock className="w-4 h-4" /> Próximos Dias</h2>
        {dashboardAgendaTasks.length > 0 ? (
          <div className="space-y-2 opacity-95">
            {dashboardAgendaTasks.map(task => {
              const status = getTaskStatus(task.dueDate, task.completed);
              return (
                <SwipeableItem key={task.id} onEdit={() => startEditTask(task)} onDeleteRequest={() => setDeletePrompt({ type: 'task', id: task.id, title: task.title })} frontClass={`${getStatusColors(status)} p-4 flex items-center gap-3`} wrapperClass="mb-0">
                  <button onClick={() => toggleTask(task.id)} className={`w-6 h-6 rounded-md border flex items-center justify-center transition-all duration-300 shrink-0 active:scale-75 ${task.completed ? 'bg-blue-600 border-blue-600' : 'border-slate-500'}`}>{task.completed && <Check className="w-4 h-4 text-white" />}</button>
                  <div className="flex-1 min-w-0 pointer-events-none">
                    <h3 className={`font-medium text-sm truncate transition-colors ${task.completed ? 'line-through text-slate-500' : ''}`}>{task.title}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[11px] opacity-70 font-mono">{formatDateLocal(task.dueDate)} {task.dueTime ? `• ${task.dueTime}` : ''}</p>
                      {status === 'overdue' && !task.completed && <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider bg-red-500/10 px-1 rounded">Atrasada</span>}
                      {status === 'today' && !task.completed && <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider bg-blue-500/10 px-1 rounded">Hoje</span>}
                    </div>
                  </div>
                </SwipeableItem>
              );
            })}
          </div>
        ) : <p className="text-sm text-slate-500 italic px-2">Sem tarefas pendentes.</p>}
      </div>
    </div>
  );

  const renderTasks = () => (
    <div className="space-y-6 animate-in fade-in pb-20">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Agenda Completa</h1>
        <button onClick={() => { cancelEditTask(); setShowAddTask(true); hapticFeedback(30); }} className="bg-blue-600 text-white p-2 rounded-full transition-colors shadow-lg shadow-blue-500/30 active:scale-95"><Plus className="w-5 h-5" /></button>
      </div>

      {showAddTask && (
        <form onSubmit={handleSaveTask} className="bg-slate-800 p-5 rounded-3xl border border-slate-700 mb-6 space-y-5 shadow-lg">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Título da Tarefa</label>
            <input type="text" required className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-blue-500" value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})} placeholder="Ex: Reunião" />
          </div>
          <div className="flex gap-4">
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Data</label>
              <input type="date" required className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white outline-none color-scheme-dark focus:border-blue-500" value={newTask.dueDate} onChange={e => setNewTask({...newTask, dueDate: e.target.value})} />
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Hora (Op)</label>
              <input type="time" className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white outline-none color-scheme-dark focus:border-blue-500" value={newTask.dueTime} onChange={e => setNewTask({...newTask, dueTime: e.target.value})} />
            </div>
          </div>
          <div className="flex gap-4">
             <div className="flex-1 min-w-0">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Recorrência</label>
              <select className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white outline-none focus:border-blue-500" value={newTask.recurrence} onChange={e => setNewTask({...newTask, recurrence: e.target.value})}>
                <option value="none">Nenhuma</option><option value="daily">Diária</option><option value="weekly">Semanal</option><option value="monthly">Mensal</option>
              </select>
             </div>
          </div>
          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Categoria</label>
              <button type="button" onClick={() => setIsEditingCategories(!isEditingCategories)} className="text-xs font-medium text-blue-400 bg-blue-500/10 px-2 py-1 rounded-md">{isEditingCategories ? 'Concluir' : 'Editar Lista'}</button>
            </div>
            {isEditingCategories ? (
              <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 space-y-2">
                <SwipeHint />
                <div className="max-h-36 overflow-y-auto space-y-2 pr-2">
                  {taskCategories.map(cat => (
                    <SwipeableItem key={cat.id} wrapperClass="mb-0" frontClass="p-2.5 bg-slate-800 border-slate-700 flex justify-between" onEdit={() => setEditPrompt({ type: 'category', id: cat.id, label: cat.label })} onDeleteRequest={() => setDeletePrompt({ type: 'category', id: cat.id, title: cat.label })}>
                      <span className="text-slate-200 truncate pr-2 font-medium w-full">{cat.label}</span>
                    </SwipeableItem>
                  ))}
                </div>
                <div className="flex gap-2 mt-2 pt-2 border-t border-slate-700/50">
                  <input type="text" value={newCategoryLabel} onChange={e => setNewCategoryLabel(e.target.value)} className="flex-1 bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-sm text-white" placeholder="Nova..." />
                  <button type="button" onClick={() => { if(newCategoryLabel) { setTaskCategories([...taskCategories, {id: Date.now().toString(), label: newCategoryLabel}]); setNewCategoryLabel(''); } }} className="bg-blue-600 text-white px-4 rounded-lg text-sm font-medium">Add</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar">
                {taskCategories.map(cat => (
                  <button key={cat.id} type="button" onClick={() => setNewTask({...newTask, category: cat.id})} className={`shrink-0 px-5 py-2.5 rounded-full text-sm font-bold border-2 transition-all active:scale-95 ${newTask.category === cat.id ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>{cat.label}</button>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-3 pt-2 border-t border-slate-700/50">
            <button type="button" onClick={cancelEditTask} className="px-5 py-3 bg-slate-800 text-slate-300 rounded-xl font-medium">Cancelar</button>
            <button type="submit" className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-500/30">Salvar Tarefa</button>
          </div>
        </form>
      )}

      <div className="space-y-1">
        {tasks.length > 0 && !showAddTask && <SwipeHint />}
        {sortedTasksGlobally.map(task => {
          const status = getTaskStatus(task.dueDate, task.completed);
          const classStr = getStatusColors(status);
          const categoryObj = taskCategories.find(c => c.id === task.category);
          return (
            <SwipeableItem key={task.id} onEdit={() => startEditTask(task)} onDeleteRequest={() => setDeletePrompt({ type: 'task', id: task.id, title: task.title })} frontClass={`${classStr} p-4 flex items-center gap-4`}>
              <button onClick={() => toggleTask(task.id)} className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 active:scale-75 ${task.completed ? 'bg-blue-600 border-blue-600' : 'border-slate-500'}`}>{task.completed && <Check className="w-4 h-4 text-white" />}</button>
              <div className="flex-1 min-w-0 pointer-events-none">
                <h3 className={`font-bold truncate ${task.completed ? 'line-through text-slate-500' : ''}`}>{task.title}</h3>
                <p className="text-xs flex items-center gap-2 mt-1 opacity-80"><span className="capitalize">{categoryObj?.label || 'Geral'}</span><span>•</span><span>{formatDateLocal(task.dueDate)} {task.dueTime}</span></p>
              </div>
            </SwipeableItem>
          );
        })}
      </div>
    </div>
  );

  const renderRoutine = () => {
    const dateStr = selectedDate.toISOString().split('T')[0];
    const dayHabits = safeHabits[dateStr] || {};
    const dayTasks = Array.isArray(safeDailyTasks[dateStr]) ? safeDailyTasks[dateStr] : [];
    const totalItems = habitsList.length + dayTasks.length;
    const completedItems = habitsList.filter(h => dayHabits[h.id]).length + dayTasks.filter(t => t.completed).length;
    const progressPercent = totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100);

    return (
      <div className="space-y-6 animate-in fade-in pb-20">
        <div className="flex items-center justify-between bg-slate-800 p-4 rounded-2xl border border-slate-700 shadow-md">
          <button onClick={() => {const d=new Date(selectedDate); d.setDate(d.getDate()-1); setSelectedDate(d);}} className="p-2 text-slate-400 hover:text-white"><ChevronLeft /></button>
          <div className="text-center"><p className="text-sm font-semibold text-blue-400 uppercase tracking-widest">{selectedDate.toLocaleDateString('pt-BR', { weekday: 'long' })}</p><p className="text-xl font-bold text-white">{selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}</p></div>
          <button onClick={() => {const d=new Date(selectedDate); d.setDate(d.getDate()+1); setSelectedDate(d);}} className="p-2 text-slate-400 hover:text-white"><ChevronRight /></button>
        </div>

        <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 relative overflow-hidden">
          <div className="flex justify-between items-end mb-2 relative z-10">
            <div><p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Progresso</p><p className="text-sm font-medium text-slate-300">{completedItems} de {totalItems}</p></div>
            <span className="text-2xl font-bold font-mono text-blue-400">{progressPercent}%</span>
          </div>
          <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden"><div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${progressPercent}%` }}></div></div>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2 px-1"><CheckCircle2 className="w-4 h-4 text-blue-400" /> Foco do Dia</h2>
          <form onSubmit={handleAddDailyTask} className="bg-slate-800/60 border border-slate-700/60 p-3 rounded-xl flex flex-col gap-2">
            <input type="text" className="w-full bg-transparent p-2 text-sm text-white placeholder:text-slate-500 outline-none" value={newDailyTask} onChange={e => setNewDailyTask(e.target.value)} placeholder="Compromisso rápido..." />
            <div className="flex items-center justify-between border-t border-slate-700/50 pt-2 px-1">
              <div className="flex items-center gap-2">
                <input type="time" value={newDailyTaskTime} onChange={e => setNewDailyTaskTime(e.target.value)} className="bg-slate-900 border border-slate-700 text-xs text-slate-300 rounded-lg p-1.5 outline-none color-scheme-dark"/>
              </div>
              <button type="submit" disabled={!newDailyTask.trim()} className="bg-blue-600 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-sm font-bold">Add</button>
            </div>
          </form>

          <div className="space-y-2 mt-3">
            {dayTasks.map(task => (
              <div key={task.id} data-daily-drag-id={task.id} className={activeDailyDrag === task.id ? 'scale-[1.02] shadow-2xl ring-1 ring-blue-500 z-50 rounded-xl' : 'transition-all duration-200'}>
                <SwipeableItem onEdit={() => setEditPrompt({ type: 'dailyTask', id: task.id, label: task.text, dateStr: dateStr, time: task.time || '' })} onDeleteRequest={() => setDeletePrompt({ type: 'dailyTask', id: task.id, title: task.text, dateStr: dateStr })} frontClass="bg-slate-800/80 border-slate-700/80 p-3.5 flex items-center justify-between" wrapperClass="mb-0">
                  <label className="flex items-center gap-3 cursor-pointer flex-1 w-full min-w-0 pr-2">
                    <div className="relative flex items-center justify-center w-6 h-6 shrink-0">
                      <input type="checkbox" checked={!!task.completed} onChange={() => toggleDailyTask(dateStr, task.id)} className="peer sr-only"/>
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${task.completed ? 'bg-blue-500 border-blue-500' : 'border-slate-500'}`}>{task.completed && <Check className="w-3.5 h-3.5 text-white" />}</div>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className={`text-sm font-medium truncate ${task.completed ? 'text-slate-500 line-through' : 'text-slate-200'}`}>{task.text}</span>
                      {task.time && <div className="flex items-center gap-1.5 mt-0.5"><span className="text-[10px] text-blue-400 font-mono bg-blue-500/10 px-1 rounded flex items-center gap-0.5"><Clock className="w-2.5 h-2.5"/> {task.time}</span></div>}
                    </div>
                  </label>
                  {!task.completed && <div className="p-3 -mr-3 cursor-grab text-slate-500 hover:text-blue-400" onTouchStart={(e) => handleDailyDragStart(e, task.id)} onTouchMove={handleDailyDragMove} onTouchEnd={handleDailyDragEnd} onMouseDown={(e) => handleDailyDragStart(e, task.id)} onMouseMove={handleDailyDragMove} onMouseUp={handleDailyDragEnd}><GripVertical className="w-5 h-5 pointer-events-none" /></div>}
                </SwipeableItem>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3 pt-4 border-t border-slate-800">
          <div className="flex justify-between items-center px-1">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-400" /> Hábitos Fixos</h2>
            <button onClick={() => setShowAddHabit(!showAddHabit)} className="text-xs font-medium text-blue-400 bg-blue-500/10 px-2 py-1 rounded-md">{showAddHabit ? 'Concluir' : 'Editar'}</button>
          </div>
          {showAddHabit && (
            <form onSubmit={e => { e.preventDefault(); if(newHabitLabel.trim()){ setHabitsList([...habitsList, {id: `hab_${Date.now()}`, label: newHabitLabel.trim()}]); setNewHabitLabel(''); setShowAddHabit(false); } }} className="bg-slate-800 p-3.5 rounded-xl border border-slate-700 mb-4 flex gap-2">
              <input type="text" required className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white" value={newHabitLabel} onChange={e => setNewHabitLabel(e.target.value)} placeholder="Novo hábito..." />
              <button type="submit" className="bg-emerald-600 text-white px-4 rounded-lg text-sm font-medium">Salvar</button>
            </form>
          )}
          <div className="space-y-2">
            {habitsList.map(habit => {
              const isDone = !!dayHabits[habit.id];
              return (
                <SwipeableItem key={habit.id} frontClass="bg-slate-800 border-slate-700 p-4 flex items-center justify-between" wrapperClass="mb-0" onEdit={() => setEditPrompt({ type: 'habit', id: habit.id, label: habit.label })} onDeleteRequest={() => setDeletePrompt({ type: 'habit', id: habit.id, title: habit.label })}>
                  <label className="flex items-center gap-4 cursor-pointer flex-1 w-full">
                    <div className="relative flex items-center justify-center w-8 h-8 shrink-0">
                      <input type="checkbox" checked={isDone} onChange={() => { setHabits(prev => { const p = prev || {}; return { ...p, [dateStr]: { ...(p[dateStr] || {}), [habit.id]: !p[dateStr]?.[habit.id] } }; }); }} className="peer sr-only" />
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isDone ? 'bg-emerald-500 border-emerald-500' : 'border-slate-500'}`}>{isDone && <Check className="w-4 h-4 text-white" />}</div>
                    </div>
                    <span className={`text-base font-medium ${isDone ? 'text-slate-500 line-through' : 'text-slate-200'}`}>{habit.label}</span>
                  </label>
                </SwipeableItem>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderPortfolio = () => (
    <div className="space-y-6 animate-in fade-in pb-20">
      <header className="flex justify-between items-start mb-6">
        <div><h1 className="text-2xl font-bold text-slate-100">Ativos</h1><p className="text-slate-400">Distribuição do património.</p></div>
        <button onClick={() => setIsEditingPortfolioCats(!isEditingPortfolioCats)} className={`p-2 rounded-full ${isEditingPortfolioCats ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'}`}><Edit2 className="w-5 h-5" /></button>
      </header>

      <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex items-center justify-between">
        <label className="text-sm font-semibold text-slate-300">Data Base</label>
        <input type="date" value={portfolioUpdateDate} onChange={e => setPortfolioUpdateDate(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-white text-sm color-scheme-dark" />
      </div>

      {isEditingPortfolioCats ? (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-2">
          <SwipeHint />
          <div className="max-h-64 overflow-y-auto space-y-2">
            {portfolioCategories.map(cat => (
              <SwipeableItem key={cat.id} wrapperClass="mb-0" frontClass="p-3 bg-slate-900 border-slate-700 flex justify-between" onEdit={() => setEditPrompt({ type: 'portfolioCat', id: cat.id, label: cat.label })} onDeleteRequest={() => setDeletePrompt({ type: 'portfolioCat', id: cat.id, title: cat.label })}>
                <span className="text-slate-200 truncate pr-2 font-medium">{cat.label}</span>
              </SwipeableItem>
            ))}
          </div>
          <div className="flex gap-2 mt-2 pt-4 border-t border-slate-700/50">
            <input type="text" value={newPortfolioCatLabel} onChange={e => setNewPortfolioCatLabel(e.target.value)} className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white" placeholder="Novo ativo..." />
            <button type="button" onClick={() => { if(newPortfolioCatLabel.trim()){ setPortfolioCategories([...portfolioCategories, {id: `port_${Date.now()}`, label: newPortfolioCatLabel.trim()}]); setNewPortfolioCatLabel('');} }} className="bg-blue-600 text-white px-4 rounded-lg text-sm font-medium">Add</button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {portfolioCategories.map(cat => (
            <div key={cat.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700 flex flex-col justify-between">
              <label className="text-[11px] font-bold text-slate-400 uppercase mb-2 truncate">{cat.label}</label>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 font-medium text-[13px]">R$</span>
                <input type="text" inputMode="numeric" placeholder="0,00" value={safePortfolio[cat.id] || ''} onChange={e => setPortfolio(prev => ({...prev, [cat.id]: formatCurrencyInput(e.target.value)}))} className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2.5 pl-7 pr-2 text-white font-mono text-[14px]" />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-slate-800 p-5 rounded-3xl border border-slate-700 mt-8 relative overflow-hidden">
        <h3 className="text-lg font-bold text-white mb-5 flex items-center gap-2"><Activity className="w-5 h-5 text-blue-400"/> Evolução</h3>
        <div className="grid grid-cols-2 gap-3 mb-4 relative z-10">
          <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-700/50">
            <p className="text-slate-400 text-[10px] font-bold uppercase mb-1.5">Anterior</p>
            <div className="relative"><span className="absolute left-0 top-1/2 -translate-y-1/2 text-slate-500 text-[13px]">R$</span><input type="text" inputMode="numeric" placeholder="0,00" value={prevPortfolioBalance} onChange={e => setPrevPortfolioBalance(formatCurrencyInput(e.target.value))} className="w-full bg-transparent pl-5 pr-1 text-white font-mono text-[14px]" /></div>
          </div>
          <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-700/50">
            <p className="text-slate-400 text-[10px] font-bold uppercase mb-1.5">Atual</p>
            <p className="text-[14px] font-mono text-white pt-0.5">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(currentPortfolioTotal)}</p>
          </div>
        </div>
        <div className={`p-4 rounded-xl border ${isPortfolioPositive ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
          <p className={`text-[10px] font-bold uppercase mb-1 ${isPortfolioPositive ? 'text-emerald-400/80' : 'text-red-400/80'}`}>Diferença</p>
          <p className={`text-xl font-bold font-mono ${isPortfolioPositive ? 'text-emerald-400' : 'text-red-400'}`}>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', signDisplay: 'always' }).format(portfolioDifference)}</p>
        </div>
      </div>
    </div>
  );

  // --- SELETOR DE ECRÃ ---
  if (isInitializing) return <div className="min-h-screen bg-slate-900 flex items-center justify-center"><RefreshCw className="w-8 h-8 text-blue-500 animate-spin" /></div>;
  if (!firebaseUser) return <AuthScreen auth={authRef.current} />;

  return (
    <div className="flex justify-center bg-slate-900 font-sans text-slate-200 selection:bg-blue-500/30 h-[100dvh] w-full overflow-hidden">
      <div className="w-full max-w-md bg-slate-900 relative flex flex-col h-full shadow-2xl border-x border-slate-800">
        
        <div className="shrink-0 pt-6 pb-2 px-6 flex justify-between items-center bg-slate-900/90 backdrop-blur-md z-10 border-b border-slate-800">
          <div className="font-black text-xl text-white flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-blue-700 rounded-[8px] flex items-center justify-center shadow-lg"><span className="text-white text-sm">P</span></div>
            Planner<span className="text-blue-500">Full</span>
          </div>
          <button onClick={() => setIsSidebarOpen(true)} className="w-9 h-9 rounded-full bg-slate-800 border-2 border-slate-600 flex items-center justify-center relative active:scale-95">
            <User className="w-5 h-5 text-slate-300" />
            <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-900 ${syncStatus === 'online' ? 'bg-emerald-500' : 'bg-yellow-500'}`}></span>
          </button>
        </div>

        <main className="flex-1 overflow-y-auto p-6 scroll-smooth">
          <TabErrorBoundary>
            {activeTab === 'dashboard' && renderDashboard()}
            {activeTab === 'tasks' && renderTasks()}
            {activeTab === 'routine' && renderRoutine()}
            {activeTab === 'portfolio' && renderPortfolio()}
          </TabErrorBoundary>
        </main>

        <nav className="shrink-0 bg-slate-900 border-t border-slate-800 pb-safe pt-2 px-6 flex justify-between items-center w-full z-20">
          {[
            { id: 'dashboard', icon: Home, label: 'Início' }, { id: 'tasks', icon: CheckSquare, label: 'Agenda' },
            { id: 'routine', icon: ListTodo, label: 'Foco' }, { id: 'portfolio', icon: Briefcase, label: 'Ativos' }
          ].map(tab => {
            const IconComponent = tab.icon;
            return (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); hapticFeedback(20); }} className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all active:scale-90 ${activeTab === tab.id ? 'text-blue-500' : 'text-slate-500'}`}>
                <IconComponent className="w-6 h-6" strokeWidth={activeTab === tab.id ? 2.5 : 2} />
                <span className={`text-[9px] font-bold uppercase ${activeTab === tab.id ? 'opacity-100' : 'opacity-0 h-0'}`}>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {isSidebarOpen && (
          <div className="absolute inset-0 z-[100] flex justify-end">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={() => setIsSidebarOpen(false)}></div>
            <div className="relative w-72 h-full bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-right">
              <div className="p-6 border-b border-slate-800 bg-slate-800/50">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-14 h-14 rounded-full bg-blue-600/20 border border-blue-500/50 flex items-center justify-center"><User className="w-7 h-7 text-blue-400" /></div>
                  <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-full"><X className="w-5 h-5" /></button>
                </div>
                <h2 className="text-lg font-bold text-white truncate">{firebaseUser?.email || "Usuário"}</h2>
                <div className="flex items-center gap-2 mt-2">
                  {syncStatus === 'online' ? <><Cloud className="w-4 h-4 text-emerald-400"/><span className="text-xs text-emerald-400 font-medium">Sincronizado</span></> : 
                   syncStatus === 'syncing' ? <><RefreshCw className="w-4 h-4 text-yellow-400 animate-spin"/><span className="text-xs text-yellow-400 font-medium">A sincronizar...</span></> :
                   <><CloudOff className="w-4 h-4 text-slate-500"/><span className="text-xs text-slate-500 font-medium">Offline</span></>}
                </div>
              </div>
              <div className="flex-1 p-4 space-y-4">
                <button onClick={requestNotificationPermission} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800 text-slate-300"><BellRing className="w-5 h-5 text-slate-400" /> <span className="font-medium">Ativar Notificações</span></button>
                <button onClick={handleLogout} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-500/10 text-red-400 mt-4"><LogOut className="w-5 h-5 text-red-400" /> <span className="font-medium">Terminar Sessão</span></button>
              </div>
              <div className="p-4 border-t border-slate-800"><p className="text-center text-[10px] text-slate-500 uppercase tracking-widest">Planner Full v4.0 Oficial</p></div>
            </div>
          </div>
        )}

        {deletePrompt && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-800 rounded-3xl p-6 w-full max-w-[320px] border border-slate-700 shadow-2xl">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4 mx-auto"><Trash2 className="w-6 h-6 text-red-400" /></div>
              <h3 className="text-xl font-bold text-white text-center mb-2">Atenção</h3>
              <p className="text-slate-400 text-center text-sm mb-6">Apagar {deletePrompt.type === 'task' ? 'a tarefa' : deletePrompt.type === 'habit' ? 'o hábito' : 'o item'} "{deletePrompt.title}"?</p>
              <div className="flex gap-3">
                <button onClick={() => setDeletePrompt(null)} className="flex-1 py-3 rounded-xl bg-slate-700 text-white font-medium">Cancelar</button>
                <button onClick={confirmDelete} className="flex-1 py-3 rounded-xl bg-red-600 text-white font-medium">Excluir</button>
              </div>
            </div>
          </div>
        )}

        {editPrompt && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <form onSubmit={handleSaveSimpleEdit} className="bg-slate-800 rounded-3xl p-6 w-full max-w-[320px] border border-slate-700 shadow-2xl">
              <h3 className="text-xl font-bold text-white mb-4">Editar</h3>
              <div className="space-y-4 mb-6">
                <input type="text" required autoFocus className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white outline-none" value={editPrompt.label} onChange={e => setEditPrompt({...editPrompt, label: e.target.value})} />
                {editPrompt.type === 'dailyTask' && (
                  <div className="flex gap-3">
                    <input type="time" className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white outline-none color-scheme-dark" value={editPrompt.time || ''} onChange={e => setEditPrompt({...editPrompt, time: e.target.value})} />
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setEditPrompt(null)} className="flex-1 py-3 rounded-xl bg-slate-700 text-white font-medium">Cancelar</button>
                <button type="submit" className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-medium">Salvar</button>
              </div>
            </form>
          </div>
        )}
      </div>
      <style dangerouslySetInnerHTML={{__html: `.pb-safe { padding-bottom: max(env(safe-area-inset-bottom, 20px), 16px); } input[type="date"]::-webkit-calendar-picker-indicator, input[type="time"]::-webkit-calendar-picker-indicator { filter: invert(1); opacity: 0.5; cursor: pointer; } ::-webkit-scrollbar { width: 0px; background: transparent; } .hide-scrollbar::-webkit-scrollbar { display: none; } .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}} />
    </div>
  );
}
