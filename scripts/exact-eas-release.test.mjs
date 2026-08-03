import { describe, expect, it, vi } from "vitest";

import {
  resolveBuildSelection,
  selectExactBuild,
  selectionArguments,
  submissionArguments,
} from "./exact-eas-release.mjs";

const selectedBuildJson = JSON.stringify([
  {
    id: "8e32215c-7061-46e4-b15d-08cd2f590a2a",
    buildDetailsPageUrl: "https://expo.dev/builds/8e32215c",
  },
]);

describe("exact EAS release commands", () => {
  it.each(["ios", "android"])(
    "builds %s and waits for the returned JSON identity",
    (platform) => {
      expect(
        selectionArguments({
          platform,
          buildProfile: "production",
          skipBuild: false,
        }),
      ).toEqual([
        "build",
        "--platform",
        platform,
        "--profile",
        "production",
        "--non-interactive",
        "--wait",
        "--json",
      ]);
    },
  );

  it.each(["ios", "android"])(
    "filters one finished store build when %s skips creation",
    (platform) => {
      expect(
        selectionArguments({
          platform,
          buildProfile: "preview",
          skipBuild: true,
        }),
      ).toEqual([
        "build:list",
        "--platform",
        platform,
        "--build-profile",
        "preview",
        "--status",
        "finished",
        "--distribution",
        "store",
        "--limit",
        "1",
        "--json",
      ]);
    },
  );

  it("returns the exact ID selected from EAS output", async () => {
    const runCommand = vi.fn().mockResolvedValue(selectedBuildJson);

    await expect(
      selectExactBuild({
        platform: "ios",
        buildProfile: "production",
        skipBuild: false,
        runCommand,
      }),
    ).resolves.toEqual({
      id: "8e32215c-7061-46e4-b15d-08cd2f590a2a",
      url: "https://expo.dev/builds/8e32215c",
    });
    expect(runCommand).toHaveBeenCalledOnce();
  });

  it("fails closed when EAS returns no selected build", () => {
    expect(() => resolveBuildSelection("[]")).toThrow(
      "EAS did not return one build with a non-empty ID",
    );
  });

  it.each(["ios", "android"])(
    "submits %s with an exact ID and never with latest",
    (platform) => {
      const args = submissionArguments({
        platform,
        submitProfile: "production",
        buildId: "8e32215c-7061-46e4-b15d-08cd2f590a2a",
      });

      expect(args).toEqual([
        "submit",
        "--platform",
        platform,
        "--profile",
        "production",
        "--id",
        "8e32215c-7061-46e4-b15d-08cd2f590a2a",
        "--non-interactive",
      ]);
      expect(args).not.toContain("--latest");
    },
  );
});
