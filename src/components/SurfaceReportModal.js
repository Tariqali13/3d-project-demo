"use client"

import { useState, useEffect } from "react"
import { Modal, Button, Input, Select, Typography, Divider, Form, Radio, Card, message } from "antd"
import { isMultiShapeCompleted, multiPointsRef } from "../constants/refStore"
import SurfacePolygonResults from "./SurfacePolygonResults"
import { calculateCutFillRL } from "../utils/cutFillRL"

const { Title, Text } = Typography
const { Option } = Select

export const SurfaceReportModal = ({
  visible,
  onClose,
  reportType,
  surfaceLibrary,
  selectedSurface,
  setSelectedSurface,
  selectedSecondSurface,
  setSelectedSecondSurface,
  customName,
  setCustomName,
  selectedElevation,
  setSelectedElevation,
  calculateVolume,
  toggleMultiPointMode,
  isMultiPointMode,
}) => {
  const [reportMode, setReportMode] = useState("stockpile") // stockpile or depression
  const [polygonDrawn, setPolygonDrawn] = useState(false)
  const [calculationComplete, setCalculationComplete] = useState(false)
  const [volumeResults, setVolumeResults] = useState(null)
  const [polygonPoints, setPolygonPoints] = useState([])
  const [polygonElevationError, setPolygonElevationError] = useState(false)
  const [drawingPolygon, setDrawingPolygon] = useState(false)

  useEffect(() => {
    // Reset state when modal opens
    setPolygonDrawn(false)
    setCalculationComplete(false)
    setVolumeResults(null)
    setPolygonPoints([])
    setPolygonElevationError(false)
    setDrawingPolygon(false)

    // Set default report mode based on report type
    if (reportType === "stockpile") {
      setReportMode("stockpile")
    }
  }, [visible, reportType])

  useEffect(() => {
    // Check if polygon is drawn (using the multiPointsRef from the main app)
    if (isMultiShapeCompleted.current && multiPointsRef.current.length > 2) {
      setPolygonDrawn(true)
      setPolygonPoints(multiPointsRef.current)

      // Check for elevation error (max-min > 0.5m)
      const elevations = multiPointsRef.current.map((point) => point.z)
      const maxElevation = Math.max(...elevations)
      const minElevation = Math.min(...elevations)
      setPolygonElevationError(maxElevation - minElevation > 0.5)
    } else {
      setPolygonDrawn(false)
    }
  }, [multiPointsRef.current])

  const handleCalculate = () => {
    // Perform volume calculation based on report type
    let results = null

    if (reportType === "stockpile") {
      // Calculate stockpile/depression volume
      results = calculateVolume(
        selectedSurface,
        null,
        polygonPoints,
        reportMode, // Pass stockpile or depression
      )
    } else if (reportType === "elevation") {
      // Calculate surface to elevation volume
      const { cut, fill, excess, triangles } = calculateCutFillRL(polygonPoints, selectedElevation)
      results = {
        ...calculateVolume(selectedSurface, { elevation: selectedElevation }, polygonPoints),
        cut,
        fill,
        excess,
        triangles,
      }
    } else if (reportType === "surface") {
      // Calculate surface to surface volume
      results = calculateVolume(selectedSurface, selectedSecondSurface, polygonPoints)
    }

    setVolumeResults(results)
    setCalculationComplete(true)
  }

  const handleSaveReport = () => {
    // In a real implementation, this would save the report to a file
    // For now, just close the modal
    onClose()
  }

  const handleCreatePolygon = () => {
    setDrawingPolygon(true)
    if (!isMultiPointMode && typeof toggleMultiPointMode === "function") {
      toggleMultiPointMode()
      message.info("Polygon drawing mode activated. Draw your polygon on the map.")
    }
  }

  const renderReportForm = () => {
    switch (reportType) {
      case "stockpile":
        return (
          <Form layout="vertical">
            <Form.Item label="Calculation Type">
              <Radio.Group value={reportMode} onChange={(e) => setReportMode(e.target.value)}>
                <Radio value="stockpile">Stockpile</Radio>
                <Radio value="depression">Depression</Radio>
              </Radio.Group>
            </Form.Item>
            <Form.Item label="Custom Name">
              <Input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Enter a name for this calculation"
              />
            </Form.Item>
            <Form.Item label="Select Surface">
              <Select
                value={selectedSurface}
                onChange={(value) => setSelectedSurface(value)}
                placeholder="Select a surface"
              >
                {surfaceLibrary.map((surface) => (
                  <Option key={surface.id} value={surface.id}>
                    {surface.surfaceName || surface.id}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item>
              <Button
                type={drawingPolygon ? "default" : "primary"}
                onClick={handleCreatePolygon}
                disabled={drawingPolygon || polygonDrawn}
                style={{ marginBottom: 8 }}
              >
                {polygonDrawn ? "Polygon Created" : "Create Polygon"}
              </Button>
              <br />
              <Text>
                {polygonDrawn
                  ? "Polygon has been drawn. Ready to calculate."
                  : "Please create a polygon around the stockpile/depression area."}
              </Text>
              {polygonElevationError && (
                <Text type="danger">
                  The polygon drawn around the perimeter of the {reportMode} indicates a potential base/top elevation
                  error. We recommend conducting a detailed analysis of the {reportMode} base.
                </Text>
              )}
            </Form.Item>
          </Form>
        )

      case "elevation":
        return (
          <Form layout="vertical">
            <Form.Item label="Custom Name">
              <Input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Enter a name for this calculation"
              />
            </Form.Item>
            <Form.Item label="Select Surface">
              <Select
                value={selectedSurface}
                onChange={(value) => setSelectedSurface(value)}
                placeholder="Select a surface"
              >
                {surfaceLibrary.map((surface) => (
                  <Option key={surface.id} value={surface.id}>
                    {surface.surfaceName || surface.id}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item label="Elevation (RL)">
              <Input
                type="number"
                value={selectedElevation}
                onChange={(e) => setSelectedElevation(Number.parseFloat(e.target.value))}
                placeholder="Enter elevation value"
              />
            </Form.Item>
            <Form.Item>
              <Button
                type={drawingPolygon ? "default" : "primary"}
                onClick={handleCreatePolygon}
                disabled={drawingPolygon || polygonDrawn}
                style={{ marginBottom: 8 }}
              >
                {polygonDrawn ? "Polygon Created" : "Create Polygon"}
              </Button>
              <br />
              <Text>
                {polygonDrawn
                  ? "Polygon has been drawn. Ready to calculate."
                  : "Please draw a polygon to define the calculation area."}
              </Text>
            </Form.Item>
          </Form>
        )

      case "surface":
        return (
          <Form layout="vertical">
            <Form.Item label="Custom Name">
              <Input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Enter a name for this calculation"
              />
            </Form.Item>
            <Form.Item label="Initial Surface">
              <Select
                value={selectedSurface}
                onChange={(value) => {
                  setSelectedSurface(value);
                  // If the new initial surface is the same as the final, reset the final
                  if (value === selectedSecondSurface) {
                    setSelectedSecondSurface(undefined);
                  }
                }}
                placeholder="Select initial surface"
              >
                {surfaceLibrary.map((surface) => (
                  <Option key={surface.id} value={surface.id}>
                    {surface.surfaceName || surface.id}
                    {surface.fileName ? ` (${surface.fileName})` : ""}
                  </Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item label="Final Surface">
              <Select
                value={selectedSecondSurface}
                onChange={(value) => setSelectedSecondSurface(value)}
                placeholder="Select final surface"
              >
                {surfaceLibrary
                  .filter(surface =>
                    surfaceLibrary.length === 1 // If only one surface, show it
                      ? true
                      : surface.id !== selectedSurface // Otherwise, exclude the initial
                  )
                  .map(surface => (
                    <Option key={surface.id} value={surface.id}>
                      {surface.surfaceName || surface.id}
                      {surface.fileName ? ` (${surface.fileName})` : ""}
                    </Option>
                  ))}
              </Select>
              {surfaceLibrary.length > 1 && selectedSurface && selectedSecondSurface && selectedSurface === selectedSecondSurface && (
                <Text type="danger">Initial and Final surfaces must be different.</Text>
              )}
            </Form.Item>
            <Form.Item>
              <Button
                type={drawingPolygon ? "default" : "primary"}
                onClick={handleCreatePolygon}
                disabled={drawingPolygon || polygonDrawn}
                style={{ marginBottom: 8 }}
              >
                {polygonDrawn ? "Polygon Created" : "Create Polygon (Optional)"}
              </Button>
              <br />
              <Text>
                {polygonDrawn
                  ? "Polygon has been drawn. Calculation will be limited to this area."
                  : "You can optionally draw a polygon to limit the calculation area."}
              </Text>
            </Form.Item>
          </Form>
        )

      default:
        return <Text>Please select a report type</Text>
    }
  }

  const renderResults = () => {
    if (!calculationComplete || !volumeResults) return null

    const {
      cut,
      fill,
      excess,
      area,
      heightDiff,
      minElevation,
      maxElevation,
      polygonPoints,
      generatedSurfaceElevation,
      avgSurfaceElevation,
      surfaceMesh,
    } = volumeResults

    return (
      <Card className="mt-4">
        <Title level={4}>Calculation Results</Title>
        <Divider />

        <Text strong>Name of calculation: </Text>
        <Text>
          {reportType === "stockpile"
            ? reportMode === "stockpile"
              ? "Stockpile"
              : "Depression"
            : reportType === "elevation"
              ? "Surface to Elevation (in polygon)"
              : "Surface to Surface"}
        </Text>
        <br />

        <Text strong>Custom Name: </Text>
        <Text>{customName || "N/A"}</Text>
        <br />

        <Text strong>Selected Surface: </Text>
        <Text>{surfaceLibrary.find((s) => s.id === selectedSurface)?.surfaceName || selectedSurface}</Text>
        <br />

        {reportType === "elevation" && (
          <>
            <Text strong>Selected RL: </Text>
            <Text>{selectedElevation}</Text>
            <br />
          </>
        )}

        {reportType === "surface" && (
          <>
            <Text strong>Second Surface: </Text>
            <Text>
              {surfaceLibrary.find((s) => s.id === selectedSecondSurface)?.surfaceName || selectedSecondSurface}
            </Text>
            <br />
          </>
        )}

        <Divider />

        <Text>Cut = {cut.toFixed(2)} m³</Text>
        <br />
        <Text>Fill = {fill.toFixed(2)} m³</Text>
        <br />
        <Text>--------------</Text>
        <br />
        <Text strong>
          {excess >= 0 ? "Excess" : "Shortage"} = {Math.abs(excess).toFixed(2)} m³
        </Text>
        <br />

        <Text strong>Polygon Area: </Text>
        <Text>{area?.toFixed(2)} m²</Text>
        <br />

        <Text strong>Height Difference: </Text>
        <Text>{heightDiff?.toFixed(2)} m</Text>
        <br />

        <Text strong>Volume: </Text>
        <Text>{(cut || fill)?.toFixed(2)} m³</Text>
        <br />

        <Text strong>Min Elevation: </Text>
        <Text>{minElevation?.toFixed(2)} m</Text>
        <br />

        <Text strong>Max Elevation: </Text>
        <Text>{maxElevation?.toFixed(2)} m</Text>
        <br />

        <Text strong>Base Surface Elevation: </Text>
        <Text>{generatedSurfaceElevation?.toFixed(2)} m</Text>
        <br />

        <Divider />

        <Text strong>Polygon Points (X, Y, Z):</Text>
        <ul>
          {polygonPoints?.map((pt, idx) => (
            <li key={idx}>
              ({pt.x.toFixed(3)}, {pt.y.toFixed(3)}, {pt.z.toFixed(3)})
            </li>
          ))}
        </ul>

        <Divider />

        {renderPolygonPreview()}

        {/* SVG Sketch */}
        <div style={{ border: "1px solid #ccc", margin: "10px 0", padding: "10px", width: 300, height: 200 }}>
          <svg width="300" height="200">
            {/* Draw cross-section view */}
            <line x1="50" y1="150" x2="250" y2="150" stroke="#000" strokeWidth="1" /> {/* Ground line */}
            <text x="20" y="150" fontSize="10">
              Base
            </text>
            {reportMode === "stockpile" ? (
              <>
                {/* Draw stockpile */}
                <path
                  d={`M50,150 L100,100 L200,100 L250,150 Z`}
                  fill="#bdb76b"
                  stroke="#333"
                  strokeWidth="1"
                  opacity="0.7"
                />
                <text x="150" y="90" fontSize="10" textAnchor="middle">
                  Stockpile
                </text>
                <text x="150" y="170" fontSize="10" textAnchor="middle">
                  Volume: {(cut || 0).toFixed(2)} m³
                </text>

                {/* Arrows */}
                <line x1="120" y1="120" x2="120" y2="150" stroke="#000" strokeWidth="1" strokeDasharray="2" />
                <text x="125" y="135" fontSize="10">
                  Height
                </text>
              </>
            ) : (
              <>
                {/* Draw depression */}
                <path
                  d={`M50,150 L100,180 L200,180 L250,150 Z`}
                  fill="#ff9800"
                  stroke="#333"
                  strokeWidth="1"
                  opacity="0.7"
                />
                <text x="150" y="175" fontSize="10" textAnchor="middle">
                  Depression
                </text>
                <text x="150" y="130" fontSize="10" textAnchor="middle">
                  Volume: {(fill || 0).toFixed(2)} m³
                </text>

                {/* Arrows */}
                <line x1="120" y1="150" x2="120" y2="180" stroke="#000" strokeWidth="1" strokeDasharray="2" />
                <text x="125" y="165" fontSize="10">
                  Depth
                </text>
              </>
            )}
          </svg>
        </div>

        {/* 3D Polygon Preview */}
        {polygonDrawn && polygonPoints.length >= 3 && (
          <SurfacePolygonResults
            polygonPoints={polygonPoints}
            reportMode={reportMode}
            baseSurfaceElevation={generatedSurfaceElevation}
            surfaceMesh={surfaceMesh}
            setCustomName={setCustomName}
            customName={customName}
            RL={selectedElevation}
            cut={cut}
            fill={fill}
            excess={excess}
          />
        )}

        <Button onClick={handleExportPNG} style={{ marginRight: 8 }}>
          Export PNG
        </Button>
        <Button onClick={handleExportPDF}>Export PDF</Button>

        <Divider />

        {excess >= 0 ? (
          <Text type="secondary">
            The earthworks design results in a material surplus scenario, where the volume of excavated (cut) material
            exceeds the total fill requirements. This surplus material will require appropriate stockpiling, disposal,
            or reuse planning, in accordance with environmental and project specifications. Efficient surplus management
            is essential to minimize double handling, transport costs, and potential environmental impact.
          </Text>
        ) : (
          <Text type="secondary">
            The site presents a net import scenario, where the volume of available cut is insufficient to meet the fill
            requirements. As a result, additional material will need to be imported to achieve design levels. This may
            impact construction cost, logistics, and scheduling.
          </Text>
        )}

        {reportType === "stockpile" && reportMode === "stockpile" && (
          <Text type="secondary" className="mt-2">
            Note: Stockpile volume is calculated based on the surface and a base surface derived from the perimeter
            polygon. The accuracy of the volume estimate depends on how closely the polygon outline and elevation data
            represent the actual surface beneath the stockpile.
          </Text>
        )}
        {polygonElevationError && (
          <Text type="danger">
            The polygon drawn around the perimeter of the {reportMode} indicates a potential base/top elevation error.
            We recommend conducting a detailed analysis of the {reportMode} base.
          </Text>
        )}
      </Card>
    )
  }

  // Add export handlers (simple SVG to PNG/PDF export)
  const handleExportPNG = () => {
    const svg = document.querySelector("svg")
    if (!svg) return
    const svgData = new XMLSerializer().serializeToString(svg)
    const canvas = document.createElement("canvas")
    canvas.width = 300
    canvas.height = 200
    const ctx = canvas.getContext("2d")
    const img = new window.Image()
    img.onload = () => {
      ctx.drawImage(img, 0, 0)
      const pngFile = canvas.toDataURL("image/png")
      const a = document.createElement("a")
      a.href = pngFile
      a.download = "surface-report.png"
      a.click()
    }
    img.src = "data:image/svg+xml;base64," + window.btoa(svgData)
  }

  const handleExportPDF = () => {
    const svg = document.querySelector("svg")
    if (!svg) return
    const svgData = new XMLSerializer().serializeToString(svg)
    const canvas = document.createElement("canvas")
    canvas.width = 300
    canvas.height = 200
    const ctx = canvas.getContext("2d")
    const img = new window.Image()
    img.onload = () => {
      ctx.drawImage(img, 0, 0)
      const imgData = canvas.toDataURL("image/png")
      // Use jsPDF for PDF export
      const { jsPDF } = require("jspdf")
      const pdf = new jsPDF()
      pdf.addImage(imgData, "PNG", 10, 10, 180, 120)
      pdf.save("surface-report.pdf")
    }
    img.src = "data:image/svg+xml;base64," + window.btoa(svgData)
  }

  function renderPolygonPreview() {
    if (!polygonDrawn || !polygonPoints || polygonPoints.length < 3) return null

    // Calculate min/max elevations for color coding
    const elevations = polygonPoints.map((pt) => pt.z)
    const minElevation = Math.min(...elevations)
    const maxElevation = Math.max(...elevations)
    const elevationRange = maxElevation - minElevation

    // Scale points to fit in the SVG
    const xValues = polygonPoints.map((pt) => pt.x)
    const yValues = polygonPoints.map((pt) => pt.y)
    const minX = Math.min(...xValues)
    const maxX = Math.max(...xValues)
    const minY = Math.min(...yValues)
    const maxY = Math.max(...yValues)
    const width = maxX - minX
    const height = maxY - minY
    const scale = Math.min(250 / width, 150 / height)
    const offsetX = 25
    const offsetY = 25

    return (
      <div className="mt-4">
        <Text strong>Polygon Elevation Preview:</Text>
        <div style={{ border: "1px solid #ccc", margin: "10px 0", padding: "10px", width: 300, height: 200 }}>
          <svg width="300" height="200">
            {/* Draw polygon outline */}
            <polygon
              points={polygonPoints
                .map((pt) => `${offsetX + (pt.x - minX) * scale},${offsetY + (pt.y - minY) * scale}`)
                .join(" ")}
              fill="none"
              stroke="#333"
              strokeWidth="2"
            />

            {/* Draw points with elevation-based colors */}
            {polygonPoints.map((pt, idx) => {
              // Color based on elevation (red for high, blue for low)
              const elevationRatio = elevationRange > 0 ? (pt.z - minElevation) / elevationRange : 0.5
              const color = `rgb(${Math.round(elevationRatio * 255)}, 0, ${Math.round((1 - elevationRatio) * 255)})`

              return (
                <g key={idx}>
                  <circle
                    cx={offsetX + (pt.x - minX) * scale}
                    cy={offsetY + (pt.y - minY) * scale}
                    r="5"
                    fill={color}
                    stroke="#000"
                    strokeWidth="1"
                  />
                  <text
                    x={offsetX + (pt.x - minX) * scale + 8}
                    y={offsetY + (pt.y - minY) * scale - 8}
                    fontSize="10"
                    fill="#000"
                  >
                    {pt.z.toFixed(2)}m
                  </text>
                </g>
              )
            })}

            {/* Add legend */}
            <text x="10" y="190" fontSize="10">
              Min: {minElevation.toFixed(2)}m
            </text>
            <text x="220" y="190" fontSize="10">
              Max: {maxElevation.toFixed(2)}m
            </text>
            <rect x="100" y="180" width="100" height="10" fill="url(#elevationGradient)" />
            <defs>
              <linearGradient id="elevationGradient" x1="0%" y1="0%" x2="100%">
                <stop offset="0%" stopColor="blue" />
                <stop offset="100%" stopColor="red" />
              </linearGradient>
            </defs>
          </svg>
        </div>
        {elevationRange > 0.5 && (
          <Text type="danger">Elevation difference: {elevationRange.toFixed(2)}m (exceeds 0.5m threshold)</Text>
        )}
      </div>
    )
  }

  return (
    <Modal
      title={<Title level={3}>Surface Report</Title>}
      open={visible}
      onCancel={onClose}
      width={800}
      footer={[
        <Button key="close" onClick={onClose}>
          Close
        </Button>,
        <Button
          key="calculate"
          type="primary"
          disabled={
            reportType === "surface"
              ? !polygonDrawn || !selectedSurface || !selectedSecondSurface ||
              (surfaceLibrary.length > 1 && selectedSurface === selectedSecondSurface)
              : !polygonDrawn || !selectedSurface
          }
          onClick={handleCalculate}
        >
          Calculate
        </Button>,
        <Button key="save" type="primary" disabled={!calculationComplete} onClick={handleSaveReport}>
          Save Report
        </Button>,
      ]}
    >
      {renderReportForm()}
      {renderResults()}
    </Modal>
  )
}
