# Export bash function to command.

# you should execute  . ./yourscript.sh to to make your script to affect the parent shell's environment.
#!/bin/bash

# spike() {
#    echo $1
# }
# export -f spike

# list commands used most often
favorite_commands(){
  history | awk '{a[$2]++}END{for(i in a){print a[i] " " i}}' | sort -rn | head
}


# gather system performance statistics
# #!/bin/bash
# ##################################################
# DATE=`date +%m/%d/%Y`
# TIME=`date +%k:%M:%S`
# USERS=`uptime | sed 's/users.*$//' | gawk '{print $NF}'`
# LOAD=`uptime | gawk '{print $NF}'`
# FREE=`vmstat 1 2 | sed -n '/[0-9]/p' | sed -n '2p' | gawk '{print $4}'`
# IDLE=`vmstat 1 2 | sed -n '/[0-9]/p' | sed -n '2p' | gawk '{print $15}'`
# #########################################
# # Send Statistics
# #########################################
# echo "=================="
# echo "DATE: ==> $DATE"
# echo "TIME: ==> $TIME"
# echo "USERS: ==> $USERS"
# echo "LOAD: ==> $LOAD"
# echo "FREE: ==> $FREE"
# echo "IDLE: ==> $IDLE"
# echo "=================="


# improve performance -- too many files open
# 1 echo 2048 > /proc/sys/fs/file-max
# 2 edit /etc/sysctl.conf add following code:
#     fs.file-max = 8192
# 3 edit /etc/security/limits.conf add following code:
#     * - nofile 8192
# 4 ulimit -n 8192


# rsync over ssh
# rsync -avz -e ssh root@hostname:/tmp/xxxx /temp/

# directory size
# du -h -s  /usr/local/xxxx


#   5 minutes for cron table.
#  1. create /etc/cron.5mitues and put script under this directory
#  2. add code to /etc/crontab
#  3. /etc/init.d/crond restart

# */5 * * * * root run-parts /etc/cron.5mitues


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
          *.bz2) bunzip $1;;
          *.rar) unrar $1;;
          *.gz) gunzip $1;;
          *.tar) tar xvf $1;;
          *.tbz2) tar xvjf $1;;
          *.tgz) tar xvzf $1;;
          *.zip) unzip $1;;
          *.Z) uncompress $1;;
          *.7z) 7z x $1;;
          *.dmg) hdiutul mount $1;; # mount OS X disk images
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
  ifconfig lo0 | grep 'inet ' | sed -e 's/:/ /' | awk '{print "lo0       : " $2}'
  ifconfig en0 | grep 'inet ' | sed -e 's/:/ /' | awk '{print "en0 (IPv4): " $2 " " $3 " " $4 " " $5 " " $6}'
  ifconfig en0 | grep 'inet6 ' | sed -e 's/ / /' | awk '{print "en0 (IPv6): " $2 " " $3 " " $4 " " $5 " " $6}'
  ifconfig en1 | grep 'inet ' | sed -e 's/:/ /' | awk '{print "en1 (IPv4): " $2 " " $3 " " $4 " " $5 " " $6}'
  ifconfig en1 | grep 'inet6 ' | sed -e 's/ / /' | awk '{print "en1 (IPv6): " $2 " " $3 " " $4 " " $5 " " $6}'
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

