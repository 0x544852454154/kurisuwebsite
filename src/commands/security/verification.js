'use strict';
const { SlashCommandBuilder, PermissionFlagsBits: P, ChannelType } = require('discord.js');
const { guard, fail } = require('../_util');
const perms = require('../../permissions');
const repo = require('../../database/repo');
const raid = require('../../engines/raid');
const verification = require('../../components/verification');
const ui = require('../../components/common/ui');

const { E } = ui;

const stateLine = (cfg) => (cfg.enabled ? 'on' : 'off');

module.exports = {
  category: 'verification', permission: 'Server Owner or Trusted Administrator',
  examples: {
    panel: '/verification panel #verify [role]', config: '/verification config', remove: '/verification remove',
    enable: '/verification enable', disable: '/verification disable', status: '/verification status',
  },
  data: new SlashCommandBuilder().setName('verification').setDescription('Join verification and the verification panel.')
    .setDefaultMemberPermissions(P.Administrator)
    .addSubcommand((s) => s.setName('panel').setDescription('Post or replace the public verification panel.')
      .addChannelOption((o) => o.setName('channel').setDescription('Channel for the verification panel.').setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addRoleOption((o) => o.setName('role').setDescription('Role to grant after verification (default: Verified).').setRequired(false)))
    .addSubcommand((s) => s.setName('config').setDescription('Show the verification configuration.'))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove the verification panel and disable verification.'))
    .addSubcommand((s) => s.setName('enable').setDescription('Raise the server verification level.'))
    .addSubcommand((s) => s.setName('disable').setDescription('Restore the previous verification level.'))
    .addSubcommand((s) => s.setName('status').setDescription('Show verification mode status.')),
  async execute(i) {
    const err = guard(i, { bot: [P.ManageGuild, P.ManageRoles] });
    if (err) return fail(i, err);
    if (!(await perms.canManageSecurity(i.guild, i.member))) return fail(i, 'Only the server owner, bot owner or a Trusted Administrator can use this.');
    const sub = i.options.getSubcommand();

    if (sub === 'status') {
      const c = await repo.getRaid(i.guild.id);
      return i.reply(ui.message([`${E.modernVerify} Verification mode is **${c.verification_active ? 'on' : 'off'}**.`], { ephemeral: true }));
    }

    if (sub === 'config') {
      const cfg = await repo.getVerification(i.guild.id);
      const verified = await repo.countVerified(i.guild.id);
      const rc = await repo.getRaid(i.guild.id);
      return i.reply(ui.message([
        `### ${E.modernVerify} VERIFICATION CONFIG`,
        `Panel: **${stateLine(cfg)}**${cfg.panel_channel_id ? `  ·  <#${cfg.panel_channel_id}>` : '  ·  not posted'}`,
        `Role: ${cfg.role_id ? `<@&${cfg.role_id}>` : 'Not set'}`,
        `Verified members: **${verified}**`,
        `Account-age gate: ${rc.min_account_age_days ? `**${rc.min_account_age_days} day(s)**` : 'Off'}`,
        'sep',
        '-# /verification panel <channel> [role]  ·  /verification remove',
      ], { ephemeral: true }));
    }

    if (sub === 'remove') {
      await i.deferReply({ flags: 64 }).catch(() => {});
      const cfg = await verification.removePanel(i.guild);
      const line = cfg.panel_channel_id ? 'Verification panel removed and verification disabled.' : 'Verification was not posted; it is now disabled.';
      return i.editReply(ui.edit([`${E.smallRedDot} ${line}`]));
    }

    if (sub === 'panel') {
      const channel = i.options.getChannel('channel');
      if (!channel) return fail(i, 'Choose a text channel for the panel.');
      if (!channel.isTextBased?.()) return fail(i, 'The panel must be posted in a text channel.');
      const me = i.guild.members.me;
      if (!channel.permissionsFor(me)?.has([P.ViewChannel, P.SendMessages])) return fail(i, 'I cannot send messages in that channel.');
      const cfg = await repo.getVerification(i.guild.id);
      const requested = i.options.getRole('role');
      if (requested) {
        const check = await verification.resolveRole(i.guild, requested.id);
        if (!check.ok) return fail(i, check.error);
      }
      await i.deferReply({ flags: 64 }).catch(() => {});
      let resolved = await verification.resolveRole(i.guild, requested?.id || cfg.role_id, { create: !requested });
      if (!resolved.ok) return fail(i, resolved.error);
      await verification.postPanel(i.guild, channel, resolved.role);
      return i.editReply(ui.edit([
        `${E.verified} Verification panel posted in <#${channel.id}>  ·  role <@&${resolved.role.id}>`,
        '-# The button is public and stable: kv:verify',
      ]));
    }

    await i.deferReply({ flags: 64 }).catch(() => {});
    const ok = await raid.setManualVerification(i.guild, sub === 'enable');
    return ok ? i.editReply(ui.edit([`${E.modernVerify} Verification mode ${sub === 'enable' ? 'enabled' : 'disabled'}.`])) : fail(i, 'Could not change the verification level.');
  },
};
