/**
 * Human-readable byte-size formatting for attachment chips/thumbnails.
 *
 * Uses binary (1024) units to match how file managers report sizes, capping at
 * GB (attachments are 10 MB max server-side). Single source of truth so the
 * task-form and task-detail attachment UIs never drift.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }
  const units = ['B', 'KB', 'MB', 'GB'] as const;
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  // Whole bytes show no decimals; KB+ show one where it adds information.
  const rounded = exponent === 0 ? value : Math.round(value * 10) / 10;
  return `${rounded} ${units[exponent]}`;
}
