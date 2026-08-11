// loadTexture.worker.js
/* eslint-disable no-restricted-globals */
// self.onmessage = async function (e) {
//   const { url } = e.data;
//   try {
//     const response = await fetch(url);
//     const contentLength = +response.headers.get('Content-Length');

//     let loaded = 0;
//     const chunks = [];
//     const reader = response.body.getReader();

//     while (true) {
//       const { done, value } = await reader.read();
//       if (done) break;
//       chunks.push(value);
//       loaded += value.length;
//       if (contentLength) {
//         const progress = Math.round((loaded / contentLength) * 100);
//         self.postMessage({ type: 'progress', progress });
//       } else {
//         // No content-length; send an indeterminate progress update
//         self.postMessage({ type: 'progress', progress: -1 });
//       }
//     }

//     const blob = new Blob(chunks);
//     // Offload decoding via createImageBitmap (runs off main thread in many browsers)
//     const imageBitmap = await createImageBitmap(blob);
//     // Transfer the ImageBitmap back (note: some browsers support transferable ImageBitmap)
//     self.postMessage({ type: 'result', imageBitmap }, [imageBitmap]);
//   } catch (error) {
//     self.postMessage({ type: 'error', error: error.message });
//   }
// };
// decodeBase64Worker.js

self.onmessage = async (e) => {
  const { base64 } = e.data
  try {
    // Split the data URL into its prefix and the raw base64 data
    const [prefix, rawBase64] = base64.split(",")
    if (!rawBase64) {
      throw new Error("Invalid base64 data URL")
    }

    // Calculate the expected length of the decoded data
    // Base64 encodes 3 bytes for every 4 characters (ignoring padding)
    const expectedLength = Math.floor((rawBase64.length * 3) / 4)

    // Preallocate a Uint8Array to hold the decoded bytes
    const uint8Array = new Uint8Array(expectedLength)

    const CHUNK_SIZE = 10000 // adjust chunk size as needed
    let offset = 0
    let writeOffset = 0

    // Process the base64 string in chunks
    while (offset < rawBase64.length) {
      const slice = rawBase64.slice(offset, offset + CHUNK_SIZE)
      const decoded = atob(slice)
      for (let i = 0; i < decoded.length; i++) {
        uint8Array[writeOffset++] = decoded.charCodeAt(i)
      }

      offset += CHUNK_SIZE
      const percent = Math.round((offset / rawBase64.length) * 100)
      self.postMessage({ type: "progress", percent })

      // Optionally yield control to allow the event loop to breathe:
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    // In case the calculated expectedLength was slightly off,
    // create a subarray of the actual decoded data.
    const finalArray = uint8Array.subarray(0, writeOffset)
    const blob = new Blob([finalArray], { type: "image/jpeg" }) // adjust MIME type if needed

    // Decode the Blob into an ImageBitmap off the main thread
    self.postMessage({ type: "result", blob })
  } catch (error) {
    self.postMessage({ type: "error", error: error.toString() })
  }
}
