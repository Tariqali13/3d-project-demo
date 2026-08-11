export function parseLargeFileInWorker({ fileType, file, onProgress }) {
  return new Promise((resolve, reject) => {
    let worker = new Worker(
      new URL('../workers/parser.worker.js', import.meta.url)
    );

    worker.onmessage = (e) => {
      const { success, data, error, progress } = e.data;

      if (typeof progress === 'number') {
        // This is a progress update, not final data
        if (onProgress) onProgress(progress);
        return;
      }
      // Otherwise it's either success or error
      if (!success) {
        worker.terminate();
        worker = null; // explicitly clear reference
        reject(error);
      } else {
        worker.terminate();
        worker = null; // explicitly clear reference
        resolve(data);
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      worker = null; // explicitly clear reference
      reject(err.message);
    };

    worker.postMessage({ fileType, file });
  });
}
