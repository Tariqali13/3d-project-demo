// utils/surfaceInterpolationUtils.js

// Step 0: Local triangle area calculator
function calculateTriangleArea(a, b, c) {
    return 0.5 * Math.abs(
      a.x * (b.y - c.y) +
      b.x * (c.y - a.y) +
      c.x * (a.y - b.y)
    )
  }
  
  // Step 1: Triangulate the polygon (simple fan triangulation)
  export function triangulatePoints(polygon) {
    if (!polygon || polygon.length < 3) return []
  
    const triangles = []
    for (let i = 1; i < polygon.length - 1; i++) {
      triangles.push([polygon[0], polygon[i], polygon[i + 1]])
    }
    return triangles
  }
  
  // Step 2: Build an interpolated base surface (average Z of each triangle)
  export function interpolateBaseSurface(polygon) {
    const triangles = triangulatePoints(polygon)
  
    return triangles.map((tri) => {
      const avgZ = (tri[0].z + tri[1].z + tri[2].z) / 3
      const area = calculateTriangleArea(tri[0], tri[1], tri[2])
      return { area, avgZ }
    })
  }
  
  // Step 3: Volume from surface (cut/fill)
  export function calculateVolumeFromSurface(triangles, avgSurfaceZ, mode = "stockpile") {
    let cut = 0
    let fill = 0
  
    for (const { area, avgZ } of triangles) {
      const heightDiff = avgZ - avgSurfaceZ
      if (mode === "stockpile") {
        cut += Math.max(0, area * heightDiff)
      } else if (mode === "depression") {
        fill += Math.max(0, area * -heightDiff)
      }
    }
  
    return { cut, fill, excess: cut - fill }
  }
  