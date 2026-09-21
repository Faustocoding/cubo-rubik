const FACES = ['U', 'D', 'L', 'R', 'F', 'B'];
const AXIS_OF_FACE = { U: 'y', D: 'y', L: 'x', R: 'x', F: 'z', B: 'z' };
const MODIFIERS = ['', "'", '2'];

/**
 * Genera una secuencia de scramble tipo "random moves" (aproximación estándar
 * no-oficial, no es random-state WCA que requeriría un solver Kociemba).
 * Evita repetir el eje del movimiento anterior para no generar giros redundantes.
 */
export function generateScramble(length = 20) {
  const seq = [];
  let lastAxis = null;
  for (let i = 0; i < length; i++) {
    let face;
    do {
      face = FACES[Math.floor(Math.random() * FACES.length)];
    } while (AXIS_OF_FACE[face] === lastAxis);
    lastAxis = AXIS_OF_FACE[face];
    const modifier = MODIFIERS[Math.floor(Math.random() * MODIFIERS.length)];
    seq.push(face + modifier);
  }
  return seq;
}
