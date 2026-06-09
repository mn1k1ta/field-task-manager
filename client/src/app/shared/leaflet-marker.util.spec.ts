import { FieldTaskStatus } from '../core/models';
import { DEFAULT_ICON } from './marker-icons';
import {
  AreaPolygon,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  areaCentroid,
  isValidArea,
  statusDivIcon,
} from './leaflet-marker.util';
import { statusColor } from './status.util';

/**
 * leaflet-marker.util — status-colored divIcon factory + area polygon helpers
 * (arch §10.5, FR-9).
 */
describe('statusDivIcon', () => {
  /** The factory stores the markup under the divIcon `html` option. */
  function html(status: FieldTaskStatus, opts = {}): string {
    const icon = statusDivIcon(status, opts);
    return (icon.options as { html?: string }).html ?? '';
  }

  it('embeds the status color as the --pin custom property', () => {
    const markup = html(FieldTaskStatus.InProgress);
    expect(markup).toContain(`--pin:${statusColor(FieldTaskStatus.InProgress)}`);
    expect(markup).toContain('#1e88e5');
  });

  it('renders the default glyph when no icon is supplied', () => {
    expect(html(FieldTaskStatus.Created)).toContain(DEFAULT_ICON);
  });

  it('renders the supplied icon glyph', () => {
    expect(html(FieldTaskStatus.Done, { icon: '🔧' })).toContain('🔧');
  });

  it('adds the is-selected class only when selected', () => {
    const plain = statusDivIcon(FieldTaskStatus.Created);
    const selected = statusDivIcon(FieldTaskStatus.Created, { selected: true });
    expect(plain.options.className).not.toContain('is-selected');
    expect(selected.options.className).toContain('is-selected');
  });

  it('adds the is-draggable class only when draggable', () => {
    const draggable = statusDivIcon(FieldTaskStatus.Created, { draggable: true });
    expect(draggable.options.className).toContain('is-draggable');
    expect(statusDivIcon(FieldTaskStatus.Created).options.className).not.toContain('is-draggable');
  });

  it('anchors the 30x30 icon box at its center', () => {
    const icon = statusDivIcon(FieldTaskStatus.Created);
    expect(icon.options.iconSize).toEqual([30, 30]);
    expect(icon.options.iconAnchor).toEqual([15, 15]);
  });
});

describe('isValidArea', () => {
  it('is true for >= 3 [lat, lng] pairs', () => {
    expect(isValidArea([[0, 0], [1, 1], [2, 2]])).toBeTrue();
    expect(isValidArea([[0, 0], [1, 1], [2, 2], [3, 3]])).toBeTrue();
  });

  it('is false for fewer than 3 vertices', () => {
    expect(isValidArea([])).toBeFalse();
    expect(isValidArea([[0, 0]])).toBeFalse();
    expect(isValidArea([[0, 0], [1, 1]])).toBeFalse();
  });

  it('is false for null / undefined', () => {
    expect(isValidArea(null)).toBeFalse();
    expect(isValidArea(undefined)).toBeFalse();
  });

  it('is false when a vertex is not a [lat, lng] pair', () => {
    expect(isValidArea([[0, 0], [1, 1], [2]] as AreaPolygon)).toBeFalse();
  });
});

describe('areaCentroid', () => {
  it('returns the average lat/lng of the vertices', () => {
    const area: AreaPolygon = [
      [0, 0],
      [0, 6],
      [3, 0],
    ];
    expect(areaCentroid(area)).toEqual([1, 2]);
  });

  it('returns null for an invalid area', () => {
    expect(areaCentroid([[0, 0], [1, 1]])).toBeNull();
    expect(areaCentroid(null)).toBeNull();
    expect(areaCentroid(undefined)).toBeNull();
  });
});

describe('default map view', () => {
  it('exposes a sensible fixed center + zoom', () => {
    expect(DEFAULT_CENTER).toEqual([48.3, 33.52]);
    expect(DEFAULT_ZOOM).toBe(12);
  });
});
