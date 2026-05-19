import React, { useState } from 'react';
import { Calculator, RotateCcw } from 'lucide-react';
import { formatCurrencyInput, parseCurrencyToNumber } from '../utils/currency';

// ===== Fórmulas da Tabela PRICE =====
const calcParcela = (vp, i, n) => {
  if (i === 0) return vp / n;
  return (vp * i) / (1 - Math.pow(1 + i, -n));
};

const calcValorFinanciado = (pmt, i, n) => {
  if (i === 0) return pmt * n;
  return (pmt * (1 - Math.pow(1 + i, -n))) / i;
};

const calcNumeroParcelas = (vp, pmt, i) => {
  if (i === 0) return vp / pmt;
  const arg = 1 - (vp * i) / pmt;
  if (arg <= 0) return null;
  return -Math.log(arg) / Math.log(1 + i);
};

// Newton-Raphson com derivada numérica + segurança de bisseção
const calcIndice = (vp, pmt, n) => {
  if (pmt * n <= vp) return null;
  if (pmt <= 0 || vp <= 0 || n <= 0) return null;
  const f = (i) => calcParcela(vp, i, n) - pmt;
  let i = ((pmt * n) / vp - 1) / n;
  if (i <= 0) i = 0.01;
  for (let iter = 0; iter < 200; iter++) {
    const fi = f(i);
    if (Math.abs(fi) < 1e-10) return i;
    const h = Math.max(i * 1e-6, 1e-8);
    const df = (f(i + h) - fi) / h;
    if (df === 0) break;
    let novo = i - fi / df;
    if (novo <= 0) novo = i / 2;
    i = novo;
  }
  return i;
};

const formatMoeda = (n) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const formatTaxa = (n) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n);

const lerTaxa = (str) => {
  if (!str || !String(str).trim()) return null;
  const limpa = String(str).replace(/\./g, '').replace(',', '.').trim();
  const num = parseFloat(limpa);
  return isNaN(num) ? null : num;
};

const lerNumero = (str) => {
  if (!str || !String(str).trim()) return null;
  const limpa = String(str).replace(/\./g, '').replace(',', '.').trim();
  const num = parseFloat(limpa);
  return isNaN(num) ? null : num;
};

export function CalculadoraTab() {
  const [valorFinanciado, setValorFinanciado] = useState('');
  const [indice, setIndice] = useState('');
  const [parcelas, setParcelas] = useState('');
  const [valorParcela, setValorParcela] = useState('');
  const [resultado, setResultado] = useState(null);
  const [ultimoCalculado, setUltimoCalculado] = useState(null);

  const montarResumo = (vp, pmt, n, titulo) => {
    const total = pmt * n;
    const juros = total - vp;
    return { tipo: 'ok', titulo, parcela: pmt, total, juros };
  };

  const calcular = () => {
    const vp = parseCurrencyToNumber(valorFinanciado) || null;
    const tx = lerTaxa(indice);
    const n = lerNumero(parcelas);
    const pmt = parseCurrencyToNumber(valorParcela) || null;

    const valores = { valorFinanciado: vp, indice: tx, parcelas: n, valorParcela: pmt };
    const vazios = Object.keys(valores).filter((k) => valores[k] === null);

    if (vazios.length > 1) {
      setResultado({ tipo: 'info', texto: 'Preencha pelo menos 3 campos.' });
      return;
    }

    let campoAlvo = vazios.length === 1 ? vazios[0] : ultimoCalculado;
    if (!campoAlvo) {
      setResultado({ tipo: 'info', texto: 'Deixe um campo vazio para calcular.' });
      return;
    }

    const taxa = tx !== null ? tx / 100 : null;

    try {
      if (campoAlvo === 'valorParcela') {
        if (vp === null || taxa === null || n === null || vp <= 0 || n <= 0 || taxa < 0) {
          setResultado({ tipo: 'erro', texto: 'Confira os valores informados.' });
          return;
        }
        const pmtCalc = calcParcela(vp, taxa, n);
        setValorParcela(formatMoeda(pmtCalc));
        setUltimoCalculado('valorParcela');
        setResultado(montarResumo(vp, pmtCalc, n, 'Parcela mensal calculada'));
        return;
      }
      if (campoAlvo === 'valorFinanciado') {
        if (pmt === null || taxa === null || n === null || pmt <= 0 || n <= 0 || taxa < 0) {
          setResultado({ tipo: 'erro', texto: 'Confira os valores informados.' });
          return;
        }
        const vpCalc = calcValorFinanciado(pmt, taxa, n);
        setValorFinanciado(formatMoeda(vpCalc));
        setUltimoCalculado('valorFinanciado');
        setResultado(montarResumo(vpCalc, pmt, n, 'Valor financiado calculado'));
        return;
      }
      if (campoAlvo === 'parcelas') {
        if (vp === null || pmt === null || taxa === null || vp <= 0 || pmt <= 0 || taxa < 0) {
          setResultado({ tipo: 'erro', texto: 'Confira os valores informados.' });
          return;
        }
        const nCalc = calcNumeroParcelas(vp, pmt, taxa);
        if (nCalc === null || !isFinite(nCalc)) {
          setResultado({ tipo: 'erro', texto: 'Com essa parcela e índice, o financiamento não termina. Aumente a parcela.' });
          return;
        }
        setParcelas(formatTaxa(nCalc));
        setUltimoCalculado('parcelas');
        setResultado(montarResumo(vp, pmt, nCalc, 'Número de parcelas calculado'));
        return;
      }
      if (campoAlvo === 'indice') {
        if (vp === null || pmt === null || n === null || vp <= 0 || pmt <= 0 || n <= 0) {
          setResultado({ tipo: 'erro', texto: 'Confira os valores informados.' });
          return;
        }
        const iCalc = calcIndice(vp, pmt, n);
        if (iCalc === null || !isFinite(iCalc)) {
          setResultado({ tipo: 'erro', texto: 'Não foi possível calcular o índice. O total pago precisa ser maior que o valor financiado.' });
          return;
        }
        setIndice(formatTaxa(iCalc * 100));
        setUltimoCalculado('indice');
        setResultado(montarResumo(vp, pmt, n, 'Índice mensal calculado'));
        return;
      }
    } catch (e) {
      setResultado({ tipo: 'erro', texto: 'Não foi possível calcular. Confira os valores.' });
    }
  };

  const limpar = () => {
    setValorFinanciado('');
    setIndice('');
    setParcelas('');
    setValorParcela('');
    setResultado(null);
    setUltimoCalculado(null);
  };

  const aoEditar = (setter, id) => (e) => {
    if (id === ultimoCalculado) setUltimoCalculado(null);
    setter(e.target.value);
  };

  const formatarIndiceInput = (raw) => {
    let v = raw.replace(/[^\d,]/g, '');
    const partes = v.split(',');
    let inteiro = partes[0];
    let decimal = partes[1] ? partes[1].slice(0, 4) : '';
    return v.includes(',') ? `${inteiro},${decimal}` : inteiro;
  };

  return (
    <div className="space-y-6 animate-in fade-in pb-20">
      <header className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Cálculo</h1>
          <p className="text-slate-500 dark:text-slate-400">Calculadora de financiamento (PRICE).</p>
        </div>
        <div className="w-9 h-9 rounded-full bg-blue-600/20 border border-blue-500/50 flex items-center justify-center">
          <Calculator className="w-5 h-5 text-blue-400" />
        </div>
      </header>

      <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-xl border border-slate-300 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
        Preencha 3 campos e deixe vazio o que deseja calcular. Toque em <span className="text-blue-400 font-bold">Calcular</span>.
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-xl border border-slate-300 dark:border-slate-700">
          <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 block">Valor financiado</label>
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 font-medium text-[13px]">R$</span>
            <input type="text" inputMode="numeric" placeholder="0,00" value={valorFinanciado} onChange={aoEditar((v) => setValorFinanciado(formatCurrencyInput(v.replace(/[^\d]/g, ''))), 'valorFinanciado')} className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg py-2.5 pl-7 pr-2 text-slate-900 dark:text-white font-mono text-[14px]" />
          </div>
        </div>

        <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-xl border border-slate-300 dark:border-slate-700">
          <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 block">Índice mensal</label>
          <div className="relative">
            <input type="text" inputMode="decimal" placeholder="1,10" value={indice} onChange={(e) => { if (ultimoCalculado === 'indice') setUltimoCalculado(null); setIndice(formatarIndiceInput(e.target.value)); }} className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg py-2.5 pl-2 pr-7 text-slate-900 dark:text-white font-mono text-[14px]" />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 font-medium text-[13px]">%</span>
          </div>
        </div>

        <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-xl border border-slate-300 dark:border-slate-700">
          <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 block">Número de parcelas</label>
          <input type="text" inputMode="numeric" placeholder="30" value={parcelas} onChange={(e) => { if (ultimoCalculado === 'parcelas') setUltimoCalculado(null); setParcelas(e.target.value.replace(/[^\d,]/g, '')); }} className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg py-2.5 px-2 text-slate-900 dark:text-white font-mono text-[14px]" />
        </div>

        <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-xl border border-slate-300 dark:border-slate-700">
          <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 block">Valor da parcela</label>
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 font-medium text-[13px]">R$</span>
            <input type="text" inputMode="numeric" placeholder="0,00" value={valorParcela} onChange={aoEditar((v) => setValorParcela(formatCurrencyInput(v.replace(/[^\d]/g, ''))), 'valorParcela')} className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg py-2.5 pl-7 pr-2 text-slate-900 dark:text-white font-mono text-[14px]" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={calcular} className="bg-blue-600 active:bg-blue-700 active:scale-95 transition-all text-slate-900 dark:text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20">
          <Calculator className="w-4 h-4" />
          Calcular
        </button>
        <button onClick={limpar} className="bg-slate-100 dark:bg-slate-800 active:bg-slate-700 active:scale-95 transition-all text-slate-700 dark:text-slate-300 font-bold py-3 rounded-xl border border-slate-300 dark:border-slate-700 flex items-center justify-center gap-2">
          <RotateCcw className="w-4 h-4" />
          Limpar
        </button>
      </div>

      {resultado && resultado.tipo === 'ok' && (
        <div className="bg-blue-600/10 border border-blue-500/30 p-5 rounded-2xl space-y-3 animate-in fade-in">
          <p className="text-blue-400 font-bold text-center">{resultado.titulo}</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white/50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-700/50 text-center">
              <p className="text-slate-500 dark:text-slate-400 text-[9px] font-bold uppercase mb-1">Parcela</p>
              <p className="text-slate-900 dark:text-white text-[13px] font-mono font-bold">R$ {formatMoeda(resultado.parcela)}</p>
            </div>
            <div className="bg-white/50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-700/50 text-center">
              <p className="text-slate-500 dark:text-slate-400 text-[9px] font-bold uppercase mb-1">Total</p>
              <p className="text-slate-900 dark:text-white text-[13px] font-mono font-bold">R$ {formatMoeda(resultado.total)}</p>
            </div>
            <div className="bg-white/50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-700/50 text-center">
              <p className="text-amber-400/80 text-[9px] font-bold uppercase mb-1">Juros</p>
              <p className="text-amber-400 text-[13px] font-mono font-bold">R$ {formatMoeda(resultado.juros)}</p>
            </div>
          </div>
        </div>
      )}

      {resultado && resultado.tipo !== 'ok' && (
        <div className={`p-4 rounded-2xl border ${resultado.tipo === 'erro' ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300'} text-sm`}>
          {resultado.texto}
        </div>
      )}

      <div className="bg-slate-100/50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-700/50 text-[11px] text-slate-500 leading-relaxed">
        <span className="font-bold text-slate-500 dark:text-slate-400">Fórmula (Tabela PRICE):</span> Parcela = Valor financiado × Índice ÷ (1 − (1 + Índice)<sup>−Parcelas</sup>)
      </div>
    </div>
  );
}
