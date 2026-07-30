import { describe, expect, it, vi } from "vitest";
import { runSlackCommand } from "./slack-cli.mjs";

const baseEnv = {
  SLACK_BOT_TOKEN: "xoxb-test-only-secret",
  SLACK_CHANNEL_ID: "C_RELEASES",
  SLACK_TEXT: "ShotStep v0.1.8",
  GITHUB_OUTPUT: "/tmp/github-output",
  GITHUB_STEP_SUMMARY: "/tmp/github-summary",
};

function slackResponse(value, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn().mockResolvedValue(JSON.stringify(value)),
  };
}

describe("runSlackCommand", () => {
  it("records the root timestamp without printing the token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      slackResponse({
        ok: true,
        channel: "C_RELEASES",
        ts: "1750000000.000100",
      }),
    );
    const appendFile = vi.fn().mockResolvedValue();
    const writeOutput = vi.fn();

    const result = await runSlackCommand({
      command: "open",
      env: baseEnv,
      fetchImpl,
      appendFile,
      writeOutput,
    });

    expect(result.ok).toBe(true);
    expect(appendFile).toHaveBeenCalledWith(
      "/tmp/github-output",
      "thread_ts=1750000000.000100\n",
      "utf8",
    );
    expect(writeOutput).not.toHaveBeenCalled();
    expect(JSON.stringify(appendFile.mock.calls)).not.toContain(
      baseEnv.SLACK_BOT_TOKEN,
    );
  });

  it("turns Slack failures into a GitHub warning and step summary without failing", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      slackResponse({
        ok: false,
        error: "channel_not_found",
      }),
    );
    const appendFile = vi.fn().mockResolvedValue();
    const writeOutput = vi.fn();

    const result = await runSlackCommand({
      command: "open",
      env: baseEnv,
      fetchImpl,
      appendFile,
      writeOutput,
    });

    expect(result).toEqual({
      ok: false,
      warning: {
        code: "slack_api_error",
        message: "Slack chat.postMessage failed: channel_not_found.",
      },
    });
    expect(writeOutput).toHaveBeenCalledWith(
      "::warning title=Slack release notification::" +
        "Slack notification failed (slack_api_error); EAS continues. " +
        "See the step summary.\n",
    );
    expect(appendFile).toHaveBeenCalledWith(
      "/tmp/github-summary",
      [
        "### Slack release notification warning",
        "",
        "Slack chat.postMessage failed: channel_not_found.",
        "",
      ].join("\n"),
      "utf8",
    );
    expect(
      JSON.stringify({
        calls: appendFile.mock.calls,
        output: writeOutput.mock.calls,
      }),
    ).not.toContain(baseEnv.SLACK_BOT_TOKEN);
  });

  it("skips replies safely when the root post did not return a timestamp", async () => {
    const fetchImpl = vi.fn();
    const appendFile = vi.fn().mockResolvedValue();
    const writeOutput = vi.fn();

    const result = await runSlackCommand({
      command: "reply",
      env: { ...baseEnv, SLACK_THREAD_TS: "" },
      fetchImpl,
      appendFile,
      writeOutput,
    });

    expect(result.warning.code).toBe("missing_thread_ts");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(writeOutput).toHaveBeenCalledOnce();
  });
});
