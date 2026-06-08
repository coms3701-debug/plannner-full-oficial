// Snapshots automáticos locais — rede de segurança contra perda de dados.
// Guarda as últimas N versões dos dados no localStorage, antes de cada gravação na nuvem.

const SNAP_KEY = 'planner_v4_snapshots';
const MAX_SNAPSHOTS = 12;

// Conta itens "de verdade" num conjunto de dados (para detectar dados vazios/perdidos)
export const countItems = (data) => {
  if (!data || typeof data !== 'object') return 0;
  let n = 0;
  const addArr = (a) => { if (Array.isArray(a)) n += a.length; };
  const addObj = (o) => { if (o && typeof o === 'object' && !Array.isArray(o)) n += Object.keys(o).length; };
  addArr(data.tasks);
  addArr(data.priorities);
  addArr(data.financeCards);
  addArr(data.financeEntries);
  addArr(data.portfolioCategories);
  addObj(data.habits);
  addObj(data.dailyTasks);
  addObj(data.portfolio);
  return n;
};

export const getSnapshots = () => {
  try {
    const raw = localStorage.getItem(SNAP_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

// Salva um snapshot (só se tiver conteúdo e for diferente do último)
export const saveSnapshot = (data) => {
  try {
    const count = countItems(data);
    if (count === 0) return; // nunca guarda estado vazio
    const snaps = getSnapshots();
    const last = snaps[0];
    const serialized = JSON.stringify(data);
    if (last && last.serialized === serialized) return; // sem mudança
    const novo = {
      ts: new Date().toISOString(),
      count,
      serialized,
    };
    const atualizado = [novo, ...snaps].slice(0, MAX_SNAPSHOTS);
    localStorage.setItem(SNAP_KEY, JSON.stringify(atualizado));
  } catch (e) {
    console.warn('Falha ao salvar snapshot:', e);
  }
};

// Retorna os dados de um snapshot pelo timestamp
export const getSnapshotData = (ts) => {
  const snap = getSnapshots().find((s) => s.ts === ts);
  if (!snap) return null;
  try {
    return JSON.parse(snap.serialized);
  } catch {
    return null;
  }
};
