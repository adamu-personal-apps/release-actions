import { describe, expect, it } from "vitest";

import { resolveArtifactReleasePlan } from "./artifact-release-plan.mjs";

const baseInput = {
  artifacts: ["ios", "android", "site"],
  projectName: "ShotStep",
  iosArtifactName: "ShotStep iOS",
  androidArtifactName: "ShotStep Android",
  siteArtifactName: "shotstep.com",
  mobileVersion: "0.1.18",
  siteVersion: "0.1.7",
  mobileSummary: "- Players can review their latest pickleball homework.",
  siteSummary: "- Account-deletion help is easier to find.",
};

describe("artifact release plan", () => {
  it("keeps every selected artifact's identity, version, and changes together", () => {
    expect(resolveArtifactReleasePlan(baseInput)).toEqual({
      ios: {
        artifact: "ios",
        name: "ShotStep iOS",
        version: "0.1.18",
        summary: "- Players can review their latest pickleball homework.",
      },
      android: {
        artifact: "android",
        name: "ShotStep Android",
        version: "0.1.18",
        summary: "- Players can review their latest pickleball homework.",
      },
      site: {
        artifact: "site",
        name: "shotstep.com",
        version: "0.1.7",
        summary: "- Account-deletion help is easier to find.",
      },
    });
  });

  it.each([
    ["ios", "ShotStep iOS", "0.1.18"],
    ["android", "ShotStep Android", "0.1.18"],
    ["site", "shotstep.com", "0.1.7"],
  ])("builds a focused %s-only plan", (artifact, name, version) => {
    expect(resolveArtifactReleasePlan({
      ...baseInput,
      artifacts: [artifact],
    })).toEqual({
      [artifact]: expect.objectContaining({ artifact, name, version }),
    });
  });

  it.each([
    [["ios"], "mobile version"],
    [["android"], "mobile version"],
    [["site"], "site version"],
  ])("requires the applicable version for %j", (artifacts, expected) => {
    expect(() => resolveArtifactReleasePlan({
      ...baseInput,
      artifacts,
      mobileVersion: "",
      siteVersion: "",
      legacyVersion: "",
    })).toThrow(expected);
  });

  it("supports legacy callers without merging explicit site and app changes", () => {
    expect(resolveArtifactReleasePlan({
      artifacts: ["ios", "site"],
      projectName: "Rally Notes",
      legacyVersion: "2.4.0",
      legacySummary: "- Coaches can plan a realistic third-shot drill.",
    })).toEqual({
      ios: {
        artifact: "ios",
        name: "Rally Notes iOS",
        version: "2.4.0",
        summary: "- Coaches can plan a realistic third-shot drill.",
      },
      site: {
        artifact: "site",
        name: "Rally Notes website",
        version: "2.4.0",
        summary: "- Coaches can plan a realistic third-shot drill.",
      },
    });
  });
});
