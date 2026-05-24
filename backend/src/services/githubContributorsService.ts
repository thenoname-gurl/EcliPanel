import { AppDataSource } from '../config/typeorm';
import { User } from '../models/user.entity';
import {
  GithubCommitHistoryPoint,
  GithubCommitSummary,
  GithubContributor,
  GithubPullRequestSummary,
} from '../models/githubContributor.entity';

type GithubRepoInfo = {
  owner: string;
  name: string;
  url: string;
};

type GithubContributorApiRow = {
  login?: string;
  avatar_url?: string;
  html_url?: string;
  contributions?: number;
  type?: string;
};

type GithubCommitApiRow = {
  sha?: string;
  html_url?: string;
  commit?: {
    message?: string;
    author?: {
      date?: string;
    };
  };
  author?: {
    login?: string;
    avatar_url?: string;
  } | null;
};

type GithubPullRequestApiRow = {
  number?: number;
  html_url?: string;
  title?: string;
  state?: string;
  created_at?: string;
  merged_at?: string | null;
  user?: {
    login?: string;
    avatar_url?: string;
    html_url?: string;
    type?: string;
  } | null;
};

type GithubContributorSnapshot = {
  repo: GithubRepoInfo;
  generatedAt: string;
  totalContributors: number;
  totalTrackedCommits: number;
  totalTrackedPullRequests: number;
  totalMergedPullRequests: number;
  contributors: Array<{
    login: string;
    avatarUrl: string;
    profileUrl: string;
    source?: 'github' | 'manual';
    userId?: number;
    displayName?: string;
    title?: string | null;
    githubLogin?: string | null;
    githubProfileUrl?: string | null;
    githubAvatarUrl?: string | null;
    activity?: Array<{
      date: string;
      label: string;
      details?: string;
      points?: number;
      url?: string;
    }>;
    contributions: number;
    pullRequests: number;
    mergedPullRequests: number;
    isBot: boolean;
    lastCommitAt?: string;
    recentCommits: GithubCommitSummary[];
    recentPullRequests: GithubPullRequestSummary[];
    commitHistory: GithubCommitHistoryPoint[];
  }>;
};

const DEFAULT_REPO_URL = 'https://github.com/thenoname-gurl/EcliPanel';
const CONTRIBUTORS_PAGE_SIZE = 100;
const COMMITS_PAGE_SIZE = 100;
const PULL_REQUESTS_PAGE_SIZE = 100;

function parseRepoUrl(raw: string | undefined | null): GithubRepoInfo {
  const fallback = new URL(DEFAULT_REPO_URL);
  const url = raw && raw.includes('://') ? raw : DEFAULT_REPO_URL;

  try {
    const parsed = new URL(url);
    const parts = parsed.pathname
      .replace(/^\/+/, '')
      .replace(/\.git$/, '')
      .split('/')
      .filter(Boolean);
    if (parts.length >= 2) {
      return {
        owner: parts[0],
        name: parts[1],
        url: `https://github.com/${parts[0]}/${parts[1]}`,
      };
    }
  } catch {
    // bruh
  }

  const rawSlug = String(raw || '')
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/, '');
  const slugParts = rawSlug.split('/').filter(Boolean);
  if (slugParts.length >= 2) {
    return {
      owner: slugParts[0],
      name: slugParts[1],
      url: `https://github.com/${slugParts[0]}/${slugParts[1]}`,
    };
  }

  return {
    owner: fallback.pathname.split('/').filter(Boolean)[0] || 'thenoname-gurl',
    name: fallback.pathname.split('/').filter(Boolean)[1] || 'EcliPanel',
    url: DEFAULT_REPO_URL,
  };
}

function getRepoInfo(): GithubRepoInfo {
  return parseRepoUrl(
    process.env.GITHUB_REPO_URL ||
      process.env.GITHUB_REPOSITORY_URL ||
      process.env.GITHUB_REPOSITORY ||
      process.env.NEXT_PUBLIC_REPO_URL ||
      DEFAULT_REPO_URL
  );
}

function isBotContributor(row: GithubContributorApiRow) {
  const login = String(row.login || '').trim();
  const type = String(row.type || '')
    .trim()
    .toLowerCase();
  return !login || login.toLowerCase().endsWith('[bot]') || type === 'bot';
}

function isBotLogin(login?: string | null) {
  const value = String(login || '')
    .trim()
    .toLowerCase();
  return !value || value.endsWith('[bot]');
}

type ManualContributorActivityEntry = {
  date: string;
  label: string;
  details?: string;
  points?: number;
  url?: string;
};

function normalizeContributorActivity(input: any): ManualContributorActivityEntry[] {
  if (!Array.isArray(input)) return [];
  return input
    .map(item => {
      const date = String(item?.date || '').trim();
      const label = String(item?.label || '').trim();
      if (!date || !label) return null;
      let normalizedDate = date;
      try {
        const d = new Date(date);
        if (!isNaN(d.getTime())) normalizedDate = d.toISOString();
      } catch {
        // ORIGINALLITY MATTERS TRUST
      }
      const entry: ManualContributorActivityEntry = { date: normalizedDate, label };
      const details = String(item?.details || '').trim();
      const url = String(item?.url || '').trim();
      const points = Number(item?.points);
      if (details) entry.details = details;
      if (url) entry.url = url;
      if (Number.isFinite(points) && points > 0) entry.points = Math.round(points);
      return entry;
    })
    .filter((item): item is ManualContributorActivityEntry => !!item)
    .slice(0, 200);
}

function extractGithubLoginFromProfileUrl(raw?: string | null): string | null {
  if (!raw) return null;
  try {
    const url = String(raw || '').trim();
    if (url.startsWith('@')) return url.slice(1).trim().toLowerCase() || null;
    const cleaned = url.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
    const parts = cleaned.split('/').filter(Boolean);
    if (parts.length >= 2 && parts[0].toLowerCase().includes('github')) {
      return parts[1].replace(/\.+$/, '').replace(/^@/, '').trim().toLowerCase() || null;
    }
    if (parts.length >= 1 && !parts[0].includes('.')) {
      return parts[0].replace(/^@/, '').trim().toLowerCase() || null;
    }
  } catch {
    // woof
  }
  return null;
}

function toManualContributionScore(activity: ManualContributorActivityEntry[]) {
  return activity.reduce((sum, item) => sum + Math.max(1, Number(item.points) || 1), 0);
}

async function githubFetch<T>(path: string): Promise<T> {
  const repoInfo = getRepoInfo();
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'EcliPanel-Contributors-Sync',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(
    `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.name}${path}`,
    {
      headers,
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub API request failed (${res.status}): ${body || res.statusText}`);
  }

  return res.json() as Promise<T>;
}

async function fetchAllContributorRows() {
  const rows: GithubContributorApiRow[] = [];
  const maxPages = Number(process.env.GITHUB_CONTRIBUTOR_PAGES || 5);

  for (let page = 1; page <= maxPages; page += 1) {
    const pageRows = await githubFetch<GithubContributorApiRow[]>(
      `/contributors?per_page=${CONTRIBUTORS_PAGE_SIZE}&anon=1&page=${page}`
    );
    rows.push(...pageRows);
    if (pageRows.length < CONTRIBUTORS_PAGE_SIZE) break;
  }

  return rows;
}

async function fetchRecentCommits() {
  const rows: GithubCommitApiRow[] = [];
  const maxPages = Number(process.env.GITHUB_COMMIT_PAGES || 4);

  for (let page = 1; page <= maxPages; page += 1) {
    const pageRows = await githubFetch<GithubCommitApiRow[]>(
      `/commits?per_page=${COMMITS_PAGE_SIZE}&page=${page}`
    );
    rows.push(...pageRows);
    if (pageRows.length < COMMITS_PAGE_SIZE) break;
  }

  return rows;
}

async function fetchRecentPullRequests() {
  const rows: GithubPullRequestApiRow[] = [];
  const maxPages = Number(process.env.GITHUB_PR_PAGES || 5);

  for (let page = 1; page <= maxPages; page += 1) {
    const pageRows = await githubFetch<GithubPullRequestApiRow[]>(
      `/pulls?state=all&per_page=${PULL_REQUESTS_PAGE_SIZE}&page=${page}`
    );
    rows.push(...pageRows);
    if (pageRows.length < PULL_REQUESTS_PAGE_SIZE) break;
  }

  return rows;
}

export async function syncGithubContributors() {
  const repo = getRepoInfo();
  const [contributors, commits, pullRequests] = await Promise.all([
    fetchAllContributorRows(),
    fetchRecentCommits(),
    fetchRecentPullRequests(),
  ]);

  const contributorMap = new Map<
    string,
    {
      login: string;
      avatarUrl: string;
      profileUrl: string;
      contributions: number;
      pullRequests: number;
      mergedPullRequests: number;
      isBot: boolean;
      recentCommits: GithubCommitSummary[];
      recentPullRequests: GithubPullRequestSummary[];
      commitHistory: Map<string, number>;
      lastCommitAt?: string;
    }
  >();

  for (const row of contributors) {
    if (isBotContributor(row)) continue;
    const login = String(row.login || '').trim();
    if (!login) continue;

    contributorMap.set(login.toLowerCase(), {
      login,
      avatarUrl: row.avatar_url || `https://github.com/${login}.png`,
      profileUrl: row.html_url || `https://github.com/${login}`,
      contributions: Number(row.contributions || 0),
      pullRequests: 0,
      mergedPullRequests: 0,
      isBot: false,
      recentCommits: [],
      recentPullRequests: [],
      commitHistory: new Map(),
    });
  }

  for (const commit of commits) {
    const login = String(commit.author?.login || '').trim();
    if (!login) continue;

    const entry = contributorMap.get(login.toLowerCase());
    if (!entry) continue;

    const committedAt = commit.commit?.author?.date || new Date().toISOString();
    const summary: GithubCommitSummary = {
      sha: String(commit.sha || '').slice(0, 40),
      message: String(commit.commit?.message || 'Commit').split('\n')[0],
      url: commit.html_url || `https://github.com/${repo.owner}/${repo.name}/commit/${commit.sha}`,
      committedAt,
    };

    if (entry.recentCommits.length < 6) {
      entry.recentCommits.push(summary);
    }

    const dayKey = committedAt.slice(0, 10);
    entry.commitHistory.set(dayKey, (entry.commitHistory.get(dayKey) || 0) + 1);

    if (!entry.lastCommitAt || committedAt > entry.lastCommitAt) {
      entry.lastCommitAt = committedAt;
    }
  }

  for (const pullRequest of pullRequests) {
    const login = String(pullRequest.user?.login || '').trim();
    if (!login) continue;

    const entry = contributorMap.get(login.toLowerCase());
    if (!entry) continue;

    if (isBotLogin(login)) continue;

    const summary: GithubPullRequestSummary = {
      number: Number(pullRequest.number || 0),
      title: String(pullRequest.title || 'Pull request'),
      url:
        pullRequest.html_url ||
        `https://github.com/${repo.owner}/${repo.name}/pull/${pullRequest.number}`,
      state: String(pullRequest.state || 'open'),
      createdAt: String(pullRequest.created_at || new Date().toISOString()),
      mergedAt: pullRequest.merged_at || undefined,
      merged: !!pullRequest.merged_at,
    };

    entry.pullRequests += 1;
    if (summary.merged) {
      entry.mergedPullRequests += 1;
    }

    if (entry.recentPullRequests.length < 6) {
      entry.recentPullRequests.push(summary);
    }
  }

  const repoRows = AppDataSource.getRepository(GithubContributor);
  await repoRows.delete({ repoOwner: repo.owner, repoName: repo.name });

  const entities = Array.from(contributorMap.values())
    .sort((a, b) => b.contributions - a.contributions || a.login.localeCompare(b.login))
    .map(item =>
      repoRows.create({
        repoOwner: repo.owner,
        repoName: repo.name,
        login: item.login,
        avatarUrl: item.avatarUrl,
        profileUrl: item.profileUrl,
        contributions: item.contributions,
        pullRequests: item.pullRequests,
        mergedPullRequests: item.mergedPullRequests,
        isBot: item.isBot,
        recentCommits: item.recentCommits,
        recentPullRequests: item.recentPullRequests,
        commitHistory: Array.from(item.commitHistory.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, count]) => ({ date, count })),
        lastCommitAt: item.lastCommitAt ? new Date(item.lastCommitAt) : undefined,
        fetchedAt: new Date(),
      })
    );

  if (entities.length > 0) {
    await repoRows.save(entities);
  }

  return getGithubContributorsSnapshot();
}

async function fetchManualContributorEntries() {
  const userRepo = AppDataSource.getRepository(User);
  const users = await userRepo
    .createQueryBuilder('u')
    .where('u.githubLogin IS NOT NULL')
    .orWhere('u.githubProfileUrl IS NOT NULL')
    .orWhere('u.githubAvatarUrl IS NOT NULL')
    .orWhere('u.contributorTitle IS NOT NULL')
    .orWhere('u.contributorActivity IS NOT NULL')
    .getMany();

  return users.map(user => {
    const fallbackName =
      `${String(user.firstName || '').trim()} ${String(user.lastName || '').trim()}`.trim();
    const displayName = String(
      user.displayName || fallbackName || user.email || `User #${user.id}`
    ).trim();
    const rawGithubLogin = String((user as any).githubLogin || '').trim();
    const githubProfileUrl = String((user as any).githubProfileUrl || '').trim();
    const githubAvatarUrl = String((user as any).githubAvatarUrl || '').trim();
    const derivedLogin = rawGithubLogin || extractGithubLoginFromProfileUrl(githubProfileUrl) || '';
    const githubLogin = derivedLogin;
    const title = String((user as any).contributorTitle || '').trim() || null;
    const activity = normalizeContributorActivity((user as any).contributorActivity);
    const contributions = Math.max(1, toManualContributionScore(activity) || activity.length || 0);
    const commitHistory = new Map<string, number>();
    const recentCommits = activity.slice(0, 6).map((entry, index) => {
      const dayKey = entry.date.slice(0, 10);
      commitHistory.set(
        dayKey,
        (commitHistory.get(dayKey) || 0) + Math.max(1, Number(entry.points) || 1)
      );
      return {
        sha: `manual-${user.id}-${index}-${dayKey}`,
        message: entry.label,
        url:
          entry.url || githubProfileUrl || (githubLogin ? `https://github.com/${githubLogin}` : ''),
        committedAt: entry.date,
      };
    });

    if (activity.length > recentCommits.length) {
      for (const entry of activity.slice(recentCommits.length)) {
        const dayKey = entry.date.slice(0, 10);
        commitHistory.set(
          dayKey,
          (commitHistory.get(dayKey) || 0) + Math.max(1, Number(entry.points) || 1)
        );
      }
    }

    const lastCommitAt = activity
      .map(item => item.date)
      .filter(Boolean)
      .sort((a, b) => String(b).localeCompare(String(a)))[0];

    return {
      login: githubLogin || displayName,
      avatarUrl:
        githubAvatarUrl ||
        user.avatarUrl ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=111827&color=fff`,
      profileUrl: githubProfileUrl || (githubLogin ? `https://github.com/${githubLogin}` : ''),
      source: 'manual' as const,
      userId: user.id,
      displayName,
      title,
      githubLogin: githubLogin || null,
      githubProfileUrl: githubProfileUrl || null,
      githubAvatarUrl: githubAvatarUrl || null,
      activity,
      contributions,
      pullRequests: 0,
      mergedPullRequests: 0,
      isBot: false,
      lastCommitAt,
      recentCommits,
      recentPullRequests: [],
      commitHistory: Array.from(commitHistory.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count })),
    };
  });
}

export async function getGithubContributorsSnapshot(): Promise<GithubContributorSnapshot> {
  const repo = getRepoInfo();
  const repoRows = AppDataSource.getRepository(GithubContributor);
  const rows = await repoRows.find({
    where: { repoOwner: repo.owner, repoName: repo.name },
    order: { contributions: 'DESC', login: 'ASC' },
  });

  const manualContributors = await fetchManualContributorEntries();
  const contributorMap = new Map<string, any>();

  for (const row of rows) {
    contributorMap.set(row.login.toLowerCase(), {
      login: row.login,
      avatarUrl: row.avatarUrl,
      profileUrl: row.profileUrl,
      contributions: row.contributions,
      pullRequests: row.pullRequests || 0,
      mergedPullRequests: row.mergedPullRequests || 0,
      isBot: row.isBot,
      lastCommitAt: row.lastCommitAt ? new Date(row.lastCommitAt).toISOString() : undefined,
      recentCommits: Array.isArray(row.recentCommits) ? row.recentCommits.slice(0, 6) : [],
      recentPullRequests: Array.isArray(row.recentPullRequests)
        ? row.recentPullRequests.slice(0, 6)
        : [],
      commitHistory: Array.isArray(row.commitHistory) ? row.commitHistory : [],
      source: 'github' as const,
    });
  }

  for (const manual of manualContributors) {
    const key = String(manual.githubLogin || manual.login || '')
      .trim()
      .toLowerCase();
    if (key && contributorMap.has(key)) {
      const existing = contributorMap.get(key);
      const mergedRecentCommits = [
        ...(Array.isArray(manual.recentCommits) ? manual.recentCommits : []),
        ...(Array.isArray(existing.recentCommits) ? existing.recentCommits : []),
      ].slice(0, 6);
      const mergedHistoryMap = new Map<string, number>();
      for (const point of Array.isArray(existing.commitHistory) ? existing.commitHistory : []) {
        mergedHistoryMap.set(
          point.date,
          (mergedHistoryMap.get(point.date) || 0) + Number(point.count || 0)
        );
      }
      for (const point of Array.isArray(manual.commitHistory) ? manual.commitHistory : []) {
        mergedHistoryMap.set(
          point.date,
          (mergedHistoryMap.get(point.date) || 0) + Number(point.count || 0)
        );
      }
      contributorMap.set(key, {
        ...existing,
        source: existing.source === 'github' ? 'github' : 'manual',
        userId: manual.userId,
        displayName: manual.displayName,
        title: manual.title,
        githubLogin: manual.githubLogin,
        githubProfileUrl: manual.githubProfileUrl,
        githubAvatarUrl: manual.githubAvatarUrl,
        activity: manual.activity,
        avatarUrl: manual.githubAvatarUrl || existing.avatarUrl,
        profileUrl: manual.githubProfileUrl || existing.profileUrl,
        recentCommits: mergedRecentCommits,
        commitHistory: Array.from(mergedHistoryMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, count]) => ({ date, count })),
      });
      continue;
    }

    contributorMap.set(key || `${manual.displayName.toLowerCase()}#${manual.userId}`, manual);
  }

  const contributors = Array.from(contributorMap.values())
    .sort(
      (a, b) =>
        Number(b.contributions || 0) - Number(a.contributions || 0) ||
        String(a.login || '').localeCompare(String(b.login || ''))
    )
    .map(row => ({
      login: row.login,
      avatarUrl: row.avatarUrl,
      profileUrl: row.profileUrl,
      source: row.source,
      userId: row.userId,
      displayName: row.displayName,
      title: row.title,
      githubLogin: row.githubLogin,
      githubProfileUrl: row.githubProfileUrl,
      githubAvatarUrl: row.githubAvatarUrl,
      activity: row.activity,
      contributions: row.contributions,
      pullRequests: row.pullRequests || 0,
      mergedPullRequests: row.mergedPullRequests || 0,
      isBot: row.isBot,
      lastCommitAt: row.lastCommitAt ? new Date(row.lastCommitAt).toISOString() : undefined,
      recentCommits: Array.isArray(row.recentCommits) ? row.recentCommits.slice(0, 6) : [],
      recentPullRequests: Array.isArray(row.recentPullRequests)
        ? row.recentPullRequests.slice(0, 6)
        : [],
      commitHistory: Array.isArray(row.commitHistory) ? row.commitHistory : [],
    }));

  const latestFetchedAt = rows
    .map(row => row.fetchedAt)
    .filter(Boolean)
    .sort((a, b) => new Date(b as any).getTime() - new Date(a as any).getTime())[0];

  const totalTrackedCommits = contributors.reduce(
    (sum, contributor) =>
      sum + (Array.isArray(contributor.recentCommits) ? contributor.recentCommits.length : 0),
    0
  );
  const totalTrackedPullRequests = contributors.reduce(
    (sum, contributor) => sum + Number(contributor.pullRequests || 0),
    0
  );
  const totalMergedPullRequests = contributors.reduce(
    (sum, contributor) => sum + Number(contributor.mergedPullRequests || 0),
    0
  );

  return {
    repo,
    generatedAt: latestFetchedAt
      ? new Date(latestFetchedAt).toISOString()
      : new Date().toISOString(),
    totalContributors: contributors.length,
    totalTrackedCommits,
    totalTrackedPullRequests,
    totalMergedPullRequests,
    contributors,
  };
}
