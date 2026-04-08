# Branch Protection Rules

Recommended rules for `main` / `master`:

- Require pull request before merging.
- Require status checks: `CI / build-and-test (Node 20)`, `CI / build-and-test (Node 22)`, `E2E / playwright`.
- Require signed commits for release branches.
- Require linear history.
- Dismiss stale approvals when new commits are pushed.
