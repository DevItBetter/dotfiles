# -------------------------------------------------------------------
# use nocorrect alias to prevent auto correct from "fixing" these
# -------------------------------------------------------------------
#alias foobar='nocorrect foobar'
#alias g8='nocorrect g8'
alias git='nocorrect git'

# -------------------------------------------------------------------
# search
# -------------------------------------------------------------------
alias grep='grep --color=auto --exclude-dir=".svn,.git"'
alias sgrep='grep -R -n -H -C 5 --exclude-dir={.git,.svn,CVS}'
alias hgrep="fc -El 0 | grep"

alias duf='du -sh *'
alias fd='find . -type d -name'
alias ff='find . -type f -name'

##globals
# Command line head / tail shortcuts
alias -g H='| head'
alias -g T='| tail'
alias -g G='| grep'
alias -g L="| less"
alias -g M="| most"
alias -g LL="2>&1 | less"
alias -g CA="2>&1 | cat -A"
alias -g NE="2> /dev/null"
alias -g NUL="> /dev/null 2>&1"
alias -g P="2>&1| pygmentize -l pytb"

# -------------------------------------------------------------------
# directory movement
# -------------------------------------------------------------------
alias cd..='cd ..'
alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'
alias 'bk=cd $OLDPWD'


# -------------------------------------------------------------------
# directory information
# -------------------------------------------------------------------
alias lh='ls -d .*' # show hidden files/directories only
alias lsd='ls -aFhlG'
alias l='ls -al'
#alias ls='ls -GFh' # Colorize output, add file type indicator, and put sizes in human readable format
alias ll='ls -GFhl' # Same as above, but in long listing format
alias tree="ls -R | grep ":$" | sed -e 's/:$//' -e 's/[^-][^\/]*\//--/g' -e 's/^/   /' -e 's/-/|/'"
alias 'dus=du -sckx * | sort -nr' #directories sorted by size

alias 'wordy=wc -w * | sort | tail -n10' # sort files in current directory by the number of words they contain
alias 'filecount=find . -type f | wc -l' # number of files (not directories)

alias rable='ls -AFtrd *(R)' nrable='ls -AFtrd *(^R)'


# -------------------------------------------------------------------
# remote machines
# -------------------------------------------------------------------
alias bbb_serial="screen /dev/ttyUSB0 115200"
alias BBB_serial=bbb_serial

# -------------------------------------------------------------------
# Git stuff
# -------------------------------------------------------------------
alias gs="git status"
alias ga="git add"
alias gcm="git commit -m"

alias git-pull-antigen='pushd ~/dotfiles; git subtree pull --prefix zsh/antigen https://github.com/zsh-users/antigen.git master --squash; popd'
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
alias display-1-monitor='xrandr --output DP1 --scale 1.5x1.5 --fb 3840x3760 --pos 0x0;xrandr --output eDP1 --scale 1x1 --pos 840x2300'

alias 'ttop=top -acu $USER -s -n30' # fancy top

# Force tmux to use 256 colors
alias tmux='TERM=screen-256color-bce tmux'

alias h='history'

alias sz='source ~/.zshrc'
alias reload=". ~/.zshrc && echo 'ZSH config reloaded from ~/.zshrc'"
alias zshrc="gedit ~/.zshrc && reload"

alias monero_miner_cpu='sudo minerd -a cryptonight -o stratum+tcp://monerohash.com:3333 -u 44pmQCX7wWo8C5y8SFUTdxceToPj4CwFxDotk6tuQu9ihU6ifTsUuTg7whFXKdNnxJAnh7b39fTo51RDJFLm26qvM8WmKTc'

