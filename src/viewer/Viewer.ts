import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import { chooseOrigin, toLocal, type Origin } from '../core/origin';
import type { Bounds, Tin, Vec3 } from '../core/types';
import { cut as cutColor, elevationStops, fill as fillColor, flagging, ink, neutral, paper, sienna } from './palette';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export type SurfaceColoring = { mode: 'elevation' } | { mode: 'plain' } | { mode: 'cutfill'; diff: Float32Array; range: number };

export interface CameraInfo {
  /** Metres per CSS pixel at the orbit target, for the scale bar. */
  metresPerPixel: number;
  /** Camera heading in degrees clockwise from grid north, for the north arrow. */
  heading: number;
}

interface SurfaceEntry {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;
  wire: THREE.LineSegments | null;
  contours: THREE.Group;
  tin: Tin;
  coloring: SurfaceColoring;
}

const tmpColor = new THREE.Color();
const stopColors = elevationStops.map(([t, c]) => [t, new THREE.Color(c)] as const);

function elevationColor(t: number, out: THREE.Color) {
  t = Math.min(1, Math.max(0, t));
  for (let i = 1; i < stopColors.length; i++) {
    const [t1, c1] = stopColors[i]!;
    const [t0, c0] = stopColors[i - 1]!;
    if (t <= t1) return out.copy(c0).lerp(c1, (t - t0) / (t1 - t0));
  }
  return out.copy(stopColors[stopColors.length - 1]![1]);
}

/**
 * The 3D scene. Owns three.js objects only; React owns state and passes data in.
 * Everything is placed in a `world` group whose children are in local
 * coordinates (world minus `origin`), and whose z-scale is the vertical
 * exaggeration. World coordinates handed back out (picks) are float64.
 */
export class Viewer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(35, 1, 0.5, 20000);
  readonly controls: OrbitControls;
  private readonly world = new THREE.Group();
  private readonly overlay = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private readonly surfaces = new Map<string, SurfaceEntry>();
  private readonly drawings = new Map<string, THREE.Group>();
  private readonly resize: ResizeObserver;
  private raf = 0;
  private origin: Origin | null = null;
  private zRange: [number, number] = [0, 1];
  private exaggeration = 1;
  private showTriangles = false;
  private hoverMarker: THREE.Points;
  private chartMarker: THREE.Points;

  onHover: (p: Vec3 | null) => void = () => {};
  onCamera: (info: CameraInfo) => void = () => {};

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(paper);
    this.renderer.domElement.className = 'scene-canvas';
    host.appendChild(this.renderer.domElement);

    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.screenSpacePanning = false;
    this.controls.zoomToCursor = true;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.addEventListener('change', () => this.requestRender());

    // Hillshade convention: light from the north-west, 45° above the horizon.
    const sun = new THREE.DirectionalLight('#fffaf0', 2.6);
    sun.position.set(-1, 1, Math.SQRT2);
    this.scene.add(sun, new THREE.HemisphereLight('#eef1ea', '#6f6b5c', 0.85));
    this.scene.add(this.world);
    this.world.add(this.overlay);

    this.hoverMarker = this.makeMarker(ink, 9);
    this.chartMarker = this.makeMarker(flagging, 13);
    this.overlay.add(this.hoverMarker, this.chartMarker);

    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(host);
    this.fit();
  }

  // ── lifecycle ──────────────────────────────────────────────────────────

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resize.disconnect();
    this.controls.dispose();
    for (const id of [...this.surfaces.keys(), ...this.drawings.keys()]) this.remove(id);
    disposeTree(this.overlay);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private insets = { left: 0, right: 0, top: 0, bottom: 0 };

  /**
   * Screen space covered by UI panels. The projection centre is shifted into the
   * free area so "fit" frames the data where you can see it, not under a panel.
   */
  setInsets(i: { left: number; right: number; top: number; bottom: number }) {
    this.insets = i;
    this.fit();
  }

  private fit() {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const { left, right, top, bottom } = this.insets;
    this.camera.setViewOffset(w, h, (right - left) / 2, (bottom - top) / 2, w, h);
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  requestRender() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      // Damping keeps moving the camera for a few frames after input stops.
      if (this.controls.update()) this.requestRender();
      this.renderer.render(this.scene, this.camera);
      this.emitCamera();
    });
  }

  private emitCamera() {
    const dist = this.camera.position.distanceTo(this.controls.target);
    const h = this.host.clientHeight || 1;
    const metresPerPixel = (2 * dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / h;
    const d = new THREE.Vector3().subVectors(this.controls.target, this.camera.position);
    const heading = (THREE.MathUtils.radToDeg(Math.atan2(d.x, d.y)) + 360) % 360;
    this.onCamera({ metresPerPixel, heading });
  }

  // ── coordinates ────────────────────────────────────────────────────────

  /** Must be called before the first dataset; later datasets share the origin. */
  ensureOrigin(b: Bounds) {
    if (!this.origin) {
      this.origin = chooseOrigin(b);
      this.zRange = [b.minZ, b.maxZ];
    }
    return this.origin;
  }

  get hasOrigin() {
    return this.origin !== null;
  }

  resetOrigin() {
    this.origin = null;
  }

  private local(xyz: ArrayLike<number>) {
    return toLocal(xyz, this.origin!);
  }

  /** Screen position (CSS px, relative to the canvas) of a world point; null if behind the camera. */
  project(p: Vec3): { x: number; y: number } | null {
    if (!this.origin) return null;
    const v = new THREE.Vector3(p.x - this.origin.x, p.y - this.origin.y, p.z - this.origin.z);
    this.world.localToWorld(v);
    v.project(this.camera);
    if (v.z > 1) return null;
    return { x: ((v.x + 1) / 2) * this.host.clientWidth, y: ((1 - v.y) / 2) * this.host.clientHeight };
  }

  /** World point under a screen position, from visible surfaces. */
  pick(clientX: number, clientY: number): Vec3 | null {
    if (!this.origin) return null;
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    this.raycaster.firstHitOnly = true;
    const targets = [...this.surfaces.values()].filter((s) => s.mesh.visible && s.mesh.parent?.visible !== false).map((s) => s.mesh);
    const hit = this.raycaster.intersectObjects(targets, false)[0];
    if (!hit) return null;
    const l = this.world.worldToLocal(hit.point.clone());
    return { x: l.x + this.origin.x, y: l.y + this.origin.y, z: l.z + this.origin.z };
  }

  // ── surfaces ───────────────────────────────────────────────────────────

  addSurface(id: string, tin: Tin, bounds: Bounds) {
    this.ensureOrigin(bounds);
    this.zRange = [Math.min(this.zRange[0], bounds.minZ), Math.max(this.zRange[1], bounds.maxZ)];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.local(tin.positions), 3));
    g.setIndex(new THREE.BufferAttribute(tin.indices, 1));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(tin.positions.length), 3));
    g.computeVertexNormals();
    g.computeBoundsTree();
    const mat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      // Push the surface back a little so contours and linework drawn on it win the depth test.
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 2,
    });
    const mesh = new THREE.Mesh(g, mat);
    const contours = new THREE.Group();
    const entry: SurfaceEntry = { mesh, wire: null, contours, tin, coloring: { mode: 'elevation' } };
    this.surfaces.set(id, entry);
    this.world.add(mesh, contours);
    this.recolorAll();
    if (this.showTriangles) this.setShowTriangles(true);
    this.requestRender();
  }

  setSurfaceColoring(id: string, coloring: SurfaceColoring) {
    const s = this.surfaces.get(id);
    if (!s) return;
    s.coloring = coloring;
    this.recolor(s);
    this.requestRender();
  }

  private recolorAll() {
    for (const s of this.surfaces.values()) this.recolor(s);
  }

  private recolor(s: SurfaceEntry) {
    const attr = s.mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    const col = attr.array as Float32Array;
    const p = s.tin.positions;
    const [z0, z1] = this.zRange;
    const span = Math.max(z1 - z0, 1e-6);
    const c = s.coloring;
    const cutC = new THREE.Color(cutColor), fillC = new THREE.Color(fillColor), neutralC = new THREE.Color(neutral);
    const plain = new THREE.Color('#d3d6c6');
    for (let i = 0; i < p.length / 3; i++) {
      const z = p[i * 3 + 2]!;
      if (c.mode === 'plain') tmpColor.copy(plain);
      else if (c.mode === 'elevation') elevationColor((z - z0) / span, tmpColor);
      else {
        const d = c.diff[i]!;
        if (Number.isNaN(d)) {
          elevationColor((z - z0) / span, tmpColor).lerp(plain, 0.4);
        } else {
          // Square-root ramp so small differences near grade are still visible.
          const t = Math.min(1, Math.sqrt(Math.abs(d) / Math.max(c.range, 0.01)));
          tmpColor.copy(neutralC).lerp(d > 0 ? cutC : fillC, Math.abs(d) < 0.05 ? 0 : 0.25 + 0.75 * t);
        }
      }
      tmpColor.toArray(col, i * 3);
    }
    attr.needsUpdate = true;
  }

  setShowTriangles(on: boolean) {
    this.showTriangles = on;
    for (const s of this.surfaces.values()) {
      if (on && !s.wire) {
        s.wire = new THREE.LineSegments(new THREE.WireframeGeometry(s.mesh.geometry), new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity: 0.12 }));
        s.mesh.add(s.wire);
      }
      if (s.wire) s.wire.visible = on;
    }
    this.requestRender();
  }

  /** Replace a surface's contours. Segments are world xyz pairs; every `majorEvery`-th level is drawn heavier. */
  setContours(id: string, segments: Float64Array, levels: Float64Array, interval: number, majorEvery = 5) {
    const s = this.surfaces.get(id);
    if (!s) return;
    disposeTree(s.contours);
    s.contours.clear();
    if (!segments.length) return this.requestRender();
    const major: number[] = [], minor: number[] = [];
    const tol = interval * 1e-6;
    for (let i = 0; i < levels.length; i++) {
      const lv = levels[i]!;
      const isMajor = Math.abs(lv / (interval * majorEvery) - Math.round(lv / (interval * majorEvery))) < tol;
      const dst = isMajor ? major : minor;
      for (let k = 0; k < 6; k++) dst.push(segments[i * 6 + k]!);
    }
    const make = (arr: number[], color: string, opacity: number) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.local(arr), 3));
      return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
    };
    if (minor.length) s.contours.add(make(minor, sienna, 0.55));
    if (major.length) s.contours.add(make(major, '#6e4a2a', 1));
    this.requestRender();
  }

  setContoursVisible(id: string, on: boolean) {
    const s = this.surfaces.get(id);
    if (s) s.contours.visible = on;
    this.requestRender();
  }

  // ── drawings ───────────────────────────────────────────────────────────

  /**
   * Add CAD linework. `layers` maps layer name → list of world-coordinate
   * polylines (already draped where needed) and its ink colour.
   */
  addDrawing(id: string, bounds: Bounds, layers: Map<string, { lines: Float64Array[]; points: Float64Array; color: string }>) {
    this.ensureOrigin(bounds);
    const group = new THREE.Group();
    for (const [name, { lines, points, color }] of layers) {
      const layer = new THREE.Group();
      layer.name = name;
      const segs: number[] = [];
      for (const l of lines) for (let i = 0; i + 5 < l.length; i += 3) segs.push(l[i]!, l[i + 1]!, l[i + 2]!, l[i + 3]!, l[i + 4]!, l[i + 5]!);
      if (segs.length) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(this.local(segs), 3));
        layer.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color })));
      }
      if (points.length) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(this.local(points), 3));
        layer.add(new THREE.Points(g, new THREE.PointsMaterial({ color, size: 7, sizeAttenuation: false, map: dotTexture(), alphaTest: 0.5, transparent: true })));
      }
      group.add(layer);
    }
    this.drawings.set(id, group);
    this.world.add(group);
    this.requestRender();
  }

  setLayerVisible(id: string, layer: string, on: boolean) {
    const g = this.drawings.get(id)?.getObjectByName(layer);
    if (g) g.visible = on;
    this.requestRender();
  }

  setVisible(id: string, on: boolean) {
    const s = this.surfaces.get(id);
    if (s) {
      s.mesh.visible = on;
      s.contours.visible = on;
    }
    const d = this.drawings.get(id);
    if (d) d.visible = on;
    this.requestRender();
  }

  remove(id: string) {
    const s = this.surfaces.get(id);
    if (s) {
      s.mesh.geometry.disposeBoundsTree();
      disposeTree(s.mesh);
      disposeTree(s.contours);
      this.world.remove(s.mesh, s.contours);
      this.surfaces.delete(id);
    }
    const d = this.drawings.get(id);
    if (d) {
      disposeTree(d);
      this.world.remove(d);
      this.drawings.delete(id);
    }
    this.requestRender();
  }

  // ── view ───────────────────────────────────────────────────────────────

  setExaggeration(v: number) {
    this.exaggeration = v;
    this.world.scale.z = v;
    this.world.updateMatrixWorld(true);
    this.requestRender();
  }

  /** Frame a world bounding box from the south-west (oblique) or straight down (plan). */
  frame(b: Bounds, view: 'oblique' | 'plan' = 'oblique') {
    if (!this.origin) return;
    const cx = (b.minX + b.maxX) / 2 - this.origin.x;
    const cy = (b.minY + b.maxY) / 2 - this.origin.y;
    const cz = ((b.minZ + b.maxZ) / 2 - this.origin.z) * this.exaggeration;
    const radius = Math.max(Math.hypot(b.maxX - b.minX, b.maxY - b.minY) / 2, 5);
    // Fit to the free area between the panels, in whichever direction is tighter.
    const { clientWidth: w, clientHeight: h } = this.host;
    const freeW = Math.max(w - this.insets.left - this.insets.right, w * 0.4);
    const freeH = Math.max(h - this.insets.top - this.insets.bottom, h * 0.4);
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const tanFree = Math.min(tanV * (freeH / h), tanV * (w / h) * (freeW / w));
    const dist = (radius / tanFree) * (view === 'plan' ? 0.95 : 1.12);
    this.controls.target.set(cx, cy, cz);
    if (view === 'plan') this.camera.position.set(cx, cy - dist * 0.001, cz + dist);
    else {
      const el = THREE.MathUtils.degToRad(38), az = THREE.MathUtils.degToRad(205);
      this.camera.position.set(cx + dist * Math.cos(el) * Math.sin(az), cy + dist * Math.cos(el) * Math.cos(az), cz + dist * Math.sin(el));
    }
    this.camera.near = Math.max(0.1, dist / 2000);
    this.camera.far = dist * 20;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.requestRender();
  }

  // ── overlays ───────────────────────────────────────────────────────────

  private makeMarker(color: string, size: number) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    const m = new THREE.Points(g, new THREE.PointsMaterial({ color, size, sizeAttenuation: false, map: ringTexture(), transparent: true, depthTest: false }));
    m.renderOrder = 20;
    m.visible = false;
    return m;
  }

  private placeMarker(m: THREE.Points, p: Vec3 | null) {
    if (!p || !this.origin) {
      m.visible = false;
    } else {
      const a = m.geometry.getAttribute('position') as THREE.BufferAttribute;
      a.setXYZ(0, p.x - this.origin.x, p.y - this.origin.y, p.z - this.origin.z);
      a.needsUpdate = true;
      m.visible = true;
    }
    this.requestRender();
  }

  setHoverMarker(p: Vec3 | null) {
    this.placeMarker(this.hoverMarker, p);
  }

  setChartMarker(p: Vec3 | null) {
    this.placeMarker(this.chartMarker, p);
  }

  /** The measurement being drawn: flagging-pink line and vertices, always on top. */
  setMeasurement(points: Vec3[], closed: boolean, preview: Vec3 | null = null) {
    for (const c of [...this.overlay.children]) if (c !== this.hoverMarker && c !== this.chartMarker) {
      disposeTree(c);
      this.overlay.remove(c);
    }
    if (!this.origin || points.length === 0) return this.requestRender();
    const pts = preview ? [...points, preview] : points;
    const loc = this.local(pts.flatMap((p) => [p.x, p.y, p.z]));
    const lineGeom = new THREE.BufferGeometry();
    const closedLoc = closed && pts.length > 2 ? Float32Array.from([...loc, loc[0]!, loc[1]!, loc[2]!]) : loc;
    lineGeom.setAttribute('position', new THREE.BufferAttribute(closedLoc, 3));
    const line = new THREE.Line(lineGeom, new THREE.LineBasicMaterial({ color: flagging, depthTest: false, transparent: true }));
    line.renderOrder = 10;
    const vg = new THREE.BufferGeometry();
    vg.setAttribute('position', new THREE.BufferAttribute(this.local(points.flatMap((p) => [p.x, p.y, p.z])), 3));
    const verts = new THREE.Points(vg, new THREE.PointsMaterial({ color: flagging, size: 9, sizeAttenuation: false, map: dotTexture(), transparent: true, depthTest: false }));
    verts.renderOrder = 11;
    this.overlay.add(line, verts);
    this.requestRender();
  }
}

let dot: THREE.Texture | null = null;
let ring: THREE.Texture | null = null;

function canvasTexture(draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function dotTexture() {
  return (dot ??= canvasTexture((c) => {
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(32, 32, 28, 0, Math.PI * 2);
    c.fill();
  }));
}

function ringTexture() {
  return (ring ??= canvasTexture((c) => {
    c.strokeStyle = '#fff';
    c.lineWidth = 10;
    c.beginPath();
    c.arc(32, 32, 24, 0, Math.PI * 2);
    c.stroke();
  }));
}

function disposeTree(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}
