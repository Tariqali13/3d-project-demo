import * as THREE from 'three';
import pako from 'pako';
// Function to create a binary file from typed array

const serializeBufferGeometryBinary = (geometry, isLayer = false) => {
  const positions = geometry.attributes?.position?.array || new Float32Array();
  const normals = geometry.attributes?.normal?.array || new Float32Array();
  const colors = geometry.attributes?.color?.array || new Float32Array();
  const uv = isLayer
    ? geometry.attributes?.uv?.array || new Float32Array()
    : new Float32Array();
  const index = geometry?.index?.array || new Uint32Array();

  // Calculate buffer length (+ 16 bytes to store lengths metadata: positions, normals, colors, index)
  const bufferLength =
    20 +
    positions.byteLength +
    normals.byteLength +
    (colors ? colors.byteLength : 0) +
    (uv ? uv.byteLength : 0) +
    (index ? index.byteLength : 0);

  const buffer = new ArrayBuffer(bufferLength);
  const view = new DataView(buffer);
  let offset = 0;

  // Store metadata lengths

  // if (positions.length > 0) {
  view.setUint32(offset, positions.length, true);
  offset += 4;
  // }
  // if (normals.length > 0) {
  view.setUint32(offset, normals.length, true);
  offset += 4;
  // }
  // if (colors.length > 0) {
  view.setUint32(offset, colors.length, true);
  offset += 4;

  view.setUint32(offset, uv.length, true);
  offset += 4;
  // }
  // if (index.length > 0) {
  view.setUint32(offset, index.length, true);
  offset += 4;
  // }

  if (positions.length > 0) {
    // Store positions
    new Float32Array(buffer, offset, positions.length).set(positions);
    offset += positions.byteLength;
  }
  if (normals.length > 0) {
    // Store normals
    new Float32Array(buffer, offset, normals.length).set(normals);
    offset += normals.byteLength;
  }
  // Store colors if exist
  if (colors.length > 0) {
    new Float32Array(buffer, offset, colors.length).set(colors);
    offset += colors.byteLength;
  }

  if (uv.length > 0) {
    new Float32Array(buffer, offset, uv.length).set(uv);
    offset += uv.byteLength;
  }

  // Store indices
  if (index.length > 0) {
    if (index instanceof Uint32Array) {
      new Uint32Array(buffer, offset, index.length).set(index);
    } else if (index instanceof Uint16Array) {
      new Uint16Array(buffer, offset, index.length).set(index);
    } else {
      console.error('Unsupported index array type');
      return;
    }
  }
  return buffer;
};

export const saveCombinedGeometryAndMetadata = async (
  fileName,
  fileLayers,
  surfaceLibrary,
  progressCallback
) => {
  const layers =
    fileLayers.find(
      (f) =>
        f.fileName
          .replace(/\.xml$/, '')
          .replace(/\.dxf$/, '')
          .replace(/\.pslz$/, '') ===
        fileName
          .replace(/\.xml$/, '')
          .replace(/\.dxf$/, '')
          .replace(/\.pslz$/, '')
    )?.layers || [];
  const surfaces = surfaceLibrary.filter(
    (s) =>
      s.fileName
        .replace(/\.xml$/, '')
        .replace(/\.dxf$/, '')
        .replace(/\.pslz$/, '') ===
      fileName
        .replace(/\.xml$/, '')
        .replace(/\.dxf$/, '')
        .replace(/\.pslz$/, '')
  );

  const layerBuffers = [];
  const surfaceBuffers = [];

  let totalTasks = layers.length + surfaces.length;
  let completedTasks = 0;

  for (const layer of layers) {
    const geometries = [];

    for (const child of layer._group.children) {
      geometries.push({
        type: child.type,
        color: child.material?.color?.getHex() || 0xffffff,
        buffer: serializeBufferGeometryBinary(child.geometry, true),
      });
      completedTasks++;
      progressCallback(Math.round((completedTasks / totalTasks) * 50)); // 50% for layers
    }

    layerBuffers.push({
      enableValue: layer.enableValue,
      fileName: layer.fileName,
      id: layer.id,
      layerName: layer.layerName,
      geometries,
    });
  }

  for (const surface of surfaces) {
    surfaceBuffers.push({
      enableValue: surface.enableValue,
      fileName: surface.fileName,
      id: surface.id,
      surfaceName: surface.surfaceName,
      geometry: {
        type: 'Mesh',
        color: surface._object.material?.color?.getHex() || 0xffffff,
        buffer: serializeBufferGeometryBinary(surface._object.geometry, false),
      },
    });
    completedTasks++;
    progressCallback(50 + Math.round((completedTasks / totalTasks) * 50)); // 50% to 100% for surfaces
  }

  const metadata = JSON.stringify({
    layers: layerBuffers.map(({ geometries, ...rest }) => ({
      ...rest,
      geometries: geometries.map(({ buffer, ...geomRest }) => geomRest),
    })),
    surfaces: surfaceBuffers.map(({ geometry, ...rest }) => ({
      ...rest,
      geometry: { type: geometry.type, color: geometry.color },
    })),
  });

  const metadataBlob = new TextEncoder().encode(metadata);
  const metadataLength = metadataBlob.byteLength;

  let totalLength = 4 + metadataLength;
  layerBuffers.forEach((layer) =>
    layer.geometries.forEach((g) => (totalLength += 4 + g.buffer.byteLength))
  );
  surfaceBuffers.forEach(
    (surface) => (totalLength += 4 + surface.geometry.buffer.byteLength)
  );

  const finalBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(finalBuffer);
  let offset = 0;

  view.setUint32(offset, metadataLength, true);
  offset += 4;
  new Uint8Array(finalBuffer, offset, metadataLength).set(metadataBlob);
  offset += metadataLength;

  layerBuffers.forEach((layer) => {
    layer.geometries.forEach((g) => {
      view.setUint32(offset, g.buffer.byteLength, true);
      offset += 4;
      new Uint8Array(finalBuffer, offset, g.buffer.byteLength).set(
        new Uint8Array(g.buffer)
      );
      offset += g.buffer.byteLength;
    });
  });

  surfaceBuffers.forEach((surface) => {
    view.setUint32(offset, surface.geometry.buffer.byteLength, true);
    offset += 4;
    new Uint8Array(finalBuffer, offset, surface.geometry.buffer.byteLength).set(
      new Uint8Array(surface.geometry.buffer)
    );
    offset += surface.geometry.buffer.byteLength;
  });

  progressCallback(100);

  const uint8Array = new Uint8Array(finalBuffer);
  const compressedData = pako.gzip(uint8Array);

  // Create a Blob from the compressed data
  const blob = new Blob([compressedData], { type: 'application/gzip' });
  // const link = document.createElement('a');
  // link.href = URL.createObjectURL(blob);
  // link.download = `${fileName}_compressed_geometry.bin`; // Indicate that it's compressed
  // document.body.appendChild(link);
  // link.click();
  // link.remove();
  return blob;
  // return new Blob([finalBuffer], { type: 'application/octet-stream' });
};

const deserializeBufferGeometryBinary = (buffer) => {
  const view = new DataView(buffer);
  let offset = 0;

  // Read metadata lengths
  const positionsLength = view.getUint32(offset, true);
  offset += 4;
  const normalsLength = view.getUint32(offset, true);
  offset += 4;
  const colorsLength = view.getUint32(offset, true);
  offset += 4;
  const uvLength = view.getUint32(offset, true);
  offset += 4;
  const indexLength = view.getUint32(offset, true);
  offset += 4;

  let positions = null;
  if (positionsLength > 0) {
    positions = new Float32Array(buffer, offset, positionsLength);
    offset += positions.byteLength;
  }

  // Normals
  let normals = null;
  if (normalsLength > 0) {
    normals = new Float32Array(buffer, offset, normalsLength);
    offset += normals.byteLength;
  }

  // Colors
  let colors = null;
  if (colorsLength > 0) {
    colors = new Float32Array(buffer, offset, colorsLength);
    offset += colors.byteLength;
  }

  let uv = null;
  if (uvLength > 0) {
    uv = new Float32Array(buffer, offset, uvLength);
    offset += uv.byteLength;
  }

  // Load indices
  let index = null;
  const indexLength2 = (buffer.byteLength - offset) / 4; // remaining length
  if (indexLength > 0) {
    const ArrayType = positionsLength / 3 > 65535 ? Uint32Array : Uint16Array;
    index = new ArrayType(buffer, offset, indexLength);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(positions), 3)
  );
  if (normals) {
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  }

  if (colors) {
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }

  if (uv) {
    geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 3));
  }

  if (index) {
    geometry.setIndex(new THREE.BufferAttribute(index, 1));
  }

  geometry.computeVertexNormals();

  return geometry;
};
export const loadCombinedGeometryAndMetadata = async (file) => {
  const compressedBuffer = await file.arrayBuffer();
  const compressedData = new Uint8Array(compressedBuffer);
  const buffer = pako.ungzip(compressedData).buffer; // Decompress to ArrayBuffer
  const view = new DataView(buffer);
  let offset = 0;

  const metadataLength = view.getUint32(offset, true);
  offset += 4;
  const metadataBlob = buffer.slice(offset, offset + metadataLength);
  offset += metadataLength;
  const metadataText = new TextDecoder().decode(metadataBlob);
  const metadata = JSON.parse(metadataText);

  // Correctly reconstruct layers geometries
  for (const layer of metadata.layers) {
    const geometries = []; // temporary holder
    for (let i = 0; i < layer.geometries.length; i++) {
      const geomLength = view.getUint32(offset, true);
      offset += 4;
      const geomBuffer = buffer.slice(offset, offset + geomLength);
      offset += geomLength;

      geometries.push({
        type: layer.geometries[i].type,
        color: layer.geometries[i].color,
        geometry: deserializeBufferGeometryBinary(geomBuffer, true),
      });
    }
    layer.geometries = geometries; // clearly assign back
    layer.enableValue = true; // clearly assign back
  }

  // Correctly reconstruct surfaces geometries
  for (const surface of metadata.surfaces) {
    const geomLength = view.getUint32(offset, true);
    offset += 4;
    const geomBuffer = buffer.slice(offset, offset + geomLength);
    offset += geomLength;

    surface.geometry = {
      type: surface.geometry.type,
      color: surface.geometry.color,
      geometry: deserializeBufferGeometryBinary(geomBuffer, false),
      enableValue: true,
    };
  }

  return metadata;
};

export const saveCombinedBreakLineEdges = async (fileName, surfaceLibrary) => {
  const surfaces = surfaceLibrary.filter(
    (s) =>
      s.fileName
        .replace(/\.xml$/, '')
        .replace(/\.dxf$/, '')
        .replace(/\.pslz$/, '') ===
      fileName
        .replace(/\.xml$/, '')
        .replace(/\.dxf$/, '')
        .replace(/\.pslz$/, '')
  );
  const edgesCombined = [];

  const breakLinesEdges = surfaces.map((surface) => ({
    surfaceId: surface.id,
    breakLineEdges: surface._breakLineEdges,
  }));

  // Serialize the data to a JSON string
  const jsonString = JSON.stringify(breakLinesEdges);
  // Compress the JSON string using pako
  const compressedData = pako.gzip(jsonString);
  // Create a Blob from the compressed data
  const blob = new Blob([compressedData], { type: 'application/gzip' });

  // // For local download (optional)
  // const link = document.createElement('a');
  // link.href = URL.createObjectURL(blob);
  // link.download = `${fileName}_breaklinesgzip.bin`; // Indicate that it's compressed
  // document.body.appendChild(link);
  // link.click();
  // link.remove();
  return blob;
};

// export const loadCombinedBVH = async (file) => {
//   const data = JSON.parse(await file.text());
//   return data; // reconstruct BVH structure if necessary
// };
export const loadCombinedBreakLineEdges = async (file) => {
  // if (!(file instanceof File)) {
  //   throw new Error(
  //     `Invalid argument: expected a File object, got ${typeof file} (${file})`
  //   );
  // }

  // Read the compressed file as an ArrayBuffer
  const compressedBuffer = await file.arrayBuffer();

  // Decompress the buffer using pako
  const compressedData = new Uint8Array(compressedBuffer);
  const decompressedData = pako.ungzip(compressedData);

  // Convert the decompressed data to a string and parse as JSON
  const jsonString = new TextDecoder().decode(decompressedData);
  const data = JSON.parse(jsonString);

  return data;
};

// Magic number for BVH binary files (4 bytes: "BVH1")
const MAGIC_NUMBER = 0x42564831; // "BVH1" in ASCII (little-endian)

export const saveCombinedBVH = async (fileName, surfaceLibrary) => {
  const surfaces = surfaceLibrary.filter(
    (s) =>
      s.fileName
        .replace(/\.xml$/, '')
        .replace(/\.dxf$/, '')
        .replace(/\.pslz$/, '') ===
      fileName
        .replace(/\.xml$/, '')
        .replace(/\.dxf$/, '')
        .replace(/\.pslz$/, '')
  );

  const serializedBVHs = surfaces.map((surface) => ({
    surfaceId: surface.id,
    bvhRoot: surface.bvhRoot,
  }));

  const numSurfaces = serializedBVHs.length;
  // console.log(`Saving numSurfaces: ${numSurfaces}`);
  if (numSurfaces > 10000) {
    throw new Error(`Invalid numSurfaces to save: ${numSurfaces} (too large)`);
  }

  let totalSize = 8; // 4 bytes for magic number + 4 bytes for numSurfaces
  const surfaceData = [];

  for (const surface of serializedBVHs) {
    const surfaceIdBytes = new TextEncoder().encode(surface.surfaceId);
    const surfaceIdLength = surfaceIdBytes.length;

    if (surfaceIdLength > 1000) {
      throw new Error(
        `Surface ID length too large: ${surfaceIdLength} for surface ${surface.surfaceId}`
      );
    }

    let nodeCount = 0;
    let leafNodeCount = 0;
    let trianglesCount = 0;
    // Calculate size and log triangles data
    const calculateSize = (node, depth = 0) => {
      if (!node) return;
      nodeCount++;
      if (node.isLeaf) {
        leafNodeCount++;
        const triangles = node.triangles || [];
        trianglesCount += triangles.length;
        // console.log(`Leaf node at depth ${depth}: triangles =`, triangles);
      }
      if (!node.isLeaf) {
        calculateSize(node.left, depth + 1);
        calculateSize(node.right, depth + 1);
      }
    };
    // console.log(`Inspecting BVH tree for surface ${surface.surfaceId}:`);
    calculateSize(surface.bvhRoot);

    const surfaceSize =
      4 + // surfaceId length
      surfaceIdLength +
      4 + // number of nodes
      nodeCount * (24 + 1) + // bounds (6 floats) + isLeaf
      leafNodeCount * 4 + // 4 bytes for each triangle array length (only for leaf nodes)
      trianglesCount * (3 * 3 * 4); // triangles: 3 vertices (vA, vB, vC) * 3 floats (x, y, z) * 4 bytes

    totalSize += surfaceSize;
    surfaceData.push({
      surfaceId: surfaceIdBytes,
      nodeCount,
      leafNodeCount,
      trianglesCount,
      bvhRoot: surface.bvhRoot,
    });
  }

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  let offset = 0;

  // Write magic number
  view.setUint32(offset, MAGIC_NUMBER, true);
  offset += 4;

  // Write number of surfaces
  view.setUint32(offset, serializedBVHs.length, true);
  offset += 4;

  const firstBytes = new Uint8Array(buffer, 0, 8);
  const hexDump = Array.from(firstBytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join(' ');

  for (const {
    surfaceId,
    nodeCount,
    leafNodeCount,
    trianglesCount,
    bvhRoot,
  } of surfaceData) {
    view.setUint32(offset, surfaceId.length, true);
    offset += 4;
    new Uint8Array(buffer, offset, surfaceId.length).set(surfaceId);
    offset += surfaceId.length;

    view.setUint32(offset, nodeCount, true);
    offset += 4;

    let nodesWritten = 0;
    let leafNodesWritten = 0;
    let trianglesWritten = 0;
    const serializeNode = (node) => {
      if (!node) return;

      // Write bounds
      view.setFloat32(offset, node.bounds.max.x, true);
      offset += 4;
      view.setFloat32(offset, node.bounds.max.y, true);
      offset += 4;
      view.setFloat32(offset, node.bounds.max.z, true);
      offset += 4;
      view.setFloat32(offset, node.bounds.min.x, true);
      offset += 4;
      view.setFloat32(offset, node.bounds.min.y, true);
      offset += 4;
      view.setFloat32(offset, node.bounds.min.z, true);
      offset += 4;

      // Write isLeaf
      view.setUint8(offset, node.isLeaf ? 1 : 0);
      offset += 1;

      if (node.isLeaf) {
        const triangles = node.triangles || [];
        view.setUint32(offset, triangles.length, true);
        offset += 4;
        for (const triangle of triangles) {
          // Write vA
          view.setFloat32(offset, triangle.vA.x, true);
          offset += 4;
          view.setFloat32(offset, triangle.vA.y, true);
          offset += 4;
          view.setFloat32(offset, triangle.vA.z, true);
          offset += 4;
          // Write vB
          view.setFloat32(offset, triangle.vB.x, true);
          offset += 4;
          view.setFloat32(offset, triangle.vB.y, true);
          offset += 4;
          view.setFloat32(offset, triangle.vB.z, true);
          offset += 4;
          // Write vC
          view.setFloat32(offset, triangle.vC.x, true);
          offset += 4;
          view.setFloat32(offset, triangle.vC.y, true);
          offset += 4;
          view.setFloat32(offset, triangle.vC.z, true);
          offset += 4;
          trianglesWritten++;
        }
        leafNodesWritten++;
      }

      nodesWritten++;
      if (!node.isLeaf) {
        serializeNode(node.left);
        serializeNode(node.right);
      }
    };

    serializeNode(bvhRoot);

    if (nodesWritten !== nodeCount) {
      throw new Error(
        `Node count mismatch: expected ${nodeCount}, wrote ${nodesWritten}`
      );
    }
    if (leafNodesWritten !== leafNodeCount) {
      throw new Error(
        `Leaf node count mismatch: expected ${leafNodeCount}, wrote ${leafNodesWritten}`
      );
    }
    if (trianglesWritten !== trianglesCount) {
      throw new Error(
        `Triangle count mismatch: expected ${trianglesCount}, wrote ${trianglesWritten}`
      );
    }
  }

  if (offset !== totalSize) {
    throw new Error(
      `Buffer size mismatch: expected ${totalSize}, but wrote ${offset} bytes`
    );
  }

  // Compress the buffer using pako
  const uint8Array = new Uint8Array(buffer);
  const compressedData = pako.gzip(uint8Array);

  // Create a Blob from the compressed data
  const blob = new Blob([compressedData], { type: 'application/gzip' });

  // For local download (optional)
  // const link = document.createElement('a');
  // link.href = URL.createObjectURL(blob);
  // link.download = `${fileName}_bvh_data.bin`; // Indicate that it's compressed
  // document.body.appendChild(link);
  // link.click();
  // link.remove();

  return blob;
};

export const loadCombinedBVH = async (file) => {
  // console.log(`Loading BVH from file:`, file);
  // if (!(file instanceof File)) {
  //   throw new Error(
  //     `Invalid argument: expected a File object, got ${typeof file} (${file})`
  //   );
  // }

  // Read the compressed file as an ArrayBuffer
  const compressedBuffer = await file.arrayBuffer();

  // Decompress the buffer using pako
  const compressedData = new Uint8Array(compressedBuffer);
  const buffer = pako.ungzip(compressedData).buffer; // Decompress to ArrayBuffer

  if (buffer.byteLength < 8) {
    throw new Error(
      `File too small to contain magic number and numSurfaces: ${buffer.byteLength} bytes`
    );
  }

  const firstBytes = new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength));
  const hexDump = Array.from(firstBytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join(' ');

  const view = new DataView(buffer);
  let offset = 0;

  const magicNumber = view.getUint32(offset, true);
  offset += 4;
  if (magicNumber !== MAGIC_NUMBER) {
    throw new Error(
      `Invalid magic number: expected ${MAGIC_NUMBER.toString(
        16
      )}, got ${magicNumber.toString(16)}`
    );
  }

  const numSurfaces = view.getUint32(offset, true);
  offset += 4;

  if (numSurfaces > 10000) {
    throw new Error(`Invalid numSurfaces: ${numSurfaces} (too large)`);
  }

  const serializedBVHs = [];

  for (let i = 0; i < numSurfaces; i++) {
    const surfaceIdLength = view.getUint32(offset, true);
    offset += 4;

    if (surfaceIdLength > 1000) {
      throw new Error(
        `Invalid surfaceIdLength: ${surfaceIdLength} at offset ${offset - 4}`
      );
    }
    if (offset + surfaceIdLength > buffer.byteLength) {
      throw new Error(
        `SurfaceIdLength ${surfaceIdLength} exceeds buffer length at offset ${offset}`
      );
    }

    const surfaceIdBytes = new Uint8Array(buffer, offset, surfaceIdLength);
    const surfaceId = new TextDecoder().decode(surfaceIdBytes);
    offset += surfaceIdLength;
    // console.log(
    //   `Read surfaceId: ${surfaceId} at offset ${offset - surfaceIdLength}`
    // );

    const nodeCount = view.getUint32(offset, true);
    offset += 4;
    // console.log(`Read nodeCount: ${nodeCount} at offset ${offset - 4}`);

    if (nodeCount > 1_000_000) {
      throw new Error(
        `Invalid nodeCount: ${nodeCount} (too large) at offset ${offset - 4}`
      );
    }

    let nodesRead = 0;
    const deserializeNode = () => {
      if (offset >= buffer.byteLength) {
        throw new Error(
          `Offset ${offset} exceeds buffer length ${buffer.byteLength}`
        );
      }

      const bounds = {
        max: {
          x: view.getFloat32(offset, true),
          y: view.getFloat32(offset + 4, true),
          z: view.getFloat32(offset + 8, true),
        },
        min: {
          x: view.getFloat32(offset + 12, true),
          y: view.getFloat32(offset + 16, true),
          z: view.getFloat32(offset + 20, true),
        },
      };
      offset += 24;

      const isLeaf = view.getUint8(offset) === 1;
      offset += 1;

      const node = { bounds, isLeaf };

      if (isLeaf) {
        const numTriangles = view.getUint32(offset, true);
        offset += 4;
        // console.log(
        //   `Reading leaf node with ${numTriangles} triangles at offset ${
        //     offset - 4
        //   }`
        // );
        if (numTriangles > 1_000_000) {
          throw new Error(
            `Invalid numTriangles: ${numTriangles} (too large) at offset ${
              offset - 4
            }`
          );
        }

        const triangles = [];
        for (let j = 0; j < numTriangles; j++) {
          if (offset + 36 > buffer.byteLength) {
            // 36 bytes per triangle (3 vertices * 3 floats * 4 bytes)
            throw new Error(
              `Offset ${offset} exceeds buffer length for triangle ${j}/${numTriangles}`
            );
          }
          const triangle = {
            vA: {
              x: view.getFloat32(offset, true),
              y: view.getFloat32(offset + 4, true),
              z: view.getFloat32(offset + 8, true),
            },
            vB: {
              x: view.getFloat32(offset + 12, true),
              y: view.getFloat32(offset + 16, true),
              z: view.getFloat32(offset + 20, true),
            },
            vC: {
              x: view.getFloat32(offset + 24, true),
              y: view.getFloat32(offset + 28, true),
              z: view.getFloat32(offset + 32, true),
            },
          };
          offset += 36; // 3 vertices * 3 floats * 4 bytes
          triangles.push(triangle);
        }
        // console.log(`Read triangles for leaf node:`, triangles);
        node.triangles = triangles;
      } else {
        node.left = deserializeNode();
        node.right = deserializeNode();
      }

      nodesRead++;
      return node;
    };

    const bvhRoot = deserializeNode();
    // console.log(`Nodes read for surface ${surfaceId}: ${nodesRead}`);
    if (nodesRead !== nodeCount) {
      throw new Error(
        `Node count mismatch: expected ${nodeCount}, read ${nodesRead}`
      );
    }
    serializedBVHs.push({ surfaceId, bvhRoot });
  }

  // console.log('Final offset after reading:', offset);
  // console.log('Deserialized BVH data:', serializedBVHs);
  return serializedBVHs;
};

// Function to save multiple Blobs with their surfaceIds as a single compressed file
export const saveCompressedBlob = async (fileName, surfaceLibrary) => {
  // Filter surfaces matching the fileName (removing extensions for comparison)
  const findSurfaces = surfaceLibrary.filter(
    (s) =>
      s.fileName
        .replace(/\.xml$/, '')
        .replace(/\.dxf$/, '')
        .replace(/\.pslz$/, '') ===
        fileName
          .replace(/\.xml$/, '')
          .replace(/\.dxf$/, '')
          .replace(/\.pslz$/, '') && s.blobData
  );

  if (findSurfaces.length === 0) {
    throw new Error(`No surfaces found for fileName: ${fileName}`);
  }

  // Check if the Compression Streams API is available (for streaming compression)
  const supportsCompressionStream = 'CompressionStream' in window;

  // Create a WritableStream to collect the compressed data
  const compressedStream = supportsCompressionStream
    ? new CompressionStream('gzip')
    : null;
  const outputStream = compressedStream
    ? compressedStream.writable
    : new WritableStream({
        write(chunk) {
          // Fallback: Collect chunks for manual compression with pako
          if (!this.chunks) this.chunks = [];
          this.chunks.push(chunk);
        },
        close() {
          if (this.chunks) {
            const combined = new Uint8Array(
              this.chunks.reduce((acc, chunk) => acc + chunk.length, 0)
            );
            let offset = 0;
            for (const chunk of this.chunks) {
              combined.set(chunk, offset);
              offset += chunk.length;
            }
            this.compressedData = pako.gzip(combined);
          }
        },
      });

  const writer = outputStream.getWriter();

  // Write the number of blob entries (4 bytes)
  const numEntries = findSurfaces.length;
  const headerBuffer = new ArrayBuffer(4);
  new DataView(headerBuffer).setUint32(0, numEntries, true);
  await writer.write(new Uint8Array(headerBuffer));

  // Process each surface's blob
  for (const surface of findSurfaces) {
    const blobData = surface.blobData;
    if (!blobData || !blobData.blob || !(blobData.blob instanceof Blob)) {
      console.warn(`Surface ${surface.id} has invalid blobData:`, blobData);
      continue;
    }

    const blob = blobData.blob;
    const surfaceId = surface.id;
    const blobType = blobData.blobType || blob.type;

    // Encode surfaceId and blobType as strings with their lengths
    const surfaceIdBytes = new TextEncoder().encode(surfaceId);
    const blobTypeBytes = new TextEncoder().encode(blobType);

    // Write the binary structure:
    // - surfaceId length (4 bytes)
    // - surfaceId (variable length)
    // - blobType length (4 bytes)
    // - blobType (variable length)
    // - blob data length (8 bytes)
    // - blob data (variable length)
    const metadataBuffer = new ArrayBuffer(
      4 + surfaceIdBytes.length + 4 + blobTypeBytes.length + 8
    );
    const metadataView = new DataView(metadataBuffer);
    let offset = 0;

    metadataView.setUint32(offset, surfaceIdBytes.length, true);
    offset += 4;
    new Uint8Array(metadataBuffer, offset, surfaceIdBytes.length).set(
      surfaceIdBytes
    );
    offset += surfaceIdBytes.length;

    metadataView.setUint32(offset, blobTypeBytes.length, true);
    offset += 4;
    new Uint8Array(metadataBuffer, offset, blobTypeBytes.length).set(
      blobTypeBytes
    );
    offset += blobTypeBytes.length;

    // eslint-disable-next-line no-undef
    metadataView.setBigUint64(offset, BigInt(blob.size), true);
    offset += 8;

    await writer.write(new Uint8Array(metadataBuffer));

    // Stream the blob data in chunks
    const CHUNK_SIZE = 1024 * 1024; // 1 MB chunks
    const stream = blob.stream();
    const reader = stream.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      await writer.write(value); // Write the chunk directly to the compressed stream
    }
  }

  // Close the writer to finalize the compression
  await writer.close();

  // Create a Blob from the compressed data
  let compressedBlob;
  if (supportsCompressionStream) {
    // Use the compressed stream directly
    compressedBlob = await new Response(outputStream).blob();
  } else {
    // Fallback: Use the manually compressed data from pako
    const compressedData = outputStream.chunks.compressedData;
    compressedBlob = new Blob([compressedData], { type: 'application/gzip' });
  }

  return compressedBlob;
};
// export const saveCompressedBlob = async (fileName, surfaceLibrary) => {
//   // Filter surfaces matching the fileName (removing extensions for comparison)
//   const findSurfaces = surfaceLibrary.filter(
//     (s) =>
//       s.fileName
//         .replace(/\.xml$/, '')
//         .replace(/\.dxf$/, '')
//         .replace(/\.pslz$/, '') ===
//         fileName
//           .replace(/\.xml$/, '')
//           .replace(/\.dxf$/, '')
//           .replace(/\.pslz$/, '') && s.blobData
//   );

//   if (findSurfaces.length === 0) {
//     throw new Error(`No surfaces found for fileName: ${fileName}`);
//   }

//   // Collect all Blobs with their surfaceIds
//   const blobEntries = [];
//   for (const surface of findSurfaces) {
//     const blobData = surface.blobData;
//     if (!blobData || !blobData.blob || !(blobData.blob instanceof Blob)) {
//       console.warn(`Surface ${surface.id} has invalid blobData:`, blobData);
//       continue;
//     }

//     const blob = blobData.blob;
//     const surfaceId = surface.id; // Use surface.id as surfaceId

//     // Read the Blob as an ArrayBuffer and convert to Uint8Array
//     const arrayBuffer = await blob.arrayBuffer();
//     const uint8Array = new Uint8Array(arrayBuffer);

//     blobEntries.push({
//       surfaceId,
//       blobType: blob.type, // Store the Blob's type for reconstruction
//       blobData: Array.from(uint8Array), // Convert to array for JSON serialization
//     });
//   }

//   if (blobEntries.length === 0) {
//     throw new Error('No valid Blobs found to save');
//   }

//   // Create a JSON object containing all Blob entries
//   const data = {
//     blobs: blobEntries,
//   };

//   // Serialize the data to JSON
//   const jsonString = JSON.stringify(data);
//   const jsonBytes = new TextEncoder().encode(jsonString);

//   // Compress the JSON data using pako
//   let compressedData;
//   try {
//     compressedData = pako.gzip(jsonBytes);
//   } catch (error) {
//     console.error('Failed to compress Blob data:', error);
//     throw error;
//   }

//   // Create a new Blob for the compressed data
//   const compressedBlob = new Blob([compressedData], {
//     type: 'application/gzip',
//   });

//   // Save the compressed Blob as a file
//   // const link = document.createElement('a');
//   // link.href = URL.createObjectURL(compressedBlob);
//   // link.download = `${fileName}_image.bin.gz`;
//   // document.body.appendChild(link);
//   // link.click();
//   // link.remove();

//   // console.log('Saved compressed file size (bytes):', compressedBlob.size);
//   return compressedBlob;
// };

// Function to load a compressed file and reconstruct the array of { surfaceId, blob } objects

// Function to load and parse the compressed blob data (binary format)
export const loadCompressedBlob = async (file) => {
  try {
    // if (!(file instanceof File)) {
    //   throw new Error(
    //     `Invalid argument: expected a File object, got ${typeof file} (${file})`
    //   );
    // }

    // Read the compressed file as an ArrayBuffer
    const compressedBuffer = await file.arrayBuffer();

    // Decompress the data using pako
    const decompressedData = pako.ungzip(compressedBuffer);
    const view = new DataView(decompressedData.buffer);
    let offset = 0;

    // Read the number of blob entries (4 bytes)
    const numEntries = view.getUint32(offset, true);
    offset += 4;

    const blobEntries = [];

    // Process each blob entry
    for (let i = 0; i < numEntries; i++) {
      // Read surfaceId length (4 bytes)
      const surfaceIdLength = view.getUint32(offset, true);
      offset += 4;

      // Read surfaceId (variable length)
      const surfaceIdBytes = new Uint8Array(
        decompressedData.buffer,
        offset,
        surfaceIdLength
      );
      const surfaceId = new TextDecoder().decode(surfaceIdBytes);
      offset += surfaceIdLength;

      // Read blobType length (4 bytes)
      const blobTypeLength = view.getUint32(offset, true);
      offset += 4;

      // Read blobType (variable length)
      const blobTypeBytes = new Uint8Array(
        decompressedData.buffer,
        offset,
        blobTypeLength
      );
      const blobType = new TextDecoder().decode(blobTypeBytes);
      offset += blobTypeLength;

      // Read blob data length (8 bytes)
      const blobDataLength = Number(view.getBigUint64(offset, true));
      offset += 8;

      // Read blob data (variable length)
      const blobData = new Uint8Array(
        decompressedData.buffer,
        offset,
        blobDataLength
      );
      offset += blobDataLength;

      // Create a Blob from the binary data
      const blob = new Blob([blobData], { type: blobType });

      // Add the entry to the result
      blobEntries.push({
        surfaceId,
        blobType,
        blob,
      });
    }

    return blobEntries;
  } catch (error) {
    console.error('Failed to load compressed blob:', error);
    throw new Error(`Failed to load compressed blob: ${error.message}`);
  }
};
// export const loadCompressedBlob = async (file) => {
//   // if (!(file instanceof File)) {
//   //   throw new Error(
//   //     `Invalid argument: expected a File object, got ${typeof file} (${file})`
//   //   );
//   // }

//   // Read the compressed file as an ArrayBuffer
//   const compressedBuffer = await file.arrayBuffer();

//   // Decompress the buffer using pako
//   let decompressedData;
//   try {
//     decompressedData = pako.ungzip(new Uint8Array(compressedBuffer));
//   } catch (error) {
//     console.error('Failed to decompress data:', error);
//     throw error;
//   }
//   // Parse the decompressed data as JSON
//   const jsonString = new TextDecoder().decode(decompressedData);
//   let data;
//   try {
//     data = JSON.parse(jsonString);
//   } catch (error) {
//     console.error('Failed to parse decompressed data as JSON:', error);
//     throw error;
//   }

//   // Reconstruct the array of { surfaceId, blob } objects
//   const blobEntries = data.blobs.map((entry) => {
//     const { surfaceId, blobType, blobData } = entry;
//     const uint8Array = new Uint8Array(blobData);
//     const blob = new Blob([uint8Array], { type: blobType });
//     return { surfaceId, blob };
//   });

//   return blobEntries;
// };

// Function to save UV data for multiple surfaces as a single compressed file
export const saveCompressedUVData = async (fileName, surfaceLibrary) => {
  // Filter surfaces matching the fileName
  const findSurfaces = surfaceLibrary.filter(
    (s) =>
      s.fileName
        .replace(/\.xml$/, '')
        .replace(/\.dxf$/, '')
        .replace(/\.pslz$/, '') ===
      fileName
        .replace(/\.xml$/, '')
        .replace(/\.dxf$/, '')
        .replace(/\.pslz$/, '')
  );

  if (findSurfaces.length === 0) {
    throw new Error(`No surfaces found for fileName: ${fileName}`);
  }

  // Collect all UV data with their surfaceIds
  const uvEntries = [];
  for (const surface of findSurfaces) {
    const uvData = surface.uvArrayData.uvArray;
    if (!(uvData instanceof Float32Array)) {
      console.warn(`Surface ${surface.id} has invalid uvData:`, uvData);
      continue;
    }

    const surfaceId = surface.id;

    // Convert Float32Array to a Uint8Array (raw binary data)
    const uvBuffer = uvData.buffer;
    const uvBinary = new Uint8Array(uvBuffer);

    uvEntries.push({
      surfaceId,
      uvLength: uvData.length, // Store the length for reconstruction
      uvBinary: uvBinary, // Convert to array for JSON serialization
    });
  }

  if (uvEntries.length === 0) {
    throw new Error('No valid UV data found to save');
  }

  // Create a JSON object containing all UV entries
  const data = {
    uvs: uvEntries,
  };

  // Serialize the data to JSON
  const jsonString = JSON.stringify(data);
  const jsonBytes = new TextEncoder().encode(jsonString);

  // Compress the JSON data using pako
  let compressedData;
  try {
    compressedData = pako.gzip(jsonBytes);
  } catch (error) {
    console.error('Failed to compress UV data:', error);
    throw error;
  }

  // Create a new Blob for the compressed data
  const compressedBlob = new Blob([compressedData], {
    type: 'application/gzip',
  });

  // Save the compressed Blob as a file
  // const link = document.createElement('a');
  // link.href = URL.createObjectURL(compressedBlob);
  // link.download = `${fileName}_uv.bin.gz`;
  // document.body.appendChild(link);
  // link.click();
  // link.remove();

  // console.log('Saved compressed file size (bytes):', compressedBlob.size);
  return compressedBlob;
};

// Function to load a compressed file and reconstruct the array of { surfaceId, uvArray } objects
export const loadCompressedUVData = async (file) => {
  const compressedBuffer = await file.arrayBuffer();

  let decompressedData;
  try {
    decompressedData = pako.ungzip(new Uint8Array(compressedBuffer));
  } catch (error) {
    console.error('Failed to decompress UV data:', error);
    throw error;
  }

  const jsonString = new TextDecoder().decode(decompressedData);
  let data;
  try {
    data = JSON.parse(jsonString);
  } catch (error) {
    console.error('Failed to parse decompressed UV data as JSON:', error);
    throw error;
  }

  // ✅ Old format: { uvs: [ { surfaceId, uvLength, uvBinary } ] }
  if (Array.isArray(data.uvs)) {
    return data.uvs.map((entry) => {
      const { surfaceId, uvLength, uvBinary } = entry;
      const binaryArray = new Uint8Array(uvBinary);
      const arrayBuffer = binaryArray.buffer;
      const uvArray = new Float32Array(arrayBuffer, 0, uvLength);
      return { surfaceId, uvArray };
    });
  }

  // ✅ New format: flat chunked array
  if (Array.isArray(data)) {
    const surfaceUvMap = new Map();

    for (const { surfaceId, chunkIndex, uvData } of data) {
      if (!surfaceUvMap.has(surfaceId)) {
        surfaceUvMap.set(surfaceId, []);
      }
      surfaceUvMap.get(surfaceId)[chunkIndex] = uvData;
    }

    return Array.from(surfaceUvMap.entries()).map(([surfaceId, chunks]) => {
      const flatArray = chunks.flat(); // Join all chunk arrays
      const uvArray = new Float32Array(flatArray);
      return { surfaceId, uvArray };
    });
  }

  // ❌ Invalid format
  throw new Error('Unsupported UV data format.');
};
