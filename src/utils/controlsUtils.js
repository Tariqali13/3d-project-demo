import {
  isMiddleMouseDownRef,
  rendererRef,
  cameraRef,
  sceneRef,
  controlRef,
  initialCamPoseRef,
} from '../constants/refStore';
import * as THREE from 'three';

export const handleMiddleMouseDown = ({ event, setPivotPoint }) => {
  const renderer = rendererRef.current;
  const camera = cameraRef.current;
  const scene = sceneRef.current;
  const controls = controlRef.current;
  if (event.button === 1) {
    // Middle mouse button
    event.preventDefault();
    isMiddleMouseDownRef.current = true;

    // Calculate the pivot point based on mouse position
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(scene.children, true);
    if (intersects.length > 0) {
      const newPivot = intersects[0].point;
      controls.target.copy(newPivot);
      controls.update();
      setPivotPoint(newPivot);
      addPivotIndicator(newPivot);
    }
  }
};

export const handleMiddleMouseUp = ({ event }) => {
  if (event.button === 1) {
    // Middle mouse button
    event.preventDefault();
    isMiddleMouseDownRef.current = false;
  }
};

export const addPivotIndicator = (point) => {
  const existingIndicators = sceneRef.current.children.filter(
    (child) => child.name === 'pivotIndicator'
  );
  existingIndicators.forEach((indicator) => sceneRef.current.remove(indicator));
  const geometry = new THREE.SphereGeometry(0.1, 16, 16);
  const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const sphere = new THREE.Mesh(geometry, material);
  sphere.position.copy(point);
  sphere.name = 'pivotIndicator';
  sceneRef.current.add(sphere);
};

export const toggleResetControls = () => {
  const existingIndicators = sceneRef.current.children.filter(
    (child) => child.name === 'pivotIndicator'
  );
  existingIndicators.forEach((indicator) => sceneRef.current.remove(indicator));
  const box = new THREE.Box3().setFromObject(sceneRef.current);
  const center = box.getCenter(new THREE.Vector3());
  controlRef.current.target.set(center.x, center.y, center.z);
  controlRef.current.update();
};

export const getEnabledSurfacesBoundingBox = (surfaceLibrary) => {
  const box = new THREE.Box3();
  const tempBox = new THREE.Box3();

  surfaceLibrary.forEach((surf) => {
    // If the user has enableValue == true and the underlying mesh is visible
    if (surf.enableValue && surf._object && surf._object.visible) {
      // expand box by the bounding box of this mesh
      tempBox.setFromObject(surf._object);
      box.union(tempBox);
    }
  });

  return box;
};

function getEnabledObjectsLayersBoundingBox(library) {
  const box = new THREE.Box3();
  const tempBox = new THREE.Box3();
  library.forEach((lay) => {
    lay.layers.forEach((obj) => {
      // Check that the object is enabled.
      // We assume that for surfaces the Three.js object is stored in _object
      // and for layers it might be in _group.
      if (obj.enableValue) {
        const object3D = obj._group || obj._object;
        if (object3D) {
          tempBox.setFromObject(object3D);
          box.union(tempBox);
        }
      }
    });
  });
  return box;
}
/**
 * @param surfaceLibrary  your array of Surfaces
 * @param layerLibrary    your array of Layer objects
 * @param northBearingDeg 0° = +Y, 90° = +X, −90° = −X …   (optional, default 0)
 */
// export const zoomExtents = (surfaceLibrary,
//   layerLibrary,
//   northBearingDeg = 90) => {
// if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;

// const camera   = cameraRef.current;
// const controls = controlRef.current;

// /* ------------------------------------------------------------------ 1
// Build the overall bounding box */
// const boxSurfaces = getEnabledSurfacesBoundingBox(surfaceLibrary);
// const boxLayers   = getEnabledObjectsLayersBoundingBox(layerLibrary);

// const unionBox = new THREE.Box3();
// if (!boxSurfaces.isEmpty()) unionBox.union(boxSurfaces);
// if (!boxLayers.isEmpty())   unionBox.union(boxLayers);
// if (unionBox.isEmpty()) return;

// /* ------------------------------------------------------------------ 2
// Centre & distance (same maths you already had) */
// const center  = unionBox.getCenter(new THREE.Vector3());
// const size    = unionBox.getSize(new THREE.Vector3());
// const maxDim  = Math.max(size.x, size.y, size.z);

// const fovRad  = THREE.MathUtils.degToRad(camera.fov);
// let   dist    = (maxDim * 0.5) / Math.tan(fovRad * 0.5);
// dist         *= 1.5;                 // add a little padding

// /* ------------------------------------------------------------------ 3
// Plan‑view direction  (look straight down the −Z axis) */
// const viewDir = new THREE.Vector3(0, 0, -1);   // camera → scene

// /* ------------------------------------------------------------------ 4
// Make “True North” go to the top of the screen
// • first build a horizontal vector that represents north
// • then use it as the camera.up vector  */
// const bearingRad = THREE.MathUtils.degToRad(northBearingDeg);
// const northVec   = new THREE.Vector3(
// Math.sin(bearingRad),      // X
// Math.cos(bearingRad),      // Y
// 0                          // Z = 0  (flat)
// ).normalize();

// camera.up.copy(northVec);                       // Y‑axis on screen = North

// /* ------------------------------------------------------------------ 5
// Position camera, aim, update controls */
// camera.position.copy(center).addScaledVector(viewDir, dist);
// camera.lookAt(center);                          // fixes any drift

// if (controls) {
// controls.target.copy(center);
// controls.update();
// }

// camera.near = dist / 100;
// camera.far  = dist * 100;
// camera.updateProjectionMatrix();
// };

export const zoomExtents = (surfaceLibrary, layerLibrary) => {
  if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;
  const camera = cameraRef.current;
  const controls = controlRef.current;
  // 1. union box -------------------------------------------------------------
  const boxSurfaces = getEnabledSurfacesBoundingBox(surfaceLibrary);
  const boxLayers = getEnabledObjectsLayersBoundingBox(layerLibrary);
  const unionBox = new THREE.Box3();
  if (!boxSurfaces.isEmpty()) unionBox.union(boxSurfaces);
  if (!boxLayers.isEmpty()) unionBox.union(boxLayers);
  if (unionBox.isEmpty()) return;
  // 2. centre & distance -----------------------------------------------------
  const center = unionBox.getCenter(new THREE.Vector3());
  const size = unionBox.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = THREE.MathUtils.degToRad(camera.fov);
  let dist = (maxDim * 0.5) / Math.tan(fov * 0.5);
  dist *= 1.5; // padding
  // 3. original view direction ----------------------------------------------
  const dir = new THREE.Vector3()
    .copy(initialCamPoseRef.current.pos)
    .sub(initialCamPoseRef.current.tgt)
    .normalize();
  camera.position.copy(center).add(dir.multiplyScalar(dist));
  camera.up.copy(initialCamPoseRef.current.up);
  // 4. update controls & camera ---------------------------------------------
  if (controls) {
    controls.target.copy(center);
    controls.update();
  }
  camera.near = dist / 100;
  camera.far = dist * 100;
  camera.updateProjectionMatrix();
};
export const handleZoomIn = () => {
  const controls = controlRef.current;
  const camera = cameraRef.current;
  if (!camera || !controls) return;

  // Move camera slightly closer to the target
  // For example, scale down its distance to the origin of rotation:
  const vec = camera.position.clone().sub(controls.target);
  vec.multiplyScalar(0.95); // or 0.9, or whatever “zoom” factor
  camera.position.copy(controls.target).add(vec);

  controls.update();
};

export const handleZoomOut = () => {
  const controls = controlRef.current;
  const camera = cameraRef.current;
  if (!camera || !controls) return;

  const vec = camera.position.clone().sub(controls.target);
  vec.multiplyScalar(1.05);
  camera.position.copy(controls.target).add(vec);

  controls.update();
};

/**
 * Zoom to fit all data in the chart.
 *
 * @param {Chart} chart The Chart.js instance
 */
export const zoomToExtentsChart = (chart) => {
  if (!chart) return;

  // We'll gather min/max across all datasets
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  // Loop all datasets
  chart.data.datasets.forEach((ds) => {
    // ds.data might be an array of { x, y }
    // or you might store numeric arrays
    ds.data.forEach((pt) => {
      // If data is { x, y }, do:
      const xVal = typeof pt.x === 'number' ? pt.x : 0;
      const yVal = typeof pt.y === 'number' ? pt.y : 0;

      if (xVal < minX) minX = xVal;
      if (xVal > maxX) maxX = xVal;

      if (yVal < minY) minY = yVal;
      if (yVal > maxY) maxY = yVal;
    });
  });

  // Protect against Infinity if data is empty
  if (minX === Infinity || maxX === -Infinity) {
    // No valid data => reset to defaults or return
    chart.options.scales.x.min = undefined;
    chart.options.scales.x.max = undefined;
    chart.options.scales.y.min = undefined;
    chart.options.scales.y.max = undefined;
  } else {
    //  add some small padding if you want
    const xPadding = (maxX - minX) * 0.05;
    const yPadding = (maxY - minY) * 0.05;

    //  set chart scale options
    chart.options.scales.x.min = minX - xPadding;
    chart.options.scales.x.max = maxX + xPadding;
    chart.options.scales.y.min = minY - yPadding;
    chart.options.scales.y.max = maxY + yPadding;
  }

  // Re-render chart
  chart.update();
};
