# Validation record

## Main compatibility update — 2026-10-20

The PR conflict notification was verified against GitHub and a local merge of
`29595a7794486ed0e6354a35a706875998e23d8f` into this feature branch. Conflicts were
limited to Contract CI and the workspace lockfile. Main's shared `gate:ci` entry
is retained; the workbench's manifest/lint/tests/build/artifact checks now join
that shared gate, and its packed browser journey remains explicit in the workflow.
A regression check first failed with the workbench gate absent, then passed after
integration (12 CI-gate checks). Main's 24 existing lockfile importers, 392 package
records and 395 resolved snapshots are preserved; only the workbench dependency
closure is added. Frozen installation is part of the full gate.

This synchronization does not modify the workbench UI, classification corpus or
service behavior. Validation logs and final-head evidence are retained under
`artifacts/main-sync-2026-10-20/`. The source export still uses Core cut
`3432e6d0b00749d762a8e2ec441c4f6a33fa241a`. This is PR maintenance, not a merge
to main, publication, approval or completion of the overall plugin feature.

## Visible Open / Closed distinction — 2026-10-20

Source: `thread_mucwsgsjtlbabfcq#0001792479863843-000114-15c85d76`.
Source state previously appeared as muted text. A shared icon/text badge now shows
green **Open · 开放** and purple **Closed · 已关闭** in multi-source queues,
classification cards and reading headers, plus the original single-source
list/detail. Unknown and unavailable sources use neutral labels. Light/dark
styles retain the text/icon distinction instead of relying on color alone.

Queue **全部 / Open / Closed** buttons show counts within the category/source/search
scope; **其他状态** appears for unknown/unavailable records. State switches select
a matching issue while retaining per-issue drafts. **本仓** verification stays
separate; source closure does not mark a local fix verified.

The packed browser journey first failed waiting for the missing Closed badge.
It then passed with distinct computed colors, Open/Closed filtering and counts,
matching detail state, draft retention, classification badges and neutral
unknown/unavailable handling. Existing fuzzy-linking, save/reload, grant withdrawal
and mobile journeys remain covered. Build/typecheck/export checks and the 5 sync,
19 source/port, 15 UI and corpus tests passed; the legacy refresh test now checks
the new Closed label while preserving its unsaved-input/local-acceptance assertions.

Real-page inspection caught an overflowing Closed count in the 270px desktop
queue: the shell's generic button reset overrode compact filter typography.
An overflow assertion reproduced it RED; scoped selector specificity and
content-sized, wrapping buttons prevent both style overrides and count overflow.

Core cut: `3432e6d0b00749d762a8e2ec441c4f6a33fa241a`.
Package export explicitly includes the shared badge/filter component and stylesheet.
The classification dataset, service/store contract and remote issue state are not
changed by this UI increment. Final packed preview screenshots and local-record
preservation evidence are recorded under `artifacts/source-state-2026-10-20/`.
PR #80 remains open for independent review; this is author validation only.
The fallback scanner's three new flags are Boolean membership/display predicates
in `IssueSourceState`, not alternative data paths; the only state source remains
the imported fact. No store/transport/architecture ownership changes. Capability
tips checks passed with existing anchor warnings; the opt-in preview's state
controls are self-describing and retain the existing `tips_exempt` scope.

## First full classification and category browsing — 2026-10-20

Accepted source: `thread_mucwsgsjtlbabfcq#0001792467519190-000035-6016964e`;
implementation reassigned to 砚砚 by `0001792468889994-000066-b4e4fc29`.
The operator asked for current issues, a first classification visible by category,
and existing Feature bindings to take precedence. PR #80 remains open; no merge.

- Fresh public catalog at **04:03 UTC**: **813** issues, **288 open / 525 closed**.
  All **708 unbound titles** received one primary proposal, including **4 待澄清**.
  **105 issues / 32 explicit Features** remain Feature-routed. Full source metadata,
  labels, body hashes, taxonomy and the unaccepted proposals ship in
  `data/first-classification.v1.json`; the historical twelve-result seed is unchanged.
- Method: GPT-6-astra title-first semantic review, selected ambiguous body reads.
  Comments were not reviewed. Type/environment supplement explicit source/title
  markers; symptom remains empty. No trained model, automated continuous classifier,
  measured accuracy, confidence scores or automatic acceptance is claimed.
- Queue **按类别查看** and overview category counts/search/state filters expose the
  results. **随 Feature 处理** opens Feature subgroups; title references and bare
  `feature` do not bind. The overview pages 40 cards at a time. Adding a source
  Feature label suppresses an older candidate on refresh, without deleting local work.
- The isolated example Host now uses the exported paginated READ engine and the
  canonical `gh` CLI (fixed `github.com` and repository) instead of expired port 3192.
  Cache/detail archives remain within its explicitly supplied isolated dataRoot.
  No production configuration, remote labels, SDK contract or runtime dependency changed.

Verification:

- Core Feature-precedence regression observed RED, then GREEN; UI category journey
  likewise failed on the missing category control before export, then passed.
- Build, TypeScript, boundary/export hash checks; **5 sync + 19 source/port +
  15 UI + 1 corpus integrity** tests passed.
- Actual packed tgz: three browser journeys and a clean consumer passed.
  They cover category/Feature filtering, mixed-case and multiple bindings, generic
  feature handling, refresh withdrawal, manual tag preservation, explicit save/reload,
  source revocation, mobile layout, existing fuzzy linking and source detail paging.
- A new public READ Host test verifies cold load, cache after restart, refresh,
  immutable comment page continuation and explicit isolated storage.
- Real-data dogfood used `http://localhost:5196` from the packed preview in
  `/Users/yuki/.cat-cafe/preview-builds/issue-coordination-v1`. It read **813 public +
  2 clearly marked synthetic** issues; checked every primary category count,
  opened **F113**'s 12 issues with no semantic candidate cards, searched **#1591**,
  fetched its actual body, and checked desktop 1440px / mobile 390px rendering.
  Zero page errors or horizontal mobile overflow. Evidence:
  `artifacts/classification-2026-10-20/live-journey.json` and screenshots in that folder.
  Synthetic persistence tests use disposable stores; live dogfood does not save notes.
- Before restarting the expired preview, its recorded data directory
  `/Users/yuki/.cat-cafe/preview-data/issue-coordination-v1` did not exist.
  No old-note recovery or before/after preservation claim is made for that missing
  directory. Other origins and stores were not migrated or modified.

Ownership: existing Issue workbench model/UI/read-source cell, no map expansion.
Core export is pinned to `21c6f12e9bcc3d1308f92d0b2584835b1071eb5b`.
Package data and acceptance Host remain plugin-owned.
Core capability-tip checks passed with existing unrelated anchor warnings.
The architecture-ownership command is absent in this checkout, not recorded as
passed. The fallback scan covers the entire historical branch and flags logical
predicates/sort tie-breakers as well as recovery. The new grouping helpers add a
counter initialization, a deterministic tie-breaker and a Feature/unavailable
predicate, not chained fallback tiers. The Host has a single persisted-cache read
and explicit refresh path; it removes the dependency on a second preview server.
`tips_exempt: Pre-SDK standalone package; its entry/action is documented in this package README, not registered in the Core capability-tip catalog.`
This is author validation. The latest independent review remains outstanding and
historical approvals do not cover this head; production install/cutover is still open.

## Visible classification results — 2026-10-14 (historical)

Core export: `5517539aa1e80a789775c470c2517486150a9d5d`.
Accepted source: `thread_mucwsgsjtlbabfcq#0001791981133558-000152-e727fe85`:
the operator could not see the classification results and asked for the dataset
beside the plugin code. The immutable 12-result JSON now ships in `data/`, not
`docs/evidence`; the plan holds method/future work, not a duplicate sample table.
Gemini's current design is source `0001791981588832-000167-ea9eabec`.

Journey: header **分类结果** (or `?classifications=1`) → overview of all readable
candidates with four facets/excerpts/model/date → select issue → inspect candidate
beside the original body → append to local tag draft → explicitly save → reload.
The desktop drawer uses two columns for comparison, mobile one column; this widens
Gemini's narrow drawer without changing its overview/issue/adoption sequence.
Empty facets say not extracted; no fabricated scope/severity/confidence is shown.

Author validation: service test observed RED without results, then GREEN with full
provider/instance/repository/issue identity and per-load grant filtering. The packed
browser test observed RED without the overview, then GREEN across entry, evidence,
stale timestamp notice, preservation of manual tags, no write before save, persisted
reload, mobile selection, Escape, and disappearance after grant withdrawal. The tgz
consumer asserts the 12 unaccepted proposals ship with the package. The browser
bundle does not embed the public seed; only the example Host loads it.

Build and typecheck/export-boundary lint passed. Five sync, 19 source/port and 15
existing UI tests passed; all three packed browser journeys and the clean Node
consumer passed. Exact Core export check reports `changed: []`. Real public-data
dogfood rendered 12 results across 799 readable issues, selected #1591, loaded its
body and checked its installation/build + plugin classification at 1440 and 390px.
Desktop/mobile/dark screenshots were inspected; no page errors or horizontal
mobile overflow, no local work writes or remote mutations. Evidence is in ignored
`artifacts/classification-live-*`; synthetic save/reload uses a temporary store.

Risk: new candidate display and explicit draft action; no store migration, remote
write, grant policy, production configuration, external dependency or SDK change.
Ownership stays in the existing Core business/UI export and Plugins Host/package.
Architecture checker remains unavailable (missing script); capability-tips passed
with existing unrelated anchor warnings. Fallback scan's new nullish cases are
empty optional result collections / absent cached catalog / absent facet text;
they preserve one source of truth and add no new recovery path. Existing grant and
cached-read checks remain intact. No root media artifacts were added.

This fixes visible delivery of the initial sample, not full-corpus model generation,
accuracy validation, structured acceptance/rejection history or installed-plugin
acceptance. The broader feature and PR remain open. This is author evidence; no new
independent approval, merge or release is claimed.

## Related-issue search — 2026-10-14

Core export: `2408d14ac01714dbe1be3641ea7a3a70223e4158`.
Operator request: `thread_mucwsgsjtlbabfcq#0001791979112333-000149-a8f89545`.
Replace the unsearchable related-issue select with a searchable combobox. Partial
text matching covers title, source name and issue number; space-separated terms
must all match. Matching normalizes character width/case and ranks exact numbers
before partial numbers. This is local text filtering, not semantic similarity or
typo correction. Search covers all currently readable candidates, while the list
renders at most 30 with an explicit count/narrow-query hint. Current issue is excluded.

The full source/issue identity remains the saved target. Editing the input clears
the prior choice; no arbitrary text can become a relation. Results show source,
number and title; arrows/Enter select, Escape closes, and clear resets the query.
IME confirmation cannot select or submit. Revocation removes the choice and label;
restoring access does not silently reinstate it. Relation persistence and existing
source permissions are unchanged; no new dependency or remote search is added.

RED: the new packed browser journey failed because the old select was not editable.
A second regression reproduced automatic reselection after grant restoration;
clearing an inaccessible selection fixes it. GREEN: the packed journey now uses
803 synthetic issues, finds an item beyond the initial result window, tests multiword
and number/source queries, exact-number ordering, same-number isolation, keyboard,
IME, empty results, clear, save/reload and revoke/restore. Mobile dark rendering was
inspected with no horizontal overflow. Build, typecheck/boundary/hash lint, five
sync tests, exact Core export (`changed: []`), both packed browser journeys and the
clean Node consumer passed. Unchanged source/model unit evidence remains historical.

Ownership stays in the existing Core UI export; Plugins owns the consumer journey
and export mapping. Fallback scanner flags keyboard OR/else-if predicates and the
clear-button visibility condition, not recovery layers or alternate sources.
This is author validation for the same open PR, with no merge or release.

## Layout increment — 2026-10-14

Core export: `e562a37b517deb56c958926f5cae39ed6070efaa`.
PR #80 remains an open development PR; the operator explicitly asked for updates
without merging. The wider installed-plugin and cat-dispatch journey is still open.

The operator reported that the multi-source layout buried the actual work. Gemini's
layout proposal (`thread_mucwsgsjtlbabfcq#0001791977175417-000134-05d89882`)
is implemented as a compact header, queue, independently scrolling reading pane,
and persistent investigation/save pane. At 1050px, reading/investigation switch
beside the queue; at 390px, queue/reading/investigation switch within one viewport.
Drafts survive these switches and the investigation view retains the issue identity.
Source settings are grouped in an expandable panel; errors and synthetic-source
identification stay visible. Comments and secondary evidence fields start folded.
Markdown reuses the existing DOMPurify/URL-validation renderer.

Design adjustments: use the existing semantic controls and source selector; do not
add decorative badges, invented confidence percentages, unimplemented shortcuts or
nonfunctional candidate-adoption buttons. The label seed remains a separate proposal;
model-generated suggestions and accept/reject persistence are not implemented.

Author journey: the packed package configures a source, opens a long Markdown issue,
keeps the save action inside the first viewport, saves evidence, links issues,
reloads, switches between issues/views without losing drafts, then handles one
source failing and its grant being revoked. Source closure and local verification
remain independent. A malicious Markdown event handler does not execute. Desktop,
1050px, mobile and dark screenshots were inspected. The follow-up check also verifies
that mobile settings fit the viewport and notes retain source/number/title.
The new Markdown heading assertion was observed red against the prior artifact;
it now passes. No page errors or horizontal viewport overflow were observed.

Checks this increment: build, typecheck/boundary/hash lint, 5 sync + 18 source/port +
15 existing UI cases, both packed browser journeys and the clean Node consumer all
passed. After the mobile identity/settings adjustment, affected browser/artifact
checks, build/lint and exact Core export check passed again (`changed: []`).
Screenshots are generated under ignored `artifacts/coordination-*`.

Risk: presentation/navigation and safe text rendering; no store schema, permission,
Host port, external dependency or source-platform write changes. Ownership remains
Core business/UI export and Plugins packaging/acceptance Host; architecture map
change: none. The Core ownership checker is unavailable in this checkout (missing
script), not a passing check. Capability-tips check passed with 17 unrelated existing
anchor warnings. Fallback scan flags nullable presentation values (missing body,
base URL, loaded-comment count): these are empty-state defaults within the same
source response, not alternate data sources or layered recovery. Authorization and
request-generation guards are unchanged. No root media artifacts were added.

This is author validation, not a new independent approval. Earlier approval of
`dfd0161d` does not cover this increment. No merge or release was performed.

## Multi-source increment — 2026-10-14

Historical Core export: `228630decccdbbb7e33db159947d924d51074c16`.
The original single-source validation below is historical. New checks run for this
increment: typecheck/boundary/hash lint, 5 sync + 18 source/port + 15 existing UI
cases, manifest validation, and the actual packed multi-source browser journey.
The existing packed single-source browser and clean Node consumer also passed.

The new journey configures a source branch, edits and saves, rejects verification
without evidence, switches without losing drafts, updates without changing drafts,
manually links two issues, reloads, and observes upstream passed/internal pending.
It then fails one source and revokes that source: authorized old data survives
network failure; revoked content and shared relation conclusions disappear.
Foreign Origin and headerless POST are rejected by the isolated example Host.
Screenshots are kept in ignored package `artifacts/coordination-*`.

The store test was observed red before durable persistence, then green after atomic
replacement/revision locking. The orphan-work assertion was observed red when both
live and cached catalogs failed, then green after separating unavailable data from
revoked access. Browser labels failed when restored textarea content entered the
implicit accessible name; explicit labels corrected the real packed journey.
An additional rendered-DOM assertion reproduced duplicate reading panels after
navigation (18 instead of 1): sibling reading and relation views had the same React
key. Distinct prefixes fix the reconciliation failure; the regression is retained.

Risk: authored local data and application ports changed; no SDK/contract, production
data, remote issue write or automatic task dispatch changed. Business implementation
is exported from Core; package mounting, same-origin transport and acceptance Host
remain Plugins-owned. Internal adapters and fixed-SDK installation are not proven.
New local records are stored in the explicitly isolated Host directory. Existing
single-source browser records and label batches remain at their original entry.

This is author validation for an unmerged development trial; it is not a release or
independent reviewer approval. Real internal acceptance awaits its API/repository.

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
