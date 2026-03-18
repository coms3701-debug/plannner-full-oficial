import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Home, CheckSquare, Activity, Briefcase, CalendarClock, Plus, Check, ChevronLeft, ChevronRight, 
  Trash2, Edit2, X, User, Settings, Star, Info, LogOut, CreditCard, Download, ListTodo, CheckCircle2,
  Cloud, CloudOff, RefreshCw, Mail, Lock, ShieldCheck, AlertCircle
} from 'lucide-react';

// --- IMPORTS DO FIREBASE (COM EMAIL/SENHA E GOOGLE) ---
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

// --- FUNÇÃO DE LOCAL STORAGE (FUNCIONA OFFLINE) ---
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
    } catch (error) {
      console.warn("Erro ao salvar no localStorage", error);
    }
  };

  return [storedValue, setValue];
}

// --- CONFIGURAÇÕES INICIAIS ---
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
  if (numberValue === 0) return '';
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numberValue);
};

const parseCurrencyToNumber = (formattedValue) => {
  if (!formattedValue) return 0;
  const digits = String(formattedValue).replace(/\D/g, '');
  if (!digits) return 0;
  return Number(digits) / 100 || 0;
};

// --- COMPONENTE COM GESTO DE DESLIZE ---
const SwipeableItem = ({ onEdit, onDeleteRequest, children, frontClass = "bg-slate-800 border-slate-700", wrapperClass = "mb-3" }) => {
  const [offset, setOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const isDragging = useRef(false);

  const handleTouchStart = (e) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    isDragging.current = true;
    setIsSwiping(true);
  };

  const handleTouchMove = (e) => {
    if (!isDragging.current) return;
    const diffX = e.touches[0].clientX - startX.current;
    const diffY = e.touches[0].clientY - startY.current;

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

  const handleTouchEnd = () => {
    isDragging.current = false;
    setIsSwiping(false);
    if (offset > 70) onEdit();
    else if (offset < -70) onDeleteRequest();
    setOffset(0);
  };

  return (
    <div className={`relative w-full rounded-xl bg-slate-900 overflow-hidden shadow-sm ${wrapperClass}`}>
      <div className="absolute inset-0 flex justify-between items-center px-4 rounded-xl font-medium text-white">
        <div className={`flex items-center gap-2 transition-opacity duration-200 ${offset > 20 ? 'opacity-100' : 'opacity-0'} text-blue-400`}>
          <Edit2 className="w-5 h-5" /> <span className="text-sm">Editar</span>
        </div>
        <div className={`flex items-center gap-2 transition-opacity duration-200 ${offset < -20 ? 'opacity-100' : 'opacity-0'} text-red-500`}>
          <span className="text-sm">Excluir</span> <Trash2 className="w-5 h-5" />
        </div>
      </div>
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ transform: `translateX(${offset}px)`, touchAction: 'pan-y' }}
        className={`relative w-full rounded-xl border transition-transform ${!isSwiping ? 'duration-300 ease-out' : 'duration-0'} ${frontClass}`}
      >
        {children}
      </div>
    </div>
  );
};

const SwipeHint = () => (
  <div className="flex justify-center mb-4">
    <p className="text-[10px] text-slate-500 font-medium tracking-wide uppercase flex items-center gap-2 bg-slate-800/50 px-3 py-1.5 rounded-full border border-slate-700/50">
      <span className="text-blue-400">← Excluir</span>
      <span>|</span>
      <span className="text-blue-400">Editar →</span>
    </p>
  </div>
);

// --- TELA DE LOGIN / REGISTRO ---
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
        setError('Este email já está cadastrado. Escolha a opção "Faça Login".');
      } else if (err.code === 'auth/weak-password') {
        setError('A senha deve ter pelo menos 6 caracteres.');
      } else {
        setError('Ocorreu um erro. Verifique se ativou o Email/Senha no Firebase.');
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
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Login pelo Google foi cancelado.');
      } else {
        setError('Erro com Google. Verifique se ativou o provedor Google no Firebase.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center p-6 selection:bg-blue-500/30 font-sans">
      <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-500">
        
        {/* LOGO E TEXTO */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center shadow-xl shadow-blue-500/20 mb-4 transform rotate-3">
            <span className="text-white text-3xl font-black">P</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-2">
            Planner<span className="text-blue-500">Full</span>
          </h1>
          <p className="text-slate-400 mt-2 text-sm text-center">Organize a sua vida, preserve os seus dados na nuvem.</p>
        </div>

        {/* FORMULÁRIO */}
        <form onSubmit={handleSubmit} className="bg-slate-800 p-6 sm:p-8 rounded-3xl border border-slate-700 shadow-2xl space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-3 rounded-xl text-sm flex items-center gap-2 animate-in shake">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider pl-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input 
                  type="email" 
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl py-3.5 pl-11 pr-4 text-white focus:border-blue-500 outline-none transition-colors"
                  placeholder="seu@email.com"
                />
              </div>
            </div>
            
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wider pl-1">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input 
                  type="password" 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl py-3.5 pl-11 pr-4 text-white focus:border-blue-500 outline-none transition-colors"
                  placeholder="••••••••"
                />
              </div>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white py-4 rounded-xl font-bold shadow-lg shadow-blue-500/30 transition-all active:scale-[0.98] mt-2 flex justify-center items-center gap-2"
          >
            {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : (isLogin ? 'Entrar com Email' : 'Registar Conta')}
          </button>

          <div className="pt-4 mt-2 text-center">
            <p className="text-sm text-slate-400">
              {isLogin ? "Ainda não tem conta? " : "Já tem uma conta? "}
              <button 
                type="button" 
                onClick={() => { setIsLogin(!isLogin); setError(''); }}
                className="text-blue-400 font-bold hover:underline"
              >
                {isLogin ? 'Registe-se aqui' : 'Faça Login'}
              </button>
            </p>
          </div>

          {/* DIVISÓRIA OU */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-700"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-3 bg-slate-800 text-slate-400 font-medium">Ou</span>
            </div>
          </div>

          {/* BOTÃO DO GOOGLE */}
          <button 
            type="button" 
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full bg-white hover:bg-gray-100 disabled:bg-gray-300 text-slate-900 py-3.5 rounded-xl font-bold shadow-md transition-all active:scale-[0.98] flex justify-center items-center gap-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continuar com o Google
          </button>
        </form>

        <div className="mt-8 flex items-center justify-center gap-2 text-slate-500 opacity-60 text-[10px] uppercase font-bold tracking-widest">
          <ShieldCheck className="w-4 h-4" />
          <span>Segurança Firebase (Autenticação V3.1)</span>
        </div>
      </div>
    </div>
  );
};


// ==========================================
// APLICATIVO PRINCIPAL
// ==========================================

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  // --- CONFIGURAÇÃO DO GOOGLE FIREBASE ---
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [syncStatus, setSyncStatus] = useState('offline'); // 'offline', 'syncing', 'online'
  const dbRef = useRef(null);
  const authRef = useRef(null);
  const syncTimeoutRef = useRef(null);

  useEffect(() => {
    // ⚠️ ATENÇÃO: COLOQUE AS SUAS CHAVES DO FIREBASE DENTRO DESTE BLOCO!
    const vercelFirebaseConfig = {
      apiKey: "", // <--- COLE AQUI
      authDomain: "", // <--- COLE AQUI
      projectId: "", // <--- COLE AQUI
      storageBucket: "", // <--- COLE AQUI
      messagingSenderId: "", // <--- COLE AQUI
      appId: "" // <--- COLE AQUI
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
  const [tasks, setTasks] = useLocalStorage('planner_tasks', []);
  const [taskCategories, setTaskCategories] = useLocalStorage('planner_taskCategories', INITIAL_CATEGORIES);
  const [habitsList, setHabitsList] = useLocalStorage('planner_habitsList', INITIAL_HABITS_LIST);
  const [habits, setHabits] = useLocalStorage('planner_habits', {});
  const [dailyTasks, setDailyTasks] = useLocalStorage('planner_dailyTasks', {}); 
  const [portfolioCategories, setPortfolioCategories] = useLocalStorage('planner_portfolioCats', INITIAL_PORTFOLIO_CATEGORIES);
  const [portfolioUpdateDate, setPortfolioUpdateDate] = useLocalStorage('planner_portfolioDate', new Date().toISOString().split('T')[0]);
  const [prevPortfolioBalance, setPrevPortfolioBalance] = useLocalStorage('planner_prevBalance', '');
  const [portfolio, setPortfolio] = useLocalStorage('planner_portfolio', {});

  // Estados de Interface
  const [isEditingCategories, setIsEditingCategories] = useState(false);
  const [newCategoryLabel, setNewCategoryLabel] = useState('');
  const [showAddTask, setShowAddTask] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [newTask, setNewTask] = useState({ title: '', category: 'meta', dueDate: '', recurrence: 'none' });
  const [showAddHabit, setShowAddHabit] = useState(false);
  const [newHabitLabel, setNewHabitLabel] = useState('');
  const [newDailyTask, setNewDailyTask] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date()); 
  const [isEditingPortfolioCats, setIsEditingPortfolioCats] = useState(false);
  const [newPortfolioCatLabel, setNewPortfolioCatLabel] = useState('');
  const [deletePrompt, setDeletePrompt] = useState(null); 
  const [editPrompt, setEditPrompt] = useState(null); 

  // --- LÓGICA DE SINCRONIZAÇÃO COM A NUVEM ---
  
  const loadDataFromCloud = async (user) => {
    if (!dbRef.current || !user) return;
    setSyncStatus('syncing');
    try {
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app';
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
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app';
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
    syncTimeoutRef.current = setTimeout(() => {
      saveDataToCloud();
    }, 2000);

    return () => clearTimeout(syncTimeoutRef.current);
  }, [tasks, taskCategories, habitsList, habits, dailyTasks, portfolioCategories, portfolio, portfolioUpdateDate, prevPortfolioBalance, firebaseUser]);


  // --- LOGOUT ---
  const handleLogout = async () => {
    if (authRef.current) {
      await signOut(authRef.current);
      setIsSidebarOpen(false);
      // Limpar memória para garantir que não vazam dados entre logins
      setTasks([]);
      setHabits({});
      setDailyTasks({});
      setPortfolio({});
    }
  };

  // --- CONFIGURAÇÃO PWA ---
  useEffect(() => {
    document.title = "Planner Full";
    const metaTags = [
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Planner Full" },
      { name: "theme-color", content: "#0f172a" },
      { name: "mobile-web-app-capable", content: "yes" }
    ];

    metaTags.forEach(({ name, content }) => {
      let tag = document.querySelector(`meta[name="${name}"]`);
      if (!tag) {
        tag = document.createElement('meta');
        tag.name = name;
        document.head.appendChild(tag);
      }
      tag.content = content;
    });

    const iconUrl = '/icon.png';

    let appleIconTag = document.querySelector('link[rel="apple-touch-icon"]');
    if (!appleIconTag) {
      appleIconTag = document.createElement('link');
      appleIconTag.rel = 'apple-touch-icon';
      document.head.appendChild(appleIconTag);
    }
    appleIconTag.href = iconUrl;

    let faviconTag = document.querySelector('link[rel="icon"]');
    if (!faviconTag) {
      faviconTag = document.createElement('link');
      faviconTag.rel = 'icon';
      document.head.appendChild(faviconTag);
    }
    faviconTag.href = iconUrl;
  }, []);

  // --- LÓGICA DE ALERTAS E DATAS ---
  const today = new Date(); 
  today.setHours(0, 0, 0, 0);

  const getTaskStatus = (dueDateStr, completed) => {
    if (completed) return 'completed';
    const dueDate = new Date(dueDateStr + 'T00:00:00');
    dueDate.setHours(0, 0, 0, 0);
    const diffTime = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
    if (diffTime < 0) return 'overdue';
    if (diffTime <= 7) return 'upcoming';
    return 'normal';
  };

  const dashboardTasks = useMemo(() => {
    return tasks
      .filter(task => !task.completed)
      .map(task => {
        const dueDate = new Date(task.dueDate + 'T00:00:00');
        dueDate.setHours(0, 0, 0, 0);
        const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
        return { ...task, diffDays };
      })
      .filter(task => task.diffDays <= 14)
      .sort((a, b) => a.diffDays - b.diffDays);
  }, [tasks]);

  const hasUrgentTasks = dashboardTasks.some(t => t.diffDays <= 3);

  const currentPortfolioTotal = portfolioCategories.reduce((acc, cat) => {
    return acc + parseCurrencyToNumber(portfolio[cat.id]);
  }, 0);

  const prevTotalNum = parseCurrencyToNumber(prevPortfolioBalance);
  const portfolioDifference = currentPortfolioTotal - prevTotalNum;
  const isPortfolioPositive = portfolioDifference >= 0;

  // --- HANDLERS ---
  const confirmDelete = () => {
    if (!deletePrompt) return;
    if (deletePrompt.type === 'task') {
      setTasks(tasks.filter(t => t.id !== deletePrompt.id));
    } else if (deletePrompt.type === 'habit') {
      setHabitsList(habitsList.filter(h => h.id !== deletePrompt.id));
    } else if (deletePrompt.type === 'category') {
      setTaskCategories(taskCategories.filter(c => c.id !== deletePrompt.id));
      if (newTask.category === deletePrompt.id) {
        setNewTask({ ...newTask, category: taskCategories[0]?.id || '' });
      }
    } else if (deletePrompt.type === 'portfolioCat') {
      setPortfolioCategories(portfolioCategories.filter(c => c.id !== deletePrompt.id));
    } else if (deletePrompt.type === 'dailyTask') {
      setDailyTasks(prev => ({
        ...prev,
        [deletePrompt.dateStr]: prev[deletePrompt.dateStr].filter(t => t.id !== deletePrompt.id)
      }));
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
    }
    setEditPrompt(null);
  };

  const getDeleteTypeLabel = (type) => {
    if (type === 'task') return 'a tarefa';
    if (type === 'habit') return 'o hábito';
    if (type === 'category') return 'a categoria';
    if (type === 'portfolioCat') return 'o investimento';
    if (type === 'dailyTask') return 'o compromisso rápido';
    return 'o item';
  };

  const calculateNextDate = (dateStr, recurrence) => {
    const d = new Date(dateStr + 'T12:00:00'); 
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
    setNewTask({ title: '', category: taskCategories[0]?.id || 'meta', dueDate: '', recurrence: 'none' });
    setShowAddTask(false);
    setEditingTaskId(null);
  };

  const startEditTask = (task) => {
    setNewTask({ title: task.title, category: task.category, dueDate: task.dueDate, recurrence: task.recurrence || 'none' });
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
    const newTask = { id: Date.now(), text: newDailyTask.trim(), completed: false };
    
    setDailyTasks(prev => {
      const safePrev = prev || {};
      return {
        ...safePrev,
        [dateStr]: [...(safePrev[dateStr] || []), newTask]
      };
    });
    setNewDailyTask('');
  };

  const toggleDailyTask = (dateStr, taskId) => {
    setDailyTasks(prev => {
      const safePrev = prev || {};
      const dayList = safePrev[dateStr] || [];
      return {
        ...safePrev,
        [dateStr]: dayList.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t)
      };
    });
  };

  const handleAddPortfolioCategory = () => {
    if (!newPortfolioCatLabel.trim()) return;
    const newId = newPortfolioCatLabel.trim().toLowerCase().replace(/\s+/g, '_');
    if (!portfolioCategories.some(c => c.id === newId)) {
      setPortfolioCategories([...portfolioCategories, { id: newId, label: newPortfolioCatLabel.trim() }]);
    }
    setNewPortfolioCatLabel('');
  };

  const handlePortfolioChange = (id, value) => {
    const formatted = formatCurrencyInput(value);
    setPortfolio(prev => ({ ...prev, [id]: formatted }));
  };

  const handlePrevBalanceChange = (value) => {
    const formatted = formatCurrencyInput(value);
    setPrevPortfolioBalance(formatted);
  };

  // --- ECRÃS DE VISUALIZAÇÃO ---

  const renderDashboard = () => (
    <div className="animate-in fade-in pb-20 relative">
      <div className="sticky top-[-24px] z-30 pt-6 pb-4 -mx-6 px-6 bg-slate-900/90 backdrop-blur-xl border-b border-slate-800 shadow-[0_15px_30px_-15px_rgba(0,0,0,0.8)]">
        <header className="mb-4">
          <h1 className="text-2xl font-bold text-slate-100">Visão Geral</h1>
          <p className="text-slate-400 text-sm mt-0.5">O seu painel financeiro.</p>
        </header>

        <div className="bg-slate-800 p-5 rounded-2xl border border-emerald-500/40 shadow-[0_15px_40px_-10px_rgba(16,185,129,0.25)] relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-6 -mt-6 w-32 h-32 bg-emerald-500/20 rounded-full blur-2xl pointer-events-none"></div>
          
          <div className="relative z-10 flex flex-col justify-center">
            <p className="text-[11px] font-bold uppercase tracking-wider mb-1.5 text-emerald-400/90 flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5"/> Total Investido
            </p>
            <p className="text-3xl sm:text-4xl font-bold font-mono tracking-tighter break-words text-white drop-shadow-md">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(currentPortfolioTotal)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 px-1">
        <div className="bg-slate-800 p-5 rounded-2xl border border-slate-600 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.5)] relative z-10 transform transition-all hover:-translate-y-1">
          <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-200 mb-4">
            <CalendarClock className="w-5 h-5 text-blue-400" /> Próximos 14 dias
          </h2>
          {dashboardTasks.length > 0 ? (
            <ul className="space-y-3">
              {dashboardTasks.map(task => {
                let styleClass = '';
                let labelText = '';
                if (task.diffDays < 0) {
                  styleClass = 'border-red-500/30 bg-red-500/10 text-red-400';
                  labelText = `Atrasado há ${Math.abs(task.diffDays)} dia(s)`;
                } else if (task.diffDays <= 3) {
                  styleClass = 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400';
                  labelText = task.diffDays === 0 ? 'Vence hoje!' : task.diffDays === 1 ? 'Vence amanhã' : `Vence em ${task.diffDays} dias`;
                } else {
                  styleClass = 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
                  labelText = `Vence em ${task.diffDays} dias`;
                }
                return (
                  <li key={task.id} className={`flex justify-between items-center p-3 rounded-lg border ${styleClass}`}>
                    <div className="flex flex-col min-w-0 pr-3">
                      <span className="font-medium truncate">{task.title}</span>
                      <span className="text-xs mt-0.5 opacity-80">{labelText}</span>
                    </div>
                    <span className="font-mono text-sm shrink-0">
                      {new Date(task.dueDate).toLocaleDateString('pt-BR')}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl text-center">
              <p className="text-slate-400 font-medium">Nenhuma tarefa para os próximos 14 dias. Tudo limpo! ✨</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderTasks = () => (
    <div className="space-y-6 animate-in fade-in pb-20">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Agenda & Metas</h1>
        <button 
          onClick={() => {
            cancelEditTask();
            setNewTask(prev => ({ ...prev, category: taskCategories[0]?.id || 'meta' }));
            setShowAddTask(true);
          }}
          className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-full transition-colors shadow-lg shadow-blue-500/30"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {showAddTask && (
        <form onSubmit={handleSaveTask} className="bg-slate-800 p-5 rounded-2xl border border-slate-700 mb-6 space-y-5 shadow-lg">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Título da Tarefa</label>
            <input 
              type="text" 
              required
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
              value={newTask.title}
              onChange={e => setNewTask({...newTask, title: e.target.value})}
              placeholder="Ex: Definir metas do trimestre"
            />
          </div>
          <div className="flex gap-4">
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Data Limite</label>
              <input 
                type="date" 
                required
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:border-blue-500 outline-none color-scheme-dark transition-all"
                value={newTask.dueDate}
                onChange={e => setNewTask({...newTask, dueDate: e.target.value})}
              />
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wider">Recorrência</label>
              <select 
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:border-blue-500 outline-none appearance-none truncate transition-all"
                value={newTask.recurrence}
                onChange={e => setNewTask({...newTask, recurrence: e.target.value})}
              >
                <option value="none">Nenhuma</option>
                <option value="daily">Diariamente</option>
                <option value="weekly">Semanalmente</option>
                <option value="monthly">Mensalmente</option>
                <option value="yearly">Anualmente</option>
              </select>
            </div>
          </div>
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Categoria</label>
              <button 
                type="button" 
                onClick={() => setIsEditingCategories(!isEditingCategories)} 
                className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors bg-blue-500/10 px-2 py-1 rounded-md"
              >
                {isEditingCategories ? 'Concluir Edição' : 'Editar Lista'}
              </button>
            </div>
            {isEditingCategories ? (
              <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 space-y-2 animate-in fade-in">
                <SwipeHint />
                <div className="max-h-36 overflow-y-auto space-y-2 pr-1 hide-scrollbar">
                  {taskCategories.map(cat => (
                    <SwipeableItem
                      key={cat.id}
                      wrapperClass="mb-0"
                      frontClass="p-2.5 bg-slate-800 border-slate-700 flex justify-between items-center"
                      onEdit={() => setEditPrompt({ type: 'category', id: cat.id, label: cat.label })}
                      onDeleteRequest={() => setDeletePrompt({ type: 'category', id: cat.id, title: cat.label })}
                    >
                      <span className="text-slate-200 truncate pr-2 font-medium w-full">{cat.label}</span>
                    </SwipeableItem>
                  ))}
                </div>
                <div className="flex gap-2 mt-2 pt-2 border-t border-slate-700/50">
                  <input 
                    type="text" 
                    value={newCategoryLabel} 
                    onChange={e => setNewCategoryLabel(e.target.value)} 
                    className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-sm text-white outline-none focus:border-blue-500 transition-colors" 
                    placeholder="Nova categoria..." 
                  />
                  <button type="button" onClick={handleAddCategory} className="bg-blue-600 hover:bg-blue-500 transition-colors text-white px-4 rounded-lg text-sm font-medium shrink-0 shadow-md">Adicionar</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-2 hide-scrollbar -mx-1 px-1">
                {taskCategories.map(cat => {
                  const isSelected = newTask.category === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setNewTask({...newTask, category: cat.id})}
                      className={`shrink-0 px-4 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 border
                        ${isSelected 
                          ? 'bg-blue-600 border-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.5)] scale-105 ring-1 ring-blue-400' 
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                        }`}
                    >
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex gap-3 pt-4 border-t border-slate-700/50">
            <button type="button" onClick={cancelEditTask} className="px-5 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 rounded-xl font-medium transition-colors">Cancelar</button>
            <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-500/30 transition-all">
              {editingTaskId ? 'Salvar Edição' : 'Criar Tarefa'}
            </button>
          </div>
        </form>
      )}

      {!showAddTask && tasks.length > 0 && <SwipeHint />}

      <div className="space-y-1">
        {tasks.sort((a,b) => new Date(a.dueDate) - new Date(b.dueDate)).map(task => {
          const status = getTaskStatus(task.dueDate, task.completed);
          const statusColors = {
            overdue: 'border-red-500/50 bg-[#2a1616]', 
            upcoming: 'border-yellow-500/50 bg-[#2a2411]',
            normal: 'border-slate-700 bg-slate-800',
            completed: 'border-slate-800 bg-slate-900 opacity-70'
          };
          const recurrenceLabels = { daily: 'Diária', weekly: 'Semanal', monthly: 'Mensal', yearly: 'Anual' };

          return (
            <SwipeableItem 
              key={task.id}
              onEdit={() => startEditTask(task)}
              onDeleteRequest={() => setDeletePrompt({ type: 'task', id: task.id, title: task.title })}
              frontClass={`${statusColors[status]} p-4 flex items-center gap-4`}
            >
              <button 
                onClick={() => toggleTask(task.id)}
                className={`w-6 h-6 rounded-md border flex items-center justify-center transition-colors shrink-0
                  ${task.completed ? 'bg-blue-600 border-blue-600' : 'border-slate-500'}`}
              >
                {task.completed && <Check className="w-4 h-4 text-white" />}
              </button>
              
              <div className="flex-1 min-w-0 pointer-events-none">
                <h3 className={`font-medium truncate ${task.completed ? 'line-through text-slate-400' : 'text-slate-100'}`}>
                  {task.title}
                </h3>
                <p className="text-xs text-slate-400 flex items-center gap-2 mt-1">
                  <span className="capitalize">{taskCategories.find(c => c.id === task.category)?.label || task.category}</span>
                  <span>•</span>
                  <span className={`${status === 'overdue' && !task.completed ? 'text-red-400 font-medium' : ''} 
                                  ${status === 'upcoming' && !task.completed ? 'text-yellow-400 font-medium' : ''}`}>
                    {new Date(task.dueDate).toLocaleDateString('pt-BR')}
                  </span>
                  {task.recurrence && task.recurrence !== 'none' && (
                    <>
                      <span>•</span>
                      <span className="text-blue-400 flex items-center gap-1">🔁 {recurrenceLabels[task.recurrence]}</span>
                    </>
                  )}
                </p>
              </div>
            </SwipeableItem>
          );
        })}
        {tasks.length === 0 && !showAddTask && (
          <div className="text-center py-10 bg-slate-800/50 rounded-2xl border border-slate-700 border-dashed">
            <p className="text-slate-400 font-medium">Nenhuma tarefa agendada.</p>
            <p className="text-sm text-slate-500 mt-1">Clique no + para adicionar.</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderRoutine = () => {
    const dateStr = selectedDate.toISOString().split('T')[0];
    
    // Proteções adicionadas
    const safeHabits = habits || {};
    const safeDailyTasks = dailyTasks || {};
    const safeHabitsList = Array.isArray(habitsList) ? habitsList : INITIAL_HABITS_LIST;

    const dayHabits = safeHabits[dateStr] || {};
    const dayTasks = Array.isArray(safeDailyTasks[dateStr]) ? safeDailyTasks[dateStr] : [];

    const changeDate = (days) => {
      const newDate = new Date(selectedDate);
      newDate.setDate(selectedDate.getDate() + days);
      setSelectedDate(newDate);
    };

    const totalItems = safeHabitsList.length + dayTasks.length;
    const completedItems = safeHabitsList.filter(h => dayHabits[h.id]).length + dayTasks.filter(t => t.completed).length;
    const progressPercent = totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100);
    const isAllDone = totalItems > 0 && completedItems === totalItems;

    return (
      <div className="space-y-6 animate-in fade-in pb-20">
        <header className="mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Meu Dia</h1>
            <p className="text-slate-400">A sua rotina fina e pequenos compromissos.</p>
          </div>
        </header>

        <div className="flex items-center justify-between bg-slate-800 p-4 rounded-2xl border border-slate-700 shadow-md">
          <button onClick={() => changeDate(-1)} className="p-2 text-slate-400 hover:text-white transition-colors"><ChevronLeft /></button>
          <div className="text-center">
            <p className="text-sm font-semibold text-blue-400 uppercase tracking-widest">
              {selectedDate.toLocaleDateString('pt-BR', { weekday: 'long' })}
            </p>
            <p className="text-xl font-bold text-white">
              {selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
            </p>
          </div>
          <button onClick={() => changeDate(1)} className="p-2 text-slate-400 hover:text-white transition-colors"><ChevronRight /></button>
        </div>

        <div className="bg-slate-800 p-4 rounded-2xl border border-slate-700 shadow-sm relative overflow-hidden">
          <div className="flex justify-between items-end mb-2 relative z-10">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">Progresso do Dia</p>
              <p className={`text-sm font-medium ${isAllDone ? 'text-emerald-400' : 'text-slate-300'}`}>
                {completedItems} de {totalItems} concluídos
              </p>
            </div>
            <span className={`text-2xl font-bold font-mono tracking-tighter ${isAllDone ? 'text-emerald-400' : 'text-blue-400'}`}>
              {progressPercent}%
            </span>
          </div>
          <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden relative z-10">
            <div 
              className={`h-full rounded-full transition-all duration-500 ease-out ${isAllDone ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-blue-500'}`}
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
          {isAllDone && <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none"></div>}
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2 px-1">
            <CheckCircle2 className="w-4 h-4 text-blue-400" /> Tarefas de Hoje
          </h2>
          
          <form onSubmit={handleAddDailyTask} className="flex gap-2">
            <input 
              type="text" 
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl p-3 text-sm text-white focus:border-blue-500 outline-none transition-colors shadow-sm"
              value={newDailyTask}
              onChange={e => setNewDailyTask(e.target.value)}
              placeholder="+ Adicionar compromisso rápido..."
            />
            <button type="submit" disabled={!newDailyTask.trim()} className="bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-500 transition-colors text-white px-4 rounded-xl text-sm font-medium shrink-0 shadow-md">
              Add
            </button>
          </form>

          <div className="space-y-2 mt-3">
            {dayTasks.length > 0 ? dayTasks.map(task => (
              <SwipeableItem
                key={task.id}
                wrapperClass="mb-0"
                frontClass="bg-slate-800/80 border-slate-700/80 p-3.5 flex items-center justify-between"
                onEdit={() => {}}
                onDeleteRequest={() => setDeletePrompt({ type: 'dailyTask', id: task.id, title: task.text, dateStr })}
              >
                <label className="flex items-center gap-3 cursor-pointer flex-1 w-full">
                  <div className="relative flex items-center justify-center w-6 h-6 shrink-0">
                    <input type="checkbox" checked={task.completed} onChange={() => toggleDailyTask(dateStr, task.id)} className="peer sr-only"/>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-200 ${task.completed ? 'bg-blue-500 border-blue-500 scale-110' : 'border-slate-500'}`}>
                      {task.completed && <Check className="w-3.5 h-3.5 text-white" />}
                    </div>
                  </div>
                  <span className={`text-sm font-medium transition-colors ${task.completed ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                    {task.text}
                  </span>
                </label>
              </SwipeableItem>
            )) : <p className="text-xs text-slate-500 italic px-2">Nenhum compromisso rápido adicionado hoje.</p>}
          </div>
        </div>

        <div className="space-y-3 pt-4 border-t border-slate-800">
          <div className="flex justify-between items-center px-1">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" /> Hábitos Fixos
            </h2>
            <button onClick={() => setShowAddHabit(!showAddHabit)} className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors bg-blue-500/10 px-2 py-1 rounded-md">
              {showAddHabit ? 'Concluir' : 'Editar Hábitos'}
            </button>
          </div>

          {showAddHabit && (
            <form onSubmit={handleAddHabit} className="bg-slate-800 p-3.5 rounded-xl border border-slate-700 mb-4 flex gap-2 shadow-lg animate-in fade-in">
              <input type="text" required autoFocus className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-colors" value={newHabitLabel} onChange={e => setNewHabitLabel(e.target.value)} placeholder="Novo hábito fixo..."/>
              <button type="submit" className="bg-emerald-600 text-white px-4 rounded-lg text-sm font-medium shadow-md">Salvar</button>
            </form>
          )}

          <div className="space-y-2">
            {safeHabitsList.map(habit => {
              const isDone = !!dayHabits[habit.id];
              return (
                <SwipeableItem
                  key={habit.id}
                  wrapperClass="mb-0"
                  frontClass="bg-slate-800 border-slate-700 p-4 flex items-center justify-between"
                  onEdit={() => setEditPrompt({ type: 'habit', id: habit.id, label: habit.label })}
                  onDeleteRequest={() => setDeletePrompt({ type: 'habit', id: habit.id, title: habit.label })}
                >
                  <label className="flex items-center gap-4 cursor-pointer flex-1 w-full">
                    <div className="relative flex items-center justify-center w-8 h-8 shrink-0">
                      <input type="checkbox" checked={isDone} onChange={() => toggleHabit(dateStr, habit.id)} className="peer sr-only" />
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${isDone ? 'bg-emerald-500 border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] scale-110' : 'border-slate-500'}`}>
                        {isDone && <Check className="w-4 h-4 text-white" />}
                      </div>
                    </div>
                    <span className={`text-base font-medium transition-colors ${isDone ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                      {habit.label}
                    </span>
                  </label>
                </SwipeableItem>
              );
            })}
          </div>
        </div>
        {safeHabitsList.length > 0 && <SwipeHint />}
      </div>
    );
  };

  const renderPortfolio = () => (
    <div className="space-y-6 animate-in fade-in pb-20">
      <header className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Seus Investimentos</h1>
          <p className="text-slate-400">Acompanhe a evolução do seu patrimônio.</p>
        </div>
        <button onClick={() => setIsEditingPortfolioCats(!isEditingPortfolioCats)} className={`p-2 rounded-full transition-colors ${isEditingPortfolioCats ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>
          <Edit2 className="w-5 h-5" />
        </button>
      </header>

      <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-sm flex items-center justify-between">
        <label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
           <CalendarClock className="w-4 h-4 text-blue-400"/> Última Atualização
        </label>
        <input type="date" value={portfolioUpdateDate} onChange={e => setPortfolioUpdateDate(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-medium focus:border-blue-500 outline-none color-scheme-dark text-sm" />
      </div>

      {isEditingPortfolioCats ? (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-2 animate-in fade-in shadow-lg">
          <SwipeHint />
          <div className="max-h-64 overflow-y-auto space-y-2 pr-1 hide-scrollbar">
            {portfolioCategories.map(cat => (
              <SwipeableItem
                key={cat.id} wrapperClass="mb-0" frontClass="p-3 bg-slate-900 border-slate-700 flex justify-between items-center"
                onEdit={() => setEditPrompt({ type: 'portfolioCat', id: cat.id, label: cat.label })}
                onDeleteRequest={() => setDeletePrompt({ type: 'portfolioCat', id: cat.id, title: cat.label })}
              >
                <span className="text-slate-200 truncate pr-2 font-medium w-full">{cat.label}</span>
              </SwipeableItem>
            ))}
          </div>
          <div className="flex gap-2 mt-2 pt-4 border-t border-slate-700/50">
            <input type="text" value={newPortfolioCatLabel} onChange={e => setNewPortfolioCatLabel(e.target.value)} className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white outline-none focus:border-blue-500 transition-colors" placeholder="Novo ativo..." />
            <button type="button" onClick={handleAddPortfolioCategory} className="bg-blue-600 hover:bg-blue-500 transition-colors text-white px-4 rounded-lg text-sm font-medium shrink-0 shadow-md">Adicionar</button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {portfolioCategories.map(cat => (
            <div key={cat.id} className="bg-slate-800 p-3 sm:p-4 rounded-xl border border-slate-700 flex flex-col justify-between shadow-sm focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/50 transition-all">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 line-clamp-2 h-8">{cat.label}</label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 font-medium text-[13px]">R$</span>
                <input type="text" inputMode="numeric" placeholder="0,00" value={portfolio[cat.id] || ''} onChange={e => handlePortfolioChange(cat.id, e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2.5 pl-8 pr-2 text-white font-mono focus:outline-none transition-colors text-[14px] sm:text-sm tracking-tighter" />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-slate-800 p-5 rounded-2xl border border-slate-700 shadow-lg mt-8 relative overflow-hidden">
        <div className={`absolute top-0 right-0 -mr-10 -mt-10 w-40 h-40 rounded-full blur-3xl pointer-events-none transition-colors duration-500 ${isPortfolioPositive ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}></div>
        <h3 className="text-lg font-bold text-white mb-5 flex items-center gap-2 relative z-10"><Activity className="w-5 h-5 text-blue-400"/> Resumo da Evolução</h3>
        <div className="grid grid-cols-2 gap-3 mb-4 relative z-10">
          <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-700/50 focus-within:border-slate-500 transition-colors">
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1.5">Saldo Anterior</p>
            <div className="relative">
              <span className="absolute left-0 top-1/2 -translate-y-1/2 text-slate-500 font-medium text-[13px]">R$</span>
              <input type="text" inputMode="numeric" placeholder="0,00" value={prevPortfolioBalance} onChange={e => handlePrevBalanceChange(e.target.value)} className="w-full bg-transparent pl-[1.35rem] pr-1 text-white font-mono focus:outline-none text-[14px] sm:text-[15px] tracking-tighter" />
            </div>
          </div>
          <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-700/50">
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1.5">Saldo Atual</p>
            <p className="text-[14px] sm:text-[15px] font-mono text-white pt-0.5 tracking-tighter break-words">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(currentPortfolioTotal)}</p>
          </div>
        </div>
        <div className={`relative z-10 p-4 rounded-xl border transition-colors duration-300 ${isPortfolioPositive ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
          <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${isPortfolioPositive ? 'text-emerald-400/80' : 'text-red-400/80'}`}>Diferença no período</p>
          <p className={`text-xl sm:text-2xl font-bold font-mono tracking-tighter break-words ${isPortfolioPositive ? 'text-emerald-400' : 'text-red-400'}`}>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', signDisplay: 'always' }).format(portfolioDifference)}</p>
        </div>
      </div>
    </div>
  );

  // --- SELETOR DE ECRÃ ---
  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  // Ecrã de Autenticação se não houver utilizador logado
  if (!firebaseUser) {
    return <AuthScreen auth={authRef.current} />;
  }

  return (
    <div className="min-h-screen bg-slate-900 font-sans text-slate-200 selection:bg-blue-500/30 flex justify-center">
      <div className="w-full max-w-md bg-slate-900 relative flex flex-col h-screen overflow-hidden shadow-2xl shadow-black/50 border-x border-slate-800">
        
        {/* Topbar */}
        <div className="pt-6 pb-2 px-6 flex justify-between items-center bg-slate-900/90 backdrop-blur-md z-10 sticky top-0 border-b border-slate-800">
          <div className="font-black text-xl tracking-tight text-white flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-blue-700 rounded-md flex items-center justify-center shadow-lg shadow-blue-500/30">
              <span className="text-white text-sm">P</span>
            </div>
            Planner<span className="text-blue-500">Full</span>
          </div>
          
          <button onClick={() => setIsSidebarOpen(true)} className="w-9 h-9 rounded-full bg-slate-800 border-2 border-slate-600 flex items-center justify-center hover:border-blue-400 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 relative">
            <User className="w-5 h-5 text-slate-300" />
            <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-900 ${syncStatus === 'online' ? 'bg-emerald-500' : syncStatus === 'syncing' ? 'bg-yellow-500 animate-pulse' : 'bg-slate-500'}`}></span>
          </button>
        </div>

        {/* Conteúdo Rolável */}
        <main className="flex-1 overflow-y-auto p-6 scroll-smooth relative">
          {activeTab === 'dashboard' && renderDashboard()}
          {activeTab === 'tasks' && renderTasks()}
          {activeTab === 'routine' && renderRoutine()}
          {activeTab === 'portfolio' && renderPortfolio()}
        </main>

        {/* Bottom Navigation Navbar */}
        <nav className="bg-slate-900 border-t border-slate-800 pb-safe pt-2 px-6 flex justify-between items-center absolute bottom-0 w-full shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-20">
          {[
            { id: 'dashboard', icon: Home, label: 'Início' },
            { id: 'tasks', icon: CheckSquare, label: 'Agenda' },
            { id: 'routine', icon: ListTodo, label: 'Rotina' },
            { id: 'portfolio', icon: Briefcase, label: 'Ativos' },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex flex-col items-center p-2 rounded-xl min-w-[64px] transition-all duration-300 ${isActive ? 'text-blue-500' : 'text-slate-500 hover:text-slate-300'}`}>
                <div className={`relative p-1.5 rounded-lg transition-colors ${isActive ? 'bg-blue-500/10' : ''}`}>
                  <Icon className="w-6 h-6" strokeWidth={isActive ? 2.5 : 2} />
                  {tab.id === 'dashboard' && hasUrgentTasks && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 border-2 border-slate-900 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span>}
                </div>
                <span className={`text-[10px] font-semibold mt-1 tracking-wide ${isActive ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'}`}>{tab.label}</span>
              </button>
            )
          })}
        </nav>

        {/* MODAL: SIDEBAR / MENU LATERAL */}
        {isSidebarOpen && (
          <div className="absolute inset-0 z-[100] flex justify-end overflow-hidden">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setIsSidebarOpen(false)}></div>
            <div className="relative w-72 h-full bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
              
              <div className="p-6 border-b border-slate-800 bg-slate-800/50">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-14 h-14 rounded-full bg-blue-600/20 border border-blue-500/50 flex items-center justify-center relative">
                    <User className="w-7 h-7 text-blue-400" />
                  </div>
                  <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-full">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <h2 className="text-lg font-bold text-white truncate">{firebaseUser.email || firebaseUser.displayName || "Usuário"}</h2>
                
                <div className="flex items-center gap-2 mt-2 mb-4">
                  {syncStatus === 'online' && <><Cloud className="w-4 h-4 text-emerald-400"/><span className="text-xs text-emerald-400 font-medium">Backup em dia</span></>}
                  {syncStatus === 'syncing' && <><RefreshCw className="w-4 h-4 text-yellow-400 animate-spin"/><span className="text-xs text-yellow-400 font-medium">Salvando na nuvem...</span></>}
                  {syncStatus === 'offline' && <><CloudOff className="w-4 h-4 text-slate-500"/><span className="text-xs text-slate-500 font-medium">Modo Offline (Salvo no celular)</span></>}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-1">
                <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white transition-colors">
                  <User className="w-5 h-5 text-slate-400" /> <span className="font-medium">Meu Perfil</span>
                </button>
                <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white transition-colors">
                  <Download className="w-5 h-5 text-slate-400" /> <span className="font-medium">Exportar Dados</span>
                </button>
                <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white transition-colors">
                  <Settings className="w-5 h-5 text-slate-400" /> <span className="font-medium">Configurações</span>
                </button>
                
                {/* BOTÃO DE LOGOUT */}
                <button onClick={handleLogout} className="w-full flex items-center gap-3 p-3 mt-4 rounded-xl hover:bg-red-500/10 text-red-400 transition-colors">
                  <LogOut className="w-5 h-5 text-red-400" /> <span className="font-medium">Terminar Sessão</span>
                </button>
              </div>

              <div className="p-4 border-t border-slate-800">
                <p className="text-center text-[10px] text-slate-500 mt-4 uppercase tracking-widest">Planner Full v3.1 (Auth Google)</p>
              </div>
            </div>
          </div>
        )}

        {/* MODAL UNIVERSAL: CONFIRMAÇÃO DE EXCLUSÃO */}
        {deletePrompt && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-[320px] border border-slate-700 shadow-2xl transform transition-all">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4 mx-auto">
                <Trash2 className="w-6 h-6 text-red-400" />
              </div>
              <h3 className="text-xl font-bold text-white text-center mb-2">Atenção</h3>
              <p className="text-slate-400 text-center text-sm mb-6 leading-relaxed">
                Tem certeza que deseja apagar {getDeleteTypeLabel(deletePrompt.type)} <span className="text-slate-200 font-medium">"{deletePrompt.title}"</span>?
              </p>
              <div className="flex gap-3">
                <button onClick={() => setDeletePrompt(null)} className="flex-1 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-medium transition-colors">Cancelar</button>
                <button onClick={confirmDelete} className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium transition-colors shadow-lg shadow-red-600/20">Excluir</button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL UNIVERSAL: EDIÇÃO SIMPLES */}
        {editPrompt && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <form onSubmit={handleSaveSimpleEdit} className="bg-slate-800 rounded-2xl p-6 w-full max-w-[320px] border border-slate-700 shadow-2xl transform transition-all">
              <h3 className="text-xl font-bold text-white mb-4">Editar {editPrompt.type === 'habit' ? 'Hábito' : editPrompt.type === 'portfolioCat' ? 'Investimento' : 'Categoria'}</h3>
              <input type="text" required autoFocus className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:border-blue-500 outline-none mb-6 transition-colors" value={editPrompt.label} onChange={e => setEditPrompt({...editPrompt, label: e.target.value})} />
              <div className="flex gap-3">
                <button type="button" onClick={() => setEditPrompt(null)} className="flex-1 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-medium transition-colors">Cancelar</button>
                <button type="submit" className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors shadow-lg shadow-blue-600/20">Salvar</button>
              </div>
            </form>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{__html: `.pb-safe { padding-bottom: env(safe-area-inset-bottom, 20px); } input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(1); opacity: 0.5; cursor: pointer; } ::-webkit-scrollbar { width: 0px; background: transparent; } .hide-scrollbar::-webkit-scrollbar { display: none; } .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}} />
    </div>
  );
}
