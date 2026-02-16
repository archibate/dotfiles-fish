#!/usr/bin/env fish

sudo apt install fzf bat ripgrep fd-find exa
mkdir -p ~/.local/bin
ln -sf /usr/bin/batcat ~/.local/bin/bat
ln -sf /usr/bin/fdfind ~/.local/bin/fd
