// geometryBuilder.worker.js
/* eslint-disable no-restricted-globals */
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils';
import { lerpColor } from '../utils/colorsUtils';

const vectorKey = (v) =>
  `${v.x.toFixed(5)}_${v.y.toFixed(5)}_${v.z.toFixed(5)}`;
function addVertexToGraph({ meshVertices, meshAdjList, vertexMap, tv }) {
  const key = vectorKey(tv);
  if (!vertexMap.has(key)) {
    const idx = meshVertices.length;
    meshVertices.push(tv.clone());
    meshAdjList.push([]);
    vertexMap.set(key, idx);
    return idx;
  }
  return vertexMap.get(key);
}

function addEdge({ meshVertices, meshAdjList, i1, i2 }) {
  const v1 = meshVertices[i1];
  const v2 = meshVertices[i2];
  const dx = v1.x - v2.x;
  const dy = v1.y - v2.y;
  const dz = v1.z - v2.z;
  const dist3D = Math.sqrt(dx * dx + dy * dy + dz * dz);

  if (!meshAdjList[i1].some((edge) => edge.idx === i2)) {
    meshAdjList[i1].push({ idx: i2, dist3D });
  }
  if (!meshAdjList[i2].some((edge) => edge.idx === i1)) {
    meshAdjList[i2].push({ idx: i1, dist3D });
  }
}

function getVec3({ meshVertices, idx }) {
  const v = meshVertices[idx];
  return [v.x, v.y, v.z];
}
// The same “parseAndBuildGeometry” logic from your code
function parseAndBuildGeometry({
  flattenToPlane,
  entities,
  surfIdx,
  surfaceRunningId,
  meshVertices,
  meshAdjList,
  vertexMap,
  globalMinZ,
  globalMaxZ,
  // breakLineEdges,
}) {
  // const mergedVertexMap = new Map(); // Map old indices to new merged indices
  // const mergedBreakLineEdges = new Set();
  vertexMap.clear();
  if (surfaceRunningId != surfIdx) {
    meshAdjList = [];
    meshVertices = [];
    // breakLineEdges.clear();
  }

  // We replicate your references in local structures

  const geom = new THREE.BufferGeometry();
  const positions = [];
  for (const entity of entities) {
    if (entity.type === '3DFACE' || entity.type === 'FACE') {
      const verts = entity.vertices;
      let indicesLocal = verts.map((v) => {
        const adjV = flattenToPlane ? { x: v.x, y: v.y, z: 0 } : v;
        const tv = new THREE.Vector3(adjV.x, adjV.y, adjV.z);
        return addVertexToGraph({ meshVertices, meshAdjList, vertexMap, tv });
      });

      // Build edges
      if (indicesLocal.length === 3) {
        addEdge({
          meshVertices,
          meshAdjList,
          i1: indicesLocal[0],
          i2: indicesLocal[1],
        });
        addEdge({
          meshVertices,
          meshAdjList,
          i1: indicesLocal[1],
          i2: indicesLocal[2],
        });
        addEdge({
          meshVertices,
          meshAdjList,
          i1: indicesLocal[2],
          i2: indicesLocal[0],
        });
      } else if (indicesLocal.length === 4) {
        addEdge({
          meshVertices,
          meshAdjList,
          i1: indicesLocal[0],
          i2: indicesLocal[1],
        });
        addEdge({
          meshVertices,
          meshAdjList,
          i1: indicesLocal[1],
          i2: indicesLocal[2],
        });
        addEdge({
          meshVertices,
          meshAdjList,
          i1: indicesLocal[2],
          i2: indicesLocal[3],
        });
        addEdge({
          meshVertices,
          meshAdjList,
          i1: indicesLocal[3],
          i2: indicesLocal[0],
        });
      }

      // Positions for geometry
      if (indicesLocal.length >= 3) {
        // first tri
        positions.push(
          ...getVec3({ meshVertices, idx: indicesLocal[0] }),
          ...getVec3({ meshVertices, idx: indicesLocal[1] }),
          ...getVec3({ meshVertices, idx: indicesLocal[2] })
        );
        // if 4 verts => second tri
        if (indicesLocal.length === 4) {
          positions.push(
            ...getVec3({ meshVertices, idx: indicesLocal[0] }),
            // ...getVec3({ meshVertices, idx: indicesLocal[1] }),
            ...getVec3({ meshVertices, idx: indicesLocal[2] }),
            ...getVec3({ meshVertices, idx: indicesLocal[3] })
          );
        }
      }
    }
  }
 
  const finalPos = new Float32Array(positions);
  geom.setAttribute('position', new THREE.BufferAttribute(finalPos, 3));
  geom.computeVertexNormals();

  // Merge vertices to optimize geometry
  const mergedGeom = mergeVertices(geom, 1e-4);
  mergedGeom.computeVertexNormals();

  let terrainMesh;

  // if (solidSurface) {
  const positionsAttr = mergedGeom.getAttribute('position');

  const colors = [];
  const bottomColor = [0, 0, 1]; // Blue
  const midColor = [0, 1, 0]; // Green
  const topColor = [1, 0, 0]; // Red

  for (let i = 0; i < positionsAttr.count; i++) {
    const z = positionsAttr.getZ(i);
    const t = (z - globalMinZ) / (globalMaxZ - globalMinZ || 1);
    let r, g, b;
    if (t < 0.5) {
      const tt = t / 0.5;
      const c = lerpColor(bottomColor, midColor, tt);
      [r, g, b] = c;
    } else {
      const tt = (t - 0.5) / 0.5;
      const c = lerpColor(midColor, topColor, tt);
      [r, g, b] = c;
    }
    colors.push(r, g, b);
  }

  const colorAttr = new THREE.Float32BufferAttribute(colors, 3);

  mergedGeom.setAttribute('color', colorAttr);
  const material = new THREE.MeshPhongMaterial({
    vertexColors: false,
    wireframe: true,
    side: THREE.DoubleSide,
  });
  terrainMesh = new THREE.Mesh(mergedGeom, material);
  return {
    mesh: terrainMesh,
  };
}
function splitEntitiesIntoChunks(entities, chunkSize = 50000) {
  const chunks = [];
  for (let i = 0; i < entities.length; i += chunkSize) {
    chunks.push(entities.slice(i, i + chunkSize));
  }
  return chunks;
}

// The same “addAllChunksToScene” logic, but in the worker => no "scene.add(...)"
function addAllChunksToWorker({
  surfIdx,
  surfaceRunningId,
  entities,
  flattenToPlane,
}) {
  let meshVertices = [];
  let meshAdjList = [];
  let vertexMap = new Map();

  if (surfaceRunningId != surfIdx) {
    meshVertices = [];
    meshAdjList = [];
  }
  let globalMinZ = Infinity;
  let globalMaxZ = -Infinity;
  // For each chunk, for each entity vertex:
  for (const entity of entities) {
    for (const v of entity.vertices) {
      const zVal = v.z;
      if (zVal < globalMinZ) globalMinZ = zVal;
      if (zVal > globalMaxZ) globalMaxZ = zVal;
    }
  }
  // 1) split
  const chunked = splitEntitiesIntoChunks(entities, 50000);
  const geometries = [];

  // Process each chunk, parse, build geometry
  for (let i = 0; i < chunked.length; i++) {
    const chunk = chunked[i];

    // parse chunk => partial geometry
    const { mesh } = parseAndBuildGeometry({
      flattenToPlane,
      entities: chunk,
      surfIdx,
      surfaceRunningId,
      meshVertices,
      meshAdjList,
      vertexMap,
      globalMinZ,
      globalMaxZ,
    });

    if (mesh && mesh.geometry) {
      geometries.push(mesh.geometry);
    }

    // 2) Post progress
    // e.g. after each chunk, approximate progress
    const progress = Math.floor(((i + 1) / chunked.length) * 100);
    self.postMessage({ progress });
  }
  return {
    geometries,
  };
}

// Worker onmessage => do entire chunk build + adjacency + BVH, then post results
self.onmessage = (evt) => {
  let { surfIdx, surfaceRunningId, entities, flattenToPlane, chunkSize } =
    evt.data;
  try {
    const result = addAllChunksToWorker({
      surfIdx,
      surfaceRunningId,
      entities,
      flattenToPlane,
      chunkSize,
    });
    if (!result) {
      self.postMessage({
        success: true,
        data: null,
        message: 'No geometry or 0 triangles',
      });
      return;
    }
    const { geometries } = result;

    self.postMessage({
      success: true,
      data: {
        geometries,
      },
    }); // transfer
  } catch (err) {
    self.postMessage({
      success: false,
      error: err.message,
    });
  }
};
