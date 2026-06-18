import { App } from "@slack/bolt";
import { runAgent } from "./agent/orchestrator";
import { clearConversation } from "./services/conversation";

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
      let streamText = "";
      const result = await runAgent(command.user_id, convKey, text, undefined, async (p) => {
        if (p.type === "tool" && p.toolName) {
          toolCalls.push(p.toolName);
        } else if (p.type === "text" && p.text) {
          streamText = p.text;
          const tools = toolCalls.length > 0 ? `_AI used: ${formatTools(toolCalls)}_\n\n` : "";
          await client.chat.update({ channel: command.channel_id, ts, text: tools + streamText });
        }
      });

      const tools = toolCalls.length > 0 ? `_AI used: ${formatTools(toolCalls)}_\n\n` : "";
      await client.chat.update({ channel: command.channel_id, ts, text: tools + result.reply });
      messageAuthors.set(`${command.channel_id}:${ts}`, command.user_id);
      await addDeleteReaction(client, command.channel_id, ts);
      await respond({ text: result.reply, response_type: "in_channel", mrkdwn: true });
    } catch (err: any) {
      await client.chat.update({ channel: command.channel_id, ts, text: `*Error:* ${err.message}` });
    }
  });

  app.command("/ecli-reset", async ({ command, ack, respond }) => {
    await ack();
    clearConversation(`channel:${command.channel_id}:user:${command.user_id}`);
    await respond({ text: "Conversation history cleared.", response_type: "ephemeral" });
  });

  app.event("app_mention", async ({ event, client }) => {
    const text = event.text.replace(/<@[A-Z0-9]+>/, "").trim();
    const threadTs = (event as any).thread_ts || undefined;

    const lower = text.toLowerCase();
    if (lower === "forget" || lower === "reset" || lower === "clear" || lower === "clear history") {
      clearConversation(`channel:${event.channel}:user:${event.user}`);
      await client.chat.postMessage({ channel: event.channel, thread_ts: threadTs, text: "_Conversation history cleared. I'll start fresh._", mrkdwn: true });
      return;
    }

    if (!text) {
      await client.chat.postMessage({ channel: event.channel, thread_ts: threadTs, text: "Hi! Ask me anything about your EcliPanel servers, GitHub repos, or infrastructure. :wave:", mrkdwn: true });
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

    const msg = await client.chat.postMessage({ channel: event.channel, thread_ts: threadTs, text: "_Thinking..._", mrkdwn: true });
    const ts = msg.ts!;

    try {
      let toolCalls: string[] = [];
      let streamText = "";
      const result = await runAgent(userId, convKey, text, context || undefined, async (p) => {
        if (p.type === "tool" && p.toolName) {
          toolCalls.push(p.toolName);
        } else if (p.type === "text" && p.text) {
          streamText = p.text;
          const tools = toolCalls.length > 0 ? `_AI used: ${formatTools(toolCalls)}_\n\n` : "";
          await client.chat.update({ channel: event.channel, ts, text: tools + streamText });
        }
      });

      const tools = toolCalls.length > 0 ? `_AI used: ${formatTools(toolCalls)}_\n\n` : "";
      const fullReply = tools + result.reply;

      if (hasPII(fullReply)) {
        const cleanReply = tools + cleanPII(result.reply);
        await client.chat.update({ channel: event.channel, ts, text: cleanReply });
        messageAuthors.set(`${event.channel}:${ts}`, userId);
        await addDeleteReaction(client, event.channel, ts);
        await client.chat.postEphemeral({
          channel: event.channel,
          user: userId,
          thread_ts: threadTs,
          text: `:warning: *PII detected in this response.*\n\n${fullReply}`,
          blocks: [
            { type: "section", text: { type: "mrkdwn", text: `:warning: *PII detected — full response (only visible to you):*\n\n${fullReply}` } },
            { type: "actions", elements: [{ type: "button", text: { type: "plain_text", text: "Post publicly" }, action_id: "publish_pii", value: JSON.stringify({ channel: event.channel, ts, fullReply, threadTs }) }] },
          ],
        });
      } else {
        await client.chat.update({ channel: event.channel, ts, text: fullReply });
        messageAuthors.set(`${event.channel}:${ts}`, userId);
        await addDeleteReaction(client, event.channel, ts);
      }

    } catch (err: any) {
      await client.chat.update({ channel: event.channel, ts, text: `*Error:* ${err.message}` });
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
      const result = await runAgent(userId, convKey, text, context || undefined, async (p) => {
        if (p.type === "text" && p.text) {
          streamText = p.text;
          await client.chat.update({ channel: message.channel, ts, text: streamText });
        }
      });
      await client.chat.update({ channel: message.channel, ts, text: result.reply });
      messageAuthors.set(`${message.channel}:${ts}`, userId);
      await addDeleteReaction(client, message.channel, ts);
    } catch (err: any) {
      await client.chat.update({ channel: message.channel, ts, text: `*Error:* ${err.message}` });
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

  app.action("publish_pii", async ({ action, ack, client, respond }) => {
    await ack();
    try {
      const data = JSON.parse((action as any).value);
      await client.chat.update({ channel: data.channel, ts: data.ts, text: data.fullReply, blocks: [] });
      if (data.threadTs) {
        await client.chat.postEphemeral({ channel: data.channel, user: (action as any).user?.id, text: ":white_check_mark: Published to channel." });
      }
    } catch {}
  });
}

export function stopSlackBot(): Promise<void> {
  if (!app) return Promise.resolve();
  return app.stop().then(() => {}) as Promise<void>;
}