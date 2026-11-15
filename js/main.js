/* =================================================================
   EDUARDO CAYÚN M. — CREATIVE ENGINE, CANVAS 60FPS, LENIS & GSAP
================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    const prefersReducedMotion =
        window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let scrollVelocity = 0;
    let lastNativeScrollY = window.scrollY || window.pageYOffset || 0;

    /* -------------------------------------------------------------
       1. LENIS SMOOTH SCROLL + GSAP SCROLLTRIGGER SYNC
    ------------------------------------------------------------- */
    let lenis = null;
    if (window.gsap && window.ScrollTrigger) {
        window.gsap.registerPlugin(window.ScrollTrigger);
    }

    if (typeof window.Lenis === 'function' && !prefersReducedMotion) {
        lenis = new window.Lenis({
            duration: 1.15,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            smoothWheel: true
        });

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

    /* -------------------------------------------------------------
       2. MOBILE CAPSULE MENU & SMOOTH INTERNAL NAVIGATION
    ------------------------------------------------------------- */
    const mobileBtn = document.getElementById('mobile-menu-button');
    const mobileMenu = document.getElementById('mobile-menu');

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

    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
        anchor.addEventListener('click', (e) => {
            const href = anchor.getAttribute('href');
            if (!href || href === '#') return;
            const target = document.querySelector(href);
            if (!target) return;

            e.preventDefault();
            closeMobileMenu();

            if (lenis) {
                lenis.scrollTo(target, { offset: -96 });
            } else {
                target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
            }
        });
    });

    /* -------------------------------------------------------------
       3. DYNAMIC ISLAND ACTIVE PILL INDICATOR (INTERSECTION OBSERVER)
    ------------------------------------------------------------- */
    const navLinksContainer = document.getElementById('nav-links-container');
    const navActivePill = document.getElementById('nav-active-pill');
    const navLinks = Array.from(document.querySelectorAll('.nav-link[data-section]'));
    let activeSectionId = 'home';

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

    function setActiveSection(sectionId) {
        activeSectionId = sectionId;
        let matchedLink = null;
        navLinks.forEach((link) => {
            const isMatch = link.dataset.section === sectionId;
            link.classList.toggle('is-active', isMatch);
            if (isMatch) matchedLink = link;
        });
        if (matchedLink) {
            movePillToLink(matchedLink);
        }
    }

    if (navLinks.length > 0 && navActivePill) {
        navLinks.forEach((link) => {
            link.addEventListener('mouseenter', () => movePillToLink(link));
        });

        if (navLinksContainer) {
            navLinksContainer.addEventListener('mouseleave', () => {
                const current = navLinks.find((l) => l.dataset.section === activeSectionId);
                if (current) movePillToLink(current);
            });
        }

        const observedSections = navLinks
            .map((l) => document.getElementById(l.dataset.section))
            .filter(Boolean);

        if ('IntersectionObserver' in window && observedSections.length > 0) {
            const observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting) {
                            setActiveSection(entry.target.id);
                        }
                    });
                },
                {
                    rootMargin: '-38% 0px -48% 0px',
                    threshold: 0
                }
            );
            observedSections.forEach((sec) => observer.observe(sec));
        }

        // Highlight bottom-most section cleanly when reaching page end
        window.addEventListener(
            'scroll',
            () => {
                const scrollBottom = window.innerHeight + (window.scrollY || window.pageYOffset);
                const docHeight = document.documentElement.scrollHeight;
                if (docHeight - scrollBottom < 40) {
                    setActiveSection('contact');
                }
            },
            { passive: true }
        );

        setActiveSection('home');
        window.addEventListener('resize', () => setActiveSection(activeSectionId));
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => setActiveSection(activeSectionId));
        }
    }

    /* -------------------------------------------------------------
       4. MAGNETIC CTA BUTTONS
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

    /* -------------------------------------------------------------
       5. LINEAR-STYLE DUAL SPOTLIGHT ON BENTO CARDS
    ------------------------------------------------------------- */
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

    /* -------------------------------------------------------------
       6. REAL-TIME 60 FPS CINEMATIC CANVAS (AURORA WAVES + NEURAL NET)
    ------------------------------------------------------------- */
    function initCinematicCanvas() {
        const canvas = document.getElementById('cinematic-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let width = window.innerWidth;
        let height = window.innerHeight;
        let dpr = Math.min(window.devicePixelRatio || 1, 2);

        let targetMouseX = 0;
        let targetMouseY = 0;
        let mouseX = 0;
        let mouseY = 0;
        let smoothedVel = 0;

        const NODE_COUNT = 42;
        const nodes = [];

        function seedNodes() {
            nodes.length = 0;
            for (let i = 0; i < NODE_COUNT; i++) {
                const paletteRoll = i % 3;
                const color =
                    paletteRoll === 0
                        ? '56, 189, 248'
                        : paletteRoll === 1
                          ? '129, 140, 248'
                          : '52, 211, 153';
                nodes.push({
                    x: Math.random() * width,
                    y: Math.random() * height,
                    vx: (Math.random() - 0.5) * 0.32,
                    vy: (Math.random() - 0.5) * 0.28,
                    radius: Math.random() * 1.6 + 0.9,
                    depth: Math.random() * 0.7 + 0.3,
                    color
                });
            }
        }

        function resizeCanvas() {
            width = window.innerWidth;
            height = window.innerHeight;
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.floor(width * dpr);
            canvas.height = Math.floor(height * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            if (nodes.length === 0) seedNodes();
        }

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        window.addEventListener(
            'mousemove',
            (e) => {
                targetMouseX = (e.clientX / Math.max(1, width)) * 2 - 1;
                targetMouseY = (e.clientY / Math.max(1, height)) * 2 - 1;
            },
            { passive: true }
        );

        const waves = [
            { baseY: 0.26, amp: 46, freq: 0.0022, speed: 0.00045, color: 'rgba(56, 189, 248, 0.085)' },
            { baseY: 0.36, amp: 58, freq: 0.0018, speed: -0.00038, color: 'rgba(129, 140, 248, 0.07)' },
            { baseY: 0.62, amp: 42, freq: 0.0025, speed: 0.00032, color: 'rgba(52, 211, 153, 0.045)' },
            { baseY: 0.78, amp: 52, freq: 0.0016, speed: -0.00028, color: 'rgba(56, 189, 248, 0.05)' }
        ];

        let animId = null;

        function renderFrame(time) {
            mouseX += (targetMouseX - mouseX) * 0.045;
            mouseY += (targetMouseY - mouseY) * 0.045;
            smoothedVel += (scrollVelocity - smoothedVel) * 0.08;
            scrollVelocity *= 0.92;

            ctx.clearRect(0, 0, width, height);

            // Base obsidian tone
            ctx.fillStyle = '#04060c';
            ctx.fillRect(0, 0, width, height);

            // 1. Topographic Silk Aurora Waves
            waves.forEach((w, idx) => {
                ctx.beginPath();
                const centerY =
                    height * w.baseY + mouseY * (18 + idx * 7) - Math.max(-45, Math.min(45, smoothedVel * 0.65));
                const phase = time * w.speed + idx * 1.4;
                const step = Math.max(18, Math.floor(width / 48));

                for (let x = 0; x <= width + step; x += step) {
                    const y =
                        centerY +
                        Math.sin(x * w.freq + phase + mouseX * 0.6) * w.amp +
                        Math.cos(x * w.freq * 0.55 - phase * 0.8) * (w.amp * 0.45);
                    if (x === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                }

                ctx.strokeStyle = w.color;
                ctx.lineWidth = 1.35;
                ctx.stroke();

                // Soft atmospheric ribbon below the topographic line
                ctx.lineTo(width + step, height);
                ctx.lineTo(0, height);
                ctx.closePath();
                const ribbonGrad = ctx.createLinearGradient(0, centerY - w.amp, 0, centerY + 190);
                ribbonGrad.addColorStop(0, w.color);
                ribbonGrad.addColorStop(1, 'rgba(4, 6, 12, 0)');
                ctx.fillStyle = ribbonGrad;
                ctx.fill();
            });

            // 2. Neural Constellation Nodes & Filaments
            const maxLinkDist = Math.min(165, Math.max(105, width * 0.13));
            const speedBoost = 1 + Math.min(2.2, Math.abs(smoothedVel) * 0.05);

            for (let i = 0; i < nodes.length; i++) {
                const n = nodes[i];
                if (!prefersReducedMotion) {
                    n.x += n.vx * speedBoost;
                    n.y += (n.vy - smoothedVel * 0.025 * n.depth) * speedBoost;

                    if (n.x < -20) n.x = width + 20;
                    if (n.x > width + 20) n.x = -20;
                    if (n.y < -20) n.y = height + 20;
                    if (n.y > height + 20) n.y = -20;
                }
            }

            for (let i = 0; i < nodes.length; i++) {
                const a = nodes[i];
                const ax = a.x + mouseX * 22 * a.depth;
                const ay = a.y + mouseY * 18 * a.depth;

                for (let j = i + 1; j < nodes.length; j++) {
                    const b = nodes[j];
                    const bx = b.x + mouseX * 22 * b.depth;
                    const by = b.y + mouseY * 18 * b.depth;
                    const dx = ax - bx;
                    const dy = ay - by;
                    const dist = Math.hypot(dx, dy);

                    if (dist < maxLinkDist) {
                        const alpha = (1 - dist / maxLinkDist) * 0.14;
                        ctx.strokeStyle = `rgba(148, 163, 184, ${alpha})`;
                        ctx.lineWidth = 0.75;
                        ctx.beginPath();
                        ctx.moveTo(ax, ay);
                        ctx.lineTo(bx, by);
                        ctx.stroke();
                    }
                }

                ctx.fillStyle = `rgba(${a.color}, 0.55)`;
                ctx.beginPath();
                ctx.arc(ax, ay, a.radius, 0, Math.PI * 2);
                ctx.fill();
            }

            if (!prefersReducedMotion && !document.hidden) {
                animId = requestAnimationFrame(renderFrame);
            }
        }

        if (prefersReducedMotion) {
            renderFrame(0);
        } else {
            animId = requestAnimationFrame(renderFrame);
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    if (animId) cancelAnimationFrame(animId);
                    animId = null;
                } else if (!animId) {
                    animId = requestAnimationFrame(renderFrame);
                }
            });
        }
    }

    initCinematicCanvas();

    /* -------------------------------------------------------------
       7. GSAP + SCROLLTRIGGER CHOREOGRAPHY & ANIMATED KPI COUNTERS
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
            duration: 1.4,
            ease: 'power2.out',
            onUpdate: () => {
                el.textContent = `${prefix}${Math.round(state.val)}`;
            }
        });
    }

    if (window.gsap && !prefersReducedMotion) {
        // Staggered Hero Reveal with subtle blur-to-crisp transition
        window.gsap.fromTo(
            '.hero-reveal',
            { y: 26, opacity: 0, filter: 'blur(8px)' },
            {
                y: 0,
                opacity: 1,
                filter: 'blur(0px)',
                duration: 0.9,
                stagger: 0.09,
                ease: 'power3.out',
                clearProps: 'filter,transform,opacity'
            }
        );

        if (window.ScrollTrigger) {
            window.ScrollTrigger.batch('.reveal-up', {
                start: 'top 88%',
                once: true,
                onEnter: (batch) => {
                    window.gsap.fromTo(
                        batch,
                        { y: 26, opacity: 0 },
                        {
                            y: 0,
                            opacity: 1,
                            duration: 0.78,
                            stagger: 0.08,
                            ease: 'power3.out',
                            clearProps: 'transform,opacity'
                        }
                    );
                }
            });

            document.querySelectorAll('.kpi-counter').forEach((counterEl) => {
                window.ScrollTrigger.create({
                    trigger: counterEl,
                    start: 'top 92%',
                    once: true,
                    onEnter: () => animateCounter(counterEl)
                });
            });

            window.addEventListener('load', () => {
                window.ScrollTrigger.refresh();
            });
        }
    } else {
        document.querySelectorAll('.kpi-counter').forEach(animateCounter);
    }

    /* -------------------------------------------------------------
       8. BACK TO TOP BUTTON
    ------------------------------------------------------------- */
    const backToTopBtn = document.getElementById('back-to-top');
    if (backToTopBtn) {
        window.addEventListener(
            'scroll',
            () => {
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
