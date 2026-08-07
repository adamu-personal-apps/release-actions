#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

const MANIFEST_FIELDS = [
  "artifactDigest",
  "kind",
  "schemaVersion",
  "sourceRevision",
];
const SAFE_BUILD_ENVIRONMENT_KEYS = [
  "CI",
  "HOME",
  "LANG",
  "LC_ALL",
  "PATH",
  "SHELL",
  "SHOTSTEP_ANDROID_RELEASE_SHA256",
  "TERM",
  "TMPDIR",
  "TZ",
  "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "EXPO_PUBLIC_SUPABASE_URL",
];
const MAX_BUILD_OUTPUT_BYTES = 1024 * 1024;
const SECRET_LIKE_OUTPUT = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\b(?:authorization|proxy-authorization)\s*:\s*(?:basic|bearer)\s+\S+/i,
  /\b(?:xox[baprs]-|gh[pousr]_|github_pat_|sk_(?:live|test)_)[A-Za-z0-9_-]+/i,
  /\b[A-Z0-9_]*(?:API_?KEY|TOKEN|SECRET|PASSWORD|PRIVATE_?KEY|ACCOUNT_?ID)\s*[=:]\s*\S+/i,
];

function isInside(parent, child) {
  const pathFromParent = relative(parent, child);
  return (
    pathFromParent === "" ||
    (!pathFromParent.startsWith(`..${sep}`) &&
      pathFromParent !== ".." &&
      !isAbsolute(pathFromParent))
  );
}

function assertSourceRevision(sourceRevision) {
  if (
    typeof sourceRevision !== "string" ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(sourceRevision)
  ) {
    throw new Error("Source revision must be a full lowercase Git object ID.");
  }
}

function sanitizedBuildEnvironment(environment) {
  const safeEnvironment = {};
  for (const key of SAFE_BUILD_ENVIRONMENT_KEYS) {
    if (typeof environment?.[key] === "string") {
      safeEnvironment[key] = environment[key];
    }
  }
  safeEnvironment.CI = "true";
  return safeEnvironment;
}

function containsSecretLikeOutput(output) {
  return SECRET_LIKE_OUTPUT.some((pattern) => pattern.test(output));
}

async function runBuildCommand({ command, cwd, environment, logger }) {
  if (typeof command !== "string" || command.trim() === "") {
    throw new Error("Build command must be a non-empty string.");
  }
  if (containsSecretLikeOutput(command)) {
    throw new Error("Build command contains a secret-like value and was rejected.");
  }

  const chunks = [];
  let outputBytes = 0;
  let outputExceededLimit = false;

  const exitCode = await new Promise((resolveExit, rejectExit) => {
    const child = spawn("bash", ["-eo", "pipefail", "-c", command], {
      cwd,
      env: sanitizedBuildEnvironment(environment),
      stdio: ["ignore", "pipe", "pipe"],
    });

    const collect = (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_BUILD_OUTPUT_BYTES) {
        outputExceededLimit = true;
        child.kill("SIGTERM");
        return;
      }
      chunks.push(chunk);
    };

    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.once("error", rejectExit);
    child.once("close", resolveExit);
  });

  const output = Buffer.concat(chunks).toString("utf8");
  if (outputExceededLimit) {
    throw new Error("Build output exceeded the safe one-megabyte log limit.");
  }
  if (containsSecretLikeOutput(output)) {
    throw new Error("Build produced secret-like output; the output was suppressed.");
  }
  if (output !== "") {
    logger(output);
  }
  if (exitCode !== 0) {
    throw new Error(`Build command failed with exit code ${exitCode}.`);
  }
}

async function resolveDeclaredOutput(workspaceDirectory, outputDirectory) {
  const workspaceRealPath = await realpath(workspaceDirectory);
  const declaredPath = resolveWorkspaceChildPath(
    workspaceRealPath,
    outputDirectory,
    "Output directory",
  );

  let declaredStat;
  try {
    declaredStat = await lstat(declaredPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error("Static output directory does not exist.");
    }
    throw error;
  }
  if (declaredStat.isSymbolicLink()) {
    throw new Error("Static output directory cannot be a symbolic link.");
  }
  if (!declaredStat.isDirectory()) {
    throw new Error("Static output path must be a directory.");
  }

  const outputRealPath = await realpath(declaredPath);
  if (!isInside(workspaceRealPath, outputRealPath)) {
    throw new Error("Output directory must stay inside the workspace.");
  }
  return { outputRealPath, workspaceRealPath };
}

function resolveWorkspaceChildPath(workspaceRealPath, pathValue, label) {
  if (
    typeof pathValue !== "string" ||
    pathValue.trim() === "" ||
    isAbsolute(pathValue)
  ) {
    throw new Error(`${label} must stay inside the workspace.`);
  }
  const resolvedPath = resolve(workspaceRealPath, pathValue);
  if (!isInside(workspaceRealPath, resolvedPath) || resolvedPath === workspaceRealPath) {
    throw new Error(`${label} must stay inside the workspace.`);
  }
  return resolvedPath;
}

async function copyStaticEntry({
  sourcePath,
  destinationPath,
  sourceRoot,
  ancestors,
}) {
  const sourceLstat = await lstat(sourcePath);
  let materializedPath = sourcePath;
  if (sourceLstat.isSymbolicLink()) {
    materializedPath = await realpath(sourcePath);
    if (!isInside(sourceRoot, materializedPath)) {
      throw new Error("A link target must stay inside the static output directory.");
    }
  }

  const materializedStat = await stat(materializedPath);
  if (materializedStat.isDirectory()) {
    const directoryRealPath = await realpath(materializedPath);
    if (ancestors.has(directoryRealPath)) {
      throw new Error("Static output contains a linked directory cycle.");
    }
    const nextAncestors = new Set(ancestors).add(directoryRealPath);
    await mkdir(destinationPath, { recursive: false, mode: 0o755 });
    const entries = await readdir(materializedPath);
    entries.sort();
    for (const entry of entries) {
      await copyStaticEntry({
        sourcePath: join(materializedPath, entry),
        destinationPath: join(destinationPath, entry),
        sourceRoot,
        ancestors: nextAncestors,
      });
    }
    return;
  }

  if (!materializedStat.isFile()) {
    throw new Error("Static output may contain only directories, files, and safe links.");
  }
  if (materializedStat.nlink !== 1) {
    throw new Error("Static output must not contain hard-linked files.");
  }
  await copyFile(materializedPath, destinationPath);
  await chmod(destinationPath, 0o644);
}

function digestPath(pathFromSite) {
  return pathFromSite.split(sep).join("/");
}

async function updateDigestForDirectory(hash, directory, pathFromSite = "") {
  const entries = await readdir(directory);
  entries.sort();
  for (const entry of entries) {
    const entryPath = join(directory, entry);
    const relativeEntryPath =
      pathFromSite === "" ? entry : join(pathFromSite, entry);
    const entryStat = await lstat(entryPath);
    if (entryStat.isSymbolicLink()) {
      throw new Error("Packaged site must not contain symbolic links.");
    }
    if (entryStat.isDirectory()) {
      hash.update(`directory\0${digestPath(relativeEntryPath)}\0`);
      await updateDigestForDirectory(hash, entryPath, relativeEntryPath);
      continue;
    }
    if (!entryStat.isFile()) {
      throw new Error("Packaged site contains an unsupported file type.");
    }
    if (entryStat.nlink !== 1) {
      throw new Error("Packaged site must not contain hard-linked files.");
    }
    hash.update(`file\0${digestPath(relativeEntryPath)}\0${entryStat.size}\0`);
    const handle = await open(entryPath, "r");
    try {
      for await (const chunk of handle.createReadStream()) {
        hash.update(chunk);
      }
    } finally {
      await handle.close();
    }
    hash.update("\0");
  }
}

async function calculateArtifactDigest(siteDirectory) {
  const hash = createHash("sha256");
  await updateDigestForDirectory(hash, siteDirectory);
  return `sha256:${hash.digest("hex")}`;
}

function validateManifest(manifest) {
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Static-site manifest must be a JSON object.");
  }

  for (const field of Object.keys(manifest)) {
    if (!MANIFEST_FIELDS.includes(field)) {
      throw new Error(`Unknown manifest field: ${field}.`);
    }
  }
  for (const field of MANIFEST_FIELDS) {
    if (!(field in manifest)) {
      throw new Error(`Manifest is missing required field: ${field}.`);
    }
  }
  if (manifest.schemaVersion !== 1) {
    throw new Error(`Unsupported manifest schema version: ${manifest.schemaVersion}.`);
  }
  if (manifest.kind !== "static-directory") {
    throw new Error(`Unsupported artifact kind: ${manifest.kind}.`);
  }
  assertSourceRevision(manifest.sourceRevision);
  if (!/^sha256:[a-f0-9]{64}$/.test(manifest.artifactDigest)) {
    throw new Error("Manifest artifact digest must be a SHA-256 digest.");
  }
  return manifest;
}

async function makePackageReadOnly(path) {
  const pathStat = await lstat(path);
  if (pathStat.isDirectory()) {
    for (const entry of await readdir(path)) {
      await makePackageReadOnly(join(path, entry));
    }
    await chmod(path, 0o555);
    return;
  }
  await chmod(path, 0o444);
}

async function makePackageWritable(path) {
  let pathStat;
  try {
    pathStat = await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return;
    }
    throw error;
  }
  if (pathStat.isDirectory()) {
    await chmod(path, 0o755);
    for (const entry of await readdir(path)) {
      await makePackageWritable(join(path, entry));
    }
    return;
  }
  await chmod(path, 0o644);
}

export async function verifyStaticSiteArtifact({ packageDirectory }) {
  const packagePath = resolve(packageDirectory);
  const packageStat = await lstat(packagePath).catch((error) => {
    if (error?.code === "ENOENT") {
      throw new Error("Static-site package does not exist.");
    }
    throw error;
  });
  if (!packageStat.isDirectory() || packageStat.isSymbolicLink()) {
    throw new Error("Static-site package must be a directory.");
  }

  const entries = await readdir(packagePath);
  entries.sort();
  if (
    entries.length !== 2 ||
    entries[0] !== "manifest.json" ||
    entries[1] !== "site"
  ) {
    throw new Error("Static-site package must contain only manifest.json and site.");
  }

  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(packagePath, "manifest.json"), "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Static-site manifest is not valid JSON.");
    }
    throw error;
  }
  validateManifest(manifest);

  const siteStat = await lstat(join(packagePath, "site"));
  if (!siteStat.isDirectory() || siteStat.isSymbolicLink()) {
    throw new Error("Packaged site must be a directory without symbolic links.");
  }
  const actualDigest = await calculateArtifactDigest(join(packagePath, "site"));
  if (actualDigest !== manifest.artifactDigest) {
    throw new Error("Artifact digest does not match the packaged site.");
  }
  return manifest;
}

export async function buildStaticSiteArtifact({
  workspaceDirectory = process.cwd(),
  buildCommand,
  outputDirectory,
  packageDirectory,
  sourceRevision,
  environment = process.env,
  logger = (message) => process.stdout.write(message),
}) {
  assertSourceRevision(sourceRevision);
  const workspaceRealPath = await realpath(workspaceDirectory);
  const packagePath = resolveWorkspaceChildPath(
    workspaceRealPath,
    packageDirectory,
    "Package directory",
  );
  // Reject an escaping declaration before any caller-owned build code runs.
  resolveWorkspaceChildPath(workspaceRealPath, outputDirectory, "Output directory");
  try {
    await lstat(packagePath);
    throw new Error("Package directory already exists.");
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  await runBuildCommand({
    command: buildCommand,
    cwd: workspaceRealPath,
    environment,
    logger,
  });
  const { outputRealPath } = await resolveDeclaredOutput(
    workspaceRealPath,
    outputDirectory,
  );
  if (isInside(outputRealPath, packagePath)) {
    throw new Error("Package directory cannot be inside the static output directory.");
  }

  await mkdir(dirname(packagePath), { recursive: true });
  const stagingDirectory = await mkdtemp(
    join(dirname(packagePath), `.${basename(packagePath)}.tmp-`),
  );
  try {
    await copyStaticEntry({
      sourcePath: outputRealPath,
      destinationPath: join(stagingDirectory, "site"),
      sourceRoot: outputRealPath,
      ancestors: new Set(),
    });
    const artifactDigest = await calculateArtifactDigest(join(stagingDirectory, "site"));
    const manifest = {
      schemaVersion: 1,
      kind: "static-directory",
      sourceRevision,
      artifactDigest,
    };
    await writeFile(
      join(stagingDirectory, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { mode: 0o644 },
    );
    await verifyStaticSiteArtifact({ packageDirectory: stagingDirectory });
    await makePackageReadOnly(stagingDirectory);
    await rename(stagingDirectory, packagePath);
    return { packageDirectory: packagePath, manifest };
  } catch (error) {
    await makePackageWritable(stagingDirectory);
    await rm(stagingDirectory, { recursive: true, force: true });
    throw error;
  }
}

export function parseStaticSiteArtifactArguments(arguments_) {
  const [command, ...tokens] = arguments_;
  if (command !== "build" && command !== "verify") {
    throw new Error("Expected command: build or verify.");
  }

  const allowed =
    command === "build"
      ? new Set([
          "--command",
          "--output-directory",
          "--package-directory",
          "--source-revision",
          "--workspace-directory",
        ])
      : new Set(["--package-directory"]);
  const values = {};
  for (let index = 0; index < tokens.length; index += 2) {
    const field = tokens[index];
    const value = tokens[index + 1];
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

  const required =
    command === "build"
      ? [
          "--command",
          "--output-directory",
          "--package-directory",
          "--source-revision",
        ]
      : ["--package-directory"];
  for (const field of required) {
    if (!(field in values)) {
      throw new Error(`Missing required argument: ${field}.`);
    }
  }
  return { command, values };
}

async function main() {
  const parsed = parseStaticSiteArtifactArguments(process.argv.slice(2));
  if (parsed.command === "build") {
    const result = await buildStaticSiteArtifact({
      workspaceDirectory: parsed.values["--workspace-directory"] ?? process.cwd(),
      buildCommand: parsed.values["--command"],
      outputDirectory: parsed.values["--output-directory"],
      packageDirectory: parsed.values["--package-directory"],
      sourceRevision: parsed.values["--source-revision"],
    });
    process.stdout.write(`${JSON.stringify(result.manifest)}\n`);
    return;
  }

  const manifest = await verifyStaticSiteArtifact({
    packageDirectory: parsed.values["--package-directory"],
  });
  process.stdout.write(`${JSON.stringify(manifest)}\n`);
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  main().catch((error) => {
    process.stderr.write(`static-site artifact error: ${error.message}\n`);
    process.exitCode = 1;
  });
}
