import { appendFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSummary } from "./build-summary.mjs";
import { changelogSummary } from "./changelog-summary.mjs";

/**
 * Pick the release summary, best source first:
 *
 *   1. supplied    — a human wrote it for this release; always wins.
 *   2. changelog   — the CHANGELOG section for this version. commit-and-tag-
 *                    version already drops chore/docs/test and groups the rest
 *                    under Features / Bug Fixes / Performance, so this is real
 *                    prose at no extra cost.
 *   3. commit-log  — raw commit subjects. LAST RESORT, for repos with no
 *                    changelog: it happily ships "chore(release): 2.1.1" and
 *                    other bookkeeping to humans.
 *
 * Pass `withSource: true` to get `{ summary, source }` instead of the bare
 * string, so callers can log which one they landed on.
 */
export function selectReleaseSummary({
  suppliedSummary = "",
  changelogSummary: changelogText = null,
  subjects = [],
  withSource = false,
}) {
  const supplied = String(suppliedSummary ?? "");
  const changelog = String(changelogText ?? "");

  let summary;
  let source;
  if (supplied.trim().length > 0) {
    summary = supplied;
    source = "supplied";
  } else if (changelog.trim().length > 0) {
    summary = changelog;
    source = "changelog";
  } else {
    summary = buildSummary(subjects);
    source = "commit-log";
  }

  return withSource ? { summary, source } : summary;
}

/** CHANGELOG text, or "" when the repo has none (not an error — see source 3). */
export async function readChangelog(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

function delimiterFor(summary, randomId) {
  const lines = new Set(summary.split(/\r?\n/));

  while (true) {
    const delimiter = `__RELEASE_SUMMARY_${randomId()}__`;
    if (!lines.has(delimiter)) return delimiter;
  }
}

export async function writeReleaseSummaryOutput({
  outputPath,
  summary,
  randomId = randomUUID,
}) {
  if (!outputPath) throw new Error("GITHUB_OUTPUT is required.");

  const delimiter = delimiterFor(summary, randomId);
  await appendFile(
    outputPath,
    `summary<<${delimiter}\n${summary}\n${delimiter}\n`,
    "utf8",
  );
}

async function readStandardInput() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const subjects = (await readStandardInput()).split(/\r?\n/);
  const changelogPath = process.env.CHANGELOG_PATH || "CHANGELOG.md";
  const { summary, source } = selectReleaseSummary({
    suppliedSummary: process.env.IN_SUMMARY,
    changelogSummary: changelogSummary(await readChangelog(changelogPath), process.env.VERSION),
    subjects,
    withSource: true,
  });

  // Visible in the Actions log so a release that fell back to bare commit
  // subjects is obvious at a glance rather than only in the notification.
  console.log(`release summary source: ${source}`);
  if (source === "commit-log") {
    console.log(
      `::warning::No summary supplied and no CHANGELOG section for ${process.env.VERSION || "this version"} ` +
        `in ${changelogPath}; falling back to raw commit subjects.`,
    );
  }

  await writeReleaseSummaryOutput({
    outputPath: process.env.GITHUB_OUTPUT,
    summary,
  });
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
