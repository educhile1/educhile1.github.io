/* =================================================================
   EDUARDO CAYÚN M. — 3D EXECUTIVE COMMAND CENTER STAGE & OS ENGINE
================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    const prefersReducedMotion =
        window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const FULL_SECTIONS_ORDER = ['home', 'credentials', 'projects', 'contact'];
    const STATIONS_ORDER = ['overview', 'home', 'credentials', 'sentra', 'gobierno', 'gis', 'contact', 'arcade'];

    const STATION_META = {
        overview: {
            code: '00',
            section: null,
            group: null,
            navSection: 'home',
            path: '~/escenario-3d',
            hudLabel: 'CAM // PANORAMA-360'
        },
        home: {
            code: '01',
            section: 'home',
            group: null,
            navSection: 'home',
            path: '~/escenario-3d/perfil-kpis',
            hudLabel: 'CAM // 01-PERFIL'
        },
        credentials: {
            code: '02',
            section: 'credentials',
            group: null,
            navSection: 'credentials',
            path: '~/escenario-3d/credenciales-mit',
            hudLabel: 'CAM // 02-CRED'
        },
        projects: {
            code: '03',
            section: 'projects',
            group: null,
            navSection: 'projects',
            path: '~/escenario-3d/proyectos-todos',
            hudLabel: 'CAM // 03-PROYECTOS'
        },
        sentra: {
            code: '03A',
            section: 'projects',
            group: 'sentra',
            navSection: 'projects',
            path: '~/escenario-3d/sentra-banca',
            hudLabel: 'CAM // 03A-SENTRA'
        },
        gobierno: {
            code: '03B',
            section: 'projects',
            group: 'gobierno',
            navSection: 'projects',
            path: '~/escenario-3d/gobierno-sica-sigfe2',
            hudLabel: 'CAM // 03B-ESTADO'
        },
        gis: {
            code: '03C',
            section: 'projects',
            group: 'gis',
            navSection: 'projects',
            path: '~/escenario-3d/gis-cloud-unis-ande',
            hudLabel: 'CAM // 03C-GIS'
        },
        contact: {
            code: '04',
            section: 'contact',
            group: null,
            navSection: 'contact',
            path: '~/escenario-3d/ai-brief-meet',
            hudLabel: 'CAM // 04-UPLINK'
        },
        arcade: {
            code: '05',
            section: 'projects',
            group: 'arcade',
            navSection: 'projects',
            path: '~/escenario-3d/lab-arcade-audio',
            hudLabel: 'CAM // 05-LAB'
        }
    };

    let viewMode = 'stage3d'; // 'stage3d' | 'full'
    let activeStationId = 'overview';
    let fullActiveSectionId = 'home';
    let hoveredStationId = null;
    let scrollVelocity = 0;
    let lastNativeScrollY = window.scrollY || window.pageYOffset || 0;

    /* -------------------------------------------------------------
       1. BOOT SEQUENCE OVERLAY (~1.05s)
    ------------------------------------------------------------- */
    function initBootSequence() {
        const bootScreen = document.getElementById('boot-screen');
        const bootBar = document.getElementById('boot-progress-bar');
        const bootPercent = document.getElementById('boot-percent');
        if (!bootScreen) return;

        if (prefersReducedMotion) {
            bootScreen.classList.add('boot-complete');
            return;
        }

        const duration = 1000;
        const start = performance.now();

        function step(now) {
            const elapsed = now - start;
            const progress = Math.min(1, elapsed / duration);
            const eased = 1 - Math.pow(1 - progress, 2.2);
            const pct = Math.round(eased * 100);

            if (bootBar) bootBar.style.width = `${pct}%`;
            if (bootPercent) bootPercent.textContent = `${pct}%`;

            if (progress < 1) {
                requestAnimationFrame(step);
            } else {
                setTimeout(() => {
                    bootScreen.classList.add('boot-complete');
                }, 120);
            }
        }

        requestAnimationFrame(step);
    }

    initBootSequence();

    /* -------------------------------------------------------------
       2. LENIS SMOOTH SCROLL + GSAP SCROLLTRIGGER SYNC
    ------------------------------------------------------------- */
    let lenis = null;
    if (window.gsap && window.ScrollTrigger) {
        window.gsap.registerPlugin(window.ScrollTrigger);
    }

    if (typeof window.Lenis === 'function' && !prefersReducedMotion) {
        lenis = new window.Lenis({
            duration: 1.1,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            smoothWheel: true
        });

        // Start paused in 3D Stage mode so body remains fixed until user switches to Full view
        lenis.stop();

        lenis.on('scroll', (e) => {
            scrollVelocity = e && typeof e.velocity === 'number' ? e.velocity : 0;
            if (window.ScrollTrigger) {
                window.ScrollTrigger.update();
            }
        });

        if (window.gsap) {
            window.gsap.ticker.add((time) => {
                lenis.raf(time * 1000);
            });
            window.gsap.ticker.lagSmoothing(0);
        } else {
            const rafLoop = (time) => {
                lenis.raf(time);
                requestAnimationFrame(rafLoop);
            };
            requestAnimationFrame(rafLoop);
        }
    } else {
        window.addEventListener(
            'scroll',
            () => {
                const currentY = window.scrollY || window.pageYOffset || 0;
                scrollVelocity = (currentY - lastNativeScrollY) * 0.35;
                lastNativeScrollY = currentY;
            },
            { passive: true }
        );
    }

    function scrollToFullSection(sectionId) {
        const target = document.getElementById(sectionId);
        if (!target) return;
        if (lenis) {
            lenis.scrollTo(target, { offset: -92 });
        } else {
            target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
        }
    }

    /* -------------------------------------------------------------
       3. ANIMATED KPI COUNTERS HELPER
    ------------------------------------------------------------- */
    function animateCounter(el) {
        if (!el || el.dataset.animated === 'true') return;
        el.dataset.animated = 'true';

        const target = parseInt(el.dataset.target || '0', 10);
        const prefix = el.dataset.prefix || '';
        if (prefersReducedMotion || !window.gsap) {
            el.textContent = `${prefix}${target}`;
            return;
        }

        const state = { val: 0 };
        window.gsap.to(state, {
            val: target,
            duration: 1.25,
            ease: 'power2.out',
            onUpdate: () => {
                el.textContent = `${prefix}${Math.round(state.val)}`;
            }
        });
    }

    /* -------------------------------------------------------------
       4. HUD TELEMETRY, NAVBAR PILL, INSPECTOR & VIEW MODE CONTROL
    ------------------------------------------------------------- */
    const hudClock = document.getElementById('hud-clock');
    const hudSectionIndicator = document.getElementById('hud-section-indicator');
    const hudCameraLabel = document.getElementById('hud-camera-label');
    const hudPrevBtn = document.getElementById('hud-prev-btn');
    const hudNextBtn = document.getElementById('hud-next-btn');

    const navLinksContainer = document.getElementById('nav-links-container');
    const navActivePill = document.getElementById('nav-active-pill');
    const navLinks = Array.from(document.querySelectorAll('.nav-link[data-section]'));

    const portfolioMain = document.getElementById('portfolio-main');
    const inspectorPathEl = document.getElementById('inspector-station-path');
    const inspectorShowAllBtn = document.getElementById('inspector-show-all-projects');
    const closeInspectorBtn = document.getElementById('close-inspector-btn');
    const projectsSec = document.getElementById('projects');

    const viewModeToggleBtn = document.getElementById('view-mode-toggle');
    const viewModeIcon = document.getElementById('view-mode-icon');
    const viewModeLabel = document.getElementById('view-mode-label');

    const mobileBtn = document.getElementById('mobile-menu-button');
    const mobileMenu = document.getElementById('mobile-menu');

    const FULL_CAMERA_STATES = {
        home: { x: 0, y: 1.2, z: 9.8, lookX: 0, lookY: 0.4, lookZ: -0.5, label: 'CAM // ORBITAL-GIS' },
        credentials: { x: -3.2, y: 1.8, z: 8.2, lookX: -1.5, lookY: 0.5, lookZ: -1.6, label: 'CAM // CORE-SYSTEM' },
        projects: { x: 2.8, y: 2.8, z: 7.4, lookX: 0, lookY: 1.1, lookZ: -4.2, label: 'CAM // CLOUD-TOPOLOGY' },
        contact: { x: 2.6, y: 1.1, z: 6.8, lookX: 2.2, lookY: 0.5, lookZ: -1.8, label: 'CAM // EXEC-UPLINK' }
    };

    function updateTelemetryClock() {
        if (!hudClock) return;
        try {
            const formatted = new Intl.DateTimeFormat('es-CL', {
                timeZone: 'America/Santiago',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            }).format(new Date());
            hudClock.textContent = `${formatted} CLT`;
        } catch {
            const d = new Date();
            hudClock.textContent = `${d.toTimeString().slice(0, 8)} CLT`;
        }
    }

    updateTelemetryClock();
    setInterval(updateTelemetryClock, 1000);

    function closeMobileMenu() {
        if (mobileMenu && mobileMenu.classList.contains('is-open')) {
            mobileMenu.classList.remove('is-open');
            if (mobileBtn) mobileBtn.setAttribute('aria-expanded', 'false');
        }
    }

    if (mobileBtn && mobileMenu) {
        mobileBtn.addEventListener('click', () => {
            const isOpen = mobileMenu.classList.toggle('is-open');
            mobileBtn.setAttribute('aria-expanded', String(isOpen));
        });

        document.addEventListener('click', (e) => {
            if (
                mobileMenu.classList.contains('is-open') &&
                !mobileMenu.contains(e.target) &&
                !mobileBtn.contains(e.target)
            ) {
                closeMobileMenu();
            }
        });
    }

    function movePillToLink(link) {
        if (!navActivePill || !navLinksContainer || !link) return;
        const containerRect = navLinksContainer.getBoundingClientRect();
        const linkRect = link.getBoundingClientRect();
        if (linkRect.width === 0) return;

        const leftOffset = linkRect.left - containerRect.left;
        navActivePill.style.width = `${linkRect.width}px`;
        navActivePill.style.transform = `translate3d(${leftOffset}px, 0, 0)`;
        navActivePill.style.opacity = '1';
    }

    function syncNavPill(navSectionId) {
        let matched = null;
        navLinks.forEach((link) => {
            const isMatch = link.dataset.section === navSectionId;
            link.classList.toggle('is-active', isMatch);
            if (isMatch) matched = link;
        });
        if (matched) movePillToLink(matched);
    }

    function syncStationVisualUI(stationId) {
        const meta = STATION_META[stationId] || STATION_META.overview;
        syncNavPill(meta.navSection);

        if (hudCameraLabel) {
            hudCameraLabel.textContent = meta.hudLabel;
        }

        const idx = STATIONS_ORDER.indexOf(stationId);
        if (hudSectionIndicator) {
            const displayIdx = idx >= 0 ? idx : 0;
            hudSectionIndicator.textContent = `0${displayIdx} / 0${STATIONS_ORDER.length - 1}`;
        }

        document.querySelectorAll('.stage-dock-btn').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.stationTarget === stationId);
        });

        document.querySelectorAll('.stage-marker').forEach((marker) => {
            marker.classList.toggle('is-active', marker.dataset.stationId === stationId);
        });
    }

    function applyInspectorContent(stationId) {
        const meta = STATION_META[stationId] || STATION_META.overview;

        if (stationId === 'overview') {
            document.body.classList.add('is-overview');
            document.querySelectorAll('#portfolio-main section').forEach((s) => {
                s.classList.remove('is-inspected');
            });
            return;
        }

        document.body.classList.remove('is-overview');

        if (inspectorPathEl) {
            inspectorPathEl.textContent = meta.path;
        }

        document.querySelectorAll('#portfolio-main section').forEach((sec) => {
            sec.classList.toggle('is-inspected', sec.id === meta.section);
        });

        if (projectsSec) {
            if (meta.section === 'projects' && meta.group) {
                projectsSec.classList.add('is-filtered');
                projectsSec.querySelectorAll('[data-station-group]').forEach((item) => {
                    item.classList.toggle('is-station-match', item.dataset.stationGroup === meta.group);
                });
                if (inspectorShowAllBtn) inspectorShowAllBtn.classList.remove('hidden');
            } else {
                projectsSec.classList.remove('is-filtered');
                projectsSec.querySelectorAll('[data-station-group]').forEach((item) => {
                    item.classList.remove('is-station-match');
                });
                if (inspectorShowAllBtn) inspectorShowAllBtn.classList.add('hidden');
            }
        }

        if (portfolioMain) {
            portfolioMain.scrollTop = 0;
        }

        if (meta.section === 'home') {
            document.querySelectorAll('.kpi-counter').forEach(animateCounter);
        }
    }

    let onStationFocusChange = () => {};

    function focusStation(stationId) {
        if (!STATION_META[stationId]) return;
        closeMobileMenu();

        if (viewMode !== 'stage3d') {
            setViewMode('stage3d', { skipReset: true });
        }

        activeStationId = stationId;
        applyInspectorContent(stationId);
        syncStationVisualUI(stationId);
        onStationFocusChange(stationId);
    }

    function setFullScrollSection(sectionId) {
        if (!FULL_SECTIONS_ORDER.includes(sectionId)) return;
        fullActiveSectionId = sectionId;
        syncNavPill(sectionId);

        const idx = FULL_SECTIONS_ORDER.indexOf(sectionId) + 1;
        if (hudSectionIndicator) {
            hudSectionIndicator.textContent = `0${idx} / 0${FULL_SECTIONS_ORDER.length}`;
        }
        if (hudCameraLabel && FULL_CAMERA_STATES[sectionId]) {
            hudCameraLabel.textContent = FULL_CAMERA_STATES[sectionId].label;
        }
    }

    function setViewMode(mode, opts = {}) {
        viewMode = mode === 'full' ? 'full' : 'stage3d';
        closeMobileMenu();

        if (viewMode === 'full') {
            document.body.classList.remove('stage-3d-active', 'is-overview');
            document.body.classList.add('full-scroll-active');

            if (projectsSec) {
                projectsSec.classList.remove('is-filtered');
                projectsSec.querySelectorAll('[data-station-group]').forEach((el) => el.classList.remove('is-station-match'));
            }
            document.querySelectorAll('#portfolio-main section').forEach((sec) => sec.classList.add('is-inspected'));

            if (viewModeIcon) viewModeIcon.textContent = '◈';
            if (viewModeLabel) viewModeLabel.textContent = 'Escenario 3D';

            if (lenis) lenis.start();
            setFullScrollSection(fullActiveSectionId);
            document.querySelectorAll('.kpi-counter').forEach(animateCounter);

            if (window.ScrollTrigger) {
                requestAnimationFrame(() => window.ScrollTrigger.refresh());
            }
        } else {
            document.body.classList.remove('full-scroll-active');
            document.body.classList.add('stage-3d-active');

            if (lenis) lenis.stop();
            window.scrollTo(0, 0);

            if (viewModeIcon) viewModeIcon.textContent = '▤';
            if (viewModeLabel) viewModeLabel.textContent = 'Vista Completa';

            if (!opts.skipReset) {
                activeStationId = 'overview';
                applyInspectorContent('overview');
                syncStationVisualUI('overview');
                onStationFocusChange('overview');
            }
        }
    }

    if (viewModeToggleBtn) {
        viewModeToggleBtn.addEventListener('click', () => {
            setViewMode(viewMode === 'stage3d' ? 'full' : 'stage3d');
        });
    }

    document.querySelectorAll('[data-switch-mode]').forEach((btn) => {
        btn.addEventListener('click', () => {
            setViewMode(btn.dataset.switchMode === 'full' ? 'full' : 'stage3d');
        });
    });

    if (closeInspectorBtn) {
        closeInspectorBtn.addEventListener('click', () => focusStation('overview'));
    }

    if (inspectorShowAllBtn) {
        inspectorShowAllBtn.addEventListener('click', () => focusStation('projects'));
    }

    // Bind station-target triggers (Dock buttons, Overview button, Navbar links)
    document.querySelectorAll('[data-station-target]').forEach((el) => {
        el.addEventListener('click', (e) => {
            const targetStation = el.dataset.stationTarget;
            if (!targetStation) return;

            if (viewMode === 'stage3d') {
                e.preventDefault();
                focusStation(targetStation);
            } else {
                const href = el.getAttribute('href');
                if (href && href.startsWith('#')) {
                    e.preventDefault();
                    closeMobileMenu();
                    scrollToFullSection(href.slice(1));
                }
            }
        });
    });

    // Any remaining in-page anchor links (e.g. Hero "Explorar Proyectos →" or Footer links)
    document.querySelectorAll('a[href^="#"]:not([data-station-target])').forEach((anchor) => {
        anchor.addEventListener('click', (e) => {
            const href = anchor.getAttribute('href');
            if (!href || href === '#') return;
            const targetId = href.slice(1);
            const targetEl = document.getElementById(targetId);
            if (!targetEl) return;

            e.preventDefault();
            closeMobileMenu();

            if (viewMode === 'stage3d') {
                focusStation(STATION_META[targetId] ? targetId : 'projects');
            } else {
                scrollToFullSection(targetId);
            }
        });
    });

    if (hudPrevBtn) {
        hudPrevBtn.addEventListener('click', () => {
            if (viewMode === 'stage3d') {
                const cur = Math.max(0, STATIONS_ORDER.indexOf(activeStationId));
                const prevIdx = (cur - 1 + STATIONS_ORDER.length) % STATIONS_ORDER.length;
                focusStation(STATIONS_ORDER[prevIdx]);
            } else {
                const cur = FULL_SECTIONS_ORDER.indexOf(fullActiveSectionId);
                const prevIdx = (cur - 1 + FULL_SECTIONS_ORDER.length) % FULL_SECTIONS_ORDER.length;
                scrollToFullSection(FULL_SECTIONS_ORDER[prevIdx]);
            }
        });
    }

    if (hudNextBtn) {
        hudNextBtn.addEventListener('click', () => {
            if (viewMode === 'stage3d') {
                const cur = Math.max(0, STATIONS_ORDER.indexOf(activeStationId));
                const nextIdx = (cur + 1) % STATIONS_ORDER.length;
                focusStation(STATIONS_ORDER[nextIdx]);
            } else {
                const cur = FULL_SECTIONS_ORDER.indexOf(fullActiveSectionId);
                const nextIdx = (cur + 1) % FULL_SECTIONS_ORDER.length;
                scrollToFullSection(FULL_SECTIONS_ORDER[nextIdx]);
            }
        });
    }

    if (navLinks.length > 0 && navActivePill) {
        navLinks.forEach((link) => {
            link.addEventListener('mouseenter', () => movePillToLink(link));
        });

        if (navLinksContainer) {
            navLinksContainer.addEventListener('mouseleave', () => {
                const currentNav =
                    viewMode === 'stage3d'
                        ? (STATION_META[activeStationId] || STATION_META.overview).navSection
                        : fullActiveSectionId;
                syncNavPill(currentNav);
            });
        }

        const observedSections = navLinks
            .map((l) => document.getElementById(l.dataset.section))
            .filter(Boolean);

        if ('IntersectionObserver' in window && observedSections.length > 0) {
            const observer = new IntersectionObserver(
                (entries) => {
                    if (viewMode !== 'full') return;
                    entries.forEach((entry) => {
                        if (entry.isIntersecting) {
                            setFullScrollSection(entry.target.id);
                        }
                    });
                },
                { rootMargin: '-38% 0px -48% 0px', threshold: 0 }
            );
            observedSections.forEach((sec) => observer.observe(sec));
        }

        window.addEventListener(
            'scroll',
            () => {
                if (viewMode !== 'full') return;
                const scrollBottom = window.innerHeight + (window.scrollY || window.pageYOffset);
                const docHeight = document.documentElement.scrollHeight;
                if (docHeight - scrollBottom < 40) {
                    setFullScrollSection('contact');
                }
            },
            { passive: true }
        );

        syncStationVisualUI('overview');
        window.addEventListener('resize', () => {
            const currentNav =
                viewMode === 'stage3d'
                    ? (STATION_META[activeStationId] || STATION_META.overview).navSection
                    : fullActiveSectionId;
            syncNavPill(currentNav);
        });
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => syncStationVisualUI(activeStationId));
        }
    }

    // Prevent wheel inside Drawer / Hero HUD from zooming the 3D canvas behind it
    [portfolioMain, document.getElementById('stage-hero-hud'), document.getElementById('stage-dock')].forEach((el) => {
        if (!el) return;
        el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
        el.addEventListener('pointerdown', (e) => e.stopPropagation());
    });

    /* -------------------------------------------------------------
       5. MAGNETIC CTAS, SPOTLIGHT BENTO & OS WINDOW MINIMIZE
    ------------------------------------------------------------- */
    if (!prefersReducedMotion) {
        document.querySelectorAll('.magnetic-btn').forEach((btn) => {
            btn.addEventListener('mousemove', (e) => {
                const rect = btn.getBoundingClientRect();
                const relX = e.clientX - (rect.left + rect.width / 2);
                const relY = e.clientY - (rect.top + rect.height / 2);
                const moveX = Math.max(-7, Math.min(7, relX * 0.22));
                const moveY = Math.max(-6, Math.min(6, relY * 0.22));
                btn.style.transform = `translate3d(${moveX}px, ${moveY}px, 0)`;
            });

            btn.addEventListener('mouseleave', () => {
                btn.style.transform = 'translate3d(0, 0, 0)';
            });
        });
    }

    document.querySelectorAll('.bento-card').forEach((card) => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);
            card.style.setProperty('--spotlight-opacity', '1');
        });

        card.addEventListener('mouseleave', () => {
            card.style.setProperty('--spotlight-opacity', '0');
        });
    });

    document.querySelectorAll('.os-minimize-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            const win = btn.closest('.os-window');
            if (win) win.classList.toggle('is-minimized');
        });
    });

    /* -------------------------------------------------------------
       6. HIGH-RES TEXTURE GENERATOR FOR 3D STAGE MONITORS
    ------------------------------------------------------------- */
    function drawRoundedRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
        const words = text.split(' ');
        let line = '';
        let cursorY = y;
        for (let i = 0; i < words.length; i++) {
            const testLine = line ? `${line} ${words[i]}` : words[i];
            if (ctx.measureText(testLine).width > maxWidth && line) {
                ctx.fillText(line, x, cursorY);
                line = words[i];
                cursorY += lineHeight;
            } else {
                line = testLine;
            }
        }
        if (line) ctx.fillText(line, x, cursorY);
        return cursorY;
    }

    function createStationScreenTexture(THREE, spec) {
        const cw = 1024;
        const ch = 640;
        const texCanvas = document.createElement('canvas');
        texCanvas.width = cw;
        texCanvas.height = ch;
        const ctx = texCanvas.getContext('2d');

        const texture = new THREE.CanvasTexture(texCanvas);
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.anisotropy = 4;

        const loadedImages = {};
        const imgEntries = spec.images || [];
        imgEntries.forEach((entry) => {
            const img = new Image();
            img.onload = () => {
                loadedImages[entry.key] = img;
                redraw();
                texture.needsUpdate = true;
            };
            img.src = entry.src;
        });

        function drawHeaderBar() {
            const bgGrad = ctx.createLinearGradient(0, 0, cw, ch);
            bgGrad.addColorStop(0, '#060c1c');
            bgGrad.addColorStop(0.55, '#09142b');
            bgGrad.addColorStop(1, '#040813');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, cw, ch);

            // Faint architectural grid
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.06)';
            ctx.lineWidth = 1;
            for (let gx = 40; gx < cw; gx += 48) {
                ctx.beginPath();
                ctx.moveTo(gx, 0);
                ctx.lineTo(gx, ch);
                ctx.stroke();
            }
            for (let gy = 56; gy < ch; gy += 48) {
                ctx.beginPath();
                ctx.moveTo(0, gy);
                ctx.lineTo(cw, gy);
                ctx.stroke();
            }

            // Top OS window chrome bar
            ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
            ctx.fillRect(0, 0, cw, 54);
            ctx.fillStyle = spec.accentCss;
            ctx.fillRect(0, 53, cw, 2);

            // Path & status
            ctx.font = '600 19px "JetBrains Mono", monospace';
            ctx.fillStyle = spec.accentCss;
            ctx.fillText(spec.osPath, 28, 34);

            // Minimalist window buttons on right
            ['−', '□', '×'].forEach((sym, i) => {
                const bx = cw - 122 + i * 34;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
                drawRoundedRect(ctx, bx, 15, 24, 24, 5);
                ctx.fill();
                ctx.font = '600 15px "JetBrains Mono", monospace';
                ctx.fillStyle = i === 2 ? '#fda4af' : '#cbd5e1';
                ctx.fillText(sym, bx + 7, 32);
            });
        }

        function drawPill(text, x, y, colorCss, bgCss) {
            ctx.font = '600 17px "JetBrains Mono", monospace';
            const padX = 14;
            const w = ctx.measureText(text).width + padX * 2;
            ctx.fillStyle = bgCss || 'rgba(56, 189, 248, 0.14)';
            drawRoundedRect(ctx, x, y, w, 34, 17);
            ctx.fill();
            ctx.strokeStyle = colorCss || spec.accentCss;
            ctx.lineWidth = 1.2;
            ctx.stroke();
            ctx.fillStyle = colorCss || '#e0f2fe';
            ctx.fillText(text, x + padX, y + 23);
            return w;
        }

        function drawImageCard(imgKey, label, x, y, w, h) {
            ctx.save();
            drawRoundedRect(ctx, x, y, w, h, 18);
            ctx.fillStyle = '#030712';
            ctx.fill();
            ctx.clip();

            const img = loadedImages[imgKey];
            if (img && img.naturalWidth > 0) {
                const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
                const dw = img.naturalWidth * scale;
                const dh = img.naturalHeight * scale;
                ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
            } else {
                ctx.fillStyle = '#0d1933';
                ctx.fillRect(x, y, w, h);
                ctx.font = '600 20px "JetBrains Mono", monospace';
                ctx.fillStyle = '#64748b';
                ctx.fillText('LOADING FEED...', x + 28, y + h / 2);
            }

            // Bottom gradient label
            const g = ctx.createLinearGradient(0, y + h - 75, 0, y + h);
            g.addColorStop(0, 'rgba(4, 6, 12, 0)');
            g.addColorStop(1, 'rgba(4, 6, 12, 0.92)');
            ctx.fillStyle = g;
            ctx.fillRect(x, y + h - 75, w, 75);

            ctx.font = '700 20px "Plus Jakarta Sans", sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(label, x + 18, y + h - 22);
            ctx.restore();

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
            ctx.lineWidth = 2;
            drawRoundedRect(ctx, x, y, w, h, 18);
            ctx.stroke();
        }

        function redraw() {
            drawHeaderBar();

            if (spec.id === 'home') {
                drawImageCard('perfil', 'EDUARDO CAYÚN M.', 34, 86, 330, 390);
                drawPill('MBA · ING. INFORMÁTICA', 396, 88, '#34d399', 'rgba(52, 211, 153, 0.14)');
                ctx.font = '800 38px "Plus Jakarta Sans", sans-serif';
                ctx.fillStyle = '#ffffff';
                drawWrappedText(ctx, 'Consultoría Estratégica y Ejecución Tecnológica', 396, 174, 590, 46);
                ctx.font = '400 21px "Inter", sans-serif';
                ctx.fillStyle = '#cbd5e1';
                drawWrappedText(
                    ctx,
                    'Liderazgo de proyectos críticos en Banca, Gobierno, Energía GIS y Cloud.',
                    396,
                    290,
                    585,
                    30
                );

                // KPI Cards
                const kpis = [
                    { big: '+15 Años', sub: 'Misión Crítica', col: '#ffffff' },
                    { big: '3 Países', sub: 'CL · PY · UY', col: '#38bdf8' },
                    { big: 'Multi-Rubro', sub: 'Banca / Gov / GIS', col: '#34d399' }
                ];
                kpis.forEach((k, idx) => {
                    const bx = 396 + idx * 198;
                    const by = 376;
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                    drawRoundedRect(ctx, bx, by, 184, 100, 14);
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
                    ctx.stroke();
                    ctx.font = '800 26px "Plus Jakarta Sans", sans-serif';
                    ctx.fillStyle = k.col;
                    ctx.fillText(k.big, bx + 16, by + 44);
                    ctx.font = '500 16px "JetBrains Mono", monospace';
                    ctx.fillStyle = '#94a3b8';
                    ctx.fillText(k.sub, bx + 16, by + 76);
                });

                ctx.font = '600 18px "JetBrains Mono", monospace';
                ctx.fillStyle = '#7dd3fc';
                ctx.fillText('CLIENTES: BCI · BancoEstado · Falabella · DIPRES · Contraloría · ANDE · Entel', 34, 578);
            } else if (spec.id === 'credentials') {
                drawPill('POSGRADO & ESPECIALIZACIÓN', 34, 82, '#818cf8', 'rgba(129, 140, 248, 0.16)');
                ctx.font = '800 40px "Plus Jakarta Sans", sans-serif';
                ctx.fillStyle = '#ffffff';
                ctx.fillText('Credenciales Ejecutivas & IA / Cloud', 34, 166);

                const items = [
                    { tag: 'MBA UDD', title: 'MBA Emprendimiento e Innovación', sub: 'Estrategia corporativa y transformación', col: '#818cf8' },
                    { tag: 'MIT 2025–2026', title: 'IA Generativa, Transformación & IoT', sub: 'Massachusetts Institute of Technology', col: '#38bdf8' },
                    { tag: 'TOP 8 LATAM', title: 'Google & Alura Inmersión IA', sub: 'Top 8 entre +3.000 proyectos regionales', col: '#34d399' },
                    { tag: 'ISC2 · INCIBE', title: 'Ciberseguridad & OCI / AWS Cloud', sub: 'ISC2 CC · INCIBE 315h · Data Science 307h', col: '#fb7185' }
                ];
                items.forEach((it, idx) => {
                    const colIdx = idx % 2;
                    const rowIdx = Math.floor(idx / 2);
                    const bx = 34 + colIdx * 488;
                    const by = 204 + rowIdx * 185;
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
                    drawRoundedRect(ctx, bx, by, 468, 164, 18);
                    ctx.fill();
                    ctx.strokeStyle = it.col;
                    ctx.lineWidth = 1.6;
                    ctx.stroke();

                    ctx.font = '700 17px "JetBrains Mono", monospace';
                    ctx.fillStyle = it.col;
                    ctx.fillText(it.tag, bx + 22, by + 38);

                    ctx.font = '700 24px "Plus Jakarta Sans", sans-serif';
                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(it.title, bx + 22, by + 84);

                    ctx.font = '400 18px "Inter", sans-serif';
                    ctx.fillStyle = '#cbd5e1';
                    ctx.fillText(it.sub, bx + 22, by + 124);
                });
            } else if (spec.id === 'sentra') {
                drawPill('PROYECTO DESTACADO · SENTRA', 34, 82, '#38bdf8', 'rgba(56, 189, 248, 0.16)');
                ctx.font = '800 42px "Plus Jakarta Sans", sans-serif';
                ctx.fillStyle = '#ffffff';
                ctx.fillText('Banca & Ciberseguridad Transaccional', 34, 168);

                const banks = [
                    { name: 'BCI · Motor de Pagos', desc: 'Mitigación de vulnerabilidades críticas en producción financiera.', col: '#38bdf8' },
                    { name: 'Falabella Financiero Argentina', desc: 'Arquitectura antifraude contra ataques de diccionario en Java EE + Oracle OSB.', col: '#818cf8' },
                    { name: 'BancoEstado · QA & Performance', desc: 'Suites automatizadas y pruebas de estrés con JMeter, SoapUI y TestLink.', col: '#34d399' }
                ];
                banks.forEach((b, idx) => {
                    const by = 204 + idx * 124;
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
                    drawRoundedRect(ctx, 34, by, 956, 104, 16);
                    ctx.fill();
                    ctx.strokeStyle = b.col;
                    ctx.lineWidth = 1.5;
                    ctx.stroke();

                    ctx.font = '700 24px "Plus Jakarta Sans", sans-serif';
                    ctx.fillStyle = b.col;
                    ctx.fillText(b.name, 60, by + 42);

                    ctx.font = '400 20px "Inter", sans-serif';
                    ctx.fillStyle = '#e2e8f0';
                    ctx.fillText(b.desc, 60, by + 78);
                });
            } else if (spec.id === 'gobierno') {
                drawPill('SECTOR PÚBLICO · CL · PY · UY', 34, 80, '#34d399', 'rgba(52, 211, 153, 0.16)');
                ctx.font = '800 34px "Plus Jakarta Sans", sans-serif';
                ctx.fillStyle = '#ffffff';
                ctx.fillText('SICA (Contraloría) & SIGFE 2 (Min. Hacienda)', 34, 156);

                drawImageCard('sica', 'SICA · Control Auditorías (CL·PY·UY)', 34, 184, 466, 330);
                drawImageCard('sigfe2', 'SIGFE 2 · Min. Hacienda (DIPRES)', 524, 184, 466, 330);

                ctx.font = '600 18px "JetBrains Mono", monospace';
                ctx.fillStyle = '#a7f3d0';
                ctx.fillText('STACK: Java EE · Oracle SOA · Oracle ADF · Oracle UCM · OSB · YouTube & DIPRES', 34, 575);
            } else if (spec.id === 'gis') {
                drawPill('UTILITIES, ENERGÍA & GEOESPACIAL', 34, 80, '#fbbf24', 'rgba(245, 158, 11, 0.16)');
                ctx.font = '800 34px "Plus Jakarta Sans", sans-serif';
                ctx.fillStyle = '#ffffff';
                ctx.fillText('UNIS GIS (Tierra-Ayni) & ANDE Paraguay', 34, 156);

                drawImageCard('unis', 'UNIS · GE Smallworld & Java EE 8', 34, 184, 466, 330);

                // ANDE schematic panel
                const ax = 524;
                const ay = 184;
                const aw = 466;
                const ah = 330;
                const andeGrad = ctx.createLinearGradient(ax, ay, ax + aw, ay + ah);
                andeGrad.addColorStop(0, '#0c1b3d');
                andeGrad.addColorStop(1, '#072c46');
                ctx.fillStyle = andeGrad;
                drawRoundedRect(ctx, ax, ay, aw, ah, 18);
                ctx.fill();
                ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
                ctx.lineWidth = 2;
                ctx.stroke();

                // Power line graphic
                ctx.strokeStyle = '#38bdf8';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(ax + 40, ay + 220);
                ctx.lineTo(ax + 145, ay + 125);
                ctx.lineTo(ax + 250, ay + 170);
                ctx.lineTo(ax + 345, ay + 85);
                ctx.lineTo(ax + 425, ay + 145);
                ctx.stroke();

                ctx.font = '700 17px "JetBrains Mono", monospace';
                ctx.fillStyle = '#7dd3fc';
                ctx.fillText('ENERGÍA NACIONAL PARAGUAY', ax + 26, ay + 48);
                ctx.font = '800 36px "Plus Jakarta Sans", sans-serif';
                ctx.fillStyle = '#ffffff';
                ctx.fillText('ANDE PARAGUAY', ax + 26, ay + 264);
                ctx.font = '500 19px "Inter", sans-serif';
                ctx.fillStyle = '#cbd5e1';
                ctx.fillText('Arquitectura Cloud AWS · GE Smallworld', ax + 26, ay + 300);

                ctx.font = '600 18px "JetBrains Mono", monospace';
                ctx.fillStyle = '#fde68a';
                ctx.fillText('CLIENTES: Gasvalpo · Chilquinta · Gasco Magallanes · Entel · ANDE', 34, 575);
            } else if (spec.id === 'contact') {
                drawPill('EXECUTIVE UPLINK · ONLINE', 34, 80, '#34d399', 'rgba(52, 211, 153, 0.16)');
                ctx.font = '800 40px "Plus Jakarta Sans", sans-serif';
                ctx.fillStyle = '#ffffff';
                ctx.fillText('Terminal AI Brief & Contacto Directo', 34, 166);

                // Terminal screen box
                ctx.fillStyle = '#03060e';
                drawRoundedRect(ctx, 34, 194, 956, 260, 18);
                ctx.fill();
                ctx.strokeStyle = 'rgba(52, 211, 153, 0.4)';
                ctx.lineWidth = 1.6;
                ctx.stroke();

                ctx.font = '600 20px "JetBrains Mono", monospace';
                ctx.fillStyle = '#34d399';
                ctx.fillText('eduardo@executive-desk:~$ ask --topic "disponibilidad"', 60, 240);

                ctx.font = '400 21px "Inter", sans-serif';
                ctx.fillStyle = '#e2e8f0';
                drawWrappedText(
                    ctx,
                    'Disponible para consultoría estratégica B2B, dirección de proyectos TI complejos, arquitectura Cloud/GIS y liderazgo ejecutivo.',
                    60,
                    290,
                    890,
                    32
                );

                // 3 Direct Channel badges
                const channels = ['Google Meet · 30 min', 'LinkedIn /in/eduardocayun', 'GitHub @educhile1'];
                channels.forEach((chLabel, idx) => {
                    const bx = 34 + idx * 324;
                    ctx.fillStyle = idx === 0 ? '#ffffff' : 'rgba(255, 255, 255, 0.08)';
                    drawRoundedRect(ctx, bx, 488, 304, 82, 16);
                    ctx.fill();
                    ctx.font = '700 20px "Plus Jakarta Sans", sans-serif';
                    ctx.fillStyle = idx === 0 ? '#04060c' : '#f8fafc';
                    ctx.fillText(chLabel, bx + 22, 536);
                });
            } else if (spec.id === 'arcade') {
                drawPill('LABORATORIO INTERACTIVO · AUDIO & GAME', 34, 80, '#f472b6', 'rgba(244, 114, 182, 0.18)');
                ctx.font = '800 38px "Plus Jakarta Sans", sans-serif';
                ctx.fillStyle = '#ffffff';
                ctx.fillText('Edu Tetris Arcade & Música IA', 34, 162);

                // Left: Cyber Tetris grid
                ctx.fillStyle = '#050816';
                drawRoundedRect(ctx, 34, 192, 466, 370, 18);
                ctx.fill();
                ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
                ctx.stroke();

                const tetColors = ['#38bdf8', '#f472b6', '#34d399', '#fbbf24', '#818cf8'];
                const blocks = [
                    [3, 7, 0], [4, 7, 0], [5, 7, 0], [6, 7, 0],
                    [2, 6, 1], [2, 5, 1], [3, 6, 1], [3, 5, 1],
                    [5, 6, 2], [6, 6, 2], [6, 5, 2], [7, 5, 2],
                    [4, 4, 3], [5, 4, 3], [6, 4, 3], [5, 3, 3],
                    [4, 1, 4], [5, 1, 4], [5, 2, 4], [6, 2, 4]
                ];
                blocks.forEach(([bx, by, ci]) => {
                    ctx.fillStyle = tetColors[ci];
                    drawRoundedRect(ctx, 74 + bx * 36, 224 + by * 34, 32, 30, 6);
                    ctx.fill();
                });
                ctx.font = '700 22px "Plus Jakarta Sans", sans-serif';
                ctx.fillStyle = '#ffffff';
                ctx.fillText('EDU TETRIS · 60 FPS + WEB AUDIO', 62, 535);

                // Right: Music Player spectrum
                ctx.fillStyle = '#050816';
                drawRoundedRect(ctx, 524, 192, 466, 370, 18);
                ctx.fill();
                ctx.strokeStyle = 'rgba(52, 211, 153, 0.5)';
                ctx.stroke();

                const heights = [60, 110, 175, 130, 210, 165, 95, 185, 140, 220, 150, 90];
                heights.forEach((bh, idx) => {
                    const barGrad = ctx.createLinearGradient(0, 470 - bh, 0, 470);
                    barGrad.addColorStop(0, '#38bdf8');
                    barGrad.addColorStop(1, '#34d399');
                    ctx.fillStyle = barGrad;
                    drawRoundedRect(ctx, 560 + idx * 33, 470 - bh, 22, bh, 6);
                    ctx.fill();
                });
                ctx.font = '700 22px "Plus Jakarta Sans", sans-serif';
                ctx.fillStyle = '#ffffff';
                ctx.fillText('REPRODUCTOR MÚSICA IA · MP3', 554, 535);
            }
        }

        redraw();
        texture.needsUpdate = true;
        return texture;
    }

    /* -------------------------------------------------------------
       7. INTERACTIVE THREE.JS 3D STAGE COMMAND CENTER
    ------------------------------------------------------------- */
    function initFallback2DStage(canvas) {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let w = window.innerWidth;
        let h = window.innerHeight;
        let dpr = Math.min(window.devicePixelRatio || 1, 2);

        function resize() {
            w = window.innerWidth;
            h = window.innerHeight;
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.floor(w * dpr);
            canvas.height = Math.floor(h * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        resize();
        window.addEventListener('resize', resize);

        const pts = Array.from({ length: 42 }, () => ({
            x: Math.random() * w,
            y: Math.random() * h,
            vx: (Math.random() - 0.5) * 0.35,
            vy: (Math.random() - 0.5) * 0.35,
            r: Math.random() * 1.8 + 0.8
        }));

        function drawFrame() {
            ctx.fillStyle = '#04060c';
            ctx.fillRect(0, 0, w, h);

            pts.forEach((p) => {
                if (!prefersReducedMotion) {
                    p.x = (p.x + p.vx + w) % w;
                    p.y = (p.y + p.vy + h) % h;
                }
                ctx.fillStyle = 'rgba(56, 189, 248, 0.45)';
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();
            });

            if (!prefersReducedMotion && !document.hidden) {
                requestAnimationFrame(drawFrame);
            }
        }
        drawFrame();
    }

    function initThreeCommandCenter() {
        const canvas = document.getElementById('webgl-stage');
        const markersContainer = document.getElementById('stage-3d-markers');
        if (!canvas) return;

        if (!window.THREE) {
            initFallback2DStage(canvas);
            return;
        }

        const THREE = window.THREE;
        let renderer;
        try {
            renderer = new THREE.WebGLRenderer({
                canvas,
                alpha: false,
                antialias: true,
                powerPreference: 'high-performance'
            });
        } catch {
            initFallback2DStage(canvas);
            return;
        }

        const isMobile = () => window.innerWidth < 768;
        renderer.setPixelRatio(isMobile() ? Math.min(window.devicePixelRatio || 1, 1.4) : Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0x04060c, 1);

        const scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x04060c, 0.036);

        const camera = new THREE.PerspectiveCamera(
            isMobile() ? 58 : 48,
            window.innerWidth / window.innerHeight,
            0.1,
            120
        );

        // Lighting Setup
        const ambientLight = new THREE.AmbientLight(0x94a3b8, 0.8);
        scene.add(ambientLight);

        const keyDirLight = new THREE.DirectionalLight(0xe0f2fe, 0.85);
        keyDirLight.position.set(6, 14, 10);
        scene.add(keyDirLight);

        const skyLight = new THREE.PointLight(0x38bdf8, 2.3, 32);
        skyLight.position.set(0, 4.5, 2);
        scene.add(skyLight);

        const indigoLight = new THREE.PointLight(0x818cf8, 1.7, 26);
        indigoLight.position.set(-8, 4.5, -5);
        scene.add(indigoLight);

        const emeraldLight = new THREE.PointLight(0x34d399, 1.6, 26);
        emeraldLight.position.set(8, 4.5, -5);
        scene.add(emeraldLight);

        // Stage Platform Floor
        const stageDeck = new THREE.Mesh(
            new THREE.CylinderGeometry(11.4, 12.1, 0.24, 64),
            new THREE.MeshStandardMaterial({
                color: 0x050a18,
                metalness: 0.72,
                roughness: 0.38
            })
        );
        stageDeck.position.set(0, -1.78, -0.8);
        scene.add(stageDeck);

        const gridHelper = new THREE.GridHelper(36, 36, 0x1e3a5f, 0x0b1426);
        gridHelper.position.set(0, -1.65, -0.8);
        const gridMats = Array.isArray(gridHelper.material) ? gridHelper.material : [gridHelper.material];
        gridMats.forEach((m) => {
            m.transparent = true;
            m.opacity = 0.45;
        });
        scene.add(gridHelper);

        // Concentric Floor Rings
        [3.1, 5.8, 8.6].forEach((r, idx) => {
            const ringMesh = new THREE.Mesh(
                new THREE.RingGeometry(r - 0.03, r, 96),
                new THREE.MeshBasicMaterial({
                    color: idx === 1 ? 0x818cf8 : 0x38bdf8,
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 0.26 - idx * 0.05
                })
            );
            ringMesh.rotation.x = -Math.PI / 2;
            ringMesh.position.set(0, -1.64, -0.4);
            scene.add(ringMesh);
        });

        // Subtle Perimeter Light Pylons
        const pylonGeo = new THREE.CylinderGeometry(0.025, 0.025, 4.2, 8);
        const pylonMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.16
        });
        for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2;
            const pylon = new THREE.Mesh(pylonGeo, pylonMat);
            pylon.position.set(Math.cos(ang) * 9.8, 0.45, Math.sin(ang) * 9.8 - 0.8);
            scene.add(pylon);
        }

        // Central Holographic GIS / Cloud Core
        const coreOrigin = new THREE.Vector3(0, 0.35, 0.45);
        const commandGroup = new THREE.Group();
        commandGroup.position.copy(coreOrigin);
        scene.add(commandGroup);

        const corePlinth = new THREE.Mesh(
            new THREE.CylinderGeometry(0.95, 1.2, 0.5, 32),
            new THREE.MeshStandardMaterial({
                color: 0x0a1326,
                metalness: 0.85,
                roughness: 0.3
            })
        );
        corePlinth.position.set(0, -1.75, 0);
        commandGroup.add(corePlinth);

        const globeMesh = new THREE.Mesh(
            new THREE.IcosahedronGeometry(1.18, isMobile() ? 1 : 2),
            new THREE.MeshBasicMaterial({
                color: 0x38bdf8,
                wireframe: true,
                transparent: true,
                opacity: 0.28
            })
        );
        commandGroup.add(globeMesh);

        const innerCoreMesh = new THREE.Mesh(
            new THREE.IcosahedronGeometry(0.74, 1),
            new THREE.MeshStandardMaterial({
                color: 0x081329,
                emissive: 0x0f2547,
                roughness: 0.3,
                metalness: 0.88,
                transparent: true,
                opacity: 0.9
            })
        );
        commandGroup.add(innerCoreMesh);

        function createOrbitalRing(radius, colorHex, opacity, tiltX, tiltZ) {
            const segments = 72;
            const ringPts = [];
            for (let i = 0; i < segments; i++) {
                const theta = (i / segments) * Math.PI * 2;
                ringPts.push(new THREE.Vector3(Math.cos(theta) * radius, 0, Math.sin(theta) * radius));
            }
            const geo = new THREE.BufferGeometry().setFromPoints(ringPts);
            const mat = new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity });
            const ring = new THREE.LineLoop(geo, mat);
            ring.rotation.x = tiltX;
            ring.rotation.z = tiltZ;
            return ring;
        }

        const ringSky = createOrbitalRing(1.65, 0x38bdf8, 0.42, 0.55, 0.22);
        const ringIndigo = createOrbitalRing(2.05, 0x818cf8, 0.3, -0.42, 0.32);
        const ringEmerald = createOrbitalRing(1.4, 0x34d399, 0.34, 0.14, -0.2);
        commandGroup.add(ringSky, ringIndigo, ringEmerald);

        // Ambient Network Nodes & Traveling Pulses inside Central Core
        const nodeCount = isMobile() ? 16 : 24;
        const nodePositions = [];
        const nodeColors = [];
        const palette = [new THREE.Color(0x38bdf8), new THREE.Color(0x818cf8), new THREE.Color(0x34d399)];
        for (let i = 0; i < nodeCount; i++) {
            const phi = Math.acos(1 - (2 * (i + 0.5)) / nodeCount);
            const theta = Math.PI * (1 + Math.sqrt(5)) * i;
            const r = 1.48 + (i % 3) * 0.28;
            nodePositions.push(
                new THREE.Vector3(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi) * 0.84, r * Math.sin(phi) * Math.sin(theta))
            );
            const c = palette[i % palette.length];
            nodeColors.push(c.r, c.g, c.b);
        }

        const nodesGeo = new THREE.BufferGeometry().setFromPoints(nodePositions);
        nodesGeo.setAttribute('color', new THREE.Float32BufferAttribute(nodeColors, 3));
        commandGroup.add(
            new THREE.Points(
                nodesGeo,
                new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, opacity: 0.92 })
            )
        );

        const edgePairs = [];
        const edgeVerts = [];
        for (let i = 0; i < nodePositions.length; i++) {
            for (let j = i + 1; j < nodePositions.length; j++) {
                if (nodePositions[i].distanceTo(nodePositions[j]) < 1.6) {
                    edgePairs.push([nodePositions[i], nodePositions[j]]);
                    edgeVerts.push(
                        nodePositions[i].x, nodePositions[i].y, nodePositions[i].z,
                        nodePositions[j].x, nodePositions[j].y, nodePositions[j].z
                    );
                }
            }
        }
        const edgesGeo = new THREE.BufferGeometry();
        edgesGeo.setAttribute('position', new THREE.Float32BufferAttribute(edgeVerts, 3));
        commandGroup.add(
            new THREE.LineSegments(edgesGeo, new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.16 }))
        );

        const pulseCount = Math.min(edgePairs.length, isMobile() ? 8 : 16);
        const pulseMeta = Array.from({ length: pulseCount }, (_, idx) => ({
            edge: edgePairs[idx % Math.max(1, edgePairs.length)],
            progress: Math.random(),
            speed: 0.005 + Math.random() * 0.004
        }));
        const pulsePositions = new Float32Array(pulseCount * 3);
        const pulseGeo = new THREE.BufferGeometry();
        pulseGeo.setAttribute('position', new THREE.BufferAttribute(pulsePositions, 3));
        commandGroup.add(
            new THREE.Points(
                pulseGeo,
                new THREE.PointsMaterial({ color: 0x34d399, size: 0.11, transparent: true, opacity: 0.95 })
            )
        );

        // Ambient Star Dust Field around the Stage
        const dustCount = isMobile() ? 70 : 140;
        const dustVerts = new Float32Array(dustCount * 3);
        for (let i = 0; i < dustCount; i++) {
            const ang = Math.random() * Math.PI * 2;
            const dist = 4 + Math.random() * 14;
            dustVerts[i * 3] = Math.cos(ang) * dist;
            dustVerts[i * 3 + 1] = -0.8 + Math.random() * 6.5;
            dustVerts[i * 3 + 2] = Math.sin(ang) * dist - 1.0;
        }
        const dustGeo = new THREE.BufferGeometry();
        dustGeo.setAttribute('position', new THREE.BufferAttribute(dustVerts, 3));
        const dustPoints = new THREE.Points(
            dustGeo,
            new THREE.PointsMaterial({ color: 0x7dd3fc, size: 0.06, transparent: true, opacity: 0.45 })
        );
        scene.add(dustPoints);

        /* ---------------------------------------------------------
           BUILD THE 7 INTERACTIVE 3D STATIONS IN THE STAGE
        --------------------------------------------------------- */
        const STATIONS_CONFIG = [
            {
                id: 'home',
                code: '01',
                title: 'Perfil & KPIs',
                sub: '+15 Años · Meet',
                osPath: '~/perfil/eduardo-cayun.exec',
                pos: [-5.1, -1.62, 2.3],
                width: 2.55,
                height: 1.6,
                standHeight: 1.45,
                accentHex: 0x38bdf8,
                accentCss: '#38bdf8',
                images: [{ key: 'perfil', src: 'images/perfil_pro_eduf.jpg' }],
                extraType: 'kpis'
            },
            {
                id: 'credentials',
                code: '02',
                title: 'Credenciales & MIT',
                sub: 'MBA · IA · ISC2',
                osPath: '~/credenciales/formacion-mit.yml',
                pos: [-5.8, -1.62, -1.9],
                width: 2.6,
                height: 1.62,
                standHeight: 1.68,
                accentHex: 0x818cf8,
                accentCss: '#818cf8',
                images: []
            },
            {
                id: 'sentra',
                code: '03A',
                title: 'Banca & Sentra',
                sub: 'BCI · Falabella · BE',
                osPath: '~/proyectos/sentra-banca',
                pos: [-3.15, -1.62, -5.0],
                width: 2.65,
                height: 1.65,
                standHeight: 2.05,
                accentHex: 0x38bdf8,
                accentCss: '#38bdf8',
                images: []
            },
            {
                id: 'gobierno',
                code: '03B',
                title: 'SICA & SIGFE 2',
                sub: 'Contraloría · DIPRES',
                osPath: '~/proyectos/estado-sica-sigfe2',
                pos: [0, -1.62, -5.85],
                width: 3.15,
                height: 1.92,
                standHeight: 2.32,
                accentHex: 0x34d399,
                accentCss: '#34d399',
                images: [
                    { key: 'sica', src: 'images/project-sica.png' },
                    { key: 'sigfe2', src: 'images/project-sigfe2.png' }
                ]
            },
            {
                id: 'gis',
                code: '03C',
                title: 'UNIS GIS & ANDE',
                sub: 'Smallworld · AWS',
                osPath: '~/proyectos/gis-unis-ande',
                pos: [3.15, -1.62, -5.0],
                width: 2.65,
                height: 1.65,
                standHeight: 2.05,
                accentHex: 0xf59e0b,
                accentCss: '#fbbf24',
                images: [{ key: 'unis', src: 'images/project-unis.png' }]
            },
            {
                id: 'contact',
                code: '04',
                title: 'AI Brief & Meet',
                sub: 'Terminal IA · Links',
                osPath: 'eduardo@executive-desk ~ $ ask',
                pos: [5.8, -1.62, -1.9],
                width: 2.6,
                height: 1.62,
                standHeight: 1.68,
                accentHex: 0x34d399,
                accentCss: '#34d399',
                images: []
            },
            {
                id: 'arcade',
                code: '05',
                title: 'Tetris & Música IA',
                sub: 'Arcade · Web Audio',
                osPath: '~/lab/tetris-y-musica-ia',
                pos: [5.1, -1.62, 2.3],
                width: 2.55,
                height: 1.6,
                standHeight: 1.45,
                accentHex: 0xf472b6,
                accentCss: '#f472b6',
                images: [],
                extraType: 'equalizer'
            }
        ];

        const stationsMap = new Map();
        const stationHitMeshes = [];
        const arcadeBars = [];
        const kpiBlocks = [];
        const focusTargetPoint = new THREE.Vector3(0, 0.2, 2.8);

        STATIONS_CONFIG.forEach((cfg) => {
            const group = new THREE.Group();
            group.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);

            // Orient station cleanly toward the viewer amphitheater point
            const dx = focusTargetPoint.x - cfg.pos[0];
            const dz = focusTargetPoint.z - cfg.pos[2];
            const facingAngle = Math.atan2(dx, dz);
            group.rotation.y = facingAngle;

            // Pedestal Base + Glowing Collar + Mast
            const baseMesh = new THREE.Mesh(
                new THREE.CylinderGeometry(0.68, 0.84, 0.24, 24),
                new THREE.MeshStandardMaterial({ color: 0x0a1326, metalness: 0.85, roughness: 0.3 })
            );
            baseMesh.position.y = 0.12;
            group.add(baseMesh);

            const collarMat = new THREE.MeshBasicMaterial({
                color: cfg.accentHex,
                transparent: true,
                opacity: 0.6
            });
            const collarMesh = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.78, 32), collarMat);
            collarMesh.rotation.x = -Math.PI / 2;
            collarMesh.position.y = 0.03;
            group.add(collarMesh);

            const mastHeight = cfg.standHeight - cfg.height * 0.45;
            const mastMesh = new THREE.Mesh(
                new THREE.CylinderGeometry(0.08, 0.12, Math.max(0.45, mastHeight), 16),
                new THREE.MeshStandardMaterial({ color: 0x16223b, metalness: 0.85, roughness: 0.35 })
            );
            mastMesh.position.y = Math.max(0.45, mastHeight) * 0.5 + 0.15;
            group.add(mastMesh);

            // Monitor Chassis
            const screenCenterY = cfg.standHeight + cfg.height * 0.18;
            const frameMesh = new THREE.Mesh(
                new THREE.BoxGeometry(cfg.width + 0.14, cfg.height + 0.14, 0.1),
                new THREE.MeshStandardMaterial({
                    color: 0x080f20,
                    metalness: 0.8,
                    roughness: 0.28
                })
            );
            frameMesh.position.set(0, screenCenterY, 0);
            frameMesh.userData.stationId = cfg.id;
            group.add(frameMesh);
            stationHitMeshes.push(frameMesh);

            // Glowing Rim Frame
            const rimMat = new THREE.MeshBasicMaterial({
                color: cfg.accentHex,
                transparent: true,
                opacity: 0.48
            });
            const rimMesh = new THREE.Mesh(
                new THREE.BoxGeometry(cfg.width + 0.18, cfg.height + 0.18, 0.05),
                rimMat
            );
            rimMesh.position.set(0, screenCenterY, -0.03);
            group.add(rimMesh);

            // High-Res Dynamic Canvas Screen
            const screenTexture = createStationScreenTexture(THREE, cfg);
            const screenMat = new THREE.MeshBasicMaterial({
                map: screenTexture
            });
            const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(cfg.width, cfg.height), screenMat);
            screenMesh.position.set(0, screenCenterY, 0.056);
            screenMesh.userData.stationId = cfg.id;
            group.add(screenMesh);
            stationHitMeshes.push(screenMesh);

            // Unique 3D Props for Featured Stations
            if (cfg.extraType === 'kpis') {
                const miniCols = [0x38bdf8, 0x818cf8, 0x34d399];
                miniCols.forEach((cHex, i) => {
                    const cube = new THREE.Mesh(
                        new THREE.OctahedronGeometry(0.14, 0),
                        new THREE.MeshStandardMaterial({
                            color: cHex,
                            emissive: cHex,
                            emissiveIntensity: 0.35,
                            metalness: 0.6,
                            roughness: 0.25
                        })
                    );
                    cube.position.set(-0.7 + i * 0.7, screenCenterY + cfg.height * 0.5 + 0.32, 0.08);
                    group.add(cube);
                    kpiBlocks.push({ mesh: cube, baseY: cube.position.y, phase: i * 1.4 });
                });
            }

            if (cfg.extraType === 'equalizer') {
                for (let b = 0; b < 5; b++) {
                    const bar = new THREE.Mesh(
                        new THREE.BoxGeometry(0.14, 0.4, 0.14),
                        new THREE.MeshStandardMaterial({
                            color: b % 2 === 0 ? 0xf472b6 : 0x34d399,
                            emissive: b % 2 === 0 ? 0xf472b6 : 0x34d399,
                            emissiveIntensity: 0.45
                        })
                    );
                    bar.position.set(-0.7 + b * 0.35, 0.42, 0.58);
                    group.add(bar);
                    arcadeBars.push({ mesh: bar, phase: b * 0.9 });
                }
            }

            // Floor Energy Conduit connecting Central Core to Station Base
            const conduitGeo = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(coreOrigin.x, -1.62, coreOrigin.z),
                new THREE.Vector3(cfg.pos[0], -1.62, cfg.pos[2])
            ]);
            const conduitMat = new THREE.LineBasicMaterial({
                color: cfg.accentHex,
                transparent: true,
                opacity: 0.24
            });
            const conduitLine = new THREE.Line(conduitGeo, conduitMat);
            scene.add(conduitLine);

            scene.add(group);

            // Compute World Screen Center & Forward Normal for Camera Flight + Projected Marker
            const forward = new THREE.Vector3(Math.sin(facingAngle), 0, Math.cos(facingAngle)).normalize();
            const screenWorldPos = new THREE.Vector3(cfg.pos[0], cfg.pos[1] + screenCenterY, cfg.pos[2]);
            const markerWorldPos = new THREE.Vector3(
                cfg.pos[0],
                cfg.pos[1] + screenCenterY + cfg.height * 0.5 + 0.38,
                cfg.pos[2]
            );

            // Create HTML Floating Marker Element
            let markerEl = null;
            if (markersContainer) {
                markerEl = document.createElement('button');
                markerEl.type = 'button';
                markerEl.className = 'stage-marker';
                markerEl.dataset.stationId = cfg.id;
                markerEl.innerHTML = `
                    <span class="stage-marker-code">${cfg.code}</span>
                    <span class="stage-marker-title">${cfg.title}</span>
                    <span class="stage-marker-sub">· ${cfg.sub}</span>
                `;
                markerEl.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    focusStation(cfg.id);
                });
                markerEl.addEventListener('mouseenter', () => {
                    hoveredStationId = cfg.id;
                });
                markerEl.addEventListener('mouseleave', () => {
                    if (hoveredStationId === cfg.id) hoveredStationId = null;
                });
                markersContainer.appendChild(markerEl);
            }

            stationsMap.set(cfg.id, {
                cfg,
                group,
                frameMesh,
                rimMat,
                collarMat,
                conduitMat,
                forward,
                screenWorldPos,
                markerWorldPos,
                markerEl
            });
        });

        /* ---------------------------------------------------------
           CAMERA ORBIT 360°, ZOOM, RAYCASTING & SMOOTH FLIGHT
        --------------------------------------------------------- */
        const orbitState = {
            azimuth: 0,
            targetAzimuth: 0,
            polar: isMobile() ? 0.34 : 0.36,
            targetPolar: isMobile() ? 0.34 : 0.36,
            radius: isMobile() ? 16.4 : 13.8,
            targetRadius: isMobile() ? 16.4 : 13.8
        };

        const focusDragOffset = { yaw: 0, pitch: 0 };
        const overviewLookTarget = new THREE.Vector3(0, 0.5, -1.25);
        const currentLookAt = overviewLookTarget.clone();
        const desiredCamPos = new THREE.Vector3(0, 4.8, 12.2);
        const desiredLookAt = overviewLookTarget.clone();

        // Start camera neatly positioned at overview coordinates
        camera.position.set(
            overviewLookTarget.x + Math.sin(orbitState.azimuth) * Math.cos(orbitState.polar) * orbitState.radius,
            overviewLookTarget.y + Math.sin(orbitState.polar) * orbitState.radius,
            overviewLookTarget.z + Math.cos(orbitState.azimuth) * Math.cos(orbitState.polar) * orbitState.radius
        );
        camera.lookAt(currentLookAt);

        onStationFocusChange = (stationId) => {
            focusDragOffset.yaw = 0;
            focusDragOffset.pitch = 0;
            if (stationId === 'overview') {
                orbitState.targetPolar = isMobile() ? 0.34 : 0.36;
                orbitState.targetRadius = isMobile() ? 16.4 : 13.8;
            }
        };

        const raycaster = new THREE.Raycaster();
        const pointerNDC = new THREE.Vector2();
        let isDragging = false;
        let lastPointerX = 0;
        let lastPointerY = 0;
        let totalDragDist = 0;
        let lastManualInteraction = 0;

        canvas.addEventListener('pointerdown', (e) => {
            if (viewMode !== 'stage3d') return;
            isDragging = true;
            lastPointerX = e.clientX;
            lastPointerY = e.clientY;
            totalDragDist = 0;
            canvas.classList.add('is-dragging');
            lastManualInteraction = performance.now();
        });

        window.addEventListener('pointermove', (e) => {
            if (viewMode !== 'stage3d') return;

            if (isDragging) {
                const dx = e.clientX - lastPointerX;
                const dy = e.clientY - lastPointerY;
                lastPointerX = e.clientX;
                lastPointerY = e.clientY;
                totalDragDist += Math.hypot(dx, dy);
                lastManualInteraction = performance.now();

                if (activeStationId === 'overview') {
                    orbitState.targetAzimuth -= dx * 0.0055;
                    orbitState.targetPolar = Math.max(0.14, Math.min(0.88, orbitState.targetPolar + dy * 0.004));
                } else {
                    focusDragOffset.yaw = Math.max(-0.65, Math.min(0.65, focusDragOffset.yaw - dx * 0.0032));
                    focusDragOffset.pitch = Math.max(-0.32, Math.min(0.32, focusDragOffset.pitch + dy * 0.0025));
                }
                return;
            }

            // Hover raycast only when pointer is directly over the 3D canvas
            if (e.target !== canvas) {
                if (hoveredStationId && !document.querySelector('.stage-marker:hover')) {
                    hoveredStationId = null;
                }
                canvas.style.cursor = 'grab';
                return;
            }

            pointerNDC.x = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
            pointerNDC.y = -(e.clientY / Math.max(1, window.innerHeight)) * 2 + 1;
            raycaster.setFromCamera(pointerNDC, camera);
            const hits = raycaster.intersectObjects(stationHitMeshes, false);

            if (hits.length > 0 && hits[0].object.userData.stationId) {
                hoveredStationId = hits[0].object.userData.stationId;
                canvas.style.cursor = 'pointer';
            } else {
                hoveredStationId = null;
                canvas.style.cursor = 'grab';
            }
        });

        window.addEventListener('pointerup', (e) => {
            if (!isDragging) return;
            isDragging = false;
            canvas.classList.remove('is-dragging');

            if (viewMode === 'stage3d' && totalDragDist < 7 && e.target === canvas) {
                pointerNDC.x = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
                pointerNDC.y = -(e.clientY / Math.max(1, window.innerHeight)) * 2 + 1;
                raycaster.setFromCamera(pointerNDC, camera);
                const hits = raycaster.intersectObjects(stationHitMeshes, false);
                if (hits.length > 0 && hits[0].object.userData.stationId) {
                    focusStation(hits[0].object.userData.stationId);
                }
            }
        });

        canvas.addEventListener(
            'wheel',
            (e) => {
                if (viewMode !== 'stage3d' || activeStationId !== 'overview') return;
                e.preventDefault();
                lastManualInteraction = performance.now();
                orbitState.targetRadius = Math.max(8.0, Math.min(22.0, orbitState.targetRadius + e.deltaY * 0.008));
            },
            { passive: false }
        );

        window.addEventListener('resize', () => {
            camera.fov = isMobile() ? 58 : 48;
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setPixelRatio(
                isMobile() ? Math.min(window.devicePixelRatio || 1, 1.4) : Math.min(window.devicePixelRatio || 1, 2)
            );
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        const scratchVec = new THREE.Vector3();
        const rightVec = new THREE.Vector3();

        function updateProjectedMarkers() {
            if (!markersContainer || viewMode !== 'stage3d') return;
            const vw = window.innerWidth;
            const vh = window.innerHeight;

            stationsMap.forEach((st, id) => {
                const el = st.markerEl;
                if (!el) return;

                scratchVec.copy(st.markerWorldPos).project(camera);
                if (scratchVec.z > 1 || scratchVec.z < -1) {
                    el.classList.add('is-hidden');
                    return;
                }

                const px = (scratchVec.x * 0.5 + 0.5) * vw;
                const py = (-scratchVec.y * 0.5 + 0.5) * vh;

                if (px < 24 || px > vw - 24 || py < 62 || py > vh - 86) {
                    el.classList.add('is-hidden');
                    return;
                }

                el.classList.remove('is-hidden');
                el.classList.toggle('is-hovered', hoveredStationId === id);
                el.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0) translate(-50%, -100%)`;
            });
        }

        let animId = null;
        let lastTime = performance.now();

        function animate(now) {
            const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
            lastTime = now;
            const lerpFactor = 1 - Math.exp(-dt * 5.2);

            scrollVelocity *= 0.92;

            // Compute Camera Destination based on current Mode & Active Station
            if (viewMode === 'full') {
                const camState = FULL_CAMERA_STATES[fullActiveSectionId] || FULL_CAMERA_STATES.home;
                desiredCamPos.set(
                    camState.x,
                    camState.y,
                    camState.z + Math.max(-0.5, Math.min(0.5, scrollVelocity * 0.02))
                );
                desiredLookAt.set(camState.lookX, camState.lookY, camState.lookZ);
            } else if (activeStationId === 'overview') {
                if (!prefersReducedMotion && !isDragging && !hoveredStationId && now - lastManualInteraction > 2600) {
                    orbitState.targetAzimuth += dt * 0.095;
                }
                orbitState.azimuth += (orbitState.targetAzimuth - orbitState.azimuth) * lerpFactor;
                orbitState.polar += (orbitState.targetPolar - orbitState.polar) * lerpFactor;
                orbitState.radius += (orbitState.targetRadius - orbitState.radius) * lerpFactor;

                desiredCamPos.set(
                    overviewLookTarget.x + Math.sin(orbitState.azimuth) * Math.cos(orbitState.polar) * orbitState.radius,
                    overviewLookTarget.y + Math.sin(orbitState.polar) * orbitState.radius,
                    overviewLookTarget.z + Math.cos(orbitState.azimuth) * Math.cos(orbitState.polar) * orbitState.radius
                );
                desiredLookAt.copy(overviewLookTarget);
            } else if (activeStationId === 'projects') {
                const drawerShift = window.innerWidth >= 1024 ? 1.55 : 0;
                desiredCamPos.set(drawerShift + focusDragOffset.yaw * 2.2, 2.55 + focusDragOffset.pitch * 1.4, 1.8);
                desiredLookAt.set(drawerShift, 0.85, -5.2);
            } else if (stationsMap.has(activeStationId)) {
                const st = stationsMap.get(activeStationId);
                // Camera screen right vector perpendicular to station forward vector
                rightVec.set(st.forward.z, 0, -st.forward.x).normalize();
                const drawerShift = window.innerWidth >= 1024 ? 1.32 : 0;
                const dist = (st.cfg.id === 'gobierno' ? 4.35 : 3.95) + (isMobile() ? 1.25 : 0);

                // Orbit offset around the focused station screen
                const fx = Math.sin(focusDragOffset.yaw) * dist * 0.45;
                const fz = Math.cos(focusDragOffset.yaw) * dist;
                const offsetVec = new THREE.Vector3()
                    .copy(st.forward)
                    .multiplyScalar(fz)
                    .addScaledVector(rightVec, fx + drawerShift);

                desiredCamPos
                    .copy(st.screenWorldPos)
                    .add(offsetVec)
                    .add(new THREE.Vector3(0, 0.25 + focusDragOffset.pitch * 2.0, 0));

                desiredLookAt.copy(st.screenWorldPos).addScaledVector(rightVec, drawerShift);
            }

            camera.position.lerp(desiredCamPos, lerpFactor);
            currentLookAt.lerp(desiredLookAt, lerpFactor);
            camera.lookAt(currentLookAt);

            // Station Highlight Glow & Subtle Idle Floating Props
            stationsMap.forEach((st, id) => {
                const isSelected = activeStationId === id;
                const isHovered = hoveredStationId === id;
                const targetOpacity = isSelected ? 0.95 : isHovered ? 0.82 : 0.42;
                st.rimMat.opacity += (targetOpacity - st.rimMat.opacity) * lerpFactor;
                st.collarMat.opacity += ((isSelected || isHovered ? 0.92 : 0.45) - st.collarMat.opacity) * lerpFactor;
                st.conduitMat.opacity += ((isSelected || isHovered ? 0.72 : 0.22) - st.conduitMat.opacity) * lerpFactor;
            });

            if (!prefersReducedMotion) {
                const tSec = now * 0.001;
                commandGroup.rotation.y += dt * 0.16;
                globeMesh.rotation.x += dt * 0.08;
                ringSky.rotation.y += dt * 0.24;
                ringIndigo.rotation.y -= dt * 0.2;
                ringEmerald.rotation.y += dt * 0.18;
                dustPoints.rotation.y += dt * 0.02;

                kpiBlocks.forEach((kb) => {
                    kb.mesh.position.y = kb.baseY + Math.sin(tSec * 1.8 + kb.phase) * 0.07;
                    kb.mesh.rotation.y += dt * 0.8;
                });

                arcadeBars.forEach((ab) => {
                    const sY = 0.55 + (Math.sin(tSec * 4.5 + ab.phase) * 0.5 + 0.5) * 1.45;
                    ab.mesh.scale.y = sY;
                    ab.mesh.position.y = 0.22 + sY * 0.2;
                });

                if (edgePairs.length > 0) {
                    const attr = pulseGeo.getAttribute('position');
                    for (let i = 0; i < pulseMeta.length; i++) {
                        const pm = pulseMeta[i];
                        pm.progress = (pm.progress + pm.speed) % 1;
                        const a = pm.edge[0];
                        const b = pm.edge[1];
                        attr.setXYZ(
                            i,
                            a.x + (b.x - a.x) * pm.progress,
                            a.y + (b.y - a.y) * pm.progress,
                            a.z + (b.z - a.z) * pm.progress
                        );
                    }
                    attr.needsUpdate = true;
                }
            }

            renderer.render(scene, camera);
            updateProjectedMarkers();

            if (!prefersReducedMotion && !document.hidden) {
                animId = requestAnimationFrame(animate);
            }
        }

        if (prefersReducedMotion) {
            animate(performance.now());
        } else {
            animId = requestAnimationFrame(animate);
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    if (animId) cancelAnimationFrame(animId);
                    animId = null;
                } else if (!animId) {
                    lastTime = performance.now();
                    animId = requestAnimationFrame(animate);
                }
            });
        }
    }

    initThreeCommandCenter();

    /* -------------------------------------------------------------
       8. EXPANDABLE CASE STUDY MODAL (EXECUTIVE README.MD VIEWER)
    ------------------------------------------------------------- */
    const CASE_STUDIES = {
        sentra: {
            path: '~/proyectos/sentra-banca-ciberseguridad/README.md',
            badge: 'Banca & Retail Financiero · Sentra',
            title: 'Banca & Ciberseguridad Transaccional',
            context:
                'Entornos financieros de alta criticidad exigían remediar vulnerabilidades activas en motores de pago, frenar ataques automatizados de fuerza bruta y asegurar la estabilidad operacional bajo picos transaccionales en Chile y Argentina.',
            architecture:
                'Stack empresarial sobre Java EE y Oracle Service Bus (OSB), capas de validación antifraude contra ataques de diccionario para Falabella Financiero Argentina, endurecimiento de seguridad en motor de pagos de BCI y suites automatizadas con JMeter, SoapUI y TestLink para BancoEstado.',
            impact:
                'Mitigación efectiva de vulnerabilidades de alto riesgo en producción, protección activa frente a accesos maliciosos y reducción de tiempos de validación de rendimiento en operaciones bancarias críticas.',
            tags: ['Java EE', 'Oracle OSB', 'Ciberseguridad', 'JMeter', 'SoapUI', 'TestLink'],
            link: 'https://calendar.app.google/bLJvGyt2hxUdHTNG7',
            linkLabel: 'Consultar experiencia en reunión'
        },
        sica: {
            path: '~/proyectos/sica-contraloria/README.md',
            badge: 'Sector Público · Chile, Paraguay y Uruguay',
            title: 'SICA — Sistema Integrado de Control de Auditorías',
            context:
                'Modernización y estandarización del ciclo completo de fiscalización y auditoría gubernamental para la Contraloría General de la República de Chile, con adaptaciones institucionales para Paraguay y Uruguay.',
            architecture:
                'Arquitectura orientada a servicios (Oracle SOA Suite), capa de presentación empresarial con Oracle ADF y backend Java EE de alta trazabilidad y control documental.',
            impact:
                'Estandarización regional de procesos de auditoría pública, trazabilidad integral de hallazgos y continuidad operativa multi-país.',
            tags: ['Java EE', 'Oracle SOA', 'Oracle ADF', 'Arquitectura Empresarial'],
            link: 'https://www.youtube.com/watch?v=_sANAct5NVI',
            linkLabel: 'Ver Video Oficial'
        },
        sigfe2: {
            path: '~/proyectos/sigfe2-hacienda/README.md',
            badge: 'Ministerio de Hacienda · DIPRES',
            title: 'SIGFE 2 — Gestión Financiera del Estado',
            context:
                'El Sistema de Información para la Gestión Financiera del Estado requería robustecer la administración centralizada de contenidos y archivos asociados al presupuesto nacional.',
            architecture:
                'Integración del Módulo de Administración de Contenidos mediante Oracle Universal Content Management (UCM), Oracle Service Bus (OSB) y servicios J2EE de interoperabilidad estatal.',
            impact:
                'Modernización del flujo documental del presupuesto público, garantizando resguardo, disponibilidad y trazabilidad normativa en DIPRES.',
            tags: ['Oracle UCM', 'Oracle OSB', 'J2EE', 'Gestión Documental'],
            link: 'https://dipres.gob.cl/590/w3-channel.html',
            linkLabel: 'Sitio DIPRES'
        },
        unis: {
            path: '~/proyectos/unis-geoespacial-gis/README.md',
            badge: 'Utilities & Telco · Tierra-Ayni',
            title: 'UNIS — Plataforma de Gestión Geoespacial GIS',
            context:
                'Empresas distribuidoras de gas, electricidad y telecomunicaciones necesitaban unificar el registro geoespacial de activos de red, obras subterráneas, solicitudes LLAE y captura de datos en terreno.',
            architecture:
                'Dirección de desarrollo sobre plataforma GIS GE Smallworld integrada con arquitectura in-house Java EE 8, servicios cloud y aplicaciones operativas para Gasvalpo, Chilquinta, Gasco Magallanes y Entel.',
            impact:
                'Mayor precisión en el catastro de infraestructura crítica, agilización de flujos de ingeniería en terreno y estandarización de datos operativos entre múltiples utilities.',
            tags: ['GE Smallworld', 'Java EE 8', 'Cloud', 'GIS', 'Captura en Terreno'],
            link: 'https://tierra-ayni.com/?page_id=1977',
            linkLabel: 'Detalles del Producto'
        },
        ande: {
            path: '~/proyectos/ande-paraguay-aws/README.md',
            badge: 'Energía Nacional · AWS & GIS',
            title: 'Proyecto ANDE Paraguay — Arquitectura Cloud & GIS',
            context:
                'La Administración Nacional de Electricidad (ANDE) de Paraguay requería respaldo técnico especializado en la nube para sostener y escalar su infraestructura de software geoespacial corporativo.',
            architecture:
                'Asesoría técnica de arquitectura sobre Amazon Web Services (AWS), optimización de entornos cloud e integración con plataforma GIS GE Smallworld de distribución eléctrica nacional.',
            impact:
                'Continuidad operacional, escalabilidad de infraestructura en AWS y soporte especializado para la red eléctrica nacional paraguaya.',
            tags: ['AWS Cloud', 'GE Smallworld', 'GIS Eléctrico', 'Asesoría Arquitectura'],
            link: 'https://www.ande.gov.py/interna.php?id=15134',
            linkLabel: 'Web Institucional'
        }
    };

    function initCaseStudyModal() {
        const modal = document.getElementById('case-study-modal');
        if (!modal) return;

        const pathEl = document.getElementById('modal-path');
        const badgeEl = document.getElementById('modal-badge');
        const titleEl = document.getElementById('modal-title');
        const tabContentEl = document.getElementById('modal-tab-content');
        const tagsEl = document.getElementById('modal-tags');
        const extLinkEl = document.getElementById('modal-external-link');
        const extLabelEl = document.getElementById('modal-external-label');
        const closeBtn = document.getElementById('modal-close-btn');
        const dismissBtn = document.getElementById('modal-dismiss-btn');
        const tabBtns = Array.from(modal.querySelectorAll('.case-tab-btn'));

        let activeStudy = null;
        let activeTab = 'context';

        function renderTab() {
            if (!activeStudy || !tabContentEl) return;
            tabContentEl.textContent = activeStudy[activeTab] || '';
            tabBtns.forEach((b) => {
                b.classList.toggle('is-active', b.dataset.caseTab === activeTab);
            });
        }

        function openStudy(key) {
            const data = CASE_STUDIES[key];
            if (!data) return;

            activeStudy = data;
            activeTab = 'context';

            if (pathEl) pathEl.textContent = data.path;
            if (badgeEl) badgeEl.textContent = data.badge;
            if (titleEl) titleEl.textContent = data.title;
            if (extLinkEl) extLinkEl.href = data.link;
            if (extLabelEl) extLabelEl.textContent = data.linkLabel;

            if (tagsEl) {
                tagsEl.innerHTML = data.tags
                    .map(
                        (tag) =>
                            `<span class="bento-pill px-3 py-1 rounded-full font-mono-tech text-[11px] text-sky-300">${tag}</span>`
                    )
                    .join('');
            }

            renderTab();
            modal.classList.add('is-open');
            if (lenis && viewMode === 'full') lenis.stop();
        }

        function closeStudy() {
            modal.classList.remove('is-open');
            if (lenis && viewMode === 'full') lenis.start();
        }

        document.querySelectorAll('[data-case-study]').forEach((trigger) => {
            trigger.addEventListener('click', () => {
                openStudy(trigger.dataset.caseStudy);
            });
        });

        tabBtns.forEach((btn) => {
            btn.addEventListener('click', () => {
                activeTab = btn.dataset.caseTab || 'context';
                renderTab();
            });
        });

        if (closeBtn) closeBtn.addEventListener('click', closeStudy);
        if (dismissBtn) dismissBtn.addEventListener('click', closeStudy);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeStudy();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (modal.classList.contains('is-open')) {
                    closeStudy();
                } else if (viewMode === 'stage3d' && activeStationId !== 'overview') {
                    focusStation('overview');
                }
            }
        });
    }

    initCaseStudyModal();

    /* -------------------------------------------------------------
       9. INTERACTIVE TERMINAL "EXECUTIVE AI BRIEF" (TYPEWRITER)
    ------------------------------------------------------------- */
    function initExecutiveTerminal() {
        const commandEl = document.getElementById('terminal-command');
        const outputEl = document.getElementById('terminal-output');
        const chips = Array.from(document.querySelectorAll('[data-ai-question]'));
        if (!commandEl || !outputEl || chips.length === 0) return;

        const BRIEF_RESPONSES = {
            banca: {
                cmd: 'ask --topic "banca-ciberseguridad"',
                text: 'En Sentra lideré ingeniería senior para banca y retail financiero: mitigación de vulnerabilidades de alto riesgo en el motor de pagos de BCI, arquitectura de defensa contra ataques de diccionario (Java + OSB) para Falabella Financiero Argentina, y automatización de pruebas de rendimiento con JMeter y SoapUI en BancoEstado.'
            },
            gobierno: {
                cmd: 'ask --topic "gobierno-utilities"',
                text: 'En sector público y utilities dirigí soluciones de alcance nacional y regional: SICA para Contraloría (Chile, Paraguay y Uruguay) con Java EE/Oracle SOA, SIGFE 2 para Ministerio de Hacienda/DIPRES (Oracle UCM/OSB), UNIS GIS (GE Smallworld / JEE 8) en Gasvalpo, Chilquinta, Gasco Magallanes y Entel, además de asesoría AWS y GIS para ANDE Paraguay.'
            },
            credenciales: {
                cmd: 'ask --topic "credenciales-formacion"',
                text: 'MBA en Emprendimiento e Innovación (UDD), Ingeniero en Informática (UDLA) y Diplomados en Gestión de Proyectos PMI, Arquitectura de la Información y BI (DUOC UC & IEDE). Especializaciones recientes en MIT (2025–2026: IA Generativa, Transformación Digital e IoT), Top 8 entre +3.000 proyectos en Inmersión IA Google & Alura Latam, ISC2 CC, INCIBE (315 hrs), OCI Cloud, AWS y Data Science (307 hrs).'
            },
            reunion: {
                cmd: 'ask --topic "agendar-reunion"',
                text: 'Puedes reservar directamente una videollamada de 30 minutos en Google Meet desde el botón "Agendar Meet" (calendar.app.google/bLJvGyt2hxUdHTNG7) o conectar por LinkedIn (/in/eduardocayun) y GitHub (@educhile1) para evaluar consultorías B2B o roles ejecutivos de liderazgo TI.'
            }
        };

        let typingTimer = null;

        function typeResponse(key) {
            const payload = BRIEF_RESPONSES[key];
            if (!payload) return;

            if (typingTimer) {
                clearTimeout(typingTimer);
                typingTimer = null;
            }

            chips.forEach((c) => c.classList.toggle('is-selected', c.dataset.aiQuestion === key));
            commandEl.textContent = payload.cmd;

            if (prefersReducedMotion) {
                outputEl.textContent = payload.text;
                return;
            }

            outputEl.textContent = '';
            let i = 0;
            function tick() {
                if (i < payload.text.length) {
                    outputEl.textContent += payload.text.charAt(i);
                    i++;
                    typingTimer = setTimeout(tick, 11);
                }
            }
            tick();
        }

        chips.forEach((chip) => {
            chip.addEventListener('click', () => {
                typeResponse(chip.dataset.aiQuestion);
            });
        });

        typeResponse('banca');
    }

    initExecutiveTerminal();

    /* -------------------------------------------------------------
       10. GSAP + SCROLLTRIGGER CHOREOGRAPHY (FULL MODE) & BACK TO TOP
    ------------------------------------------------------------- */
    if (window.gsap && window.ScrollTrigger && !prefersReducedMotion) {
        window.ScrollTrigger.batch('.reveal-up', {
            start: 'top 88%',
            once: true,
            onEnter: (batch) => {
                if (viewMode !== 'full') return;
                window.gsap.fromTo(
                    batch,
                    { y: 24, opacity: 0 },
                    {
                        y: 0,
                        opacity: 1,
                        duration: 0.72,
                        stagger: 0.07,
                        ease: 'power3.out',
                        clearProps: 'transform,opacity'
                    }
                );
            }
        });
    }

    const backToTopBtn = document.getElementById('back-to-top');
    if (backToTopBtn) {
        window.addEventListener(
            'scroll',
            () => {
                if (viewMode !== 'full') return;
                const offset = window.scrollY || window.pageYOffset || 0;
                if (offset > 360) {
                    backToTopBtn.classList.remove('hidden');
                    backToTopBtn.classList.add('flex');
                } else {
                    backToTopBtn.classList.add('hidden');
                    backToTopBtn.classList.remove('flex');
                }
            },
            { passive: true }
        );

        backToTopBtn.addEventListener('click', () => {
            if (lenis) {
                lenis.scrollTo(0);
            } else {
                window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
            }
        });
    }
});
