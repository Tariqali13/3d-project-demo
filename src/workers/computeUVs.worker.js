// computeUVsWorker.js
/* eslint-disable no-restricted-globals */

// computeUVsWorker.js
// computeUVsWorker.js
self.onmessage = (e) => {
  const { positions, textureWidth, textureHeight, jgwValues } = e.data
  const { pixelWidth, pixelHeight, topLeftX, topLeftY } = jgwValues

  const numVertices = positions.length / 3
  const uvArray = new Float32Array(numVertices * 2)

  const CHUNK_SIZE = 10000 // e.g., process 50k vertices at a time

  let i = 0
  let k = 0

  function processChunk() {
    const end = Math.min(i + CHUNK_SIZE, positions.length)
    for (; i < end; i += 3) {
      const x = positions[i]
      const y = positions[i + 1]

      const u = (x - topLeftX) / (textureWidth * pixelWidth)
      let v = (topLeftY - y) / (textureHeight * Math.abs(pixelHeight))
      v = 1 - v

      uvArray[k++] = u
      uvArray[k++] = v
    }

    // Send progress
    const doneVertices = i / 3
    const percent = Math.round((doneVertices / numVertices) * 100)
    self.postMessage({ type: "progress", percent })

    // If not done, queue the next chunk
    if (i < positions.length) {
      // Let the event loop breathe so the main thread can handle messages
      setTimeout(processChunk, 0)
    } else {
      // Done
      self.postMessage({ type: "result", uvArray }, [uvArray.buffer])
    }
  }

  processChunk()
}
