import { appendFile as appendFileToDisk } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { openDiscordThread, postDiscordReply } from "./discord-publisher.mjs";

function localWarning(code, message) {
  return { ok: false, warning: { code, message } };
}

async function reportWarning({ appendFile, env, result, writeOutput }) {
  writeOutput(
    "::warning title=Discord release notification::" +
      `Discord notification failed (${result.warning.code}): ` +
      `${result.warning.message} Release delivery continues. ` +
      "See the step summary.\n",
  );

  if (!env.GITHUB_STEP_SUMMARY) {
    return;
  }
  try {
    await appendFile(
      env.GITHUB_STEP_SUMMARY,
      [
        "### Discord release notification warning",
        "",
        result.warning.message,
        "",
      ].join("\n"),
      "utf8",
    );
  } catch {
    writeOutput(
      "::warning title=Discord release notification::" +
        "The Discord warning could not be added to the step summary; release delivery continues.\n",
    );
  }
}

export async function runDiscordCommand({
  appendFile = appendFileToDisk,
  command,
  env = process.env,
  fetchImpl = globalThis.fetch,
  writeOutput = (value) => process.stdout.write(value),
}) {
  let result;
  try {
    if (command === "open") {
      result = await openDiscordThread({
        content: env.DISCORD_TEXT,
        fetchImpl,
        threadName: env.DISCORD_THREAD_NAME,
        webhook: env.DISCORD_WEBHOOK_URL,
      });
    } else if (command === "reply") {
      result = await postDiscordReply({
        content: env.DISCORD_TEXT,
        fetchImpl,
        threadId: env.DISCORD_THREAD_ID,
        webhook: env.DISCORD_WEBHOOK_URL,
      });
    } else {
      result = localWarning(
        "invalid_command",
        "Discord publishing skipped because the command is invalid.",
      );
    }
  } catch {
    result = localWarning(
      "unexpected_error",
      "Discord publishing hit an unexpected internal error.",
    );
  }

  if (result.ok && command === "open" && env.GITHUB_OUTPUT) {
    try {
      await appendFile(
        env.GITHUB_OUTPUT,
        `thread_id=${result.threadId}\n`,
        "utf8",
      );
    } catch {
      result = localWarning(
        "github_output_error",
        "Discord opened the root thread, but its thread ID could not be recorded.",
      );
    }
  }

  if (!result.ok) {
    await reportWarning({ appendFile, env, result, writeOutput });
  }
  return result;
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  await runDiscordCommand({ command: process.argv[2] });
}
