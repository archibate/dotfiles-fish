import { spawn } from 'node:child_process';

// No shell evaluation. A private process group lets cancellation reap descendants.
export function runProcess(file, args, {
  input = '', cwd = process.cwd(), env = process.env,
  timeoutMs = 10_000, maxBytes = 256 * 1024, signal, detached = true,
} = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('cancelled'));
    const child = spawn(file, args, {
      cwd, env, detached, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdout = [];
    const stderr = [];
    let bytes = 0;
    let failure;
    let killTimer;
    const killGroup = (sig) => {
      if (!child.pid) return;
      if (!detached) { child.kill(sig); return; }
      try { process.kill(-child.pid, sig); } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    };
    const stop = (message) => {
      if (failure) return;
      failure = new Error(message);
      killGroup('SIGTERM');
      killTimer = setTimeout(() => killGroup('SIGKILL'), 250);
    };
    const abort = () => stop('cancelled');
    const timer = setTimeout(() => stop(`timed out after ${timeoutMs / 1000}s`), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    const collect = (target) => (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) stop(`output exceeded ${maxBytes} bytes`);
      if (!failure) target.push(chunk);
    };
    child.stdout.on('data', collect(stdout));
    child.stderr.on('data', collect(stderr));
    child.on('error', (error) => { failure ??= error; });
    // Pi may close stdin early after a startup error; the exit status is authoritative.
    child.stdin.on('error', (error) => {
      if (error.code !== 'EPIPE') stop(error.message);
    });
    child.stdin.end(input);
    child.on('close', (code, exitSignal) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      signal?.removeEventListener('abort', abort);
      // Reap any descendant still alive even if its parent exited first.
      killGroup('SIGKILL');
      if (failure) return reject(failure);
      resolve({
        code, signal: exitSignal,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
      });
    });
  });
}
