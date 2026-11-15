![My Anime For Life](https://raw.githubusercontent.com/eunsoulja/KurisuDevelopment/main/src/My%20Anime%20For%20Life.jpg)

# Kurisu Security

Discord antinuke, raid protection, tickets and moderation bot. discord.js 14, Components V2,
MongoDB. Red custom emojis are the only colour: no accent bars, no embeds, grey (secondary)
buttons only.

Current release: **2.1.0**. 42 top-level commands, 72 help entries, 28 antinuke modules.

## What is included

| Area | Details |
|---|---|
| Antinuke | 28 modules, each with enable/disable, threshold, time window, punishment, incident log and persistent config |
| Nuke Guard | Cross-module destructive-burst detection, immediate ban, durable 24h ban-on-sight watch, early security-watch alerts |
| Antinuke hardening | Ban is issued before mitigation, ban-first fallback chain, bot-add containment, bounded restore concurrency, re-entrant response locks |
| Raid protection | NORMAL / ELEVATED / HIGH / LOCKDOWN, join velocity, account age, automatic and manual lockdown, verification mode, join history |
| Whitelist | Users **and roles**, with per-entry scopes for every module; trusted_admin, trusted_mod, bypass, trusted bot; owner protections cannot be removed |
| Verification panel | `/verification panel <channel> [role]`, public stable `kv:verify` button, role creation/validation, hierarchy checks, 5s click cooldown, raid/account-age gate, member log |
| Tickets | `/ticket panel\|setup\|close\|add\|remove\|claim\|list`, private channels, atomic numbering, max-open limit, confirmation close, optional log-channel-only transcripts |
| Premium | Bot-owner-only `/premium enable\|activate\|disable\|list`; expiry is enforced lazily and at startup; security features are never gated |
| Guild profile | `/botprofile avatar\|banner\|reset\|view` for premium servers; guild-member scoped, PNG/JPEG/GIF/WebP up to 8 MB, only flags stored |
| Moderation | `/ban /unban /kick /timeout /untimeout /warn /warnings /purge /clear /slowmode /lock /unlock /hide /unhide /nickname /role add\|remove /softban /massban /masskick /case view\|user /banlist` |
| Security Center | `/security` dashboard: modules, thresholds, punishments, whitelist, logs, raid, log channels, diagnostics, read-only premium status |
| Command Center | `/help` generated from the real command definitions, category pages, detail pages, pagination, branded media |
| Logs | antinuke, raid, moderation, member, message, channel, role, voice, configuration, ticket |
| Recovery | Channel and role restore, role/channel/server-name revert, webhook removal, bot-add containment, invite cleanup; ticket channels are excluded |
| Extra commands | `/raid`, `/verification`, `/quarantine release`, `/logs`, `/antinuke`, `/incidents`, `/watchlist`, `/guilds` (bot owner), `/prefix`, `/userinfo`, `/about`, `/dev`, `/invite`, `/ping`, `/serverinfo` |
| Text commands | Per-server prefix (default `!`), e.g. `!help`, `!ping`, `!ticket panel #support`; same permission checks and V2 views as slash commands |
| Mention card | Mentioning Kurisu replies with a branded Components V2 card (GIF + live bot stats + emoji invite button); 15s per-user cooldown |
| Presence | The bot's status is `Watching <n> users`, refreshed every two minutes from the real member count |

## Design language

Kurisu uses Discord's Components V2 (containers, sections, text displays, separators and media
galleries) rather than classic embeds. The design stays intentionally colourless: no accent
colour, grey secondary buttons only, and hierarchy comes from typography, spacing, separators,
status emojis and thumbnails.

- one clear header, a short subtitle and the most important stats first;
- grouped sections with separators instead of a wall of fields;
- branding media (avatar, GIF, banner) used sparingly;
- consistent labels (`Label  **value**`), relative timestamps and compact footers;
- ephemeral replies for personal actions, public panels for shared information;
- every interactive view is re-authorized from the database on each interaction;
- no Unicode emoji in user-facing text; only registry emojis from `src/config/emojis.js`.

## Verification panel

```text
/verification panel channel:#verify [role:@Verified]
/verification config
/verification remove
```

`panel` posts a public, stable panel whose button customId is exactly `kv:verify`. If no role is
given, Kurisu creates a permissionless `Verified` role. An existing role is validated for
`@everyone`, managed roles, dangerous permissions and hierarchy before it is used. Clicks are
re-checked against the database, have a five-second per-member cooldown, respect raid lockdown
and the configured minimum account age, and write a member log entry.

## Tickets

```text
/ticket panel channel:#support
/ticket setup [category:#tickets] [log_channel:#ticket-logs] [staff_role:@Staff] [max_open:3] [transcripts:false]
/ticket close [ticket:12]
/ticket add user:@member
/ticket remove user:@member
/ticket claim
/ticket list [page:1]
```

Tickets are private channels with explicit overwrites for the owner, staff role and bot. Numbers
come from an atomic per-guild counter. The default limit is three open tickets per member. Closing
requires confirmation and removes the channel after a short delay.

Transcripts are **off by default**. When enabled, a text transcript is sent only to the configured
ticket log channel and is never written to MongoDB. A manually deleted ticket channel cannot be
recovered; the ticket record remains for audit purposes. Ticket channels are excluded from
antinuke snapshots, automatic restoration and raid lockdown.

## Premium and guild profile

`/premium` is bot-owner only. `enable` and its alias `activate` turn premium on for a guild;
`disable` turns it off and `list` shows active guilds.

`/botprofile avatar|banner|reset|view` changes only Kurisu's **guild-member** profile in that
server, never the global avatar. Images must be PNG, JPEG, GIF or WebP and at most 8 MB. Kurisu
stores only `{ avatar: 0|1, banner: 0|1 }` flags, never image bytes. Expired premium rows are
removed lazily and by an hourly/startup sweep; the cosmetic profile is reset when the guild is
available. No security, antinuke, raid or ticket feature is gated by premium.

## Whitelist scopes

Whitelist entries can target a **user or a role** and can be limited to specific protection
modules. If `scopes` is omitted, the level default applies: Trusted Moderators only bypass message
modules; Trusted Administrators, Bypass and Trusted Bot are fully exempt.

```text
/whitelist add level:Trusted Moderator role:@Moderators scopes:channel-create,channel-rename
/whitelist add level:Trusted Moderator user:@member scopes:pings
/whitelist add level:Bypass user:@trusted-admin
/whitelist add level:Trusted Bot user:@logger-bot
```

`scopes` accepts comma-separated module keys (`channelCreate`, `channelUpdate`,
`everyoneMention`, ...), friendly presets (`pings`, `channels`, `roles`, `members`, `webhooks`,
`server`, `emojis`, `assets`, `threads`, `automod`, `bots`, `permissions`, `nuke`), `all`, or
`default`. The Security Center whitelist page exposes the same scopes.

Administrator permission alone gives **no** antinuke immunity and no whitelist authority. A
Trusted Administrator must also hold a `trusted_admin` whitelist entry.

## Text commands

Slash commands are always available. Kurisu also accepts text commands with the server's prefix
(default `!`, change it with `/prefix` or the text `prefix` command). The prefix is matched
case-insensitively and does not need a space:

```text
!help
!ping
!serverinfo
!ban @member spam
!timeout @member 10m spam
!ticket panel #support
!verification panel #verify
```

Arguments are typed: mentions, IDs, `#channel`, `@role`, numbers, choices and quoted strings all
work. For example, `!ban @member reason:"spam and eggs" delete_days:7` is equivalent to `/ban`.
Text commands use the same permission, hierarchy and antinuke checks as their slash counterparts,
and reply with the same Components V2 views. The Command Center shows both the slash form and the
current prefix form for every command.

## Requirements

- Node.js 22 or newer (matches `package.json`)
- A Discord application with a bot user
- A MongoDB database (Atlas or self-hosted)
- The custom emojis from `src/config/emojis.js` must be visible to the bot. Either the bot is in
  the server that owns them, or you upload them as **Application Emojis** in the Developer Portal.
  On startup Kurisu validates the registry and logs any emoji it cannot see.
- The animated red `ticket` emoji (`<a:437007ticket:1571389266083188757>`) is registered for the
  ticket panel, ticket channels and help.

## Discord Developer Portal setup

1. Create an application, add a bot, copy the token and application ID.
2. Bot tab, **Privileged Gateway Intents**: enable **Server Members Intent** and **Message Content
   Intent**. Message Content is required for prefix text commands (`!help`, `!ban`, ...); slash
   commands work without it.
3. Gateway intents requested in code: Guilds, GuildMembers, GuildModeration, GuildMessages,
   MessageContent, GuildVoiceStates.
4. Invite with scopes `bot` and `applications.commands`, permissions listed below.

Bot permissions used (integer `1100451490998`): View Channels, Send Messages, Read Message History,
Manage Channels, Manage Roles, Manage Server, Manage Messages, Manage Nicknames, Manage Webhooks,
Kick Members, Ban Members, Moderate Members, View Audit Log, Use External Emojis.

**Important:** place Kurisu's role near the top of the role list. Discord hierarchy decides whether
Kurisu can punish, strip roles or restore anything. A bot below the attacker cannot stop them.

## Install

```bash
npm install
cp .env.example .env        # then fill DISCORD_TOKEN, CLIENT_ID, OWNER_IDS, DATABASE_URL
npm run deploy              # registers slash commands (set DEV_GUILD_ID for instant, guild-only testing)
npm start
```

`AUTO_DEPLOY=true` registers commands at every startup instead.

### Environment

| Variable | Purpose |
|---|---|
| `DISCORD_TOKEN` | bot token (never commit) |
| `CLIENT_ID` | application ID |
| `DEV_GUILD_ID` | optional, register commands to one guild |
| `OWNER_IDS` | comma-separated bot owner user IDs (always exempt, can edit the whitelist, required for `/guilds` and `/premium`) |
| `DATABASE_URL` | MongoDB connection string (never commit) |
| `DATABASE_NAME` | optional database name override; otherwise the URI database name, then `prismo` |
| `DATABASE_PATH` | SQLite path used only by the one-time `migrate:mongo` script |
| `AUTO_DEPLOY` | `true` to register commands on boot (default `false`) |
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error` |

### Database

MongoDB through the official driver. Startup connects, pings, creates indexes, then runs data
migrations tracked in `schema_migrations`. New collections in 2.1.0: `verification`,
`verification_users`, `ticket_config`, `tickets`, `premium`, `bot_profiles`.

Config, whitelist, warnings, cases, incidents, snapshots, lockdown state, ticket records, premium
rows, verification state, nuke watch and the recent Nuke Guard burst window survive restarts.

The old SQLite importer remains available for legacy installations:

```bash
npm run migrate:mongo -- --dry-run
npm run migrate:mongo
```

Never commit `.env`, the MongoDB URI, `data/`, or a database dump.

### Deployment

Any process manager works. Example with pm2:

```bash
npm i -g pm2
pm2 start index.js --name kurisu
pm2 save && pm2 startup
```

The bot handles SIGINT/SIGTERM by closing the gateway and the database cleanly.

## First-time setup in a server

1. Run `/security` (server owner, bot owner or a Trusted Administrator).
2. Settings: pick log channels (at least Antinuke, Raid, Moderation, Ticket).
3. Whitelist: add trusted staff and trusted bots, otherwise their legitimate bulk actions can
   trigger a response.
4. Review each module's threshold and punishment in Protection.
5. Post the verification panel with `/verification panel channel:#verify`.
6. Configure tickets with `/ticket setup` and post the panel with `/ticket panel`.

## How detection works

Kurisu consumes `GUILD_AUDIT_LOG_ENTRY_CREATE`. Each entry already carries the executor, target,
action and changes, so there is no guessing from "the latest audit log row" and no polling delay.

1. Entry arrives, duplicates by entry ID are dropped.
2. No executor on the entry: ignored. Kurisu never punishes an arbitrary member.
3. Warm caches provide guild settings, modules, whitelist, watches and incident counts without a
   database read before a ban.
4. The entry is mapped to one or more modules.
5. Exempt actors (guild owner, bot owner, Kurisu, whitelist) are skipped. Administrator permission
   alone gives no immunity.
6. **Nuke Guard** counts destructive actions across modules per executor before any per-module
   threshold. At the guard threshold the executor is banned immediately, so a mixed burst cannot
   stay under every individual threshold.
7. The configured response is applied. **Ban is the first Discord call**, before mitigation or any
   awaited persistence. If Discord refuses, the fallback chain is ban -> kick -> quarantine ->
   strip dangerous roles -> timeout.
8. A per-executor lock prevents duplicate punishment during a flood; later actions are still
   mitigated. Repeat offences within 24 hours escalate to a ban.
9. A banned or kicked executor is written to a durable **24 hour nuke watch** that survives the ban
   and restarts. Any auditable action, message or rejoin while watched results in a ban.
10. Everything in the burst is mitigated with at most three restore tasks running at once,
    categories first (channel/role restore), then creations, edits and cleanup.
11. An incident row and a short log line are written.

Critical modules default to a **ban**:

| Module | Actions / window |
|---|---|
| channelDelete, roleDelete | 2 / 5s |
| botAdd, permEscalation, automodRule, vanityChange, prune | 1 (30-60s) |
| massBan, massKick, massUnban | 3 / 15s |
| webhookDelete, nukeGuard | 3 / 10-20s |

An optional **compromised-account guard** (default off, owner-only toggle) removes whitelist
immunity from accounts younger than seven days. Guild owners, bot owners and Kurisu stay protected.

Message-based modules (@everyone, mass mention) run from `messageCreate`; the nuke watch is checked
there too.

## Known limits (Discord API)

- Messages of a deleted channel cannot be recovered. Restored channels and roles get new IDs.
- Members of a deleted role are not re-assigned.
- Server icon, banner and vanity URL cannot be restored through the API. Kurisu detects
  vanity/server changes, punishes, and restores the server name only.
- Restored roles and channel overwrites never regain dangerous permissions.
- Reverting a role edit only removes dangerous permissions that were added. It never grants any.
- Mass message deletion is detected through bulk-delete audit entries. Discord merges individual
  moderator deletions into one entry, which is not reliably countable.
- Quarantine uses removed roles, a role without permissions and a 28 day timeout; Discord caps
  timeouts at 28 days.
- Verification mode and lockdown use Discord's verification level, @everyone send permissions and
  the invite pause. Raid protection never mass-bans; optional lockdown kicks only accounts younger
  than the configured age.
- Message logs intentionally show author, channel and attachment count, not message content.
- A manually deleted ticket channel cannot be restored and its messages are lost; transcripts are
  only available when enabled in advance and sent to the ticket log channel.

## Tests

```bash
npm test
# If PowerShell blocks npm.ps1, run the test file directly:
node --test tests/kurisu.test.js
```

`tests/kurisu.test.js` uses `mongodb-memory-server`, so no production database is touched. It
covers migrations, guild isolation, atomic counters, the emoji registry, module defaults, owner and
whitelist exemptions, compromised-account guard, antinuke thresholds/dedupe/ban-first response,
persistent watch, bot-add containment, fallback punishment, ticket isolation, verification panel
and clicks, ticket lifecycle and channel safety, premium expiry and profile flags, dashboard
authorization, help generation, command counts, prefix parsing, Components V2 rules, grey-only
buttons, no accents and the source-wide Unicode/embed regression.

**Not automated, run these on a disposable test server before production:** every slash command
against live Discord, gateway reconnects, real audit-log delivery, emoji rendering,
lockdown/unlock on a server with many channels, channel and role restoration, and bot hierarchy
edge cases. Never run destructive tests on a real community.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Emojis show as text | The bot cannot see them; use Application Emojis or join the emoji server. Check the startup warning. |
| Slash commands missing | Run `npm run deploy`; global commands can take a while, use `DEV_GUILD_ID` when testing. |
| "The application did not respond" | Deploy the current command schema with `npm run deploy`, restart the bot, and retry. Premium and profile commands acknowledge immediately before slow work. |
| "Used disallowed intents" | Enable Server Members Intent and Message Content Intent in the Portal. |
| Database connection fails | Check `DATABASE_URL`, the Atlas IP allowlist and `DATABASE_NAME`. |
| No incidents appear | Bot lacks View Audit Log, or the module/antinuke is disabled, or the actor is whitelisted. |
| Punishment failed | Kurisu's role is below the executor's role, or it lacks Ban/Kick/Manage Roles/Moderate Members. |
| Cannot log to a channel | Grant Kurisu View Channel and Send Messages there. |
| Ticket channel not created | Check Manage Channels, the configured category and role hierarchy. |
