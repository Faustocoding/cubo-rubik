import * as THREE from '../lib/three.module.min.js';

// Eje y capa (valor de grid) que corresponde a cada cara
const AXIS = { U: 'y', D: 'y', L: 'x', R: 'x', F: 'z', B: 'z' };
const LAYER = { U: 1, D: -1, L: -1, R: 1, F: 1, B: -1 };

export const FACE_NORMALS = {
  U: new THREE.Vector3(0, 1, 0),
  D: new THREE.Vector3(0, -1, 0),
  L: new THREE.Vector3(-1, 0, 0),
  R: new THREE.Vector3(1, 0, 0),
  F: new THREE.Vector3(0, 0, 1),
  B: new THREE.Vector3(0, 0, -1),
};

// Normales locales de un BoxGeometry en el orden de sus materiales: [+x,-x,+y,-y,+z,-z]
const LOCAL_FACE_NORMALS = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, -1, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, 0, -1),
];

function rotateGridPos(pos, axis, angle) {
  const cos = Math.round(Math.cos(angle));
  const sin = Math.round(Math.sin(angle));
  const { x, y, z } = pos;
  if (axis === 'x') {
    return { x, y: y * cos - z * sin, z: y * sin + z * cos };
  }
  if (axis === 'y') {
    return { x: z * sin + x * cos, y, z: z * cos - x * sin };
  }
  // z
  return { x: x * cos - y * sin, y: x * sin + y * cos, z };
}

function invertModifier(modifier) {
  if (modifier === "'") return '';
  if (modifier === '') return "'";
  return '2'; // el doble es su propio inverso
}

export class RubikCube {
  constructor(cubeGroup, scene, { moveDuration = 180 } = {}) {
    this.group = cubeGroup;
    this.scene = scene;
    this.moveDuration = moveDuration;
    this._queue = Promise.resolve();
    this.moveHistory = []; // notaciones aplicadas (para deshacer)
    this._pending = 0;
  }

  isBusy() {
    return this._pending > 0;
  }

  getLayerCubies(axis, layerValue) {
    return this.group.children.filter(
      (c) => Math.round(c.userData.gridPos[axis]) === layerValue
    );
  }

  /** Encola un movimiento (notación tipo "U", "U'", "R2"). Devuelve una Promise. */
  move(notation, opts = {}) {
    const face = notation[0];
    const modifier = notation.slice(1);
    this._pending++;
    this._queue = this._queue
      .then(() => this._applyMove(face, modifier, opts))
      .finally(() => { this._pending--; });
    return this._queue;
  }

  /**
   * Vuelve cada cubie a su posición/orientación original (resuelto), de forma
   * instantánea y exacta. Se encola para no pisar una animación en curso.
   */
  resetToSolved() {
    this._queue = this._queue.then(() => {
      this.group.children.forEach((c) => {
        c.position.copy(c.userData.homePosition);
        c.quaternion.identity();
        c.userData.gridPos = { ...c.userData.homeGridPos };
      });
      this.moveHistory = [];
    });
    return this._queue;
  }

  /**
   * Aplica una secuencia de movimientos (scramble) uno tras otro y, al terminar,
   * limpia el historial: el "Deshacer" nunca debe poder ir más atrás del scramble.
   */
  async applyScramble(notations, { duration = 90 } = {}) {
    for (const notation of notations) {
      await this.move(notation, { duration, recordHistory: false });
    }
  }

  /** Deshace el último movimiento aplicado (si lo hay). */
  undo(opts = {}) {
    const last = this.moveHistory[this.moveHistory.length - 1];
    if (!last) return Promise.resolve(null);
    this.moveHistory.pop();
    const inverse = last[0] + invertModifier(last.slice(1));
    this._pending++;
    this._queue = this._queue
      .then(() => this._applyMove(inverse[0], inverse.slice(1), { ...opts, recordHistory: false }))
      .finally(() => { this._pending--; });
    return this._queue.then(() => last);
  }

  _applyMove(face, modifier, { animate = true, recordHistory = true, duration } = {}) {
    const axis = AXIS[face];
    const layerValue = LAYER[face];
    let angle = layerValue === 1 ? -Math.PI / 2 : Math.PI / 2;
    if (modifier === "'") angle = -angle;
    if (modifier === '2') angle = angle * 2;

    const cubies = this.getLayerCubies(axis, layerValue);

    if (recordHistory) {
      this.moveHistory.push(face + modifier);
    }

    return this._rotateLayer(cubies, axis, angle, animate, duration);
  }

  _rotateLayer(cubies, axis, angle, animate, duration) {
    return new Promise((resolve) => {
      const pivot = new THREE.Group();
      this.scene.add(pivot);
      cubies.forEach((c) => pivot.attach(c));

      const finish = () => {
        pivot.rotation[axis] = angle;
        cubies.forEach((c) => {
          this.group.attach(c);
          c.userData.gridPos = rotateGridPos(c.userData.gridPos, axis, angle);
        });
        this.scene.remove(pivot);
        resolve();
      };

      if (!animate) {
        finish();
        return;
      }

      const animDuration = duration ?? this.moveDuration;
      const start = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - start) / animDuration);
        const eased = 1 - Math.pow(1 - t, 3);
        pivot.rotation[axis] = angle * eased;
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          finish();
        }
      };
      requestAnimationFrame(step);
    });
  }

  /** Determina, para un cubie y una dirección global, qué color de sticker mira hacia ahí. */
  _colorFacing(cubie, globalDir) {
    let best = -Infinity;
    let bestIdx = 0;
    for (let i = 0; i < 6; i++) {
      const worldNormal = LOCAL_FACE_NORMALS[i].clone().applyQuaternion(cubie.quaternion);
      const dot = worldNormal.dot(globalDir);
      if (dot > best) {
        best = dot;
        bestIdx = i;
      }
    }
    return cubie.material[bestIdx].color.getHex();
  }

  isSolved() {
    for (const face of Object.keys(AXIS)) {
      const axis = AXIS[face];
      const layerValue = LAYER[face];
      const normal = FACE_NORMALS[face];
      const cubies = this.getLayerCubies(axis, layerValue);
      const firstColor = this._colorFacing(cubies[0], normal);
      for (let i = 1; i < cubies.length; i++) {
        if (this._colorFacing(cubies[i], normal) !== firstColor) {
          return false;
        }
      }
    }
    return true;
  }
}
