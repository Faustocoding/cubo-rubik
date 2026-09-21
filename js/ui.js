import { formatTime } from './timer.js';

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

/** Renderiza la tabla de historial dentro de tbody, ordenada por 'time' o 'moves'. */
export function renderHistoryTable(tbody, history, sortBy) {
  tbody.innerHTML = '';

  if (!history.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.textContent = 'Todavía no hay resoluciones guardadas.';
    td.style.color = '#6b7280';
    td.style.textAlign = 'center';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  const sorted = [...history].sort((a, b) => {
    if (sortBy === 'moves') return a.moves - b.moves;
    return a.timeMs - b.timeMs;
  });

  sorted.forEach((entry, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${formatDate(entry.date)}</td>
      <td>${entry.moves}</td>
      <td>${formatTime(entry.timeMs)}</td>
    `;
    tbody.appendChild(tr);
  });
}

/** Actualiza los elementos de la fila de stats. els = {best, avg5, avg12} (elementos DOM). */
export function renderStats(els, stats) {
  els.best.textContent = stats.best != null ? formatTime(stats.best) : '—';
  els.avg5.textContent = stats.avg5 != null ? formatTime(stats.avg5) : '—';
  els.avg12.textContent = stats.avg12 != null ? formatTime(stats.avg12) : '—';
}
