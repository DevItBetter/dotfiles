# -------------------------------------------------------------------
# autocorrect leave these alone
# -------------------------------------------------------------------
alias mv='nocorrect mv'
alias cp='nocorrect cp'
alias mkdir='nocorrect mkdir'
alias git='nocorrect git'

# -------------------------------------------------------------------
# globals are awesome
# -------------------------------------------------------------------
alias -g H='| head'
alias -g T='| tail'
alias -g G='| grep'
alias -g L="| less"
alias -g M="| most"
alias -g LL="2>&1 | less"
alias -g CA="2>&1 | cat -A"
alias -g NE="2> /dev/null"
alias -g NUL="> /dev/null 2>&1"
#alias -g P="2>&1| pygmentize -l pytb"

# -------------------------------------------------------------------
# getting around
# -------------------------------------------------------------------
alias cd..='cd ..'
alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'
alias .....='cd ../../../..'

# -------------------------------------------------------------------
# finding stuff
# -------------------------------------------------------------------
alias grep='grep --color=auto --exclude-dir=".svn,.git"'

alias sgrep='grep -RnH -C 5' #recursive search with context
alias hgrep="fc -El 0 | grep"
alias k="k -h"

alias duf='du -sh *'

alias fn='find . -name' #find by name
alias fnd='find . -type d -name' #find directories by name
alias fnf='find . -type f -name' #find fils by name
alias fna='tar -ztvf xxx.tar.gz |grep yyyy' #find in archive

# -------------------------------------------------------------------
# show me things
# -------------------------------------------------------------------
alias ls='ls --color=auto'
alias lsh='ls -aFhld' # only directories
alias lshd='ls -aFhl .*' #list hidden directories
alias l='ls -alh'
#alias ls='ls -Fh' # Colorize output, add file type indicator, and put sizes in human readable format
alias ll='ls -Fhl' # Same as above, but in long listing format
alias tree="ls -R | grep ":$" | sed -e 's/:$//' -e 's/[^-][^\/]*\//--/g' -e 's/^/   /' -e 's/-/|/'"
#alias 'dus=du -sckx * | sort -nr' #directories sorted by size

#alias 'wordy=wc -w * | sort | tail -n10' # sort files in current directory by the number of words they contain
#alias 'filecount=find . -type f | wc -l' # number of files (not directories)

alias lsreadable='ls -AFtrd *(R)'
# alias rable=lsrable

alias lsnreadable='ls -AFtrd *(^R)'
# alias nrable=lsnreadable


# -------------------------------------------------------------------
# remote machines
# -------------------------------------------------------------------
#alias bbb_serial="screen /dev/ttyUSB0 115200"
#alias BBB_serial=bbb_serial

# -------------------------------------------------------------------
# Git stuff
# -------------------------------------------------------------------
alias gs="git status"
alias ga="git add"
alias gcm="git commit -m"

#alias git-pull-antigen='pushd ~/dotfiles; git subtree pull --prefix zsh/antigen https://github.com/zsh-users/antigen.git master --squash; popd'
#alias git-pull-z='pushd ~/.dotfiles; git fetch z master; git subtree pull --prefix .zsh/z z master --squash; popd'

#alias git-pull-all-subtrees='git-pull-oh-my-zsh; git-pull-z'

# -------------------------------------------------------------------
# Python virtualenv
# -------------------------------------------------------------------
alias mkenv='mkvirtualenv'
alias on="workon"
alias off="deactivate"

# -------------------------------------------------------------------
# Oddball stuff
# -------------------------------------------------------------------
#alias display-1-monitor="xrandr --output DP1 --scale 1.5x1.5 --fb 3840x3760 --pos 0x0; \
#                         xrandr --output eDP1 --scale 1x1 --pos 840x2300"

#alias display-2-monitor="xrandr --output eDP1 --off; \
#                         xrandr --output DP1 --mode 2560x1440 --scale 1x1 \
#                                --output DP2 --mode 2560x1440 --scale 1x1 --right-of DP1;  \
#                         xfconf-query -c xsettings -p /Xft/DPI -s -1; \
#                         xfconf-query -c xfce4-panel -p /panels/panel-1/mode -s 0; \
#                         xfconf-query -c xfce4-panel -p /plugins/plugin-23/digital-format -s ''; \
#                         xfconf-query -c xfce4-panel -p /panels/panel-1/autohide-behavior -s 0;"

# alias display-swap="xrandr --output DP1 --right-of DP2;"


# Force tmux to use 256 colors
alias tmux='TERM=screen-256color-bce tmux'

alias h='history'
alias lsofip6='lsof -Pnl +M -i6'
alias lsofip4='lsof -Pnl +M -i4'

alias fav_commands=history | awk '{a[$2]++}END{for(i in a){print a[i] " " i}}' | sort -rn

alias monero_mine_cpu_xmrpool='sudo minerd -a cryptonight -o stratum+tcp://xmrpool.io:3333 -u 44pmQCX7wWo8C5y8SFUTdxceToPj4CwFxDotk6tuQu9ihU6ifTsUuTg7whFXKdNnxJAnh7b39fTo51RDJFLm26qvM8WmKTc'

alias monero_mine_cpu_monerohash='sudo minerd -a cryptonight -o stratum+tcp://monerohash.com:3333 -u 44pmQCX7wWo8C5y8SFUTdxceToPj4CwFxDotk6tuQu9ihU6ifTsUuTg7whFXKdNnxJAnh7b39fTo51RDJFLm26qvM8WmKTc'

