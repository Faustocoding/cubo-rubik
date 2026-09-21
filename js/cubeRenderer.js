import * as THREE from '../lib/three.module.min.js';

// Colores estándar WCA
export const COLORS = {
  U: 0xffffff, // arriba - blanco
  D: 0xffd500, // abajo - amarillo
  F: 0x009e60, // frente - verde
  B: 0x0051ba, // atrás - azul
  L: 0xff5800, // izquierda - naranja
  R: 0xc41e3a, // derecha - rojo
  INNER: 0x111318,
};

const CUBIE_SIZE = 0.94;
const SPACING = 1.02;

function makeCubieMaterials(x, y, z) {
  // Orden BoxGeometry: [+x, -x, +y, -y, +z, -z]
  const c = (cond, color) => new THREE.MeshStandardMaterial({
    color: cond ? color : COLORS.INNER,
    roughness: 0.4,
    metalness: 0.05,
  });
  return [
    c(x === 1, COLORS.R),
    c(x === -1, COLORS.L),
    c(y === 1, COLORS.U),
    c(y === -1, COLORS.D),
    c(z === 1, COLORS.F),
    c(z === -1, COLORS.B),
  ];
}

export function createCubeGroup() {
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE);

  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        const materials = makeCubieMaterials(x, y, z);
        const cubie = new THREE.Mesh(geometry, materials);
        cubie.position.set(x * SPACING, y * SPACING, z * SPACING);
        cubie.userData.gridPos = { x, y, z };
        // Estado "de fábrica" (resuelto), usado por resetToSolved().
        cubie.userData.homeGridPos = { x, y, z };
        cubie.userData.homePosition = cubie.position.clone();
        group.add(cubie);
      }
    }
  }

  return group;
}
