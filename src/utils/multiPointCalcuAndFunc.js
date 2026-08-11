// multiPointCalcuAndFunc.js

import * as THREE from 'three';
import {
  sceneRef,
  cameraRef,
  rendererRef,
  isMultiShapeCompleted,
  polygonMarkersGroupRef,
  multiPointsRef,
} from '../constants/refStore';
import { anySurfaceEnabled } from './computingUtils';
import { measureSurfaceDistanceAStarSegmentAsync } from './corridorUtils';
import { measureProfileLineInWorker } from './workerComputeLineProfileHelper';
import {
  filterBreakEdgesByLineBB,
  computePointsBoundingBox,
  boxesOverlap,
} from './commonUtils';

export const handleMultiPointClick = ({
  ev,
  isMultiPointMode,
  setMultiPoints,
  surfaceLibrary,
}) => {
  if (!ev.target.closest('#three-canvas-container')) return;

  let camera = cameraRef.current;
  let scene = sceneRef.current;
  let renderer = rendererRef.current;
  if (!isMultiPointMode || isMultiShapeCompleted.current) return;
  const enabledSurface = surfaceLibrary.filter((surf) => surf.enableValue);

  const mouse = new THREE.Vector2();
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;

  const raycaster = new THREE.Raycaster();
  raycaster.params.Line = { threshold: 1 };
  raycaster.setFromCamera(mouse, camera);

  // check all geometry
  let allIntersects = [];
  enabledSurface.forEach((surf) => {
    const hits = raycaster.intersectObject(surf._object, true);
    if (hits.length > 0) allIntersects.push(...hits);
  });
  allIntersects.sort((a, b) => a.distance - b.distance);

  if (allIntersects.length > 0) {
    const clickedPoint = allIntersects[0].point.clone(); // THREE.Vector3 instance

    if (multiPointsRef.current.length > 1) {
      const firstPoint = multiPointsRef.current[0];
      if (clickedPoint.distanceTo(firstPoint) < 5) {
        // close shape
        const startPoint =
          multiPointsRef.current[multiPointsRef.current.length - 1];
        const endPoint = multiPointsRef.current[0];
        multiLineCreator({ startPoint, endPoint, scene });
        isMultiShapeCompleted.current = true;
        const findPoint = multiPointsRef.current.find(
          (po) =>
            po.x === clickedPoint.x &&
            po.y === clickedPoint.y &&
            po.z === clickedPoint.z
        );
        if (!findPoint) {
          setMultiPoints([...multiPointsRef.current]);
        }
        return;
      }
    }
    const findPoint = multiPointsRef.current.find(
      (po) =>
        po.x === clickedPoint.x &&
        po.y === clickedPoint.y &&
        po.z === clickedPoint.z
    );
    if (!findPoint) {
      if (multiPointsRef.current.length) {
        const startPoint =
          multiPointsRef.current[multiPointsRef.current.length - 1];
        const endPoint = clickedPoint;
        multiLineCreator({ startPoint, endPoint, scene });
      }

      const newPoint = new THREE.Vector3(
        clickedPoint.x,
        clickedPoint.y,
        clickedPoint.z
      );

      if (newPoint.lengthSq() === 0) {
        console.error('Attempted to add a zero-length point:', newPoint);
      } else {
        multiPointsRef.current.push(newPoint);
        setMultiPoints([...multiPointsRef.current]);
        updatePolygonMarkers({
          scene,
          camera,
          points3D: multiPointsRef.current,
          polygonMarkersGroupRef,
        });
      }
      return;
    }
  }
};

export const handleMultiPointMouseMove = ({ ev, isMultiPointMode }) => {
  let camera = cameraRef.current;
  let renderer = rendererRef.current;
  if (!isMultiPointMode || isMultiShapeCompleted.current) return;
  if (multiPointsRef.current.length === 0) return; // no shape yet
  const mouse = new THREE.Vector2();
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  const raycaster = new THREE.Raycaster();
  raycaster.params.Line = { threshold: 1 };
  raycaster.setFromCamera(mouse, camera);
};

export const handleDoubleClickMultiPoint = ({
  isMultiPointMode,
  setMultiPoints,
}) => {
  let scene = sceneRef.current;
  if (!isMultiPointMode || isMultiShapeCompleted.current) return;
  if (multiPointsRef.current.length >= 3) {
    const startPoint =
      multiPointsRef.current[multiPointsRef.current.length - 1];
    const endPoint = multiPointsRef.current[0];
    multiLineCreator({ startPoint, endPoint, scene });
    isMultiShapeCompleted.current = true;
    setMultiPoints([...multiPointsRef.current]);
  }
};

const multiLineCreator = ({ startPoint, endPoint }) => {
  let scene = sceneRef.current;
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
  line.renderOrder = 9999;
  line.name = 'multiLine';
  scene.add(line);
};

const renderPointSphere = (point, color = 0x00ff00, size = 5) => {
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

export const measureMPMMultiPointProfile = async ({
  surfaceLibrary,
  setLineProfile,
  multiPoints,
  setBuildingGraph,
}) => {
  if (!isMultiShapeCompleted.current || multiPoints.length < 3) return;
  const newProfiles = [];
  const firstPoint = multiPoints[0];
  const lastPoint = multiPoints[0];
  const polyBB = computePointsBoundingBox(multiPoints);
  let combinedPoints = [];
  let combinedGraphData = [];
  let segmentProfile = [];
  for (let i = 0; i < surfaceLibrary.length; i++) {
    const surf = surfaceLibrary[i];
    if (surf.enableValue) {
      if (surf._object) {
        // corridor-based distance
        if (boxesOverlap(polyBB, surf.bvhRoot.bounds)) {
          let accumulatedDistance = 0;
          for (let i = 0; i < multiPoints.length; i++) {
            let p1 = multiPoints[i];
            let p2 = multiPoints[(i + 1) % multiPoints.length];
            let filteredBreakLines = filterBreakEdgesByLineBB(
              surf._breakLineEdges,
              p1,
              p2
            );

            segmentProfile = await measureProfileLineInWorker({
              startPoint: p1,
              endPoint: p2,
              setBuildingGraph,
              breakLineEdges: filteredBreakLines,
              bvhRoot: surf.bvhRoot,
              boundaryEdges: surf._boundaryEdges, // Add boundaryEdges
            });
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

            combinedGraphData.push(segmentProfile);
            if (segmentProfile.vertices.length > 0) {
              accumulatedDistance +=
                segmentProfile.vertices[segmentProfile.vertices.length - 1]
                  .dist2D;
            }
            segmentProfile = [];
          }
          newProfiles.push({
            surfaceId: surf.surfaceName,
            points: combinedPoints,
            graph: combinedGraphData,
          });
          combinedPoints = [];
        }
      }
    }
  }
  setLineProfile(newProfiles);
  return newProfiles;
};

const measureMPMShape2D = ({
  multiPoints,
  setMultiPointDistance,
  setMultiPointDistance3D,
  setMPMShapeArea,
  setMPMShapeArea3D,
}) => {
  if (!isMultiShapeCompleted.current || multiPoints.length < 3) {
    alert(
      'At least three points and a completed shape are required for 2D area.'
    );
    return;
  }
  const points2D = multiPoints.map((p) => ({ x: p.x, y: p.y }));
  const firstPoint = multiPoints[0];
  points2D.push({
    x: firstPoint.x,
    y: firstPoint.y,
  });
  let totalDistance2DVal = 0;
  for (let i = 0; i < multiPoints.length; i++) {
    let p1 = multiPoints[i];
    let p2 = multiPoints[(i + 1) % multiPoints.length];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist2d = Math.sqrt(dx * dx + dy * dy);
    if (!isNaN(dist2d)) {
      totalDistance2DVal = totalDistance2DVal + dist2d;
    }
  }

  const area = calculatePolygonArea(points2D);

  // Store them in your 2D states:
  setMultiPointDistance(totalDistance2DVal.toFixed(2));
  setMPMShapeArea(area.toFixed(2));
  // Optionally reset the 3D states if you don't want them showing
  setMultiPointDistance3D(null);
  setMPMShapeArea3D(null);
};

const calculatePolygonArea = (points) => {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const { x: x1, y: y1 } = points[i];
    const { x: x2, y: y2 } = points[(i + 1) % points.length];
    area += x1 * y2 - y1 * x2;
  }
  return Math.abs(area / 2);
};

export const measureMPMShapeDecider = async ({
  multiPoints,
  setMultiPointDistance3D,
  setMPMShapeArea3D,
  setMultiPointDistance,
  setMPMShapeArea,
  surfaceLibrary,
  setMultiSurfacePerimeters, // Add this parameter
  setMultiSurfaceAreas, // Add this parameter
  spmLineProfiles,
}) => {
  if (!isMultiShapeCompleted.current || multiPoints.length < 3) {
    return alert('Need at least 3 points + shape.');
  }
  if (anySurfaceEnabled(surfaceLibrary)) {
    // 3D Measurements
    await measureMPMShape3DHandler({
      multiPoints,
      setMultiPointDistance3D,
      setMPMShapeArea3D,
      setMultiPointDistance,
      setMPMShapeArea,
      surfaceLibrary,
    });

    // Measure Perimeter on Each Surface
    await measureMultiSurfaceDistanceAll({
      multiPoints,
      surfaceLibrary,
      setMultiSurfacePerimeters,
      spmLineProfiles,
    });

    // Measure Area on Each Surface
    measureMPMSurfaceAreaAll({
      multiPoints,
      surfaceLibrary,
      setMultiSurfaceAreas,
    });
  } else {
    measureMPMShape2D({
      multiPoints,
      setMultiPointDistance,
      setMultiPointDistance3D,
      setMPMShapeArea,
      setMPMShapeArea3D,
    });
  }
};

const measureMPMShape3DHandler = async ({
  multiPoints,
  setMultiPointDistance3D,
  setMPMShapeArea3D,
  setMultiPointDistance,
  setMPMShapeArea,
  surfaceLibrary,
}) => {
  if (!isMultiShapeCompleted.current || multiPoints.length < 3) {
    alert('At least three points + shape for 3D area.');
    return;
  }

  let totalDistance3DVal = 0;
  for (let i = 0; i < multiPoints.length; i++) {
    let p1 = multiPoints[i];
    let p2 = multiPoints[(i + 1) % multiPoints.length];
    const dist3d = p1.distanceTo(p2);
    if (!isNaN(dist3d)) {
      totalDistance3DVal = totalDistance3DVal + dist3d;
    }
  }

  // Area in 3D
  const area3DVal = calculatePolygonArea3D(multiPoints);
  // Store in 3D states
  setMultiPointDistance3D(totalDistance3DVal.toFixed(2));
  setMPMShapeArea3D(area3DVal.toFixed(2));
  // Optionally reset the 2D states if you don't want to show them
  setMultiPointDistance(null);
  setMPMShapeArea(null);
};

export const calculatePolygonArea3D = (points3D) => {
  if (!points3D || points3D.length < 3) {
    console.error(
      'Invalid points3D input for calculatePolygonArea3D:',
      points3D
    );
    return 0;
  }

  // Calculate the normal of the polygon
  const v0 = new THREE.Vector3().copy(points3D[0]);
  const v1 = new THREE.Vector3().copy(points3D[1]);
  const v2 = new THREE.Vector3().copy(points3D[2]);
  const v1v0 = new THREE.Vector3().subVectors(v1, v0);
  const v2v0 = new THREE.Vector3().subVectors(v2, v0);
  const normal = new THREE.Vector3().crossVectors(v1v0, v2v0).normalize();

  // Manually get the absolute values of the normal components
  const absNormal = new THREE.Vector3(
    Math.abs(normal.x),
    Math.abs(normal.y),
    Math.abs(normal.z)
  );

  // Choose a projection plane based on the normal's absolute components
  let projection = 'XY'; // Default projection
  if (absNormal.z > absNormal.x && absNormal.z > absNormal.y) {
    projection = 'XY';
  } else if (absNormal.y > absNormal.x && absNormal.y > absNormal.z) {
    projection = 'XZ';
  } else {
    projection = 'YZ';
  }

  // Project points onto the chosen 2D plane
  const projected2D = points3D.map((p) => {
    if (projection === 'XY') {
      return { x: p.x, y: p.y };
    } else if (projection === 'XZ') {
      return { x: p.x, y: p.z };
    } else {
      return { x: p.y, y: p.z };
    }
  });

  // Calculate area using the shoelace formula
  const area = calculatePolygonArea(projected2D);
  return area;
};

const measureMultiSurfaceDistance = async ({ adjacencyData, multiPoints }) => {
  // Basic checks
  if (!isMultiShapeCompleted.current || multiPoints.length < 3) {
    alert('Need at least 3 points and a closed shape.');
    return null;
  }
  if (!adjacencyData || !adjacencyData.bvhRoot) {
    alert('No corridor adjacency data (no BVHRoot) for this surface.');
    return null;
  }

  let total = 0;

  // Loop each consecutive pair in the polygon
  for (let i = 1; i < multiPoints.length; i++) {
    const startP = multiPoints[i];
    const endP = multiPoints[(i + 1) % multiPoints.length];
    const distVal = await measureSurfaceDistanceAStarSegmentAsync(
      adjacencyData,
      startP,
      endP,
      500 // corridorWidth
    );
    if (typeof distVal === 'string' && distVal.startsWith('Error:')) {
      return null;
    }

    if (!isNaN(distVal)) {
      total += distVal;
    }
  }

  return total.toFixed(2);
};

/**
 * Measure the perimeter of the multiPoints polygon on EACH enabled surface,
 * using the adjacency for that surface. Returns an array of { surfaceId, perimeter }.
 */
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
const measureMultiSurfaceDistanceAll = async ({
  multiPoints,
  surfaceLibrary,
  setMultiSurfacePerimeters,
  spmLineProfiles,
}) => {
  if (!multiPoints || multiPoints.length < 3) {
    alert('Need at least 3 points...');
    return;
  }
  const results = [];

  spmLineProfiles.forEach((profile) => {
    const surfaceDis = calculateSurfaceDistance(profile);
    results.push({
      surfaceId: profile.surfaceId,
      perimeter: surfaceDis.toFixed(2),
    });
  });

  setMultiSurfacePerimeters(results);
};

const measureMPMSurfaceAreaAll = ({
  multiPoints,
  surfaceLibrary,
  setMultiSurfaceAreas,
}) => {
  if (!multiPoints || multiPoints.length < 3) {
    alert('Need at least 3 points to measure area.');
    return;
  }

  const results = [];
  const polyBB = computePointsBoundingBox(multiPoints);

  // Iterate over each enabled surface
  surfaceLibrary.forEach((surf) => {
    if (surf.enableValue) {
      // Find a 3DFACE or FACE entity with _object
      if (surf._object) {
        // Look up adjacency in adjacencyMapRef
        // const adjacencyData = adjacencyMapRef.current?.find(
        //   (item) => item.mesh === surf._object
        // );
        if (!surf.bvhRoot) {
          results.push({
            surfaceId: surf.surfaceName,
            area: 'No adjacency found for mesh',
          });
          return;
        }
        // const surfaceBB = adjacencyData.bvhRoot.bounds;

        if (boxesOverlap(polyBB, surf.bvhRoot.bounds)) {
          // Get mesh normal
          const normal = getMeshNormal(surf._object);
          if (!normal) {
            results.push({
              surfaceId: surf.surfaceName,
              area: 'Could not determine mesh normal',
            });
            return;
          }

          // Get coplanar point (centroid)
          const coplanarPoint = getCoplanarPoint(surf._object);
          if (!coplanarPoint || !(coplanarPoint instanceof THREE.Vector3)) {
            results.push({
              surfaceId: surf.surfaceName,
              area: 'Invalid coplanar point',
            });
            return;
          }

          // Project multiPoints onto the surface's plane
          const projectedPoints = multiPoints
            .map((p) => {
              // Ensure 'p' is a THREE.Vector3 instance
              if (!(p instanceof THREE.Vector3)) {
                console.error('Invalid point in multiPoints:', p);
                return null; // Indicate invalid projection
              }
              return projectPointOntoPlane(p, normal, coplanarPoint);
            })
            .filter((p) => p !== null); // Remove invalid projections

          // Check if any projection failed
          if (projectedPoints.length !== multiPoints.length) {
            results.push({
              surfaceId: surf.surfaceName,
              area: 'Projection failed for some points',
            });
            return;
          }

          // Calculate the area of the projected polygon
          const area = calculatePolygonArea3D(projectedPoints);

          results.push({
            surfaceId: surf.surfaceName,
            area: area.toFixed(2),
          });
        }
      }
    }
  });

  // Store the array of per-surface areas in state
  setMultiSurfaceAreas(results);
};

/**
 * Helper function to get the normal of a mesh.
 *
 * @param {THREE.Mesh} mesh
 * @returns {THREE.Vector3} normal vector
 */
const getMeshNormal = (mesh) => {
  if (!mesh.geometry.attributes.normal) {
    mesh.geometry.computeVertexNormals();
    if (!mesh.geometry.attributes.normal) {
      console.error('Mesh geometry does not have normals.');
      return null;
    }
  }

  const normal = new THREE.Vector3();
  const count = mesh.geometry.attributes.normal.count;

  for (let i = 0; i < count; i++) {
    normal.add(
      new THREE.Vector3(
        mesh.geometry.attributes.normal.getX(i),
        mesh.geometry.attributes.normal.getY(i),
        mesh.geometry.attributes.normal.getZ(i)
      )
    );
  }
  normal.divideScalar(count).normalize();

  if (normal.lengthSq() === 0) {
    console.error('Average normal is zero.');
    return null;
  }

  return normal;
};

const projectPointOntoPlane = (point, normal, coplanarPoint) => {
  // Ensure 'point' is a THREE.Vector3 instance
  let vectorPoint;
  if (point instanceof THREE.Vector3) {
    vectorPoint = point.clone();
  } else if (
    typeof point === 'object' &&
    'x' in point &&
    'y' in point &&
    'z' in point
  ) {
    vectorPoint = new THREE.Vector3(point.x, point.y, point.z);
  } else {
    console.error('Invalid point format:', point);
    return null; // Use null to indicate an invalid projection
  }

  // Ensure that 'normal' is a valid Vector3
  if (!(normal instanceof THREE.Vector3) || normal.lengthSq() === 0) {
    console.error('Invalid normal vector:', normal);
    return null; // Use null to indicate an invalid projection
  }

  // Ensure that 'coplanarPoint' is a valid Vector3
  if (!(coplanarPoint instanceof THREE.Vector3)) {
    console.error('Invalid coplanarPoint:', coplanarPoint);
    return null; // Use null to indicate an invalid projection
  }

  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
    normal,
    coplanarPoint
  );

  // Ensure the plane's normal is valid
  if (plane.normal.lengthSq() === 0) {
    console.error('Plane normal is zero.');
    return null; // Use null to indicate an invalid projection
  }

  // Manually compute the projection
  const projectedPoint = vectorPoint
    .clone()
    .sub(
      normal.clone().multiplyScalar(vectorPoint.dot(normal) + plane.constant)
    );

  return projectedPoint;
};

const getCoplanarPoint = (mesh) => {
  if (!mesh.geometry.attributes.position) return new THREE.Vector3(0, 0, 0);

  // Calculate the centroid of the mesh's vertices
  const position = mesh.geometry.attributes.position;
  const centroid = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    centroid.add(
      new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i))
    );
  }
  centroid.divideScalar(position.count);
  return centroid;
};

export const clearMultiPointLines = (scene) => {
  const objectsToRemove = scene.children.filter(
    (child) =>
      child.name === 'multiLine' ||
      child.name === 'highlightSphere' ||
      child.name === 'square' ||
      child.name === 'polygonMarkersGroup'
  );
  objectsToRemove.forEach((obj) => scene.remove(obj));
};

export const resetMultiPoint = () => {
  isMultiShapeCompleted.current = false;
  multiPointsRef.current = [];
};

export async function measureAllSurfacesDistance({
  adjacencyDataArray,
  multiPoints,
}) {
  if (!Array.isArray(adjacencyDataArray)) {
    console.warn('No adjacency array provided.');
    return '0.00';
  }

  let grandTotal = 0;

  for (const adjacencyData of adjacencyDataArray) {
    const perimeterStr = await measureMultiSurfaceDistance({
      adjacencyData,
      multiPoints,
    });

    if (perimeterStr === null) {
      // measureMultiSurfaceDistance encountered an error or returned null
      // You can skip or break. We'll just skip in this example
      console.warn('Skipping one surface due to error or no path...');
      continue;
    }

    // Convert the string to a number
    const val = parseFloat(perimeterStr);
    if (!isNaN(val)) {
      grandTotal += val;
    } else {
      console.warn(
        'Invalid numeric result from measureMultiSurfaceDistance:',
        perimeterStr
      );
    }
  }

  return grandTotal.toFixed(2);
}
