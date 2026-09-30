import { fileURLToPath } from 'node:url';
import { realpath } from 'node:fs/promises';
import { runProcess } from './process.mjs';

const MAX_INPUT = 128 * 1024;
const MAX_COMMAND = 16 * 1024;
const controller = new AbortController();
process.on('SIGINT', () => controller.abort());
process.on('SIGTERM', () => controller.abort());

function diagnostic(text) {
  return String(text).replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, ' ').slice(0, 400);
}

async function readContext() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > MAX_INPUT) throw new Error('input is too large (128 KiB limit).');
    chunks.push(chunk);
  }
  const fields = Buffer.concat(chunks).toString('utf8').split('\0');
  if (fields.pop() !== '' || fields.length !== 8) throw new Error('invalid fish context framing.');
  const [request, source, cwd, previous, previousCwd, status, pipestatus, fishVersion] = fields;
  if (!request.trim()) throw new Error('the request is empty.');
  if (!['buffer', 'previous'].includes(source)) throw new Error('invalid request source.');
  if (await realpath(cwd) !== await realpath(process.cwd())) {
    throw new Error('working directory changed; press Alt-F again.');
  }
  return {
    request, source, cwd, fish_version: fishVersion,
    previous_submission: source === 'previous' && previous ? {
      command: previous, cwd: previousCwd || null,
      exit_code: /^\d+$/.test(status) ? Number(status) : null,
      pipeline_exit_codes: pipestatus ? pipestatus.split(',').map(Number) : [],
    } : null,
  };
}

async function main() {
  const context = await readContext();
  const seconds = Number(process.env.PI_FIX_TIMEOUT || 120);
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 600) {
    throw new Error('PI_FIX_TIMEOUT must be between 1 and 600 seconds.');
  }
  const args = [
    '--offline', '--print', '--no-session', '--no-approve',
    '--no-extensions', '--extension', fileURLToPath(new URL('./extension.js', import.meta.url)),
    '--no-skills', '--no-prompt-templates', '--no-themes', '--no-context-files',
    '--system-prompt', fileURLToPath(new URL('./prompt.md', import.meta.url)),
    '--tools', 'read,grep,find,ls,shell_probe',
  ];
  if (process.env.PI_FIX_MODEL) args.push('--model', process.env.PI_FIX_MODEL);
  args.push('--', 'Translate the request in the supplied JSON context into a fish command.');
  const env = { ...process.env };
  // Pi's grep tool inherits rg configuration; --pre there can execute programs.
  delete env.RIPGREP_CONFIG_PATH;
  const result = await runProcess('pi', args, {
    input: JSON.stringify(context), env, signal: controller.signal, timeoutMs: seconds * 1000,
  });
  if (result.code !== 0) throw new Error(result.stderr.trim() || `Pi exited ${result.code ?? result.signal}.`);

  let response;
  try { response = JSON.parse(result.stdout); } catch {
    throw new Error('Pi did not return a JSON suggestion; input left unchanged.');
  }
  if (!response || Array.isArray(response) || typeof response !== 'object' ||
      !Object.hasOwn(response, 'command') || typeof response.message !== 'string') {
    throw new Error('Pi returned an invalid suggestion; input left unchanged.');
  }
  if (response.command === null) throw new Error(response.message || 'Pi could not suggest a command.');
  if (typeof response.command !== 'string' || !response.command.trim() ||
      Buffer.byteLength(response.command) > MAX_COMMAND ||
      /[\x00-\x08\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/.test(response.command)) {
    throw new Error('Pi returned an empty, oversized, or unsafe-to-display command.');
  }

  // fish -n parses only: substitutions and commands in the suggestion never run.
  const check = await runProcess('fish', ['--no-config', '--no-execute'], {
    input: response.command, signal: controller.signal, timeoutMs: 3000, maxBytes: 32 * 1024,
  });
  if (check.code !== 0) throw new Error(`suggestion has invalid fish syntax: ${check.stderr}`);
  if (controller.signal.aborted) throw new Error('cancelled');
  if (response.message) process.stderr.write(`Alt-F: ${diagnostic(response.message)}\n`);
  process.stdout.write(`${response.command}\0`);
}

main().catch((error) => {
  process.stderr.write(`Alt-F: ${diagnostic(error.message)}\n`);
  process.exitCode = 1;
});
