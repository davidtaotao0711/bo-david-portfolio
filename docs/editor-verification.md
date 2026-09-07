# Local editor verification — 2026-09-06

The user expanded the first phase to include a simple local photo upload/order editor.

Implemented at `/editor` under the existing `npm run dev` server. The editor is a plain HTML/TypeScript interface, with dev-only middleware for reading and writing local content. It is excluded from the public static build. No account, database or cloud upload is involved.

Verified:

- File chooser accepted a JPEG and persisted its original plus all 15 optimized variants. A second test selected **two files at once**; the UI reached “已上传 2 张照片” and the project increased from 13 to 15 images.
- Fixed a dev-server reload that interrupted multi-file uploads: the editor now loads its own local script without Vite's live-reload client. The portfolio continues to update normally.
- Photo move buttons, cover selection and Save persisted to `projects.json`; reloading preserved both. The public Index rendered `photo-lost-in-tokyo-02` after choosing that image as cover.
- HTML drag/drop event sequence reordered the first two images and enabled Save. The browser tool's coordinate drag did not trigger native HTML dragging, so automated drag verification used a synthetic DataTransfer/DragEvent sequence. Move buttons provide a touch and keyboard alternative.
- 390×844 layout computed two columns with no horizontal overflow; desktop layout checked visually.
- Cross-origin write request returned 403. Stale revision checks prevent an older editor tab from overwriting a newer save.
- Six automated tests passed, including upload/variant generation, atomic data persistence, order integrity, cover selection, placeholder removal and revision conflict handling.
- Each edit saves previous project data in `.cache/editor-history/`; uploaded originals are never deleted by placeholder cleanup.
- UI test changes were restored to the original 72 studies. Three test uploads and generated variants were moved to `.cache/editor-ui-assets/` instead of remaining in the portfolio.

Usage and file locations are documented in `README.md`. Project content now lives in `src/data/projects.json`; `projects.ts` retains the typed public interface.
