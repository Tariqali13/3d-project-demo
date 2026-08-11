// Triangulation utility for creating surfaces from polygon points
// This is a simple implementation of the ear clipping algorithm

export function triangulatePoints(points) {
  if (!points || points.length < 3) return []

  // Create a copy of the points to work with
  const vertices = [...points]

  // Ensure the polygon is in counter-clockwise order
  if (!isCounterClockwise(vertices)) {
    vertices.reverse()
  }

  // Triangulate using ear clipping
  const triangles = []
  let n = vertices.length

  // We need at least 3 vertices to form a triangle
  while (n > 2) {
    // Find an ear
    for (let i = 0; i < n; i++) {
      const prev = i === 0 ? n - 1 : i - 1
      const next = i === n - 1 ? 0 : i + 1

      if (isEar(vertices, prev, i, next, n)) {
        // Add the ear to our triangles
        triangles.push([vertices[prev], vertices[i], vertices[next]])

        // Remove the ear tip from the polygon
        vertices.splice(i, 1)
        n--
        break
      }
    }
  }

  return triangles
}

// Check if a polygon is in counter-clockwise order
function isCounterClockwise(vertices) {
  let sum = 0
  for (let i = 0; i < vertices.length; i++) {
    const j = (i + 1) % vertices.length
    sum += (vertices[j].x - vertices[i].x) * (vertices[j].y + vertices[i].y)
  }
  return sum < 0
}

// Check if a vertex forms an ear with its adjacent vertices
function isEar(vertices, prev, curr, next, n) {
  // Check if the angle is convex
  if (!isConvex(vertices[prev], vertices[curr], vertices[next])) {
    return false
  }

  // Check if any other vertex is inside this triangle
  const triangle = [vertices[prev], vertices[curr], vertices[next]]

  for (let i = 0; i < n; i++) {
    if (i !== prev && i !== curr && i !== next) {
      if (isPointInTriangle(vertices[i], triangle[0], triangle[1], triangle[2])) {
        return false
      }
    }
  }

  return true
}

// Check if an angle is convex
function isConvex(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) >= 0
}

// Check if a point is inside a triangle
function isPointInTriangle(p, a, b, c) {
  const areaABC = Math.abs((a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y)) / 2)
  const areaPAB = Math.abs((p.x * (a.y - b.y) + a.x * (b.y - p.y) + b.x * (p.y - a.y)) / 2)
  const areaPBC = Math.abs((p.x * (b.y - c.y) + b.x * (c.y - p.y) + c.x * (p.y - b.y)) / 2)
  const areaPCA = Math.abs((p.x * (c.y - a.y) + c.x * (a.y - p.y) + a.x * (p.y - c.y)) / 2)

  // If the sum of the three areas equals the area of the triangle, the point is inside
  return Math.abs(areaABC - (areaPAB + areaPBC + areaPCA)) < 0.0001
}

// Function to clip a triangle against a polygon
export function clipTriangleToPolygon(triangle, polygon) {
  // Implementation of Sutherland-Hodgman algorithm for polygon clipping
  let outputList = [...triangle]

  for (let i = 0; i < polygon.length; i++) {
    const clipEdgeStart = polygon[i]
    const clipEdgeEnd = polygon[(i + 1) % polygon.length]

    const inputList = [...outputList]
    outputList = []

    if (inputList.length === 0) break

    const s = inputList[inputList.length - 1]

    for (let j = 0; j < inputList.length; j++) {
      const e = inputList[j]

      if (isInside(e, clipEdgeStart, clipEdgeEnd)) {
        if (!isInside(s, clipEdgeStart, clipEdgeEnd)) {
          outputList.push(computeIntersection(s, e, clipEdgeStart, clipEdgeEnd))
        }
        outputList.push(e)
      } else if (isInside(s, clipEdgeStart, clipEdgeEnd)) {
        outputList.push(computeIntersection(s, e, clipEdgeStart, clipEdgeEnd))
      }
    }
  }

  return outputList
}

// Check if a point is inside a clip edge
function isInside(p, edgeStart, edgeEnd) {
  return (edgeEnd.x - edgeStart.x) * (p.y - edgeStart.y) - (edgeEnd.y - edgeStart.y) * (p.x - edgeStart.x) >= 0
}

// Compute the intersection of a line segment with a clip edge
function computeIntersection(s, e, clipStart, clipEnd) {
  const dc = {
    x: clipStart.x - clipEnd.x,
    y: clipStart.y - clipEnd.y,
  }

  const dp = {
    x: s.x - e.x,
    y: s.y - e.y,
  }

  const n1 = clipStart.x * clipEnd.y - clipStart.y * clipEnd.x
  const n2 = s.x * e.y - s.y * e.x
  const n3 = 1.0 / (dc.x * dp.y - dc.y * dp.x)

  const x = (n1 * dp.x - n2 * dc.x) * n3
  const y = (n1 * dp.y - n2 * dc.y) * n3

  // Interpolate z value
  let z = s.z
  if (Math.abs(e.z - s.z) > 0.0001) {
    const distTotal = Math.sqrt(Math.pow(e.x - s.x, 2) + Math.pow(e.y - s.y, 2))
    const distIntersect = Math.sqrt(Math.pow(x - s.x, 2) + Math.pow(y - s.y, 2))
    const ratio = distIntersect / distTotal
    z = s.z + ratio * (e.z - s.z)
  }

  return { x, y, z }
}
