import React, { useState } from 'react';

const PolygonInput = ({ onPointsChange }) => {
  const [points, setPoints] = useState([{ x: '', y: '', z: '' }]);

  const handleChange = (index, field, value) => {
    const newPoints = points.map((pt, i) =>
      i === index ? { ...pt, [field]: value } : pt
    );
    setPoints(newPoints);
    onPointsChange(newPoints.filter(pt => pt.x !== '' && pt.y !== '' && pt.z !== ''));
  };

  const addPoint = () => {
    setPoints([...points, { x: '', y: '', z: '' }]);
  };

  const removePoint = (index) => {
    const newPoints = points.filter((_, i) => i !== index);
    setPoints(newPoints);
    onPointsChange(newPoints.filter(pt => pt.x !== '' && pt.y !== '' && pt.z !== ''));
  };

  return (
    <div>
      <h3>Polygon Points (x, y, z)</h3>
      {points.map((pt, idx) => (
        <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
          <input
            type="number"
            placeholder="x"
            value={pt.x}
            onChange={e => handleChange(idx, 'x', e.target.value)}
            style={{ width: 60 }}
          />
          <input
            type="number"
            placeholder="y"
            value={pt.y}
            onChange={e => handleChange(idx, 'y', e.target.value)}
            style={{ width: 60 }}
          />
          <input
            type="number"
            placeholder="z"
            value={pt.z}
            onChange={e => handleChange(idx, 'z', e.target.value)}
            style={{ width: 60 }}
          />
          <button onClick={() => removePoint(idx)} disabled={points.length <= 1}>Remove</button>
        </div>
      ))}
      <button onClick={addPoint}>Add Point</button>
    </div>
  );
};

export default PolygonInput; 