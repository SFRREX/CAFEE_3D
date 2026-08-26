(() => {
  "use strict";

  /* =========================================================
     CONFIG & CONSTANTS
  ========================================================= */
  const FRAME_COUNT = 100;
  const FRAME_PATH = (i) => `./assets/coffee/frame   (${i}).webp`;
  const MAX_DPR = 2;
  const PRELOAD_TIMEOUT_MS = 4000;

  const canvas = document.getElementById("coffeeCanvas");
  if (!canvas) return;
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
  let displayedFrame = 0;
  let dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  let viewportW = window.innerWidth;
  let viewportH = window.innerHeight;
  let isAnimating = false;
  let lastDrawnIndex = -1;
  let ready = false;

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
     DRAW — Cover-style cropping
  ========================================================= */
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

    ctx.fillStyle = "#0b0806";
    ctx.fillRect(0, 0, viewportW, viewportH);
    ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
    lastDrawnIndex = index;
  }

  /* =========================================================
     PRELOAD IMAGES
  ========================================================= */
  function preloadImages() {
    return new Promise((resolve) => {
      let settled = 0;
      let hasResolved = false;

      const finish = () => {
        if (!hasResolved) {
          hasResolved = true;
          resolve();
        }
      };

      // Safeguard: don't block the site indefinitely on slow network
      const timeoutId = window.setTimeout(finish, PRELOAD_TIMEOUT_MS);

      const onSettle = (idx) => {
        settled++;
        loadedCount = settled;
        updateLoaderUI();

        // If the initial frame loaded, render it right away
        if (idx === 1 && lastDrawnIndex === -1) {
          drawFrame(0, true);
        }

        if (settled >= FRAME_COUNT) {
          window.clearTimeout(timeoutId);
          finish();
        }
      };

      for (let i = 1; i <= FRAME_COUNT; i++) {
        const img = new Image();
        img.decoding = "async";
        img.onload = () => onSettle(i);
        img.onerror = () => onSettle(i);
        img.src = FRAME_PATH(i);
        images[i - 1] = img;
      }
    });
  }

  function updateLoaderUI() {
    if (!loaderBar || !loaderPercent) return;
    const pct = Math.round((loadedCount / FRAME_COUNT) * 100);
    loaderBar.style.width = pct + "%";
    loaderPercent.textContent = pct + "%";
  }

  function hideLoader() {
    if (!loader) return;
    loader.style.opacity = "0";
    loader.style.pointerEvents = "none";
    window.setTimeout(() => {
      loader.style.display = "none";
    }, 700);
  }

  /* =========================================================
     SCROLL -> FRAME MAPPING & LERP ANIMATION
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
    const diff = targetFrame - displayedFrame;
    if (Math.abs(diff) < 0.05) {
      displayedFrame = targetFrame;
      drawFrame(displayedFrame, false);
      isAnimating = false;
      return;
    }

    displayedFrame += diff * 0.18;
    drawFrame(displayedFrame, false);
    window.requestAnimationFrame(renderLoop);
  }

  function onScroll() {
    if (prefersReducedMotion || !ready) return;
    const progress = getScrollProgress();
    targetFrame = progress * (FRAME_COUNT - 1);
    startAnimationLoop();
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

    function checkHeader() {
      if (window.scrollY > 25) {
        header.classList.add("header-scrolled");
      } else {
        header.classList.remove("header-scrolled");
      }
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
     ACTIVE NAVIGATION (SCROLLSPY)
  ========================================================= */
  function initScrollSpy() {
    const sections = document.querySelectorAll("section[id], footer[id]");
    const navLinks = document.querySelectorAll(".nav-link, .drawer-link");
    if (!sections.length || !navLinks.length) return;

    function updateActiveLink() {
      const scrollPos = window.scrollY + 120;
      let currentId = "";

      sections.forEach((section) => {
        const top = section.offsetTop;
        const height = section.offsetHeight;
        if (scrollPos >= top && scrollPos < top + height) {
          currentId = section.getAttribute("id");
        }
      });

      navLinks.forEach((link) => {
        const href = link.getAttribute("href");
        if (href && currentId && href.replace("#", "") === currentId) {
          link.classList.add("active-nav");
        } else {
          link.classList.remove("active-nav");
        }
      });
    }

    window.addEventListener("scroll", updateActiveLink, { passive: true });
    updateActiveLink();
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
      { threshold: 0.05, rootMargin: "0px 0px -15px 0px" }
    );

    targets.forEach((el) => observer.observe(el));
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
      statusText.textContent = `Open Now • Closes at ${closeHour > 12 ? closeHour - 12 + ":00 PM" : closeHour + ":00 AM"}`;
    } else {
      statusDot.className = "inline-flex w-2 h-2 rounded-full bg-amber-500/80";
      statusText.textContent = `Closed • Opens at ${openHour}:00 AM`;
    }
  }

  /* =========================================================
     INIT
  ========================================================= */
  async function init() {
    resizeCanvas();
    initMobileMenu();
    initHeaderScroll();
    initReveal();
    initScrollSpy();
    initNewsletter();
    initLiveStatus();

    await preloadImages();

    ready = true;
    currentFrame = prefersReducedMotion ? FRAME_COUNT - 1 : 0;
    targetFrame = currentFrame;
    displayedFrame = currentFrame;
    drawFrame(currentFrame, true);

    hideLoader();

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
