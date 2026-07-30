import { appendFile as appendFileToDisk } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { openSlackThread, postSlackReply } from "./slack-publisher.mjs";

function localWarning(code, message) {
  return { ok: false, warning: { code, message } };
}

async function reportWarning({ result, env, appendFile, writeOutput }) {
  writeOutput(
    "::warning title=Slack release notification::" +
      `Slack notification failed (${result.warning.code}): ` +
      `${result.warning.message} EAS continues. ` +
      "See the step summary.\n",
  );

  if (!env.GITHUB_STEP_SUMMARY) return;
  try {
    await appendFile(
      env.GITHUB_STEP_SUMMARY,
      [
        "### Slack release notification warning",
        "",
        result.warning.message,
        "",
      ].join("\n"),
      "utf8",
    );
  } catch {
    writeOutput(
      "::warning title=Slack release notification::" +
        "The Slack warning could not be added to the step summary; EAS continues.\n",
    );
  }
}

export async function runSlackCommand({
  command,
  env = process.env,
  fetchImpl = globalThis.fetch,
  appendFile = appendFileToDisk,
  writeOutput = (value) => process.stdout.write(value),
}) {
  const options = {
    token: env.SLACK_BOT_TOKEN,
    channel: env.SLACK_CHANNEL_ID,
    text: env.SLACK_TEXT,
    endpoint: env.SLACK_API_URL || undefined,
    fetchImpl,
  };

  let result;
  try {
    if (command === "open") {
      result = await openSlackThread(options);
    } else if (command === "reply") {
      result = await postSlackReply({
        ...options,
        threadTs: env.SLACK_THREAD_TS,
      });
    } else {
      result = localWarning(
        "invalid_command",
        `Slack publishing skipped because the command is invalid: ${command}.`,
      );
    }
  } catch {
    result = localWarning(
      "unexpected_error",
      "Slack publishing hit an unexpected internal error.",
    );
  }

  if (result.ok && command === "open" && env.GITHUB_OUTPUT) {
    try {
      await appendFile(
        env.GITHUB_OUTPUT,
        `thread_ts=${result.threadTs}\n`,
        "utf8",
      );
    } catch {
      result = localWarning(
        "github_output_error",
        "Slack opened the root message, but its thread timestamp could not be recorded.",
      );
    }
  }

  if (!result.ok) {
    await reportWarning({ result, env, appendFile, writeOutput });
  }

  return result;
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  await runSlackCommand({ command: process.argv[2] });
}
