// Gera arquivo .ics (iCalendar) para tarefas do Planner Full.
// iOS Safari/PWA reconhece o mime type e oferece "Adicionar ao Calendário".

const escapeICS = (text) => {
  if (!text) return '';
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
};

const formatLocalDateTime = (date) => {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}${mm}${dd}T${hh}${min}00`;
};

const formatUTC = (date) => {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
};

export const generateTaskICS = (task) => {
  if (!task || !task.dueDate) return null;

  const [y, m, d] = task.dueDate.split('-').map(Number);
  const [hh, mm] = (task.dueTime || '09:00').split(':').map(Number);
  const startDate = new Date(y, m - 1, d, hh, mm);
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // +1h default

  const uid = `task-${task.id}-${Date.now()}@plannerfull`;
  const dtStamp = formatUTC(new Date());
  const dtStart = formatLocalDateTime(startDate);
  const dtEnd = formatLocalDateTime(endDate);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Planner Full//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeICS(task.title)}`,
  ];

  if (task.description) {
    lines.push(`DESCRIPTION:${escapeICS(task.description)}`);
  }

  // Recorrência
  const freqMap = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' };
  if (task.recurrence && freqMap[task.recurrence]) {
    lines.push(`RRULE:FREQ=${freqMap[task.recurrence]}`);
  }

  // Alarmes — múltiplos para garantir que o usuário seja avisado
  if (task.hasReminder) {
    const alarms = [
      { trigger: '-PT15M', label: '15 minutos antes' },
      { trigger: '-PT1H', label: '1 hora antes' },
      { trigger: '-P1D', label: '1 dia antes' },
    ];
    alarms.forEach(({ trigger, label }) => {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeICS(task.title + ' - ' + label)}`,
        `TRIGGER:${trigger}`,
        'END:VALARM'
      );
    });
  } else {
    // Mesmo sem hasReminder, adiciona um lembrete padrão de 15min antes
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeICS(task.title)}`,
      'TRIGGER:-PT15M',
      'END:VALARM'
    );
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');

  return lines.join('\r\n');
};

export const downloadTaskICS = (task) => {
  const ics = generateTaskICS(task);
  if (!ics) return false;

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const safeName = (task.title || 'tarefa')
    .replace(/[^a-zA-Z0-9-_ ]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50) || 'tarefa';

  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeName}.ics`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
};
