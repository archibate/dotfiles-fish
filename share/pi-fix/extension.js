import { probe } from './probe.mjs';

export default function (pi) {
  pi.registerTool({
    name: 'shell_probe',
    label: 'Read-only shell probe',
    description: 'Inspect Git status or unstaged diff in the current directory, or locate an executable on PATH without running it. Fixed operations only; no arbitrary shell execution. Git skips submodules and refuses configured clean/process filters. Each Git subprocess has a 5-second / 32-KiB limit.',
    parameters: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['git_status', 'git_diff', 'executable_lookup'] },
        name: {
          type: 'string', pattern: '^[a-zA-Z0-9_.+-]{1,128}$',
          description: 'Bare executable name for executable_lookup, for example ffmpeg.',
        },
      },
      required: ['operation'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    async execute(_id, params, signal, _onUpdate, ctx) {
      const text = await probe(params, ctx.cwd, signal);
      return { content: [{ type: 'text', text }], details: undefined };
    },
  });

  // Keep the allowlist in force even if configured defaults differ.
  const allowed = ['read', 'grep', 'find', 'ls', 'shell_probe'];
  pi.on('session_start', () => pi.setActiveTools(allowed));
  pi.on('tool_call', (event) => {
    if (!allowed.includes(event.toolName)) return { block: true, reason: 'Alt-F only permits read-only inspections.' };
  });
}
