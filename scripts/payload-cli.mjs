// Usage: node payload-cli.mjs <kind>
// kind: title | body | update | final. Params come from env vars.
// Prints the resulting text (no trailing newline) to stdout.
import { openTitle, openBody, updateLine, finalLine } from './build-payload.mjs';

const kind = process.argv[2];
const e = process.env;
let out;
switch (kind) {
  case 'title':
    out = openTitle({ projectName: e.PROJECT_NAME, version: e.VERSION, profile: e.PROFILE });
    break;
  case 'body':
    out = openBody({ trigger: e.TRIGGER, profile: e.PROFILE, summary: e.SUMMARY });
    break;
  case 'update':
    out = updateLine({
      platform: e.PLATFORM,
      event: e.EVENT,
      status: e.STATUS,
      url: e.URL ? e.URL : undefined,
    });
    break;
  case 'final':
    out = finalLine({ version: e.VERSION, ok: e.OK === 'true', stage: e.STAGE });
    break;
  default:
    console.error(`Unknown kind: ${kind}`);
    process.exit(1);
}
process.stdout.write(out);
