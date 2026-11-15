'use strict';
const { SlashCommandBuilder, PermissionFlagsBits: P, ChannelType } = require('discord.js');
const { guard, fail } = require('../_util');
const perms = require('../../permissions');
const repo = require('../../database/repo');
const tickets = require('../../components/tickets');
const ui = require('../../components/common/ui');
const { LIMITS } = require('../../config/settings');

const { E } = ui;
const ICON = E.ticket || E.staff;

const managementError = 'Only the server owner, bot owner or a Trusted Administrator can manage tickets.';

module.exports = {
  category: 'tickets', permission: 'Server Owner or Trusted Administrator',
  examples: {
    panel: '/ticket panel #support', setup: '/ticket setup category:#tickets log:#ticket-logs staff_role:@Staff max_open:3 transcripts:false',
    close: '/ticket close', add: '/ticket add @user', remove: '/ticket remove @user', claim: '/ticket claim', list: '/ticket list',
  },
  data: new SlashCommandBuilder().setName('ticket').setDescription('Private support tickets.')
    .setDefaultMemberPermissions(P.Administrator)
    .addSubcommand((s) => s.setName('panel').setDescription('Post or replace the public ticket panel.')
      .addChannelOption((o) => o.setName('channel').setDescription('Channel for the ticket panel.').setRequired(true)
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand((s) => s.setName('setup').setDescription('Configure ticket category, logs, staff and limits.')
      .addChannelOption((o) => o.setName('category').setDescription('Category for new ticket channels.').addChannelTypes(ChannelType.GuildCategory))
      .addChannelOption((o) => o.setName('log_channel').setDescription('Ticket log channel.').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement))
      .addRoleOption((o) => o.setName('staff_role').setDescription('Role that can claim and manage tickets.'))
      .addIntegerOption((o) => o.setName('max_open').setDescription('Open tickets per member (1-10).').setMinValue(1).setMaxValue(10))
      .addBooleanOption((o) => o.setName('transcripts').setDescription('Attach a transcript to the ticket log when closing.')))
    .addSubcommand((s) => s.setName('close').setDescription('Close the current ticket, or a ticket by number.')
      .addIntegerOption((o) => o.setName('ticket').setDescription('Ticket number when run outside its channel.').setMinValue(1).setMaxValue(999999)))
    .addSubcommand((s) => s.setName('add').setDescription('Add a member to the current ticket.')
      .addUserOption((o) => o.setName('user').setDescription('Member to add.').setRequired(true)))
    .addSubcommand((s) => s.setName('remove').setDescription('Remove a member from the current ticket.')
      .addUserOption((o) => o.setName('user').setDescription('Member to remove.').setRequired(true)))
    .addSubcommand((s) => s.setName('claim').setDescription('Claim the current ticket.'))
    .addSubcommand((s) => s.setName('list').setDescription('List open tickets.')
      .addIntegerOption((o) => o.setName('page').setDescription('Page number.').setMinValue(1))),
  async execute(i) {
    const err = guard(i, { bot: [P.ManageChannels, P.ManageRoles] });
    if (err) return fail(i, err);
    const sub = i.options.getSubcommand();
    const guild = i.guild;
    const canManage = await perms.canManageSecurity(guild, i.member);

    if (sub === 'panel') {
      if (!canManage) return fail(i, managementError);
      const channel = i.options.getChannel('channel');
      if (!channel?.isTextBased?.()) return fail(i, 'Choose a text channel for the ticket panel.');
      if (!channel.permissionsFor(guild.members.me)?.has([P.ViewChannel, P.SendMessages])) return fail(i, 'I cannot send messages in that channel.');
      await i.deferReply({ flags: 64 }).catch(() => {});
      await tickets.postPanel(guild, channel);
      return i.editReply(ui.edit([
        `${ICON} Ticket panel posted in <#${channel.id}>`,
        '-# Manual channel deletion cannot be recovered; ticket records remain.',
      ]));
    }

    if (sub === 'setup') {
      if (!canManage) return fail(i, managementError);
      const cfg = await repo.getTicketConfig(guild.id);
      const category = i.options.getChannel('category');
      const logChannel = i.options.getChannel('log_channel');
      const staffRole = i.options.getRole('staff_role');
      const maxOpen = i.options.getInteger('max_open');
      const transcripts = i.options.getBoolean('transcripts');
      if (category && category.type !== ChannelType.GuildCategory) return fail(i, 'The category must be a server category.');
      if (logChannel && !logChannel.isTextBased?.()) return fail(i, 'The log channel must be a text channel.');
      if (logChannel && !logChannel.permissionsFor(guild.members.me)?.has([P.ViewChannel, P.SendMessages])) return fail(i, 'I cannot send messages in the log channel.');
      if (staffRole && staffRole.id === guild.id) return fail(i, 'The @everyone role cannot be the staff role.');
      const effectiveLog = logChannel?.id || cfg.log_channel_id;
      if (transcripts === true && !effectiveLog) return fail(i, 'Set a ticket log channel before enabling transcripts.');
      const patch = {};
      if (category) patch.category_id = category.id;
      if (logChannel) patch.log_channel_id = logChannel.id;
      if (staffRole) patch.staff_role_id = staffRole.id;
      if (maxOpen !== null) patch.max_open = maxOpen;
      if (transcripts !== null) patch.transcripts = transcripts ? 1 : 0;
      if (Object.keys(patch).length) await repo.setTicketConfig(guild.id, patch);
      const now = await repo.getTicketConfig(guild.id);
      const open = await repo.countOpenTickets(guild.id);
      return i.reply(ui.message([
        `### ${ICON} TICKET SETUP`,
        `Category: ${now.category_id ? `<#${now.category_id}>` : 'Not set'}`,
        `Log channel: ${now.log_channel_id ? `<#${now.log_channel_id}>` : 'Not set'}`,
        `Staff role: ${now.staff_role_id ? `<@&${now.staff_role_id}>` : 'Not set (managers only)'}`,
        `Max open per member: **${now.max_open}**  ·  Open tickets: **${open}**`,
        `Transcripts: **${now.transcripts ? 'on' : 'off'}**`,
        'sep',
        `-# Panel: ${now.panel_channel_id ? `<#${now.panel_channel_id}>` : 'run /ticket panel <channel>'}`,
        '-# Transcripts are only sent to the ticket log and are never stored in the database.',
        '-# If a ticket channel is deleted manually, its messages cannot be recovered; the ticket record remains.',
      ], { ephemeral: true }));
    }

    if (sub === 'list') {
      const cfg = await repo.getTicketConfig(guild.id);
      if (!canManage && !await tickets.isStaff(guild, i.member, cfg)) return fail(i, 'Only ticket staff can list tickets.');
      const page = Math.max(1, i.options.getInteger('page') || 1);
      const perPage = LIMITS.ticketsPerPage;
      const all = await repo.listTickets(guild.id, { state: 'open', limit: 1000 });
      const pages = Math.max(1, Math.ceil(all.length / perPage));
      const p = Math.min(page, pages);
      const rows = all.slice((p - 1) * perPage, p * perPage);
      const lines = rows.length ? rows.map((t) => `**#${t.ticket_number}** <#${t.channel_id}>  ·  <@${t.owner_id}>${t.claimed_by ? `  ·  <@${t.claimed_by}>` : ''}`).join('\n') : 'No open tickets.';
      return i.reply(ui.message([
        `### ${ICON} OPEN TICKETS`,
        `-# ${all.length} open  ·  page ${p}/${pages}`,
        'sep',
        lines,
      ], { ephemeral: true }));
    }

    if (sub === 'close') {
      const cfg = await repo.getTicketConfig(guild.id);
      const number = i.options.getInteger('ticket');
      let ticket = number ? await repo.getTicket(guild.id, number) : await repo.getTicketByChannel(guild.id, i.channelId);
      if (!ticket) return fail(i, 'That ticket does not exist. Run this inside a ticket channel or provide its number.');
      if (number && ticket.channel_id !== i.channelId) {
        const staff = await tickets.isStaff(guild, i.member, cfg);
        if (!staff) return fail(i, 'Only staff can close a ticket outside its channel.');
      }
      const staff = await tickets.isStaff(guild, i.member, cfg);
      if (i.user.id !== ticket.owner_id && !staff) return fail(i, 'Only the ticket owner or staff can close this ticket.');
      if (ticket.state !== 'open') return fail(i, 'This ticket is already closed.');
      return i.reply(ui.message([
        `${E.timeoutClock} Close ticket **#${ticket.ticket_number}**?`,
        '-# The channel is removed after a short delay. This cannot be undone.',
        ui.buttons(ui.btn(`kt:closeok:${ticket.ticket_number}`, 'Confirm Close', { emoji: 'banHammer' }), ui.btn(`kt:cancel:${ticket.ticket_number}`, 'Keep Open')),
      ], { ephemeral: true }));
    }

    if (sub === 'claim') {
      const cfg = await repo.getTicketConfig(guild.id);
      const ticket = await repo.getTicketByChannel(guild.id, i.channelId);
      if (!ticket) return fail(i, 'Run this inside a ticket channel.');
      if (!await tickets.isStaff(guild, i.member, cfg)) return fail(i, 'Only staff can claim tickets.');
      return tickets.claimTicket(i, ticket);
    }

    if (sub === 'add' || sub === 'remove') {
      const cfg = await repo.getTicketConfig(guild.id);
      const ticket = await repo.getTicketByChannel(guild.id, i.channelId);
      if (!ticket) return fail(i, 'Run this inside a ticket channel.');
      if (!await tickets.isStaff(guild, i.member, cfg)) return fail(i, 'Only staff can manage ticket members.');
      const user = i.options.getUser('user');
      if (!user) return fail(i, 'Choose a member.');
      const channel = i.channel || guild.channels.cache.get(ticket.channel_id);
      if (!channel) return fail(i, 'The ticket channel no longer exists.');
      await i.deferReply({ flags: 64 }).catch(() => {});
      if (sub === 'add') {
        await channel.permissionOverwrites.edit(user.id, {
          ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true,
        }, { reason: `Kurisu tickets: ${i.user.tag || i.user.id} added a member` });
        return i.editReply(ui.edit([`${E.staff} <@${user.id}> added to ticket **#${ticket.ticket_number}**.`]));
      }
      await channel.permissionOverwrites.edit(user.id, { ViewChannel: false }, { reason: `Kurisu tickets: ${i.user.tag || i.user.id} removed a member` });
      return i.editReply(ui.edit([`${E.smallRedDot} <@${user.id}> removed from ticket **#${ticket.ticket_number}**.`]));
    }

    return fail(i, 'Unknown ticket subcommand.');
  },
};
