import { triangulatePoints } from './triangulation';

// Given polygon points and RL, returns triangles and cut/fill/excess
export function calculateCutFillRL(polygonPoints, RL) {
    if (!polygonPoints || polygonPoints.length < 3) return { cut: 0, fill: 0, excess: 0, triangles: [] };

    // Triangulate the polygon
    const triangles = triangulatePoints(polygonPoints);

    let cut = 0;
    let fill = 0;

    for (const tri of triangles) {
        // Average Z of triangle
        const avgZ = (tri[0].z + tri[1].z + tri[2].z) / 3;
        // 2D area of triangle (projected to XY)
        const area = Math.abs(
            (tri[0].x * (tri[1].y - tri[2].y) +
                tri[1].x * (tri[2].y - tri[0].y) +
                tri[2].x * (tri[0].y - tri[1].y)) / 2
        );
        const heightDiff = avgZ - RL;
        if (heightDiff > 0) {
            cut += area * heightDiff;
        } else {
            fill += area * Math.abs(heightDiff);
        }
    }

    return {
        cut,
        fill,
        excess: cut - fill,
        triangles,
    };
}