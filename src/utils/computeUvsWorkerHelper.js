export function computeUVsForDrapePixelCenterWorker(positions, texture, jgwValues, onProgress) {
  return new Promise((resolve, reject) => {
    // Get the position attribute array
    // Extract the Float32Array from the position attribute
    // Extract texture dimensions from texture.image
    const textureWidth = texture.image.width
    const textureHeight = texture.image.height
    let worker = new Worker(new URL("../workers/computeUVs.worker.js", import.meta.url), {
      type: "module", // if needed
    })

    worker.onmessage = (event) => {
      const { type, percent, uvArray } = event.data
      if (type === "progress") {
        // Update the progress callback
        if (onProgress) onProgress(percent)
      } else if (type === "result") {
        // We have our final UV array
        const result = new Float32Array(uvArray)
        worker.terminate()
        worker = null // explicitly clear reference
        resolve(result)
      }
    }

    worker.onerror = (err) => {
      worker.terminate()
      worker = null // explicitly clear reference
      reject(err)
    }

    // Transfer the positions buffer for efficiency
    worker.postMessage(
      {
        positions,
        textureWidth,
        textureHeight,
        jgwValues,
      },
      [positions.buffer],
    )
  })
}
