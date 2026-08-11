import './App.css';
import DXFViewer from './DXFViewer';
import { ConfigProvider } from 'antd';
import theme from './constants/theme';
import StockpileSurfaceDemo from './components/StockpileSurfaceDemo';
import SurfaceViewer from './components/SurfaceViewer';
import { triangulatePoints } from './utils/triangulation';

function App() {
  const polygonPoints = [
    { x: 411020.00, y: 763528.27, z: 85.88 },
    { x: 411016.52, y: 763509.98, z: 92.13 },
    // ... more points
  ];

  const triangles = triangulatePoints(polygonPoints);

  return (
    <div className='App'>
      <ConfigProvider
        theme={theme}
      >
        <DXFViewer />
        {/* <StockpileSurfaceDemo /> */}
        <SurfaceViewer points={polygonPoints} triangles={triangles} />
      </ConfigProvider>
    </div>
  );
}

export default App;
