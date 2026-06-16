# /git-commit

Commit completed work to the current feature branch.

1. Run lint + typecheck + tests — do not commit if any fail.
2. Stage only files changed by the current task scope.
3. Write commit message: `<type>(<scope>): <short summary>`
4. Commit and push the branch.
5. Report: branch name · commit hash · files committed · any skipped files and why.

Rule: never force-push. Never commit to `main` directly.
