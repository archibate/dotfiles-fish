set -q PAGER; or set -l PAGER less
set -q EDITOR; or set -l EDITOR nvim

if not command -sq exa
    abbr -a s 'ls'
    abbr -a l 'ls -lAtr'
else
    abbr -a s 'exa'
end

abbr -a gs 'git status'
abbr -a ga 'git add --all'
abbr -a gad 'git add'
abbr -a gc 'git commit -m'
abbr -a gco 'git checkout'
abbr -a gcm 'git commit'
abbr -a gca 'git commit --amend'
abbr -a gq 'git pull'
abbr -a gk 'git reset'
abbr -a gkh 'git reset --hard'
abbr -a gka 'git reset HEAD^'
abbr -a gkha 'git reset --hard HEAD^'
abbr -a gp 'git push'
abbr -a gg 'git switch'
abbr -a ggo 'git switch -c'
abbr -a grs 'git restore --staged'
abbr -a grc 'git rm --cached'
abbr -a grfc 'git rm -rf --cached'
abbr -a gr 'git restore'
abbr -a gd 'git diff'
abbr -a gdc 'git diff --cached'
abbr -a gda 'git diff HEAD^'
abbr -a gm 'git merge'
abbr -a gl 'git log'
abbr -a gll 'git log --graph --oneline --decorate'
abbr -a gt 'git stash'
abbr -a gtp 'git stash pop'
abbr -a gcl 'git clone'
abbr -a gcl1 'git clone --depth=1'
abbr -a gsm 'git submodule'
abbr -a gsma 'git submodule add'
abbr -a gsml 'git submodule list'
abbr -a gsmu 'git submodule update --init --recursive'
abbr -a gw 'git workspace'
abbr -a gwa 'git workspace add'
abbr -a gwl 'git workspace list'
abbr -a gwrm 'git workspace remove'
abbr -a gb 'git branch'
abbr -a g0 'cd (git rev-parse --show-toplevel)'

abbr -a g 'git'
abbr -a p 'python'
abbr -a b "$EDITOR"
abbr -a v "$PAGER"
abbr -a j z

abbr -a fishconf "$EDITOR $__fish_config_dir/config.fish && source $__fish_config_dir/config.fish"
abbr -a fishenv "$EDITOR $__fish_config_dir/.env && load_dotenv $__fish_config_dir/.env"

abbr -a t --function projectdo_test
abbr -a r --function projectdo_run
abbr -a m --function projectdo_build

if command -sq opencode
    function opencode
        set -l session_random_key (basename $PWD)-(command -sq openssl; and openssl rand -hex 8; or random)
        set -lx SHELL (which bash)
        set -lx OPENCODE_ENABLE_EXA 1
        set -lx AGENT_BROWSER_SESSION $session_random_key
        command opencode $argv
    end
end

function tmux_pager_view
    tmux capture-pane -pS - | $PAGER
end

abbr -a ta 'tmux attach'
abbr -a tl 'tmux ls'
abbr -a tv 'tmux_pager_view'
abbr -a tmuxconf "$EDITOR $fish_tmux_config"

function yazi_select
    set tmp (mktemp -t "yazi-chooser.XXXXXX")
    yazi --chooser-file $tmp
    echo (cat $tmp)
end

function y
    set tmp (mktemp -t "yazi-cwd.XXXXXX")
    command yazi $argv --cwd-file="$tmp"
    if read -z cwd < "$tmp"; and [ "$cwd" != "$PWD" ]; and test -d "$cwd"
        builtin cd -- "$cwd"
    end
    rm -f -- "$tmp"
end

function box -a name
    set box_base_dir ~/Codes/box
    if test -z "$name"
        set name (mktemp -u "box_XXXXXX" | string replace -r '.*/' '')
        while test -d $box_base_dir/$name
            set name (mktemp -u "box_XXXXXX" | string replace -r '.*/' '')
        end
    end
    if test -d $box_base_dir/$name
        cd $box_base_dir/$name
        return
    end
    mkdir -p $box_base_dir/$name
    cd $box_base_dir/$name
    command -sq git; and git init
    command -sq dockman; and dockman init && dockman build && begin
        command -sq git; and git add --all; and git commit -m "initial commit"
    end
    command -sq opencode; and opencode
end

function box_fzf
    set box_base_dir ~/Codes/box
    set selected (command ls $box_base_dir | fzf --preview="exa $EXA_LG_OPTIONS $box_base_dir/{} 2>/dev/null || ls -la $box_base_dir/{}")
    if test -n "$selected"
        cd $box_base_dir/$selected
    end
end

function box_rename -a name
    if test -z "$name"
        echo "Usage: box_rename <new_name>"
        return 1
    end
    set parent (dirname $PWD)
    mv $PWD $parent/$name
    cd $parent/$name
end

function gethub -a repo
    # Yes, this is a funny pun: 'get' hub
    if test -z "$repo"
        echo "Usage: gethub user/repo"
        return 1
    end
    if not string match -qr '^[^/]+/[^/]+$' $repo
        echo "Error: Invalid format. Expected: user/repo"
        return 1
    end
    set gh_base_dir ~/Codes/github.com
    set clone_dir $gh_base_dir/$repo
    if test -d $clone_dir
        cd $clone_dir
        return
    end
    mkdir -p (dirname $clone_dir)
    git clone git@github.com:$repo.git $clone_dir; and cd $clone_dir
end

function cmd
    set commands (commander $argv | string split0)
    
    if test -z "$commands"
        return 1
    end
    
    set selected (printf '%s\n' $commands | fzf)
    
    if test -n "$selected"
        commandline -r -- $selected
    end
end
