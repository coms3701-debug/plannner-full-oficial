import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Home, CheckSquare, Activity, Briefcase, CalendarClock, Plus, Check, ChevronLeft, ChevronRight,
  Trash2, Edit2, X, User, Settings, BellRing, AlertCircle, Clock, GripVertical,
  Cloud, CloudOff, RefreshCw, LogOut, ListTodo, CheckCircle2,
  Eye, EyeOff, FileText, Download, Upload, CalendarPlus, Calculator, Sun, Moon, SunMoon,
  Flag, Star, ChevronUp, ChevronDown, Wallet
} from 'lucide-react';

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence,
} from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

import { hapticFeedback, requestNotificationPermission, sendNativeNotification } from './utils/notifications';
import { parseLocalDate, formatDateLocal, getLocalYYYYMMDD } from './utils/dates';
import { formatCurrencyInput, parseCurrencyToNumber } from './utils/currency';
import { useLocalStorage } from './hooks/useLocalStorage';
import { INITIAL_HABITS_LIST, INITIAL_CATEGORIES, INITIAL_PORTFOLIO_CATEGORIES } from './constants';
import { SwipeableItem, SwipeHint } from './components/SwipeableItem';
import { TabErrorBoundary } from './components/TabErrorBoundary';
import { AuthScreen } from './components/AuthScreen';
import { CalculadoraTab } from './components/CalculadoraTab';
import { FinancasTab } from './components/FinancasTab';
import { DespesasResumo } from './components/DespesasResumo';
import { downloadTaskICS } from './utils/ics';
import { saveSnapshot, getSnapshots, getSnapshotData, countItems } from './utils/backup';
import { LockScreen } from './components/LockScreen';
import { LockSetup } from './components/LockSetup';
import { isLockEnabled } from './utils/lock';
import { Lock } from 'lucide-react';

const APP_VERSION = 'v6.9.2';


export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  // --- CONFIGURAÇÃO DO GOOGLE FIREBASE ---
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [syncStatus, setSyncStatus] = useState('offline');
  const [syncError, setSyncError] = useState(null);
  
  // --- BLOQUEIO DE SINCRONIZAÇÃO (EVITA APAGAR DADOS) ---
  const [isDataLoaded, setIsDataLoaded] = useState(false); 

  const dbRef = useRef(null);
  const authRef = useRef(null);
  const syncTimeoutRef = useRef(null);
  const lastGoodCountRef = useRef(0); // proteção anti-apagamento
  const [restorePrompt, setRestorePrompt] = useState(null); // modal de restauração de snapshots

  // --- BLOQUEIO (Face ID / PIN) ---
  const [isLocked, setIsLocked] = useState(() => isLockEnabled());
  const [showLockSetup, setShowLockSetup] = useState(false);
  const lockActive = isLockEnabled();

  const [isBalanceVisible, setIsBalanceVisible] = useLocalStorage('planner_v4_balance_visible', true);
  const [stickyNote, setStickyNote] = useLocalStorage('planner_v4_sticky', '');
  const [localLastUpdated, setLocalLastUpdated] = useLocalStorage('planner_v4_local_last_updated', '');
  const [importPrompt, setImportPrompt] = useState(null);
  const [themePref, setThemePref] = useLocalStorage('planner_v4_theme', 'dark'); // 'light' | 'dark' | 'auto'
  const fileInputRef = useRef(null);

  // Aplica tema (light/dark) na tag <html> com base na preferencia + sistema
  useEffect(() => {
    const applyTheme = () => {
      const root = document.documentElement;
      let isDark;
      if (themePref === 'auto') {
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      } else {
        isDark = themePref === 'dark';
      }
      root.classList.toggle('dark', isDark);
    };
    applyTheme();
    if (themePref === 'auto' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener('change', applyTheme);
      return () => mq.removeEventListener('change', applyTheme);
    }
  }, [themePref]);

  useEffect(() => {
    const envFirebaseConfig = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };

    let finalConfig = envFirebaseConfig;
    if (typeof __firebase_config !== 'undefined') {
      finalConfig = JSON.parse(__firebase_config);
    }

    if (!finalConfig.apiKey || !finalConfig.projectId) {
      console.warn("Chaves do Firebase não encontradas. Verifique o arquivo .env.local");
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
        setSyncStatus('syncing');
        loadDataFromCloud(user);
      }
    });

    return () => unsubscribe();
  }, []);

  // --- ESTADOS DO APLICATIVO (CHAVES MANTIDAS PARA GARANTIR DADOS) ---
  const [tasksRaw, setTasks] = useLocalStorage('planner_v3_tasks', []);
  const [taskCategoriesRaw, setTaskCategories] = useLocalStorage('planner_v3_categories', INITIAL_CATEGORIES);
  const [habitsListRaw, setHabitsList] = useLocalStorage('planner_v3_habitsList', INITIAL_HABITS_LIST);
  const [habits, setHabits] = useLocalStorage('planner_v3_habits', {});
  const [dailyTasks, setDailyTasks] = useLocalStorage('planner_v3_dailyTasks', {}); 
  const [portfolioCategoriesRaw, setPortfolioCategories] = useLocalStorage('planner_v3_portfolioCats', INITIAL_PORTFOLIO_CATEGORIES);
  // Usa o timezone corrigido para iniciar
  const [portfolioUpdateDate, setPortfolioUpdateDate] = useLocalStorage('planner_v3_portfolioDate', getLocalYYYYMMDD(new Date()));
  const [prevPortfolioBalance, setPrevPortfolioBalance] = useLocalStorage('planner_v3_prevBalance', '');
  const [portfolio, setPortfolio] = useLocalStorage('planner_v3_portfolio', {});

  // Proteções de Array (Segurança anti-tela azul)
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
  
  // INCLUI O CAMPO DESCRIPTION (Notas na Agenda)
  const [newTask, setNewTask] = useState({ title: '', category: 'meta', dueDate: '', dueTime: '', endTime: '', hasReminder: false, recurrence: 'none', description: '' });
  
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

  // --- PRIORIDADES ---
  const [prioritiesRaw, setPriorities] = useLocalStorage('planner_v4_priorities', []);
  const [newPriorityLabel, setNewPriorityLabel] = useState('');
  const [newPriorityDate, setNewPriorityDate] = useState('');
  const [showAddPriority, setShowAddPriority] = useState(false);
  const [activePriorityDrag, setActivePriorityDrag] = useState(null);
  const draggingPriorityId = useRef(null);
  const priorities = (Array.isArray(prioritiesRaw) ? prioritiesRaw : []).filter(p => p && typeof p === 'object' && p.id);

  // --- FINANÇAS ---
  const [financeCardsRaw, setFinanceCards] = useLocalStorage('planner_v4_financeCards', []);
  const [financeEntriesRaw, setFinanceEntries] = useLocalStorage('planner_v4_financeEntries', []);
  const [financeCategoriesRaw, setFinanceCategories] = useLocalStorage('planner_v4_financeCategories', {});
  const financeCards = Array.isArray(financeCardsRaw) ? financeCardsRaw : [];
  const financeEntries = Array.isArray(financeEntriesRaw) ? financeEntriesRaw : [];
  const financeCategories = (financeCategoriesRaw && typeof financeCategoriesRaw === 'object' && !Array.isArray(financeCategoriesRaw)) ? financeCategoriesRaw : {};

  // --- LÓGICA DE SINCRONIZAÇÃO COM A NUVEM ---
  const friendlyFirebaseError = (error) => {
    const code = error?.code || '';
    if (code === 'unavailable' || code === 'failed-precondition' || /network/i.test(error?.message || '')) {
      return 'Sem conexão com a nuvem. Suas alterações estão salvas localmente e serão enviadas quando voltar a internet.';
    }
    if (code === 'permission-denied') {
      return 'Permissão negada pelo Firebase. Verifique se você está logado na conta correta.';
    }
    if (code === 'unauthenticated') {
      return 'Sessão expirada. Faça login novamente para sincronizar.';
    }
    return 'Não foi possível sincronizar com a nuvem. Suas alterações estão salvas localmente.';
  };

  const loadDataFromCloud = async (user) => {
    if (!dbRef.current || !user) return;
    setSyncStatus('syncing');
    setSyncError(null);
    try {
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'planner-v3';
      const docPath = doc(dbRef.current, 'artifacts', appId, 'users', user.uid, 'plannerData', 'main_v3');
      const snapshot = await getDoc(docPath);

      if (snapshot.exists()) {
        const data = snapshot.data();
        // NUVEM SEMPRE VENCE — anti-overwrite removido (falhou em proteger dados).
        // Para proteção real, use Exportar JSON regularmente.
        if (Array.isArray(data.tasks)) setTasks(data.tasks);
        if (Array.isArray(data.taskCategories)) setTaskCategories(data.taskCategories);
        if (Array.isArray(data.habitsList)) setHabitsList(data.habitsList);
        if (data.habits !== undefined) setHabits(data.habits || {});
        if (data.dailyTasks !== undefined) setDailyTasks(data.dailyTasks || {});
        if (Array.isArray(data.portfolioCategories)) setPortfolioCategories(data.portfolioCategories);
        if (data.portfolio) setPortfolio(data.portfolio);
        if (data.portfolioUpdateDate) setPortfolioUpdateDate(data.portfolioUpdateDate);
        if (data.prevPortfolioBalance) setPrevPortfolioBalance(data.prevPortfolioBalance);
        if (data.stickyNote !== undefined) setStickyNote(data.stickyNote || '');
        if (Array.isArray(data.priorities)) setPriorities(data.priorities);
        if (Array.isArray(data.financeCards)) setFinanceCards(data.financeCards);
        if (Array.isArray(data.financeEntries)) setFinanceEntries(data.financeEntries);
        if (data.financeCategories && typeof data.financeCategories === 'object' && !Array.isArray(data.financeCategories)) setFinanceCategories(data.financeCategories);
        if (data.lastUpdated) setLocalLastUpdated(data.lastUpdated);
        lastGoodCountRef.current = countItems(data);
        saveSnapshot(data); // snapshot do que veio da nuvem
        setSyncStatus('online');
      } else {
        setSyncStatus('online');
      }
    } catch (error) {
      console.error("Erro ao carregar da nuvem:", error);
      setSyncStatus('error');
      setSyncError(friendlyFirebaseError(error));
    } finally {
      setIsDataLoaded(true);
    }
  };

  const retrySync = () => {
    if (firebaseUser) {
      loadDataFromCloud(firebaseUser);
    }
  };

  // --- BACKUP MANUAL ---
  const handleExportData = () => {
    try {
      const payload = {
        version: 'planner-v3',
        exportedAt: new Date().toISOString(),
        data: {
          tasks, taskCategories, habitsList, habits, dailyTasks,
          portfolioCategories, portfolio, portfolioUpdateDate, prevPortfolioBalance,
          stickyNote, priorities, financeCards, financeEntries, financeCategories,
        }
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      link.href = url;
      link.download = `planner-backup-${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      hapticFeedback(50);
    } catch (e) {
      console.error('Erro ao exportar:', e);
      alert('Não foi possível exportar os dados.');
    }
  };

  const handleImportFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!parsed?.data || typeof parsed.data !== 'object') {
          alert('Arquivo inválido — não parece ser um backup do Planner Full.');
          return;
        }
        setImportPrompt({ data: parsed.data, exportedAt: parsed.exportedAt });
      } catch (err) {
        console.error('Erro ao ler arquivo:', err);
        alert('Não foi possível ler o arquivo. Verifique se é um JSON válido.');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  // Aplica um conjunto de dados (compartilhado por importação de JSON e restauração de snapshot)
  const applyDataSet = (d) => {
    if (!d || typeof d !== 'object') return;
    if (Array.isArray(d.tasks)) setTasks(d.tasks);
    if (Array.isArray(d.taskCategories)) setTaskCategories(d.taskCategories);
    if (Array.isArray(d.habitsList)) setHabitsList(d.habitsList);
    if (d.habits && typeof d.habits === 'object') setHabits(d.habits);
    if (d.dailyTasks && typeof d.dailyTasks === 'object') setDailyTasks(d.dailyTasks);
    if (Array.isArray(d.portfolioCategories)) setPortfolioCategories(d.portfolioCategories);
    if (d.portfolio && typeof d.portfolio === 'object') setPortfolio(d.portfolio);
    if (typeof d.portfolioUpdateDate === 'string') setPortfolioUpdateDate(d.portfolioUpdateDate);
    if (typeof d.prevPortfolioBalance === 'string') setPrevPortfolioBalance(d.prevPortfolioBalance);
    if (typeof d.stickyNote === 'string') setStickyNote(d.stickyNote);
    if (Array.isArray(d.priorities)) setPriorities(d.priorities);
    if (Array.isArray(d.financeCards)) setFinanceCards(d.financeCards);
    if (Array.isArray(d.financeEntries)) setFinanceEntries(d.financeEntries);
    if (d.financeCategories && typeof d.financeCategories === 'object' && !Array.isArray(d.financeCategories)) setFinanceCategories(d.financeCategories);
    lastGoodCountRef.current = countItems(d);
    setLocalLastUpdated(new Date().toISOString());
  };

  const confirmImport = () => {
    if (!importPrompt?.data) return;
    applyDataSet(importPrompt.data);
    setImportPrompt(null);
    setIsSidebarOpen(false);
    hapticFeedback([40, 30, 60]);
  };

  const confirmRestore = () => {
    if (!restorePrompt?.ts) return;
    const d = getSnapshotData(restorePrompt.ts);
    if (d) {
      applyDataSet(d);
      hapticFeedback([40, 30, 60]);
    }
    setRestorePrompt(null);
    setIsSidebarOpen(false);
  };

  const saveDataToCloud = useCallback(async () => {
    if (!firebaseUser || !dbRef.current || !isDataLoaded) return false;
    const payload = {
      tasks, taskCategories, habitsList, habits, dailyTasks,
      portfolioCategories, portfolio, portfolioUpdateDate, prevPortfolioBalance,
      stickyNote, priorities, financeCards, financeEntries, financeCategories,
    };
    // PROTEÇÃO ANTI-APAGAMENTO: nunca grava "vazio" por cima de dados existentes.
    const currentCount = countItems(payload);
    if (currentCount === 0 && lastGoodCountRef.current > 0) {
      console.warn('Gravação bloqueada: dados vazios não serão salvos por cima da nuvem.');
      setSyncStatus('error');
      setSyncError('Proteção ativada: dados vazios não foram salvos por segurança. Reabra o app ou restaure um backup.');
      return false;
    }
    setSyncStatus('syncing');
    const now = new Date().toISOString();
    // Marca local imediatamente — se o sync falhar, ainda sabemos que o local é o mais recente
    setLocalLastUpdated(now);
    try {
      saveSnapshot(payload); // snapshot local antes de gravar
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'planner-v3';
      const docPath = doc(dbRef.current, 'artifacts', appId, 'users', firebaseUser.uid, 'plannerData', 'main_v3');
      await setDoc(docPath, { ...payload, lastUpdated: now }, { merge: true });
      if (currentCount > 0) lastGoodCountRef.current = currentCount;
      setSyncStatus('online');
      setSyncError(null);
      return true;
    } catch (error) {
      console.error("Erro ao salvar na nuvem:", error);
      setSyncStatus('error');
      setSyncError(friendlyFirebaseError(error));
      return false;
    }
  }, [tasks, taskCategories, habitsList, habits, dailyTasks, portfolioCategories, portfolio, portfolioUpdateDate, prevPortfolioBalance, stickyNote, priorities, financeCards, financeEntries, financeCategories, firebaseUser, isDataLoaded]);

  // Save com debounce (durante uso normal)
  useEffect(() => {
    if (!firebaseUser || !dbRef.current || !isDataLoaded) return;
    clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => { saveDataToCloud(); }, 2000);
    return () => clearTimeout(syncTimeoutRef.current);
  }, [saveDataToCloud, firebaseUser, isDataLoaded]);

  // PROTEÇÃO: Salva imediatamente quando o app sai de foco (fechar, hibernar, trocar de aba)
  // Sem isso, escritas dentro da janela de debounce de 2s eram perdidas se o iOS matasse a PWA.
  useEffect(() => {
    if (!firebaseUser || !isDataLoaded) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        clearTimeout(syncTimeoutRef.current);
        saveDataToCloud();
      }
    };
    const onPageHide = () => {
      clearTimeout(syncTimeoutRef.current);
      saveDataToCloud();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [saveDataToCloud, firebaseUser, isDataLoaded]);

  // Re-bloqueia ao voltar de segundo plano (se o bloqueio estiver ativo)
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden' && isLockEnabled()) setIsLocked(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const handleLogout = async () => {
    if (authRef.current) {
      // CRÍTICO: força save final ANTES de sair, senão escritas recentes podem ser perdidas
      clearTimeout(syncTimeoutRef.current);
      try { await saveDataToCloud(); } catch (e) { /* não bloqueia logout se save falhar */ }

      await signOut(authRef.current);
      setIsSidebarOpen(false);
      setTasks([]);
      setHabits({});
      setDailyTasks({});
      setPortfolio({});
      setStickyNote('');
      setIsDataLoaded(false);
    }
  };

  // --- PWA E ALERTAS SEGUROS (COM FUSO HORÁRIO LOCAL CORRIGIDO E ATUALIZAÇÃO SEGURA) ---
  const todayObj = new Date(); 
  todayObj.setHours(0, 0, 0, 0);
  const todayStr = getLocalYYYYMMDD(todayObj);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      const todayStrLocal = getLocalYYYYMMDD(now);

      // 1. Verifica Alertas da Agenda via PrevState
      setTasks(prevTasks => {
        let updatedTasks = false;
        const safePrev = Array.isArray(prevTasks) ? prevTasks : [];
        const newTasks = safePrev.map(task => {
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
            // ALERTA DE 15 MINUTOS
            if (diffHours <= 0.25 && diffHours > 0 && !t.notif15m) {
              sendNativeNotification("🚨 Quase lá!", `O compromisso "${t.title}" começa em 15 minutos!`);
              t.notif15m = true; updatedTasks = true;
            }
            return t;
          } catch(e) { return task; }
        });
        return updatedTasks ? newTasks : prevTasks;
      });

      // 2. Verifica Alertas do Foco do Dia via PrevState
      setDailyTasks(prevDaily => {
        let updatedDaily = false;
        const safePrev = prevDaily || {};
        const todayList = safePrev[todayStrLocal] || [];
        if (todayList.length === 0) return safePrev;
        
        const newList = todayList.map(task => {
            if (!task || task.completed || !task.hasReminder || !task.time) return task;
            try {
                const [y, m, d] = todayStrLocal.split('-');
                const [h, min] = task.time.split(':');
                const taskDateTime = new Date(y, m-1, d, h, min);
                const diffMs = taskDateTime - now;
                const diffHours = diffMs / (1000 * 60 * 60);

                let t = { ...task };
                if (diffHours <= 0.25 && diffHours > 0 && !t.notif15m) {
                    sendNativeNotification("🚨 Foco do Dia", `O compromisso "${t.text}" começa em 15 minutos!`);
                    t.notif15m = true; updatedDaily = true;
                }
                return t;
            } catch(e) { return task; }
        });
        return updatedDaily ? { ...safePrev, [todayStrLocal]: newList } : safePrev;
      });

    }, 60000); 
    return () => clearInterval(interval);
  }, []); // Dependência VAZIA = o relógio nunca reseta, roda sempre certinho

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
      'normal': 'border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
      'completed': 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 opacity-60 text-slate-500 line-through'
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
    if (deletePrompt.type === 'priority') {
      setPriorities(prev => (Array.isArray(prev) ? prev : []).filter(p => p.id !== deletePrompt.id));
    } else if (deletePrompt.type === 'task') {
      setTasks(tasks.filter(t => t.id !== deletePrompt.id));
    } else if (deletePrompt.type === 'habit') {
      setHabitsList(habitsList.filter(h => h.id !== deletePrompt.id));
    } else if (deletePrompt.type === 'category') {
      setTaskCategories(taskCategories.filter(c => c.id !== deletePrompt.id));
      if (newTask.category === deletePrompt.id) setNewTask({ ...newTask, category: taskCategories[0]?.id || '' });
    } else if (deletePrompt.type === 'portfolioCat') {
      setPortfolioCategories(portfolioCategories.filter(c => c.id !== deletePrompt.id));
    } else if (deletePrompt.type === 'dailyTask') {
      setDailyTasks(prev => ({ ...prev, [deletePrompt.dateStr]: (prev[deletePrompt.dateStr] || []).filter(t => t && t.id !== deletePrompt.id) }));
    }
    setDeletePrompt(null);
  };

  const handleSaveSimpleEdit = (e) => {
    e.preventDefault();
    if (!editPrompt || !editPrompt.label.trim()) return;
    
    if (editPrompt.type === 'priority') {
      setPriorities(prev => (Array.isArray(prev) ? prev : []).map(p => p.id === editPrompt.id ? { ...p, label: editPrompt.label, dueDate: editPrompt.dueDate || '' } : p));
    } else if (editPrompt.type === 'habit') {
      setHabitsList(habitsList.map(h => h.id === editPrompt.id ? { ...h, label: editPrompt.label } : h));
    } else if (editPrompt.type === 'category') {
      setTaskCategories(taskCategories.map(c => c.id === editPrompt.id ? { ...c, label: editPrompt.label } : c));
    } else if (editPrompt.type === 'portfolioCat') {
      setPortfolioCategories(portfolioCategories.map(c => c.id === editPrompt.id ? { ...c, label: editPrompt.label } : c));
    } else if (editPrompt.type === 'dailyTask') {
      setDailyTasks(prev => {
        const oldStr = editPrompt.originalDateStr || editPrompt.dateStr;
        const newStr = editPrompt.dateStr;
        const newState = { ...prev };
        
        const oldList = [...(newState[oldStr] || [])];
        const taskIndex = oldList.findIndex(t => t && t.id === editPrompt.id);

        if (taskIndex > -1) {
          const taskToMove = { ...oldList[taskIndex], text: editPrompt.label, time: editPrompt.time };

          if (oldStr === newStr) {
            oldList[taskIndex] = taskToMove;
            newState[oldStr] = oldList;
          } else {
            oldList.splice(taskIndex, 1);
            newState[oldStr] = oldList;
            
            const newList = [...(newState[newStr] || [])];
            newList.push(taskToMove);
            newState[newStr] = newList;
          }
        }
        return newState;
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
    return getLocalYYYYMMDD(d); // Usa o local seguro
  };

  const toggleTask = (id) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    if (!task.completed && task.recurrence && task.recurrence !== 'none') {
       const nextDate = calculateNextDate(task.dueDate, task.recurrence);
       const nextTask = { ...task, id: Date.now(), dueDate: nextDate, completed: false, notif15m: false, notif1h: false, notif1d: false };
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
    setNewTask({ title: '', category: taskCategories[0]?.id || 'meta', dueDate: '', dueTime: '', endTime: '', recurrence: 'none', hasReminder: false, description: '' });
    setShowAddTask(false);
    setEditingTaskId(null);
  };

  const startEditTask = (task) => {
    setNewTask({ title: task.title, category: task.category, dueDate: task.dueDate, dueTime: task.dueTime || '', endTime: task.endTime || '', recurrence: task.recurrence || 'none', hasReminder: task.hasReminder || false, description: task.description || '' });
    setEditingTaskId(task.id);
    setShowAddTask(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEditTask = () => {
    setNewTask({ title: '', category: taskCategories[0]?.id || 'meta', dueDate: '', dueTime: '', endTime: '', recurrence: 'none', hasReminder: false, description: '' });
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

  // --- HANDLERS DE PRIORIDADES ---
  const handleAddPriority = (e) => {
    e.preventDefault();
    if (!newPriorityLabel.trim()) return;
    setPriorities(prev => {
      const arr = Array.isArray(prev) ? prev : [];
      return [...arr, { id: Date.now(), label: newPriorityLabel.trim(), dueDate: newPriorityDate, completed: false, completedAt: null }];
    });
    setNewPriorityLabel('');
    setNewPriorityDate('');
    setShowAddPriority(false);
    hapticFeedback(30);
  };

  const togglePriority = (id) => {
    setPriorities(prev => {
      const arr = Array.isArray(prev) ? prev : [];
      return arr.map(p => p.id === id ? { ...p, completed: !p.completed, completedAt: !p.completed ? new Date().toISOString() : null } : p);
    });
    hapticFeedback(20);
  };

  const movePriority = (id, dir) => {
    setPriorities(prev => {
      const arr = [...(Array.isArray(prev) ? prev : [])];
      const pending = arr.filter(p => !p.completed);
      const done = arr.filter(p => p.completed);
      const idx = pending.findIndex(p => p.id === id);
      if (idx < 0) return prev;
      const newIdx = dir === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= pending.length) return prev;
      const temp = pending[idx];
      pending[idx] = pending[newIdx];
      pending[newIdx] = temp;
      hapticFeedback(15);
      return [...pending, ...done];
    });
  };

  const handlePriorityDragStart = (e, id) => {
    e.stopPropagation();
    draggingPriorityId.current = id;
    setActivePriorityDrag(id);
    hapticFeedback(20);
  };
  const handlePriorityDragMove = (e) => {
    if (!draggingPriorityId.current) return;
    e.preventDefault();
    const isMouse = typeof e?.type === 'string' && e.type.includes('mouse');
    const clientX = isMouse ? e.clientX : (e?.touches?.[0]?.clientX || 0);
    const clientY = isMouse ? e.clientY : (e?.touches?.[0]?.clientY || 0);
    const target = document.elementFromPoint(clientX, clientY)?.closest('[data-priority-drag-id]');
    if (target && target.dataset.priorityDragId !== String(draggingPriorityId.current)) {
      const targetId = Number(target.dataset.priorityDragId);
      setPriorities(prev => {
        const arr = [...(Array.isArray(prev) ? prev : [])];
        const idx1 = arr.findIndex(p => p && p.id === draggingPriorityId.current);
        const idx2 = arr.findIndex(p => p && p.id === targetId);
        if (idx1 >= 0 && idx2 >= 0 && !arr[idx2]?.completed) {
          const temp = arr[idx1]; arr.splice(idx1, 1); arr.splice(idx2, 0, temp);
          return arr;
        }
        return prev;
      });
      hapticFeedback(15);
    }
  };
  const handlePriorityDragEnd = (e) => {
    e.stopPropagation();
    if (draggingPriorityId.current) hapticFeedback(20);
    draggingPriorityId.current = null;
    setActivePriorityDrag(null);
  };

  const handleAddDailyTask = (e) => {
    e.preventDefault();
    if (!newDailyTask.trim()) return;
    const dateStr = getLocalYYYYMMDD(selectedDate); // Fuso horário seguro
    const nTask = { id: Date.now(), text: newDailyTask.trim(), time: newDailyTaskTime, hasReminder: newDailyTaskReminder, completed: false };
    setDailyTasks(prev => ({ ...prev, [dateStr]: [...(prev[dateStr] || []), nTask] }));
    setNewDailyTask('');
    setNewDailyTaskTime('');
    setNewDailyTaskReminder(false);
    if(newDailyTaskReminder) requestNotificationPermission();
  };

  const toggleDailyTask = (dateStr, taskId) => {
    setDailyTasks(prev => ({ ...prev, [dateStr]: (prev[dateStr] || []).map(t => t && t.id === taskId ? { ...t, completed: !t.completed } : t) }));
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
        const activeStr = selectedDate ? getLocalYYYYMMDD(selectedDate) : todayStr;
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
  const renderDashboard = () => {
    // Ontem
    const yesterdayObj = new Date(todayObj);
    yesterdayObj.setDate(yesterdayObj.getDate() - 1);
    const yesterdayStr = getLocalYYYYMMDD(yesterdayObj);

    // Foco do Dia ordenado: ativos no topo, concluídos no fim
    const activeDayTasks = dayTasksForDashboard.filter(t => t && t.id && !t.completed);
    const completedDayTasks = dayTasksForDashboard.filter(t => t && t.id && t.completed);
    const sortedDayTasks = [...activeDayTasks, ...completedDayTasks];

    // Prioridades ordenadas: ativas no topo, concluídas no fim
    const activePriorities = priorities.filter(p => !p.completed);
    const completedPriorities = priorities.filter(p => p.completed);

    return (
      <div className="animate-in fade-in pb-20 relative space-y-6">

        {/* ── PRIORIDADES ── */}
        <div>
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-sm font-bold uppercase tracking-widest text-amber-400 flex items-center gap-2">
              <Flag className="w-4 h-4" /> Prioridades
            </h2>
            <button
              onClick={() => { setActiveTab('routine'); hapticFeedback(20); }}
              className="text-[10px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-2 py-1 rounded-lg"
            >
              Editar
            </button>
          </div>

          {activePriorities.length === 0 && completedPriorities.length === 0 ? (
            <div className="bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-4 rounded-xl text-center shadow-sm">
              <p className="text-slate-600 dark:text-slate-400 font-medium text-sm">Sem prioridades definidas. Adicione na aba Foco.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activePriorities.map(p => (
                <div key={p.id} className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-3.5 flex items-center gap-3 shadow-sm">
                  <button
                    onClick={() => togglePriority(p.id)}
                    className="w-6 h-6 shrink-0 rounded-full border-2 border-amber-400/70 flex items-center justify-center active:scale-75 transition-all"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate block">{p.label}</span>
                    {p.dueDate && (
                      <span className="text-[10px] text-amber-400/80 font-mono mt-0.5 block">{formatDateLocal(p.dueDate)}</span>
                    )}
                  </div>
                </div>
              ))}
              {completedPriorities.map(p => (
                <div key={p.id} className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 flex items-center gap-3 opacity-50">
                  <button
                    onClick={() => togglePriority(p.id)}
                    className="w-6 h-6 shrink-0 rounded-full bg-emerald-500 border-2 border-emerald-500 flex items-center justify-center active:scale-75 transition-all"
                  >
                    <Check className="w-3.5 h-3.5 text-white" />
                  </button>
                  <span className="text-sm text-slate-500 line-through truncate">{p.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── FOCO DO DIA ── */}
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-blue-400 mb-3 px-1 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> Foco do Dia
          </h2>
          {sortedDayTasks.length === 0 ? (
            <div className="bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-4 rounded-xl text-center shadow-sm">
              <p className="text-slate-600 dark:text-slate-400 font-medium text-sm">Lista de foco vazia. ✨</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedDayTasks.map(task => {
                const isDraggingThis = activeDailyDrag === task.id;
                return (
                  <div key={task.id} data-daily-drag-id={task.id} className={isDraggingThis ? 'scale-[1.02] shadow-2xl ring-1 ring-blue-500 z-50 rounded-xl' : 'transition-all duration-200'}>
                    <SwipeableItem
                      onEdit={() => setEditPrompt({ type: 'dailyTask', id: task.id, label: task.text, originalDateStr: todayStr, dateStr: todayStr, time: task.time || '' })}
                      onDeleteRequest={() => setDeletePrompt({ type: 'dailyTask', id: task.id, title: task.text, dateStr: todayStr })}
                      frontClass="bg-slate-100/80 dark:bg-slate-800/80 border-slate-700/80 p-3.5 flex items-center justify-between" wrapperClass="mb-0"
                    >
                      <label className="flex items-center gap-3 cursor-pointer flex-1 w-full min-w-0 pr-2">
                        <div className="relative flex items-center justify-center w-6 h-6 shrink-0">
                          <input type="checkbox" checked={!!task.completed} onChange={() => toggleDailyTask(todayStr, task.id)} className="peer sr-only"/>
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all duration-200 active:scale-75 ${task.completed ? 'bg-blue-500 border-blue-500' : 'border-slate-500'}`}>{task.completed && <Check className="w-3.5 h-3.5 text-slate-900 dark:text-white" />}</div>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className={`text-sm font-medium truncate transition-colors ${task.completed ? 'text-slate-500 line-through' : 'text-slate-800 dark:text-slate-200'}`}>{task.text}</span>
                          {(task.time || task.hasReminder) && (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {task.time && <span className="text-[10px] text-blue-400 font-mono bg-blue-500/10 px-1 rounded flex items-center gap-0.5"><Clock className="w-2.5 h-2.5"/> {task.time}</span>}
                              {task.hasReminder && !task.completed && <BellRing className="w-2.5 h-2.5 text-blue-400" />}
                            </div>
                          )}
                        </div>
                      </label>
                      {!task.completed && <div className="p-3 -mr-3 cursor-grab text-slate-500 hover:text-blue-400 transition-colors" style={{ touchAction: 'none' }} onTouchStart={(e) => handleDailyDragStart(e, task.id)} onTouchMove={handleDailyDragMove} onTouchEnd={handleDailyDragEnd} onMouseDown={(e) => handleDailyDragStart(e, task.id)} onMouseMove={handleDailyDragMove} onMouseUp={handleDailyDragEnd} onMouseLeave={handleDailyDragEnd}><GripVertical className="w-5 h-5 pointer-events-none" /></div>}
                    </SwipeableItem>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── BLOCO DE NOTAS ── */}
        <div className="bg-slate-100/80 dark:bg-slate-800/80 p-4 rounded-3xl border border-slate-700/50 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/5 rounded-full -mr-10 -mt-10 blur-xl pointer-events-none"></div>
          <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-400" /> Bloco de Notas Rápido
          </h3>
          <textarea
            value={stickyNote}
            onChange={(e) => setStickyNote(e.target.value)}
            placeholder="Anotações importantes..."
            className="w-full bg-transparent text-sm text-slate-800 dark:text-slate-200 outline-none resize-none min-h-[80px] placeholder:text-slate-600 focus:placeholder:text-slate-500 transition-colors"
          />
        </div>

        {/* ── DESPESAS POR CATEGORIA ── */}
        <DespesasResumo entries={financeEntries} />

        {/* ── PRÓXIMOS DIAS ── */}
        <div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-3 px-1 flex items-center gap-2"><CalendarClock className="w-4 h-4" /> Próximos Dias</h2>
          {dashboardAgendaTasks.length > 0 ? (
            <div className="space-y-2 opacity-95">
              {dashboardAgendaTasks.filter(t => t && t.id).map(task => {
                const status = getTaskStatus(task.dueDate, task.completed);
                return (
                  <SwipeableItem key={task.id} onEdit={() => startEditTask(task)} onDeleteRequest={() => setDeletePrompt({ type: 'task', id: task.id, title: task.title })} frontClass={`${getStatusColors(status)} p-4 flex items-center gap-3`} wrapperClass="mb-0">
                    <button onClick={() => toggleTask(task.id)} className={`w-6 h-6 rounded-md border flex items-center justify-center transition-all duration-300 shrink-0 active:scale-75 ${task.completed ? 'bg-blue-600 border-blue-600' : 'border-slate-500'}`}>{task.completed && <Check className="w-4 h-4 text-slate-900 dark:text-white" />}</button>
                    <div className="flex-1 min-w-0 pointer-events-none">
                      <h3 className={`font-medium text-sm truncate transition-colors ${task.completed ? 'line-through text-slate-500' : ''}`}>{task.title}</h3>
                      {task.description && <p className={`text-[10px] mt-0.5 line-clamp-1 ${task.completed ? 'text-slate-600' : 'text-slate-500 dark:text-slate-400'}`}>{task.description}</p>}
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
  };

  const renderTasks = () => (
    <div className="space-y-6 animate-in fade-in pb-20">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Agenda Completa</h1>
        <button onClick={() => { cancelEditTask(); setShowAddTask(true); hapticFeedback(30); }} className="bg-blue-600 text-slate-900 dark:text-white p-2 rounded-full transition-colors shadow-lg shadow-blue-500/30 active:scale-95"><Plus className="w-5 h-5" /></button>
      </div>

      {showAddTask && (
        <form onSubmit={handleSaveTask} className="bg-slate-100 dark:bg-slate-800 p-5 rounded-3xl border border-slate-300 dark:border-slate-700 mb-6 space-y-5 shadow-lg">
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Título da Tarefa</label>
            <input type="text" required className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-white outline-none focus:border-blue-500" value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})} placeholder="Ex: Reunião" />
          </div>
          
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Notas (Opcional)</label>
            <textarea 
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-white outline-none focus:border-blue-500 resize-none" 
              rows="2" 
              value={newTask.description || ''} 
              onChange={e => setNewTask({...newTask, description: e.target.value})} 
              placeholder="Detalhes, links, observações..." 
            />
          </div>

          <div className="grid grid-cols-2 gap-3 w-full">
            <div className="min-w-0 flex flex-col">
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Data</label>
              <input type="date" required
                style={{ minWidth: 0, maxWidth: '100%', WebkitAppearance: 'none', appearance: 'none' }}
                className="w-full h-12 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 text-slate-900 dark:text-white text-sm outline-none color-scheme-dark focus:border-blue-500 box-border"
                value={newTask.dueDate} onChange={e => setNewTask({...newTask, dueDate: e.target.value})} />
            </div>
            <div className="min-w-0 flex flex-col">
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Recorrência</label>
              <select
                style={{ minWidth: 0, maxWidth: '100%' }}
                className="w-full h-12 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 text-slate-900 dark:text-white text-sm outline-none focus:border-blue-500 box-border"
                value={newTask.recurrence} onChange={e => setNewTask({...newTask, recurrence: e.target.value})}>
                <option value="none">Nenhuma</option><option value="daily">Diária</option><option value="weekly">Semanal</option><option value="monthly">Mensal</option><option value="yearly">Anual</option>
              </select>
            </div>
            <div className="min-w-0 flex flex-col">
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Hora Início (Op)</label>
              <input type="time"
                style={{ minWidth: 0, maxWidth: '100%', WebkitAppearance: 'none', appearance: 'none' }}
                className="w-full h-12 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 text-slate-900 dark:text-white text-sm outline-none color-scheme-dark focus:border-blue-500 box-border"
                value={newTask.dueTime} onChange={e => setNewTask({...newTask, dueTime: e.target.value})} />
            </div>
            <div className="min-w-0 flex flex-col">
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Hora Fim (Op)</label>
              <input type="time"
                style={{ minWidth: 0, maxWidth: '100%', WebkitAppearance: 'none', appearance: 'none' }}
                className="w-full h-12 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-3 text-slate-900 dark:text-white text-sm outline-none color-scheme-dark focus:border-blue-500 box-border"
                value={newTask.endTime} onChange={e => setNewTask({...newTask, endTime: e.target.value})} />
            </div>
          </div>
          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Categoria</label>
              <button type="button" onClick={() => setIsEditingCategories(!isEditingCategories)} className="text-xs font-medium text-blue-400 bg-blue-500/10 px-2 py-1 rounded-md">{isEditingCategories ? 'Concluir' : 'Editar Lista'}</button>
            </div>
            {isEditingCategories ? (
              <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-3 space-y-2">
                <SwipeHint />
                <div className="max-h-36 overflow-y-auto space-y-2 pr-2">
                  {taskCategories.map(cat => (
                    <SwipeableItem key={cat.id} wrapperClass="mb-0" frontClass="p-2.5 bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 flex justify-between" onEdit={() => setEditPrompt({ type: 'category', id: cat.id, label: cat.label })} onDeleteRequest={() => setDeletePrompt({ type: 'category', id: cat.id, title: cat.label })}>
                      <span className="text-slate-800 dark:text-slate-200 truncate pr-2 font-medium w-full">{cat.label}</span>
                    </SwipeableItem>
                  ))}
                </div>
                <div className="flex gap-2 mt-2 pt-2 border-t border-slate-700/50">
                  <input type="text" value={newCategoryLabel} onChange={e => setNewCategoryLabel(e.target.value)} className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-sm text-slate-900 dark:text-white" placeholder="Nova..." />
                  <button type="button" onClick={() => { if(newCategoryLabel) { setTaskCategories([...taskCategories, {id: Date.now().toString(), label: newCategoryLabel}]); setNewCategoryLabel(''); } }} className="bg-blue-600 text-slate-900 dark:text-white px-4 rounded-lg text-sm font-medium">Add</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-2 hide-scrollbar">
                {taskCategories.map(cat => (
                  <button key={cat.id} type="button" onClick={() => setNewTask({...newTask, category: cat.id})} className={`shrink-0 px-5 py-2.5 rounded-full text-sm font-bold border-2 transition-all active:scale-95 ${newTask.category === cat.id ? 'bg-blue-600 border-blue-400 text-slate-900 dark:text-white shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400'}`}>{cat.label}</button>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-3 pt-2 border-t border-slate-700/50">
            <button type="button" onClick={cancelEditTask} className="px-5 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-medium">Cancelar</button>
            <button type="submit" className="flex-1 bg-blue-600 text-slate-900 dark:text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-500/30">Salvar Tarefa</button>
          </div>
        </form>
      )}

      <div className="space-y-1">
        {tasks.length > 0 && !showAddTask && <SwipeHint />}
        {sortedTasksGlobally.filter(t => t && t.id).map(task => {
          const status = getTaskStatus(task.dueDate, task.completed);
          const classStr = getStatusColors(status);
          const categoryObj = taskCategories.find(c => c.id === task.category);
          return (
            <SwipeableItem key={task.id} onEdit={() => startEditTask(task)} onDeleteRequest={() => setDeletePrompt({ type: 'task', id: task.id, title: task.title })} frontClass={`${classStr} p-4 flex items-center gap-4`}>
              <button onClick={() => toggleTask(task.id)} className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 active:scale-75 ${task.completed ? 'bg-blue-600 border-blue-600' : 'border-slate-500'}`}>{task.completed && <Check className="w-4 h-4 text-slate-900 dark:text-white" />}</button>
              <div className="flex-1 min-w-0 pointer-events-none">
                <h3 className={`font-bold truncate ${task.completed ? 'line-through text-slate-500' : ''}`}>{task.title}</h3>
                {task.description && <p className={`text-[11px] mt-1 line-clamp-2 leading-tight ${task.completed ? 'text-slate-600' : 'text-slate-500 dark:text-slate-400'}`}>{task.description}</p>}
                <p className="text-xs flex items-center gap-2 mt-1 opacity-80"><span className="capitalize">{categoryObj?.label || 'Geral'}</span><span>•</span><span>{formatDateLocal(task.dueDate)} {task.dueTime}</span></p>
              </div>
              {task.dueDate && !task.completed && (
                <button
                  onClick={(e) => { e.stopPropagation(); downloadTaskICS(task); hapticFeedback(30); }}
                  className="shrink-0 w-8 h-8 rounded-lg bg-blue-600/15 hover:bg-blue-600/30 border border-blue-500/30 flex items-center justify-center active:scale-90 transition"
                  title="Adicionar ao Calendário do iPhone"
                  aria-label="Adicionar ao Calendário"
                >
                  <CalendarPlus className="w-4 h-4 text-blue-400" />
                </button>
              )}
            </SwipeableItem>
          );
        })}
      </div>
    </div>
  );

  const renderRoutine = () => {
    const dateStr = getLocalYYYYMMDD(selectedDate);
    const dayHabits = safeHabits[dateStr] || {};
    const dayTasks = (Array.isArray(safeDailyTasks[dateStr]) ? safeDailyTasks[dateStr] : []).filter(t => t && t.id);
    const totalItems = priorities.length + dayTasks.length;
    const completedItems = priorities.filter(p => p.completed).length + dayTasks.filter(t => t.completed).length;
    const progressPercent = totalItems === 0 ? 0 : Math.round((completedItems / totalItems) * 100);

    return (
      <div className="space-y-6 animate-in fade-in pb-20">
        <div className="flex items-center justify-between bg-slate-100 dark:bg-slate-800 p-4 rounded-2xl border border-slate-300 dark:border-slate-700 shadow-md">
          <button onClick={() => {const d=new Date(selectedDate); d.setDate(d.getDate()-1); setSelectedDate(d);}} className="p-2 text-slate-500 dark:text-slate-400 hover:text-white"><ChevronLeft /></button>
          <div className="text-center"><p className="text-sm font-semibold text-blue-400 uppercase tracking-widest">{selectedDate.toLocaleDateString('pt-BR', { weekday: 'long' })}</p><p className="text-xl font-bold text-slate-900 dark:text-white">{selectedDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}</p></div>
          <button onClick={() => {const d=new Date(selectedDate); d.setDate(d.getDate()+1); setSelectedDate(d);}} className="p-2 text-slate-500 dark:text-slate-400 hover:text-white"><ChevronRight /></button>
        </div>

        <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-2xl border border-slate-300 dark:border-slate-700 relative overflow-hidden">
          <div className="flex justify-between items-end mb-2 relative z-10">
            <div><p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">Progresso</p><p className="text-sm font-medium text-slate-700 dark:text-slate-300">{completedItems} de {totalItems}</p></div>
            <span className="text-2xl font-bold font-mono text-blue-400">{progressPercent}%</span>
          </div>
          <div className="w-full h-2.5 bg-white dark:bg-slate-900 rounded-full overflow-hidden"><div className="h-full rounded-full bg-blue-500 transition-all duration-500" style={{ width: `${progressPercent}%` }}></div></div>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2 px-1"><CheckCircle2 className="w-4 h-4 text-blue-400" /> Foco do Dia</h2>
          <form onSubmit={handleAddDailyTask} className="bg-slate-100/60 dark:bg-slate-800/60 border border-slate-700/60 p-3 rounded-xl flex flex-col gap-2">
            <input type="text" className="w-full bg-transparent p-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-500 outline-none" value={newDailyTask} onChange={e => setNewDailyTask(e.target.value)} placeholder="Compromisso rápido..." />
            <div className="flex items-center justify-between border-t border-slate-700/50 pt-2 px-1">
              <div className="flex items-center gap-2">
                <input type="time" value={newDailyTaskTime} onChange={e => setNewDailyTaskTime(e.target.value)} className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 rounded-lg p-1.5 outline-none color-scheme-dark"/>
              </div>
              <button type="submit" disabled={!newDailyTask.trim()} className="bg-blue-600 disabled:opacity-50 text-slate-900 dark:text-white px-4 py-1.5 rounded-lg text-sm font-bold">Add</button>
            </div>
          </form>

          <div className="space-y-2 mt-3">
            {dayTasks.map(task => (
              <div key={task.id} data-daily-drag-id={task.id} className={activeDailyDrag === task.id ? 'scale-[1.02] shadow-2xl ring-1 ring-blue-500 z-50 rounded-xl' : 'transition-all duration-200'}>
                <SwipeableItem 
                  onEdit={() => setEditPrompt({ type: 'dailyTask', id: task.id, label: task.text, originalDateStr: dateStr, dateStr: dateStr, time: task.time || '' })} 
                  onDeleteRequest={() => setDeletePrompt({ type: 'dailyTask', id: task.id, title: task.text, dateStr: dateStr })} 
                  frontClass="bg-slate-100/80 dark:bg-slate-800/80 border-slate-700/80 p-3.5 flex items-center justify-between" wrapperClass="mb-0"
                >
                  <label className="flex items-center gap-3 cursor-pointer flex-1 w-full min-w-0 pr-2">
                    <div className="relative flex items-center justify-center w-6 h-6 shrink-0">
                      <input type="checkbox" checked={!!task.completed} onChange={() => toggleDailyTask(dateStr, task.id)} className="peer sr-only"/>
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${task.completed ? 'bg-blue-500 border-blue-500' : 'border-slate-500'}`}>{task.completed && <Check className="w-3.5 h-3.5 text-slate-900 dark:text-white" />}</div>
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className={`text-sm font-medium truncate ${task.completed ? 'text-slate-500 line-through' : 'text-slate-800 dark:text-slate-200'}`}>{task.text}</span>
                      {task.time && <div className="flex items-center gap-1.5 mt-0.5"><span className="text-[10px] text-blue-400 font-mono bg-blue-500/10 px-1 rounded flex items-center gap-0.5"><Clock className="w-2.5 h-2.5"/> {task.time}</span></div>}
                    </div>
                  </label>
                  {!task.completed && <div className="p-3 -mr-3 cursor-grab text-slate-500 hover:text-blue-400" onTouchStart={(e) => handleDailyDragStart(e, task.id)} onTouchMove={handleDailyDragMove} onTouchEnd={handleDailyDragEnd} onMouseDown={(e) => handleDailyDragStart(e, task.id)} onMouseMove={handleDailyDragMove} onMouseUp={handleDailyDragEnd}><GripVertical className="w-5 h-5 pointer-events-none" /></div>}
                </SwipeableItem>
              </div>
            ))}
          </div>
        </div>

        {/* ── PRIORIDADES (substitui Hábitos Fixos) ── */}
        <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
          <div className="flex justify-between items-center px-1">
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Flag className="w-4 h-4 text-amber-400" /> Prioridades
            </h2>
            <button
              onClick={() => setShowAddPriority(!showAddPriority)}
              className="text-xs font-medium text-amber-400 bg-amber-500/10 px-2 py-1 rounded-md"
            >
              {showAddPriority ? 'Fechar' : '+ Adicionar'}
            </button>
          </div>

          {showAddPriority && (
            <form onSubmit={handleAddPriority} className="bg-slate-100 dark:bg-slate-800 p-3.5 rounded-xl border border-slate-300 dark:border-slate-700 space-y-3">
              <input
                type="text" required
                className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-sm text-slate-900 dark:text-white outline-none focus:border-amber-500"
                value={newPriorityLabel}
                onChange={e => setNewPriorityLabel(e.target.value)}
                placeholder="Ex: Renovar contrato, Pagar fatura..."
              />
              <div className="flex gap-2 items-center">
                <div className="flex-1 min-w-0">
                  <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1 block">Data limite (opcional)</label>
                  <input
                    type="date"
                    value={newPriorityDate}
                    onChange={e => setNewPriorityDate(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-sm text-slate-900 dark:text-white outline-none color-scheme-dark"
                    style={{ minWidth: 0, WebkitAppearance: 'none' }}
                  />
                </div>
                <button type="submit" className="self-end bg-amber-500 hover:bg-amber-400 text-slate-900 px-4 py-2.5 rounded-lg text-sm font-bold">Salvar</button>
              </div>
            </form>
          )}

          {priorities.length === 0 && !showAddPriority && (
            <div className="bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-4 rounded-xl text-center">
              <p className="text-slate-500 text-sm">Sem prioridades. Toque em "+ Adicionar" para criar.</p>
            </div>
          )}

          <div className="space-y-2">
            {/* Ativas (arrastáveis) */}
            {priorities.filter(p => !p.completed).map((p, idx, arr) => {
              const isDraggingThis = activePriorityDrag === p.id;
              return (
                <div
                  key={p.id}
                  data-priority-drag-id={p.id}
                  className={isDraggingThis ? 'scale-[1.02] shadow-2xl ring-1 ring-amber-500 z-50 rounded-xl' : 'transition-all duration-200'}
                >
                  <SwipeableItem
                    onEdit={() => setEditPrompt({ type: 'priority', id: p.id, label: p.label, dueDate: p.dueDate || '' })}
                    onDeleteRequest={() => setDeletePrompt({ type: 'priority', id: p.id, title: p.label })}
                    frontClass="bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 p-3.5 flex items-center gap-3"
                    wrapperClass="mb-0"
                  >
                    {/* Checkbox */}
                    <button
                      onClick={() => togglePriority(p.id)}
                      className="w-6 h-6 shrink-0 rounded-full border-2 border-amber-400/70 flex items-center justify-center active:scale-75 transition-all"
                    />
                    {/* Conteúdo */}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-200 block truncate">{p.label}</span>
                      {p.dueDate && (
                        <span className="text-[10px] text-amber-400/80 font-mono">{formatDateLocal(p.dueDate)}</span>
                      )}
                    </div>
                    {/* Setas de reposicionamento */}
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => movePriority(p.id, 'up')}
                        disabled={idx === 0}
                        className="p-1 text-slate-500 dark:text-slate-400 hover:text-amber-400 disabled:opacity-20 transition-colors"
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => movePriority(p.id, 'down')}
                        disabled={idx === arr.length - 1}
                        className="p-1 text-slate-500 dark:text-slate-400 hover:text-amber-400 disabled:opacity-20 transition-colors"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                    {/* Drag handle */}
                    <div
                      className="p-2 cursor-grab text-slate-500 hover:text-amber-400 transition-colors"
                      style={{ touchAction: 'none' }}
                      onTouchStart={(e) => handlePriorityDragStart(e, p.id)}
                      onTouchMove={handlePriorityDragMove}
                      onTouchEnd={handlePriorityDragEnd}
                      onMouseDown={(e) => handlePriorityDragStart(e, p.id)}
                      onMouseMove={handlePriorityDragMove}
                      onMouseUp={handlePriorityDragEnd}
                      onMouseLeave={handlePriorityDragEnd}
                    >
                      <GripVertical className="w-4 h-4 pointer-events-none" />
                    </div>
                  </SwipeableItem>
                </div>
              );
            })}

            {/* Concluídas */}
            {priorities.filter(p => p.completed).length > 0 && (
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700/50 space-y-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Concluídas</p>
                {priorities.filter(p => p.completed).map(p => (
                  <SwipeableItem
                    key={p.id}
                    onEdit={() => setEditPrompt({ type: 'priority', id: p.id, label: p.label, dueDate: p.dueDate || '' })}
                    onDeleteRequest={() => setDeletePrompt({ type: 'priority', id: p.id, title: p.label })}
                    frontClass="bg-white dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 p-3.5 flex items-center gap-3 opacity-60"
                    wrapperClass="mb-0"
                  >
                    <button
                      onClick={() => togglePriority(p.id)}
                      className="w-6 h-6 shrink-0 rounded-full bg-emerald-500 border-2 border-emerald-500 flex items-center justify-center active:scale-75"
                    >
                      <Check className="w-3.5 h-3.5 text-white" />
                    </button>
                    <span className="text-sm text-slate-500 line-through truncate">{p.label}</span>
                  </SwipeableItem>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderPortfolio = () => (
    <div className="space-y-6 animate-in fade-in pb-20">
      <header className="flex justify-between items-start mb-6">
        <div><h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Ativos</h1><p className="text-slate-500 dark:text-slate-400">Distribuição do património.</p></div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setIsBalanceVisible(!isBalanceVisible); hapticFeedback(10); }} className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 active:scale-90 transition-all">
            {isBalanceVisible ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
          </button>
          <button onClick={() => setIsEditingPortfolioCats(!isEditingPortfolioCats)} className={`p-2 rounded-full ${isEditingPortfolioCats ? 'bg-blue-600 text-slate-900 dark:text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}><Edit2 className="w-5 h-5" /></button>
        </div>
      </header>

      {/* Total do portfólio com opção de ocultar */}
      <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-2xl border border-emerald-500/30 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/90 mb-1">Total Investido</p>
          <p className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
            {isBalanceVisible ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(currentPortfolioTotal) : 'R$ •••••'}
          </p>
        </div>
        <Briefcase className="w-8 h-8 text-emerald-400/50" />
      </div>

      <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-xl border border-slate-300 dark:border-slate-700 flex items-center justify-between">
        <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Data Base</label>
        <input type="date" value={portfolioUpdateDate} onChange={e => setPortfolioUpdateDate(e.target.value)} className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-slate-900 dark:text-white text-sm color-scheme-dark" />
      </div>

      {isEditingPortfolioCats ? (
        <div className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl p-4 space-y-2">
          <SwipeHint />
          <div className="max-h-64 overflow-y-auto space-y-2">
            {portfolioCategories.map(cat => (
              <SwipeableItem key={cat.id} wrapperClass="mb-0" frontClass="p-3 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 flex justify-between" onEdit={() => setEditPrompt({ type: 'portfolioCat', id: cat.id, label: cat.label })} onDeleteRequest={() => setDeletePrompt({ type: 'portfolioCat', id: cat.id, title: cat.label })}>
                <span className="text-slate-800 dark:text-slate-200 truncate pr-2 font-medium">{cat.label}</span>
              </SwipeableItem>
            ))}
          </div>
          <div className="flex gap-2 mt-2 pt-4 border-t border-slate-700/50">
            <input type="text" value={newPortfolioCatLabel} onChange={e => setNewPortfolioCatLabel(e.target.value)} className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-sm text-slate-900 dark:text-white" placeholder="Novo ativo..." />
            <button type="button" onClick={() => { if(newPortfolioCatLabel.trim()){ setPortfolioCategories([...portfolioCategories, {id: `port_${Date.now()}`, label: newPortfolioCatLabel.trim()}]); setNewPortfolioCatLabel('');} }} className="bg-blue-600 text-slate-900 dark:text-white px-4 rounded-lg text-sm font-medium">Add</button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {portfolioCategories.map(cat => (
            <div key={cat.id} className="bg-slate-100 dark:bg-slate-800 p-4 rounded-xl border border-slate-300 dark:border-slate-700 flex flex-col justify-between">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 truncate">{cat.label}</label>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 font-medium text-[13px]">R$</span>
                {isBalanceVisible
                ? <input type="text" inputMode="numeric" placeholder="0,00" value={safePortfolio[cat.id] || ''} onChange={e => setPortfolio(prev => ({...prev, [cat.id]: formatCurrencyInput(e.target.value)}))} className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg py-2.5 pl-7 pr-2 text-slate-900 dark:text-white font-mono text-[14px]" />
                : <p className="text-slate-500 font-mono text-[14px] pl-7 py-2.5">•••••</p>
              }
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-slate-100 dark:bg-slate-800 p-5 rounded-3xl border border-slate-300 dark:border-slate-700 mt-8 relative overflow-hidden">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-5 flex items-center gap-2"><Activity className="w-5 h-5 text-blue-400"/> Evolução</h3>
        <div className="grid grid-cols-2 gap-3 mb-4 relative z-10">
          <div className="bg-white/50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-700/50">
            <p className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase mb-1.5">Anterior</p>
            <div className="relative"><span className="absolute left-0 top-1/2 -translate-y-1/2 text-slate-500 text-[13px]">R$</span><input type="text" inputMode="numeric" placeholder="0,00" value={prevPortfolioBalance} onChange={e => setPrevPortfolioBalance(formatCurrencyInput(e.target.value))} className="w-full bg-transparent pl-5 pr-1 text-slate-900 dark:text-white font-mono text-[14px]" /></div>
          </div>
          <div className="bg-white/50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-700/50">
            <p className="text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase mb-1.5">Atual</p>
            <p className="text-[14px] font-mono text-slate-900 dark:text-white pt-0.5">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(currentPortfolioTotal)}</p>
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
  if (lockActive && isLocked) return <LockScreen onUnlock={() => setIsLocked(false)} />;
  if (isInitializing) return <div className="min-h-screen bg-white dark:bg-slate-900 flex items-center justify-center"><RefreshCw className="w-8 h-8 text-blue-500 animate-spin" /></div>;
  if (!firebaseUser) return <AuthScreen auth={authRef.current} />;
  if (!isDataLoaded) return (
    <div className="min-h-[100dvh] bg-white dark:bg-slate-900 flex flex-col items-center justify-center p-6">
      <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 rounded-2xl flex items-center justify-center shadow-[0_10px_30px_rgba(59,130,246,0.4)] mb-6 animate-pulse">
        <span className="text-slate-900 dark:text-white text-3xl font-black">P</span>
      </div>
      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
        <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
        <span className="text-sm font-medium">Carregando seus dados…</span>
      </div>
      <p className="text-xs text-slate-500 mt-2">Sincronizando com a nuvem</p>
    </div>
  );

  return (
    <div className="flex justify-center bg-white dark:bg-slate-900 font-sans text-slate-800 dark:text-slate-200 selection:bg-blue-500/30 h-[100dvh] w-full overflow-hidden">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 relative flex flex-col h-full shadow-2xl border-x border-slate-200 dark:border-slate-800">
        
        <div className="shrink-0 pt-6 pb-2 px-6 flex justify-between items-center bg-white/90 dark:bg-slate-900/90 backdrop-blur-md z-10 border-b border-slate-200 dark:border-slate-800">
          <div className="font-black text-xl text-slate-900 dark:text-white flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-blue-700 rounded-[8px] flex items-center justify-center shadow-lg"><span className="text-slate-900 dark:text-white text-sm">P</span></div>
            Planner<span className="text-blue-500">Full</span>
            <span className="ml-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{APP_VERSION}</span>
          </div>
          <button onClick={() => setIsSidebarOpen(true)} className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 border-2 border-slate-400 dark:border-slate-600 flex items-center justify-center relative active:scale-95">
            <User className="w-5 h-5 text-slate-700 dark:text-slate-300" />
            <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-slate-900 ${syncStatus === 'online' ? 'bg-emerald-500' : syncStatus === 'error' ? 'bg-red-500' : 'bg-yellow-500'}`}></span>
          </button>
        </div>

        {syncError && (
          <div className="shrink-0 bg-red-500/10 border-b border-red-500/30 px-4 py-3 flex items-start gap-3 animate-in slide-in-from-top">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-red-300 leading-snug">{syncError}</p>
              <div className="flex gap-3 mt-2">
                <button onClick={retrySync} className="text-xs font-bold text-red-400 hover:text-red-300 flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Tentar novamente
                </button>
                <button onClick={() => setSyncError(null)} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-300">Dispensar</button>
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-6 scroll-smooth">
          <TabErrorBoundary>
            {activeTab === 'dashboard' && renderDashboard()}
            {activeTab === 'tasks' && renderTasks()}
            {activeTab === 'routine' && renderRoutine()}
            {activeTab === 'financas' && <FinancasTab cards={financeCards} entries={financeEntries} categories={financeCategories} setCards={setFinanceCards} setEntries={setFinanceEntries} setCategories={setFinanceCategories} />}
            {activeTab === 'calculadora' && <CalculadoraTab />}
            {activeTab === 'portfolio' && renderPortfolio()}
          </TabErrorBoundary>
        </main>

        <nav className="shrink-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 pb-safe pt-2 px-3 flex justify-between items-center w-full z-20">
          {[
            { id: 'dashboard', icon: Home, label: 'Início' }, { id: 'tasks', icon: CheckSquare, label: 'Agenda' },
            { id: 'routine', icon: ListTodo, label: 'Foco' }, { id: 'financas', icon: Wallet, label: 'Finanças' }, { id: 'calculadora', icon: Calculator, label: 'Cálculo' }, { id: 'portfolio', icon: Briefcase, label: 'Ativos' }
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
            <div className="relative w-72 h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-right">
              <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-800/50">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-14 h-14 rounded-full bg-blue-600/20 border border-blue-500/50 flex items-center justify-center"><User className="w-7 h-7 text-blue-400" /></div>
                  <button onClick={() => setIsSidebarOpen(false)} className="p-2 text-slate-500 dark:text-slate-400 hover:text-white bg-slate-100 dark:bg-slate-800 rounded-full"><X className="w-5 h-5" /></button>
                </div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white truncate">{firebaseUser?.email || "Usuário"}</h2>
                <div className="flex items-center gap-2 mt-2">
                  {syncStatus === 'online' ? <><Cloud className="w-4 h-4 text-emerald-400"/><span className="text-xs text-emerald-400 font-medium">Sincronizado</span></> :
                   syncStatus === 'syncing' ? <><RefreshCw className="w-4 h-4 text-yellow-400 animate-spin"/><span className="text-xs text-yellow-400 font-medium">A sincronizar...</span></> :
                   syncStatus === 'error' ? <><AlertCircle className="w-4 h-4 text-red-400"/><button onClick={retrySync} className="text-xs text-red-400 font-medium hover:text-red-300 underline">Erro — Tentar novamente</button></> :
                   <><CloudOff className="w-4 h-4 text-slate-500"/><span className="text-xs text-slate-500 font-medium">Offline</span></>}
                </div>
                {localLastUpdated && (
                  <p className="text-[10px] text-slate-500 mt-1.5">
                    Última sincronização: {new Date(localLastUpdated).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
              <div className="flex-1 p-4 space-y-4">
                <div className="w-full p-3 rounded-xl bg-slate-100/50 dark:bg-slate-800/50 dark:bg-slate-800/50">
                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Tema</p>
                  <div className="grid grid-cols-3 gap-1 bg-white dark:bg-slate-900 rounded-lg p-1">
                    {[
                      { id: 'light', label: 'Claro', Icon: Sun },
                      { id: 'dark', label: 'Escuro', Icon: Moon },
                      { id: 'auto', label: 'Auto', Icon: SunMoon },
                    ].map(({ id, label, Icon }) => (
                      <button
                        key={id}
                        onClick={() => setThemePref(id)}
                        className={`flex flex-col items-center gap-0.5 py-2 px-1 rounded-md transition-all ${themePref === id ? 'bg-blue-600 text-slate-900 dark:text-white shadow-md' : 'text-slate-500 dark:text-slate-400 hover:text-slate-200'}`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="text-[10px] font-semibold">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={requestNotificationPermission} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"><BellRing className="w-5 h-5 text-slate-500 dark:text-slate-400" /> <span className="font-medium">Ativar Notificações</span></button>
                <button onClick={handleExportData} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"><Download className="w-5 h-5 text-slate-500 dark:text-slate-400" /> <span className="font-medium">Exportar Backup (JSON)</span></button>
                <button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"><Upload className="w-5 h-5 text-slate-500 dark:text-slate-400" /> <span className="font-medium">Importar Backup (JSON)</span></button>
                <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleImportFile} className="hidden" />
                <button onClick={() => setRestorePrompt({ list: getSnapshots(), ts: null })} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"><RefreshCw className="w-5 h-5 text-slate-500 dark:text-slate-400" /> <span className="font-medium">Restaurar Backup Automático</span></button>
                <button onClick={() => setShowLockSetup(true)} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"><Lock className="w-5 h-5 text-slate-500 dark:text-slate-400" /> <span className="font-medium">Bloqueio (Face ID / PIN) {lockActive ? '· Ativo' : ''}</span></button>
                <button onClick={handleLogout} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-500/10 text-red-400 mt-4"><LogOut className="w-5 h-5 text-red-400" /> <span className="font-medium">Terminar Sessão</span></button>
              </div>
              <div className="p-4 border-t border-slate-200 dark:border-slate-800"><p className="text-center text-[10px] text-slate-500 uppercase tracking-widest">Planner Full {APP_VERSION} · Finanças + Investimentos</p></div>
            </div>
          </div>
        )}

        {deletePrompt && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-100 dark:bg-slate-800 rounded-3xl p-6 w-full max-w-[320px] border border-slate-300 dark:border-slate-700 shadow-2xl">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4 mx-auto"><Trash2 className="w-6 h-6 text-red-400" /></div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white text-center mb-2">Atenção</h3>
              <p className="text-slate-500 dark:text-slate-400 text-center text-sm mb-6">Apagar {deletePrompt.type === 'task' ? 'a tarefa' : deletePrompt.type === 'habit' ? 'o hábito' : deletePrompt.type === 'priority' ? 'a prioridade' : 'o item'} "{deletePrompt.title}"?</p>
              <div className="flex gap-3">
                <button onClick={() => setDeletePrompt(null)} className="flex-1 py-3 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white font-medium">Cancelar</button>
                <button onClick={confirmDelete} className="flex-1 py-3 rounded-xl bg-red-600 text-slate-900 dark:text-white font-medium">Excluir</button>
              </div>
            </div>
          </div>
        )}

        {showLockSetup && <LockSetup onClose={() => { setShowLockSetup(false); setIsSidebarOpen(false); }} />}

        {restorePrompt && (
          <div className="absolute inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-100 dark:bg-slate-800 rounded-3xl p-6 w-full max-w-[360px] border border-slate-300 dark:border-slate-700 shadow-2xl max-h-[80vh] flex flex-col">
              <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center mb-3 mx-auto"><RefreshCw className="w-6 h-6 text-blue-400" /></div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white text-center mb-1">Restaurar Backup</h3>
              <p className="text-slate-500 dark:text-slate-400 text-center text-xs mb-4">Cópias automáticas locais. Restaurar vai <span className="text-yellow-500 font-bold">substituir os dados atuais</span>.</p>
              <div className="flex-1 overflow-y-auto space-y-2 mb-4 hide-scrollbar">
                {(restorePrompt.list || []).length === 0 && (
                  <p className="text-center text-sm text-slate-500 py-6">Nenhum backup automático ainda. Eles são criados conforme você usa o app.</p>
                )}
                {(restorePrompt.list || []).map((s) => (
                  <button key={s.ts} onClick={() => setRestorePrompt(p => ({ ...p, ts: s.ts }))}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${restorePrompt.ts === s.ts ? 'border-blue-500 bg-blue-500/10' : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900'}`}>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">{new Date(s.ts).toLocaleString('pt-BR')}</div>
                    <div className="text-[11px] text-slate-500">{s.count} itens</div>
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setRestorePrompt(null)} className="flex-1 py-3 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white font-medium">Cancelar</button>
                <button onClick={confirmRestore} disabled={!restorePrompt.ts} className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-medium disabled:opacity-40">Restaurar</button>
              </div>
            </div>
          </div>
        )}

        {importPrompt && (
          <div className="absolute inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-100 dark:bg-slate-800 rounded-3xl p-6 w-full max-w-[340px] border border-yellow-500/40 shadow-2xl">
              <div className="w-12 h-12 rounded-full bg-yellow-500/10 flex items-center justify-center mb-4 mx-auto"><Upload className="w-6 h-6 text-yellow-400" /></div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white text-center mb-2">Importar Backup</h3>
              <p className="text-slate-500 dark:text-slate-400 text-center text-sm mb-2">Isto vai <span className="text-yellow-400 font-bold">substituir todos os seus dados atuais</span> pelos do arquivo.</p>
              {importPrompt.exportedAt && (
                <p className="text-xs text-slate-500 text-center mb-6">Backup de {new Date(importPrompt.exportedAt).toLocaleString('pt-BR')}</p>
              )}
              <div className="flex gap-3">
                <button onClick={() => setImportPrompt(null)} className="flex-1 py-3 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white font-medium">Cancelar</button>
                <button onClick={confirmImport} className="flex-1 py-3 rounded-xl bg-yellow-600 text-slate-900 dark:text-white font-medium">Importar</button>
              </div>
            </div>
          </div>
        )}

        {editPrompt && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
            <form onSubmit={handleSaveSimpleEdit} className="bg-slate-100 dark:bg-slate-800 rounded-3xl p-6 w-full max-w-[320px] border border-slate-300 dark:border-slate-700 shadow-2xl">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Editar</h3>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Nome</label>
                  <input type="text" required autoFocus className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-white outline-none" value={editPrompt.label} onChange={e => setEditPrompt({...editPrompt, label: e.target.value})} />
                </div>
                {editPrompt.type === 'priority' && (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Data limite (opcional)</label>
                    <input type="date" className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-white outline-none color-scheme-dark" style={{ WebkitAppearance: 'none' }} value={editPrompt.dueDate || ''} onChange={e => setEditPrompt({...editPrompt, dueDate: e.target.value})} />
                  </div>
                )}
                {editPrompt.type === 'dailyTask' && (
                  <div className="flex gap-3">
                    <div className="flex-1 min-w-0">
                      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Data</label>
                      <input type="date" required className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-white outline-none color-scheme-dark" value={editPrompt.dateStr} onChange={e => setEditPrompt({...editPrompt, dateStr: e.target.value})} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Hora</label>
                      <input type="time" className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-white outline-none color-scheme-dark" value={editPrompt.time || ''} onChange={e => setEditPrompt({...editPrompt, time: e.target.value})} />
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setEditPrompt(null)} className="flex-1 py-3 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white font-medium">Cancelar</button>
                <button type="submit" className="flex-1 py-3 rounded-xl bg-blue-600 text-slate-900 dark:text-white font-medium">Salvar</button>
              </div>
            </form>
          </div>
        )}
      </div>
      <style dangerouslySetInnerHTML={{__html: `.pb-safe { padding-bottom: max(env(safe-area-inset-bottom, 20px), 16px); } input[type="date"]::-webkit-calendar-picker-indicator, input[type="time"]::-webkit-calendar-picker-indicator { filter: invert(1); opacity: 0.5; cursor: pointer; } ::-webkit-scrollbar { width: 0px; background: transparent; } .hide-scrollbar::-webkit-scrollbar { display: none; } .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}} />
    </div>
  );
}
