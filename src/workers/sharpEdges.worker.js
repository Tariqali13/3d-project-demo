/* eslint-disable no-restricted-globals */

function computeSharpEdges(positions, angleThresholdRad) {
  const floatArray = new Float32Array(positions);
  const triangleCount = Math.floor(floatArray.length / 9);
  const triangles = [];
  const edgeMap = new Map();
  const breakEdges = [];

  for (let i = 0; i < floatArray.length; i += 9) {
    const triIndex = i / 9;
    const v0 = i / 3;
    const v1 = v0 + 1;
    const v2 = v0 + 2;

    const normal = faceNormal(i, floatArray);
    triangles[triIndex] = { normal };

    const edges = [
      [v0, v1],
      [v1, v2],
      [v2, v0],
    ];

    for (const [a, b] of edges) {
      const key = edgeKey(a, b);
      if (!edgeMap.has(key)) {
        edgeMap.set(key, { v1Idx: a, v2Idx: b, triIndices: [] });
      }
      edgeMap.get(key).triIndices.push(triIndex);
    }
  }

  for (const edge of edgeMap.values()) {
    const tI = edge.triIndices;
    if (tI.length === 1) {
      breakEdges.push({ v1: edge.v1Idx, v2: edge.v2Idx });
    } else if (tI.length === 2) {
      const tri1 = triangles[tI[0]];
      const tri2 = triangles[tI[1]];
      if (tri1 && tri2) {
        const angle = angleBetween(tri1.normal, tri2.normal);
        if (angle >= angleThresholdRad) {
          breakEdges.push({ v1: edge.v1Idx, v2: edge.v2Idx });
        }
      }
    }
  }

  return breakEdges;
}

// Helpers
function faceNormal(i, array) {
  const vA = { x: array[i], y: array[i + 1], z: array[i + 2] };
  const vB = { x: array[i + 3], y: array[i + 4], z: array[i + 5] };
  const vC = { x: array[i + 6], y: array[i + 7], z: array[i + 8] };

  const AB = { x: vB.x - vA.x, y: vB.y - vA.y, z: vB.z - vA.z };
  const AC = { x: vC.x - vA.x, y: vC.y - vA.y, z: vC.z - vA.z };

  const cross = {
    x: AB.y * AC.z - AB.z * AC.y,
    y: AB.z * AC.x - AB.x * AC.z,
    z: AB.x * AC.y - AB.y * AC.x,
  };

  const len = Math.hypot(cross.x, cross.y, cross.z);
  return len < 1e-12
    ? { x: 0, y: 0, z: 1 }
    : { x: cross.x / len, y: cross.y / len, z: cross.z / len };
}

function angleBetween(n1, n2) {
  const dot = n1.x * n2.x + n1.y * n2.y + n1.z * n2.z;
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

function edgeKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

self.onmessage = function (e) {
  try {
    const { type, positions, angleThresholdDeg } = e.data;
    if (type !== 'SHARP_EDGES_CHUNK') {
      return self.postMessage({ success: false, error: 'Unknown type' });
    }

    const angleThresholdRad = (angleThresholdDeg * Math.PI) / 180;
    const breakEdges = computeSharpEdges(positions, angleThresholdRad);

    self.postMessage({ success: true, breakEdges, status: 'chunk-complete' });
  } catch (err) {
    self.postMessage({ success: false, breakEdges: [], error: err.message });
  }
};
