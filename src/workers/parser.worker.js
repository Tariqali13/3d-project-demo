// parser.worker.js
/* eslint-disable no-restricted-globals */

import { XMLParser } from 'fast-xml-parser';
import { Helper } from 'dxf';
import DxfParser from 'dxf-parser';

self.onmessage = async (event) => {
  const { fileType, file } = event.data;
  // 'file' is a File or Blob passed from the main thread.

  // Create a FileReader, but we won't do readAsText at once. We do chunk-based reading:
  try {
    // We'll read the file in e.g. 1 MB chunks:
    const chunkSize = 100 * 1024 * 1024; // 1 MB
    let offset = 0;
    const totalSize = file.file.size;

    let partialText = '';
    const decoder = new TextDecoder('utf-8'); // decode raw bytes to UTF-8 text

    while (offset < totalSize) {
      // read a slice [offset, offset+chunkSize)
      const slice = file.file.slice(offset, offset + chunkSize);
      const arrayBuffer = await slice.arrayBuffer();
      // decode to text
      const textChunk = decoder.decode(new Uint8Array(arrayBuffer), {
        stream: true,
        // "stream: true" means we can continue decoding next chunk
      });
      partialText += textChunk;

      offset += chunkSize;

      // Calculate approximate %:
      let percent = Math.floor((offset / totalSize) * 100);
      if (percent > 100) percent = 100;

      // Post progress
      self.postMessage({ progress: percent });
    }

    // Done reading => decode final chunk (if any left in the stream)
    // textDecoder usually handles it, but if you want to flush:
    const finalText = decoder.decode();
    if (finalText) partialText += finalText;

    // Now parse the entire partialText
    if (fileType === 'dxf') {
      // const dxfParser = new DxfParser();
      // const dxf = dxfParser.parseSync(partialText);
      // const parsedResult = dxf.entities;
      // // Parse the DXF file with the dxf library
      const helper = new Helper(partialText);
      const dxfData = helper.parsed;

      const dxfParser = new DxfParser();
      const dxfParserData = dxfParser.parseSync(partialText);
      const parserEntities = dxfParserData.entities || [];
      // Extract entities (dxf library stores entities in dxfData.entities)
      // console.log("dxfData.entities", dxfData.entities)
      const entities = dxfData.entities || [];

      // Create a map of entity handles to entities for quick lookup
      // Create a map of entity handles to entities for quick lookup
      const entityMap = new Map();
      entities.forEach((entity) => {
        if (entity.handle) {
          entityMap.set(entity.handle, entity);
        }
      });

      const parserEntityMap = new Map();
      parserEntities.forEach((entity) => {
        if (entity.handle) {
          parserEntityMap.set(entity.handle, entity);
        }
      });
      // Find all HATCH entities and mark their associated polylines as filled
      const filledPolylines = new Set();
      entities.forEach((entity) => {
        if (entity.type === 'HATCH') {
          // Check for boundary loops and their references
          if (entity.boundary && entity.boundary.loops) {
            entity.boundary.loops.forEach((loop) => {
              // Check if the loop has references to other entities (e.g., LWPOLYLINE)
              if (loop.references && Array.isArray(loop.references)) {
                loop.references.forEach((refHandle) => {
                  filledPolylines.add(refHandle);
                });
              }
            });
          }
        }
      });

      // Update the isFilledShape property: Only polylines with a HATCH are filled shapes
      entities.forEach((entity) => {
        if (entity.type === 'LWPOLYLINE') {
          const parserEntity = parserEntityMap.get(entity.handle);
          if (parserEntity && parserEntity.elevation !== undefined) {
            entity.elevation = parserEntity.elevation;
          } else {
            entity.elevation = 0; // Default to 0 if not found
          }

          // Set isFilledShape
          entity.isFilledShape = filledPolylines.has(entity.handle);
        }

        // Handle other entity types as before
        if (entity.type === 'POLYLINE') {
          entity.isFilledShape = filledPolylines.has(entity.handle);
        }
        if (entity.type === 'LINE') {
          // Set isFilledShape to true if the polyline is associated with a HATCH
          entity.vertices = [entity.start, entity.end];
        }
        if (entity.type === 'POINT' || entity.type === 'INSERT') {
          // Set isFilledShape to true if the polyline is associated with a HATCH
          entity.position = {
            x: entity.x,
            y: entity.y,
            z: entity.z,
          };
        }
        if (entity.type === 'ATTRIB') {
          // Set isFilledShape to true if the polyline is associated with a HATCH
          entity.position = {
            x: entity.text.x,
            y: entity.text.y,
            z: entity.text.z,
          };
        }
      });
      entities.filter(
        (entity) =>
          entity.type == 'LWPOLYLINE' ||
          entity.type == 'POLYLINE' ||
          entity.type == 'LINE' ||
          entity.type == 'POINT' ||
          entity.type == 'INSERT' ||
          entity.type == 'ATTRIB' ||
          entity.type == '3DFACE'
      );
      // Send the result back
      self.postMessage({ success: true, data: dxfData.entities });
    } else if (fileType === 'xml') {
      const options = {
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        ignoreNameSpace: true,
      };
      const xmlParser = new XMLParser(options);
      const parsedResult = xmlParser.parse(partialText);

      self.postMessage({ success: true, data: parsedResult });
    }
  } catch (error) {
    self.postMessage({ success: false, error: error.message });
  }
};
