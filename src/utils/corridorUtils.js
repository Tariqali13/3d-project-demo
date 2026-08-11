// corridorUtils.js
/**
 * Collect triangles from a BVH node that are within corridorWidth
 * of the infinite line (or segment) from start->end.
 *
 * In practice, we often do bounding box intersection for speed,
 * then do a finer check. Shown here is a simpler approach:
 */
import { measureSurfaceDistanceAStar } from './workerDijkstraHelper';

function triDistanceCheck(tri, startP, endP) {
  const dA = distancePointToSegment3D(tri.vA, startP, endP);
  const dB = distancePointToSegment3D(tri.vB, startP, endP);
  const dC = distancePointToSegment3D(tri.vC, startP, endP);
  return Math.min(dA, dB, dC);
}

function boxIntersectsCorridor(bounds, startP, endP, width) {
  // A quick bounding box approach:
  // We'll build a bounding box for the corridor: min = ( line min - width ), max = ( line max + width )
  // Then check if (bounds) intersects that bounding box.

  // 1) corridor bounding box
  const corridorBB = corridorBoundingBox(startP, endP, width);
  // 2) overlap test
  if (bounds.max.x < corridorBB.min.x || bounds.min.x > corridorBB.max.x)
    return false;
  if (bounds.max.y < corridorBB.min.y || bounds.min.y > corridorBB.max.y)
    return false;
  if (bounds.max.z < corridorBB.min.z || bounds.min.z > corridorBB.max.z)
    return false;
  return true;
}

function corridorBoundingBox(startP, endP, w) {
  return {
    min: {
      x: Math.min(startP.x, endP.x) - w,
      y: Math.min(startP.y, endP.y) - w,
      z: Math.min(startP.z, endP.z) - w,
    },
    max: {
      x: Math.max(startP.x, endP.x) + w,
      y: Math.max(startP.y, endP.y) + w,
      z: Math.max(startP.z, endP.z) + w,
    },
  };
}

/** Recursively collect triangles from the BVH that are near the line segment. */
export function gatherTrianglesInCorridor(
  bvhNode,
  startP,
  endP,
  corridorWidth
) {
  const results = [];
  recurseCorridor(bvhNode, startP, endP, corridorWidth, results);
  return results;
}

function recurseCorridor(node, startP, endP, corridorWidth, outArr) {
  if (!boxIntersectsCorridor(node.bounds, startP, endP, corridorWidth)) {
    return;
  }
  if (node.isLeaf) {
    for (const tri of node.triangles) {
      if (triDistanceCheck(tri, startP, endP) <= corridorWidth) {
        outArr.push(tri);
      }
    }
  } else {
    recurseCorridor(node.left, startP, endP, corridorWidth, outArr);
    recurseCorridor(node.right, startP, endP, corridorWidth, outArr);
  }
}

/**
 * corridorTris: Array of { vA, vB, vC }
 * corridorVertices: let's store them in a map { [index]: {x,y,z} } or something
 * But you might still need to deduplicate or handle shared edges.
 */

export function buildCorridorAdjacency(corridorTris = []) {
  const vertices = [];
  const vertexMap = new Map();
  const adjList = {};

  for (const tri of corridorTris) {
    for (const v of [tri.vA, tri.vB, tri.vC]) {
      const key = `${v.x},${v.y},${v.z}`;
      if (!vertexMap.has(key)) {
        const idx = vertices.length;
        vertices.push(v);
        vertexMap.set(key, idx);
        adjList[idx] = [];
      }
    }
  }

  // connect each tri’s 3 corners
  for (const tri of corridorTris) {
    const iA = vertexMap.get(`${tri.vA.x},${tri.vA.y},${tri.vA.z}`);
    const iB = vertexMap.get(`${tri.vB.x},${tri.vB.y},${tri.vB.z}`);
    const iC = vertexMap.get(`${tri.vC.x},${tri.vC.y},${tri.vC.z}`);
    addEdge(adjList, vertices, iA, iB);
    addEdge(adjList, vertices, iB, iC);
    addEdge(adjList, vertices, iC, iA);
  }

  return { adjList, vertices };
}

function addEdge(adjList, verts, i1, i2) {
  const dx = verts[i2].x - verts[i1].x;
  const dy = verts[i2].y - verts[i1].y;
  const dz = verts[i2].z - verts[i1].z;
  const dist3D = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // push both ways
  if (!adjList[i1].some((e) => e.idx === i2)) {
    adjList[i1].push({ idx: i2, dist: dist3D });
  }
  if (!adjList[i2].some((e) => e.idx === i1)) {
    adjList[i2].push({ idx: i1, dist: dist3D });
  }
}

function distancePointToSegment3D(p, start, end) {
  // Segment vector
  const sx = end.x - start.x;
  const sy = end.y - start.y;
  const sz = end.z - start.z;
  const segLenSq = sx * sx + sy * sy + sz * sz;

  // If start & end are the same point:
  if (segLenSq === 0) {
    return Math.sqrt(
      (p.x - start.x) ** 2 + (p.y - start.y) ** 2 + (p.z - start.z) ** 2
    );
  }

  // Vector from start to p
  const px = p.x - start.x;
  const py = p.y - start.y;
  const pz = p.z - start.z;

  // t is the param of the projection along the segment: 0 <= t <= 1
  const t = Math.max(0, Math.min(1, (px * sx + py * sy + pz * sz) / segLenSq));

  // Projection coords
  const projx = start.x + t * sx;
  const projy = start.y + t * sy;
  const projz = start.z + t * sz;

  // Distance from p to the projection
  const dx = p.x - projx;
  const dy = p.y - projy;
  const dz = p.z - projz;

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export async function measureSurfaceDistanceAStarSegmentAsync(
  adjacencyData,
  startP,
  endP,
  corridorWidth = 200
) {
  try {
    const distStr = await measureSurfaceDistanceAStar({
      adjacencyData,
      startPoint: startP,
      endPoint: endP,
      corridorWidth,
    });
    // if (!distStr || distStr.includes('no path')) {
    //   return 'No path';
    // }
    if (!isNaN(distStr)) {
      const val = parseFloat(distStr);
      // if (isNaN(val)) return 'No path';
      return val;
    }
    return 0;
  } catch (err) {
    return `Error: ${err.message}`;
  }
}
