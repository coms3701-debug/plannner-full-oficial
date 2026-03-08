import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Home, CheckSquare, Activity, Briefcase, CalendarClock, Plus, Check, ChevronLeft, ChevronRight, 
  Trash2, Edit2, X, User, Settings, Star, Download, ListTodo, CheckCircle2,
  Cloud, CloudOff, RefreshCw, GripVertical, BellRing, AlertCircle, Volume2
} from 'lucide-react';

// --- IMPORTS DO FIREBASE ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
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

// FORMATAÇÃO SEGURA DE DATAS (ANTI-CRASH)
const parseLocalDate = (dateStr) => {
  try {
    if (!dateStr || typeof dateStr !== 'string') return new Date(0);
    const [y, m, d] = dateStr.split('-');
    if (!y || !m || !d) return new Date(0);
    return new Date(y, m - 1, d);
  } catch (e) { return new Date(0); }
};

const formatDateLocal = (dateStr) => {
  try {
    if (!dateStr || typeof dateStr !== 'string') return '';
    const [y, m, d] = dateStr.split('-');
    if (!y || !m || !d) return dateStr;
    return `${d}/${m}/${y}`;
  } catch (e) { return ''; }
};

// --- HOOKS CUSTOMIZADOS ---
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

// --- CONSTANTES ---
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
    if (isDragDisabled) return;
    const clientX = e.type.includes('mouse') ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const clientY = e.type.includes('mouse') ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
    startX.current = clientX;
    startY.current = clientY;
    isDragging.current = true;
    setIsSwiping(true);
  };

  const handleMove = (e) => {
    if (!isDragging.current || isDragDisabled) return;
    const clientX = e.type.includes('mouse') ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const clientY = e.type.includes('mouse') ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
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

// Componente Anti-Crash Global para a aba Tasks (Agenda)
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-red-900/20 border border-red-500/50 rounded-2xl text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-2" />
          <h2 className="text-red-400 font-bold mb-1">Dados Corrompidos na Agenda</h2>
          <p className="text-sm text-slate-300 mb-4">Encontrámos um erro ao ler uma tarefa antiga que está a causar a "tela azul".</p>
          <button 
            onClick={() => {
              window.localStorage.removeItem('planner_tasks');
              window.location.reload();
            }}
            className="bg-red-600 text-white px-4 py-2 rounded-lg font-bold shadow-lg shadow-red-600/30"
          >
            Limpar Agenda Corrompida (Resolve o Erro)
          </button>
        </div>
      );
    }
    return this.props.children; 
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // --- FIREBASE ---
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [syncStatus, setSyncStatus] = useState('offline');
  const dbRef = useRef(null);
  const syncTimeoutRef = useRef(null);

  const getAppId = () => {
    const rawId = typeof __app_id !== 'undefined' ? __app_id : 'default-app';
    return rawId.replace(/\//g, '_'); 
  };

  useEffect(() => {
    const vercelFirebaseConfig = { apiKey: "", authDomain: "", projectId: "", storageBucket: "", messagingSenderId: "", appId: "" };
    let finalConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : vercelFirebaseConfig;
    if (!finalConfig.apiKey) return;

    const app = initializeApp(finalConfig);
    const auth = getAuth(app);
    dbRef.current = getFirestore(app);

    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) await signInWithCustomToken(auth, __initial_auth_token);
        else await signInAnonymously(auth);
      } catch (e) { }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (user) { setSyncStatus('online'); loadDataFromCloud(user); }
    });
    return () => unsubscribe();
  }, []);

  // --- ESTADOS COM ARMADURA ANTI-CRASH PROFUNDA (.filter para limpar lixo da memória) ---
  const [tasksRaw, setTasks] = useLocalStorage('planner_tasks', []);
  const [taskCategoriesRaw, setTaskCategories] = useLocalStorage('planner_taskCategories', INITIAL_CATEGORIES);
  const [habitsListRaw, setHabitsList] = useLocalStorage('planner_habitsList', INITIAL_HABITS_LIST);
  const [habits, setHabits] = useLocalStorage('planner_habits', {});
  const [dailyTasks, setDailyTasks] = useLocalStorage('planner_dailyTasks', {}); 
  const [portfolioCategoriesRaw, setPortfolioCategories] = useLocalStorage('planner_portfolioCats', INITIAL_PORTFOLIO_CATEGORIES);
  const [portfolioUpdateDate, setPortfolioUpdateDate] = useLocalStorage('planner_portfolioDate', new Date().toISOString().split('T')[0]);
  const [prevPortfolioBalance, setPrevPortfolioBalance] = useLocalStorage('planner_prevBalance', '');
  const [portfolio, setPortfolio] = useLocalStorage('planner_portfolio', {});

  // Garantia Absoluta que os Arrays só contêm Objetos Válidos com IDs
  const tasks = (Array.isArray(tasksRaw) ? tasksRaw : []).filter(t => t && typeof t === 'object' && t.id);
  const taskCategories = (Array.isArray(taskCategoriesRaw) ? taskCategoriesRaw : INITIAL_CATEGORIES).filter(c => c && typeof c === 'object' && c.id);
  const habitsList = (Array.isArray(habitsListRaw) ? habitsListRaw : INITIAL_HABITS_LIST).filter(h => h && typeof h === 'object' && h.id);
  const portfolioCategories = (Array.isArray(portfolioCategoriesRaw) ? portfolioCategoriesRaw : INITIAL_PORTFOLIO_CATEGORIES).filter(c => c && typeof c === 'object' && c.id);
  const safeHabits = typeof habits === 'object' && habits !== null ? habits : {};
  const safeDailyTasks = typeof dailyTasks === 'object' && dailyTasks !== null ? dailyTasks : {};

  // UI States
  const [isEditingCategories, setIsEditingCategories] = useState(false);
  const [newCategoryLabel, setNewCategoryLabel] = useState('');
  const [showAddTask, setShowAddTask] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [newTask, setNewTask] = useState({ title: '', category: 'meta', dueDate: '', dueTime: '', hasReminder: false, recurrence: 'none' });
  const [showAddHabit, setShowAddHabit] = useState(false);
  const [newHabitLabel, setNewHabitLabel] = useState('');
  const [newDailyTask, setNewDailyTask] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date()); 
  const [isEditingPortfolioCats, setIsEditingPortfolioCats] = useState(false);
  const [newPortfolioCatLabel, setNewPortfolioCatLabel] = useState('');
  const [deletePrompt, setDeletePrompt] = useState(null); 
  const [editPrompt, setEditPrompt] = useState(null); 

  // --- SINCRONIZAÇÃO NUVEM ---
  const loadDataFromCloud = async (user) => {
    if (!dbRef.current || !user) return;
    setSyncStatus('syncing');
    try {
      const docPath = doc(dbRef.current, 'artifacts', getAppId(), 'users', user.uid, 'plannerData', 'main');
      const snapshot = await getDoc(docPath);
      if (snapshot.exists()) {
        const d = snapshot.data();
        if (d.tasks && Array.isArray(d.tasks)) setTasks(d.tasks);
        if (d.taskCategories && Array.isArray(d.taskCategories)) setTaskCategories(d.taskCategories);
        if (d.habitsList && Array.isArray(d.habitsList)) setHabitsList(d.habitsList);
        if (d.habits) setHabits(d.habits);
        if (d.dailyTasks) setDailyTasks(d.dailyTasks);
        if (d.portfolioCategories && Array.isArray(d.portfolioCategories)) setPortfolioCategories(d.portfolioCategories);
        if (d.portfolio) setPortfolio(d.portfolio);
        if (d.portfolioUpdateDate) setPortfolioUpdateDate(d.portfolioUpdateDate);
        if (d.prevPortfolioBalance) setPrevPortfolioBalance(d.prevPortfolioBalance);
      }
      setSyncStatus('online');
    } catch (error) { setSyncStatus('offline'); }
  };

  useEffect(() => {
    if (!firebaseUser || !dbRef.current) return;
    clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(async () => {
      setSyncStatus('syncing');
      try {
        const docPath = doc(dbRef.current, 'artifacts', getAppId(), 'users', firebaseUser.uid, 'plannerData', 'main');
        await setDoc(docPath, {
          tasks, taskCategories, habitsList, habits, dailyTasks, portfolioCategories, portfolio, portfolioUpdateDate, prevPortfolioBalance, lastUpdated: new Date().toISOString()
        }, { merge: true });
        setSyncStatus('online');
      } catch (error) { setSyncStatus('offline'); }
    }, 2000);
  }, [tasks, taskCategories, habitsList, habits, dailyTasks, portfolioCategories, portfolio, portfolioUpdateDate, prevPortfolioBalance, firebaseUser]);

  // --- CONFIGURAÇÃO PWA NATIVA ---
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
  }, []);

  // --- MOTOR DE LEMBRETES (NOTIFICAÇÕES 1H e 1D antes) ---
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
            sendNativeNotification("Foco do Dia Amanhã", `Meta: ${typeof task.title === 'string' ? task.title : 'Tarefa'}`);
            t.notif1d = true;
            updatedTasks = true;
          }
          if (diffHours <= 1 && diffHours > 0 && !t.notif1h) {
            sendNativeNotification("Atenção - Lembrete", `A meta "${typeof task.title === 'string' ? task.title : 'Tarefa'}" vence em 1 hora!`);
            t.notif1h = true;
            updatedTasks = true;
          }
          return t;
        } catch(e) { return task; }
      });

      if (updatedTasks) setTasks(newTasks);
    }, 60000); 

    return () => clearInterval(interval);
  }, [tasks]);

  // --- DATAS E ORDENAÇÃO SEGURAS ---
  const todayObj = new Date(); 
  todayObj.setHours(0, 0, 0, 0);
  const todayStr = new Date(todayObj.getTime() - (todayObj.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

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

  const getStatusColors = (status, isOverdue) => {
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

  const sortedTasksGlobally = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (a?.completed !== b?.completed) return a?.completed ? 1 : -1;
      if (a?.order !== undefined && b?.order !== undefined && a?.order !== b?.order) return a.order - b.order;
      return parseLocalDate(a?.dueDate) - parseLocalDate(b?.dueDate);
    });
  }, [tasks]);

  const focusOfDayTasks = sortedTasksGlobally.filter(task => {
    if (!task || typeof task !== 'object') return false;
    const status = getTaskStatus(task.dueDate, task.completed);
    return status === 'overdue' || status === 'today' || (task.completed && parseLocalDate(task.dueDate).getTime() <= todayObj.getTime());
  });

  const upcomingTasks = sortedTasksGlobally.filter(task => {
    if (!task || typeof task !== 'object') return false;
    const status = getTaskStatus(task.dueDate, task.completed);
    return status === 'upcoming-urgent' || status === 'upcoming' || status === 'normal';
  });

  const dayTasksForDashboard = Array.isArray(safeDailyTasks[todayStr]) ? safeDailyTasks[todayStr] : [];
  const hasUrgentTasks = focusOfDayTasks.some(t => t && !t.completed) || dayTasksForDashboard.some(t => t && !t.completed);

  // --- DRAG AND DROP ---
  const draggingId = useRef(null);

  const handleDragStart = (e, id) => {
    e.stopPropagation();
    draggingId.current = id;
    hapticFeedback(20);
  };

  const handleDragMove = (e) => {
    if (!draggingId.current) return;
    e.preventDefault(); 
    const clientX = e.type.includes('mouse') ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const clientY = e.type.includes('mouse') ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);

    const targetElement = document.elementFromPoint(clientX, clientY);
    const dropZone = targetElement?.closest('[data-drag-id]');

    if (dropZone && dropZone.dataset.dragId !== String(draggingId.current)) {
      const targetId = Number(dropZone.dataset.dragId);
      
      setTasks(prev => {
        const arr = [...prev];
        const idx1 = arr.findIndex(t => t && t.id === draggingId.current);
        const idx2 = arr.findIndex(t => t && t.id === targetId);
        
        if (idx1 >= 0 && idx2 >= 0) {
          const temp = arr[idx1];
          arr.splice(idx1, 1);
          arr.splice(idx2, 0, temp);
          arr.forEach((t, i) => { if (t) t.order = i; });
        }
        return arr;
      });
      hapticFeedback(15);
    }
  };

  const handleDragEnd = (e) => {
    e.stopPropagation();
    if (draggingId.current) hapticFeedback(20);
    draggingId.current = null;
  };

  // --- CÁLCULOS PATRIMÓNIO ---
  const currentPortfolioTotal = portfolioCategories.reduce((acc, cat) => acc + parseCurrencyToNumber(portfolio[cat?.id]), 0);
  const portfolioDifference = currentPortfolioTotal - parseCurrencyToNumber(prevPortfolioBalance);
  const isPortfolioPositive = portfolioDifference >= 0;

  // --- HANDLERS ---
  const confirmDelete = () => {
    hapticFeedback([50, 100]); 
    if (!deletePrompt) return;
    if (deletePrompt.type === 'task') setTasks(tasks.filter(t => t?.id !== deletePrompt.id));
    else if (deletePrompt.type === 'habit') setHabitsList(habitsList.filter(h => h?.id !== deletePrompt.id));
    else if (deletePrompt.type === 'category') setTaskCategories(taskCategories.filter(c => c?.id !== deletePrompt.id));
    else if (deletePrompt.type === 'portfolioCat') setPortfolioCategories(portfolioCategories.filter(c => c?.id !== deletePrompt.id));
    else if (deletePrompt.type === 'dailyTask') {
      const currentList = safeDailyTasks[deletePrompt.dateStr] || [];
      setDailyTasks(prev => ({...prev, [deletePrompt.dateStr]: currentList.filter(t => t?.id !== deletePrompt.id)}));
    }
    setDeletePrompt(null);
  };

  const handleSaveSimpleEdit = (e) => {
    e.preventDefault();
    hapticFeedback(30);
    if (!editPrompt || typeof editPrompt.label !== 'string' || !editPrompt.label.trim()) return;
    if (editPrompt.type === 'habit') setHabitsList(habitsList.map(h => h?.id === editPrompt.id ? { ...h, label: editPrompt.label } : h));
    else if (editPrompt.type === 'category') setTaskCategories(taskCategories.map(c => c?.id === editPrompt.id ? { ...c, label: editPrompt.label } : c));
    else if (editPrompt.type === 'portfolioCat') setPortfolioCategories(portfolioCategories.map(c => c?.id === editPrompt.id ? { ...c, label: editPrompt.label } : c));
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
    const d = parseLocalDate(dateStr); 
    if (recurrence === 'daily') d.setDate(d.getDate() + 1);
    if (recurrence === 'weekly') d.setDate(d.getDate() + 7);
    if (recurrence === 'monthly') d.setMonth(d.getMonth() + 1);
    if (recurrence === 'yearly') d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split('T')[0];
  };

  const toggleTask = (id) => {
    hapticFeedback([50, 30]); 
    const task = tasks.find(t => t?.id === id);
    if (!task) return;
    
    if (!task.completed && task.recurrence && task.recurrence !== 'none') {
       const nextDate = calculateNextDate(task.dueDate, task.recurrence);
       const nextTask = { ...task, id: Date.now(), dueDate: nextDate, completed: false, order: Date.now(), notif1d: false, notif1h: false };
       const updatedCurrent = { ...task, completed: true, recurrence: 'none' };
       setTasks(prev => prev.map(t => t?.id === id ? updatedCurrent : t).concat(nextTask));
    } else {
       setTasks(prev => prev.map(t => t?.id === id ? { ...t, completed: !t.completed } : t));
    }
  };

  const handleSaveTask = (e) => {
    e.preventDefault();
    hapticFeedback(40);
    requestNotificationPermission(); 
    if (!newTask.title || !newTask.dueDate || !newTask.category) return;
    
    if (editingTaskId) setTasks(tasks.map(t => t?.id === editingTaskId ? { ...t, ...newTask } : t));
    else setTasks([...tasks, { ...newTask, id: Date.now(), completed: false, order: Date.now(), notif1d: false, notif1h: false }]);
    
    setNewTask({ title: '', category: taskCategories[0]?.id || 'meta', dueDate: '', dueTime: '', hasReminder: false, recurrence: 'none' });
    setShowAddTask(false);
    setEditingTaskId(null);
  };

  const startEditTask = (task) => {
    if(!task) return;
    hapticFeedback(20);
    setNewTask({ 
      title: typeof task.title === 'string' ? task.title : '', 
      category: typeof task.category === 'string' ? task.category : '', 
      dueDate: typeof task.dueDate === 'string' ? task.dueDate : '', 
      dueTime: typeof task.dueTime === 'string' ? task.dueTime : '', 
      hasReminder: !!task.hasReminder, 
      recurrence: typeof task.recurrence === 'string' ? task.recurrence : 'none' 
    });
    setEditingTaskId(task.id);
    setShowAddTask(true);
  };

  const cancelEditTask = () => {
    hapticFeedback(20);
    setNewTask({ title: '', category: taskCategories[0]?.id || 'meta', dueDate: '', dueTime: '', hasReminder: false, recurrence: 'none' });
    setEditingTaskId(null);
    setShowAddTask(false);
    setIsEditingCategories(false);
  };

  const handleAddCategory = () => {
    hapticFeedback(30);
    if (!newCategoryLabel.trim()) return;
    const newId = newCategoryLabel.trim().toLowerCase().replace(/\s+/g, '_');
    if (!taskCategories.some(c => c?.id === newId)) {
      setTaskCategories([...taskCategories, { id: newId, label: newCategoryLabel.trim() }]);
    }
    setNewCategoryLabel('');
  };

  const handleAddHabit = (e) => {
    e.preventDefault();
    hapticFeedback(30);
    if (!newHabitLabel.trim()) return;
    setHabitsList([...habitsList, { id: `habit_${Date.now()}`, label: newHabitLabel.trim() }]);
    setNewHabitLabel('');
    setShowAddHabit(false);
  };

  const toggleHabit = (dateStr, habitId) => {
    hapticFeedback(40);
    setHabits(prev => {
      const prevSaf = prev || {};
      return { ...prevSaf, [dateStr]: { ...(prevSaf[dateStr] || {}), [habitId]: !(prevSaf[dateStr]?.[habitId]) } };
    });
  };

  const handleAddDailyTask = (e) => {
    e.preventDefault();
    hapticFeedback(30);
    if (!newDailyTask.trim()) return;
    const dateStr = selectedDate.toISOString().split('T')[0];
    const newTaskObj = { id: Date.now(), text: newDailyTask.trim(), completed: false };
    setDailyTasks(prev => ({ ...prev, [dateStr]: [...((prev || {})[dateStr] || []), newTaskObj] }));
    setNewDailyTask('');
  };

  const toggleDailyTask = (dateStr, taskId) => {
    hapticFeedback([40, 20]);
    setDailyTasks(prev => {
      const dayList = (prev || {})[dateStr] || [];
      return { ...prev, [dateStr]: dayList.map(t => t?.id === taskId ? { ...t, completed: !t.completed } : t) };
    });
  };

  const handleAddPortfolioCategory = () => {
    hapticFeedback(30);
    if (!newPortfolioCatLabel.trim()) return;
    const newId = newPortfolioCatLabel.trim().toLowerCase().replace(/\s+/g, '_');
    if (!portfolioCategories.some(c => c?.id === newId)) {
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

  const changeTab = (tabId) => {
    if (activeTab !== tabId) {
      hapticFeedback(25);
      setActiveTab(tabId);
    }
  };

  // --- ECRÃS DE VISUALIZAÇÃO ---

  const renderDashboard = () => (
    <div className="animate-in fade-in pb-6 relative space-y-8">
      {/* VISÃO GERAL */}
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

      {/* FOCO DO DIA (Sincronizado) */}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-widest text-blue-400 mb-4 px-1 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> Foco do Dia
        </h2>
        
        {focusOfDayTasks.length === 0 && dayTasksForDashboard.length === 0 ? (
           <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl text-center border-dashed">
             <p className="text-slate-400 font-medium text-sm">O seu foco do dia está limpo! ✨</p>
           </div>
        ) : (
          <div className="space-y-2">
            {focusOfDayTasks.map((task) => {
              try {
                if(!task || typeof task !== 'object') return null;
                const status = getTaskStatus(task.dueDate, task.completed);
                const classStr = getStatusColors(status, status==='overdue');
                const safeTitle = typeof task.title === 'string' ? task.title : 'Sem Título';

                return (
                  <div key={task.id || Math.random()} data-drag-id={task.id} className="transition-transform duration-200 ease-in-out">
                    <SwipeableItem onEdit={() => startEditTask(task)} onDeleteRequest={() => setDeletePrompt({ type: 'task', id: task.id, title: safeTitle })} frontClass={`${classStr} p-4 flex items-center gap-3`} wrapperClass="mb-0">
                      <button onClick={() => toggleTask(task.id)} className={`w-6 h-6 rounded-md border flex items-center justify-center transition-all duration-300 shrink-0 active:scale-75 ${task.completed ? 'bg-blue-600 border-blue-600 shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'border-slate-500'}`}>
                        {task.completed && <Check className="w-4 h-4 text-white" />}
                      </button>
                      
                      <div className="flex-1 min-w-0 pointer-events-none">
                        <h3 className={`font-bold text-sm truncate transition-colors ${task.completed ? 'line-through text-slate-500' : 'text-slate-100'}`}>
                          {safeTitle}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[10px] uppercase font-bold tracking-wider opacity-80`}>
                            {status === 'overdue' ? 'Atrasada' : 'Hoje'} {typeof task.dueTime === 'string' && task.dueTime ? `• ${task.dueTime}` : ''}
                          </span>
                          {task.hasReminder && !task.completed && <BellRing className={`w-3 h-3 ${status==='overdue' ? 'animate-pulse' : ''}`} />}
                        </div>
                      </div>

                      {!task.completed && (
                        <div className="p-2 -mr-2 cursor-grab active:cursor-grabbing opacity-50 hover:opacity-100" style={{ touchAction: 'none' }} onTouchStart={(e) => handleDragStart(e, task.id)} onTouchMove={handleDragMove} onTouchEnd={handleDragEnd} onMouseDown={(e) => handleDragStart(e, task.id)} onMouseMove={handleDragMove} onMouseUp={handleDragEnd} onMouseLeave={handleDragEnd}>
                          <GripVertical className="w-5 h-5 pointer-events-none" />
                        </div>
                      )}
                    </SwipeableItem>
                  </div>
                );
              } catch(e) { return null; }
            })}

            {dayTasksForDashboard.map(task => {
              try {
                if(!task || typeof task !== 'object') return null;
                const safeText = typeof task.text === 'string' ? task.text : 'Compromisso';
                return (
                <SwipeableItem key={`rt_${task.id || Math.random()}`} onEdit={()=>{}} onDeleteRequest={() => setDeletePrompt({ type: 'dailyTask', id: task.id, title: safeText, dateStr: todayStr })} frontClass="bg-slate-800/80 border-slate-700/80 p-3.5 flex items-center justify-between" wrapperClass="mb-0" isDragDisabled>
                  <label className="flex items-center gap-3 cursor-pointer flex-1 w-full">
                    <div className="relative flex items-center justify-center w-6 h-6 shrink-0">
                      <input type="checkbox" checked={!!task.completed} onChange={() => toggleDailyTask(todayStr, task.id)} className="peer sr-only"/>
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-200 active:scale-75 ${task.completed ? 'bg-blue-500 border-blue-500' : 'border-slate-500'}`}>
                        {task.completed && <Check className="w-3.5 h-3.5 text-white" />}
                      </div>
                    </div>
                    <span className={`text-sm font-medium transition-colors ${task.completed ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                      {safeText}
                    </span>
                  </label>
                </SwipeableItem>
              )} catch(e) { return null; }
            })}
          </div>
        )}
      </div>

      {/* PRÓXIMOS DIAS */}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4 px-1 flex items-center gap-2">
          <CalendarClock className="w-4 h-4" /> Próximos Dias
        </h2>
        {upcomingTasks.length > 0 ? (
          <div className="space-y-2 opacity-95">
            {upcomingTasks.map(task => {
              try {
                if(!task || typeof task !== 'object') return null;
                const status = getTaskStatus(task.dueDate, task.completed);
                const classStr = getStatusColors(status, false);
                const safeTitle = typeof task.title === 'string' ? task.title : 'Sem Título';

                return (
                  <SwipeableItem key={task.id || Math.random()} onEdit={() => startEditTask(task)} onDeleteRequest={() => setDeletePrompt({ type: 'task', id: task.id, title: safeTitle })} frontClass={`${classStr} p-4 flex items-center gap-3`} wrapperClass="mb-0">
                    <button onClick={() => toggleTask(task.id)} className={`w-6 h-6 rounded-md border flex items-center justify-center transition-all duration-300 shrink-0 active:scale-75 ${task.completed ? 'bg-blue-600 border-blue-600' : 'border-slate-500'}`}>
                      {task.completed && <Check className="w-4 h-4 text-white" />}
                    </button>
                    <div className="flex-1 min-w-0 pointer-events-none">
                      <h3 className={`font-medium text-sm truncate transition-colors`}>{safeTitle}</h3>
                      <p className="text-[11px] opacity-70 font-mono mt-0.5">
                        {formatDateLocal(task.dueDate)} {typeof task.dueTime === 'string' && task.dueTime ? `• ${task.dueTime}` : ''}
                      </p>
                    </div>
                  </SwipeableItem>
                );
              } catch(e) { return null; }
            })}
          </div>
        ) : (
           <p className="text-sm text-slate-500 italic px-2">Sem tarefas para os próximos dias.</p>
        )}
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
                  {taskCategories.map(cat => {
                    // BLINDAGEM: Se a categoria for nula/indefinida, não tentar renderizar
                    if (!cat) return null;
                    return (
                    <SwipeableItem
                      key={cat.id || Math.random()}
                      wrapperClass="mb-0"
                      frontClass="p-2.5 bg-slate-800 border-slate-700 flex justify-between items-center"
                      onEdit={() => setEditPrompt({ type: 'category', id: cat.id, label: cat.label })}
                      onDeleteRequest={() => setDeletePrompt({ type: 'category', id: cat.id, title: cat.label })}
                    >
                      <span className="text-slate-200 truncate pr-2 font-medium w-full">{cat.label || 'Sem Nome'}</span>
                    </SwipeableItem>
                  )})}
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
                  if (!cat) return null; // BLINDAGEM
                  const isSelected = newTask.category === cat.id;
                  return (
                    <button
                      key={cat.id || Math.random()}
                      type="button"
                      onClick={() => setNewTask({...newTask, category: cat.id})}
                      className={`shrink-0 px-4 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 border
                        ${isSelected 
                          ? 'bg-blue-600 border-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.5)] scale-105 ring-1 ring-blue-400' 
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                        }`}
                    >
                      {cat.label || 'Cat'}
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
        {/* BLINDAGEM PRINCIPAL: try/catch no sort e mapeamento seguro */}
        {[...tasks].sort((a,b) => {
           try {
             // Tenta ordenar pelas datas se elas existirem e forem válidas
             if (a && b && a.dueDate && b.dueDate) {
                const dateA = new Date(a.dueDate);
                const dateB = new Date(b.dueDate);
                if (!isNaN(dateA) && !isNaN(dateB)) {
                   return dateA - dateB;
                }
             }
             return 0; // Se a data for inválida, não altera a ordem
           } catch(e) { return 0; }
        }).map(task => {
          if (!task) return null; // BLINDAGEM: Ignora objetos nulos na memória

          let status = 'normal';
          let validDateStr = 'Sem Data';
          
          try {
             // Só tenta calcular o status se a data parecer minimamente com "AAAA-MM-DD"
             if (task.dueDate && typeof task.dueDate === 'string' && task.dueDate.includes('-')) {
                 status = getTaskStatus(task.dueDate, task.completed);
                 const d = new Date(task.dueDate);
                 if (!isNaN(d)) {
                     validDateStr = d.toLocaleDateString('pt-BR');
                 }
             }
          } catch(e) { console.error("Data inválida na tarefa:", task); }

          const statusColors = {
            overdue: 'border-red-500/50 bg-[#2a1616]', 
            upcoming: 'border-yellow-500/50 bg-[#2a2411]',
            normal: 'border-slate-700 bg-slate-800',
            completed: 'border-slate-800 bg-slate-900 opacity-70'
          };
          const recurrenceLabels = { daily: 'Diária', weekly: 'Semanal', monthly: 'Mensal', yearly: 'Anual' };
          
          // BLINDAGEM NA PESQUISA DA CATEGORIA
          let categoryName = 'Geral';
          try {
             if (task.category) {
                 const foundCat = taskCategories.find(c => c && c.id === task.category);
                 if (foundCat && foundCat.label) {
                     categoryName = foundCat.label;
                 } else if (typeof task.category === 'string') {
                     categoryName = task.category;
                 }
             }
          } catch(e) {}

          return (
            <SwipeableItem 
              key={task.id || Math.random()}
              onEdit={() => startEditTask(task)}
              onDeleteRequest={() => setDeletePrompt({ type: 'task', id: task.id, title: task.title || 'Sem Título' })}
              frontClass={`${statusColors[status] || statusColors.normal} p-4 flex items-center gap-4`}
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
                  {task.title || 'Sem Título'}
                </h3>
                <p className="text-xs text-slate-400 flex items-center gap-2 mt-1">
                  <span className="capitalize">{categoryName}</span>
                  <span>•</span>
                  <span className={`${status === 'overdue' && !task.completed ? 'text-red-400 font-medium' : ''} 
                                  ${status === 'upcoming' && !task.completed ? 'text-yellow-400 font-medium' : ''}`}>
                    {validDateStr}
                  </span>
                  {task.recurrence && task.recurrence !== 'none' && recurrenceLabels[task.recurrence] && (
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

  return (
    <div className="flex justify-center bg-slate-900 font-sans text-slate-200 selection:bg-blue-500/30 h-[100dvh] w-full overflow-hidden">
      <div className="w-full max-w-md bg-slate-900 relative flex flex-col h-full shadow-2xl shadow-black/50 border-x border-slate-800">
        
        {/* TOPBAR */}
        <div className="shrink-0 pt-6 pb-2 px-6 flex justify-between items-center bg-slate-900/90 backdrop-blur-md z-10 border-b border-slate-800">
          <div className="font-black text-xl tracking-tight text-white flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-blue-700 rounded-md flex items-center justify-center shadow-lg shadow-blue-500/30">
              <span className="text-white text-sm">P</span>
            </div>
            Planner<span className="text-blue-500">Full</span>
          </div>
          
          <button onClick={() => { hapticFeedback(30); setIsSidebarOpen(true); }} className="w-9 h-9 rounded-full bg-slate-800 border-2 border-slate-600 flex items-center justify-center hover:border-blue-400 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 relative active:scale-95">
            <User className="w-5 h-5 text-slate-300" />
            <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-900 ${syncStatus === 'online' ? 'bg-emerald-500' : syncStatus === 'syncing' ? 'bg-yellow-500 animate-pulse' : 'bg-slate-500'}`}></span>
          </button>
        </div>

        {/* ÁREA CENTRAL */}
        <main className="flex-1 overflow-y-auto p-6 scroll-smooth">
          {activeTab === 'dashboard' && renderDashboard()}
          {activeTab === 'tasks' && renderTasks()}
          {activeTab === 'routine' && renderRoutine()}
          {activeTab === 'portfolio' && renderPortfolio()}
        </main>

        {/* BOTTOM NAV */}
        <nav className="shrink-0 bg-slate-900 border-t border-slate-800 pb-safe pt-2 px-6 flex justify-between items-center w-full shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-20">
          {[
            { id: 'dashboard', icon: Home, label: 'Início' },
            { id: 'tasks', icon: CheckSquare, label: 'Agenda' },
            { id: 'routine', icon: Activity, label: 'Foco' },
            { id: 'portfolio', icon: Briefcase, label: 'Ativos' },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => changeTab(tab.id)} className={`flex flex-col items-center p-2 rounded-xl min-w-[64px] transition-all duration-300 active:scale-90 ${isActive ? 'text-blue-500' : 'text-slate-500'}`}>
                <div className={`relative p-1.5 rounded-lg transition-colors ${isActive ? 'bg-blue-500/10' : ''}`}>
                  <Icon className="w-6 h-6" strokeWidth={isActive ? 2.5 : 2} />
                  {tab.id === 'dashboard' && hasUrgentTasks && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 border-2 border-slate-900 rounded-full animate-pulse"></span>}
                </div>
                <span className={`text-[10px] font-semibold mt-1 tracking-wide ${isActive ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'}`}>{tab.label}</span>
              </button>
            )
          })}
        </nav>

        {/* SIDEBAR MODAL */}
        {isSidebarOpen && (
          <div className="absolute inset-0 z-[100] flex justify-end overflow-hidden">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setIsSidebarOpen(false)}></div>
            <div className="relative w-72 h-full bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
              
              <div className="p-6 border-b border-slate-800 bg-slate-800/50">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-14 h-14 rounded-full bg-blue-600/20 border border-blue-500/50 flex items-center justify-center">
                    <User className="w-7 h-7 text-blue-400" />
                  </div>
                  <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-full">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <h2 className="text-lg font-bold text-white">Usuário Premium</h2>
                
                <div className="flex items-center gap-2 mt-2 mb-4">
                  {syncStatus === 'online' && <><Cloud className="w-4 h-4 text-emerald-400"/><span className="text-xs text-emerald-400 font-medium">Sincronizado</span></>}
                  {syncStatus === 'syncing' && <><RefreshCw className="w-4 h-4 text-yellow-400 animate-spin"/><span className="text-xs text-yellow-400 font-medium">A sincronizar...</span></>}
                  {syncStatus === 'offline' && <><CloudOff className="w-4 h-4 text-slate-500"/><span className="text-xs text-slate-500 font-medium">Modo Offline</span></>}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-1">
                <button onClick={requestNotificationPermission} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800 text-slate-300 transition-colors">
                  <BellRing className="w-5 h-5 text-slate-400" /> <span className="font-medium text-left">Ativar Notificações</span>
                </button>
              </div>

              <div className="p-4 border-t border-slate-800">
                <p className="text-center text-[10px] text-slate-500 mt-4 uppercase tracking-widest">Planner Full v2.2.4</p>
              </div>
            </div>
          </div>
        )}

        {/* MODAIS DELETE / EDIT */}
        {deletePrompt && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-800 rounded-2xl p-6 w-full max-w-[320px] border border-slate-700 shadow-2xl">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4 mx-auto">
                <Trash2 className="w-6 h-6 text-red-400" />
              </div>
              <h3 className="text-xl font-bold text-white text-center mb-2">Atenção</h3>
              <p className="text-slate-400 text-center text-sm mb-6">Apagar {getDeleteTypeLabel(deletePrompt.type)} "{deletePrompt.title}"?</p>
              <div className="flex gap-3">
                <button onClick={() => setDeletePrompt(null)} className="flex-1 py-3 rounded-xl bg-slate-700 text-white font-medium">Cancelar</button>
                <button onClick={confirmDelete} className="flex-1 py-3 rounded-xl bg-red-600 text-white font-medium">Excluir</button>
              </div>
            </div>
          </div>
        )}

        {editPrompt && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <form onSubmit={handleSaveSimpleEdit} className="bg-slate-800 rounded-2xl p-6 w-full max-w-[320px] border border-slate-700 shadow-2xl">
              <h3 className="text-xl font-bold text-white mb-4">Editar {editPrompt.type}</h3>
              <input type="text" required autoFocus className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:border-blue-500 outline-none mb-6" value={editPrompt.label} onChange={e => setEditPrompt({...editPrompt, label: e.target.value})} />
              <div className="flex gap-3">
                <button type="button" onClick={() => setEditPrompt(null)} className="flex-1 py-3 rounded-xl bg-slate-700 text-white font-medium">Cancelar</button>
                <button type="submit" className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-medium">Salvar</button>
              </div>
            </form>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .pb-safe { padding-bottom: max(env(safe-area-inset-bottom, 20px), 16px); } 
        input[type="date"]::-webkit-calendar-picker-indicator, input[type="time"]::-webkit-calendar-picker-indicator { filter: invert(1); opacity: 0.5; cursor: pointer; } 
        ::-webkit-scrollbar { width: 0px; background: transparent; } 
        .hide-scrollbar::-webkit-scrollbar { display: none; } 
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
}
