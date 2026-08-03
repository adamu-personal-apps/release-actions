# release-actions

Reusable GitHub Actions workflow for Expo releases. The v3 workflow runs its
project commands on Node 24 and publishes one Slack root message with later
build, submit, and final updates in its thread.

Slack is best effort. A missing token, missing root timestamp, or Slack API
failure produces a visible GitHub warning and step-summary entry, but does not
change the EAS build or submission result.

The existing v1 and v2 tags remain unchanged for callers that have not migrated.

## What a v3 caller needs

1. A Slack bot with only `chat:write`, invited to the chosen release channel.
2. Two repository secrets:
   - `EXPO_TOKEN` — the Expo access token used by EAS.
   - `SLACK_BOT_TOKEN` — the restricted Slack bot token.
3. The Slack channel ID as ordinary, non-secret workflow configuration.

The reusable workflow installs caller project dependencies before `eas build`
and `eas submit`. It uses `pnpm install --frozen-lockfile` when `pnpm-lock.yaml`
is present, `npm ci` for npm lockfiles, and Yarn when `yarn.lock` is present.

## Caller workflow

Pin the published v3 commit in a real caller. The version comment keeps the
otherwise opaque commit readable:

```yaml
name: Release
on:
  push:
    tags: ["v*"]
  workflow_dispatch:
    inputs:
      version: { type: string }
      summary: { type: string }
      platform: { type: choice, options: [ios, android, all], default: ios }
      skip_build: { type: boolean, default: false }

jobs:
  release:
    # release-actions v3.0.0
    uses: adamu-personal-apps/release-actions/.github/workflows/expo-release.yml@V3_COMMIT_SHA
    with:
      project_name: My App
      profile: personal
      platform: ${{ inputs.platform || 'ios' }}
      version: ${{ inputs.version }}
      summary: ${{ inputs.summary }}
      skip_build: ${{ inputs.skip_build || false }}
      slack_channel_id: C0123456789
    secrets:
      EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
      SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
```

## Inputs

| input              | default      | purpose                                         |
| ------------------ | ------------ | ----------------------------------------------- |
| `project_name`     | —            | display name                                    |
| `profile`          | —            | `business` or `personal` label                  |
| `platform`         | `ios`        | `ios`, `android`, or `all`                      |
| `build_profile`    | `production` | EAS build profile                               |
| `submit_profile`   | `production` | EAS submit profile                              |
| `version`          | derived      | override; otherwise the tag or package version  |
| `summary`          | git log      | optional manual release summary                 |
| `skip_build`       | `false`      | resolve one finished build for the requested profile and submit its exact ID without creating a new build |
| `slack_channel_id` | empty        | non-secret Slack destination                    |

The workflow owns Node 24. Callers cannot select an older Node runtime.

## Hosted publisher proof

`publisher-smoke.yml` is a manual GitHub-hosted proof for a release-actions
candidate. It opens one Slack test thread, posts a pickleball-themed lifecycle,
and exercises an expected Slack warning with an invalid channel. The warning
step must continue successfully.

The proof repository needs `SLACK_BOT_TOKEN` as an Actions secret and
`RELEASE_SLACK_CHANNEL_ID` as an Actions variable. The workflow records its
exact candidate commit and Node version in the run summary. It contains no Expo
token, dependency install, EAS build, or EAS submission step.

## How it works

The reusable workflow runs three jobs: `announce` → `release` → `finalize`.
`announce` opens the Slack root and passes its timestamp to later jobs. Each
platform gets one release leg that selects or creates one build, records its
exact EAS ID, and submits that same ID. Small tested Node scripts own build
selection, submission arguments, message content, and the Slack request.

Every third-party GitHub action is pinned to a reviewed commit. The v3 workflow
also checks out its helper scripts from the reviewed commit named by
`ACTIONS_REF`, so the published workflow and tools resolve to compatible
implementations.

## Known limitation

With `platform: all`, iOS and Android run as separate matrix legs. One platform
can reach its store even if the other platform fails. The final release status
still fails so the incomplete platform remains visible.

## Static-site artifact boundary

The provider-free static-site helper runs a caller-owned build command, then
packages only its declared output directory. The package always has this shape:

```text
site-package/
├── manifest.json
└── site/
```

`manifest.json` has exactly four fields: schema version, the
`static-directory` kind, the full source revision, and a SHA-256 content
digest. Hidden paths such as `.well-known` are included. Links that leave the
declared output and hard-linked files fail; safe internal symbolic links are
copied as ordinary files or directories so the package itself contains no
links.

Build code receives a small allowlist of ordinary process settings such as
`PATH`, `HOME`, and `CI`. Provider credentials and other inherited variables
are not passed to it. Secret-like command values or captured logs fail closed,
and captured unsafe output is never printed.

Build and verify a package with:

```bash
npm run static-site-artifact -- build \
  --command "pnpm site:prepare" \
  --output-directory ".site-dist" \
  --package-directory ".site-package" \
  --source-revision "$GITHUB_SHA"

npm run static-site-artifact -- verify \
  --package-directory ".site-package"
```

The verifier rejects extra package entries, unknown manifest fields, unsupported
schema versions or artifact kinds, symbolic links, and content whose digest no
longer matches. Provider publishing is intentionally a separate concern.

## Cloudflare Pages publisher boundary

The Cloudflare Pages helper accepts only a package that passes the static-site
verifier plus an existing project name, deployment branch, and production
branch. It runs pinned Wrangler `4.118.0` with only the Cloudflare API token,
account ID, and ordinary process settings. Automatic project or resource
creation is disabled, and the artifact's source revision is attached to the
deployment.

```bash
npm run cloudflare-pages-publisher -- \
  --package-directory ".site-package" \
  --project-name "shotstep" \
  --deployment-branch "main" \
  --production-branch "main"
```

The command ignores Wrangler's decorative console text. It reads Wrangler's
structured deployment record and checks the project, production or preview
environment, production branch, and source revision before returning one JSON
object with the provider, environment, deployment ID, URL, success status,
source revision, and artifact digest. Errors redact the provided token and
account ID. Project creation, domain or DNS changes, and build execution are not
part of this helper.
