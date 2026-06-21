import { App } from "@slack/bolt";
import { runAgent, continueAgent, clearPendingContinuation } from "./agent/orchestrator";
import { clearConversation } from "./services/conversation";
import { resolveUser } from "./services/user-context";

let app: App | null = null;
let botUserId: string | null = null;
const messageAuthors = new Map<string, string>(); // `${channel}:${ts}` -> userId

function formatTools(tools: string[]): string {
  const counts = new Map<string, number>();
  for (const t of tools) counts.set(t, (counts.get(t) || 0) + 1);
  return Array.from(counts.entries())
    .map(([name, n]) => n > 1 ? `${name} ×${n}` : name)
    .join(", ");
}

const PII_PATTERNS = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  /\b\d{10,15}\b/g,
  /\b[A-Z0-9]{25,64}\b/g,
];

function hasPII(text: string): boolean {
  for (const pat of PII_PATTERNS) {
    if (pat.test(text)) return true;
  }
  return false;
}

async function addDeleteReaction(client: any, channel: string, ts: string) {
  try {
    await client.reactions.add({ channel, timestamp: ts, name: "wastebasket" });
  } catch (e: any) {
    console.error("[slack-bot] Failed to add 🗑️ reaction:", e.message || e);
  }
}

function cleanPII(text: string): string {
  let cleaned = text;
  for (const pat of PII_PATTERNS) {
    cleaned = cleaned.replace(pat, (match) => {
      if (match.includes("@")) return "`[email hidden]`";
      if (match.includes(".") && match.split(".").length === 4) return "`[IP hidden]`";
      return "`[hidden]`";
    });
  }
  return cleaned;
}

/** Extract the original Slack user ID from a convKey (`channel:...:user:USERID`) */
function getOriginalUserId(convKey: string): string | null {
  const parts = convKey.split(":user:");
  return parts.length === 2 ? parts[1] : null;
}

function buildContinueBlocks(text: string, convKey: string): any[] {
  return [
    { type: "section", text: { type: "mrkdwn", text } },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Continue", emoji: true },
          style: "primary",
          action_id: "continue_thinking",
          value: convKey,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Cancel", emoji: true },
          style: "danger",
          action_id: "cancel_thinking",
          value: convKey,
        },
      ],
    },
  ];
}

function buildRetryBlocks(errorText: string, retryValue: string): any[] {
  return [
    { type: "section", text: { type: "mrkdwn", text: `:warning: ${errorText}` } },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Retry \u267B", emoji: true },
          action_id: "retry_agent",
          value: retryValue,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Dismiss", emoji: true },
          action_id: "dismiss_error",
          value: retryValue,
        },
      ],
    },
  ];
}

function formatToolStatus(statuses: Map<string, string>): string {
  if (statuses.size === 0) return "";
  const parts: string[] = [];
  for (const [name, s] of statuses) {
    parts.push(`\`${name}\` ${s === "done" ? "✓" : "…"}`);
  }
  return `_${parts.join("  ")}_\n`;
}

function renderToolUpdate(
  statuses: Map<string, string>,
  streamText: string
): string {
  const statusLine = formatToolStatus(statuses);
  const clean = hasPII(streamText) ? cleanPII(streamText) : streamText;
  return statusLine + clean;
}

function buildFinalReply(
  toolCalls: string[],
  statuses: Map<string, string>,
  reply: string
): string {
  const statusLine = formatToolStatus(statuses);
  const toolsLine = toolCalls.length > 0 ? `_AI used: ${formatTools(toolCalls)}_\n` : "";
  return statusLine + toolsLine + reply;
}

export function initSlackBot(): void {
  if (!process.env.SLACK_BOT_TOKEN || !process.env.SLACK_APP_TOKEN) {
    console.log("[slack-bot] Slack tokens not configured — bot disabled");
    return;
  }

  if (process.env.SLACK_BOT_ENABLED === "false") {
    console.log("[slack-bot] SLACK_BOT_ENABLED=false — bot disabled");
    return;
  }

  app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    appToken: process.env.SLACK_APP_TOKEN,
    socketMode: process.env.SLACK_SOCKET_MODE !== "false",
    signingSecret: process.env.SLACK_SIGNING_SECRET,
  });

  app.command("/ecli", async ({ command, ack, respond, client }) => {
    await ack();
    const text = command.text.trim();
    if (!text) {
      await respond({ text: "Usage: `/ecli <your question>`\nExample: `/ecli list my servers`", response_type: "ephemeral" });
      return;
    }

    const convKey = `channel:${command.channel_id}:user:${command.user_id}`;

    const msg = await client.chat.postEphemeral({ channel: command.channel_id, user: command.user_id, text: "_Thinking..._" });
    const ts = (msg as any).message_ts as string;

    try {
      let toolCalls: string[] = [];
      let toolStatuses = new Map<string, string>();
      let streamText = "";
      const result = await runAgent(command.user_id, convKey, text, undefined, async (p) => {
        if (p.type === "tool" && p.toolName) {
          toolCalls.push(p.toolName);
          toolStatuses.set(p.toolName, "running");
          await client.chat.update({ channel: command.channel_id, ts, text: renderToolUpdate(toolStatuses, streamText) });
        } else if (p.type === "tool_done" && p.toolName) {
          toolStatuses.set(p.toolName, "done");
          await client.chat.update({ channel: command.channel_id, ts, text: renderToolUpdate(toolStatuses, streamText) });
        } else if (p.type === "text" && p.text) {
          streamText = p.text;
          await client.chat.update({ channel: command.channel_id, ts, text: renderToolUpdate(toolStatuses, streamText) });
        }
      });

      const tools = toolCalls.length > 0 ? `_AI used: ${formatTools(toolCalls)}_\n` : "";

      if (result.status === "thinking_limit") {
        const displayText = streamText || "_No response generated yet._";
        const currentText = formatToolStatus(toolStatuses) + tools + displayText + "\n\n" + result.reply;
        await client.chat.update({
          channel: command.channel_id,
          ts,
          text: currentText,
          blocks: buildContinueBlocks(currentText, convKey),
        });
        messageAuthors.set(`${command.channel_id}:${ts}`, command.user_id);
        await addDeleteReaction(client, command.channel_id, ts);
        return;
      }

      const fullReply = buildFinalReply(toolCalls, toolStatuses, result.reply);

      if (hasPII(fullReply)) {
        await client.chat.update({ channel: command.channel_id, ts, text: formatToolStatus(toolStatuses) + cleanPII(result.reply) });
        await client.chat.postEphemeral({ channel: command.channel_id, user: command.user_id, text: `:warning: *PII detected — full response (only visible to you):*\n\n${fullReply}`,
          blocks: [
            { type: "section", text: { type: "mrkdwn", text: `:warning: *PII detected — full response:*\n\n${fullReply.slice(0, 2800)}` } },
            { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Post publicly" }, action_id: "publish_ephemeral_pii", value: JSON.stringify({ channel: command.channel_id, ts, fullReply }) }] },
          ],
        });
      } else {
        await client.chat.update({ channel: command.channel_id, ts, text: fullReply });
      }
      messageAuthors.set(`${command.channel_id}:${ts}`, command.user_id);
      await addDeleteReaction(client, command.channel_id, ts);
      await respond({ text: result.reply, response_type: "in_channel", mrkdwn: true });
    } catch (err: any) {
      const retryValue = JSON.stringify({ convKey, text, channel: command.channel_id, userId: command.user_id });
      await client.chat.update({
        channel: command.channel_id,
        ts,
        text: `⚠️ ${err.message}`,
        blocks: buildRetryBlocks(err.message, retryValue),
      });
    }
  });

  app.command("/ecli-reset", async ({ command, ack, respond }) => {
    await ack();
    clearConversation(`channel:${command.channel_id}:user:${command.user_id}`);
    clearPendingContinuation(`channel:${command.channel_id}:user:${command.user_id}`);
    await respond({ text: "Conversation history cleared.", response_type: "ephemeral" });
  });

  app.event("app_mention", async ({ event, client }) => {
    const text = event.text.replace(/<@[A-Z0-9]+>/, "").trim();
    const threadTs = (event as any).thread_ts || undefined;
    const replyThread = threadTs || (event as any).ts;

    const lower = text.toLowerCase();
    if (lower === "forget" || lower === "reset" || lower === "clear" || lower === "clear history") {
      clearConversation(`channel:${event.channel}:user:${event.user}`);
      clearPendingContinuation(`channel:${event.channel}:user:${event.user}`);
      await client.chat.postMessage({ channel: event.channel, thread_ts: replyThread, text: "_Conversation history cleared. I'll start fresh._", mrkdwn: true });
      return;
    }

    if (!text) {
      const linked = await resolveUser(event.user);
      if (!linked) {
        await client.chat.postMessage({ channel: event.channel, thread_ts: replyThread, text: "Hello! :wave: I'm *EcliBot*, the AI assistant for EcliPanel.\n\nTo use me:\n1. Register at *ecli.app*\n2. Go to *Settings → AI* and enable *Bring Your Own AI*\n3. Go to *Settings → Slack Bot* and enter your Slack User ID\n\nYour Slack User ID → profile picture → Profile → ••• → Copy member ID.", mrkdwn: true });
      } else {
        await client.chat.postMessage({ channel: event.channel, thread_ts: replyThread, text: "Hi! Ask me anything about your EcliPanel servers, GitHub repos, or infrastructure. :wave:", mrkdwn: true });
      }
      return;
    }

    const userId = event.user;
    if (!userId) return;
    const convKey = `channel:${event.channel}:user:${userId}`;

    let context = "";
    try {
      if (threadTs) {
        const replies = await client.conversations.replies({ channel: event.channel, ts: threadTs, limit: 15 });
        if (replies.messages?.length) {
          context = replies.messages.filter((m: any) => !m.bot_id || m.subtype === "bot_message").slice(-15).map((m: any) => `[${m.user || "bot"}]: ${m.text}`).join("\n");
        }
      } else {
        const history = await client.conversations.history({ channel: event.channel, limit: 15 });
        if (history.messages?.length) {
          context = history.messages.filter((m: any) => !m.bot_id || m.subtype === "bot_message").slice(-15).map((m: any) => `[${m.user || "bot"}]: ${m.text}`).join("\n");
        }
      }
    } catch {}

    const msg = await client.chat.postMessage({ channel: event.channel, thread_ts: replyThread, text: "_Thinking..._", mrkdwn: true });
    const ts = msg.ts!;

    try {
      let toolCalls: string[] = [];
      let toolStatuses = new Map<string, string>();
      let streamText = "";
      const result = await runAgent(userId, convKey, text, context || undefined, async (p) => {
        if (p.type === "tool" && p.toolName) {
          toolCalls.push(p.toolName);
          toolStatuses.set(p.toolName, "running");
          await client.chat.update({ channel: event.channel, ts, text: renderToolUpdate(toolStatuses, streamText) });
        } else if (p.type === "tool_done" && p.toolName) {
          toolStatuses.set(p.toolName, "done");
          await client.chat.update({ channel: event.channel, ts, text: renderToolUpdate(toolStatuses, streamText) });
        } else if (p.type === "text" && p.text) {
          streamText = p.text;
          await client.chat.update({ channel: event.channel, ts, text: renderToolUpdate(toolStatuses, streamText) });
        }
      });

      const tools = toolCalls.length > 0 ? `_AI used: ${formatTools(toolCalls)}_\n` : "";

      if (result.status === "thinking_limit") {
        const displayText = streamText || "_No response generated yet._";
        const currentText = formatToolStatus(toolStatuses) + tools + displayText + "\n\n" + result.reply;
        await client.chat.update({
          channel: event.channel,
          ts,
          text: currentText,
          blocks: buildContinueBlocks(currentText, convKey),
        });
        messageAuthors.set(`${event.channel}:${ts}`, userId);
        await addDeleteReaction(client, event.channel, ts);
        return;
      }

      const fullReply = buildFinalReply(toolCalls, toolStatuses, result.reply);

      if (hasPII(fullReply)) {
        await client.chat.update({ channel: event.channel, ts, text: formatToolStatus(toolStatuses) + cleanPII(result.reply) });
        messageAuthors.set(`${event.channel}:${ts}`, userId);
        await addDeleteReaction(client, event.channel, ts);
        await client.chat.postEphemeral({
          channel: event.channel, user: userId, thread_ts: replyThread,
          text: `:warning: *PII detected — full response (only visible to you):*\n\n${fullReply}`,
          blocks: [
            { type: "section", text: { type: "mrkdwn", text: `:warning: *PII detected — full response:*\n\n${fullReply.slice(0, 2800)}` } },
            { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Post publicly" }, action_id: "publish_pii", value: JSON.stringify({ channel: event.channel, ts, fullReply, threadTs: replyThread }) }] },
          ],
        });
      } else {
        await client.chat.update({ channel: event.channel, ts, text: fullReply });
        messageAuthors.set(`${event.channel}:${ts}`, userId);
        await addDeleteReaction(client, event.channel, ts);
      }

    } catch (err: any) {
      const retryValue = JSON.stringify({ convKey, text, channel: event.channel, userId, threadTs: replyThread });
      await client.chat.update({
        channel: event.channel,
        ts,
        text: `⚠️ ${err.message}`,
        blocks: buildRetryBlocks(err.message, retryValue),
      });
    }
  });

  app.message(async (ctx: any) => {
    const { message, client } = ctx;
    if (message.subtype || (message as any).bot_id) return;
    if (process.env.ECLI_ALWAYS_LISTEN !== "true") return;
    const text = (message as any).text?.trim();
    if (!text || text.startsWith("/ecli")) return;
    const userId = (message as any).user;
    if (!userId) return;

    const convKey = `channel:${message.channel}:user:${userId}`;

    let context = "";
    try {
      const history = await client.conversations.history({ channel: message.channel, limit: 15 });
      if (history.messages?.length) {
        context = history.messages.filter((m: any) => !m.bot_id || m.subtype === "bot_message").slice(-15).map((m: any) => `[${m.user || "bot"}]: ${m.text}`).join("\n");
      }
    } catch {}

    const msg = await client.chat.postMessage({ channel: message.channel, text: "_Thinking..._", mrkdwn: true });
    const ts = msg.ts!;

    try {
      let streamText = "";
      let toolCalls: string[] = [];
      let toolStatuses = new Map<string, string>();
      const result = await runAgent(userId, convKey, text, context || undefined, async (p) => {
        if (p.type === "tool" && p.toolName) {
          toolCalls.push(p.toolName);
          toolStatuses.set(p.toolName, "running");
          await client.chat.update({ channel: message.channel, ts, text: renderToolUpdate(toolStatuses, streamText) });
        } else if (p.type === "tool_done" && p.toolName) {
          toolStatuses.set(p.toolName, "done");
          await client.chat.update({ channel: message.channel, ts, text: renderToolUpdate(toolStatuses, streamText) });
        } else if (p.type === "text" && p.text) {
          streamText = p.text;
          await client.chat.update({ channel: message.channel, ts, text: renderToolUpdate(toolStatuses, streamText) });
        }
      });

      if (result.status === "thinking_limit") {
        const tools = toolCalls.length > 0 ? `_AI used: ${formatTools(toolCalls)}_\n` : "";
        const displayText = streamText || "_No response generated yet._";
        const currentText = formatToolStatus(toolStatuses) + tools + displayText + "\n\n" + result.reply;
        await client.chat.update({
          channel: message.channel,
          ts,
          text: currentText,
          blocks: buildContinueBlocks(currentText, convKey),
        });
        messageAuthors.set(`${message.channel}:${ts}`, userId);
        await addDeleteReaction(client, message.channel, ts);
        return;
      }

      await client.chat.update({ channel: message.channel, ts, text: buildFinalReply(toolCalls, toolStatuses, result.reply) });
      messageAuthors.set(`${message.channel}:${ts}`, userId);
      await addDeleteReaction(client, message.channel, ts);
    } catch (err: any) {
      const retryValue = JSON.stringify({ convKey, text, channel: message.channel, userId });
      await client.chat.update({
        channel: message.channel,
        ts,
        text: `⚠️ ${err.message}`,
        blocks: buildRetryBlocks(err.message, retryValue),
      });
    }
  });

  app.start().then(async () => {
    try {
      const auth = await app!.client.auth.test();
      botUserId = (auth as any).user_id || null;
    } catch {}
    console.log("[slack-bot] EcliPanel Slack Bot running (Socket Mode)");
  }).catch((err: any) => {
    console.error("[slack-bot] Failed to start:", err);
  });

  app.event("reaction_added", async ({ event, client }) => {
    if (event.reaction !== "wastebasket") return;
    if (event.item.type !== "message") return;
    const key = `${event.item.channel}:${event.item.ts}`;
    const author = messageAuthors.get(key);
    if (!author || event.user !== author) return;
    try {
      await client.chat.delete({ channel: event.item.channel, ts: event.item.ts });
      messageAuthors.delete(key);
    } catch {}
  });

  app.action("publish_pii", async ({ action, ack, client }) => {
    await ack();
    try {
      const data = JSON.parse((action as any).value);
      await client.chat.update({ channel: data.channel, ts: data.ts, text: data.fullReply, blocks: [] });
    } catch {}
  });

  app.action("publish_ephemeral_pii", async ({ action, ack, respond }) => {
    await ack();
    try {
      const data = JSON.parse((action as any).value);
      await respond({ text: data.fullReply, response_type: "in_channel", mrkdwn: true, replace_original: false });
    } catch {}
  });

  // Handle continue button — only original user can continue
  app.action("continue_thinking", async ({ action, ack, client, body }) => {
    await ack();
    const convKey = (action as any).value;
    const slackUserId = (body as any).user?.id;
    if (!slackUserId || !convKey) return;

    const originalUserId = getOriginalUserId(convKey);
    if (originalUserId && originalUserId !== slackUserId) {
      await client.chat.postEphemeral({
        channel: (body as any).channel?.id || (body as any).channel,
        user: slackUserId,
        text: "Only the person who asked the question can continue or cancel this conversation.",
      });
      return;
    }

    const channel = (body as any).channel?.id || (body as any).channel;
    const messageTs = (body as any).message?.ts;
    if (!channel || !messageTs) return;

    // Update message to show continuing
    await client.chat.update({
      channel,
      ts: messageTs,
      text: "_Continuing..._",
      blocks: [],
    });

    try {
      let toolCalls: string[] = [];
      let toolStatuses = new Map<string, string>();
      let streamText = "";
      const result = await continueAgent(slackUserId, convKey, async (p) => {
        if (p.type === "tool" && p.toolName) {
          toolCalls.push(p.toolName);
          toolStatuses.set(p.toolName, "running");
          await client.chat.update({ channel, ts: messageTs, text: renderToolUpdate(toolStatuses, streamText) });
        } else if (p.type === "tool_done" && p.toolName) {
          toolStatuses.set(p.toolName, "done");
          await client.chat.update({ channel, ts: messageTs, text: renderToolUpdate(toolStatuses, streamText) });
        } else if (p.type === "text" && p.text) {
          streamText = p.text;
          await client.chat.update({ channel, ts: messageTs, text: renderToolUpdate(toolStatuses, streamText) });
        }
      });

      const tools = toolCalls.length > 0 ? `_AI used: ${formatTools(toolCalls)}_\n` : "";

      if (result.status === "thinking_limit") {
        const displayText = streamText || "_No response generated yet._";
        const currentText = formatToolStatus(toolStatuses) + tools + displayText + "\n\n" + result.reply;
        await client.chat.update({
          channel,
          ts: messageTs,
          text: currentText,
          blocks: buildContinueBlocks(currentText, convKey),
        });
      } else {
        const finalText = buildFinalReply(toolCalls, toolStatuses, result.reply);
        await client.chat.update({ channel, ts: messageTs, text: finalText, blocks: [] });
      }
    } catch (err: any) {
      await client.chat.update({ channel, ts: messageTs, text: `⚠️ ${err.message}`, blocks: [] });
    }
  });

  // Handle cancel button — only original user can cancel
  app.action("cancel_thinking", async ({ action, ack, client, body }) => {
    await ack();
    const convKey = (action as any).value;
    const slackUserId = (body as any).user?.id;
    if (!slackUserId || !convKey) return;

    const originalUserId = getOriginalUserId(convKey);
    if (originalUserId && originalUserId !== slackUserId) {
      await client.chat.postEphemeral({
        channel: (body as any).channel?.id || (body as any).channel,
        user: slackUserId,
        text: "Only the person who asked the question can continue or cancel this conversation.",
      });
      return;
    }

    const channel = (body as any).channel?.id || (body as any).channel;
    const messageTs = (body as any).message?.ts;
    if (!channel || !messageTs) return;

    clearPendingContinuation(convKey);

    await client.chat.update({
      channel,
      ts: messageTs,
      text: "_Cancelled._",
      blocks: [],
    });
  });

  // Handle retry button — only original user can retry
  app.action("retry_agent", async ({ action, ack, client, body }) => {
    await ack();
    let data: any;
    try { data = JSON.parse((action as any).value); } catch { return; }
    const { convKey, text, channel, userId, threadTs } = data;
    const slackUserId = (body as any).user?.id;
    if (!slackUserId || !convKey || !channel || !userId || !text) return;

    const originalUserId = getOriginalUserId(convKey);
    if (originalUserId && originalUserId !== slackUserId) {
      await client.chat.postEphemeral({
        channel,
        user: slackUserId,
        text: "Only the person who asked the question can retry.",
      });
      return;
    }

    const messageTs = (body as any).message?.ts;
    if (!messageTs) return;

    await client.chat.update({ channel, ts: messageTs, text: "_Retrying..._", blocks: [] });

    try {
      let toolCalls: string[] = [];
      let toolStatuses = new Map<string, string>();
      let streamText = "";
      const result = await runAgent(slackUserId, convKey, text, undefined, async (p) => {
        if (p.type === "tool" && p.toolName) {
          toolCalls.push(p.toolName);
          toolStatuses.set(p.toolName, "running");
          await client.chat.update({ channel, ts: messageTs, text: renderToolUpdate(toolStatuses, streamText) });
        } else if (p.type === "tool_done" && p.toolName) {
          toolStatuses.set(p.toolName, "done");
          await client.chat.update({ channel, ts: messageTs, text: renderToolUpdate(toolStatuses, streamText) });
        } else if (p.type === "text" && p.text) {
          streamText = p.text;
          await client.chat.update({ channel, ts: messageTs, text: renderToolUpdate(toolStatuses, streamText) });
        }
      });

      if (result.status === "thinking_limit") {
        const tools = toolCalls.length > 0 ? `_AI used: ${formatTools(toolCalls)}_\n` : "";
        const displayText = streamText || "_No response generated yet._";
        const currentText = formatToolStatus(toolStatuses) + tools + displayText + "\n\n" + result.reply;
        await client.chat.update({
          channel,
          ts: messageTs,
          text: currentText,
          blocks: buildContinueBlocks(currentText, convKey),
        });
      } else {
        await client.chat.update({
          channel,
          ts: messageTs,
          text: buildFinalReply(toolCalls, toolStatuses, result.reply),
          blocks: [],
        });
      }
      messageAuthors.set(`${channel}:${messageTs}`, slackUserId);
      await addDeleteReaction(client, channel, messageTs);
    } catch (err: any) {
      const retryValue = JSON.stringify({ convKey, text, channel, userId, threadTs });
      await client.chat.update({
        channel,
        ts: messageTs,
        text: `⚠️ ${err.message}`,
        blocks: buildRetryBlocks(err.message, retryValue),
      });
    }
  });

  // Handle dismiss button — only original user can dismiss
  app.action("dismiss_error", async ({ action, ack, client, body }) => {
    await ack();
    let data: any;
    try { data = JSON.parse((action as any).value); } catch { return; }
    const { convKey } = data;
    const slackUserId = (body as any).user?.id;
    if (!slackUserId || !convKey) return;

    const originalUserId = getOriginalUserId(convKey);
    if (originalUserId && originalUserId !== slackUserId) return;

    const channel = (body as any).channel?.id || (body as any).channel;
    const messageTs = (body as any).message?.ts;
    if (!channel || !messageTs) return;

    await client.chat.update({ channel, ts: messageTs, text: "_Dismissed._", blocks: [] });
  });
}

export function stopSlackBot(): Promise<void> {
  if (!app) return Promise.resolve();
  return app.stop().then(() => {}) as Promise<void>;
}
