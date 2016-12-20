#!/bin/zsh

ln -sf $(pwd)/fonts $HOME/.fonts
ln -sf $(pwd)/zsh/zshrc $HOME/.zshrc
ln -sf $(pwd)/git/gitconfig $HOME/.gitconfig

$(pwd)/zsh/antibody/install_antibody.zsh
source <(antibody init)

antibody bundle < ~/dotfiles/zsh/config/plugins.txt >> ~/dotfiles/zsh/antibody/bundled_plugins.zsh


#Gotbletu on youtube for tmux tutorials
