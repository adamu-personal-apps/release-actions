import { describe, expect, it, vi } from "vitest";

import { runDiscordCommand } from "./discord-cli.mjs";

const baseEnv = {
  DISCORD_TEXT: "ShotStep v0.1.9",
  DISCORD_THREAD_ID: "thread-123",
  DISCORD_WEBHOOK_URL: "https://discord.example/webhooks/release-secret",
  GITHUB_OUTPUT: "/tmp/github-output",
  GITHUB_STEP_SUMMARY: "/tmp/github-summary",
};

describe("Discord release CLI", () => {
  it("records a root thread ID without writing the webhook", async () => {
    const appendFile = vi.fn().mockResolvedValue(undefined);
    const writeOutput = vi.fn();
    const result = await runDiscordCommand({
      appendFile,
      command: "open",
      env: baseEnv,
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue('{"channel_id":"thread-456"}'),
      }),
      writeOutput,
    });

    expect(result).toEqual({ ok: true, threadId: "thread-456" });
    expect(appendFile).toHaveBeenCalledWith(
      baseEnv.GITHUB_OUTPUT,
      "thread_id=thread-456\n",
      "utf8",
    );
    expect(JSON.stringify(appendFile.mock.calls)).not.toContain(
      baseEnv.DISCORD_WEBHOOK_URL,
    );
    expect(writeOutput).not.toHaveBeenCalled();
  });

  it("turns an unavailable Discord publisher into a visible warning", async () => {
    const appendFile = vi.fn().mockResolvedValue(undefined);
    const writeOutput = vi.fn();
    const result = await runDiscordCommand({
      appendFile,
      command: "reply",
      env: { ...baseEnv, DISCORD_THREAD_ID: "" },
      fetchImpl: vi.fn(),
      writeOutput,
    });

    expect(result).toMatchObject({
      ok: false,
      warning: { code: "missing_thread_id" },
    });
    expect(writeOutput).toHaveBeenCalledWith(
      expect.stringContaining("Discord release notification"),
    );
    expect(JSON.stringify(writeOutput.mock.calls)).not.toContain(
      baseEnv.DISCORD_WEBHOOK_URL,
    );
  });
});
