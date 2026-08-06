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
    project: {
      id: "2a4c867f-b521-4278-9a63-a597149b3b1d",
      slug: "shotstep",
      ownerAccount: { name: "progress-companion-app" },
    },
    platform: "IOS",
    buildProfile: "production",
    distribution: "STORE",
    status: "FINISHED",
    gitCommitHash: "5482acac295c130944a5bb958ceefa64dd7f9672",
    appVersion: "0.1.7",
    appBuildVersion: "42",
  },
]);

const expectedBuild = {
  expectedProjectId: "2a4c867f-b521-4278-9a63-a597149b3b1d",
  expectedAppVersion: "0.1.7",
  expectedGitCommitHash: "5482acac295c130944a5bb958ceefa64dd7f9672",
  expectedPlatform: "ios",
  expectedBuildProfile: "production",
};

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
        expectedProjectId: expectedBuild.expectedProjectId,
        expectedAppVersion: "0.1.7",
        expectedGitCommitHash: expectedBuild.expectedGitCommitHash,
        runCommand,
      }),
    ).resolves.toEqual({
      id: "8e32215c-7061-46e4-b15d-08cd2f590a2a",
      url: "https://expo.dev/accounts/progress-companion-app/projects/shotstep/builds/8e32215c-7061-46e4-b15d-08cd2f590a2a",
      projectId: "2a4c867f-b521-4278-9a63-a597149b3b1d",
      appVersion: "0.1.7",
      appBuildVersion: "42",
    });
    expect(runCommand).toHaveBeenCalledOnce();
  });

  it("fails closed when EAS returns no selected build", () => {
    expect(() =>
      resolveBuildSelection("[]", expectedBuild),
    ).toThrow(
      "EAS did not return one build with a non-empty ID",
    );
  });

  it("fails closed when selected build identity metadata is missing", () => {
    expect(() =>
      resolveBuildSelection(
        JSON.stringify([{ id: "8e32215c-7061-46e4-b15d-08cd2f590a2a" }]),
        expectedBuild,
      ),
    ).toThrow("EAS build project ID is missing");
  });

  it("fails closed when the selected build has the wrong EAS project", () => {
    expect(() =>
      resolveBuildSelection(
        JSON.stringify([
          {
            ...JSON.parse(selectedBuildJson)[0],
            project: { id: "wrong-project" },
          },
        ]),
        expectedBuild,
      ),
    ).toThrow(
      "EAS build project ID mismatch: expected 2a4c867f-b521-4278-9a63-a597149b3b1d, received wrong-project",
    );
  });

  it("fails closed when the selected build is from the wrong commit", () => {
    expect(() =>
      resolveBuildSelection(
        JSON.stringify([
          {
            ...JSON.parse(selectedBuildJson)[0],
            gitCommitHash: "wrong-commit",
          },
        ]),
        expectedBuild,
      ),
    ).toThrow("EAS build commit mismatch");
  });

  it.each([
    ["platform", "ANDROID", "EAS build platform mismatch"],
    ["buildProfile", "preview", "EAS build profile mismatch"],
    ["distribution", "INTERNAL", "EAS build distribution is not STORE"],
    ["status", "ERRORED", "EAS build status is not FINISHED"],
  ])("fails closed when %s has the wrong value", (field, value, message) => {
    expect(() =>
      resolveBuildSelection(
        JSON.stringify([
          { ...JSON.parse(selectedBuildJson)[0], [field]: value },
        ]),
        expectedBuild,
      ),
    ).toThrow(message);
  });

  it("fails closed when the selected build has the wrong app version", () => {
    expect(() =>
      resolveBuildSelection(
        JSON.stringify([
          {
            ...JSON.parse(selectedBuildJson)[0],
            appVersion: "0.1.6",
            appBuildVersion: "41",
          },
        ]),
        expectedBuild,
      ),
    ).toThrow("EAS build app version mismatch: expected 0.1.7, received 0.1.6");
  });

  it("fails closed when the selected build number is missing", () => {
    expect(() =>
      resolveBuildSelection(
        JSON.stringify([
          {
            ...JSON.parse(selectedBuildJson)[0],
            appBuildVersion: undefined,
          },
        ]),
        expectedBuild,
      ),
    ).toThrow("EAS build number is missing");
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
