// Backward-compatible Discord helpers for the v1 workflow.
// Shared content and destination limits live in release-messages.mjs.
import {
  createFinalMessage,
  createOpenMessage,
  createUpdateMessage,
  renderDiscordOpen,
  renderDiscordReply,
} from './release-messages.mjs';

/** Forum post title: "<project> — v<version> <emoji> <profile>". */
export function openTitle({ projectName, version, profile }) {
  return renderDiscordOpen(createOpenMessage({
    projectName,
    version,
    profile,
    trigger: '',
    summary: '',
  })).title;
}

/** Forum post body: trigger line + change bullets, clamped to Discord's limit. */
export function openBody({ trigger, profile, summary }) {
  return renderDiscordOpen(createOpenMessage({
    projectName: '',
    version: '',
    profile,
    trigger,
    summary,
  })).body;
}

/**
 * One thread update line.
 * @param {{platform:string,event:string,status:string,url?:string}} p
 */
export function updateLine(input) {
  return renderDiscordReply(createUpdateMessage(input));
}

/** Final status line for the finalize job. */
export function finalLine(input) {
  return renderDiscordReply(createFinalMessage(input));
}
