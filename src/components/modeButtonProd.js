import React, { useState } from 'react';
import { toggleResetControls, zoomExtents } from '../utils/controlsUtils';
import { Button, Flex, Tabs, Checkbox } from 'antd';
import { Nav, Tab } from 'react-bootstrap';
import { NavItem, NavLink, TabsWrap } from '@shared/components/Tabs';

export const ModeButtonsProd = ({
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
}) => {
  const [tabKeys, setTabKeys] = useState();
  const geometryControls = () => {
    return (
      <Flex justify='center' gap={10} align='center'>
        {pivotPoint && (
          <Button onClick={toggleResetControls}>Reset Control</Button>
        )}
        <Button onClick={zoomExtents}>Zoom Extents</Button>
        {fileLayers.length > 0 || surfaceLibrary.length > 0 ? (
          <Button
            type={flattenToPlane ? 'primary' : 'default'}
            onClick={() => setFlattenToPlane(!flattenToPlane)}
          >
            Plane
          </Button>
        ) : null}
      </Flex>
    );
  };
  const isResetButtonEnabled =
    (isSinglePointMode && lineData) ||
    (isMultiPointMode && multiPoints.length > 0) ||
    (isPolylineMode && polylinePoints.length);
  const CalculationControls = () => {
    return (
      <Flex justify='center' gap={10}>
        <Button
          onClick={toggleSinglePointMode}
          type={isSinglePointMode ? 'primary' : 'default'}
        >
          Line
        </Button>
        <Button
          onClick={toggleMultiPointMode}
          type={isMultiPointMode ? 'primary' : 'default'}
        >
          Polygon
        </Button>

        <Button
          onClick={togglePolylineMode}
          type={isPolylineMode ? 'primary' : 'default'}
        >
          Polyline
        </Button>
        {isSinglePointMode && lineData && (
          <Button onClick={openGraphModal}>Show Calculations and Graph</Button>
        )}
        {isMultiPointMode && multiPoints.length > 0 && (
          <Button onClick={openGraphModal}>Show Calculations and Graph</Button>
        )}
        {isPolylineMode && polylinePoints.length > 0 && (
          <Button onClick={openGraphModal}>Show Calculations and Graph</Button>
        )}
        {isResetButtonEnabled && (
          <Button onClick={toggleResetAll}>Reset</Button>
        )}
      </Flex>
    );
  };

  const onChange = (key) => {
    setTabKeys(key);
  };
  const items = [
    {
      key: '1',
      label: 'View (F)',
      children: geometryControls(),
    },
    {
      key: '2',
      label: 'Measure & Section',
      children: CalculationControls(),
    },
  ];
  return (
    <>
      {fileLayers.length > 0 || surfaceLibrary.length > 0 ? (
        <Flex justify='center' vertical>
          {/* <Tabs
            defaultActiveKey='1'
            activeKey={tabKeys}
            items={items}
            onChange={onChange}
          /> */}
          <Tab.Container defaultActiveKey='1'>
            <TabsWrap>
              <Nav className='nav-tabs'>
                <NavItem>
                  <NavLink eventKey='1'>View (F)</NavLink>
                </NavItem>
                <NavItem>
                  <NavLink eventKey='2'>Measure & Section</NavLink>
                </NavItem>
              </Nav>
              <Tab.Content>
                <Tab.Pane eventKey='1'>
                  <Flex justify='center' gap={10} align='center'>
                    {pivotPoint && (
                      <Button onClick={toggleResetControls}>
                        Reset Control
                      </Button>
                    )}
                    <Button onClick={zoomExtents}>Zoom Extents</Button>
                    {fileLayers.length > 0 || surfaceLibrary.length > 0 ? (
                      <Button
                        type={flattenToPlane ? 'primary' : 'default'}
                        onClick={() => setFlattenToPlane(!flattenToPlane)}
                      >
                        Plane
                      </Button>
                    ) : null}
                  </Flex>
                </Tab.Pane>
                <Tab.Pane eventKey='2'>
                  <Flex justify='center' gap={10}>
                    <Button
                      onClick={toggleSinglePointMode}
                      type={isSinglePointMode ? 'primary' : 'default'}
                    >
                      Line
                    </Button>
                    <Button
                      onClick={toggleMultiPointMode}
                      type={isMultiPointMode ? 'primary' : 'default'}
                    >
                      Polygon
                    </Button>

                    <Button
                      onClick={togglePolylineMode}
                      type={isPolylineMode ? 'primary' : 'default'}
                    >
                      Polyline
                    </Button>
                    {isSinglePointMode && lineData && (
                      <Button onClick={openGraphModal}>
                        Show Calculations and Graph
                      </Button>
                    )}
                    {isMultiPointMode && multiPoints.length > 0 && (
                      <Button onClick={openGraphModal}>
                        Show Calculations and Graph
                      </Button>
                    )}
                    {isPolylineMode && polylinePoints.length > 0 && (
                      <Button onClick={openGraphModal}>
                        Show Calculations and Graph
                      </Button>
                    )}
                    {isResetButtonEnabled && (
                      <Button onClick={toggleResetAll}>Reset</Button>
                    )}
                  </Flex>
                </Tab.Pane>
              </Tab.Content>
            </TabsWrap>
          </Tab.Container>
        </Flex>
      ) : null}
    </>
  );
};
