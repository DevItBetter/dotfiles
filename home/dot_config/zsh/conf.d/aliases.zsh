# -------------------------------------------------------------------
# autocorrect leave these alone
# -------------------------------------------------------------------
alias mv='nocorrect mv'
alias cp='nocorrect cp'
alias mkdir='nocorrect mkdir'
alias git='nocorrect git'
alias bun='nocorrect bun'
alias pygmentize='nocorrect pygmentize'

# -------------------------------------------------------------------
# globals are awesome
# -------------------------------------------------------------------
alias -g H='| head'
alias -g T='| tail'
alias -g G='| rg'
alias -g L="| less"
alias -g M="| most"
alias -g LL="2>&1 | less"
alias -g CA="2>&1 | cat -A"
alias -g NE="2> /dev/null"
alias -g NUL="> /dev/null 2>&1"
alias -g P="2>&1| pygmentize -l cpp"

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
alias grep='grep --color=auto'
alias rg='rg --color=auto'

alias sgrep='rg -RnH -C 5' #recursive search with context
alias hgrep="fc -El 0 | rg"
alias k="k -h"

alias duf='du -sh *'

alias fn='find . -name' #find by name
alias fnd='find . -type d -name' #find directories by name
alias fnf='find . -type f -name' #find fils by name
alias fna='tar -ztvf xxx.tar.gz |rg yyyy' #find in archive

# -------------------------------------------------------------------
# show me things
# -------------------------------------------------------------------
if [[ $OSTYPE == darwin* ]]; then
  alias ls='ls -G'
else
  alias ls='ls --color=auto'
fi
alias lsd='ls -aFhld' # only directories
alias lsdh='ls -aFhl .*' #list hidden directories
alias l='ls -alh'
#alias ls='ls -Fh' # Colorize output, add file type indicator, and put sizes in human readable format
alias ll='ls -Fhl' # Same as above, but in long listing format
alias lstree="ls -R | rg ":$" | sed -e 's/:$//' -e 's/[^-][^\/]*\//--/g' -e 's/^/   /' -e 's/-/|/'"
#alias 'dus=du -sckx * | sort -nr' #directories sorted by size

#alias 'wordy=wc -w * | sort | tail -n10' # sort files in current directory by the number of words they contain
#alias 'filecount=find . -type f | wc -l' # number of files (not directories)

alias lsreadable='ls -AFtrd *(R)'
# alias rable=lsrable

alias lsnreadable='ls -AFtrd *(^R)'
# alias nrable=lsnreadable

# -------------------------------------------------------------------
# Git stuff
# -------------------------------------------------------------------
alias gs="git status"
alias ga="git add"

# -------------------------------------------------------------------
# Coding agents
# -------------------------------------------------------------------
# Copilot CLI's launcher strips mise install paths and Git colors from the
# commands it runs. See ~/.local/share/agent-env.
# chezmoi deploys the launcher only when the mise profile includes Copilot.
_zconf_copilot=$HOME/.local/share/agent-env/copilot
if [[ -x $_zconf_copilot ]]; then
  alias copilot=${(q)_zconf_copilot}
elif [[ ${aliases[copilot]-} == ${(q)_zconf_copilot} ]]; then
  unalias copilot
fi
unset _zconf_copilot

_zconf_codex=$HOME/.local/share/agent-env/codex
if [[ -x $_zconf_codex ]]; then
  alias codex=${(q)_zconf_codex}
elif [[ ${aliases[codex]-} == ${(q)_zconf_codex} ]]; then
  unalias codex
fi
unset _zconf_codex

# -------------------------------------------------------------------
# Oddball stuff
# -------------------------------------------------------------------
alias h='history'
alias lsofip6='lsof -Pnl +M -i6'
alias lsofip4='lsof -Pnl +M -i4'

alias fav_commands='favorite_commands'
