# release-actions

Reusable GitHub Actions workflow for Expo releases. The v2 workflow runs its
project commands on Node 24 and publishes the same release lifecycle to:

- one Discord forum thread; and
- one Slack root message with the later build, submit, and final updates in its
  thread.

Slack is best effort. A missing token, missing root timestamp, or Slack API
failure produces a visible GitHub warning and step-summary entry, but does not
change the EAS build or submission result. Discord keeps the v1 behavior during
the dual-publisher proof.

The existing v1 tag remains the Discord-only contract for callers that have not
migrated.

## What a v2 caller needs

1. A Discord forum webhook.
2. A Slack bot with only `chat:write`, invited to the chosen release channel.
3. Three repository secrets:
   - `EXPO_TOKEN` — the Expo access token used by EAS.
   - `DISCORD_WEBHOOK_URL` — the Discord forum webhook.
   - `SLACK_BOT_TOKEN` — the restricted Slack bot token.
4. The Slack channel ID as ordinary, non-secret workflow configuration.

The reusable workflow installs caller project dependencies before `eas build`
and `eas submit`. It uses `pnpm install --frozen-lockfile` when
`pnpm-lock.yaml` is present, `npm ci` for npm lockfiles, and Yarn when
`yarn.lock` is present.

## Caller workflow

Pin the published v2 commit in a real caller. The version comment keeps the
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
    # release-actions v2.0.0
    uses: adamu-personal-apps/release-actions/.github/workflows/expo-release.yml@REPLACE_WITH_V2_COMMIT
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
      DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
      SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
```

## Inputs

| input              | default      | purpose                                         |
| ------------------ | ------------ | ----------------------------------------------- |
| `project_name`     | —            | display name in both destinations               |
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
candidate. It opens one Discord test thread and one Slack test thread, posts a
pickleball-themed lifecycle to both, and exercises an expected Slack warning
with an invalid channel. The warning step must continue successfully.

The proof repository needs `DISCORD_WEBHOOK_URL` and `SLACK_BOT_TOKEN` as
Actions secrets, plus `RELEASE_SLACK_CHANNEL_ID` as an Actions variable. The
workflow records its exact candidate commit and Node version in the run summary.
It contains no Expo token, dependency install, EAS build, or EAS submission
step.

## How it works

The reusable workflow runs four jobs: `announce` → `build` → `submit` →
`finalize`. `announce` opens both destinations and passes their thread
identifiers to later jobs. Small tested Node scripts own message content and the
Slack request. Discord and Slack keep separate transports.

Every third-party GitHub action is pinned to a reviewed commit. The v2 workflow
also checks out its helper scripts from `v2.0.0`, so the published workflow and
tools resolve to the same implementation.

## Known limitation

With `platform: all`, if one platform's build fails, submit is skipped for both
platforms because submit depends on the whole build matrix. The default
single-platform path is unaffected.
