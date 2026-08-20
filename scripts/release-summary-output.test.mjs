import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  selectReleaseSummary,
  writeReleaseSummaryOutput,
} from "./release-summary-output.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function outputPath() {
  const directory = await mkdtemp(join(tmpdir(), "release-summary-output-"));
  temporaryDirectories.push(directory);
  return join(directory, "github-output");
}

describe("selectReleaseSummary", () => {
  it("preserves a supplied multiline pickleball summary instead of commit subjects", () => {
    const suppliedSummary = [
      "- Coaches can review third-shot drop progress at a glance.",
      "- Players keep their cross-court dink homework after reconnecting.",
    ].join("\n");

    expect(
      selectReleaseSummary({
        suppliedSummary,
        subjects: ["fix: refactor query", "test: update snapshots"],
      }),
    ).toBe(suppliedSummary);
  });

  it("uses commit-subject fallback only when the supplied summary is empty", () => {
    expect(
      selectReleaseSummary({
        suppliedSummary: "",
        subjects: ["feat: add serve targets", "fix: keep kitchen notes"],
      }),
    ).toBe("- feat: add serve targets\n- fix: keep kitchen notes");
  });
});

describe("writeReleaseSummaryOutput", () => {
  it("keeps control text inside one collision-safe GitHub output value", async () => {
    const path = await outputPath();
    const summary = [
      "- Preserve the reset drill.",
      "__RELEASE_SUMMARY_collision__",
      "injected=true",
      "::warning title=not-a-command::still summary text",
    ].join("\n");
    const delimiters = ["collision", "safe"];

    await writeReleaseSummaryOutput({
      outputPath: path,
      summary,
      randomId: () => delimiters.shift(),
    });

    expect(await readFile(path, "utf8")).toBe(
      [
        "summary<<__RELEASE_SUMMARY_safe__",
        summary,
        "__RELEASE_SUMMARY_safe__",
        "",
      ].join("\n"),
    );
  });
});

describe("selectReleaseSummary source precedence", () => {
  const changelog = "Performance\n\n- **sync:** first sync is ~25 minutes, not ~6 hours";
  const subjects = ["chore(release): 2.1.1", "perf(sync): push 16 records at once"];

  it("prefers a changelog summary over raw commit subjects", () => {
    expect(selectReleaseSummary({ changelogSummary: changelog, subjects })).toBe(changelog);
  });

  it("still lets an explicitly supplied summary win over the changelog", () => {
    expect(
      selectReleaseSummary({ suppliedSummary: "hand written", changelogSummary: changelog, subjects }),
    ).toBe("hand written");
  });

  it("falls back to commit subjects when there is no changelog section", () => {
    expect(selectReleaseSummary({ changelogSummary: null, subjects })).toBe(
      "- chore(release): 2.1.1\n- perf(sync): push 16 records at once",
    );
  });

  it("treats a whitespace-only changelog summary as absent", () => {
    expect(selectReleaseSummary({ changelogSummary: "   \n  ", subjects })).toBe(
      "- chore(release): 2.1.1\n- perf(sync): push 16 records at once",
    );
  });

  it("still reports the source it chose", () => {
    expect(selectReleaseSummary({ changelogSummary: changelog, subjects, withSource: true })).toEqual({
      summary: changelog,
      source: "changelog",
    });
    expect(selectReleaseSummary({ suppliedSummary: "x", withSource: true }).source).toBe("supplied");
    expect(selectReleaseSummary({ subjects, withSource: true }).source).toBe("commit-log");
  });
});
