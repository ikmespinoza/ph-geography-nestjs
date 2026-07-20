# Git Conventions

- **No AI attribution in commits or PRs** — no `Co-Authored-By: Claude`, no "Generated with Claude Code" footers. (Also enforced via `attribution` in [`.claude/settings.json`](../settings.json).)
- Conventional commits: `feat|fix|refactor|test|chore|docs(scope): imperative summary` — scope is the module touched, e.g. `feat(regions): serve region detail with provinces`, `fix(cities): return province on city detail`, `feat(ingestion): schedule daily scrape`.
- **Keep commit messages short.** Subject ≤72 chars; body only when the why isn't obvious, a few lines max — never a file-by-file changelog.
- One ticket per commit where practical; reference the ticket ID in the body when there is one.
- Never commit `.env`, the generated Prisma client, or `dist/`. Migrations under `prisma/migrations/` are always committed.
- Branch names: `feature/<slug>` or `fix/<slug>` — a short descriptive kebab-case slug, e.g. `feature/regions-module`, `fix/city-detail-province`. **No ticket ID in the branch name** (put it in the commit body instead). Cut inside `ph-geography-nestjs/` off the base the user picks (default `main`), fast-forwarded first (`git fetch` → `git checkout <base>` → `git pull --ff-only`).
- Never force-push, never `--no-verify`, never auto-merge or auto-open PRs.
