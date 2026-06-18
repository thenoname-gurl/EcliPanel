import { streamCompletion } from "../services/ai";
import { githubService } from "../services/github";
import { getEcliTools, executeEcliTool } from "../services/ecli-tools";
import { resolveUser, type UserContext } from "../services/user-context";
import { getConversation, addMessage, type Message } from "../services/conversation";

const SYSTEM_PROMPT = `You are EcliBot, a personal AI assistant for EcliPanel — a server management platform.
You help users manage their servers, nodes, organisations, DNS, tickets, and GitHub repositories.

CRITICAL: Use Slack mrkdwn format ONLY. DISALLOWED: tables (|), headings (# ## ###), horizontal rules (---, ***), HTML tags.
USE THESE FORMATS ONLY:
- *bold* (single asterisks, no double)
- _italic_ (underscores)
- \`code\` for inline code
- \`\`\` for code blocks (no language tags)
- • bullet lists (use • not -)
- 1. numbered lists
- > blockquotes for callouts
- :emoji_name: for emojis (use standard Slack emojis only)

Always separate sections with a blank line. Never use markdown tables.
Be concise and helpful. Use tools to provide real data, not make up responses.`;

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
  { type: "function", function: { name: "github_search_code", description: "Search code", parameters: { type: "object", properties: { query: { type: "string" }, owner: { type: "string" }, repo: { type: "string" } }, required: ["query"] } } },
];

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
    ...getConversation(conversationKey),
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