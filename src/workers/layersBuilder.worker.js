/* eslint-disable no-restricted-globals */
import { getHexColor } from '../utils/colorsUtils';

/**
 * processChunk: For each entity in this chunk, build a descriptor.
 * We do NOT combine them, so each entity remains separate.
 */
function processChunk(entities) {
  const miniGeoms = [];

  for (const entity of entities) {
    if (entity.type === 'LINE') {
      // Typically line with 2 vertices, but might have more
      miniGeoms.push({
        entityType: 'LINE',
        isClosed: false, // line is never closed
        color: getHexColor(entity) || 0x0000ff,
        vertices: entity.vertices.map((v) => ({
          x: v.x,
          y: v.y,
          z: v.z || 0,
        })),
      });
    } else if (entity.type === 'LWPOLYLINE' || entity.type === 'POLYLINE') {
      // Check if it's closed
      const closed = !!(entity.shape || entity.is3dPolyline);
      miniGeoms.push({
        entityType: 'POLYLINE',
        isClosed: closed,
        color: getHexColor(entity) || 0x0000ff,
        vertices: entity.vertices.map((v) => ({
          x: v.x,
          y: v.y,
          z: v.z || 0,
        })),
      });
    } else if (entity.type === 'POINT') {
      // Just one position
      if (entity.position) {
        miniGeoms.push({
          entityType: 'POINT',
          isClosed: false,
          color: getHexColor(entity) || 0x0000ff,
          vertices: [
            {
              x: entity.position.x,
              y: entity.position.y,
              z: entity.position.z || 0,
            },
          ],
        });
      }
    }
    // Extend for 3DFACE or others if needed...
  }

  return miniGeoms;
}

self.onmessage = (e) => {
  const { entities, chunkSize = 100000 } = e.data;
  const total = entities.length;
  let processed = 0;

  // We'll accumulate all mini geometry descriptors
  const allMiniGeoms = [];

  function processNextChunk() {
    const end = Math.min(processed + chunkSize, total);
    const chunk = entities.slice(processed, end);
    const miniGeoms = processChunk(chunk);
    allMiniGeoms.push(...miniGeoms);

    processed = end;
    // Optionally post progress
    self.postMessage({ progress: Math.floor((processed / total) * 100) });

    if (processed < total) {
      setTimeout(processNextChunk, 0);
    } else {
      // Done, send everything
      self.postMessage({ success: true, data: allMiniGeoms });
    }
  }

  processNextChunk();
};
