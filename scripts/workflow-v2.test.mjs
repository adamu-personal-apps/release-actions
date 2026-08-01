import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const workflowUrl = new URL(
  "../.github/workflows/expo-release.yml",
  import.meta.url,
);
const workflow = await readFile(workflowUrl, "utf8");

const CHECKOUT_SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1";
const SETUP_NODE_SHA = "820762786026740c76f36085b0efc47a31fe5020";

function actionRefs(action) {
  return [
    ...workflow.matchAll(new RegExp(`uses: ${action}@([^\\s]+)`, "g")),
  ].map((match) => match[1]);
}

describe("shared v3 workflow contract", () => {
  it("pins every official action to the reviewed Node 24 release", () => {
    expect(actionRefs("actions/checkout")).not.toHaveLength(0);
    expect(new Set(actionRefs("actions/checkout"))).toEqual(
      new Set([CHECKOUT_SHA]),
    );
    expect(actionRefs("actions/setup-node")).not.toHaveLength(0);
    expect(new Set(actionRefs("actions/setup-node"))).toEqual(
      new Set([SETUP_NODE_SHA]),
    );
    expect(workflow).toContain(`# checkout v7`);
    expect(workflow).toContain(`# setup-node v7`);
  });

  it("uses Node 24 throughout and checks out the v3 tools contract", () => {
    expect(workflow).not.toContain("node_version:");
    expect(workflow).not.toContain("inputs.node_version");
    expect(workflow).not.toMatch(/node-version:\s*(?:20|22|lts)/);
    expect([
      ...workflow.matchAll(/node-version:\s*["']?24["']?/g),
    ]).toHaveLength(4);
    expect(workflow).toContain("ACTIONS_REF: v3.0.0");
  });

  it("declares only the optional Slack publisher contract", () => {
    expect(workflow).toContain("slack_channel_id:");
    expect(workflow).toContain("SLACK_BOT_TOKEN:");
    expect(workflow).toMatch(/SLACK_BOT_TOKEN:\s*\{\s*required:\s*false\s*\}/);
    expect(workflow).toContain("slack_thread_ts:");
    expect(workflow).not.toMatch(/discord/i);
  });

  it("publishes one Slack root plus every lifecycle reply as best effort", () => {
    expect([...workflow.matchAll(/slack-cli\.mjs open/g)]).toHaveLength(1);
    expect([...workflow.matchAll(/slack-cli\.mjs reply/g)]).toHaveLength(8);
    expect([...workflow.matchAll(/continue-on-error:\s*true/g)]).toHaveLength(
      9,
    );
    expect(workflow).toContain("needs.announce.outputs.slack_thread_ts");
  });

  it("keeps the EAS build and submit commands unchanged", () => {
    expect(workflow).toContain(
      'eas build --platform "$PLATFORM" --profile "$BUILD_PROFILE" ' +
        "--non-interactive --wait --json",
    );
    expect(workflow).toContain(
      'eas submit --platform "$PLATFORM" --profile "$SUBMIT_PROFILE" ' +
        "--latest --non-interactive",
    );
    expect(workflow.match(/npm install -g eas-cli/g)).toHaveLength(2);
  });

  it("reports the real release result after the best-effort Slack final reply", () => {
    const slackFinal = workflow.indexOf("name: Post Slack final status");
    const releaseResult = workflow.indexOf("name: Report failed release");

    expect(slackFinal).toBeGreaterThan(0);
    expect(releaseResult).toBeGreaterThan(slackFinal);
    expect(workflow.slice(releaseResult)).toContain("exit 1");
  });
});
