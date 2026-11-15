'use strict';
const repo = require('../../database/repo');
const log = require('../../utils/logger');

/**
 * Premium is a cosmetic guild-member profile feature only. Security, antinuke,
 * raid protection and tickets are never gated by it.
 */
async function resetProfile(guild) {
  const profile = await repo.getBotProfile(guild.id).catch(() => null);
  if (!profile) return false;
  try {
    await guild.members.editMe({ avatar: null, banner: null, reason: 'Kurisu premium: expired' });
  } catch (err) {
    // Keep the flags so a later startup sweep or /botprofile call can retry.
    log.warn(`premium profile reset failed in ${guild.id}`, err);
    return false;
  }
  await repo.clearBotProfile(guild.id);
  return true;
}

/** Expire premium rows and reset any guild-member profile that depended on them. */
async function sweep(client) {
  const expired = await repo.expirePremiums();
  if (!expired.length) return 0;
  let reset = 0;
  for (const row of expired) {
    const guild = client.guilds.cache.get(String(row.guild_id));
    if (guild && await resetProfile(guild)) reset++;
    log.info(`premium expired for guild ${row.guild_id}`);
  }
  return reset;
}

/**
 * Lazy expiry: getPremium() removes an expired row. When the caller has the live
 * guild, also clear the cosmetic profile that depended on it so a lapsed premium
 * server never keeps a stale avatar or banner.
 */
async function active(guildOrId) {
  const id = typeof guildOrId === 'string' ? guildOrId : guildOrId?.id;
  if (!id) return false;
  const row = await repo.getPremium(id);
  if (row) return true;
  if (typeof guildOrId !== 'string' && guildOrId) await resetProfile(guildOrId);
  return false;
}

module.exports = { resetProfile, sweep, active };
