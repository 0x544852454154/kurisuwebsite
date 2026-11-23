import fs from 'fs';
import path from 'path';
import { parse } from 'acorn';

const root = process.cwd();
const repoAsync = new Set('ensureGuild,getGuild,setGuild,getModule,getAllModules,saveModule,getRaid,setRaid,getLockedChannels,saveLockedChannel,clearLockedChannels,activeLockdowns,addJoin,countJoins,recentJoins,pruneJoins,getWhitelist,listWhitelist,roleWhitelist,countWhitelist,addWhitelist,removeWhitelist,addCase,userCases,getCase,countUserCases,pageUserCases,addWarning,countWarnings,pageWarnings,addIncident,countIncidents,countIncidentsSince,lastIncident,pageIncidents,countExecutorIncidents,recentIncidentSince,getLogChannel,allLogChannels,setLogChannel,saveSnapshot,getSnapshot,listSnapshots,deleteSnapshot,addRecovery,saveQuarantine,getQuarantine,clearQuarantine,addNukeWatch,getNukeWatch,listNukeWatch,countNukeWatch,removeNukeWatch,pruneNukeWatch,addNukeRecent,listNukeRecent,clearNukeRecent,pruneNukeRecent,nextId,ensureCounterAtLeast'.split(','));
const permsAsync = new Set(['isTrustedAdmin','canManageSecurity','canGrantLevel','canRemoveEntry','isExempt']);
const objAsync = {
  db: new Set(['ping','open','close','ensureIndexes']),
  text: new Set(['getPrefix','handle']),
  logging: new Set(['send','watchLog','incidentLog']),
  moderation: new Set(['record']),
  recovery: new Set(['snapshotGuild','snapshotChannel','snapshotRole','noteDeletedChannel','noteDeletedRole','restoreChannel','restoreRole','revertRoleUpdate','revertChannelUpdate','revertGuildUpdate','deleteWebhook','removeBot','deleteInvitesBy']),
  raid: new Set(['onJoin','lockdown','unlock','tick','setManualVerification','clearVerification']),
  antinuke: new Set(['handleAuditEntry','handleMessage','handleJoin','trackNuke','evaluate','respond','respondNuke','respondWatch','maybeAlert','watchExecutor','ensureRecentLoaded','refreshSnapshot','mitigate']),
  diagnostics: new Set(['checks','probe','view']),
  dashboard: new Set(['main','route','handle','protection','moduleView','whitelistView','whitelistScopeView','logsView','settings','raidView','render','update','open','edit']),
  help: new Set(['initial','handle','autocomplete','render','view']),
  punish: new Set(['apply','getQuarantineRole','attempt','fetchMember']),
  whitelist: new Set(['addEntry','removeEntry','describe']),
  commands: new Set(['collect']),
};
const fnAsync = new Set(['snapshotAll']);

function isAsyncCallee(callee) {
  if (!callee) return null;
  if (callee.type === 'Identifier' && fnAsync.has(callee.name)) return callee.name;
  if (callee.type !== 'MemberExpression' || callee.computed) return null;
  const prop = callee.property && callee.property.type === 'Identifier' ? callee.property.name : null;
  if (!prop) return null;
  const obj = callee.object;
  if (!obj || obj.type !== 'Identifier') return null;
  if (obj.name === 'repo' && repoAsync.has(prop)) return 'repo.' + prop;
  if (obj.name === 'perms' && permsAsync.has(prop)) return 'perms.' + prop;
  if (objAsync[obj.name] && objAsync[obj.name].has(prop)) return obj.name + '.' + prop;
  return null;
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'data') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

function insideAwaitedPromiseCombinator(node, ancs) {
  for (let i = ancs.length - 1; i >= 1; i--) {
    const a = ancs[i];
    const child = i === ancs.length - 1 ? node : ancs[i + 1];
    if (a.type === 'ArrayExpression' && a.elements.includes(child)) {
      const call = ancs[i - 1];
      if (call && call.type === 'CallExpression' && call.arguments.includes(a)) {
        const cal = call.callee;
        const name = cal && cal.type === 'MemberExpression' && !cal.computed && cal.object.type === 'Identifier' && cal.object.name === 'Promise' && cal.property.type === 'Identifier' ? cal.property.name : null;
        if (name && ['all', 'allSettled', 'race', 'any'].includes(name)) {
          const parent = ancs[i - 2];
          if (parent && parent.type === 'AwaitExpression' && parent.argument === call) return true;
          if (parent && parent.type === 'ReturnStatement' && parent.argument === call) return true;
        }
      }
      continue;
    }
    if (a.type === 'SpreadElement' && a.argument === child) continue;
  }
  return false;
}

function isHandled(node, ancs) {
  const parent = ancs[ancs.length - 1];
  if (!parent) return false;
  if (parent.type === 'AwaitExpression' && parent.argument === node) return true;
  if (parent.type === 'ReturnStatement' && parent.argument === node) return true;
  if (parent.type === 'ArrowFunctionExpression' && parent.body === node && parent.expression) return true;
  if (parent.type === 'MemberExpression' && parent.object === node && parent.property && ['then', 'catch', 'finally'].includes(parent.property.name)) return true;
  if (parent.type === 'UnaryExpression' && parent.operator === 'void' && parent.argument === node) return true;
  if (insideAwaitedPromiseCombinator(node, ancs)) return true;
  return false;
}

function inCondition(node, ancs) {
  for (let i = ancs.length - 1; i >= 0; i--) {
    const a = ancs[i];
    const child = i === ancs.length - 1 ? node : ancs[i + 1];
    if ((a.type === 'IfStatement' || a.type === 'WhileStatement' || a.type === 'DoWhileStatement' || a.type === 'ForStatement' || a.type === 'ConditionalExpression') && a.test === child) return true;
    if (a.type === 'LogicalExpression') return true;
    if (a.type === 'UnaryExpression' && a.operator === '!' && a.argument === child) return true;
    if (a.type === 'SwitchStatement' && a.discriminant === child) return true;
    if (a.type === 'ExpressionStatement') return false;
    if (a.type.endsWith('Statement') && a.type !== 'ReturnStatement' && a.type !== 'ThrowStatement') return false;
  }
  return false;
}

function visit(node, ancs, src, rel, out, condOut) {
  if (!node || typeof node !== 'object' || !node.type) return;
  if (node.type === 'CallExpression') {
    const name = isAsyncCallee(node.callee);
    if (name) {
      const lineText = src.split(/\r?\n/)[node.loc.start.line - 1].trim();
      const handled = isHandled(node, ancs);
      if (!handled) out.push({ file: rel, line: node.loc.start.line, col: node.loc.start.column + 1, name, src: lineText });
      if (inCondition(node, ancs)) {
        const parent = ancs[ancs.length - 1];
        const condHandled = parent && parent.type === 'AwaitExpression' && parent.argument === node;
        if (!condHandled) condOut.push({ file: rel, line: node.loc.start.line, col: node.loc.start.column + 1, name, src: lineText });
      }
    }
  }
  const next = ancs.concat(node);
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue;
    const val = node[key];
    if (Array.isArray(val)) {
      for (const v of val) if (v && typeof v.type === 'string') visit(v, next, src, rel, out, condOut);
    } else if (val && typeof val.type === 'string') {
      visit(val, next, src, rel, out, condOut);
    }
  }
}

const files = [...walkFiles(path.join(root, 'src')), ...walkFiles(path.join(root, 'scripts')), ...walkFiles(path.join(root, 'tests'))]
  .filter((f) => !/scripts[\\\/]find-unawaited\.js$/.test(f) && !/scripts[\\\/]find-unawaited-ast\.js$/.test(f));

const unawaited = [];
const condHits = [];
const parseErrors = [];
for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const src = fs.readFileSync(file, 'utf8');
  let ast;
  try {
    ast = parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true, allowHashBang: true, allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true });
  } catch (e) {
    try {
      ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true, allowHashBang: true, allowAwaitOutsideFunction: true });
    } catch (e2) {
      parseErrors.push(rel + ': ' + e2.message);
      continue;
    }
  }
  visit(ast, [], src, rel, unawaited, condHits);
}

const label = process.argv[2] || 'RUN';
console.log('=== AST AUDIT (' + label + ') ===');
console.log('=== PARSE ERRORS ===');
for (const e of parseErrors) console.log(e);
console.log('PARSE_ERRORS_COUNT ' + parseErrors.length);
console.log('');
console.log('=== UNAWAITED ASYNC CALLS ===');
for (const h of unawaited) console.log(h.file + ':' + h.line + ':' + h.col + ': ' + h.name + ' :: ' + h.src);
console.log('UNAWAITED_COUNT ' + unawaited.length);
console.log('');
console.log('=== ASYNC CALLS IN CONDITIONS/BOOLEAN OPS (SECURITY CRITICAL) ===');
for (const h of condHits) console.log(h.file + ':' + h.line + ':' + h.col + ': ' + h.name + ' :: ' + h.src);
console.log('CONDITION_COUNT ' + condHits.length);
console.log('');
const srcScriptsUn = unawaited.filter(h => h.file.startsWith('src/') || h.file.startsWith('scripts/'));
const srcScriptsCond = condHits.filter(h => h.file.startsWith('src/') || h.file.startsWith('scripts/'));
console.log('SRC_SCRIPTS_UNAWAITED_COUNT ' + srcScriptsUn.length);
console.log('SRC_SCRIPTS_CONDITION_COUNT ' + srcScriptsCond.length);
