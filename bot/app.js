// app.js — NSR sales bot. Socket Mode, listens for DMs, answers with Claude
// using a live KPI snapshot as context. Standalone; deploy on Railway.

import pkg from "@slack/bolt";
const { App } = pkg;
import Anthropic from "@anthropic-ai/sdk";
import { getSnapshot } from "./data.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-6";

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,        // xoxb-...
  appToken: process.env.SLACK_APP_TOKEN,     // xapp-... (Socket Mode)
  socketMode: true,
});

// Short rolling memory per DM channel so "compare that to last month" works.
const history = new Map(); // channelId -> [{role, content}, ...]
const MAX_TURNS = 8;

function systemPrompt(snapshot) {
  return [
    "You are the NSR sales assistant for New Standard Restoration, a roofing/exterior restoration company.",
    "You answer the owner's questions about sales KPIs concisely and directly, like a sharp sales manager.",
    "Use ONLY the data in the snapshot below. If something isn't in it, say so plainly — don't invent numbers.",
    "Revenue is in USD. 'Doors' and 'appointments' come from Active Knocker; if doorKnockReady is false, note that door data isn't live yet.",
    "Company culture is 'Discipline Over Motivation' — keep answers grounded and actionable. Format for Slack (short, scannable).",
    "",
    "LIVE KPI SNAPSHOT (JSON):",
    JSON.stringify(snapshot),
  ].join("\n");
}

async function answer(channel, userText) {
  const snapshot = await getSnapshot();
  const turns = history.get(channel) ?? [];
  turns.push({ role: "user", content: userText });

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: systemPrompt(snapshot),
    messages: turns.slice(-MAX_TURNS),
  });

  const reply = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim()
    || "I couldn't generate a response.";
  turns.push({ role: "assistant", content: reply });
  history.set(channel, turns.slice(-MAX_TURNS));
  return reply;
}

// Respond to direct messages only (ignore bot's own messages and non-DM events).
app.message(async ({ message, say, client }) => {
  if (message.subtype === "bot_message" || message.bot_id) return;
  if (message.channel_type !== "im") return; // DMs only

  try {
    await client.assistant?.threads?.setStatus?.({ channel_id: message.channel, thread_ts: message.ts, status: "thinking…" }).catch(() => {});
    const reply = await answer(message.channel, message.text || "");
    await say(reply);
  } catch (err) {
    console.error("Answer failed:", err);
    await say(`Something went wrong pulling the numbers: ${err.message}`);
  }
});

// Quick reset command.
app.message(/^(reset|clear)$/i, async ({ message, say }) => {
  if (message.channel_type !== "im") return;
  history.delete(message.channel);
  await say("Cleared our conversation. Ask away.");
});

(async () => {
  await app.start();
  console.log("⚡ NSR sales bot running (Socket Mode).");
})();
