// Camera views around the kit and the maths to frame the whole kit on any
// screen shape.

import * as THREE from '../../vendor/three.module.min.js';

const DEG = Math.PI / 180;

export const VIEWS = {
  drummer: { name: 'Drummer', theta: 0, phi: 50 * DEG, target: [0.1, 0.7, -0.38] },
  front: { name: 'Front', theta: 180 * DEG, phi: 70 * DEG, target: [0.1, 0.7, -0.35] },
  top: { name: 'Top', theta: 0, phi: 6 * DEG, target: [0.1, 0.4, -0.35] },
};

export const VIEW_ORDER = ['drummer', 'front', 'top'];

export const PHI_RANGE = [6 * DEG, 88 * DEG];
export const DIST_RANGE = [0.8, 7];

/** Put the camera on a sphere around the target. */
export function placeCamera(camera, { theta, phi, dist, target }) {
  const t = Array.isArray(target) ? new THREE.Vector3(...target) : target;
  camera.position.set(
    t.x + dist * Math.sin(phi) * Math.sin(theta),
    t.y + dist * Math.cos(phi),
    t.z + dist * Math.sin(phi) * Math.cos(theta),
  );
  camera.lookAt(t);
  camera.updateMatrixWorld(true);
}

const tmp = new THREE.Vector3();

function bounds(camera, points) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    tmp.copy(p).project(camera);
    if (tmp.z > 1 || tmp.z < -1) return null; // behind or too close
    minX = Math.min(minX, tmp.x);
    maxX = Math.max(maxX, tmp.x);
    minY = Math.min(minY, tmp.y);
    maxY = Math.max(maxY, tmp.y);
  }
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, ext: Math.max((maxX - minX) / 2, (maxY - minY) / 2) };
}

/**
 * Find the distance (and a recentred target) that frames all `points`
 * with a margin. Returns { theta, phi, dist, target: Vector3 }.
 */
export function fitView(camera, view, points, margin = 0.9) {
  const target = new THREE.Vector3(...view.target);
  let dist = 3;
  for (let pass = 0; pass < 3; pass++) {
    let lo = DIST_RANGE[0] * 0.5;
    let hi = 14;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      placeCamera(camera, { ...view, dist: mid, target });
      const b = bounds(camera, points);
      if (!b || b.ext > margin) lo = mid;
      else hi = mid;
    }
    dist = hi;
    placeCamera(camera, { ...view, dist, target });
    const b = bounds(camera, points);
    if (!b) break;
    // pan so the kit sits in the middle of the screen
    const halfH = dist * Math.tan((camera.fov * DEG) / 2);
    const halfW = halfH * camera.aspect;
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    target.addScaledVector(right, b.cx * halfW).addScaledVector(up, b.cy * halfH);
  }
  return { theta: view.theta, phi: view.phi, dist, target };
}

export function lerpView(a, b, t) {
  const k = t * t * (3 - 2 * t);
  let dTheta = b.theta - a.theta;
  while (dTheta > Math.PI) dTheta -= Math.PI * 2;
  while (dTheta < -Math.PI) dTheta += Math.PI * 2;
  return {
    theta: a.theta + dTheta * k,
    phi: a.phi + (b.phi - a.phi) * k,
    dist: a.dist + (b.dist - a.dist) * k,
    target: new THREE.Vector3().lerpVectors(a.target, b.target, k),
  };
}
