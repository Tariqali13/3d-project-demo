"use client"

import { useState, useEffect, useRef } from "react"
import * as THREE from "three"
import { TrackballControls } from "three/examples/jsm/controls/TrackballControls.js"
import short from "short-uuid"
import { convertXMLToEntities, categorizeEntities } from "./utils/parsingAndConvertingUtils"
import { CalculationsAndGraphModal, ModeButtons, SidePanel, ZoomControls, FileBrowser } from "./components"
import {
  handleMouseDownSinglePoint,
  handleMouseMoveSinglePoint,
  clearSinglePointLines,
} from "./utils/singlePointCalcuAndFunc"
import {
  handleDoubleClickMultiPoint,
  handleMultiPointClick,
  handleMultiPointMouseMove,
  resetMultiPoint,
  clearMultiPointLines,
} from "./utils/multiPointCalcuAndFunc"
import { renderEntity, setupLighting, onBuildSurface, replaceFileExtFunc } from "./utils/parsingAndBuildingGeometries"

import { handleMiddleMouseDown, handleMiddleMouseUp } from "./utils/controlsUtils"
import {
  handlePolylineClick,
  handlePolylineMouseMove,
  handleDoubleClickPolyline,
  clearPolylineSegments,
} from "./utils/polylineCalcuAndFunc"
import { Spin, Flex, notification } from "antd"

// import { fetchFilesData } from './utils/apiCall';
import _ from "lodash" // or just import throttle from 'lodash/throttle'
import {
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
  polylinePointsRef,
  isPolylineCompleted,
  lineDataBySurfaceRef,
  filesContainingImages,
  initialCamPoseRef,
} from './constants/refStore';
import { jwtDecode } from 'jwt-decode';
import {
  computeBVHInWorker,
  computeSharpEdgesFromGeometryInWorker,
  computeSharpEdgesInChunks,
} from './utils/bvhWorkerHelper';
import { computeSharpEdgesFromGeometry } from './utils/commonUtils';
import {
  loadCombinedGeometryAndMetadata,
  loadCombinedBVH,
  loadCombinedBreakLineEdges,
  loadCompressedBlob,
  loadCompressedUVData,
} from './utils/fileSaving';
import axios from 'axios';
import GeometryFilesUploadingStatus from './components/geometryFilesUploadingStatus';
import { decodeBase64InWorker } from './utils/loadTextureWorkerHelper';
import { computeUVsForDrapePixelCenterWorker } from './utils/computeUvsWorkerHelper';
import { unzipLargeFileInWorker } from './utils/unzipWorkerHelper';
// A helper to build a "square marker" for each polygon vertex
// Add new component for Surface Reports Modal
import { SurfaceReportModal } from "./components/SurfaceReportModal"
import { calculatePolygonArea3D } from "./utils/multiPointCalcuAndFunc"

import {
  interpolateBaseSurface,
  calculateVolumeFromSurface
} from "./utils/surfaceInterpolationUtils"

const Map3DViewer = () => {
  // ----------------
  // Instead of a single fileContent, we store multiple files data:
  // ----------------
  // All States'
  // The showcase intentionally has no production service fallback. Integrators
  // can provide their own same-origin demo API when exercising API-backed flows.
  const referrerDomain = window.location.origin
  const mainContainerRef = useRef(null)
  const [totalFilesLength, setTotalFilesLength] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  const [filesData, setFilesData] = useState([]) // Each { content, name }
  const [fileLayers, setFileLayers] = useState([]) // file + layer library
  const [surfaceLibrary, setSurfaceLibrary] = useState([]) // just 3D faces

  const [flattenToPlane, setFlattenToPlane] = useState(false)
  const [lineData, setLineData] = useState(null)
  const [actualLineData, setActualLineData] = useState(null)
  const [multiPoints, setMultiPoints] = useState([])
  const [isMultiPointMode, setIsMultiPointMode] = useState(false)
  const [isSinglePointMode, setIsSinglePointMode] = useState(false)
  const [showGraphModal, setShowGraphModal] = useState(false)
  const [loadedScreen, setLoadedScreen] = useState(false)
  const [pivotPoint, setPivotPoint] = useState(null)

  const [bvhCalculated, setBvhCalculated] = useState(false)
  const [bvhCalculationLoading, setBvhCalculationLoading] = useState(false)
  const [isPolylineMode, setIsPolylineMode] = useState(false)
  const [polylinePoints, setPolylinePoints] = useState([])

  // 8) Store texture once loaded
  const [buildProgress, setBuildProgress] = useState(0)

  const [categorizeEntitiesProgress, setCategorizeEntitiesProgress] = useState(0)
  const [showBrowserFiles, setShowBrowserFiles] = useState(false)

  const [zipFileData, setZipFilesData] = useState([])
  const queryParameters = new URLSearchParams(window.location.search)
  const token = queryParameters.get("token")

  const [authState, setAuthState] = useState({
    isAuthenticated: false,
    user: null,
    admin: null,
    app: null,
  })
  const [authError, setAuthError] = useState(false)

  const [selectedFiles, setSelectedFiles] = useState([])
  const [selectedFilesToUpload, setSelectedFilesToUpload] = useState([])
  const [projectId, setProjectId] = useState(null)
  const [progressStates, setProgressStates] = useState({})

  const [showProgressModal, setShowProgressModal] = useState(false)

  const [filesDataSaved, setFilesDataSaved] = useState([])

  const [genericProgressBar, setGenericProgressBar] = useState(0)
  const [showPropertiesModal, setShowPropertiesModal] = useState(false)
  const [fileCreationStart, setFileCreationStart] = useState(false)
  // Add new state variables for the new features
  const [planeFeatures, setPlaneFeatures] = useState(false)
  const [topDownView, setTopDownView] = useState(false)
  const [surfaceReportType, setSurfaceReportType] = useState(null)
  const [showSurfaceReportModal, setShowSurfaceReportModal] = useState(false)
  const [customReportName, setCustomReportName] = useState("")
  const [selectedSurfaceForReport, setSelectedSurfaceForReport] = useState(null)
  const [selectedSecondSurfaceForReport, setSelectedSecondSurfaceForReport] = useState(null)
  const [selectedElevation, setSelectedElevation] = useState(0)
  const [tabKeys, setTabKeys] = useState('2'); // default to Surface Measure & Section

  useEffect(() => {
    if (!token) {
      setAuthError(true)
      console.error("Token not found in URL parameters")
      return
    }

    try {
      const decoded = jwtDecode(token)

      // Validate the token expiration
      const currentTime = Math.floor(Date.now() / 1000)
      if (decoded.exp && decoded.exp < currentTime) {
        setAuthError(true)
        console.error("Token has expired")
        return
      }
      // Set token data to state
      setAuthState({
        isAdminLoggedIn: decoded.appState?.isAdminLoggedIn || false,
        isAuthenticated: true,
        user: decoded.appState?.user || null,
        admin: decoded.appState?.admin || null,
        app: decoded.appState?.app || null,
      })
      setAuthError(false)
    } catch (error) {
      console.error("Invalid token:", error)
      setAuthError(true)
    }
  }, [token])

  // console.log({ fileLayers, surfaceLibrary }, 'daata');
  const clearFull = () => {
    if (!sceneRef.current || !rendererRef.current) {
      console.warn("clearFull: Either sceneRef or rendererRef is undefined.")
      return
    }

    if (!(sceneRef.current instanceof THREE.Scene)) {
      console.error("clearFull: sceneRef.current is not an instance of THREE.Scene:", sceneRef.current)
      return
    }
    // Step 1: Collect all meshes to dispose
    const objectsToDispose = []
    sceneRef.current.traverse((object) => {
      // if (object.isMesh) {
      objectsToDispose.push(object)
      // }
    })

    // Step 2: Dispose and remove each collected mesh
    objectsToDispose.forEach((object) => {
      // Dispose geometry
      if (object.geometry) {
        object.geometry.dispose()
      }

      // Dispose materials
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach((material) => {
            material.dispose()
          })
        } else {
          object.material.dispose()
        }
      }

      // Remove the object from the scene
      sceneRef.current.remove(object)
    })

    // // Step 3: Clear all terrain meshes
    // surfaceLibrary.forEach((surf) => {
    //   const mesh = surf._object;
    //   if (mesh.geometry) mesh.geometry.dispose();
    //   if (mesh.material) {
    //     if (Array.isArray(mesh.material)) {
    //       mesh.material.forEach((material) => material.dispose());
    //     } else {
    //       mesh.material.dispose();
    //     }
    //   }
    //   sceneRef.current.remove(mesh);
    // });

    // fileLayers.forEach((file) => {
    //   const mesh = file._group;
    //   if (mesh.geometry) mesh.geometry.dispose();
    //   if (mesh.material) {
    //     if (Array.isArray(mesh.material)) {
    //       mesh.material.forEach((material) => material.dispose());
    //     } else {
    //       mesh.material.dispose();
    //     }
    //   }
    //   sceneRef.current.remove(mesh);
    // });

    const existingIndicators = sceneRef.current.children.filter((child) => child.name === "pivotIndicator")
    if (existingIndicators?.length) {
      existingIndicators?.forEach((indicator) => sceneRef.current.remove(indicator))
    }

    toggleResetAll()
    // Step 5: Reset state variables
    setFileLayers([])
    setSurfaceLibrary([])
    setLoadedScreen(false)
    setFilesData([])
    setCategorizeEntitiesProgress(0)
    setBuildProgress(0)
    setZipFilesData([])
    setTotalFilesLength(0)
    setFlattenToPlane(false)
    setPivotPoint(null)
    setSelectedFiles([])
    setBvhCalculated(false)
    setProgressStates({})
    // Step 6: Remove and dispose renderer
    if (rendererRef.current.domElement && mountRef.current.contains(rendererRef.current.domElement)) {
      mountRef.current.removeChild(rendererRef.current.domElement)
    }

    rendererRef.current.dispose()
    rendererRef.current = null
    // Step 7: Reset scene and camera references
    sceneRef.current = null
    cameraRef.current = null
  }

  const openGraphModal = () => {
    if (isSinglePointMode && (!lineData.startPoint || !lineData.endPoint)) {
      notification.warning({
        message: `Alert`,
        description: "Add atleast two points",
        placement: "top",
        duration: 2,
        showProgress: true,
      })
      return
    }
    if (isMultiPointMode && !isMultiShapeCompleted.current) {
      notification.warning({
        message: `Alert`,
        description: "Minimum Three Points Required. Double click to close the shape",
        placement: "top",
        duration: 2,
        showProgress: true,
      })
      return
    }
    if (isPolylineMode && !isPolylineCompleted.current) {
      notification.warning({
        message: `Alert`,
        description: "Double Click to finish the shape",
        placement: "top",
        duration: 2,
        showProgress: true,
      })
      return
    }
    setShowGraphModal(true)
  }
  // Put this somewhere near the top or above your measure functions:

  const closeGraphModal = () => {
    setShowGraphModal(false)
  }

  // =========== MODE TOGGLES / RESETS =============
  const togglePolylineMode = () => {
    // reset other modes if needed
    toggleResetAll("polyline") // same function that clears multiPoint etc.
    setIsPolylineMode((prev) => !prev)
  }
  const toggleMultiPointMode = () => {
    toggleResetAll("multiPoint")
    setIsMultiPointMode((prev) => !prev)
  }

  const toggleSinglePointMode = () => {
    toggleResetAll("singlePoint")
    setIsSinglePointMode((prev) => !prev)
  }

  const toggleResetAll = (currentFunc) => {
    if (sceneRef.current) {
      clearMultiPointLines(sceneRef.current)
      clearSinglePointLines(sceneRef.current)
      clearPolylineSegments(sceneRef.current) // <--- new
    }
    // Reset references and states
    resetMultiPoint()
    if (currentFunc === "polyline") {
      setIsMultiPointMode(false)
      setIsSinglePointMode(false)
    } else if (currentFunc === "multiPoint") {
      setIsPolylineMode(false)
      setIsSinglePointMode(false)
    } else if (currentFunc === "singlePoint") {
      setIsMultiPointMode(false)
      setIsPolylineMode(false)
    } else {
      setIsMultiPointMode(false)
      setIsSinglePointMode(false)
      setIsPolylineMode(false)
    }
    setLineData(null)
    setActualLineData(null)
    setPolylinePoints([])
    selectedPointsRef.current = []
    multiPointsRef.current = []
    polylinePointsRef.current = []
    isMultiShapeCompleted.current = false
    isPolylineCompleted.current = false
    polygonMarkersGroupRef.current = null
    lineDataBySurfaceRef.current = []
  }

  useEffect(() => {
    if (!mountRef.current) return

    const handleResize = () => {
      // Defer the heavy DOM changes to the next frame
      requestAnimationFrame(() => {
        if (rendererRef.current && mountRef.current && mainContainerRef.current) {
          const width = mountRef.current.clientWidth - 10
          const height = mountRef.current.clientHeight - 10
          rendererRef.current.setSize(width, height)

          rendererRef.current.domElement.style.cssText = `
            min-width: ${width}px !important;
          `
          rendererRef.current.render(sceneRef.current, cameraRef.current)
        }
      })
    }

    const resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(mountRef.current)

    return () => resizeObserver.disconnect()
  }, [mountRef, rendererRef, mainContainerRef])

  // =========== MAIN RENDERING EFFECT =============
  useEffect(() => {
    if (loadedScreen) return

    if (!filesData.length) return
    if (totalFilesLength !== filesData.length) return
    setIsLoading(true)
      // let entities = [];
      ; (async () => {
        let newFileLayers = []
        let newSurfaceLibrary = []
        let savedFileCount = 0
        for await (let [idx, fileObj] of filesData.entries()) {
          const shortUUID = short.generate()
          const { content, name, geometrySavedData, file, mainZipFileName } = fileObj

          const fileType = name?.split(".").pop().toLowerCase()
          if (geometrySavedData) idx = idx + 1
          try {
            if (geometrySavedData) {
              const combinData = await loadCombinedGeometryAndMetadata(file)
              const layers = loadLayersToScene(combinData, shortUUID)
              if (layers?.length) {
                newFileLayers = [...newFileLayers, ...layers]
              }
              const surfaces = loadSurfacesToScene(combinData, shortUUID)
              if (surfaces?.length) {
                newSurfaceLibrary = [...newSurfaceLibrary, ...surfaces]
              }
              savedFileCount = savedFileCount + 1
            } else if (fileType === "dxf") {
              const { layers, surfaces } = await categorizeEntities(
                content,
                shortUUID,
                setCategorizeEntitiesProgress,
                name,
                mainZipFileName,
              )
              // push a record for the "file library"
              if (layers?.length) {
                newFileLayers.push({
                  fileName: name,
                  layers: layers, // each has an id, type, entities
                })
              }
              if (surfaces?.length) {
                newSurfaceLibrary.push(...surfaces)
              }
            } else if (fileType === "xml") {
              const entities = convertXMLToEntities(content, name)
              if (entities.length) {
                const { layers, surfaces } = await categorizeEntities(
                  entities,
                  shortUUID,
                  setCategorizeEntitiesProgress,
                  name,
                  mainZipFileName,
                )
                if (layers?.length) {
                  newFileLayers.push({
                    fileName: name,
                    layers: layers, // each has an id, type, entities
                  })
                }
                if (surfaces?.length) {
                  newSurfaceLibrary.push(...surfaces)
                }
              } else {
                notification.error({
                  message: `Error`,
                  description: "This file has not valid data to process",
                  placement: "top",
                  duration: 2,
                  showProgress: true,
                })
                throw new Error("Wrong file")
              }
            }
          } catch (error) {
            setIsLoading(false)
            console.error("Error parsing file:", error)
          }
        }
        setFileLayers(newFileLayers)
        setSurfaceLibrary(newSurfaceLibrary)
        newFileLayers = []
        newSurfaceLibrary = []
        return
      })()
    // for (let i = 0; i < filesData.length; i++) {}
    // filesData.forEach(async (fileObj, idx) => {});
  }, [filesData.length])

  async function fetchWithProgress(url, type = "", onProgress) {
    const response = await axios.get(url, {
      responseType: type === "pslz" ? "arraybuffer" : "blob",
      onDownloadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          onProgress(percentCompleted)
        }
      },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          onProgress(percentCompleted)
        }
      },
    })
    return response
  }
  async function tryLoadPreCreatedBvh(file, fileType) {
    let bvhFetched = false
    let bvhBlob = null

    try {
      // 1) Construct the awsPathWithoutExt
      const awsPathWithoutExt = replaceFileExtFunc(file.aws_path)

      // e.g. we always pick [0]-th fileTypesToLoad => geometry_data.bin, or something
      const urlForBvh = `${referrerDomain}/api/demo/files/show-3d?path=${awsPathWithoutExt}_${fileType}&userId=${authState.user.id}&download=true&token=${token}`

      // 2) Attempt to fetch the 3D file's path
      const res = await axios.get(urlForBvh)
      const typeFileGet = res.data.data || {}
      const directAwsPath = typeFileGet.aws_path
      if (!directAwsPath) {
        // Means no geometry data found => skip
        bvhFetched = false
      } else {
        // We do fetchWithProgress from that direct path
        const fetchResponse = await fetchWithProgress(
          directAwsPath,
          "", // or 'bin'
          (pct) => setGenericProgressBar(pct),
        )
        bvhBlob = new Blob([fetchResponse.data])
        bvhFetched = true
      }
    } catch (error) {
      bvhFetched = false // fallback
    }

    return { bvhFetched, bvhBlob }
  }

  async function tryLoadPreCreatedBreaklines(file, fileType) {
    let breakLinesFetched = false
    let breakLinesBlob = null

    try {
      // 1) Construct the awsPathWithoutExt
      const awsPathWithoutExt = replaceFileExtFunc(file.aws_path)
      // e.g. we always pick [0]-th fileTypesToLoad => geometry_data.bin, or something
      const urlForBvh = `${referrerDomain}/api/demo/files/show-3d?path=${awsPathWithoutExt}_${fileType}&userId=${authState.user.id}&download=true&token=${token}`

      // 2) Attempt to fetch the 3D file's path
      const res = await axios.get(urlForBvh)
      const typeFileGet = res.data.data || {}
      const directAwsPath = typeFileGet.aws_path
      if (!directAwsPath) {
        // Means no geometry data found => skip
        breakLinesFetched = false
      } else {
        // We do fetchWithProgress from that direct path
        const fetchResponse = await fetchWithProgress(
          directAwsPath,
          "", // or 'bin'
          (pct) => setGenericProgressBar(pct),
        )
        breakLinesBlob = new Blob([fetchResponse.data])
        breakLinesFetched = true
      }
    } catch (error) {
      breakLinesFetched = false // fallback
    }

    return { breakLinesFetched, breakLinesBlob }
  }

  async function tryLoadPreCreatedImageBlob(file, fileType) {
    let imageBlobFetched = false
    let imageBlobData = null

    try {
      // 1) Construct the awsPathWithoutExt
      const awsPathWithoutExt = replaceFileExtFunc(file.aws_path)
      // e.g. we always pick [0]-th fileTypesToLoad => geometry_data.bin, or something
      const urlForImageBlob = `${referrerDomain}/api/demo/files/show-3d?path=${awsPathWithoutExt}_${fileType}&userId=${authState.user.id}&download=true&token=${token}`

      // 2) Attempt to fetch the 3D file's path
      const res = await axios.get(urlForImageBlob)
      const typeFileGet = res.data.data || {}
      const directAwsPath = typeFileGet.aws_path
      if (!directAwsPath) {
        // Means no geometry data found => skip
        imageBlobFetched = false
      } else {
        // We do fetchWithProgress from that direct path
        const fetchResponse = await fetchWithProgress(
          directAwsPath,
          "", // or 'bin'
          (pct) => setGenericProgressBar(pct),
        )
        imageBlobData = new Blob([fetchResponse.data])
        imageBlobFetched = true
      }
    } catch (error) {
      imageBlobFetched = false // fallback
    }

    return { imageBlobFetched, imageBlobData }
  }

  async function tryLoadPreCreatedUvArrayData(file, fileType) {
    let uvArrayDataFetched = false
    let uvArrayData = null

    try {
      // 1) Construct the awsPathWithoutExt
      const awsPathWithoutExt = replaceFileExtFunc(file.aws_path)
      // e.g. we always pick [0]-th fileTypesToLoad => geometry_data.bin, or something
      const urlForImageBlob = `${referrerDomain}/api/demo/files/show-3d?path=${awsPathWithoutExt}_${fileType}&userId=${authState.user.id}&download=true&token=${token}`

      // 2) Attempt to fetch the 3D file's path
      const res = await axios.get(urlForImageBlob)
      const typeFileGet = res.data.data || {}
      const directAwsPath = typeFileGet.aws_path
      if (!directAwsPath) {
        // Means no geometry data found => skip
        uvArrayDataFetched = false
      } else {
        // We do fetchWithProgress from that direct path
        const fetchResponse = await fetchWithProgress(
          directAwsPath,
          '', // or 'bin'
          (pct) => setGenericProgressBar(pct)
        );
        uvArrayData = new Blob([fetchResponse.data]);
        uvArrayDataFetched = true;
      }
    } catch (error) {
      uvArrayDataFetched = false // fallback
    }

    return { uvArrayDataFetched, uvArrayData }
  }
  async function fetchOrUnzipFile(file, zipFilesData) {
    // 1) first get presigned link
    const url = `${referrerDomain}/api/demo/files/show?id=${file.id}&userId=${authState.user.id}&download=true&token=${token}`
    try {
      const signResp = await axios.get(url)
      const awsPath = signResp.data?.data?.aws_path
      if (!awsPath) return // skip
      const fileName = file.fileFolder.name
      const fileType = fileName.split(".").pop().toLowerCase()
      const fetchResponse = await fetchWithProgress(awsPath, fileType, (pct) => setGenericProgressBar(pct))
      if (fileType === "pslz") {
        // do unzip
        const unzipResult = await unzipLargeFileInWorker({
          fileData: fetchResponse.data,
          zipfileName: fileName,
          onProgress: (p) => setGenericProgressBar(p),
          unzipContent: false,
        })
        if (unzipResult && unzipResult.length) {
          const main = unzipResult[0]
          let objectToSave = {
            fileName: main.fileName,
            jgwValues: main.jgwValues,
            jpgFile: main.jpgFile,
          }
          if (main?.xmlContent) {
            objectToSave = {
              ...objectToSave,
              xmlFileName: main.xmlContent.fileName,
            }
          }
          if (main?.dxfContent) {
            objectToSave = {
              ...objectToSave,
              dxfFileName: main.dxfContent.fileName,
            }
          }
          zipFilesData.push(objectToSave)
        }
      }
    } catch (error) {
      console.error("Error in fetchOrUnzipFile fallback pipeline:", error)
    }
  }
  function chunkGeometry(positions, maxChunkSize = 3000000) {
    const chunks = [];
    for (let i = 0; i < positions.length; i += maxChunkSize) {
      chunks.push(positions.slice(i, i + maxChunkSize));
    }
    return chunks;
  }
  const createBvhCalculations = async () => {
    let anyError = false
    const zipFilesData = zipFileData || []
    const pslzFilesSurfaceNames = []
    const fileSaveDataLocal = filesDataSaved || []
    let imageBlobsFetched = false
    let uvArrayDatasFetched = false
    for (const [fileIdx, file] of selectedFilesToUpload.entries()) {
      const fileName = file.fileFolder.name
      const fileType = fileName.split(".").pop().toLowerCase()
      if (fileType == "pslz") {
        if (file.xmlFileName) {
          const imgFileName = replaceFileExtFunc(file.xmlFileName)
          filesContainingImages.current.push(imgFileName)
        }
        if (file.dxfFileName) {
          const imgFileName = replaceFileExtFunc(file.dxfFileName)
          filesContainingImages.current.push(imgFileName)
        }
        if (file.mainZipFileName) {
          const imgFileName = replaceFileExtFunc(file.mainZipFileName)
          filesContainingImages.current.push(imgFileName)
        }
        if (fileName) {
          const imgFileName = replaceFileExtFunc(fileName)
          filesContainingImages.current.push(imgFileName)
        }
      }
      const { bvhFetched, bvhBlob } = await tryLoadPreCreatedBvh(file, "bvh_data.bin")
      const { breakLinesFetched, breakLinesBlob } = await tryLoadPreCreatedBreaklines(file, "breakline_edges.bin")
      if (bvhFetched) {
        const bvhFile = await loadCombinedBVH(bvhBlob)
        bvhFile.forEach((bvh) => {
          const findSurface = surfaceLibrary.find((surf) => surf.id === bvh.surfaceId)
          const surfGroup = new THREE.Group()
          findSurface._group = surfGroup
          surfGroup.visible = findSurface.enableValue
          if (findSurface) {
            findSurface.bvhRoot = bvh.bvhRoot
          }
        })
      }
      if (breakLinesFetched) {
        const breakLinesFile = await loadCombinedBreakLineEdges(breakLinesBlob)
        breakLinesFile.forEach((breakLines) => {
          const findSurface = surfaceLibrary.find((surf) => surf.id === breakLines.surfaceId)
          if (findSurface) {
            findSurface._breakLineEdges = breakLines.breakLineEdges
          }
        })
      }
      if (fileType == "pslz") {
        if (file.xmlFileName) {
          const imgFileName = replaceFileExtFunc(file.xmlFileName)
          pslzFilesSurfaceNames.push(imgFileName)
        }
        if (file.dxfFileName) {
          const imgFileName = replaceFileExtFunc(file.dxfFileName)
          pslzFilesSurfaceNames.push(imgFileName)
        }
        if (file.mainZipFileName) {
          const imgFileName = replaceFileExtFunc(file.mainZipFileName)
          pslzFilesSurfaceNames.push(imgFileName)
        }
        if (fileName) {
          const imgFileName = replaceFileExtFunc(fileName)
          pslzFilesSurfaceNames.push(imgFileName)
        }
        const { imageBlobFetched, imageBlobData } = await tryLoadPreCreatedImageBlob(file, "image_blob.bin")
        const { uvArrayDataFetched, uvArrayData } = await tryLoadPreCreatedUvArrayData(file, "⁠uv_data.bin")
        if (imageBlobFetched) {
          imageBlobsFetched = imageBlobFetched
          const imageBlobFile = await loadCompressedBlob(imageBlobData)
          imageBlobFile.forEach(async (imageBlob) => {
            const findSurface = surfaceLibrary.find((surf) => surf.id === imageBlob.surfaceId)
            if (findSurface) {
              findSurface.blobData = imageBlob
              const imageBitmap = await createImageBitmap(imageBlob.blob)
              const texture = new THREE.Texture(imageBitmap)
              texture.needsUpdate = true
              findSurface.texture = texture
            }
          })
        } else {
          const findZipFile = zipFileData.find((zip) => zip.fileName == fileName)
          if (!findZipFile) {
            await fetchOrUnzipFile(file, zipFilesData)
          }
        }
        if (uvArrayDataFetched) {
          uvArrayDatasFetched = uvArrayDataFetched
          const uvArrayDataFiles = await loadCompressedUVData(uvArrayData)
          uvArrayDataFiles.forEach(async (data) => {
            const findSurface = surfaceLibrary.find((surf) => surf.id === data.surfaceId)
            if (findSurface) {
              findSurface.uvArrayData = data
            }
          })
        }
      }
      const findSaveFileData = fileSaveDataLocal.find(
        (file) => replaceFileExtFunc(file.fileName) == replaceFileExtFunc(fileName),
      )
      if (findSaveFileData) {
        const geometryFetched = findSaveFileData.geometryFetched
        const findIndex = fileSaveDataLocal.findIndex((file) => file.fileName == fileName)
        if (fileType == "pslz") {
          fileSaveDataLocal.splice(findIndex, 1, {
            ...findSaveFileData,
            fileName,
            fileType,
            bvhFetched,
            breakLinesFetched,
            imageBlobsFetched,
            uvArrayDatasFetched,
            geometryFetched,
          })
        } else {
          fileSaveDataLocal.splice(findIndex, 1, {
            ...findSaveFileData,
            fileName,
            fileType,
            bvhFetched,
            breakLinesFetched,
            geometryFetched,
          })
        }
      } else {
        if (fileType == "pslz") {
          fileSaveDataLocal.push({
            fileName,
            fileType,
            bvhFetched,
            breakLinesFetched,
            imageBlobsFetched,
            uvArrayDatasFetched,
            geometryFetched: false,
          })
        } else {
          fileSaveDataLocal.push({
            fileName,
            fileType,
            bvhFetched,
            breakLinesFetched,
            geometryFetched: false,
          })
        }
      }
    }

    for (const [surfIdx, surf] of surfaceLibrary.entries()) {
      const isIncludeAnyName =
        pslzFilesSurfaceNames.includes(replaceFileExtFunc(surf.fileName)) ||
        pslzFilesSurfaceNames.includes(replaceFileExtFunc(surf.surfaceName)) ||
        pslzFilesSurfaceNames.includes(replaceFileExtFunc(surf.mainZipFileName))
      if (zipFilesData.length && !surf.blobData && isIncludeAnyName) {
        filesContainingImages.current.push(replaceFileExtFunc(surf.fileName))
        filesContainingImages.current.push(replaceFileExtFunc(surf.surfaceName))
        filesContainingImages.current.push(replaceFileExtFunc(surf.mainZipFileName))
      }
      if (zipFileData.length && !surf.uvArrayData && isIncludeAnyName) {
        filesContainingImages.current.push(replaceFileExtFunc(surf.fileName))
        filesContainingImages.current.push(replaceFileExtFunc(surf.surfaceName))
        filesContainingImages.current.push(replaceFileExtFunc(surf.mainZipFileName))
      }
      if (!surf.bvhRoot || !surf._breakLineEdges) {
        const surfGroup = new THREE.Group();
        surfGroup.name = surf.surfaceName || `Surface-${surfIdx}`;
        const combinedMesh = surf._object;
        surf._group = surfGroup;
        surfGroup.visible = surf.enableValue;
        let nonIndexedGeom = combinedMesh.geometry;
        if (nonIndexedGeom.index) {
          nonIndexedGeom = nonIndexedGeom.toNonIndexed()
        }
        const posAttr = nonIndexedGeom.getAttribute('position');
        // Compute BVH first for all chunks

        if (!surf.bvhRoot) {
          try {
            surf.bvhRoot = await computeBVHInWorker(
              new Float32Array(posAttr.array),
              200,
              90000,
              (progress) => setGenericProgressBar(progress)
            );
          } catch (err) {
            console.error('BVH error for', surf.surfaceName, ':', err.message);
          }
        }

        //   // Compute sharp edges only after BVH is done
        if (!surf._breakLineEdges) {
          try {
            const breakEdges = await computeSharpEdgesInChunks(
              new Float32Array(posAttr.array),
              30,
              90000,
              (pct) => setGenericProgressBar(pct)
            );

            surf._breakLineEdges = breakEdges;
          } catch (err) {
            console.error(
              'Sharp edges error for',
              surf.surfaceName,
              ':',
              err.message
            );
          }
        }
      }

      if (zipFilesData.length && !surf.blobData && isIncludeAnyName) {
        const findZipFileData = zipFilesData?.find(
          (zi) =>
            replaceFileExtFunc(zi.xmlFileName) === replaceFileExtFunc(surf.surfaceName) ||
            replaceFileExtFunc(zi.fileName) ||
            replaceFileExtFunc(zi.mainZipFileName),
        )
        if (findZipFileData) {
          await decodeBase64InWorker(findZipFileData.jpgFile.data, (progress) => {
            setGenericProgressBar(progress)
          })
            .then(async ({ blob }) => {
              surf.blobData = { blob, surfaceId: surf.id }
              const imageBitmap = await createImageBitmap(blob)
              const texture = new THREE.Texture(imageBitmap)
              texture.needsUpdate = true
              surf.texture = texture
            })
            .catch((err) => {
              console.error("Error loading overlay image:", err)
            })
        }
      }
      if (zipFileData.length && !surf.uvArrayData && isIncludeAnyName) {
        const findZipFileData = zipFileData?.find(
          (zi) =>
            replaceFileExtFunc(zi.xmlFileName) === replaceFileExtFunc(surf.surfaceName) ||
            replaceFileExtFunc(zi.fileName) ||
            replaceFileExtFunc(zi.mainZipFileName),
        )
        if (findZipFileData) {
          const lines = findZipFileData.jgwValues.data.split("\n").map((line) => Number.parseFloat(line))
          if (lines.length >= 6) {
            const jgwValues = {
              pixelWidth: lines[0],
              rotationX: lines[1],
              rotationY: lines[2],
              pixelHeight: lines[3],
              topLeftX: lines[4],
              topLeftY: lines[5],
            }
            const imageBitmap = await createImageBitmap(surf.blobData.blob)
            const texture = new THREE.Texture(imageBitmap)
            texture.needsUpdate = true
            const textureToLoad = texture
            const geometry = surf._object.geometry
            const positionAttr = geometry.getAttribute("position")
            const positions = new Float32Array(positionAttr.array) // create a copy
            await computeUVsForDrapePixelCenterWorker(positions, textureToLoad, jgwValues, (percent) =>
              setGenericProgressBar(percent),
            )
              .then((uvArray) => {
                surf.uvArrayData = { uvArray, surfaceId: surf.id }
              })
              .catch((err) => {
                console.log("errosr in uv", err)
              })
          } else {
            console.error("JGW sfile not in the expected 6-line format.")
          }
        }
      }
    }
    if (!anyError) {
      setBvhCalculated(true)
    }
    filesContainingImages.current = []
    setBvhCalculationLoading(false)
  }

  useEffect(() => {
    if (!surfaceLibrary.length) return
    if (bvhCalculated) return
    if (loadedScreen && !isLoading && buildProgress == 100) {
      setBvhCalculationLoading(true)
      createBvhCalculations()
    }
  }, [surfaceLibrary, zipFileData, loadedScreen, bvhCalculated])
  const createSurface = async (scene) => {
    if (loadedScreen) return
    for (const [surfIdx, surf] of surfaceLibrary.entries()) {
      if (!surf.enableValue) continue
      if (surf.geometrySavedData) {
        scene.add(surf._object)
        setBuildProgress(100)
      } else {
        await onBuildSurface({
          scene,
          surf,
          surfIdx,
          entities: surf.entities,
          flattenToPlane,
          setBuildProgress,
        })
      }
    }
  }

  const createGeometry = async () => {
    if (loadedScreen) return
    const scene = new THREE.Scene()
    sceneRef.current = scene
    const width = mountRef?.current?.clientWidth
    const height = mountRef?.current?.clientHeight

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      precision: "highp",
      logarithmicDepthBuffer: true, // helps with depth issues
    })
    renderer.setSize(width, height)
    renderer.setClearColor(0xeeeeee)
    mountRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer
    renderer.domElement.style.cssText = `min-width: ${width}px !important;`

    setupLighting(scene)
    if (fileLayers.length > 0) {
      fileLayers?.forEach((fileInfo) => {
        if (fileInfo.geometrySavedData) {
          fileInfo.layers.forEach((layer) => {
            scene.add(layer._group)
          })
        } else {
          fileInfo.layers.forEach((layer) => {
            // Create a THREE.Group to hold this layer's objects
            const layerGroup = new THREE.Group()
            layerGroup.name = layer.layerName || "Unnamed Layer"

            // console.log("layer.entities", layer.entities);
            // Populate the group
            layer.entities.forEach((entity) => {
              const obj = renderEntity(entity)
              if (obj) {
                layerGroup.add(obj) // <--- add to group, not to the scene
                // entity._object = obj; // so we still have a reference if we need it
              }
            })
            // delete layer.entities;
            // Add the group to the scene
            scene.add(layerGroup)

            // Store a reference so you can toggle it later
            layer._group = layerGroup

            // Make sure the group's initial visibility matches layer.enableValue
            layerGroup.visible = layer.enableValue
          })
        }
      })
    }
    if (surfaceLibrary.length == 0) {
      setBuildProgress(100)
    } else {
      await createSurface(scene)
    }
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3()).length()
    const center = box.getCenter(new THREE.Vector3())
    const camera = new THREE.PerspectiveCamera(
      60, // FOV
      window.innerWidth / window.innerHeight,
      size / 10000, // dynamic near clipping plane based on geometry size
      size * 100, // dynamic far clipping based on geometry size
    )
    cameraRef.current = camera
    camera.position.set(center.x + 0, center.y, size * 2)

    camera.lookAt(center)
    const controls = new TrackballControls(camera, renderer.domElement)
    controls.minDistance = 0.001 // allow close zooming
    controls.maxDistance = size * 10 // allow zooming out enough
    controls.enableZoom = true
    // Allow full 360° rotation horizontally:
    controls.rotateSpeed = 5.0
    controls.zoomSpeed = 1.2
    controls.panSpeed = 0.8
    controls.target.set(center.x, center.y, center.z)
    // controls.minAzimuthAngle = -Infinity;
    // controls.maxAzimuthAngle = Infinity;
    // // Allow flipping the model upside down by relaxing vertical limits:
    // controls.minPolarAngle = -Math.PI; // or 0 if you prefer not to go below the "floor"
    // controls.maxPolarAngle = Math.PI; // default is Math.PI, but you can go to Infinity
    controls.update()
    controlRef.current = controls
    initialCamPoseRef.current.pos.copy(cameraRef.current.position)
    initialCamPoseRef.current.tgt.copy(controlRef.current.target)
    initialCamPoseRef.current.up.copy(cameraRef.current.up)
    const animate = () => {
      requestAnimationFrame(animate)
      // if (controlRef.current) {
      controlRef.current.update()
      // }
      renderer.render(scene, camera)
    }
    animate()
    setIsLoading(false)
    setLoadedScreen(true)
    setFilesData([])
  }
  useEffect(() => {
    if (!surfaceLibrary.length && !fileLayers.length) return
    if (loadedScreen && !isLoading) return
    if (!loadedScreen) {
      createGeometry()
    }
  }, [fileLayers, surfaceLibrary, loadedScreen])

  useEffect(() => {
    if (!sceneRef.current || !surfaceLibrary.length) return

    surfaceLibrary.forEach((surf) => {
      const mesh = surf._object
      if (flattenToPlane) {
        // scale z down
        mesh.scale.set(1, 1, 0.001)
      } else {
        // restore z scale
        mesh.scale.set(1, 1, 1)
      }
    })
    controlRef.current?.update()
    rendererRef.current?.render(sceneRef.current, cameraRef.current)
  }, [flattenToPlane])

  useEffect(() => {
    const throttledSinglePointMove = _.throttle(handleMouseMoveSinglePoint, 100, {
      leading: true,
      trailing: false,
    })
    // if (controlRef.current) {
    //   if (isSinglePointMode) {
    //     controlRef.current.enabled = false;
    //   } else {
    //     controlRef.current.enabled = true;
    //   }
    // }
    const onMouseDown = (event) =>
      handleMouseDownSinglePoint({
        event,
        isSinglePointMode,
        setLineData,
        setActualLineData,
        surfaceLibrary,
        flattenToPlane,
      })
    const onMouseMove = (event) =>
      throttledSinglePointMove({
        event,
        lineData,
        isSinglePointMode,
        surfaceLibrary,
        flattenToPlane,
      })
    if (isSinglePointMode) {
      window.addEventListener("mousemove", onMouseMove)
      window.addEventListener("mousedown", onMouseDown)
    }
    if (lineData && lineData.startPoint && lineData.endPoint) {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mousedown", onMouseDown)
    }
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mousedown", onMouseDown)
    }
  }, [isSinglePointMode, lineData, surfaceLibrary, actualLineData])

  // All Multi Point Mode UseEffects:

  useEffect(() => {
    const throttledMultiPointMove = _.throttle(handleMultiPointMouseMove, 100, {
      leading: true,
      trailing: false,
    })
    const onClick = (ev) => {
      handleMultiPointClick({
        ev,
        isMultiPointMode,
        setMultiPoints,
        surfaceLibrary,
      })
    }
    const onMove = (ev) => {
      throttledMultiPointMove({
        ev,
        isMultiPointMode,
      })
    }
    const onDoubleClick = (e) => {
      handleDoubleClickMultiPoint({
        isMultiPointMode,
        setMultiPoints,
      })
    }
    if (isMultiPointMode && !isMultiShapeCompleted.current) {
      window.addEventListener("click", onClick)
      window.addEventListener("mousemove", onMove)
      window.addEventListener("dblclick", onDoubleClick)
    }
    return () => {
      window.removeEventListener("click", onClick)
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("dblclick", onDoubleClick)
    }
  }, [isMultiPointMode])

  useEffect(() => {
    if (!mountRef.current || !rendererRef.current || !cameraRef.current || !loadedScreen) return
    const renderer = rendererRef.current
    const onMiddleMouseDown = (event) => {
      handleMiddleMouseDown({ event, setPivotPoint })
    }

    const onMiddleMouseUp = (event) => {
      handleMiddleMouseUp({ event })
    }
    // Add event listeners
    renderer.domElement.addEventListener("mousedown", onMiddleMouseDown)
    renderer.domElement.addEventListener("mouseup", onMiddleMouseUp)

    return () => {
      renderer.domElement.removeEventListener("mousedown", onMiddleMouseDown)
      renderer.domElement.removeEventListener("mouseup", onMiddleMouseUp)
    }
  }, [loadedScreen])

  useEffect(() => {
    const throttledPolylineMove = _.throttle(handlePolylineMouseMove, 100, {
      leading: true,
      trailing: false,
    })

    const onClick = (ev) => {
      handlePolylineClick({
        ev,
        isPolylineMode,
        setPolylinePoints,
        surfaceLibrary,
      })
    }
    const onMove = (ev) => {
      throttledPolylineMove({ ev, isPolylineMode })
    }
    const onDblClick = (ev) => {
      handleDoubleClickPolyline({ isPolylineMode, setPolylinePoints })
    }

    if (isPolylineMode) {
      window.addEventListener("click", onClick)
      window.addEventListener("mousemove", onMove)
      window.addEventListener("dblclick", onDblClick)
    }
    return () => {
      window.removeEventListener("click", onClick)
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("dblclick", onDblClick)
    }
  }, [isPolylineMode])
  const contentStyle = {
    padding: 50,
    background: "rgba(0, 0, 0, 0.05)",
    borderRadius: 4,
  }
  const content = <div style={contentStyle} />

  const loadLayersToScene = (loadedData, shortUUID) => {
    const layersMap = new Map()
    loadedData.layers.forEach((layer) => {
      const layerGroup = new THREE.Group()
      layerGroup.name = layer.layerName
      layerGroup.visible = layer.enableValue
      layer.id = layer.id + shortUUID
      layer.geometries.forEach((item) => {
        let obj
        const geometry = item.geometry
        const color = new THREE.Color(item.color)

        switch (item.type) {
          case "Mesh":
            obj = new THREE.Mesh(
              geometry,
              new THREE.MeshBasicMaterial({
                color: color,
                side: THREE.DoubleSide,
              }),
            )
            break
          case "Line":
            obj = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: color }))
            break
          case "Points":
            obj = new THREE.Points(geometry, new THREE.PointsMaterial({ color: color, size: 1 }))
            break
          default:
            console.warn(`Unknown type: ${item.type}`)
            return // Skip unknown types
        }
        layerGroup.add(obj)
      })

      // scene.add(layerGroup);
      layer._group = layerGroup
      if (!layersMap.has(layer.fileName)) {
        layersMap.set(layer.fileName, {
          fileName: layer.fileName,
          layers: [],
          geometrySavedData: true,
        })
      }
      layersMap.get(layer.fileName).layers.push(layer)
    })
    const layers = Array.from(layersMap.values())
    return layers
    // setFileLayers(layers);
  }

  const loadSurfacesToScene = (loadedData) => {
    const surfaceMap = new Map()
    loadedData.surfaces.forEach((surface, id) => {
      const surfGroup = new THREE.Group()
      surfGroup.name = surface.surfaceName || `Surface-${id}`
      // surface.id = surface.id + shortUUID;
      const geometry = surface.geometry.geometry;
      const inExtremeLarge =
        geometry.attributes.position.array.length > 22000000;
      // Determine material properties (use vertex colors if available)
      const material = new THREE.MeshPhongMaterial({
        vertexColors: false,
        color: surface.geometry.color,
        wireframe: inExtremeLarge ? false : true,
        side: THREE.DoubleSide,
      })

      const mesh = new THREE.Mesh(geometry, material)
      mesh.name = surface.surfaceName
      mesh.visible = surface.enableValue
      if (!surfaceMap.has(surface.id)) {
        surfaceMap.set(surface.id, {
          surfaceName: surface.surfaceName,
          enableValue: surface.enableValue,
          fileName: surface.fileName,
          mainZipFileName: surface.mainZipFileName,
          id: surface.id,
          _object: null,
          _originalMaterial: null,
          _group: null,
          geometrySavedData: true,
        })
      }

      surfaceMap.get(surface.id)._object = mesh
      surfaceMap.get(surface.id)._originalMaterial = mesh.material
      surfaceMap.get(surface.id)._group = surfGroup
      // scene.add(mesh);
    })
    const surfaces = Array.from(surfaceMap.values())
    return surfaces
    // setSurfaceLibrary(surfaces);
  }

  const filesToUpload = ["geometry_data.bin", "bvh_data.bin", "breakline_edges.bin", "image_blob.bin", "⁠uv_data.bin"]

  // Helper function to determine the type of an array
  const getArrayType = (array) => {
    if (!array) return null
    if (array instanceof Uint32Array) return "Uint32Array"
    if (array instanceof Uint16Array) return "Uint16Array"
    if (array instanceof Uint8Array) return "Uint8Array"
    if (Array.isArray(array)) return "Array"
    return array.constructor.name // Fallback to constructor name
  }

  // const handleLoadUvData = async (e) => {
  //   const file = e.target.files[0];

  //   const data = await loadCompressedUVData(file);
  //   console.log('Loaded UV data:', data);
  // };
  // Helper function to run a task in a Web Worker
  const runInWorker = async (task, fileName, serializedFileLayers, serializedSurfaceLibrary, onProgress) => {
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL("./workers/fileCreation.worker.js", import.meta.url))

      worker.onmessage = (e) => {
        if (e.data.status === "success") {
          const compressedData = new Uint8Array(e.data.result)
          resolve(compressedData)
          worker.terminate()
        } else if (e.data.status === "progress") {
          onProgress(e.data.progress)
        } else if (e.data.status === "error") {
          reject(new Error(e.data.error))
          worker.terminate()
        }
      }

      worker.onerror = (error) => {
        console.error("Worker error:", error)
        reject(error)
        worker.terminate()
      }

      worker.postMessage({
        task,
        fileName,
        fileLayers: serializedFileLayers,
        surfaceLibrary: serializedSurfaceLibrary,
      })
    })
  }

  const handleSaveGeometryData = async () => {
    setFileCreationStart(true);
    let filesArrayToUpload = [];
    const project_id = projectId;
    const formData = new FormData();
    let findSaveFileDataLocal = filesDataSaved || [];
    let filesList = [];

    // Serialize the data once before the loop

    for (const file of selectedFilesToUpload) {
      if (!file.fileFolder.isFolder) {
        const originalName = file.fileFolder.name
        const isPslz = originalName.includes("pslz")
        const fileNameToFind = originalName.includes("pslz")
          ? file.xmlFileName || file.dxfFileName || replaceFileExtFunc(originalName)
          : originalName

        const awsPath = file.aws_path
        const originalNameWithoutExt = replaceFileExtFunc(originalName)
        const awsPathWithoutExt = replaceFileExtFunc(awsPath)

        const findSaveFileData = findSaveFileDataLocal.find(
          (file) => replaceFileExtFunc(file.fileName) == originalNameWithoutExt,
        )
        const indexOfSavedFile = findSaveFileDataLocal.findIndex(
          (file) => replaceFileExtFunc(file.fileName) === originalNameWithoutExt,
        )

        for (const type of filesToUpload) {
          const geometryFileName = `${originalNameWithoutExt}_${type}`
          const awsPathWithNewType = `${awsPathWithoutExt}_${type}`

          if (
            type == "geometry_data.bin" &&
            (fileLayers.length > 0 || surfaceLibrary.length > 0) &&
            findSaveFileData.geometryFetched == false
          ) {
            setProgressStates((prev) => ({
              ...prev,
              [geometryFileName]: { creating: 0, uploading: 0 },
            }))
            let serializedFileLayers = fileLayers.map((file) => ({
              fileName: file.fileName,
              layers: file.layers.map((layer) => ({
                enableValue: layer.enableValue,
                fileName: layer.fileName,
                id: layer.id,
                layerName: layer.layerName,
                _group: {
                  children: layer._group.children
                    .filter((child) => child.geometry && child.geometry.attributes) // Filter out invalid children
                    .map((child) => ({
                      type: child.type,
                      material: {
                        color: child.material?.color ? { hex: child.material.color.getHex() } : { hex: 0xffffff },
                      },
                      geometry: {
                        attributes: {
                          position: child.geometry.attributes.position
                            ? {
                                array:
                                  child.geometry.attributes.position?.array ||
                                  new Float32Array(),
                              }
                            : { array: [] },
                          normal: child.geometry.attributes.normal
                            ? {
                              array: Array.from(child.geometry.attributes.normal.array),
                            }
                            : { array: [] },
                          color: child.geometry.attributes.color
                            ? {
                              array: Array.from(child.geometry.attributes.color.array),
                            }
                            : { array: [] },
                          uv: child.geometry.attributes.uv
                            ? {
                              array: Array.from(child.geometry.attributes.uv.array),
                            }
                            : { array: [] },
                        },
                        index: child.geometry.index
                          ? {
                            type: getArrayType(child.geometry.index.array),
                            array: Array.from(child.geometry.index.array),
                          }
                          : { array: [] },
                      },
                    })),
                },
              })),
            }))
            let preparedSurfaceLibrary = await Promise.all(
              surfaceLibrary.map(async (surface) => {
                if (surface?._object?.geometry) {
                  return {
                    enableValue: surface.enableValue,
                    fileName: surface.fileName,
                    id: surface.id,
                    surfaceName: surface.surfaceName,
                    mainZipFileName: surface.mainZipFileName,
                    _object: {
                      material: {
                        color: surface._object.material?.color
                          ? { hex: surface._object.material.color.getHex() }
                          : { hex: 0xffffff },
                      },
                      geometry: {
                        attributes: {
                          position: surface._object.geometry.attributes.position
                            ? {
                                array:
                                  surface._object.geometry.attributes.position
                                    .array,
                              }
                            : { array: [] },
                          normal: surface._object.geometry.attributes.normal
                            ? {
                                array:
                                  surface._object.geometry.attributes.normal
                                    .array,
                              }
                            : { array: [] },
                          color: surface._object.geometry.attributes.color
                            ? {
                                array:
                                  surface._object.geometry.attributes.color
                                    .array,
                              }
                            : { array: [] },
                          uv: { array: [] },
                        },
                        index: surface._object.geometry.index
                          ? {
                              type: getArrayType(
                                surface._object.geometry.index.array
                              ),
                              array: surface._object.geometry.index.array,
                            }
                          : { array: [] },
                      },
                    },
                  }
                }
                return surface
              }),
            )
            const compressedData = await runInWorker(
              "saveCombinedGeometryAndMetadata",
              fileNameToFind,
              serializedFileLayers,
              preparedSurfaceLibrary,
              (progress) => {
                setProgressStates((prev) => ({
                  ...prev,
                  [geometryFileName]: { creating: progress, uploading: 0 },
                }))
              },
            )
            setProgressStates((prev) => ({
              ...prev,
              [geometryFileName]: { creating: 100, uploading: 0 },
            }))

            const geometryBlob = new Blob([compressedData], {
              type: "application/gzip",
            })
            // const link = document.createElement('a');
            // link.href = URL.createObjectURL(geometryBlob);
            // link.download = `${fileNameToFind}_geometry.bin`;
            // document.body.appendChild(link);
            // link.click();
            // link.remove();
            const geometryFile = new File([geometryBlob], geometryFileName, {
              type: "application/gzip",
            })
            filesArrayToUpload.push({
              relative_path: awsPathWithNewType,
              file: geometryFile,
              statusKey: "geometryFetched",
              findSaveFileData,
              indexOfSavedFile,
            })
            filesList.push({
              relative_path: awsPathWithNewType,
              aws_path: awsPathWithNewType,
            })
            preparedSurfaceLibrary = []
            serializedFileLayers = []
          }

          if (type == "bvh_data.bin" && surfaceLibrary.length > 0 && findSaveFileData.bvhFetched == false) {
            setProgressStates((prev) => ({
              ...prev,
              [geometryFileName]: { creating: 0, uploading: 0 },
            }))

            let preparedSurfaceLibrary = await Promise.all(
              surfaceLibrary.map(async (surface) => {
                if (surface?._object?.geometry) {
                  return {
                    enableValue: surface.enableValue,
                    fileName: surface.fileName,
                    id: surface.id,
                    surfaceName: surface.surfaceName,
                    mainZipFileName: surface.mainZipFileName,
                    bvhRoot: surface.bvhRoot ?? null,
                  };
                }
                return surface;
              })
            );

            const compressedData = await runInWorker(
              "saveCombinedBVH",
              fileNameToFind,
              [],
              preparedSurfaceLibrary,
              (progress) => {
                setProgressStates((prev) => ({
                  ...prev,
                  [geometryFileName]: { creating: progress, uploading: 0 },
                }))
              },
            )

            setProgressStates((prev) => ({
              ...prev,
              [geometryFileName]: { creating: 100, uploading: 0 },
            }))

            const bvhBlob = new Blob([compressedData], {
              type: "application/gzip",
            })
            // const link = document.createElement('a');
            // link.href = URL.createObjectURL(bvhBlob);
            // link.download = `${fileNameToFind}_bvh.bin`;
            // document.body.appendChild(link);
            // link.click();
            // link.remove();
            const bvhFile = new File([bvhBlob], geometryFileName, {
              type: "application/gzip",
            })
            filesArrayToUpload.push({
              relative_path: awsPathWithNewType,
              file: bvhFile,
              statusKey: "bvhFetched",
              findSaveFileData,
              indexOfSavedFile,
            })
            filesList.push({
              relative_path: awsPathWithNewType,
              aws_path: awsPathWithNewType,
            })
            preparedSurfaceLibrary = []
          }

          if (
            type == "breakline_edges.bin" &&
            surfaceLibrary.length > 0 &&
            findSaveFileData.breakLinesFetched == false
          ) {
            setProgressStates((prev) => ({
              ...prev,
              [geometryFileName]: { creating: 0, uploading: 0 },
            }))

            let preparedSurfaceLibrary = await Promise.all(
              surfaceLibrary.map(async (surface) => {
                if (surface?._object?.geometry) {
                  return {
                    enableValue: surface.enableValue,
                    fileName: surface.fileName,
                    id: surface.id,
                    surfaceName: surface.surfaceName,
                    mainZipFileName: surface.mainZipFileName,
                    _breakLineEdges: surface._breakLineEdges ?? null,
                  };
                }
                return surface
              }),
            )
            const compressedData = await runInWorker(
              "saveCombinedBreakLineEdges",
              fileNameToFind,
              [],
              preparedSurfaceLibrary,
              (progress) => {
                setProgressStates((prev) => ({
                  ...prev,
                  [geometryFileName]: { creating: progress, uploading: 0 },
                }))
              },
            )

            setProgressStates((prev) => ({
              ...prev,
              [geometryFileName]: { creating: 100, uploading: 0 },
            }))

            const breaklineEdgesBlob = new Blob([compressedData], {
              type: "application/gzip",
            })
            // const link = document.createElement('a');
            // link.href = URL.createObjectURL(breaklineEdgesBlob);
            // link.download = `${fileNameToFind}_breaklineEdges.bin`;
            // document.body.appendChild(link);
            // link.click();
            // link.remove();
            const breaklineEdgesFile = new File([breaklineEdgesBlob], geometryFileName, {
              type: "application/gzip",
            })
            filesArrayToUpload.push({
              relative_path: awsPathWithNewType,
              file: breaklineEdgesFile,
              statusKey: "breakLinesFetched",
              findSaveFileData,
              indexOfSavedFile,
            })
            filesList.push({
              relative_path: awsPathWithNewType,
              aws_path: awsPathWithNewType,
            })
            preparedSurfaceLibrary = []
          }

          if (isPslz) {
            if (type == "image_blob.bin" && surfaceLibrary.length > 0 && findSaveFileData.imageBlobsFetched == false) {
              setProgressStates((prev) => ({
                ...prev,
                [geometryFileName]: { creating: 0, uploading: 0 },
              }))
              let preparedSurfaceLibrary = await Promise.all(
                surfaceLibrary.map(async (surface) => {
                  if (surface.blobData && surface.blobData.blob) {
                    const arrayBuffer = await surface.blobData.blob.arrayBuffer()
                    return {
                      enableValue: surface.enableValue,
                      fileName: surface.fileName,
                      id: surface.id,
                      surfaceName: surface.surfaceName,
                      mainZipFileName: surface.mainZipFileName,
                      blobData: {
                        ...surface.blobData,
                        blobBinary: arrayBuffer, // Pass the ArrayBuffer to the worker
                      },
                    }
                  }
                  return surface
                }),
              )
              // Call the worker
              const compressedData = await runInWorker(
                "saveCompressedBlob",
                fileNameToFind,
                [], // fileLayers (not needed for this task)
                preparedSurfaceLibrary,
                (progress) => {
                  setProgressStates((prev) => ({
                    ...prev,
                    [geometryFileName]: { creating: progress, uploading: 0 },
                  }))
                },
              )
              setProgressStates((prev) => ({
                ...prev,
                [geometryFileName]: { creating: 100, uploading: 0 },
              }))
              // Create a File object for uploading
              const imagesBlobsFile = new File([compressedData], geometryFileName, {
                type: "application/gzip",
              })
              // const link = document.createElement('a');
              // link.href = URL.createObjectURL(imagesBlobsFile);
              // link.download = `${fileNameToFind}_imageBlob.bin`;
              // document.body.appendChild(link);
              // link.click();
              // link.remove();
              filesArrayToUpload.push({
                relative_path: awsPathWithNewType,
                file: imagesBlobsFile,
                statusKey: "imageBlobsFetched",
                findSaveFileData,
                indexOfSavedFile,
              })
              filesList.push({
                relative_path: awsPathWithNewType,
                aws_path: awsPathWithNewType,
              })
              preparedSurfaceLibrary = []
            }
            if (
              type == "⁠uv_data.bin" &&
              surfaceLibrary.length > 0 &&
              (findSaveFileData?.uvArrayDatasFetched ?? true) == false
            ) {
              let preparedSurfaceLibrary = await Promise.all(
                surfaceLibrary.map(async (surface) => {
                  if (surface.blobData && surface.blobData.blob) {
                    return {
                      enableValue: surface.enableValue,
                      fileName: surface.fileName,
                      id: surface.id,
                      surfaceName: surface.surfaceName,
                      mainZipFileName: surface.mainZipFileName,
                      uvArrayData:
                        surface.uvArrayData && surface.uvArrayData.uvArray
                          ? {
                              uvArray: new Float32Array(
                                surface.uvArrayData.uvArray
                              ),
                            }
                          : null,
                    };
                  }
                  return null;
                })
              );
              setProgressStates((prev) => ({
                ...prev,
                [geometryFileName]: { creating: 0, uploading: 0 },
              }))
              const compressedData = await runInWorker(
                "saveCompressedUVData",
                fileNameToFind,
                [],
                preparedSurfaceLibrary,
                (progress) => {
                  setProgressStates((prev) => ({
                    ...prev,
                    [geometryFileName]: { creating: progress, uploading: 0 },
                  }))
                },
              )
              setProgressStates((prev) => ({
                ...prev,
                [geometryFileName]: { creating: 100, uploading: 0 },
              }))
              const uvBlob = new Blob([compressedData], {
                type: "application/gzip",
              })
              // const link = document.createElement('a');
              // link.href = URL.createObjectURL(uvBlob);
              // link.download = `${fileNameToFind}_uvBlob.bin`;
              // document.body.appendChild(link);
              // link.click();
              // link.remove();
              const uvFile = new File([uvBlob], geometryFileName, {
                type: "application/gzip",
              })
              filesArrayToUpload.push({
                relative_path: awsPathWithNewType,
                file: uvFile,
                statusKey: "uvArrayDatasFetched",
                findSaveFileData,
                indexOfSavedFile,
              })
              filesList.push({
                relative_path: awsPathWithNewType,
                aws_path: awsPathWithNewType,
              })
              preparedSurfaceLibrary = []
            }
          }
        }
      }
    }

    formData.append("project_id", project_id)
    formData.append("selected_files", JSON.stringify(filesList))

    try {
      const response = await axios.post(`${referrerDomain}/api/demo/files/store-3d?token=${token}`, formData)

      if (response.data.success) {
        const filesArrayToUpload = []
        const findSaveFileDataLocal = filesDataSaved || []
        for (const file of response.data.selected_files) {
          const fileFound = filesArrayToUpload.find((item) => item.relative_path === file.relative_path)
          if (!fileFound) continue
          await axios
            .put(file.presignedUrl, fileFound.file, {
              headers: { "Content-Type": "application/octet-stream" },
              onUploadProgress: (progressEvent) => {
                const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
                setProgressStates((prev) => ({
                  ...prev,
                  [fileFound.file.name]: {
                    ...prev[fileFound.file.name],
                    uploading: percentCompleted,
                  },
                }))
              },
            })
            .then(() => {
              const findReplaceFile = findSaveFileDataLocal.find(
                (file) => replaceFileExtFunc(file.fileName) === replaceFileExtFunc(fileFound.findSaveFileData.fileName),
              )
              const findReplaceFileIndex = findSaveFileDataLocal.findIndex(
                (file) => replaceFileExtFunc(file.fileName) === replaceFileExtFunc(fileFound.findSaveFileData.fileName),
              )
              if (findReplaceFile) {
                const newObj = {
                  ...findReplaceFile,
                  [fileFound.statusKey]: true,
                }
                findSaveFileDataLocal.splice(findReplaceFileIndex, 1, newObj)
              }
              setProgressStates((prev) => ({
                ...prev,
                [fileFound.file.name]: {
                  ...prev[fileFound.file.name],
                  status: "success",
                },
              }))
              notification.success({
                message: `Success`,
                description: `Uploading Successful for ${fileFound.file.name}`,
                placement: "top",
                duration: 2,
                showProgress: true,
              })
              return
            })
            .catch((error) => {
              notification.error({
                message: `Error`,
                description: `Error in uploading file ${fileFound.file.name}`,
                placement: "top",
                duration: 2,
                showProgress: true,
              })
              setProgressStates((prev) => ({
                ...prev,
                [fileFound.file.name]: {
                  ...prev[fileFound.file.name],
                  status: "error",
                },
              }))
              return
            })
        }
      } else {
        notification.error({
          message: `Error`,
          description: `Error in creating upload url`,
          placement: "top",
          duration: 2,
          showProgress: true,
        })
      }
      setShowProgressModal(false)
      setFilesDataSaved(findSaveFileDataLocal)
      filesArrayToUpload = []
      const filesList = []
      findSaveFileDataLocal = []
      // serializedSurfaceLibrary = [];
      // serializedFileLayers = [];
      setProgressStates({})
      setFileCreationStart(false)
    } catch (error) {
      setShowProgressModal(false)
      setFileCreationStart(false)
      console.log("API error:", error)
    }
  }

  const handleLoad = async (event) => {
    const file = event.target.files[0]
    const combinData = await loadCombinedGeometryAndMetadata(file)
    const scene = new THREE.Scene()
    sceneRef.current = scene
    const width = mountRef?.current?.clientWidth
    const height = mountRef?.current?.clientHeight
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      precision: "highp",
      logarithmicDepthBuffer: true, // helps with depth issues
    })
    renderer.setSize(width, height)
    renderer.setClearColor(0xeeeeee)
    mountRef.current.appendChild(renderer.domElement)
    rendererRef.current = renderer
    renderer.domElement.style.cssText = `min-width: ${width}px !important;`

    setupLighting(scene)

    if (combinData.layers) {
      loadLayersToScene(scene, combinData)
    }

    if (combinData.surfaces) {
      loadSurfacesToScene(scene, combinData)
    }
    setBuildProgress(100)
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3()).length()
    const center = box.getCenter(new THREE.Vector3())
    const camera = new THREE.PerspectiveCamera(
      60, // FOV
      window.innerWidth / window.innerHeight,
      size / 10000, // dynamic near clipping plane based on geometry size
      size * 100, // dynamic far clipping based on geometry size
    )
    cameraRef.current = camera
    camera.position.set(center.x + 0, center.y, size * 0.9)

    camera.lookAt(center)
    const controls = new TrackballControls(camera, renderer.domElement)
    controls.minDistance = 0.001 // allow close zooming
    controls.maxDistance = size * 10 // allow zooming out enough
    controls.enableZoom = true
    controls.rotateSpeed = 5.0
    controls.zoomSpeed = 1.2
    controls.panSpeed = 0.8
    controls.target.set(center.x, center.y, center.z)
    controls.update()
    controlRef.current = controls
    const animate = () => {
      requestAnimationFrame(animate)
      controlRef.current.update()
      renderer.render(scene, camera)
    }
    animate()
    setIsLoading(false)
    setLoadedScreen(true)
    // setFilesData([]);
  }

  const handleLoadBvh = async (event) => {
    const scene = sceneRef.current
    const file = event.target.files[0]
    const bvhFile = await loadCombinedBVH(file)
    bvhFile.forEach((bvh) => {
      const findSurface = surfaceLibrary.find((surf) => surf.id === bvh.surfaceId)
      if (findSurface) {
        findSurface.bvhRoot = bvh.bvhRoot
      }
    })
  }

  const handleLoadBreakLines = async (event) => {
    const file = event.target.files[0]
    const breaklines = await loadCombinedBreakLineEdges(file)
    breaklines.forEach((breaklines) => {
      const findSurface = surfaceLibrary.find((surf) => surf.id === breaklines.surfaceId)
      if (findSurface) {
        findSurface._breakLineEdges = breaklines.breakLineEdges
      }
    })
  }
  const handleLoadImageBlob = async (event) => {
    const file = event.target.files[0]
    const imageBlobFile = await loadCompressedBlob(file)
    imageBlobFile.forEach(async (imageBlob) => {
      const findSurface = surfaceLibrary.find((surf) => surf.id === imageBlob.surfaceId)
      if (findSurface) {
        findSurface.blobData = imageBlob
        const imageBitmap = await createImageBitmap(imageBlob.blob)
        const texture = new THREE.Texture(imageBitmap)
        texture.needsUpdate = true
        findSurface.texture = texture
      }
    })
  }
  const handleLoadTextureFile = async (event) => {
    const file = event.target.files[0]
    const uvArrayDataFiles = await loadCompressedUVData(file)
    uvArrayDataFiles.forEach(async (data) => {
      const findSurface = surfaceLibrary.find((surf) => surf.id === data.surfaceId)
      if (findSurface) {
        findSurface.uvArrayData = data
        // const imageBitmap = await createImageBitmap(data.blob);
        // const texture = new THREE.Texture(imageBitmap);
        // texture.needsUpdate = true;
        // const mesh = findSurface._object;
        // mesh.material.map = texture;
      }
    })
  }

  // Add handler for surface report type selection
  const handleSurfaceReportType = (type) => {
    setSurfaceReportType(type)
    setShowSurfaceReportModal(true)
    // Reset surface selections when opening modal
    setSelectedSurfaceForReport(null)
    setSelectedSecondSurfaceForReport(null)
    setCustomReportName("")
    // Only reset elevation for elevation type
    if (type === "elevation") {
      setSelectedElevation(0)
    }
  }

  // Add handler for plane features toggle
  const togglePlaneFeatures = () => {
    setPlaneFeatures(!planeFeatures)

    if (!planeFeatures) {
      // When enabling plane features, apply constraints
      surfaceLibrary.forEach((surf) => {
        const mesh = surf._object
        if (mesh) {
          // Store original position for later restoration
          if (!mesh._originalPosition) {
            mesh._originalPosition = mesh.position.clone()
          }
          // Constrain to flat plane
          mesh.scale.set(1, 1, 0.001)
        }
      })

      // If top-down view is also enabled, set camera position
      if (topDownView) {
        setTopDownView(true)
      }
    } else {
      // When disabling, restore original state
      surfaceLibrary.forEach((surf) => {
        const mesh = surf._object
        if (mesh) {
          mesh.scale.set(1, 1, 1)
          if (mesh._originalPosition) {
            mesh.position.copy(mesh._originalPosition)
          }
        }
      })
    }

    // Re-render
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current)
    }
  }

  // Add handler for top-down view toggle
  // Improved toggleTopDownView function
  const toggleTopDownView = () => {
    setTopDownView(!topDownView)

    if (!topDownView && cameraRef.current && sceneRef.current) {
      // Store original camera position for restoration
      if (!initialCamPoseRef.current._topDownBackup) {
        initialCamPoseRef.current._topDownBackup = {
          pos: cameraRef.current.position.clone(),
          up: cameraRef.current.up.clone(),
          target: controlRef.current ? controlRef.current.target.clone() : new THREE.Vector3(),
        }
      }

      // Calculate scene bounds
      const box = new THREE.Box3().setFromObject(sceneRef.current)
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)

      // Position camera directly above the center at an appropriate height
      const height = maxDim * 1.5 // Adjust this multiplier as needed
      cameraRef.current.position.set(center.x, center.y, center.z + height)

      // Set camera to look straight down
      cameraRef.current.up.set(0, 1, 0)
      cameraRef.current.lookAt(center)

      // Update controls target
      if (controlRef.current) {
        controlRef.current.target.copy(center)
        controlRef.current.noRotate = true
        controlRef.current.update()
      }

      // Ensure proper near and far planes for the camera
      cameraRef.current.near = height * 0.01
      cameraRef.current.far = height * 10
      cameraRef.current.updateProjectionMatrix()
    } else if (initialCamPoseRef.current._topDownBackup) {
      // Restore original camera position
      cameraRef.current.position.copy(initialCamPoseRef.current._topDownBackup.pos)
      cameraRef.current.up.copy(initialCamPoseRef.current._topDownBackup.up)

      if (controlRef.current) {
        // Restore original controls target
        if (initialCamPoseRef.current._topDownBackup.target) {
          controlRef.current.target.copy(initialCamPoseRef.current._topDownBackup.target)
        }
        controlRef.current.noRotate = false
        controlRef.current.update()
      }

      // Reset camera frustum
      const distance = cameraRef.current.position.distanceTo(controlRef.current.target)
      cameraRef.current.near = distance * 0.01
      cameraRef.current.far = distance * 100
      cameraRef.current.updateProjectionMatrix()
    }

    // Force a render to update the view
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current)
    }
  }

  // Add function to calculate volume between surfaces
  // const calculateVolume = (surfaceId, secondSurfaceId, polygon = null, reportMode = "stockpile") => {
  //   // 1. Find the selected surface
  //   const selectedSurface = surfaceLibrary.find((s) => s.id === surfaceId)
  //   if (!selectedSurface) {
  //     return null
  //   }

  //   // For surface-to-surface, polygon is optional
  //   if (reportMode !== "surface" && (!polygon || polygon.length < 3)) {
  //     return null
  //   }

  //   // 2. Get the mesh geometry for sampling
  //   const mesh = selectedSurface._object
  //   if (!mesh || !mesh.geometry) {
  //     return null
  //   }

  //   // --- PHASE-SPECIFIC LOGIC ---
  //   // Stockpile/Depression (2.05a)
  //   if (reportMode === "stockpile" || reportMode === "depression") {
  //     // Area in 3D
  //     const area = calculatePolygonArea3D(polygon)
  //     // Elevations
  //     const elevations = polygon.map((pt) => pt.z)
  //     const minElevation = Math.min(...elevations)
  //     const maxElevation = Math.max(...elevations)
  //     const avgElevation = elevations.reduce((a, b) => a + b, 0) / elevations.length
  //     // Base elevation logic
  //     let baseElevation = reportMode === "stockpile" ? minElevation : maxElevation
  //     // Height diff
  //     const heightDiff = Math.abs(avgElevation - baseElevation)
  //     // Volume
  //     const volume = area * heightDiff
  //     // Cut/fill assignment
  //     let cut = 0, fill = 0
  //     if (reportMode === "stockpile") {
  //       cut = volume
  //     } else {
  //       fill = volume
  //     }
  //     return {
  //       cut,
  //       fill,
  //       excess: cut - fill,
  //       area,
  //       heightDiff,
  //       minElevation,
  //       maxElevation,
  //       generatedSurfaceElevation: baseElevation,
  //       avgSurfaceElevation: avgElevation,
  //       polygonPoints: polygon,
  //       surfaceMesh: mesh,
  //     }
  //   }

  //   // Surface to Elevation (2.05b)
  //   if (reportMode === "elevation" && secondSurfaceId && typeof secondSurfaceId === "object" && secondSurfaceId.elevation !== undefined) {
  //     // Use the RL value
  //     const RL = secondSurfaceId.elevation
  //     // Area in 3D
  //     const area = calculatePolygonArea3D(polygon)
  //     // Elevations
  //     const elevations = polygon.map((pt) => pt.z)
  //     const minElevation = Math.min(...elevations)
  //     const maxElevation = Math.max(...elevations)
  //     const avgElevation = elevations.reduce((a, b) => a + b, 0) / elevations.length
  //     // Height diff
  //     const heightDiff = Math.abs(avgElevation - RL)
  //     // Volume (split into cut/fill)
  //     let cut = 0, fill = 0
  //     // Triangulate polygon for more accurate cut/fill
  //     const triangles = triangulatePoints(polygon)
  //     triangles.forEach((tri) => {
  //       const avgZ = (tri[0].z + tri[1].z + tri[2].z) / 3
  //       const triArea = calculateTriangleArea(tri[0], tri[1], tri[2])
  //       const hDiff = avgZ - RL
  //       if (hDiff > 0) {
  //         cut += triArea * hDiff
  //       } else {
  //         fill += triArea * Math.abs(hDiff)
  //       }
  //     })
  //     return {
  //       cut,
  //       fill,
  //       excess: cut - fill,
  //       area,
  //       heightDiff,
  //       minElevation,
  //       maxElevation,
  //       generatedSurfaceElevation: RL,
  //       avgSurfaceElevation: avgElevation,
  //       polygonPoints: polygon,
  //       surfaceMesh: mesh,
  //     }
  //   }

  //   // Surface to Surface (2.05c) - TIN-to-TIN
  //   // ... existing code for TIN-to-TIN ...

  //   // ... existing code ...
  // }
  const calculateVolume = (surfaceId, secondSurfaceId, polygon = null, reportMode = "stockpile") => {
    const selectedSurface = surfaceLibrary.find((s) => s.id === surfaceId)
    if (!selectedSurface) return null

    if (reportMode !== "surface" && (!polygon || polygon.length < 3)) return null

    const mesh = selectedSurface._object
    if (!mesh || !mesh.geometry) return null

    const area = calculatePolygonArea3D(polygon)
    const elevations = polygon.map((pt) => pt.z)
    const minElevation = Math.min(...elevations)
    const maxElevation = Math.max(...elevations)
    const avgElevation = elevations.reduce((a, b) => a + b, 0) / elevations.length

    if (reportMode === "stockpile" || reportMode === "depression") {
      const baseTriangles = interpolateBaseSurface(polygon)
      const { cut, fill, excess } = calculateVolumeFromSurface(baseTriangles, avgElevation, reportMode)

      const baseSurfaceAvgZ = baseTriangles.reduce((sum, t) => sum + t.avgZ * t.area, 0) /
        baseTriangles.reduce((sum, t) => sum + t.area, 0)

      return {
        cut,
        fill,
        excess,
        area,
        heightDiff: Math.abs(cut > 0 ? cut / area : fill / area),
        minElevation,
        maxElevation,
        generatedSurfaceElevation: reportMode === "stockpile" ? "interpolated from min edges" : "interpolated from max edges",
        avgSurfaceElevation: avgElevation,
        generatedSurfaceElevation: baseSurfaceAvgZ,
        polygonPoints: polygon,
        surfaceMesh: mesh,
      }
    }

    // (Keep your other modes like elevation/surface comparisons unchanged here)

    return null
  }


  // Helper function to calculate triangle area
  function calculateTriangleArea(a, b, c) {
    return 0.5 * Math.abs(a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
  }

  // Helper function to check if a point is inside a triangle
  function isPointInTriangle(p, a, b, c) {
    const areaABC = Math.abs((a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y)) / 2)
    const areaPAB = Math.abs((p.x * (a.y - b.y) + a.x * (b.y - p.y) + b.x * (p.y - a.y)) / 2)
    const areaPBC = Math.abs((p.x * (b.y - c.y) + b.x * (c.y - p.y) + c.x * (p.y - b.y)) / 2)
    const areaPCA = Math.abs((p.x * (c.y - a.y) + c.x * (a.y - p.y) + a.x * (p.y - c.y)) / 2)

    // If the sum of the three areas equals the area of the triangle, the point is inside
    return Math.abs(areaABC - (areaPAB + areaPBC + areaPCA)) < 0.0001
  }

  // Add function to handle the Surface Report Modal
  const handleCloseSurfaceReportModal = () => {
    setShowSurfaceReportModal(false)
  }

  // Add these functions to handle the Plane Features and Top-Down View functionality

  // Modify the togglePlaneFeatures function to properly constrain all elements to a flat plane
  const togglePlaneFeaturesFunc = () => {
    setPlaneFeatures(!planeFeatures)

    if (!planeFeatures) {
      // When enabling plane features, apply constraints to all elements

      // 1. Constrain surfaces
      surfaceLibrary.forEach((surf) => {
        const mesh = surf._object
        if (mesh) {
          // Store original position for later restoration
          if (!mesh._originalPosition) {
            mesh._originalPosition = mesh.position.clone()
          }
          // Constrain to flat plane
          mesh.scale.set(1, 1, 0.001)
        }
      })

      // 2. Constrain lines, polygons, and points in fileLayers
      fileLayers.forEach((fileInfo) => {
        fileInfo.layers.forEach((layer) => {
          if (layer._group) {
            layer._group.traverse((object) => {
              if (object.isLine || object.isPoints || object.isMesh) {
                // Store original position/scale
                if (!object._originalScale) {
                  object._originalScale = object.scale.clone()
                  object._originalPosition = object.position.clone()
                }
                // Flatten Z dimension
                object.scale.z = 0.001
              }
            })
          }
        })
      })

      // 3. Constrain any measurement lines or markers
      if (sceneRef.current) {
        sceneRef.current.traverse((object) => {
          if (
            object.name &&
            (object.name.includes("measureLine") ||
              object.name.includes("marker") ||
              object.name.includes("polyline") ||
              object.name.includes("point"))
          ) {
            if (!object._originalScale) {
              object._originalScale = object.scale.clone()
              object._originalPosition = object.position.clone()
            }
            object.scale.z = 0.001
          }
        })
      }

      // If top-down view is also enabled, ensure it's applied
      if (topDownView) {
        applyTopDownView()
      }
    } else {
      // When disabling, restore original state

      // 1. Restore surfaces
      surfaceLibrary.forEach((surf) => {
        const mesh = surf._object
        if (mesh) {
          mesh.scale.set(1, 1, 1)
          if (mesh._originalPosition) {
            mesh.position.copy(mesh._originalPosition)
          }
        }
      })

      // 2. Restore lines, polygons, and points
      fileLayers.forEach((fileInfo) => {
        fileInfo.layers.forEach((layer) => {
          if (layer._group) {
            layer._group.traverse((object) => {
              if (object._originalScale) {
                object.scale.copy(object._originalScale)
              }
              if (object._originalPosition) {
                object.position.copy(object._originalPosition)
              }
            })
          }
        })
      })

      // 3. Restore measurement elements
      if (sceneRef.current) {
        sceneRef.current.traverse((object) => {
          if (object._originalScale) {
            object.scale.copy(object._originalScale)
          }
          if (object._originalPosition) {
            object.position.copy(object._originalPosition)
          }
        })
      }
    }

    // Re-render the scene
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current)
    }
  }

  // Helper function to apply top-down view constraints
  const applyTopDownView = () => {
    if (!cameraRef.current || !sceneRef.current || !controlRef.current) return

    // Store original camera position for restoration
    if (!initialCamPoseRef.current._topDownBackup) {
      initialCamPoseRef.current._topDownBackup = {
        pos: cameraRef.current.position.clone(),
        up: cameraRef.current.up.clone(),
        target: controlRef.current.target.clone(),
      }
    }

    // Calculate scene bounds
    const box = new THREE.Box3().setFromObject(sceneRef.current)
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())

    // Position camera directly above the center at an appropriate height
    const height = Math.max(size.x, size.y) * 1.5
    cameraRef.current.position.set(center.x, center.y, center.z + height)
    cameraRef.current.up.set(0, 1, 0)
    cameraRef.current.lookAt(center)

    // Update controls target
    controlRef.current.target.copy(center)

    // Disable rotation in TrackballControls
    controlRef.current.noRotate = true

    // Update controls
    controlRef.current.update()
  }

  // Modify the toggleTopDownView function to properly implement top-down viewing with no tilt
  const toggleTopDownViewFunc = () => {
    setTopDownView(!topDownView)

    if (!topDownView) {
      // Enable top-down view
      applyTopDownView()
    } else {
      // Restore original camera settings
      if (initialCamPoseRef.current._topDownBackup) {
        cameraRef.current.position.copy(initialCamPoseRef.current._topDownBackup.pos)
        cameraRef.current.up.copy(initialCamPoseRef.current._topDownBackup.up)
        controlRef.current.target.copy(initialCamPoseRef.current._topDownBackup.target)

        // Re-enable rotation
        controlRef.current.noRotate = false
      }
    }

    // Update controls and render
    if (controlRef.current) {
      controlRef.current.update()
    }
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current)
    }
  }

  // console.log('progressStates', progressStates);
  return (
    <>
      {authError ? (
        <Flex justify="center">No Auth Found</Flex>
      ) : (
        <div className="overflow-y-scroll">
          <div className="flex gap-1">
            <div className="w-[300px]  border-r border-solid border-[#f66f1c]">
              <div
                className="min-w-[250px] p-[10px] cursor-pointer bg-primary text-white"
                onClick={() => {
                  setShowBrowserFiles(true)
                }}
              >
                <span>Browse TCEH</span>

                {showBrowserFiles && (
                  <FileBrowser
                    showBrowserFiles={showBrowserFiles}
                    setShowBrowserFiles={setShowBrowserFiles}
                    setFilesData={setFilesData}
                    setTotalFilesLength={setTotalFilesLength}
                    clearFull={clearFull}
                    authState={authState}
                    zipFileData={zipFileData}
                    setZipFilesData={setZipFilesData}
                    selectedFiles={selectedFiles}
                    setSelectedFiles={setSelectedFiles}
                    setSelectedFilesToUpload={setSelectedFilesToUpload}
                    setProjectId={setProjectId}
                    setFilesDataSaved={setFilesDataSaved}
                    filesDataSaved={filesDataSaved}
                  />
                )}
              </div>
              {/* <input type='file' onChange={handleLoadUvData} /> */}

              {isLoading ? (
                <Flex justify="center">
                  <Spin size="large">{content}</Spin>
                </Flex>
              ) : null}
              {!isLoading && buildProgress == 100 && (fileLayers.length > 0 || surfaceLibrary.length > 0) ? (
                <>
                  <SidePanel
                    fileLayers={fileLayers}
                    surfaceLibrary={surfaceLibrary}
                    setSurfaceLibrary={setSurfaceLibrary}
                    setFileLayers={setFileLayers}
                    zipFileData={zipFileData}
                    handleSaveGeometryData={handleSaveGeometryData}
                    setShowProgressModal={setShowProgressModal}
                    showProgressModal={showProgressModal}
                    filesDataSaved={filesDataSaved}
                    bvhCalculationLoading={bvhCalculationLoading}
                    genericProgressBar={genericProgressBar}
                    showPropertiesModal={showPropertiesModal}
                    setShowPropertiesModal={setShowPropertiesModal}
                  />
                </>
              ) : null}

              <GeometryFilesUploadingStatus
                progressStates={progressStates}
                showProgressModal={showProgressModal}
                fileCreationStart={fileCreationStart}
              />
              {/* <input
                name='geometry file'
                type='file'
                accept='.bin'
                onChange={handleLoad}
              />
              <input
                name='bvh file'
                type='file'
                accept='.bin'
                onChange={handleLoadBvh}
              />
              <input
                name='breakline file'
                type='file'
                accept='.bin'
                onChange={handleLoadBreakLines}
              />
              <input
                name='Image  file'
                type='file'
                accept='.bin'
                onChange={handleLoadImageBlob}
              />

              <input
                name='Texture  file'
                type='file'
                accept='.bin'
                onChange={handleLoadTextureFile}
              /> */}
            </div>
            <div id="canvas-container" className="flex flex-col min-w-[calc(100%-300px)] h-[calc(100vh-10px)]">
              {categorizeEntitiesProgress > 0 && categorizeEntitiesProgress < 100 && (
                <div>
                  <p>Categorizing... {categorizeEntitiesProgress}%</p>
                  {/* Or a real progress bar */}
                  <progress value={categorizeEntitiesProgress} max="100">
                    {categorizeEntitiesProgress}%
                  </progress>
                </div>
              )}
              {buildProgress > 0 && buildProgress < 100 && (
                <div>
                  <p>Building... {buildProgress}%</p>
                  {/* Or a real progress bar */}
                  <progress value={buildProgress} max="100">
                    {buildProgress}%
                  </progress>
                </div>
              )}
              {!isLoading && buildProgress == 100 && (fileLayers.length > 0 || surfaceLibrary.length > 0) ? (
                <>
                  <ModeButtons
                    toggleResetAll={toggleResetAll}
                    toggleMultiPointMode={toggleMultiPointMode}
                    toggleSinglePointMode={toggleSinglePointMode}
                    isMultiPointMode={isMultiPointMode}
                    isSinglePointMode={isSinglePointMode}
                    lineData={lineData}
                    openGraphModal={openGraphModal}
                    multiPoints={multiPoints}
                    fileLayers={fileLayers}
                    surfaceLibrary={surfaceLibrary}
                    pivotPoint={pivotPoint}
                    flattenToPlane={flattenToPlane}
                    setFlattenToPlane={setFlattenToPlane}
                    isPolylineMode={isPolylineMode}
                    togglePolylineMode={togglePolylineMode}
                    polylinePoints={polylinePoints}
                    bvhCalculationLoading={bvhCalculationLoading}
                    genericProgressBar={genericProgressBar}
                    planeFeatures={planeFeatures}
                    togglePlaneFeatures={togglePlaneFeaturesFunc}
                    topDownView={topDownView}
                    toggleTopDownView={toggleTopDownViewFunc}
                    handleSurfaceReportType={handleSurfaceReportType}
                    tabKeys={tabKeys}
                    setTabKeys={setTabKeys}
                  />
                  {/* The Graph Modal */}
                  {/* {showGraphModal ? ( */}
                    <CalculationsAndGraphModal
                      showGraphModal={showGraphModal}
                      closeGraphModal={closeGraphModal}
                      isSinglePointMode={isSinglePointMode}
                      lineData={lineData}
                      actualLineData={actualLineData}
                      isMultiPointMode={isMultiPointMode}
                      multiPoints={multiPoints}
                      filesData={filesData}
                      surfaceLibrary={surfaceLibrary}
                      polylinePoints={polylinePoints}
                      isPolylineMode={isPolylineMode}
                      currentModalTab={tabKeys}
                    />
                  {/* ) : null} */}
                </>
              ) : null}
              <div ref={mainContainerRef} className="relative min-w-[calc(100%-10px)] h-[calc(99vh-100px)]">
                {/* THREE.js canvas goes here */}
                <div
                  id="three-canvas-container"
                  ref={mountRef}
                  className=" min-w-[calc(100%-300px)] h-[calc(99vh-100px)]"
                />

                {!isLoading &&
                  buildProgress == 100 &&
                  !showGraphModal &&
                  !showBrowserFiles &&
                  !showProgressModal &&
                  !showPropertiesModal &&
                  (fileLayers.length || surfaceLibrary.length) ? (
                  <ZoomControls surfaceLibrary={surfaceLibrary} fileLayers={fileLayers} />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add the Surface Report Modal */}
      {showSurfaceReportModal && (
        <SurfaceReportModal
          visible={showSurfaceReportModal}
          onClose={() => setShowSurfaceReportModal(false)}
          reportType={surfaceReportType}
          surfaceLibrary={surfaceLibrary}
          selectedSurface={selectedSurfaceForReport}
          setSelectedSurface={setSelectedSurfaceForReport}
          selectedSecondSurface={selectedSecondSurfaceForReport}
          setSelectedSecondSurface={setSelectedSecondSurfaceForReport}
          customName={customReportName}
          setCustomName={setCustomReportName}
          selectedElevation={selectedElevation}
          setSelectedElevation={setSelectedElevation}
          calculateVolume={calculateVolume}
          toggleMultiPointMode={toggleMultiPointMode}
          isMultiPointMode={isMultiPointMode}
        />
      )}
    </>
  )
}

// Helper function to clip a triangle to a polygon
function clipTriangleToPolygon(triangle, polygon) {
  let clipped = triangle

  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]

    const outside = []
    const inside = []

    for (const v of clipped) {
      const distance = (b.x - a.x) * (v.y - a.y) - (b.y - a.y) * (v.x - a.x)
      if (distance > 0) {
        inside.push(v)
      } else {
        outside.push(v)
      }
    }

    if (inside.length === 0) {
      return [] // Triangle is completely outside
    }

    if (outside.length === 0) {
      continue // Triangle is completely inside
    }

    // Intersection calculation
    const intersections = []
    for (let j = 0; j < inside.length; j++) {
      const v1 = inside[j]
      const v2 = outside[0] // Assuming only one outside point

      const t =
        ((a.x - v1.x) * (b.y - a.y) - (a.y - v1.y) * (b.x - a.x)) /
        ((v2.x - v1.x) * (b.y - a.y) - (v2.y - v1.y) * (b.x - a.x))

      const intersection = {
        x: v1.x + t * (v2.x - v1.x),
        y: v1.y + t * (v2.y - v1.y),
        z: v1.z + t * (v2.z - v1.z),
      }
      intersections.push(intersection)
    }

    clipped = [...inside, ...intersections]
  }

  return clipped
}

// Helper function to triangulate a polygon
function triangulatePoints(points) {
  if (points.length < 3) return []

  const triangles = []
  for (let i = 1; i < points.length - 1; i++) {
    triangles.push([points[0], points[i], points[i + 1]])
  }
  return triangles
}

// Helper: Interpolate Z value from a surface mesh at (x, y) using barycentric coordinates
function interpolateZFromSurfaceMesh(mesh, x, y) {
  const geometry = mesh.geometry;
  const positionAttr = geometry.getAttribute("position");
  const indexAttr = geometry.index;
  // Search all triangles for one containing (x, y)
  const triangles = [];
  if (indexAttr) {
    for (let i = 0; i < indexAttr.count; i += 3) {
      const a = indexAttr.getX(i);
      const b = indexAttr.getX(i + 1);
      const c = indexAttr.getX(i + 2);
      triangles.push([
        { x: positionAttr.getX(a), y: positionAttr.getY(a), z: positionAttr.getZ(a) },
        { x: positionAttr.getX(b), y: positionAttr.getY(b), z: positionAttr.getZ(b) },
        { x: positionAttr.getX(c), y: positionAttr.getY(c), z: positionAttr.getZ(c) },
      ]);
    }
  } else {
    for (let i = 0; i < positionAttr.count; i += 3) {
      triangles.push([
        { x: positionAttr.getX(i), y: positionAttr.getY(i), z: positionAttr.getZ(i) },
        { x: positionAttr.getX(i + 1), y: positionAttr.getY(i + 1), z: positionAttr.getZ(i + 1) },
        { x: positionAttr.getX(i + 2), y: positionAttr.getY(i + 2), z: positionAttr.getZ(i + 2) },
      ]);
    }
  }
  for (const tri of triangles) {
    // Barycentric test
    const [A, B, C] = tri;
    const detT = (B.y - C.y) * (A.x - C.x) + (C.x - B.x) * (A.y - C.y);
    if (Math.abs(detT) < 1e-10) continue;
    const l1 = ((B.y - C.y) * (x - C.x) + (C.x - B.x) * (y - C.y)) / detT;
    const l2 = ((C.y - A.y) * (x - C.x) + (A.x - C.x) * (y - C.y)) / detT;
    const l3 = 1 - l1 - l2;
    if (l1 >= -1e-6 && l2 >= -1e-6 && l3 >= -1e-6) {
      // Inside triangle
      return l1 * A.z + l2 * B.z + l3 * C.z;
    }
  }
  return null; // Not found
}
export default Map3DViewer
