'use strict';
const { SlashCommandBuilder } = require('discord.js');
const { fail } = require('../_util');
const perms = require('../../permissions');
const repo = require('../../database/repo');
const premium = require('../../engines/premium');
const ui = require('../../components/common/ui');
const logging = require('../../engines/logging');
const { LIMITS } = require('../../config/settings');

const { E } = ui;
const ICON = E.crown;
const GUILD_ID = /^\d{17,20}$/;

const daysLabel = (ms) => {
  const days = Math.max(1, Math.ceil((Number(ms) - Date.now()) / 86_400_000));
  return `${days} day(s)`;
};

module.exports = {
  category: 'premium', permission: 'Bot Owner',
  examples: {
    enable: '/premium enable [guild_id] [days]', activate: '/premium activate [guild_id] [days]',
    disable: '/premium disable [guild_id]', list: '/premium list [page]',
  },
  data: new SlashCommandBuilder().setName('premium').setDescription('Manage premium guilds (bot owner only).')
    .addSubcommand((s) => s.setName('enable').setDescription('Enable premium for a guild.')
      .addStringOption((o) => o.setName('guild_id').setDescription('Guild ID; defaults to this server.'))
      .addIntegerOption((o) => o.setName('days').setDescription('Duration in days (default 30).').setMinValue(1).setMaxValue(LIMITS.premiumMaxDays)))
    .addSubcommand((s) => s.setName('activate').setDescription('Enable premium for a guild (same as enable).')
      .addStringOption((o) => o.setName('guild_id').setDescription('Guild ID; defaults to this server.'))
      .addIntegerOption((o) => o.setName('days').setDescription('Duration in days (default 30).').setMinValue(1).setMaxValue(LIMITS.premiumMaxDays)))
    .addSubcommand((s) => s.setName('disable').setDescription('Disable premium for a guild.')
      .addStringOption((o) => o.setName('guild_id').setDescription('Guild ID; defaults to this server.')))
    .addSubcommand((s) => s.setName('list').setDescription('List active premium guilds.')
      .addIntegerOption((o) => o.setName('page').setDescription('Page number.').setMinValue(1))),
  async execute(i) {
    if (!perms.isBotOwner(i.user.id)) return fail(i, 'This command is limited to the bot owner.');

    // Acknowledge before any database or logging call. Premium writes and log
    // delivery can be slow enough to miss Discord's 3-second interaction window.
    await i.deferReply({ flags: 64 }).catch(() => {});
    const sub = i.options.getSubcommand();

    // /premium list is global and works even outside a guild.
    if (sub === 'list') {
      const page = Math.max(1, i.options.getInteger('page') || 1);
      const rows = await repo.listPremium();
      const perPage = LIMITS.premiumPerPage;
      const pages = Math.max(1, Math.ceil(rows.length / perPage));
      const p = Math.min(page, pages);
      const slice = rows.slice((p - 1) * perPage, p * perPage);
      const lines = slice.length
        ? slice.map((r) => `${r.enabled_by ? `<@${r.enabled_by}>` : 'Unknown'}  ·  guild \`${r.guild_id}\`  ·  ${daysLabel(r.expires_at)} left`).join('\n')
        : 'No active premium guilds.';
      return i.editReply(ui.edit([
        `### ${ICON} PREMIUM GUILDS`,
        `-# ${rows.length} active  ·  page ${p}/${pages}`,
        'sep',
        lines,
        'sep',
        '-# Premium only unlocks cosmetic guild-member profiles. Security features are never gated.',
      ]));
    }

    const raw = i.options.getString('guild_id');
    const guildId = raw || i.guildId;
    if (!GUILD_ID.test(String(guildId))) return fail(i, 'Provide a valid guild ID.');
    const guild = i.client?.guilds?.cache?.get(String(guildId)) || i.guild;
    if (sub === 'enable' || sub === 'activate') {
      const days = i.options.getInteger('days') || 30;
      const row = await repo.setPremium(guildId, { enabledBy: i.user.id, expiresAt: Date.now() + days * 86_400_000 });
      if (guild && String(guild.id) === String(guildId)) {
        await logging.send(guild, 'config', `${ICON} PREMIUM ENABLED`, [`By: <@${i.user.id}>`, `Expires: <t:${Math.floor(row.expires_at / 1000)}:F>`]).catch(() => {});
      }
      return i.editReply(ui.edit([`${ICON} Premium enabled for \`${guildId}\` until <t:${Math.floor(row.expires_at / 1000)}:F>.`]));
    }

    const existing = await repo.getPremium(guildId);
    if (!existing) return fail(i, 'That guild does not have active premium.');
    await repo.clearPremium(guildId);
    if (guild && String(guild.id) === String(guildId)) {
      await premium.resetProfile(guild).catch(() => {});
      await logging.send(guild, 'config', `${ICON} PREMIUM DISABLED`, [`By: <@${i.user.id}>`]).catch(() => {});
    }
    return i.editReply(ui.edit([`${ICON} Premium disabled for \`${guildId}\`. The guild profile was reset.`]));
  },
};
