import { gatherTrianglesInCorridor } from './corridorUtils';

export const extractMeshData = (mesh) => {
  const geometry = mesh.geometry;
  geometry.computeVertexNormals();

  // convert to non-indexed if needed
  let finalGeom = geometry;
  if (geometry.index) {
    finalGeom = geometry.toNonIndexed();
  }

  const posAttr = finalGeom.getAttribute('position');
  const positions = new Float32Array(posAttr.array.length);
  positions.set(posAttr.array);

  // If you want index => handle it
  // If finalGeom is nonIndexed, there's no index

  return { positions };
};

export function buildEdgesFromPositions(positions, angleThresholdDeg = 30) {
  // 1) parse triangles
  const triangles = [];
  for (let i = 0; i < positions.length; i += 9) {
    const vA = { x: positions[i], y: positions[i + 1], z: positions[i + 2] };
    const vB = {
      x: positions[i + 3],
      y: positions[i + 4],
      z: positions[i + 5],
    };
    const vC = {
      x: positions[i + 6],
      y: positions[i + 7],
      z: positions[i + 8],
    };
    triangles.push({ vA, vB, vC });
  }

  // 2) compute face normal for each triangle
  function computeNormal(tri) {
    const AB = {
      x: tri.vB.x - tri.vA.x,
      y: tri.vB.y - tri.vA.y,
      z: tri.vB.z - tri.vA.z,
    };
    const AC = {
      x: tri.vC.x - tri.vA.x,
      y: tri.vC.y - tri.vA.y,
      z: tri.vC.z - tri.vA.z,
    };
    const cross = {
      x: AB.y * AC.z - AB.z * AC.y,
      y: AB.z * AC.x - AB.x * AC.z,
      z: AB.x * AC.y - AB.y * AC.x,
    };
    // normalize
    const len = Math.sqrt(
      cross.x * cross.x + cross.y * cross.y + cross.z * cross.z
    );
    if (len < 1e-12) return { x: 0, y: 0, z: 0 };
    return { x: cross.x / len, y: cross.y / len, z: cross.z / len };
  }

  triangles.forEach((tri) => {
    tri.normal = computeNormal(tri);
  });

  // 3) build a map of edges
  const edgeMap = new Map();
  function addEdge(a, b, triIndex) {
    const key = edgeKey(a, b);
    if (!edgeMap.has(key)) {
      edgeMap.set(key, {
        v1: a,
        v2: b,
        connectedFaces: [],
      });
    }
    edgeMap.get(key).connectedFaces.push(triIndex);
  }

  function edgeKey(a, b) {
    // sort by x,y,z so (a->b) == (b->a)
    const sorted = [a, b].sort((v1, v2) => {
      if (v1.x !== v2.x) return v1.x - v2.x;
      if (v1.y !== v2.y) return v1.y - v2.y;
      return v1.z - v2.z;
    });
    const [m1, m2] = sorted;
    return `${m1.x},${m1.y},${m1.z}|${m2.x},${m2.y},${m2.z}`;
  }

  triangles.forEach((tri, idx) => {
    addEdge(tri.vA, tri.vB, idx);
    addEdge(tri.vB, tri.vC, idx);
    addEdge(tri.vC, tri.vA, idx);
  });

  // 4) compute which edges are 'sharp'
  const breakEdges = [];
  const thresholdRad = (angleThresholdDeg * Math.PI) / 180;

  function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }
  function angleBetween(n1, n2) {
    const d = dot(n1, n2);
    // clamp to [-1, 1] just in case of float rounding
    const clamped = Math.max(-1, Math.min(1, d));
    return Math.acos(clamped);
  }

  for (const [key, edgeRec] of edgeMap.entries()) {
    const faces = edgeRec.connectedFaces;
    if (faces.length === 1) {
      // boundary edge => you can decide if boundary is also a "break" line
      edgeRec.isBreakLine = true;
      breakEdges.push(edgeRec);
    } else if (faces.length === 2) {
      // get the angle between the two face normals
      const f1 = triangles[faces[0]];
      const f2 = triangles[faces[1]];
      const ang = angleBetween(f1.normal, f2.normal);
      if (ang > thresholdRad) {
        edgeRec.isBreakLine = true;
        breakEdges.push(edgeRec);
      }
    } else {
      // more than 2 => degenerate or non-manifold
      // handle as needed
    }
  }

  return breakEdges;
}

export const extractBreakLinesFromEntities = (entities) => {
  const breakEdges = [];

  for (const entity of entities) {
    // Only do this if flagged as a break line
    if (entity.type === 'FACE' || entity.type === '3DFACE') {
      const verts = entity.vertices;
      // For a triangular face => edges: (0->1), (1->2), (2->0)
      // For a quad => edges: (0->1), (1->2), (2->3), (3->0), etc.

      for (let i = 0; i < verts.length; i++) {
        const j = (i + 1) % verts.length;
        // e.g. if length=3, edges => (0->1), (1->2), (2->0)
        const v1 = { x: verts[i].x, y: verts[i].y, z: verts[i].z };
        const v2 = { x: verts[j].x, y: verts[j].y, z: verts[j].z };

        breakEdges.push({ v1, v2 });
      }
    }
  }
  return breakEdges;
};
export const filterBreakEdgesByLineBB = (breakEdges, startPoint, endPoint) => {
  const lineMinX = Math.min(startPoint.x, endPoint.x);
  const lineMaxX = Math.max(startPoint.x, endPoint.x);
  const lineMinY = Math.min(startPoint.y, endPoint.y);
  const lineMaxY = Math.max(startPoint.y, endPoint.y);

  const filtered = [];
  for (const edge of breakEdges) {
    const { x: ex1, y: ey1 } = edge.v1;
    const { x: ex2, y: ey2 } = edge.v2;

    // bounding box of this single break-line edge
    const minEx = Math.min(ex1, ex2);
    const maxEx = Math.max(ex1, ex2);
    const minEy = Math.min(ey1, ey2);
    const maxEy = Math.max(ey1, ey2);

    // if they do NOT overlap, skip
    const noOverlap =
      maxEx < lineMinX ||
      minEx > lineMaxX ||
      maxEy < lineMinY ||
      minEy > lineMaxY;

    if (!noOverlap) {
      filtered.push(edge);
    }
  }
  return filtered;
};

export function lineBoundingBox(start, end, padding = 0) {
  return {
    min: {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      // z: Math.min(start.z, end.z),
    },
    max: {
      x: Math.max(start.x, end.x),
      y: Math.max(start.y, end.y),
      // z: Math.max(start.z, end.z),
    },
  };
}
export function boxesOverlap(boxA, boxB) {
  if (boxA.max.x < boxB.min.x || boxA.min.x > boxB.max.x) return false;
  if (boxA.max.y < boxB.min.y || boxA.min.y > boxB.max.y) return false;
  if (boxA.max.z < boxB.min.z || boxA.min.z > boxB.max.z) return false;
  return true;
}
// Compute a bounding box for an array of THREE.Vector3 points
export function computePointsBoundingBox(points) {
  let min = { x: Infinity, y: Infinity };
  let max = { x: -Infinity, y: -Infinity };
  points.forEach((p) => {
    if (p.x < min.x) min.x = p.x;
    if (p.y < min.y) min.y = p.y;
    // if (p.z < min.z) min.z = p.z;
    if (p.x > max.x) max.x = p.x;
    if (p.y > max.y) max.y = p.y;
    // if (p.z > max.z) max.z = p.z;
  });
  return { min, max };
}

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

export async function computeSharpEdgesFromGeometry(
  positions,
  angleThresholdDeg = 30
) {
  // 1) Build a list of triangles
  const triangles = [];
  for (let i = 0; i < positions.length; i += 9) {
    const vA = { x: positions[i], y: positions[i + 1], z: positions[i + 2] };
    const vB = {
      x: positions[i + 3],
      y: positions[i + 4],
      z: positions[i + 5],
    };
    const vC = {
      x: positions[i + 6],
      y: positions[i + 7],
      z: positions[i + 8],
    };
    triangles.push({ vA, vB, vC });
  }

  // 2) Compute face normal for each triangle:
  for (const tri of triangles) {
    tri.normal = faceNormal(tri.vA, tri.vB, tri.vC);
  }

  // 3) Build a map of edges => which triangles share it
  const edgeMap = new Map();
  function addEdge(a, b, triIdx) {
    // Sort the 3D points so (a->b) = (b->a)
    // We'll convert to a string key
    const key = edgeKey(a, b);
    if (!edgeMap.has(key)) {
      edgeMap.set(key, { v1: a, v2: b, triIndices: [] });
    }
    edgeMap.get(key).triIndices.push(triIdx);
  }

  triangles.forEach((tri, idx) => {
    addEdge(tri.vA, tri.vB, idx);
    addEdge(tri.vB, tri.vC, idx);
    addEdge(tri.vC, tri.vA, idx);
  });

  // 4) For each edge, check how many triangles reference it
  //    If only 1 => boundary edge => break
  //    If 2 => check angle => if above threshold => break
  const breakEdges = [];
  const threshold = (angleThresholdDeg * Math.PI) / 180;
  for (const [key, edgeRec] of edgeMap.entries()) {
    const tI = edgeRec.triIndices;
    if (tI.length === 1) {
      // boundary edge => treat as break?
      breakEdges.push({ v1: edgeRec.v1, v2: edgeRec.v2 });
    } else if (tI.length === 2) {
      // check angle
      const tri1 = triangles[tI[0]];
      const tri2 = triangles[tI[1]];
      const angle = angleBetween(tri1.normal, tri2.normal);
      if (angle >= threshold) {
        breakEdges.push({ v1: edgeRec.v1, v2: edgeRec.v2 });
      }
    }
    // if tI.length > 2 => non-manifold or degenerate => ignore or your logic
  }

  return breakEdges;
}

// Some helpers:
function edgeKey(a, b) {
  // sort them e.g. by x, then y, then z
  // caution: watch out for floating precision. Usually you do an integer approach or ?.toFixed(5)
  const [p1, p2] = sortPoints(a, b);
  return `${p1.x?.toFixed(5)},${p1.y?.toFixed(5)},${p1.z?.toFixed(
    5
  )}|${p2.x?.toFixed(5)},${p2.y?.toFixed(5)},${p2.z?.toFixed(5)}`;
}
function sortPoints(a, b) {
  // compare in order of x, y, z
  if (a.x !== b.x) return a.x < b.x ? [a, b] : [b, a];
  if (a.y !== b.y) return a.y < b.y ? [a, b] : [b, a];
  if (a.z !== b.z) return a.z < b.z ? [a, b] : [b, a];
  return [a, b]; // they are identical
}

function faceNormal(vA, vB, vC) {
  // cross( vB-vA , vC-vA )
  const AB = { x: vB.x - vA.x, y: vB.y - vA.y, z: vB.z - vA.z };
  const AC = { x: vC.x - vA.x, y: vC.y - vA.y, z: vC.z - vA.z };
  const cross = {
    x: AB.y * AC.z - AB.z * AC.y,
    y: AB.z * AC.x - AB.x * AC.z,
    z: AB.x * AC.y - AB.y * AC.x,
  };
  const len = Math.hypot(cross.x, cross.y, cross.z) || 1e-12;
  return { x: cross.x / len, y: cross.y / len, z: cross.z / len };
}
function angleBetween(n1, n2) {
  // dot, clamp, acos
  const d = n1.x * n2.x + n1.y * n2.y + n1.z * n2.z;
  const clamp = Math.max(-1, Math.min(1, d));
  return Math.acos(clamp);
}

export function computeSurfaceBoundary(positions) {
  // 1) Parse triangles from position array
  const triangles = [];
  for (let i = 0; i < positions.length; i += 9) {
    const vA = { x: positions[i], y: positions[i + 1], z: positions[i + 2] };
    const vB = {
      x: positions[i + 3],
      y: positions[i + 4],
      z: positions[i + 5],
    };
    const vC = {
      x: positions[i + 6],
      y: positions[i + 7],
      z: positions[i + 8],
    };
    triangles.push({ vA, vB, vC });
  }

  // 2) Build a map of edges to identify edges shared by only one triangle
  const edgeMap = new Map();

  function addEdge(a, b, triIndex) {
    const key = edgeKey(a, b);
    if (!edgeMap.has(key)) {
      edgeMap.set(key, {
        v1: a,
        v2: b,
        connectedFaces: [],
      });
    }
    edgeMap.get(key).connectedFaces.push(triIndex);
  }

  // Use the same edgeKey function you have in your code
  function edgeKey(a, b) {
    const [p1, p2] = sortPoints(a, b);
    return `${p1.x?.toFixed(5)},${p1.y?.toFixed(5)},${p1.z?.toFixed(
      5
    )}|${p2.x?.toFixed(5)},${p2.y?.toFixed(5)},${p2.z?.toFixed(5)}`;
  }

  function sortPoints(a, b) {
    if (a.x !== b.x) return a.x < b.x ? [a, b] : [b, a];
    if (a.y !== b.y) return a.y < b.y ? [a, b] : [b, a];
    if (a.z !== b.z) return a.z < b.z ? [a, b] : [b, a];
    return [a, b]; // they are identical
  }

  // Add all triangle edges to the map
  triangles.forEach((tri, idx) => {
    addEdge(tri.vA, tri.vB, idx);
    addEdge(tri.vB, tri.vC, idx);
    addEdge(tri.vC, tri.vA, idx);
  });

  // 3) Find boundary edges (those with only one connected face)
  const boundaryEdges = [];

  for (const [key, edgeRec] of edgeMap.entries()) {
    if (edgeRec.connectedFaces.length === 1) {
      boundaryEdges.push({ v1: edgeRec.v1, v2: edgeRec.v2 });
    }
  }

  // 4) Optional: Try to sort edges into a continuous path
  const sortedBoundaryEdges = sortBoundaryEdgesIntoPath(boundaryEdges);
  return sortedBoundaryEdges || boundaryEdges;
}

// Function to try to sort boundary edges into a continuous path
function sortBoundaryEdgesIntoPath(edges) {
  if (edges.length === 0) return [];

  // Deep clone the edges to avoid modifying the original array
  const workingEdges = edges.map((e) => ({
    v1: { x: e.v1.x, y: e.v1.y, z: e.v1.z },
    v2: { x: e.v2.x, y: e.v2.y, z: e.v2.z },
  }));

  // Helper function to check if two vertices are equal (within a small epsilon)
  const epsilon = 1e-5;
  function verticesEqual(a, b) {
    return (
      Math.abs(a.x - b.x) < epsilon &&
      Math.abs(a.y - b.y) < epsilon &&
      Math.abs(a.z - b.z) < epsilon
    );
  }

  // Find next edge that connects to the current one
  function findNextEdge(currentEdge, remainingEdges) {
    const endPoint = currentEdge.v2;

    for (let i = 0; i < remainingEdges.length; i++) {
      const edge = remainingEdges[i];

      // Check if this edge starts with the endpoint of our current edge
      if (verticesEqual(edge.v1, endPoint)) {
        return { edge, index: i };
      }

      // Check if this edge ends with the endpoint of our current edge (reverse it)
      if (verticesEqual(edge.v2, endPoint)) {
        // Swap v1 and v2 to make it connect properly
        const swapped = { v1: edge.v2, v2: edge.v1 };
        remainingEdges[i] = swapped;
        return { edge: swapped, index: i };
      }
    }

    return null; // No connecting edge found
  }

  // Start with the first edge
  const sortedPath = [workingEdges[0]];
  workingEdges.splice(0, 1);

  // Keep adding edges to the path
  while (workingEdges.length > 0) {
    const lastEdge = sortedPath[sortedPath.length - 1];
    const next = findNextEdge(lastEdge, workingEdges);

    if (next) {
      sortedPath.push(next.edge);
      workingEdges.splice(next.index, 1);
    } else {
      // If we can't find a connecting edge, just add the next available one
      // This might happen if we have multiple disconnected boundary loops
      sortedPath.push(workingEdges[0]);
      workingEdges.splice(0, 1);
    }
  }

  return sortedPath;
}
