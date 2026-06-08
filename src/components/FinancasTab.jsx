import React, { useState, useMemo, useEffect } from 'react';
import {
  Wallet, CreditCard, Plus, X, ChevronLeft, ChevronRight, TrendingUp, TrendingDown,
  CalendarPlus, Check, Clock, Pencil, Trash2, Layers, RefreshCw, Settings2, CalendarDays
} from 'lucide-react';
import { SwipeableItem, SwipeHint } from './SwipeableItem';
import { formatCurrencyInput, parseCurrencyToNumber } from '../utils/currency';
import {
  fmtBRL, currentMonthRef, addMonths, formatMonthLabel, formatMonthShort,
  primeiraFaturaMes, dividirParcelas,
} from '../utils/finance';
import { downloadTaskICS } from '../utils/ics';

const CARD_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6'];

const CATEGORIAS_RECEITA = ['Salário', 'Aposentadoria', 'Aluguel', 'FGTS', 'Investimentos', 'Outros'];
const CATEGORIAS_DESPESA = ['Cartão', 'Moradia', 'Contas', 'Mercado', 'Transporte', 'Saúde', 'Lazer', 'Outros'];

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const HORIZONTE_INFINITO = 24; // meses materializados ao criar recorrência infinita
const BUFFER_INFINITO = 12;    // mantém sempre N meses à frente do mês visível

export const FinancasTab = ({ cards = [], entries = [], categories = {}, setCards, setEntries, setCategories }) => {
  const [mesRef, setMesRef] = useState(currentMonthRef());
  const [selectedDay, setSelectedDay] = useState(null);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [showCardModal, setShowCardModal] = useState(false);
  const [editingCard, setEditingCard] = useState(null);
  const [editId, setEditId] = useState(null); // lançamento em edição
  const [confirmDel, setConfirmDel] = useState(null);
  const [recurringPrompt, setRecurringPrompt] = useState(null); // {action,'pago'|'edit', entryId, grupoId, ...}
  const [showNovaCat, setShowNovaCat] = useState(false);
  const [novaCatInput, setNovaCatInput] = useState('');

  const blankEntry = {
    tipo: 'despesa', descricao: '', valorInput: '', categoria: '',
    diaVenc: '', cardId: '', parcelas: '1', repeticao: 'unica', qtdeMeses: '', lembrete: false,
  };
  const [form, setForm] = useState(blankEntry);

  const blankCard = { nome: '', diaFechamento: '', diaVencimento: '', cor: CARD_COLORS[0], limite: '' };
  const [cardForm, setCardForm] = useState(blankCard);

  const safeEntries = Array.isArray(entries) ? entries.filter(e => e && e.id) : [];
  const safeCards = Array.isArray(cards) ? cards.filter(c => c && c.id) : [];

  // Reseta filtro de dia ao trocar de mês
  useEffect(() => { setSelectedDay(null); }, [mesRef]);

  // Materialização contínua de recorrências infinitas: mantém ~12 meses à frente
  useEffect(() => {
    setEntries(prev => {
      const arr = Array.isArray(prev) ? prev : [];
      const groups = {};
      arr.forEach(e => { if (e?.recorrenteInfinito && e.grupoId) (groups[e.grupoId] ||= []).push(e); });
      const target = addMonths(mesRef, BUFFER_INFINITO);
      const additions = [];
      Object.entries(groups).forEach(([gid, list]) => {
        const sorted = [...list].sort((a, b) => a.mesRef.localeCompare(b.mesRef));
        const tmpl = sorted[sorted.length - 1];
        const existing = new Set(list.map(e => e.mesRef));
        let cur = tmpl.mesRef;
        while (cur < target) {
          cur = addMonths(cur, 1);
          if (!existing.has(cur)) {
            additions.push({ ...tmpl, id: `${gid}_${cur}`, mesRef: cur, status: 'pendente' });
            existing.add(cur);
          }
        }
      });
      return additions.length ? [...arr, ...additions] : prev;
    });
  }, [mesRef]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Dados do mês ──
  const mesEntries = useMemo(() => safeEntries.filter(e => e.mesRef === mesRef), [safeEntries, mesRef]);
  const visivel = (e) => !selectedDay || e.diaVenc === selectedDay;

  const byDia = (a, b) => ((a.diaVenc || 99) - (b.diaVenc || 99));
  const receitas = mesEntries.filter(e => e.tipo === 'receita').sort(byDia);
  const despesas = mesEntries.filter(e => e.tipo === 'despesa').sort(byDia);
  const receitasVis = receitas.filter(visivel);
  const despesasVis = despesas.filter(visivel);

  const totalReceitas = receitas.reduce((s, e) => s + (e.valor || 0), 0);
  const totalDespesas = despesas.reduce((s, e) => s + (e.valor || 0), 0);
  const saldo = totalReceitas - totalDespesas;

  const faturasPorCartao = useMemo(() => {
    return safeCards.map(card => {
      const itens = despesas.filter(e => e.cardId === card.id);
      const total = itens.reduce((s, e) => s + (e.valor || 0), 0);
      const pago = itens.filter(e => e.status === 'pago').reduce((s, e) => s + (e.valor || 0), 0);
      return { card, itens, total, pago, pendente: total - pago };
    }).filter(f => f.itens.length > 0);
  }, [safeCards, despesas]);

  // ── Calendário do mês ──
  const calData = useMemo(() => {
    const [y, m] = mesRef.split('-').map(Number);
    const firstWeekday = new Date(y, m - 1, 1).getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    const countByDay = {};
    mesEntries.forEach(e => { if (e.diaVenc) countByDay[e.diaVenc] = (countByDay[e.diaVenc] || 0) + 1; });
    return { firstWeekday, daysInMonth, countByDay };
  }, [mesRef, mesEntries]);

  // ── Categorias (defaults + custom, alfabético) ──
  const catList = (tipo) => {
    const base = tipo === 'receita' ? CATEGORIAS_RECEITA : CATEGORIAS_DESPESA;
    const custom = (categories && Array.isArray(categories[tipo])) ? categories[tipo] : [];
    return Array.from(new Set([...base, ...custom])).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  };

  const addCategoria = () => {
    const label = novaCatInput.trim();
    if (!label) return;
    setCategories(prev => {
      const safe = (prev && typeof prev === 'object' && !Array.isArray(prev)) ? prev : {};
      const list = Array.isArray(safe[form.tipo]) ? safe[form.tipo] : [];
      if (list.some(c => c.toLowerCase() === label.toLowerCase())) return safe;
      return { ...safe, [form.tipo]: [...list, label] };
    });
    setForm(f => ({ ...f, categoria: label }));
    setNovaCatInput('');
    setShowNovaCat(false);
  };

  // ── Handlers ──
  const goMonth = (delta) => setMesRef(prev => addMonths(prev, delta));

  const togglePago = (entry) => {
    const novoStatus = entry.status === 'pago' ? 'pendente' : 'pago';
    if (entry.grupoId && entry.recorrente) {
      setRecurringPrompt({ action: 'pago', entryId: entry.id, grupoId: entry.grupoId, novoStatus, title: entry.descricao });
      return;
    }
    setEntries(prev => (Array.isArray(prev) ? prev : []).map(e => e.id === entry.id ? { ...e, status: novoStatus } : e));
  };

  const applyPago = (scope) => {
    const { entryId, grupoId, novoStatus } = recurringPrompt;
    setEntries(prev => (Array.isArray(prev) ? prev : []).map(e => {
      if (scope === 'all' ? e.grupoId === grupoId : e.id === entryId) return { ...e, status: novoStatus };
      return e;
    }));
    setRecurringPrompt(null);
  };

  const openCreate = (day) => {
    setEditId(null);
    setForm({ ...blankEntry, diaVenc: day ? String(day) : '' });
    setShowNovaCat(false);
    setShowEntryModal(true);
  };

  const openEdit = (entry) => {
    setEditId(entry.id);
    setForm({
      tipo: entry.tipo,
      descricao: entry.descricao || '',
      valorInput: formatCurrencyInput(String(Math.round((entry.valor || 0) * 100))),
      categoria: entry.categoria || '',
      diaVenc: entry.diaVenc ? String(entry.diaVenc) : '',
      cardId: entry.cardId || '',
      parcelas: entry.parcela ? String(entry.parcela.total) : '1',
      repeticao: entry.recorrente ? 'mensal' : 'unica',
      qtdeMeses: '',
      lembrete: !!entry.lembrete,
    });
    setShowNovaCat(false);
    setShowEntryModal(true);
  };

  const handleSaveEntry = () => {
    const valor = parseCurrencyToNumber(form.valorInput);
    if (!form.descricao.trim() || valor <= 0) return;
    const tipo = form.tipo;
    const diaVenc = form.diaVenc ? Math.min(31, Math.max(1, parseInt(form.diaVenc, 10) || 1)) : null;
    const categoria = form.categoria || (tipo === 'receita' ? 'Outros' : (form.cardId ? 'Cartão' : 'Outros'));

    // ── EDIÇÃO ──
    if (editId) {
      const entry = safeEntries.find(e => e.id === editId);
      if (!entry) { setShowEntryModal(false); return; }
      const changes = { descricao: form.descricao.trim(), valor, categoria, diaVenc, cardId: form.cardId || null, lembrete: form.lembrete };
      if (entry.grupoId && entry.recorrente) {
        setRecurringPrompt({ action: 'edit', entryId: editId, grupoId: entry.grupoId, changes, title: entry.descricao });
        return; // o modal de edição permanece até escolher escopo
      }
      setEntries(prev => (Array.isArray(prev) ? prev : []).map(e => e.id === editId ? { ...e, ...changes } : e));
      closeEntryModal();
      return;
    }

    // ── CRIAÇÃO ──
    const grupoId = `g_${Date.now()}`;
    const baseId = Date.now();
    const novos = [];
    const isCartao = tipo === 'despesa' && form.cardId;
    const nParcelas = isCartao ? Math.max(1, parseInt(form.parcelas, 10) || 1) : 1;

    if (isCartao) {
      const card = safeCards.find(c => c.id === form.cardId);
      const valores = dividirParcelas(valor, nParcelas);
      const diaBase = diaVenc || (card ? parseInt(card.diaVencimento, 10) : 1) || 1;
      const dataCompra = `${mesRef}-${String(diaBase).padStart(2, '0')}`;
      const primeiroMes = card
        ? primeiraFaturaMes(dataCompra, parseInt(card.diaFechamento, 10) || 1, parseInt(card.diaVencimento, 10) || diaBase)
        : mesRef;
      const diaVencFatura = card ? (parseInt(card.diaVencimento, 10) || diaBase) : diaBase;
      for (let i = 0; i < nParcelas; i++) {
        novos.push({
          id: `${baseId}_${i}`, tipo: 'despesa', descricao: form.descricao.trim(), valor: valores[i],
          categoria, mesRef: addMonths(primeiroMes, i), diaVenc: diaVencFatura, status: 'pendente',
          recorrente: false, recorrenteInfinito: false, lembrete: form.lembrete, cardId: form.cardId,
          parcela: nParcelas > 1 ? { atual: i + 1, total: nParcelas } : null,
          grupoId: nParcelas > 1 ? grupoId : null,
        });
      }
    } else {
      const recorrente = form.repeticao === 'mensal';
      const qtde = parseInt(form.qtdeMeses, 10);
      const infinito = recorrente && (!form.qtdeMeses || isNaN(qtde) || qtde < 1);
      const nMeses = !recorrente ? 1 : (infinito ? HORIZONTE_INFINITO : qtde);
      for (let i = 0; i < nMeses; i++) {
        const mRef = addMonths(mesRef, i);
        novos.push({
          id: recorrente ? `${grupoId}_${mRef}` : `${baseId}`, tipo, descricao: form.descricao.trim(), valor,
          categoria, mesRef: mRef, diaVenc, status: 'pendente', recorrente, recorrenteInfinito: infinito,
          lembrete: form.lembrete, cardId: null, parcela: null, grupoId: recorrente ? grupoId : null,
        });
      }
    }

    setEntries(prev => [...(Array.isArray(prev) ? prev : []), ...novos]);
    closeEntryModal();
  };

  const applyEdit = (scope) => {
    const { entryId, grupoId, changes } = recurringPrompt;
    setEntries(prev => (Array.isArray(prev) ? prev : []).map(e => {
      if (scope === 'all' ? e.grupoId === grupoId : e.id === entryId) return { ...e, ...changes };
      return e;
    }));
    setRecurringPrompt(null);
    closeEntryModal();
  };

  const closeEntryModal = () => {
    setShowEntryModal(false);
    setEditId(null);
    setForm(blankEntry);
    setShowNovaCat(false);
    setNovaCatInput('');
  };

  const handleSaveCard = () => {
    if (!cardForm.nome.trim()) return;
    const payload = {
      nome: cardForm.nome.trim(),
      diaFechamento: Math.min(31, Math.max(1, parseInt(cardForm.diaFechamento, 10) || 1)),
      diaVencimento: Math.min(31, Math.max(1, parseInt(cardForm.diaVencimento, 10) || 10)),
      cor: cardForm.cor,
      limite: parseCurrencyToNumber(cardForm.limite),
    };
    if (editingCard) {
      setCards(prev => (Array.isArray(prev) ? prev : []).map(c => c.id === editingCard ? { ...c, ...payload } : c));
    } else {
      setCards(prev => [...(Array.isArray(prev) ? prev : []), { id: `card_${Date.now()}`, ...payload }]);
    }
    setCardForm(blankCard);
    setEditingCard(null);
    setShowCardModal(false);
  };

  const openEditCard = (card) => {
    setEditingCard(card.id);
    setCardForm({
      nome: card.nome || '',
      diaFechamento: String(card.diaFechamento || ''),
      diaVencimento: String(card.diaVencimento || ''),
      cor: card.cor || CARD_COLORS[0],
      limite: card.limite ? formatCurrencyInput(String(Math.round(card.limite * 100))) : '',
    });
    setShowCardModal(true);
  };

  const doDelete = () => {
    if (!confirmDel) return;
    if (confirmDel.tipo === 'card') {
      setCards(prev => (Array.isArray(prev) ? prev : []).filter(c => c.id !== confirmDel.id));
      setEntries(prev => (Array.isArray(prev) ? prev : []).map(e => e.cardId === confirmDel.id ? { ...e, cardId: null } : e));
    } else if (confirmDel.tipo === 'group') {
      setEntries(prev => (Array.isArray(prev) ? prev : []).filter(e => e.grupoId !== confirmDel.grupoId));
    } else {
      setEntries(prev => (Array.isArray(prev) ? prev : []).filter(e => e.id !== confirmDel.id));
    }
    setConfirmDel(null);
  };

  const addToCalendar = (entry) => {
    const [y, m] = entry.mesRef.split('-');
    const dd = String(entry.diaVenc || 1).padStart(2, '0');
    downloadTaskICS({
      id: entry.id,
      title: `${entry.tipo === 'receita' ? '💰' : '💳'} ${entry.descricao}${entry.parcela ? ` (${entry.parcela.atual}/${entry.parcela.total})` : ''} — ${fmtBRL(entry.valor)}`,
      dueDate: `${y}-${m}-${dd}`,
      dueTime: '09:00',
      hasReminder: true,
      recurrence: null,
      description: `Vencimento: ${fmtBRL(entry.valor)} (${entry.categoria})`,
    });
  };

  const requestDeleteEntry = (entry) => {
    if (entry.grupoId) {
      const grp = safeEntries.filter(e => e.grupoId === entry.grupoId);
      setConfirmDel({ tipo: 'group', grupoId: entry.grupoId, title: entry.descricao, count: grp.length, recorrente: entry.recorrente });
    } else {
      setConfirmDel({ tipo: 'entry', id: entry.id, title: entry.descricao });
    }
  };

  // ── Linha de lançamento ──
  const EntryRow = ({ entry }) => {
    const isReceita = entry.tipo === 'receita';
    const card = entry.cardId ? safeCards.find(c => c.id === entry.cardId) : null;
    const pago = entry.status === 'pago';
    return (
      <SwipeableItem
        onEdit={() => openEdit(entry)}
        onDeleteRequest={() => requestDeleteEntry(entry)}
        wrapperClass="mb-0"
        frontClass={`p-3 flex items-center gap-3 border-slate-200 dark:border-slate-700 ${pago ? 'bg-white dark:bg-slate-900 opacity-60' : 'bg-slate-100 dark:bg-slate-800'}`}
      >
        <button
          onClick={() => togglePago(entry)}
          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all active:scale-90 ${pago ? 'bg-emerald-500 text-white' : 'border-2 border-slate-300 dark:border-slate-600 text-transparent'}`}
        >
          <Check className="w-4 h-4" strokeWidth={3} />
        </button>
        <div className="flex-1 min-w-0">
          <div className={`font-semibold text-sm text-slate-900 dark:text-white truncate ${pago ? 'line-through' : ''}`}>
            {entry.descricao}
            {entry.parcela && <span className="ml-1 text-[10px] text-slate-500">({entry.parcela.atual}/{entry.parcela.total})</span>}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{entry.categoria}</span>
            {card && (
              <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded flex items-center gap-1" style={{ backgroundColor: `${card.cor}22`, color: card.cor }}>
                <CreditCard className="w-2.5 h-2.5" />{card.nome}
              </span>
            )}
            {entry.diaVenc && <span className="text-[10px] text-slate-500 flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />dia {entry.diaVenc}</span>}
            {entry.recorrente && <RefreshCw className="w-2.5 h-2.5 text-slate-400" />}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className={`font-bold text-sm ${isReceita ? 'text-emerald-500' : 'text-rose-500'}`}>
            {isReceita ? '+' : '−'}{fmtBRL(entry.valor)}
          </div>
          <button onClick={() => addToCalendar(entry)} className="text-slate-400 hover:text-indigo-500 active:scale-90 transition-all">
            <CalendarPlus className="w-4 h-4" />
          </button>
        </div>
      </SwipeableItem>
    );
  };

  const inputCls = "w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-slate-900 dark:text-white outline-none";

  return (
    <div className="space-y-5 pb-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Wallet className="w-6 h-6 text-indigo-500" /> Finanças
        </h2>
        <button
          onClick={() => { setEditingCard(null); setCardForm(blankCard); setShowCardModal(true); }}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 active:scale-95 transition-all"
        >
          <Settings2 className="w-4 h-4" /> Cartões
        </button>
      </div>

      {/* Navegador de mês */}
      <div className="flex items-center justify-between bg-slate-100 dark:bg-slate-800 rounded-2xl p-2">
        <button onClick={() => goMonth(-1)} className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 active:scale-90 transition-all hover:bg-slate-200 dark:hover:bg-slate-700">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <div className="text-base font-bold text-slate-900 dark:text-white">{cap(formatMonthLabel(mesRef))}</div>
          <div className="text-[10px] uppercase tracking-widest text-slate-500">{formatMonthShort(mesRef)}</div>
        </div>
        <button onClick={() => goMonth(1)} className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 active:scale-90 transition-all hover:bg-slate-200 dark:hover:bg-slate-700">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Calendário do mês */}
      <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl p-3">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((w, i) => (
            <div key={i} className="text-center text-[10px] font-bold uppercase text-slate-400">{w}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: calData.firstWeekday }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: calData.daysInMonth }).map((_, i) => {
            const d = i + 1;
            const count = calData.countByDay[d] || 0;
            const isSel = selectedDay === d;
            return (
              <button
                key={d}
                onClick={() => setSelectedDay(isSel ? null : d)}
                className={`relative aspect-square rounded-lg flex flex-col items-center justify-center text-xs transition-all active:scale-90 ${
                  isSel ? 'bg-indigo-600 text-white font-bold'
                  : count ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold'
                  : 'text-slate-400 dark:text-slate-500 hover:bg-white/50 dark:hover:bg-slate-900/50'
                }`}
              >
                <span>{d}</span>
                {count > 0 && (
                  <span className={`mt-0.5 text-[8px] font-bold leading-none px-1 py-0.5 rounded-full ${isSel ? 'bg-white/25 text-white' : 'bg-rose-500/20 text-rose-500'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {selectedDay && (
          <div className="mt-2 space-y-1.5">
            <div className="text-center text-[11px] text-slate-500">
              {(calData.countByDay[selectedDay] || 0) > 0
                ? `${calData.countByDay[selectedDay]} vencimento(s) no dia ${selectedDay}`
                : `Nenhum vencimento no dia ${selectedDay}`}
            </div>
            <div className="flex gap-2">
              <button onClick={() => openCreate(selectedDay)} className="flex-1 flex items-center justify-center gap-1 text-xs font-semibold text-white py-2 rounded-lg bg-indigo-600 active:scale-95 transition-all">
                <Plus className="w-3.5 h-3.5" /> Lançar no dia {selectedDay}
              </button>
              <button onClick={() => setSelectedDay(null)} className="px-3 text-xs font-semibold text-slate-500 py-2 rounded-lg bg-slate-200 dark:bg-slate-700">
                Limpar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl p-3 bg-emerald-500/10 border border-emerald-500/30">
          <div className="flex items-center gap-1 text-emerald-500 text-[10px] font-bold uppercase tracking-wide"><TrendingUp className="w-3 h-3" />Receitas</div>
          <div className="text-emerald-500 font-bold text-sm mt-1 leading-tight">{fmtBRL(totalReceitas)}</div>
        </div>
        <div className="rounded-2xl p-3 bg-rose-500/10 border border-rose-500/30">
          <div className="flex items-center gap-1 text-rose-500 text-[10px] font-bold uppercase tracking-wide"><TrendingDown className="w-3 h-3" />Despesas</div>
          <div className="text-rose-500 font-bold text-sm mt-1 leading-tight">{fmtBRL(totalDespesas)}</div>
        </div>
        <div className={`rounded-2xl p-3 border ${saldo >= 0 ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
          <div className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide ${saldo >= 0 ? 'text-indigo-500' : 'text-amber-500'}`}><Wallet className="w-3 h-3" />Saldo</div>
          <div className={`font-bold text-sm mt-1 leading-tight ${saldo >= 0 ? 'text-indigo-500' : 'text-amber-500'}`}>{fmtBRL(saldo)}</div>
        </div>
      </div>

      {/* Faturas */}
      {faturasPorCartao.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5" />Faturas</h3>
          {faturasPorCartao.map(({ card, total, pago, pendente, itens }) => (
            <div key={card.id} className="rounded-2xl p-4 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" style={{ borderLeftWidth: 4, borderLeftColor: card.cor }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: card.cor }} />{card.nome}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Fecha dia {card.diaFechamento} · Vence dia {card.diaVencimento} · {itens.length} lançamento{itens.length !== 1 ? 's' : ''}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-rose-500 text-lg leading-tight">{fmtBRL(total)}</div>
                  {pago > 0 && <div className="text-[10px] text-emerald-500">{fmtBRL(pago)} pago</div>}
                </div>
              </div>
              {pendente > 0 && (
                <button
                  onClick={() => addToCalendar({ id: `fatura_${card.id}_${mesRef}`, tipo: 'despesa', descricao: `Fatura ${card.nome}`, valor: total, categoria: 'Cartão', mesRef, diaVenc: card.diaVencimento, parcela: null })}
                  className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 active:scale-95 transition-all"
                >
                  <CalendarPlus className="w-4 h-4" /> Lembrete no calendário
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {mesEntries.length > 0 && <SwipeHint />}

      {receitasVis.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-500 flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" />Receitas</h3>
          {receitasVis.map(e => <EntryRow key={e.id} entry={e} />)}
        </div>
      )}

      {despesasVis.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-rose-500 flex items-center gap-1.5"><TrendingDown className="w-3.5 h-3.5" />Despesas</h3>
          {despesasVis.map(e => <EntryRow key={e.id} entry={e} />)}
        </div>
      )}

      {(selectedDay ? (receitasVis.length + despesasVis.length === 0) : (mesEntries.length === 0)) && (
        <div className="text-center py-12 text-slate-400 dark:text-slate-600">
          {selectedDay ? <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-40" /> : <Layers className="w-12 h-12 mx-auto mb-3 opacity-40" />}
          <p className="text-sm">{selectedDay ? `Nenhum vencimento no dia ${selectedDay}.` : `Nenhum lançamento em ${cap(formatMonthLabel(mesRef))}.`}</p>
          {!selectedDay && <p className="text-xs mt-1">Toque em + para adicionar.</p>}
        </div>
      )}

      {/* FAB */}
      <button
        onClick={openCreate}
        className="fixed bottom-24 right-5 z-30 w-14 h-14 rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 flex items-center justify-center active:scale-90 transition-all"
      >
        <Plus className="w-7 h-7" />
      </button>

      {/* ── Modal lançamento (criar/editar) ── */}
      {showEntryModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={closeEntryModal}>
          <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{editId ? 'Editar lançamento' : 'Novo lançamento'}</h3>
              <button onClick={closeEntryModal} className="text-slate-400"><X className="w-5 h-5" /></button>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              {['despesa', 'receita'].map(t => (
                <button key={t} onClick={() => setForm(f => ({ ...f, tipo: t, categoria: '', cardId: '' }))}
                  className={`py-2.5 rounded-xl font-semibold text-sm transition-all ${form.tipo === t ? (t === 'receita' ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white') : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                  {t === 'receita' ? '＋ Receita' : '－ Despesa'}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              <input type="text" placeholder="Descrição (ex.: Salário, Mercado...)" value={form.descricao}
                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} className={inputCls} />

              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">R$</span>
                <input type="text" inputMode="numeric" placeholder="0,00" value={form.valorInput}
                  onChange={e => setForm(f => ({ ...f, valorInput: formatCurrencyInput(e.target.value) }))}
                  className={`${inputCls} pl-10 font-semibold`} />
              </div>

              {/* Categoria — dropdown alfabético + nova */}
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Categoria</label>
                <select
                  value={showNovaCat ? '__nova__' : form.categoria}
                  onChange={e => {
                    if (e.target.value === '__nova__') { setShowNovaCat(true); }
                    else { setShowNovaCat(false); setForm(f => ({ ...f, categoria: e.target.value })); }
                  }}
                  className={inputCls}
                >
                  <option value="" disabled>Selecione...</option>
                  {catList(form.tipo).map(c => <option key={c} value={c}>{c}</option>)}
                  <option value="__nova__">＋ Nova categoria...</option>
                </select>
                {showNovaCat && (
                  <div className="flex gap-2 mt-2">
                    <input type="text" autoFocus placeholder="Nome da nova categoria" value={novaCatInput}
                      onChange={e => setNovaCatInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCategoria(); } }}
                      className={inputCls} />
                    <button onClick={addCategoria} className="px-4 rounded-xl bg-indigo-600 text-white font-semibold text-sm shrink-0">Add</button>
                  </div>
                )}
              </div>

              {/* Cartão */}
              {form.tipo === 'despesa' && safeCards.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Cartão de crédito (opcional)</label>
                  <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                    <button onClick={() => setForm(f => ({ ...f, cardId: '' }))}
                      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${!form.cardId ? 'bg-slate-700 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                      Sem cartão
                    </button>
                    {safeCards.map(c => (
                      <button key={c.id} onClick={() => setForm(f => ({ ...f, cardId: c.id, categoria: 'Cartão' }))}
                        className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all"
                        style={form.cardId === c.id ? { backgroundColor: c.cor, color: '#fff' } : { backgroundColor: `${c.cor}22`, color: c.cor }}>
                        <CreditCard className="w-3 h-3" />{c.nome}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Dia venc.</label>
                  <input type="number" min="1" max="31" placeholder="Ex.: 10" value={form.diaVenc}
                    onChange={e => setForm(f => ({ ...f, diaVenc: e.target.value }))} className={inputCls} />
                </div>
                {form.tipo === 'despesa' && form.cardId ? (
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1.5 block flex items-center gap-1"><Layers className="w-3 h-3" />Parcelas</label>
                    <input type="number" min="1" max="60" placeholder="Ex.: 12" value={form.parcelas}
                      onChange={e => setForm(f => ({ ...f, parcelas: e.target.value }))} className={inputCls} disabled={!!editId} />
                  </div>
                ) : (
                  <div>
                    <label className="text-xs font-semibold text-slate-500 mb-1.5 block flex items-center gap-1"><RefreshCw className="w-3 h-3" />Repetição</label>
                    <select value={form.repeticao} onChange={e => setForm(f => ({ ...f, repeticao: e.target.value }))} className={inputCls} disabled={!!editId}>
                      <option value="unica">Única</option>
                      <option value="mensal">Mensal</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Qtde de meses (mensal, sem cartão) */}
              {!editId && form.repeticao === 'mensal' && !(form.tipo === 'despesa' && form.cardId) && (
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Qtde de meses (vazio = infinito ∞)</label>
                  <input type="number" min="1" max="120" placeholder="Ex.: 12 — deixe vazio para infinito" value={form.qtdeMeses}
                    onChange={e => setForm(f => ({ ...f, qtdeMeses: e.target.value }))} className={inputCls} />
                </div>
              )}

              {/* Previews */}
              {!editId && form.tipo === 'despesa' && form.cardId && parseInt(form.parcelas, 10) > 1 && parseCurrencyToNumber(form.valorInput) > 0 && (
                <p className="text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-xl p-2.5">
                  {form.parcelas}× de aprox. <span className="font-bold text-indigo-500">{fmtBRL(parseCurrencyToNumber(form.valorInput) / parseInt(form.parcelas, 10))}</span>, lançadas nas faturas a partir de {cap(formatMonthLabel(mesRef))}.
                </p>
              )}
              {!editId && form.repeticao === 'mensal' && !(form.tipo === 'despesa' && form.cardId) && parseCurrencyToNumber(form.valorInput) > 0 && (
                <p className="text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-xl p-2.5">
                  {fmtBRL(parseCurrencyToNumber(form.valorInput))}/mês {form.qtdeMeses && parseInt(form.qtdeMeses, 10) >= 1 ? `por ${form.qtdeMeses} meses` : 'por tempo indeterminado (∞)'}, a partir de {cap(formatMonthLabel(mesRef))}.
                </p>
              )}

              <button onClick={handleSaveEntry} className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-bold active:scale-95 transition-all mt-1">
                {editId ? 'Salvar alterações' : 'Salvar lançamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal escopo recorrência (pago/edit) ── */}
      {recurringPrompt && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setRecurringPrompt(null)}>
          <div className="w-full sm:max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
              {recurringPrompt.action === 'pago' ? (recurringPrompt.novoStatus === 'pago' ? 'Marcar como pago' : 'Marcar como pendente') : 'Salvar alterações'}
            </h3>
            <p className="text-sm text-slate-500 mb-5">"{recurringPrompt.title}" é recorrente. Aplicar a:</p>
            <div className="space-y-2">
              <button
                onClick={() => recurringPrompt.action === 'pago' ? applyPago('one') : applyEdit('one')}
                className="w-full py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold">
                Somente esta
              </button>
              <button
                onClick={() => recurringPrompt.action === 'pago' ? applyPago('all') : applyEdit('all')}
                className="w-full py-3 rounded-xl bg-indigo-600 text-white font-bold">
                Todas as recorrências
              </button>
              <button onClick={() => setRecurringPrompt(null)} className="w-full py-2.5 text-slate-500 font-medium text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal cartões ── */}
      {showCardModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => { setShowCardModal(false); setEditingCard(null); }}>
          <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{editingCard ? 'Editar cartão' : 'Cartões de crédito'}</h3>
              <button onClick={() => { setShowCardModal(false); setEditingCard(null); }} className="text-slate-400"><X className="w-5 h-5" /></button>
            </div>

            {!editingCard && safeCards.length > 0 && (
              <div className="space-y-2 mb-4">
                {safeCards.map(c => (
                  <div key={c.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-100 dark:bg-slate-800">
                    <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: c.cor }} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-slate-900 dark:text-white truncate">{c.nome}</div>
                      <div className="text-[10px] text-slate-500">Fecha dia {c.diaFechamento} · Vence dia {c.diaVencimento}{c.limite ? ` · Limite ${fmtBRL(c.limite)}` : ''}</div>
                    </div>
                    <button onClick={() => openEditCard(c)} className="text-slate-400 p-1.5"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => setConfirmDel({ tipo: 'card', id: c.id, title: c.nome })} className="text-rose-400 p-1.5"><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3">
              <input type="text" placeholder="Nome do cartão (ex.: Nubank)" value={cardForm.nome}
                onChange={e => setCardForm(f => ({ ...f, nome: e.target.value }))} className={inputCls} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Dia fechamento</label>
                  <input type="number" min="1" max="31" placeholder="Ex.: 28" value={cardForm.diaFechamento}
                    onChange={e => setCardForm(f => ({ ...f, diaFechamento: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Dia vencimento</label>
                  <input type="number" min="1" max="31" placeholder="Ex.: 10" value={cardForm.diaVencimento}
                    onChange={e => setCardForm(f => ({ ...f, diaVencimento: e.target.value }))} className={inputCls} />
                </div>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium text-sm">Limite R$</span>
                <input type="text" inputMode="numeric" placeholder="0,00 (opcional)" value={cardForm.limite}
                  onChange={e => setCardForm(f => ({ ...f, limite: formatCurrencyInput(e.target.value) }))}
                  className={`${inputCls} pl-24`} />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Cor</label>
                <div className="flex gap-2 flex-wrap">
                  {CARD_COLORS.map(cor => (
                    <button key={cor} onClick={() => setCardForm(f => ({ ...f, cor }))}
                      className={`w-8 h-8 rounded-full transition-all ${cardForm.cor === cor ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-slate-900 ring-slate-400 scale-110' : ''}`}
                      style={{ backgroundColor: cor }} />
                  ))}
                </div>
              </div>
              <button onClick={handleSaveCard} className="w-full py-3.5 rounded-xl bg-indigo-600 text-white font-bold active:scale-95 transition-all mt-1">
                {editingCard ? 'Salvar alterações' : 'Adicionar cartão'}
              </button>
              {editingCard && (
                <button onClick={() => { setEditingCard(null); setCardForm(blankCard); }} className="w-full py-2.5 rounded-xl text-slate-500 font-medium text-sm">Cancelar edição</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmar exclusão ── */}
      {confirmDel && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setConfirmDel(null)}>
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Excluir?</h3>
            <p className="text-sm text-slate-500 mb-5">
              {confirmDel.tipo === 'card'
                ? `Remover o cartão "${confirmDel.title}". Os lançamentos ficarão sem cartão.`
                : confirmDel.tipo === 'group'
                  ? `Remover "${confirmDel.title}" e todas as ${confirmDel.count} ${confirmDel.recorrente ? 'recorrências' : 'parcelas'}.`
                  : `Remover "${confirmDel.title}".`}
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDel(null)} className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">Cancelar</button>
              <button onClick={doDelete} className="flex-1 py-3 rounded-xl bg-rose-600 text-white font-bold">Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
