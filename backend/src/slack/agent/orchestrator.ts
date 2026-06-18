import { streamCompletion } from "../services/ai";
import { githubService } from "../services/github";
import { getEcliTools, executeEcliTool } from "../services/ecli-tools";
import { resolveUser, type UserContext } from "../services/user-context";
import { getConversation, addMessage, clearConversation, type Message } from "../services/conversation";

const SYSTEM_PROMPT = `You are EcliBot, a personal AI assistant for EcliPanel — a server management platform.
You help users manage their servers, nodes, organisations, DNS, tickets, and GitHub repositories.

CRITICAL: Use Slack mrkdwn format ONLY. DO NOT use tables (|), headings (# ## ###), horizontal rules (---, ***), or HTML.
USE ONLY THESE FORMATS:
• bullet lists with • (never use | tables)
*bold* with single asterisks
_italic_ with underscores
\`code\` for inline code
\`\`\` for code blocks (no language tags)
> blockquotes

RULES FOR TOOLS:
- For "tell me about myself" or own info: use ecli_my_profile and ecli_my_servers (NOT ecli_get_user or ecli_list_servers)
- NEVER expose .env files, API keys, passwords, tokens, or private credentials from any repo
- NEVER expose user PII (emails, IPs, phone numbers) from other users to the channel
- Use github_review_pr to review PRs (auto-adds "Reviewed by EcliBot AI" footer)
- Use github_comment_issue to respond to issues (auto-adds "Responded via EcliBot AI" footer)
- When reviewing code, check for bugs, security issues, style, and suggest improvements

Be concise. Use tools for real data. Confirm destructive actions.`;

export interface AgentProgress {
  type: "thinking" | "tool" | "text" | "tool_done";
  text?: string;
  toolName?: string;
}

export interface AgentResult {
  reply: string;
  toolsUsed: string[];
}

async function executeGithubTool(token: string, name: string, args: any): Promise<string> {
  try {
    let result: any;
    switch (name) {
      case "github_get_file": result = await githubService.getFile(token, args.owner, args.repo, args.path, args.ref); break;
      case "github_create_branch": result = await githubService.createBranch(token, args.owner, args.repo, args.branchName, args.fromBranch); break;
      case "github_update_file": result = await githubService.updateFile(token, args.owner, args.repo, args.path, args.content, args.message, args.branch); break;
      case "github_create_pr": result = await githubService.createPullRequest(token, args.owner, args.repo, args.title, args.body, args.head, args.base); break;
      case "github_list_prs": result = await githubService.listPullRequests(token, args.owner, args.repo, args.state); break;
      case "github_get_repo": result = await githubService.getRepoInfo(token, args.owner, args.repo); break;
      case "github_search_code": result = await githubService.searchCode(token, args.query, args.owner, args.repo); break;
      case "github_get_pr": result = await githubService.getPullRequest(token, args.owner, args.repo, args.prNumber); break;
      case "github_get_pr_files": result = await githubService.getPRFiles(token, args.owner, args.repo, args.prNumber); break;
      case "github_get_diff": result = await githubService.getPRDiff(token, args.owner, args.repo, args.prNumber); break;
      case "github_review_pr": result = await githubService.reviewPR(token, args.owner, args.repo, args.prNumber, args.body, args.event || "COMMENT"); break;
      case "github_comment_issue": result = await githubService.commentOnIssue(token, args.owner, args.repo, args.issueNumber, args.body); break;
      case "github_list_issues": result = await githubService.listIssues(token, args.owner, args.repo, args.state); break;
      case "github_get_issue": result = await githubService.getIssue(token, args.owner, args.repo, args.issueNumber); break;
      case "github_get_comments": result = await githubService.listIssueComments(token, args.owner, args.repo, args.issueNumber); break;
      case "github_close_issue": result = await githubService.closeIssue(token, args.owner, args.repo, args.issueNumber, args.comment); break;
      case "github_close_pr": result = await githubService.closePR(token, args.owner, args.repo, args.prNumber); break;
      case "github_merge_pr": result = await githubService.mergePR(token, args.owner, args.repo, args.prNumber, args.method || "merge", args.title); break;
      case "github_request_review": result = await githubService.requestReviewers(token, args.owner, args.repo, args.prNumber, args.reviewers); break;
      default: return JSON.stringify({ error: `Unknown GitHub tool: ${name}` });
    }
    return JSON.stringify(result);
  } catch (err: any) {
    return JSON.stringify({ error: err.message || String(err) });
  }
}

const githubTools: Array<{
  type: "function";
  function: { name: string; description: string; parameters: Record<string, any> };
}> = [
  { type: "function", function: { name: "github_get_file", description: "Get file contents from a GitHub repository", parameters: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" }, path: { type: "string" }, ref: { type: "string" } }, required: ["owner", "repo", "path"] } } },
  { type: "function", function: { name: "github_create_branch", description: "Create a new branch", parameters: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" }, branchName: { type: "string" }, fromBranch: { type: "string" } }, required: ["owner", "repo", "branchName"] } } },
  { type: "function", function: { name: "github_update_file", description: "Create or update a file", parameters: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" }, path: { type: "string" }, content: { type: "string" }, message: { type: "string" }, branch: { type: "string" } }, required: ["owner", "repo", "path", "content", "message", "branch"] } } },
  { type: "function", function: { name: "github_create_pr", description: "Create a pull request", parameters: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" }, title: { type: "string" }, body: { type: "string" }, head: { type: "string" }, base: { type: "string" } }, required: ["owner", "repo", "title", "body", "head", "base"] } } },
  { type: "function", function: { name: "github_list_prs", description: "List pull requests", parameters: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" }, state: { type: "string", enum: ["open", "closed", "all"] } }, required: ["owner", "repo"] } } },
  { type: "function", function: { name: "github_get_repo", description: "Get repository info", parameters: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" } }, required: ["owner", "repo"] } } },
  { type: "function", function: { name: "github_search_code", description: "Search code across GitHub", parameters: { type: "object", properties: { query: { type: "string" }, owner: { type: "string" }, repo: { type: "string" } }, required: ["query"] } } },
  { type: "function", function: { name: "github_get_pr", description: "Get PR details", parameters: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" }, prNumber: { type: "number" } }, required: ["owner", "repo", "prNumber"] } } },
  { type: "function", function: { name: "github_get_pr_files", description: "List files changed in a PR", parameters: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" }, prNumber: { type: "number" } }, required: ["owner", "repo", "prNumber"] } } },
  { type: "function", function: { name: "github_get_diff", description: "Get raw diff of a PR", parameters: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" }, prNumber: { type: "number" } }, required: ["owner", "repo", "prNumber"] } } },
  { type: "function", function: { name: "github_review_pr", description: "Submit a PR review (APPROVE, REQUEST_CHANGES, or COMMENT). Adds 'Reviewed by EcliBot AI' footer.", parameters: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" }, prNumber: { type: "number" }, body: { type: "string", description: "Review summary" }, event: { type: "string", enum: ["APPROVE", "REQUEST_CHANGES", "COMMENT"] } }, required: ["owner", "repo", "prNumber", "body"] } } },
  { type: "function", function: { name: "github_comment_issue", description: "Comment on an issue. Adds 'Responded via EcliBot AI' footer.", parameters: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" }, issueNumber: { type: "number" }, body: { type: "string" } }, required: ["owner", "repo", "issueNumber", "body"] } } },
  { type: "function", function: { name: "github_list_issues", description: "List issues in a repo", parameters: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" }, state: { type: "string", enum: ["open", "closed", "all"] } }, required: ["owner", "repo"] } } },
  { type: "function", function: { name: "github_get_issue", description: "Get issue details", parameters: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" }, issueNumber: { type: "number" } }, required: ["owner", "repo", "issueNumber"] } } },
  { type: "function", function: { name: "github_get_comments", description: "List comments on an issue/PR", parameters: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" }, issueNumber: { type: "number" } }, required: ["owner", "repo", "issueNumber"] } } },
  { type: "function", function: { name: "github_close_issue", description: "Close an issue, optionally with a comment. Adds 'Resolved via EcliBot AI' footer.", parameters: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" }, issueNumber: { type: "number" }, comment: { type: "string" } }, required: ["owner", "repo", "issueNumber"] } } },
  { type: "function", function: { name: "github_close_pr", description: "Close a pull request without merging", parameters: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" }, prNumber: { type: "number" } }, required: ["owner", "repo", "prNumber"] } } },
  { type: "function", function: { name: "github_merge_pr", description: "Merge a pull request. Use merge_method: merge, squash, or rebase.", parameters: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" }, prNumber: { type: "number" }, method: { type: "string", enum: ["merge", "squash", "rebase"] }, title: { type: "string" } }, required: ["owner", "repo", "prNumber"] } } },
  { type: "function", function: { name: "github_request_review", description: "Request reviewers on a PR", parameters: { type: "object", properties: { owner: { type: "string" }, repo: { type: "string" }, prNumber: { type: "number" }, reviewers: { type: "array", items: { type: "string" }, description: "Array of GitHub usernames" } }, required: ["owner", "repo", "prNumber", "reviewers"] } } },
];

function sanitizeHistory(history: Message[]): Message[] {
  const validToolIds = new Set<string>();
  for (const msg of history) {
    if (msg.role === "assistant" && msg.tool_calls) {
      for (const tc of msg.tool_calls) validToolIds.add(tc.id);
    }
  }
  return history.filter(msg => {
    if (msg.role !== "tool") return true;
    return msg.tool_call_id && validToolIds.has(msg.tool_call_id);
  });
}

export async function runAgent(
  slackUserId: string,
  conversationKey: string,
  userMessage: string,
  context?: string,
  onProgress?: (progress: AgentProgress) => void
): Promise<AgentResult> {
  const toolsUsed: string[] = [];
  const userCtx = await resolveUser(slackUserId);

  if (!userCtx) {
    onProgress?.({ type: "text", text: "Checking account..." });
    return { reply: "Hello! :wave: I'm *EcliBot*, the AI assistant for EcliPanel.\n\nI see you're new here — you haven't linked your EcliPanel account yet. To use me:\n\n1. Register at *ecli.app* if you don't have an account\n2. Go to *Settings → AI* and turn on *Bring Your Own AI*\n3. Go to *Settings → Slack Bot* and enter your *Slack User ID*\n\nYour Slack User ID can be found by clicking your profile picture → Profile → ••• → Copy member ID.\n\nOnce linked, you can ask me about your servers, GitHub repos, and more!", toolsUsed: [] };
  }

  let fullMessage = userMessage;
  if (context) {
    fullMessage = `[Conversation context]\n${context}\n\n[User message]\n${userMessage}`;
  }

  addMessage(conversationKey, { role: "user", content: fullMessage });

  const ecliToolDefs = getEcliTools(userCtx.isAdmin);
  const allTools = [...ecliToolDefs];
  if (userCtx.githubToken) allTools.push(...githubTools);

  const systemPrompt = SYSTEM_PROMPT +
    `\n\nCurrent user: ${userCtx.firstName} (${userCtx.email})` +
    `\nRole: ${userCtx.role === "*" ? "* (Root Admin)" : userCtx.role === "rootAdmin" ? "Root Admin" : userCtx.isAdmin ? "Administrator" : "User"}` +
    (userCtx.githubLogin ? `\nGitHub: ${userCtx.githubLogin}` : "");

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    ...sanitizeHistory(getConversation(conversationKey)),
  ];

  const MAX_ITERATIONS = 10;
  let iteration = 0;

  while (iteration < MAX_ITERATIONS) {
    iteration++;

    const result = await streamCompletion(messages, (chunk) => {
      if (chunk.type === "thinking") {
        onProgress?.({ type: "thinking" });
      } else if (chunk.type === "tool_start") {
        const tc = chunk.toolCalls?.[0];
        if (tc?.function?.name) {
          onProgress?.({ type: "tool", toolName: tc.function.name });
        }
      } else if (chunk.type === "text" && chunk.text) {
        onProgress?.({ type: "text", text: chunk.fullContent });
      }
    }, allTools, userCtx.aiConfig);

    if (result.toolCalls && result.toolCalls.length > 0) {
      const assistantMsg: Message = {
        role: "assistant",
        content: result.content || "",
        tool_calls: result.toolCalls.map(tc => ({
          id: tc.id,
          type: tc.type,
          function: tc.function,
        })),
      };
      messages.push(assistantMsg);
      addMessage(conversationKey, assistantMsg);

      for (const tc of result.toolCalls) {
        const toolName = tc.function.name;
        let toolArgs: any;
        try { toolArgs = JSON.parse(tc.function.arguments); } catch { toolArgs = {}; }

        toolsUsed.push(toolName);
        onProgress?.({ type: "tool", toolName });

        let toolResult: string;
        if (toolName.startsWith("github_")) {
          if (!userCtx.githubToken) {
            toolResult = JSON.stringify({ error: "GitHub not linked. Link in Settings → Slack Bot." });
          } else {
            toolResult = await executeGithubTool(userCtx.githubToken, toolName, toolArgs);
          }
        } else {
          toolResult = await executeEcliTool(toolName, toolArgs, userCtx.userId, userCtx.isAdmin);
        }

        messages.push({ role: "tool", content: toolResult, tool_call_id: tc.id });
        addMessage(conversationKey, { role: "tool", content: toolResult, tool_call_id: tc.id });

        onProgress?.({ type: "tool_done", toolName });
      }
      continue;
    }

    const reply = result.content || "I couldn't generate a response.";
    addMessage(conversationKey, { role: "assistant", content: reply });
    return { reply, toolsUsed };
  }

  const fallback = "I hit the maximum number of thinking steps.";
  addMessage(conversationKey, { role: "assistant", content: fallback });
  return { reply: fallback, toolsUsed };
}