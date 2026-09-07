# Online editor verification — 2026-09-07

The repository `davidtaotao0711/bo-david-portfolio` is private and independent. The original `bo-photography` repository is accessed only for reading its photo data and originals.

## Implemented behavior

- Static `/editor/` connects directly to GitHub with a fine-grained token granting Contents read/write for the new repository. An optional separate read-only token connects the source repository.
- Tokens remain in tab memory, are cleared on disconnect or connection failure, and are never included in deployed files or browser storage.
- Uploads commit image blobs and project metadata together. Sorting and cover changes create versioned commits. Non-fast-forward updates are rejected instead of overwriting another editor's changes.
- GitHub source sync preserves existing order and covers, and repeated sync does not duplicate photos or create an unnecessary commit.
- Local development retains its local-file editor. The production build exports a separate GitHub-backed editor, and removes raw originals only from the verified build output directory.
- Vercel configuration supports Git-triggered publication. Photo derivatives are reused through the framework's dependency build cache when available.

## Checks

- `npm test`: 12 tests passed, including online authentication, upload transaction, ordering, conflict rejection, and separate source credential/idempotence.
- `npm run typecheck`: 28 files checked; no errors, warnings, or hints.
- Production build: 320 image records validated, 15 Astro pages built, online editor bundled, raw originals excluded from public output.
- A real GitHub session loaded the private repository, saved a photo order/cover change, restored the exact original data, and performed a no-change source sync. Test commits were fast-forwarded into the local checkout.
- Browser verification covered the hosted login layout and rejection of an invalid token. A browser-specific unbound `fetch` issue was corrected and rechecked. Real credentials were tested through the same client in Node; an authenticated browser session was not used.
- Local development smoke check returned HTTP 200 for the bundled editor script and loaded all 12 projects through the local state endpoint.

## Deployment status

Vercel's import page was reachable but logged out. Hosted publication and Git-triggered rebuilding have not yet been verified on Vercel. Login and private-repository import are the remaining setup steps; `/editor/` becomes available at the deployed site's URL after a successful build.

Earlier verification documents describe the local-only editor at that time. This document records the added production editor and current deployment limits.
