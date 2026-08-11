export function decodeBase64InWorker(base64, onProgress) {
  return new Promise((resolve, reject) => {
    let worker = new Worker(new URL("../workers/loadTexture.worker.js", import.meta.url), {
      type: "module", // if needed
    })

    worker.onmessage = (event) => {
      const { type, percent, blob, error } = event.data
      if (type === "progress") {
        // Update a progress callback
        if (onProgress) onProgress(percent)
      } else if (type === "result") {
        // Build a THREE.Texture from the ImageBitmap
        worker.terminate()
        worker = null // explicitly clear reference
        resolve({ blob })
      } else if (type === "error") {
        worker.terminate()
        worker = null // explicitly clear reference
        reject(new Error(error))
      }
    }

    worker.onerror = (err) => {
      worker.terminate()
      worker = null // explicitly clear reference
      reject(err)
    }

    // Send the entire base64 data to the worker
    worker.postMessage({ base64 })
  })
}
