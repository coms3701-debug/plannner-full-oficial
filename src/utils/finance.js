// Lógica financeira: meses de competência, datas de fatura (fechamento real) e parcelas.
import { parseLocalDate } from './dates';

// Date → 'YYYY-MM'
export const toMonthRef = (date) => {
  if (!date || isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

// Mês atual como 'YYYY-MM'
export const currentMonthRef = () => toMonthRef(new Date());

// Soma N meses a um 'YYYY-MM' (N pode ser negativo)
export const addMonths = (monthRef, n) => {
  const [y, m] = String(monthRef).split('-').map(Number);
  if (!y || !m) return monthRef;
  const d = new Date(y, m - 1 + n, 1);
  return toMonthRef(d);
};

// 'YYYY-MM' → "maio de 2026" (capitalizado fora)
export const formatMonthLabel = (monthRef) => {
  const [y, m] = String(monthRef).split('-').map(Number);
  if (!y || !m) return '';
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
};

// 'YYYY-MM' → "MAI / 26" (curto, para abas)
export const formatMonthShort = (monthRef) => {
  const [y, m] = String(monthRef).split('-').map(Number);
  if (!y || !m) return '';
  const d = new Date(y, m - 1, 1);
  const mes = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase();
  return `${mes} ${y}`;
};

/**
 * Fechamento REAL do cartão.
 * Dado a data da compra + dia de fechamento + dia de vencimento,
 * retorna o 'YYYY-MM' do VENCIMENTO da primeira fatura (quando o dinheiro sai).
 */
export const primeiraFaturaMes = (dataCompra, diaFechamento, diaVencimento) => {
  const d = parseLocalDate(dataCompra);
  if (!d || isNaN(d.getTime()) || d.getTime() === 0) return currentMonthRef();
  let mes = d.getMonth(); // 0-11 → mês em que a fatura fecha
  const ano = d.getFullYear();
  const dia = d.getDate();
  // Comprou DEPOIS do fechamento → cai na próxima fatura
  if (dia > diaFechamento) mes += 1;
  // Vencimento: se o dia de vencimento <= dia de fechamento, vence no mês seguinte ao fechamento
  let mesVenc = mes;
  if (diaVencimento <= diaFechamento) mesVenc += 1;
  return toMonthRef(new Date(ano, mesVenc, 1));
};

/**
 * Divide um valor total em N parcelas, jogando os centavos restantes na ÚLTIMA.
 * Ex.: 1000 / 3 → [333.33, 333.33, 333.34]
 */
export const dividirParcelas = (valorTotal, n) => {
  const total = Math.round(valorTotal * 100); // centavos
  const baseCent = Math.floor(total / n);
  const arr = Array(n).fill(baseCent);
  const resto = total - baseCent * n;
  arr[n - 1] += resto;
  return arr.map((c) => c / 100);
};

export const fmtBRL = (n) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);
