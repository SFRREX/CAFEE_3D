# Aro Coffee — 3D Scroll Website

A clean, interactive landing page for a coffee brand. As you scroll through the page, a full-screen background animation smoothly plays a coffee pouring sequence.

## How It Works

- **Scroll Animation**: Scrolling up and down scrubs through 50 high-res frames on an HTML5 canvas.
- **Mouse Parallax**: Moving your cursor adds a subtle 3D tilt effect to the scene.
- **Fast Loading**: The first few key frames load right away so the page is ready instantly, while the remaining frames load quietly in the background.

## Tech Stack

- **HTML5 & Vanilla JS** — Lightweight with zero frontend framework overhead.
- **Tailwind CSS** — Modern utility styling.
- **WebP Image Sequence** — 50 optimized frames at 1440p resolution (~3.4 MB total).

## Project Files

- `index.html` — Main website layout and content.
- `js/script.js` — Canvas rendering, scroll tracking, and UI logic.
- `assets/coffee/` — The 50 animation frames (`frame-1.webp` to `frame-50.webp`).
- `src/input.css` — Tailwind source styles.
- `src/output.css` — Compiled CSS loaded by `index.html`.

## Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Watch CSS changes (optional while editing):**
   ```bash
   npm run watch:css
   ```

3. **Run a local server:**
   ```bash
   npx serve .
   ```
   Or using Python:
   ```bash
   python -m http.server 8080
   ```
   Open `http://localhost:8080` in your browser to see the site.
