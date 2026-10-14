# Validation record

Validated 2026-10-14 on macOS arm64. Scope: independent pre-SDK package and
repeatable extraction. This does not claim Plugin Manager installation, official
release, migration of real user data or real cat dispatch.

Source: Core feature commit `3aca4242a03081edbfae32b8f34e316f845d5daf`.
Public base: Plugins `47071ae07ca054b4fb0b8b3f523d890381df4bfd`.
These are distinct repositories. The source commit may not be reachable from public
Core main; `sync-state.json` binds the local source cut and file hashes. Public CI
verifies exported hashes; the source-side check was also run against that commit.

## Results

| Check | Result |
| --- | --- |
| Artifact toolchain verifier | Node 24.18.0 / npm 11.16.0 / zlib 1.3.1-e00f703 |
| Frozen-lockfile dependency installation | Passed; no existing lock entries changed |
| `check:manifest` | Candidate accepted by the current public manifest validator |
| `lint` | Typecheck, source receipt and no private Core imports passed |
| `test:sync` | 5 passed: exact cut, idempotence, dirty/conflicting input, complete preflight and dangling symlinks |
| `test:source` | 16 passed: catalog/detail/archive, partial failure, races, source edits and repository/owner ports |
| `test:ui` | 15 passed: existing model, source refresh, discussion/loading and race behavior |
| `build` | Standalone Node/browser entries, CSS, declarations, demo and complete bundled licenses |
| `test:artifact` | Passed: actual tgz installed outside the monorepo, public exports and restart persistence, no runtime dependencies |
| `test:browser` | Passed: actual tgz, system Chrome, desktop 1440 and mobile 390; no page errors or external requests |
| Core export `--check` | Exact source commit, `changed: []` |
| Contract `generate:check` / build | Passed |
| Contract conformance | 34/34 fixtures and 18/18 behavior cases |
| `git diff --check` | Passed |

Run the commands in README to reproduce. The test process sets NODE_ENV=test
explicitly so an embedding shell's production value cannot disable React act.
For a preinstalled browser, set PLAYWRIGHT_CHROMIUM_EXECUTABLE to its executable;
CI installs the pinned Playwright Chromium build.

## Actual packed journey

The browser test starts a temporary loopback server from the extracted tgz and
uses synthetic observations only. It reads body → loads comments 25/37 to 37/37 →
saves a solution → reloads and recovers it → edits without saving → cancels disable
and keeps that edit → opens the mobile detail without horizontal overflow.
Screenshots are generated in ignored `artifacts/packed-{desktop,mobile}.png` and
were inspected locally. No runtime service or real user store was used.

The Node consumer separately writes source observations, constructs a fresh store
and recovers the archived Markdown while the catalog stays light. Failure/race
cases are covered in source and UI tests; the demo does not claim live GitHub.

The sync failure regression was observed before the fix: existsSync missed dangling
symlinks, allowing replacement. lstat now rejects them before any export writes.
An additional test proves a later transform failure leaves all earlier output and
the old receipt unchanged. Browser test locators use the actual tab roles.

## Review and delivery boundary

Architecture ownership: Issue business/model/UI move into the standalone package;
Core authorization, routes and lifecycle stay in Core. Transitional ports are
explicit application interfaces, not a new public SDK or permission bypass.
Risk checks cover behavior, retained synthetic source data, repository/owner
isolation, import/manifest/artifact contracts and deterministic export. This PR
changes no production data, automatic release workflow or catalog entry.

Three Host-only route/authorization tests and one plugin-directory shell test stay
in Core; they were not represented as package tests. Real installed lifecycle,
retained user-work migration and cat task/result/acceptance remain in the broader
implementation plan. No independent reviewer approval or CI completion is implied
by this author validation record. The PR touches protected lockfile/workflow paths
and therefore requires the repository's other-party CODEOWNER approval on the
final push, plus required Typecheck + Conformance CI, before merge.

Final tgz filename/size/integrity are recorded in the PR after this document is
included in the pack, avoiding a self-referential package hash.
