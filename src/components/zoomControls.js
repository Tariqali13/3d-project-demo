// ZoomControls.js
import React from 'react';
import {
  handleZoomIn,
  handleZoomOut,
  zoomExtents,
} from '../utils/controlsUtils';
import zoomInLight from '../svgs/zoom_in_light.svg';
import zoomOutLight from '../svgs/zoom_out_light.svg';
import zoomExtendLight from '../svgs/zoom_extend_light.svg';
import { Button } from 'antd';

// import ZoomInIcon from '/public/zoom_in_dark.svg';
const ZoomControls = ({ surfaceLibrary, fileLayers}) => (
  <div className='absolute top-[10px] right-[20px] flex flex-col gap-2 z-[9999]'>
    <Button
      type={'default'}
      className='w-[36px] h-[36px] px-2 flex flex-col justify-center items-center  rounded-[4px] cursor-pointer'
      onClick={handleZoomIn}
    >
      <img src={zoomInLight} />
    </Button>
    <Button
      type={'default'}
      className='w-[36px] h-[36px] px-2 flex flex-col justify-center items-center  rounded-[4px] cursor-pointer'
      onClick={handleZoomOut}
    >
      <img src={zoomOutLight} />
    </Button>
    <Button
      type={'default'}
      className='w-[36px] h-[36px] px-2 flex flex-col justify-center items-center  rounded-[4px] cursor-pointer'
      onClick={() => zoomExtents(surfaceLibrary, fileLayers)}
    >
      <img src={zoomExtendLight} />
    </Button>
  </div>
);

export { ZoomControls };
