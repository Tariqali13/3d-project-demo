// src/helpers/unzipWorkerHelper.js

// src/helpers/unzipWorkerHelper.js
export function unzipLargeFileInWorker({
  fileData,
  zipfileName,
  onProgress,
  unzipContent,
}) {
  return new Promise((resolve, reject) => {
    let worker = new Worker(
      new URL('../workers/unzip.worker.js', import.meta.url)
    );

    worker.onmessage = (e) => {
      const { success, data, error, progress, type } = e.data;
      if (type === 'progress' && typeof progress === 'number') {
        if (onProgress) onProgress(progress);
        return;
      }
      if (success) {
        worker.terminate();
        worker = null; // explicitly clear reference
        resolve(data);
      } else {
        worker.terminate();
        worker = null; // explicitly clear reference
        reject(error);
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      worker = null; // explicitly clear reference
      reject(err.message);
    };

    worker.postMessage({ fileData, zipfileName, unzipContent });
  });
}
