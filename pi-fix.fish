# Alt-F: translate or repair shell input without executing it.
# Source this after selecting your fish key bindings.
if not status is-interactive
    return
end

set -g __pi_fix_root (path dirname (status filename))

function __pi_fix_preexec --on-event fish_preexec
    set -g __pi_fix_pending_cwd "$PWD"
end

function __pi_fix_postexec --on-event fish_postexec
    set -l outcome $status $pipestatus
    set -g __pi_fix_previous "$argv[1]"
    set -g __pi_fix_previous_cwd "$__pi_fix_pending_cwd"
    set -g __pi_fix_previous_status $outcome[1]
    set -g __pi_fix_previous_pipestatus $outcome[2..]
end

function __pi_fix_posterror --on-event fish_posterror
    set -g __pi_fix_previous "$argv[1]"
    set -g __pi_fix_previous_cwd "$PWD"
    set -g __pi_fix_previous_status 123
    set -g __pi_fix_previous_pipestatus
end

function __pi_fix
    set -l request (commandline --current-buffer | string collect --allow-empty)
    set -l origin buffer
    if not string match --quiet --regex '\S' -- "$request"
        if not set -q __pi_fix_previous; or test -z "$__pi_fix_previous"
            printf '\nAlt-F: type a request first; no previous command in this shell.\n' >&2
            commandline --function repaint
            return
        end
        set request "$__pi_fix_previous"
        set origin previous
    end

    if not command --query node; or not command --query pi
        printf '\nAlt-F: node and pi must be installed and on PATH.\n' >&2
        commandline --function repaint
        return
    end

    printf '\nAlt-F: inspecting (Ctrl-C to cancel)…\n' >&2
    set -l pipeline (string join , -- $__pi_fix_previous_pipestatus)
    set -l suggestion (printf '%s\0' "$request" "$origin" "$PWD" \
        "$__pi_fix_previous" "$__pi_fix_previous_cwd" \
        "$__pi_fix_previous_status" "$pipeline" \
        "$FISH_VERSION" | command node "$__pi_fix_root/share/pi-fix/helper.mjs" | string split0)

    # The helper emits exactly one NUL-terminated command, only on success.
    if test (count $suggestion) -eq 1; and test -n "$suggestion"
        commandline --replace -- "$suggestion"
        commandline --cursor (string length -- "$suggestion")
    end
    commandline --function repaint
end

for mode in default insert
    bind -M $mode \ef __pi_fix
end
