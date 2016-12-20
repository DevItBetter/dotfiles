#!/bin/zsh

ln -sf $(pwd)/fonts $HOME/.fonts
ln -sf $(pwd)/zsh/zshrc $HOME/.zshrc
ln -sf $(pwd)/git/gitconfig $HOME/.gitconfig

sudo add-apt-repository ppa:gnome-terminator -y
sudo apt-get update
sudo apt-get install terminator -y
