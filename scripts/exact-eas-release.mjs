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

export function resolveBuildSelection(output) {
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

  return {
    id: build.id,
    url:
      typeof build.buildDetailsPageUrl === "string"
        ? build.buildDetailsPageUrl
        : "",
  };
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
  runCommand = runEasCommand,
}) {
  const output = await runCommand(
    "eas",
    selectionArguments({ platform, buildProfile, skipBuild }),
  );
  return resolveBuildSelection(output);
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
