"use client"

import { useState } from "react"
import { toggleResetControls, zoomExtents } from "../utils/controlsUtils"
import { Button, Flex, Tabs, Spin, Switch, notification } from "antd"

// Update the component props to include the new props
export const ModeButtons = ({
  toggleResetAll,
  toggleMultiPointMode,
  toggleSinglePointMode,
  isMultiPointMode,
  isSinglePointMode,
  lineData,
  openGraphModal,
  multiPoints,
  fileLayers,
  surfaceLibrary,
  pivotPoint,
  flattenToPlane,
  setFlattenToPlane,
  isPolylineMode,
  togglePolylineMode,
  polylinePoints,
  bvhCalculationLoading,
  genericProgressBar,
  planeFeatures,
  togglePlaneFeatures,
  topDownView,
  toggleTopDownView,
  handleSurfaceReportType,
  tabKeys,
  setTabKeys,
}) => {
  // Add this function to check if any surfaces are enabled
  const checkSurfacesEnabled = () => {
    if (!surfaceLibrary || surfaceLibrary.length === 0) return false
    return surfaceLibrary.some((surface) => surface.enableValue === true)
  }

  // Create wrapper functions for the toggle functions
  const handleToggleSinglePointMode = () => {
    if (!checkSurfacesEnabled()) {
      // Show notification if no surfaces are enabled
      notification.warning({
        message: "Surface Required",
        description: "Please enable at least one surface in the Surface Library to use Section by Line.",
        placement: "top",
        duration: 3,
      })
      return
    }
    toggleSinglePointMode()
  }

  const handleTogglePolylineMode = () => {
    if (!checkSurfacesEnabled()) {
      // Show notification if no surfaces are enabled
      notification.warning({
        message: "Surface Required",
        description: "Please enable at least one surface in the Surface Library to use Section by Polyline.",
        placement: "top",
        duration: 3,
      })
      return
    }
    togglePolylineMode()
  }
  // Update the geometryControls function to include the Plane Features and Top-Down View buttons
  const geometryControls = () => {
    return (
      <Flex justify="start" gap={10} align="center" className="p-1">
        {pivotPoint && <Button onClick={toggleResetControls}>Reset Control</Button>}
        <Button className="primary-button" onClick={() => zoomExtents(surfaceLibrary, fileLayers)}>
          Zoom Extents
        </Button>
        {fileLayers.length > 0 || surfaceLibrary.length > 0 ? (
          <>
            <Button type={flattenToPlane ? "primary" : "default"} onClick={() => setFlattenToPlane(!flattenToPlane)}>
              Plane Surface
            </Button>
            <Flex align="center" gap={2}>
              <span>Plane Features</span>
              <Switch checked={planeFeatures} onChange={togglePlaneFeatures} />
            </Flex>
            <Flex align="center" gap={2}>
              <span>Top-Down View</span>
              <Switch checked={topDownView} onChange={toggleTopDownView} />
            </Flex>
          </>
        ) : null}
      </Flex>
    )
  }
  const isResetButtonEnabled =
    (isSinglePointMode && lineData) ||
    (isMultiPointMode && multiPoints.length > 0) ||
    (isPolylineMode && polylinePoints.length)
  const contentStyle = {
    padding: 25,
    background: "rgba(0, 0, 0, 0.05)",
    borderRadius: 4,
  }

  const content = <div style={contentStyle} />

  const CalculationControls = () => {
    return (
      <div>
        {bvhCalculationLoading && (
          <>
            {genericProgressBar < 100 && (
              <div>
                <progress value={genericProgressBar} max="100">
                  {genericProgressBar}%
                </progress>
              </div>
            )}
            <Spin tip="Loading..." size="small">
              {content}
            </Spin>
          </>
        )}
        {!bvhCalculationLoading && (
          <Flex justify="start" gap={10} className="p-1">
            <Button
              disabled={bvhCalculationLoading}
              onClick={handleToggleSinglePointMode}
              type={isSinglePointMode ? "primary" : "default"}
            >
              Section by Line
            </Button>
            <Button
              disabled={bvhCalculationLoading}
              onClick={handleTogglePolylineMode}
              type={isPolylineMode ? "primary" : "default"}
            >
              Section by Polyline
            </Button>
            {isSinglePointMode && lineData && (
              <Button disabled={bvhCalculationLoading} onClick={openGraphModal}>
                Display Results
              </Button>
            )}
            {isMultiPointMode && multiPoints.length > 0 && (
              <Button disabled={bvhCalculationLoading} n onClick={openGraphModal}>
                Display Results
              </Button>
            )}
            {isPolylineMode && polylinePoints.length > 0 && (
              <Button disabled={bvhCalculationLoading} onClick={openGraphModal}>
                Display Results
              </Button>
            )}
            {isResetButtonEnabled && (
              <Button disabled={bvhCalculationLoading} onClick={toggleResetAll}>
                Reset
              </Button>
            )}
          </Flex>
        )}
      </div>
    )
  }

  const items = [
    {
      key: "1",
      label: "View (F)",
      children: geometryControls(),
    },
    surfaceLibrary.length > 0
      ? {
        key: "2",
        label: "Surface Measure & Section",
        children: CalculationControls(),
      }
      : {},
    {
      key: "3",
      label: "Measure",
      children: MeasureControls(),
    },
    {
      key: "4",
      label: "Surface Reports",
      children: SurfaceReportsControls(),
    },
  ]

  // Add new MeasureControls function for the Measure tab
  function MeasureControls() {
    return (
      <Flex justify="start" gap={10} className="p-1">
        <Button onClick={toggleSinglePointMode} type={isSinglePointMode ? "primary" : "default"}>
          Line
        </Button>
        <Button onClick={toggleMultiPointMode} type={isMultiPointMode ? "primary" : "default"}>
          Polygon
        </Button>
        <Button onClick={togglePolylineMode} type={isPolylineMode ? "primary" : "default"}>
          Polyline
        </Button>
        {(isSinglePointMode && lineData) ||
          (isMultiPointMode && multiPoints.length > 0) ||
          (isPolylineMode && polylinePoints.length > 0) ? (
          <Button onClick={openGraphModal}>Display Results</Button>
        ) : null}
        {isResetButtonEnabled && <Button onClick={toggleResetAll}>Reset</Button>}
      </Flex>
    )
  }

  // Add new SurfaceReportsControls function for the Surface Reports tab
  function SurfaceReportsControls() {
    return (
      <Flex justify="start" gap={10} className="p-1">
        <Button onClick={() => handleSurfaceReportType("stockpile")}>Stockpile/Depression</Button>
        <Button onClick={() => handleSurfaceReportType("elevation")}>Surface to Elevation</Button>
        <Button onClick={() => handleSurfaceReportType("surface")}>Surface to Surface</Button>
      </Flex>
    )
  }
  return (
    <>
      {fileLayers.length > 0 || surfaceLibrary.length > 0 ? (
        <Flex justify="start">
          <Tabs
            className={`w-full bg-[#949599]`}
            type="card"
            defaultActiveKey="1"
            activeKey={tabKeys}
            items={items}
            onChange={setTabKeys}
          />
        </Flex>
      ) : null}
    </>
  )
}
