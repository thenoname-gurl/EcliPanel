import { Octokit } from "octokit";

function getClient(token: string): Octokit {
  return new Octokit({ auth: token });
}

export const githubService = {
  async getFile(token: string, owner: string, repo: string, path: string, ref?: string) {
    const client = getClient(token);
    const res = await client.rest.repos.getContent({ owner, repo, path, ref });
    if (Array.isArray(res.data)) return { type: "directory", entries: res.data };
    const file = res.data as any;
    const content = file.encoding === "base64"
      ? Buffer.from(file.content, "base64").toString("utf-8")
      : file.content;
    return { type: "file", content, sha: file.sha, size: file.size, encoding: file.encoding };
  },

  async createBranch(token: string, owner: string, repo: string, branchName: string, fromBranch?: string) {
    const client = getClient(token);
    const { data: repoData } = await client.rest.repos.get({ owner, repo });
    const defaultBranch = fromBranch || repoData.default_branch;
    const { data: refData } = await client.rest.git.getRef({ owner, repo, ref: `heads/${defaultBranch}` });
    await client.rest.git.createRef({ owner, repo, ref: `refs/heads/${branchName}`, sha: refData.object.sha });
    return { branch: branchName, from: defaultBranch, sha: refData.object.sha };
  },

  async updateFile(token: string, owner: string, repo: string, path: string, content: string, message: string, branch: string, sha?: string) {
    const client = getClient(token);
    if (!sha) {
      try {
        const existing = await this.getFile(token, owner, repo, path, branch);
        if (existing.type === "file") sha = (existing as any).sha;
      } catch {}
    }
    const res = await client.rest.repos.createOrUpdateFileContents({
      owner, repo, path, message,
      content: Buffer.from(content).toString("base64"),
      branch, sha,
    });
    return { path, sha: res.data.content?.sha, commitSha: res.data.commit.sha };
  },

  async createPullRequest(token: string, owner: string, repo: string, title: string, body: string, head: string, base: string) {
    const client = getClient(token);
    const res = await client.rest.pulls.create({ owner, repo, title, body, head, base });
    return { number: res.data.number, url: res.data.html_url, title: res.data.title, state: res.data.state };
  },

  async listPullRequests(token: string, owner: string, repo: string, state: "open" | "closed" | "all" = "open") {
    const client = getClient(token);
    const res = await client.rest.pulls.list({ owner, repo, state, per_page: 25 });
    return res.data.map((pr: any) => ({
      number: pr.number, title: pr.title, state: pr.state,
      url: pr.html_url, author: pr.user?.login,
    }));
  },

  async getRepoInfo(token: string, owner: string, repo: string) {
    const client = getClient(token);
    const res = await client.rest.repos.get({ owner, repo });
    return {
      name: res.data.name, fullName: res.data.full_name,
      description: res.data.description, defaultBranch: res.data.default_branch,
      language: res.data.language, stars: res.data.stargazers_count,
      forks: res.data.forks_count, openIssues: res.data.open_issues_count,
      private: res.data.private, url: res.data.html_url,
    };
  },

  async searchCode(token: string, query: string, owner?: string, repo?: string) {
    const client = getClient(token);
    let q = query;
    if (owner && repo) q += ` repo:${owner}/${repo}`;
    const res = await client.rest.search.code({ q, per_page: 10 });
    return res.data.items.map((item: any) => ({
      name: item.name, path: item.path, repo: item.repository.full_name, url: item.html_url,
    }));
  },

  async getPullRequest(token: string, owner: string, repo: string, prNumber: number) {
    const client = getClient(token);
    const res = await client.rest.pulls.get({ owner, repo, pull_number: prNumber });
    return {
      number: res.data.number, title: res.data.title, body: res.data.body,
      state: res.data.state, url: res.data.html_url, author: res.data.user?.login,
      head: res.data.head.ref, base: res.data.base.ref,
      additions: res.data.additions, deletions: res.data.deletions,
      changedFiles: res.data.changed_files, mergeable: res.data.mergeable,
    };
  },

  async getPRFiles(token: string, owner: string, repo: string, prNumber: number) {
    const client = getClient(token);
    const res = await client.rest.pulls.listFiles({ owner, repo, pull_number: prNumber, per_page: 50 });
    return res.data.map((f: any) => ({
      filename: f.filename, status: f.status, additions: f.additions, deletions: f.deletions, changes: f.changes, patch: f.patch?.slice(0, 3000) || "",
    }));
  },

  async getPRDiff(token: string, owner: string, repo: string, prNumber: number) {
    const client = getClient(token);
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}.diff`, {
      headers: { Accept: "application/vnd.github.v3.diff", Authorization: `Bearer ${token}` },
    });
    return res.text();
  },

  async reviewPR(
    token: string, owner: string, repo: string, prNumber: number,
    body: string, event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT" = "COMMENT",
    comments?: Array<{ path: string; line: number; body: string }>
  ) {
    const client = getClient(token);
    const reviewBody = body + "\n\n> *Reviewed by EcliBot AI*";
    const res = await client.rest.pulls.createReview({
      owner, repo, pull_number: prNumber, body: reviewBody, event,
      comments: comments?.map(c => ({ path: c.path, line: c.line, body: c.body + "\n\n> *Reviewed by EcliBot AI*" })),
    });
    return { id: res.data.id, state: res.data.state, url: res.data.html_url };
  },

  async commentOnIssue(token: string, owner: string, repo: string, issueNumber: number, body: string) {
    const client = getClient(token);
    const commentBody = body + "\n\n> *Responded via EcliBot AI*";
    const res = await client.rest.issues.createComment({
      owner, repo, issue_number: issueNumber, body: commentBody,
    });
    return { id: res.data.id, url: res.data.html_url };
  },

  async listIssues(token: string, owner: string, repo: string, state: "open" | "closed" | "all" = "open") {
    const client = getClient(token);
    const res = await client.rest.issues.listForRepo({ owner, repo, state, per_page: 25 });
    return res.data.map((issue: any) => ({
      number: issue.number, title: issue.title, state: issue.state,
      url: issue.html_url, author: issue.user?.login,
      labels: issue.labels?.map((l: any) => l.name) || [],
    }));
  },

  async getIssue(token: string, owner: string, repo: string, issueNumber: number) {
    const client = getClient(token);
    const res = await client.rest.issues.get({ owner, repo, issue_number: issueNumber });
    return {
      number: res.data.number, title: res.data.title, body: res.data.body,
      state: res.data.state, url: res.data.html_url, author: res.data.user?.login,
      labels: res.data.labels?.map((l: any) => l.name) || [],
    };
  },

  async listIssueComments(token: string, owner: string, repo: string, issueNumber: number) {
    const client = getClient(token);
    const res = await client.rest.issues.listComments({ owner, repo, issue_number: issueNumber, per_page: 25 });
    return res.data.map((c: any) => ({
      id: c.id, body: c.body, author: c.user?.login, createdAt: c.created_at,
    }));
  },
};
