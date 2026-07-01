// Pure text formatting for Discord messages. Returns strings only;
// safe JSON encoding is done by jq in discord.sh.

const PROFILE_TAG = { business: '🏢', personal: '👤' };

/** Forum post title: "<project> — v<version> <emoji> <profile>". */
export function openTitle({ projectName, version, profile }) {
  const tag = PROFILE_TAG[profile] ?? '';
  return `${projectName} — v${version} ${tag} ${profile}`.replace(/\s+/g, ' ').trim();
}

/** Forum post body: trigger line + change bullets. */
export function openBody({ trigger, profile, summary }) {
  return `🚀 Release triggered (${trigger}) · ${profile}\nChanges:\n${summary}`;
}

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

/**
 * One thread update line.
 * @param {{platform:string,event:string,status:string,url?:string}} p
 */
export function updateLine({ platform, event, status, url }) {
  const key = `${event}:${status}`;
  const emoji = EVENT_EMOJI[key];
  const text = EVENT_TEXT[key];
  if (!emoji || !text) throw new Error(`Unknown event/status: ${key}`);
  const label = `[${platform === 'ios' ? 'iOS' : 'Android'}]`;
  const base = `${emoji} ${label} ${text}`;
  return url ? `${base} → ${url}` : base;
}

/** Final status line for the finalize job. */
export function finalLine({ version, ok, stage }) {
  return ok
    ? `🎉 Release v${version} complete`
    : `⚠️ Release v${version} failed at ${stage}`;
}
