# Prompt: Fix image previews for the profile picture and every image upload (JobMatch)

## Role and task
You are working in the **JobMatch** repo (`web/` = no-build vanilla-JS PWA, `supabase/` = Postgres + Storage).
Fix image previewing so that **what the user sees before upload, right after upload, and afterwards is always the same image, in the same crop, and never a broken icon or an endless placeholder**. Start with the **seeker profile picture**, then apply the same fix to **every image upload in the app**.

Do not redesign pages. Keep the existing `JM.*` patterns, design tokens and copy. No new libraries or build step.

---

## 1. What already exists (don't rebuild it)
- `web/js/core.js`
  - `JM.img({...})` renders a wrapper `.jm-img` with an initials/icon placeholder plus `<img class="jm-img-el">`, which stays `opacity:0` until the wrapper gets `.loaded`.
  - `JM.hydrateImages(root)` signs private URLs in a batch (`createSignedUrls`, 1 h, cached in `JM.urlCache`) and binds `onload`/`onerror`.
  - `JM.getUrl`, `JM.publicUrl`.
  - `JM.uploadBtn` → `JM.previewFile` (crop/zoom modal) → `JM.actions.pvconfirm` → `JM.compressCrop` (canvas) → calls the field's `JM.inputs.*` handler with `el._pvExtra = { file, blobUrl, focus, … }`.
  - `JM.actions.mediaview` / `JM.actions.imgview` open full-size preview modals.
- CSP in `web/_headers`, `firebase.json` and `web/vercel.json` already allows `img-src … blob: https://repxbwvcylwbscdklyli.supabase.co`. Keep it. **Inline `onload=` attributes are blocked by CSP** (`script-src 'self'`), so bind events in JS.

## 2. Bugs to fix (verified in the current code)

| # | Bug | Where | Effect the user sees |
|---|-----|-------|----------------------|
| B1 | **The crop preview doesn't match the uploaded crop.** The modal moves the image with CSS `object-position` + `transform: scale(zoom)` around the frame **center**, but `compressCrop` crops with its own `fx/fy/zoom` math. Dragging also does nothing on an axis that doesn't overflow in CSS, yet it shifts the canvas crop. | `JM.previewFile` (pv-frame drag/zoom), `JM.compressCrop` | The uploaded profile picture is framed differently from what they chose |
| B2 | **The crop is silently skipped** if the `<img>` in the modal hasn't decoded yet when Confirm is pressed (`imgEl.complete && naturalWidth > 0` check). | `JM.actions.pvconfirm` | The original, uncropped photo gets uploaded |
| B3 | **The optimistic preview uses the wrong blob, and frees it too early.** `blobUrl: p.url` is the *original* file (uncropped), and `pvconfirm` revokes it after **2 s** in `finally`, while the upload can still be running. | `pvconfirm`, `JM.inputs.media` (`_avatarBlob`, `_photoBlob`), `JM.inputs.jobphoto` (`_photoBlob`) | Wrong framing during upload, then the image vanishes or falls back to initials mid-upload |
| B4 | **The output format isn't allowed by the target bucket.** `compressCrop` prefers **WebP**, but the `resumes` bucket allows only pdf/doc/docx/**jpeg/png**, and `verification-docs` only **pdf/jpeg/png**. `docPick` even `accept`s `.webp`. | `compressCrop`, `uploadDoc`, `JM.inputs.resume` / `revresume` / `doc` / `compdoc` | Upload fails with a MIME error, so there's no image |
| B5 | **The professional photo is previewed with `shape:'contain'`** (whole image) but displayed as a **3:4 portrait cover**. | `SEC.photos` in `web/js/seeker.js` | The saved thumbnail crops differently from the preview |
| B6 | **Logos lose transparency.** `compressCrop` always fills the canvas white. | `compressCrop` | Transparent PNG logos turn into white squares inside the circle |
| B7 | **Images get stuck on the placeholder.** `.jm-img-el` only becomes visible once `hydrateImages` binds it. Any render path that inserts `JM.img(...)` HTML without calling `JM.hydrateImages` (deck redraws, list re-renders, `updateBubble`, partial `innerHTML` updates) leaves the initials forever. Signing errors (`row.error`, a deleted object) are swallowed silently. | `JM.img`, `JM.hydrateImages` | Initials or a grey box instead of the uploaded picture |
| B8 | **The full-size preview modals** (`mediaview`, `imgview`) insert a bare `<img>` with no loading or error state. | `core.js` | A blank or broken flash before the image appears, or a broken icon if the URL fails |

## 3. Required behavior

### 3.1 One crop model, used by both preview and output (fixes B1, B2)
Replace the CSS-transform preview with a single state object, `{ zoom ≥ 1, cx, cy }` (center of the crop in image pixels), and **one function** that turns it into a source rectangle:
```
cropRect(state, naturalW, naturalH, targetRatio) -> { sx, sy, sw, sh }   // always fully inside the image
```
- **Preview:** draw that rectangle into a `<canvas>` sized to the frame (×`devicePixelRatio`) on every drag/zoom change, using `requestAnimationFrame`. Alternatively, position an absolutely-placed `<img>` with width/height/left/top computed from the same rect. Either way, the preview **must be computed from `cropRect`**.
- **Output:** `compressCrop` calls the **same** `cropRect`, so the uploaded file is pixel-for-pixel the framing shown.
- **Clamp** so the image always covers the frame (no empty edges). The initial state is centered and fully covers the frame.
- **Interactions:**
  - drag with mouse or touch (pointer events, `touch-action:none`)
  - pinch-zoom with two pointers
  - mouse-wheel zoom, plus the existing slider
  - a **Reset** button
- Disable **Confirm upload** until `await img.decode()` resolves. If decoding fails, show "This image can't be read. Try a JPG or PNG." and keep the modal open.

### 3.2 Per-target shapes and output (fixes B4, B5, B6)
Add one config map in `core.js` and use it from every upload button (pass `target:` instead of loose `shape`):

| target | Field / handler | Bucket (public?) | Crop shape | Output size | Output type |
|---|---|---|---|---|---|
| `avatar` | Seeker profile picture – `JM.inputs.media` kind `avatar` | `seeker-media` (private) | circle, 1:1 | 512×512 | WebP → JPEG fallback |
| `photo` | Professional photo – kind `photo` | `seeker-media` | **portrait 3:4** (change from `contain`) | 900×1200 | WebP → JPEG |
| `cert` | Certificate image – kind `cert` | `seeker-media` | none (contain) | longest side ≤ 2000 | WebP → JPEG; PDFs untouched |
| `resume` | Résumé image – `resume`, `revresume` | `resumes` | none | longest side ≤ 2000 | **JPEG only** |
| `logo` | Company logo – `JM.inputs.emplogo` | `company-logos` (public) | circle, 1:1 | 512×512 | **PNG or WebP with alpha, no white fill** |
| `jobphoto` | Job listing photo – `JM.inputs.jobphoto` | `job-photos` (public) | 4:3 | 1600×1200 | WebP → JPEG |
| `vdoc` | Verification/company docs – `doc`, `compdoc` | `verification-docs` | none | longest side ≤ 2000 | **JPEG only**; PDFs untouched |

- Only output a type the bucket accepts. The upload `contentType` and the file extension must match the real blob type.
- Remove `.webp` from `accept` where the bucket doesn't allow it, or convert it to JPEG before upload.
- Compress until the file is under 5 MB (step quality 0.86 → 0.7, then downscale). Only then show the size error.
- Keep the HEIC message and the 5 MB rule. Read the file through an `<img>` so phone photos keep their EXIF orientation (`image-orientation: from-image`).

### 3.3 Optimistic preview with the *cropped* blob (fixes B3)
- After cropping, create the blob URL from the **output file** (`URL.createObjectURL(outFile)`) and pass that as `blobUrl`.
- Show it immediately in the field's thumbnail (profile hero, Photos section, top-bar avatar, job form, company page) with a small uploading overlay (spinner + "Uploading…").
- **Never revoke on a timer.** Revoke only after the storage URL for the new path has loaded (`load` event on the replacing image), or when the upload fails (then restore the previous image and show a toast).
- **Seed the URL cache** after a successful upload so the next render is instant and doesn't flash: for private buckets, sign the new path once and store it in `JM.urlCache`; for public buckets, use `getPublicUrl` + `?v=<timestamp>` to bust the CDN cache on replace.

### 3.4 Images that always resolve (fixes B7)
- Make hydration automatic instead of opt-in:
  1. a single **capture-phase** `document.addEventListener('load', …, true)` and `('error', …, true)` that handles any `img.jm-img-el` (adds `.loaded` to its wrapper, runs the retry/fallback). These events don't bubble, but capture works, and it covers images bound at any time.
  2. a **`MutationObserver`** on `#app` and `#overlay-root` that calls `JM.hydrateImages(addedNode)` for new `.jm-img` nodes (debounced to one call per frame).
  Keep explicit `JM.hydrateImages` calls where they already exist. They become harmless no-ops.
- On error: retry once with a fresh URL (re-sign, or `?t=` for public). If it still fails, keep a **clean placeholder** (initials for people, the company initial for logos, the gradient + icon for job photos), log `console.warn('[img]', bucket, path, reason)`, and never show the browser's broken-image icon or alt text.
- Treat a `createSignedUrls` row with `error` the same way (placeholder + warn).
- If `.loaded` is never added within 10 s, show the placeholder and leave the `<img>` in place in case it loads late.

### 3.5 Full-size preview modal (fixes B8)
`mediaview` and `imgview` render the image through `JM.img({ shape:'contain', … })` (or the same loader logic), sized `max-height: 70vh`:
- a skeleton while loading
- an error state ("Couldn't load this image." + **Retry** button)
- PDFs keep the existing "Open PDF" button

## 4. Profile picture: exact expected result
1. **Upload** → crop modal with a 1:1 circle frame. Drag, pinch, wheel or slider to frame it. Confirm is enabled only once the image has decoded.
2. **Confirm** → the modal closes right away. The cropped circle shows instantly in **(a)** the "Your profile" hero avatar, **(b)** the Photos section thumbnail and **(c)** the top-bar/shell avatar, with an uploading overlay.
3. **Upload finishes** → the overlay disappears, with no flicker, no placeholder flash and no broken icon. The image is identical to what was framed.
4. **Reload the page / come back an hour later** → the same picture loads (signed URL re-issued from the cache logic).
5. **Replace** → the old file is deleted only after the new upload and DB update succeed. **Remove** → the initials placeholder shows everywhere.
6. Clicking the avatar opens the full-size preview with a loader.

## 5. Constraints
- Only touch `web/js/core.js`, `web/js/seeker.js`, `web/js/employer.js`, `web/js/admin.js` (if it renders images), `web/css/app.css`, and, only if a bucket MIME list truly needs widening, a new `supabase/migrations/012_storage_mime.sql`. Prefer converting on the client over widening buckets.
- Keep privacy: `seeker-media`, `resumes` and `verification-docs` stay private, served by signed URLs only.
- Remove dead code you replace (the old CSS-transform crop, the duplicate `.thumb` rules if unused).
- Bump `web/sw.js` `CACHE` from `jobmatch-shell-v11` to **`jobmatch-shell-v12`** so installed PWAs get the fix.

## 6. Before you finish: verify
- Check that migration `011` is applied on the live project (the `job-photos` bucket exists with jpeg/png/webp) and that the deployed host serves the updated CSP header.
- Test manually on desktop Chrome, iOS Safari and Android Chrome, with a hard refresh after the SW bump:
  - [ ] Profile picture: framing in the modal = uploaded result (compare a photo with an off-center face at zoom 1× and 2×).
  - [ ] Confirm on a large photo immediately after picking: the crop still applies.
  - [ ] Slow network (DevTools "Slow 4G"): the cropped preview stays visible for the whole upload, with no flash, then swaps to the server image.
  - [ ] Professional photo: 3:4 crop modal, and the saved thumbnail matches.
  - [ ] Company logo with a transparent PNG: transparent, not a white square.
  - [ ] Job photo: 4:3 crop matches the Discover card.
  - [ ] Résumé image and verification-doc image upload succeed (JPEG), and PDFs still upload untouched.
  - [ ] Delete an object in Storage, then reload: a clean placeholder and a console warning, no broken icon.
  - [ ] Keep the profile open for over 1 h, then re-render: images still load.
  - [ ] Full-size preview modal shows a loader, then the image. A failed URL shows Retry.
- Report back with a short list of what changed per file and anything you couldn't verify.
