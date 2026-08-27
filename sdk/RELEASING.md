# Releasing the Pons SDK

The source manifest always contains the intended stable semantic version. The
release workflow derives the release-candidate version and owns both npm
dist-tags:

| Git ref | Published version | Dist-tag |
| --- | --- | --- |
| `release/vX.Y.Z` branch creation | `X.Y.Z-rc` | `rc` |
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
5. Create `release/vX.Y.Z` at that reviewed `main` commit. Branch creation
   publishes `X.Y.Z-rc` once; branch-only commits and later pushes do not
   publish.
6. Verify the public RC channel:

   ```bash
   npm view @reptilianhq/pons-sdk@rc version
   pnpm add @reptilianhq/pons-sdk@rc viem
   ```

Package versions are immutable. If the RC is rejected, do not overwrite it.
Update the intended stable version and create the corresponding new release
branch.

## Stable release

1. Confirm the accepted RC package reports the intended commit as its `gitHead`,
   that commit is contained in `main`, and `npm test` passes on that commit.
2. Tag the same RC commit `vX.Y.Z` and push the tag. Do not create
   `vX.Y.Z-rc`; the RC is the package published from the release branch.
3. Verify the stable channel:

   ```bash
   npm view @reptilianhq/pons-sdk@latest version
   pnpm add @reptilianhq/pons-sdk@latest viem
   ```

The workflow rejects mismatched branch, tag, and manifest versions, requires
the stable tag to identify the immutable `gitHead` recorded by the published RC,
verifies the selected dist-tag resolves to the newly published version, and
fails if the GitHub package is not public.
