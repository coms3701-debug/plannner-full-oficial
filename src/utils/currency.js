export const formatCurrencyInput = (value) => {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  const numberValue = Number(digits) / 100;
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numberValue);
};

export const parseCurrencyToNumber = (formattedValue) => {
  if (!formattedValue) return 0;
  const digits = String(formattedValue).replace(/\D/g, '');
  return Number(digits) / 100 || 0;
};
