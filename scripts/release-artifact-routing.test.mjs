import { describe, expect, it } from "vitest";

import { resolveReleasePlan } from "./release-artifact-routing.mjs";

describe("release artifact routing", () => {
  it("uses an explicit canonical artifact set without broadening it", () => {
    expect(
      resolveReleasePlan({
        artifacts: "ios,site",
        businessOwner: "progress-companion-app",
        expoOwner: "progress-companion-app",
        platform: "all",
      }),
    ).toEqual({
      artifacts: ["ios", "site"],
      mobilePlatforms: ["ios"],
      notificationPublisher: "slack",
      shouldDeploySite: true,
    });
  });

  it("keeps legacy callers on their existing mobile-only platform route", () => {
    expect(
      resolveReleasePlan({
        artifacts: "",
        platform: "all",
      }),
    ).toEqual({
      artifacts: ["ios", "android"],
      mobilePlatforms: ["ios", "android"],
      notificationPublisher: "slack",
      shouldDeploySite: false,
    });
  });

  it.each([
    ["android,ios", "artifact set must use the canonical order"],
    ["ios,ios", "artifact set cannot repeat an artifact"],
    ["ios,website", "artifact set contains an unsupported artifact"],
    ["", "artifact set must not be empty"],
  ])("rejects an unsafe explicit artifact set: %s", (artifacts, message) => {
    expect(() =>
      resolveReleasePlan({
        artifacts,
        explicitArtifacts: true,
        platform: "ios",
      }),
    ).toThrow(message);
  });

  it("routes a non-business manifest owner to Discord only", () => {
    expect(
      resolveReleasePlan({
        artifacts: "android",
        businessOwner: "progress-companion-app",
        expoOwner: "personal-court-app",
      }),
    ).toMatchObject({
      notificationPublisher: "discord",
    });
  });

  it("refuses owner-specific routing when the Expo manifest has no owner", () => {
    expect(() =>
      resolveReleasePlan({
        artifacts: "ios",
        businessOwner: "progress-companion-app",
        expoOwner: "",
      }),
    ).toThrow("Expo manifest owner is required for notification routing");
  });
});
