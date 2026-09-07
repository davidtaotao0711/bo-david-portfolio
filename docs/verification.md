# Local verification — 2026-09-06

Flow: local project data → generated responsive image assets → Index / Overview → project viewer → image/project navigation → restored archive context.

## Reference comparison

Reference and local site observed at 1440×900 and 390×844 with screenshots and rendered DOM measurements. Compared navigation positions, type size, thumbnail width/gaps, natural-ratio row alignment, image scale, whitespace, and mobile layout. Browser screenshots were displayed during the task; reference photographs were not downloaded into this project.

| Measurement | Reference | Local |
| --- | --- | --- |
| Desktop type | 13px / 14.3px | 13px / 14.3px |
| Mobile type | 12px | 12px |
| Desktop Overview | 10 columns; ~126.7px width; 13px gaps | 10 columns; 126.675px; 13px gaps |
| Mobile Overview | 4 columns; ~75px; 12px gaps | 4 columns; ~75.1px; 12px gaps |
| Mobile Index | 2 columns; ~162px | 2 columns; ~162.2px |
| Desktop 4:5 Viewer | 596×745px, x422/y77.5 | 596×745px, x422/y77.5 |
| Surface | rgb(250,250,250) | rgb(250,250,250) |

Intentional differences: BO DAVID uppercase navigation, 6 projects / 72 pure-color studies; wider variety of source ratios changes individual row heights. Arial substitutes the reference's unresolved licensed font. Viewer excludes side thumbnails and extra Project Overview UI per the brief. Real photographic color/detail and perceived density require a later review once BO DAVID photographs are imported.

## Interaction evidence

- Overview thumbnail opens the correct `/<slug>?s=n` image.
- ArrowRight changed `s=1` to `s=2`; reload preserved image 3; Back returned to `s=1`, Forward to `s=2`.
- Viewer navigation separates Previous/Next **image** hit zones from Prev/Next **project** links.
- Xinjiang → next image → Shanghai → Escape returned to `/?mode=overview&slug=xinjiang`, exact recorded scroll **656.7999877929688px**, and focus `photo-xinjiang-01`.
- An initial apparent scroll discrepancy came from locator automation centering the target before click. Repeated using a physical coordinate click verified exact restoration.
- Reloading a viewer preserves the original entry context in its history entry; direct links have an Index fallback.
- Horizontal touchstart/touchend sequence changed `s=0` to `s=1`. The in-app browser does not support native CDP touch dispatch; this check used browser-generated synthetic TouchEvents, not physical phone hardware.
- Reduced-motion emulation: computed image transition `0s`; left/right image controls still work.
- `/xinjiang?s=999` normalized to `/xinjiang?s=11`, displaying image 12. Invalid/negative/unsafe indices covered by automated tests.
- Index renders 6 project links. Information renders the requested minimal colophon. Missing contact destinations remain plain text.
- Focus indicators, skip link, image alternative text, labeled image controls, live image position announcement, and hidden inactive navigation checked through browser accessibility output. No horizontal overflow at requested sizes.

## Image performance

- All 72 assets validated; five widths × three formats = 1,080 generated files, with embedded tiny WebP placeholders.
- Fresh desktop Overview: 72 generated-image requests, **zero non-320px image requests**. Native lazy loading limits initial requests on mobile.
- Fresh mobile viewer requested only images 12, 1, 2; a swipe added image 3. Active preloads then held only 1, 2, 3. No entire-project preload.
- Current image `fetchpriority=high`; natural image dimensions preserved. AVIF selected in the test browser; WebP and JPEG fallbacks are present in markup.
- No local browser warnings/errors observed in the sampled final flows.

## Build checks

- Each major slice was built and typechecked: Overview foundation; Viewer/static routes; Index/Information; final polish.
- `npm test`: 4 tests passed (deep links, invalid indices, archive context, bounded neighbor loading / wrap-around).
- Dependency upgrade to Astro 7.3.1 and Sharp 0.35.4 resolved initial audit findings; npm reported **0 vulnerabilities** after install.
- Static output: root, Information, six generated project pages, and 404. No adapter or backend required.

Scope: only this new directory was developed. No old photography project was read or modified. No GitHub repository, deployment, Vercel project, or DNS changes were created.
