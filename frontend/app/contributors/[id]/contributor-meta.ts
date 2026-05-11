import { API_ENDPOINTS } from "@/lib/panel-config";

type ContributorMeta = {
  login: string;
  avatarUrl: string;
  profileUrl: string;
  title?: string | null;
  displayName?: string;
  contributions: number;
  pullRequests: number;
  mergedPullRequests: number;
  lastCommitAt?: string;
  commitHistory?: Array<{ date: string; count: number }>;
};

type ContributorsSnapshotMeta = {
  repo: {
    owner: string;
    name: string;
    url: string;
  };
  generatedAt: string;
  contributors: ContributorMeta[];
};

function getBackendBaseUrl(): string {
  return (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/+$/, "");
}

export function getPublicSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://ecli.app").replace(/\/+$/, "");
}

function isSnapshotMeta(value: unknown): value is ContributorsSnapshotMeta {
  if (!value || typeof value !== "object") return false;
  const maybe = value as Partial<ContributorsSnapshotMeta>;
  return Array.isArray(maybe.contributors) && !!maybe.repo?.name;
}

export async function getContributorsSnapshotMeta(): Promise<ContributorsSnapshotMeta | null> {
  const backendBase = getBackendBaseUrl();
  if (!backendBase) return null;

  try {
    const response = await fetch(`${backendBase}${API_ENDPOINTS.contributorsPublic}`, {
      cache: "no-store",
      next: { revalidate: 0 },
    });

    if (!response.ok) return null;

    const json: unknown = await response.json();
    if (!isSnapshotMeta(json)) return null;

    return json;
  } catch {
    return null;
  }
}

export async function getContributorMetaById(id: string): Promise<{
  contributor: ContributorMeta | null;
  snapshot: ContributorsSnapshotMeta | null;
}> {
  const snapshot = await getContributorsSnapshotMeta();
  if (!snapshot) return { contributor: null, snapshot: null };

  const normalizedId = decodeURIComponent(id).toLowerCase();
  const contributor =
    snapshot.contributors.find((entry) => entry.login.toLowerCase() === normalizedId) || null;

  return { contributor, snapshot };
}

export function formatContributorDescription(
  contributor: ContributorMeta,
  repoName?: string,
): string {
  const stats = [
    `${contributor.contributions} contributions`,
    `${contributor.pullRequests} PRs`,
    `${contributor.mergedPullRequests} merged`,
  ].join(" • ");

  if (repoName) {
    return `${stats} on ${repoName}.`;
  }

  return `${stats}.`;
}
