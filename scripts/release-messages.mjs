// Release lifecycle content and destination-safe text rendering.
// This module is deliberately pure: transports own JSON and network I/O.

const SLACK_TEXT_LIMIT = 4000;
const DISCORD_TEXT_LIMIT = 2000;

const EVENT_EMOJI = {
  'build:triggered': '🔨',
  'build:completed': '✅',
  'build:failed': '❌',
  'build:skipped': '⏭️',
  'selection:failed': '❌',
  'submit:triggered': '📤',
  'submit:completed': '✅',
  'submit:failed': '❌',
  'deploy:triggered': '🚀',
  'deploy:completed': '✅',
  'deploy:failed': '❌',
  'proof:completed': '✅',
};

const EVENT_TEXT = {
  'build:triggered': 'EAS build triggered',
  'build:completed': 'EAS build completed',
  'build:failed': 'EAS build failed',
  'build:skipped': 'build skipped — submitting selected build ID',
  'selection:failed': 'EAS build selection failed',
  'submit:triggered': 'EAS submit triggered',
  'submit:completed': 'EAS submit completed',
  'submit:failed': 'EAS submit failed',
  'deploy:triggered': 'Cloudflare Pages deployment triggered',
  'deploy:completed': 'Cloudflare Pages deployment completed',
  'deploy:failed': 'Cloudflare Pages deployment failed',
  'proof:completed': 'hosted routing proof completed; no release artifact was delivered',
};

function truncate(text, limit) {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1)}…`;
}

function slackSafeText(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replace(/@(channel|here|everyone)\b/giu, '@\u200b$1');
}

function discordSafeText(text) {
  return text.replace(/@(channel|here|everyone)\b/giu, '@\u200b$1');
}

export function createOpenMessage({ artifact, artifactName, version, summary }) {
  const title = `${artifactName} ${version}`.replace(/\s+/g, ' ').trim();
  const lifecycle = artifact === 'ios' || artifact === 'android'
    ? '🚀 Candidate build started'
    : '🚀 Release triggered';

  return {
    title,
    body: `${lifecycle}\n${summary}`,
  };
}

export function createUpdateMessage({ platform, event, status, url }) {
  const key = `${event}:${status}`;
  const emoji = EVENT_EMOJI[key];
  const text = EVENT_TEXT[key];
  if (!emoji || !text) throw new Error(`Unknown event/status: ${key}`);
  const label = `[${platform === 'ios' ? 'iOS' : platform === 'android' ? 'Android' : 'Website'}]`;
  const base = `${emoji} ${label} ${text}`;
  return url ? `${base} → ${url}` : base;
}

export function createFinalMessage({ artifactName, version, ok, stage }) {
  const identity = artifactName ? `${artifactName} ${version}` : `Release v${version}`;
  return ok
    ? `🎉 ${identity} complete`
    : `⚠️ ${identity} failed at ${stage}`;
}

export function renderSlackOpen(message) {
  return truncate(
    slackSafeText(`${message.title}\n${message.body}`),
    SLACK_TEXT_LIMIT,
  );
}

export function renderSlackReply(message) {
  return truncate(slackSafeText(message), SLACK_TEXT_LIMIT);
}

export function renderDiscordOpen(message) {
  return truncate(
    discordSafeText(`${message.title}\n${message.body}`),
    DISCORD_TEXT_LIMIT,
  );
}

export function renderDiscordReply(message) {
  return truncate(discordSafeText(message), DISCORD_TEXT_LIMIT);
}
