import * as THREE from '../lib/three.module.min.js';
import { createCubeGroup } from './cubeRenderer.js';
import { attachControls } from './gestures.js';
import { RubikCube } from './cubeModel.js';
import { generateScramble } from './scramble.js';
import { SolveSession } from './session.js';
import { formatTime } from './timer.js';
import {
  getHistory, addSolve, computeStats,
  getInstructionsImage, setInstructionsImage, clearInstructionsImage,
} from './storage.js';
import { renderHistoryTable, renderStats } from './ui.js';

const canvas = document.getElementById('cubeCanvas');
const container = document.getElementById('cubeContainer');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111318);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(4.2, 4.2, 5.2);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const ambient = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambient);

const key = new THREE.DirectionalLight(0xffffff, 0.6);
key.position.set(5, 8, 6);
scene.add(key);

const fill = new THREE.DirectionalLight(0xffffff, 0.3);
fill.position.set(-6, -3, -4);
scene.add(fill);

const cubeGroup = createCubeGroup();
scene.add(cubeGroup);

const cube = new RubikCube(cubeGroup, scene);

// --- Timer + contador (Paso 6) ---
const timerEl = document.getElementById('timer');
const moveCounterEl = document.getElementById('moveCounter');

const session = new SolveSession(cube, {
  onTick: (ms) => { timerEl.textContent = formatTime(ms); },
  onMoveCountChange: (n) => { moveCounterEl.textContent = `${n} moves`; },
  onPhaseChange: (phase) => { timerEl.classList.toggle('solved', phase === 'solved'); },
  onSolved: ({ timeMs, moves }) => {
    if (navigator.vibrate) navigator.vibrate(200);
    addSolve({ timeMs, moves });
    refreshTopPanel();
  },
});

attachControls({
  camera,
  canvas,
  cubeGroup,
  cube,
  target: new THREE.Vector3(0, 0, 0),
  onMoveApplied: () => session.registerUserMove(),
});

// --- Panel de debug temporal (Paso 3): botones de moves + estado resuelto ---
const debugStatus = document.getElementById('debugStatus');
const debugMoves = document.getElementById('debugMoves');

function refreshStatus() {
  debugStatus.textContent = 'estado: ' + (cube.isSolved() ? 'RESUELTO ✅' : 'mezclado');
}

const MOVES = ['U', "U'", 'D', "D'", 'L', "L'", 'R', "R'", 'F', "F'", 'B', "B'"];
MOVES.forEach((notation) => {
  const btn = document.createElement('button');
  btn.textContent = notation;
  btn.addEventListener('click', () => {
    cube.move(notation).then(() => {
      session.registerUserMove();
      refreshStatus();
    });
  });
  debugMoves.appendChild(btn);
});

refreshStatus();
setInterval(refreshStatus, 250); // polling simple para el panel de debug

// --- Botón Mezclar (Paso 5) ---
const btnScramble = document.getElementById('btnScramble');
const debugScrambleText = document.createElement('div');
debugScrambleText.id = 'debugScrambleText';
debugStatus.after(debugScrambleText);

function setControlsEnabled(enabled) {
  btnScramble.disabled = !enabled;
  debugMoves.querySelectorAll('button').forEach((b) => { b.disabled = !enabled; });
}

btnScramble.addEventListener('click', async () => {
  setControlsEnabled(false);
  const seq = generateScramble(20);
  debugScrambleText.textContent = 'scramble: ' + seq.join(' ');
  await cube.applyScramble(seq);
  session.markScrambled();
  refreshStatus();
  setControlsEnabled(true);
});

// --- Botón Deshacer (Paso 7) ---
const btnUndo = document.getElementById('btnUndo');
btnUndo.addEventListener('click', async () => {
  const undone = await cube.undo();
  if (undone) {
    session.registerUndo();
  }
  refreshStatus();
});

// --- Botón Reiniciar (Paso 8) ---
const btnReset = document.getElementById('btnReset');
btnReset.addEventListener('click', async () => {
  setControlsEnabled(false);
  await cube.resetToSolved();
  session.reset();
  debugScrambleText.textContent = '';
  refreshStatus();
  setControlsEnabled(true);
});

// --- Menú y overlay de Historial/Top (Paso 9) ---
const menuBtn = document.getElementById('menuBtn');
const menuOverlay = document.getElementById('menuOverlay');
const closeMenu = document.getElementById('closeMenu');
const openTop = document.getElementById('openTop');
const openInstructions = document.getElementById('openInstructions');

const topOverlay = document.getElementById('topOverlay');
const closeTop = document.getElementById('closeTop');
const sortByTime = document.getElementById('sortByTime');
const sortByMoves = document.getElementById('sortByMoves');
const historyTableBody = document.getElementById('historyTableBody');

const statEls = {
  best: document.getElementById('statBest'),
  avg5: document.getElementById('statAvg5'),
  avg12: document.getElementById('statAvg12'),
};

let currentSort = 'time';

function openOverlay(el) { el.classList.remove('hidden'); }
function closeOverlay(el) { el.classList.add('hidden'); }

function refreshTopPanel() {
  const history = getHistory();
  renderStats(statEls, computeStats(history));
  renderHistoryTable(historyTableBody, history, currentSort);
}

menuBtn.addEventListener('click', () => openOverlay(menuOverlay));
closeMenu.addEventListener('click', () => closeOverlay(menuOverlay));

openTop.addEventListener('click', () => {
  closeOverlay(menuOverlay);
  refreshTopPanel();
  openOverlay(topOverlay);
});
closeTop.addEventListener('click', () => closeOverlay(topOverlay));

openInstructions.addEventListener('click', () => {
  closeOverlay(menuOverlay);
  refreshInstructionsPanel();
  openOverlay(instructionsOverlay);
});

function setSort(sort) {
  currentSort = sort;
  sortByTime.classList.toggle('active', sort === 'time');
  sortByMoves.classList.toggle('active', sort === 'moves');
  refreshTopPanel();
}
sortByTime.addEventListener('click', () => setSort('time'));
sortByMoves.addEventListener('click', () => setSort('moves'));

// --- Instrucciones con imagen (Paso 10) ---
const instructionsOverlay = document.getElementById('instructionsOverlay');
const closeInstructions = document.getElementById('closeInstructions');
const instructionsPlaceholder = document.getElementById('instructionsPlaceholder');
const instructionsImage = document.getElementById('instructionsImage');
const btnUploadInstructions = document.getElementById('btnUploadInstructions');
const btnClearInstructions = document.getElementById('btnClearInstructions');
const instructionsFileInput = document.getElementById('instructionsFileInput');

function refreshInstructionsPanel() {
  const dataUrl = getInstructionsImage();
  if (dataUrl) {
    instructionsImage.src = dataUrl;
    instructionsImage.classList.remove('hidden');
    instructionsPlaceholder.classList.add('hidden');
    btnClearInstructions.classList.remove('hidden');
  } else {
    instructionsImage.classList.add('hidden');
    instructionsImage.removeAttribute('src');
    instructionsPlaceholder.classList.remove('hidden');
    btnClearInstructions.classList.add('hidden');
  }
}

closeInstructions.addEventListener('click', () => closeOverlay(instructionsOverlay));

btnUploadInstructions.addEventListener('click', () => instructionsFileInput.click());

instructionsFileInput.addEventListener('change', () => {
  const file = instructionsFileInput.files && instructionsFileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    setInstructionsImage(reader.result);
    refreshInstructionsPanel();
  };
  reader.readAsDataURL(file);
  instructionsFileInput.value = '';
});

btnClearInstructions.addEventListener('click', () => {
  clearInstructionsImage();
  refreshInstructionsPanel();
});

function resize() {
  const w = container.clientWidth;
  const h = container.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();

// --- PWA: registro del service worker (Paso 11) ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch((err) => {
      console.warn('No se pudo registrar el service worker', err);
    });
  });
}
