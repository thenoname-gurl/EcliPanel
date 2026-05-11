import { AppDataSource } from '../config/typeorm';
import { GithubCommitSummary, GithubContributor } from '../models/githubContributor.entity';

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

type GithubContributorSnapshot = {
  repo: GithubRepoInfo;
  generatedAt: string;
  totalContributors: number;
  totalTrackedCommits: number;
  contributors: Array<{
    login: string;
    avatarUrl: string;
    profileUrl: string;
    contributions: number;
    isBot: boolean;
    lastCommitAt?: string;
    recentCommits: GithubCommitSummary[];
  }>;
};

const DEFAULT_REPO_URL = 'https://github.com/thenoname-gurl/EcliPanel';
const CONTRIBUTORS_PAGE_SIZE = 100;
const COMMITS_PAGE_SIZE = 100;

function parseRepoUrl(raw: string | undefined | null): GithubRepoInfo {
  const fallback = new URL(DEFAULT_REPO_URL);
  const url = raw && raw.includes('://') ? raw : DEFAULT_REPO_URL;

  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.replace(/^\/+/, '').replace(/\.git$/, '').split('/').filter(Boolean);
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

  const rawSlug = String(raw || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '');
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
      DEFAULT_REPO_URL,
  );
}

function isBotContributor(row: GithubContributorApiRow) {
  const login = String(row.login || '').trim();
  const type = String(row.type || '').trim().toLowerCase();
  return !login || login.toLowerCase().endsWith('[bot]') || type === 'bot';
}

async function githubFetch<T>(path: string): Promise<T> {
  const repoInfo = getRepoInfo();
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'EcliPanel-Contributors-Sync',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`https://api.github.com/repos/${repoInfo.owner}/${repoInfo.name}${path}`, {
    headers,
  });

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
    const pageRows = await githubFetch<GithubContributorApiRow[]>(`/contributors?per_page=${CONTRIBUTORS_PAGE_SIZE}&anon=1&page=${page}`);
    rows.push(...pageRows);
    if (pageRows.length < CONTRIBUTORS_PAGE_SIZE) break;
  }

  return rows;
}

async function fetchRecentCommits() {
  const rows: GithubCommitApiRow[] = [];
  const maxPages = Number(process.env.GITHUB_COMMIT_PAGES || 4);

  for (let page = 1; page <= maxPages; page += 1) {
    const pageRows = await githubFetch<GithubCommitApiRow[]>(`/commits?per_page=${COMMITS_PAGE_SIZE}&page=${page}`);
    rows.push(...pageRows);
    if (pageRows.length < COMMITS_PAGE_SIZE) break;
  }

  return rows;
}

export async function syncGithubContributors() {
  const repo = getRepoInfo();
  const [contributors, commits] = await Promise.all([
    fetchAllContributorRows(),
    fetchRecentCommits(),
  ]);

  const contributorMap = new Map<string, {
    login: string;
    avatarUrl: string;
    profileUrl: string;
    contributions: number;
    isBot: boolean;
    recentCommits: GithubCommitSummary[];
    lastCommitAt?: string;
  }>();

  for (const row of contributors) {
    if (isBotContributor(row)) continue;
    const login = String(row.login || '').trim();
    if (!login) continue;

    contributorMap.set(login.toLowerCase(), {
      login,
      avatarUrl: row.avatar_url || `https://github.com/${login}.png`,
      profileUrl: row.html_url || `https://github.com/${login}`,
      contributions: Number(row.contributions || 0),
      isBot: false,
      recentCommits: [],
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

    if (!entry.lastCommitAt || committedAt > entry.lastCommitAt) {
      entry.lastCommitAt = committedAt;
    }
  }

  const repoRows = AppDataSource.getRepository(GithubContributor);
  await repoRows.delete({ repoOwner: repo.owner, repoName: repo.name });

  const entities = Array.from(contributorMap.values())
    .sort((a, b) => b.contributions - a.contributions || a.login.localeCompare(b.login))
    .map((item) => repoRows.create({
      repoOwner: repo.owner,
      repoName: repo.name,
      login: item.login,
      avatarUrl: item.avatarUrl,
      profileUrl: item.profileUrl,
      contributions: item.contributions,
      isBot: item.isBot,
      recentCommits: item.recentCommits,
      lastCommitAt: item.lastCommitAt ? new Date(item.lastCommitAt) : undefined,
      fetchedAt: new Date(),
    }));

  if (entities.length > 0) {
    await repoRows.save(entities);
  }

  return getGithubContributorsSnapshot();
}

export async function getGithubContributorsSnapshot(): Promise<GithubContributorSnapshot> {
  const repo = getRepoInfo();
  const repoRows = AppDataSource.getRepository(GithubContributor);
  const rows = await repoRows.find({
    where: { repoOwner: repo.owner, repoName: repo.name },
    order: { contributions: 'DESC', login: 'ASC' },
  });

  const contributors = rows.map((row) => ({
    login: row.login,
    avatarUrl: row.avatarUrl,
    profileUrl: row.profileUrl,
    contributions: row.contributions,
    isBot: row.isBot,
    lastCommitAt: row.lastCommitAt ? new Date(row.lastCommitAt).toISOString() : undefined,
    recentCommits: Array.isArray(row.recentCommits) ? row.recentCommits.slice(0, 6) : [],
  }));

  const latestFetchedAt = rows
    .map((row) => row.fetchedAt)
    .filter(Boolean)
    .sort((a, b) => new Date(b as any).getTime() - new Date(a as any).getTime())[0];

  const totalTrackedCommits = contributors.reduce((sum, contributor) => sum + contributor.recentCommits.length, 0);

  return {
    repo,
    generatedAt: latestFetchedAt ? new Date(latestFetchedAt).toISOString() : new Date().toISOString(),
    totalContributors: contributors.length,
    totalTrackedCommits,
    contributors,
  };
}