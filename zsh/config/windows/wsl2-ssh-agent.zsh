# WSL2 --> Windows ssh-agent bridge
wsl2_ssh_agent_bin="$HOME/.local/bin/wsl2-ssh-agent"

# if already setup, do nothing
if [[ -n "${SSH_AUTH_SOCK:-}" && -S "$SSH_AUTH_SOCK" ]]; then
  return 0
fi

# expected output:
# SSH_AUTH_SOCK=/some/path.sock; export SSH_AUTH_SOCK;
if [[ -x "$wsl2_ssh_agent_bin" ]]; then
  output=""
  if ! output="$("$wsl2_ssh_agent_bin" 2>&1)"; then
    print -u2 -r -- "[WSL] Error: wsl2-ssh-agent failed:"
    print -u2 -r -- "$output"
    return 0
  elif [[ "$output" == *$'\n'* || "$output" == *$'\r'* ]]; then
    print -u2 -r -- "[WSL] Error: unexpected multiline output from wsl2-ssh-agent; refusing to eval"
    return 0

  elif [[ "$output" != (SSH_AUTH_SOCK=[A-Za-z0-9_./:-]##\;\ export\ SSH_AUTH_SOCK\;) ]]; then
    print -u2 -r -- "[WSL] Error: unexpected output format from wsl2-ssh-agent; refusing to eval"
    return 0
  else
    eval "$output"

    if [[ -z "${SSH_AUTH_SOCK:-}" || ! -S "$SSH_AUTH_SOCK" ]]; then
      print -u2 -r -- "[WSL] Error: SSH_AUTH_SOCK set but not a socket: ${SSH_AUTH_SOCK:-<empty>}"
      return 0
    fi
  fi
elif [[ -f "$wsl2_ssh_agent_bin" ]]; then
  print -u2 -r -- "[WSL] Error: wsl2-ssh-agent not executable: $wsl2_ssh_agent_bin"
  print -u2 -r -- "[WSL] Fix with: chmod +x -- $wsl2_ssh_agent_bin"
  return 0
elif [[ -d "$HOME/.local/bin" ]]; then
  print -u2 -r -- "[WSL] Error: wsl2-ssh-agent not found at $wsl2_ssh_agent_bin"
  return 0
else
  print -u2 -r -- "[WSL] Error: $HOME/.local/bin missing; wsl2-ssh-agent expected at $wsl2_ssh_agent_bin"
  return 0
fi
