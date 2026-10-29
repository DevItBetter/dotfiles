# list commands used most often
favorite_commands(){
  history | awk '{a[$2]++}END{for(i in a){print a[i] " " i}}' | sort -rn | head
}


# A function to list the numerical values of the 256 ANSI screen colors available in bash.

# The default is to output the colors in 3 columns.

# To change the number of columns, provide the number of columns on the command line like this:
# display-ansi-color-chart 4

# Above will display 4 columns instead of the default of 3.
function display-ansi-color-chart() {
  local i
  local col=$((${1:-3} * 8))
  for i in {0..255}; do
    print "\e[38;05;${i}m $i: This is a color test"
  done | column -c$col
  print "\e[m"
}

# Checks if this is executed within a WSL (Windows Subsytem for Linux) environment
is_wsl() {
  # Check /proc/version for "Microsoft" (WSL1/WSL2) or "WSL"
  if grep -qiE 'microsoft|wsl' /proc/version 2>/dev/null; then
    return 0   # true
  fi
  return 1     # false
}


# -------------------------------------------------------------------
# compressed file expander
# (from https://github.com/myfreeweb/zshuery/blob/master/zshuery.sh)
# -------------------------------------------------------------------
ex() {
    if [[ -f $1 ]]; then
        case $1 in
          *.tar.bz2) tar xvjf $1;;
          *.tar.gz) tar xvzf $1;;
          *.tar.xz) tar xvJf $1;;
          *.tar.lzma) tar --lzma xvf $1;;
          *.bz2) bunzip2 "$1";;
          *.rar) unrar $1;;
          *.gz) gunzip $1;;
          *.tar) tar xvf $1;;
          *.tbz2) tar xvjf $1;;
          *.tgz) tar xvzf $1;;
          *.zip) unzip $1;;
          *.Z) uncompress $1;;
          *.7z) 7z x $1;;
          *.dmg) hdiutil mount "$1";;
          *) print -u2 "'$1' cannot be extracted via >ex<";;
    esac
    else
        print -u2 "'$1' is not a valid file"
    fi
}

# -------------------------------------------------------------------
# any function from http://onethingwell.org/post/14669173541/any
# search for running processes
# -------------------------------------------------------------------
any() {
    emulate -L zsh
    unsetopt KSH_ARRAYS
    if [[ -z "$1" ]] ; then
        print -u2 "any - grep for process(es) by keyword"
        print -u2 "Usage: any " ; return 1
    else
        ps xauwww | grep -i --color=auto "[${1[1]}]${1[2,-1]}"
    fi
}

# -------------------------------------------------------------------
# display a neatly formatted path
# -------------------------------------------------------------------
path() {
  print $PATH | tr ":" "\n" | \
    awk "{ sub(\"/usr\",   \"$fg_no_bold[green]/usr$reset_color\"); \
           sub(\"/bin\",   \"$fg_no_bold[blue]/bin$reset_color\"); \
           sub(\"/opt\",   \"$fg_no_bold[cyan]/opt$reset_color\"); \
           sub(\"/sbin\",  \"$fg_no_bold[magenta]/sbin$reset_color\"); \
           sub(\"/local\", \"$fg_no_bold[yellow]/local$reset_color\"); \
           print }"
}


# -------------------------------------------------------------------
# nice mount (http://catonmat.net/blog/another-ten-one-liners-from-commandlingfu-explained)
# displays mounted drive information in a nicely formatted manner
# -------------------------------------------------------------------
function nicemount() { (print "DEVICE PATH TYPE FLAGS" && mount | awk '$2="";1') | column -t ; }

# -------------------------------------------------------------------
# myIP address
# -------------------------------------------------------------------
function myip() {
  if (( $+commands[ip] )); then
    command ip -brief address
  elif (( $+commands[ifconfig] )); then
    command ifconfig
  else
    print -u2 "myip: install iproute2 or ifconfig"
    return 1
  fi
}

# -------------------------------------------------------------------
# (s)ave or (i)nsert a directory.
# -------------------------------------------------------------------
s() { pwd > "$HOME/.save_dir" ; }
i() { cd "$(cat "$HOME/.save_dir")" ; }

# -------------------------------------------------------------------
# console function
# -------------------------------------------------------------------
function console () {
  local query
  if [[ $OSTYPE == linux* ]] && (( $+commands[journalctl] )); then
    if (( $# )); then
      command journalctl -f --grep="$*"
    else
      command journalctl -f
    fi
    return
  elif [[ ! -r /var/log/system.log ]]; then
    print -u2 "console: no supported readable system log"
    return 1
  fi
  if [[ $# > 0 ]]; then
    query=$(print "$*"|tr -s ' ' '|')
    tail -f /var/log/system.log|grep -i --color=auto -E "$query"
  else
    tail -f /var/log/system.log
  fi
}

# -------------------------------------------------------------------
# shell function to define words
# http://vikros.tumblr.com/post/23750050330/cute-little-function-time
# -------------------------------------------------------------------
givedef() {
  if [[ $# -ge 2 ]] then
    print -u2 "givedef: too many arguments"
    return 1
  else
    curl "dict://dict.org/d:$1"
  fi
}

# -------------------------------------------------------------------
# create a bare git clone for worktree workflow
# Usage: git-bare-clone <repo-url> [directory]
# -------------------------------------------------------------------
git-bare-clone() {
  if [[ -z "$1" ]]; then
    print -u2 "git-bare-clone - create bare git clone for worktrees"
    print -u2 "Usage: git-bare-clone <repo-url> [directory]"
    return 1
  fi

  local url="$1"
  local dir="$2"

  # extract repo name from url if directory not provided
  if [[ -z "$dir" ]]; then
    # handle both git@host:user/repo and https://host/user/repo formats
    local name="${url##*/}"      # get last segment (repo.git or repo)
    name="${name%.git}"          # strip .git suffix if present
    dir="${name}.git"
  else
    # ensure directory ends with .git
    [[ "$dir" != *.git ]] && dir="${dir}.git"
  fi

  # check if directory already exists
  if [[ -d "$dir" ]]; then
    print -u2 "git-bare-clone: directory '$dir' already exists"
    return 1
  fi

  # create directory structure
  mkdir -p "$dir" || return 1

  # clone bare repository into .bare
  if ! git clone --bare "$url" "$dir/.bare"; then
    print -u2 "git-bare-clone: clone failed, cleaning up"
    rm -rf "$dir"
    return 1
  fi

  # configure remote origin fetch to enable fetching remote branches
  git -C "$dir/.bare" config remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"

  # create .git file pointing to .bare
  echo "gitdir: ./.bare" > "$dir/.git"

  print "Created bare repository at: $dir"
  return 0
}
