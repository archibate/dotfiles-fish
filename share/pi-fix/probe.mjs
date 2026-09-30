import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, resolve } from 'node:path';
import { runProcess } from './process.mjs';

export async function probe(params, cwd, signal) {
  if (signal?.aborted) throw new Error('cancelled');
  if (params.operation === 'executable_lookup') {
    if (typeof params.name !== 'string' || !/^[a-zA-Z0-9_.+-]{1,128}$/.test(params.name)) {
      throw new Error('Supply a bare executable name, such as ffmpeg; no paths or shell syntax.');
    }
    for (const directory of (process.env.PATH || '').split(delimiter)) {
      const path = resolve(cwd, directory || '.', params.name);
      try {
        await access(path, constants.X_OK);
        if ((await stat(path)).isFile()) return path;
      } catch { /* Try the next PATH entry. */ }
    }
    return `${params.name}: not found on PATH`;
  }
  const operations = {
    git_status: ['status', '--short', '--untracked-files=normal', '--ignore-submodules=all'],
    git_diff: ['diff', '--no-ext-diff', '--no-textconv', '--ignore-submodules=all', '--'],
  };
  if (!Object.hasOwn(operations, params.operation)) throw new Error('Unknown probe operation.');
  if (params.name !== undefined) throw new Error('name is only used by executable_lookup.');

  // Use system Git, not a repository-supplied executable. Disable optional writes
  // and config features that can launch subprocesses during these fixed operations.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  env.GIT_CONFIG_NOSYSTEM = '1';
  env.GIT_CONFIG_GLOBAL = '/dev/null';
  env.GIT_TERMINAL_PROMPT = '0';
  const prefix = [
    '--no-pager', '--no-optional-locks',
    '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false',
    '-c', 'core.hooksPath=/dev/null', '-c', 'color.ui=false',
  ];
  // Inherit Pi's process group so helper cancellation also kills in-flight Git.
  const options = { cwd, env, signal, detached: false, timeoutMs: 5000, maxBytes: 32 * 1024 };
  // Even status/diff can invoke clean/process filters to hash working files.
  const filters = await runProcess('/usr/bin/git', [
    ...prefix, 'config', '--null', '--get-regexp', '^filter\\..*\\.(clean|process)$',
  ], options);
  if (filters.code === 0) {
    throw new Error('Git inspection refused: repository config contains clean/process filters that could execute programs. Inspect files directly instead.');
  }
  if (filters.code !== 1) throw new Error(filters.stderr.trim() || 'Could not inspect Git filter configuration.');
  const result = await runProcess('/usr/bin/git', [...prefix, ...operations[params.operation]], options);
  if (result.code !== 0) throw new Error(result.stderr.trim() || `Git exited ${result.code}.`);
  return result.stdout || '(no changes)';
}
