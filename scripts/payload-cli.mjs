// Usage: node payload-cli.mjs <kind>
// Params come from env vars.
// Prints the resulting text (no trailing newline) to stdout.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  createFinalMessage,
  createOpenMessage,
  createUpdateMessage,
  renderDiscordOpen,
  renderDiscordReply,
  renderSlackOpen,
  renderSlackReply,
} from "./release-messages.mjs";

function openInput(env) {
  return {
    projectName: env.PROJECT_NAME,
    version: env.VERSION,
    profile: env.PROFILE,
    trigger: env.TRIGGER,
    summary: env.SUMMARY,
  };
}

function updateInput(env) {
  return {
    platform: env.PLATFORM,
    event: env.EVENT,
    status: env.STATUS,
    url: env.URL ? env.URL : undefined,
  };
}

function finalInput(env) {
  return {
    version: env.VERSION,
    ok: env.OK === "true",
    stage: env.STAGE,
  };
}

export function payloadFor(kind, env) {
  switch (kind) {
    case "slack-open":
      return renderSlackOpen(createOpenMessage(openInput(env)));
    case "slack-update":
      return renderSlackReply(createUpdateMessage(updateInput(env)));
    case "slack-final":
      return renderSlackReply(createFinalMessage(finalInput(env)));
    case "discord-open":
      return renderDiscordOpen(createOpenMessage(openInput(env)));
    case "discord-thread-name":
      return createOpenMessage(openInput(env)).title.slice(0, 100);
    case "discord-update":
      return renderDiscordReply(createUpdateMessage(updateInput(env)));
    case "discord-final":
      return renderDiscordReply(createFinalMessage(finalInput(env)));
    default:
      throw new Error(`Unknown kind: ${kind}`);
  }
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  try {
    process.stdout.write(payloadFor(process.argv[2], process.env));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
