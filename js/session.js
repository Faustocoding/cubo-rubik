import { Stopwatch } from './timer.js';

/**
 * Controla el ciclo de vida de un intento de resolución:
 * idle -> scrambled -> solving -> solved
 *
 * - idle: cubo resuelto, sin sesión activa (moves libres no cuentan).
 * - scrambled: se acaba de mezclar, esperando el primer movimiento del usuario.
 * - solving: cronómetro corriendo, contando movimientos.
 * - solved: cubo resuelto, cronómetro parado.
 */
export class SolveSession {
  constructor(cube, { onTick, onMoveCountChange, onSolved, onPhaseChange } = {}) {
    this.cube = cube;
    this.onTick = onTick;
    this.onMoveCountChange = onMoveCountChange;
    this.onSolved = onSolved;
    this.onPhaseChange = onPhaseChange;

    this.stopwatch = new Stopwatch((ms) => this.onTick?.(ms));
    this.moveCount = 0;
    this.phase = 'idle';
  }

  _setPhase(p) {
    this.phase = p;
    this.onPhaseChange?.(p);
  }

  _setMoveCount(n) {
    this.moveCount = n;
    this.onMoveCountChange?.(n);
  }

  /** Llamar justo después de terminar de aplicar el scramble. */
  markScrambled() {
    this.stopwatch.reset();
    this._setMoveCount(0);
    this._setPhase('scrambled');
  }

  /** Vuelve todo a cero sin mezclar (para el botón Reiniciar). */
  reset() {
    this.stopwatch.reset();
    this._setMoveCount(0);
    this._setPhase('idle');
  }

  /** Llamar cada vez que el usuario completa un movimiento (no scramble, no undo). */
  registerUserMove() {
    if (this.phase === 'scrambled') {
      this.stopwatch.start();
      this._setPhase('solving');
    }
    if (this.phase !== 'solving') return;

    this._setMoveCount(this.moveCount + 1);

    if (this.cube.isSolved()) {
      this.stopwatch.stop();
      this._setPhase('solved');
      this.onSolved?.({ timeMs: this.stopwatch.getElapsedMs(), moves: this.moveCount });
    }
  }

  /** Llamar cada vez que el usuario deshace un movimiento. */
  registerUndo() {
    if (this.phase !== 'solving' && this.phase !== 'solved') return;
    this._setMoveCount(Math.max(0, this.moveCount - 1));
    if (this.phase === 'solved') {
      this._setPhase('solving');
      this.stopwatch.start();
    }
  }
}
