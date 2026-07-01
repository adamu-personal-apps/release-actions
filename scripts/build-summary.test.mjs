import { describe, it, expect } from 'vitest';
import { buildSummary } from './build-summary.mjs';

describe('buildSummary', () => {
  it('formats subjects as a bullet list', () => {
    expect(buildSummary(['feat: a', 'fix: b'])).toBe('- feat: a\n- fix: b');
  });

  it('returns "Initial release" when there are no commits', () => {
    expect(buildSummary([])).toBe('Initial release');
  });

  it('ignores blank and whitespace-only lines', () => {
    expect(buildSummary(['feat: a', '   ', ''])).toBe('- feat: a');
  });

  it('trims surrounding whitespace on each subject', () => {
    expect(buildSummary(['  feat: a  '])).toBe('- feat: a');
  });

  it('caps at maxBullets and appends an "…and N more" line', () => {
    const subjects = Array.from({ length: 5 }, (_, i) => `c${i + 1}`);
    expect(buildSummary(subjects, 3)).toBe('- c1\n- c2\n- c3\n- …and 2 more');
  });

  it('does not add the "more" line when exactly at the cap', () => {
    expect(buildSummary(['a', 'b', 'c'], 3)).toBe('- a\n- b\n- c');
  });

  it('defaults the cap to 20', () => {
    const subjects = Array.from({ length: 25 }, (_, i) => `c${i}`);
    expect(buildSummary(subjects)).toContain('- …and 5 more');
  });
});
