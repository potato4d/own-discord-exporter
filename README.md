# Discord Message Exporter

A lightweight Discord message exporter built with Bun and discord.js. Export messages from Discord channels within a specific date range, with support for privacy features like content redaction.

## Features

- Export messages from any Discord text channel or thread
- Specify custom date ranges for message retrieval
- Privacy-focused options:
  - Redact message content while preserving metadata
- Organized output structure (by date, guild, and channel)
- Preserves rich message data:
  - Attachments and embeds
  - Reactions and mentions
  - Thread information
  - Message references (replies)

## Prerequisites

- [Bun](https://bun.sh/) runtime
- A Discord bot token with appropriate permissions

## Installation

```bash
bun install
```

## Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
# Required: Discord bot token
DISCORD_BOT_TOKEN=your_bot_token_here
# or
DISCORD_TOKEN=your_bot_token_here
```

### Discord Bot Setup

1. Create a bot at the [Discord Developer Portal](https://discord.com/developers/applications)
2. Enable the following **Privileged Gateway Intents**:
   - Message Content Intent
   - Server Members Intent (if exporting from servers)
3. Invite the bot to your server with the `Read Message History` permission
4. Copy the bot token to your `.env` file

## Usage

### Basic Usage

```bash
bun run main.ts \
  --channel=123456789012345678 \
  --start=2026-01-01T00:00:00+09:00 \
  --end=2026-01-03T00:00:00+09:00 \
  --out=./lake
```

### Command-Line Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--channel` | Yes | - | Discord channel ID to export |
| `--start` | Yes | - | Start date/time (ISO 8601 format) |
| `--end` | Yes | - | End date/time (ISO 8601 format) |
| `--out` | No | `./lake` | Output directory path |
| `--redactContent` | No | `false` | Redact message content (keeps metadata) |

### Examples

**Export messages from a specific date range:**
```bash
bun run main.ts \
  --channel=123456789012345678 \
  --start=2026-01-01T00:00:00Z \
  --end=2026-01-31T23:59:59Z
```

**Export with privacy features (redacted content):**
```bash
bun run main.ts \
  --channel=123456789012345678 \
  --start=2026-01-01T00:00:00Z \
  --end=2026-01-31T23:59:59Z \
  --redactContent
```

## Output Structure

Messages are saved as JSON files organized in a partitioned structure:

```
lake/
└── dt=2026-01-01/
    └── guild_id=987654321098765432/
        └── channel_id=123456789012345678/
            └── messages.json
```

### Message Format

Each message is stored as a JSON object with the following structure:

```json
{
  "message_id": "1234567890",
  "channel_id": "1234567890",
  "guild_id": "1234567890",
  "thread_id": null,
  "created_at": "2026-01-01T00:00:00.000Z",
  "edited_at": null,
  "author": {
    "id": "1234567890",
    "username": "username",
    "discriminator": "0",
    "globalName": "Display Name",
    "bot": false
  },
  "content": "Message content (null if redacted)",
  "type": 0,
  "tts": false,
  "pinned": false,
  "flags": 0,
  "reference": null,
  "mentions": {
    "users": [],
    "roles": [],
    "channels": [],
    "everyone": false
  },
  "attachments": [],
  "embeds": [],
  "reactions": []
}
```

## Privacy Features

### Content Redaction

Use `--redactContent` to remove message content while preserving all other metadata:

```bash
bun run main.ts --channel=... --start=... --end=... --redactContent
```

## License

MIT
