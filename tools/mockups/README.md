# JobMatch iPhone 16 Pro Max Mockup Generator

Captures 27 screenshots (17 Seeker + 10 Employer) at **440 × 956 pt @ 3× DPR (1320 × 2868 px raw)** and composites each into a CSS-built titanium iPhone 16 Pro Max frame with status bar (`9:41`), Dynamic Island, and home indicator.

## Usage

```bash
# 1. Serve web/ locally on port 5173
python3 -m http.server 5173 --directory ../../web

# 2. Install Playwright (isolated from web/)
npm install

# 3. Run capture (pass demo password via env var — never commit secrets)
JM_DEMO_PW="<demo-password>" node capture.mjs
```

Outputs:
- `docs/guide/screenshots/seeker-01-*.png` … `seeker-17-*.png`
- `docs/guide/screenshots/employer-01-*.png` … `employer-10-*.png`
- `docs/guide/screenshots/manifest.json`
- `docs/guide/screenshots/gallery.html`
- `docs/guide/screenshots/gallery.png`
