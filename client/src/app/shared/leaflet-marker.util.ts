import * as L from 'leaflet';
import { FieldTaskStatus } from '../core/models';
import { resolveIcon } from './marker-icons';
import { statusColor } from './status.util';

/**
 * Status-colored Leaflet divIcon factory (arch §10.5, FR-9).
 *
 * A single, consistent circular pin SHAPE is used for every task. Status is
 * encoded by the pin's fill color (status.util palette, injected as the `--pin`
 * custom property) and the user-chosen emoji `icon` is rendered centered on top
 * of the pin. This keeps markers clean and uniform while letting the glyph carry
 * the task's meaning; the status color still reads on light + dark basemaps via
 * the white outline supplied by the base `.pin` styles.
 *
 * The icon box is 30×30 centered at [15,15] so the click point, selection ring,
 * hover aura, and tooltip all line up on the task's coordinate.
 *
 * Reused by the dashboard, the draggable task-form marker (`draggable`) and the
 * read-only task-detail marker — keep the selected/draggable/hover/faded
 * contract (the wrapper classes drive those states from styles.scss).
 *
 * @param status  task status -> pin fill color
 * @param opts    icon glyph + selected (scale up + ring) / draggable (pulsing
 *                halo) flags
 */
export function statusDivIcon(
  status: FieldTaskStatus,
  opts: { selected?: boolean; draggable?: boolean; icon?: string } = {},
): L.DivIcon {
  const classes = ['leaflet-status-marker', 'pin-shape--marker'];
  if (opts.selected) {
    classes.push('is-selected');
  }
  if (opts.draggable) {
    classes.push('is-draggable');
  }
  const color = statusColor(status);
  const glyph = resolveIcon(opts.icon);
  return L.divIcon({
    className: classes.join(' '),
    html:
      `<span class="pin pin--marker" style="--pin:${color}">` +
      `<span class="pin__glyph">${glyph}</span>` +
      `</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -17],
    tooltipAnchor: [0, -17],
  });
}

/** Sensible default map view when there are no task markers (UX §4.2 / PRD §12.2). */
export const DEFAULT_CENTER: L.LatLngExpression = [48.3, 33.52];
export const DEFAULT_ZOOM = 12;

/**
 * A task `area` polygon as it travels on the wire: an array of `[lat, lng]`
 * pairs (server `double[][]`). A polygon needs at least 3 vertices to be valid.
 */
export type AreaPolygon = number[][];

/** True when `area` is a usable polygon (>= 3 [lat, lng] vertices). */
export function isValidArea(area: AreaPolygon | null | undefined): area is AreaPolygon {
  return Array.isArray(area) && area.length >= 3 && area.every((p) => Array.isArray(p) && p.length === 2);
}

/**
 * Centroid of a polygon's vertices (simple average of lat/lng). Good enough to
 * drop the task point "inside" a convex-ish area; returns null when the polygon
 * isn't valid. Output is `[lat, lng]`.
 */
export function areaCentroid(area: AreaPolygon | null | undefined): [number, number] | null {
  if (!isValidArea(area)) {
    return null;
  }
  let lat = 0;
  let lng = 0;
  for (const [pLat, pLng] of area) {
    lat += pLat;
    lng += pLng;
  }
  return [lat / area.length, lng / area.length];
}

/**
 * Status-colored translucent polygon for a task `area` (FR / arch §10.5).
 *
 * Reused by the dashboard, task-detail, and the task-form draw tool so the area
 * fill always matches the task's status pin color. Vertices are `[lat, lng]`.
 */
export function statusAreaPolygon(
  area: AreaPolygon,
  status: FieldTaskStatus,
  opts: { interactive?: boolean } = {},
): L.Polygon {
  const color = statusColor(status);
  return L.polygon(area as L.LatLngExpression[], {
    color,
    weight: 2,
    opacity: 0.85,
    fillColor: color,
    fillOpacity: 0.15,
    interactive: opts.interactive ?? false,
  });
}
