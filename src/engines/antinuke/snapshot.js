'use strict';
const { ChannelType } = require('discord.js');

/**
 * In-memory channel snapshots.
 *
 * A wipe deletes every channel in one concurrent burst. By the time the first
 * audit entry arrives, Discord has already removed the rest, so anything that
 * has to be read from the database, from the cache or from a REST call at that
 * moment is already too late. Every channel's full state is therefore kept in
 * memory ahead of time, and a delete pops its snapshot synchronously - no
 * await runs between "channel deleted" and "state secured".
 *
 * While a burst is running the map is frozen: Discord "updates" the children of
 * a deleted category (parent -> none) and creates the attacker's spam channels,
 * and none of that may overwrite the clean pre-attack state.
 */

const SNAPSHOT_FREEZE_MS = 30_000;

const snaps = new Map();      // guildId -> Map(channelId -> snap)
const lastDelete = new Map(); // guildId -> timestamp of the last observed deletion

const bucket = (guildId) => {
  const gid = String(guildId);
  let map = snaps.get(gid);
  if (!map) { map = new Map(); snaps.set(gid, map); }
  return map;
};

/** Never snapshot threads: they die with their parent and are rebuilt by it. */
const skip = (ch) => !ch || !ch.guild || (typeof ch.isThread === 'function' && ch.isThread());

/** Capture the state needed to recreate a channel exactly as it is now. */
function captureChannel(ch) {
  if (skip(ch)) return null;
  const overwrites = [];
  for (const ow of ch.permissionOverwrites?.cache?.values() || []) {
    overwrites.push({
      id: ow.id,
      type: ow.type, // 0 role, 1 member
      allow: ow.allow.bitfield.toString(),
      deny: ow.deny.bitfield.toString(),
    });
  }
  const isText = [
    ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildMedia,
  ].includes(ch.type);
  const isVoice = [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(ch.type);
  return {
    id: ch.id,
    name: ch.name ?? null,
    type: ch.type,
    parentId: ch.parentId || null,
    position: ch.rawPosition ?? 0,
    overwrites,
    topic: isText ? (ch.topic ?? null) : null,
    nsfw: isText ? !!ch.nsfw : false,
    rateLimitPerUser: isText ? (ch.rateLimitPerUser ?? 0) : 0,
    bitrate: isVoice ? (ch.bitrate ?? null) : null,
    userLimit: isVoice ? (ch.userLimit ?? null) : null,
  };
}

/** Store/refresh one channel. Blocked during a deletion burst unless forced. */
function remember(guildId, channel, { force = false } = {}) {
  const gid = String(guildId);
  if (!force && isFrozen(gid)) return null;
  const snap = captureChannel(channel);
  if (snap) bucket(gid).set(String(snap.id), snap);
  return snap;
}

/** Refresh every channel of a guild (timers, guild join, after a rebuild). */
function capture(guild, { force = false } = {}) {
  const gid = String(guild.id);
  if (!force && isFrozen(gid)) return size(gid);
  const map = bucket(gid);
  const live = new Set();
  for (const ch of guild.channels.cache.values()) {
    if (skip(ch)) continue;
    const snap = captureChannel(ch);
    if (snap) { map.set(String(snap.id), snap); live.add(String(snap.id)); }
  }
  // Drop channels that no longer exist, but never the ones a delete just took.
  if (!isFrozen(gid)) for (const id of [...map.keys()]) if (!live.has(id)) map.delete(id);
  return map.size;
}

/** Synchronously secure and remove a snapshot. Returns null when none was held. */
function take(guildId, channelId) {
  const map = snaps.get(String(guildId));
  if (!map) return null;
  const id = String(channelId);
  const snap = map.get(id);
  if (snap) map.delete(id);
  return snap || null;
}

function get(guildId, channelId) {
  return snaps.get(String(guildId))?.get(String(channelId)) || null;
}

/** Re-register a rebuilt channel under its new id so it can be restored again. */
function adopt(guildId, snap) {
  bucket(guildId).set(String(snap.id), snap);
  return snap;
}

function forget(guildId, channelId) {
  return snaps.get(String(guildId))?.delete(String(channelId)) || false;
}

function markDelete(guildId) { lastDelete.set(String(guildId), Date.now()); }

function isFrozen(guildId) {
  return Date.now() - (lastDelete.get(String(guildId)) || 0) < SNAPSHOT_FREEZE_MS;
}

function size(guildId) { return snaps.get(String(guildId))?.size || 0; }

function all(guildId) { return [...(snaps.get(String(guildId))?.values() || [])]; }

/** Drop snapshots for a guild that no longer exists or on shutdown. */
function clear(guildId) {
  snaps.delete(String(guildId));
  lastDelete.delete(String(guildId));
}

/** Remove freeze markers whose burst is long over so the maps cannot grow. */
function sweep() {
  const cutoff = Date.now() - SNAPSHOT_FREEZE_MS;
  for (const [gid, t] of lastDelete) if (t < cutoff) lastDelete.delete(gid);
}

module.exports = {
  captureChannel, remember, capture, take, get, adopt, forget, markDelete, isFrozen, size, all, clear, sweep,
  SNAPSHOT_FREEZE_MS,
};
