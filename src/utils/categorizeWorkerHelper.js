// categorizeWorkerHelper.js

/**
 * A helper that splits `entities` into sub-chunks in the MAIN thread,
 * sending each chunk to the worker in smaller increments.
 *
 * The worker categorizes each chunk’s data (layer vs surface),
 * streams partial results back (layerBatch or surfaceBatch),
 * and we accumulate them in layersMap / surfacesMap.
 */
export function categorizeEntitiesInWorker(
  entities,
  fileId,
  onProgress,
  fileName,
  mainZipFileName = ""
) {
  return new Promise((resolve, reject) => {
    // 1) Create the web worker (point to your 'categorize.worker.js' file)
    let worker = new Worker(
      new URL('../workers/categorize.worker.js', import.meta.url)
    );

    // 2) We'll store final data in these maps (like your original structure)
    const layersMap = new Map();
    const surfacesMap = new Map();

    // 3) Worker event handling
    worker.onmessage = (e) => {
      const msg = e.data;

      if (msg.progress != null) {
        onProgress(msg.progress);
        // The worker says how far along it is
      } else if (msg.chunkType === 'layerBatch') {
        // We got a partial batch for LAYER
        for (const entity of msg.data) {
          const layerName = entity.layer || entity.layerName || 'Default';
          if (!layersMap.has(layerName)) {
            layersMap.set(layerName, {
              id: `Layer_${layerName}-${fileId}`,
              layerName,
              enableValue: true,
              entities: [],
              fileName,
              mainZipFileName,
            });
          }
          layersMap.get(layerName).entities.push(entity);
        }
      } else if (msg.chunkType === 'surfaceBatch') {
        // We got a partial batch for SURFACE
        for (const entity of msg.data) {
          const surfaceName = entity.layer || entity.surfaceName || 'Default';
          if (!surfacesMap.has(surfaceName)) {
            surfacesMap.set(surfaceName, {
              id: `Surface_${surfaceName}-${fileId}`,
              surfaceName,
              enableValue: true,
              entities: [],
              fileName,
              mainZipFileName,
            });
          }
          surfacesMap.get(surfaceName).entities.push(entity);
        }
      } else if (msg.done) {
        // The worker signals it's done with all chunks
        // Convert maps to final arrays
        const layers = Array.from(layersMap.values());
        const surfaces = Array.from(surfacesMap.values());
        worker.terminate();
        worker = null; // explicitly clear reference
        resolve({ layers, surfaces });
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      worker = null; // explicitly clear reference
      reject(err);
    };

    // 4) Split `entities` into sub-chunks in the MAIN thread
    // to avoid sending a giant array in one postMessage
    const chunkSize = 50000; // e.g. 20k. Adjust as needed.
    const chunked = [];
    for (let i = 0; i < entities.length; i += chunkSize) {
      const slice = entities.slice(i, i + chunkSize);
      chunked.push(slice);
    }

    // 5) Let the worker know how many chunks are incoming
    worker.postMessage({
      command: 'initCategorize',
      fileId,
      totalChunks: chunked.length,
      batchSize: 1000, // For worker's partial streaming
    });

    // 6) Send each chunk
    chunked.forEach((chunk, index) => {
      worker.postMessage({
        command: 'categorizeChunk',
        fileId,
        chunkIndex: index,
        chunk,
      });
    });
  });
}
