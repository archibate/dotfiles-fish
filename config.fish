source $__fish_config_dir/env.fish

if status is-interactive

    if status is-login
        if not set -q LANG; and set -q LC_ALL
            set -x LANG C.UTF-8
            set -x LC_ALL C.UTF-8
        end
    end

    if command -sq direnv
        direnv hook fish | source
    end
    if command -sq atuin
        atuin init fish --disable-up-arrow | source
    end
    if command -sq zoxide
        zoxide init fish | source
    end

    function fish_greeting
#         echo "
# $(set_color red) 88888$(set_color yellow)888b oo          $(set_color green)dP       
# $(set_color red) 88                    $(set_color cyan)88       
# $(set_color red)a88$(set_color yellow)aaaa    $(set_color green)dP .d8888b$(set_color cyan). 8$(set_color blue)8d888$(set_color magenta)b. 
# $(set_color red) 88        $(set_color green)88 Y$(set_color cyan)8ooooo. $(set_color blue)88'  $(set_color magenta)`88 
# $(set_color red) 8$(set_color yellow)8        $(set_color green)8$(set_color cyan)8       8$(set_color blue)8 88    $(set_color magenta)88 
# $(set_color yellow) dP        $(set_color cyan)dP `88888$(set_color blue)P' dP    $(set_color magenta)dP $(set_color normal)
#         "
#         echo "       $(set_color green)$(date +%Y/%m/%d)$(set_color normal) $(set_color yellow)$(date +%H:%M)$(set_color normal)"
#         echo
    end

    # if command -sq osc-paste; and command -sq osc-copy
    #     function fish_clipboard_paste
    #         commandline -i -- (command osc-paste)
    #     end
    #     function fish_clipboard_copy
    #          commandline -s | command osc-copy
    #     end
    # end

    fish_vi_key_bindings
    if functions -q fzf_key_bindings
        fzf_key_bindings
    end

    if false
        fish_default_key_bindings -M insert
    else

        bind -s 'p' 'set -g fish_cursor_end_mode exclusive' forward-char 'set -g fish_cursor_end_mode inclusive' fish_clipboard_paste
        bind -s 'P' fish_clipboard_paste
        bind -s -M visual -m default 'y' "fish_clipboard_copy; commandline -f end-selection repaint-mode"
        for seq in 'y,y' 'Y'
            bind -s $seq fish_clipboard_copy
        end

        bind -M insert \cp up-or-search
        bind -M insert \cn down-or-search
        bind -M insert \ca beginning-of-line
        bind -M insert \ce end-of-line
        bind -M insert \cf forward-bigword forward-single-char
        bind -M insert \cb backward-bigword
        bind -M visual \ca beginning-of-line
        bind -M visual \ce end-of-line
        bind -M visual \cf forward-bigword forward-single-char
        bind -M visual \cb backward-bigword
        bind -M default \ce end-of-line
        bind -M default \cf forward-bigword forward-single-char
        bind -M default \cb backward-bigword
        bind -M insert \ct transpose-words
        bind -M insert \eu upcase-word
        bind -M insert \ec capitalize-word
        bind -M default \cr redo

        for mode in default insert visual
            if test (string split '.' $FISH_VERSION)[1] -ge 4
                bind -M $mode home beginning-of-line
                bind -M $mode end end-of-line
            else
                bind -M $mode \e\[H beginning-of-line
                bind -M $mode \e\[F end-of-line
            end
        end
        if test (string split '.' $FISH_VERSION)[1] -ge 4
            bind -M default ctrl-/ undo
            bind -M default alt-/ redo
            bind -M insert ctrl-/ undo
            bind -M insert alt-/ redo
        end

        # if functions -q _fzf_search_directory
        #     bind -M default \ef _fzf_search_directory
        #     bind -M insert \ef _fzf_search_directory
        # end
    end

    source $__fish_config_dir/options.fish
    source $__fish_config_dir/alias.fish

end
