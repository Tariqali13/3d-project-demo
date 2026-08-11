// shadingUtils.js
import * as THREE from 'three';

export function applySurfaceShading(
  surf,
  { shadingMode, color, transparency }
) {
  if (!surf?._object) return;

  const mesh = surf._object;
  const geometry = mesh.geometry;
  let material = mesh.material;

  material.transparent = true;
  material.opacity = 1 - transparency / 100; // So slider 0 => opaque

  switch (shadingMode) {
    case 'NoShading':
      // “No shading” => user wants wireframe with the color gradient by elevation
      material.dispose();
      material = surf._originalMaterial.clone();
      // material.wireframe = true;
      // mesh.color = surfColor;
      // material.color = surfColor;
      // material.vertexColors = false;
      break;

    case 'BySurfaceColor':
      material.dispose();
      material = surf._originalMaterial.clone();
      // Fill with a single color, no vertexColors
      material.wireframe = false;
      material.vertexColors = false;
      material.map = null; // no texture
      // material.originalColor = material.color;
      material.color = new THREE.Color(color || '#ffffff');
      material.transparent = true;
      material.opacity = 1 - transparency / 100;
      break;
    case 'ByElevation':
      // Fill with a single color, no vertexColors
      material.dispose();
      material = surf._originalMaterial.clone();
      // material.originalColor = material.color;
      material.wireframe = false;
      material.vertexColors = true;
      material.transparent = true;
      material.map = null;
      material.color = null;
      material.opacity = 1 - transparency / 100;
      break;

    case 'ByImage':
      if (!surf.uvArrayData?.uvArray) {
        throw new Error('UV data is missing for ByImage shading mode');
      }
      if (!surf.texture) {
        throw new Error('Texture is missing for ByImage shading mode');
      }
      material.dispose();
      // material.wireframe = false;
      // material.vertexColors = false;
      // material.map = null;
      // const geometry = findSurface._object.geometry;
      // const mesh = findSurface._object;
      const textureToLoad = surf.texture;
      material = surf._originalMaterial.clone();
      try {
        geometry.setAttribute(
          'uv',
          new THREE.BufferAttribute(surf.uvArrayData.uvArray, 2)
        );
      } catch (error) {
        throw new Error(`Failed to set UV attribute: ${error.message}`);
      }
      // 3) Switch material to a textured material
      material.map = textureToLoad;
      material.wireframe = false;
      material.vertexColors = false;
      material.color = null;
      material.transparent = true;
      material.opacity = 1 - transparency / 100;
      material.needsUpdate = true;
      break;

    default:
      throw new Error(`Unsupported shading mode: ${shadingMode}`);
  }
  material.visible = true;
  material.needsUpdate = true;
  mesh.material = material;
  mesh.needsUpdate = true;
}
