# Fish Alt-F → Pi suggestion

Type natural language or a command into fish, then press **Alt-F**. On an empty
line, it uses the previous submission from this shell, successful or failed.
Pi's suggestion replaces the input; **Enter is still required to execute it**.
Clarification, malformed output, errors, timeout, and Ctrl-C leave the input intact.
Bindings cover vi normal and insert modes and replace Alt-F's default behavior.

`config.fish` sources `pi-fix.fish`. Activate it in an already-open shell with:

```fish
source ~/.config/fish/pi-fix.fish
```

Requires fish 4.x, Node.js, and an authenticated `pi` on PATH. File-search tools
use `rg` and `fd`; optional Git probes use `/usr/bin/git` on Linux.
The installed Pi's default model is used unless overridden:

```fish
set -gx PI_FIX_MODEL provider/model
set -gx PI_FIX_TIMEOUT 120  # seconds; accepted range 1–600
```

Pi receives the request, working directory, and fish version. When using the
previous submission, its command/status metadata is included too; unrelated
previous commands are otherwise omitted. Terminal output is not captured. Relevant
inspected file contents may also be sent to the configured model provider.

Only `read`, `grep`, `find`, `ls`, and `shell_probe` are enabled. Arbitrary Bash,
edit/write tools, other extensions, skills, and context-file discovery are disabled.
The fixed probes locate executables without running them or inspect Git status
and unstaged diff. Git disables optional index writes, fsmonitor, external diff,
and textconv; skips submodules; and refuses repositories with configured
clean/process filters. Ripgrep configuration is removed from Pi's environment.
These restrictions are not an OS sandbox: local executables and stable repository
configuration must be trusted, and file-read access is not confined to the project.

The helper validates JSON and parses the suggestion with `fish --no-config -n`;
it never runs the proposed command. Input is bounded to 128 KiB, suggestions to
16 KiB, and Pi's captured output to 256 KiB. Timeout/cancellation kills its process
group. Sessions are ephemeral.

Tests use a stub Pi and make no provider calls:

```sh
node --test ~/.config/fish/share/pi-fix/tests/helper.test.mjs
uv run --no-project ~/.config/fish/share/pi-fix/tests/fish_pty_test.py
```
