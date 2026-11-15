'use strict';
const log = require('../utils/logger');

/*
 * Data migrations run once, after indexes, before the client becomes ready.
 * They only touch rows that still hold the old shipped defaults, so every
 * custom threshold, window or punishment row survives untouched.
 */

const LEGACY_MODULE_DEFAULTS = {
  channelDelete: { enabled: 1, threshold: 2, window_sec: 10, punishment: 'kick' },
  roleDelete: { enabled: 1, threshold: 2, window_sec: 10, punishment: 'kick' },
  massUnban: { enabled: 1, threshold: 3, window_sec: 15, punishment: 'kick' },
  prune: { enabled: 1, threshold: 1, window_sec: 60, punishment: 'kick' },
  webhookDelete: { enabled: 1, threshold: 3, window_sec: 20, punishment: 'strip' },
  botAdd: { enabled: 1, threshold: 1, window_sec: 60, punishment: 'kick' },
  permEscalation: { enabled: 1, threshold: 1, window_sec: 60, punishment: 'kick' },
  automodRule: { enabled: 1, threshold: 1, window_sec: 30, punishment: 'kick' },
  vanityChange: { enabled: 1, threshold: 1, window_sec: 60, punishment: 'kick' },
  nukeGuard: { enabled: 1, threshold: 3, window_sec: 10, punishment: 'kick' },
};

async function applied(database, id) {
  return !!(await database.collection('schema_migrations').findOne({ _id: id }));
}
async function mark(database, id, details) {
  await database.collection('schema_migrations').updateOne(
    { _id: id },
    { $set: { applied_at: Date.now(), details: details || null } },
    { upsert: true },
  );
}

/** Previous versions stored the old defaults as explicit rows. Remove only exact matches. */
async function antinukeDefaultsV2(database) {
  const id = 'antinuke_defaults_v2';
  if (await applied(database, id)) return { skipped: true, removed: 0 };
  let removed = 0;
  for (const [module, d] of Object.entries(LEGACY_MODULE_DEFAULTS)) {
    const res = await database.collection('antinuke_modules').deleteMany({
      module,
      enabled: d.enabled,
      threshold: d.threshold,
      window_sec: d.window_sec,
      punishment: d.punishment,
    });
    removed += res.deletedCount || 0;
  }
  await mark(database, id, { removed });
  return { skipped: false, removed };
}

/** Add the opt-in compromised-account guard to existing guilds without overwriting choices. */
async function compromisedGuardColumn(database) {
  const id = 'compromised_guard_v1';
  if (await applied(database, id)) return { skipped: true, updated: 0 };
  const res = await database.collection('guild_settings').updateMany(
    { compromised_guard: { $exists: false } },
    { $set: { compromised_guard: 0 } },
  );
  await mark(database, id, { updated: res.modifiedCount || 0 });
  return { skipped: false, updated: res.modifiedCount || 0 };
}

async function run(database) {
  const results = {};
  results.antinukeDefaults = await antinukeDefaultsV2(database);
  results.compromisedGuard = await compromisedGuardColumn(database);
  const changed = Object.entries(results).filter(([, r]) => !r.skipped);
  if (changed.length) log.info(`database migrations applied: ${changed.map(([k]) => k).join(', ')}`);
  return results;
}

module.exports = { run, antinukeDefaultsV2, compromisedGuardColumn, LEGACY_MODULE_DEFAULTS };
