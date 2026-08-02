import {
  chmod,
  lstat,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildStaticSiteArtifact } from "./static-site-artifact.mjs";
import {
  WRANGLER_VERSION,
  parseCloudflarePagesPublisherArguments,
  parseWranglerOutput,
  publishStaticSiteToCloudflarePages,
} from "./cloudflare-pages-publisher.mjs";

const SOURCE_REVISION = "0123456789abcdef0123456789abcdef01234567";
const workspaces = [];

async function makeWritable(path) {
  const stat = await lstat(path).catch(() => null);
  if (!stat) return;
  await chmod(path, stat.isDirectory() ? 0o755 : 0o644);
  if (stat.isDirectory()) {
    for (const entry of await readdir(path)) {
      await makeWritable(join(path, entry));
    }
  }
}

async function createPackage() {
  const workspace = await mkdtemp(join(tmpdir(), "release-actions-pages-publish-"));
  workspaces.push(workspace);
  await writeFile(
    join(workspace, "build.mjs"),
    `
      import { mkdir, writeFile } from "node:fs/promises";
      await mkdir("dist", { recursive: true });
      await writeFile("dist/index.html", "<h1>Third-shot drop lesson</h1>\\n");
    `,
  );
  return buildStaticSiteArtifact({
    workspaceDirectory: workspace,
    buildCommand: "node build.mjs",
    outputDirectory: "dist",
    packageDirectory: "site-package",
    sourceRevision: SOURCE_REVISION,
  });
}

async function writeDeploymentRecord(outputFilePath, overrides = {}) {
  await writeFile(
    outputFilePath,
    [
      JSON.stringify({
        type: "wrangler-session",
        version: 1,
        wrangler_version: WRANGLER_VERSION,
      }),
      JSON.stringify({
        type: "pages-deploy-detailed",
        version: 1,
        pages_project: "shotstep",
        deployment_id: "68cf7fa5-f05f-4dd8-bf89-6bf62f61fd35",
        url: "https://68cf7fa5.shotstep.pages.dev",
        alias: "https://lesson-preview.shotstep.pages.dev",
        environment: "preview",
        production_branch: "main",
        deployment_trigger: { metadata: { commit_hash: SOURCE_REVISION } },
        ...overrides,
      }),
      "",
    ].join("\n"),
  );
}

afterEach(async () => {
  for (const workspace of workspaces.splice(0)) {
    await makeWritable(workspace);
    await rm(workspace, { recursive: true, force: true });
  }
});

describe("Cloudflare Pages static-site publisher", () => {
  it("constructs the exact pinned production deployment and returns provider-neutral evidence", async () => {
    const artifact = await createPackage();
    const runCommand = vi.fn(async ({ outputFilePath }) => {
      await writeDeploymentRecord(outputFilePath, {
        alias: undefined,
        environment: "production",
      });
      return { exitCode: 0, stdout: "decorative output", stderr: "" };
    });

    const result = await publishStaticSiteToCloudflarePages({
      packageDirectory: artifact.packageDirectory,
      projectName: "shotstep",
      deploymentBranch: "main",
      productionBranch: "main",
      environment: {
        CLOUDFLARE_API_TOKEN: "cloudflare-token",
        CLOUDFLARE_ACCOUNT_ID: "cloudflare-account",
        HOME: "/tmp/home",
        PATH: "/usr/bin:/bin",
      },
      runCommand,
    });

    expect(runCommand).toHaveBeenCalledOnce();
    expect(runCommand.mock.calls[0][0]).toMatchObject({
      command: "npx",
      args: [
        "--yes",
        `wrangler@${WRANGLER_VERSION}`,
        "pages",
        "deploy",
        join(artifact.packageDirectory, "site"),
        "--project-name",
        "shotstep",
        "--branch",
        "main",
        "--commit-hash",
        SOURCE_REVISION,
        "--commit-dirty=false",
        "--experimental-provision=false",
        "--experimental-auto-create=false",
      ],
      environment: {
        CI: "true",
        CLOUDFLARE_API_TOKEN: "cloudflare-token",
        CLOUDFLARE_ACCOUNT_ID: "cloudflare-account",
        FORCE_COLOR: "0",
        HOME: "/tmp/home",
        PATH: "/usr/bin:/bin",
        WRANGLER_SEND_ERROR_REPORTS: "false",
        WRANGLER_SEND_METRICS: "false",
      },
    });
    expect(runCommand.mock.calls[0][0].environment.WRANGLER_OUTPUT_FILE_PATH).toBe(
      runCommand.mock.calls[0][0].outputFilePath,
    );
    expect(result).toEqual({
      provider: "cloudflare-pages",
      environment: "production",
      deploymentId: "68cf7fa5-f05f-4dd8-bf89-6bf62f61fd35",
      url: "https://68cf7fa5.shotstep.pages.dev",
      status: "success",
      sourceRevision: SOURCE_REVISION,
      artifactDigest: artifact.manifest.artifactDigest,
    });
  });

  it("keeps preview branches explicit and rejects mismatched structured evidence", async () => {
    const artifact = await createPackage();
    const runCommand = vi.fn(async ({ outputFilePath }) => {
      await writeDeploymentRecord(outputFilePath);
      return { exitCode: 0, stdout: "", stderr: "" };
    });

    const result = await publishStaticSiteToCloudflarePages({
      packageDirectory: artifact.packageDirectory,
      projectName: "shotstep",
      deploymentBranch: "lesson-preview",
      productionBranch: "main",
      environment: {
        CLOUDFLARE_API_TOKEN: "cloudflare-token",
        CLOUDFLARE_ACCOUNT_ID: "cloudflare-account",
      },
      runCommand,
    });

    expect(runCommand.mock.calls[0][0].args).toContain("lesson-preview");
    expect(result.environment).toBe("preview");

    expect(() =>
      parseWranglerOutput(
        `${JSON.stringify({
          type: "pages-deploy-detailed",
          version: 1,
          pages_project: "shotstep",
          deployment_id: "68cf7fa5-f05f-4dd8-bf89-6bf62f61fd35",
          url: "https://68cf7fa5.shotstep.pages.dev",
          environment: "production",
          production_branch: "main",
          deployment_trigger: { metadata: { commit_hash: SOURCE_REVISION } },
        })}\n`,
        {
          projectName: "shotstep",
          expectedEnvironment: "preview",
          productionBranch: "main",
          sourceRevision: SOURCE_REVISION,
        },
      ),
    ).toThrow(/environment did not match/i);
  });

  it("returns actionable errors without exposing provider credentials", async () => {
    const artifact = await createPackage();
    const token = "secret-cloudflare-token";
    const account = "secret-cloudflare-account";
    const runCommand = vi.fn(async ({ outputFilePath }) => {
      await writeFile(
        outputFilePath,
        `${JSON.stringify({
          type: "command-failed",
          version: 1,
          error: `Project was not found for ${account}`,
        })}\n`,
      );
      return {
        exitCode: 1,
        stdout: "",
        stderr: `API token ${token}: Pages project was not found for ${account}`,
      };
    });

    let error;
    try {
      await publishStaticSiteToCloudflarePages({
        packageDirectory: artifact.packageDirectory,
        projectName: "shotstep",
        deploymentBranch: "main",
        productionBranch: "main",
        environment: {
          CLOUDFLARE_API_TOKEN: token,
          CLOUDFLARE_ACCOUNT_ID: account,
        },
        runCommand,
      });
    } catch (caught) {
      error = caught;
    }
    expect(error?.message).toMatch(/pages project was not found/i);
    expect(error?.message).toMatch(/exit code 1/i);
    expect(error?.message).not.toContain(token);
    expect(error?.message).not.toContain(account);
  });

  it("refuses unsupported artifacts before any Cloudflare mutation", async () => {
    const artifact = await createPackage();
    const manifestPath = join(artifact.packageDirectory, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    await chmod(manifestPath, 0o644);
    await writeFile(
      manifestPath,
      `${JSON.stringify({ ...manifest, kind: "server-runtime" })}\n`,
    );
    const runCommand = vi.fn();

    await expect(
      publishStaticSiteToCloudflarePages({
        packageDirectory: artifact.packageDirectory,
        projectName: "shotstep",
        deploymentBranch: "main",
        productionBranch: "main",
        environment: {
          CLOUDFLARE_API_TOKEN: "cloudflare-token",
          CLOUDFLARE_ACCOUNT_ID: "cloudflare-account",
        },
        runCommand,
      }),
    ).rejects.toThrow(/unsupported artifact kind/i);
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("rejects unknown command-line deployment instructions", () => {
    expect(() =>
      parseCloudflarePagesPublisherArguments([
        "--package-directory",
        ".site-package",
        "--project-name",
        "shotstep",
        "--deployment-branch",
        "main",
        "--production-branch",
        "main",
        "--create-project",
        "true",
      ]),
    ).toThrow(/unknown argument: --create-project/i);
  });
});
