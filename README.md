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
| `skip_build`       | `false`      | submit the latest EAS build without a new build |
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

The reusable workflow runs four jobs: `announce` → `build` → `submit` →
`finalize`. `announce` opens the Slack root and passes its timestamp to later
jobs. Small tested Node scripts own message content and the Slack request.

Every third-party GitHub action is pinned to a reviewed commit. The v3 workflow
also checks out its helper scripts from `v3.0.0`, so the published workflow and
tools resolve to the same implementation.

## Known limitation

With `platform: all`, if one platform's build fails, submit is skipped for both
platforms because submit depends on the whole build matrix. The default
single-platform path is unaffected.
