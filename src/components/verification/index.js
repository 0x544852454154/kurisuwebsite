'use strict';
const { PermissionsBitField } = require('discord.js');
const ui = require('../common/ui');
const repo = require('../../database/repo');
const logging = require('../../engines/logging');
const log = require('../../utils/logger');
const { DANGEROUS_BITS, LIMITS } = require('../../config/settings');

const { E } = ui;
const PANEL_ID = 'kv:verify';
const cooldown = new Map(); // `${guild}:${user}` -> expiry

const panelItems = () => [
  `### ${E.modernVerify} VERIFICATION`,
  'Verify to unlock the server.\n-# Click the button below. Your roles are granted instantly.',
  'sep',
  `-# One tap  ·  ${Math.ceil(LIMITS.verifyCooldownMs / 1000)}s cooldown`,
  ui.buttons(ui.btn(PANEL_ID, 'Verify', { emoji: 'verified' })),
];
const panelMessage = () => ui.message(panelItems());

/** Server-side validation of the configured verified role. */
async function resolveRole(guild, roleId, { create = false } = {}) {
  let role = roleId ? guild.roles.cache.get(roleId) : null;
  if (!role && roleId) role = await guild.roles.fetch(roleId).catch(() => null);
  if (!role && create) {
    role = await guild.roles.create({
      name: 'Verified',
      permissions: new PermissionsBitField(0n),
      mentionable: false,
      reason: 'Kurisu verification: verified role',
    });
  }
  if (!role) return { ok: false, error: 'The verified role no longer exists. Run /verification panel again.' };
  if (role.id === guild.id) return { ok: false, error: 'The @everyone role cannot be the verified role.' };
  if (role.managed) return { ok: false, error: 'That role is managed by an integration and cannot be assigned.' };
  if (role.permissions.bitfield & DANGEROUS_BITS) return { ok: false, error: 'The verified role must not contain dangerous permissions.' };
  const me = guild.members.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
    return { ok: false, error: 'I need Manage Roles to hand out the verified role.' };
  }
  if (role.position >= me.roles.highest.position) {
    return { ok: false, error: 'The verified role is above my highest role. Move it below my role and try again.' };
  }
  return { ok: true, role };
}

/** Post the public, stable panel and remember where it lives. Re-posting replaces the old one. */
async function postPanel(guild, channel, role) {
  const cfg = await repo.getVerification(guild.id);
  if (cfg.panel_channel_id && cfg.panel_message_id) {
    const old = guild.channels.cache.get(cfg.panel_channel_id)
      || await guild.channels.fetch(cfg.panel_channel_id).catch(() => null);
    if (old?.isTextBased?.()) {
      const message = await old.messages.fetch(cfg.panel_message_id).catch(() => null);
      if (message) await message.delete().catch(() => {});
    }
  }
  const sent = await channel.send(panelMessage());
  await repo.setVerification(guild.id, {
    panel_channel_id: channel.id,
    panel_message_id: sent.id,
    role_id: role.id,
    enabled: 1,
  });
  return sent;
}

async function removePanel(guild) {
  const cfg = await repo.getVerification(guild.id);
  if (cfg.panel_channel_id && cfg.panel_message_id) {
    const channel = guild.channels.cache.get(cfg.panel_channel_id)
      || await guild.channels.fetch(cfg.panel_channel_id).catch(() => null);
    const message = channel?.messages ? await channel.messages.fetch(cfg.panel_message_id).catch(() => null) : null;
    if (message) await message.delete().catch(() => {});
  }
  await repo.setVerification(guild.id, { enabled: 0, panel_channel_id: null, panel_message_id: null });
  return cfg;
}

/** Component handler: customId is exactly `kv:verify`, but every decision is re-read from the database. */
async function handle(i) {
  const guild = i.guild;
  if (!guild) return i.reply(ui.error('Verification only works in a server.'));
  const cfg = await repo.getVerification(guild.id);
  if (!cfg.enabled) return i.reply(ui.error('Verification is not set up in this server.'));
  if (i.channelId !== cfg.panel_channel_id) {
    return i.reply(ui.error('This verification panel is no longer active. Use the current panel.'));
  }
  if (!i.member) return i.reply(ui.error('I could not read your membership. Try again in a moment.'));

  const resolved = await resolveRole(guild, cfg.role_id);
  if (!resolved.ok) {
    log.warn(`verification role invalid in ${guild.id}: ${resolved.error}`);
    return i.reply(ui.error(resolved.error));
  }
  const { role } = resolved;
  if (i.member.roles.cache.has(role.id)) {
    return i.reply(ui.notice(E.verified, 'You are already verified.', { ephemeral: true }));
  }

  const key = `${guild.id}:${i.user.id}`;
  if ((cooldown.get(key) || 0) > Date.now()) {
    return i.reply(ui.notice(E.timeoutClock, 'Please wait a few seconds before trying again.', { ephemeral: true }));
  }

  const raidCfg = await repo.getRaid(guild.id);
  const ageDays = (Date.now() - Number(i.user.createdTimestamp || 0)) / 86_400_000;
  if (raidCfg.lockdown_active || raidCfg.level === 'LOCKDOWN') {
    return i.reply(ui.notice(E.modernRaid, 'Verification is paused during lockdown. Try again shortly.', { ephemeral: true }));
  }
  if (raidCfg.min_account_age_days && ageDays < raidCfg.min_account_age_days) {
    return i.reply(ui.notice(E.timeoutClock, `Your account must be at least ${raidCfg.min_account_age_days} days old.`, { ephemeral: true }));
  }

  cooldown.set(key, Date.now() + LIMITS.verifyCooldownMs);
  try {
    await i.member.roles.add(role, 'Kurisu verification');
  } catch (err) {
    cooldown.delete(key);
    log.warn(`verification role add failed in ${guild.id}`, err);
    return i.reply(ui.error('I could not give you the verified role. Ask an administrator to check my role position.'));
  }

  await repo.addVerified(guild.id, i.user.id, i.user.id).catch((err) => log.debug('verified record failed', err));
  await logging.send(guild, 'member', `${E.verified} MEMBER VERIFIED`, [
    `Member: <@${i.user.id}>`,
    `Role: <@&${role.id}>`,
    `Account age: ${Math.max(0, Math.floor(ageDays))} day(s)`,
  ]).catch(() => {});
  return i.reply(ui.notice(E.verified, 'You are verified. Welcome in.', { ephemeral: true }));
}

module.exports = { PANEL_ID, panelItems, panelMessage, resolveRole, postPanel, removePanel, handle, cooldown };
