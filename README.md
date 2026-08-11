# 3D Geospatial & CAD Viewer

A browser-based engineering viewer for rendering and interacting with complex CAD and geospatial data using **React** and **Three.js**.

This project demonstrates performance-sensitive frontend engineering for spatial datasets, including DXF/LandXML-style geometry, terrain and surface visualization, measurements, coordinate transformations, elevation analysis, and large-file processing.

> This repository is a technical demonstration. Production/client-specific data, credentials, private endpoints, and proprietary assets are intentionally excluded.

## What This Project Demonstrates

- Rendering complex 2D/3D engineering geometry in the browser
- Working with CAD/geospatial formats and coordinate systems
- Building measurement and analysis tools on top of Three.js scenes
- Processing large datasets without blocking the UI
- Optimizing raycasting and geometry interaction
- Combining 3D visualization with chart-based elevation/profile analysis

## Core Capabilities

### 3D & CAD Visualization

- Render line, polyline, point, face and surface-style geometry
- Display terrain/surface meshes with configurable visual modes
- Interactive zoom, pan, orbit and scene navigation
- Wireframe and solid visualization modes
- Efficient spatial interaction using Three.js acceleration utilities

### Geospatial Processing

- Coordinate transformation support with `proj4`
- XML-based spatial data parsing
- DXF parsing and geometry conversion
- Terrain/surface normalization and spatial calculations

### Measurement & Analysis

- 2D and 3D distance measurement workflows
- Area/geometry interaction patterns
- Elevation/profile visualization with Chart.js
- Surface-aware analysis patterns for engineering datasets

### Performance

Large engineering files can contain hundreds of thousands or millions of entities. The project therefore uses patterns such as:

- browser-side geometry optimization
- BVH-assisted spatial queries
- Web Worker-compatible processing patterns
- memory-conscious geometry handling
- reduced main-thread blocking for computational work

## Technology Stack

### Frontend

- **React 18**
- **Three.js**
- **React Three Fiber / Drei**
- **Ant Design**
- **Tailwind CSS**
- **styled-components / Emotion**

### Spatial & File Processing

- `dxf-parser`
- `three-dxf`
- `fast-xml-parser`
- `proj4`
- `d3-delaunay`
- `fflate` / `pako`
- `jszip`

### Visualization

- `chart.js`
- `react-chartjs-2`
- `chartjs-plugin-zoom`

### Performance & Geometry

- `three-mesh-bvh`
- Web Worker-compatible processing
- custom geometry transformation utilities

## Architecture

A typical processing flow looks like this:

```text
Engineering File
      |
      v
Parser / Format Adapter
      |
      v
Coordinate + Geometry Normalization
      |
      v
Three.js Geometry / Mesh Construction
      |
      +------> Spatial Index / Interaction Layer
      |
      v
3D Scene
      |
      +------> Measurements
      +------> Elevation / Profile Analysis
      +------> Visualization Controls
```

The important architectural principle is to keep **file parsing**, **domain geometry**, **Three.js rendering**, and **analysis logic** separate enough that additional spatial formats can be supported without rewriting the entire viewer.

## Running Locally

### Requirements

- Node.js 20 or later
- npm

### Setup

```bash
npm install
npm start
```

The public showcase is intentionally self-contained and does not include a production backend, customer datasets, credentials, or private API endpoints. API-backed experiments should use a local, same-origin demo service with synthetic data only.

### Production Build

```bash
npm run build
```

## Engineering Challenges

### Large Files

The most difficult part of browser-based CAD visualization is not drawing a small model—it is keeping the application usable as file size and geometry complexity increase.

Important considerations include:

- reducing unnecessary geometry allocations
- avoiding repeated scene traversal
- moving expensive calculations away from the main thread
- limiting repeated raycasts
- indexing geometry for faster spatial queries
- progressively processing large datasets when practical

### Coordinate Systems

Engineering/CAD data frequently uses projected/local coordinates rather than ordinary latitude/longitude. The viewer therefore treats coordinate transformation as a first-class part of the data pipeline instead of assuming all inputs share the same coordinate system.

### Measurement Accuracy

Measurements must operate on normalized domain geometry rather than relying purely on what is visually displayed on-screen. This separation allows rendering choices such as scaling or flattening to remain independent from analytical calculations.

## Why This Repository Is Public

Most of my commercial engineering work is maintained in private employer/client repositories. This project is intended to demonstrate the type of frontend, visualization, geospatial, and performance engineering I have worked on without exposing confidential production systems.

## Areas for Further Development

- isolate parsers behind a formal adapter interface
- add automated fixtures for supported spatial formats
- expand Web Worker processing for large-file workflows
- add benchmark datasets and performance measurements
- strengthen test coverage around geometry/measurement calculations
- migrate remaining legacy build configuration toward a more modern toolchain

## Author

**Tariq Ali** — Senior Full-Stack Software Engineer

- Portfolio: https://tariqali13.com
- GitHub: https://github.com/Tariqali13
- LinkedIn: https://www.linkedin.com/in/tariq-ali-116678156/
