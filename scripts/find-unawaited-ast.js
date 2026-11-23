import fs from 'fs';
import path from 'path';
import { parse } from 'acorn';

const root = process.cwd();
const repoAsync = new Set(['ensureGuild','getGuild','setGuild','getModule','getAllModules','saveModule','getRaid','setRaid','getLockedChannels','saveLockedChannel','clearLockedChannels','activeLockdowns','addJoin','countJoins','recentJoins','pruneJoins','getWhitelist','listWhitelist','roleWhitelist','countWhitelist','addWhitelist','removeWhitelist','addCase','userCases','getCase','countUserCases','pageUserCases','addWarning','countWarnings','pageWarnings','addIncident','countIncidents','countIncidentsSince','lastIncident','pageIncidents','countExecutorIncidents','recentIncidentSince','getLogChannel','allLogChannels','setLogChannel','saveSnapshot','getSnapshot','listSnapshots','deleteSnapshot','addRecovery','saveQuarantine','getQuarantine','clearQuarantine','addNukeWatch','getNukeWatch','listNukeWatch','countNukeWatch','removeNukeWatch','pruneNukeWatch','addNukeRecent','listNukeRecent','clearNukeRecent','pruneNukeRecent','nextId','ensureCounterAtLeast']);
const permsAsync = new Set(['isTrustedAdmin','canManageSecurity','canGrantLevel','canRemoveEntry','isExempt']);
const objAsync = {
  db: new Set(['ping','open','close','ensureIndexes']),
  text: new Set(['getPrefix']),
  logging: new Set(['send','watchLog','incidentLog']),
  moderation: new Set(['record']),
  recovery: new Set(['snapshotGuild','snapshotChannel','snapshotRole','noteDeletedChannel','noteDeletedRole','restoreChannel','restoreRole','revertRoleUpdate','revertChannelUpdate','revertGuildUpdate','deleteWebhook','removeBot','deleteInvitesBy']),
  raid: new Set(['onJoin','lockdown','unlock','tick','setManualVerification','clearVerification']),
  antinuke: new Set(['handleAuditEntry','handleMessage','handleJoin','trackNuke','evaluate','respond','respondNuke','respondWatch','maybeAlert','watchExecutor','ensureRecentLoaded','refreshSnapshot','mitigate']),
  diagnostics: new Set(['checks','probe','view']),
  dashboard: new Set(['main','route','handle','protection','moduleView','whitelistView','whitelistScopeView','logsView','settings','raidView']),
  help: new Set(['initial','handle','autocomplete']),
  punish: new Set(['apply','getQuarantineRole','attempt','fetchMember']),
  whitelist: new Set(['addEntry','removeEntry','describe']),
  commands: new Set(['collect']),
};

function isAsyncCallee(callee) {
  if (!callee || callee.type !== 'MemberExpression' || callee.computed) return null;
  const prop = callee.property && callee.property.type === 'Identifier' ? callee.property.name : null;
  if (!prop) return null;
  const obj = callee.object;
  if (obj.type === 'Identifier') {
    if (obj.name === 'repo' && repoAsync.has(prop)) return `repo.${prop}`;
    if (obj.name === 'perms' && permsAsync.has(prop)) return `perms.${prop}`;
    if (objAsync[obj.name] && objAsync[obj.name].has(prop)) return `${obj.name}.${prop}`;
  }
  return null;
}

function walkFiles(dir, out=[]) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir,{withFileTypes:true})) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'data') continue;
    const p = path.join(dir,e.name);
    if (e.isDirectory()) walkFiles(p,out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const files = [...walkFiles(path.join(root,'src')), ...walkFiles(path.join(root,'scripts')), ...walkFiles(path.join(root,'tests'))];
const unawaited = [];
const condHits = [];
let parseErrors = [];

function visit(node, ancs, src, rel) {
  if (!node || typeof node !== 'object' || !node.type) return;
  if (node.type === 'CallExpression') {
    const name = isAsyncCallee(node.callee);
    if (name) {
      const parent = ancs[ancs.length-1];
      let handled = false;
      if (parent && parent.type === 'AwaitExpression' && parent.argument === node) handled = true;
      if (parent && parent.type === 'ReturnStatement' && parent.argument === node) handled = true;
      if (parent && parent.type === 'ArrowFunctionExpression' && parent.body === node && parent.expression) handled = true;
      if (parent && parent.type === 'MemberExpression' && parent.object === node && parent.property && ['then','catch','finally'].includes(parent.property.name)) handled = true;
      if (parent && parent.type === 'UnaryExpression' && parent.operator === 'void' && parent.argument === node) handled = true;
      const lineText = src.split('\n')[node.loc.start.line-1].trim();
      if (!handled) unawaited.push({ file: rel, line: node.loc.start.line, col: node.loc.start.column+1, name, src: lineText });
      // condition/boolean context
      let inCond = false;
      for (let i = ancs.length-1; i >= 0; i--) {
        const a = ancs[i], child = i === ancs.length-1 ? node : ancs[i+1];
        if ((a.type === 'IfStatement' || a.type === 'WhileStatement' || a.type === 'DoWhileStatement' || a.type === 'ForStatement' || a.type === 'ConditionalExpression') && a.test === child) { inCond = true; break; }
        if (a.type === 'LogicalExpression') { inCond = true; break; }
        if (a.type === 'UnaryExpression' && a.operator === '!' && a.argument === child) { inCond = true; break; }
        if (a.type === 'SwitchStatement' && a.discriminant === child) { inCond = true; break; }
        if (a.type === 'ExpressionStatement') break;
        if (a.type === 'VariableDeclarator' || a.type === 'AssignmentExpression' || a.type === 'Property' || a.type === 'ArrayExpression' || a.type === 'CallExpression' || a.type === 'AwaitExpression' || a.type === 'ReturnStatement' || a.type === 'ArrowFunctionExpression' || a.type === 'SequenceExpression' || a.type === 'TemplateLiteral' || a.type === 'SpreadElement' || a.type === 'ObjectExpression') continue;
        // other statement types stop climb
        if (a.type.endsWith('Statement')) break;
      }
      if (inCond) {
        const condHandled = parent && parent.type === 'AwaitExpression' && parent.argument === node;
        if (!condHandled) condHits.push({ file: rel, line: node.loc.start.line, col: node.loc.start.column+1, name, src: lineText });
      }
    }
  }
  const next = ancs.concat(node);
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue;
    const val = node[key];
    if (Array.isArray(val)) {
      for (const v of val) if (v && typeof v.type === 'string') visit(v, next, src, rel);
    } else if (val && typeof val.type === 'string') {
      visit(val, next, src, rel);
    }
  }
}

for (const file of files) {
  const rel = path.relative(root,file).replace(/\\/g,'/');
  const src = fs.readFileSync(file,'utf8');
  let ast;
  try {
    ast = parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowHashBang: true, allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true });
  } catch (e) {
    try {
      ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true, allowHashBang: true, allowAwaitOutsideFunction: true });
    } catch (e2) {
      parseErrors.push(`${rel}: ${e2.message}`);
      continue;
    }
  }
  visit(ast, [], src, rel);
}

console.log('=== PARSE ERRORS ===');
for (const e of parseErrors) console.log(e);
console.log('PARSE_ERRORS_COUNT', parseErrors.length);

console.log('\n=== UNAWAITED ASYNC CALLS ===');
for (const h of unawaited) console.log(`${h.file}:${h.line}:${h.col}: ${h.name} :: ${h.src}`);
console.log('UNAWAITED_COUNT', unawaited.length);

console.log('\n=== ASYNC CALLS IN CONDITIONS/BOOLEAN OPS (SECURITY CRITICAL) ===');
for (const h of condHits) console.log(`${h.file}:${h.line}:${h.col}: ${h.name} :: ${h.src}`);
console.log('CONDITION_COUNT', condHits.length);
