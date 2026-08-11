// refStore.js
import { createRef } from 'react';
import * as THREE from 'three';

// Create a shared ref
const mountRef = createRef(null);
const sceneRef = createRef(null);
const cameraRef = createRef(null);
const rendererRef = createRef(null);
const controlRef = createRef(null);

const selectedPointsRef = createRef();
selectedPointsRef.current = [];

const isMultiShapeCompleted = createRef();
isMultiShapeCompleted.current = false;

const multiPointsRef = createRef();
multiPointsRef.current = [];

const polygonMarkersGroupRef = createRef();
// const allTerrainMeshesRef = createRef();
// allTerrainMeshesRef.current = [];
const adjacencyMapRef = createRef();
adjacencyMapRef.current = [];
const isMiddleMouseDownRef = createRef();
isMiddleMouseDownRef.current = false;
const chartRef = createRef();
const terrainMeshRef = createRef();
// refStore.js
const isPolylineMode = createRef();
isPolylineMode.current = false;
const isPolylineCompleted = createRef();
isPolylineCompleted.current = false;
const polylinePointsRef = createRef();
polylinePointsRef.current = [];
const surfaceRunningId = createRef();
surfaceRunningId.current = 0;
const currentSurfaceSelected = createRef();
currentSurfaceSelected.current = null;

const prevLineDataRef = createRef(null);
prevLineDataRef.current = null;
const prevMultiPointsRef = createRef(null);
prevMultiPointsRef.current = [];
const prevPolylinePointsRef = createRef(null);
prevPolylinePointsRef.current = [];
const prevSurfaceEnabledRef = createRef(null);
prevSurfaceEnabledRef.current = [];

const lineDataBySurfaceRef = createRef(null);
lineDataBySurfaceRef.current = {};

const intersectionPointsRef = createRef(null);
intersectionPointsRef.current = {};

const filesContainingImages = createRef(null);
filesContainingImages.current = [];

const initialCamPoseRef = createRef(null);
initialCamPoseRef.current = {
  pos: new THREE.Vector3(),
  tgt: new THREE.Vector3(),
  up: new THREE.Vector3(),
};
export {
  mountRef,
  sceneRef,
  cameraRef,
  rendererRef,
  controlRef,
  isMultiShapeCompleted,
  selectedPointsRef,
  multiPointsRef,
  polygonMarkersGroupRef,
  // allTerrainMeshesRef,
  adjacencyMapRef,
  isMiddleMouseDownRef,
  chartRef,
  terrainMeshRef,
  isPolylineMode,
  isPolylineCompleted,
  polylinePointsRef,
  surfaceRunningId,
  currentSurfaceSelected,
  prevLineDataRef,
  prevMultiPointsRef,
  prevPolylinePointsRef,
  prevSurfaceEnabledRef,
  lineDataBySurfaceRef,
  intersectionPointsRef,
  filesContainingImages,
  initialCamPoseRef,
};
