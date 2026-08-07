import { describe, expect, it } from 'vitest';
import {
  createFinalMessage,
  createOpenMessage,
  createUpdateMessage,
  renderDiscordOpen,
  renderDiscordReply,
  renderSlackOpen,
  renderSlackReply,
} from './release-messages.mjs';

describe('release message content', () => {
  it('builds one recognizable release announcement for every destination', () => {
    expect(createOpenMessage({
      projectName: 'ShotStep',
      version: '0.1.8',
      profile: 'personal',
      trigger: 'auto: tag v0.1.8',
      summary: '- feat: add a third-shot drop practice',
    })).toEqual({
      title: 'ShotStep — v0.1.8 👤 personal',
      body: [
        '🚀 Release triggered (auto: tag v0.1.8) · personal',
        'Changes:',
        '- feat: add a third-shot drop practice',
      ].join('\n'),
    });
  });

  it('preserves quotes and newlines in outside text before transport encoding', () => {
    const message = createOpenMessage({
      projectName: 'ShotStep "Coach"',
      version: '0.1.8',
      profile: 'personal',
      trigger: 'manual',
      summary: '- fix: keep "kitchen" notes\n- feat: add serve targets',
    });

    expect(message.title).toContain('"Coach"');
    expect(message.body).toContain('"kitchen" notes\n- feat: add serve targets');
  });

  it('builds lifecycle updates and final states', () => {
    expect(createUpdateMessage({
      platform: 'ios',
      event: 'build',
      status: 'completed',
      url: 'https://expo.dev/builds/shotstep',
    })).toBe('✅ [iOS] EAS build completed → https://expo.dev/builds/shotstep');
    expect(createUpdateMessage({
      platform: 'ios',
      event: 'selection',
      status: 'failed',
    })).toBe('❌ [iOS] EAS build selection failed');
    expect(createUpdateMessage({
      platform: 'android',
      event: 'build',
      status: 'skipped',
    })).toBe('⏭️ [Android] build skipped — submitting selected build ID');
    expect(createUpdateMessage({
      platform: 'site',
      event: 'proof',
      status: 'completed',
    })).toBe('✅ [Website] hosted routing proof completed; no release artifact was delivered');
    expect(createFinalMessage({ version: '0.1.8', ok: true }))
      .toBe('🎉 Release v0.1.8 complete');
    expect(createFinalMessage({ version: '0.1.8', ok: false, stage: 'submit' }))
      .toBe('⚠️ Release v0.1.8 failed at submit');
  });
});

describe('Slack rendering', () => {
  it('uses one root message with the shared title and body', () => {
    const rendered = renderSlackOpen(createOpenMessage({
      projectName: 'ShotStep',
      version: '0.1.8',
      profile: 'business',
      trigger: 'manual',
      summary: '- feat: add dink reset homework',
    }));

    expect(rendered).toBe([
      'ShotStep — v0.1.8 🏢 business',
      '🚀 Release triggered (manual) · business',
      'Changes:',
      '- feat: add dink reset homework',
    ].join('\n'));
  });

  it('neutralizes mention-like outside text without flattening quotes or newlines', () => {
    const rendered = renderSlackOpen(createOpenMessage({
      projectName: 'ShotStep <!channel>',
      version: '0.1.8',
      profile: 'personal',
      trigger: 'manual',
      summary: [
        '- fix: keep "kitchen" notes for @channel',
        '- feat: coach <@U12345> on resets',
        '- docs: notify @here & @everyone',
      ].join('\n'),
    }));

    expect(rendered).not.toContain('<!channel>');
    expect(rendered).not.toContain('<@U12345>');
    expect(rendered).not.toContain('@channel');
    expect(rendered).not.toContain('@here');
    expect(rendered).not.toContain('@everyone');
    expect(rendered).toContain('"kitchen" notes');
    expect(rendered).toContain('\n- feat: coach');
  });

  it('keeps roots and replies inside Slack recommended text limits', () => {
    const rendered = renderSlackOpen(createOpenMessage({
      projectName: 'ShotStep',
      version: '0.1.8',
      profile: 'personal',
      trigger: 'manual',
      summary: `- ${'serve return '.repeat(500)}`,
    }));
    const reply = renderSlackReply(`✅ ${'cross-court dink '.repeat(500)}`);

    expect(rendered.length).toBeLessThanOrEqual(4000);
    expect(rendered.endsWith('…')).toBe(true);
    expect(reply.length).toBeLessThanOrEqual(4000);
    expect(reply.endsWith('…')).toBe(true);
  });
});

describe('Discord rendering', () => {
  it('keeps the shared release content inside Discord message limits', () => {
    const rendered = renderDiscordOpen(createOpenMessage({
      projectName: 'ShotStep',
      version: '0.1.8',
      profile: 'personal',
      trigger: 'manual',
      summary: `- ${'third-shot drop '.repeat(300)}`,
    }));
    const reply = renderDiscordReply(`✅ ${'cross-court dink '.repeat(300)}`);

    expect(rendered.length).toBeLessThanOrEqual(2000);
    expect(rendered.endsWith('…')).toBe(true);
    expect(reply.length).toBeLessThanOrEqual(2000);
    expect(reply.endsWith('…')).toBe(true);
  });

  it('makes @everyone and @here visibly inert before the webhook blocks mentions', () => {
    const rendered = renderDiscordOpen(createOpenMessage({
      projectName: 'ShotStep',
      version: '0.1.8',
      profile: 'personal',
      trigger: 'manual',
      summary: '- chore: tell @everyone and @here about serve targets',
    }));

    expect(rendered).not.toContain('@everyone');
    expect(rendered).not.toContain('@here');
  });
});
