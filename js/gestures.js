import * as THREE from '../lib/three.module.min.js';

const ROTATE_SPEED = 0.008;
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

// Eje vertical fijo del mundo: el arrastre horizontal SIEMPRE gira alrededor de este
// eje (no del "up" actual de la cámara), así el gesto de ir para el costado siempre
// es un giro horizontal puro, sin sumar inclinación aunque la vista ya esté inclinada.
const WORLD_UP = new THREE.Vector3(0, 1, 0);

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
 * - Arrastre que empieza en el "aire" (fuera de cualquier cubie) => orbit de cámara
 *   estilo "trackball" (por cuaterniones), sin límite de polos: se puede dar vuelta
 *   el cubo completamente para poner cualquier cara/color arriba.
 * - Arrastre que empieza sobre una cara de un cubie => swipe para girar la capa
 *   correspondiente. La dirección/sentido se calcula proyectando el swipe sobre
 *   el plano 3D de la cara tocada (no depende de heurísticas de pantalla).
 */
export function attachControls({ camera, canvas, cubeGroup, cube, target = new THREE.Vector3(0, 0, 0), onMoveApplied }) {
  // Órbita libre tipo trackball: guardamos el offset cámara->target y el vector "up"
  // de la cámara, y rotamos ambos con cuaterniones. Al no usar ángulos de Euler con
  // polo fijo, no hay gimbal lock ni límite de inclinación: se puede voltear el cubo
  // por completo (por ejemplo, poner la cara amarilla arriba).
  const offset = new THREE.Vector3();
  offset.copy(camera.position).sub(target);
  const initialRadius = offset.length();
  let radius = initialRadius;
  const up = camera.up.clone().normalize();

  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane();

  let mode = null; // 'orbit' | 'swipe' | 'pinch'
  let lastX = 0;
  let lastY = 0;
  let swipeCubie = null;
  let swipeNormal = null;
  let swipeStartPoint = null;

  // Pinch-to-zoom con dos dedos (Paso 13) + torsión con dos dedos para enderezar
  // la vista si quedó inclinada (pedido del usuario tras habilitar el orbit libre).
  const activePointers = new Map(); // pointerId -> {x, y}
  let pinchStartDistance = 0;
  let pinchStartRadius = 0;
  let pinchStartAngle = 0;
  let pinchStartUp = null;

  function pointerDistance() {
    const pts = [...activePointers.values()];
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  function pointerAngle() {
    const pts = [...activePointers.values()];
    return Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
  }

  function updateCamera() {
    camera.up.copy(up);
    camera.position.copy(target).add(offset);
    camera.lookAt(target);
  }
  updateCamera();

  function setRadius(r) {
    radius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, r));
    offset.setLength(radius);
  }

  function computeRight(forward) {
    let right = new THREE.Vector3().crossVectors(up, forward);
    if (right.lengthSq() < 1e-6) {
      // forward casi paralelo a up (justo en un "polo"): usamos un eje de respaldo
      // arbitrario para poder seguir girando sin trabarse.
      return new THREE.Vector3(1, 0, 0);
    }
    return right.normalize();
  }

  function applyOrbitDelta(dx, dy) {
    // Arrastre horizontal: gira alrededor del eje vertical FIJO del mundo (no del "up"
    // actual de la cámara). Rotamos tanto "offset" como "up" con el mismo giro para
    // mantener la inclinación relativa que ya hubiera, pero sin que un arrastre "de
    // costado" sume inclinación nueva (que era la causa de que se fuera para abajo).
    //
    // Cuando la vista queda "boca abajo" respecto al mundo (ej: volteaste el cubo
    // para poner el amarillo arriba), el "up" actual apunta casi al revés del eje
    // fijo del mundo. En ese caso, girar siempre en el mismo sentido alrededor del
    // eje del mundo se ve invertido para quien mira desde "abajo" — así que
    // invertimos el sentido del arrastre horizontal para que siga sintiéndose
    // natural (arrastrar a la derecha gira hacia la derecha) sin importar cómo esté
    // orientado el cubo.
    const yawSign = up.dot(WORLD_UP) >= 0 ? 1 : -1;
    const qYaw = new THREE.Quaternion().setFromAxisAngle(WORLD_UP, -dx * ROTATE_SPEED * yawSign);
    offset.applyQuaternion(qYaw);
    up.applyQuaternion(qYaw);

    // Recalculamos "right" con el "forward" ya actualizado por el yaw.
    const forward = offset.clone().normalize();
    const right = computeRight(forward);

    // Arrastre vertical: gira alrededor del eje "right", inclinando también el "up"
    // (esto es lo que permite pasar de largo los polos y voltear el cubo del todo).
    const qPitch = new THREE.Quaternion().setFromAxisAngle(right, -dy * ROTATE_SPEED);
    offset.applyQuaternion(qPitch);
    up.applyQuaternion(qPitch);

    updateCamera();
  }

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
      pinchStartRadius = radius;
      pinchStartAngle = pointerAngle();
      pinchStartUp = up.clone();
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
      setRadius(pinchStartRadius * ratio);

      // Torsión con dos dedos: girar el par de dedos (como girar una perilla) rota
      // la vista alrededor del eje de visión (roll), sin cambiar hacia dónde mira la
      // cámara. Sirve para "enderezar" el cubo si el orbit libre lo dejó inclinado.
      const angle = pointerAngle();
      const deltaAngle = angle - pinchStartAngle;
      const forward = offset.clone().normalize();
      const qRoll = new THREE.Quaternion().setFromAxisAngle(forward, deltaAngle);
      up.copy(pinchStartUp).applyQuaternion(qRoll);

      updateCamera();
      return;
    }

    if (mode !== 'orbit') return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    applyOrbitDelta(dx, dy);
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
        const effectiveThreshold = SWIPE_THRESHOLD * (radius / initialRadius);
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
    setRadius(radius * scale);
    updateCamera();
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
