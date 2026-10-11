import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Bounds, Vec3 } from '../core/types';
import { bearing, distance, polygonArea, polylineLength, unionBounds, emptyBounds } from '../core/geometry';
import { chainSegments } from '../core/contours';
import type { Profile } from '../core/profile';
import { createEngine, type EngineClient } from '../engine/protocol';
import type { CutFillResult, LoadedDataset, StockpileResult } from '../engine/engine';
import { writeDxf } from '../formats/write';
import { Viewer, type CameraInfo } from '../viewer/Viewer';
import { layerInk, seriesColors, cut as cutColor, fill as fillColor, neutral } from '../viewer/palette';
import { icons } from './icons';
import { createStore } from './store';
import { TitleBlock } from './TitleBlock';
import { ProfileChart, profileCsv } from './ProfileChart';
import { cum, dms, elev, grouped, metres, pct, sqm } from './format';

type Tool = 'navigate' | 'inspect' | 'distance' | 'area' | 'profile' | 'stockpile' | 'cutfill';

const TOOLS: { id: Tool; label: string; key: string; hint: string }[] = [
  { id: 'navigate', label: 'Navigate', key: 'V', hint: 'Drag to orbit, right-drag to pan, scroll to zoom.' },
  { id: 'inspect', label: 'Inspect', key: 'I', hint: 'Click the ground to read its coordinates and the level of every surface there.' },
  { id: 'distance', label: 'Distance', key: 'D', hint: 'Click two points. You get plan and slope distance, rise, grade and bearing.' },
  { id: 'area', label: 'Area', key: 'A', hint: 'Click around the area. Double-click, press Enter or click the first point to close.' },
  { id: 'profile', label: 'Section', key: 'P', hint: 'Click along a line, then double-click or press Enter to cut a long section through every surface.' },
  { id: 'stockpile', label: 'Stockpile', key: 'S', hint: 'Click around the toe of the pile and close it, or pick a closed line from the drawing.' },
  { id: 'cutfill', label: 'Cut and fill', key: 'C', hint: 'Compare existing ground with a design surface.' },
];

interface ClosedLine {
  label: string;
  points: Vec3[];
}

interface DatasetMeta {
  id: string;
  kind: 'surface' | 'drawing';
  name: string;
  file: string;
  bounds: Bounds;
  visible: boolean;
  triangles: number;
  color: string;
  layers: { name: string; color: string; visible: boolean; count: number }[];
  skipped: Record<string, number>;
  drapedOn: string | null;
  closedLines: ClosedLine[];
}

type Result =
  | { kind: 'inspect'; p: Vec3; levels: { id: string; name: string; z: number }[] }
  | { kind: 'distance'; d: ReturnType<typeof distance>; bearing: number }
  | { kind: 'area'; area: number; perimeter: number; vertices: number }
  | { kind: 'stockpile'; r: StockpileResult }
  | { kind: 'cutfill'; r: Omit<CutFillResult, 'diff'>; existing: string; design: string };

const DEMO = ['existing-ground.xml', 'design-pad.xml', 'site-plan.dxf'];
const multiPointTools: Tool[] = ['area', 'profile', 'stockpile'];

export function App() {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const engineRef = useRef<EngineClient | null>(null);
  const hover = useMemo(() => createStore<Vec3 | null>(null), []);
  const camera = useMemo(() => createStore<CameraInfo>({ metresPerPixel: 0.2, heading: 0 }), []);
  const labelTick = useMemo(() => createStore(0), []);

  const [datasets, setDatasets] = useState<DatasetMeta[]>([]);
  const [tool, setTool] = useState<Tool>('navigate');
  const [pts, setPts] = useState<Vec3[]>([]);
  const [finished, setFinished] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [panelOpen, setPanelOpen] = useState(() => window.matchMedia('(min-width: 900px)').matches);

  const [exaggeration, setExaggeration] = useState(1);
  const [interval, setContourInterval] = useState(1);
  const [showContours, setShowContours] = useState(true);
  const [showTriangles, setShowTriangles] = useState(false);
  const [plain, setPlain] = useState(false);
  const [stockSurface, setStockSurface] = useState<string>('');
  const [baseMode, setBaseMode] = useState<'toe' | 'fixed'>('toe');
  const [fixedBase, setFixedBase] = useState('');
  const [cfExisting, setCfExisting] = useState('');
  const [cfDesign, setCfDesign] = useState('');
  const [cfActive, setCfActive] = useState<string | null>(null);

  const surfaces = datasets.filter((d) => d.kind === 'surface' || d.triangles > 0);
  const visibleSurfaceIds = surfaces.filter((s) => s.visible).map((s) => s.id);

  // ── set-up ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const v = new Viewer(hostRef.current!);
    viewerRef.current = v;
    v.onCamera = (info) => {
      camera.set(info);
      labelTick.set(labelTick.get() + 1);
    };
    const e = createEngine();
    engineRef.current = e;
    return () => {
      v.dispose();
      viewerRef.current = null;
    };
  }, [camera, labelTick]);

  const fail = useCallback((err: unknown) => {
    setError(err instanceof Error ? err.message : String(err));
    setStatus(null);
  }, []);

  // ── loading ────────────────────────────────────────────────────────────

  const loadTexts = useCallback(
    async (files: { name: string; text: string }[]) => {
      const engine = engineRef.current!, viewer = viewerRef.current!;
      // Surfaces first, so 2D linework in drawings can be draped onto them.
      const ordered = [...files].sort((a, b) => Number(a.name.toLowerCase().endsWith('.dxf')) - Number(b.name.toLowerCase().endsWith('.dxf')));
      const added: DatasetMeta[] = [];
      let firstSurface = datasets.find((d) => d.kind === 'surface') ?? null;
      const wasEmpty = !viewer.hasOrigin;
      for (const f of ordered) {
        setStatus(`Reading ${f.name}…`);
        let loaded: LoadedDataset[];
        try {
          loaded = await engine.call('load', f.name, f.text);
        } catch (err) {
          fail(err);
          continue;
        }
        for (const d of loaded) {
          if (d.kind === 'surface') {
            viewer.addSurface(d.id, d.tin, d.bounds);
            const meta: DatasetMeta = {
              id: d.id, kind: 'surface', name: d.name, file: d.file, bounds: d.bounds, visible: true,
              triangles: d.tin.indices.length / 3, color: seriesColors[(datasets.length + added.length) % seriesColors.length]!,
              layers: [], skipped: {}, drapedOn: null, closedLines: [],
            };
            added.push(meta);
            firstSurface ??= meta;
            const c = await engine.call('contours', d.id, interval);
            viewer.setContours(d.id, c.segments, c.levels, interval);
            viewer.setContoursVisible(d.id, showContours);
          } else {
            const dr = d.drawing;
            const flatLines = dr.polylines.map((p, i) => ({ i, p })).filter(({ p }) => isFlatZero(p.points));
            let draped: Float64Array[][] = [];
            if (firstSurface && flatLines.length) {
              setStatus(`Draping ${f.name} on ${firstSurface.name}…`);
              draped = await engine.call('drape', flatLines.map(({ p }) => ({ points: p.points, closed: p.closed })), firstSurface.id, 1);
            }
            const drapedAt = new Map(flatLines.map(({ i }, k) => [i, draped[k]]));
            const byLayer = new Map<string, { lines: Float64Array[]; points: Float64Array; color: string }>();
            const counts = new Map<string, number>();
            const layer = (name: string) => {
              if (!byLayer.has(name)) byLayer.set(name, { lines: [], points: new Float64Array(0), color: layerInk(name) });
              counts.set(name, (counts.get(name) ?? 0) + 1);
              return byLayer.get(name)!;
            };
            const closedLines: ClosedLine[] = [];
            dr.polylines.forEach((p, i) => {
              const L = layer(p.layer);
              const pieces = drapedAt.get(i);
              if (pieces) L.lines.push(...pieces);
              else L.lines.push(p.closed ? closeRing(p.points) : p.points);
              if (p.closed && p.points.length >= 9) {
                const n = closedLines.filter((c) => c.label.startsWith(p.layer + ',')).length + 1;
                closedLines.push({ label: `${p.layer}, line ${n} (${p.points.length / 3} vertices)`, points: toVecs(p.points) });
              }
            });
            for (const pt of dr.points) {
              const L = layer(pt.layer);
              L.points = Float64Array.from([...L.points, pt.x, pt.y, pt.z]);
            }
            viewer.addDrawing(d.id, d.bounds, byLayer);
            if (dr.faces) viewer.addSurface(d.id, dr.faces, d.bounds);
            added.push({
              id: d.id, kind: 'drawing', name: d.name, file: d.file, bounds: d.bounds, visible: true,
              triangles: dr.faces ? dr.faces.indices.length / 3 : 0, color: '#1d2721',
              layers: [...byLayer].map(([name, l]) => ({ name, color: l.color, visible: true, count: counts.get(name) ?? 0 })).sort((a, b) => a.name.localeCompare(b.name)),
              skipped: d.skipped, drapedOn: flatLines.length && firstSurface ? firstSurface.name : null, closedLines,
            });
          }
        }
      }
      setDatasets((prev) => [...prev, ...added]);
      if (added.length && wasEmpty) {
        const b = added.reduce((acc, d) => unionBounds(acc, d.bounds), emptyBounds());
        viewer.frame(b);
      }
      const s0 = added.find((a) => a.kind === 'surface');
      if (s0) {
        setStockSurface((v) => v || s0.id);
        setCfExisting((v) => v || s0.id);
        const s1 = added.filter((a) => a.kind === 'surface')[1];
        if (s1) setCfDesign((v) => v || s1.id);
      }
      setStatus(null);
    },
    [datasets, interval, showContours, fail],
  );

  const loadDemo = useCallback(async () => {
    try {
      setStatus('Downloading the demo site…');
      const files = await Promise.all(
        DEMO.map(async (name) => {
          const r = await fetch(`${import.meta.env.BASE_URL}samples/${name}`);
          if (!r.ok) throw new Error(`Could not download ${name} (HTTP ${r.status}).`);
          return { name, text: await r.text() };
        }),
      );
      await loadTexts(files);
    } catch (err) {
      fail(err);
    }
  }, [loadTexts, fail]);

  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    void loadDemo();
  }, [loadDemo]);

  const openFiles = useCallback(
    async (list: FileList | File[]) => {
      const files = [...list];
      if (!files.length) return;
      const big = files.find((f) => f.size > 150 * 1024 * 1024);
      if (big) return fail(new Error(`${big.name} is ${(big.size / 1048576).toFixed(0)} MB. Groundwork runs in your browser and reads files up to 150 MB.`));
      await loadTexts(await Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() }))));
    },
    [loadTexts, fail],
  );

  const clearAll = () => {
    const v = viewerRef.current!;
    for (const d of datasets) {
      v.remove(d.id);
      void engineRef.current!.call('remove', d.id);
    }
    v.resetOrigin();
    setDatasets([]);
    resetMeasure();
    setResult(null);
    setProfile(null);
    setCfActive(null);
    setStockSurface('');
    setCfExisting('');
    setCfDesign('');
  };

  // Keep the 3D view centred in the space the panels leave free.
  useEffect(() => {
    const measure = () => {
      const v = viewerRef.current;
      if (!v) return;
      const W = window.innerWidth, H = window.innerHeight;
      const r = (sel: string) => document.querySelector(sel)?.getBoundingClientRect();
      const rail = r('.rail'), panel = r('.panel'), drawer = r('.drawer'), tb = r('.title-block');
      const narrow = W < 900;
      v.setInsets({
        left: !narrow && rail ? rail.right : 0,
        right: !narrow && panel ? W - panel.left : 0,
        top: narrow && tb ? tb.bottom : 0,
        bottom: Math.max(narrow && rail ? H - rail.top : 0, drawer ? H - drawer.top : 0),
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [panelOpen, profile]);

  // ── display settings ───────────────────────────────────────────────────

  useEffect(() => viewerRef.current?.setExaggeration(exaggeration), [exaggeration]);
  useEffect(() => viewerRef.current?.setShowTriangles(showTriangles), [showTriangles]);
  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    for (const s of surfaces) if (s.id !== cfActive) v.setSurfaceColoring(s.id, { mode: plain ? 'plain' : 'elevation' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plain, cfActive, datasets.length]);

  const changeInterval = async (iv: number) => {
    setContourInterval(iv);
    for (const s of surfaces) {
      const c = await engineRef.current!.call('contours', s.id, iv);
      viewerRef.current!.setContours(s.id, c.segments, c.levels, iv);
      viewerRef.current!.setContoursVisible(s.id, showContours && s.visible);
    }
  };

  const toggleContours = (on: boolean) => {
    setShowContours(on);
    for (const s of surfaces) viewerRef.current!.setContoursVisible(s.id, on && s.visible);
  };

  const toggleDataset = (id: string) => {
    setDatasets((ds) =>
      ds.map((d) => {
        if (d.id !== id) return d;
        viewerRef.current!.setVisible(id, !d.visible);
        if (!d.visible) viewerRef.current!.setContoursVisible(id, showContours);
        return { ...d, visible: !d.visible };
      }),
    );
  };

  const toggleLayer = (id: string, layer: string) => {
    setDatasets((ds) =>
      ds.map((d) => {
        if (d.id !== id) return d;
        return {
          ...d,
          layers: d.layers.map((l) => {
            if (l.name !== layer) return l;
            viewerRef.current!.setLayerVisible(id, layer, !l.visible);
            return { ...l, visible: !l.visible };
          }),
        };
      }),
    );
  };

  const exportContours = async (s: DatasetMeta) => {
    const c = await engineRef.current!.call('contours', s.id, interval);
    const chains = chainSegments(c, 1e-6);
    const dxf = writeDxf({
      layerColors: { 'C-TOPO-MAJR': 8, 'C-TOPO-MINR': 9 },
      polylines: chains.map((ch) => ({
        layer: Math.abs(ch.level / (interval * 5) - Math.round(ch.level / (interval * 5))) < 1e-6 ? 'C-TOPO-MAJR' : 'C-TOPO-MINR',
        points: Float64Array.from(ch.points),
        closed: false,
      })),
    });
    download(`${slug(s.name)}-contours-${interval}m.dxf`, dxf, 'application/dxf');
  };

  // ── measuring ──────────────────────────────────────────────────────────

  const resetMeasure = useCallback(() => {
    setPts([]);
    setFinished(false);
    viewerRef.current?.setMeasurement([], false);
  }, []);

  const chooseTool = (t: Tool) => {
    setTool(t);
    resetMeasure();
    if (t !== 'cutfill' && result?.kind !== 'cutfill') setResult(null);
    if (t === 'cutfill' || t === 'stockpile') setPanelOpen(true);
  };

  const finish = async (points: Vec3[]) => {
      const engine = engineRef.current!;
      setFinished(true);
      viewerRef.current!.setMeasurement(points, tool !== 'profile');
      try {
        if (tool === 'area') {
          setResult({ kind: 'area', area: polygonArea(points), perimeter: polylineLength(points, '2d', true), vertices: points.length });
        } else if (tool === 'profile') {
          setStatus('Cutting the section…');
          setProfile(await engine.call('profile', points, surfaces.map((x) => x.id)));
          setStatus(null);
        } else if (tool === 'stockpile') {
          await runStockpile(points);
        }
      } catch (err) {
        fail(err);
      }
  };

  const runStockpile = async (points: Vec3[]) => {
    const sid = stockSurface || visibleSurfaceIds[0];
    if (!sid) throw new Error('Load a surface first.');
    const base = baseMode === 'toe' ? ({ mode: 'toe' } as const) : ({ mode: 'fixed', z: Number(fixedBase) } as const);
    if (base.mode === 'fixed' && !Number.isFinite(base.z)) throw new Error('Enter the base elevation in metres, for example 82.5.');
    setStatus('Measuring the stockpile…');
    const r = await engineRef.current!.call('stockpile', sid, points, base);
    setResult({ kind: 'stockpile', r });
    setStatus(null);
  };

  const applyClosedLine = async (cl: ClosedLine) => {
    setTool('stockpile');
    setPts(cl.points);
    setFinished(true);
    viewerRef.current!.setMeasurement(await dropToGround(cl.points), true);
    try {
      await runStockpile(cl.points);
    } catch (err) {
      fail(err);
    }
  };

  /** 2D lines (z = 0) are shown on the ground surface rather than far below it. */
  const dropToGround = async (points: Vec3[]): Promise<Vec3[]> => {
    const sid = stockSurface || visibleSurfaceIds[0];
    if (!sid || points.some((p) => p.z !== 0)) return points;
    return Promise.all(points.map(async (p) => ({ ...p, z: (await engineRef.current!.call('elevations', p.x, p.y, [sid]))[0]?.z ?? 0 })));
  };

  const runCutFill = async () => {
    if (!cfExisting || !cfDesign || cfExisting === cfDesign) return fail(new Error('Choose two different surfaces: the existing ground and the design.'));
    try {
      setStatus('Comparing surfaces…');
      const r = await engineRef.current!.call('cutFill', cfExisting, cfDesign);
      const v = viewerRef.current!;
      if (cfActive && cfActive !== cfExisting) v.setSurfaceColoring(cfActive, { mode: plain ? 'plain' : 'elevation' });
      v.setSurfaceColoring(cfExisting, { mode: 'cutfill', diff: r.diff, range: r.range });
      // Hide the design so the coloured existing surface underneath is visible.
      setDatasets((ds) => ds.map((d) => (d.id === cfDesign && d.visible ? (v.setVisible(d.id, false), { ...d, visible: false }) : d)));
      setCfActive(cfExisting);
      const name = (id: string) => datasets.find((d) => d.id === id)?.name ?? id;
      setResult({ kind: 'cutfill', r: { cut: r.cut, fill: r.fill, area: r.area, range: r.range }, existing: name(cfExisting), design: name(cfDesign) });
      setStatus(null);
    } catch (err) {
      fail(err);
    }
  };

  const clearCutFill = () => {
    if (cfActive) viewerRef.current!.setSurfaceColoring(cfActive, { mode: plain ? 'plain' : 'elevation' });
    setCfActive(null);
    if (result?.kind === 'cutfill') setResult(null);
  };

  // ── pointer handling ───────────────────────────────────────────────────

  const down = useRef<{ x: number; y: number } | null>(null);
  const moveFrame = useRef(0);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);

  const onPointerMove = (e: React.PointerEvent) => {
    lastPointer.current = { x: e.clientX, y: e.clientY };
    if (moveFrame.current) return;
    moveFrame.current = requestAnimationFrame(() => {
      moveFrame.current = 0;
      const v = viewerRef.current, lp = lastPointer.current;
      if (!v || !lp) return;
      const p = v.pick(lp.x, lp.y);
      hover.set(p);
      v.setHoverMarker(tool === 'navigate' ? null : p);
      if (pts.length && !finished && tool !== 'inspect') v.setMeasurement(pts, false, p);
    });
  };

  const onPointerLeave = () => {
    hover.set(null);
    viewerRef.current?.setHoverMarker(null);
    if (pts.length && !finished) viewerRef.current?.setMeasurement(pts, false);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    down.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerUp = async (e: React.PointerEvent) => {
    const d = down.current;
    down.current = null;
    if (!d || e.button !== 0 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5 || tool === 'navigate' || tool === 'cutfill') return;
    const v = viewerRef.current!;
    const p = v.pick(e.clientX, e.clientY);
    if (!p) return;
    if (tool === 'inspect') {
      v.setMeasurement([p], false);
      try {
        setResult({ kind: 'inspect', p, levels: await engineRef.current!.call('elevations', p.x, p.y, surfaces.map((s) => s.id)) });
      } catch (err) {
        fail(err);
      }
      return;
    }
    if (tool === 'distance') {
      const next = pts.length >= 2 || finished ? [p] : [...pts, p];
      setPts(next);
      setFinished(next.length === 2);
      v.setMeasurement(next, false);
      if (next.length === 2) setResult({ kind: 'distance', d: distance(next[0]!, next[1]!), bearing: bearing(next[0]!, next[1]!) });
      else setResult(null);
      return;
    }
    if (multiPointTools.includes(tool)) {
      if (finished) {
        setPts([p]);
        setFinished(false);
        v.setMeasurement([p], false);
        if (tool !== 'profile') setResult(null);
        return;
      }
      // Clicking near the first point closes the shape.
      if (tool !== 'profile' && pts.length >= 3) {
        const s = v.project(pts[0]!);
        const r = (e.target as HTMLElement).getBoundingClientRect();
        if (s && Math.hypot(s.x - (e.clientX - r.left), s.y - (e.clientY - r.top)) < 12) return void finish(pts);
      }
      const next = [...pts, p];
      setPts(next);
      v.setMeasurement(next, false);
    }
  };

  const onDoubleClick = () => {
    if (!multiPointTools.includes(tool) || finished) return;
    // The double-click's second click already added a duplicate point; drop it.
    const clean = pts.filter((p, i) => i === 0 || Math.hypot(p.x - pts[i - 1]!.x, p.y - pts[i - 1]!.y) > 1e-6);
    const need = tool === 'profile' ? 2 : 3;
    if (clean.length >= need) void finish(clean);
  };

  // ── keyboard ───────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') {
        resetMeasure();
        setResult((r) => (r?.kind === 'cutfill' ? r : null));
        return;
      }
      if (e.key === 'Enter' && multiPointTools.includes(tool) && !finished) {
        if (pts.length >= (tool === 'profile' ? 2 : 3)) void finish(pts);
        return;
      }
      if (e.key === 'Backspace' && pts.length && !finished) {
        const next = pts.slice(0, -1);
        setPts(next);
        viewerRef.current?.setMeasurement(next, false);
        return;
      }
      const t = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
      if (t) chooseTool(t.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ── drag and drop ──────────────────────────────────────────────────────

  useEffect(() => {
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      depth++;
      setDragging(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      depth = 0;
      setDragging(false);
      if (e.dataTransfer?.files.length) void openFiles(e.dataTransfer.files);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [openFiles]);

  // ── derived ────────────────────────────────────────────────────────────

  const fileInput = useRef<HTMLInputElement>(null);
  const totalTriangles = datasets.filter((d) => d.visible).reduce((a, d) => a + d.triangles, 0);
  const primary = surfaces.find((s) => s.visible)?.name ?? null;
  const allBounds = datasets.reduce((acc, d) => unionBounds(acc, d.bounds), emptyBounds());
  const activeTool = TOOLS.find((t) => t.id === tool)!;
  const closedLines = datasets.flatMap((d) => d.closedLines);

  const label = useMemo(() => {
    if (!result) return null;
    if (result.kind === 'distance' && pts.length === 2) return { at: mid(pts[0]!, pts[1]!), text: metres(result.d.horizontal) };
    if (result.kind === 'area' && pts.length >= 3) return { at: centroid(pts), text: sqm(result.area) };
    if (result.kind === 'stockpile' && pts.length >= 3) return { at: centroid(pts), text: cum(result.r.volume) };
    return null;
  }, [result, pts]);

  const chartHover = (i: number | null) => {
    if (i === null || !profile) return viewerRef.current?.setChartMarker(null);
    const z = profile.series.map((s) => s.z[i]!).find((v) => !Number.isNaN(v));
    viewerRef.current?.setChartMarker(z === undefined ? null : { x: profile.xy[i * 2]!, y: profile.xy[i * 2 + 1]!, z });
  };

  return (
    <div className={`app tool-${tool}${profile ? ' has-profile' : ''}`}>
      <div
        ref={hostRef}
        className="scene"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      />
      {label && <SceneLabel viewer={viewerRef} tick={labelTick} at={label.at} text={label.text} />}

      <header className="masthead">
        <h1 className="wordmark">Groundwork</h1>
        <p className="tagline">Survey and CAD viewer. Your files stay in your browser.</p>
        <div className="mast-actions">
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
            {icons.open}
            <span>Open files</span>
          </button>
          {datasets.length > 0 ? (
            <button type="button" className="btn btn-quiet" onClick={clearAll}>Clear</button>
          ) : (
            <button type="button" className="btn btn-quiet" onClick={() => void loadDemo()}>Load demo site</button>
          )}
          <input ref={fileInput} type="file" multiple accept=".xml,.landxml,.dxf" hidden onChange={(e) => { if (e.target.files) void openFiles(e.target.files); e.target.value = ''; }} />
        </div>
      </header>

      <nav className="rail" aria-label="Tools">
        {TOOLS.map((t) => (
          <button key={t.id} type="button" className={`rail-btn${tool === t.id ? ' is-on' : ''}`} aria-pressed={tool === t.id} onClick={() => chooseTool(t.id)} title={`${t.label} (${t.key})`}>
            {icons[t.id]}
            <span className="rail-label">{t.label}</span>
          </button>
        ))}
        <hr />
        <button type="button" className="rail-btn" onClick={() => viewerRef.current?.frame(allBounds)} title="Fit everything in view" disabled={!datasets.length}>
          {icons.fit}
          <span className="rail-label">Fit</span>
        </button>
        <button type="button" className="rail-btn" onClick={() => viewerRef.current?.frame(allBounds, 'plan')} title="Plan view, north up" disabled={!datasets.length}>
          {icons.plan}
          <span className="rail-label">Plan</span>
        </button>
        <button type="button" className="rail-btn rail-panel-toggle" onClick={() => setPanelOpen((o) => !o)} aria-expanded={panelOpen} title="Layers and results">
          {icons.layers}
          <span className="rail-label">Layers</span>
        </button>
      </nav>

      <p className="hint" role="status" hidden={!!profile}>
        <strong>{activeTool.label}.</strong> {activeTool.hint}
        {pts.length > 0 && !finished && multiPointTools.includes(tool) && <span className="hint-keys"> Backspace removes the last point, Esc clears.</span>}
      </p>

      {multiPointTools.includes(tool) && !finished && pts.length >= (tool === 'profile' ? 2 : 3) && (
        <div className="finish">
          <button type="button" className="btn btn-primary" onClick={() => void finish(pts)}>
            {tool === 'profile' ? 'Cut section' : tool === 'area' ? 'Close area' : 'Measure volume'}
          </button>
          <button type="button" className="btn" onClick={resetMeasure}>Clear</button>
        </div>
      )}

      {error && (
        <div className="toast" role="alert">
          <span>{error}</span>
          <button type="button" className="icon-btn" onClick={() => setError(null)} aria-label="Dismiss">{icons.close}</button>
        </div>
      )}

      {dragging && (
        <div className="dropzone" aria-hidden="true">
          <p>Drop LandXML surfaces or DXF drawings</p>
        </div>
      )}

      <aside className={`panel${panelOpen ? ' is-open' : ''}`} aria-label="Layers and results">
        {result && <ResultView result={result} onClear={() => { setResult(null); resetMeasure(); if (result.kind === 'cutfill') clearCutFill(); }} />}

        {tool === 'stockpile' && (
          <section className="panel-sec">
            <h2>Stockpile</h2>
            <label className="field">
              <span>Surface</span>
              <select value={stockSurface} onChange={(e) => setStockSurface(e.target.value)}>
                {surfaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <fieldset className="field">
              <legend>Measure from</legend>
              <label className="radio"><input type="radio" checked={baseMode === 'toe'} onChange={() => setBaseMode('toe')} /> Average ground level along the toe</label>
              <label className="radio"><input type="radio" checked={baseMode === 'fixed'} onChange={() => setBaseMode('fixed')} /> A fixed elevation
                <input className="num-input" inputMode="decimal" placeholder="82.50" value={fixedBase} onChange={(e) => setFixedBase(e.target.value)} disabled={baseMode !== 'fixed'} aria-label="Base elevation in metres" /> m
              </label>
            </fieldset>
            {closedLines.length > 0 && (
              <div className="field">
                <span>Or use a closed line from a drawing</span>
                <div className="chips">
                  {closedLines.map((cl) => (
                    <button key={cl.label} type="button" className="chip" onClick={() => void applyClosedLine(cl)}>{cl.label}</button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {tool === 'cutfill' && (
          <section className="panel-sec">
            <h2>Cut and fill</h2>
            <label className="field">
              <span>Existing ground</span>
              <select value={cfExisting} onChange={(e) => setCfExisting(e.target.value)}>
                {surfaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Design</span>
              <select value={cfDesign} onChange={(e) => setCfDesign(e.target.value)}>
                <option value="">Choose a surface</option>
                {surfaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <div className="row">
              <button type="button" className="btn btn-primary" onClick={() => void runCutFill()} disabled={!cfExisting || !cfDesign}>Compare surfaces</button>
              {cfActive && <button type="button" className="btn btn-quiet" onClick={clearCutFill}>Clear colouring</button>}
            </div>
          </section>
        )}

        <section className="panel-sec">
          <h2>Data</h2>
          {datasets.length === 0 && <p className="muted">Open a LandXML surface or a DXF drawing, or drop files anywhere on the page.</p>}
          <ul className="datasets">
            {datasets.map((d) => (
              <li key={d.id} className={d.visible ? '' : 'is-hidden'}>
                <div className="ds-row">
                  <label className="check">
                    <input type="checkbox" checked={d.visible} onChange={() => toggleDataset(d.id)} />
                    <i className="swatch" style={{ background: d.kind === 'surface' ? d.color : 'transparent', borderColor: d.color }} />
                    <span className="ds-name" title={d.file}>{d.name}</span>
                  </label>
                  {d.kind === 'surface' && (
                    <button type="button" className="icon-btn" title={`Download ${interval} m contours as DXF`} onClick={() => void exportContours(d)}>{icons.download}</button>
                  )}
                </div>
                <p className="ds-meta">
                  {d.kind === 'surface' ? `${grouped(d.triangles, 0)} triangles, ${(d.bounds.maxZ - d.bounds.minZ).toFixed(1)} m relief` : `${d.layers.length} layers${d.drapedOn ? `, 2D lines draped on ${d.drapedOn.split(' (')[0]}` : ''}`}
                  {Object.keys(d.skipped).length > 0 && `. Not shown: ${Object.entries(d.skipped).map(([k, n]) => `${n} ${k.toLowerCase()}`).join(', ')}`}
                </p>
                {d.layers.length > 0 && (
                  <ul className="layers">
                    {d.layers.map((l) => (
                      <li key={l.name}>
                        <label className="check">
                          <input type="checkbox" checked={l.visible} onChange={() => toggleLayer(d.id, l.name)} />
                          <i className="swatch-line" style={{ background: l.color }} />
                          <span>{l.name}</span>
                          <span className="count">{l.count}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="panel-sec">
          <h2>Display</h2>
          <div className="field">
            <span>Colour surfaces by</span>
            <div className="segmented" role="radiogroup">
              <button type="button" role="radio" aria-checked={!plain} className={!plain ? 'is-on' : ''} onClick={() => setPlain(false)}>Elevation</button>
              <button type="button" role="radio" aria-checked={plain} className={plain ? 'is-on' : ''} onClick={() => setPlain(true)}>Plain</button>
            </div>
          </div>
          <div className="field field-inline">
            <label className="check"><input type="checkbox" checked={showContours} onChange={(e) => toggleContours(e.target.checked)} /> Contours every</label>
            <select value={interval} onChange={(e) => void changeInterval(Number(e.target.value))} aria-label="Contour interval">
              {[0.25, 0.5, 1, 2, 5].map((v) => <option key={v} value={v}>{v} m</option>)}
            </select>
          </div>
          <label className="check field"><input type="checkbox" checked={showTriangles} onChange={(e) => setShowTriangles(e.target.checked)} /> Show triangles</label>
          <label className="field">
            <span>Vertical exaggeration <b className="num">×{exaggeration.toFixed(1)}</b></span>
            <input type="range" min={1} max={5} step={0.5} value={exaggeration} onChange={(e) => setExaggeration(Number(e.target.value))} />
          </label>
        </section>

        <footer className="panel-foot">
          Demo data is synthetic. Built by <a href="https://tariqali.dev" target="_blank" rel="noreferrer">Tariq Ali</a>. <a href="https://github.com/Tariqali13/3d-project-demo" target="_blank" rel="noreferrer">Source</a>
        </footer>
      </aside>

      {profile && (
        <section className="drawer" aria-label="Long section">
          <header className="drawer-head">
            <h2>Long section, {metres(profile.length)}</h2>
            <div className="legend">
              {profile.series.map((s, i) => (
                <span key={i}><i className="swatch-line" style={{ background: seriesColors[i % seriesColors.length] }} />{s.name}</span>
              ))}
            </div>
            <button type="button" className="icon-btn" title="Download as CSV" onClick={() => download('long-section.csv', profileCsv(profile), 'text/csv')}>{icons.download}</button>
            <button type="button" className="icon-btn" aria-label="Close section" onClick={() => { setProfile(null); viewerRef.current?.setChartMarker(null); }}>{icons.close}</button>
          </header>
          <ProfileChart profile={profile} onHover={chartHover} />
        </section>
      )}

      <TitleBlock hover={hover} camera={camera} surface={primary} triangles={totalTriangles} exaggeration={exaggeration} status={status} />
    </div>
  );
}

function ResultView({ result, onClear }: { result: Result; onClear: () => void }) {
  return (
    <section className="panel-sec result" aria-live="polite">
      <header className="result-head">
        <h2>{{ inspect: 'Point', distance: 'Distance', area: 'Area', stockpile: 'Stockpile volume', cutfill: 'Cut and fill' }[result.kind]}</h2>
        <button type="button" className="icon-btn" onClick={onClear} aria-label="Clear result">{icons.close}</button>
      </header>
      {result.kind === 'inspect' && (
        <dl className="readout">
          <dt>Easting</dt><dd>{grouped(result.p.x)}</dd>
          <dt>Northing</dt><dd>{grouped(result.p.y)}</dd>
          {result.levels.map((l) => (
            <span key={l.id} className="contents"><dt>{l.name.split(' (')[0]}</dt><dd>{elev(l.z)}</dd></span>
          ))}
          {result.levels.length >= 2 && Number.isFinite(result.levels[0]!.z) && Number.isFinite(result.levels[1]!.z) && (
            <>
              <dt>Difference</dt>
              <dd className={result.levels[0]!.z >= result.levels[1]!.z ? 'is-cut' : 'is-fill'}>
                {Math.abs(result.levels[0]!.z - result.levels[1]!.z).toFixed(3)} m {result.levels[0]!.z >= result.levels[1]!.z ? 'cut' : 'fill'}
              </dd>
            </>
          )}
        </dl>
      )}
      {result.kind === 'distance' && (
        <dl className="readout">
          <dt>Plan</dt><dd className="big">{metres(result.d.horizontal, 3)}</dd>
          <dt>Slope</dt><dd>{metres(result.d.slope, 3)}</dd>
          <dt>Rise</dt><dd>{(result.d.dz >= 0 ? '+' : '−') + Math.abs(result.d.dz).toFixed(3)} m</dd>
          <dt>Grade</dt><dd>{pct(result.d.gradePct)}</dd>
          <dt>Bearing</dt><dd>{dms(result.bearing)}</dd>
        </dl>
      )}
      {result.kind === 'area' && (
        <dl className="readout">
          <dt>Plan area</dt><dd className="big">{sqm(result.area)}</dd>
          <dt>Hectares</dt><dd>{(result.area / 10000).toFixed(4)} ha</dd>
          <dt>Perimeter</dt><dd>{metres(result.perimeter)}</dd>
          <dt>Vertices</dt><dd>{result.vertices}</dd>
        </dl>
      )}
      {result.kind === 'stockpile' && (
        <dl className="readout">
          <dt>Volume</dt><dd className="big">{cum(result.r.volume)}</dd>
          <dt>Base</dt><dd>{result.r.baseZ.toFixed(3)} m, {result.r.baseMode === 'toe' ? 'mean toe level' : 'fixed'}</dd>
          <dt>Footprint</dt><dd>{sqm(result.r.area)}</dd>
          {result.r.fill > 0.5 && (<><dt>Below base, subtracted</dt><dd>{cum(result.r.fill)}</dd></>)}
        </dl>
      )}
      {result.kind === 'cutfill' && (
        <>
          <dl className="readout">
            <dt>Cut</dt><dd className="big is-cut">{cum(result.r.cut)}</dd>
            <dt>Fill</dt><dd className="big is-fill">{cum(result.r.fill)}</dd>
            <dt>Net</dt>
            <dd>{cum(Math.abs(result.r.cut - result.r.fill))} {result.r.cut >= result.r.fill ? 'surplus to remove' : 'to import'}</dd>
            <dt>Area compared</dt><dd>{sqm(result.r.area)}</dd>
          </dl>
          <div className="ramp" aria-label={`Colour ramp from ${result.r.range.toFixed(1)} m fill to ${result.r.range.toFixed(1)} m cut`}>
            <div className="ramp-bar" style={{ background: `linear-gradient(90deg, ${fillColor}, ${neutral} 50%, ${cutColor})` }} />
            <div className="ramp-labels"><span>{result.r.range.toFixed(1)} m fill</span><span>on grade</span><span>{result.r.range.toFixed(1)} m cut</span></div>
          </div>
          <p className="muted small">{result.existing} against {result.design}. Cut is where existing ground is above the design.</p>
        </>
      )}
    </section>
  );
}

function SceneLabel({ viewer, tick, at, text }: { viewer: React.RefObject<Viewer | null>; tick: ReturnType<typeof createStore<number>>; at: Vec3; text: string }) {
  const [, force] = useState(0);
  useEffect(() => tick.subscribe(() => force((n) => n + 1)), [tick]);
  const s = viewer.current?.project(at);
  if (!s) return null;
  return <div className="scene-label" style={{ transform: `translate(${s.x}px, ${s.y}px)` }}>{text}</div>;
}

function isFlatZero(p: Float64Array) {
  for (let i = 2; i < p.length; i += 3) if (p[i] !== 0) return false;
  return true;
}

function closeRing(p: Float64Array) {
  return Float64Array.from([...p, p[0]!, p[1]!, p[2]!]);
}

function toVecs(p: Float64Array): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < p.length; i += 3) out.push({ x: p[i]!, y: p[i + 1]!, z: p[i + 2]! });
  return out;
}

const mid = (a: Vec3, b: Vec3): Vec3 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });

function centroid(pts: Vec3[]): Vec3 {
  const n = pts.length;
  return pts.reduce((a, p) => ({ x: a.x + p.x / n, y: a.y + p.y / n, z: Math.max(a.z, p.z) }), { x: 0, y: 0, z: -Infinity });
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
