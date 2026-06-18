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
};
