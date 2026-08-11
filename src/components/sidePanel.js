import React, { useState, useEffect } from 'react';
import { Tree, Button, Typography, Divider } from 'antd';
import { sceneRef, cameraRef, rendererRef } from '../constants/refStore';
import { SurfacePropertiesModal } from '../components';
import { applySurfaceShading } from '../utils/shadingUtils'; // The helper
import * as THREE from 'three';
import { replaceFileExtFunc } from '../utils/parsingAndBuildingGeometries';

import dLightSvg from '../svgs/surface_view_new_light.svg';

const { Title } = Typography;
const SidePanel = ({
  setSurfaceLibrary,
  setFileLayers,
  fileLayers,
  surfaceLibrary,
  zipFileData,
  handleSaveGeometryData,
  showProgressModal,
  setShowProgressModal,
  filesDataSaved,
  bvhCalculationLoading,
  genericProgressBar,
  setShowPropertiesModal,
  showPropertiesModal,
}) => {
  const [fileTreeData, setFileTreeData] = useState([]);
  const [surfaceTreeData, setSurfaceTreeData] = useState([]);
  const [treeCreated, setTreeCreated] = useState(false);
  // We'll store the keys that are "checked" in these states:
  const [fileCheckedKeys, setFileCheckedKeys] = useState([]);
  const [surfaceCheckedKeys, setSurfaceCheckedKeys] = useState([]);
  // Just standard expansions, etc:
  const [expandedKeys, setExpandedKeys] = useState([]);
  const [selectedSurface, setSelectedSurface] = useState(null);
  const [jgwValuesArray, setJGWValuesArray] = useState([]);
  const [overlayTexture, setOverlayTexture] = useState([]);
  const [triggerByImage, setTriggerByImage] = useState(false);
  const [uvArrayTextureData, setUVArrayTextureData] = useState([]);
  const [loadingImage, setLoadingImage] = useState(false);

  const [transparencyApplied, setTransparencyApplied] = useState(0);
  const [imageOverLayingProgress, setImageOverLayingProgress] = useState(0);
  const [imageProgress, setImageProgress] = useState(0);

  const openSurfaceProperties = (surf) => {
    setSelectedSurface(surf.id);
    setShowPropertiesModal(true);
  };
  const handleCloseModal = () => {
    setShowPropertiesModal(false);
    setSelectedSurface(null);
  };

  const handleSaveSurfaceChanges = async (settings) => {
    // Update the surface object
    if (selectedSurface) {
      const findSurface = surfaceLibrary.find(
        (surf) => surf.id === selectedSurface
      );

      if (findSurface) {
        try {
          findSurface.shadingMode = settings.shadingMode;
          findSurface.color = settings.color;
          findSurface.transparency = settings.transparency;
          setTransparencyApplied(settings.transparency);
          applySurfaceShading(findSurface, settings);
          if (rendererRef.current && sceneRef.current && cameraRef.current) {
            rendererRef.current.render(sceneRef.current, cameraRef.current);
          }
        } catch (error) {
          console.error('Error applying surface shading:', error);
          const mesh = findSurface._object;
          let material = mesh.material;
          // Revert to a safe state (e.g., apply a default material)
          material.dispose();
          material = findSurface._originalMaterial.clone();
          // Re-render to ensure the model is visible
          if (rendererRef.current && sceneRef.current && cameraRef.current) {
            rendererRef.current.render(sceneRef.current, cameraRef.current);
          }
        } finally {
          // Close the modal regardless of success or failure
          handleCloseModal();
        }
      }
    }
  };
  const loadTexture = async (findSurface) => {
    if (findSurface) {
      const textureToLoad = findSurface.texture;

      if (findSurface.uvArrayData && findSurface.texture) {
        const geometry = findSurface._object.geometry;
        const mesh = findSurface._object;

        mesh.material.dispose();
        mesh.material = findSurface._originalMaterial.clone();
        geometry.setAttribute(
          'uv',
          new THREE.BufferAttribute(findSurface.uvArrayData.uvArray, 2)
        );
        // 3) Switch material to a textured material
        mesh.material.map = textureToLoad;
        mesh.material.wireframe = false;
        mesh.material.vertexColors = false;
        mesh.material.color = null;
        mesh.material.transparent = true;
        mesh.material.opacity = 1 - transparencyApplied / 100;
        mesh.material.needsUpdate = true;
        setLoadingImage(false);
        // setTriggerByImage(false);
        handleCloseModal();
      } else {
        setLoadingImage(false);
        let setting = {
          shadingMode: 'NoShading',
          color: findSurface.color,
          transparency: 0,
        };
        findSurface.shadingMode = setting.shadingMode;
        findSurface.color = setting.color;
        findSurface.transparency = setting.transparency;
        applySurfaceShading(findSurface, setting);
      }
    }
  };

  const handleToggleSurface = (surfaceId, value) => {
    const foundSurf = surfaceLibrary.find((surf) => surf.id === surfaceId);
    if (!foundSurf) return;

    const newValue = !value;
    foundSurf.enableValue = newValue;
    // Toggle the entire group’s visibility
    if (foundSurf._group) {
      foundSurf._group.visible = newValue;
      foundSurf._object.visible = newValue;
      foundSurf._originalMaterial.visible = newValue;
    }
    setSurfaceLibrary([...surfaceLibrary]);
    // One render call
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  };

  const handleToggleLayers = (layerId, value) => {
    const findFileLayer = fileLayers.find((fileInfo) =>
      fileInfo.layers.some((lyr) => lyr.id === layerId)
    );
    if (!findFileLayer) return;

    // Update the layers array
    const updatedLayers = findFileLayer.layers.map((lyr) => {
      if (lyr.id === layerId) {
        const newValue = !value;
        lyr.enableValue = newValue;
        if (lyr._group) {
          lyr._group.visible = newValue;
        }
        return { ...lyr, enableValue: newValue };
      }
      return lyr;
    });

    // Update the fileLayers state
    const updatedFileLayers = fileLayers.map((fileInfo) =>
      fileInfo === findFileLayer
        ? { ...fileInfo, layers: updatedLayers }
        : fileInfo
    );
    setFileLayers(updatedFileLayers);

    // Re-render once
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  };

  useEffect(() => {
    // Build file tree data and checked keys
    if (fileLayers.length) {
      const allFileKeys = [];
      const fData = fileLayers.map((fileInfo, fIdx) => {
        const fileKey = `file-${fIdx}`;

        // Check if all layers in this file are enabled
        const allLayersEnabled = fileInfo.layers.every(
          (layer) => layer.enableValue
        );
        if (allLayersEnabled) {
          allFileKeys.push(fileKey); // Check the file node if all layers are enabled
        }

        // Build children (layers)
        const children = fileInfo.layers.map((layer, id) => {
          const layerKey = `${layer.id}-${fIdx}-${id}`;
          if (layer.enableValue) {
            allFileKeys.push(layerKey); // Check the layer if it's enabled
          }
          return {
            key: layerKey,
            id: layer.id,
            title: layer.layerName,
            checkable: true,
          };
        });

        return {
          key: fileKey,
          title: fileInfo.fileName,
          checkable: true,
          children,
        };
      });

      setFileTreeData(fData);
      setFileCheckedKeys(allFileKeys);
    }

    // Build surface tree data and checked keys
    if (surfaceLibrary.length) {
      const allSurfaceKeys = [];
      const parentKey = 'surfaces-all';

      // Check if all surfaces are enabled
      const allSurfacesEnabled = surfaceLibrary.every(
        (surf) => surf.enableValue
      );
      if (allSurfacesEnabled) {
        allSurfaceKeys.push(parentKey); // Check the "All Surfaces" node if all surfaces are enabled
      }

      const sChildren = surfaceLibrary.map((surf, id) => {
        const surfaceKey = `${surf.id}-${id}`;
        if (surf.enableValue) {
          allSurfaceKeys.push(surfaceKey); // Check the surface if it's enabled
        }
        return {
          key: surfaceKey,
          id: surf.id,
          title: (
            <div className='flex justify-between'>
              <span className='w-[130px]'>{surf.surfaceName}</span>
              <Button
                className='ml-2 w-[36px] h-[36px]'
                size='small'
                onClick={(e) => {
                  e.stopPropagation(); // Stop Tree from toggling
                  openSurfaceProperties(surf);
                }}
              >
                <img src={dLightSvg} />
              </Button>
            </div>
          ),
          checkable: true,
        };
      });

      const sData = [
        {
          key: parentKey,
          title: 'All Surfaces',
          checkable: true,
          children: sChildren,
        },
      ];

      setSurfaceTreeData(sData);
      setSurfaceCheckedKeys(allSurfaceKeys);
    }

    setTreeCreated(true);
  }, [fileLayers, surfaceLibrary]); // Remove treeCreated dependency

  // If user expands/collapses
  const onExpand = (expandedKeysValue) => {
    setExpandedKeys(expandedKeysValue);
  };

  // 3) onCheck for the File Tree
  const onFileTreeCheck = (checkedKeys, info) => {
    if (info.node.children) {
      // Toggling the entire file node
      const enableVal = info.node.checked;
      // We loop child layers and pass to handleToggleLayers
      info.node.children.forEach((child) => {
        handleToggleLayers(child.id, enableVal);
      });
    } else {
      // Single layer toggled
      const enableVal = info.node.checked;
      handleToggleLayers(info.node.id, enableVal);
    }
    setFileCheckedKeys(checkedKeys);
  };

  // 4) onCheck for the Surface Tree
  const onSurfaceTreeCheck = (checkedKeys, info) => {
    if (info.node.children) {
      // Toggling "All Surfaces" node
      const enableVal = info.node.checked;
      info.node.children.forEach((child) => {
        handleToggleSurface(child.id, enableVal);
      });
    } else {
      // Single surface toggled
      const enableVal = info.node.checked;
      handleToggleSurface(info.node.id, enableVal);
    }
    setSurfaceCheckedKeys(checkedKeys);
  };

  // Then build the “All Surfaces” node using sChildren

  const isAnyFileNeedToSave = filesDataSaved.some((file) => {
    const findSurfaces = surfaceLibrary.find(
      (surf) =>
        replaceFileExtFunc(surf?.fileName) ===
          replaceFileExtFunc(file.fileName) ||
        replaceFileExtFunc(surf?.xmlFileName) ===
          replaceFileExtFunc(file.fileName) ||
        replaceFileExtFunc(surf?.dxfFileName) ===
          replaceFileExtFunc(file.fileName) ||
        replaceFileExtFunc(surf?.surfaceName) ===
          replaceFileExtFunc(file.fileName) ||
        replaceFileExtFunc(surf?.mainZipFileName) ===
          replaceFileExtFunc(file.fileName)
    );
    if (!findSurfaces) {
      return !file.geometryFetched;
    }
    if (findSurfaces) {
      if (file.fileName.includes('pslz')) {
        return (
          !file.bvhFetched ||
          !file.breakLinesFetched ||
          !file.imageBlobsFetched ||
          !file.uvArrayDatasFetched ||
          !file.geometryFetched
        );
      } else {
        return (
          !file.bvhFetched || !file.breakLinesFetched || !file.geometryFetched
        );
      }
    }
  });
  return (
    <div
      className={`min-w-[250px] p-[1rem] overflow-y-scroll  h-[calc(100vh-50px)] bg-[#dcdddf]`}
    >
      {isAnyFileNeedToSave && !bvhCalculationLoading && (
        <Button
          disabled={showProgressModal}
          onClick={() => {
            setShowProgressModal(true);
            setTimeout(() => {
              handleSaveGeometryData();
            }, 10);
          }}
          type={'default'}
        >
          Save Geometry Data
        </Button>
      )}
      {bvhCalculationLoading && (
        <>
          {genericProgressBar < 100 && (
            <div>
              <p>Processing... {genericProgressBar}%</p>
              <progress value={genericProgressBar} max='100'>
                {genericProgressBar}%
              </progress>
            </div>
          )}
        </>
      )}
      <Divider />

      {fileTreeData.length ? (
        <>
          <Title level={3}>Files & Layers</Title>
          <Divider />
          <Tree
            // style={{ backgroundColor: lightGreyColor }}
            checkable
            showLine
            onExpand={onExpand}
            expandedKeys={expandedKeys}
            treeData={fileTreeData}
            checkedKeys={fileCheckedKeys}
            onCheck={onFileTreeCheck}
          />
        </>
      ) : null}
      {fileTreeData.length ? <Divider /> : null}
      {surfaceTreeData.length ? (
        <>
          <Title level={3} className='mt-[2rem]'>
            Surface Library
          </Title>
          <Divider />
          <Tree
            // style={{ backgroundColor: lightGreyColor }}
            checkable
            showLine
            treeData={surfaceTreeData}
            checkedKeys={surfaceCheckedKeys}
            onCheck={onSurfaceTreeCheck}
          />
        </>
      ) : null}

      {/* The new modal */}
      {showPropertiesModal ? (
        <SurfacePropertiesModal
          bvhCalculationLoading={bvhCalculationLoading}
          imageOverLayingProgress={imageOverLayingProgress}
          visible={showPropertiesModal}
          onClose={handleCloseModal}
          surfaceData={selectedSurface}
          onSaveChanges={handleSaveSurfaceChanges}
          surfaceLibrary={surfaceLibrary}
          loadingImage={loadingImage}
          zipFileData={zipFileData}
          imageProgress={imageProgress}
          genericProgressBar={genericProgressBar}
        />
      ) : null}
    </div>
  );
};

export { SidePanel };
