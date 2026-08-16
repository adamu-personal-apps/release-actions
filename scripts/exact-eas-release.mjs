import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const SUPPORTED_PLATFORMS = new Set(["ios", "android"]);

export function selectionArguments({ platform, buildProfile, skipBuild }) {
  assertPlatform(platform);
  if (!buildProfile) throw new Error("Build profile is required");

  return skipBuild
    ? [
        "build:list",
        "--platform",
        platform,
        "--build-profile",
        buildProfile,
        "--status",
        "finished",
        "--distribution",
        "store",
        "--limit",
        "1",
        "--json",
      ]
    : [
        "build",
        "--platform",
        platform,
        "--profile",
        buildProfile,
        "--non-interactive",
        "--wait",
        "--json",
      ];
}

export function submissionArguments({ platform, submitProfile, buildId }) {
  assertPlatform(platform);
  if (!submitProfile) throw new Error("Submit profile is required");
  if (!buildId) throw new Error("Exact EAS build ID is required");

  return [
    "submit",
    "--platform",
    platform,
    "--profile",
    submitProfile,
    "--id",
    buildId,
    "--non-interactive",
  ];
}

function assertPlatform(platform) {
  if (!SUPPORTED_PLATFORMS.has(platform)) {
    throw new Error(`Unsupported EAS platform: ${platform ?? "missing"}`);
  }
}

export function resolveBuildSelection(
  output,
  {
    expectedProjectId,
    expectedAppVersion,
    expectedGitCommitHash,
    expectedPlatform,
    expectedBuildProfile,
  },
) {
  if (!expectedProjectId) throw new Error("Expected EAS project ID is required");
  if (!expectedAppVersion) throw new Error("Expected app version is required");
  if (!expectedGitCommitHash) throw new Error("Expected git commit is required");
  assertPlatform(expectedPlatform);
  if (!expectedBuildProfile) throw new Error("Expected build profile is required");
  let builds;
  try {
    builds = JSON.parse(output);
  } catch {
    throw new Error("EAS returned invalid build JSON");
  }

  const build = Array.isArray(builds) ? builds[0] : undefined;
  if (!build || typeof build.id !== "string" || build.id.length === 0) {
    throw new Error("EAS did not return one build with a non-empty ID");
  }
  const buildProjectId = buildProject(build)?.id;
  if (typeof buildProjectId !== "string" || !buildProjectId) {
    throw new Error("EAS build project ID is missing");
  }
  if (buildProjectId !== expectedProjectId) {
    throw new Error(
      `EAS build project ID mismatch: expected ${expectedProjectId}, received ${buildProjectId}`,
    );
  }
  if (build.platform?.toLowerCase() !== expectedPlatform) {
    throw new Error(
      `EAS build platform mismatch: expected ${expectedPlatform}, received ${build.platform ?? "missing"}`,
    );
  }
  if (build.buildProfile !== expectedBuildProfile) {
    throw new Error(
      `EAS build profile mismatch: expected ${expectedBuildProfile}, received ${build.buildProfile ?? "missing"}`,
    );
  }
  if (build.distribution !== "STORE") {
    throw new Error("EAS build distribution is not STORE");
  }
  if (build.status !== "FINISHED") {
    throw new Error("EAS build status is not FINISHED");
  }
  if (build.gitCommitHash !== expectedGitCommitHash) {
    throw new Error(
      `EAS build commit mismatch: expected ${expectedGitCommitHash}, received ${build.gitCommitHash ?? "missing"}`,
    );
  }
  if (typeof build.appVersion !== "string" || !build.appVersion) {
    throw new Error("EAS build app version is missing");
  }
  if (build.appVersion !== expectedAppVersion) {
    throw new Error(
      `EAS build app version mismatch: expected ${expectedAppVersion}, received ${build.appVersion}`,
    );
  }
  if (typeof build.appBuildVersion !== "string" || !build.appBuildVersion) {
    throw new Error("EAS build number is missing");
  }

  return {
    id: build.id,
    url: buildDetailsUrl(build),
    projectId: buildProjectId,
    appVersion: build.appVersion,
    appBuildVersion: build.appBuildVersion,
  };
}

/**
 * The owning project on an eas-cli build payload. The CLI's BuildFragment calls
 * it `app` (app { id name slug ownerAccount }) — verified against eas-cli@22.
 * `project` is accepted as a fallback so an older CLI's output still validates
 * instead of failing closed after a build has already been paid for.
 */
function buildProject(build) {
  return build.app ?? build.project;
}

function buildDetailsUrl(build) {
  if (typeof build.buildDetailsPageUrl === "string") {
    return build.buildDetailsPageUrl;
  }
  const project = buildProject(build);
  const owner = project?.ownerAccount?.name;
  const slug = project?.slug;
  return typeof owner === "string" && typeof slug === "string"
    ? `https://expo.dev/accounts/${owner}/projects/${slug}/builds/${build.id}`
    : "";
}

export function runEasCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["inherit", "pipe", "inherit"],
    });
    let stdout = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => {
      if (status === 0) resolve(stdout);
      else reject(new Error(`${command} exited with status ${status}`));
    });
  });
}

export async function selectExactBuild({
  platform,
  buildProfile,
  skipBuild,
  expectedProjectId,
  expectedAppVersion,
  expectedGitCommitHash,
  runCommand = runEasCommand,
}) {
  const output = await runCommand(
    "eas",
    selectionArguments({ platform, buildProfile, skipBuild }),
  );
  return resolveBuildSelection(output, {
    expectedProjectId,
    expectedAppVersion,
    expectedGitCommitHash,
    expectedPlatform: platform,
    expectedBuildProfile: buildProfile,
  });
}

function readOption(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

async function main(args) {
  const [operation, ...options] = args;
  const platform = readOption(options, "--platform");

  if (operation === "select") {
    const selection = await selectExactBuild({
      platform,
      buildProfile: readOption(options, "--build-profile"),
      skipBuild: options.includes("--skip-build"),
      expectedProjectId: readOption(options, "--project-id"),
      expectedAppVersion: readOption(options, "--app-version"),
      expectedGitCommitHash: readOption(options, "--git-commit-hash"),
    });
    process.stdout.write(`${JSON.stringify(selection)}\n`);
    return;
  }

  if (operation === "submit") {
    const output = await runEasCommand(
      "eas",
      submissionArguments({
        platform,
        submitProfile: readOption(options, "--submit-profile"),
        buildId: readOption(options, "--build-id"),
      }),
    );
    process.stdout.write(output);
    return;
  }

  throw new Error(`Unsupported operation: ${operation ?? "missing"}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`Exact EAS release failed: ${error.message}`);
    process.exitCode = 1;
  });
}
