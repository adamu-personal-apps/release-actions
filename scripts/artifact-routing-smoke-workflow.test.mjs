import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const workflow = await readFile(
  new URL("../.github/workflows/artifact-routing-smoke.yml", import.meta.url),
  "utf8",
);

describe("hosted artifact-routing smoke workflow", () => {
  it("is manually invoked and records the selected manifest-owner route", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("manifest_owner:");
    expect(workflow).toContain("business_owner:");
    expect(workflow).toContain("release-artifact-routing.mjs");
    expect(workflow).toContain("notification_publisher=");
    expect(workflow).toContain("candidate_commit=");
  });

  it("uses the one selected publisher instead of posting to both", () => {
    expect(workflow).toContain("NOTIFICATION_PUBLISHER: ${{ steps.plan.outputs.notification_publisher }}");
    expect(workflow).toContain("secrets.SLACK_BOT_TOKEN");
    expect(workflow).toContain("secrets.DISCORD_WEBHOOK_URL");
    expect(workflow.match(/release-notifier\.mjs open/g)).toHaveLength(1);
    expect(workflow.match(/release-notifier\.mjs reply/g)).toHaveLength(1);
    expect(workflow.match(/release-notifier\.mjs final/g)).toHaveLength(1);
    expect(workflow).not.toMatch(/inputs\.profile\s*==/);
  });

  it("never starts a build, store submission, or Cloudflare deployment", () => {
    expect(workflow).not.toMatch(/\beas\b/i);
    expect(workflow).not.toMatch(/wrangler|cloudflare-pages-publisher|static-site-artifact/i);
    expect(workflow).not.toContain("EXPO_TOKEN");
    expect(workflow).not.toContain("ANDROID_SERVICE_ACCOUNT_JSON");
  });
});
