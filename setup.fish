#!/usr/bin/env fish

set -l fisher_plugins (cat $__fish_config_dir/fish_plugins)

if not command -sq fisher; and not functions -q fisher
    curl -sL https://raw.githubusercontent.com/jorgebucaran/fisher/main/functions/fisher.fish | source && fisher install jorgebucaran/fisher
end

for plugin in $fisher_plugins
    fisher install $plugin
end

set -U fish_tmux_autostart false
set -U fish_tmux_autoname_session true
set -U fish_tmux_no_alias true

for x in local atuin cargo npm-global opencode
    if test -d ~/.$x/bin
        fish_add_path -U ~/.$x/bin
    end
end
fish_add_path -U $__fish_config_dir/bin

fish_config theme choose 'TokyoNight Moon'

test -f $__fish_config_dir/.env; or touch $__fish_config_dir/.env
