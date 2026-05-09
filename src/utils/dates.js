export const parseLocalDate = (dateStr) => {
  try {
    if (!dateStr || typeof dateStr !== 'string') return new Date(0);
    if (dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts.length === 3) return new Date(parts[2], parts[1] - 1, parts[0]);
    }
    const [y, m, d] = dateStr.split('-');
    if (!y || !m || !d) return new Date(0);
    return new Date(y, m - 1, d);
  } catch (e) { return new Date(0); }
};

export const formatDateLocal = (dateStr) => {
  try {
    if (!dateStr || typeof dateStr !== 'string') return '';
    if (dateStr.includes('/')) return dateStr;
    const [y, m, d] = dateStr.split('-');
    if (!y || !m || !d) return dateStr;
    return `${d}/${m}/${y}`;
  } catch (e) { return ''; }
};

// Corrige fuso para evitar que tarefas à noite vão para o dia seguinte
export const getLocalYYYYMMDD = (d) => {
  if (!d || isNaN(d.getTime())) return '';
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().split('T')[0];
};
