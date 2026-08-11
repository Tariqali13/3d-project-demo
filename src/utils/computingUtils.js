import * as THREE from 'three';

export const anySurfaceEnabled = (surfaceLibrary) => {
  return surfaceLibrary.some((surf) => surf.enableValue);
};

export const surfaceEnabledArr = (surfaceLibrary) => {
  const enabledSurf = [];
  surfaceLibrary.filter((surf) => {
    if (surf.enableValue) {
      enabledSurf.push({
        enableValue: surf.enableValue,
        id: surf.id,
        surfaceName: surf.surfaceName,
      });
    }
  });
  return enabledSurf;
};

export const computeLineProfile = (startPoint, endPoint, mesh, step = 0) => {
  if (!mesh) return [];
  const points = [];
  const dx = endPoint.x - startPoint.x;
  const dy = endPoint.y - startPoint.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  const stepsCount = Math.floor(length / step);
  // allTerrainMeshesRef.current.forEach((mesh) => {
  const raycaster = new THREE.Raycaster();
  // <<--- KEY: let lines have a picking threshold if lines are present
  raycaster.params.Line = { threshold: 1 };
  const partialProfile = [];
  for (let i = 0; i <= stepsCount; i++) {
    const fraction = i / stepsCount;
    const x = startPoint.x + fraction * dx;
    const y = startPoint.y + fraction * dy;
    // if (isNaN(x) || isNaN(y)) continue; // Skip invalid points
    const rayOrigin = new THREE.Vector3(x, y, 9999);
    const rayDir = new THREE.Vector3(0, 0, -1);
    raycaster.set(rayOrigin, rayDir);
    const intersects = raycaster.intersectObject(mesh, true);
    if (intersects.length > 0) {
      const z = intersects[0].point.z;
      const distAlongLine = fraction * length;
      partialProfile.push({
        x: distAlongLine,
        y: z,
      });
    }
  }
  if (partialProfile.length > 0) {
    points.push(...partialProfile);
    // points.push({ x: null, y: null });
  }
  // });
  points.sort((a, b) => a.distance - b.distance);
  return points;
};
