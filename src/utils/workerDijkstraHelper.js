// workerDijkstraHelper.js

import { gatherTrianglesInCorridor } from './corridorUtils';

export function findCorridorWidth(bvhRoot, startPoint, endPoint) {
  let corridorWidth = 1;
  let tries = 0;
  const maxTries = 200; // or 5, 20, etc.

  while (tries < maxTries) {
    const corridorTris = gatherTrianglesInCorridor(
      bvhRoot,
      startPoint,
      endPoint,
      corridorWidth
    );
    if (corridorTris.length > 0) {
      return corridorWidth;
    }
    corridorWidth *= 2; // double
    tries++;
  }
  // If we never found any triangles, return some fallback
  return corridorWidth;
}
export async function measureSurfaceDistanceAStar({
  adjacencyData, // has { bvhRoot, mesh }
  startPoint,
  endPoint,
  corridorWidth,
}) {
  const { bvhRoot } = adjacencyData;
  if (!bvhRoot) throw new Error('No BVH found in adjacencyData');

  // Increase corridor width
  // let corridor = findCorridorWidth(adjacencyData.bvhRoot, startPoint, endPoint);
  // 1) gather triangles
  const corridorTris = gatherTrianglesInCorridor(
    bvhRoot,
    startPoint,
    endPoint,
    corridorWidth
  );

  if (!corridorTris.length) {
    return 'No triangles in corridor -> no path possible.';
  }

  // 4) run A* worker
  const distance = await runAStarWorker(corridorTris, startPoint, endPoint);
  return distance.toFixed(2);
}
export function runAStarWorker(corridorTris, startPoint, endPoint) {
  return new Promise((resolve, reject) => {
    try {
      let worker = new Worker(
        new URL('../workers/dijkstraAStar.worker.js', import.meta.url),
        {
          type: 'module', // if needed
        }
      );

      worker.onmessage = (e) => {
        if (e.data.success) {
          worker.terminate();
          worker = null; // explicitly clear reference
          resolve(e.data.distance);
        } else {
          worker.terminate();
          worker = null; // explicitly clear reference
          reject(new Error(e.data.error));
        }
      };

      worker.onerror = (err) => {
        worker.terminate();
        worker = null; // explicitly clear reference
        reject(err);
      };

      worker.postMessage({
        corridorTris,
        startPoint,
        endPoint,
      });
    } catch (error) {
      reject(error);
    }
  });
}
// export function runAStarWorker(corridorTris, startPoint, endPoint) {
//   return new Promise((resolve, reject) => {
//     // Web Worker as a Blob
//     const workerCode = `
//       self.onmessage = (event) => {
//         const { corridorTris, startPoint, endPoint } = event.data;

//         function heuristic(a, b) {
//           return Math.sqrt(
//             Math.pow(a.x - b.x, 2) +
//             Math.pow(a.y - b.y, 2) +
//             Math.pow(a.z - b.z, 2)
//           );
//         }

//         class MinHeap {
//           constructor() { this.heap = []; }
//           push(node) {
//             this.heap.push(node);
//             this._heapifyUp(this.heap.length - 1);
//           }
//           pop() {
//             if (this.heap.length === 1) return this.heap.pop();
//             const root = this.heap[0];
//             this.heap[0] = this.heap.pop();
//             this._heapifyDown(0);
//             return root;
//           }
//           size() { return this.heap.length; }
//           _heapifyUp(index) {
//             let parent = Math.floor((index - 1) / 2);
//             while (index > 0 && this.heap[index].fscore < this.heap[parent].fscore) {
//               [this.heap[index], this.heap[parent]] = [this.heap[parent], this.heap[index]];
//               index = parent;
//               parent = Math.floor((index - 1) / 2);
//             }
//           }
//           _heapifyDown(index) {
//             const left = 2 * index + 1;
//             const right = 2 * index + 2;
//             let smallest = index;
//             if (left < this.heap.length && this.heap[left].fscore < this.heap[smallest].fscore) smallest = left;
//             if (right < this.heap.length && this.heap[right].fscore < this.heap[smallest].fscore) smallest = right;
//             if (smallest !== index) {
//               [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
//               this._heapifyDown(smallest);
//             }
//           }
//         }

//         function buildCorridorAdjacency(corridorTris) {
//           const vertices = [];
//           const vertexMap = new Map();
//           const adjList = {};

//           for (const tri of corridorTris) {
//             for (const v of [tri.vA, tri.vB, tri.vC]) {
//               const key = \`\${v.x},\${v.y},\${v.z}\`;
//               if (!vertexMap.has(key)) {
//                 const idx = vertices.length;
//                 vertices.push(v);
//                 vertexMap.set(key, idx);
//                 adjList[idx] = [];
//               }
//             }
//           }

//           for (const tri of corridorTris) {
//             const iA = vertexMap.get(\`\${tri.vA.x},\${tri.vA.y},\${tri.vA.z}\`);
//             const iB = vertexMap.get(\`\${tri.vB.x},\${tri.vB.y},\${tri.vB.z}\`);
//             const iC = vertexMap.get(\`\${tri.vC.x},\${tri.vC.y},\${tri.vC.z}\`);
//             addEdge(adjList, vertices, iA, iB);
//             addEdge(adjList, vertices, iB, iC);
//             addEdge(adjList, vertices, iC, iA);
//           }

//           return { adjList, vertices };
//         }

//         function addEdge(adjList, verts, i1, i2) {
//           const dx = verts[i2].x - verts[i1].x;
//           const dy = verts[i2].y - verts[i1].y;
//           const dz = verts[i2].z - verts[i1].z;
//           const dist3D = Math.sqrt(dx * dx + dy * dy + dz * dz);

//           if (!adjList[i1].some((e) => e.idx === i2)) {
//             adjList[i1].push({ idx: i2, dist: dist3D });
//           }
//           if (!adjList[i2].some((e) => e.idx === i1)) {
//             adjList[i2].push({ idx: i1, dist: dist3D });
//           }
//         }

//         function findClosestVertex(verts, p) {
//           let bestIdx = -1, bestDist = Infinity;
//           for (let i = 0; i < verts.length; i++) {
//             const dx = p.x - verts[i].x;
//             const dy = p.y - verts[i].y;
//             const dz = p.z - verts[i].z;
//             const distSq = dx * dx + dy * dy + dz * dz;
//             if (distSq < bestDist) {
//               bestDist = distSq;
//               bestIdx = i;
//             }
//           }
//           return bestIdx;
//         }

//         // Build adjacency graph
//         const { adjList, vertices } = buildCorridorAdjacency(corridorTris);

//         // Find closest start and end points
//         const startIdx = findClosestVertex(vertices, startPoint);
//         const endIdx = findClosestVertex(vertices, endPoint);

//         if (startIdx < 0 || endIdx < 0) {
//           self.postMessage({ success: false, error: "No corridor vertices match" });
//           return;
//         }

//         const dist = new Map();
//         dist.set(startIdx, 0);
//         const openSet = new MinHeap();
//         openSet.push({ idx: startIdx, fscore: heuristic(vertices[startIdx], vertices[endIdx]) });

//         while (openSet.size() > 0) {
//           const { idx: current } = openSet.pop();
//           if (current === endIdx) {
//             self.postMessage({ success: true, distance: dist.get(endIdx) });
//             return;
//           }
//           const currentDist = dist.get(current);
//           for (const edge of adjList[current] || []) {
//             const neighbor = edge.idx;
//             const tentativeDist = currentDist + edge.dist;
//             if (!dist.has(neighbor) || tentativeDist < dist.get(neighbor)) {
//               dist.set(neighbor, tentativeDist);
//               openSet.push({ idx: neighbor, fscore: tentativeDist + heuristic(vertices[neighbor], vertices[endIdx]) });
//             }
//           }
//         }
//         self.postMessage({ success: false, error: "No valid path found" });
//       };
//     `;

//     // Create a Blob from the worker code
//     const blob = new Blob([workerCode], { type: 'application/javascript' });
//     const worker = new Worker(URL.createObjectURL(blob));

//     worker.onmessage = (e) => {
//       if (e.data.success) {
//         resolve(e.data.distance);
//       } else {
//         reject(new Error(e.data.error));
//       }
//       worker.terminate();
//     };

//     worker.onerror = (err) => {
//       reject(err);
//     };

//     worker.postMessage({
//       corridorTris,
//       startPoint,
//       endPoint,
//     });
//   });
// }
