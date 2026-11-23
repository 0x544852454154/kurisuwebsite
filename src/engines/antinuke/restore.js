'use strict';
const { ChannelType, PermissionsBitField, Routes } = require('discord.js');
const repo = require('../../database/repo');
const recovery = require('../recovery');
const logging = require('../logging');
const snapshot = require('./snapshot');
const log = require('../../utils/logger');
const { sleep } = require('../../utils/helpers');
const { DANGEROUS_BITS } = require('../../config/settings');

/**
 * Batched channel rebuilding.
 *
 * Restoring one channel per audit entry cannot keep up with a wipe: the attacker
 * deletes 30 channels in one concurrent burst, and 30 serial REST recreations
 * leave the server empty for tens of seconds. Deletions are therefore collected
 * per guild and rebuilt as a batch once the burst goes quiet - categories first
 * (so children land inside them), children concurrently, and every position
 * restored in a single bulk call.
 */

const RESTORE_QUIET_MS = 300;      // silence that ends a deletion burst
const RESTORE_MAX_WAIT_MS = 2_000; // ...but never wait longer than this
const CREATE_CONCURRENCY = 5;      // parallel channel creations before rate limits bite

const pending = new Map();  // guildId -> [{ id, snap }]
const workers = new Map();  // guildId -> running worker promise
const idmap = new Map();    // guildId -> Map(oldId -> newId)
const queued = new Map();   // guildId -> Set(oldId) still waiting in `pending`

const queueOf = (gid) => {
  let list = pending.get(gid);
  if (!list) { list = []; pending.set(gid, list); }
  return list;
};
const seenOf = (gid) => {
  let set = queued.get(gid);
  if (!set) { set = new Set(); queued.set(gid, set); }
  return set;
};
const MAX_REMEMBERED = 500; // rebuilt ids are only needed while the burst is live

const idmapOf = (gid) => {
  let map = idmap.get(gid);
  if (!map) { map = new Map(); idmap.set(gid, map); }
  // Oldest entries are dropped first: they can no longer be part of a live burst.
  while (map.size > MAX_REMEMBERED) map.delete(map.keys().next().value);
  return map;
};

/** Map every channel whose deletion is still being undone, so repeat hits collapse. */
function isPending(guildId, oldId) {
  const gid = String(guildId);
  const id = String(oldId);
  return idmap.get(gid)?.has(id) || queued.get(gid)?.has(id) || false;
}

/**
 * Queue a deleted channel for rebuild. `snap` is the in-memory state captured
 * before the delete; when it is missing the worker falls back to the database
 * snapshot, so nothing is ever lost just because the pop raced the capture.
 */
function enqueue(guild, snap, oldId, reason) {
  const gid = String(guild.id);
  const id = String(snap?.id || oldId);
  if (!id || id === 'undefined') return 'skipped';
  if (isPending(gid, id)) return 'already queued';
  queueOf(gid).push({ id, snap, reason });
  seenOf(gid).add(id);
  if (!workers.has(gid)) workers.set(gid, run(guild).finally(() => workers.delete(gid)));
  return 'queued for rebuild';
}

async function run(guild) {
  const gid = String(guild.id);
  try {
    while (queueOf(gid).length) {
      // Wait for the burst to settle so a deleted category arrives together with
      // its children instead of being rebuilt around a missing parent.
      const start = Date.now();
      let seen = -1;
      while (queueOf(gid).length !== seen && Date.now() - start < RESTORE_MAX_WAIT_MS) {
        seen = queueOf(gid).length;
        await sleep(RESTORE_QUIET_MS);
      }
      const batch = queueOf(gid).splice(0, queueOf(gid).length);
      for (const { id } of batch) seenOf(gid).delete(id);
      const t0 = Date.now();
      let result;
      try {
        result = await rebuild(guild, batch);
      } catch (err) {
        log.error(`antinuke: channel rebuild failed in ${guild.id}`, err);
        continue;
      }
      if (result.done) {
        await logging.send(guild, 'antinuke', 'CHANNELS RESTORED', [
          `Rebuilt: ${result.done} of ${result.total} deleted channel(s)`,
          `Took: ${((Date.now() - t0) / 1000).toFixed(1)}s`,
          ...(result.failed ? [`Failed: ${result.failed}`] : []),
          ...(result.sanitised ? [`Dangerous overwrites withheld: ${result.sanitised}`] : []),
          '',
          `Time: <t:${Math.floor(Date.now() / 1000)}:R>`,
        ]).catch(() => {});
      }
    }
  } finally {
    workers.delete(gid);
  }
}

/** Rebuild a batch. Categories first, then children, then one bulk position call. */
async function rebuild(guild, batch) {
  const gid = String(guild.id);
  const map = idmapOf(gid);
  const reason = 'Kurisu recovery: channel restored';

  const ticketChannels = await openTicketChannels(guild).catch(() => new Set());
  const work = [];
  for (const item of batch) {
    if (ticketChannels.has(String(item.id))) {
      await repo.addRecovery(guild.id, 'channel', item.id, 'skipped', 'ticket channels are never auto-restored').catch(() => {});
      continue;
    }
    const snap = item.snap || await dbSnapshot(guild.id, item.id);
    if (!snap) {
      await repo.addRecovery(guild.id, 'channel', item.id, 'skipped', 'no snapshot available').catch(() => {});
      continue;
    }
    work.push(snap);
  }
  if (!work.length) return { done: 0, failed: 0, total: batch.length, sanitised: 0 };

  const made = new Map();       // oldId -> created channel
  const placed = [];            // { ch, position } as each channel is rebuilt
  const failures = [];
  let sanitised = 0;

  /** Resolve the parent: a category rebuilt in this batch wins, otherwise the live cache. */
  const parentFor = (snap) => {
    if (!snap.parentId) return undefined;
    const old = String(snap.parentId);
    const rebuilt = made.get(old);
    if (rebuilt) return rebuilt.id;
    const mapped = map.get(old);
    if (mapped && guild.channels.cache.has(mapped)) return mapped;
    return guild.channels.cache.has(old) ? old : undefined;
  };

  const build = async (snap) => {
    const parent = parentFor(snap);
    const built = sanitize(guild, snap.overwrites);
    sanitised += built.stripped;
    try {
      const ch = await createLike(guild, snap, parent, built.overwrites, reason);
      made.set(String(snap.id), ch);
      placed.push({ ch, position: Number(snap.position) || 0 });
      map.set(String(snap.id), ch.id);
      const adopted = { ...snap, id: ch.id, parentId: ch.parentId || null, position: ch.rawPosition ?? snap.position };
      snapshot.adopt(gid, adopted);
      repo.saveSnapshot(guild.id, 'channel', ch.id, ch.name, recovery.serializeChannel(ch)).catch(() => {});
      await repo.addRecovery(guild.id, 'channel', snap.id, 'restored', `${snap.name}${built.stripped ? `, ${built.stripped} dangerous overwrite(s) sanitised` : ''}; messages cannot be recovered`).catch(() => {});
    } catch (err) {
      failures.push(String(snap.name));
      log.warn(`antinuke: could not rebuild #${snap.name} in ${guild.id}`, err);
      await repo.addRecovery(guild.id, 'channel', snap.id, 'failed', err.message).catch(() => {});
    }
  };

  // Categories carry their children: they must exist before anything else.
  await mapLimit(work.filter((s) => s.type === ChannelType.GuildCategory), CREATE_CONCURRENCY, build);
  await mapLimit(work.filter((s) => s.type !== ChannelType.GuildCategory), CREATE_CONCURRENCY, build);

  if (placed.length) {
    const order = placed
      .sort((a, b) => a.position - b.position)
      .map(({ ch, position }) => ({ id: ch.id, position }));
    await restorePositions(guild, order).catch((err) => log.debug('bulk channel position restore failed', err));
    await remapLogChannels(guild, map).catch((err) => log.debug('log channel remap failed', err));
  }

  return { done: made.size, failed: failures.length, total: work.length, sanitised };
}

/** One REST call restores every rebuilt channel's position. */
async function restorePositions(guild, order) {
  if (!order.length) return;
  await guild.client.rest.put(Routes.guildChannels(guild.id), {
    body: order,
    reason: 'Kurisu recovery: channel positions restored',
  });
}

/** Keep log delivery working when the attacker deleted the log channel itself. */
async function remapLogChannels(guild, map) {
  if (!map.size) return;
  const configured = await repo.allLogChannels(guild.id);
  for (const [type, channelId] of Object.entries(configured)) {
    const replacement = map.get(String(channelId));
    if (replacement) await repo.setLogChannel(guild.id, type, replacement);
  }
}

async function openTicketChannels(guild) {
  const rows = await repo.listTickets(guild.id, { state: 'open', limit: 250 });
  return new Set(rows.map((r) => String(r.channel_id)));
}

async function dbSnapshot(guildId, oldId) {
  const row = await repo.getSnapshot(guildId, 'channel', oldId).catch(() => null);
  return row?.data || null;
}

/**
 * Strip dangerous permissions from restored overwrites. A wipe must never be
 * undone by handing the attacker's role its powers back.
 */
function sanitize(guild, overwrites) {
  let stripped = 0;
  const out = [];
  for (const ow of overwrites || []) {
    const isRole = ow.type === 0;
    const exists = isRole ? guild.roles.cache.has(ow.id) : guild.members.cache.has(ow.id);
    if (!exists) continue;
    const allow = BigInt(ow.allow || 0);
    const safe = allow & ~DANGEROUS_BITS;
    if (safe !== allow) stripped++;
    out.push({ id: ow.id, type: ow.type, allow: safe, deny: BigInt(ow.deny || 0) });
  }
  return { overwrites: out, stripped };
}

/** Recreate one channel, degrading to defaults if a stored setting is no longer valid. */
async function createLike(guild, snap, parent, overwrites, reason) {
  const base = { name: snap.name, type: snap.type, reason };
  if (parent && snap.type !== ChannelType.GuildCategory) base.parent = parent;
  if (overwrites.length) {
    base.permissionOverwrites = overwrites.map((ow) => ({
      id: ow.id,
      type: ow.type,
      allow: new PermissionsBitField(ow.allow),
      deny: new PermissionsBitField(ow.deny),
    }));
  }
  const opts = { ...base };
  const textual = [
    ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildMedia,
  ].includes(snap.type);
  const voice = [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(snap.type);
  if (textual) {
    if (snap.topic) opts.topic = snap.topic;
    opts.nsfw = !!snap.nsfw;
    if (snap.rateLimitPerUser) opts.rateLimitPerUser = snap.rateLimitPerUser;
  }
  if (voice) {
    if (snap.bitrate) opts.bitrate = Math.min(snap.bitrate, guild.maximumBitrate);
    if (snap.userLimit) opts.userLimit = snap.userLimit;
  }
  try {
    return await guild.channels.create(opts);
  } catch (err) {
    if (err?.status !== 400) throw err;
    return guild.channels.create(base); // a stored setting is rejected: rebuild with defaults
  }
}

/** Bounded parallel map - keeps REST bursts inside the global rate limit bucket. */
async function mapLimit(items, limit, fn) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

/** Reset a guild's rebuild state (guild removed, or shutdown). */
function clear(guildId) {
  const gid = String(guildId);
  pending.delete(gid);
  queued.delete(gid);
  idmap.delete(gid);
  workers.delete(gid);
}

/** Snapshot ids that were rebuilt, oldest first, for the incident summary. */
function rebuiltFor(guildId) {
  const gid = String(guildId);
  return idmap.get(gid) || new Map();
}

module.exports = {
  enqueue, rebuild, clear, isPending, rebuiltFor,
  RESTORE_QUIET_MS, RESTORE_MAX_WAIT_MS, CREATE_CONCURRENCY,
};
