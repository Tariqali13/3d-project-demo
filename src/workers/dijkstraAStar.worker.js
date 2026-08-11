// dijkstraAStar.worker.js
/* eslint-disable no-restricted-globals */

// event.data = { adjList, startIdx, endIdx, vertices, endPos }

import { buildCorridorAdjacency } from '../utils/corridorUtils';
self.onmessage = (event) => {
  const { corridorTris, startPoint, endPoint } = event.data;
  // 2) build adjacency
  const { adjList, vertices } = buildCorridorAdjacency(corridorTris);

  // 3) find closest corridor vertices
  const startIdx = findClosestVertexInCorridor(vertices, startPoint);
  const endIdx = findClosestVertexInCorridor(vertices, endPoint);
  const endPos = vertices[endIdx];

  if (startIdx < 0 || endIdx < 0) {
    return 'No corridor vertices match for start or end.';
  }

  // Basic checks ...
  const dist = new Map();
  dist.set(startIdx, 0);

  const openSet = new MinHeap();
  const hStart = heuristic(vertices[startIdx], endPos);
  openSet.push({ idx: startIdx, fscore: hStart });

  while (openSet.size() > 0) {
    const { idx: current } = openSet.pop();
    if (current === endIdx) {
      self.postMessage({ success: true, distance: dist.get(endIdx) });
      return;
    }
    const currentDist = dist.get(current);

    for (const edge of adjList[current] || []) {
      const neighbor = edge.idx;
      // cost = currentDist + edge.dist (the 3D distance)
      const tentativeDist = currentDist + edge.dist;

      if (!dist.has(neighbor) || tentativeDist < dist.get(neighbor)) {
        dist.set(neighbor, tentativeDist);
        const f = tentativeDist + heuristic(vertices[neighbor], endPos);
        openSet.push({ idx: neighbor, fscore: f });
      }
    }
  }

  self.postMessage({ success: false, error: 'No valid path found' });
};

function heuristic(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// MinHeap for A*
class MinHeap {
  constructor() {
    this.heap = [];
  }
  push(node) {
    this.heap.push(node);
    this._heapifyUp(this.heap.length - 1);
  }
  pop() {
    if (this.heap.length === 1) return this.heap.pop();
    const root = this.heap[0];
    this.heap[0] = this.heap.pop();
    this._heapifyDown(0);
    return root;
  }
  size() {
    return this.heap.length;
  }
  _heapifyUp(index) {
    let parent = Math.floor((index - 1) / 2);
    while (index > 0 && this.heap[index].fscore < this.heap[parent].fscore) {
      [this.heap[index], this.heap[parent]] = [
        this.heap[parent],
        this.heap[index],
      ];
      index = parent;
      parent = Math.floor((index - 1) / 2);
    }
  }
  _heapifyDown(index) {
    const left = 2 * index + 1;
    const right = 2 * index + 2;
    let smallest = index;

    if (
      left < this.heap.length &&
      this.heap[left].fscore < this.heap[smallest].fscore
    ) {
      smallest = left;
    }
    if (
      right < this.heap.length &&
      this.heap[right].fscore < this.heap[smallest].fscore
    ) {
      smallest = right;
    }
    if (smallest !== index) {
      [this.heap[index], this.heap[smallest]] = [
        this.heap[smallest],
        this.heap[index],
      ];
      this._heapifyDown(smallest);
    }
  }
}

function findClosestVertexInCorridor(verts, p) {
  let best = -1,
    bestDist = Infinity;
  for (let i = 0; i < verts.length; i++) {
    const dx = p.x - verts[i].x;
    const dy = p.y - verts[i].y;
    const dz = p.z - verts[i].z;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq < bestDist) {
      bestDist = distSq;
      best = i;
    }
  }
  return best;
}