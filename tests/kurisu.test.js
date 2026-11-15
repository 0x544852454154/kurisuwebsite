'use strict';
const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  AuditLogEvent: A, MessageFlags, PermissionsBitField, ChannelType, Collection,
} = require('discord.js');
const helpers = require('./helpers');
const { fakeGuild, walk } = helpers;

process.env.OWNER_IDS = 'botowner';
const db = require('../src/database');
const repo = require('../src/database/repo');
const migrations = require('../src/database/migrations');
const perms = require('../src/permissions');
const antinuke = require('../src/engines/antinuke');
const raid = require('../src/engines/raid');
const recovery = require('../src/engines/recovery');
const premiumEngine = require('../src/engines/premium');
const { MODULES, KEYS } = require('../src/engines/antinuke/modules');
const { PUNISHED_LABEL, LIMITS } = require('../src/config/settings');
const { EMOJIS, parseEmoji, validateEmojis } = require('../src/config/emojis');
const { ALL_MASK, SCOPE_PRESETS, maskForScopes, maskId, parseMask, scopesForMask } = require('../src/config/whitelist');
const helperFns = require('../src/utils/helpers');
const ui = require('../src/components/common/ui');
const help = require('../src/components/help');
const dashboard = require('../src/components/dashboard');
const verification = require('../src/components/verification');
const tickets = require('../src/components/tickets');
const commands = require('../src/commands').load();
const text = require('../src/text');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const plain = (v) => JSON.stringify(v ?? '');
const jsonOf = (payload) => payload?.components?.[0]?.toJSON?.() || payload?.components?.[0] || {};
const allNodes = (payload) => walk(jsonOf(payload));
const buttonNodes = (payload) => allNodes(payload).filter((n) => n.type === 2);
const componentIds = (payload) => allNodes(payload).flatMap((n) => (n.custom_id ? [n.custom_id] : []));

before(async () => { await helpers.setup(); });
beforeEach(async () => { await helpers.resetDb(); });
after(async () => { await helpers.teardown(); });

const bits = (v = 0n) => new PermissionsBitField(BigInt(v));
const role = (id, position = 1, permissionBits = 0n, extra = {}) => ({
  id, name: id, position, managed: false, permissions: bits(permissionBits),
  color: 0, hoist: false, mentionable: false, tags: null, ...extra,
});

function optionsApi(values = {}) {
  return {
    getSubcommand: () => values.subcommand || null,
    getSubcommandGroup: () => null,
    getString: (n) => (values[n] === undefined ? null : String(values[n])),
    getInteger: (n) => (Number.isInteger(values[n]) ? values[n] : null),
    getNumber: (n) => (typeof values[n] === 'number' ? values[n] : null),
    getBoolean: (n) => (typeof values[n] === 'boolean' ? values[n] : null),
    getUser: (n) => values[n]?.user || values[n] || null,
    getMember: (n) => values[n]?.member || null,
    getRole: (n) => values[n]?.role || values[n] || null,
    getChannel: (n) => values[n]?.channel || values[n] || null,
    getAttachment: (n) => values[n] || null,
    getFocused: () => '',
  };
}

function interaction({ guild, member, user, customId = null, values = {}, options = {}, channel, channelId, client } = {}) {
  const sink = {};
  const i = {
    client: client || guild?.client || {},
    guild, guildId: guild?.id, member, user: user || member?.user || member,
    memberPermissions: member?.permissions,
    customId, values: values.values || [],
    channel: channel || guild?.channels?.cache?.values?.().next?.().value || null,
    channelId: channelId || channel?.id || guild?.channels?.cache?.keys?.().next?.().value,
    commandName: values.commandName,
    createdTimestamp: Date.now(), deferred: false, replied: false,
    inGuild: () => true, inCachedGuild: () => true,
    isChatInputCommand: () => true, isMessageComponent: () => !!customId, isFromMessage: () => false,
    options: optionsApi(options),
    reply: async (p) => { sink.replied = p; i.replied = true; return { edit: async () => {}, delete: async () => {} }; },
    deferReply: async () => { i.deferred = true; },
    editReply: async (p) => { sink.edited = p; return {}; },
    update: async (p) => { sink.updated = p; return {}; },
    followUp: async (p) => { sink.followUp = p; return {}; },
    showModal: async (m) => { sink.modal = m; return {}; },
    deleteReply: async () => {},
  };
  return { i, sink };
}

function fakeClient(guilds = []) {
  const cache = new Map(guilds.map((g) => [g.id, g]));
  return {
    commands: new Map([...commands.entries()]),
    guilds: { cache },
    users: { cache: new Map(), fetch: async () => null },
    ws: { ping: 42, shards: { size: 1 } },
    user: { id: 'kurisu', tag: 'Kurisu#0001', displayAvatarURL: () => 'https://example.com/a.png' },
  };
}

const dashInteraction = (guild, over = {}) => interaction({
  guild,
  member: { id: 'owner', user: { id: 'owner' }, permissions: bits(PermissionsBitField.Flags.Administrator) },
  user: { id: 'owner' }, customId: 'ks:v:main', ...over,
});

// ---------------------------------------------------------------------------
// database, migrations, emoji registry
// ---------------------------------------------------------------------------
test('database: migrations are idempotent and never overwrite custom module rows', async () => {
  const database = db.get();
  await database.collection('schema_migrations').deleteOne({ _id: 'antinuke_defaults_v2' });
  await database.collection('antinuke_modules').insertMany([
    { guild_id: 'gA', module: 'botAdd', enabled: 0, threshold: 1, window_sec: 60, punishment: 'kick' },
    { guild_id: 'gA', module: 'channelDelete', enabled: 1, threshold: 3, window_sec: 5, punishment: 'ban' },
    { guild_id: 'gB', module: 'roleDelete', enabled: 1, threshold: 2, window_sec: 10, punishment: 'kick' },
  ]);
  const first = await migrations.run(database);
  assert.equal(first.antinukeDefaults.skipped, false);
  const custom = await database.collection('antinuke_modules').findOne({ guild_id: 'gA', module: 'botAdd' });
  assert.equal(custom.enabled, 0, 'custom disabled configuration is preserved');
  const customThreshold = await database.collection('antinuke_modules').findOne({ guild_id: 'gA', module: 'channelDelete' });
  assert.equal(customThreshold.threshold, 3, 'custom thresholds are preserved');
  const legacy = await database.collection('antinuke_modules').findOne({ guild_id: 'gB', module: 'roleDelete' });
  assert.equal(legacy, null, 'exact legacy defaults are removed so the new defaults apply');
  const second = await migrations.run(database);
  assert.equal(second.antinukeDefaults.skipped, true, 'migration is idempotent');
});

test('database: guild data is isolated and counters are atomic', async () => {
  await repo.addWarning('gX', 'u', 'm', 'a');
  await repo.addWarning('gY', 'u', 'm', 'b');
  assert.equal(await repo.countWarnings('gX', 'u'), 1);
  assert.equal((await repo.addCase('gX', { userId: 'u', moderatorId: 'm', action: 'ban' })).case_number, 1);
  assert.equal((await repo.addCase('gY', { userId: 'u', moderatorId: 'm', action: 'ban' })).case_number, 1);
  assert.equal((await repo.addCase('gX', { userId: 'u', moderatorId: 'm', action: 'kick' })).case_number, 2);
  const numbers = await Promise.all(Array.from({ length: 12 }, () => repo.nextTicketNumber('gX')));
  assert.equal(new Set(numbers).size, 12, 'ticket numbers are unique under concurrency');
  await repo.addNukeRecent('gX', 'u', 'e1', ['massKick'], Date.now());
  assert.equal((await repo.listNukeRecent('gX', 'u', 0)).length, 1);
  assert.equal((await repo.listNukeRecent('gY', 'u', 0)).length, 0);
});

test('database: antinuke hot-path caches are filled by warmGuild', async () => {
  await repo.setGuild('gw', 'antinuke_enabled', 1);
  await repo.saveModule('gw', 'botAdd', { enabled: true, threshold: 9, window_sec: 30, punishment: 'ban' });
  await repo.addWhitelist('gw', 'trusted', 'trusted_admin', 'owner');
  await repo.warmGuild('gw');
  assert.equal(repo.isWarm('gw'), true);
  assert.equal(repo.cachedGuild('gw').antinuke_enabled, 1);
  assert.equal(repo.cachedModule('gw', 'botAdd', MODULES).threshold, 9);
  assert.equal(repo.cachedWhitelist('gw').byId.get('trusted').level, 'trusted_admin');
});

test('emoji registry: every configured entry parses and the animated ticket emoji is registered', async () => {
  for (const [k, v] of Object.entries(EMOJIS)) {
    if (v === null) continue;
    assert.ok(parseEmoji(v), `${k} malformed`);
  }
  assert.ok(Object.keys(EMOJIS).length >= 30);
  assert.equal(EMOJIS.ticket, '<a:437007ticket:1571389266083188757>');
  const ticket = parseEmoji(EMOJIS.ticket);
  assert.ok(ticket, 'ticket emoji syntax is valid');
  assert.equal(ticket.animated, true);
  assert.equal(ticket.name, '437007ticket');
  const problems = await validateEmojis({
    emojis: { cache: new Map([['1571389266083188757', { id: '1571389266083188757', name: '437007ticket' }]]) },
    application: { emojis: { fetch: async () => new Map() } },
  });
  assert.ok(!problems.some((p) => p.startsWith('ticket:')), 'the registered ticket emoji validates when visible');
});

test('modules: 28 modules with hardened critical defaults', () => {
  assert.equal(KEYS.length, 28);
  for (const k of KEYS) {
    const d = MODULES[k].defaults;
    assert.ok(d.threshold > 0 && d.windowSec > 0 && d.punishment, k);
  }
  for (const k of ['channelDelete', 'roleDelete', 'botAdd', 'permEscalation', 'automodRule', 'vanityChange', 'prune', 'massUnban', 'webhookDelete', 'nukeGuard']) {
    assert.equal(MODULES[k].defaults.punishment, 'ban', `${k} defaults to ban`);
  }
  assert.equal(MODULES.channelDelete.defaults.windowSec, 5);
  assert.equal(MODULES.roleDelete.defaults.windowSec, 5);
});

// ---------------------------------------------------------------------------
// permissions
// ---------------------------------------------------------------------------
test('permissions: owner, bot and whitelist exemptions; Administrator is not enough', async () => {
  const { guild, addMember } = fakeGuild();
  const admin = addMember('admin', { position: 5 });
  admin.permissions = bits(PermissionsBitField.Flags.Administrator);
  assert.equal(await perms.isExempt(guild, 'owner'), true);
  assert.equal(await perms.isExempt(guild, 'botowner'), true);
  assert.equal(await perms.isExempt(guild, 'kurisu'), true);
  assert.equal(await perms.isExempt(guild, 'admin', 'general', null, admin), false, 'Administrator alone never exempts');
  await repo.addWhitelist(guild.id, 'trusted', 'bypass', 'owner');
  assert.equal(await perms.isExempt(guild, 'trusted', 'general', 'botAdd'), true);

  await repo.addWhitelist(guild.id, 'role1', 'trusted_mod', 'owner', { targetType: 'role', scopes: ['everyoneMention', 'massMention'] });
  await repo.warmGuild(guild.id);
  const mod = addMember('m1', { position: 2, roles: [{ id: 'role1' }] });
  assert.equal(perms.isExemptSync(guild, 'm1', 'message', 'everyoneMention', mod), true);
  assert.equal(perms.isExemptSync(guild, 'm1', 'general', 'channelDelete', mod), false, 'scoped role entries only cover their modules');
});

test('permissions: compromised-account guard is opt-in and preserves owner protections', async () => {
  const { guild, addMember } = fakeGuild();
  await repo.addWhitelist(guild.id, 'newadmin', 'bypass', 'owner');
  const young = addMember('newadmin');
  young.user.createdTimestamp = Date.now();
  await repo.warmGuild(guild.id);
  assert.equal(perms.isExemptSync(guild, 'newadmin', 'general', 'botAdd', young), true, 'guard is off by default');
  await repo.setGuild(guild.id, 'compromised_guard', 1);
  assert.equal(perms.isExemptSync(guild, 'newadmin', 'general', 'botAdd', young), false, 'young whitelisted account loses exemption');
  assert.equal(perms.isExemptSync(guild, 'owner', 'general', 'botAdd'), true, 'guild owner is still protected');
});

// ---------------------------------------------------------------------------
// antinuke
// ---------------------------------------------------------------------------
const audit = (id, action, executorId, extra = {}) => ({ id, action, executorId, targetId: 't1', changes: [], ...extra });

async function preparedGuild(id = 'gn', over = {}) {
  const fake = fakeGuild({ id, ownerId: 'owner', ...over });
  fake.guild.client = { user: { id: 'kurisu' } };
  await repo.setGuild(id, 'antinuke_enabled', 1);
  await repo.setGuild(id, 'escalation_threshold', 0);
  await repo.warmGuild(id);
  return fake;
}

test('antinuke: two channel deletions ban the executor, record an incident and keep a 24h watch', async () => {
  const { guild, addMember, banned } = await preparedGuild('ga1');
  addMember('bad', { position: 3 });
  await antinuke.handleAuditEntry(audit('a1', A.ChannelDelete, 'bad'), guild);
  await antinuke.handleAuditEntry(audit('a2', A.ChannelDelete, 'bad'), guild);
  assert.ok(banned.includes('bad'));
  assert.equal(await repo.countIncidents('ga1'), 1);
  const watch = await repo.getNukeWatch('ga1', 'bad');
  assert.ok(watch && watch.expires_at > Date.now() + 23 * 3600 * 1000, 'watch survives the ban');
  await antinuke.handleAuditEntry(audit('a2', A.ChannelDelete, 'bad'), guild);
  assert.equal(await repo.countIncidents('ga1'), 1, 'duplicate audit entries are ignored');
});

test('antinuke: owner, bot owner, whitelisted and unattributed actions are never punished', async () => {
  const { guild, banned } = await preparedGuild('ga2');
  await repo.addWhitelist('ga2', 'trusted', 'bypass', 'owner');
  await repo.warmGuild('ga2');
  for (const id of ['owner', 'botowner', 'trusted']) {
    await antinuke.handleAuditEntry(audit(`x-${id}`, A.ChannelDelete, id), guild);
    await antinuke.handleAuditEntry(audit(`y-${id}`, A.ChannelDelete, id), guild);
  }
  await antinuke.handleAuditEntry({ id: 'no-executor', action: A.ChannelDelete, executorId: null, changes: [] }, guild);
  assert.deepEqual(banned, [], 'no protected account is banned');
});

test('antinuke: Administrator permission alone does not exempt an executor', async () => {
  const { guild, addMember, banned } = await preparedGuild('ga2b');
  addMember('admin', { position: 4 }).permissions = bits(PermissionsBitField.Flags.Administrator);
  await antinuke.handleAuditEntry(audit('admin-add', A.BotAdd, 'admin', { targetId: 'added' }), guild);
  assert.deepEqual(banned, ['admin'], 'Administrator is treated as a normal executor');
});

test('antinuke: disabled modules do nothing', async () => {
  const { guild, banned } = await preparedGuild('ga3');
  await repo.saveModule('ga3', 'channelDelete', { enabled: false, threshold: 2, window_sec: 5, punishment: 'ban' });
  await antinuke.handleAuditEntry(audit('d1', A.ChannelDelete, 'bad'), guild);
  await antinuke.handleAuditEntry(audit('d2', A.ChannelDelete, 'bad'), guild);
  assert.deepEqual(banned, []);
});

test('antinuke: nuke guard stops a mixed burst and records the module mix', async () => {
  const { guild, banned } = await preparedGuild('ga4');
  const entries = [
    audit('n1', A.ChannelDelete, 'nuker'),
    audit('n2', A.RoleDelete, 'nuker'),
    audit('n3', A.MemberBanAdd, 'nuker'),
  ];
  for (const entry of entries) await antinuke.handleAuditEntry(entry, guild);
  assert.ok(banned.includes('nuker'));
  const incidents = await repo.pageIncidents('ga4', 5, 0);
  const nuke = incidents.find((i) => i.module === 'nukeGuard');
  assert.ok(nuke, 'nuke guard incident recorded');
  assert.match(nuke.action, /Nuke attempt/);
});

test('antinuke: sliding windows drop old actions and nuke bursts persist', async () => {
  const key = 'gslide:u:channelDelete';
  const t = Date.now();
  antinuke.slide(key, 1000, 1, { id: 's1' }, t - 5000);
  const now = antinuke.slide(key, 1000, 1, { id: 's2' }, t);
  assert.equal(now.total, 1, 'old action fell outside the window');

  antinuke.trackNuke('gpersist', 'u', ['channelDelete'], { id: 'p1' }, 60_000, t);
  await sleep(50);
  const rows = await repo.listNukeRecent('gpersist', 'u', 0);
  assert.equal(rows.length, 1, 'burst state is persisted for restart recovery');
});

test('antinuke: permission escalation and vanity changes are classified correctly', () => {
  const guild = fakeGuild({ id: 'gc' }).guild;
  guild.roles.cache.set('danger', role('danger', 2, PermissionsBitField.Flags.Administrator));
  const escalated = antinuke.classify({
    action: A.RoleUpdate,
    changes: [{ key: 'permissions', old: '0', new: String(PermissionsBitField.Flags.Administrator) }],
  }, guild);
  assert.ok(escalated.some((m) => m.key === 'permEscalation'));
  const vanity = antinuke.classify({ action: A.GuildUpdate, changes: [{ key: 'vanity_url_code', old: null, new: 'x' }] }, guild);
  assert.ok(vanity.some((m) => m.key === 'vanityChange'));
  const guildName = antinuke.classify({ action: A.GuildUpdate, changes: [{ key: 'name', old: 'a', new: 'b' }] }, guild);
  assert.ok(guildName.some((m) => m.key === 'guildUpdate'));
});

test('antinuke: bot add bans the executor and the unapproved bot, but leaves a trusted bot', async () => {
  const { guild, banned } = await preparedGuild('ga5');
  guild.members.fetch = async (id) => ({ id, user: { id, bot: true }, roles: { cache: new Map() } });
  guild.fetchIntegrations = async () => new Map();
  guild.invites = { fetch: async () => new Collection() };
  await antinuke.handleAuditEntry(audit('b1', A.BotAdd, 'bad', { targetId: 'evilbot' }), guild);
  await sleep(50);
  assert.ok(banned.includes('bad'));
  assert.ok(banned.includes('evilbot'), 'unapproved bot is contained');

  await repo.addWhitelist('ga6', 'goodbot', 'bot', 'owner');
  const second = await preparedGuild('ga6');
  second.guild.members.fetch = async (id) => ({ id, user: { id, bot: true }, roles: { cache: new Map() } });
  await antinuke.handleAuditEntry(audit('b2', A.BotAdd, 'bad2', { targetId: 'goodbot' }), second.guild);
  await sleep(50);
  assert.ok(second.banned.includes('bad2'));
  assert.ok(!second.banned.includes('goodbot'), 'trusted bot is not removed');
});

test('punish: ban falls back to kick when Discord refuses the ban', async () => {
  const { guild, addMember, kicked } = fakeGuild({ id: 'gpun' });
  const member = addMember('bad');
  guild.members.ban = async () => { throw Object.assign(new Error('missing permissions'), { code: 50013 }); };
  const punish = require('../src/engines/antinuke/punish');
  const result = await punish.apply(guild, 'bad', 'ban', 'test');
  assert.equal(result.ok, true);
  assert.equal(result.kind, 'kick');
  assert.equal(result.detail, 'fallback from ban');
  assert.deepEqual(kicked, ['bad']);
  assert.equal(member.id, 'bad');
});

// ---------------------------------------------------------------------------
// raid, recovery and ticket isolation
// ---------------------------------------------------------------------------
test('raid: level thresholds and join counters persist', async () => {
  assert.equal(raid.levelFor({ elevated_joins: 5, high_joins: 10, lockdown_joins: 20 }, 4), 'NORMAL');
  assert.equal(raid.levelFor({ elevated_joins: 5, high_joins: 10, lockdown_joins: 20 }, 5), 'ELEVATED');
  assert.equal(raid.levelFor({ elevated_joins: 5, high_joins: 10, lockdown_joins: 20 }, 10), 'HIGH');
  assert.equal(raid.levelFor({ elevated_joins: 5, high_joins: 10, lockdown_joins: 20 }, 20), 'LOCKDOWN');
  await repo.addJoin('gjoin', 'u1', Date.now(), Date.now() - 1000, 0);
  assert.equal((await repo.countJoins('gjoin', 0)).c, 1);
});

test('recovery: deleted channels and roles restore without dangerous permissions', async () => {
  const overlay = (id, allow, deny = 0n) => ({ id, type: 0, allow: bits(allow), deny: bits(deny) });
  let createdChannel = null;
  const { guild } = fakeGuild({
    id: 'grec',
    roles: { everyone: { id: 'g1' }, cache: new Map([['g1', { id: 'g1', position: 0 }]]), create: async () => null },
    channels: {
      cache: new Map(), fetch: async () => null,
      create: async (opts) => {
        createdChannel = opts;
        const created = { id: 'c2', guild, isThread: () => false, type: ChannelType.GuildText, name: opts.name };
        guild.channels.cache.set('c2', created);
        return created;
      },
    },
  });
  const source = {
    id: 'c1', name: 'general', guild, isThread: () => false, type: ChannelType.GuildText,
    parentId: null, rawPosition: 2, topic: 'hello', nsfw: false, rateLimitPerUser: 0,
    permissionOverwrites: { cache: new Map([
      ['g1', overlay('g1', PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.Administrator)],
      ['ghost', overlay('ghost', PermissionsBitField.Flags.SendMessages)],
    ]) },
  };
  await recovery.snapshotChannel(source);
  assert.equal((await repo.getSnapshot('grec', 'channel', 'c1')).data.name, 'general');
  assert.match(await recovery.restoreChannel(guild, 'c1'), /^restored/);
  assert.equal(createdChannel.name, 'general');
  const own = createdChannel.permissionOverwrites.find((o) => o.id === 'g1');
  assert.equal(own.allow & BigInt(PermissionsBitField.Flags.Administrator), 0n);
  assert.ok(!createdChannel.permissionOverwrites.some((o) => o.id === 'ghost'));
  assert.equal(await repo.getSnapshot('grec', 'channel', 'c1'), null);
});

test('tickets: channels are excluded from snapshots and lockdown', async () => {
  const channel = {
    id: 'tc1', name: 'ticket-1', guild: { id: 'gticket' }, isThread: () => false, type: ChannelType.GuildText,
    parentId: null, rawPosition: 0, topic: null, nsfw: false, rateLimitPerUser: 0,
    permissionOverwrites: { cache: new Map() }, manageable: true,
    permissionOverwritesEdit: null,
  };
  await repo.createTicket('gticket', { number: 1, channelId: 'tc1', ownerId: 'owner' });
  await recovery.snapshotChannel(channel);
  assert.equal(await repo.getSnapshot('gticket', 'channel', 'tc1'), null);

  let edits = 0;
  channel.permissionOverwrites = { edit: async () => { edits++; }, cache: new Map() };
  const { guild } = fakeGuild({
    id: 'gticket',
    channels: { cache: new Map([['tc1', channel]]), fetch: async () => null },
  });
  guild.channels.cache.set('other', {
    ...channel, id: 'oc1', name: 'general', permissionOverwrites: { edit: async () => { edits++; }, cache: new Map() },
  });
  guild.roles.everyone = { id: 'gticket' };
  await raid.lockdown(guild, 5, 'owner');
  assert.equal(edits, 1, 'only the non-ticket channel is locked');
});

// ---------------------------------------------------------------------------
// verification
// ---------------------------------------------------------------------------
async function verificationGuild(id = 'gv') {
  const sent = [];
  const createdRoles = [];
  const member = {
    id: 'owner', user: { id: 'owner', createdTimestamp: Date.now() - 400 * 86400000 },
    permissions: bits(PermissionsBitField.Flags.Administrator), roles: { cache: new Map(), add: async () => {} },
    highest: { position: 1 },
  };
  const channel = {
    id: 'vc1', name: 'verify', type: ChannelType.GuildText, isTextBased: () => true,
    permissionsFor: () => ({ has: () => true }),
    send: async (payload) => { sent.push(payload); return { id: 'vm1' }; },
    messages: { fetch: async () => null },
  };
  const { guild } = fakeGuild({
    id,
    channels: { cache: new Map([['vc1', channel]]), fetch: async () => channel },
    roles: {
      everyone: { id },
      cache: new Map(),
      create: async (opts) => {
        const r = { ...role('vr1', 1), name: opts.name, permissions: opts.permissions || bits(0) };
        createdRoles.push(r);
        guild.roles.cache.set(r.id, r);
        return r;
      },
      fetch: async () => null,
    },
  });
  guild.members.me = { id: 'kurisu', roles: { highest: { position: 50 } }, permissions: bits(PermissionsBitField.All) };
  guild.roles.cache.set('vr1', role('vr1', 1));
  guild.members.cache.set('owner', member);
  guild.client = fakeClient([guild]);
  await repo.setGuild(id, 'antinuke_enabled', 1);
  await repo.warmGuild(id);
  return { guild, channel, member, sent, createdRoles };
}

test('verification: panel command creates a stable public panel and verified role', async () => {
  const { guild, channel, sent } = await verificationGuild('gv1');
  const cmd = commands.get('verification');
  const { i, sink } = interaction({
    guild, member: guild.members.cache.get('owner'), user: { id: 'owner' },
    values: { commandName: 'verification' }, options: { subcommand: 'panel', channel },
  });
  await cmd.execute(i);
  assert.ok(sink.edited, 'command confirms the panel');
  assert.equal(sent.length, 1);
  assert.equal(buttonNodes(sent[0])[0].custom_id, 'kv:verify');
  assert.equal(buttonNodes(sent[0])[0].style, 2);
  const cfg = await repo.getVerification('gv1');
  assert.equal(cfg.enabled, 1);
  assert.equal(cfg.panel_message_id, 'vm1');
  assert.ok(cfg.role_id);

  const cfgView = interaction({ guild, member: guild.members.cache.get('owner'), user: { id: 'owner' }, values: { commandName: 'verification' }, options: { subcommand: 'config' } });
  await cmd.execute(cfgView.i);
  assert.match(plain(cfgView.sink.replied), /VERIFICATION CONFIG/);
});

test('verification: click grants the role, is idempotent, cooldown-limited and raid-gated', async () => {
  const { guild } = await verificationGuild('gv2');
  await repo.setVerification('gv2', { panel_channel_id: 'vc1', panel_message_id: 'vm1', role_id: 'vr1', enabled: 1 });
  const added = [];
  const member = {
    id: 'newbie', user: { id: 'newbie', createdTimestamp: Date.now() - 30 * 86400000 },
    roles: { cache: new Map(), add: async (r) => { added.push(r.id); member.roles.cache.set(r.id, r); } },
  };
  const base = { guild, member, user: member.user, customId: 'kv:verify', channelId: 'vc1' };
  const first = interaction(base);
  await verification.handle(first.i);
  assert.deepEqual(added, ['vr1']);
  assert.ok(first.sink.replied.flags & MessageFlags.Ephemeral);
  assert.equal(await repo.isVerified('gv2', 'newbie'), true);

  const second = interaction({ ...base, member: { ...member, roles: { cache: new Map([['vr1', { id: 'vr1' }]]), add: member.roles.add } } });
  await verification.handle(second.i);
  assert.match(plain(second.sink.replied), /already verified/);

  const cooldownUser = {
    id: 'cool', user: { id: 'cool', createdTimestamp: Date.now() - 30 * 86400000 },
    roles: { cache: new Map(), add: async () => {} },
  };
  await verification.handle(interaction({ ...base, member: cooldownUser, user: cooldownUser.user }).i);
  const cooldownAgain = interaction({ ...base, member: cooldownUser, user: cooldownUser.user });
  await verification.handle(cooldownAgain.i);
  assert.match(plain(cooldownAgain.sink.replied), /wait a few seconds/);

  await repo.setRaid('gv2', { min_account_age_days: 30 });
  const young = {
    id: 'young', user: { id: 'young', createdTimestamp: Date.now() - 86400000 },
    roles: { cache: new Map(), add: async () => {} },
  };
  const gated = interaction({ ...base, member: young, user: young.user });
  await verification.handle(gated.i);
  assert.match(plain(gated.sink.replied), /at least 30 days/);
});

test('verification: remove deletes the panel and disables verification', async () => {
  const { guild } = await verificationGuild('gv3');
  await repo.setVerification('gv3', { panel_channel_id: 'vc1', panel_message_id: 'vm1', role_id: 'vr1', enabled: 1 });
  const deleted = [];
  guild.channels.cache.get('vc1').messages.fetch = async () => ({ delete: async () => { deleted.push('vm1'); } });
  const { i } = interaction({
    guild, member: guild.members.cache.get('owner'), user: { id: 'owner' },
    values: { commandName: 'verification' }, options: { subcommand: 'remove' },
  });
  await commands.get('verification').execute(i);
  assert.deepEqual(deleted, ['vm1']);
  assert.equal((await repo.getVerification('gv3')).enabled, 0);
});

// ---------------------------------------------------------------------------
// tickets
// ---------------------------------------------------------------------------
async function ticketGuild(id = 'gt') {
  const created = [];
  const sent = [];
  const channel = {
    id: 'panelch', name: 'support', type: ChannelType.GuildText, isTextBased: () => true,
    permissionsFor: () => ({ has: () => true }),
    send: async (payload) => { sent.push(payload); return { id: 'panelm' }; },
    messages: { fetch: async () => null },
  };
  let next = 0;
  const { guild } = fakeGuild({
    id,
    channels: {
      cache: new Map([['panelch', channel]]), fetch: async () => channel,
      create: async (opts) => {
        next++;
        const ch = {
          id: `tchan${next}`, name: opts.name, type: ChannelType.GuildText, isTextBased: () => true,
          permissionOverwrites: { values: opts.permissionOverwrites, edit: async () => {} },
          send: async (payload) => { sent.push(payload); return { id: `tm${next}` }; },
          delete: async () => {}, messages: { fetch: async () => new Collection() },
        };
        created.push({ ch, opts });
        guild.channels.cache.set(ch.id, ch);
        return ch;
      },
    },
  });
  guild.client = fakeClient([guild]);
  guild.members.me = { id: 'kurisu', roles: { highest: { position: 50 } }, permissions: bits(PermissionsBitField.All) };
  const owner = {
    id: 'owner', user: { id: 'owner', tag: 'owner#0001' },
    permissions: bits(PermissionsBitField.Flags.Administrator),
    roles: { cache: new Map(), highest: { position: 20 } },
  };
  const staff = {
    id: 'staff', user: { id: 'staff', tag: 'staff#0001' },
    permissions: bits(0), roles: { cache: new Map([['staffrole', { id: 'staffrole' }]]), highest: { position: 10 } },
  };
  guild.members.cache.set('owner', owner);
  guild.members.cache.set('staff', staff);
  guild.roles.cache.set('staffrole', role('staffrole', 10));
  await repo.setGuild(id, 'antinuke_enabled', 1);
  await repo.setTicketConfig(id, { staff_role_id: 'staffrole', max_open: 2 });
  await repo.warmGuild(id);
  return { guild, channel, created, sent, owner, staff };
}

test('tickets: panel, private channel creation, numbering and max-open', async () => {
  const { guild, channel, created, sent } = await ticketGuild('gt1');
  const owner = guild.members.cache.get('owner');
  const panelCmd = commands.get('ticket');
  const panel = interaction({ guild, member: owner, user: owner.user, values: { commandName: 'ticket' }, options: { subcommand: 'panel', channel } });
  await panelCmd.execute(panel.i);
  assert.equal(sent.length, 1);
  assert.equal(buttonNodes(sent[0])[0].custom_id, 'kt:new:panel');
  const cfg = await repo.getTicketConfig('gt1');
  assert.equal(cfg.panel_message_id, 'panelm');
  assert.equal(cfg.panel_channel_id, 'panelch');

  const create = interaction({ guild, member: owner, user: owner.user, customId: 'kt:new:panel', channelId: 'panelch' });
  await tickets.handle(create.i);
  assert.equal(created.length, 1);
  assert.equal(created[0].opts.name, 'ticket-1');
  const everyone = created[0].opts.permissionOverwrites.find((o) => o.id === 'gt1');
  assert.ok(everyone.deny.includes(PermissionsBitField.Flags.ViewChannel));
  const own = created[0].opts.permissionOverwrites.find((o) => o.id === 'owner');
  assert.ok(own.allow.includes(PermissionsBitField.Flags.ViewChannel));
  assert.equal((await repo.getTicket('gt1', 1)).channel_id, 'tchan1');

  await tickets.handle(interaction({ guild, member: owner, user: owner.user, customId: 'kt:new:panel', channelId: 'panelch' }).i);
  const third = interaction({ guild, member: owner, user: owner.user, customId: 'kt:new:panel', channelId: 'panelch' });
  await tickets.handle(third.i);
  assert.match(plain(third.sink.replied), /already have 2 open ticket/);
});

test('tickets: close confirmation, claim, add/remove and staff-only list', async () => {
  const { guild, created } = await ticketGuild('gt2');
  const owner = guild.members.cache.get('owner');
  const staff = guild.members.cache.get('staff');
  await repo.createTicket('gt2', { number: 1, channelId: 'tchan1', ownerId: 'owner' });
  const ticketChannel = {
    id: 'tchan1', name: 'ticket-1', isTextBased: () => true, messages: { fetch: async () => new Collection() },
    permissionOverwrites: { edit: async (id, perms) => { ticketChannel.edits.push([id, perms]); } },
    edits: [], send: async () => ({}), delete: async () => {},
  };
  guild.channels.cache.set('tchan1', ticketChannel);

  const claim = interaction({ guild, member: staff, user: staff.user, customId: 'kt:claim:1', channelId: 'tchan1' });
  await tickets.handle(claim.i);
  assert.equal((await repo.getTicket('gt2', 1)).claimed_by, 'staff');

  const add = interaction({
    guild, member: staff, user: staff.user, channel: ticketChannel, channelId: 'tchan1',
    values: { commandName: 'ticket' }, options: { subcommand: 'add', user: { id: 'friend', user: { id: 'friend' } } },
  });
  await commands.get('ticket').execute(add.i);
  assert.deepEqual(ticketChannel.edits.at(-1), ['friend', { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true }]);

  const close = interaction({ guild, member: owner, user: owner.user, channel: ticketChannel, channelId: 'tchan1', values: { commandName: 'ticket' }, options: { subcommand: 'close' } });
  await commands.get('ticket').execute(close.i);
  assert.match(plain(close.sink.replied), /Close ticket \*\*#1\*\*/);

  const confirm = interaction({ guild, member: owner, user: owner.user, customId: 'kt:closeok:1', channel: ticketChannel, channelId: 'tchan1' });
  await tickets.handle(confirm.i);
  assert.equal((await repo.getTicket('gt2', 1)).state, 'closed');

  const list = interaction({ guild, member: staff, user: staff.user, values: { commandName: 'ticket' }, options: { subcommand: 'list' } });
  await commands.get('ticket').execute(list.i);
  assert.match(plain(list.sink.replied), /OPEN TICKETS/);
  assert.equal(created.length, 0);
});

test('tickets: closing by number from another channel targets only the ticket channel', async () => {
  const { guild } = await ticketGuild('gt3');
  const staff = guild.members.cache.get('staff');
  await repo.createTicket('gt3', { number: 2, channelId: 'tchan2', ownerId: 'owner' });
  const sent = [];
  const ticketChannel = {
    id: 'tchan2', name: 'ticket-2', isTextBased: () => true, messages: { fetch: async () => new Collection() },
    permissionOverwrites: { edit: async () => {} }, send: async (p) => { sent.push(p); return {}; }, delete: async () => {},
  };
  const other = {
    id: 'other', name: 'general', isTextBased: () => true, messages: { fetch: async () => new Collection() },
    permissionOverwrites: { edit: async () => {} }, send: async () => { throw new Error('wrong channel targeted'); }, delete: async () => { throw new Error('wrong channel deleted'); },
  };
  guild.channels.cache.set('tchan2', ticketChannel);
  guild.channels.cache.set('other', other);

  const close = interaction({
    guild, member: staff, user: staff.user, channelId: 'other',
    values: { commandName: 'ticket' }, options: { subcommand: 'close', ticket: 2 },
  });
  await commands.get('ticket').execute(close.i);
  assert.match(plain(close.sink.replied), /Close ticket \*\*#2\*\*/);
  const confirm = interaction({ guild, member: staff, user: staff.user, customId: 'kt:closeok:2', channelId: 'other' });
  await tickets.handle(confirm.i);
  assert.equal((await repo.getTicket('gt3', 2)).state, 'closed');
  assert.equal(sent.length, 1, 'the ticket channel received the close notice');
});

// ---------------------------------------------------------------------------
// premium + guild-member profile
// ---------------------------------------------------------------------------
test('premium: bot-owner enable/disable and expiry sweep resets the guild profile', async () => {
  const gid = '123456789012345678';
  const { guild } = fakeGuild({ id: gid });
  guild.client = fakeClient([guild]);
  const owner = { id: 'botowner', user: { id: 'botowner' }, permissions: bits(PermissionsBitField.Flags.Administrator) };
  const cmd = commands.get('premium');
  const enable = interaction({
    guild, member: owner, user: owner.user, client: guild.client,
    values: { commandName: 'premium' }, options: { subcommand: 'enable', guild_id: gid, days: 2 },
  });
  await cmd.execute(enable.i);
  assert.ok(enable.i.deferred, 'premium acknowledges before the database write');
  assert.match(plain(enable.sink.edited), /Premium enabled/);
  const row = await repo.getPremium(gid);
  assert.ok(row);
  assert.equal(row.enabled_by, 'botowner');

  const activate = interaction({
    guild, member: owner, user: owner.user, client: guild.client,
    values: { commandName: 'premium' }, options: { subcommand: 'activate', guild_id: gid, days: 3 },
  });
  await cmd.execute(activate.i);
  assert.ok(activate.i.deferred);
  assert.match(plain(activate.sink.edited), /Premium enabled/, 'activate is an alias for enable');

  const list = interaction({
    guild, member: owner, user: owner.user, client: guild.client,
    values: { commandName: 'premium' }, options: { subcommand: 'list', page: 1 },
  });
  await cmd.execute(list.i);
  assert.ok(list.i.deferred);
  assert.match(plain(list.sink.edited), /PREMIUM GUILDS/);

  const nonOwner = interaction({
    guild, member: { id: 'rando', permissions: bits(0) }, user: { id: 'rando' },
    values: { commandName: 'premium' }, options: { subcommand: 'enable' },
  });
  await cmd.execute(nonOwner.i);
  assert.equal(nonOwner.i.deferred, false);
  assert.match(plain(nonOwner.sink.replied), /bot owner/);

  const edits = [];
  guild.members.editMe = async (opts) => { edits.push(opts); };
  await repo.setBotProfile(gid, { avatar: 1 });
  await db.get().collection('premium').updateOne({ guild_id: gid }, { $set: { expires_at: Date.now() - 1 } });
  await premiumEngine.sweep(guild.client);
  assert.equal(await repo.getBotProfile(gid), null);
  assert.equal(edits.at(-1).avatar, null);
  assert.equal(edits.at(-1).banner, null);
  assert.equal(await repo.getPremium(gid), null, 'expired premium is not active');
});

test('premium: lazy expiry clears the cosmetic guild profile', async () => {
  const { guild } = fakeGuild({ id: 'gp3' });
  const edits = [];
  guild.members.editMe = async (opts) => { edits.push(opts); };
  await repo.setPremium('gp3', { expiresAt: Date.now() + 60_000 });
  await repo.setBotProfile('gp3', { avatar: 1, banner: 1 });
  await repo.setPremium('gp3', { expiresAt: Date.now() - 1 });
  assert.equal(await premiumEngine.active(guild), false);
  assert.equal(await repo.getBotProfile('gp3'), null);
  assert.equal(edits.length, 1);
  assert.equal(edits[0].avatar, null);
  assert.equal(edits[0].banner, null);
});

test('profile: validates image bytes and stores only flags', async () => {
  const { guild } = fakeGuild({ id: 'gp2' });
  guild.client = fakeClient([guild]);
  guild.members.editMe = async (opts) => { guild.profileEdit = opts; };
  await repo.setPremium('gp2', { expiresAt: Date.now() + 86400000 });
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, headers: { get: () => String(png.length) }, arrayBuffer: async () => png });
  try {
    const owner = { id: 'owner', user: { id: 'owner' }, permissions: bits(PermissionsBitField.Flags.Administrator) };
    const avatar = interaction({
      guild, member: owner, user: owner.user, client: guild.client,
      values: { commandName: 'botprofile' }, options: { subcommand: 'avatar', url: 'https://example.com/a.png' },
    });
    await commands.get('botprofile').execute(avatar.i);
    assert.ok(Buffer.isBuffer(guild.profileEdit.avatar));
    const stored = await repo.getBotProfile('gp2');
    assert.equal(stored.avatar, 1);
    assert.equal(stored.banner, undefined, 'only a flag is stored, never image data');
  } finally { global.fetch = originalFetch; }

  const { imageKind } = require('../src/commands/premium/botprofile');
  assert.equal(imageKind(Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0])), 'jpg');
  assert.equal(imageKind(Buffer.from([0x47, 0x49, 0x46, 0x38, 0, 0, 0, 0, 0, 0, 0, 0])), 'gif');
  assert.equal(imageKind(Buffer.from('RIFF0000WEBP')), 'webp');
  assert.equal(imageKind(Buffer.from('not an image')), null);
});

test('dashboard: premium line is read-only and security navigation stays grey', async () => {
  const { guild } = fakeGuild({ id: 'gdash' });
  guild.client = fakeClient([guild]);
  await repo.setPremium('gdash', { expiresAt: Date.now() + 86400000 });
  const { i, sink } = dashInteraction(guild);
  await dashboard.handle(i);
  assert.ok(sink.updated);
  assert.match(plain(sink.updated), /Premium/);
  assert.ok(!componentIds(sink.updated).some((id) => /premium/i.test(id)), 'premium is not a dashboard button');
  assert.ok(buttonNodes(sink.updated).every((b) => b.style === 2));
});

// ---------------------------------------------------------------------------
// UI, commands, help, text
// ---------------------------------------------------------------------------
test('UI: every new panel is Components V2, grey-only, accent-free and free of Unicode emoji', async () => {
  const sourcePanels = [verification.panelItems(), tickets.panelItems()];
  for (const items of sourcePanels) {
    const payload = ui.message(items);
    assert.ok(Number(payload.flags) & MessageFlags.IsComponentsV2);
    assert.equal(Number(payload.flags) & MessageFlags.Ephemeral, 0);
    const nodes = allNodes(payload);
    assert.ok(!nodes.some((n) => n.embeds), 'no embeds');
    assert.ok(!nodes.some((n) => 'accent_color' in n), 'no accent colour');
    assert.ok(buttonNodes(payload).every((b) => b.style === 2), 'only secondary buttons');
    assert.ok(!/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(plain(payload)), 'no Unicode emoji');
  }
});

test('source regression: no Unicode emoji, raw embeds or accent colours outside the registry', () => {
  const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
  const files = [];
  const walkDir = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walkDir(p);
      else if (p.endsWith('.js') && !p.endsWith('emojis.js')) files.push(p);
    }
  };
  walkDir(path.join(__dirname, '..', 'src'));
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    assert.ok(!emoji.test(source), `${file} contains a Unicode emoji`);
    assert.ok(!/accentColor|accent_color/i.test(source), `${file} sets an accent colour`);
    assert.ok(!/\bembed\s*:/i.test(source), `${file} sends a raw embed`);
  }
});

test('commands: every required top-level command exists and loads with a category', () => {
  const required = ['ban', 'unban', 'kick', 'timeout', 'untimeout', 'warn', 'warnings', 'purge', 'clear', 'slowmode', 'lock', 'unlock', 'hide', 'unhide', 'nickname', 'role', 'softban', 'massban', 'masskick', 'case', 'banlist', 'whitelist', 'security', 'antinuke', 'incidents', 'watchlist', 'guilds', 'prefix', 'help', 'ping', 'serverinfo', 'userinfo', 'dev', 'verification', 'ticket', 'premium', 'botprofile'];
  for (const name of required) assert.ok(commands.has(name), `missing /${name}`);
  assert.equal(commands.size, 42);
  assert.deepEqual(commands.get('ticket').data.toJSON().options.map((o) => o.name), ['panel', 'setup', 'close', 'add', 'remove', 'claim', 'list']);
  assert.deepEqual(commands.get('premium').data.toJSON().options.map((o) => o.name), ['enable', 'activate', 'disable', 'list']);
  assert.ok(commands.get('verification').data.toJSON().options.some((o) => o.name === 'panel'));
});

test('help: generated from real command definitions and covers tickets, premium and profile', () => {
  const entries = help.collect(commands);
  assert.ok(entries.length >= 70);
  for (const name of ['ticket.panel', 'ticket.setup', 'verification.panel', 'verification.config', 'premium.enable', 'premium.list', 'botprofile.avatar']) {
    assert.ok(entries.some((e) => e.key === name), `missing help entry ${name}`);
  }
  assert.ok(help.CATEGORIES.tickets && help.CATEGORIES.premium);
  const rendered = help.mainView('owner', '!');
  const payload = ui.message(rendered);
  assert.ok(buttonNodes(payload).every((b) => b.style === 2));
});

test('text commands: help and ping reply with V2 payloads through the prefix pipeline', async () => {
  const { guild, addMember } = fakeGuild({ id: 'gtextcmd2', ownerId: 'owner' });
  const member = addMember('owner');
  member.permissions = { has: () => true };
  member.user = { id: 'owner', bot: false, tag: 'owner#0001', username: 'owner' };
  const client = fakeClient([guild]);
  const sent = [];
  const message = {
    guild, member, client, content: 'khelp',
    author: { id: 'owner', bot: false, tag: 'owner#0001', username: 'owner' },
    channel: { id: 'c1', name: 'general', permissionsFor: () => ({ has: () => true }) },
    reply: async (payload) => { sent.push(payload); return { edit: async () => {} }; },
  };
  await repo.setGuild(guild.id, 'prefix', 'k');
  text.clearPrefix(guild.id);
  assert.equal(await text.handle(message, client), true);
  assert.ok(Number(sent[0].flags) & MessageFlags.IsComponentsV2);
  assert.equal(Number(sent[0].flags) & MessageFlags.Ephemeral, 0);
  sent.length = 0; message.content = 'kping';
  assert.equal(await text.handle(message, client), true);
  assert.ok(Number(sent[0].flags) & MessageFlags.IsComponentsV2);
  sent.length = 0; message.content = 'kinda';
  assert.equal(await text.handle(message, client), false);
});

test('prefix: per-guild prefix and typed ticket parsing', async () => {
  await repo.setGuild('gp', 'prefix', '?');
  assert.equal((await repo.getGuild('gp')).prefix, '?');
  assert.equal((await repo.getGuild('gq')).prefix, '!');
  const defs = (name, sub) => {
    const json = commands.get(name).data.toJSON();
    return sub ? json.options.find((o) => o.name === sub).options : json.options;
  };
  const guild = { id: 'gparse', ownerId: 'owner', members: { cache: new Map(), fetch: async () => null }, roles: { cache: new Map() }, channels: { cache: new Map() } };
  const message = { guild, client: clientForParse() };
  const parsed = await text.parseOptions(message, defs('ticket', 'close'), text.tokenize('ticket:12'));
  assert.equal(parsed.values.ticket, 12);
  const parsedMax = await text.parseOptions(message, defs('ticket', 'setup'), text.tokenize('max_open:5 transcripts:true'));
  assert.equal(parsedMax.values.max_open, 5);
  assert.equal(parsedMax.values.transcripts, true);
  const attachment = { url: 'https://example.invalid/avatar.png', size: 128 };
  const withAttachment = {
    ...message,
    attachments: { size: 1, first: () => attachment },
  };
  const parsedAttachment = await text.parseOptions(withAttachment, defs('botprofile', 'avatar'), []);
  assert.equal(parsedAttachment.values.image, attachment);
});

function clientForParse() { return { users: { cache: new Map(), fetch: async () => null } }; }

test('authorization: dashboard rejects Administrator-only members and accepts the owner', async () => {
  const { guild } = fakeGuild({ id: 'gauth' });
  guild.client = fakeClient([guild]);
  const admin = interaction({
    guild, member: { id: 'admin', permissions: bits(PermissionsBitField.Flags.Administrator) },
    user: { id: 'admin' }, customId: 'ks:v:main',
  });
  await dashboard.handle(admin.i);
  assert.match(plain(admin.sink.replied), /not authorised/);
  const owner = dashInteraction(guild);
  await dashboard.handle(owner.i);
  assert.ok(owner.sink.updated);
  assert.ok(buttonNodes(owner.sink.updated).every((b) => b.style === 2));
});

test('helpers: durations, clip and presence wording', () => {
  assert.equal(helperFns.parseDuration('30s'), 30);
  assert.equal(helperFns.formatDuration(90), '1m 30s');
  assert.equal(helperFns.presenceName(1234), '1,234 users');
  assert.equal(helperFns.clip('abcdef', 4), 'abc…');
});
