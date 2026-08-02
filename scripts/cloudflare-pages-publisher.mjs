#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyStaticSiteArtifact } from "./static-site-artifact.mjs";

export const WRANGLER_VERSION = "4.118.0";

const MAX_COMMAND_OUTPUT_BYTES = 1024 * 1024;
const SAFE_ENVIRONMENT_KEYS = ["HOME", "LANG", "LC_ALL", "PATH", "SHELL", "TMPDIR", "TZ"];
const REQUIRED_ARGUMENTS = [
  "--package-directory",
  "--project-name",
  "--deployment-branch",
  "--production-branch",
];

function assertInstruction(value, label) {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value !== value.trim() ||
    /[\0\r\n]/.test(value)
  ) {
    throw new Error(`${label} must be a non-empty single-line value.`);
  }
}

function publisherEnvironment(environment, outputFilePath) {
  const result = {};
  for (const key of SAFE_ENVIRONMENT_KEYS) {
    if (typeof environment?.[key] === "string") {
      result[key] = environment[key];
    }
  }
  result.CI = "true";
  result.CLOUDFLARE_API_TOKEN = environment?.CLOUDFLARE_API_TOKEN;
  result.CLOUDFLARE_ACCOUNT_ID = environment?.CLOUDFLARE_ACCOUNT_ID;
  result.FORCE_COLOR = "0";
  result.WRANGLER_OUTPUT_FILE_PATH = outputFilePath;
  result.WRANGLER_SEND_ERROR_REPORTS = "false";
  result.WRANGLER_SEND_METRICS = "false";
  return result;
}

function redactProviderError(message, environment) {
  let redacted = String(message ?? "");
  for (const value of [
    environment?.CLOUDFLARE_API_TOKEN,
    environment?.CLOUDFLARE_ACCOUNT_ID,
  ]) {
    if (typeof value === "string" && value !== "") {
      redacted = redacted.split(value).join("[redacted]");
    }
  }
  redacted = redacted
    .replace(/\b(?:authorization\s*:\s*)?(?:bearer\s+)?[A-Za-z0-9_-]{32,}\b/gi, "[redacted]")
    .trim();
  return redacted.slice(0, 4000);
}

async function defaultRunCommand({ command, args, cwd, environment }) {
  const stdout = [];
  const stderr = [];
  let outputBytes = 0;
  let exceededLimit = false;

  const exitCode = await new Promise((resolveExit, rejectExit) => {
    const child = spawn(command, args, {
      cwd,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const collect = (target) => (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_COMMAND_OUTPUT_BYTES) {
        exceededLimit = true;
        child.kill("SIGTERM");
        return;
      }
      target.push(chunk);
    };
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    child.once("error", rejectExit);
    child.once("close", resolveExit);
  });

  if (exceededLimit) {
    throw new Error("Wrangler output exceeded the safe one-megabyte log limit.");
  }
  return {
    exitCode,
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8"),
  };
}

function parseOutputEntries(output) {
  const entries = [];
  for (const [index, line] of output.split(/\r?\n/).entries()) {
    if (line.trim() === "") {
      continue;
    }
    try {
      entries.push(JSON.parse(line));
    } catch {
      throw new Error(`Wrangler structured output line ${index + 1} is not valid JSON.`);
    }
  }
  return entries;
}

async function readStructuredFailure(outputFilePath) {
  try {
    const entries = parseOutputEntries(await readFile(outputFilePath, "utf8"));
    const failure = entries.findLast(
      (entry) => entry?.type === "command-failed" && entry.version === 1,
    );
    if (typeof failure?.message !== "string" || failure.message.trim() === "") {
      return null;
    }
    return failure.code === undefined
      ? failure.message
      : `Wrangler error ${failure.code}: ${failure.message}`;
  } catch {
    return null;
  }
}

export function parseWranglerOutput(
  output,
  { projectName, expectedEnvironment, productionBranch, sourceRevision },
) {
  const entries = parseOutputEntries(output);
  const records = entries.filter((entry) => entry?.type === "pages-deploy-detailed");
  if (records.length !== 1) {
    throw new Error("Wrangler did not return exactly one detailed Pages deployment record.");
  }
  const record = records[0];
  if (record.version !== 1) {
    throw new Error(`Unsupported Wrangler Pages deployment record version: ${record.version}.`);
  }
  if (record.pages_project !== projectName) {
    throw new Error("Wrangler Pages project did not match the requested project.");
  }
  if (record.environment !== expectedEnvironment) {
    throw new Error("Wrangler Pages deployment environment did not match the requested branch.");
  }
  if (record.production_branch !== productionBranch) {
    throw new Error("Wrangler Pages production branch did not match the deployment instructions.");
  }
  if (record.deployment_trigger?.metadata?.commit_hash !== sourceRevision) {
    throw new Error("Wrangler Pages source revision did not match the artifact.");
  }
  if (typeof record.deployment_id !== "string" || record.deployment_id.trim() === "") {
    throw new Error("Wrangler Pages deployment record is missing its deployment ID.");
  }
  if (typeof record.url !== "string" || !/^https:\/\/[^\s]+$/.test(record.url)) {
    throw new Error("Wrangler Pages deployment record is missing a valid HTTPS URL.");
  }
  return record;
}

export async function publishStaticSiteToCloudflarePages({
  packageDirectory,
  projectName,
  deploymentBranch,
  productionBranch,
  environment = process.env,
  runCommand = defaultRunCommand,
}) {
  assertInstruction(projectName, "Project name");
  assertInstruction(deploymentBranch, "Deployment branch");
  assertInstruction(productionBranch, "Production branch");
  const packagePath = resolve(packageDirectory);
  const manifest = await verifyStaticSiteArtifact({ packageDirectory: packagePath });
  if (manifest.kind !== "static-directory") {
    throw new Error(`Unsupported artifact kind: ${manifest.kind}.`);
  }
  if (
    typeof environment.CLOUDFLARE_API_TOKEN !== "string" ||
    environment.CLOUDFLARE_API_TOKEN === ""
  ) {
    throw new Error("CLOUDFLARE_API_TOKEN is required to publish the static site.");
  }
  if (
    typeof environment.CLOUDFLARE_ACCOUNT_ID !== "string" ||
    environment.CLOUDFLARE_ACCOUNT_ID === ""
  ) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID is required to publish the static site.");
  }

  const expectedEnvironment =
    deploymentBranch === productionBranch ? "production" : "preview";
  const outputDirectory = await mkdtemp(join(tmpdir(), "release-actions-wrangler-"));
  const outputFilePath = join(outputDirectory, "output.ndjson");
  try {
    const commandResult = await runCommand({
      command: "npx",
      args: [
        "--yes",
        `wrangler@${WRANGLER_VERSION}`,
        "pages",
        "deploy",
        join(packagePath, "site"),
        "--project-name",
        projectName,
        "--branch",
        deploymentBranch,
        "--commit-hash",
        manifest.sourceRevision,
        "--commit-dirty=false",
        "--experimental-provision=false",
        "--experimental-auto-create=false",
      ],
      cwd: packagePath,
      environment: publisherEnvironment(environment, outputFilePath),
      outputFilePath,
    });

    if (commandResult.exitCode !== 0) {
      const structuredFailure = await readStructuredFailure(outputFilePath);
      const detail = redactProviderError(
        structuredFailure ||
          commandResult.stderr ||
          commandResult.stdout ||
          "Wrangler returned no error detail.",
        environment,
      );
      throw new Error(
        `Cloudflare Pages deployment failed with exit code ${commandResult.exitCode}: ${detail}`,
      );
    }

    let output;
    try {
      output = await readFile(outputFilePath, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") {
        throw new Error("Wrangler did not write its structured deployment record.");
      }
      throw error;
    }
    const deployment = parseWranglerOutput(output, {
      projectName,
      expectedEnvironment,
      productionBranch,
      sourceRevision: manifest.sourceRevision,
    });
    return {
      provider: "cloudflare-pages",
      environment: expectedEnvironment,
      deploymentId: deployment.deployment_id,
      url: deployment.url,
      status: "success",
      sourceRevision: manifest.sourceRevision,
      artifactDigest: manifest.artifactDigest,
    };
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
}

export function parseCloudflarePagesPublisherArguments(arguments_) {
  const allowed = new Set(REQUIRED_ARGUMENTS);
  const values = {};
  for (let index = 0; index < arguments_.length; index += 2) {
    const field = arguments_[index];
    const value = arguments_[index + 1];
    if (!allowed.has(field)) {
      throw new Error(`Unknown argument: ${field}.`);
    }
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Argument ${field} requires a value.`);
    }
    if (field in values) {
      throw new Error(`Argument ${field} was provided more than once.`);
    }
    values[field] = value;
  }
  for (const field of REQUIRED_ARGUMENTS) {
    if (!(field in values)) {
      throw new Error(`Missing required argument: ${field}.`);
    }
  }
  return values;
}

async function main() {
  const values = parseCloudflarePagesPublisherArguments(process.argv.slice(2));
  const result = await publishStaticSiteToCloudflarePages({
    packageDirectory: values["--package-directory"],
    projectName: values["--project-name"],
    deploymentBranch: values["--deployment-branch"],
    productionBranch: values["--production-branch"],
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`Cloudflare Pages publisher error: ${error.message}\n`);
    process.exitCode = 1;
  });
}
