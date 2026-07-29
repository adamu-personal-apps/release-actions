// Release lifecycle content and destination-safe text rendering.
// This module is deliberately pure: transports own JSON and network I/O.

const PROFILE_TAG = { business: '🏢', personal: '👤' };

const DISCORD_TITLE_LIMIT = 100;
const DISCORD_CONTENT_LIMIT = 2000;
const SLACK_TEXT_LIMIT = 4000;

const EVENT_EMOJI = {
  'build:triggered': '🔨',
  'build:completed': '✅',
  'build:failed': '❌',
  'build:skipped': '⏭️',
  'submit:triggered': '📤',
  'submit:completed': '✅',
  'submit:failed': '❌',
};

const EVENT_TEXT = {
  'build:triggered': 'EAS build triggered',
  'build:completed': 'EAS build completed',
  'build:failed': 'EAS build failed',
  'build:skipped': 'build skipped — submitting latest',
  'submit:triggered': 'EAS submit triggered',
  'submit:completed': 'EAS submit completed',
  'submit:failed': 'EAS submit failed',
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

export function createOpenMessage({ projectName, version, profile, trigger, summary }) {
  const tag = PROFILE_TAG[profile] ?? '';
  const title = `${projectName} — v${version} ${tag} ${profile}`
    .replace(/\s+/g, ' ')
    .trim();

  return {
    title,
    body: `🚀 Release triggered (${trigger}) · ${profile}\nChanges:\n${summary}`,
  };
}

export function createUpdateMessage({ platform, event, status, url }) {
  const key = `${event}:${status}`;
  const emoji = EVENT_EMOJI[key];
  const text = EVENT_TEXT[key];
  if (!emoji || !text) throw new Error(`Unknown event/status: ${key}`);
  const label = `[${platform === 'ios' ? 'iOS' : 'Android'}]`;
  const base = `${emoji} ${label} ${text}`;
  return url ? `${base} → ${url}` : base;
}

export function createFinalMessage({ version, ok, stage }) {
  return ok
    ? `🎉 Release v${version} complete`
    : `⚠️ Release v${version} failed at ${stage}`;
}

export function renderDiscordOpen(message) {
  return {
    title: truncate(message.title, DISCORD_TITLE_LIMIT),
    body: truncate(message.body, DISCORD_CONTENT_LIMIT),
  };
}

export function renderDiscordReply(message) {
  return truncate(message, DISCORD_CONTENT_LIMIT);
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
