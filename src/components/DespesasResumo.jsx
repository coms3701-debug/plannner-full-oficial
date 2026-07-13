import React, { useState, useMemo } from 'react';
import { TrendingDown, ChevronDown, ChevronUp } from 'lucide-react';
import { fmtBRL, currentMonthRef, formatMonthShort } from '../utils/finance';

// Relatório compacto de despesas por categoria/mês na página inicial.
// Filtros multi-seleção em chips; categorias derivadas dos lançamentos (sempre atualizadas).
export const DespesasResumo = ({ entries = [] }) => {
  const [mesesSel, setMesesSel] = useState([currentMonthRef()]);
  const [catsSel, setCatsSel] = useState([]); // vazio = todas
  const [aberto, setAberto] = useState(true);

  const despesas = useMemo(
    () => (Array.isArray(entries) ? entries : []).filter(e => e && e.id && !e.deletedAt && e.tipo === 'despesa'),
    [entries]
  );

  // Meses com despesa (ordenados); categorias existentes (alfabético) — refletem edições na hora
  const meses = useMemo(() => Array.from(new Set(despesas.map(e => e.mesRef).filter(Boolean))).sort(), [despesas]);
  const categorias = useMemo(
    () => Array.from(new Set(despesas.map(e => e.categoria || 'Outros'))).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [despesas]
  );

  const toggle = (arr, setArr, v) => setArr(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);

  const filtradas = useMemo(() => despesas.filter(e =>
    (mesesSel.length === 0 || mesesSel.includes(e.mesRef)) &&
    (catsSel.length === 0 || catsSel.includes(e.categoria || 'Outros'))
  ), [despesas, mesesSel, catsSel]);

  const total = filtradas.reduce((s, e) => s + (e.valor || 0), 0);

  const porCategoria = useMemo(() => {
    const g = {};
    filtradas.forEach(e => { const c = e.categoria || 'Outros'; g[c] = (g[c] || 0) + (e.valor || 0); });
    return Object.entries(g).sort((a, b) => b[1] - a[1]);
  }, [filtradas]);

  const maior = porCategoria[0]?.[1] || 1;

  if (despesas.length === 0) return null;

  const chipCls = (on) =>
    `shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide transition-all active:scale-95 ${
      on ? 'bg-rose-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
    }`;

  return (
    <div className="bg-slate-100/80 dark:bg-slate-800/80 p-4 rounded-3xl border border-slate-700/50 shadow-sm">
      <button onClick={() => setAberto(a => !a)} className="w-full flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-rose-400" /> Despesas por Categoria
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-sm font-black text-rose-500">{fmtBRL(total)}</span>
          {aberto ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
        </div>
      </button>

      {aberto && (
        <div className="mt-3 space-y-2.5">
          {/* Meses */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 hide-scrollbar">
            <button onClick={() => setMesesSel([])} className={chipCls(mesesSel.length === 0)}>Todos</button>
            {meses.map(m => (
              <button key={m} onClick={() => toggle(mesesSel, setMesesSel, m)} className={chipCls(mesesSel.includes(m))}>
                {formatMonthShort(m)}
              </button>
            ))}
          </div>
          {/* Categorias */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 hide-scrollbar">
            <button onClick={() => setCatsSel([])} className={chipCls(catsSel.length === 0)}>Todas</button>
            {categorias.map(c => (
              <button key={c} onClick={() => toggle(catsSel, setCatsSel, c)} className={chipCls(catsSel.includes(c))}>
                {c}
              </button>
            ))}
          </div>

          {/* Relatório */}
          {porCategoria.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-3">Nenhuma despesa nos filtros selecionados.</p>
          ) : (
            <div className="space-y-1.5 pt-1">
              {porCategoria.map(([cat, v]) => (
                <div key={cat} className="relative rounded-lg overflow-hidden bg-slate-200/60 dark:bg-slate-700/40">
                  <div className="absolute inset-y-0 left-0 bg-rose-500/15" style={{ width: `${(v / maior) * 100}%` }} />
                  <div className="relative flex justify-between items-center px-2.5 py-1.5">
                    <span className="text-[11px] font-bold uppercase text-slate-700 dark:text-slate-300">{cat}</span>
                    <span className="text-[11px] font-black text-slate-900 dark:text-white">
                      {fmtBRL(v)} <span className="text-slate-500 font-medium">({total > 0 ? Math.round((v / total) * 100) : 0}%)</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
