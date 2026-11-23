'use strict';
const { SlashCommandBuilder } = require('discord.js');
const { guard, fail } = require('../_util');
const action = require('../../engines/action');

const sub = (name, desc) => (s) => s.setName(name).setDescription(desc)
  .addUserOption((o) => o.setName('user').setDescription('Who to target (default: nobody)'));

/** `/action hug` and the prefix forms !hug / !kiss / !slap ... share this module. */
module.exports = {
  category: 'action', permission: 'None',
  examples: {
    hug: '/action hug user:@member', kiss: '/action kiss user:@member', slap: '/action slap user:@member',
    pat: '/action pat user:@member', cuddle: '/action cuddle user:@member', poke: '/action poke user:@member',
    dance: '/action dance', cry: '/action cry', laugh: '/action laugh',
    highfive: '/action highfive user:@member', handshake: '/action handshake user:@member',
    sleep: '/action sleep', eat: '/action eat', drink: '/action drink',
  },
  data: (() => {
    const b = new SlashCommandBuilder().setName('action')
      .setDescription('Fun interactions: hug, kiss, slap, pat, cuddle, poke and more.');
    for (const name of action.NAMES) b.addSubcommand(sub(name, `Send a ${name} reaction GIF.`));
    return b;
  })(),
  async execute(i) {
    const err = guard(i, {});
    if (err) return fail(i, err);
    const name = i.options.getSubcommand();
    if (!action.ACTIONS[name]) return fail(i, 'Unknown action.');
    const target = i.options.getUser('user');
    return i.reply(action.render(name, i.user, target, i.client.user.id));
  },
};
