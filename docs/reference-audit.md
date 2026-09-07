# Reference audit — 2026-09-06

Observed in a browser at 1440×900 and 390×844. Reference: https://www.maxmiechowski.com/?mode=overview&slug=tunisia . No reference assets or source code copied.

- Navigation: fixed identity upper left, current mode/project centered on desktop, links upper right. Mobile hides the center label; viewer replaces identity with project title. Index links to `/?mode=grid`, Overview to `/?mode=overview`, Information to `/information`.
- Margins / color: desktop 13px outer/header inset, first image at y=40px; mobile 12px. Background measured rgb(250,250,250). Grid occupies about 97% desktop / 90% mobile width, with extra right breathing room.
- Typography: rendered family alias `stand-font`; desktop 13px / 14.3px, normal tracking; mobile 12px. Exact licensed family unresolved; use system Arial/Helvetica with these metrics. User requires uppercase BO DAVID and navigation.
- Overview: 10 columns desktop (~126.7px image width, 13px gaps), 4 mobile (75px images, 12px gaps). Natural ratios, bottom-aligned row cells; blank cells separate projects. Not masonry. Landscape cells leave space above. Other projects become pale around project hover/selection.
- Index: 5 columns desktop (~266px covers), 2 mobile (~162px), mixed natural ratios and occasional empty cells. Same grid vocabulary at double scale.
- Viewer: white/off-white canvas, centered contained image. Observed portrait 596×745 at x422/y77.5 desktop; ~370×464 centered mobile. Reference includes adjacent previews and Project Overview link; omit those per user request. Prev/Next refer to adjacent projects; image position uses zero-based `s`.
- Information: small centered colophon just below header, otherwise almost entirely empty.
- Motion: computed durations include 100/300/500/700ms; visually quiet fades and layout changes. Implement 320ms transitions (user's 250–450ms range), reduced-motion fallback.
- URL/state: `mode=overview` selects contact sheet; `slug=tunisia` positions/highlights a project, not a filter removing others. Clicking second Tunisia thumbnail opened `/tunisia?s=1`. Refresh preserved that image. Close before refresh retained Overview mode; after direct viewer reload reference Close defaulted to Index. Back/Forward traversed viewer and grid. Implement stronger persisted return context, exact scroll restoration, and predictable image history as requested.
- Interaction uncertainty: test clicks outside the reference image and ArrowRight did not advance in sampled states. Do not infer support from that; implement and test explicit left/right hit zones, arrows, Escape, swipe in this project. Reference loading uses srcset/sizes, but observed mobile overview sizes requests 500px; our pipeline must use small thumbnail variants instead.

Implementation priorities: match measured layout proportions; honor user's simpler viewer, 6 dummy projects, local-only architecture, and stronger image/history requirements where they differ from the reference.
