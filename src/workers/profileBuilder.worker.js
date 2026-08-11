import * as THREE from 'three';
/* eslint-disable no-restricted-globals */

// Constants for chunking and memory management
const NODE_CHUNK_SIZE = 1000;
const TRI_SUBCHUNK_SIZE = 500;
const SOFT_MEMORY_LIMIT = 1.4 * 1024 * 1024 * 1024;
const MAX_STACK_SIZE = 100000;
const PROGRESS_UPDATE_INTERVAL_MS = 500;

// Utility Functions (Existing)
function distancePointToSegment2D(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const segLenSq = dx * dx + dy * dy;
  if (segLenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / segLenSq)
  );
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

function distancePointToSegment3D(p, start, end) {
  const sx = end.x - start.x;
  const sy = end.y - start.y;
  const sz = end.z - start.z;
  const segLenSq = sx * sx + sy * sy + sz * sz;

  if (segLenSq === 0) {
    return Math.hypot(p.x - start.x, p.y - start.y, p.z - start.z);
  }

  const px = p.x - start.x;
  const py = p.y - start.y;
  const pz = p.z - start.z;
  const t = Math.max(0, Math.min(1, (px * sx + py * sy + pz * sz) / segLenSq));

  const projx = start.x + t * sx;
  const projy = start.y + t * sy;
  const projz = start.z + t * sz;

  return Math.hypot(p.x - projx, p.y - projy, p.z - projz);
}

function triDistanceCheck(tri, startP, endP) {
  const dA = distancePointToSegment3D(tri.vA, startP, endP);
  const dB = distancePointToSegment3D(tri.vB, startP, endP);
  const dC = distancePointToSegment3D(tri.vC, startP, endP);
  return Math.min(dA, dB, dC);
}

function corridorBoundingBox(startP, endP, w) {
  return {
    min: {
      x: Math.min(startP.x, endP.x) - w,
      y: Math.min(startP.y, endP.y) - w,
      z: -Infinity,
    },
    max: {
      x: Math.max(startP.x, endP.x) + w,
      y: Math.max(startP.y, endP.y) + w,
      z: Infinity,
    },
  };
}

function boxIntersectsCorridor(bounds, startP, endP, width) {
  const corridorBB = corridorBoundingBox(startP, endP, width);
  return !(
    bounds.max.x < corridorBB.min.x ||
    bounds.min.x > corridorBB.max.x ||
    bounds.max.y < corridorBB.min.y ||
    bounds.min.y > corridorBB.max.y
  );
}

function intersectSegments2D(p1, p2, e1, e2) {
  const A = p1,
    B = p2,
    C = e1,
    D = e2;
  const denom = (B.x - A.x) * (D.y - C.y) - (B.y - A.y) * (D.x - C.x);

  if (Math.abs(denom) < 1e-6) return null; // Adjust from 1e-12 to 1e-6

  const t = ((A.y - C.y) * (D.x - C.x) - (A.x - C.x) * (D.y - C.y)) / denom;
  const u = ((A.y - C.y) * (B.x - A.x) - (A.x - C.x) * (B.y - A.y)) / denom;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return { x: A.x + t * (B.x - A.x), y: A.y + t * (B.y - A.y), t };
  }

  return null;
}

function computePlaneNormal(a, b, c) {
  const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const v = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };

  const nx = u.y * v.z - u.z * v.y;
  const ny = u.z * v.x - u.x * v.z;
  const nz = u.x * v.y - u.y * v.x;

  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-12) return null;

  return { x: nx / len, y: ny / len, z: nz / len };
}

function pointInTriangle(a, b, c, p) {
  const v0 = { x: c.x - a.x, y: c.y - a.y };
  const v1 = { x: b.x - a.x, y: b.y - a.y };
  const v2 = { x: p.x - a.x, y: p.y - a.y };

  const dot00 = v0.x * v0.x + v0.y * v0.y;
  const dot01 = v0.x * v1.x + v0.y * v1.y;
  const dot02 = v0.x * v2.x + v0.y * v2.y;
  const dot11 = v1.x * v1.x + v1.y * v1.y;
  const dot12 = v1.x * v2.x + v1.y * v2.y;

  const invDenom = 1 / (dot00 * dot11 - dot01 * dot01);
  const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
  const v = (dot00 * dot12 - dot01 * dot02) * invDenom;
  return u >= 0 && v >= 0 && u + v <= 1.0001; // Add tolerance
  // return u >= 0 && v >= 0 && u + v <= 1;
}

function intersectSegmentTriangle(start, dir, tri, recordAll = false) {
  const [vA, vB, vC] = tri;
  const N = computePlaneNormal(vA, vB, vC);
  if (!N) return null;

  const D = -(N.x * vA.x + N.y * vA.y + N.z * vA.z);
  const denom = N.x * dir.x + N.y * dir.y + N.z * dir.z;

  if (Math.abs(denom) < 1e-6) return null; // Adjust from 1e-12 to 1e-6

  const numer = -(N.x * start.x + N.y * start.y + N.z * start.z + D);
  const t = numer / denom;

  if (t < 0 || t > 1) return null;

  const intPt = {
    x: start.x + t * dir.x,
    y: start.y + t * dir.y,
    z: start.z + t * dir.z,
  };

  if (recordAll) {
    return { intPt, t, normal: N, D };
  }

  if (!pointInTriangle(vA, vB, vC, intPt)) return null;

  return { intPt, t };
}

function intersectLineWithAABB(startPoint, endPoint, bounds) {
  const dx = endPoint.x - startPoint.x;
  const dy = endPoint.y - startPoint.y;
  let tMin = 0;
  let tMax = 1;

  const { min, max } = bounds;

  const tX1 = (min.x - startPoint.x) / (dx || 1e-10);
  const tX2 = (max.x - startPoint.x) / (dx || 1e-10);
  const tY1 = (min.y - startPoint.y) / (dy || 1e-10);
  const tY2 = (max.y - startPoint.y) / (dy || 1e-10);

  const tMinX = Math.min(tX1, tX2);
  const tMaxX = Math.max(tX1, tX2);
  const tMinY = Math.min(tY1, tY2);
  const tMaxY = Math.max(tY1, tY2);

  tMin = Math.max(tMin, tMinX, tMinY);
  tMax = Math.min(tMax, tMaxX, tMaxY);

  if (tMin > tMax || tMax < 0 || tMin > 1) {
    return { tMin: 0, tMax: 1, intersects: false };
  }

  return { tMin: Math.max(0, tMin), tMax: Math.min(1, tMax), intersects: true };
}

function isPointWithinBoundsForLastEntry(point, bounds) {
  return (
    point.x >= bounds.min.x &&
    point.x <= bounds.max.x &&
    point.y >= bounds.min.y &&
    point.y <= bounds.max.y &&
    point.z >= bounds.min.z &&
    point.z <= bounds.max.z
  );
}

function isPointWithinBounds(point, bounds) {
  return (
    point.x >= bounds.min.x &&
    point.x <= bounds.max.x &&
    point.y >= bounds.min.y &&
    point.y <= bounds.max.y
  );
}

function intersectSegmentWithTriangleEdges(
  start,
  dir,
  total2D,
  tri,
  startPoint
) {
  const edges = [
    [tri[0], tri[1]],
    [tri[1], tri[2]],
    [tri[2], tri[0]],
  ];
  const intersections = [];

  for (const [v1, v2] of edges) {
    const p1 = { x: startPoint.x, y: startPoint.y };
    const p2 = { x: startPoint.x + dir.x, y: startPoint.y + dir.y };
    const e1 = { x: v1.x, y: v1.y };
    const e2 = { x: v2.x, y: v2.y };

    const res = intersectSegments2D(p1, p2, e1, e2);
    if (res) {
      const t = res.t;
      const z =
        v1.z + ((v2.z - v1.z) * (res.x - v1.x)) / (v2.x - v1.x || 1e-10);
      const dist2D = t * total2D;
      intersections.push({ dist2D, z, x: res.x, y: res.y, isEdge: true, t });
    }
  }

  return intersections;
}

class IntersectionAccumulator {
  constructor(bounds) {
    this.intersections = [];
    this.intersectionMap = new Map();
    this.epsilon = 0.5;
    this.bounds = bounds;
  }

  addIntersection(
    startPoint,
    intPt,
    isBreakLine = false,
    isEdge = false,
    isPlane = false
  ) {
    // Relax bounds check for points very close to the end
    if (!isPointWithinBounds(intPt, this.bounds)) {
      const dx = intPt.x - startPoint.x;
      const dy = intPt.y - startPoint.y;
      const dist2D = Math.hypot(dx, dy);
      const totalDist = Math.hypot(
        this.bounds.max.x - this.bounds.min.x,
        this.bounds.max.y - this.bounds.min.y
      );
      if (dist2D >= totalDist * 0.99) {
        // Allow points near the end
        intPt.x = Math.min(
          Math.max(intPt.x, this.bounds.min.x),
          this.bounds.max.x
        );
        intPt.y = Math.min(
          Math.max(intPt.y, this.bounds.min.y),
          this.bounds.max.y
        );
      } else {
        return;
      }
    }

    const dx = intPt.x - startPoint.x;
    const dy = intPt.y - startPoint.y;
    const dist2D = Math.hypot(dx, dy);
    const roundedDist = Math.round(dist2D * 1000) / 1000;
    const key = roundedDist.toFixed(3);

    if (this.intersectionMap.has(key)) {
      const existing = this.intersectionMap.get(key);
      if (Math.abs(existing.z - intPt.z) < 1)
        existing.z = (existing.z + intPt.z) * 0.5;
      existing.isBreakLine = existing.isBreakLine || isBreakLine;
      existing.isEdge = existing.isEdge || isEdge;
      existing.isPlane = existing.isPlane || isPlane;
      return;
    }

    const newIntersection = {
      dist2D: roundedDist,
      z: intPt.z,
      x: intPt.x,
      y: intPt.y,
      isBreakLine,
      isEdge,
      isPlane,
    };
    this.intersections.push(newIntersection);
    this.intersectionMap.set(key, newIntersection);
  }
}

function buildGraphFromIntersections(
  intersections,
  startPoint,
  endPoint,
  bounds
) {
  intersections.sort((a, b) => a.dist2D - b.dist2D);

  const { tMin, tMax, intersects } = intersectLineWithAABB(
    startPoint,
    endPoint,
    bounds
  );
  if (!intersects) return { vertices: [], edges: [] };

  const dx = endPoint.x - startPoint.x;
  const dy = endPoint.y - startPoint.y;
  const dz = endPoint.z - startPoint.z;
  const total2D = Math.hypot(dx, dy);

  const entryPoint = {
    x: startPoint.x + tMin * dx,
    y: startPoint.y + tMin * dy,
    z: startPoint.z + tMin * dz,
    dist2D: tMin * total2D,
    isBreakLine: false,
    isEdge: false,
    isPlane: false,
  };
  let exitPoint = {
    x: startPoint.x + tMax * dx,
    y: startPoint.y + tMax * dy,
    z: startPoint.z + tMax * dz,
    dist2D: tMax * total2D,
    isBreakLine: false,
    isEdge: false,
    isPlane: false,
  };

  const allPoints = [];
  if (
    isPointWithinBoundsForLastEntry(entryPoint, bounds) &&
    (intersections.length === 0 ||
      intersections[0].dist2D > entryPoint.dist2D + 0.001)
  )
    allPoints.push(entryPoint);
  allPoints.push(...intersections);

  // Check for the last intersection to adjust the exit point's Z value
  let lastIntersection =
    intersections.length > 0 ? intersections[intersections.length - 1] : null;
  if (
    lastIntersection &&
    Math.abs(lastIntersection.dist2D - exitPoint.dist2D) < 0.1
  ) {
    // Relaxed threshold
    exitPoint.z = lastIntersection.z; // Use the Z value from the last intersection
  }

  // Always add the exit point if within bounds, or update the last point's Z
  const lastPoint = allPoints[allPoints.length - 1];
  if (isPointWithinBoundsForLastEntry(exitPoint, bounds)) {
    if (!lastPoint || Math.abs(lastPoint.dist2D - exitPoint.dist2D) > 0.01) {
      // Relaxed threshold
      allPoints.push(exitPoint);
    } else {
      // Update the last point's Z value to match the exit point's corrected Z
      allPoints[allPoints.length - 1].z = exitPoint.z;
    }
  }

  const vertices = allPoints.map((point, idx) => ({
    idx,
    x: point.x,
    y: point.y,
    z: point.z,
    dist2D: point.dist2D,
    isBreakLine: point.isBreakLine,
    isEdge: point.isEdge,
    isPlane: point.isPlane,
  }));
  const edges = [];
  for (let i = 0; i < vertices.length - 1; i++) {
    const v1 = vertices[i];
    const v2 = vertices[i + 1];
    const dist3D = Math.hypot(v2.x - v1.x, v2.y - v1.y, v2.z - v1.z);
    edges.push({ from: v1.idx, to: v2.idx, dist3D });
  }

  return { vertices, edges };
}
// Optimized gatherCorridorTrianglesStream
async function gatherCorridorTrianglesStream({
  bvhRoot,
  startPoint,
  endPoint,
  corridorWidth,
  onTriangle,
  chunkSize = 20000,
  postProgress = null,
  startTime,
}) {
  if (!bvhRoot) return;

  const stack = [];
  const processedNodesSet = new Set();
  const relevantNodes = new Set();
  let processedTriangles = 0;
  let totalTriangleEstimate = 0;
  let lastProgressUpdate = Date.now();

  // Compute line segment intersection with BVH bounds
  const { tMin, tMax, intersects } = intersectLineWithAABB(
    startPoint,
    endPoint,
    bvhRoot.bounds
  );
  if (!intersects) return { processedTriangles, triangleIntersections: [] };

  const dx = endPoint.x - startPoint.x;
  const dy = endPoint.y - startPoint.y;
  const dz = endPoint.z - startPoint.z;
  const entryPoint = {
    x: startPoint.x + tMin * dx,
    y: startPoint.y + tMin * dy,
    z: startPoint.z + tMin * dz,
  };
  const exitPoint = {
    x: startPoint.x + tMax * dx,
    y: startPoint.y + tMax * dy,
    z: startPoint.z + tMax * dz,
  };

  // Recursive function to collect relevant BVH nodes
  function collectRelevantNodes(node) {
    if (!node || processedNodesSet.has(node)) return;

    const nodeIntersects = intersectLineWithAABB(
      entryPoint,
      exitPoint,
      node.bounds
    ).intersects;
    if (nodeIntersects) {
      if (node.isLeaf) {
        relevantNodes.add(node);
      } else {
        if (node.left) collectRelevantNodes(node.left);
        if (node.right) collectRelevantNodes(node.right);
      }
    }
  }

  // Start with the root node
  collectRelevantNodes(bvhRoot);

  // Estimate total triangles from relevant nodes
  if (postProgress && relevantNodes.size > 0) {
    for (const node of relevantNodes) {
      if (node.isLeaf) totalTriangleEstimate += node.triangles?.length || 0;
    }
    postProgress({
      phase: 'triangles',
      processed: 0,
      total: totalTriangleEstimate,
      progress: 0,
      startTime,
    });
  }

  const triangleIntersections = [];

  // Process only relevant nodes
  for (const node of relevantNodes) {
    if (node.isLeaf) {
      const triangles = node.triangles || [];
      for (let i = 0; i < triangles.length; i += TRI_SUBCHUNK_SIZE) {
        const subChunkEnd = Math.min(i + TRI_SUBCHUNK_SIZE, triangles.length);
        for (let j = i; j < subChunkEnd; j++) {
          const tri = triangles[j];
          if (triDistanceCheck(tri, startPoint, endPoint) <= corridorWidth) {
            await onTriangle(tri, j, triangles, triangleIntersections);
            processedTriangles++;

            if (processedTriangles % TRI_SUBCHUNK_SIZE === 0 && postProgress) {
              const progress = Math.min(
                1,
                processedTriangles / totalTriangleEstimate || 0
              );
              postProgress({
                phase: 'triangles',
                processed: processedTriangles,
                total: totalTriangleEstimate,
                progress: progress * 0.7,
                startTime,
              });
            }
          }
        }
      }
      node.triangles = null; // Free memory
    }

    const now = Date.now();
    if (
      postProgress &&
      now - lastProgressUpdate > PROGRESS_UPDATE_INTERVAL_MS
    ) {
      const progress = Math.min(
        1,
        processedTriangles / totalTriangleEstimate || 0
      );
      postProgress({
        phase: 'triangles',
        processed: processedTriangles,
        total: totalTriangleEstimate,
        progress: progress * 0.7,
        startTime,
      });
      lastProgressUpdate = now;
    }

    if (self.performance && self.performance.memory) {
      const memoryUsage = self.performance.memory.usedJSHeapSize;
      if (memoryUsage > SOFT_MEMORY_LIMIT) {
        console.warn(
          'Memory limit exceeded:',
          memoryUsage / (1024 * 1024),
          'MB'
        );
        return { cancelled: true, memoryLimitReached: true };
      }
    }
  }

  if (postProgress) {
    postProgress({
      phase: 'triangles',
      processed: processedTriangles,
      total: totalTriangleEstimate,
      progress: 0.7,
      startTime,
    });
  }

  return { processedTriangles, triangleIntersections };
}

function sampleSurfaceElevation(
  startPoint,
  endPoint,
  bvhRoot,
  total2D,
  accumulator,
  breakLineEdges
) {
  const stepSize = total2D / 50; // Sample every ~0.02m (50 samples over 1m)
  const dx = endPoint.x - startPoint.x;
  const dy = endPoint.y - startPoint.y;
  const dz = endPoint.z - startPoint.z;

  function findTrianglesAndBounds(node, samplePt) {
    if (!node) return { triangles: [], bounds: null };

    const withinBoundsXY =
      samplePt.x >= node.bounds.min.x &&
      samplePt.x <= node.bounds.max.x &&
      samplePt.y >= node.bounds.min.y &&
      samplePt.y <= node.bounds.max.y;
    if (!withinBoundsXY) {
      return { triangles: [], bounds: null };
    }

    if (node.isLeaf) {
      return { triangles: node.triangles || [], bounds: node.bounds };
    }
    const left = findTrianglesAndBounds(node.left, samplePt);
    const right = findTrianglesAndBounds(node.right, samplePt);
    const triangles = [...left.triangles, ...right.triangles];
    const bounds = left.bounds || right.bounds || node.bounds;
    return { triangles, bounds };
  }

  // Track the first and last points within bounds
  let firstPointWithinBounds = null;
  let lastPointWithinBounds = null;
  let hasBreaklineOrEdge = false;
  let hasIntersection = false;

  // Check for breaklines and edges at each sample point
  for (let dist2D = 0; dist2D <= total2D; dist2D += stepSize) {
    const t = dist2D / total2D;
    const samplePt = {
      x: startPoint.x + t * dx,
      y: startPoint.y + t * dy,
      z: startPoint.z + t * dz,
    };

    const { triangles, bounds } = findTrianglesAndBounds(bvhRoot, samplePt);
    if (!bounds) continue;

    // Check if the sample point lies on a breakline or edge
    let isBreaklineOrEdge = false;
    if (breakLineEdges && breakLineEdges.length > 0) {
      for (const edge of breakLineEdges) {
        const edgeStart = edge.start;
        const edgeEnd = edge.end;
        const closestPoint = closestPointOnSegment(
          samplePt,
          edgeStart,
          edgeEnd
        );
        const distanceToEdge = Math.hypot(
          samplePt.x - closestPoint.x,
          samplePt.y - closestPoint.y
        );
        if (distanceToEdge < 1e-3) {
          // Small threshold to consider the point on the edge
          isBreaklineOrEdge = true;
          hasBreaklineOrEdge = true;
          break;
        }
      }
    }

    if (
      samplePt.x >= bounds.min.x &&
      samplePt.x <= bounds.max.x &&
      samplePt.y >= bounds.min.y &&
      samplePt.y <= bounds.max.y
    ) {
      let projectedZ;
      if (triangles.length > 0) {
        const tri = triangles[0];
        const [vA, vB, vC] = [tri.vA, tri.vB, tri.vC];
        const normal = computePlaneNormal(vA, vB, vC);
        if (!normal) continue;

        const D = -(normal.x * vA.x + normal.y * vA.y + normal.z * vA.z);
        if (Math.abs(normal.z) < 1e-6) continue;
        projectedZ =
          -(normal.x * samplePt.x + normal.y * samplePt.y + D) / normal.z;
      } else {
        if (bounds.min.z === bounds.max.z) {
          projectedZ = bounds.min.z;
        } else {
          continue;
        }
      }

      const projectedPt = { x: samplePt.x, y: samplePt.y, z: projectedZ };

      // Update first and last points within bounds
      if (!firstPointWithinBounds) {
        firstPointWithinBounds = { dist2D, point: projectedPt };
      }
      lastPointWithinBounds = { dist2D, point: projectedPt };

      // Check for intersections (e.g., segment crosses triangle edge)
      let isIntersection = false;
      for (const tri of triangles) {
        const [vA, vB, vC] = [tri.vA, tri.vB, tri.vC];
        const normal = computePlaneNormal(vA, vB, vC);
        if (!normal) continue;

        const D = -(normal.x * vA.x + normal.y * vA.y + normal.z * vA.z);
        const denom = normal.x * dx + normal.y * dy + normal.z * dz;

        if (Math.abs(denom) >= 1e-6) {
          // Segment intersects the plane
          const tIntersect =
            -(
              normal.x * startPoint.x +
              normal.y * startPoint.y +
              normal.z * startPoint.z +
              D
            ) / denom;
          if (tIntersect >= 0 && tIntersect <= 1) {
            const intersectPt = {
              x: startPoint.x + tIntersect * dx,
              y: startPoint.y + tIntersect * dy,
              z: startPoint.z + tIntersect * dz,
            };
            if (pointInTriangle(vA, vB, vC, intersectPt)) {
              isIntersection = true;
              hasIntersection = true;
              break;
            }
          }
        }
      }

      // Add point if it's a breakline/edge or intersection
      if (isBreaklineOrEdge || isIntersection) {
        const roundedDist = Math.round(dist2D * 1000) / 1000;
        const key = roundedDist.toFixed(3);
        if (!accumulator.intersectionMap.has(key)) {
          accumulator.addIntersection(
            startPoint,
            projectedPt,
            false,
            false,
            true
          );
        }
      }
    }
  }

  // If no breaklines, edges, or intersections, add only the start and end points within bounds
  if (
    !hasBreaklineOrEdge &&
    !hasIntersection &&
    firstPointWithinBounds &&
    lastPointWithinBounds
  ) {
    const startDist = firstPointWithinBounds.dist2D;
    const endDist = lastPointWithinBounds.dist2D;

    const startKey = (Math.round(startDist * 1000) / 1000).toFixed(3);
    if (!accumulator.intersectionMap.has(startKey)) {
      accumulator.addIntersection(
        startPoint,
        firstPointWithinBounds.point,
        false,
        false,
        true
      );
    }

    if (endDist !== startDist) {
      // Avoid duplicating if start and end are the same
      const endKey = (Math.round(endDist * 1000) / 1000).toFixed(3);
      if (!accumulator.intersectionMap.has(endKey)) {
        accumulator.addIntersection(
          startPoint,
          lastPointWithinBounds.point,
          false,
          false,
          true
        );
      }
    }
  }
}

// Helper function to find the closest point on a line segment
function closestPointOnSegment(point, segStart, segEnd) {
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return segStart;

  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) /
        lengthSquared
    )
  );
  return {
    x: segStart.x + t * dx,
    y: segStart.y + t * dy,
  };
}
// Main worker message handler
self.onmessage = async (evt) => {
  const startTime = Date.now();
  let lastPostedProgressPercent = 0;
  try {
    const { bvhRoot, startPoint, endPoint, breakLineEdges, options } = evt.data;
    const corridorWidth = options?.corridorWidth || 500; // Increased as per previous fix
    const chunkSize = options?.chunkSize || 10000;

    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const dz = endPoint.z - startPoint.z;
    const total2D = Math.hypot(dx, dy);
    const segDir = { x: dx, y: dy, z: dz };

    const bounds = bvhRoot?.bounds || {
      min: { x: -Infinity, y: -Infinity, z: -Infinity },
      max: { x: Infinity, y: Infinity, z: Infinity },
    };
    const accumulator = new IntersectionAccumulator(bounds);

    async function onTriangle(tri, idx, totalTriangle, triangleIntersections) {
      const [vA, vB, vC] = [tri.vA, tri.vB, tri.vC];
      const result = intersectSegmentTriangle(startPoint, segDir, [vA, vB, vC]);
      if (result) {
        accumulator.addIntersection(startPoint, result.intPt);
      }

      const planeResult = intersectSegmentTriangle(
        startPoint,
        segDir,
        [vA, vB, vC],
        true
      );
      if (planeResult)
        triangleIntersections.push({
          t: planeResult.t,
          normal: planeResult.normal,
          D: planeResult.D,
          tri: [vA, vB, vC],
        });

      const edgeIntersections = intersectSegmentWithTriangleEdges(
        startPoint,
        segDir,
        total2D,
        [vA, vB, vC],
        startPoint
      );
      edgeIntersections.forEach((edgeInt) =>
        accumulator.addIntersection(startPoint, edgeInt, false, true)
      );
    }
    function postProgress(progressData) {
      const clampedProgress = Math.min(progressData.progress, 1);
      const percent = Math.floor(clampedProgress * 100);
      const roundedPercent = Math.floor(percent / 10) * 10; // Round down to nearest 10%

      if (roundedPercent <= lastPostedProgressPercent || roundedPercent === 0)
        return;

      lastPostedProgressPercent = roundedPercent;

      self.postMessage({
        type: 'progress',
        progress: roundedPercent / 100, // Send as decimal (0.1, 0.2, ..., 1.0)
        details: {
          phase: progressData.phase,
          processed: progressData.processed,
          total: progressData.total,
          elapsedTime: (Date.now() - startTime) / 1000,
        },
      });
    }
    // Phase 1: Gather triangles (0% - 70%)
    const gatherResult = await gatherCorridorTrianglesStream({
      bvhRoot,
      startPoint,
      endPoint,
      corridorWidth,
      onTriangle,
      chunkSize: Math.min(chunkSize, 20000),
      postProgress,
      startTime,
    });

    if (gatherResult && gatherResult.cancelled) {
      self.postMessage({
        type: 'cancelled',
        reason: gatherResult.memoryLimitReached ? 'memory_limit' : 'user_abort',
      });
      return;
    }

    // Phase 1.5: Sample surface elevation for flat planes
    sampleSurfaceElevation(startPoint, endPoint, bvhRoot, total2D, accumulator);

    // Phase 2: Process coplanar regions and sampling (70% - 90%)
    const triangleIntersections = gatherResult.triangleIntersections;
    triangleIntersections.sort((a, b) => a.t - b.t);

    let currentPlane = null;
    let planeStartT = null;
    let planeEndT = null;
    const planarRegions = [];
    const totalSteps =
      triangleIntersections.length + (breakLineEdges?.length || 0) + 1;
    let processedSteps = 0;

    for (let i = 0; i < triangleIntersections.length; i++) {
      const { t, normal, D, tri } = triangleIntersections[i];
      if (!currentPlane) {
        currentPlane = { normal, D };
        planeStartT = t;
        planeEndT = t;
      } else {
        const isCoplanar =
          Math.abs(normal.x - currentPlane.normal.x) < 1e-4 &&
          Math.abs(normal.y - currentPlane.normal.y) < 1e-4 &&
          Math.abs(normal.z - currentPlane.normal.z) < 1e-4 &&
          Math.abs(D - currentPlane.D) < 1e-4;
        if (isCoplanar) planeEndT = t;
        else {
          planarRegions.push({
            startT: planeStartT,
            endT: planeEndT,
            normal: currentPlane.normal,
            D: currentPlane.D,
          });
          currentPlane = { normal, D };
          planeStartT = t;
          planeEndT = t;
        }
      }
      processedSteps++;
      if (processedSteps % 100 === 0) {
        postProgress({
          phase: 'planar',
          processed: processedSteps,
          total: totalSteps,
          progress: 0.7 + (processedSteps / totalSteps) * 0.2,
          startTime,
        });
      }
    }

    if (currentPlane)
      planarRegions.push({
        startT: planeStartT,
        endT: planeEndT,
        normal: currentPlane.normal,
        D: currentPlane.D,
      });

    for (let i = 0; i < planarRegions.length; i++) {
      const { startT, endT, normal, D } = planarRegions[i];
      const stepSize = total2D / 50;
      let currentT = startT;
      while (currentT <= endT) {
        const samplePt = {
          x: startPoint.x + currentT * segDir.x,
          y: startPoint.y + currentT * segDir.y,
          z: startPoint.z + currentT * segDir.z,
        };
        let isWithinTriangle = false;
        for (const triInt of triangleIntersections) {
          if (
            triInt.t >= startT &&
            triInt.t <= endT &&
            Math.abs(triInt.normal.x - normal.x) < 1e-4 &&
            Math.abs(triInt.normal.y - normal.y) < 1e-4 &&
            Math.abs(triInt.normal.z - normal.z) < 1e-4 &&
            Math.abs(triInt.D - D) < 1e-4
          ) {
            if (
              pointInTriangle(
                triInt.tri[0],
                triInt.tri[1],
                triInt.tri[2],
                samplePt
              )
            ) {
              isWithinTriangle = true;
              break;
            }
          }
        }
        if (isWithinTriangle) {
          const sampleDist2D = currentT * total2D;
          const sampleRoundedDist = Math.round(sampleDist2D * 1000) / 1000;
          const sampleKey = sampleRoundedDist.toFixed(3);
          if (!accumulator.intersectionMap.has(sampleKey))
            accumulator.addIntersection(
              startPoint,
              samplePt,
              false,
              false,
              true
            );
        }
        currentT += stepSize / total2D;
        processedSteps++;
        if (processedSteps % 100 === 0) {
          postProgress({
            phase: 'planar',
            processed: processedSteps,
            total: totalSteps,
            progress: 0.7 + (processedSteps / totalSteps) * 0.2,
            startTime,
          });
        }
      }
    }

    // Phase 3: Break lines and graph building (90% - 100%)
    if (Array.isArray(breakLineEdges) && breakLineEdges.length > 0) {
      const p1 = { x: startPoint.x, y: startPoint.y };
      const p2 = { x: endPoint.x, y: endPoint.y };
      for (let i = 0; i < breakLineEdges.length; i++) {
        const edge = breakLineEdges[i];
        const { v1, v2 } = edge;
        if (!v1 || !v2) continue;
        const s1 = { x: v1.x, y: v1.y };
        const s2 = { x: v2.x, y: v2.y };
        const res = intersectSegments2D(p1, p2, s1, s2);
        if (res) {
          const zEdge = v1.z + res.t * (v2.z - v1.z);
          accumulator.addIntersection(
            startPoint,
            { x: res.x, y: res.y, z: zEdge },
            true
          );
        }
        processedSteps++;
        if (processedSteps % 10 === 0) {
          postProgress({
            phase: 'breaklines',
            processed: processedSteps,
            total: totalSteps,
            progress: 0.9 + (processedSteps / totalSteps) * 0.1,
            startTime,
          });
        }
      }
    }

    accumulator.intersections.sort((a, b) => a.dist2D - b.dist2D);
    const graph = buildGraphFromIntersections(
      accumulator.intersections,
      startPoint,
      endPoint,
      bounds
    );

    postProgress({
      phase: 'graph',
      processed: totalSteps,
      total: totalSteps,
      progress: 1,
      startTime,
    });

    self.postMessage({
      type: 'complete',
      success: true,
      data: graph,
      stats: { vertices: graph.vertices.length, edges: graph.edges.length },
    });
  } catch (err) {
    console.error('Profile worker error:', err);
    self.postMessage({
      type: 'error',
      success: false,
      error: { message: err.message, stack: err.stack, name: err.name },
    });
  }
};
self.addEventListener('message', (evt) => {
  if (evt.data && evt.data.type === 'terminate') self.close();
});
