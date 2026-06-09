import { Priority } from '../core/models';

/**
 * Single source of truth for Priority → label/color.
 *
 * Colors: Low grey, Medium blue, High orange, Urgent red. Consumed by the
 * priority badge, the create/edit select, and any sort/filter UI so they
 * never drift.
 */
export interface PriorityMeta {
  priority: Priority;
  label: string;
  /** Primary color (badge text / chip border). */
  color: string;
}

/** Ordered metadata for all four priorities (Low → Urgent). */
export const PRIORITY_META: readonly PriorityMeta[] = [
  { priority: Priority.Low, label: 'Low', color: '#9e9e9e' },
  { priority: Priority.Medium, label: 'Medium', color: '#1e88e5' },
  { priority: Priority.High, label: 'High', color: '#fb8c00' },
  { priority: Priority.Urgent, label: 'Urgent', color: '#e53935' },
];

const META_BY_PRIORITY = new Map<Priority, PriorityMeta>(
  PRIORITY_META.map((m) => [m.priority, m]),
);

const FALLBACK = PRIORITY_META[0];

/** Full metadata record for a priority (never null). */
export function priorityMeta(priority: Priority): PriorityMeta {
  return META_BY_PRIORITY.get(priority) ?? FALLBACK;
}

/** Human-readable label for a priority. */
export function priorityLabel(priority: Priority): string {
  return priorityMeta(priority).label;
}

/** Hex color for a priority (badge / chip). */
export function priorityColor(priority: Priority): string {
  return priorityMeta(priority).color;
}

/** Options for a priority <select> (Low → Urgent). */
export const PRIORITY_OPTIONS: readonly PriorityMeta[] = PRIORITY_META;
