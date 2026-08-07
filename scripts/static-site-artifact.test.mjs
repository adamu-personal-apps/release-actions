import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildStaticSiteArtifact,
  parseStaticSiteArtifactArguments,
  verifyStaticSiteArtifact,
} from "./static-site-artifact.mjs";

const SOURCE_REVISION = "0123456789abcdef0123456789abcdef01234567";
const workspaces = [];

async function createWorkspace() {
  const workspace = await mkdtemp(join(tmpdir(), "release-actions-static-site-"));
  workspaces.push(workspace);
  return workspace;
}

async function makeWritable(path) {
  let stat;
  try {
    stat = await lstat(path);
  } catch {
    return;
  }

  if (stat.isDirectory()) {
    await chmod(path, 0o755);
    for (const entry of await readdir(path)) {
      await makeWritable(join(path, entry));
    }
  } else {
    await chmod(path, 0o644);
  }
}

async function writePickleballBuild(workspace, extraSource = "") {
  await writeFile(
    join(workspace, "build.mjs"),
    `
      import { mkdir, writeFile } from "node:fs/promises";
      await mkdir("dist/.well-known", { recursive: true });
      await writeFile("dist/index.html", "<h1>Third-shot drop practice</h1>\\n");
      await writeFile("dist/.well-known/apple-app-site-association", "pickleball-coach-app\\n");
      await writeFile("dist/provider-access.txt", process.env.CLOUDFLARE_API_TOKEN ?? "unavailable");
      await writeFile("dist/public-release-config.txt", [
        process.env.SHOTSTEP_ANDROID_RELEASE_SHA256 ?? "missing",
        process.env.EXPO_PUBLIC_SUPABASE_URL ?? "missing",
        process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "missing",
      ].join("\\n"));
      ${extraSource}
    `,
  );
}

afterEach(async () => {
  for (const workspace of workspaces.splice(0)) {
    await makeWritable(workspace);
    await rm(workspace, { recursive: true, force: true });
  }
});

describe("static-site artifact builder", () => {
  it("runs a provider-free build and creates a stable immutable package with hidden paths", async () => {
    const workspace = await createWorkspace();
    await writePickleballBuild(workspace);

    const first = await buildStaticSiteArtifact({
      workspaceDirectory: workspace,
      buildCommand: "node build.mjs",
      outputDirectory: "dist",
      packageDirectory: "site-package-one",
      sourceRevision: SOURCE_REVISION,
      environment: {
        ...process.env,
        CLOUDFLARE_API_TOKEN: "cloudflare-provider-credential",
        CLOUDFLARE_ACCOUNT_ID: "provider-account",
        SHOTSTEP_ANDROID_RELEASE_SHA256: "sha256:third-shot-drop",
        EXPO_PUBLIC_SUPABASE_URL: "https://pickleball.example.supabase.co",
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-pickleball-key",
      },
    });

    const second = await buildStaticSiteArtifact({
      workspaceDirectory: workspace,
      buildCommand: "node build.mjs",
      outputDirectory: "dist",
      packageDirectory: "site-package-two",
      sourceRevision: SOURCE_REVISION,
      environment: {
        ...process.env,
        CLOUDFLARE_API_TOKEN: "cloudflare-provider-credential",
        SHOTSTEP_ANDROID_RELEASE_SHA256: "sha256:third-shot-drop",
        EXPO_PUBLIC_SUPABASE_URL: "https://pickleball.example.supabase.co",
        EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-pickleball-key",
      },
    });

    expect(first.manifest).toEqual({
      schemaVersion: 1,
      kind: "static-directory",
      sourceRevision: SOURCE_REVISION,
      artifactDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
    expect(second.manifest).toEqual(first.manifest);
    expect(
      await readFile(
        join(workspace, "site-package-one/site/.well-known/apple-app-site-association"),
        "utf8",
      ),
    ).toBe("pickleball-coach-app\n");
    expect(
      await readFile(join(workspace, "site-package-one/site/provider-access.txt"), "utf8"),
    ).toBe("unavailable");
    expect(
      await readFile(join(workspace, "site-package-one/site/public-release-config.txt"), "utf8"),
    ).toBe([
      "sha256:third-shot-drop",
      "https://pickleball.example.supabase.co",
      "public-pickleball-key",
    ].join("\n"));
    expect(
      (await lstat(join(workspace, "site-package-one/manifest.json"))).mode &
        0o222,
    ).toBe(0);
    expect(
      (await lstat(join(workspace, "site-package-one/site"))).mode & 0o222,
    ).toBe(0);

    await expect(
      verifyStaticSiteArtifact({
        packageDirectory: join(workspace, "site-package-one"),
      }),
    ).resolves.toEqual(first.manifest);
  });

  it("rejects missing output and output paths that escape the workspace", async () => {
    const workspace = await createWorkspace();

    await expect(
      buildStaticSiteArtifact({
        workspaceDirectory: workspace,
        buildCommand: "node -e \"process.stdout.write('Volley drill complete')\"",
        outputDirectory: "dist",
        packageDirectory: "site-package",
        sourceRevision: SOURCE_REVISION,
      }),
    ).rejects.toThrow(/output directory does not exist/i);

    await expect(
      buildStaticSiteArtifact({
        workspaceDirectory: workspace,
        buildCommand: "node -e \"process.stdout.write('Dink drill complete')\"",
        outputDirectory: "../outside",
        packageDirectory: "site-package",
        sourceRevision: SOURCE_REVISION,
      }),
    ).rejects.toThrow(/must stay inside the workspace/i);
  });

  it("rejects links that leave the declared static directory", async () => {
    const workspace = await createWorkspace();
    await mkdir(join(workspace, "dist"));
    await writeFile(join(workspace, "private-coach-note.txt"), "Do not publish");
    await symlink("../private-coach-note.txt", join(workspace, "dist/leaked-note.txt"));

    await expect(
      buildStaticSiteArtifact({
        workspaceDirectory: workspace,
        buildCommand: "node -e \"process.stdout.write('Serve return drill')\"",
        outputDirectory: "dist",
        packageDirectory: "site-package",
        sourceRevision: SOURCE_REVISION,
      }),
    ).rejects.toThrow(/link target must stay inside the static output/i);
  });

  it("rejects hard links that could alias files outside the static directory", async () => {
    const workspace = await createWorkspace();
    await mkdir(join(workspace, "dist"));
    await writeFile(join(workspace, "private-coach-note.txt"), "Do not publish");
    await link(
      join(workspace, "private-coach-note.txt"),
      join(workspace, "dist/leaked-note.txt"),
    );

    await expect(
      buildStaticSiteArtifact({
        workspaceDirectory: workspace,
        buildCommand: "node -e \"process.stdout.write('Backhand reset drill')\"",
        outputDirectory: "dist",
        packageDirectory: "site-package",
        sourceRevision: SOURCE_REVISION,
      }),
    ).rejects.toThrow(/must not contain hard-linked files/i);
  });

  it("materializes safe internal links without leaving links in the package", async () => {
    const workspace = await createWorkspace();
    await mkdir(join(workspace, "dist/assets"), { recursive: true });
    await writeFile(join(workspace, "dist/assets/drop-shot.txt"), "Relaxed grip");
    await symlink("assets/drop-shot.txt", join(workspace, "dist/tip.txt"));

    await buildStaticSiteArtifact({
      workspaceDirectory: workspace,
      buildCommand: "node -e \"process.stdout.write('Kitchen-line drill')\"",
      outputDirectory: "dist",
      packageDirectory: "site-package",
      sourceRevision: SOURCE_REVISION,
    });

    expect(await readFile(join(workspace, "site-package/site/tip.txt"), "utf8")).toBe(
      "Relaxed grip",
    );
    expect(
      (
        await lstat(join(workspace, "site-package/site/tip.txt"))
      ).isSymbolicLink(),
    ).toBe(false);
  });

  it("rejects unknown manifest fields, schema drift, and digest changes", async () => {
    const workspace = await createWorkspace();
    await writePickleballBuild(workspace);
    await buildStaticSiteArtifact({
      workspaceDirectory: workspace,
      buildCommand: "node build.mjs",
      outputDirectory: "dist",
      packageDirectory: "site-package",
      sourceRevision: SOURCE_REVISION,
    });

    const packageDirectory = join(workspace, "site-package");
    const manifestPath = join(packageDirectory, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    await chmod(manifestPath, 0o644);
    await writeFile(
      manifestPath,
      `${JSON.stringify({ ...manifest, provider: "cloudflare" })}\n`,
    );
    await expect(verifyStaticSiteArtifact({ packageDirectory })).rejects.toThrow(
      /unknown manifest field: provider/i,
    );

    await writeFile(manifestPath, `${JSON.stringify({ ...manifest, schemaVersion: 2 })}\n`);
    await expect(verifyStaticSiteArtifact({ packageDirectory })).rejects.toThrow(
      /unsupported manifest schema version/i,
    );

    await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
    const indexPath = join(packageDirectory, "site/index.html");
    await chmod(indexPath, 0o644);
    await writeFile(indexPath, "<h1>Changed serve practice</h1>\n");
    await expect(verifyStaticSiteArtifact({ packageDirectory })).rejects.toThrow(
      /artifact digest does not match/i,
    );
  });

  it("fails closed without echoing secret-like build output", async () => {
    const workspace = await createWorkspace();
    const messages = [];
    await mkdir(join(workspace, "dist"));

    await expect(
      buildStaticSiteArtifact({
        workspaceDirectory: workspace,
        buildCommand:
          "node -e \"process.stdout.write(['CLOUDFLARE_API_TO', 'KEN=should-never-appear'].join(''))\"",
        outputDirectory: "dist",
        packageDirectory: "site-package",
        sourceRevision: SOURCE_REVISION,
        logger: (message) => messages.push(message),
      }),
    ).rejects.toThrow(/secret-like output/i);
    expect(messages.join("\n")).not.toContain("should-never-appear");
  });

  it(
    "rejects secret-like command values and escaping package paths before running the build",
    async () => {
      const workspace = await createWorkspace();
      const markerPath = join(workspace, "build-ran.txt");

      await expect(
        buildStaticSiteArtifact({
          workspaceDirectory: workspace,
          buildCommand:
            "node -e \"require('node:fs').writeFileSync('build-ran.txt', 'TOKEN=private-value')\"",
          outputDirectory: "dist",
          packageDirectory: "site-package",
          sourceRevision: SOURCE_REVISION,
        }),
      ).rejects.toThrow(/secret-like value/i);
      await expect(readFile(markerPath, "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });

      await expect(
        buildStaticSiteArtifact({
          workspaceDirectory: workspace,
          buildCommand:
            "node -e \"require('node:fs').writeFileSync('build-ran.txt', 'ran')\"",
          outputDirectory: "dist",
          packageDirectory: "../site-package",
          sourceRevision: SOURCE_REVISION,
        }),
      ).rejects.toThrow(/package directory must stay inside the workspace/i);
      await expect(readFile(markerPath, "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });
    },
  );

  it("rejects unknown command-line fields", () => {
    expect(() =>
      parseStaticSiteArtifactArguments([
        "build",
        "--command",
        "pnpm site:prepare",
        "--output-directory",
        ".site-dist",
        "--package-directory",
        ".site-package",
        "--source-revision",
        SOURCE_REVISION,
        "--provider",
        "cloudflare",
      ]),
    ).toThrow(/unknown argument: --provider/i);
  });
});
