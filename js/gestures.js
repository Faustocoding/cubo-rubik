import * as THREE from '../lib/three.module.min.js';

const ROTATE_SPEED = 0.008;
const PHI_EPS = 0.05;
const SWIPE_THRESHOLD = 0.18; // distancia mínima (unidades de mundo) para contar como swipe
const MIN_RADIUS = 4;
const MAX_RADIUS = 16;

const AXIS_TO_FACE = {
  x: { 1: 'R', '-1': 'L' },
  y: { 1: 'U', '-1': 'D' },
  z: { 1: 'F', '-1': 'B' },
};

const AXIS_VECTORS = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

function axisLabelOf(v) {
  const ax = Math.abs(v.x);
  const ay = Math.abs(v.y);
  const az = Math.abs(v.z);
  if (ax >= ay && ax >= az) return 'x';
  if (ay >= ax && ay >= az) return 'y';
  return 'z';
}

/**
 * Controles combinados sobre el canvas del cubo:
 * - Arrastre que empieza en el "aire" (fuera de cualquier cubie) => orbit de cámara.
 * - Arrastre que empieza sobre una cara de un cubie => swipe para girar la capa
 *   correspondiente. La dirección/sentido se calcula proyectando el swipe sobre
 *   el plano 3D de la cara tocada (no depende de heurísticas de pantalla).
 */
export function attachControls({ camera, canvas, cubeGroup, cube, target = new THREE.Vector3(0, 0, 0), onMoveApplied }) {
  const spherical = new THREE.Spherical();
  const offset = new THREE.Vector3();
  offset.copy(camera.position).sub(target);
  spherical.setFromVector3(offset);
  const initialRadius = spherical.radius;

  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane();

  let mode = null; // 'orbit' | 'swipe' | 'pinch'
  let lastX = 0;
  let lastY = 0;
  let swipeCubie = null;
  let swipeNormal = null;
  let swipeStartPoint = null;

  // Pinch-to-zoom con dos dedos (Paso 13)
  const activePointers = new Map(); // pointerId -> {x, y}
  let pinchStartDistance = 0;
  let pinchStartRadius = 0;

  function pointerDistance() {
    const pts = [...activePointers.values()];
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  function updateCameraFromSpherical() {
    spherical.phi = Math.max(PHI_EPS, Math.min(Math.PI - PHI_EPS, spherical.phi));
    offset.setFromSpherical(spherical);
    camera.position.copy(target).add(offset);
    camera.lookAt(target);
  }
  updateCameraFromSpherical();

  function ndcFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    return new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
  }

  function pointOnPlane(e) {
    raycaster.setFromCamera(ndcFromEvent(e), camera);
    const pt = new THREE.Vector3();
    const hit = raycaster.ray.intersectPlane(plane, pt);
    return hit ? pt : null;
  }

  function resolveSwipeMove(swipeVec) {
    const nAxis = axisLabelOf(swipeNormal);
    const remaining = ['x', 'y', 'z'].filter((a) => a !== nAxis);

    const dotA = Math.abs(swipeVec.dot(AXIS_VECTORS[remaining[0]]));
    const dotB = Math.abs(swipeVec.dot(AXIS_VECTORS[remaining[1]]));
    const sAxis = dotA >= dotB ? remaining[0] : remaining[1];
    const rotAxis = remaining.find((a) => a !== sAxis);

    const gridPos = swipeCubie.userData.gridPos;
    const layerValue = Math.round(gridPos[rotAxis]);
    const face = AXIS_TO_FACE[rotAxis][layerValue];
    if (!face) return;

    const posVec = new THREE.Vector3(gridPos.x, gridPos.y, gridPos.z);
    const velocityPositive = AXIS_VECTORS[rotAxis].clone().cross(posVec);
    const sign = Math.sign(velocityPositive.dot(swipeVec));
    if (sign === 0) return;

    const baseSign = layerValue === 1 ? -1 : 1;
    const notation = sign === baseSign ? face : face + "'";

    cube.move(notation).then(() => onMoveApplied?.(notation));
  }

  function onPointerDown(e) {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}

    if (activePointers.size >= 2) {
      // Segundo dedo apoyado: arrancar pinch-zoom y cancelar cualquier swipe/orbit en curso.
      mode = 'pinch';
      swipeCubie = null;
      swipeNormal = null;
      swipeStartPoint = null;
      pinchStartDistance = pointerDistance();
      pinchStartRadius = spherical.radius;
      return;
    }

    lastX = e.clientX;
    lastY = e.clientY;

    raycaster.setFromCamera(ndcFromEvent(e), camera);
    const intersects = raycaster.intersectObjects(cubeGroup.children, false);

    if (intersects.length > 0 && !cube.isBusy()) {
      const hit = intersects[0];
      const worldNormal = hit.face.normal.clone()
        .transformDirection(hit.object.matrixWorld)
        .round();
      mode = 'swipe';
      swipeCubie = hit.object;
      swipeNormal = worldNormal;
      swipeStartPoint = hit.point.clone();
      plane.setFromNormalAndCoplanarPoint(swipeNormal, swipeStartPoint);
    } else {
      mode = 'orbit';
    }
  }

  function onPointerMove(e) {
    if (activePointers.has(e.pointerId)) {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (mode === 'pinch') {
      if (activePointers.size < 2 || pinchStartDistance <= 0) return;
      const dist = pointerDistance();
      const ratio = pinchStartDistance / dist;
      spherical.radius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, pinchStartRadius * ratio));
      updateCameraFromSpherical();
      return;
    }

    if (mode !== 'orbit') return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    spherical.theta -= dx * ROTATE_SPEED;
    spherical.phi -= dy * ROTATE_SPEED;
    updateCameraFromSpherical();
  }

  function onPointerUp(e) {
    activePointers.delete(e.pointerId);
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}

    if (mode === 'pinch') {
      if (activePointers.size >= 2) return; // todavía quedan 2+ dedos (raro, pero por las dudas)
      if (activePointers.size === 1) {
        // Queda un dedo: retomar orbit desde su posición actual, sin salto brusco.
        const [, p] = [...activePointers.entries()][0];
        lastX = p.x;
        lastY = p.y;
        mode = 'orbit';
      } else {
        mode = null;
      }
      return;
    }

    if (mode === 'swipe') {
      const endPoint = pointOnPlane(e);
      if (endPoint) {
        const swipeVec = endPoint.clone().sub(swipeStartPoint);
        // El umbral se mide en unidades de mundo, pero el swipe se hace con el dedo
        // en unidades de pantalla: si la cámara está más cerca (zoom), el mismo gesto
        // físico recorre menos "mundo", así que escalamos el umbral con el zoom actual
        // para mantener una sensibilidad consistente en cualquier nivel de zoom.
        const effectiveThreshold = SWIPE_THRESHOLD * (spherical.radius / initialRadius);
        if (swipeVec.length() > effectiveThreshold) {
          resolveSwipeMove(swipeVec);
        }
      }
    }
    mode = null;
    swipeCubie = null;
    swipeNormal = null;
    swipeStartPoint = null;
  }

  function onWheel(e) {
    e.preventDefault();
    const scale = Math.exp(e.deltaY * 0.001);
    spherical.radius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, spherical.radius * scale));
    updateCameraFromSpherical();
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  return {
    dispose() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
    },
  };
}
