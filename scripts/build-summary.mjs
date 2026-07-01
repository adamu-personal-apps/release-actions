// Pure: turn commit subject lines into a Discord-ready bullet block.
// No git, no I/O — just string logic, so it is trivially testable.

/**
 * @param {string[]} subjects commit subject lines (newest first)
 * @param {number} [maxBullets=20] cap; extra commits collapse into one "…and N more" line
 * @returns {string} bullet block, or "Initial release" when empty
 */
export function buildSummary(subjects, maxBullets = 20) {
  const cleaned = subjects.map((s) => s.trim()).filter((s) => s.length > 0);
  if (cleaned.length === 0) return 'Initial release';
  if (cleaned.length <= maxBullets) return cleaned.map((s) => `- ${s}`).join('\n');
  const shown = cleaned.slice(0, maxBullets).map((s) => `- ${s}`);
  shown.push(`- …and ${cleaned.length - maxBullets} more`);
  return shown.join('\n');
}
