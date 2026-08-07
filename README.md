# release-actions

Reusable GitHub Actions workflow for artifact-aware Expo releases. It runs
caller project commands on Node 24, selects an explicit canonical subset of
iOS, Android, and static-site artifacts, and publishes one lifecycle thread.
The Expo manifest owner chooses the publisher: the configured business owner
uses Slack; every other owner uses Discord.

Slack and Discord are best effort. A missing credential, root-thread ID, or
provider API failure produces a visible GitHub warning and step-summary entry,
but does not change release delivery.

The existing v1 and v2 tags remain unchanged for callers that have not migrated.

## What an artifact-aware caller needs

1. `EXPO_TOKEN` as a repository secret for any selected mobile artifact.
2. A `business_owner` input matching the business Expo manifest owner. Its
   notifications use a restricted Slack bot (`SLACK_BOT_TOKEN`) and
   `slack_channel_id`.
3. `DISCORD_WEBHOOK_URL` for every personal manifest owner. The action never
   posts the same release to both publishers.
4. `ANDROID_SERVICE_ACCOUNT_JSON` for any selected Android artifact. It is
   written with owner-only permissions to the runner temporary directory, used
   only by that Android leg, then removed.
5. For a selected site artifact: `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID`, plus the documented `site_*` inputs below.

The reusable workflow installs caller project dependencies before `eas build`
and `eas submit`. It uses `pnpm install --frozen-lockfile` when `pnpm-lock.yaml`
is present, `npm ci` for npm lockfiles, and Yarn when `yarn.lock` is present.

## Caller workflow

Pin the published artifact-aware commit in a real caller. The version comment
keeps the otherwise opaque commit readable:

```yaml
name: Release
on:
  push:
    tags: ["v*"]
  workflow_dispatch:
    inputs:
      version: { type: string }
      summary: { type: string }
      artifacts: { type: choice, options: [ios, android, site, "ios,android", "ios,site", "android,site", "ios,android,site"], default: ios }
      skip_build: { type: boolean, default: false }

jobs:
  release:
    # release-actions artifact-aware release
    uses: adamu-personal-apps/release-actions/.github/workflows/expo-release.yml@ARTIFACT_AWARE_COMMIT_SHA
    with:
      project_name: My App
      profile: business # display label only
      artifacts: ${{ inputs.artifacts || 'ios' }}
      business_owner: progress-companion-app
      version: ${{ inputs.version }}
      summary: ${{ inputs.summary }}
      skip_build: ${{ inputs.skip_build || false }}
      slack_channel_id: C0123456789
      site_build_command: pnpm site:prepare --release
      site_output_directory: .site-dist
      site_package_directory: .site-package
      site_project_name: shotstep
      site_deployment_branch: main
      site_production_branch: main
      site_android_release_sha256: ${{ vars.SHOTSTEP_ANDROID_RELEASE_SHA256 }}
      site_supabase_url: ${{ vars.EXPO_PUBLIC_SUPABASE_URL }}
      site_supabase_publishable_key: ${{ vars.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY }}
    secrets:
      EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
      SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
      DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
      ANDROID_SERVICE_ACCOUNT_JSON: ${{ secrets.ANDROID_SERVICE_ACCOUNT_JSON }}
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

## Inputs

| input              | default      | purpose                                         |
| ------------------ | ------------ | ----------------------------------------------- |
| `project_name`     | —            | display name                                    |
| `profile`          | —            | `business` or `personal` label                  |
| `platform`         | `ios`        | legacy mobile-only `ios`, `android`, or `all`   |
| `artifacts`        | —            | canonical comma list: `ios`, `android`, `site` in that order |
| `business_owner`   | —            | Expo manifest owner that publishes to Slack     |
| `build_profile`    | `production` | EAS build profile                               |
| `submit_profile`   | `production` | EAS submit profile                              |
| `version`          | derived      | override; otherwise the tag or package version  |
| `summary`          | git log      | optional manual release summary                 |
| `skip_build`       | `false`      | resolve one finished build for the requested profile and submit its exact ID without creating a new build |
| `slack_channel_id` | empty        | non-secret Slack destination                    |
| `site_build_command` | —          | caller static build command, required for `site` |
| `site_output_directory` | —       | caller static output directory, required for `site` |
| `site_package_directory` | —      | immutable package directory, required for `site` |
| `site_project_name` | —          | existing Pages project, required for `site`     |
| `site_deployment_branch` | —     | deployment branch, required for `site`          |
| `site_production_branch` | —     | production branch, required for `site`          |
| `site_android_release_sha256` | — | public Android fingerprint required by ShotStep's release-site build |
| `site_supabase_url` | —          | public Supabase URL required by ShotStep's release-site build |
| `site_supabase_publishable_key` | — | public Supabase key required by ShotStep's release-site build |

The workflow owns Node 24. Callers cannot select an older Node runtime.

## Hosted notification-routing proof

`artifact-routing-smoke.yml` is the manual GitHub-hosted proof for the
manifest-owner rule. Supply the manifest owner, business owner, and reviewed
pickleball-themed summary bullets. It posts only to the route selected by the
resolver and records the candidate commit, owner, and publisher in the run
summary. Its lifecycle text explicitly says that no release artifact was
delivered.

The proof repository needs `SLACK_BOT_TOKEN` and `DISCORD_WEBHOOK_URL` as
Actions secrets and `RELEASE_SLACK_CHANNEL_ID` as an Actions variable. It does
not receive an Expo token, Android credential, or Cloudflare credential; it
cannot start a build, submission, or site deployment.

## How it works

The reusable workflow runs `prepare` → `announce` → parallel `release` and
`site` → `finalize`. `prepare` reads the caller Expo manifest, resolves the
canonical artifact set, and selects exactly one publisher. Each mobile platform
gets one release leg that selects or creates one build, records its exact EAS
ID, and submits that same ID. A selected site is first packaged by the
provider-free artifact helper, then published by the separate Pages helper.

Every third-party GitHub action is pinned to a reviewed commit. The reusable
workflow also checks out its helper scripts from the reviewed commit named by
`ACTIONS_REF`, so the published workflow and tools resolve to compatible
implementations.

## Delivery behavior

With multiple selected artifacts, delivery is independent: one platform or the
site can complete while another fails. The final status names `mobile release`
or `site deployment` when one lane fails, so an incomplete artifact remains
visible without pretending no other artifact was delivered.

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
`PATH`, `HOME`, and `CI`, plus the three public ShotStep release-site values
named in the input table. Provider credentials and other inherited variables
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
