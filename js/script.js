(() => {
  "use strict";

  /* =========================================================
     CONFIG
  ========================================================= */
  const FRAME_COUNT = 100;
  const FRAME_PATH = (i) => `./assets/coffee/frame   (${i}).webp`;
  const MAX_DPR = 2;

  const canvas = document.getElementById("coffeeCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });

  const loader = document.getElementById("loader");
  const loaderBar = document.getElementById("loaderBar");
  const loaderPercent = document.getElementById("loaderPercent");

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  /* =========================================================
     STATE
  ========================================================= */
  const images = new Array(FRAME_COUNT);
  let loadedCount = 0;
  let currentFrame = 0;
  let targetFrame = 0;
  let dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  let viewportW = window.innerWidth;
  let viewportH = window.innerHeight;
  let ticking = false;
  let ready = false;

  /* =========================================================
     CANVAS SIZE
  ========================================================= */
  function resizeCanvas() {
    viewportW = window.innerWidth;
    viewportH = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

    canvas.width = Math.round(viewportW * dpr);
    canvas.height = Math.round(viewportH * dpr);
    canvas.style.width = viewportW + "px";
    canvas.style.height = viewportH + "px";

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    drawFrame(currentFrame, true);
  }

  /* =========================================================
     DRAW — cover-style crop, like background-size: cover
  ========================================================= */
  function drawFrame(index, force) {
    const img = images[index];
    if (!img || !img.complete || img.naturalWidth === 0) return;
    if (!force && index === lastDrawnIndex) return;

    const imgRatio = img.naturalWidth / img.naturalHeight;
    const viewRatio = viewportW / viewportH;

    let drawW, drawH, offsetX, offsetY;

    if (imgRatio > viewRatio) {
      // image is wider than viewport -> match height, crop sides
      drawH = viewportH;
      drawW = drawH * imgRatio;
      offsetX = (viewportW - drawW) / 2;
      offsetY = 0;
    } else {
      // image is taller than viewport -> match width, crop top/bottom
      drawW = viewportW;
      drawH = drawW / imgRatio;
      offsetX = 0;
      offsetY = (viewportH - drawH) / 2;
    }

    ctx.fillStyle = "#0b0806";
    ctx.fillRect(0, 0, viewportW, viewportH);
    ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
    lastDrawnIndex = index;
  }
  let lastDrawnIndex = -1;

  /* =========================================================
     PRELOAD
  ========================================================= */
  function preloadImages() {
    return new Promise((resolve) => {
      let settled = 0;

      const onSettle = () => {
        settled++;
        loadedCount = settled;
        updateLoaderUI();
        if (settled >= FRAME_COUNT) resolve();
      };

      for (let i = 1; i <= FRAME_COUNT; i++) {
        const img = new Image();
        img.decoding = "async";
        img.onload = onSettle;
        img.onerror = onSettle; // don't block loading on a missing frame
        img.src = FRAME_PATH(i);
        images[i - 1] = img;
      }
    });
  }

  function updateLoaderUI() {
    const pct = Math.round((loadedCount / FRAME_COUNT) * 100);
    loaderBar.style.width = pct + "%";
    loaderPercent.textContent = pct + "%";
  }

  function hideLoader() {
    loader.style.opacity = "0";
    loader.style.pointerEvents = "none";
    window.setTimeout(() => {
      loader.style.display = "none";
    }, 700);
  }

  /* =========================================================
     SCROLL -> FRAME MAPPING
  ========================================================= */
  function getScrollProgress() {
    const scrollHeight =
      document.documentElement.scrollHeight - window.innerHeight;
    if (scrollHeight <= 0) return 0;
    const progress = window.scrollY / scrollHeight;
    return Math.min(Math.max(progress, 0), 1);
  }

  function onScroll() {
    if (prefersReducedMotion) return;
    const progress = getScrollProgress();
    targetFrame = Math.round(progress * (FRAME_COUNT - 1));

    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(renderLoop);
    }
  }

  function renderLoop() {
    ticking = false;
    if (targetFrame !== currentFrame) {
      currentFrame = targetFrame;
      drawFrame(currentFrame, false);
    }
  }

  /* =========================================================
     RESIZE (debounced via rAF)
  ========================================================= */
  let resizeQueued = false;
  function onResize() {
    if (resizeQueued) return;
    resizeQueued = true;
    window.requestAnimationFrame(() => {
      resizeQueued = false;
      resizeCanvas();
    });
  }

  /* =========================================================
     MOBILE MENU
  ========================================================= */
  function initMobileMenu() {
    const toggle = document.getElementById("menuToggle");
    const menu = document.getElementById("mobileMenu");
    if (!toggle || !menu) return;

    let open = false;

    function setOpen(next) {
      open = next;
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      menu.style.maxHeight = open ? menu.scrollHeight + "px" : "0px";

      const lines = toggle.querySelectorAll(".hamburger-line");
      if (lines.length === 3) {
        lines[0].style.transform = open
          ? "translateY(7px) rotate(45deg)"
          : "translateY(0) rotate(0)";
        lines[1].style.opacity = open ? "0" : "1";
        lines[2].style.transform = open
          ? "translateY(-7px) rotate(-45deg)"
          : "translateY(0) rotate(0)";
      }
    }

    toggle.addEventListener("click", () => setOpen(!open));

    menu.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => setOpen(false));
    });

    window.addEventListener("resize", () => {
      if (open) menu.style.maxHeight = menu.scrollHeight + "px";
    });
  }

  /* =========================================================
     REVEAL ON SCROLL
  ========================================================= */
  function initReveal() {
    const targets = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window) || prefersReducedMotion) {
      targets.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -60px 0px" }
    );

    targets.forEach((el) => observer.observe(el));
  }

  /* =========================================================
     INIT
  ========================================================= */
  async function init() {
    resizeCanvas();
    initMobileMenu();
    initReveal();

    await preloadImages();

    ready = true;
    currentFrame = prefersReducedMotion ? FRAME_COUNT - 1 : 0;
    targetFrame = currentFrame;
    lastDrawnIndex = -1;
    drawFrame(currentFrame, true);

    hideLoader();

    if (!prefersReducedMotion) {
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }

    window.addEventListener("resize", onResize);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
