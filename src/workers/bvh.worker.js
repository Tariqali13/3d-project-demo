/* eslint-disable no-restricted-globals */

function geometryToTriangles(positions) {
  const triArray = [];
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
    triArray.push({ vA, vB, vC });
  }
  return triArray;
}

function computeBounds(triangles) {
  let minx = Infinity,
    miny = Infinity,
    minz = Infinity;
  let maxx = -Infinity,
    maxy = -Infinity,
    maxz = -Infinity;
  for (const t of triangles) {
    for (const v of [t.vA, t.vB, t.vC]) {
      minx = Math.min(minx, v.x);
      miny = Math.min(miny, v.y);
      minz = Math.min(minz, v.z);
      maxx = Math.max(maxx, v.x);
      maxy = Math.max(maxy, v.y);
      maxz = Math.max(maxz, v.z);
    }
  }
  return {
    min: { x: minx, y: miny, z: minz },
    max: { x: maxx, y: maxy, z: maxz },
  };
}

function center(tri) {
  return [
    (tri.vA.x + tri.vB.x + tri.vC.x) / 3,
    (tri.vA.y + tri.vB.y + tri.vC.y) / 3,
    (tri.vA.z + tri.vB.z + tri.vC.z) / 3,
  ];
}

function buildBVH(
  triangles,
  maxTrianglesPerLeaf = 100,
  depth = 0,
  totalTriangles
) {
  if (triangles.length <= maxTrianglesPerLeaf || depth > 40) {
    return { isLeaf: true, triangles, bounds: computeBounds(triangles) };
  }

  const bounds = computeBounds(triangles);
  const extents = [
    bounds.max.x - bounds.min.x,
    bounds.max.y - bounds.min.y,
    bounds.max.z - bounds.min.z,
  ];
  const splitAxis = extents.indexOf(Math.max(...extents));

  triangles.sort((a, b) => center(a)[splitAxis] - center(b)[splitAxis]);
  const mid = Math.floor(triangles.length / 2);
  const leftTris = triangles.slice(0, mid);
  const rightTris = triangles.slice(mid);

  const leftNode = buildBVH(
    leftTris,
    maxTrianglesPerLeaf,
    depth + 1,
    totalTriangles
  );
  const rightNode = buildBVH(
    rightTris,
    maxTrianglesPerLeaf,
    depth + 1,
    totalTriangles
  );

  return { isLeaf: false, bounds, splitAxis, left: leftNode, right: rightNode };
}

self.onmessage = async (evt) => {
  const {
    type,
    positions,
    maxTrianglesPerLeaf = 100,
    chunkIndex,
    totalChunks,
  } = evt.data;
  if (type !== 'BUILD_BVH') return;

  const floatArray = new Float32Array(positions);
  try {
    if (floatArray.length % 9 !== 0) {
      throw new Error('Invalid positions array length');
    }

    const triangles = geometryToTriangles(floatArray);
    const totalTriangles = floatArray.length / 9;
    const bvhRoot = buildBVH(
      triangles,
      maxTrianglesPerLeaf,
      0,
      totalTriangles,
      (progress) => {
        self.postMessage({ status: 'progress', progress });
      }
    );

    self.postMessage({ success: true, bvh: bvhRoot });
  } catch (err) {
    self.postMessage({ success: false, error: err.message });
  }
};
