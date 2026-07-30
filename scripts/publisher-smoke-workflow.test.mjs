import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const workflowUrl = new URL(
  "../.github/workflows/publisher-smoke.yml",
  import.meta.url,
);
const workflow = await readFile(workflowUrl, "utf8");

const CHECKOUT_SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1";
const SETUP_NODE_SHA = "820762786026740c76f36085b0efc47a31fe5020";

describe("hosted publisher smoke workflow", () => {
  it("is manual, read-only to GitHub, and records the exact candidate commit", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("github.sha");
    expect(workflow).toContain("candidate_commit=");
  });

  it("runs the checked-out candidate on Node 24", () => {
    expect(workflow).toContain(`actions/checkout@${CHECKOUT_SHA}`);
    expect(workflow).toContain(`actions/setup-node@${SETUP_NODE_SHA}`);
    expect(workflow).toMatch(/node-version:\s*["']?24["']?/);
    expect(workflow).toContain("node --version");
  });

  it("publishes a realistic proof lifecycle to Discord and one Slack thread", () => {
    expect(workflow).toContain("third-shot drop");
    expect(workflow.match(/discord\.sh open/g)).toHaveLength(1);
    expect(workflow.match(/discord\.sh post/g)).toHaveLength(5);
    expect(workflow.match(/slack-cli\.mjs open/g)).toHaveLength(2);
    expect(workflow.match(/slack-cli\.mjs reply/g)).toHaveLength(5);
    expect(workflow).toContain("SLACK_THREAD_TS:");
  });

  it("uses repository configuration without exposing credentials", () => {
    expect(workflow).toContain("secrets.DISCORD_WEBHOOK_URL");
    expect(workflow).toContain("secrets.SLACK_BOT_TOKEN");
    expect(workflow).toContain("vars.RELEASE_SLACK_CHANNEL_ID");
    expect(workflow).not.toMatch(/xox[baprs]-/);
    expect(workflow).not.toMatch(/discord(?:app)?\.com\/api\/webhooks\//);
  });

  it("proves Slack failure is a warning while the hosted proof stays truthful", () => {
    expect(workflow).toContain("invalid-proof-channel");
    expect(workflow).toContain("Confirm Slack warning did not fail the proof");
    expect(workflow).toContain("No EAS build or submission was started.");
  });

  it("cannot invoke EAS", () => {
    expect(workflow).not.toMatch(/\beas build\s+--/i);
    expect(workflow).not.toMatch(/\beas submit\s+--/i);
    expect(workflow).not.toMatch(/\beas-cli\b/i);
    expect(workflow).not.toContain("EXPO_TOKEN");
    expect(workflow).not.toMatch(/npm install|pnpm install|yarn install/);
  });
});
