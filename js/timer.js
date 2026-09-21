export class Stopwatch {
  constructor(onTick) {
    this.startTime = null;
    this.elapsed = 0;
    this.running = false;
    this.onTick = onTick;
    this._raf = null;
    this._tick = this._tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.startTime = performance.now() - this.elapsed;
    this._raf = requestAnimationFrame(this._tick);
  }

  _tick() {
    if (!this.running) return;
    this.elapsed = performance.now() - this.startTime;
    this.onTick?.(this.elapsed);
    this._raf = requestAnimationFrame(this._tick);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this.elapsed = performance.now() - this.startTime;
    this.onTick?.(this.elapsed);
  }

  reset() {
    this.running = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this.elapsed = 0;
    this.startTime = null;
    this.onTick?.(this.elapsed);
  }

  getElapsedMs() {
    return this.running ? performance.now() - this.startTime : this.elapsed;
  }
}

export function formatTime(ms) {
  const totalMs = Math.max(0, Math.floor(ms));
  const minutes = Math.floor(totalMs / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const tenths = Math.floor((totalMs % 1000) / 100);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
}
