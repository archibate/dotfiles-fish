set -gx TERMINAL kitty
set -gx EDITOR nvim
set -gx PAGER less
set -gx SHELL (which fish)

# set -l fzf_color_theme '--color=bg+:#313244,bg:#1E1E2E,spinner:#F5E0DC,hl:#F38BA8 --color=fg:#CDD6F4,header:#F38BA8,info:#CBA6F7,pointer:#F5E0DC --color=marker:#B4BEFE,fg+:#CDD6F4,prompt:#CBA6F7,hl+:#F38BA8 --color=selected-bg:#45475A --color=border:#6C7086,label:#CDD6F4'
# set -l fzf_color_theme ''
# set -l fzf_preview_opts
# if command -sq bat
#     set fzf_preview_opts '--preview="bat --color=always --style=auto {}"'
# end
# set -x FZF_DEFAULT_OPTS $fzf_color_theme' '$fzf_preview_opts
#
# if command -sq fd
#     set -x FZF_DEFAULT_COMMAND 'fd --type f'
# else
#     set -u FZF_DEFAULT_COMMAND
# end

function load_dotenv
    # Check if an argument was passed, otherwise look for .env in the current dir
    if test -z "$argv[1]"
        set file "./.env"
    else
        set file $argv[1]
    end

    # Check if file exists
    if not test -f $file
        echo "Error: $file not found."
        return 1
    end

    # Read the file line by line
    for line in (cat $file)
        # Ignore comments (lines starting with # or ;)
        if string match -q "^#" $line
            continue
        end

        # Split line into key and value by the first equals sign
        set -l var_name (string split -m1 "=" $line)[1]
        set -l var_value (string split -m1 "=" $line)[2]

        # Check if the line actually contained a =
        if test -n "$var_name" -a -n "$var_value"
            # Set the variable as global
            set -gx $var_name $var_value
        end
    end
end

if test -f $__fish_config_dir/.env
    load_dotenv $__fish_config_dir/.env
end
