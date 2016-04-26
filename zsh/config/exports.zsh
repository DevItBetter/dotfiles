# Setup terminal, and turn on colors
export TERM=xterm-256color

# Enable color in grep
export GREP_OPTIONS='--color=auto'
export GREP_COLOR='3;33'

# This resolves issues install the mysql, postgres, and other gems with native non universal binary extensions
export ARCHFLAGS='-arch x86_64'

export LESS='--ignore-case --raw-control-chars'
export PAGER='less'
export EDITOR='leafpad'

# Virtual Environment Stuff
export WORKON_HOME=$HOME/.virtualenvs

export GTEST_INCLUDE_DIR=/home/jeff/code/lib/googletest/googletest/include
export GTEST_SOURCE_DIR=/home/jeff/code/lib/googletest/googletest


#Go
export GOPATH=$HOME/go
export PATH=$PATH:$HOME/go/bin:/usr/local/go/bin
