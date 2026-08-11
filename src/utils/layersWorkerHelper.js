// import * as THREE from 'three';
// import axios from 'axios';
// // Assume you have a worker-loader or similar configured.

// export async function buildLayersForGeometry(entities, flattenToPlane) {
//   //   return new Promise((resolve, reject) => {
//   //     const worker = new Worker(
//   //       new URL('../workers/layersBuilder.worker.js', import.meta.url)
//   //     );
//   //     worker.onmessage = (e) => {
//   //       if (e.data.progress != null) {
//   //       }
//   //       if (e.data.success) {
//   //         worker.terminate();
//   //         // e.data.data is an array of miniGeoms, each { type, positions, colors }
//   //         resolve(e.data.data);
//   //       }
//   //     };
//   //     worker.onerror = (err) => {
//   //       worker.terminate();
//   //       reject(err);
//   //     };
//   //     worker.postMessage({ entities, flattenToPlane, chunkSize: 50000 });
//   //   });
//   // 1) Initialize session
//   const initRes = await axios.post('/api/geometry/init');
//   const { sessionId } = initRes.data;

//   // 2) chunk
//   const chunkSize = 100000;
//   for (let i = 0; i < entities.length; i += chunkSize) {
//     const slice = entities.slice(i, i + chunkSize);
//     await axios.post('/api/geometry/chunk', {
//       sessionId: sessionId,
//       entities: slice,
//     });
//   }

//   // 3) finish => returns streamed JSON
//   // const finishRes = await axios.post('/api/geometry/finish', { sessionId });
//   // // finishRes.data => { success: true, lines: [...], openPolylines: [...], closedPolylines: [...], points: [...] }
//   // return finishRes.data.geometry;
//   // // 3) Use fetch to process NDJSON stream
//   const response = await fetch('/api/geometry/finish', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ sessionId: sessionId }),
//   });

//   const reader = response.body.getReader();
//   const decoder = new TextDecoder('utf-8');
//   let buffer = '';
//   // We'll store the assembled results here
//   const geometryResult = {
//     lines: [],
//     lineColorsChunk: [],
//     openPolylines: [],
//     openPolylinesColors: [],
//     closedPolylines: null,
//     points: null,
//   };

//   while (true) {
//     const { done, value } = await reader.read();
//     if (done) break;
//     buffer += decoder.decode(value, { stream: true });
//     const lines = buffer.split('\n');
//     buffer = lines.pop(); // Save last incomplete line, if any
//     for (const line of lines) {
//       if (line.trim()) {
//         try {
//           const parsed = JSON.parse(line);
//           switch (parsed.type) {
//             case 'lineChunk':
//               // Append chunk to the lines array
//               geometryResult.lines.push(...parsed.data);
//               break;
//             case 'lineColorsChunk':
//               geometryResult.lineColorsChunk.push(...parsed.data);
//               break;

//             case 'openPolylines':
//               // geometryResult.openPolylines = parsed.data;
//               geometryResult.openPolylines.push(...parsed.data);
//               break;
//             case 'openPolylinesColors':
//               // geometryResult.openPolylinesColors = parsed.data;
//               geometryResult.openPolylinesColors.push(...parsed.data);
//               break;
//             case 'closedPolylines':
//               geometryResult.closedPolylines = parsed.data;
//               break;
//             case 'points':
//               geometryResult.points = parsed.data;
//               break;
//             default:
//               console.warn('Unknown type:', parsed.type);
//           }
//         } catch (e) {
//           console.error('Error parsing NDJSON chunk:', e);
//         }
//       }
//     }
//   }

//   // Process any remaining buffered text
//   if (buffer.trim()) {
//     try {
//       const parsed = JSON.parse(buffer);
//       switch (parsed.type) {
//         case 'lineChunk':
//           geometryResult.lines.push(...parsed.data);
//           // geometryResult.lines = parsed.data;
//           break;
//         case 'lineColorsChunk':
//           geometryResult.lineColorsChunk.push(...parsed.data);
//           break;
//         case 'openPolylines':
//           // geometryResult.openPolylines = parsed.data;
//           geometryResult.openPolylines.push(...parsed.data);
//           break;
//         case 'openPolylinesColors':
//           // geometryResult.openPolylinesColors = parsed.data;
//           geometryResult.openPolylinesColors.push(...parsed.data);
//           break;
//         case 'closedPolylines':
//           geometryResult.closedPolylines = parsed.data;
//           break;
//         case 'points':
//           geometryResult.points = parsed.data;
//           break;
//         default:
//           console.warn('Unknown type:', parsed.type);
//       }
//     } catch (e) {
//       console.error('Error parsing final NDJSON chunk:', e);
//     }
//   }

//   return geometryResult;
// }

export {};
