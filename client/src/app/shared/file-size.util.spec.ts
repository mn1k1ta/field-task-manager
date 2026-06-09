import { formatBytes } from './file-size.util';

/**
 * file-size.util — binary (1024) human-readable byte formatting.
 */
describe('formatBytes', () => {
  it('returns "0 B" for zero, negative, or non-finite input', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(-100)).toBe('0 B');
    expect(formatBytes(NaN)).toBe('0 B');
    expect(formatBytes(Infinity)).toBe('0 B');
  });

  it('formats whole bytes with no decimals', () => {
    expect(formatBytes(1)).toBe('1 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('formats kilobytes using the binary 1024 base', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB'); // 1.5 * 1024
  });

  it('formats megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
    expect(formatBytes(10 * 1024 * 1024)).toBe('10 MB');
  });

  it('caps the unit at GB', () => {
    expect(formatBytes(5 * 1024 * 1024 * 1024)).toBe('5 GB');
    // Beyond GB still uses GB (clamped), value grows.
    expect(formatBytes(2048 * 1024 * 1024 * 1024)).toBe('2048 GB');
  });

  it('rounds KB+ to one decimal place', () => {
    // 1234 bytes = 1.205 KB -> rounded to 1.2
    expect(formatBytes(1234)).toBe('1.2 KB');
  });
});
