// parsingAndConvertingUtils.js
import * as THREE from 'three';
import {
  findDeepValue,
  fetchObjectsByKey,
  fetchObjectsByKeyWithCondition,
} from './searchUtils';
import { getHexColorCode } from './colorsUtils';
import { categorizeEntitiesInWorker } from './categorizeWorkerHelper';

export const convertXMLToEntities = (xmlData, fileName) => {
  const fileNameForSurface = fileName.split('.').shift();
  let entities = [];
  const pointMap = new Map();
  const findLineWidth = findDeepValue(
    xmlData?.LandXML?.Project?.Feature,
    '@_label',
    'lineWeight',
    true
  );
  let lineWidth = 2;
  if (findLineWidth?.length) {
    lineWidth = findLineWidth[0]['@_value'];
  }
  // xmlData?.LandXML?.Project?.Feature[1]?.Feature?.Property[3]['@_value'];
  if (xmlData.LandXML?.PlanFeatures?.PlanFeature) {
    xmlData.LandXML.PlanFeatures.PlanFeature.forEach((feature) => {
      const { Line } = feature.CoordGeom || {};
      const lines = Array.isArray(Line) ? Line : [Line];
      const findColor = findDeepValue([feature], '@_label', 'color', true);
      const findLayer = findDeepValue([feature], '@_label', 'layer', true);
      let layerName = fileNameForSurface;
      let color = '128,128,128';
      if (findLayer?.length) {
        layerName = findLayer[0]['@_value'];
      }
      if (findColor?.length) {
        color = findColor[0]['@_value'] || '128,128,128';
      }
      const hexColorCode = getHexColorCode(color || '128,128,128');
      const faceVertices = [];
      if (layerName.includes('TIN') || layerName.includes('SURFACE')) {
        lines.forEach((line) => {
          const startCoords = line.Start?.split(' ').map(Number);
          const endCoords = line.End?.split(' ').map(Number);
          faceVertices.push(
            { x: startCoords[1], y: startCoords[0], z: startCoords[2] || 0 },
            { x: endCoords[1], y: endCoords[0], z: endCoords[2] || 0 }
          );
        });

        if (faceVertices?.length >= 3) {
          for (let i = 1; i < faceVertices?.length - 1; i++) {
            entities.push({
              type: '3DFACE',
              color: hexColorCode,
              lineWidth: lineWidth,
              surfaceName: layerName,
              vertices: [faceVertices[0], faceVertices[i], faceVertices[i + 1]],
              isBreakLineEdge: true, // Flag edges that are break lines
            });
          }
        }
      } else {
        lines.forEach((line) => {
          const startCoords = line.Start?.split(' ').map(Number);
          const endCoords = line.End?.split(' ').map(Number);
          const direction = line['@_dir'];
          const length = line['@_length'];
          const staStart = line['@_staStart'];
          if (startCoords && endCoords) {
            entities.push({
              type: 'LINE',
              direction: direction,
              lineLength: length,
              startingPoint: staStart,
              color: hexColorCode,
              lineWidth: lineWidth,
              layerName: layerName,
              vertices: [
                {
                  x: startCoords[1],
                  y: startCoords[0],
                  z: startCoords[2] || 0,
                },
                { x: endCoords[1], y: endCoords[0], z: endCoords[2] || 0 },
              ],
            });
          }
        });
      }
    });
  }
  if (xmlData.LandXML?.Parcels) {
    const findParcels = fetchObjectsByKey(xmlData.LandXML?.Parcels, 'Parcel');
    findParcels.forEach((parcel) => {
      const parcelsArr = Array.isArray(parcel.Parcel)
        ? parcel.Parcel
        : [parcel.Parcel];
      parcelsArr.forEach((pa) => {
        const { Line } = pa.CoordGeom || {};
        const lines = Array.isArray(Line) ? Line : [Line];
        const findColor = findDeepValue([pa], '@_label', 'color', true);
        const findLayer = findDeepValue([pa], '@_label', 'layer', true);
        let layerName = fileNameForSurface;
        let color = '128,128,128';
        if (findLayer?.length) {
          layerName = findLayer[0]['@_value'];
        }
        if (findColor?.length) {
          color = findColor[0]['@_value'] || '128,128,128';
        }
        const hexColorCode = getHexColorCode(color || '128,128,128');
        lines.forEach((line) => {
          const startCoords = line.Start?.split(' ').map(Number);
          const endCoords = line.End?.split(' ').map(Number);
          const direction = line['@_dir'];
          const length = line['@_length'];
          const staStart = line['@_staStart'];
          if (startCoords && endCoords) {
            entities.push({
              type: 'LINE',
              direction: direction,
              lineLength: length,
              startingPoint: staStart,
              color: hexColorCode,
              lineWidth: lineWidth,
              layerName: layerName,
              vertices: [
                {
                  x: startCoords[1],
                  y: startCoords[0],
                  z: startCoords[2] || 0,
                },
                { x: endCoords[1], y: endCoords[0], z: endCoords[2] || 0 },
              ],
            });
          }
        });
      });
    });
  }
  if (xmlData.LandXML?.Surfaces?.Surface) {
    const surfaces = fetchObjectsByKeyWithCondition(
      xmlData.LandXML?.Surfaces,
      'Surface'
    ).flat();
    surfaces.forEach((surf) => {
      const definitions = fetchObjectsByKeyWithCondition(
        surf,
        'Definition'
      ).flat();
      if (definitions?.length) {
        definitions.forEach((def) => {
          const color = def?.Feature?.Property['@_value'] || '128,128,128';
          const surfaceName = surf['@_name'] || fileNameForSurface;
          const hexColorCode = getHexColorCode(color || '128,128,128');
          if (def?.Pnts?.P) {
            def.Pnts.P.forEach((point) => {
              const [x, y, z] = point['#text'].split(' ').map(Number);
              pointMap.set(
                parseInt(point['@_id'], 10),
                new THREE.Vector3(y, x, z || 0)
              );
              // entities.push({
              //   type: 'POINT',
              //   color: hexColorCode,
              //   layerName: surfaceName,
              //   position: {
              //     x: x,
              //     y: y,
              //     z: z || 0,
              //   },
              // });
            });
          } else {
            console.error('No points found in the XML.');
          }
          // Parse faces
          if (def?.Faces?.F) {
            def.Faces.F.forEach((face) => {
              const indices = face.split(' ').map((id) => parseInt(id, 10));
              // Ensure that the face has exactly 3 vertices (triangle)
              if (indices?.length === 3) {
                const vertices = indices.map((id) => {
                  const vertex = pointMap.get(id);
                  if (!vertex) {
                    console.error(`Point ID ${id} not found.`);
                  }
                  return vertex;
                });
                // Only add the face if all vertices are found
                if (vertices.every((v) => v !== undefined)) {
                  entities.push({
                    color: hexColorCode,
                    type: 'FACE',
                    vertices,
                    surfaceName: surfaceName,
                    isBreakLineEdge: true, // Flag edges that are break lines
                  });
                }
              } else {
                console.warn(
                  `Face with ${indices?.length} vertices is not supported.`
                );
              }
            });
          } else {
            console.error('No faces found in the XML.');
          }
        });
      }
    });
  }
  return entities;
};

// Categoring Entities
export const categorizeEntities = async (entities, fileId, onProgress, fileName, mainZipFileName) => {
  const { layers, surfaces } = await categorizeEntitiesInWorker(
    entities,
    fileId,
    onProgress,
    fileName,
    mainZipFileName
  );
  return {
    layers: layers || [],
    surfaces: surfaces || [],
  };
};
