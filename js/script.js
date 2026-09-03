(() => {
  "use strict";

  /* =========================================================
     CONFIG & CONSTANTS
  ========================================================= */
  const FRAME_COUNT = 50;
  const FRAME_PATH = (i) => `./assets/coffee/frame-${i}.webp`;
  const MAX_DPR = 2;
  const PRELOAD_TIMEOUT_MS = 3500;

  const canvas = document.getElementById("coffeeCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d", {
    alpha: false,
    desynchronized: true
  });

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
  let displayedFrame = 0;
  let dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  let viewportW = window.innerWidth;
  let viewportH = window.innerHeight;
  let isAnimating = false;
  let lastDrawnIndex = -1;
  let ready = false;

  /* Keyframe Spine (Every 4th frame = ~13 keyframes for instant smooth interaction) */
  const KEYFRAME_STEP = 4;
  const KEYFRAMES = [];
  for (let k = 1; k <= FRAME_COUNT; k += KEYFRAME_STEP) {
    KEYFRAMES.push(k);
  }
  if (!KEYFRAMES.includes(FRAME_COUNT)) KEYFRAMES.push(FRAME_COUNT);

  /* =========================================================
     CANVAS SIZE & DPR
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
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "medium";
    drawFrame(Math.round(displayedFrame), true);
  }

  /* =========================================================
     FIND NEAREST LOADED FRAME
  ========================================================= */
  function getBestAvailableFrame(index) {
    index = Math.max(0, Math.min(FRAME_COUNT - 1, index));
    const direct = images[index];
    if (direct && direct.complete && direct.naturalWidth > 0) {
      return direct;
    }
    // Search outwards for nearest loaded frame
    for (let offset = 1; offset < FRAME_COUNT; offset++) {
      const prev = images[index - offset];
      if (prev && prev.complete && prev.naturalWidth > 0) return prev;
      const next = images[index + offset];
      if (next && next.complete && next.naturalWidth > 0) return next;
    }
    return null;
  }

  /* =========================================================
     DRAW — Cover-style cropping with 3D Parallax & GPU acceleration
  ========================================================= */
  let mouseX = 0;
  let mouseY = 0;
  let targetMouseX = 0;
  let targetMouseY = 0;

  function drawFrame(index, force) {
    index = Math.max(0, Math.min(FRAME_COUNT - 1, Math.round(index)));
    if (!force && index === lastDrawnIndex) return;

    const img = getBestAvailableFrame(index);
    if (!img) return;

    const imgRatio = img.naturalWidth / img.naturalHeight;
    const viewRatio = viewportW / viewportH;

    let drawW, drawH, offsetX, offsetY;

    if (imgRatio > viewRatio) {
      drawH = viewportH;
      drawW = drawH * imgRatio;
      offsetX = (viewportW - drawW) / 2;
      offsetY = 0;
    } else {
      drawW = viewportW;
      drawH = drawW / imgRatio;
      offsetX = 0;
      offsetY = (viewportH - drawH) / 2;
    }

    // Apply smooth 3D mouse parallax offset (reduced multipliers for perf)
    offsetX += mouseX * 12;
    offsetY += mouseY * 8;

    // Only clear if image won't cover the full viewport (perf: skip unnecessary fillRect)
    const coversViewport =
      drawW + Math.abs(mouseX * 12) * 2 >= viewportW &&
      drawH + Math.abs(mouseY * 8) * 2 >= viewportH;

    if (!coversViewport) {
      ctx.fillStyle = "#0b0806";
      ctx.fillRect(0, 0, viewportW, viewportH);
    }

    ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
    lastDrawnIndex = index;
  }

  /* =========================================================
     PROGRESSIVE IMAGE LOADING PIPELINE
  ========================================================= */
  function loadSingleFrame(frameNum) {
    return new Promise((resolve) => {
      const idx = frameNum - 1;
      if (images[idx] && images[idx].complete && images[idx].naturalWidth > 0) {
        resolve(images[idx]);
        return;
      }

      const img = new Image();
      img.decoding = "async";
      img.onload = async () => {
        if ("decode" in img) {
          try {
            await img.decode();
          } catch (_) {}
        }
        images[idx] = img;
        resolve(img);
      };
      img.onerror = () => {
        resolve(null);
      };
      img.src = FRAME_PATH(frameNum);
    });
  }

  /* Controlled Concurrency Worker Pool */
  async function loadFramesPool(frameNumbers, maxConcurrency, onProgress) {
    let cursor = 0;
    let completed = 0;

    async function worker() {
      while (cursor < frameNumbers.length) {
        const currentNum = frameNumbers[cursor++];
        await loadSingleFrame(currentNum);
        completed++;
        if (onProgress) onProgress(completed, frameNumbers.length);
      }
    }

    const workers = [];
    const poolSize = Math.min(maxConcurrency, frameNumbers.length);
    for (let i = 0; i < poolSize; i++) {
      workers.push(worker());
    }
    await Promise.all(workers);
  }

  /* Tier 2: Load Keyframe Spine */
  function loadKeyframeSpine() {
    return new Promise((resolve) => {
      let hasResolved = false;
      const finish = () => {
        if (!hasResolved) {
          hasResolved = true;
          resolve();
        }
      };

      const timer = window.setTimeout(finish, PRELOAD_TIMEOUT_MS);

      loadFramesPool(KEYFRAMES, 3, (completed, total) => {
        updateLoaderUI(completed, total);
        if (completed >= total) {
          window.clearTimeout(timer);
          finish();
        }
      });
    });
  }

  /* Tier 3: Idle Progressive Hydration of Remaining Frames */
  function hydrateRemainingFramesProgressively() {
    const keyframeSet = new Set(KEYFRAMES);
    const remaining = [];
    for (let i = 1; i <= FRAME_COUNT; i++) {
      if (!keyframeSet.has(i)) {
        remaining.push(i);
      }
    }

    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(() => {
        loadFramesPool(remaining, 2);
      }, { timeout: 2500 });
    } else {
      window.setTimeout(() => {
        loadFramesPool(remaining, 2);
      }, 500);
    }
  }

  function updateLoaderUI(done, total) {
    if (!loaderBar || !loaderPercent) return;
    const pct = Math.min(100, Math.round((done / total) * 100));
    loaderBar.style.width = pct + "%";
    loaderPercent.textContent = pct + "%";
  }

  function hideLoader() {
    if (!loader) return;
    loader.style.opacity = "0";
    loader.style.pointerEvents = "none";
    window.setTimeout(() => {
      loader.style.display = "none";
    }, 600);
  }

  /* =========================================================
     SCROLL & 3D PARALLAX LERP ANIMATION LOOP
  ========================================================= */
  function getScrollProgress() {
    const scrollHeight =
      document.documentElement.scrollHeight - window.innerHeight;
    if (scrollHeight <= 0) return 0;
    const progress = window.scrollY / scrollHeight;
    return Math.min(Math.max(progress, 0), 1);
  }

  function startAnimationLoop() {
    if (isAnimating) return;
    isAnimating = true;
    window.requestAnimationFrame(renderLoop);
  }

  function renderLoop() {
    const frameDiff = targetFrame - displayedFrame;
    const mouseDiffX = targetMouseX - mouseX;
    const mouseDiffY = targetMouseY - mouseY;

    const frameDone = Math.abs(frameDiff) < 0.04;
    const mouseDone = Math.abs(mouseDiffX) < 0.005 && Math.abs(mouseDiffY) < 0.005;

    if (frameDone && mouseDone) {
      displayedFrame = targetFrame;
      mouseX = targetMouseX;
      mouseY = targetMouseY;
      drawFrame(displayedFrame, true);
      isAnimating = false;
      return;
    }

    displayedFrame += frameDiff * 0.14;
    mouseX += mouseDiffX * 0.07;
    mouseY += mouseDiffY * 0.07;

    drawFrame(displayedFrame, true);
    window.requestAnimationFrame(renderLoop);
  }

  /* Throttled scroll handler — one RAF per scroll burst */
  let scrollQueued = false;
  function onScroll() {
    if (prefersReducedMotion || !ready || scrollQueued) return;
    scrollQueued = true;
    window.requestAnimationFrame(() => {
      scrollQueued = false;
      const progress = getScrollProgress();
      targetFrame = progress * (FRAME_COUNT - 1);
      startAnimationLoop();
    });
  }

  function initCursorParallax() {
    if (window.matchMedia("(pointer: coarse)").matches || prefersReducedMotion) return;
    let parallaxQueued = false;
    window.addEventListener("mousemove", (e) => {
      if (parallaxQueued) return;
      parallaxQueued = true;
      window.requestAnimationFrame(() => {
        parallaxQueued = false;
        targetMouseX = (e.clientX / window.innerWidth - 0.5) * 2;
        targetMouseY = (e.clientY / window.innerHeight - 0.5) * 2;
        startAnimationLoop();
      });
    }, { passive: true });
  }

  /* =========================================================
     RESIZE HANDLER
  ========================================================= */
  let resizeQueued = false;
  let lastW = window.innerWidth;
  let lastH = window.innerHeight;

  function onResize() {
    if (resizeQueued) return;
    const newW = window.innerWidth;
    const newH = window.innerHeight;

    // Ignore tiny vertical jitter on mobile address bar show/hide
    if (newW === lastW && Math.abs(newH - lastH) < 80) return;

    resizeQueued = true;
    window.requestAnimationFrame(() => {
      resizeQueued = false;
      lastW = window.innerWidth;
      lastH = window.innerHeight;
      resizeCanvas();
    });
  }

  /* =========================================================
     HEADER SCROLL STATE
  ========================================================= */
  function initHeaderScroll() {
    const header = document.querySelector("header");
    if (!header) return;

    let headerQueued = false;
    function checkHeader() {
      if (headerQueued) return;
      headerQueued = true;
      window.requestAnimationFrame(() => {
        headerQueued = false;
        if (window.scrollY > 25) {
          header.classList.add("header-scrolled");
        } else {
          header.classList.remove("header-scrolled");
        }
      });
    }

    window.addEventListener("scroll", checkHeader, { passive: true });
    checkHeader();
  }

  /* =========================================================
     FULLSCREEN MOBILE DRAWER & ACCESSIBILITY
  ========================================================= */
  function initMobileMenu() {
    const toggle = document.getElementById("menuToggle");
    const drawer = document.getElementById("mobileDrawer");
    if (!toggle || !drawer) return;

    let open = false;

    function setOpen(next) {
      open = next;
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");

      if (open) {
        drawer.classList.add("drawer-open");
        document.body.style.overflow = "hidden";
      } else {
        drawer.classList.remove("drawer-open");
        document.body.style.overflow = "";
      }

      const lines = toggle.querySelectorAll(".hamburger-line");
      if (lines.length === 3) {
        lines[0].style.transform = open
          ? "translateY(7px) rotate(45deg)"
          : "translateY(0) rotate(0)";
        lines[1].style.opacity = open ? "0" : "1";
        lines[1].style.transform = open ? "scaleX(0)" : "scaleX(1)";
        lines[2].style.transform = open
          ? "translateY(-7px) rotate(-45deg)"
          : "translateY(0) rotate(0)";
      }
    }

    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      setOpen(!open);
    });

    drawer.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", (e) => {
        const href = link.getAttribute("href");
        setOpen(false);

        if (href && href.startsWith("#")) {
          const target = document.querySelector(href);
          if (target) {
            e.preventDefault();
            const headerOffset = 70;
            const elementPosition = target.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

            window.scrollTo({
              top: offsetPosition,
              behavior: "smooth"
            });
          }
        }
      });
    });

    // Close on Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && open) {
        setOpen(false);
        toggle.focus();
      }
    });

    window.addEventListener("resize", () => {
      if (open && window.innerWidth >= 1024) {
        setOpen(false);
      }
    });
  }

  /* =========================================================
     ACTIVE NAVIGATION (SCROLLSPY) — Throttled
  ========================================================= */
  function initScrollSpy() {
    const sections = document.querySelectorAll("section[id], footer[id]");
    const navLinks = document.querySelectorAll(".nav-link, .drawer-link");
    if (!sections.length || !navLinks.length) return;

    // Cache section positions (re-compute on resize)
    let sectionData = [];
    function cacheSections() {
      sectionData = [];
      sections.forEach((section) => {
        sectionData.push({
          id: section.getAttribute("id"),
          top: section.offsetTop,
          height: section.offsetHeight
        });
      });
    }
    cacheSections();
    window.addEventListener("resize", cacheSections);

    let spyQueued = false;
    function updateActiveLink() {
      if (spyQueued) return;
      spyQueued = true;
      window.requestAnimationFrame(() => {
        spyQueued = false;
        const scrollPos = window.scrollY + 120;
        let currentId = "";

        for (let i = 0; i < sectionData.length; i++) {
          const s = sectionData[i];
          if (scrollPos >= s.top && scrollPos < s.top + s.height) {
            currentId = s.id;
            break;
          }
        }

        navLinks.forEach((link) => {
          const href = link.getAttribute("href");
          if (href && currentId && href.replace("#", "") === currentId) {
            link.classList.add("active-nav");
          } else {
            link.classList.remove("active-nav");
          }
        });
      });
    }

    window.addEventListener("scroll", updateActiveLink, { passive: true });
    updateActiveLink();
  }

  /* =========================================================
     REVEAL ON SCROLL + ANIMATED COUNTERS — Single Combined Observer
  ========================================================= */
  function initRevealAndCounters() {
    const revealTargets = document.querySelectorAll(".reveal");
    const counterElements = document.querySelectorAll("[data-counter]");

    if (prefersReducedMotion) {
      revealTargets.forEach((el) => el.classList.add("is-visible"));
      // Still animate counters even with reduced motion (they're text-only)
    }

    if (!("IntersectionObserver" in window)) {
      revealTargets.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;

          const el = entry.target;

          // Handle reveal animation
          if (el.classList.contains("reveal") && !prefersReducedMotion) {
            el.classList.add("is-visible");
            // Clean up will-change after animation completes
            window.setTimeout(() => {
              el.style.willChange = "auto";
            }, 800);
          } else if (el.classList.contains("reveal")) {
            el.classList.add("is-visible");
          }

          // Handle counter animation
          if (el.hasAttribute("data-counter")) {
            const targetVal = parseFloat(el.getAttribute("data-counter"));
            const suffix = el.getAttribute("data-suffix") || "";
            const isDecimal = String(targetVal).includes(".");
            const duration = 1400;
            const startTime = performance.now();

            function updateCount(currentTime) {
              const elapsed = currentTime - startTime;
              const progress = Math.min(elapsed / duration, 1);
              const easeOut = 1 - Math.pow(1 - progress, 3);
              const currentVal = targetVal * easeOut;

              el.textContent = isDecimal
                ? currentVal.toFixed(1) + suffix
                : Math.floor(currentVal) + suffix;

              if (progress < 1) {
                requestAnimationFrame(updateCount);
              } else {
                el.textContent = (isDecimal ? targetVal.toFixed(1) : targetVal) + suffix;
              }
            }

            requestAnimationFrame(updateCount);
          }

          observer.unobserve(el);
        });
      },
      { threshold: 0.05, rootMargin: "0px 0px -15px 0px" }
    );

    revealTargets.forEach((el) => observer.observe(el));
    counterElements.forEach((el) => {
      if (!el.classList.contains("reveal")) {
        observer.observe(el);
      }
    });
  }

  /* =========================================================
     TOAST NOTIFICATIONS
  ========================================================= */
  function showToast(title, message, duration = 4000) {
    let toast = document.getElementById("toastNotification");
    if (!toast) return;

    const titleEl = document.getElementById("toastTitle");
    const msgEl = document.getElementById("toastMessage");

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;

    toast.classList.add("toast-show");

    if (window._toastTimeout) {
      window.clearTimeout(window._toastTimeout);
    }

    window._toastTimeout = window.setTimeout(() => {
      toast.classList.remove("toast-show");
    }, duration);
  }

  /* =========================================================
     NEWSLETTER FORM
  ========================================================= */
  function initNewsletter() {
    const form = document.getElementById("newsletterForm");
    if (!form) return;

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = form.querySelector("input[type='email']");
      if (!input || !input.value.trim()) return;

      const email = input.value.trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        showToast("Invalid Email", "Please enter a valid email address.", 3000);
        input.focus();
        return;
      }

      showToast(
        "Welcome to the Aro Club!",
        "Check your inbox for your 15% welcome code & brewing guides."
      );
      input.value = "";
      input.blur();
    });
  }

  /* =========================================================
     LIVE CAFÉ OPEN / CLOSED STATUS
  ========================================================= */
  function initLiveStatus() {
    const statusText = document.getElementById("liveStatusText");
    const statusDot = document.getElementById("liveStatusDot");
    if (!statusText || !statusDot) return;

    const now = new Date();
    const day = now.getDay(); // 0 = Sun, 6 = Sat
    const hour = now.getHours();
    const isWeekend = day === 0 || day === 6;

    const openHour = isWeekend ? 8 : 7;
    const closeHour = isWeekend ? 18 : 19;

    const isOpen = hour >= openHour && hour < closeHour;

    if (isOpen) {
      statusDot.className = "pulse-dot";
      statusText.textContent = `Open Now \u2022 Closes at ${closeHour > 12 ? closeHour - 12 + ":00 PM" : closeHour + ":00 AM"}`;
    } else {
      statusDot.className = "inline-flex w-2 h-2 rounded-full bg-amber-500/80";
      statusText.textContent = `Closed \u2022 Opens at ${openHour}:00 AM`;
    }
  }

  /* =========================================================
     3D CARD TILT PHYSICS & HOVER SPECULAR
  ========================================================= */
  function initCardTilt() {
    if (window.matchMedia("(pointer: coarse)").matches || prefersReducedMotion) return;
    const cards = document.querySelectorAll("[data-tilt]");
    cards.forEach((card) => {
      card.classList.add("tilt-card");
      card.addEventListener("mousemove", (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateX = ((y - centerY) / centerY) * -6;
        const rotateY = ((x - centerX) / centerX) * 6;
        card.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateZ(6px)`;
      });
      card.addEventListener("mouseleave", () => {
        card.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0px)";
      });
    });
  }

  /* =========================================================
     MOUSE SPOTLIGHT AMBIENT GLOW
  ========================================================= */
  function initMouseGlow() {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    const elements = document.querySelectorAll(".mouse-spotlight");
    elements.forEach((el) => {
      el.addEventListener("mousemove", (e) => {
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        el.style.setProperty("--mouse-x", `${x}px`);
        el.style.setProperty("--mouse-y", `${y}px`);
      });
    });
  }

  /* =========================================================
     INTERACTIVE ORIGIN & ROAST PROFILE EXPLORER
  ========================================================= */
  const ORIGINS_DATA = {
    ethiopia: {
      name: "Ethiopia Guji Micro-Lot",
      region: "Oromia, 2,100m ASL",
      variety: "Heirloom Typica",
      process: "Washed & Sun-Dried",
      roast: "Light / Cinnamon",
      tasting: "Jasmine, White Peach, Bergamot & Wildflower Honey",
      quote: "Delicate and tea-like with an explosion of floral sweetness.",
      radar: { floral: 95, acidity: 88, sweetness: 82, body: 45 }
    },
    colombia: {
      name: "Colombia Huila Geisha",
      region: "San Agust\u00edn, 1,950m ASL",
      variety: "Geisha 100%",
      process: "Anaerobic Ferment 48h",
      roast: "Light-Medium",
      tasting: "Lychee, Bergamot Oil, Candied Lemon & Brown Sugar",
      quote: "Complex, vibrant, and silky. World-class competition grade.",
      radar: { floral: 90, acidity: 85, sweetness: 92, body: 60 }
    },
    kenya: {
      name: "Kenya Nyeri Peaberry",
      region: "Mount Kenya, 1,800m ASL",
      variety: "SL28 & SL34",
      process: "Double Washed",
      roast: "Medium",
      tasting: "Blackcurrant, Ruby Grapefruit, Cane Sugar & Cacao",
      quote: "Juicy, intense, and memorable with a mouthwatering acidity.",
      radar: { floral: 65, acidity: 95, sweetness: 85, body: 70 }
    },
    guatemala: {
      name: "Guatemala Antigua Volcanic",
      region: "Valley of Antigua, 1,750m ASL",
      variety: "Bourbon & Caturra",
      process: "Washed Shade-Grown",
      roast: "Medium-Dark",
      tasting: "Dark Chocolate, Roasted Hazelnut, Toffee & Spiced Plum",
      quote: "Rich, velvety, and deeply comforting for milk espresso drinks.",
      radar: { floral: 40, acidity: 50, sweetness: 90, body: 95 }
    }
  };

  function initOriginExplorer() {
    const buttons = document.querySelectorAll(".origin-btn");
    const nameEl = document.getElementById("originName");
    const regionEl = document.getElementById("originRegion");
    const varietyEl = document.getElementById("originVariety");
    const processEl = document.getElementById("originProcess");
    const roastEl = document.getElementById("originRoast");
    const tastingEl = document.getElementById("originTasting");
    const quoteEl = document.getElementById("originQuote");
    const floralBar = document.getElementById("radarFloral");
    const acidityBar = document.getElementById("radarAcidity");
    const sweetnessBar = document.getElementById("radarSweetness");
    const bodyBar = document.getElementById("radarBody");

    if (!buttons.length || !nameEl) return;

    function applyOrigin(key) {
      const data = ORIGINS_DATA[key];
      if (!data) return;

      buttons.forEach((btn) => {
        if (btn.getAttribute("data-origin") === key) {
          btn.classList.add("active");
        } else {
          btn.classList.remove("active");
        }
      });

      if (nameEl) nameEl.textContent = data.name;
      if (regionEl) regionEl.textContent = data.region;
      if (varietyEl) varietyEl.textContent = data.variety;
      if (processEl) processEl.textContent = data.process;
      if (roastEl) roastEl.textContent = data.roast;
      if (tastingEl) tastingEl.textContent = data.tasting;
      if (quoteEl) quoteEl.textContent = `\u201C${data.quote}\u201D`;

      if (floralBar) floralBar.style.width = data.radar.floral + "%";
      if (acidityBar) acidityBar.style.width = data.radar.acidity + "%";
      if (sweetnessBar) sweetnessBar.style.width = data.radar.sweetness + "%";
      if (bodyBar) bodyBar.style.width = data.radar.body + "%";
    }

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const originKey = btn.getAttribute("data-origin");
        applyOrigin(originKey);
      });
    });

    // Default initialization to ethiopia
    applyOrigin("ethiopia");
  }

  /* =========================================================
     INTERACTIVE MENU CATEGORY FILTER
  ========================================================= */
  function initMenuFilters() {
    const tabs = document.querySelectorAll(".filter-tab");
    const categories = document.querySelectorAll("[data-menu-category]");
    if (!tabs.length || !categories.length) return;

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const filter = tab.getAttribute("data-filter");

        tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");

        categories.forEach((cat) => {
          const categoryName = cat.getAttribute("data-menu-category");
          if (filter === "all" || categoryName === filter) {
            cat.style.display = "";
            cat.style.opacity = "1";
            cat.style.transform = "none";
          } else {
            cat.style.display = "none";
          }
        });
      });
    });
  }

  /* =========================================================
     INIT
  ========================================================= */
  async function init() {
    resizeCanvas();
    initMobileMenu();
    initHeaderScroll();
    initRevealAndCounters();
    initScrollSpy();
    initNewsletter();
    initLiveStatus();
    initCursorParallax();
    initCardTilt();
    initMouseGlow();
    initOriginExplorer();
    initMenuFilters();

    // 1. Instant First Frame (<100ms)
    await loadSingleFrame(1);
    currentFrame = prefersReducedMotion ? FRAME_COUNT - 1 : 0;
    targetFrame = currentFrame;
    displayedFrame = currentFrame;
    drawFrame(currentFrame, true);

    // 2. Fast Keyframe Spine Loader
    await loadKeyframeSpine();

    ready = true;
    hideLoader();

    // 3. Background Idle Hydration for remaining frames
    hydrateRemainingFramesProgressively();

    if (!prefersReducedMotion) {
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }

    window.addEventListener("resize", onResize);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
