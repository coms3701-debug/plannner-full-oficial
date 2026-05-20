import React, { useState, useMemo } from 'react';
import { TrendingUp, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';

// ── Utilidades ────────────────────────────────────────────────────────────────

const fmtBRL = (n) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);

const fmtPct = (n, dec = 2) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n || 0) + '%';

/** Lê string pt-BR: "1.000,50" → 1000.5 */
const parsePtBR = (str) => {
  if (!str && str !== 0) return 0;
  const clean = String(str).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  return parseFloat(clean) || 0;
};

/** Formata moeda enquanto digita (mantém apenas dígitos, insere vírgula) */
const fmtCurrencyInput = (digits) => {
  if (!digits) return '';
  const n = parseInt(digits.replace(/\D/g, '') || '0', 10);
  return (n / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/** Formata taxa enquanto digita (max 4 casas) */
const fmtRateInput = (raw) => {
  let v = raw.replace(/[^\d,]/g, '');
  const p = v.split(',');
  return p.length > 1 ? `${p[0]},${p[1].slice(0, 4)}` : v;
};

// ── Cálculo central ────────────────────────────────────────────────────────────

/**
 * Calcula projeção mês a mês.
 * @param {number} pv    Valor inicial
 * @param {number} pmt   Aporte mensal
 * @param {number} rMes  Taxa mensal (fração, ex: 0.011)
 * @param {number} meses Número de meses
 * @param {number} infMes Inflação mensal (fração)
 */
const calcProjecao = (pv, pmt, rMes, meses, infMes) => {
  const pontos = []; // snapshot anual
  let saldo = pv;
  let totalAportado = pv;
  let saldoReal = pv; // deflacionado pela inflação acumulada
  let fatorInflacao = 1;

  for (let m = 1; m <= meses; m++) {
    saldo = saldo * (1 + rMes) + pmt;
    totalAportado += pmt;
    fatorInflacao *= (1 + infMes);
    saldoReal = saldo / fatorInflacao;

    if (m % 12 === 0 || m === meses) {
      pontos.push({
        mes: m,
        ano: Math.ceil(m / 12),
        saldo,
        totalAportado,
        saldoReal,
        ganhoNominal: saldo - totalAportado,
        ganhoReal: saldoReal - totalAportado,
        fatorInflacao,
      });
    }
  }

  const ultimo = pontos[pontos.length - 1] || {};
  return { pontos, ...ultimo };
};

// ── Componente ─────────────────────────────────────────────────────────────────

export function CalculadoraTab() {
  // Inputs
  const [valorInicial, setValorInicial] = useState('');
  const [aporteMensal, setAporteMensal] = useState('');
  const [taxa, setTaxa] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [inflacao, setInflacao] = useState('0,50');
  const [unidadePeriodo, setUnidadePeriodo] = useState('anos'); // 'anos' | 'meses'
  const [unidadeTaxa, setUnidadeTaxa] = useState('mes'); // 'mes' | 'ano'
  const [mostrarTabela, setMostrarTabela] = useState(false);

  // Parse valores
  const pv = parsePtBR(valorInicial);
  const pmt = parsePtBR(aporteMensal);
  const txRaw = parsePtBR(taxa) / 100;
  const infRaw = parsePtBR(inflacao) / 100;
  const perRaw = parsePtBR(periodo);

  // Converter taxa para mensal se necessário
  const rMes = unidadeTaxa === 'ano' ? Math.pow(1 + txRaw, 1 / 12) - 1 : txRaw;
  // Converter período para meses
  const meses = unidadePeriodo === 'anos' ? Math.round(perRaw * 12) : Math.round(perRaw);

  const pronto = pv > 0 && rMes > 0 && meses > 0;

  const resultado = useMemo(() => {
    if (!pronto) return null;
    return calcProjecao(pv, pmt, rMes, meses, infRaw);
  }, [pv, pmt, rMes, meses, infRaw, pronto]);

  const limpar = () => {
    setValorInicial('');
    setAporteMensal('');
    setTaxa('');
    setPeriodo('');
    setInflacao('0,50');
    setMostrarTabela(false);
  };

  // Cores de destaque para ganho real
  const corGanhoReal = resultado && resultado.ganhoReal > 0 ? 'text-emerald-500' : 'text-red-400';

  return (
    <div className="space-y-5 animate-in fade-in pb-24">

      {/* Header */}
      <header className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Investimento</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Projeção de ganhos pré-fixados</p>
        </div>
        <div className="w-10 h-10 rounded-full bg-emerald-600/20 border border-emerald-500/50 flex items-center justify-center">
          <TrendingUp className="w-5 h-5 text-emerald-400" />
        </div>
      </header>

      {/* ── INPUTS ── */}
      <div className="space-y-3">

        {/* Valor inicial */}
        <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-xl border border-slate-300 dark:border-slate-700">
          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 block">
            Valor Inicial
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 font-medium text-sm">R$</span>
            <input
              type="text" inputMode="numeric" placeholder="Ex.: 10.000,00"
              value={valorInicial}
              onChange={(e) => setValorInicial(fmtCurrencyInput(e.target.value))}
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg py-3 pl-9 pr-3 text-slate-900 dark:text-white font-mono text-sm outline-none focus:border-emerald-500 placeholder:text-slate-400 dark:placeholder:text-slate-600 placeholder:text-[12px]"
              style={{ minWidth: 0, WebkitAppearance: 'none' }}
            />
          </div>
        </div>

        {/* Aporte mensal */}
        <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-xl border border-slate-300 dark:border-slate-700">
          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 block">
            Aporte Mensal
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 font-medium text-sm">R$</span>
            <input
              type="text" inputMode="numeric" placeholder="Ex.: 1.000,00"
              value={aporteMensal}
              onChange={(e) => setAporteMensal(fmtCurrencyInput(e.target.value))}
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg py-3 pl-9 pr-3 text-slate-900 dark:text-white font-mono text-sm outline-none focus:border-emerald-500"
              style={{ minWidth: 0, WebkitAppearance: 'none' }}
            />
          </div>
        </div>

        {/* Taxa */}
        <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-xl border border-slate-300 dark:border-slate-700">
          <div className="flex justify-between items-center mb-1.5">
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Taxa de Juros
            </label>
            <div className="flex bg-white dark:bg-slate-900 rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden text-[10px] font-bold">
              {['mes', 'ano'].map((u) => (
                <button
                  key={u}
                  onClick={() => setUnidadeTaxa(u)}
                  className={`px-2.5 py-1 transition-colors ${unidadeTaxa === u ? 'bg-emerald-600 text-white' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  {u === 'mes' ? '% a.m.' : '% a.a.'}
                </button>
              ))}
            </div>
          </div>
          <div className="relative">
            <input
              type="text" inputMode="decimal" placeholder="Ex.: 1,10"
              value={taxa}
              onChange={(e) => setTaxa(fmtRateInput(e.target.value))}
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg py-3 pl-3 pr-8 text-slate-900 dark:text-white font-mono text-sm outline-none focus:border-emerald-500"
              style={{ minWidth: 0, WebkitAppearance: 'none' }}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 font-medium text-sm">%</span>
          </div>
          {unidadeTaxa === 'ano' && rMes > 0 && (
            <p className="text-[10px] text-emerald-500 mt-1 font-medium">≈ {fmtPct(rMes * 100, 4)} ao mês</p>
          )}
        </div>

        {/* Período */}
        <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-xl border border-slate-300 dark:border-slate-700">
          <div className="flex justify-between items-center mb-1.5">
            <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Período
            </label>
            <div className="flex bg-white dark:bg-slate-900 rounded-lg border border-slate-300 dark:border-slate-700 overflow-hidden text-[10px] font-bold">
              {['anos', 'meses'].map((u) => (
                <button
                  key={u}
                  onClick={() => setUnidadePeriodo(u)}
                  className={`px-2.5 py-1 transition-colors ${unidadePeriodo === u ? 'bg-emerald-600 text-white' : 'text-slate-500 dark:text-slate-400'}`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
          <div className="relative">
            <input
              type="text" inputMode="numeric" placeholder={unidadePeriodo === 'anos' ? 'Ex.: 5' : 'Ex.: 60'}
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value.replace(/[^\d]/g, ''))}
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg py-3 pl-3 pr-16 text-slate-900 dark:text-white font-mono text-sm outline-none focus:border-emerald-500"
              style={{ minWidth: 0, WebkitAppearance: 'none' }}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 font-medium text-[11px]">
              {unidadePeriodo}
            </span>
          </div>
          {periodo && <p className="text-[10px] text-slate-500 mt-1">{meses} meses no total</p>}
        </div>

        {/* Inflação */}
        <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-xl border border-slate-300 dark:border-slate-700">
          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 block">
            Inflação Estimada (% a.m.)
          </label>
          <div className="relative">
            <input
              type="text" inputMode="decimal" placeholder="Ex.: 0,50"
              value={inflacao}
              onChange={(e) => setInflacao(fmtRateInput(e.target.value))}
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg py-3 pl-3 pr-8 text-slate-900 dark:text-white font-mono text-sm outline-none focus:border-emerald-500"
              style={{ minWidth: 0, WebkitAppearance: 'none' }}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 font-medium text-sm">%</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-1">IPCA médio histórico ≈ 0,40% a.m.</p>
        </div>
      </div>

      {/* ── Botão limpar ── */}
      <button
        onClick={limpar}
        className="w-full bg-slate-100 dark:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700 active:scale-95 transition-all text-slate-600 dark:text-slate-300 font-bold py-3 rounded-xl border border-slate-300 dark:border-slate-700 flex items-center justify-center gap-2"
      >
        <RotateCcw className="w-4 h-4" />
        Limpar
      </button>

      {/* ── RESULTADOS ── */}
      {!pronto && (
        <div className="bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-4 rounded-xl text-center text-slate-500 dark:text-slate-400 text-sm">
          Preencha o valor inicial, taxa e período para ver a projeção.
        </div>
      )}

      {pronto && resultado && (
        <div className="space-y-4 animate-in fade-in">

          {/* Resumo destaque */}
          <div className="bg-gradient-to-br from-emerald-600/20 to-emerald-800/10 border border-emerald-500/30 p-5 rounded-2xl text-center">
            <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1">Valor Final Bruto</p>
            <p className="text-3xl font-black text-slate-900 dark:text-white font-mono">{fmtBRL(resultado.saldo)}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              em {meses >= 12 ? `${Math.round(meses / 12)} ${Math.round(meses / 12) === 1 ? 'ano' : 'anos'}` : `${meses} meses`}
            </p>
          </div>

          {/* Grid de métricas */}
          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              label="Total Investido"
              value={fmtBRL(resultado.totalAportado)}
              sub={`inicial + ${meses} aportes`}
              color="text-slate-900 dark:text-white"
            />
            <MetricCard
              label="Ganho Nominal"
              value={fmtBRL(resultado.ganhoNominal)}
              sub={`+${fmtPct((resultado.ganhoNominal / resultado.totalAportado) * 100)} s/ investido`}
              color="text-blue-500 dark:text-blue-400"
            />
            <MetricCard
              label="Valor Real (pós-inflação)"
              value={fmtBRL(resultado.saldoReal)}
              sub={`inflação acumulada: ${fmtPct((resultado.fatorInflacao - 1) * 100)}`}
              color="text-slate-900 dark:text-white"
            />
            <MetricCard
              label="Ganho Real"
              value={fmtBRL(resultado.ganhoReal)}
              sub={`poder de compra real`}
              color={corGanhoReal}
            />
          </div>

          {/* Taxa efetiva */}
          {unidadeTaxa === 'mes' && (
            <div className="bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 p-3 rounded-xl text-[11px] text-slate-500 dark:text-slate-400 flex justify-between">
              <span>Taxa anual efetiva</span>
              <span className="font-bold text-slate-700 dark:text-slate-300">{fmtPct((Math.pow(1 + rMes, 12) - 1) * 100, 2)}</span>
            </div>
          )}

          {/* Tabela de evolução */}
          <button
            onClick={() => setMostrarTabela((v) => !v)}
            className="w-full flex items-center justify-between bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 px-4 py-3 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 active:scale-95 transition-all"
          >
            <span>Evolução {unidadePeriodo === 'anos' ? 'Anual' : 'Mensal'}</span>
            {mostrarTabela ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {mostrarTabela && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in fade-in">
              {/* Cabeçalho */}
              <div className="grid grid-cols-3 bg-slate-200 dark:bg-slate-700 px-3 py-2">
                <span className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {unidadePeriodo === 'anos' ? 'Ano' : 'Mês'}
                </span>
                <span className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Saldo Bruto</span>
                <span className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">Valor Real</span>
              </div>
              {/* Linhas */}
              {resultado.pontos.map((p, idx) => (
                <div
                  key={p.mes}
                  className={`grid grid-cols-3 px-3 py-2.5 border-t border-slate-200 dark:border-slate-700/50 ${idx % 2 === 0 ? 'bg-white dark:bg-slate-900/40' : 'bg-slate-50 dark:bg-slate-800/40'}`}
                >
                  <span className="text-[12px] font-bold text-slate-700 dark:text-slate-300">
                    {unidadePeriodo === 'anos' ? `Ano ${p.ano}` : `Mês ${p.mes}`}
                  </span>
                  <span className="text-[11px] font-mono text-slate-900 dark:text-white text-center">{fmtBRL(p.saldo)}</span>
                  <span className={`text-[11px] font-mono text-right ${p.ganhoReal >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                    {fmtBRL(p.saldoReal)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Nota de rodapé */}
          <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center leading-relaxed px-2">
            Simulação para investimentos pré-fixados. Não considera IR, IOF ou taxas de administração.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Sub-componente cartão de métrica ──────────────────────────────────────────

function MetricCard({ label, value, sub, color }) {
  return (
    <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 p-3.5 rounded-xl">
      <p className="text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-[14px] font-black font-mono leading-tight ${color}`}>{value}</p>
      {sub && <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}
