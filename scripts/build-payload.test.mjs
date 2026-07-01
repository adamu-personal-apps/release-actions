import { describe, it, expect } from 'vitest';
import {
  openTitle,
  openBody,
  updateLine,
  finalLine,
} from './build-payload.mjs';

describe('openTitle', () => {
  it('renders project, version and personal tag', () => {
    expect(openTitle({ projectName: 'Journal', version: '1.2.0', profile: 'personal' }))
      .toBe('Journal — v1.2.0 👤 personal');
  });
  it('renders the business tag', () => {
    expect(openTitle({ projectName: 'Acme', version: '2.0.0', profile: 'business' }))
      .toBe('Acme — v2.0.0 🏢 business');
  });
});

describe('openBody', () => {
  it('renders trigger line, profile and summary bullets', () => {
    expect(openBody({ trigger: 'auto: tag v1.2.0', profile: 'personal', summary: '- feat: a' }))
      .toBe('🚀 Release triggered (auto: tag v1.2.0) · personal\nChanges:\n- feat: a');
  });
});

describe('updateLine', () => {
  it('builds an iOS build-triggered line with a url', () => {
    expect(updateLine({ platform: 'ios', event: 'build', status: 'triggered', url: 'https://x' }))
      .toBe('🔨 [iOS] EAS build triggered → https://x');
  });
  it('builds an Android build-completed line without a url', () => {
    expect(updateLine({ platform: 'android', event: 'build', status: 'completed' }))
      .toBe('✅ [Android] EAS build completed');
  });
  it('builds a build-failed line', () => {
    expect(updateLine({ platform: 'ios', event: 'build', status: 'failed', url: 'https://logs' }))
      .toBe('❌ [iOS] EAS build failed → https://logs');
  });
  it('builds the build-skipped line', () => {
    expect(updateLine({ platform: 'ios', event: 'build', status: 'skipped' }))
      .toBe('⏭️ [iOS] build skipped — submitting latest');
  });
  it('builds submit lines', () => {
    expect(updateLine({ platform: 'ios', event: 'submit', status: 'triggered' }))
      .toBe('📤 [iOS] EAS submit triggered');
    expect(updateLine({ platform: 'ios', event: 'submit', status: 'completed' }))
      .toBe('✅ [iOS] EAS submit completed');
    expect(updateLine({ platform: 'ios', event: 'submit', status: 'failed' }))
      .toBe('❌ [iOS] EAS submit failed');
  });
  it('throws on an unknown event/status pair', () => {
    expect(() => updateLine({ platform: 'ios', event: 'build', status: 'bogus' }))
      .toThrow(/Unknown event\/status/);
  });
});

describe('finalLine', () => {
  it('renders success', () => {
    expect(finalLine({ version: '1.2.0', ok: true })).toBe('🎉 Release v1.2.0 complete');
  });
  it('renders failure with stage', () => {
    expect(finalLine({ version: '1.2.0', ok: false, stage: 'build' }))
      .toBe('⚠️ Release v1.2.0 failed at build');
  });
});
