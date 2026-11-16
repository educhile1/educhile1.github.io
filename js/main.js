/* =================================================================
   EDUARDO CAYÚN M. — 3D EXECUTIVE OFFICE & COMMAND CENTER ENGINE
================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    const prefersReducedMotion =
        window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const FULL_SECTIONS_ORDER = ['home', 'credentials', 'projects', 'contact'];
    const STATIONS_ORDER = ['overview', 'projects', 'credentials', 'home', 'contact', 'arcade', 'music', 'certifications'];

    const STATION_META = {
        overview: {
            code: '00',
            section: null,
            group: null,
            navSection: 'home',
            path: '~/oficina-ejecutiva-3d',
            hudLabel: 'CAM // SALA-EJECUTIVA'
        },
        projects: {
            code: '01',
            section: 'projects',
            group: null,
            navSection: 'projects',
            path: '~/proyectos/casos-criticos',
            hudLabel: 'CAM // 01-PROYECTOS'
        },
        credentials: {
            code: '02',
            section: 'credentials',
            group: null,
            navSection: 'credentials',
            path: '~/credenciales/mba-mit-certificaciones',
            hudLabel: 'CAM // 02-CREDENCIALES'
        },
        certifications: {
            code: '07',
            section: 'credentials',
            group: null,
            navSection: 'credentials',
            path: '~/certificaciones/stack-tecnologico',
            hudLabel: 'CAM // 07-CERTIFICACIONES'
        },
        home: {
            code: '03',
            section: 'home',
            group: null,
            navSection: 'home',
            path: '~/perfil/eduardo-cayun-mba',
            hudLabel: 'CAM // 03-PERFIL'
        },
        contact: {
            code: '04',
            section: 'contact',
            group: null,
            navSection: 'contact',
            path: '~/contacto/reunion-executive-brief',
            hudLabel: 'CAM // 04-CONTACTO'
        },
        arcade: {
            code: '05',
            section: 'projects',
            group: 'arcade',
            navSection: 'projects',
            path: '~/lab/edu-tetris-arcade',
            hudLabel: 'CAM // 05-ARCADE'
        },
        music: {
            code: '06',
            section: 'projects',
            group: 'arcade',
            navSection: 'projects',
            path: '~/lab/reproductor-musica-ia',
            hudLabel: 'CAM // 06-MUSICA'
        },
        cv: {
            code: '2D',
            section: 'credentials',
            group: null,
            navSection: 'credentials',
            path: '~/curriculum-vitae/version-2d',
            hudLabel: 'CAM // 2D-CURRICULUM'
        },
        sentra: {
            code: '01A',
            section: 'projects',
            group: 'sentra',
            navSection: 'projects',
            path: '~/proyectos/sentra-banca-ciberseguridad',
            hudLabel: 'CAM // 01A-SENTRA'
        },
        gobierno: {
            code: '01B',
            section: 'projects',
            group: 'gobierno',
            navSection: 'projects',
            path: '~/proyectos/gobierno-sica-sigfe2',
            hudLabel: 'CAM // 01B-GOBIERNO'
        },
        gis: {
            code: '01C',
            section: 'projects',
            group: 'gis',
            navSection: 'projects',
            path: '~/proyectos/gis-cloud-unis-ande',
            hudLabel: 'CAM // 01C-GIS'
        }
    };

    let viewMode = 'stage3d'; // 'stage3d' | 'full'
    let activeStationId = 'overview';
    let fullActiveSectionId = 'home';
    let scrollVelocity = 0;
    let lastNativeScrollY = window.scrollY || window.pageYOffset || 0;

    /* -------------------------------------------------------------
       1. BOOT SEQUENCE OVERLAY (~1.0s)
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

        const duration = 950;
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
                }, 100);
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
        home: { label: 'CAM // 01-INICIO' },
        credentials: { label: 'CAM // 02-CREDENCIALES' },
        projects: { label: 'CAM // 03-PROYECTOS' },
        contact: { label: 'CAM // 04-CONTACTO' }
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

    /* -------------------------------------------------------------
       DARK NOTHING-OS PHONE CLOCK & LIVE WIDGETS
    ------------------------------------------------------------- */
    const phoneClockEl = document.getElementById('phone-pixel-clock');
    const phoneStatusClockEl = document.getElementById('phone-status-clock');
    const phoneDateEl = document.getElementById('phone-date-display');

    const BITMAPS_5X7 = {
        '0': [1,1,1,1,1, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 1,1,1,1,1],
        '1': [0,0,1,0,0, 0,1,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,0,1,0,0, 0,1,1,1,0],
        '2': [1,1,1,1,1, 0,0,0,0,1, 0,0,0,0,1, 1,1,1,1,1, 1,0,0,0,0, 1,0,0,0,0, 1,1,1,1,1],
        '3': [1,1,1,1,1, 0,0,0,0,1, 0,0,0,0,1, 0,1,1,1,1, 0,0,0,0,1, 0,0,0,0,1, 1,1,1,1,1],
        '4': [1,0,0,0,1, 1,0,0,0,1, 1,0,0,0,1, 1,1,1,1,1, 0,0,0,0,1, 0,0,0,0,1, 0,0,0,0,1],
        '5': [1,1,1,1,1, 1,0,0,0,0, 1,0,0,0,0, 1,1,1,1,1, 0,0,0,0,1, 0,0,0,0,1, 1,1,1,1,1],
        '6': [1,1,1,1,1, 1,0,0,0,0, 1,0,0,0,0, 1,1,1,1,1, 1,0,0,0,1, 1,0,0,0,1, 1,1,1,1,1],
        '7': [1,1,1,1,1, 0,0,0,0,1, 0,0,0,1,0, 0,0,1,0,0, 0,1,0,0,0, 0,1,0,0,0, 0,1,0,0,0],
        '8': [1,1,1,1,1, 1,0,0,0,1, 1,0,0,0,1, 1,1,1,1,1, 1,0,0,0,1, 1,0,0,0,1, 1,1,1,1,1],
        '9': [1,1,1,1,1, 1,0,0,0,1, 1,0,0,0,1, 1,1,1,1,1, 0,0,0,0,1, 0,0,0,0,1, 1,1,1,1,1]
    };

    let digitDotContainers = [];

    function initPhonePixelClock() {
        if (!phoneClockEl) return;
        phoneClockEl.innerHTML = '';
        digitDotContainers = [];

        function createDigitEl(idx) {
            const wrap = document.createElement('div');
            wrap.className = 'pixel-digit';
            wrap.dataset.digitIdx = String(idx);
            const dots = [];
            for (let i = 0; i < 35; i++) {
                const dot = document.createElement('span');
                dot.className = 'pixel-dot';
                wrap.appendChild(dot);
                dots.push(dot);
            }
            digitDotContainers.push(dots);
            return wrap;
        }

        function createColonEl() {
            const colon = document.createElement('div');
            colon.className = 'pixel-colon';
            colon.innerHTML = '<span class="pixel-colon-dot"></span><span class="pixel-colon-dot"></span>';
            return colon;
        }

        phoneClockEl.appendChild(createDigitEl(0));
        phoneClockEl.appendChild(createDigitEl(1));
        phoneClockEl.appendChild(createColonEl());
        phoneClockEl.appendChild(createDigitEl(2));
        phoneClockEl.appendChild(createDigitEl(3));

        updatePhoneClock();
        setInterval(updatePhoneClock, 1000);
    }

    function updatePhoneClock() {
        const now = new Date();
        let timeStr = '12:00';
        try {
            timeStr = new Intl.DateTimeFormat('es-CL', {
                timeZone: 'America/Santiago',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            }).format(now);
        } catch {
            const hh = String(now.getHours()).padStart(2, '0');
            const mm = String(now.getMinutes()).padStart(2, '0');
            timeStr = `${hh}:${mm}`;
        }

        if (phoneStatusClockEl) {
            phoneStatusClockEl.textContent = timeStr;
        }

        if (phoneDateEl) {
            try {
                const parts = new Intl.DateTimeFormat('es-CL', {
                    timeZone: 'America/Santiago',
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short'
                }).formatToParts(now);
                const day = parts.find((p) => p.type === 'day')?.value || '';
                const weekday = (parts.find((p) => p.type === 'weekday')?.value || '')
                    .toUpperCase()
                    .replace('.', '');
                const month = (parts.find((p) => p.type === 'month')?.value || '')
                    .toUpperCase()
                    .replace('.', '');
                phoneDateEl.textContent = `${weekday} ${day} ${month} · SANTIAGO`;
            } catch {
                phoneDateEl.textContent = 'CLT · SANTIAGO';
            }
        }

        const digits = [
            timeStr.charAt(0) || '0',
            timeStr.charAt(1) || '0',
            timeStr.charAt(3) || '0',
            timeStr.charAt(4) || '0'
        ];

        digits.forEach((char, dIdx) => {
            const dots = digitDotContainers[dIdx];
            if (!dots) return;
            const pattern = BITMAPS_5X7[char] || BITMAPS_5X7['0'];
            for (let i = 0; i < 35; i++) {
                dots[i].classList.toggle('is-lit', pattern[i] === 1);
            }
        });
    }

    initPhonePixelClock();

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

        const arcadeCta = document.getElementById('stage-arcade-cta');
        if (arcadeCta) {
            if (stationId === 'arcade' && viewMode === 'stage3d') {
                arcadeCta.classList.remove('hidden');
                requestAnimationFrame(() => {
                    arcadeCta.classList.remove('opacity-0', 'scale-95');
                    arcadeCta.classList.add('opacity-100', 'scale-100');
                });
            } else {
                arcadeCta.classList.remove('opacity-100', 'scale-100');
                arcadeCta.classList.add('opacity-0', 'scale-95');
                setTimeout(() => {
                    if (activeStationId !== 'arcade' || viewMode !== 'stage3d') {
                        arcadeCta.classList.add('hidden');
                    }
                }, 250);
            }
        }
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

        if (stationId === 'arcade' || stationId === 'music') {
            const labCard = document.getElementById('lab-arcade-card');
            if (labCard && portfolioMain) {
                setTimeout(() => {
                    labCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 80);
            }
        }

        if (meta.section === 'home') {
            document.querySelectorAll('.kpi-counter').forEach(animateCounter);
        }
    }

    let onStationFocusChange = () => {};

    function focusStation(stationId) {
        if (stationId === 'cv' || stationId === '2d') {
            closeMobileMenu();
            activeStationId = 'cv';
            onStationFocusChange('cv');
            setTimeout(() => {
                setViewMode('full');
            }, 380);
            return;
        }
        if (!STATION_META[stationId]) return;
        closeMobileMenu();

        if (viewMode !== 'stage3d') {
            setViewMode('stage3d', { skipReset: true });
        }

        activeStationId = stationId;
        applyInspectorContent(stationId);
        syncStationVisualUI(stationId);
        onStationFocusChange(stationId);
        if (stationId === 'music' && window.eduSpotifyPlayer) {
            window.eduSpotifyPlayer.expand();
        }
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
            if (viewModeLabel) viewModeLabel.textContent = 'Ver 3D';
            const mLabel = document.getElementById('mobile-view-mode-label');
            const mIcon = document.getElementById('mobile-view-mode-icon');
            if (mLabel) mLabel.textContent = 'Ver 3D';
            if (mIcon) mIcon.textContent = '◈';
            const f3d = document.getElementById('floating-ver-3d');
            if (f3d) f3d.classList.remove('hidden');

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
            if (viewModeLabel) viewModeLabel.textContent = 'Opción 2D';
            const mLabel = document.getElementById('mobile-view-mode-label');
            const mIcon = document.getElementById('mobile-view-mode-icon');
            if (mLabel) mLabel.textContent = 'Opción 2D';
            if (mIcon) mIcon.textContent = '▤';
            const f3d = document.getElementById('floating-ver-3d');
            if (f3d) f3d.classList.add('hidden');

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
            const m = btn.dataset.switchMode;
            if (m === 'toggle') {
                setViewMode(viewMode === 'stage3d' ? 'full' : 'stage3d');
            } else {
                setViewMode(m === 'full' ? 'full' : 'stage3d');
            }
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
        setViewMode('stage3d', { skipReset: true });
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

    // Prevent wheel inside Drawer / Dock from zooming the 3D canvas behind it
    [portfolioMain, document.getElementById('stage-dock')].forEach((el) => {
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
       6. 3D EXECUTIVE ROOM INITIALIZATION (FALLBACK TO 2D IF NEEDED)
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
            ctx.fillStyle = '#05060b';
            ctx.fillRect(0, 0, w, h);

            pts.forEach((p) => {
                if (!prefersReducedMotion) {
                    p.x = (p.x + p.vx + w) % w;
                    p.y = (p.y + p.vy + h) % h;
                }
                ctx.fillStyle = 'rgba(244, 114, 182, 0.45)';
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

    function init3DScene() {
        const canvas = document.getElementById('webgl-stage');
        const markersContainer = document.getElementById('stage-3d-markers');
        if (!canvas) return;

        const api = {
            focusStation: (id) => focusStation(id),
            onFocusChange: (fn) => {
                const prev = onStationFocusChange;
                onStationFocusChange = (id) => {
                    prev(id);
                    fn(id);
                };
            },
            getViewMode: () => viewMode,
            getActiveStation: () => activeStationId,
            setViewMode: (mode, opts) => setViewMode(mode, opts)
        };

        if (window.EduRoomScene && typeof window.EduRoomScene.init === 'function') {
            const ok = window.EduRoomScene.init({
                canvas,
                markersContainer,
                api,
                reducedMotion: prefersReducedMotion
            });
            if (ok) return;
        }

        initFallback2DStage(canvas);
    }

    init3DScene();

    /* -------------------------------------------------------------
       7. EXPANDABLE CASE STUDY MODAL (EXECUTIVE README.MD VIEWER)
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
       8. INTERACTIVE TERMINAL "EXECUTIVE AI BRIEF" (TYPEWRITER)
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
            experiencia: {
                cmd: 'ask --topic "experiencia-laboral"',
                text: '+15 años de trayectoria en 6 posiciones clave: Jefe de Proyectos y Delegado de Ciberseguridad en Tierra Ayni (2018–Pres; ANCI, Ley Marco PSE, Wazuh SIEM/XDR, Shuffle SOAR, Red Team Linux, AWS ANDE Paraguay, UNIS Gasvalpo); Ing. Software en Sentra (2016–2018; BCI, Falabella Argentina, BancoEstado OPF); Analista Arq & Dev en Aseguradora Porvenir (2016; AWS, SISEG JEE, PostgreSQL, Adempiere); Analista Programador en Contraloría General CGR (2012–2015; SICA v3/v4, Oracle SOA, SIAPER, ASTREA, Paraguay y Uruguay); Ing. Software en Accenture / Xinergía (2011–2012; QA, auto ambientes UNIX, Struts); y Consultor TI en Everis NTT DATA (2010–2011; SIGFE 2 Ministerio de Hacienda/DIPRES).'
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
       9. GSAP + SCROLLTRIGGER CHOREOGRAPHY (FULL MODE) & BACK TO TOP
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
