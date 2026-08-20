import { describe, expect, it } from "vitest";
import { changelogSectionLines, changelogSummary } from "./changelog-summary.mjs";

// A real commit-and-tag-version CHANGELOG, trimmed. Note the double blank line
// after the heading and the trailing commit links — both are what that tool
// actually emits, so the parser has to cope with them rather than a tidied
// fixture.
const CHANGELOG = `# Changelog

All notable changes to this project are documented here.

## [2.1.1](https://github.com/o/r/compare/v2.1.0...v2.1.1) (2026-08-19)


### Performance

* **sync:** push 16 records at once behind a watermarked feed reader ([4628d8d](https://github.com/o/r/commit/4628d8d))

## [2.1.0](https://github.com/o/r/compare/v2.0.0...v2.1.0) (2026-08-16)


### Features

* **lisp:** cli harness runs fennel scripts ([37bbbd1](https://github.com/o/r/commit/37bbbd1))


### Bug Fixes

* **detail:** first tap reaches the chip ([9258f45](https://github.com/o/r/commit/9258f45))

## 1.0.0 (2026-01-01)

* initial cut
`;

describe("changelogSectionLines", () => {
  it("stops at the next version heading", () => {
    const lines = changelogSectionLines(CHANGELOG, "2.1.1").join("\n");
    expect(lines).toContain("watermarked feed reader");
    expect(lines).not.toContain("fennel scripts");
  });

  it("keeps every subsection of a multi-section release", () => {
    const lines = changelogSectionLines(CHANGELOG, "2.1.0").join("\n");
    expect(lines).toContain("### Features");
    expect(lines).toContain("### Bug Fixes");
    expect(lines).not.toContain("initial cut");
  });

  it("reads the final section, which no heading follows", () => {
    expect(changelogSectionLines(CHANGELOG, "1.0.0").join("\n")).toContain("initial cut");
  });

  it("matches a bare heading with no link", () => {
    expect(changelogSectionLines("## 3.0.0\n\n* thing\n", "3.0.0")).toContain("* thing");
  });

  it("tolerates a v prefix on either side", () => {
    expect(changelogSectionLines(CHANGELOG, "v2.1.1").join("\n")).toContain("watermarked");
    expect(changelogSectionLines("## v4.0.0\n\n* thing\n", "4.0.0")).toContain("* thing");
  });

  it("returns nothing for an unknown version", () => {
    expect(changelogSectionLines(CHANGELOG, "9.9.9")).toEqual([]);
  });

  it("returns nothing when no version is given", () => {
    expect(changelogSectionLines(CHANGELOG, "")).toEqual([]);
    expect(changelogSectionLines(CHANGELOG, undefined)).toEqual([]);
  });

  it("does not confuse 2.1.1 with 2.1.10", () => {
    const text = "## [2.1.10](l) (d)\n\n* ten\n\n## [2.1.1](l) (d)\n\n* one\n";
    expect(changelogSectionLines(text, "2.1.1").join("\n")).toContain("one");
    expect(changelogSectionLines(text, "2.1.1").join("\n")).not.toContain("ten");
  });
});

describe("changelogSummary", () => {
  it("renders a section as headings plus normalised bullets, without commit links", () => {
    expect(changelogSummary(CHANGELOG, "2.1.1")).toBe(
      "Performance\n\n- **sync:** push 16 records at once behind a watermarked feed reader",
    );
  });

  it("keeps multiple subsections in order", () => {
    expect(changelogSummary(CHANGELOG, "2.1.0")).toBe(
      [
        "Features",
        "",
        "- **lisp:** cli harness runs fennel scripts",
        "",
        "Bug Fixes",
        "",
        "- **detail:** first tap reaches the chip",
      ].join("\n"),
    );
  });

  it("returns null for an unknown version so the caller can fall back", () => {
    expect(changelogSummary(CHANGELOG, "9.9.9")).toBeNull();
  });

  it("returns null for a section that holds only whitespace", () => {
    expect(changelogSummary("## [5.0.0](l) (d)\n\n\n## [4.0.0](l) (d)\n\n* x\n", "5.0.0")).toBeNull();
  });

  it("never leads or trails with a blank line", () => {
    const summary = changelogSummary(CHANGELOG, "2.1.1");
    expect(summary.startsWith("\n")).toBe(false);
    expect(summary.endsWith("\n")).toBe(false);
  });

  it("handles an empty or missing changelog without throwing", () => {
    expect(changelogSummary("", "1.0.0")).toBeNull();
    expect(changelogSummary(undefined, "1.0.0")).toBeNull();
  });
});
