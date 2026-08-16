import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const workflowUrl = new URL(
  "../.github/workflows/expo-release.yml",
  import.meta.url,
);
const workflow = await readFile(workflowUrl, "utf8");

const CHECKOUT_SHA = "3d3c42e5aac5ba805825da76410c181273ba90b1";
const SETUP_NODE_SHA = "820762786026740c76f36085b0efc47a31fe5020";
const ROUTING_TOOLS_SHA = "b0f4831e80107ce8e3b469a818cb412d60c097c8";

function actionRefs(action) {
  return [
    ...workflow.matchAll(new RegExp(`uses: ${action}@([^\\s]+)`, "g")),
  ].map((match) => match[1]);
}

describe("shared artifact-aware release workflow contract", () => {
  it("pins every official action and the compatible artifact-routing tools", () => {
    expect(new Set(actionRefs("actions/checkout"))).toEqual(
      new Set([CHECKOUT_SHA]),
    );
    expect(new Set(actionRefs("actions/setup-node"))).toEqual(
      new Set([SETUP_NODE_SHA]),
    );
    expect(workflow).toContain(`# checkout v7`);
    expect(workflow).toContain(`# setup-node v7`);
    expect(workflow).toContain(`ACTIONS_REF: ${ROUTING_TOOLS_SHA}`);
    expect(workflow).not.toMatch(/node-version:\s*(?:20|22|lts)/);
  });

  it("accepts one canonical artifact set while retaining the legacy mobile input", () => {
    expect(workflow).toContain("artifacts: { type: string, required: false }");
    expect(workflow).toContain("platform: { type: string, default: ios }");
    expect(workflow).toContain("business_owner: { type: string, required: false }");
    expect(workflow).toContain("release-artifact-routing.mjs");
    expect(workflow).toContain("INPUT_ARTIFACTS: ${{ inputs.artifacts }}");
    expect(workflow).toContain("INPUT_BUSINESS_OWNER: ${{ inputs.business_owner }}");
    expect(workflow).toContain("EXPO_OWNER=$(printf '%s' \"$APP_CONFIG\" | jq -er '.owner");
    expect(workflow).toContain(
      "PROJECT_MANIFEST_OWNER=$(jq -r '.owner // empty' project-manifest.json 2>/dev/null || true)",
    );
    expect(workflow).toContain(
      'PROJECT_MANIFEST_OWNER="$PROJECT_MANIFEST_OWNER" node .tools/scripts/release-artifact-routing.mjs',
    );
    expect(workflow).toContain("mobile_platforms=$(printf '%s' \"$PLAN\" | jq -c '.mobilePlatforms')");
    expect(workflow).toContain("should_deploy_site=$(printf '%s' \"$PLAN\" | jq -r '.shouldDeploySite')");
    for (const input of [
      "mobile_version",
      "site_version",
      "mobile_summary",
      "site_summary",
      "ios_artifact_name",
      "android_artifact_name",
      "site_artifact_name",
    ]) {
      expect(workflow).toContain(`${input}: { type: string, required: false }`);
    }
    expect(workflow).toContain("artifact-release-plan.mjs");
    expect(workflow).toContain("release_plan: ${{ steps.artifact_releases.outputs.release_plan }}");
  });

  it("opens and routes one notification thread per selected artifact", () => {
    for (const artifact of ["ios", "android", "site"]) {
      expect(workflow).toContain(`id: open_${artifact}`);
      expect(workflow).toContain(`${artifact}_slack_thread_ts: \${{ steps.open_${artifact}.outputs.thread_ts }}`);
      expect(workflow).toContain(`${artifact}_discord_thread_id: \${{ steps.open_${artifact}.outputs.thread_id }}`);
    }
    expect(workflow).toContain("ARTIFACT_NAME=$(printf '%s' \"$RELEASE_PLAN\" | jq -er '.ios.name')");
    expect(workflow).toContain("ARTIFACT_NAME=$(printf '%s' \"$RELEASE_PLAN\" | jq -er '.android.name')");
    expect(workflow).toContain("ARTIFACT_NAME=$(printf '%s' \"$RELEASE_PLAN\" | jq -er '.site.name')");
    expect(workflow).toContain("needs.announce.outputs.ios_slack_thread_ts");
    expect(workflow).toContain("needs.announce.outputs.android_slack_thread_ts");
    expect(workflow).toContain("needs.announce.outputs.site_slack_thread_ts");
  });

  it("routes exclusively by the Expo manifest owner, never the caller profile label", () => {
    expect(workflow).toContain("notification_publisher=$(printf '%s' \"$PLAN\" | jq -r '.notificationPublisher')");
    expect(workflow).toContain("NOTIFICATION_PUBLISHER: ${{ needs.prepare.outputs.notification_publisher }}");
    expect(workflow).toContain("SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}");
    expect(workflow).toContain("DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}");
    expect(workflow).toContain("release-notifier.mjs open");
    expect(workflow).toContain("release-notifier.mjs reply");
    expect(workflow).toContain("release-notifier.mjs final");
    expect(workflow).not.toMatch(/inputs\.profile\s*==/);
  });

  it("keeps exact EAS selection, submission, and Android credentials scoped to the Android leg", () => {
    expect(workflow).toContain("matrix:\n        platform: ${{ fromJSON(needs.prepare.outputs.mobile_platforms) }}");
    expect(workflow).toContain("APP_CONFIG=$(npx --no-install expo config --type public --json)");
    expect(workflow).toContain('SELECT_ARGS=(select --platform "$PLATFORM" --build-profile "$BUILD_PROFILE")');
    expect(workflow).toContain('SELECT_ARGS+=(--project-id "$PROJECT_ID" --app-version "$APP_VERSION")');
    expect(workflow).toContain('SELECTED=$(node .tools/scripts/exact-eas-release.mjs "${SELECT_ARGS[@]}")');
    expect(workflow).toContain('node .tools/scripts/exact-eas-release.mjs submit --platform "$PLATFORM" --submit-profile "$SUBMIT_PROFILE" --build-id "$BUILD_ID"');
    expect(workflow).toContain("ANDROID_SERVICE_ACCOUNT_JSON: ${{ secrets.ANDROID_SERVICE_ACCOUNT_JSON }}");
    expect(workflow).toContain("umask 077");
    expect(workflow).toContain("jq -e 'type == \"object\" and .type == \"service_account\"'");
    expect(workflow).toContain('rm -f "$ANDROID_SERVICE_ACCOUNT_KEY_PATH"');
  });

  it("builds a provider-free static package before a credentialed Pages publish", () => {
    expect(workflow).toContain("site_build_command: { type: string, required: false }");
    expect(workflow).toContain("site_output_directory: { type: string, required: false }");
    expect(workflow).toContain("site_package_directory: { type: string, required: false }");
    expect(workflow).toContain("site_project_name: { type: string, required: false }");
    expect(workflow).toContain("site_deployment_branch: { type: string, required: false }");
    expect(workflow).toContain("site_production_branch: { type: string, required: false }");
    expect(workflow).toContain("static-site-artifact.mjs build");
    expect(workflow).toContain("cloudflare-pages-publisher.mjs");
    expect(workflow).toContain("CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}");
    expect(workflow).toContain("CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}");
  });

  it("reports partial failures by their artifact before the final overall result", () => {
    expect(workflow).toContain("MOBILE_RESULT: ${{ needs.release.result }}");
    expect(workflow).toContain("SITE_RESULT: ${{ needs.site.result }}");
    expect(workflow).toContain('STAGE="mobile release"');
    expect(workflow).toContain('STAGE="site deployment"');
    const finalNotice = workflow.indexOf("name: Post final iOS release status");
    expect(workflow).toContain("name: Post final Android release status");
    expect(workflow).toContain("name: Post final website release status");
    const failure = workflow.indexOf("name: Report failed release");
    expect(finalNotice).toBeGreaterThan(0);
    expect(failure).toBeGreaterThan(finalNotice);
  });
});
