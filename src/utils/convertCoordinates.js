// src/utils/convertCoordinates.js
import proj4 from 'proj4';
import * as THREE from 'three';

// Define the projections
proj4.defs('EPSG:32633', '+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs');
proj4.defs('EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs');
proj4.defs(
  'EPSG:3857',
  '+proj=merc +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs'
);

/**
 * Converts UTM coordinates to Web Mercator (EPSG:3857).
 * @param {number} x - UTM X coordinate.
 * @param {number} y - UTM Y coordinate.
 * @param {number} z - Elevation (optional).
 * @returns {object} - Converted coordinates { x: meters, y: meters, z: elevation }.
 */
export const convertToWebMercator = (x, y, z = 0) => {
  try {
    // Step 1: UTM to WGS84
    const [lon, lat] = proj4('EPSG:32633', 'EPSG:4326', [x, y]);

    // Step 2: WGS84 to Web Mercator
    const [mercX, mercY] = proj4('EPSG:4326', 'EPSG:3857', [lon, lat]);

    return { x: x, y: y, z };
  } catch (error) {
    console.error('Error during coordinate conversion:', error);
    return { x: 0, y: 0, z: 0 };
  }
};

export const transformVertexForNorth = (v) => {
  // e.g. rotate so +Y becomes +Z
  // or so that geometry is oriented with "north" where you want it
  // This is just an example rotation around X: -90 degrees
  const matrix = new THREE.Matrix4();
  matrix.makeRotationX(-Math.PI / 2);

  // Make a local Vector3 and apply the matrix
  const tv = new THREE.Vector3(v.x, v.y, v.z);
  tv.applyMatrix4(matrix);
  return tv;
};
