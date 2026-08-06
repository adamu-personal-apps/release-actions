import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const workflowUrl = new URL(
  "../.github/workflows/expo-release.yml",
  import.meta.url,
);
const workflow = await readFile(workflowUrl, "utf8");

const CHECKOUT_SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1";
const SETUP_NODE_SHA = "820762786026740c76f36085b0efc47a31fe5020";
const EXACT_BUILD_TOOLS_SHA =
  "f2ccebe7fc456ebf0a1dd7881dfa725f729ce3d6";

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
    ]).toHaveLength(3);
    expect(workflow).toContain(
      `ACTIONS_REF: ${EXACT_BUILD_TOOLS_SHA}`,
    );
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
    expect([...workflow.matchAll(/slack-cli\.mjs reply/g)]).toHaveLength(9);
    expect([...workflow.matchAll(/continue-on-error:\s*true/g)]).toHaveLength(
      10,
    );
    expect(workflow).toContain("needs.announce.outputs.slack_thread_ts");
  });

  it("frames supplied summaries through the collision-safe output helper", () => {
    expect(workflow).toContain(
      "node .tools/scripts/release-summary-output.mjs",
    );
    expect(workflow).not.toContain("summary<<__EOF__");
    expect(workflow).not.toContain('echo "$SUMMARY"');
    expect(workflow).toContain("git log \"$RANGE\" --pretty=format:'%s'");
  });

  it("submits the exact EAS build selected by the release job", () => {
    expect(workflow).toContain(
      "APP_CONFIG=$(npx --no-install expo config --type public --json)",
    );
    expect(workflow).toContain(
      "APP_IDENTIFIER=$(printf '%s' \"$APP_CONFIG\" | jq -er",
    );
    expect(workflow).toContain(
      "'.ios.bundleIdentifier | select(type == \"string\" and length > 0)'",
    );
    expect(workflow).toContain(
      "'.android.package | select(type == \"string\" and length > 0)'",
    );
    expect(workflow).toContain(
      "APP_VERSION=$(printf '%s' \"$APP_CONFIG\" | jq -er '.version",
    );
    expect(workflow).toContain(
      "PROJECT_ID=$(printf '%s' \"$APP_CONFIG\" | jq -er '.extra.eas.projectId",
    );
    expect(workflow).toContain("GIT_COMMIT_HASH=$(git rev-parse HEAD)");
    expect(workflow).toContain('--project-id "$PROJECT_ID"');
    expect(workflow).toContain('--git-commit-hash "$GIT_COMMIT_HASH"');
    expect(workflow).toContain(
      'SELECT_ARGS=(select --platform "$PLATFORM" --build-profile "$BUILD_PROFILE")',
    );
    expect(workflow).toContain("SELECT_ARGS+=(--skip-build)");
    expect(workflow).toContain(
      'SELECTED=$(node .tools/scripts/exact-eas-release.mjs "${SELECT_ARGS[@]}")',
    );
    expect(workflow).toContain(
      'SELECT_ARGS+=(--project-id "$PROJECT_ID" --app-version "$APP_VERSION")',
    );
    expect(workflow).toContain("BUILD_ID=$(printf '%s' \"$SELECTED\" | jq -er");
    expect(workflow).toContain('echo "id=$BUILD_ID" >> "$GITHUB_OUTPUT"');
    expect(workflow).toContain(
      "node .tools/scripts/exact-eas-release.mjs submit " +
        '--platform "$PLATFORM" --submit-profile "$SUBMIT_PROFILE" ' +
        '--build-id "$BUILD_ID"',
    );
    expect(workflow).toContain('Resolved EAS build ID: $BUILD_ID');
    expect(workflow).toContain('Resolved EAS app identifier: $APP_IDENTIFIER');
    expect(workflow).toContain('Resolved EAS app version: $APP_VERSION');
    expect(workflow).toContain('Resolved EAS build number: $APP_BUILD_VERSION');
    expect(workflow).not.toContain("--latest");
    expect(workflow.match(/npm install -g eas-cli/g)).toHaveLength(1);
  });

  it("keeps build selection and submission in one platform-scoped job", () => {
    expect(workflow).toContain("release:\n    needs: announce");
    expect(workflow).toContain("matrix:\n        platform:");
    expect(workflow).toContain("finalize:\n    needs: [announce, release]");
  });

  it("reports build-selection and submit failures at their real stages", () => {
    expect(workflow).toContain("name: Post Slack build selection failed");
    expect(workflow).toContain(
      "failure() && inputs.skip_build && steps.select_build.outcome == 'failure'",
    );
    expect(workflow).toContain(
      "failure() && steps.submit.outcome == 'failure'",
    );
  });

  it("reports the real release result after the best-effort Slack final reply", () => {
    const slackFinal = workflow.indexOf("name: Post Slack final status");
    const releaseResult = workflow.indexOf("name: Report failed release");

    expect(slackFinal).toBeGreaterThan(0);
    expect(releaseResult).toBeGreaterThan(slackFinal);
    expect(workflow.slice(releaseResult)).toContain("exit 1");
  });
});
