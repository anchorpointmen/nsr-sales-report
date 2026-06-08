// app.js — "Steven", NSR's sales agent. Socket Mode Slack bot.
// Answers any sales question by calling AccuLynx tools live (Claude picks the tool).
// Hard anti-flood caps: one question at a time per channel, bounded tool loop,
// exactly one reply per message, cooldown between replies.

import pkg from "@slack/bolt";
const { App } = pkg;
import Anthropic from "@anthropic-ai/sdk";
import { TOOL_DEFS, runTool } from "./acculynx-tools.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-6";
const MAX_TOOL_TURNS = 6;
const COOLDOWN_MS = 3000;

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

const channels = new Map();
function chan(id) {
  if (!channels.has(id)) channels.set(id, { history: [], busy: false, lastReply: 0 });
  return channels.get(id);
}
const MAX_TURNS = 8;

function systemPrompt() {
  const today = new Date().toISOString().slice(0, 10);
  return [
    "You are Steven, the sales agent for New Standard Restoration (NSR), a roofing/exterior restoration company.",
    `Today's date is ${today}. NSR's timezone is America/Chicago.`,
    "You answer sales questions by calling the provided AccuLynx tools to get LIVE data. Never invent numbers — if a tool returns nothing, say so.",
    "A SALE is dated by when a job entered the 'Approved' milestone. Use sales_by_approved_date for any sales question.",
    "For 'leads', 'prospects', or pipeline-position questions, use jobs_by_milestone or pipeline_snapshot.",
    "Compute date ranges yourself from the question (e.g. 'this week' = the current Sat–Fri; 'this month' = 1st to today; 'this year' = Jan 1 to today) and pass them to the tools.",
    "Revenue is USD. Keep answers short and scannable for Slack — lead with the number, then a brief per-rep breakdown if relevant.",
    "Company motto: Discipline Over Motivation.",
  ].join("\n");
}

async function runAgent(history) {
  const messages = [...history];
  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt(),
      tools: TOOL_DEFS,
      messages,
    });

    const toolUses = res.content.filter((b) => b.type === "tool_use");
    if (toolUses.length === 0) {
      const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
      messages.push({ role: "assistant", content: res.content });
      return { text: text || "I didn't find anything for that.", messages };
    }

    messages.push({ role: "assistant", content: res.content });
    const toolResults = [];
    for (const tu of toolUses) {
      try {
        const result = await runTool(tu.name, tu.input || {});
        toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(result).slice(0, 8000) });
      } catch (err) {
        toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: `Error: ${err.message}`, is_error: true });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }
  return { text: "That took too many steps to compute — try narrowing the question (e.g. a specific date range).", messages };
}

app.message(async ({ message, say }) => {
  if (message.subtype === "bot_message" || message.bot_id || message.subtype) return;
  if (message.channel_type !== "im") return;

  const text = (message.text || "").trim();
  if (!text) return;

  const c = chan(message.channel);

  if (/^(reset|clear)$/i.test(text)) {
    c.history = [];
    await say("Cleared. Ask me anything about sales.");
    return;
  }

  if (c.busy) {
    if (Date.now() - c.lastReply > COOLDOWN_MS) {
      c.lastReply = Date.now();
      await say("Still working on your last question — one sec.");
    }
    return;
  }

  c.busy = true;
  try {
    c.history.push({ role: "user", content: text });
    c.history = c.history.slice(-MAX_TURNS);

    const { text: reply, messages } = await runAgent(c.history);
    c.history = messages.slice(-MAX_TURNS);

    await say(reply.slice(0, 3500));
    c.lastReply = Date.now();
  } catch (err) {
    console.error("Agent error:", err);
    await say(`Couldn't complete that: ${err.message}`);
  } finally {
    c.busy = false;
  }
});

(async () => {
  await app.start();
  console.log("⚡ Steven (sales agent) running — Socket Mode.");
})();
