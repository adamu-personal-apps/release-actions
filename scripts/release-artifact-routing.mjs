import { fileURLToPath } from "node:url";

const ARTIFACT_ORDER = ["ios", "android", "site"];
const LEGACY_PLATFORM_ARTIFACTS = {
  all: ["ios", "android"],
  android: ["android"],
  ios: ["ios"],
};

function resolveExplicitArtifacts(value) {
  if (typeof value !== "string" || value === "") {
    throw new Error("artifact set must not be empty");
  }

  const artifacts = value.split(",");
  const duplicate = artifacts.find(
    (artifact, index) => artifacts.indexOf(artifact) !== index,
  );
  if (duplicate) {
    throw new Error("artifact set cannot repeat an artifact");
  }

  const unsupportedArtifact = artifacts.find(
    (artifact) => !ARTIFACT_ORDER.includes(artifact),
  );
  if (unsupportedArtifact) {
    throw new Error("artifact set contains an unsupported artifact");
  }

  const canonicalArtifacts = ARTIFACT_ORDER.filter((artifact) =>
    artifacts.includes(artifact),
  );
  if (value !== canonicalArtifacts.join(",")) {
    throw new Error("artifact set must use the canonical order");
  }

  return canonicalArtifacts;
}

function resolveLegacyArtifacts(platform) {
  const artifacts = LEGACY_PLATFORM_ARTIFACTS[platform];
  if (!artifacts) {
    throw new Error(`unsupported legacy platform: ${platform}`);
  }
  return artifacts;
}

function resolveNotificationPublisher({ businessOwner, expoOwner, projectOwner }) {
  // project-manifest.json's `owner` is the source of truth when present:
  // "personal" projects announce on Discord, business projects on Slack.
  if (projectOwner) {
    return projectOwner === "personal" ? "discord" : "slack";
  }
  // Legacy fallback for repos without a project manifest: compare the Expo
  // manifest owner against the caller-declared business owner.
  if (!businessOwner) {
    return "slack";
  }
  if (!expoOwner) {
    throw new Error("Expo manifest owner is required for notification routing");
  }
  return expoOwner === businessOwner ? "slack" : "discord";
}

export function resolveReleasePlan({
  artifacts,
  businessOwner = "",
  explicitArtifacts = artifacts !== "",
  expoOwner = "",
  platform = "ios",
  projectOwner = "",
}) {
  const resolvedArtifacts = explicitArtifacts
    ? resolveExplicitArtifacts(artifacts)
    : resolveLegacyArtifacts(platform);

  return {
    artifacts: resolvedArtifacts,
    mobilePlatforms: resolvedArtifacts.filter((artifact) => artifact !== "site"),
    notificationPublisher: resolveNotificationPublisher({
      businessOwner,
      expoOwner,
      projectOwner,
    }),
    shouldDeploySite: resolvedArtifacts.includes("site"),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const explicitArtifacts = process.env.INPUT_ARTIFACTS !== "";
  const plan = resolveReleasePlan({
    artifacts: process.env.INPUT_ARTIFACTS ?? "",
    businessOwner: process.env.INPUT_BUSINESS_OWNER ?? "",
    explicitArtifacts,
    expoOwner: process.env.EXPO_OWNER ?? "",
    platform: process.env.INPUT_PLATFORM ?? "ios",
    projectOwner: process.env.PROJECT_MANIFEST_OWNER ?? "",
  });
  process.stdout.write(`${JSON.stringify(plan)}\n`);
}
