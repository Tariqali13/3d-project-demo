function mergeBounds(boundsA, boundsB) {
  return {
    min: {
      x: Math.min(boundsA.min.x, boundsB.min.x),
      y: Math.min(boundsA.min.y, boundsB.min.y),
      z: Math.min(boundsA.min.z, boundsB.min.z),
    },
    max: {
      x: Math.max(boundsA.max.x, boundsB.max.x),
      y: Math.max(boundsA.max.y, boundsB.max.y),
      z: Math.max(boundsA.max.z, boundsB.max.z),
    },
  };
}

function mergeBVHTrees(trees) {
  if (!trees.length) return null;
  if (trees.length === 1) return trees[0];

  // Recursively merge pairs of trees
  while (trees.length > 1) {
    const merged = [];

    for (let i = 0; i < trees.length; i += 2) {
      const left = trees[i];
      const right = trees[i + 1];

      if (!right) {
        merged.push(left); // odd one out
        continue;
      }

      merged.push({
        isLeaf: false,
        splitAxis: 0, // optional — could compute best axis if needed
        left,
        right,
        bounds: mergeBounds(left.bounds, right.bounds),
      });
    }

    trees = merged;
  }

  return trees[0];
}

export async function computeBVHInWorker(
  positions,
  maxTrianglesPerLeaf = 200,
  chunkSize = 90000,
  onProgress = () => {}
) {
  if (!positions || !positions.length) {
    throw new Error('Invalid BVH positions array');
  }

  const floatArray = new Float32Array(positions);
  const totalChunks = Math.ceil(floatArray.length / chunkSize);
  const bvhRoots = [];
  let lastReportedStep = 0;

  for (let i = 0; i < floatArray.length; i += chunkSize) {
    const chunk = floatArray.slice(i, i + chunkSize);

    // eslint-disable-next-line no-await-in-loop
    const bvh = await new Promise((resolve, reject) => {
      const worker = new Worker(
        new URL('../workers/bvh.worker.js', import.meta.url),
        { type: 'module' }
      );

      const timeout = setTimeout(() => {
        worker.terminate();
        reject(new Error('BVH worker timeout'));
      }, 15000);

      worker.onmessage = (evt) => {
        clearTimeout(timeout);
        const { success, bvh, error } = evt.data;
        worker.terminate();

        if (success) resolve(bvh);
        else reject(new Error(error || 'BVH worker failed'));
      };

      worker.onerror = (err) => {
        clearTimeout(timeout);
        worker.terminate();
        reject(err);
      };

      worker.postMessage(
        {
          type: 'BUILD_BVH',
          positions: chunk.buffer,
          maxTrianglesPerLeaf,
          chunkIndex: i / chunkSize,
          totalChunks,
        },
        [chunk.buffer]
      );
    });

    bvhRoots.push(bvh);

    // 🔁 Throttled progress: only on 10%, 20%, ...
    const rawPct = Math.round(((i + chunkSize) / floatArray.length) * 100);
    const stepped = Math.floor(rawPct / 10) * 10;
    if (stepped > lastReportedStep) {
      lastReportedStep = stepped;
      onProgress(stepped);
    }
  }

  // You may want to merge bvhRoots[] if needed
  return mergeBVHTrees(bvhRoots); // ✅ returns unified bvhRoot
}

export async function computeSharpEdgesInChunks(
  positions,
  angleThresholdDeg = 30,
  chunkSize = 90000,
  onProgress = () => {}
) {
  const floatArray = new Float32Array(positions);
  const totalChunks = Math.ceil(floatArray.length / chunkSize);
  const breakEdgesTotal = [];
  let lastReportedStep = 0;
  for (let i = 0; i < floatArray.length; i += chunkSize) {
    const chunk = floatArray.slice(i, i + chunkSize);

    // eslint-disable-next-line no-await-in-loop
    const breakEdges = await new Promise((resolve, reject) => {
      const worker = new Worker(
        new URL('../workers/sharpEdges.worker.js', import.meta.url),
        {
          type: 'module',
        }
      );

      const timeout = setTimeout(() => {
        worker.terminate();
        reject(new Error('Worker timeout'));
      }, 10000);

      worker.onmessage = (e) => {
        clearTimeout(timeout);
        const { success, breakEdges, error } = e.data;
        if (success) {
          resolve(breakEdges);
        } else {
          reject(new Error(error));
        }
        worker.terminate();
      };

      worker.onerror = (err) => {
        clearTimeout(timeout);
        worker.terminate();
        reject(err);
      };

      worker.postMessage(
        {
          type: 'SHARP_EDGES_CHUNK',
          positions: chunk.buffer,
          angleThresholdDeg,
        },
        [chunk.buffer]
      );
    });
    breakEdgesTotal.push(...breakEdges);

    const currentChunk = i / chunkSize + 1;
    const rawPct = Math.round((currentChunk / totalChunks) * 100);
    const roundedStep = Math.floor(rawPct / 10) * 10;

    if (roundedStep > lastReportedStep) {
      lastReportedStep = roundedStep;
      onProgress(roundedStep); // Only fire for 10%, 20%, ..., 100%
    }
  }

  return breakEdgesTotal;
}
