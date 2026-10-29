{{- /* chezmoi:modify-template */ -}}
{{- /* Keep personal guidance and replace only this managed instruction block. */ -}}
{{- $block := `<!-- BEGIN dotfiles command shell -->
## Command shell

Run shell commands with Bash. For every exec_command call, explicitly set
shell to "/bin/bash" and login to false. Do not rely on the reported account
shell or the tool's default shell, which may be zsh. Run command text directly
through that Bash selection rather than nesting bash inside the default shell.
This keeps zsh startup files from changing the agent command environment.

Keep the current sandbox and approval policy. Selecting Bash does not authorize
unsandboxed execution or additional filesystem or network access.
<!-- END dotfiles command shell -->` -}}
{{- $pattern := `(?s)<!-- BEGIN dotfiles command shell -->.*?<!-- END dotfiles command shell -->` -}}
{{- if regexMatch $pattern .chezmoi.stdin -}}
{{ regexReplaceAllLiteral $pattern .chezmoi.stdin $block }}
{{- else if .chezmoi.stdin -}}
{{ printf "%s\n\n%s\n" (trimSuffix "\n" .chezmoi.stdin) $block }}
{{- else -}}
{{ printf "%s\n" $block }}
{{- end -}}
