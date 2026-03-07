import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Home, CheckSquare, Activity, Briefcase, CalendarClock, Plus, Check, ChevronLeft, ChevronRight, 
  Trash2, Edit2, X, User, Settings, Star, Download, ListTodo, CheckCircle2,
  Cloud, CloudOff, RefreshCw, GripVertical, BellRing, AlertCircle
} from 'lucide-react';

// --- IMPORTS DO FIREBASE (BANCO DE DADOS DO GOOGLE) ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

// --- FEEDBACK HÁPTICO (VIBRAÇÃO SUTIL PREMIUM) ---
const hapticFeedback = (pattern = 40) => {
  if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
    window.navigator.vibrate(pattern);
  }
};

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

// --- COMPONENTE COM GESTO DE DESLIZE PREMIUM (MOUSE + TOUCH) ---
const SwipeableItem = ({ onEdit, onDeleteRequest, children, frontClass = "bg-slate-800 border-slate-700", wrapperClass = "mb-3", isDragDisabled = false }) => {
  const [offset, setOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const isDragging = useRef(false);
  const hasVibrated = useRef({ left: false, right: false });

  const handleStart = (e) => {
    if (isDragDisabled) return;
    const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
    
    startX.current = clientX;
    startY.current = clientY;
    isDragging.current = true;
    setIsSwiping(true);
    hasVibrated.current = { left: false, right: false };
  };

  const handleMove = (e) => {
    if (!isDragging.current || isDragDisabled) return;
    const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;

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

    if (newOffset > 70 && !hasVibrated.current.right) {
      hapticFeedback(30);
      hasVibrated.current.right = true;
    } else if (newOffset <= 70) {
      hasVibrated.current.right = false;
    }

    if (newOffset < -70 && !hasVibrated.current.left) {
      hapticFeedback(30);
      hasVibrated.current.left = true;
    } else if (newOffset >= -70) {
      hasVibrated.current.left = false;
    }

    setOffset(newOffset);
  };

  const handleEnd = () => {
    if (isDragDisabled || !isDragging.current) return;
    isDragging.current = false;
    setIsSwiping(false);
    if (offset > 70) {
      hapticFeedback([30, 50]);
      onEdit();
    } else if (offset < -70) {
      hapticFeedback([30, 50]);
      onDeleteRequest();
    }
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
        onTouchStart={handleStart}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
        onMouseDown={handleStart}
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        style={{ transform: `translateX(${offset}px)`, touchAction: isDragDisabled ? 'auto' : 'pan-y' }}
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

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // --- CONFIGURAÇÃO DO GOOGLE FIREBASE ---
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [syncStatus, setSyncStatus] = useState('offline');
  const dbRef = useRef(null);
  const syncTimeoutRef = useRef(null);

  const getAppId = () => {
    const rawId = typeof __app_id !== 'undefined' ? __app_id : 'default-app';
    return rawId.replace(/\//g, '_'); 
  };

  useEffect(() => {
    const vercelFirebaseConfig = {
      apiKey: "", 
      authDomain: "",
      projectId: "",
      storageBucket: "",
      messagingSenderId: "",
      appId: ""
    };

    let finalConfig = vercelFirebaseConfig;
    if (typeof __firebase_config !== 'undefined') {
      finalConfig = JSON.parse(__firebase_config);
    }

    if (!finalConfig.apiKey && !finalConfig.projectId) return;

    const app = initializeApp(finalConfig);
    const auth = getAuth(app);
    dbRef.current = getFirestore(app);

    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.error("Erro de Autenticação", e);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
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
      const appId = getAppId();
      const docPath = doc(dbRef.current, 'artifacts', appId, 'users', user.uid, 'plannerData', 'main');
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
      setSyncStatus('offline');
    }
  };

  useEffect(() => {
    if (!firebaseUser || !dbRef.current) return;

    const saveDataToCloud = async () => {
      setSyncStatus('syncing');
      try {
        const appId = getAppId();
        const docPath = doc(dbRef.current, 'artifacts', appId, 'users', firebaseUser.uid, 'plannerData', 'main');
        
        await setDoc(docPath, {
          tasks, taskCategories, habitsList, habits, dailyTasks, 
          portfolioCategories, portfolio, portfolioUpdateDate, prevPortfolioBalance,
          lastUpdated: new Date().toISOString()
        }, { merge: true });
        
        setSyncStatus('online');
      } catch (error) {
        setSyncStatus('offline');
      }
    };

    clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      saveDataToCloud();
    }, 2000);

    return () => clearTimeout(syncTimeoutRef.current);
  }, [tasks, taskCategories, habitsList, habits, dailyTasks, portfolioCategories, portfolio, portfolioUpdateDate, prevPortfolioBalance, firebaseUser]);

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
    if (diffTime === 0) return 'today';
    if (diffTime <= 7) return 'upcoming';
    return 'normal';
  };

  // ORDENAÇÃO INTELIGENTE (As concluídas descem sempre)
  const sortedTasksGlobally = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (a.order !== undefined && b.order !== undefined && a.order !== b.order) return a.order - b.order;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });
  }, [tasks]);

  const focusOfDayTasks = sortedTasksGlobally.filter(task => {
    const status = getTaskStatus(task.dueDate, task.completed);
    return status === 'overdue' || status === 'today' || (task.completed && (new Date(task.dueDate + 'T00:00:00').getTime() <= today.getTime()));
  });

  const upcomingTasks = sortedTasksGlobally.filter(task => {
    const status = getTaskStatus(task.dueDate, task.completed);
    return status === 'upcoming' || status === 'normal';
  });

  const hasUrgentTasks = focusOfDayTasks.some(t => !t.completed);

  // --- LÓGICA DO DRAG AND DROP TÁTIL E MOUSE ---
  const draggingId = useRef(null);

  const handleDragStart = (e, id) => {
    e.stopPropagation();
    draggingId.current = id;
    hapticFeedback(20);
  };

  const handleDragMove = (e) => {
    if (!draggingId.current) return;
    e.preventDefault(); // Evita scroll ao arrastar
    
    const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;

    const targetElement = document.elementFromPoint(clientX, clientY);
    const dropZone = targetElement?.closest('[data-drag-id]');

    if (dropZone && dropZone.dataset.dragId !== String(draggingId.current)) {
      const targetId = Number(dropZone.dataset.dragId);
      
      setTasks(prev => {
        const arr = [...prev];
        const idx1 = arr.findIndex(t => t.id === draggingId.current);
        const idx2 = arr.findIndex(t => t.id === targetId);
        
        if (idx1 >= 0 && idx2 >= 0) {
          const temp = arr[idx1];
          arr.splice(idx1, 1);
          arr.splice(idx2, 0, temp);
          arr.forEach((t, i) => { t.order = i; });
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

  // --- CÁLCULOS DO PATRIMÓNIO ---
  const currentPortfolioTotal = portfolioCategories.reduce((acc, cat) => {
    return acc + parseCurrencyToNumber(portfolio[cat.id]);
  }, 0);

  const prevTotalNum = parseCurrencyToNumber(prevPortfolioBalance);
  const portfolioDifference = currentPortfolioTotal - prevTotalNum;
  const isPortfolioPositive = portfolioDifference >= 0;

  // --- HANDLERS COMUNS ---
  const confirmDelete = () => {
    hapticFeedback([50, 100]); 
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
    hapticFeedback(30);
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
    hapticFeedback([50, 30]); // Vibração de Sucesso
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    
    if (!task.completed && task.recurrence && task.recurrence !== 'none') {
       const nextDate = calculateNextDate(task.dueDate, task.recurrence);
       const nextTask = { ...task, id: Date.now(), dueDate: nextDate, completed: false, order: Date.now() };
       const updatedCurrent = { ...task, completed: true, recurrence: 'none' };
       setTasks(prev => prev.map(t => t.id === id ? updatedCurrent : t).concat(nextTask));
    } else {
       setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));
    }
  };

  const handleSaveTask = (e) => {
    e.preventDefault();
    hapticFeedback(40);
    if (!newTask.title || !newTask.dueDate || !newTask.category) return;
    if (editingTaskId) {
      setTasks(tasks.map(t => t.id === editingTaskId ? { ...t, ...newTask } : t));
    } else {
      setTasks([...tasks, { ...newTask, id: Date.now(), completed: false, order: Date.now() }]);
    }
    setNewTask({ title: '', category: taskCategories[0]?.id || 'meta', dueDate: '', recurrence: 'none' });
    setShowAddTask(false);
    setEditingTaskId(null);
  };

  const startEditTask = (task) => {
    hapticFeedback(20);
    setNewTask({ title: task.title, category: task.category, dueDate: task.dueDate, recurrence: task.recurrence || 'none' });
    setEditingTaskId(task.id);
    setShowAddTask(true);
  };

  const cancelEditTask = () => {
    hapticFeedback(20);
    setNewTask({ title: '', category: taskCategories[0]?.id || 'meta', dueDate: '', recurrence: 'none' });
    setEditingTaskId(null);
    setShowAddTask(false);
    setIsEditingCategories(false);
  };

  const handleAddCategory = () => {
    hapticFeedback(30);
    if (!newCategoryLabel.trim()) return;
    const newId = newCategoryLabel.trim().toLowerCase().replace(/\s+/g, '_');
    if (!taskCategories.some(c => c.id === newId)) {
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
    hapticFeedback(30);
    if (!newDailyTask.trim()) return;
    const dateStr = selectedDate.toISOString().split('T')[0];
    const newTaskObj = { id: Date.now(), text: newDailyTask.trim(), completed: false };
    
    setDailyTasks(prev => {
      const safePrev = prev || {};
      return {
        ...safePrev,
        [dateStr]: [...(safePrev[dateStr] || []), newTaskObj]
      };
    });
    setNewDailyTask('');
  };

  const toggleDailyTask = (dateStr, taskId) => {
    hapticFeedback(40);
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
    hapticFeedback(30);
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

  const changeTab = (tabId) => {
    if (activeTab !== tabId) {
      hapticFeedback(25);
      setActiveTab(tabId);
    }
  };


  // --- ECRÃS DE VISUALIZAÇÃO ---

  const renderDashboard = () => (
    <div className="animate-in fade-in pb-6 relative space-y-8">
      {/* 1. VISÃO GERAL */}
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

      {/* 2. FOCO DO DIA (Drag & Drop compatível com Mouse e Touch) */}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-widest text-blue-400 mb-4 px-1 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> Foco do Dia
        </h2>
        {focusOfDayTasks.length > 0 ? (
          <div className="space-y-2">
            {focusOfDayTasks.map((task) => {
              const status = getTaskStatus(task.dueDate, task.completed);
              const isOverdue = status === 'overdue' && !task.completed;
              const statusColors = isOverdue ? 'border-red-500/50 bg-[#2a1616]' : 'border-slate-700 bg-slate-800';

              return (
                <div key={task.id} data-drag-id={task.id} className="transition-transform duration-200 ease-in-out">
                  <SwipeableItem 
                    onEdit={() => startEditTask(task)}
                    onDeleteRequest={() => setDeletePrompt({ type: 'task', id: task.id, title: task.title })}
                    frontClass={`${task.completed ? 'border-slate-800 bg-slate-900 opacity-60' : statusColors} p-4 flex items-center gap-3`}
                    wrapperClass="mb-0"
                    isDragDisabled={false}
                  >
                    <button 
                      onClick={() => toggleTask(task.id)}
                      className={`w-6 h-6 rounded-md border flex items-center justify-center transition-all duration-300 shrink-0 active:scale-75
                        ${task.completed ? 'bg-blue-600 border-blue-600 shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'border-slate-500'}`}
                    >
                      {task.completed && <Check className="w-4 h-4 text-white" />}
                    </button>
                    
                    <div className="flex-1 min-w-0 pointer-events-none">
                      <h3 className={`font-bold text-sm truncate transition-colors ${task.completed ? 'line-through text-slate-500' : 'text-slate-100'}`}>
                        {task.title}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] uppercase font-bold tracking-wider ${isOverdue ? 'text-red-400' : 'text-slate-500'}`}>
                          {isOverdue ? 'Atrasada' : 'Hoje'}
                        </span>
                        {isOverdue && !task.completed && <BellRing className="w-3 h-3 text-red-400 animate-pulse" />}
                      </div>
                    </div>

                    {/* GRIP - Pegador para Drag & Drop MOUSE + TOUCH */}
                    {!task.completed && (
                      <div 
                        className="p-2 -mr-2 cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-300 transition-colors"
                        style={{ touchAction: 'none' }}
                        onTouchStart={(e) => handleDragStart(e, task.id)}
                        onTouchMove={handleDragMove}
                        onTouchEnd={handleDragEnd}
                        onMouseDown={(e) => handleDragStart(e, task.id)}
                        onMouseMove={handleDragMove}
                        onMouseUp={handleDragEnd}
                        onMouseLeave={handleDragEnd}
                      >
                        <GripVertical className="w-5 h-5 pointer-events-none" />
                      </div>
                    )}
                  </SwipeableItem>
                </div>
              );
            })}
          </div>
        ) : (
           <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl text-center border-dashed">
             <p className="text-slate-400 font-medium text-sm">O seu foco do dia está limpo! ✨</p>
           </div>
        )}
      </div>

      {/* 3. PRÓXIMOS DIAS (Agenda) */}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4 px-1 flex items-center gap-2">
          <CalendarClock className="w-4 h-4" /> Próximos Dias
        </h2>
        {upcomingTasks.length > 0 ? (
          <div className="space-y-2 opacity-90">
            {upcomingTasks.map(task => {
              return (
                <SwipeableItem 
                  key={task.id}
                  onEdit={() => startEditTask(task)}
                  onDeleteRequest={() => setDeletePrompt({ type: 'task', id: task.id, title: task.title })}
                  frontClass={`${task.completed ? 'border-slate-800 bg-slate-900 opacity-60' : 'border-slate-700 bg-slate-800'} p-4 flex items-center gap-3`}
                  wrapperClass="mb-0"
                >
                  <button 
                    onClick={() => toggleTask(task.id)}
                    className={`w-6 h-6 rounded-md border flex items-center justify-center transition-all duration-300 shrink-0 active:scale-75
                      ${task.completed ? 'bg-blue-600 border-blue-600' : 'border-slate-500'}`}
                  >
                    {task.completed && <Check className="w-4 h-4 text-white" />}
                  </button>
                  <div className="flex-1 min-w-0 pointer-events-none">
                    <h3 className={`font-medium text-sm truncate transition-colors ${task.completed ? 'line-through text-slate-500' : 'text-slate-200'}`}>
                      {task.title}
                    </h3>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {new Date(task.dueDate).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </SwipeableItem>
              );
            })}
          </div>
        ) : (
           <p className="text-sm text-slate-500 italic px-2">Sem tarefas para os próximos dias.</p>
        )}
      </div>
    </div>
  );

  const renderTasks = () => (
    <div className="space-y-6 animate-in fade-in pb-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-100">Agenda Completa</h1>
        <button 
          onClick={() => {
            hapticFeedback(30);
            cancelEditTask();
            setNewTask(prev => ({ ...prev, category: taskCategories[0]?.id || 'meta' }));
            setShowAddTask(true);
          }}
          className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-full transition-colors shadow-lg shadow-blue-500/30 active:scale-95"
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
            <div className="flex justify-between items-center mb-3">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider">Categoria</label>
              <button 
                type="button" 
                onClick={() => { hapticFeedback(20); setIsEditingCategories(!isEditingCategories); }} 
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
              <div className="flex gap-3 overflow-x-auto pb-4 hide-scrollbar -mx-2 px-2 snap-x snap-mandatory">
                {taskCategories.map(cat => {
                  const isSelected = newTask.category === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        hapticFeedback(40);
                        setNewTask({...newTask, category: cat.id});
                      }}
                      className={`relative snap-center shrink-0 px-6 py-3.5 rounded-2xl text-sm font-bold transition-all duration-300 border-2 active:scale-95
                        ${isSelected 
                          ? 'bg-gradient-to-br from-blue-500 to-blue-600 border-blue-400 text-white shadow-[0_10px_25px_-5px_rgba(59,130,246,0.6)] scale-105' 
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                        }`}
                    >
                      {isSelected && (
                        <span className="absolute -inset-1 rounded-2xl border border-blue-400/50 animate-pulse pointer-events-none"></span>
                      )}
                      {cat.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex gap-3 pt-2 border-t border-slate-700/50">
            <button type="button" onClick={cancelEditTask} className="px-5 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 rounded-xl font-medium transition-colors active:scale-95">Cancelar</button>
            <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-500/30 transition-all active:scale-95">
              {editingTaskId ? 'Salvar Edição' : 'Criar Tarefa'}
            </button>
          </div>
        </form>
      )}

      {!showAddTask && tasks.length > 0 && <SwipeHint />}

      <div className="space-y-1">
        {sortedTasksGlobally.map(task => {
          const status = getTaskStatus(task.dueDate, task.completed);
          const isOverdue = status === 'overdue' && !task.completed;
          const statusColors = {
            overdue: 'border-red-500/50 bg-[#2a1616]', 
            today: 'border-blue-500/40 bg-blue-500/10',
            upcoming: 'border-yellow-500/30 bg-[#2a2411]',
            normal: 'border-slate-700 bg-slate-800',
            completed: 'border-slate-800 bg-slate-900 opacity-60'
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
                className={`w-6 h-6 rounded-md border flex items-center justify-center transition-all duration-300 shrink-0 active:scale-75
                  ${task.completed ? 'bg-blue-600 border-blue-600 shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'border-slate-500'}`}
              >
                {task.completed && <Check className="w-4 h-4 text-white" />}
              </button>
              
              <div className="flex-1 min-w-0 pointer-events-none">
                <div className="flex justify-between items-center">
                   <h3 className={`font-bold truncate transition-colors ${task.completed ? 'line-through text-slate-500' : 'text-slate-100'}`}>
                     {task.title}
                   </h3>
                   {!task.completed && (status === 'overdue' || status === 'today') && (
                     <BellRing className={`w-4 h-4 shrink-0 ${isOverdue ? 'text-red-400 animate-pulse' : 'text-blue-400'}`} />
                   )}
                </div>
                <p className="text-xs text-slate-400 flex items-center gap-2 mt-1">
                  <span className="capitalize">{taskCategories.find(c => c.id === task.category)?.label || task.category}</span>
                  <span>•</span>
                  <span className={`${isOverdue ? 'text-red-400 font-bold' : ''} 
                                  ${status === 'today' && !task.completed ? 'text-blue-400 font-bold' : ''}
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
    
    const safeHabits = habits || {};
    const safeDailyTasks = dailyTasks || {};
    const safeHabitsList = Array.isArray(habitsList) ? habitsList : INITIAL_HABITS_LIST;

    const dayHabits = safeHabits[dateStr] || {};
    const dayTasks = Array.isArray(safeDailyTasks[dateStr]) ? safeDailyTasks[dateStr] : [];

    const changeDate = (days) => {
      hapticFeedback(20);
      const newDate = new Date(selectedDate);
      newDate.setDate(selectedDate.getDate() + days);
      setSelectedDate(newDate);
    };

    const totalItems = safeHabitsList.length + dayTasks.length;
    const completedItems = safeHabitsList.filter(h => dayHabits[h.id]).length + dayTasks.filter(t => t.completed).length;
    const progressPercent = totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100);
    const isAllDone = totalItems > 0 && completedItems === totalItems;

    return (
      <div className="space-y-6 animate-in fade-in pb-6">
        <header className="mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">O Meu Dia</h1>
            <p className="text-slate-400">A sua rotina fina e pequenos compromissos.</p>
          </div>
        </header>

        <div className="flex items-center justify-between bg-slate-800 p-4 rounded-2xl border border-slate-700 shadow-md">
          <button onClick={() => changeDate(-1)} className="p-2 text-slate-400 hover:text-white transition-colors active:scale-90"><ChevronLeft /></button>
          <div className="text-center">
            <p className="text-sm font-semibold text-blue-400 uppercase tracking-widest">
              {selectedDate.toLocaleDateString('pt-BR', { weekday: 'long' })}
            </p>
            <p className="text-xl font-bold text-white">
              {selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
            </p>
          </div>
          <button onClick={() => changeDate(1)} className="p-2 text-slate-400 hover:text-white transition-colors active:scale-90"><ChevronRight /></button>
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
            <button type="submit" disabled={!newDailyTask.trim()} className="bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-500 transition-colors text-white px-4 rounded-xl text-sm font-medium shrink-0 shadow-md active:scale-95">
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
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-200 active:scale-75 ${task.completed ? 'bg-blue-500 border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)] scale-110' : 'border-slate-500'}`}>
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
            <button onClick={() => { hapticFeedback(20); setShowAddHabit(!showAddHabit); }} className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors bg-blue-500/10 px-2 py-1 rounded-md">
              {showAddHabit ? 'Concluir' : 'Editar Hábitos'}
            </button>
          </div>

          {showAddHabit && (
            <form onSubmit={handleAddHabit} className="bg-slate-800 p-3.5 rounded-xl border border-slate-700 mb-4 flex gap-2 shadow-lg animate-in fade-in">
              <input type="text" required autoFocus className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:border-emerald-500 outline-none transition-colors" value={newHabitLabel} onChange={e => setNewHabitLabel(e.target.value)} placeholder="Novo hábito fixo..."/>
              <button type="submit" className="bg-emerald-600 text-white px-4 rounded-lg text-sm font-medium shadow-md active:scale-95">Salvar</button>
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
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 active:scale-75 ${isDone ? 'bg-emerald-500 border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)] scale-110' : 'border-slate-500'}`}>
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
    <div className="space-y-6 animate-in fade-in pb-6">
      <header className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Os Seus Investimentos</h1>
          <p className="text-slate-400">Acompanhe a evolução e distribuição.</p>
        </div>
        <button onClick={() => { hapticFeedback(30); setIsEditingPortfolioCats(!isEditingPortfolioCats); }} className={`p-2 rounded-full transition-colors active:scale-95 ${isEditingPortfolioCats ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}>
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
            <button type="button" onClick={handleAddPortfolioCategory} className="bg-blue-600 hover:bg-blue-500 transition-colors text-white px-4 rounded-lg text-sm font-medium shrink-0 shadow-md active:scale-95">Adicionar</button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {portfolioCategories.map(cat => {
            const catValueNum = parseCurrencyToNumber(portfolio[cat.id]);
            const percent = currentPortfolioTotal > 0 ? ((catValueNum / currentPortfolioTotal) * 100).toFixed(1) : 0;
            
            return (
              <div key={cat.id} className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-sm focus-within:border-blue-500/50 transition-all flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">{cat.label}</label>
                  <span className="text-[10px] font-bold px-2 py-1 bg-slate-900 text-blue-400 rounded-md border border-slate-700">
                    {percent}% da carteira
                  </span>
                </div>
                
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium text-sm">R$</span>
                  <input 
                    type="text" inputMode="numeric" placeholder="0,00" 
                    value={portfolio[cat.id] || ''} 
                    onChange={e => handlePortfolioChange(cat.id, e.target.value)} 
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg py-3 pl-9 pr-3 text-white font-mono focus:outline-none transition-colors text-base tracking-tighter shadow-inner" 
                  />
                </div>
                
                {/* Mini barra de progresso visual */}
                <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${percent}%` }}></div>
                </div>
              </div>
            )
          })}
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

  return (
    <div className="flex justify-center bg-slate-900 font-sans text-slate-200 selection:bg-blue-500/30 h-[100dvh] w-full overflow-hidden">
      <div className="w-full max-w-md bg-slate-900 relative flex flex-col h-full shadow-2xl shadow-black/50 border-x border-slate-800">
        
        {/* TOPBAR (Fixada) */}
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

        {/* ÁREA CENTRAL ROLÁVEL */}
        <main className="flex-1 overflow-y-auto p-6 scroll-smooth">
          {activeTab === 'dashboard' && renderDashboard()}
          {activeTab === 'tasks' && renderTasks()}
          {activeTab === 'routine' && renderRoutine()}
          {activeTab === 'portfolio' && renderPortfolio()}
        </main>

        {/* BOTTOM NAV (Fixada na base do ecrã) */}
        <nav className="shrink-0 bg-slate-900 border-t border-slate-800 pb-safe pt-2 px-6 flex justify-between items-center w-full shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-20">
          {[
            { id: 'dashboard', icon: Home, label: 'Início' },
            { id: 'tasks', icon: CheckSquare, label: 'Agenda' },
            { id: 'routine', icon: ListTodo, label: 'Rotina' },
            { id: 'portfolio', icon: Briefcase, label: 'Ativos' },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => changeTab(tab.id)} className={`flex flex-col items-center p-2 rounded-xl min-w-[64px] transition-all duration-300 active:scale-90 ${isActive ? 'text-blue-500' : 'text-slate-500 hover:text-slate-300'}`}>
                <div className={`relative p-1.5 rounded-lg transition-colors ${isActive ? 'bg-blue-500/10' : ''}`}>
                  <Icon className="w-6 h-6" strokeWidth={isActive ? 2.5 : 2} />
                  {tab.id === 'dashboard' && hasUrgentTasks && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 border-2 border-slate-900 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]"></span>}
                </div>
                <span className={`text-[10px] font-semibold mt-1 tracking-wide ${isActive ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'}`}>{tab.label}</span>
              </button>
            )
          })}
        </nav>

        {/* MENUS E MODAIS A SEGUIR... */}
        {isSidebarOpen && (
          <div className="absolute inset-0 z-[100] flex justify-end overflow-hidden">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setIsSidebarOpen(false)}></div>
            <div className="relative w-72 h-full bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
              
              <div className="p-6 border-b border-slate-800 bg-slate-800/50">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-14 h-14 rounded-full bg-blue-600/20 border border-blue-500/50 flex items-center justify-center relative">
                    <User className="w-7 h-7 text-blue-400" />
                  </div>
                  <button onClick={() => { hapticFeedback(20); setIsSidebarOpen(false); }} className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-full active:scale-90">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <h2 className="text-lg font-bold text-white">Usuário App</h2>
                
                <div className="flex items-center gap-2 mt-2 mb-4">
                  {syncStatus === 'online' && <><Cloud className="w-4 h-4 text-emerald-400"/><span className="text-xs text-emerald-400 font-medium">Backup em dia</span></>}
                  {syncStatus === 'syncing' && <><RefreshCw className="w-4 h-4 text-yellow-400 animate-spin"/><span className="text-xs text-yellow-400 font-medium">Salvando na nuvem...</span></>}
                  {syncStatus === 'offline' && <><CloudOff className="w-4 h-4 text-slate-500"/><span className="text-xs text-slate-500 font-medium">Modo Offline (Salvo no celular)</span></>}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-1">
                <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white transition-colors active:scale-95">
                  <User className="w-5 h-5 text-slate-400" /> <span className="font-medium">Meu Perfil</span>
                </button>
                <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white transition-colors active:scale-95">
                  <Download className="w-5 h-5 text-slate-400" /> <span className="font-medium">Exportar Dados</span>
                </button>
                <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800 text-slate-300 hover:text-white transition-colors active:scale-95">
                  <Settings className="w-5 h-5 text-slate-400" /> <span className="font-medium">Configurações</span>
                </button>
              </div>

              <div className="p-4 border-t border-slate-800">
                <p className="text-center text-[10px] text-slate-500 mt-4 uppercase tracking-widest">Planner Full v2.1 Premium</p>
              </div>
            </div>
          </div>
        )}

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
                <button onClick={() => { hapticFeedback(20); setDeletePrompt(null); }} className="flex-1 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-medium transition-colors active:scale-95">Cancelar</button>
                <button onClick={confirmDelete} className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium transition-colors shadow-lg shadow-red-600/20 active:scale-95">Excluir</button>
              </div>
            </div>
          </div>
        )}

        {editPrompt && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <form onSubmit={handleSaveSimpleEdit} className="bg-slate-800 rounded-2xl p-6 w-full max-w-[320px] border border-slate-700 shadow-2xl transform transition-all">
              <h3 className="text-xl font-bold text-white mb-4">Editar {editPrompt.type === 'habit' ? 'Hábito' : editPrompt.type === 'portfolioCat' ? 'Investimento' : 'Categoria'}</h3>
              <input type="text" required autoFocus className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white focus:border-blue-500 outline-none mb-6 transition-colors" value={editPrompt.label} onChange={e => setEditPrompt({...editPrompt, label: e.target.value})} />
              <div className="flex gap-3">
                <button type="button" onClick={() => { hapticFeedback(20); setEditPrompt(null); }} className="flex-1 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-medium transition-colors active:scale-95">Cancelar</button>
                <button type="submit" className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors shadow-lg shadow-blue-600/20 active:scale-95">Salvar</button>
              </div>
            </form>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .pb-safe { padding-bottom: max(env(safe-area-inset-bottom, 20px), 16px); } 
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(1); opacity: 0.5; cursor: pointer; } 
        ::-webkit-scrollbar { width: 0px; background: transparent; } 
        .hide-scrollbar::-webkit-scrollbar { display: none; } 
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
}
