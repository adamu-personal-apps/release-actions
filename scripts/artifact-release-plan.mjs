const MOBILE_ARTIFACTS = new Set(["ios", "android"]);

function required(value, label) {
  const normalized = value?.trim() ?? "";
  if (!normalized) throw new Error(`${label} is required for the selected artifact`);
  return normalized;
}

export function resolveArtifactReleasePlan({
  artifacts,
  projectName,
  iosArtifactName,
  androidArtifactName,
  siteArtifactName,
  mobileVersion,
  siteVersion,
  legacyVersion,
  mobileSummary,
  siteSummary,
  legacySummary,
}) {
  const selected = new Set(artifacts);
  const plan = {};
  const resolvedMobileVersion = mobileVersion || legacyVersion;
  const resolvedSiteVersion = siteVersion || legacyVersion;
  const resolvedMobileSummary = mobileSummary || legacySummary;
  const resolvedSiteSummary = siteSummary || legacySummary;

  for (const artifact of artifacts) {
    const isMobile = MOBILE_ARTIFACTS.has(artifact);
    const defaultName = artifact === "site"
      ? `${projectName} website`
      : `${projectName} ${artifact === "ios" ? "iOS" : "Android"}`;
    const configuredName = artifact === "ios"
      ? iosArtifactName
      : artifact === "android"
        ? androidArtifactName
        : siteArtifactName;

    plan[artifact] = {
      artifact,
      name: required(configuredName || defaultName, `${artifact} artifact name`),
      version: required(
        isMobile ? resolvedMobileVersion : resolvedSiteVersion,
        isMobile ? "mobile version" : "site version",
      ),
      summary: required(
        isMobile ? resolvedMobileSummary : resolvedSiteSummary,
        isMobile ? "mobile summary" : "site summary",
      ),
    };
  }

  if (selected.size !== Object.keys(plan).length) {
    throw new Error("artifact release plan cannot contain duplicate artifacts");
  }

  return plan;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const plan = resolveArtifactReleasePlan({
      artifacts: JSON.parse(process.env.ARTIFACTS_JSON ?? "[]"),
      projectName: process.env.PROJECT_NAME,
      iosArtifactName: process.env.IOS_ARTIFACT_NAME,
      androidArtifactName: process.env.ANDROID_ARTIFACT_NAME,
      siteArtifactName: process.env.SITE_ARTIFACT_NAME,
      mobileVersion: process.env.MOBILE_VERSION,
      siteVersion: process.env.SITE_VERSION,
      legacyVersion: process.env.LEGACY_VERSION,
      mobileSummary: process.env.MOBILE_SUMMARY,
      siteSummary: process.env.SITE_SUMMARY,
      legacySummary: process.env.LEGACY_SUMMARY,
    });
    process.stdout.write(JSON.stringify(plan));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
