// Reads commit subjects from stdin (one per line), prints the summary block.
import { buildSummary } from './build-summary.mjs';

let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (data += c));
process.stdin.on('end', () => {
  process.stdout.write(buildSummary(data.split('\n')));
});
