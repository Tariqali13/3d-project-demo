import React from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

const SurfaceMesh = ({ triangles }) => {
  // Flatten triangles into vertices array
  const vertices = triangles.flat();
  const positions = new Float32Array(vertices.length * 3);
  vertices.forEach((v, i) => {
    positions[i * 3] = +v.x;
    positions[i * 3 + 1] = +v.y;
    positions[i * 3 + 2] = +v.z;
  });
  // Indices for triangles
  const indices = [];
  for (let i = 0; i < triangles.length; i++) {
    indices.push(i * 3, i * 3 + 1, i * 3 + 2);
  }
  return (
    <mesh>
      <bufferGeometry attach="geometry">
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={vertices.length}
          itemSize={3}
        />
        <bufferAttribute
          attach="index"
          array={new Uint16Array(indices)}
          count={indices.length}
          itemSize={1}
        />
      </bufferGeometry>
      <meshPhongMaterial attach="material" color="#4fa3f7" side={THREE.DoubleSide} wireframe={false} />
    </mesh>
  );
};

const SurfaceViewer = ({ points, triangles }) => {
  if (!points || points.length < 3 || !triangles || triangles.length === 0) return <div>No surface to display.</div>;
  return (
    <div style={{ width: '100%', height: 400 }}>
      <Canvas camera={{ position: [0, 0, 100], fov: 60 }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[10, 10, 10]} intensity={1} />
        <SurfaceMesh triangles={triangles} />
        <OrbitControls />
      </Canvas>
    </div>
  );
};

export default SurfaceViewer; 