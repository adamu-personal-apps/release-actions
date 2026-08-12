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
      artifact: 'ios',
      artifactName: 'ShotStep iOS',
      version: '0.1.8',
      summary: '- feat: add a third-shot drop practice',
    })).toEqual({
      title: 'ShotStep iOS 0.1.8',
      body: [
        '🚀 Candidate build started',
        '- feat: add a third-shot drop practice',
      ].join('\n'),
    });

    expect(createOpenMessage({
      artifact: 'site',
      artifactName: 'shotstep.com',
      version: '0.1.7',
      summary: '- Make account-deletion help easier to find.',
    })).toEqual({
      title: 'shotstep.com 0.1.7',
      body: [
        '🚀 Release triggered',
        '- Make account-deletion help easier to find.',
      ].join('\n'),
    });
  });

  it('preserves quotes and newlines in outside text before transport encoding', () => {
    const message = createOpenMessage({
      artifact: 'ios',
      artifactName: 'ShotStep "Coach" iOS',
      version: '0.1.8',
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
      artifact: 'android',
      artifactName: 'ShotStep Android',
      version: '0.1.8',
      summary: '- feat: add dink reset homework',
    }));

    expect(rendered).toBe([
      'ShotStep Android 0.1.8',
      '🚀 Candidate build started',
      '- feat: add dink reset homework',
    ].join('\n'));
  });

  it('neutralizes mention-like outside text without flattening quotes or newlines', () => {
    const rendered = renderSlackOpen(createOpenMessage({
      artifact: 'site',
      artifactName: 'shotstep.com <!channel>',
      version: '0.1.8',
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
      artifact: 'ios',
      artifactName: 'ShotStep iOS',
      version: '0.1.8',
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
      artifact: 'android',
      artifactName: 'ShotStep Android',
      version: '0.1.8',
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
      artifact: 'site',
      artifactName: 'shotstep.com',
      version: '0.1.8',
      summary: '- chore: tell @everyone and @here about serve targets',
    }));

    expect(rendered).not.toContain('@everyone');
    expect(rendered).not.toContain('@here');
  });
});
