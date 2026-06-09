import { FieldTaskStatus } from '../core/models';
import {
  STATUS_LEGEND,
  STATUS_META,
  statusColor,
  statusLabel,
  statusMeta,
} from './status.util';

/**
 * status.util — the single source of truth for Status → color/label/icon
 * (arch §10.6). The architecture pins the exact palette, so these tests lock it.
 */
describe('status.util', () => {
  it('exposes metadata for all four statuses in order', () => {
    expect(STATUS_META.length).toBe(4);
    expect(STATUS_META.map((m) => m.status)).toEqual([
      FieldTaskStatus.Created,
      FieldTaskStatus.InProgress,
      FieldTaskStatus.Done,
      FieldTaskStatus.Verified,
    ]);
  });

  it('maps each status to the architecture §10.6 color', () => {
    expect(statusColor(FieldTaskStatus.Created)).toBe('#9e9e9e');
    expect(statusColor(FieldTaskStatus.InProgress)).toBe('#1e88e5');
    expect(statusColor(FieldTaskStatus.Done)).toBe('#fb8c00');
    expect(statusColor(FieldTaskStatus.Verified)).toBe('#43a047');
  });

  it('maps each status to its English label', () => {
    expect(statusLabel(FieldTaskStatus.Created)).toBe('Created');
    expect(statusLabel(FieldTaskStatus.InProgress)).toBe('In Progress');
    expect(statusLabel(FieldTaskStatus.Done)).toBe('Done');
    expect(statusLabel(FieldTaskStatus.Verified)).toBe('Verified');
  });

  it('returns the full metadata record for a status', () => {
    const meta = statusMeta(FieldTaskStatus.Verified);
    expect(meta.color).toBe('#43a047');
    expect(meta.label).toBe('Verified');
    expect(meta.icon).toBe('✓');
    expect(meta.bg).toBeTruthy();
    expect(meta.text).toBeTruthy();
  });

  it('falls back to Created metadata for an unknown status', () => {
    const meta = statusMeta(99 as FieldTaskStatus);
    expect(meta).toBe(STATUS_META[0]);
    expect(statusColor(99 as FieldTaskStatus)).toBe('#9e9e9e');
  });

  it('exposes the legend as the ordered metadata', () => {
    expect(STATUS_LEGEND).toBe(STATUS_META);
    expect(STATUS_LEGEND.length).toBe(4);
  });
});
