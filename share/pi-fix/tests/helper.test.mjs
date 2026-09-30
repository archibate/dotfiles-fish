import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { access, chmod, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcess } from '../process.mjs';
import { probe } from '../probe.mjs';
import extension from '../extension.js';

const root = await mkdtemp(join(tmpdir(), 'pi-fix-test-'));
after(() => rm(root, { recursive: true, force: true }));
const helper = fileURLToPath(new URL('../helper.mjs', import.meta.url));
const pi = join(root, 'pi');
await writeFile(pi, `#!${process.execPath}
import fs from 'node:fs';
let input = '';
for await (const chunk of process.stdin) input += chunk;
if (process.env.TEST_CAPTURE) fs.writeFileSync(process.env.TEST_CAPTURE, JSON.stringify({ args: process.argv.slice(2), input: JSON.parse(input), rgConfig: process.env.RIPGREP_CONFIG_PATH ?? null }));
if (process.env.TEST_DELAY) await new Promise(resolve => setTimeout(resolve, 10000));
if (process.env.TEST_EXIT) { console.error('fixture startup failure'); process.exit(1); }
process.stdout.write(process.env.TEST_RESPONSE);
`);
await chmod(pi, 0o700);

async function suggest(response, { source = 'buffer', request = 'find keyword', env = {}, cwd = root } = {}) {
  const fields = [request, source, cwd, 'false | true', root, '0', '1,0', '4.8.1'];
  return runProcess(process.execPath, [helper], {
    cwd, input: fields.join('\0') + '\0', timeoutMs: 5000,
    env: { ...process.env, PATH: `${root}:${process.env.PATH}`, TEST_RESPONSE: response, ...env },
  });
}

test('returns one multiline NUL-terminated command and read-only invocation', async () => {
  const capture = join(root, 'context.json');
  const command = "printf '%s\\n' hello\nprintf '%s\\n' world";
  const result = await suggest(JSON.stringify({ command, message: 'Suggested command.' }), {
    request: 'concat these videos: ls *.mkv', env: { TEST_CAPTURE: capture, RIPGREP_CONFIG_PATH: '/unsafe/rg-config' },
  });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, command + '\0');
  const recorded = JSON.parse(await readFile(capture, 'utf8'));
  assert.equal(recorded.input.request, 'concat these videos: ls *.mkv');
  assert.equal(recorded.input.source, 'buffer');
  assert.equal(recorded.rgConfig, null);
  assert.equal(recorded.input.previous_submission, null, 'do not send unrelated previous commands');
  for (const flag of ['--no-extensions', '--no-session', '--no-approve', '--no-context-files', '--no-skills']) {
    assert.ok(recorded.args.includes(flag));
  }
  assert.equal(recorded.args[recorded.args.indexOf('--tools') + 1], 'read,grep,find,ls,shell_probe');
});

test('previous command works regardless of success, and shell-looking text remains data', async () => {
  const marker = join(root, 'request-executed');
  const request = `find all files that contains \`keyword\`; touch ${marker}`;
  const capture = join(root, 'previous.json');
  const result = await suggest(JSON.stringify({ command: 'true', message: '' }), {
    source: 'previous', request, env: { TEST_CAPTURE: capture },
  });
  assert.equal(result.code, 0);
  const context = JSON.parse(await readFile(capture, 'utf8')).input;
  assert.equal(context.source, 'previous');
  assert.equal(context.request, request);
  assert.equal(context.previous_submission.exit_code, 0);
  assert.deepEqual(context.previous_submission.pipeline_exit_codes, [1, 0]);
  await assert.rejects(access(marker));
});

test('syntax validation never executes a suggested command or substitution', async () => {
  const marker = join(root, 'suggestion-executed');
  const result = await suggest(JSON.stringify({ command: `echo (touch '${marker}')`, message: '' }));
  assert.equal(result.code, 0);
  await assert.rejects(access(marker));
});

test('rejects invalid JSON, invalid syntax, controls, oversize, and clarification', async () => {
  for (const response of [
    '```fish\necho hello\n```',
    JSON.stringify({ command: 'if true', message: '' }),
    JSON.stringify({ command: 'echo \x1b[31m', message: '' }),
    JSON.stringify({ command: 'x'.repeat(17 * 1024), message: '' }),
    JSON.stringify({ command: null, message: 'Which video order?' }),
  ]) {
    const result = await suggest(response);
    assert.equal(result.code, 1, response.slice(0, 60));
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Alt-F:/);
  }
});

test('startup failure and timeout emit no replacement', async () => {
  const failure = await suggest('{}', { env: { TEST_EXIT: '1' } });
  assert.equal(failure.code, 1);
  assert.equal(failure.stdout, '');
  assert.match(failure.stderr, /startup failure/);
  const timeout = await suggest('{}', { env: { TEST_DELAY: '1', PI_FIX_TIMEOUT: '1' } });
  assert.equal(timeout.code, 1);
  assert.equal(timeout.stdout, '');
  assert.match(timeout.stderr, /timed out/);
});

test('logical working directories through symlinks are accepted', async () => {
  const link = join(root, 'logical');
  await symlink(root, link);
  const result = await suggest(JSON.stringify({ command: 'true', message: '' }), { cwd: link });
  assert.equal(result.code, 0);
});

test('restricted probes reject arbitrary commands and locate without executing', async () => {
  assert.equal(await probe({ operation: 'executable_lookup', name: 'node' }, root), process.execPath);
  for (const params of [
    { operation: 'bash', name: 'touch marker' },
    { operation: 'executable_lookup', name: 'node; touch marker' },
    { operation: 'executable_lookup', name: '../node' },
    { operation: 'git_status', name: '--anything' },
  ]) await assert.rejects(probe(params, root));
});

test('Git probes do not refresh index or launch fsmonitor/external diff', async () => {
  const repo = await mkdtemp(join(root, 'repo-'));
  const git = (args) => runProcess('/usr/bin/git', args, { cwd: repo });
  assert.equal((await git(['init', '--quiet'])).code, 0);
  await writeFile(join(repo, 'file.txt'), 'before\n');
  await git(['add', 'file.txt']);
  const index = await readFile(join(repo, '.git/index'));
  const marker = join(repo, 'external-ran');
  const script = join(repo, 'hostile.sh');
  await writeFile(script, `#!/bin/sh\ntouch '${marker}'\n`);
  await chmod(script, 0o700);
  await git(['config', 'core.fsmonitor', script]);
  await git(['config', 'diff.external', script]);
  await writeFile(join(repo, 'file.txt'), 'after\n');
  assert.match(await probe({ operation: 'git_status' }, repo), /file.txt/);
  assert.match(await probe({ operation: 'git_diff' }, repo), /after/);
  assert.deepEqual(await readFile(join(repo, '.git/index')), index);
  await assert.rejects(access(marker));
});

test('Git probes refuse clean filters before they can execute', async () => {
  const repo = await mkdtemp(join(root, 'filtered-repo-'));
  const git = (args) => runProcess('/usr/bin/git', args, { cwd: repo });
  await git(['init', '--quiet']);
  await writeFile(join(repo, '.gitattributes'), '*.txt filter=external\n');
  await writeFile(join(repo, 'file.txt'), 'before\n');
  await git(['add', '.gitattributes', 'file.txt']);
  const marker = join(repo, 'filter-ran');
  const script = join(repo, 'filter.sh');
  await writeFile(script, `#!/bin/sh\ntouch '${marker}'\nexec /usr/bin/cat\n`);
  await chmod(script, 0o700);
  await git(['config', 'filter.external.clean', script]);
  await writeFile(join(repo, 'file.txt'), 'after, a different size\n');
  for (const operation of ['git_status', 'git_diff']) {
    await assert.rejects(probe({ operation }, repo), /clean\/process filters/);
  }
  await assert.rejects(access(marker));
});

test('extension fixes active tool set and blocks execution tools', () => {
  const events = {};
  let tool;
  let active;
  extension({
    registerTool(value) { tool = value; },
    on(name, handler) { events[name] = handler; },
    setActiveTools(value) { active = value; },
  });
  events.session_start();
  assert.deepEqual(active, ['read', 'grep', 'find', 'ls', 'shell_probe']);
  assert.equal(tool.name, 'shell_probe');
  assert.equal(events.tool_call({ toolName: 'bash' }).block, true);
  assert.equal(events.tool_call({ toolName: 'write' }).block, true);
  assert.equal(events.tool_call({ toolName: 'read' }), undefined);
});

test('cancellation kills descendants that ignore SIGTERM', async () => {
  const pidFile = join(root, 'descendant.pid');
  const controller = new AbortController();
  const descendant = `
    process.on('SIGTERM', () => {});
    require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
    setInterval(() => {}, 1000);
  `;
  const code = `
    require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], {stdio: 'inherit'});
    setInterval(() => {}, 1000);
  `;
  const pending = runProcess(process.execPath, ['-e', code], { signal: controller.signal });
  // Attach rejection handling before aborting.
  const rejected = assert.rejects(pending, /cancelled/);
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    try { await access(pidFile); break; } catch { await new Promise(resolve => setTimeout(resolve, 10)); }
  }
  const pid = Number(await readFile(pidFile, 'utf8'));
  controller.abort();
  await rejected;
  try {
    const status = await readFile(`/proc/${pid}/status`, 'utf8');
    assert.match(status, /State:\\s+Z/, 'descendant must be dead, even if awaiting reaping');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
});

test('process runner bounds output and supports cancellation', async () => {
  await assert.rejects(runProcess(process.execPath, ['-e', 'process.stdout.write("x".repeat(1024))'], {
    maxBytes: 128,
  }), /output exceeded/);
  const controller = new AbortController();
  const pending = runProcess(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], {
    signal: controller.signal, detached: false,
  });
  controller.abort();
  await assert.rejects(pending, /cancelled/);
});
