"use client"

// SurfacePropertiesModal.jsx
import { useState, useEffect } from "react"
import { Modal, Radio, Slider, Flex } from "antd"
import { filesContainingImages } from "../constants/refStore"
import { replaceFileExtFunc } from "../utils/parsingAndBuildingGeometries"

// We'll define shading modes:
const SHADING_MODES = {
  NO_SHADING: "NoShading",
  BY_SURFACE_COLOR: "BySurfaceColor",
  BY_ELEVATION: "ByElevation",
  BY_IMAGE: "ByImage",
}

const SurfacePropertiesModal = ({
  visible,
  onClose,
  surfaceData, // the entire "surf" object
  onSaveChanges, // callback to apply changes
  loadingImage,
  zipFileData,
  imageOverLayingProgress,
  imageProgress,
  surfaceLibrary,
  bvhCalculationLoading,
  genericProgressBar,
}) => {
  const findSurface = surfaceLibrary.find((surf) => surf.id === surfaceData)
  // const findZipFileData = zipFileData?.find(
  //   (zi) => zi.xmlFileName.split('.').shift() === findSurface?.surfaceName
  // );
  const findZipFileData =
    filesContainingImages?.current?.includes(replaceFileExtFunc(findSurface?.surfaceName)) ||
    filesContainingImages?.current?.includes(replaceFileExtFunc(findSurface?.mainZipFileName))
  const [shadingMode, setShadingMode] = useState(SHADING_MODES.NO_SHADING)
  const [transparency, setTransparency] = useState(0) // 0 means opaque

  // Optionally store a color if you want a “By Surface Color”
  const [surfaceColor, setSurfaceColor] = useState("#ff0000")

  useEffect(() => {
    if (findSurface) {
      // If the surface object has a saved mode or color, load them
      setShadingMode(findSurface.shadingMode || SHADING_MODES.NO_SHADING)
      setSurfaceColor(findSurface.color || "#ff0000")
      setTransparency(findSurface.transparency || 0)
    }
  }, [findSurface])

  const handleOk = () => {
    // Pass changes up
    onSaveChanges({
      shadingMode,
      color: surfaceColor,
      transparency,
    })
    // onClose();
  }

  return (
    <Modal
      title={`Surface Properties: ${findSurface?.surfaceName || ""}`}
      open={visible}
      onOk={handleOk}
      onCancel={onClose}
      destroyOnClose
      okButtonProps={{ disabled: loadingImage }}
      cancelButtonProps={{ disabled: loadingImage }}
    >
      <div className="mb-4">
        <strong>Surface Classification: </strong>
        {findSurface?.classification || "Unclassified"}
      </div>
      <div className="mb-4">
        <strong>Transparency:</strong> (0% = fully opaque, 100% = invisible)
        <Slider
          min={0}
          max={100}
          value={transparency}
          onChange={(val) => setTransparency(val)}
          disabled={loadingImage}
        />
      </div>
      <div className="mb-4">
        <strong>Shading Options:</strong>
        <Radio.Group
          disabled={loadingImage}
          className="flex flex-col gap-2"
          value={shadingMode}
          onChange={(e) => setShadingMode(e.target.value)}
        >
          <Radio value={SHADING_MODES.NO_SHADING}>No Shading</Radio>
          <Radio value={SHADING_MODES.BY_SURFACE_COLOR}>By Surface Color</Radio>
          <Radio value={SHADING_MODES.BY_ELEVATION}>By Elevation</Radio>
          {findSurface?.uvArrayData && findSurface?.blobData && (
            <Radio disabled={bvhCalculationLoading} value={SHADING_MODES.BY_IMAGE}>
              By Image{" "}
            </Radio>
          )}
        </Radio.Group>
        {findZipFileData && genericProgressBar > 0 && genericProgressBar < 100 && (
          <Flex justify="center" align="center" vertical>
            <div className="p-2">
              <p>Image Data Loading... {genericProgressBar}%</p>
              {/* Or a real progress bar */}
              <progress value={genericProgressBar} max="100">
                {genericProgressBar}%
              </progress>
            </div>
          </Flex>
        )}
        {imageOverLayingProgress > 0 && imageOverLayingProgress < 100 && (
          <Flex justify="center" align="center" vertical>
            <div className="p-2">
              <p>Applying Image... {imageOverLayingProgress}%</p>
              {/* Or a real progress bar */}
              <progress value={imageOverLayingProgress} max="100">
                {imageOverLayingProgress}%
              </progress>
            </div>
          </Flex>
        )}
        {imageProgress > 0 && imageProgress < 100 && (
          <Flex justify="center" align="center" vertical>
            <div className="p-2">
              <p>Image Loading... {imageProgress}%</p>
              {/* Or a real progress bar */}
              <progress value={imageProgress} max="100">
                {imageProgress}%
              </progress>
            </div>
          </Flex>
        )}
      </div>
      {shadingMode === SHADING_MODES.BY_SURFACE_COLOR && (
        <div className="mb-4">
          <strong>Surface Color:</strong>
          <input type="color" value={surfaceColor} onChange={(e) => setSurfaceColor(e.target.value)} className="ml-2" />
        </div>
      )}
    </Modal>
  )
}

export { SurfacePropertiesModal }
