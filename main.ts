// main.ts (Bun)
// bun run main.ts --channel=123456789 --start=2026-01-01T00:00:00+09:00 --end=2026-01-03T00:00:00+09:00 --out=./lake

import { mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { parseArgs } from "node:util";
import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  type Message,
  type TextBasedChannel,
} from "discord.js";

// ─────────────────────────────────────────────────────────────
// Types & Config
// ─────────────────────────────────────────────────────────────

interface Config {
  token: string;
  channel: string;
  outDir: string;
  start: Date;
  end: Date;
  redactContent: boolean;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const localDate = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const isThread = (ch: { type: ChannelType }) =>
  [ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread].includes(ch.type);

function parseDate(s: string): Date {
  const d = new Date(s);
  if (isNaN(d.getTime())) throw new Error(`Invalid date: ${s}`);
  return d;
}

function sanitizeChannelName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^\.+/, "")
    .toLowerCase();
}

// ─────────────────────────────────────────────────────────────
// Message serialization
// ─────────────────────────────────────────────────────────────

function toRecord(msg: Message, cfg: Config) {
  const { author, channel, attachments, embeds, reactions, mentions } = msg;

  return {
    message_id: msg.id,
    channel_id: msg.channelId,
    guild_id: msg.guildId ?? null,
    thread_id: isThread(channel) ? msg.channelId : null,
    created_at: new Date(msg.createdTimestamp).toISOString(),
    edited_at: msg.editedTimestamp ? new Date(msg.editedTimestamp).toISOString() : null,
    author: author && {
      id: author.id,
      username: author.username,
      discriminator: author.discriminator,
      globalName: author.globalName ?? null,
      bot: author.bot,
    },
    content: cfg.redactContent ? null : msg.content,
    type: msg.type,
    tts: msg.tts,
    pinned: msg.pinned,
    flags: msg.flags?.bitfield ?? null,
    reference: msg.reference && {
      message_id: msg.reference.messageId ?? null,
      channel_id: msg.reference.channelId ?? null,
      guild_id: msg.reference.guildId ?? null,
    },
    mentions: {
      users: mentions.users.map((u) => ({
        id: u.id,
        username: u.username,
        globalName: u.globalName ?? null,
        bot: u.bot,
      })),
      roles: mentions.roles.map((r) => r.id),
      channels: mentions.channels.map((c) => c.id),
      everyone: mentions.everyone,
    },
    attachments: [...attachments.values()].map((a) => ({
      id: a.id, url: a.url, proxyURL: a.proxyURL, name: a.name,
      size: a.size, contentType: a.contentType ?? null,
      height: a.height ?? null, width: a.width ?? null,
    })),
    embeds: embeds.map((e) => e.toJSON()),
    reactions: [...reactions.cache.values()].map((r) => ({
      emoji: r.emoji.toString(), count: r.count, me: r.me,
    })),
  };
}

// ─────────────────────────────────────────────────────────────
// File I/O
// ─────────────────────────────────────────────────────────────

async function writeJson(path: string, records: unknown[]) {
  if (!records.length) return;
  await mkdir(dirname(path), { recursive: true });

  // 既存ファイルがあればマージ
  let existing: unknown[] = [];
  try {
    existing = JSON.parse(await Bun.file(path).text());
  } catch {}

  await Bun.write(path, JSON.stringify([...existing, ...records], null, 2));
}

async function writeMessages(cfg: Config, msgs: Message[], channelName: string) {
  if (!msgs.length) return;
  msgs.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const byDate = Map.groupBy(msgs, (m) => localDate(new Date(m.createdTimestamp)));
  const sanitizedName = sanitizeChannelName(channelName);

  for (const [dt, batch] of byDate) {
    if (!batch.length) continue;
    const path = join(cfg.outDir, sanitizedName, dt, "messages.json");
    await writeJson(path, batch.map((m) => toRecord(m, cfg)));
  }
}

// ─────────────────────────────────────────────────────────────
// Backfill
// ─────────────────────────────────────────────────────────────

async function fetchTextChannel(client: Client, id: string): Promise<TextBasedChannel> {
  const ch = await client.channels.fetch(id);
  if (!ch || !("messages" in ch)) throw new Error(`Not a text channel: ${id}`);
  return ch as TextBasedChannel;
}

async function backfill(cfg: Config, ch: TextBasedChannel) {
  let before: string | undefined;
  let total = 0;

  const channelName = "name" in ch && ch.name ? ch.name : "dm";

  while (true) {
    const batch = await ch.messages.fetch({ limit: 100, before });
    if (!batch.size) break;

    const msgs = [...batch.values()];
    total += msgs.length;

    const inRange = msgs.filter((m) => m.createdTimestamp >= cfg.start.getTime() && m.createdTimestamp < cfg.end.getTime());
    await writeMessages(cfg, inRange, channelName);

    const oldest = msgs.reduce((a, b) => (a.createdTimestamp < b.createdTimestamp ? a : b));
    if (oldest.createdTimestamp < cfg.start.getTime()) break;
    before = oldest.id;
  }

  console.log(`[backfill] channel=${ch.id} name=${channelName} total=${total}`);
}

// ─────────────────────────────────────────────────────────────
// Config & Main
// ─────────────────────────────────────────────────────────────

function parseConfig(): Config {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      token: { type: "string" },
      channel: { type: "string" },
      out: { type: "string", default: "./lake" },
      start: { type: "string" },
      end: { type: "string" },
      redactContent: { type: "boolean", default: false },
    },
  });

  if (!values.channel) throw new Error("--channel required");
  if (!values.start || !values.end) throw new Error("--start and --end required");

  const token = values.token ?? process.env.DISCORD_TOKEN;
  if (!token) throw new Error("--token required or DISCORD_TOKEN env var must be set");

  return {
    token,
    channel: values.channel,
    outDir: values.out!,
    start: parseDate(values.start),
    end: parseDate(values.end),
    redactContent: values.redactContent ?? false,
  };
}

async function main() {
  const cfg = parseConfig();

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel, Partials.Message],
  });

  client.once(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user?.tag}`);

    try {
      const ch = await fetchTextChannel(client, cfg.channel);
      await backfill(cfg, ch);
    } catch (e) {
      console.error(e);
    } finally {
      await client.destroy();
    }
  });

  await client.login(cfg.token);
}

await main();
