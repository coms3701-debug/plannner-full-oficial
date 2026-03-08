import React, { useState, useEffect, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, query, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { 
  Star, BookOpen, Gamepad2, Headphones, Utensils, 
  Moon, Heart, Check, Trash2, Plus, CalendarDays, Zap,
  Bell, BellOff, Edit3, AlertTriangle, X, Key, Smartphone, Copy, LogOut, Clock, Gift
} from 'lucide-react';

// --- CONFIGURAÇÃO DO FIREBASE ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
  apiKey: "AIzaSyCbjh-p8BxqpKCNQcy6qn6cRNyJmiaFH2g",
  authDomain: "rotina-paula.firebaseapp.com",
  projectId: "rotina-paula",
  storageBucket: "rotina-paula.firebasestorage.app",
  messagingSenderId: "68316009831",
  appId: "1:68316009831:web:5b3f02558249d12d4e4bc2",
};

// Inicialização Segura
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

// ID da App sanitizado
const rawAppId = typeof __app_id !== 'undefined' ? String(__app_id) : 'rotina-paula-v40';
const appId = rawAppId.replace(/\//g, '_'); 

const generateSafeId = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 10);

// --- Sistema de Áudio ---
let globalAudioCtx = null;
const initAudio = () => {
  if (!globalAudioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) globalAudioCtx = new AudioContext();
  }
  if (globalAudioCtx && globalAudioCtx.state === 'suspended') globalAudioCtx.resume();
};

const playTikTokSound = () => {
  initAudio(); 
  if (!globalAudioCtx) return;
  const playNote = (f, s, d, v) => {
    const o = globalAudioCtx.createOscillator();
    const g = globalAudioCtx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f, globalAudioCtx.currentTime + s);
    g.gain.setValueAtTime(0, globalAudioCtx.currentTime + s);
    g.gain.linearRampToValueAtTime(v, globalAudioCtx.currentTime + s + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, globalAudioCtx.currentTime + s + d);
    o.connect(g); g.connect(globalAudioCtx.destination);
    o.start(globalAudioCtx.currentTime + s); o.stop(globalAudioCtx.currentTime + s + d);
  };
  playNote(587.33, 0, 0.3, 0.5); playNote(880.00, 0.15, 0.4, 0.5); 
};

// --- Constantes da Aplicação ---
const DAYS = [
  { id: 'seg', label: 'Seg' }, { id: 'ter', label: 'Ter' },
  { id: 'qua', label: 'Qua' }, { id: 'qui', label: 'Qui' },
  { id: 'sex', label: 'Sex' }, { id: 'sab', label: 'Sáb' },
  { id: 'dom', label: 'Dom' }
];

const TASK_TYPES = {
  study: { icon: BookOpen, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/30', points: 50, label: 'Estudo/Dever' },
  fun: { icon: Gamepad2, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', points: 10, label: 'Roblox' },
  routine: { icon: Check, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', points: 10, label: 'Rotina' },
  food: { icon: Utensils, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', points: 10, label: 'Refeição' },
  sleep: { icon: Moon, color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', points: 10, label: 'Dormir' },
  health: { icon: Heart, color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/30', points: 20, label: 'Saúde/PSI' },
  music: { icon: Headphones, color: 'text-pink-400', bg: 'bg-pink-500/10', border: 'border-pink-500/30', points: 10, label: 'Música' }
};

const generateDefaultTasks = () => {
  const tasks = [];
  ['seg', 'ter', 'qua', 'sex'].forEach(day => {
    tasks.push({ day, time: '14:00', title: 'Almoço', type: 'food', completed: false });
    tasks.push({ day, time: '15:00', title: 'Descansar (Roblox)', type: 'fun', completed: false });
    tasks.push({ day, time: '16:00', title: 'Dever de Casa', type: 'study', completed: false });
    tasks.push({ day, time: '17:00', title: 'Estudar', type: 'study', completed: false });
    tasks.push({ day, time: '18:00', title: 'Banho e Mochila', type: 'routine', completed: false });
    tasks.push({ day, time: '19:00', title: 'Jantar', type: 'food', completed: false });
    tasks.push({ day, time: '20:00', title: 'Hora de Dormir', type: 'sleep', completed: false });
  });
  tasks.push({ day: 'qui', time: '14:00', title: 'Almoço', type: 'food', completed: false });
  tasks.push({ day: 'qui', time: '15:00', title: 'Psicólogo (PSI)', type: 'health', completed: false });
  tasks.push({ day: 'qui', time: '16:00', title: 'Descansar', type: 'fun', completed: false });
  tasks.push({ day: 'qui', time: '17:00', title: 'Dever de Casa', type: 'study', completed: false });
  tasks.push({ day: 'qui', time: '18:00', title: 'Estudar', type: 'study', completed: false });
  tasks.push({ day: 'qui', time: '19:00', title: 'Banho, Mochila e Jantar', type: 'routine', completed: false });
  tasks.push({ day: 'qui', time: '20:00', title: 'Hora de Dormir', type: 'sleep', completed: false });
  ['sab', 'dom'].forEach(day => {
    tasks.push({ day, time: '10:00', title: 'Café da Manhã', type: 'food', completed: false });
    tasks.push({ day, time: '11:00', title: 'Sessão Roblox 🎮', type: 'fun', completed: false });
    tasks.push({ day, time: '14:00', title: 'Almoço', type: 'food', completed: false });
    tasks.push({ day, time: '16:00', title: 'Revisão Leve', type: 'study', completed: false });
    tasks.push({ day, time: '17:00', title: 'Ouvir K-Pop 🎵', type: 'music', completed: false });
    tasks.push({ day, time: '19:00', title: 'Jantar', type: 'food', completed: false });
    tasks.push({ day, time: '21:00', title: 'Dormir', type: 'sleep', completed: false });
  });
  return tasks.map(t => ({ ...t, points: TASK_TYPES[t.type].points, id: generateSafeId() }));
};

const SwipeableTask = ({ task, onToggle, onEdit, onDeleteRequest }) => {
  const [offsetX, setOffsetX] = useState(0);
  const startX = useRef(0);
  
  const TypeInfo = TASK_TYPES[task.type] || TASK_TYPES['study'];
  const IconComponent = TypeInfo.icon;

  const handleTouchStart = (e) => { startX.current = e.touches[0].clientX; };
  const handleTouchMove = (e) => {
    const diff = e.touches[0].clientX - startX.current;
    if (diff > 120) setOffsetX(120); else if (diff < -120) setOffsetX(-120); else setOffsetX(diff);
  };
  const handleTouchEnd = () => {
    if (offsetX > 80) onEdit(task); else if (offsetX < -80) onDeleteRequest(task);
    setOffsetX(0);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl mb-4 group touch-pan-y">
      <div className="absolute inset-0 flex items-center justify-between px-6 rounded-2xl bg-slate-800">
        <div className={`flex items-center gap-2 font-bold transition-opacity ${offsetX > 20 ? 'opacity-100 text-cyan-400' : 'opacity-0'}`}><Edit3 size={20} /> Editar</div>
        <div className={`flex items-center gap-2 font-bold transition-opacity ${offsetX < -20 ? 'opacity-100 text-rose-400' : 'opacity-0'}`}>Deletar <Trash2 size={20} /></div>
      </div>
      <div 
        onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
        className={`relative flex items-center gap-4 p-4 rounded-2xl border transition-all duration-300 ${task.completed ? 'bg-slate-900 border-slate-800 opacity-60' : `bg-slate-900 ${TypeInfo.border}`}`}
        style={{ transform: `translateX(${offsetX}px)`, transition: offsetX === 0 ? 'transform 0.3s ease-out' : 'none' }}
      >
        <button onClick={() => onToggle(task)} className={`flex-shrink-0 w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all ${task.completed ? 'bg-emerald-500 border-emerald-500 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.4)]' : 'border-slate-600 text-transparent'}`}>
          <Check size={20} strokeWidth={3} />
        </button>
        <div className="flex-1 select-none pointer-events-none">
          <div className={`flex items-center gap-2 font-mono font-black text-[10px] mb-1 uppercase tracking-tighter ${task.completed ? 'text-slate-600' : TypeInfo.color}`}>
            <IconComponent size={12} />
            {task.time}
          </div>
          <span className={`font-black text-xl leading-tight block ${task.completed ? 'text-slate-700 line-through' : 'text-slate-100'}`}>{task.title}</span>
        </div>
        <div className={`flex items-center gap-1 font-black text-lg ${task.completed ? 'text-slate-700' : 'text-yellow-400'}`}>
          +{task.points} <Star size={14} fill="currentColor" />
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [syncCode, setSyncCode] = useState(() => { try { return localStorage.getItem('paula_sync_code') || null; } catch { return null; } });
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState({ totalStars: 0 });
  const [selectedDay, setSelectedDay] = useState('seg');
  const [loadingData, setLoadingData] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  
  const [alarmsEnabled, setAlarmsEnabled] = useState(false);
  const [lastAlertTime, setLastAlertTime] = useState(null);
  
  const [showRobuxReward, setShowRobuxReward] = useState(false);
  const prevStars = useRef(-1); 
  const daysContainerRef = useRef(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  const [showForm, setShowForm] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [newTime, setNewTime] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState('study');
  const [taskToDelete, setTaskToDelete] = useState(null);
  const [showCopied, setShowCopied] = useState(false);

  // --- CONFIGURAÇÃO PWA APONTANDO PARA O SEU NOVO ÍCONE ---
  useEffect(() => {
    document.title = "Rotina Paula";
    const setMeta = (name, content) => {
      let meta = document.querySelector(`meta[name="${name}"]`);
      if (!meta) { meta = document.createElement('meta'); meta.name = name; document.head.appendChild(meta); }
      meta.content = content;
    };
    setMeta('apple-mobile-web-app-capable', 'yes');
    setMeta('mobile-web-app-capable', 'yes');
    setMeta('apple-mobile-web-app-status-bar-style', 'black-translucent');
    setMeta('theme-color', '#020617'); 
    setMeta('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');

    // Aponta diretamente para o ficheiro icon.png na pasta public do Vercel
    let appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
    if (!appleIcon) { appleIcon = document.createElement('link'); appleIcon.rel = 'apple-touch-icon'; document.head.appendChild(appleIcon); }
    appleIcon.href = '/icon.png';
  }, []);

  useEffect(() => {
    const todayIndex = new Date().getDay();
    const currentDayMap = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
    setSelectedDay(currentDayMap[todayIndex]);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (daysContainerRef.current) {
      const activeEl = document.getElementById(`day-btn-${selectedDay}`);
      if (activeEl) {
        daysContainerRef.current.scrollTo({
          left: activeEl.offsetLeft - daysContainerRef.current.offsetWidth / 2 + activeEl.offsetWidth / 2,
          behavior: 'smooth'
        });
      }
    }
  }, [selectedDay]);

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (e) {
        console.error("Erro auth:", e);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => { setUser(currentUser); setLoadingAuth(false); });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !syncCode) return;
    setLoadingData(true);
    setErrorMsg(null);
    
    const tasksRef = collection(db, 'artifacts', appId, 'public', 'data', `tasks_${syncCode}`);
    const statsRef = doc(db, 'artifacts', appId, 'public', 'data', `stats_${syncCode}`, 'main');

    const unsubscribeTasks = onSnapshot(query(tasksRef), async (snapshot) => {
      if (snapshot.empty) {
        const defaultTasks = generateDefaultTasks();
        for (const task of defaultTasks) {
          try { await setDoc(doc(db, 'artifacts', appId, 'public', 'data', `tasks_${syncCode}`, task.id), task); } catch(e){}
        }
      } else {
        const loadedTasks = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        loadedTasks.sort((a, b) => String(a.time).localeCompare(String(b.time)));
        setTasks(loadedTasks);
      }
      setLoadingData(false);
    }, (error) => {
        console.error(error);
        if (error.code === 'permission-denied') {
          setErrorMsg("O Firebase bloqueou o acesso. Altere as Regras do Firestore para: allow read, write: if true;");
        }
        setLoadingData(false);
    });

    const unsubscribeStats = onSnapshot(statsRef, (docSnap) => {
      if (docSnap.exists()) {
        setStats({ totalStars: Number(docSnap.data().totalStars || 0) });
      } else {
        setDoc(statsRef, { totalStars: 0 });
      }
    }, (error) => console.error(error));

    return () => { unsubscribeTasks(); unsubscribeStats(); };
  }, [user, syncCode]);

  useEffect(() => {
    if (!alarmsEnabled || tasks.length === 0) return;
    const targetTime = `${String(currentTime.getHours()).padStart(2, '0')}:${String(currentTime.getMinutes()).padStart(2, '0')}`;
    const currentDayMap = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
    const todayStr = currentDayMap[currentTime.getDay()];
    
    const currentTask = tasks.find(t => t.day === todayStr && t.time === targetTime && !t.completed);
    if (currentTask && lastAlertTime !== `${currentTask.id}-${targetTime}`) {
      playTikTokSound();
      setLastAlertTime(`${currentTask.id}-${targetTime}`);
    }
  }, [currentTime, alarmsEnabled, tasks, lastAlertTime]);

  useEffect(() => {
    const currentStars = Number(stats.totalStars || 0);
    if (prevStars.current !== -1 && prevStars.current < 500 && currentStars >= 500) {
      setShowRobuxReward(true);
      playTikTokSound(); 
    }
    prevStars.current = currentStars;
  }, [stats.totalStars]);

  const toggleAlarm = () => {
    const newState = !alarmsEnabled;
    setAlarmsEnabled(newState);
    if(newState) {
      initAudio(); playTikTokSound(); 
    }
  };

  const handleCreateNewSync = () => {
    const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    try { localStorage.setItem('paula_sync_code', newCode); } catch (e) {}
    setSyncCode(newCode);
  };

  const handleJoinSync = (e) => {
    e.preventDefault();
    if (!joinCodeInput.trim()) return;
    const code = joinCodeInput.trim().toUpperCase();
    try { localStorage.setItem('paula_sync_code', code); } catch (e) {}
    setSyncCode(code);
  };

  const toggleTask = async (task) => {
    if (!user || !syncCode) return;
    const taskRef = doc(db, 'artifacts', appId, 'public', 'data', `tasks_${syncCode}`, task.id);
    const statsRef = doc(db, 'artifacts', appId, 'public', 'data', `stats_${syncCode}`, 'main');
    const newStatus = !task.completed;
    
    const actualPoints = Number(task.points || TASK_TYPES[task.type]?.points || 10);
    const pointsChange = newStatus ? actualPoints : -actualPoints;
    const newTotal = Math.max(0, Number(stats.totalStars || 0) + pointsChange);
    
    try { 
      await updateDoc(taskRef, { completed: newStatus }); 
      await setDoc(statsRef, { totalStars: newTotal }, { merge: true }); 
    } catch (e) { console.error(e) }
  };

  const saveTask = async (e) => {
    e.preventDefault();
    if (!user || !syncCode || !newTime || !newTitle) return;
    const taskPoints = Number(TASK_TYPES[newType]?.points || 10);
    const taskData = { day: selectedDay, time: newTime, title: newTitle, type: newType, points: taskPoints, completed: false };
    const collectionName = `tasks_${syncCode}`;
    if (editingTaskId) await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', collectionName, editingTaskId), taskData);
    else { const newId = generateSafeId(); await setDoc(doc(db, 'artifacts', appId, 'public', 'data', collectionName, newId), { ...taskData, id: newId }); }
    closeForm();
  };

  const confirmDelete = async () => {
    if (!user || !syncCode || !taskToDelete) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', `tasks_${syncCode}`, taskToDelete.id));
    setTaskToDelete(null);
  };

  const closeForm = () => { 
    setShowForm(false); 
    setEditingTaskId(null); 
    setNewTime(''); 
    setNewTitle(''); 
    setNewType('study'); 
  };
  
  const copyCode = () => { navigator.clipboard.writeText(syncCode); setShowCopied(true); setTimeout(() => setShowCopied(false), 2000); };
  const handleLogout = () => { try { localStorage.removeItem('paula_sync_code'); } catch (e) {} setSyncCode(null); setTasks([]); };

  if (loadingAuth) return <div className="h-screen w-full bg-slate-950 flex items-center justify-center text-pink-400"><Zap className="animate-pulse w-12 h-12" /></div>;

  if (errorMsg) {
    return (
      <div className="h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-center text-white">
        <AlertTriangle size={64} className="text-rose-500 mb-6 animate-pulse" />
        <h2 className="text-2xl font-black mb-4 uppercase tracking-tighter">Acesso Bloqueado</h2>
        <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 text-left text-sm space-y-4 max-w-md">
          <p className="text-slate-300 font-medium">{errorMsg}</p>
        </div>
        <button onClick={() => window.location.reload()} className="mt-8 bg-cyan-600 px-10 py-4 rounded-full font-black uppercase tracking-widest hover:bg-cyan-500 transition-colors">Recarregar</button>
      </div>
    );
  }

  if (!syncCode) {
    return (
      <div className="h-screen w-full overflow-y-auto bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-200 font-sans">
        <div className="w-24 h-24 mb-6 rounded-3xl bg-gradient-to-tr from-pink-500 to-cyan-500 flex items-center justify-center shadow-[0_0_40px_rgba(236,72,153,0.5)] animate-pulse">
           <Star size={48} fill="white" className="text-white" />
        </div>
        <h1 className="text-5xl font-black mb-2 bg-gradient-to-r from-pink-400 via-purple-400 to-cyan-400 text-transparent bg-clip-text text-center italic">PAULA 💖</h1>
        <p className="text-slate-500 text-center max-w-sm mb-12 font-black uppercase tracking-widest text-xs">Agenda Inteligente Nativa</p>

        {!isJoining ? (
          <div className="w-full max-w-sm space-y-4">
            <button onClick={handleCreateNewSync} className="w-full bg-gradient-to-r from-pink-600 to-purple-600 text-white font-black text-xl py-5 rounded-3xl shadow-[0_0_15px_rgba(236,72,153,0.4)] active:scale-95 transition-transform flex items-center justify-center gap-2 border-b-4 border-pink-800"><Plus size={24} strokeWidth={3}/> CRIAR AGENDA</button>
            <button onClick={() => setIsJoining(true)} className="w-full bg-slate-900 border-2 border-slate-800 text-slate-300 font-black text-xl py-5 rounded-3xl active:scale-95 transition-transform flex items-center justify-center gap-2"><Smartphone size={24} /> LIGAR CÓDIGO</button>
          </div>
        ) : (
          <form onSubmit={handleJoinSync} className="w-full max-w-sm space-y-4 animate-in fade-in">
            <div className="bg-slate-900 border-2 border-cyan-500/50 rounded-[32px] p-8 shadow-2xl">
              <label className="block text-xs font-black text-cyan-400 mb-4 uppercase tracking-widest text-center">Código da Paula</label>
              <input type="text" value={joinCodeInput} onChange={e => setJoinCodeInput(e.target.value)} placeholder="A7X9K" className="w-full bg-slate-950 border-2 border-slate-800 rounded-2xl p-4 text-center text-4xl font-black text-white uppercase focus:outline-none focus:border-pink-500 font-mono" maxLength={8} required />
            </div>
            <button type="submit" className="w-full bg-cyan-600 text-slate-950 font-black text-xl py-5 rounded-3xl shadow-[0_0_15px_rgba(34,211,238,0.4)] active:scale-95 transition-transform uppercase tracking-widest">Entrar</button>
            <button type="button" onClick={() => setIsJoining(false)} className="w-full text-slate-500 font-bold py-4 uppercase tracking-widest text-[10px]">Voltar</button>
          </form>
        )}
      </div>
    );
  }

  const currentTasks = tasks.filter(t => t.day === selectedDay);
  const completedToday = currentTasks.filter(t => t.completed).length;
  const totalToday = currentTasks.length;
  const progress = totalToday === 0 ? 0 : (completedToday / totalToday) * 100;

  return (
    <div className="h-screen w-full flex flex-col bg-slate-950 text-slate-200 font-sans overflow-hidden">
      
      {/* HEADER FIXO V4.0 + RELÓGIO */}
      <header className="flex-shrink-0 bg-slate-900/90 backdrop-blur-xl border-b border-slate-800 z-20 pt-safe flex flex-col shadow-2xl">
        <div className="px-4 py-5 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2 text-slate-600 font-mono text-[10px] font-black uppercase tracking-tighter">
              <Key size={12} /> {syncCode}
              <button onClick={copyCode} className="hover:text-cyan-400 p-1 bg-slate-800 rounded transition-colors">{showCopied ? <Check size={12}/> : <Copy size={12}/>}</button>
            </div>
            
            {/* RELÓGIO CENTRALIZADO E LUMINOSO */}
            <div className="flex items-center gap-2 bg-slate-950 px-6 py-2 rounded-full border-2 border-cyan-500/40 text-cyan-400 font-black text-2xl shadow-[0_0_20px_rgba(6,182,212,0.3)] font-mono tracking-tighter">
              <Clock size={20} />
              {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>

            <div className="flex items-center gap-1 bg-slate-800 px-4 py-2 rounded-2xl text-yellow-400 font-black border border-yellow-500/20 shadow-inner">
              <Star size={18} fill="currentColor"/> {Number(stats.totalStars || 0)}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 overflow-x-auto no-scrollbar px-4 pb-4">
          <div className="flex gap-2" ref={daysContainerRef}>
            {DAYS.map(day => (
              <button 
                key={day.id} 
                id={`day-btn-${day.id}`} 
                onClick={() => setSelectedDay(day.id)} 
                className={`flex-shrink-0 px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all duration-300 
                  ${selectedDay === day.id 
                    ? 'bg-pink-500 text-white shadow-[0_0_20px_rgba(236,72,153,0.4)] scale-105' 
                    : 'bg-slate-800 text-slate-500'}`}
              >
                {day.label}
              </button>
            ))}
          </div>
          <button onClick={() => { if(window.confirm("Pretende sair desta agenda?")) handleLogout(); }} className="p-4 bg-slate-800/50 rounded-2xl text-rose-500 active:bg-rose-500 active:text-white transition-all"><LogOut size={18} /></button>
        </div>
        <div className="h-1 w-full bg-slate-800">
          <div className="h-full bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </header>

      {/* ÁREA DE SCROLL */}
      <main className="flex-1 overflow-y-auto p-4 pb-32 no-scrollbar bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-slate-900/50 via-slate-950 to-slate-950">
        
        {loadingData ? (
           <div className="h-full flex items-center justify-center text-cyan-400"><Zap className="animate-pulse w-12 h-12" /></div>
        ) : currentTasks.length === 0 ? (
          <div className="text-center py-24 opacity-20 animate-in fade-in">
            <CalendarDays className="mx-auto mb-4" size={64} />
            <p className="font-black uppercase tracking-widest text-xs italic">Sem Missões Hoje</p>
          </div>
        ) : (
          currentTasks.map(task => (
            <SwipeableTask key={task.id} task={task} onToggle={toggleTask} onEdit={handleEditRequest} onDeleteRequest={setTaskToDelete} />
          ))
        )}

        {!showForm && (
          <button onClick={() => setShowForm(true)} className="w-full mt-2 py-6 border-2 border-dashed border-slate-800 rounded-[35px] text-slate-600 font-black flex items-center justify-center gap-3 hover:border-cyan-500 hover:text-cyan-400 transition-all uppercase tracking-[0.2em] text-[12px]"><Plus size={24} /> Criar Missão</button>
        )}
      </main>

      <div className="fixed bottom-10 right-8 z-30">
        <button onClick={toggleAlarm} className={`w-20 h-20 rounded-full flex items-center justify-center shadow-[0_15px_30px_rgba(0,0,0,0.5)] transition-all active:scale-90 ${alarmsEnabled ? 'bg-cyan-500 text-slate-950 scale-110 shadow-cyan-500/50' : 'bg-slate-800 text-slate-400'}`}>
          {alarmsEnabled ? <Bell size={36} className="animate-bounce" /> : <BellOff size={36} />}
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-md z-50 flex items-end">
          <form onSubmit={saveTask} className="w-full bg-slate-900 rounded-t-[50px] p-12 space-y-8 border-t border-slate-800 animate-in slide-in-from-bottom-full duration-500">
            <div className="flex justify-between items-center">
              <h3 className="font-black text-3xl text-cyan-400 uppercase italic tracking-tighter">{editingTaskId ? 'Editar Missão' : 'Nova Missão'}</h3>
              <button type="button" onClick={closeForm} className="bg-slate-800 p-3 rounded-full text-slate-400"><X size={24}/></button>
            </div>
            <div className="space-y-5">
              <input type="time" value={newTime} onChange={e => setNewTime(e.target.value)} className="w-full bg-slate-950 p-6 rounded-3xl border-2 border-slate-800 text-white font-black text-4xl focus:border-cyan-500 focus:outline-none font-mono" required />
              <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="O que vamos fazer?" className="w-full bg-slate-950 p-6 rounded-3xl border-2 border-slate-800 text-white font-black text-2xl focus:border-pink-500 focus:outline-none tracking-tight" required />
            </div>
            <div className="grid grid-cols-4 gap-4">
              {Object.entries(TASK_TYPES).map(([k,v]) => {
                const IconComp = v.icon;
                return (
                  <button type="button" key={k} onClick={() => setNewType(k)} className={`p-4 rounded-[25px] border-2 transition-all flex flex-col items-center gap-2 ${newType === k ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400 scale-105 shadow-lg shadow-cyan-500/10' : 'bg-slate-950 border-slate-800 text-slate-600'}`}>
                    <IconComp size={28}/>
                    <span className="text-[10px] uppercase font-black tracking-tighter">{v.label}</span>
                  </button>
                );
              })}
            </div>
            <button type="submit" className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 py-6 rounded-3xl font-black text-white text-2xl shadow-xl active:scale-95 transition-transform uppercase tracking-widest border-b-4 border-blue-800">
              {editingTaskId ? 'SALVAR ALTERAÇÕES' : 'GUARDAR MISSÃO'}
            </button>
          </form>
        </div>
      )}

      {showRobuxReward && (
        <div className="fixed inset-0 z-[100] bg-slate-950/98 flex items-center justify-center p-6 text-center animate-in zoom-in duration-700">
          <div className="bg-slate-900 border-4 border-yellow-400 p-12 rounded-[60px] shadow-[0_0_100px_rgba(250,204,21,0.5)] animate-bounce relative">
             <Star size={120} fill="#facc15" className="mx-auto mb-8 text-yellow-400 drop-shadow-[0_0_30px_rgba(250,204,21,1)]" />
             <h2 className="text-6xl font-black text-yellow-400 mb-4 italic tracking-tighter uppercase">Incrível!</h2>
             <p className="text-white font-black text-2xl mb-10 uppercase tracking-[0.2em]">Conquistaste 500 Estrelas!</p>
             <div className="bg-gradient-to-br from-emerald-500 to-green-800 p-10 rounded-[45px] shadow-2xl border-t-4 border-emerald-300">
                <span className="block text-white font-black text-6xl mb-3 drop-shadow-xl font-mono">R$ 29,90</span>
                <span className="text-emerald-100 font-black text-xl uppercase tracking-widest">Robux Liberados! 🎁</span>
             </div>
             <button onClick={() => setShowRobuxReward(false)} className="mt-10 bg-slate-800 px-10 py-3 rounded-full text-slate-400 font-black uppercase text-xs hover:text-white transition-colors tracking-widest">Fechar</button>
          </div>
        </div>
      )}

      {taskToDelete && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-slate-900 border-2 border-rose-500 shadow-[0_0_30px_rgba(244,63,94,0.3)] rounded-3xl p-8 max-w-sm w-full text-center space-y-6">
            <div className="w-20 h-20 bg-rose-500/20 rounded-full flex items-center justify-center mx-auto text-rose-500"><AlertTriangle size={40} /></div>
            <div>
              <h3 className="text-2xl font-black text-slate-200 mb-2 uppercase">Apagar Missão?</h3>
              <p className="text-slate-400 font-bold">Tem certeza que quer remover <br/>"<span className="text-rose-400">{taskToDelete.title}</span>"?</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setTaskToDelete(null)} className="flex-1 py-4 rounded-2xl font-black text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors uppercase text-sm tracking-widest">Cancelar</button>
              <button onClick={confirmDelete} className="flex-1 py-4 rounded-2xl font-black text-white bg-rose-500 hover:bg-rose-600 shadow-[0_0_15px_rgba(244,63,94,0.4)] transition-colors uppercase text-sm tracking-widest">Apagar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


