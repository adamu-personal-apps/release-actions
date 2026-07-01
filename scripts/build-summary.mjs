// Pure: turn commit subject lines into a Discord-ready bullet block.
// No git, no I/O — just string logic, so it is trivially testable.

/**
 * @param {string[]} subjects commit subject lines (newest first)
 * @returns {string} bullet block, or "Initial release" when empty
 */
export function buildSummary(subjects) {
  const cleaned = subjects.map((s) => s.trim()).filter((s) => s.length > 0);
  if (cleaned.length === 0) return 'Initial release';
  return cleaned.map((s) => `- ${s}`).join('\n');
}
