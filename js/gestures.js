import * as THREE from '../lib/three.module.min.js';

const ROTATE_SPEED = 0.008;
const PHI_EPS = 0.05;
const SWIPE_THRESHOLD = 0.35; // distancia mínima (unidades de mundo) para contar como swipe

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

  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane();

  let mode = null; // 'orbit' | 'swipe'
  let lastX = 0;
  let lastY = 0;
  let swipeCubie = null;
  let swipeNormal = null;
  let swipeStartPoint = null;

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

    canvas.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
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
    if (mode === 'swipe') {
      const endPoint = pointOnPlane(e);
      if (endPoint) {
        const swipeVec = endPoint.clone().sub(swipeStartPoint);
        if (swipeVec.length() > SWIPE_THRESHOLD) {
          resolveSwipeMove(swipeVec);
        }
      }
    }
    mode = null;
    swipeCubie = null;
    swipeNormal = null;
    swipeStartPoint = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  return {
    dispose() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
    },
  };
}
