// workerGeometryHelper.js
export function buildSurfaceInWorker({
  surfIdx,
  surfaceRunningId,
  entities,
  flattenToPlane,
  setBuildProgress,
}) {
  return new Promise((resolve, reject) => {
    let worker = new Worker(
      new URL('../workers/geometryBuilder.worker.js', import.meta.url)
    );

    worker.onmessage = (e) => {
      if (e.data.success) {
        resolve(e.data.data);
        worker.terminate();
        worker = null; // explicitly clear reference
      } else if (e.data.error) {
        reject(e.data.error);
        worker.terminate();
        worker = null; // explicitly clear reference
      } else if (e.data.progress != null) {
        // If we added progress in the worker chunk loop,
        // handle it here
        setBuildProgress(e.data.progress);
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      worker = null; // explicitly clear reference
      reject(err.message);
    };

    // Post all needed data to the worker
    worker.postMessage({
      surfIdx,
      surfaceRunningId,
      entities,
      flattenToPlane,
      chunkSize: 50000, // e.g.
    });
  });
}
