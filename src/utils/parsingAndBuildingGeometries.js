import * as THREE from 'three';
import { getHexColorCode } from './colorsUtils';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils';
import { surfaceRunningId } from '../constants/refStore';
import { buildSurfaceInWorker } from './workerGeometryHelper';

export const renderLwPolyline = (entity) => {
  const points = entity.vertices.map(
    (vertex) => new THREE.Vector3(vertex.x, vertex.y, entity.elevation)
  );

  const isClosed = entity.isFilledShape || entity.is3dPolyline;

  if (isClosed) {
    const shape = new THREE.Shape(points);
    const geometry = new THREE.ShapeGeometry(shape);
    const material = new THREE.MeshPhongMaterial({
      color: getHexColorCode(entity.color || entity.colorNumber) || 0x0000ff,
      side: THREE.DoubleSide,
      // flatShading: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    return mesh;
  } else {
    if (entity.closed) {
      const first = points[0];
      const last = points[points.length - 1];
      if (!first.equals(last)) {
        points.push(first.clone());
      }
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: getHexColorCode(entity.color || entity.colorNumber || 0x0000ff),
    });
    return new THREE.Line(geometry, material);
  }
};

export const renderPolyline = (entity) => {
  const points = entity.vertices.map(
    (vertex) => new THREE.Vector3(vertex.x, vertex.y, vertex.z || 0)
  );

  // Check if the polyline is closed
  const isClosed = entity.isFilledShape || entity.is3dPolyline;
  if (isClosed) {
    // Convert to 2D shape for simplicity
    const shapePoints = entity.vertices.map(
      (vertex) => new THREE.Vector2(vertex.x, vertex.y)
    );
    const shape = new THREE.Shape(shapePoints);
    const geometry = new THREE.ShapeGeometry(shape);
    const material = new THREE.MeshPhongMaterial({
      color: getHexColorCode(entity.color || entity.colorNumber) || 0x00ff00,
      side: THREE.DoubleSide,
      // flatShading: true,
    });
    const mesh = new THREE.Mesh(geometry, material);
    return mesh;
  } else {
    if (entity.closed) {
      const first = points[0];
      const last = points[points.length - 1];
      if (!first.equals(last)) {
        points.push(first.clone());
      }
    }
    // If not closed, render as a line
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: getHexColorCode(entity.color || entity.colorNumber) || 0x00ff00,
    });
    return new THREE.Line(geometry, material);
  }
};

export const renderPointEntity = (entity) => {
  // ...unchanged...
  const position = new THREE.Vector3(
    entity.position.x,
    entity.position.y,
    entity.position.z || 0
  );
  const geometry = new THREE.BufferGeometry().setFromPoints([position]);
  const mat = new THREE.PointsMaterial({
    color: getHexColorCode(entity.color || entity.colorNumber) || 0xffff00,
    size: entity.scaleX || 1.5,
  });
  return new THREE.Points(geometry, mat);
};
const renderLine = (entity, color) => {
  const points = entity.vertices.map(
    (vertex) => new THREE.Vector3(vertex.x, vertex.y, vertex.z || 0)
  );
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: getHexColorCode(entity.color || entity.colorNumber) || 0xff0000,
    linewidth: entity.lineWidth || '1',
    side: THREE.DoubleSide,
  });
  const line = new THREE.Line(geometry, material);
  line.name = `line_${Math.random()}`;
  return line;
};

export const renderEntity = (entity) => {
  // ...unchanged...
  if (
    entity.type === '3DFACE' &&
    entity.type === 'FACE' &&
    entity.type === 'BOUNDARY'
  ) {
    return null; // skip
  }
  switch (entity.type) {
    case 'LWPOLYLINE':
      return renderLwPolyline(entity, entity.color);
    case 'POLYLINE':
      return renderPolyline(entity, entity.color);
    case 'POINT':
      return renderPointEntity(entity, entity.color);
    case 'INSERT':
      return renderPointEntity(entity, entity.color);
    case 'ATTRIB':
      return renderPointEntity(entity, entity.color);
    case 'LINE':
      return renderLine(entity, entity.color);
    default:
      return null;
  }
};

export const setupLighting = (scene) => {
  // ...unchanged...
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
  directionalLight.position.set(200, 300, 400);
  scene.add(directionalLight);

  const bottomLight = new THREE.PointLight(0xffffff, 1.2);
  bottomLight.position.set(0, -500, 200);
  scene.add(bottomLight);

  const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
  hemisphereLight.position.set(0, 0, 300);
  scene.add(hemisphereLight);

  const ambientLight = new THREE.AmbientLight(0x666666, 1.5);
  scene.add(ambientLight);
};

export function computeUVsForDrapePixelCenter(geometry, texture, jgwValues) {
  const position = geometry.getAttribute('position');
  if (!position) {
    console.warn('No position attribute on geometry');
    return new Float32Array(0);
  }

  // Deconstruct JGW
  let { pixelWidth, rotationX, rotationY, pixelHeight, topLeftX, topLeftY } =
    jgwValues;

  // Image dimensions in pixels
  const imageWidth = texture.image.width;
  const imageHeight = texture.image.height;

  const posArray = position.array; // [x0,y0,z0, x1,y1,z1, ...]
  const uvArray = new Float32Array((posArray.length / 3) * 2);

  let k = 0;
  for (let i = 0; i < posArray.length; i += 3) {
    const x = posArray[i];
    const y = posArray[i + 1];

    let u = (x - topLeftX) / (imageWidth * pixelWidth);
    let v = (topLeftY - y) / (imageHeight * Math.abs(pixelHeight));

    // If the image appears inverted top-to-bottom,
    // swap the sign or do v = 1 - v.
    // v = 1 - v;
    // v = 1 - v;
    uvArray[k++] = u;
    uvArray[k++] = v;
  }

  return uvArray;
}

async function createGeometryFromJSON(json) {
  const geometry = new THREE.BufferGeometry();
  // Rebuild each attribute
  for (const attrName in json.attributes) {
    const srcAttr = json.attributes[attrName];
    // For example, position is a Float32Array
    const typedArray = new Float32Array(srcAttr.array);
    const bufferAttr = new THREE.BufferAttribute(
      typedArray,
      srcAttr.itemSize,
      srcAttr.normalized
    );
    geometry.setAttribute(attrName, bufferAttr);
  }

  if (json.index) {
    const indexArray = new Uint32Array(json.index.array);
    geometry.setIndex(new THREE.BufferAttribute(indexArray, 1));
  }

  geometry.computeVertexNormals();

  return geometry;
}

export async function onBuildSurface({
  scene,
  surf,
  surfIdx,
  entities,
  flattenToPlane,
  setBuildProgress,
}) {
  const surfColor = getHexColorCode(entities[0]?.color) || '#808080';
  let surfaceRunId = surfaceRunningId.current;
  try {
    let data = await buildSurfaceInWorker({
      surfIdx,
      surfaceRunningId: surfaceRunId,
      entities,
      flattenToPlane,
      setBuildProgress,
    });
    if (!data) {
      console.warn('No geometry built');
      return;
    }
    const { geometries } = data;
    const geoArr = [];
    for (let geo of geometries) {
      const geom = await createGeometryFromJSON(geo);
      geoArr.push(geom);
    }
    const combinedGeometry = mergeGeometries(geoArr);
    const inExtremeLarge =
      combinedGeometry.attributes.position.array.length > 22000000;
    const material = new THREE.MeshPhongMaterial({
      vertexColors: false,
      wireframe: inExtremeLarge ? false : true,
      color: surfColor,
      side: THREE.DoubleSide,
    });
    const combinedMesh = new THREE.Mesh(combinedGeometry, material);
    scene.add(combinedMesh);
    surf._object = combinedMesh;
    surf._originalMaterial = combinedMesh.material.clone();
    delete surf.entities;
    surfaceRunningId.current = surfaceRunningId.current + 1;
    return;
  } catch (err) {
    console.error('Error building surface in worker:', err);
  }
}

export const replaceFileExtFunc = (text = '') => {
  return text
    .replace(/\.xml$/, '')
    .replace(/\.dxf$/, '')
    .replace(/\.pslz$/, '');
};
