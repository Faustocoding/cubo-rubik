const HISTORY_KEY = 'rubik.history.v1';
const INSTRUCTIONS_KEY = 'rubik.instructions.v1';

export function getHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('No se pudo leer el historial', err);
    return [];
  }
}

function saveHistory(history) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (err) {
    console.warn('No se pudo guardar el historial', err);
  }
}

/** Agrega una resolución al historial y lo persiste. Devuelve la entrada creada. */
export function addSolve({ timeMs, moves }) {
  const history = getHistory();
  const entry = { date: new Date().toISOString(), moves, timeMs };
  history.push(entry);
  saveHistory(history);
  return entry;
}

/** Calcula mejor tiempo, promedio de 5 y promedio de 12 (últimas resoluciones por fecha). */
export function computeStats(history) {
  if (!history.length) {
    return { best: null, avg5: null, avg12: null };
  }
  const best = history.reduce((min, s) => (s.timeMs < min ? s.timeMs : min), Infinity);

  const avgOfLast = (n) => {
    if (history.length < n) return null;
    const last = history.slice(-n);
    const sum = last.reduce((acc, s) => acc + s.timeMs, 0);
    return sum / n;
  };

  return { best, avg5: avgOfLast(5), avg12: avgOfLast(12) };
}

/** Devuelve la imagen de instrucciones guardada (data URL) o null si no hay ninguna. */
export function getInstructionsImage() {
  try {
    return localStorage.getItem(INSTRUCTIONS_KEY);
  } catch (err) {
    console.warn('No se pudo leer la imagen de instrucciones', err);
    return null;
  }
}

export function setInstructionsImage(dataUrl) {
  try {
    localStorage.setItem(INSTRUCTIONS_KEY, dataUrl);
  } catch (err) {
    console.warn('No se pudo guardar la imagen de instrucciones (¿muy pesada?)', err);
  }
}

export function clearInstructionsImage() {
  try {
    localStorage.removeItem(INSTRUCTIONS_KEY);
  } catch (err) {
    console.warn('No se pudo borrar la imagen de instrucciones', err);
  }
}
