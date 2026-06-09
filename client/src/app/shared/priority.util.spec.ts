import { Priority } from '../core/models';
import {
  PRIORITY_META,
  PRIORITY_OPTIONS,
  priorityColor,
  priorityLabel,
  priorityMeta,
} from './priority.util';

/**
 * priority.util — single source of truth for Priority → label/color.
 */
describe('priority.util', () => {
  it('exposes metadata for all four priorities Low → Urgent', () => {
    expect(PRIORITY_META.length).toBe(4);
    expect(PRIORITY_META.map((m) => m.priority)).toEqual([
      Priority.Low,
      Priority.Medium,
      Priority.High,
      Priority.Urgent,
    ]);
  });

  it('maps each priority to its label', () => {
    expect(priorityLabel(Priority.Low)).toBe('Low');
    expect(priorityLabel(Priority.Medium)).toBe('Medium');
    expect(priorityLabel(Priority.High)).toBe('High');
    expect(priorityLabel(Priority.Urgent)).toBe('Urgent');
  });

  it('maps each priority to its color', () => {
    expect(priorityColor(Priority.Low)).toBe('#9e9e9e');
    expect(priorityColor(Priority.Medium)).toBe('#1e88e5');
    expect(priorityColor(Priority.High)).toBe('#fb8c00');
    expect(priorityColor(Priority.Urgent)).toBe('#e53935');
  });

  it('returns the full metadata record for a priority', () => {
    const meta = priorityMeta(Priority.High);
    expect(meta.label).toBe('High');
    expect(meta.color).toBe('#fb8c00');
  });

  it('falls back to Low metadata for an unknown priority', () => {
    expect(priorityMeta(42 as Priority)).toBe(PRIORITY_META[0]);
    expect(priorityColor(42 as Priority)).toBe('#9e9e9e');
  });

  it('exposes the select options as the ordered metadata', () => {
    expect(PRIORITY_OPTIONS).toBe(PRIORITY_META);
  });
});
