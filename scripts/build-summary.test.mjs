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
});
