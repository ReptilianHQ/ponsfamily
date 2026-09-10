# Releasing the Pons SDK

The source manifest always contains the intended stable semantic version. The
release workflow derives the release-candidate version and owns both npm
dist-tags:

| Git ref | Published version | Dist-tag |
| --- | --- | --- |
| each push to `release/vX.Y.Z` | next `X.Y.Z-rc.N` | `rc` |
| `vX.Y.Z` tag on the commit recorded by the published RC | `X.Y.Z` | `latest` |

GitHub Packages requires authentication even when the package is public. Set
the `@reptilianhq` registry to `https://npm.pkg.github.com` and use a token with
package read access when running the verification commands below. Version 0.5
also requires access to the private shared Uniswap SDK; grant the Pons repository
read access under that package’s Manage Actions access settings before release.
Public package visibility does not confer access to private dependencies.

## Release candidate

1. Set `sdk/package.json` to the intended stable `X.Y.Z` version. Never commit an
   `-rc` suffix.
2. Move the release notes from `Unreleased` into the matching `X.Y.Z` changelog
   section.
3. Run `npm ci` and `npm test` from `sdk/`.
4. Merge the release preparation into `main`.
5. Create `release/vX.Y.Z` at that reviewed `main` commit. A retry for the same
   source commit repairs its existing candidate's `rc` dist-tag; a new source
   commit selects one greater than the highest published `X.Y.Z-rc.N`, then
   publishes that immutable candidate. The commit must already be in `main`.
6. Verify the public RC channel:

   ```bash
   npm view @reptilianhq/pons-sdk@rc version
   pnpm add @reptilianhq/pons-sdk@rc viem
   ```

Package versions are immutable. If an RC is rejected, merge the fix to `main`
and advance the release branch to that reviewed commit. The next push publishes
the next `rc.N`; it never overwrites an earlier candidate. Once `X.Y.Z` is
published, the workflow rejects any additional candidates for that release line.
If a legacy package with the target version has different bytes, publication
fails closed; prepare a fresh source commit and version instead of trying to
replace it. The RC and stable packages have distinct versions, so their tarballs
are not expected to be byte-identical.

## Stable release

1. Confirm the accepted numbered RC package reports the intended commit as its
   `gitHead`, that commit is contained in `main`, and `npm test` passes on that
   commit.
2. Tag the same RC commit `vX.Y.Z` and push the tag. Do not create
   `vX.Y.Z-rc`; the RC is the package published from the release branch.
3. Verify the stable channel:

   ```bash
   npm view @reptilianhq/pons-sdk@latest version
   pnpm add @reptilianhq/pons-sdk@latest viem
   ```

The workflow rejects mismatched branch, tag, and manifest versions, allocates RC
numbers from immutable registry versions under one serialized publisher,
requires the stable tag to identify the `gitHead` of a published numbered RC,
verifies the selected dist-tag resolves to the newly published version, and
fails if the GitHub package is not public.

## Authority boundary

Release-branch and tag pushes run an unprivileged request workflow. A separate
publisher loaded from the default branch validates the remote ref, exact source
SHA, and `main` ancestry before any job receives package-write authority. The
publisher executes only source already contained in `main`; repository writers
who can land changes on `main` remain trusted release authorities.

Publication is retry-safe. The publisher records the prepared tarball's version,
source `gitHead`, and SHA-512 before it publishes. It accepts an existing target
only when those immutable registry facts match, then repairs and verifies the
selected dist-tag without replacing package bytes. A conflicting legacy package
requires a fresh source/version.

## Indexing reference verification

`npm test` builds the catalog, checks generated output with `check:indexing`,
installs the Envio starter's frozen lockfile and runs codegen/type-checking,
exercises generated handler fixtures, and verifies the actual packed manifest
and event ABI exports. `prepublishOnly` also checks drift and the starter.
After changing catalog inputs, run `npm run generate:indexing` and include all
generated artifacts and `dist` in review. Never regenerate during a release
check to hide stale committed output. See [the starter runbook](examples/envio/README.md)
for local startup, replay requirements, and the live reorg smoke boundary.

## Receipt property coverage

Run `npm run test:unit -- src/receipts.hegel.test.ts` for focused receipt checks;
`npm test` includes them in the complete SDK check. Each named property uses
500 derandomized Hegel cases with the example database disabled.

The suite enumerates all 12 single-event verifiers, every expected ABI field,
and each reverted-status representation. Restricted wrong-emitter, sibling-event,
and malformed-event profiles plus mixed profiles generate zero to eight noise
logs. Evidence-free receipts must fail; insertion and reversal of irrelevant
logs must preserve matching evidence. Sibling events use the decoder's own ABI
where available, so a missing event-name check cannot silently accept them.

The launch verifier additionally checks both event expectation sets, token/curve
cross-binding, missing factory or forwarder evidence, and equality/one-unit
boundaries for the opening-buy output floor, plus absolute and partial-fill
curve-buy floor boundaries. Selection requires exactly one decodable event of
the expected name and emitter matching every supplied exact field. Earlier or
later nonmatching events do not affect selection. Multiple matches, including
identical duplicates, fail with `AMBIGUOUS_EVENT`; they never aggregate amounts.
Floor checks apply only after unique selection. The property suite tests these
rules for every verifier and field, including paired atomic-launch evidence.

This extends the Aerodrome pilot using the generator-distribution, swarm-testing,
and shrinking ideas collected at https://tybug.dev/property-testing/.


### Pilot evidence (2026-09-09)

Against Pons baseline `9de781c3d44432b17bad61e460386a1700f6d88f`, the first
193 named receipt cases passed in about 16 seconds locally. Two temporary source
mutations then demonstrated additional detection compared with the baseline's
nine receipt tests:

| Injected fault | Baseline receipt tests | New targeted properties |
| --- | --- | --- |
| Remove the decoded event-name equality guard | All passed | All 12 single-event sibling-noise cases failed |
| Reverse the receipt log scan | All passed | All 43 single-event conflict-field cases failed |

Both faults were restored before final validation. These are injected-fault
experiments, not discoveries of production defects. Five further named cases
cover launch reverted statuses and curve-buy absolute/partial-fill floor
boundaries, bringing the receipt suite to 198 cases. The first-event policy is
unchanged; no runtime SDK source or generated distribution was modified.

After synchronizing main at `c08939a`, `npm test` passed with 335 tests across
14 files, including
198 receipt cases, plus build/distribution drift, artifact, Envio example,
release-document/workflow, pack, `publint`, and ESM package checks. The edited
receipt suite passed a focused TypeScript check with tests included. Root SDK
conformance and workflow-registry checks also passed. A writable temporary npm
cache was used; package versions and lockfiles were unchanged.


### Quote and receipt boundary evidence (2026-09-10)

The first-event behavior described in the historical pilot above is superseded
by unique expectation-based selection. Local verification passed 353 unit tests
in 17 files, including six pair/state regressions, five batched-receipt cases,
and zero-allowance coverage. Property cases now accept later exact matches and
reject duplicate evidence for every single-event verifier and atomic launch.
The pair terms ABI getter was checked against the pinned protocol source
`836f0f97f9a9569855876570d6778501c163c883`.

Build, three indexing-generator tests, artifact checks, 35 release tests,
release-doc checks, packed exports, publint, ESM type resolution, root SDK
conformance and 112 workflow declarations passed locally. Generated `dist`
changes belong in the SDK commit. No funded transaction or package publication
was performed. Before publishing, run the complete `npm test` on the committed
release candidate, then follow the immutable version/RC procedure above.
