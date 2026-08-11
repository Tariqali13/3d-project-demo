'use client';

// CalculationsAndGraphModal.js
import { useState, useEffect, useRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title as chartTitle,
  Tooltip,
  Legend,
} from 'chart.js';
import zoomPlugin from 'chartjs-plugin-zoom';
import { Line } from 'react-chartjs-2';
import { anySurfaceEnabled, surfaceEnabledArr } from '../utils/computingUtils';
import { measureMPMShapeDecider } from '../utils/multiPointCalcuAndFunc';
import {
  calculateSPMDistanceDecider,
  measureSPMProfileLine,
  measureSPMSurfaceDistanceAll,
} from '../utils/singlePointCalcuAndFunc';
import {
  isMultiShapeCompleted,
  chartRef,
  isPolylineCompleted,
} from '../constants/refStore';
import {
  Button,
  Collapse,
  Divider,
  Flex,
  theme,
  Modal,
  Spin,
  Typography,
} from 'antd';
import {
  measurePolylineProfile,
  measurePolylineDistances2D,
  measurePolylineDistances3D,
  measurePolylineSurfaceDistanceAll,
} from '../utils/polylineCalcuAndFunc';
// import { isEqual } from 'lodash.isequal';
const { Title } = Typography;
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  chartTitle,
  Tooltip,
  Legend,
  zoomPlugin
);

export const CalculationsAndGraphModal = ({
  showGraphModal,
  closeGraphModal,
  isSinglePointMode,
  lineData,
  isMultiPointMode,
  multiPoints,
  filesData,
  surfaceLibrary,
  polylinePoints,
  isPolylineMode,
  actualLineData,
  currentModalTab,
}) => {
  const { token } = theme.useToken();
  const isAnySurfaceEnabled = anySurfaceEnabled(surfaceLibrary);
  const surfaceEnabledArrData = surfaceEnabledArr(surfaceLibrary);
  const isCalculatingRef = useRef(false);
  const profileWorkerRef = useRef(null);

  // In your component:
  // const prevLineDataRef = useRef(null);
  // const prevMultiPointsRef = useRef([]);
  // const prevPolylinePointsRef = useRef([]);
  // const prevSurfaceEnabledRef = useRef([]);
  // If we just opened modal, or if data changed, do calculations
  // const lineDataChanged = lineDataStr !== prevLineDataRef.current;
  // const multiPointsChanged = multiPointsStr !== prevMultiPointsRef.current;
  // const polylineChanged = polyPointsStr !== prevPolylinePointsRef.current;
  // const surfacesChanged =
  //   surfaceEnabledArrStr !== JSON.stringify(prevSurfaceEnabledRef.current);

  const [lineProfile, setLineProfile] = useState([]);
  const [multiPointDistance, setMultiPointDistance] = useState(null);
  const [mpmShapeArea, setMPMShapeArea] = useState(null);
  const [multiPointDistance3D, setMultiPointDistance3D] = useState(null);
  const [mpmShapeArea3D, setMPMShapeArea3D] = useState(null);
  const [multiSurfacePerimeters, setMultiSurfacePerimeters] = useState([]);
  const [multiSurfaceAreas, setMultiSurfaceAreas] = useState([]);

  // single point
  const [spmDistance2D, setSPMDistance2D] = useState(null);
  const [spmDistance3D, setSPMDistance3D] = useState(null);
  const [spmSurfaceDistancesAll, setSPMSurfaceDistancesAll] = useState([]);

  const [polylineSegmentDistances2D, setPolylineSegmentDistances2D] = useState(
    []
  );

  const [polylineSegmentDistances2DTotal, setPolylineSegmentDistances2DTotal] =
    useState([]);
  const [polylineSegmentDistances3D, setPolylineSegmentDistances3D] = useState(
    []
  );
  const [polylineSegmentDistances3DTotal, setPolylineSegmentDistances3DTotal] =
    useState([]);
  const [polylineSurfaceDistances, setPolylineSurfaceDistances] = useState([]);
  const [polylineSurfaceDistanceTotal, setPolylineSurfaceDistanceTotal] =
    useState([]);
  // Chart states
  const [selectedPoint, setSelectedPoint] = useState(null);

  const [graphLoading, setGraphLoading] = useState(false);
  const [loadingCalc, setLoadingCalc] = useState(false);

  const [buildingGraph, setBuildingGraph] = useState(0);

  const handleChartClick = (event) => {
    if (chartRef.current) {
      const chart = chartRef.current;
      const points = chart.getElementsAtEventForMode(
        event.nativeEvent,
        'nearest',
        { intersect: true },
        false
      );

      if (points.length > 0) {
        const firstPoint = points[0];
        const datasetIndex = firstPoint.datasetIndex;
        const index = firstPoint.index;

        const dataset = chart.data.datasets[datasetIndex];
        const dataPoint = dataset.data[index];

        // **Set the selected point**
        setSelectedPoint({ x: dataPoint.x, y: dataPoint.y });
      }
    }
  };

  const handleZoomAtTarget = () => {
    if (chartRef.current && selectedPoint) {
      const chart = chartRef.current;

      // Define the zoom factor (e.g., 2x zoom)
      const zoomFactor = 2;

      // Access the x and y scales
      const xScale = chart.scales.x;
      const yScale = chart.scales.y;

      // Current visible range
      const xRange = xScale.max - xScale.min;
      const yRange = yScale.max - yScale.min;

      // Calculate new min and max for x-axis centered around selectedPoint.x
      const newXMin = selectedPoint.x - xRange / 2 / zoomFactor;
      const newXMax = selectedPoint.x + xRange / 2 / zoomFactor;

      // Calculate new min and max for y-axis centered around selectedPoint.y
      const newYMin = selectedPoint.y - yRange / 2 / zoomFactor;
      const newYMax = selectedPoint.y + yRange / 2 / zoomFactor;

      // **Optional: Ensure the new ranges are within the data bounds**
      // You can add logic here to clamp the values if needed

      // Update the chart's scale options
      chart.options.scales.x.min = newXMin;
      chart.options.scales.x.max = newXMax;
      chart.options.scales.y.min = newYMin;
      chart.options.scales.y.max = newYMax;

      // Update the chart to reflect changes
      chart.update();
    }
  };

  const handleResetZoom = () => {
    if (chartRef.current) {
      const chart = chartRef.current;
      setSelectedPoint(null);
      chart.resetZoom();
    }
  };
  useEffect(() => {
    if (showGraphModal == false) {
      if (profileWorkerRef.current) {
        profileWorkerRef.current.terminate();
        profileWorkerRef.current = null;
      }
      isCalculatingRef.current = false;
      return;
    }
    // Prevent re-running if already calculating
    if (isCalculatingRef.current) return;
    isCalculatingRef.current = true;
    let spmLineProfiles = [];
    const doAllCalculations = async () => {
      try {
        setGraphLoading(true);
        setBuildingGraph(0);
        setLoadingCalc(false);

        const onlyEnabledSurfaces = surfaceLibrary.filter((s) => s.enableValue);

        if (isSinglePointMode && lineData?.startPoint && lineData?.endPoint) {
          let profiles = await measureSPMProfileLine({
            lineData,
            actualLineData,
            surfaceLibrary: onlyEnabledSurfaces,
            setLineProfile,
            setBuildingGraph,
            setSPMDistance3D,
            setSPMSurfaceDistancesAll,
            profileWorkerRef,
          });
          spmLineProfiles = profiles;
          profiles = [];
        } else if (
          isMultiPointMode &&
          isMultiShapeCompleted.current &&
          multiPoints.length > 2
        ) {
          // let profiles = await measureMPMMultiPointProfile({
          //   surfaceLibrary: onlyEnabledSurfaces,
          //   setLineProfile,
          //   multiPoints,
          //   setBuildingGraph,
          // });
          // spmLineProfiles = profiles;
          // profiles = [];
        } else if (isPolylineMode && isPolylineCompleted.current) {
          let profiles = await measurePolylineProfile({
            surfaceLibrary: onlyEnabledSurfaces,
            setLineProfile,
            polylinePoints,
            setBuildingGraph,
            profileWorkerRef,
          });
          spmLineProfiles = profiles;
          profiles = [];
        }

        setGraphLoading(false);

        setLoadingCalc(true);

        if (isSinglePointMode && lineData?.startPoint && lineData?.endPoint) {
          calculateSPMDistanceDecider({
            lineData,
            setSPMDistance2D,
            setSPMDistance3D,
            surfaceLibrary: onlyEnabledSurfaces,
            lineProfile,
          });
          if (onlyEnabledSurfaces.length > 0) {
            await measureSPMSurfaceDistanceAll({
              lineData,
              surfaceLibrary: onlyEnabledSurfaces,
              setSPMSurfaceDistancesAll,
              spmLineProfiles,
            });
            spmLineProfiles = [];
          }
        }

        if (
          isMultiPointMode &&
          isMultiShapeCompleted.current &&
          multiPoints.length > 2
        ) {
          await measureMPMShapeDecider({
            surfaceLibrary: onlyEnabledSurfaces,
            multiPoints,
            setMultiPointDistance3D,
            setMPMShapeArea3D,
            setMultiPointDistance,
            setMPMShapeArea,
            setMultiSurfacePerimeters,
            setMultiSurfaceAreas,
            spmLineProfiles,
          });
          spmLineProfiles = [];
        }

        if (isPolylineMode && isPolylineCompleted.current) {
          const seg2D = measurePolylineDistances2D(polylinePoints);
          setPolylineSegmentDistances2D(seg2D);
          setPolylineSegmentDistances2DTotal(
            seg2D
              .reduce((sum, val) => (!isNaN(val) ? sum + val : sum), 0)
              .toFixed(2)
          );
          const seg3D = measurePolylineDistances3D(polylinePoints);
          setPolylineSegmentDistances3D(seg3D);
          setPolylineSegmentDistances3DTotal(
            seg3D
              .reduce((sum, val) => (!isNaN(val) ? sum + val : sum), 0)
              .toFixed(2)
          );
          if (onlyEnabledSurfaces.length > 0) {
            await measurePolylineSurfaceDistanceAll({
              polylinePoints,
              surfaceLibrary: onlyEnabledSurfaces,
              setPolylineSurfaceDistances,
              spmLineProfiles,
            });
          }
        }
        setLoadingCalc(false);
      } catch (err) {
        console.error('Error in doAllCalculations:', err);
        setGraphLoading(false);
        setLoadingCalc(false);
      } finally {
        // Reset the flag when finished
        isCalculatingRef.current = false;
      }
    };

    doAllCalculations();

    return () => {
      // On unmount / modal close
      setLineProfile([]); // or null
    };
  }, [
    showGraphModal,
    isSinglePointMode,
    isMultiPointMode,
    isPolylineMode,
    lineData,
    multiPoints,
    polylinePoints,
    surfaceLibrary,
    // add any other dependencies that should trigger recalculation
  ]);

  const calculatePolylineSurfaceDistanceTotal = (seg) => {
    let total = 0;
    if (Array.isArray(seg.segmentDistances)) {
      seg.segmentDistances.forEach((val) => {
        if (!isNaN(val)) {
          total = total + Number(val);
        }
      });
    } else {
      if (!isNaN(seg.segmentDistances)) {
        total = total + Number(seg.segmentDistances);
      }
    }
    return total.toFixed(2);
  };

  const colorArray = [
    '#FF5722',
    '#2196F3',
    '#4CAF50',
    '#FFC107',
    '#9C27B0',
    '#E91E63',
  ];

  function getSurfaceColor(surf, idx) {
    const colorSelected = surf?.surf?._object?.material?.originalColor;
    // If user has set a color, use it. Otherwise fallback to colorArray
    if (colorSelected) {
      return colorSelected;
    }
    return colorArray[idx % colorArray.length];
  }
  const calculateLabels = () => {
    const distanceSet = new Set();
    lineProfile.forEach((surf) => {
      if (surf.graph && surf.graph.vertices) {
        surf.graph.vertices.forEach((vertex) => {
          distanceSet.add(vertex.dist2D);
        });
      }
    });
    return Array.from(distanceSet).sort((a, b) => a - b);
  };

  const chartData = {
    labels: calculateLabels(),
    datasets: lineProfile.map((surf, idx) => {
      const chosenColor = getSurfaceColor(surf, idx);

      return {
        label: surf.surfaceId,
        data: surf.points.map((vertex) => ({
          x: vertex.dist2D,
          y: vertex.z,
          isBreakLine: vertex.isBreakLine || false,
          isEdge: vertex.isEdge || false,
        })),
        borderColor: chosenColor,
        backgroundColor: chosenColor,
        showLine: true,
        fill: false,
        tension: 0, // No smoothing, to reflect discrete segments
        segment: {
          borderColor: (ctx) => chosenColor, // Consistent line color
          borderWidth: 1,
        },
        spanGaps: false,
      };
    }),
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
      tooltip: {
        mode: 'x',
        intersect: false,
        callbacks: {
          label: (context) => {
            const dataPoint = context.raw;
            const label = `${context.parsed.y.toFixed(2)}`;
            // if (dataPoint.isBreakLine) label += ' (Break Line)';
            // if (!dataPoint.isBreakLine && dataPoint.isEdge) label += ' (Edge)';
            return label;
          },
        },
      },
      zoom: {
        pan: {
          enabled: true,
          mode: 'xy',
        },
        zoom: {
          wheel: {
            enabled: true,
          },
          pinch: {
            enabled: true,
          },
          mode: 'xy',
        },
      },
    },
    interaction: {
      mode: 'x',
      intersect: false,
    },
    scales: {
      x: {
        type: 'linear',
        position: 'bottom',
        title: {
          display: true,
          text: 'Distance (2D) (m)',
        },
        ticks: {
          stepSize: 5, // Set x-axis interval to 5 m
        },
      },
      y: {
        type: 'linear',
        title: {
          display: true,
          text: 'Elevation (z) (m)',
        },
        ticks: {
          stepSize: 1, // Set y-axis interval to 1 unit
        },
      },
    },
  };

  const collapseStyle = {
    marginBottom: '10px',
    borderColor: '#f66f1c',
  };
  const panelStyle = {
    header: {
      color: 'white',
      background: '#f66f1c',
      borderRadius: token.borderRadiusLG,
      border: 'none',
    },
    body: {
      // background: token.colorFillAlter,
      borderRadius: token.borderRadiusLG,
    },
  };
  const modalStyles = {
    content: {
      height: 'calc(100vh - 50px)',
      maxHeight: 'calc(100vh - 50px)',
      overflowY: 'auto',
      zIndex: 99999,
    },
    mask: { zIndex: 100 },
  };

  return (
    <Modal
      title={<Title level={2}>Calculations and Section</Title>}
      open={showGraphModal}
      onCancel={closeGraphModal}
      destroyOnClose
      width={'100%'}
      styles={modalStyles}
      footer={[
        <Button key='close' onClick={closeGraphModal}>
          Close
        </Button>,
      ]}
    >
      <div>
        <Title level={3}>Calculations</Title>
        <Divider />
        {/* ---------------------------
            SINGLE-POINT MODE LOGIC
         ----------------------------*/}
        {isSinglePointMode && lineData && (
          <div className='mb-[1em]'>
            <Collapse
              style={collapseStyle}
              items={[
                {
                  styles: panelStyle,
                  key: '1',
                  label: 'Line Data (Single-Point)',
                  children: (
                    <p>
                      <strong>Start-Points:</strong> (
                      {lineData.startPoint.x.toFixed(3)},{' '}
                      {lineData.startPoint.y.toFixed(3)},{' '}
                      {lineData.startPoint.z.toFixed(3)}
                      )
                      <br />
                      <strong>End-Points:</strong> (
                      {lineData.endPoint.x.toFixed(3)},{' '}
                      {lineData.endPoint.y.toFixed(3)},{' '}
                      {lineData.endPoint.z.toFixed(3)})
                    </p>
                  ),
                },
              ]}
            />
            <Collapse
              collapsible={graphLoading && 'disabled'}
              style={collapseStyle}
              items={[
                {
                  styles: panelStyle,
                  key: '2',
                  label: 'Distances (Single-Point)',
                  children: (
                    <>
                      {loadingCalc ? <Spin>Loading...</Spin> : null}
                      {!loadingCalc ? (
                        <>
                          {spmDistance2D && (
                            <p>
                              <strong>2D Distance (No Elevation):</strong>{' '}
                              {spmDistance2D} m
                            </p>
                          )}
                          {isAnySurfaceEnabled && spmDistance3D && (
                            <p>
                              <strong>
                                3D Distance (Slope distance between two points):
                              </strong>{' '}
                              {spmDistance3D} m
                            </p>
                          )}
                        </>
                      ) : null}
                    </>
                  ),
                },
              ]}
            />
            {isAnySurfaceEnabled && (
              <Collapse
                collapsible={graphLoading && 'disabled'}
                style={collapseStyle}
                items={[
                  {
                    styles: panelStyle,
                    key: '3',
                    label:
                      'Surface Distances (Constrained to each enabled mesh)',
                    children: (
                      <>
                        {loadingCalc ? <Spin>Loading...</Spin> : null}
                        {!loadingCalc && spmSurfaceDistancesAll.length > 0 && (
                          <div>
                            {spmSurfaceDistancesAll.map((res) => (
                              <p key={res.surfaceId}>
                                <strong>{res.surfaceId}</strong>: {res.distance}{' '}
                                m
                              </p>
                            ))}
                          </div>
                        )}
                      </>
                    ),
                  },
                ]}
              />
            )}
          </div>
        )}

        {/* ---------------------------
            MULTI-POINT MODE LOGIC
         ----------------------------*/}
        {isMultiPointMode && multiPoints.length > 0 && (
          <div>
            <Collapse
              style={collapseStyle}
              items={[
                {
                  styles: panelStyle,

                  key: '4',
                  label: 'Polygon Data (Multi-Point)',
                  children: (
                    <>
                      {multiPoints.map((pt, idx) => (
                        <p key={idx}>
                          <strong>Point {idx + 1}:</strong> ({pt.x.toFixed(3)},{' '}
                          {pt.y.toFixed(3)}, {pt.z.toFixed(3)})
                        </p>
                      ))}
                    </>
                  ),
                },
              ]}
            />
            <Collapse
              collapsible={graphLoading && 'disabled'}
              style={collapseStyle}
              items={[
                {
                  styles: panelStyle,

                  key: '5',
                  label: 'Distances and Areas (Multi-Point)',
                  children: (
                    <>
                      {loadingCalc ? <Spin>Loading...</Spin> : null}
                      {!loadingCalc ? (
                        <>
                          {!isAnySurfaceEnabled && multiPointDistance && (
                            <p>Distance (2D): {multiPointDistance} m</p>
                          )}
                          {!isAnySurfaceEnabled && mpmShapeArea && (
                            <p>Area (2D): {mpmShapeArea} sq m</p>
                          )}
                          {isAnySurfaceEnabled && multiPointDistance3D && (
                            <p>Distance (3D): {multiPointDistance3D} m</p>
                          )}
                          {isAnySurfaceEnabled && mpmShapeArea3D && (
                            <p>Area (3D): {mpmShapeArea3D} sq m</p>
                          )}
                        </>
                      ) : null}
                    </>
                  ),
                },
              ]}
            />
            {isAnySurfaceEnabled && !isMultiPointMode && (
              <Collapse
                collapsible={graphLoading && 'disabled'}
                style={collapseStyle}
                items={[
                  {
                    styles: panelStyle,

                    key: '6',
                    label: 'Per-Surface Perimeters:',
                    children: (
                      <>
                        {loadingCalc ? <Spin>Loading...</Spin> : null}
                        {!loadingCalc &&
                          multiSurfacePerimeters.length > 0 &&
                          multiSurfacePerimeters.map((res, idx) => (
                            <p key={idx}>
                              <strong>{res.surfaceId}:</strong> {res.perimeter}{' '}
                              m
                            </p>
                          ))}
                        {!loadingCalc && multiSurfacePerimeters.length == 0 && (
                          <p>No Data Calculated</p>
                        )}
                      </>
                    ),
                  },
                ]}
              />
            )}

            {isAnySurfaceEnabled && (
              <Collapse
                collapsible={graphLoading && 'disabled'}
                style={collapseStyle}
                items={[
                  {
                    styles: panelStyle,

                    key: '6',
                    label: 'Per-Surface Areas:',
                    children: (
                      <>
                        {loadingCalc ? <Spin>Loading...</Spin> : null}
                        {!loadingCalc &&
                          multiSurfaceAreas.length > 0 &&
                          multiSurfaceAreas.map((res, idx) => (
                            <p key={idx}>
                              <strong>{res.surfaceId}:</strong> {res.area} sq m
                            </p>
                          ))}
                        {!loadingCalc && multiSurfaceAreas.length == 0 && (
                          <p>No Data Calculated</p>
                        )}
                      </>
                    ),
                  },
                ]}
              />
            )}
          </div>
        )}
        {isPolylineMode && polylinePoints.length > 1 && (
          <div>
            <Collapse
              style={collapseStyle}
              items={[
                {
                  styles: panelStyle,

                  key: '6',
                  label: 'Polyline Data',
                  children: (
                    <>
                      {polylinePoints.map((pt, idx) => (
                        <p key={idx}>
                          <strong>Segment {idx + 1}:</strong> ({pt.x.toFixed(3)}
                          , {pt.y.toFixed(3)}, {pt.z.toFixed(3)})
                        </p>
                      ))}
                    </>
                  ),
                },
              ]}
            />
            <Collapse
              collapsible={graphLoading && 'disabled'}
              style={collapseStyle}
              items={[
                {
                  styles: panelStyle,

                  key: '7',
                  label: 'Polyline Segment Distances',
                  children: (
                    <>
                      {loadingCalc ? <Spin>Loading...</Spin> : null}
                      {!loadingCalc ? (
                        <>
                          <p>
                            <strong>2D Distances</strong> per segment:
                          </p>
                          {polylineSegmentDistances2D.map((d, idx) => (
                            <p key={idx}>
                              Segment {idx + 1}: {d.toFixed(2)} m
                            </p>
                          ))}
                          <strong>Total 2D Distance:</strong>{' '}
                          {polylineSegmentDistances2DTotal} m
                          {currentModalTab === '2' && isPolylineMode && (
                            <>
                              <Divider />
                              <p>
                                <strong>
                                  3D Distance (Slope distance between two
                                  points)
                                </strong>{' '}
                                per segment:
                              </p>
                              {polylineSegmentDistances3D.map((d, idx) => (
                                <p key={idx}>
                                  Segment {idx + 1}: {d.toFixed(2)} m
                                </p>
                              ))}
                              <strong>Total 3D Distance:</strong>{' '}
                              {polylineSegmentDistances3DTotal} m
                            </>
                          )}
                        </>
                      ) : null}
                    </>
                  ),
                },
              ]}
            />
            {/* Surface-Constrained Distances per segment: only if NOT in Measure tab */}
            {isPolylineMode &&
              polylinePoints.length > 1 &&
              currentModalTab !== '3' &&
              isAnySurfaceEnabled && (
                <Collapse
                  collapsible={graphLoading && 'disabled'}
                  style={collapseStyle}
                  items={[
                    {
                      styles: panelStyle,
                      key: '8',
                      label: 'Surface-Constrained Distances per segment:',
                      children: (
                        <>
                          {loadingCalc ? <Spin>Loading...</Spin> : null}
                          {!loadingCalc &&
                            polylineSurfaceDistances.map((res) => {
                              const total =
                                calculatePolylineSurfaceDistanceTotal(res);
                              return (
                                <div key={res.surfaceId}>
                                  <div>
                                    <strong>Surface {res.surfaceId}:</strong>
                                  </div>
                                  {Array.isArray(res.segmentDistances) ? (
                                    res.segmentDistances.map((val, i) => (
                                      <p key={i}>
                                        Segment {i + 1}: {val} m
                                      </p>
                                    ))
                                  ) : (
                                    <p>Segment 1: {res.segmentDistances}</p>
                                  )}
                                  <strong>Total Distance: </strong>
                                  {total} m
                                  <Divider />
                                </div>
                              );
                            })}
                          {!loadingCalc &&
                            polylineSurfaceDistances.length == 0 && (
                              <p>No Data Calculated</p>
                            )}
                        </>
                      ),
                    },
                  ]}
                />
              )}
          </div>
        )}
      </div>

      {/* ---------------------------
           ELEVATION PROFILE GRAPH
       ----------------------------*/}
      {/* {(lineProfile.length > 0 || graphLoading) && isAnySurfaceEnabled && !isMultiPointMode && (
        <div className="h-[500px] mb-[130px]">
          <Title level={3}>Section:</Title>
          <Divider />
          {buildingGraph > 0 && buildingGraph < 100 && (
            <Flex justify="center" align="center" vertical>
              <p>Building Section... {buildingGraph}%</p>
              <progress value={buildingGraph} max="100">
                {buildingGraph}%
              </progress>
            </Flex>
          )}
          {graphLoading && <Spin>Loading...</Spin>}
          {!graphLoading && isAnySurfaceEnabled && (
            <Line
              ref={chartRef}
              className="!min-w-[90%] h-[500px] w-[90%] border border-solid"
              data={chartData}
              options={chartOptions}
              onClick={handleChartClick} // **Add the onClick handler**
            />
          )}
          {!graphLoading && isAnySurfaceEnabled && (
            <Flex gap={10} className="mt-[10px]">
              {selectedPoint && (
                <Button onClick={handleZoomAtTarget} className="ml-[10px]">
                  Zoom at Target
                </Button>
              )}
              <Button onClick={handleResetZoom}>Zoom Extents</Button>
            </Flex>
          )}
        </div>
      )}
      <Divider /> */}
    </Modal>
  );
};
