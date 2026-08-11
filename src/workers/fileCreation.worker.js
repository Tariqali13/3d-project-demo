/* eslint-disable no-restricted-globals */
import pako from 'pako';

// Constants
const MAGIC_NUMBER = 0x42564831; // "BVH1" in ASCII (little-endian)

// Helper function to serialize BufferGeometry
const serializeBufferGeometryBinary = (geometry, isLayer = false) => {
  self.postMessage({
    status: 'log',
    message: 'Starting serializeBufferGeometryBinary',
  });

  if (!geometry || !geometry.attributes) {
    throw new Error(
      'Invalid geometry: geometry or geometry.attributes is undefined'
    );
  }

  const positions =
    new Float32Array(geometry.attributes?.position?.array) ||
    new Float32Array();
  const normals =
    new Float32Array(geometry.attributes?.normal?.array) || new Float32Array();
  const colors =
    new Float32Array(geometry.attributes?.color?.array) || new Float32Array();
  const uv = isLayer
    ? new Float32Array(geometry.attributes?.uv?.array) || new Float32Array()
    : new Float32Array();
  const indexType = geometry?.index?.type;
  let index = null;

  if (indexType == 'Uint32Array') {
    index = new Uint32Array(geometry?.index?.array) || new Uint32Array();
  } else {
    index = new Uint16Array(geometry?.index?.array) || new Uint16Array();
  }

  self.postMessage({
    status: 'log',
    message: `Geometry arrays - positions: ${positions.length}, normals: ${normals.length}, colors: ${colors.length}, uv: ${uv.length}, index: ${index.length}`,
  });

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

  // Total steps for progress calculation (one for each attribute)
  const totalSteps = 5; // positions, normals, colors, uv, index
  let completedSteps = 0;

  view.setUint32(offset, positions.length, true);
  offset += 4;
  view.setUint32(offset, normals.length, true);
  offset += 4;
  view.setUint32(offset, colors.length, true);
  offset += 4;
  view.setUint32(offset, uv.length, true);
  offset += 4;
  view.setUint32(offset, index.length, true);
  offset += 4;

  if (positions.length > 0) {
    new Float32Array(buffer, offset, positions.length).set(positions);
    offset += positions.byteLength;
    completedSteps++;
    const progress = Math.round((completedSteps / totalSteps) * 100);
    self.postMessage({ status: 'progress', progress });
  }
  if (normals.length > 0) {
    new Float32Array(buffer, offset, normals.length).set(normals);
    offset += normals.byteLength;
    completedSteps++;
    const progress = Math.round((completedSteps / totalSteps) * 100);
    self.postMessage({ status: 'progress', progress });
  }
  if (colors.length > 0) {
    new Float32Array(buffer, offset, colors.length).set(colors);
    offset += colors.byteLength;
    completedSteps++;
    const progress = Math.round((completedSteps / totalSteps) * 100);
    self.postMessage({ status: 'progress', progress });
  }
  if (uv.length > 0) {
    new Float32Array(buffer, offset, uv.length).set(uv);
    offset += uv.byteLength;
    completedSteps++;
    const progress = Math.round((completedSteps / totalSteps) * 100);
    self.postMessage({ status: 'progress', progress });
  }
  if (index.length > 0) {
    if (indexType == 'Uint32Array') {
      new Uint32Array(buffer, offset, index.length).set(index);
    } else {
      new Uint16Array(buffer, offset, index.length).set(index);
    }
    completedSteps++;
    const progress = Math.round((completedSteps / totalSteps) * 100);
    self.postMessage({ status: 'progress', progress });
  }

  self.postMessage({
    status: 'log',
    message: 'Completed serializeBufferGeometryBinary',
  });
  return buffer;
};

// saveCombinedGeometryAndMetadata in the worker
const saveCombinedGeometryAndMetadataWorker = (
  fileName,
  fileLayers,
  surfaceLibrary
) => {
  self.postMessage({
    status: 'log',
    message: 'Starting saveCombinedGeometryAndMetadataWorker',
  });

  if (!fileLayers || !Array.isArray(fileLayers)) {
    throw new Error('Invalid fileLayers: must be an array');
  }
  if (!surfaceLibrary || !Array.isArray(surfaceLibrary)) {
    throw new Error('Invalid surfaceLibrary: must be an array');
  }

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

  self.postMessage({
    status: 'log',
    message: `Found ${layers.length} layers and ${surfaces.length} surfaces`,
  });

  const layerBuffers = [];
  const surfaceBuffers = [];

  let totalTasks = layers.length + surfaces.length;
  let completedTasks = 0;

  for (const layer of layers) {
    if (!layer._group || !Array.isArray(layer._group.children)) {
      self.postMessage({
        status: 'log',
        message: `Skipping layer ${layer.id}: _group or _group.children is invalid`,
      });
      continue;
    }

    const geometries = [];
    const totalChildren = layer._group.children.length;
    let processedChildren = 0;

    for (const child of layer._group.children) {
      try {
        geometries.push({
          type: child.type,
          color: child.material?.color?.hex || 0xffffff,
          buffer: serializeBufferGeometryBinary(child.geometry, true),
        });
        processedChildren++;
        completedTasks++;
        const progress = Math.round(
          (completedTasks / totalTasks) * 50 +
            (processedChildren / totalChildren) * (50 / totalTasks)
        );
        self.postMessage({ status: 'progress', progress });
      } catch (error) {
        self.postMessage({
          status: 'log',
          message: `Error processing child in layer ${layer.id}: ${error.message}`,
        });
        throw error;
      }
    }

    layerBuffers.push({
      enableValue: true,
      fileName: layer.fileName,
      id: layer.id,
      layerName: layer.layerName,
      mainZipFileName: layer.mainZipFileName,
      geometries,
    });
  }

  const totalSurfaces = surfaces.length;
  let processedSurfaces = 0;

  for (const surface of surfaces) {
    if (!surface._object || !surface._object.geometry) {
      self.postMessage({
        status: 'log',
        message: `Skipping surface ${surface.id}: _object or _object.geometry is invalid`,
      });
      continue;
    }

    try {
      surfaceBuffers.push({
        enableValue: true,
        fileName: surface.fileName,
        id: surface.id,
        surfaceName: surface.surfaceName,
        mainZipFileName: surface.mainZipFileName,
        geometry: {
          type: 'Mesh',
          color: surface._object.material?.color?.hex || 0xffffff,
          buffer: serializeBufferGeometryBinary(
            surface._object.geometry,
            false
          ),
        },
      });
      processedSurfaces++;
      completedTasks++;
      const progress =
        50 +
        Math.round(
          (completedTasks / totalTasks) * 50 +
            (processedSurfaces / totalSurfaces) * (50 / totalTasks)
        );
      self.postMessage({ status: 'progress', progress });
    } catch (error) {
      self.postMessage({
        status: 'log',
        message: `Error processing surface ${surface.id}: ${error.message}`,
      });
      throw error;
    }
  }

  self.postMessage({ status: 'log', message: 'Creating metadata' });

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

  self.postMessage({
    status: 'log',
    message: `Total buffer length: ${totalLength}`,
  });

  const finalBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(finalBuffer);
  let offset = 0;

  view.setUint32(offset, metadataLength, true);
  offset += 4;
  new Uint8Array(finalBuffer, offset, metadataLength).set(metadataBlob);
  offset += metadataLength;

  let processedLayerBuffers = 0;
  const totalLayerBuffers = layerBuffers.length;

  layerBuffers.forEach((layer) => {
    layer.geometries.forEach((g) => {
      view.setUint32(offset, g.buffer.byteLength, true);
      offset += 4;
      new Uint8Array(finalBuffer, offset, g.buffer.byteLength).set(
        new Uint8Array(g.buffer)
      );
      offset += g.buffer.byteLength;
    });
    processedLayerBuffers++;
    const progress =
      75 + Math.round((processedLayerBuffers / totalLayerBuffers) * 10);
    self.postMessage({ status: 'progress', progress });
  });

  let processedSurfaceBuffers = 0;
  const totalSurfaceBuffers = surfaceBuffers.length;

  surfaceBuffers.forEach((surface) => {
    view.setUint32(offset, surface.geometry.buffer.byteLength, true);
    offset += 4;
    new Uint8Array(finalBuffer, offset, surface.geometry.buffer.byteLength).set(
      new Uint8Array(surface.geometry.buffer)
    );
    offset += surface.geometry.buffer.byteLength;
    processedSurfaceBuffers++;
    const progress =
      85 + Math.round((processedSurfaceBuffers / totalSurfaceBuffers) * 10);
    self.postMessage({ status: 'progress', progress });
  });

  self.postMessage({ status: 'progress', progress: 95 });
  self.postMessage({ status: 'log', message: 'Compressing data with pako' });

  const uint8Array = new Uint8Array(finalBuffer);
  const compressedData = pako.gzip(uint8Array);

  self.postMessage({ status: 'log', message: 'Compression complete' });
  self.postMessage({ status: 'progress', progress: 100 });
  return compressedData;
};

// saveCombinedBVH in the worker
const saveCombinedBVHWorker = (fileName, surfaceLibrary) => {
  self.postMessage({
    status: 'log',
    message: 'Starting saveCombinedBVHWorker',
  });

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
  if (numSurfaces > 10000) {
    throw new Error(`Invalid numSurfaces to save: ${numSurfaces} (too large)`);
  }

  let totalSize = 8;
  const surfaceData = [];

  let processedSurfaces = 0;
  const totalSurfaces = serializedBVHs.length;

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
    const calculateSize = (node, depth = 0) => {
      if (!node) return;
      nodeCount++;
      if (node.isLeaf) {
        leafNodeCount++;
        const triangles = node.triangles || [];
        trianglesCount += triangles.length;
      }
      if (!node.isLeaf) {
        calculateSize(node.left, depth + 1);
        calculateSize(node.right, depth + 1);
      }
    };
    calculateSize(surface.bvhRoot);

    const surfaceSize =
      4 +
      surfaceIdLength +
      4 +
      nodeCount * (24 + 1) +
      leafNodeCount * 4 +
      trianglesCount * (3 * 3 * 4);

    totalSize += surfaceSize;
    surfaceData.push({
      surfaceId: surfaceIdBytes,
      nodeCount,
      leafNodeCount,
      trianglesCount,
      bvhRoot: surface.bvhRoot,
    });

    processedSurfaces++;
    const progress = Math.round((processedSurfaces / totalSurfaces) * 50);
    self.postMessage({ status: 'progress', progress });
  }

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  let offset = 0;

  view.setUint32(offset, MAGIC_NUMBER, true);
  offset += 4;
  view.setUint32(offset, serializedBVHs.length, true);
  offset += 4;

  processedSurfaces = 0;

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
    const totalNodes = nodeCount;
    let processedNodes = 0;

    const serializeNode = (node) => {
      if (!node) return;

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

      view.setUint8(offset, node.isLeaf ? 1 : 0);
      offset += 1;

      if (node.isLeaf) {
        const triangles = node.triangles || [];
        view.setUint32(offset, triangles.length, true);
        offset += 4;
        for (const triangle of triangles) {
          view.setFloat32(offset, triangle.vA.x, true);
          offset += 4;
          view.setFloat32(offset, triangle.vA.y, true);
          offset += 4;
          view.setFloat32(offset, triangle.vA.z, true);
          offset += 4;
          view.setFloat32(offset, triangle.vB.x, true);
          offset += 4;
          view.setFloat32(offset, triangle.vB.y, true);
          offset += 4;
          view.setFloat32(offset, triangle.vB.z, true);
          offset += 4;
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
      processedNodes++;
      if (processedNodes % 100 === 0 || processedNodes === totalNodes) {
        const progress = 50 + Math.round((processedNodes / totalNodes) * 25);
        self.postMessage({ status: 'progress', progress });
      }

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

    processedSurfaces++;
    const progress = 75 + Math.round((processedSurfaces / totalSurfaces) * 20);
    self.postMessage({ status: 'progress', progress });
  }

  if (offset !== totalSize) {
    throw new Error(
      `Buffer size mismatch: expected ${totalSize}, but wrote ${offset} bytes`
    );
  }

  const uint8Array = new Uint8Array(buffer);
  const compressedData = pako.gzip(uint8Array);

  self.postMessage({
    status: 'log',
    message: 'Completed saveCombinedBVHWorker',
  });
  self.postMessage({ status: 'progress', progress: 100 });
  return compressedData;
};

// saveCombinedBreakLineEdges in the worker
const saveCombinedBreakLineEdgesWorker = (fileName, surfaceLibrary) => {
  self.postMessage({
    status: 'log',
    message: 'Starting saveCombinedBreakLineEdgesWorker',
  });

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

  const totalSurfaces = surfaces.length;
  let processedSurfaces = 0;

  const breakLinesEdges = surfaces.map((surface) => {
    processedSurfaces++;
    const progress = Math.round((processedSurfaces / totalSurfaces) * 80);
    self.postMessage({ status: 'progress', progress });
    return {
      surfaceId: surface.id,
      breakLineEdges: surface._breakLineEdges,
    };
  });

  const jsonString = JSON.stringify(breakLinesEdges);
  self.postMessage({ status: 'progress', progress: 90 });

  const compressedData = pako.gzip(jsonString);
  self.postMessage({ status: 'progress', progress: 100 });

  self.postMessage({
    status: 'log',
    message: 'Completed saveCombinedBreakLineEdgesWorker',
  });
  return compressedData;
};

// saveCompressedBlob in the worker
// saveCompressedBlob in the worker
const saveCompressedBlobWorker = (fileName, surfaceLibrary) => {
  self.postMessage({
    status: 'log',
    message: 'Starting saveCompressedBlobWorker',
  });

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
          .replace(/\.pslz$/, '') && s.blobData
  );

  if (findSurfaces.length === 0) {
    throw new Error(`No surfaces found for fileName: ${fileName}`);
  }

  // Collect chunks of data to write
  const chunks = [];
  let totalBytesWritten = 0;

  // Write the number of blob entries (4 bytes)
  const numEntries = findSurfaces.length;
  const headerBuffer = new ArrayBuffer(4);
  new DataView(headerBuffer).setUint32(0, numEntries, true);
  chunks.push(new Uint8Array(headerBuffer));
  totalBytesWritten += 4;

  const totalSurfaces = findSurfaces.length;
  let processedSurfaces = 0;

  // Process each surface's blob
  for (const surface of findSurfaces) {
    const blobData = surface.blobData;
    if (
      !blobData ||
      !blobData.blobBinary ||
      !(blobData.blobBinary instanceof ArrayBuffer)
    ) {
      self.postMessage({
        status: 'log',
        message: `Skipping surface ${surface.id}: blobData.blobBinary is invalid`,
      });
      continue;
    }

    const blobBinary = blobData.blobBinary;
    const surfaceId = surface.id;
    const blobType = blobData.blobType || 'application/octet-stream';

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
    metadataView.setBigUint64(offset, BigInt(blobBinary.byteLength), true);
    offset += 8;

    chunks.push(new Uint8Array(metadataBuffer));
    totalBytesWritten += metadataBuffer.byteLength;

    // Add the blobBinary (ArrayBuffer) directly in chunks
    const CHUNK_SIZE = 1024 * 1024; // 1 MB chunks
    const blobView = new Uint8Array(blobBinary);
    let blobOffset = 0;

    while (blobOffset < blobView.length) {
      const remaining = blobView.length - blobOffset;
      const chunkSize = Math.min(CHUNK_SIZE, remaining);
      const chunk = blobView.subarray(blobOffset, blobOffset + chunkSize);
      chunks.push(chunk);
      totalBytesWritten += chunk.length;
      blobOffset += chunkSize;

      // Update progress based on bytes processed
      const progress = Math.round(
        (processedSurfaces / totalSurfaces) * 80 +
          (blobOffset / blobView.length) * (80 / totalSurfaces)
      );
      self.postMessage({ status: 'progress', progress });
    }

    processedSurfaces++;
  }

  if (chunks.length === 0) {
    throw new Error('No valid Blobs found to save');
  }

  // Combine chunks into a single Uint8Array for compression
  self.postMessage({ status: 'progress', progress: 90 });
  const combined = new Uint8Array(totalBytesWritten);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  // Compress the combined data with pako
  self.postMessage({ status: 'log', message: 'Compressing data with pako' });
  const compressedData = pako.gzip(combined);
  self.postMessage({ status: 'progress', progress: 100 });

  self.postMessage({
    status: 'log',
    message: 'Completed saveCompressedBlobWorker',
  });
  return compressedData;
};

// saveCompressedUVData in the worker
const saveCompressedUVDataWorker = (fileName, surfaceLibrary) => {
  self.postMessage({
    status: 'log',
    message: 'Starting saveCompressedUVDataWorker',
  });

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

  const allChunks = [];
  const totalSurfaces = findSurfaces.length;
  let processedSurfaces = 0;

  for (const surface of findSurfaces) {
    const uvData = surface.uvArrayData?.uvArray;
    if (!uvData || !(uvData instanceof Float32Array) || uvData.length === 0) {
      self.postMessage({
        status: 'log',
        message: `Skipping surface ${
          surface.id
        }: invalid uvData, value: ${uvData}, type: ${typeof surface.uvArrayData
          ?.uvArray}, length: ${uvData?.length || 0}`,
      });
      processedSurfaces++;
      const progress = Math.round((processedSurfaces / totalSurfaces) * 80);
      self.postMessage({ status: 'progress', progress });
      continue;
    }

    // Process UV data in chunks
    const CHUNK_SIZE = 50000; // 50,000 elements (~200 KB per chunk)
    for (let i = 0; i < uvData.length; i += CHUNK_SIZE) {
      const chunk = uvData.subarray(i, i + CHUNK_SIZE);
      const chunkData = Array.from(chunk);

      allChunks.push({
        surfaceId: surface.id,
        chunkIndex: i / CHUNK_SIZE,
        uvData: chunkData,
        uvLength: chunk.length,
      });
      self.postMessage({
        status: 'log',
        message: `Added chunk ${i / CHUNK_SIZE} for surface ${
          surface.id
        }, chunk data length: ${chunkData.length}`,
      });
    }

    processedSurfaces++;
    const progress = Math.round((processedSurfaces / totalSurfaces) * 80);
    self.postMessage({ status: 'progress', progress });
  }

  if (allChunks.length === 0) {
    throw new Error('No valid UV data to compress');
  }

  // Process and compress in batches to avoid memory issues
  const BATCH_SIZE = 1000; // Process 1000 chunks at a time
  let compressedData = new Uint8Array(0);
  for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
    const batch = allChunks.slice(i, i + BATCH_SIZE);
    const jsonString = JSON.stringify(batch, (key, value) => {
      return value === undefined ? null : value;
    });
    self.postMessage({
      status: 'log',
      message: `Batch ${i / BATCH_SIZE} JSON length: ${
        jsonString.length
      }, Sample: ${jsonString.substring(0, 200)}...`,
    });

    // if (jsonString.length > 10000000) {
    //   // 10 MB limit per batch
    //   throw new Error(
    //     `Batch ${i / BATCH_SIZE} JSON too large: ${
    //       jsonString.length
    //     } characters`
    //   );
    // }

    const jsonBytes = new TextEncoder().encode(jsonString);
    self.postMessage({
      status: 'log',
      message: `Batch ${i / BATCH_SIZE} JSON bytes length: ${jsonBytes.length}`,
    });

    try {
      const batchCompressed = pako.gzip(jsonBytes, { level: 9 });
      self.postMessage({
        status: 'log',
        message: `Batch ${i / BATCH_SIZE} compressed length: ${
          batchCompressed.length
        }`,
      });

      // Append to final compressed data
      const temp = new Uint8Array(
        compressedData.length + batchCompressed.length
      );
      temp.set(compressedData);
      temp.set(batchCompressed, compressedData.length);
      compressedData = temp;
    } catch (error) {
      self.postMessage({
        status: 'log',
        message: `Compression failed for batch ${i / BATCH_SIZE}: ${
          error.message
        }`,
      });
      throw error;
    }
  }

  self.postMessage({
    status: 'log',
    message: `Total compressed data length: ${
      compressedData.length
    }, Sample: ${Array.from(compressedData.slice(0, 10)).join(', ')}...`,
  });

  self.postMessage({ status: 'progress', progress: 100 });
  self.postMessage({
    status: 'log',
    message: 'Completed saveCompressedUVDataWorker',
  });

  return compressedData;
};
// Worker message handler
self.onmessage = (e) => {
  self.postMessage({ status: 'log', message: 'Worker received message' });

  const { task, fileName, fileLayers, surfaceLibrary } = e.data;
  let result;

  try {
    switch (task) {
      case 'saveCombinedGeometryAndMetadata':
        result = saveCombinedGeometryAndMetadataWorker(
          fileName,
          fileLayers,
          surfaceLibrary
        );
        break;
      case 'saveCombinedBVH':
        result = saveCombinedBVHWorker(fileName, surfaceLibrary);
        break;
      case 'saveCombinedBreakLineEdges':
        result = saveCombinedBreakLineEdgesWorker(fileName, surfaceLibrary);
        break;
      case 'saveCompressedBlob':
        result = saveCompressedBlobWorker(fileName, surfaceLibrary);
        break;
      case 'saveCompressedUVData':
        result = saveCompressedUVDataWorker(fileName, surfaceLibrary);
        break;
      default:
        throw new Error(`Unknown task: ${task}`);
    }

    self.postMessage({
      status: 'log',
      message: 'Task completed, sending result',
    });
    self.postMessage({
      status: 'log',
      message: `Result buffer: ${result.buffer}`,
    });
    self.postMessage({ status: 'success', result: result.buffer }, [
      result.buffer,
    ]);
  } catch (error) {
    self.postMessage({ status: 'error', error: error.message });
  }
};
