import { describe, expect, it } from "vitest";
import { payloadFor } from "./payload-cli.mjs";

const baseEnv = {
  PROJECT_NAME: "ShotStep",
  VERSION: "0.1.8",
  PROFILE: "personal",
  TRIGGER: "manual",
  SUMMARY: "- feat: add cross-court dink homework",
  PLATFORM: "ios",
  EVENT: "build",
  STATUS: "completed",
  URL: "https://expo.dev/builds/shotstep",
  OK: "true",
  STAGE: "",
};

describe("payloadFor", () => {
  it("builds Slack roots and replies from release lifecycle facts", () => {
    expect(payloadFor("slack-open", baseEnv)).toBe(
      [
        "ShotStep — v0.1.8 👤 personal",
        "🚀 Release triggered (manual) · personal",
        "Changes:",
        "- feat: add cross-court dink homework",
      ].join("\n"),
    );
    expect(payloadFor("slack-update", baseEnv)).toBe(
      "✅ [iOS] EAS build completed → https://expo.dev/builds/shotstep",
    );
    expect(payloadFor("slack-final", baseEnv)).toBe(
      "🎉 Release v0.1.8 complete",
    );
  });

  it("neutralizes Slack mention syntax from manual summaries", () => {
    const result = payloadFor("slack-open", {
      ...baseEnv,
      SUMMARY: "- chore: notify <!channel> and @here about serve practice",
    });

    expect(result).not.toContain("<!channel>");
    expect(result).not.toContain("@here");
  });

  it("rejects unknown payload kinds without exiting the importing process", () => {
    expect(() => payloadFor("bogus", baseEnv)).toThrow("Unknown kind: bogus");
  });
});
