// Pure: pull one version's section out of a Keep-a-Changelog / conventional-
// changelog CHANGELOG.md and render it as a release summary. No git, no I/O.
//
// WHY: without a supplied summary the release pipeline used to fall back to raw
// commit subjects, which ships things like "chore(release): 2.1.1" and
// "chore(beads): record the investigation" to humans. commit-and-tag-version
// already writes a CHANGELOG that drops chore/docs/test and groups what is left
// under Features / Bug Fixes / Performance — strictly better prose, produced
// with no extra human step. Prefer it, and keep commit subjects as the last
// resort for repos that have no changelog at all.

/** Matches `## [1.2.3](link) (date)` and bare `## 1.2.3`, with an optional v. */
const HEADING = /^##\s+(?:\[)?v?([0-9][^\]\s)]*)(?:\])?/;

/** Trailing conventional-changelog commit link: ` ([abc1234](https://…))`. */
const COMMIT_LINK = /\s*\(\[[0-9a-f]{6,40}\]\([^)]*\)\)\s*$/i;

function normaliseVersion(version) {
  return String(version ?? "").trim().replace(/^v/, "");
}

/**
 * The raw lines of `version`'s section, exclusive of its own heading and of the
 * next version heading. Returns [] when that version has no section.
 *
 * @param {string} changelog full CHANGELOG.md text
 * @param {string} version e.g. "2.1.1" or "v2.1.1"
 */
export function changelogSectionLines(changelog, version) {
  const wanted = normaliseVersion(version);
  if (wanted.length === 0) return [];

  const lines = String(changelog ?? "").split(/\r?\n/);
  const collected = [];
  let inSection = false;

  for (const line of lines) {
    const heading = HEADING.exec(line);
    if (heading) {
      // A version heading always ends the previous section; it starts ours only
      // when the version matches. Anything deeper (### Features) is content.
      if (inSection) break;
      inSection = normaliseVersion(heading[1]) === wanted;
      continue;
    }
    if (inSection) collected.push(line);
  }

  return collected;
}

/**
 * Render `version`'s changelog section as a summary, or null when there is no
 * such section (or it holds nothing but whitespace) so the caller can fall
 * back. Section headings keep their words but lose their `#` markers, bullets
 * are normalised to `-`, and the trailing commit links are dropped — they are
 * noise in a chat notification and the release already links the tag.
 *
 * @param {string} changelog full CHANGELOG.md text
 * @param {string} version e.g. "2.1.1"
 * @returns {string | null}
 */
export function changelogSummary(changelog, version) {
  const rendered = [];

  for (const line of changelogSectionLines(changelog, version)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      // Collapse blank runs, and never lead with one.
      if (rendered.length > 0 && rendered[rendered.length - 1] !== "") rendered.push("");
      continue;
    }
    const heading = /^#{3,}\s+(.*)$/.exec(trimmed);
    if (heading) {
      rendered.push(heading[1].trim());
      continue;
    }
    const bullet = /^[*-]\s+(.*)$/.exec(trimmed);
    rendered.push(bullet ? `- ${bullet[1].replace(COMMIT_LINK, "").trim()}` : trimmed.replace(COMMIT_LINK, "").trim());
  }

  while (rendered.length > 0 && rendered[rendered.length - 1] === "") rendered.pop();
  return rendered.length > 0 ? rendered.join("\n") : null;
}
