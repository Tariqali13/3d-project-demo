// singlePointCalcuAndFunc.js
import * as THREE from 'three';
import {
  sceneRef,
  cameraRef,
  rendererRef,
  isMultiShapeCompleted,
  selectedPointsRef,
  lineDataBySurfaceRef,
} from '../constants/refStore';
import { anySurfaceEnabled } from './computingUtils';
import { measureProfileLineInWorker } from './workerComputeLineProfileHelper';
import {
  filterBreakEdgesByLineBB,
  lineBoundingBox,
  boxesOverlap,
} from './commonUtils';

export const handleMouseDownSinglePoint = ({
  event,
  isSinglePointMode,
  setLineData,
  setActualLineData,
  surfaceLibrary,
}) => {
  if (!event.target.closest('#three-canvas-container')) return;

  const camera = cameraRef.current;
  const scene = sceneRef.current;
  const renderer = rendererRef.current;
  if (!isSinglePointMode || isMultiShapeCompleted.current) return;
  const enabledSurface = surfaceLibrary.filter((surf) => surf.enableValue);
  const allLineDataBySurface = [];

  const lineDataBySurface = lineDataBySurfaceRef.current;

  if (selectedPointsRef.current.length === 0) {
    // first click => set start
    const mouse = new THREE.Vector2();
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    // allow picking lines
    raycaster.params.Line = { threshold: 1 };
    raycaster.setFromCamera(mouse, camera);

    // Instead of just terrainMeshRef.current, check all meshes:
    const allIntersects = [];
    enabledSurface.forEach((surf) => {
      const hits = raycaster.intersectObject(surf._object, true);
      for (const hit of hits) {
        hit.surfaceId = surf.id;
      }
      if (hits.length > 0) allIntersects.push(...hits);
    });
    allIntersects.sort((a, b) => a.distance - b.distance);

    for (const hit of allIntersects) {
      const { surfaceId, point } = hit;
      if (!lineDataBySurface[surfaceId]) {
        lineDataBySurface[surfaceId] = {
          surfaceId,
          startPoint: null,
          endPoint: null,
        };
      }
      const rec = lineDataBySurface[surfaceId];
      // if (!rec.startPoint) {
      rec.startPoint = point.clone();
      // }
    }
    if (allIntersects.length > 0) {
      const clickedPoint = allIntersects[0].point.clone();
      const sphere = renderPointSphere(clickedPoint, 0x00ff00, 0.1);
      scene.add(sphere);
      selectedPointsRef.current = [clickedPoint];
    }
  } else if (selectedPointsRef.current.length === 1) {
    // second click => finalize line
    const mouse = new THREE.Vector2();
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    // allow picking lines
    raycaster.params.Line = { threshold: 1 };
    raycaster.setFromCamera(mouse, camera);

    const allIntersects = [];
    enabledSurface.forEach((surf) => {
      const hits = raycaster.intersectObject(surf._object, true);
      for (const hit of hits) {
        hit.surfaceId = surf.id;
      }
      if (hits.length > 0) allIntersects.push(...hits);
    });
    allIntersects.sort((a, b) => a.distance - b.distance);
    setActualLineData(allIntersects);
    if (allIntersects.length > 0) {
      const endPoint = allIntersects[0].point.clone();
      const sphere = renderPointSphere(endPoint, 0x00ff00, 0.1);
      scene.add(sphere);

      // measure 2D
      const startPoint = selectedPointsRef.current[0];
      const dx = endPoint.x - startPoint.x;
      const dy = endPoint.y - startPoint.y;
      const dist2D = Math.sqrt(dx * dx + dy * dy).toFixed(2);
      setLineData({ startPoint, endPoint, distance: dist2D });
      selectedPointsRef.current = [];
    }
    for (const hit of allIntersects) {
      const { surfaceId, point } = hit;
      if (!lineDataBySurface[surfaceId]) {
        lineDataBySurface[surfaceId] = {
          surfaceId,
          startPoint: null,
          endPoint: null,
        };
      }
      const rec = lineDataBySurface[surfaceId];
      // if (!rec.endPoint) {
      rec.endPoint = point.clone();
      // }
    }
  }
  const finalArray = Object.values(lineDataBySurface);
  setActualLineData(finalArray);
};

export const handleMouseMoveSinglePoint = ({
  event,
  isSinglePointMode,
  surfaceLibrary,
}) => {
  const camera = cameraRef.current;
  const scene = sceneRef.current;
  const renderer = rendererRef.current;
  const enabledSurface = surfaceLibrary.filter((surf) => surf.enableValue);

  if (
    isSinglePointMode &&
    selectedPointsRef.current.length === 1 &&
    !isMultiShapeCompleted.current
  ) {
    const mouse = new THREE.Vector2();
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.params.Line = { threshold: 1 };

    raycaster.setFromCamera(mouse, camera);
    if (enabledSurface.length) {
      const intersectsAll = [];
      enabledSurface.forEach((surf) => {
        const hits = raycaster.intersectObject(surf._object, true);
        if (hits.length > 0) intersectsAll.push(...hits);
      });
      intersectsAll.sort((a, b) => a.distance - b.distance);
      if (intersectsAll.length > 0) {
        const currentPoint = intersectsAll[0].point.clone();
        const startPoint = selectedPointsRef.current[0];
        singleLineCreator({ startPoint, currentPoint, scene });
        renderer.render(scene, camera);
      }
    }
  }
};

const singleLineCreator = ({ startPoint, currentPoint }) => {
  const scene = sceneRef.current;
  const geometry = new THREE.BufferGeometry().setFromPoints([
    startPoint,
    currentPoint,
  ]);
  const material = new THREE.LineBasicMaterial({
    color: 0x0000ff,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: 4,
  });
  material.depthTest = true;
  material.depthWrite = true;
  const dynamicLine = new THREE.Line(geometry, material);
  dynamicLine.renderOrder = 9999;
  dynamicLine.name = 'singleLine';
  const existingLine = scene.getObjectByName('singleLine');
  if (existingLine) scene.remove(existingLine);
  scene.add(dynamicLine);
};

const renderPointSphere = (point, color = 0x00ff00, size = 0.1) => {
  // ...unchanged...
  const geometry = new THREE.SphereGeometry(size, 32, 32);
  const material = new THREE.MeshBasicMaterial({
    color,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: 4,
  });
  material.depthTest = true;
  material.depthWrite = true;
  const sphere = new THREE.Mesh(geometry, material);
  sphere.renderOrder = 9999;
  sphere.position.set(point.x, point.y, point.z);
  sphere.name = 'pointSphere';
  return sphere;
};

export const calculateSPMDistanceDecider = ({
  lineData,
  setSPMDistance2D,
  setSPMDistance3D,
  surfaceLibrary,
}) => {
  if (!lineData || !lineData.startPoint || !lineData.endPoint) {
    alert('Select start and end points first.');
    return;
  }

  const { startPoint, endPoint } = lineData;
  // Calculate 2D distance
  const dx = endPoint.x - startPoint.x;
  const dy = endPoint.y - startPoint.y;
  const dist2d = Math.sqrt(dx * dx + dy * dy);

  // Store 2D distance
  setSPMDistance2D(dist2d.toFixed(2));

  // COMMENTED OUT: 3D distance calculation
  // If surfaces exist => also compute 3D
  // if (anySurfaceEnabled(surfaceLibrary)) {
  //   const dz = endPoint.z - startPoint.z;
  //   const dist3d = Math.sqrt(dx * dx + dy * dy + dz * dz);
  //   setSPMDistance3D(dist3d.toFixed(2));
  // } else {
  //   // If no surfaces => reset or null out 3D
  //   setSPMDistance3D(null);
  // }

  // Set 3D distance to null as we don't want to display it
  setSPMDistance3D(null);

  return;
};

function computeSlopeDistance(profilePoints) {
  let totalDistance = 0;
  for (let i = 0; i < profilePoints.length - 1; i++) {
    const p1 = profilePoints[i];
    const p2 = profilePoints[i + 1];

    // Horizontal difference in XY is (p2.dist2D - p1.dist2D).
    // Vertical difference is (p2.z - p1.z).
    const dx = p2.dist2D || 0 - p1.dist2D || 0;
    const dz = p2.z - p1.z;

    // Slope distance between consecutive sample points:
    const segment3D = Math.sqrt(dx * dx + dz * dz);
    totalDistance += segment3D;
  }
  return totalDistance;
}

export const measureSPMProfileLine = async ({
  surfaceLibrary,
  setLineProfile,
  lineData,
  actualLineData,
  setBuildingGraph,
  profileWorkerRef,
}) => {
  const newProfiles = [];
  const hasSurface = anySurfaceEnabled(surfaceLibrary);
  const polyBB = lineBoundingBox(lineData.startPoint, lineData.endPoint);

  if (hasSurface) {
    for (const surf of surfaceLibrary) {
      if (surf.enableValue) {
        if (surf._object) {
          const findLineData = actualLineData.find(
            (line) => line.surfaceId == surf.id
          );
          const startPoint = lineData.startPoint;
          const endPoint = lineData.endPoint;
          if (boxesOverlap(polyBB, surf.bvhRoot.bounds)) {
            let filteredBreakLines = filterBreakEdgesByLineBB(
              surf._breakLineEdges,
              startPoint,
              endPoint
            );
            let graphData = await measureProfileLineInWorker({
              startPoint: startPoint,
              endPoint: endPoint,
              setBuildingGraph,
              breakLineEdges: filteredBreakLines,
              bvhRoot: surf.bvhRoot,
              boundaryEdges: surf._boundaryEdges, // Add boundaryEdges
              profileWorkerRef,
            });
            // newProfiles.push({
            //   surfaceId: surf.id,
            //   points: profilePoints,
            // });
            if (graphData) {
              // Convert graph vertices to profile points
              const profilePoints = graphData.vertices.map((vertex) => ({
                dist2D: vertex.dist2D,
                z: vertex.z,
                isBreakLine: vertex.isBreakLine,
                isEdge: vertex.isEdge,
              }));

              newProfiles.push({
                surfaceId: surf.surfaceName,
                points: profilePoints,
                graph: graphData, // Store the full graph if needed
              });
            }
            filteredBreakLines = null;
            graphData = [];
          }
        }
      }
    }
  }
  setLineProfile(newProfiles);
  return newProfiles;
};

/**
 * Measure distance along each enabled surface (3D mesh),
 * constrained to that surface's adjacency (via corridor-based A*).
 *
 * @param {object} lineData                - Must have startPoint, endPoint
 * @param {Array}  surfaceLibrary          - Array of surfaces {id, enableValue, entities}
 * @param {function} setSPMSurfaceDistancesAll - State setter to store an array of {surfaceId, distance}
 */
export function chooseCorridorWidth(bvhNode, minWidth = 100) {
  const bounds = bvhNode.bounds;
  const dx = bounds.max.x - bounds.min.x;
  const dy = bounds.max.y - bounds.min.y;
  const dz = bounds.max.z - bounds.min.z;
  const diag = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return Math.max(diag * 0.05, minWidth);
}
function calculateSurfaceDistance(profileData) {
  const points = profileData.points;
  let totalDistance = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const currentPoint = points[i];
    const nextPoint = points[i + 1];

    // Calculate incremental 2D distance (difference in dist2D)
    const deltaDist2D = nextPoint.dist2D - currentPoint.dist2D;
    // Calculate vertical difference
    const deltaZ = nextPoint.z - currentPoint.z;

    // Calculate 3D distance
    const segmentDistance = Math.sqrt(
      Math.pow(deltaDist2D, 2) + Math.pow(deltaZ, 2)
    );
    totalDistance += segmentDistance;
  }
  return totalDistance;
}

export async function measureSPMSurfaceDistanceAll({
  lineData,
  surfaceLibrary,
  setSPMSurfaceDistancesAll,
  spmLineProfiles,
}) {
  // COMMENTED OUT: Surface distance calculation
  // const results = [];
  // if (spmLineProfiles.length) {
  //   spmLineProfiles.forEach((profile) => {
  //     const distance = calculateSurfaceDistance(profile);
  //     results.push({
  //       surfaceId: profile.surfaceId,
  //       distance: distance.toFixed(2),
  //     });
  //   });
  // }
  // setSPMSurfaceDistancesAll(results);

  // Return empty array since we don't need surface distances
  setSPMSurfaceDistancesAll([]);
  return;
}

export const clearSinglePointLines = (scene) => {
  const objectsToRemove = scene.children.filter(
    (child) => child.name === 'singleLine' || child.name === 'pointSphere'
  );
  objectsToRemove.forEach((obj) => scene.remove(obj));
};
