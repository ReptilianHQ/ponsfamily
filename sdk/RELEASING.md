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
package read access when running the verification commands below.

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
