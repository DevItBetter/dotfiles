# To see the key combo you want to use just do:
# cat > /dev/null
# And press it

bindkey "^K"      kill-whole-line                      # ctrl-k
bindkey "^R"      history-incremental-search-backward  # ctrl-r
bindkey "^A"      beginning-of-line                    # ctrl-a  
bindkey "^E"      end-of-line                          # ctrl-e
bindkey "[B"      history-search-forward               # down arrow
bindkey "[A"      history-search-backward              # up arrow
bindkey "^D"      delete-char                          # ctrl-d
bindkey "^F"      forward-char                         # ctrl-f
bindkey "^B"      backward-char                        # ctrl-b
bindkey "^[[3~"   delete-char                          # delete on 101 key keyboard
bindkey "^[OF"    end-of-line                     # end
bindkey "^[OH"    beginning-of-line                             # home
bindkey "^[[1;5D" backward-word                    #ctrl+left arrow
bindkey "^[[1;5C" forward-word                    #ctrl+right arrow

shift-arrow() {
  ((REGION_ACTIVE)) || zle set-mark-command
  zle $1
}

for key kcap seq widget (
    left LFT $'^[[1;2D' backward-char
    leftword LFTWORD $'^[[1;6D' backward-word
    leftline LFTLINE $'^[[1;2H' beginning-of-line
    right RITWORD $'^[[1;2C' forward-char
    rightword RIT $'^[[1;6C' forward-word
    rightline RITLINE $'^[[1;2F' end-of-line
  ) {
  eval "shift-$key() shift-arrow $widget"
  zle -N shift-$key
  bindkey ${terminfo[kcap]-$seq} shift-$key
}

bindkey -e
