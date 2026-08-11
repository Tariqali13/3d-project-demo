/* eslint-disable no-restricted-globals */

/**
 * We store info in self.* so we can track totalChunks, how many processed, etc.
 * The worker chunk-splits further for partial streaming (layerBatch, surfaceBatch).
 */

function chunkArray(arr, size) {
  const result = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

/**
 * Given a small chunk from the main thread, we categorize each entity
 * into layer or surface. We also handle partial streaming in smaller
 * "layerBatch" or "surfaceBatch" lumps if needed.
 */
function categorizeAndStreamChunk({ chunk, BATCH_SIZE }) {
  let layerBuffer = [];
  let surfaceBuffer = [];

  for (const entity of chunk) {
    if (
      entity.type === '3DFACE' ||
      entity.type === 'FACE' ||
      entity.type === 'BOUNDARY'
    ) {
      surfaceBuffer.push(entity);
      if (surfaceBuffer.length >= BATCH_SIZE) {
        self.postMessage({
          chunkType: 'surfaceBatch',
          data: surfaceBuffer,
        });
        surfaceBuffer = [];
      }
    } else {
      layerBuffer.push(entity);
      if (layerBuffer.length >= BATCH_SIZE) {
        self.postMessage({
          chunkType: 'layerBatch',
          data: layerBuffer,
        });
        layerBuffer = [];
      }
    }
  }

  // Post remainder
  if (layerBuffer.length > 0) {
    self.postMessage({
      chunkType: 'layerBatch',
      data: layerBuffer,
    });
  }
  if (surfaceBuffer.length > 0) {
    self.postMessage({
      chunkType: 'surfaceBatch',
      data: surfaceBuffer,
    });
  }
}

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.command === 'initCategorize') {
    // Step 1: store the total chunk info
    self.totalChunks = msg.totalChunks;
    self.processedCount = 0;
    self.fileId = msg.fileId;
    self.batchSize = msg.batchSize || 1000;
  } else if (msg.command === 'categorizeChunk') {
    // We get a small chunk from the main thread
    const { chunk, chunkIndex } = msg;
    categorizeAndStreamChunk({
      chunk,
      BATCH_SIZE: self.batchSize,
    });

    // increment
    self.processedCount++;
    const progress = Math.floor((self.processedCount / self.totalChunks) * 100);
    self.postMessage({ progress });

    // If all done
    if (self.processedCount >= self.totalChunks) {
      self.postMessage({ done: true });
    }
  }
};
