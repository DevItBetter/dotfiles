# Setup terminal, and turn on colors
export TERM="xterm-256color"
export GREP_COLOR='3;33'

export DEFAULT_USER="$USER"

# This resolves issues install the mysql, postgres, and other gems with native non universal binary extensions
export ARCHFLAGS='-arch x86_64'

export LESS='--ignore-case --raw-control-chars'
export PAGER='less'
export EDITOR='leafpad'

# Virtual Environment Stuff
export WORKON_HOME=$HOME/.virtualenvs
export VIRTUALENVWRAPPER_SCRIPT=/usr/local/bin/virtualenvwrapper.sh
source /usr/local/bin/virtualenvwrapper.sh

# Node
export NVM_NO_USE=true #stop NVM from using default node version on load
export NVM_LAZY_LOAD=true #lazy load nvm
export CMD_ENV=linux
