import { appendFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildSummary } from "./build-summary.mjs";

export function selectReleaseSummary({ suppliedSummary = "", subjects = [] }) {
  return suppliedSummary.trim().length > 0
    ? suppliedSummary
    : buildSummary(subjects);
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
  const summary = selectReleaseSummary({
    suppliedSummary: process.env.IN_SUMMARY,
    subjects,
  });

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
