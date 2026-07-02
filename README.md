# release-actions

Reusable GitHub Actions workflow that announces Expo releases to a Discord
**forum** channel and tracks the full `eas build` + `eas submit` lifecycle in a
per-release thread.

## What a caller needs

1. A **Discord Forum channel** with a webhook. Copy the webhook URL.
2. Two repo secrets:
   - `EXPO_TOKEN` — an Expo access token. The account it belongs to selects
     business vs personal (and supplies EAS-hosted submit credentials).
   - `DISCORD_WEBHOOK_URL` — the forum webhook URL.
3. A thin caller workflow (below).

The reusable workflow installs caller project dependencies before `eas build`
and `eas submit`. It uses `pnpm install --frozen-lockfile` when
`pnpm-lock.yaml` is present, `npm ci` for npm lockfiles, and Yarn when
`yarn.lock` is present.

## Caller workflow

```yaml
name: Release
on:
  push:
    tags: ['v*']
  workflow_dispatch:
    inputs:
      version:    { type: string }
      summary:    { type: string }
      platform:   { type: choice, options: [ios, android, all], default: ios }
      skip_build: { type: boolean, default: false }

jobs:
  release:
    uses: adamu-personal-apps/release-actions/.github/workflows/expo-release.yml@v1
    with:
      project_name: My App
      profile:      personal          # or business
      platform:     ${{ inputs.platform || 'ios' }}
      version:      ${{ inputs.version }}
      summary:      ${{ inputs.summary }}
      skip_build:   ${{ inputs.skip_build || false }}
    secrets:
      EXPO_TOKEN:          ${{ secrets.EXPO_TOKEN }}
      DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
```

## Releasing

- Auto: `npm version patch` (bumps package.json + creates `vX.Y.Z` tag), then
  `git push --follow-tags`.
- Manual: run the caller workflow via **workflow_dispatch**; set `skip_build:
  true` to retry a submit against the last EAS build.

## Inputs

| input | default | purpose |
|-------|---------|---------|
| `project_name` | — | display name in Discord |
| `profile` | — | `business` \| `personal` (🏢/👤 tag only) |
| `platform` | `ios` | `ios` \| `android` \| `all` |
| `build_profile` | `production` | eas.json build profile |
| `submit_profile` | `production` | eas.json submit profile |
| `version` | derived | override; else tag or package.json |
| `summary` | auto git-log | override |
| `skip_build` | `false` | submit-only mode (`eas submit --latest`) |
| `node_version` | `lts/*` | runner Node version |

## How it works

The reusable workflow runs four jobs: `announce` → `build` → `submit` →
`finalize` (the last with `if: always()`). `announce` opens the forum thread and
passes its `thread_id` to later jobs; each build/submit event posts one reply
into that thread. All message text is built by small tested Node scripts in
`scripts/`; the workflow checks this repo out into `.tools/` so those scripts are
reachable from the caller's workspace. Dependency installation also runs from
`.tools/`, but it installs the checked-out caller app using that app's lockfile.

## Known limitations

- With `platform: all`, if one platform's build fails, submit is skipped for
  **both** (job-level `needs.build.result`). Default `ios` is unaffected.
