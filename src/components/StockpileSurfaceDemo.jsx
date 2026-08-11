import React, { useState } from 'react';
import PolygonInput from './PolygonInput';
import SurfaceViewer from './SurfaceViewer';
import { triangulatePoints } from '../utils/triangulation';

const StockpileSurfaceDemo = () => {
  const [points, setPoints] = useState([]);
  const triangles = triangulatePoints(points);

  return (
    <div>
      <PolygonInput onPointsChange={setPoints} />
      <SurfaceViewer points={points} triangles={triangles} />
    </div>
  );
};

export default StockpileSurfaceDemo; 