'use strict';
const repo = require('../../database/repo');
const ui = require('../../components/common/ui');
const log = require('../../utils/logger');

const { E } = ui;

/** Hard caps so a single user cannot flood the queue. */
const MAX_PER_USER = 10;
const MIN_SECONDS = 10;
const MAX_SECONDS = 30 * 24 * 3600;

/**
 * Deliver every reminder whose deadline passed. Reminders are deleted only
 * after a successful send, so a temporary outage retries on the next tick.
 */
async function tick(client) {
  let rows;
  try {
    rows = await repo.dueReminders(Date.now(), 25);
  } catch (err) {
    log.warn('reminder lookup failed', err);
    return 0;
  }
  let sent = 0;
  for (const row of rows) {
    try {
      const channel = await client.channels.fetch(row.channel_id).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        await repo.deleteReminder(row.id);
        continue;
      }
      await channel.send(ui.message([
        `### ${E.timeoutClock} REMINDER`,
        'sep',
        `<@${row.user_id}> you asked to be reminded:`,
        `> ${row.message}`,
        `-# Set <t:${Math.floor(row.created_at / 1000)}:R>`,
      ]));
      await repo.deleteReminder(row.id);
      sent++;
    } catch (err) {
      log.warn(`reminder ${row.id} delivery failed`, err);
    }
  }
  return sent;
}

module.exports = { tick, MAX_PER_USER, MIN_SECONDS, MAX_SECONDS };
