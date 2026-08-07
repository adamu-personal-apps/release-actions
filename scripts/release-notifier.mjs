#!/usr/bin/env node

import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { runDiscordCommand } from "./discord-cli.mjs";
import { payloadFor } from "./payload-cli.mjs";
import { runSlackCommand } from "./slack-cli.mjs";

function payloadKindFor(command, publisher) {
  if (!['slack', 'discord'].includes(publisher)) {
    throw new Error(`Unsupported notification publisher: ${publisher}`);
  }
  if (command === 'open') return `${publisher}-open`;
  if (command === 'reply') return `${publisher}-update`;
  if (command === 'final') return `${publisher}-final`;
  throw new Error(`Unsupported release notification command: ${command}`);
}

export async function runReleaseNotification({
  command,
  env = process.env,
  runDiscord = runDiscordCommand,
  runSlack = runSlackCommand,
}) {
  const publisher = env.NOTIFICATION_PUBLISHER;
  const payloadKind = payloadKindFor(command, publisher);
  const text = payloadFor(payloadKind, env);
  const transportCommand = command === 'open' ? 'open' : 'reply';

  if (publisher === 'slack') {
    return runSlack({
      command: transportCommand,
      env: { ...env, SLACK_TEXT: text },
    });
  }

  return runDiscord({
    command: transportCommand,
    env: {
      ...env,
      DISCORD_TEXT: text,
      DISCORD_THREAD_NAME:
        command === 'open' ? payloadFor('discord-thread-name', env) : undefined,
    },
  });
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  try {
    await runReleaseNotification({ command: process.argv[2] });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
