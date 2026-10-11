import type { Vec3 } from '../core/types';
import type { CameraInfo } from '../viewer/Viewer';
import { grouped, niceLength } from './format';
import { useStore, type Store } from './store';

interface Props {
  hover: Store<Vec3 | null>;
  camera: Store<CameraInfo>;
  surface: string | null;
  triangles: number;
  exaggeration: number;
  status: string | null;
}

/**
 * The bottom-right title block, borrowed from a CAD drawing sheet: it is where a
 * surveyor looks for the coordinates, the surface, and the scale.
 */
export function TitleBlock({ hover, camera, surface, triangles, exaggeration, status }: Props) {
  const p = useStore(hover);
  const cam = useStore(camera);
  const target = 110; // px
  const len = niceLength(cam.metresPerPixel * target);
  const barPx = Math.min(140, len / Math.max(cam.metresPerPixel, 1e-9));

  return (
    <section className="title-block" aria-label="Cursor position and drawing information">
      <div className="tb-row tb-head">
        <div className="tb-cell tb-name">
          <span className="tb-label">Project</span>
          <span className="tb-mark">Groundwork</span>
        </div>
        <div className="tb-cell tb-surface">
          <span className="tb-label">Surface</span>
          <span className="tb-value" title={surface ?? undefined}>{status ?? surface ?? 'Nothing loaded'}</span>
        </div>
      </div>
      <div className="tb-row tb-coords" aria-live="off">
        <div className="tb-cell">
          <span className="tb-label">Easting</span>
          <span className="tb-num">{p ? grouped(p.x) : '—'}</span>
        </div>
        <div className="tb-cell">
          <span className="tb-label">Northing</span>
          <span className="tb-num">{p ? grouped(p.y) : '—'}</span>
        </div>
        <div className="tb-cell">
          <span className="tb-label">Elevation</span>
          <span className="tb-num">{p ? p.z.toFixed(3) : '—'}</span>
        </div>
      </div>
      <div className="tb-row tb-foot">
        <div className="tb-cell">
          <span className="tb-label">Triangles</span>
          <span className="tb-num">{triangles ? grouped(triangles, 0) : '—'}</span>
        </div>
        <div className="tb-cell">
          <span className="tb-label">Vert. exag.</span>
          <span className="tb-num">×{exaggeration.toFixed(1)}</span>
        </div>
        <div className="tb-cell tb-scale">
          <svg width={barPx + 2} height="10" aria-hidden="true">
            <rect x="1" y="2" width={barPx / 2} height="5" className="bar-dark" />
            <rect x={1 + barPx / 2} y="2" width={barPx / 2} height="5" className="bar-light" />
          </svg>
          <span className="tb-num">{grouped(len, len < 1 ? 1 : 0)} m</span>
        </div>
        <div className="tb-cell tb-north" title="Grid north">
          <svg width="26" height="26" viewBox="-13 -13 26 26" style={{ transform: `rotate(${-cam.heading}deg)` }} aria-label={`Grid north, view heading ${Math.round(cam.heading)}°`}>
            <path d="M0 -11 3.6 1 0 -1.2 -3.6 1Z" className="north" />
            <text x="0" y="10.5" textAnchor="middle" className="north-n">N</text>
          </svg>
        </div>
      </div>
    </section>
  );
}
