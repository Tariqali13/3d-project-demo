"use client"

import { useRef, useEffect } from "react"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls"
import { triangulatePoints } from "../utils/triangulation"

const SurfacePolygonResults = ({
  polygonPoints,
  reportMode = "stockpile",
  baseSurfaceElevation,
  surfaceMesh,
  customName,
  setCustomName,
  RL,
}) => {
  const containerRef = useRef(null)
  const sceneRef = useRef(null)
  const rendererRef = useRef(null)
  const cameraRef = useRef(null)
  const controlsRef = useRef(null)

  useEffect(() => {
    if (!containerRef.current || !polygonPoints || polygonPoints.length < 3) return

    // Clean up previous scene
    if (rendererRef.current) {
      if (rendererRef.current.domElement && rendererRef.current.domElement.parentNode) {
        rendererRef.current.domElement.parentNode.removeChild(rendererRef.current.domElement)
      }
      rendererRef.current.dispose()
    }

    // Setup scene
    const scene = new THREE.Scene()
    sceneRef.current = scene
    scene.background = new THREE.Color(0xf0f0f0)

    // Setup renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    rendererRef.current = renderer
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight)
    containerRef.current.appendChild(renderer.domElement)

    // Setup camera
    const camera = new THREE.PerspectiveCamera(
      60,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000,
    )
    cameraRef.current = camera

    // Calculate bounding box of polygon points
    const bbox = new THREE.Box3()
    const points = polygonPoints.map((p) => new THREE.Vector3(p.x, p.y, p.z))
    bbox.setFromPoints(points)
    const center = bbox.getCenter(new THREE.Vector3())
    const size = bbox.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)

    // Position camera
    camera.position.set(center.x, center.y, center.z + maxDim * 2)
    camera.lookAt(center)

    // Setup controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controlsRef.current = controls
    controls.target.copy(center)
    controls.update()

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
    scene.add(ambientLight)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(1, 1, 1)
    scene.add(directionalLight)

    // Add grid helper
    const gridHelper = new THREE.GridHelper(maxDim * 2, 10)
    scene.add(gridHelper)

    // Add axes helper
    const axesHelper = new THREE.AxesHelper(maxDim * 0.5)
    scene.add(axesHelper)

    // Calculate min/max elevations
    const elevations = polygonPoints.map((p) => p.z)
    const minElevation = Math.min(...elevations)
    const maxElevation = Math.max(...elevations)

    // Determine base surface elevation based on mode
    const baseElevation =
      baseSurfaceElevation !== undefined
        ? baseSurfaceElevation
        : reportMode === "stockpile"
          ? minElevation
          : maxElevation

    // Create polygon outline
    const outlineGeometry = new THREE.BufferGeometry()
    const outlineVertices = []
    for (let i = 0; i < polygonPoints.length; i++) {
      const p = polygonPoints[i]
      outlineVertices.push(p.x, p.y, p.z)
      // Connect to next point
      const nextP = polygonPoints[(i + 1) % polygonPoints.length]
      outlineVertices.push(nextP.x, nextP.y, nextP.z)
    }
    outlineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(outlineVertices, 3))
    const outlineMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 })
    const outline = new THREE.LineSegments(outlineGeometry, outlineMaterial)
    scene.add(outline)

    // Create polygon points markers
    polygonPoints.forEach((p, index) => {
      const sphereGeometry = new THREE.SphereGeometry(maxDim * 0.02, 16, 16)
      const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 })
      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial)
      sphere.position.set(p.x, p.y, p.z)
      scene.add(sphere)

      // Add elevation label
      const canvas = document.createElement("canvas")
      canvas.width = 128
      canvas.height = 64
      const ctx = canvas.getContext("2d")
      ctx.fillStyle = "white"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = "black"
      ctx.font = "24px Arial"
      ctx.fillText(`${p.z.toFixed(2)}m`, 10, 30)

      const texture = new THREE.CanvasTexture(canvas)
      const labelMaterial = new THREE.SpriteMaterial({ map: texture })
      const label = new THREE.Sprite(labelMaterial)
      label.position.set(p.x, p.y, p.z + maxDim * 0.05)
      label.scale.set(maxDim * 0.2, maxDim * 0.1, 1)
      scene.add(label)
    })

    // Create base surface
    const basePoints = polygonPoints.map((p) => ({ x: p.x, y: p.y, z: baseElevation }))
    const triangles = triangulatePoints(basePoints)

    const baseGeometry = new THREE.BufferGeometry()
    const baseVertices = []
    const baseNormals = []

    triangles.forEach((triangle) => {
      const [a, b, c] = triangle
      baseVertices.push(a.x, a.y, a.z)
      baseVertices.push(b.x, b.y, b.z)
      baseVertices.push(c.x, c.y, c.z)

      // Calculate normal
      const v1 = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z)
      const v2 = new THREE.Vector3(c.x - a.x, c.y - a.y, c.z - a.z)
      const normal = new THREE.Vector3().crossVectors(v1, v2).normalize()

      // Add normal for each vertex
      for (let i = 0; i < 3; i++) {
        baseNormals.push(normal.x, normal.y, normal.z)
      }
    })

    baseGeometry.setAttribute("position", new THREE.Float32BufferAttribute(baseVertices, 3))
    baseGeometry.setAttribute("normal", new THREE.Float32BufferAttribute(baseNormals, 3))

    const baseMaterial = new THREE.MeshPhongMaterial({
      color: reportMode === "stockpile" ? 0x8b4513 : 0x90ee90,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
      wireframe: false,
    })

    const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial)
    scene.add(baseMesh)

    // If we have a surface mesh, add a clipped version to the scene
    if (surfaceMesh) {
      // Clone the surface mesh for visualization
      const clonedMesh = surfaceMesh.clone()

      // Make it semi-transparent
      if (clonedMesh.material) {
        const material = new THREE.MeshPhongMaterial({
          color: 0x6495ed,
          transparent: true,
          opacity: 0.6,
          side: THREE.DoubleSide,
          wireframe: false,
        })
        clonedMesh.material = material
      }

      scene.add(clonedMesh)
    }

    // Draw RL plane (flat, semi-transparent)
    if (RL !== undefined) {
      // Compute bounding box in XY
      const xs = polygonPoints.map(p => p.x);
      const ys = polygonPoints.map(p => p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);

      const planeGeometry = new THREE.PlaneGeometry(maxX - minX, maxY - minY);
      const planeMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, opacity: 0.2, transparent: true });
      const plane = new THREE.Mesh(planeGeometry, planeMaterial);
      plane.position.set((minX + maxX) / 2, (minY + maxY) / 2, RL);
      plane.rotation.x = -Math.PI / 2; // Make it horizontal
      scene.add(plane);
    }

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current) return
      const width = containerRef.current.clientWidth
      const height = containerRef.current.clientHeight
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }
    window.addEventListener("resize", handleResize)

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize)
      if (rendererRef.current) {
        // Check if the domElement is actually a child of containerRef.current
        if (
          rendererRef.current.domElement &&
          containerRef.current &&
          containerRef.current.contains(rendererRef.current.domElement)
        ) {
          containerRef.current.removeChild(rendererRef.current.domElement)
        }
        rendererRef.current.dispose()
      }
    }
  }, [polygonPoints, reportMode, baseSurfaceElevation, surfaceMesh, RL])

  return (
    <div className="mt-4">
      <h4>3D Polygon Preview</h4>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "300px",
          border: "1px solid #ccc",
          borderRadius: "4px",
        }}
      />
      <p className="mt-2 text-xs text-gray-500">Drag to rotate, scroll to zoom, right-click to pan</p>
    </div>
  )
}

export default SurfacePolygonResults
