'use strict';
// Temporary preview - deleted after use.
process.env.OWNER_IDS = 'botowner';
const db = require('./src/database');
db.open(':memory:');
const repo = require('./src/database/repo');
const d = require('./src/components/dashboard');
const { walk } = require('./tests/helpers');
const ui = require('./src/components/common/ui');

const g = { id: 'gpv', ownerId: 'owner', client: { user: { id: 'kurisu' } }, channels: { cache: new Map() }, name: 'Kurisu Development' };
repo.ensureGuild('gpv');

const show = (label) => {
    const items = d.main(g);
    const text = items.filter((x) => typeof x === 'string').join('\n');
    console.log(`\n┌─ ${label} ${'─'.repeat(30)}\n` + items.map((x) => {
        if (typeof x === 'string') return x;
        if (x.section) return `{section thumbnail=${x.thumbnail ? 'YES' : 'no'}}\n${x.section}`;
        const j = x.toJSON();
        if (j.accessory) return `   <section ${j.accessory.label || '?'}>`;
        return `   [${j.components.map((c) => c.label || c.placeholder).join(' | ')}]`;
    }).join('\n'));
    const nodes = walk(ui.edit(items).components[0].toJSON());
    console.log(`   text ${text.length}/4000 · nodes ${nodes.filter((n) => typeof n.type === 'number' && n.type <= 20).length}/40`);
};

show('default');
repo.setGuild('gpv', 'antinuke_enabled', 0);
show('antinuke off');
