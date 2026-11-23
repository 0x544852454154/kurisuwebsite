'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { ACTIONS } = require('../engines/action');

/**
 * Loads every command module (skips files starting with "_" and this file).
 * The /action command declares one subcommand per interaction, so the text
 * pipeline in src/text resolves `!hug`, `!kiss`, ... to /action by itself.
 */
function load() {
  const commands = new Map();
  for (const entry of fs.readdirSync(__dirname, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const file of fs.readdirSync(path.join(__dirname, entry.name))) {
      if (!file.endsWith('.js') || file.startsWith('_')) continue;
      const mod = require(path.join(__dirname, entry.name, file));
      // A module may bundle several top-level commands under `all` (e.g. fun/commands.js).
      const modules = mod.all ? Object.values(mod.all) : [mod];
      for (const cmd of modules) {
        if (!cmd.data || typeof cmd.execute !== 'function') throw new Error(`Invalid command module ${entry.name}/${file}`);
        if (!cmd.category) throw new Error(`Command ${cmd.data.name} has no help category`);
        if (commands.has(cmd.data.name)) throw new Error(`Duplicate command ${cmd.data.name}`);
        commands.set(cmd.data.name, cmd);
      }
    }
  }
  return commands;
}

/** True when `word` is an action subcommand of /action (used by docs/tests). */
const isActionName = (word) => Object.prototype.hasOwnProperty.call(ACTIONS, String(word).toLowerCase());

module.exports = { load, isActionName };
