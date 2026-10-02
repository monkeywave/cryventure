# CryVenture — project status

> **Fresh session?** Read `docs/PLAN.md` (architecture + roadmap), then this file, then
> `docs/EXTENDING.md` / `docs/AUTHORING.md` as needed. Continue with **Next up** below.
> Update this file at the end of every milestone or significant change.

_Last updated: 2026-10-02 (after /simplify and /code-review; commit `cf723b8`)._

## Where things live

| What                          | Where                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| Repository                    | https://github.com/monkeywave/cryventure (`main`)                                    |
| Live site                     | https://monkeywave.github.io/cryventure/ (Pages source **must** be "GitHub Actions") |
| Docker image                  | `ghcr.io/monkeywave/cryventure` (amd64 + arm64)                                      |
| Plan / architecture           | `docs/PLAN.md`                                                                       |
| Add plugins                   | `docs/EXTENDING.md` (`pnpm cv new primitive\|view <id>`)                             |
| Write lessons, EN/DE workflow | `docs/AUTHORING.md`, `docs/GLOSSARY.md`                                              |
| Deploy                        | `docs/DEPLOY.md`                                                                     |
| German review report          | `docs/translation-review-2026-10.md`                                                 |

## Milestones

| Milestone                                                | State   | Notes                                                                                                                            |
| -------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| M0 Walking skeleton                                      | ✅ done | monorepo, core contracts, AES plugin, generic `<Lab>` island, EN/DE, CI, Pages, Docker                                           |
| M1 Full AES                                              | ✅ done | Story + Debugger modes, choreography, key-schedule view, 5 AES lessons (EN+DE)                                                   |
| M1 follow-ups                                            | ✅ done | mobile caption + sticky player, inline derivation chain, contrast tokens, German AI review, plurals, translation freshness check |
| M2 Foundations + S-box                                   | ⏭ next  | see below                                                                                                                        |
| M3 Modes I (ECB/CBC/CTR, penguin, padding oracle, PWA)   | ☐       |                                                                                                                                  |
| M4 GCM + Memory & Hardware (ISA/memory derivers + views) | ☐       | proves "views as plugins"                                                                                                        |
| Phases 2–10                                              | ☐       | see `docs/PLAN.md` §6                                                                                                            |

## Next up — M2 (from `docs/PLAN.md` §7)

1. Lessons `foundations/{xor,endianness,gf256}` (EN+DE, then `ai-reviewed`, `pnpm i18n:stamp`).
2. `SBoxExplorer` (16×16 grid, click → traced derivation inverse → affine) and `GF256Calculator`
   (xtime/gmul/ginv steps) — as view/primitive plugins where possible.
3. S-box derivation lesson using them.
4. Quiz island + progress persistence (`cv.progress.v1`, migrations, JSON export/import) — replaces
   the static `<details>` questions in the AES lessons.
5. Prologue onboarding + Lens switch (Story / Engineer / Cryptographer; `<Lens level>` in MDX).

## Deviations from the plan (decided)

- **Toolchain:** Astro 7.3 + Starlight 0.42 (plan said Astro 5); TypeScript pinned `~6.0`
  (typescript-eslint doesn't support TS 7 yet); Vitest 5; React 19.3; Tailwind 4.3.
- **PWA deferred to M3:** `@vite-pwa/astro` doesn't support Astro 7 yet — re-check or use
  `vite-plugin-pwa`/workbox directly.
- **Full AES and axe a11y checks** landed already in M0/M1 (pulled forward).
- **Hardware views** will be derivers (`derivers/isa-*`), not engine code (per §2b).
- **ShiftRows choreography** animates in "before" coordinates and snaps at row end (the `after`
  snapshot already holds shifted values) — documented in `primitives/src/aes/choreo/`.
- **German review** is an AI editorial pass (`translation.status: ai-reviewed`); a human native
  speaker sign-off (`human-reviewed`) is still outstanding.

## Open issues / ideas backlog

- Human native-speaker review of German (open questions in `docs/translation-review-2026-10.md`,
  e.g. Geheimtext vs. BSI "Chiffrat", "Knack es", "Spielwiese").
- Key-schedule words of one round key share one `valueRef` (`r/roundKey`); per-word ValueRefs needed
  for word-precise linked brushing across views.
- `view.state.region.summary` would need `count` for plural forms if 1-byte regions ever appear.
- Docker image can't be built locally on this machine (Docker Desktop proxy times out on Docker Hub);
  CI builds and smoke-tests it on every push.
- `astro preview` needs `--ignore-lock` when driven by agents (already in Playwright config).

### Deferred from the /simplify review (2026-10-02)
- **M2:** a fixture "toy" lab for the generic player/workspace e2e tests (today they run through AES);
  `viewContract` should render every view against per-facet fixture bundles; the contract kit should
  discover each primitive's `vectors/` generically (`vectorsCheck` is never passed).
- **M3:** composite producers (`gcm(aes)`) must load the i18n namespaces of all constituents.
- **M4:** deriver-aware `viewsFor` in `apps/web/src/labs/registry.ts`; facet-agnostic timeline
  (today tied to the `state` facet). The core deriver contract (`defineDeriver`) is kept for this.
- The `key-schedule` view now renders any `derivation` facet generically — consider renaming it to
  `derivation` when HKDF/TLS key schedules arrive.
- `selection.valueRefId` is published by the key-schedule view but not yet consumed (linked brushing).

## Quality gates (all must be green before committing)

```sh
pnpm lint && pnpm typecheck && pnpm i18n:check && pnpm test \
  && pnpm --filter @cryventure/web build && pnpm e2e && pnpm --filter @cryventure/web e2e:subpath
```

CI runs the same plus a container smoke test; the Pages workflow re-runs the Playwright suite
against the live URL after every deploy.

## Working conventions

- Orchestrate with sub-agents; give each a disjoint set of files; only one agent installs packages
  at a time.
- Every user-facing string goes through i18n (EN + DE); German follows `docs/GLOSSARY.md`.
- Tests for every function; verify in the running app (Playwright screenshots) before committing.
- Commit messages end with the Claude co-author line; push to `main` triggers CI, Pages and Docker.
