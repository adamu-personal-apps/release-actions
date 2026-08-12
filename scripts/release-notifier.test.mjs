import { describe, expect, it, vi } from "vitest";

import { runReleaseNotification } from "./release-notifier.mjs";

const baseEnv = {
  NOTIFICATION_PUBLISHER: "slack",
  PROJECT_NAME: "ShotStep",
  ARTIFACT: "ios",
  ARTIFACT_NAME: "ShotStep iOS",
  VERSION: "0.1.8",
  PROFILE: "business",
  TRIGGER: "manual",
  SUMMARY: "- feat: add a third-shot drop practice",
  PLATFORM: "ios",
  EVENT: "build",
  STATUS: "completed",
  OK: "true",
  STAGE: "",
};

describe("runReleaseNotification", () => {
  it("opens a Slack root when the manifest owner is the business owner", async () => {
    const runSlack = vi.fn(async () => ({ ok: true }));
    const runDiscord = vi.fn();

    await runReleaseNotification({
      command: "open",
      env: baseEnv,
      runDiscord,
      runSlack,
    });

    expect(runSlack).toHaveBeenCalledWith(expect.objectContaining({
      command: "open",
      env: expect.objectContaining({
        SLACK_TEXT: expect.stringContaining("ShotStep iOS 0.1.8"),
      }),
    }));
    expect(runDiscord).not.toHaveBeenCalled();
  });

  it("opens a Discord thread for a personal manifest owner", async () => {
    const runSlack = vi.fn();
    const runDiscord = vi.fn(async () => ({ ok: true }));

    await runReleaseNotification({
      command: "open",
      env: { ...baseEnv, NOTIFICATION_PUBLISHER: "discord", PROFILE: "personal" },
      runDiscord,
      runSlack,
    });

    expect(runDiscord).toHaveBeenCalledWith(expect.objectContaining({
      command: "open",
      env: expect.objectContaining({
        DISCORD_TEXT: expect.stringContaining("ShotStep iOS 0.1.8"),
        DISCORD_THREAD_NAME: "ShotStep iOS 0.1.8",
      }),
    }));
    expect(runSlack).not.toHaveBeenCalled();
  });

  it("uses the selected publisher for lifecycle replies and rejects unknown routing", async () => {
    const runSlack = vi.fn(async () => ({ ok: true }));
    const runDiscord = vi.fn(async () => ({ ok: true }));

    await runReleaseNotification({
      command: "reply",
      env: { ...baseEnv, NOTIFICATION_PUBLISHER: "discord", DISCORD_THREAD_ID: "123" },
      runDiscord,
      runSlack,
    });
    expect(runDiscord).toHaveBeenCalledWith(expect.objectContaining({
      command: "reply",
      env: expect.objectContaining({
        DISCORD_TEXT: "✅ [iOS] EAS build completed",
      }),
    }));
    expect(runSlack).not.toHaveBeenCalled();

    await expect(runReleaseNotification({
      command: "reply",
      env: { ...baseEnv, NOTIFICATION_PUBLISHER: "pager" },
      runDiscord,
      runSlack,
    })).rejects.toThrow("Unsupported notification publisher");
  });
});
