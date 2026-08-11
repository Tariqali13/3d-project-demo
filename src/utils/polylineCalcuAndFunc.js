// polylineCalcuAndFunc.js

import * as THREE from 'three';
import {
  sceneRef,
  cameraRef,
  rendererRef,
  // allTerrainMeshesRef,
  polylinePointsRef,
  isPolylineCompleted,
  polygonMarkersGroupRef,
} from '../constants/refStore';
import { measureSurfaceDistanceAStar } from './workerDijkstraHelper';
import { measureProfileLineInWorker } from './workerComputeLineProfileHelper';
import {
  filterBreakEdgesByLineBB,
  computePointsBoundingBox,
  boxesOverlap,
} from './commonUtils';

// 1) Click handler: add consecutive points + draw line segments
export const handlePolylineClick = ({
  ev,
  isPolylineMode,
  setPolylinePoints,
  surfaceLibrary,
}) => {
  if (!ev.target.closest('#three-canvas-container')) return;

  if (!isPolylineMode || isPolylineCompleted.current) return;
  const enabledSurface = surfaceLibrary.filter((surf) => surf.enableValue);

  const camera = cameraRef.current;
  const scene = sceneRef.current;
  const renderer = rendererRef.current;
  if (!camera || !scene || !renderer) return;

  // Convert mouse coords to normalized device coords
  const mouse = new THREE.Vector2();
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;

  // Raycast
  const raycaster = new THREE.Raycaster();
  raycaster.params.Line = { threshold: 1 };
  raycaster.setFromCamera(mouse, camera);

  let allIntersects = [];
  enabledSurface.forEach((surf) => {
    const hits = raycaster.intersectObject(surf._object, true);
    if (hits.length > 0) allIntersects.push(...hits);
  });
  allIntersects.sort((a, b) => a.distance - b.distance);

  if (allIntersects.length > 0) {
    const clickedPoint = allIntersects[0].point.clone();

    // Draw segment from previous point to the new point
    if (polylinePointsRef.current.length > 0) {
      const start =
        polylinePointsRef.current[polylinePointsRef.current.length - 1];
      drawPolylineSegment({ startPoint: start, endPoint: clickedPoint, scene });
      updatePolygonMarkers({
        scene,
        camera,
        points3D: polylinePointsRef.current,
        polygonMarkersGroupRef,
      });
    }

    const findPoint = polylinePointsRef.current.find(
      (po) =>
        po.x === clickedPoint.x &&
        po.y === clickedPoint.y &&
        po.z === clickedPoint.z
    );
    if (!findPoint) {
      polylinePointsRef.current.push(clickedPoint);
      setPolylinePoints([...polylinePointsRef.current]);
      updatePolygonMarkers({
        scene,
        camera,
        points3D: polylinePointsRef.current,
        polygonMarkersGroupRef,
      });
    }
  }
};

// 2) Mouse‐move (optional: if you want a preview line, etc.)
export const handlePolylineMouseMove = ({ ev, isPolylineMode }) => {
  // You could do hover logic, or show a temp line from last point -> cursor
  if (!isPolylineMode || isPolylineCompleted.current) return;
};

// 3) Double‐click => finalize (do NOT close back to the first point!)
export const handleDoubleClickPolyline = ({
  isPolylineMode,
  setPolylinePoints,
}) => {
  if (!isPolylineMode || isPolylineCompleted.current) return;

  isPolylineCompleted.current = true;
  setPolylinePoints([...polylinePointsRef.current]);
};

// 4) Helper to draw each line segment
const drawPolylineSegment = ({ startPoint, endPoint, scene }) => {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    startPoint,
    endPoint,
  ]);
  const material = new THREE.LineBasicMaterial({
    color: 0xff00ff,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: 4,
  });
  material.depthTest = true;
  material.depthWrite = true;
  const line = new THREE.Line(geometry, material);
  line.renderOrder = 99999;
  line.name = 'polylineSegment';
  scene.add(line);
};

// 5) Clear polylines
export const clearPolylineSegments = (scene) => {
  const objectsToRemove = scene.children.filter(
    (child) => child.name === 'polylineSegment'
  );
  objectsToRemove.forEach((obj) => scene.remove(obj));
  polylinePointsRef.current = [];
  isPolylineCompleted.current = false;
};

// 6) Compute a “profile” (like your multiPoint profile) by
// sampling along each consecutive segment, then concatenating.
export const measurePolylineProfile = async ({
  surfaceLibrary,
  setLineProfile,
  polylinePoints,
  setBuildingGraph,
  profileWorkerRef,
}) => {
  // Need at least 2 points
  if (polylinePoints.length < 2) return;
  const firstPoint = polylinePoints[0];
  const lastPoint = polylinePoints[polylinePoints.length - 1];
  let newProfiles = [];
  const polyBB = computePointsBoundingBox(polylinePoints);
  let combinedPoints = [];
  let combinedGraphData = [];
  let segmentProfile = [];
  // For each surface, we build an array of { x, y }
  // where x = cumulative distance along the polyline, y = elevation (Z).
  for (let i = 0; i < surfaceLibrary.length; i++) {
    const surf = surfaceLibrary[i];
    if (surf.enableValue) {
      if (surf._object) {
        // const adjacencyData = adjacencyMapRef.current.find(
        //   (item) => item.mesh === surf._object
        // );
        // const bvhRoot = adjacencyData.bvhRoot;

        // corridor-based distance
        if (boxesOverlap(polyBB, surf.bvhRoot.bounds)) {
          let accumulatedDistance = 0;
          // let breakLineEdges = extractBreakLinesFromEntities(surf.entities);
          for (let i = 0; i < polylinePoints.length - 1; i++) {
            let p1 = polylinePoints[i];
            let p2 = polylinePoints[i + 1];
            // console.log('p1', p1, 'p2', p2);
            let filteredBreakLines = filterBreakEdgesByLineBB(
              surf._breakLineEdges,
              p1,
              p2
            );
            // sample N=10 points along p1->p2, retrieving (dist, elevation).
            segmentProfile = await measureProfileLineInWorker({
              startPoint: p1,
              endPoint: p2,
              setBuildingGraph,
              breakLineEdges: filteredBreakLines,
              bvhRoot: surf.bvhRoot,
              boundaryEdges: surf._boundaryEdges, // Add boundaryEdges
              profileWorkerRef,
            });
            // console.log(
            //   'segmentProfile.vertices',
            //   segmentProfile.vertices[segmentProfile.vertices.length - 1]
            // );
            segmentProfile.vertices.forEach((pt, idx) => {
              // Check if the current vertex matches p1 or p2
              const matchesP1 = pt.x === p1.x && pt.y === p1.y && pt.z === p1.z;
              const matchesP2 = pt.x === p2.x && pt.y === p2.y && pt.z === p2.z;

              // Check if the current vertex is the first or last point of polylinePoints
              const isFirstPoint =
                pt.x === firstPoint.x &&
                pt.y === firstPoint.y &&
                pt.z === firstPoint.z;
              const isLastPoint =
                pt.x === lastPoint.x &&
                pt.y === lastPoint.y &&
                pt.z === lastPoint.z;

              // Skip adding if the vertex matches p1 or p2 but isn't the first or last point of polylinePoints
              if ((matchesP1 || matchesP2) && !isFirstPoint && !isLastPoint) {
                // console.log(
                //   `Skipping vertex at index ${idx} as it matches p1/p2 but isn't first/last of polyline`,
                //   pt
                // );
                return; // Skip this vertex
              }

              // Check if the point already exists in combinedPoints
              const findPoint = combinedPoints.find(
                (po) => po.x === pt.x && po.y === pt.y && po.z === pt.z
              );
              // console.log('findPoint', findPoint);

              if (!findPoint) {
                // Add the point with the accumulated distance
                combinedPoints.push({
                  dist2D: pt.dist2D + accumulatedDistance,
                  z: pt.z,
                  x: pt.x,
                  y: pt.y,
                  isBreakLine: pt.isBreakLine,
                  isEdge: pt.isEdge,
                });
              }
            });
            // after this segment, update the accumulated distance
            if (segmentProfile.vertices.length > 0) {
              accumulatedDistance +=
                segmentProfile.vertices[segmentProfile.vertices.length - 1]
                  .dist2D;
            }
            combinedGraphData.push(segmentProfile);
            segmentProfile = [];
            filteredBreakLines = [];
          }
          // console.log('combinedPoints', combinedPoints, surf.id);
          newProfiles.push({
            surfaceId: surf.surfaceName,
            points: combinedPoints,
            graph: combinedGraphData,
          });
          accumulatedDistance = 0;
          combinedPoints = [];
          combinedGraphData = [];
        }
      }
    }
  }
  // console.log('newProfiles', newProfiles);

  setLineProfile(newProfiles);
  return newProfiles;
};

// 7) Basic direct 2D or 3D distance from point to point
export const measurePolylineDistances2D = (polylinePoints) => {
  const segmentDistances = [];
  for (let i = 0; i < polylinePoints.length - 1; i++) {
    const p1 = polylinePoints[i];
    const p2 = polylinePoints[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    segmentDistances.push(dist);
  }
  return segmentDistances;
};

export const measurePolylineDistances3D = (polylinePoints) => {
  const segmentDistances = [];
  for (let i = 0; i < polylinePoints.length - 1; i++) {
    const p1 = polylinePoints[i];
    const p2 = polylinePoints[i + 1];
    segmentDistances.push(p1.distanceTo(p2));
  }
  return segmentDistances;
};

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
export async function measurePolylineSurfaceDistanceAll({
  spmLineProfiles,
  polylinePoints,
  surfaceLibrary,
  setPolylineSurfaceDistances,
}) {
  if (polylinePoints.length < 2) return;
  let results = [];

  spmLineProfiles.forEach((profile) => {
    const surfaceDis = calculateSurfaceDistance(profile);
    results.push({
      surfaceId: profile.surfaceId,
      segmentDistances: surfaceDis.toFixed(2),
    });
  });
  setPolylineSurfaceDistances(results);
  results = [];
}

const updatePolygonMarkers = ({ points3D }) => {
  let camera = cameraRef.current;
  let scene = sceneRef.current;
  const group = new THREE.Group();
  group.name = 'polygonMarkersGroup';
  for (const p of points3D) {
    const marker = createSquareMarker(0.1, 0x00ff00); // big squares
    marker.position.set(p.x, p.y, p.z);
    marker.lookAt(camera.position);
    marker.name = 'square';
    group.add(marker);
  }
  scene.add(group);
  polygonMarkersGroupRef.current = group;
};

const createSquareMarker = (size = 0.1, color = 0x00ff00) => {
  // ...unchanged from your code...
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
  return sphere;
};

const measurePolylineSegmentDistAStar = async (
  adjacencyData,
  startP,
  endP,
  corridorWidth = 100
) => {
  try {
    const distStr = await measureSurfaceDistanceAStar({
      adjacencyData,
      startPoint: startP,
      endPoint: endP,
      corridorWidth, // tweak if needed
    });

    if (!distStr || distStr.includes('no path')) {
      return 'No path';
    }
    if (!isNaN(distStr)) {
      const val = parseFloat(distStr);
      return val;
    } else {
      return 0;
    }
  } catch (err) {
    return `Error: ${err.message}`;
  }
};
