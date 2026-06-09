import { FieldTaskStatus } from '../core/models';

/**
 * Single source of truth for Status → color/label/icon (arch §10.6, UX §5.2).
 *
 * Consumed by the marker factory, the status badge, list-row dots, filter
 * pills, and the legend so the legend can never drift from what is rendered.
 *
 * Marker/dot colors use the architecture §10.6 palette exactly:
 *   Created    #9e9e9e   In Progress #1e88e5   Done #fb8c00   Verified #43a047
 */
export interface StatusMeta {
  status: FieldTaskStatus;
  label: string;
  /** Primary status color (marker pin, list dot, badge text). */
  color: string;
  /** Soft tint used as the badge background. */
  bg: string;
  /** Text color readable on the tint background. */
  text: string;
  /** Non-color reinforcement glyph (accessibility floor, UX P3). */
  icon: string;
}

/** Ordered metadata for all four statuses (used by the legend + filter pills). */
export const STATUS_META: readonly StatusMeta[] = [
  {
    status: FieldTaskStatus.Created,
    label: 'Created',
    color: '#9e9e9e',
    bg: '#eef1f5',
    text: '#5b6573',
    icon: '○',
  },
  {
    status: FieldTaskStatus.InProgress,
    label: 'In Progress',
    color: '#1e88e5',
    bg: '#e7f0fd',
    text: '#1565c0',
    icon: '◐',
  },
  {
    status: FieldTaskStatus.Done,
    label: 'Done',
    color: '#fb8c00',
    bg: '#fef3e2',
    text: '#b45309',
    icon: '●',
  },
  {
    status: FieldTaskStatus.Verified,
    label: 'Verified',
    color: '#43a047',
    bg: '#e7f5e9',
    text: '#2e7d32',
    icon: '✓',
  },
];

const META_BY_STATUS = new Map<FieldTaskStatus, StatusMeta>(
  STATUS_META.map((m) => [m.status, m]),
);

const FALLBACK = STATUS_META[0];

/** Full metadata record for a status (never null). */
export function statusMeta(status: FieldTaskStatus): StatusMeta {
  return META_BY_STATUS.get(status) ?? FALLBACK;
}

/** Hex color for a status (marker / dot). */
export function statusColor(status: FieldTaskStatus): string {
  return statusMeta(status).color;
}

/** Human-readable label for a status. */
export function statusLabel(status: FieldTaskStatus): string {
  return statusMeta(status).label;
}

/** The legend rows (all four statuses, in order). */
export const STATUS_LEGEND: readonly StatusMeta[] = STATUS_META;
