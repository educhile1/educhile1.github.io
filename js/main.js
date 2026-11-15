/* =================================================================
   EDUARDO CAYÚN M. — 3D EXECUTIVE COMMAND CENTER, HUD & OS ENGINE
================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    const prefersReducedMotion =
        window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const SECTIONS_ORDER = ['home', 'credentials', 'projects', 'contact'];
    let activeSectionId = 'home';
    let scrollVelocity = 0;
    let lastNativeScrollY = window.scrollY || window.pageYOffset || 0;

    /* -------------------------------------------------------------
       1. BOOT SEQUENCE OVERLAY (~1.15s)
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

        const duration = 1050;
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
                }, 140);
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

    function scrollToSection(sectionId) {
        const target = document.getElementById(sectionId);
        if (!target) return;
        if (lenis) {
            lenis.scrollTo(target, { offset: -92 });
        } else {
            target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
        }
    }

    /* -------------------------------------------------------------
       3. MOBILE CAPSULE MENU & INTERNAL ANCHOR NAVIGATION
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
            scrollToSection(target.id);
        });
    });

    /* -------------------------------------------------------------
       4. HUD TELEMETRY, REAL-TIME CLOCK & NUMBERED SECTION SYNC
    ------------------------------------------------------------- */
    const hudClock = document.getElementById('hud-clock');
    const hudSectionIndicator = document.getElementById('hud-section-indicator');
    const hudCameraLabel = document.getElementById('hud-camera-label');
    const hudPrevBtn = document.getElementById('hud-prev-btn');
    const hudNextBtn = document.getElementById('hud-next-btn');

    const SECTION_CAMERA_STATES = {
        home: { x: 0, y: 0.9, z: 8.6, lookX: 0, lookY: 0, lookZ: 0, label: 'CAM // ORBITAL-GIS' },
        credentials: { x: -2.4, y: 1.5, z: 7.1, lookX: 0.3, lookY: 0.1, lookZ: 0, label: 'CAM // CORE-SYSTEM' },
        projects: { x: 2.5, y: 2.9, z: 7.3, lookX: -0.2, lookY: -0.1, lookZ: 0, label: 'CAM // CLOUD-TOPOLOGY' },
        contact: { x: 0.35, y: 0.45, z: 6.4, lookX: 0, lookY: 0.2, lookZ: 0, label: 'CAM // EXEC-UPLINK' }
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

    const navLinksContainer = document.getElementById('nav-links-container');
    const navActivePill = document.getElementById('nav-active-pill');
    const navLinks = Array.from(document.querySelectorAll('.nav-link[data-section]'));

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
        if (!SECTIONS_ORDER.includes(sectionId)) return;
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

        const idx = SECTIONS_ORDER.indexOf(sectionId) + 1;
        if (hudSectionIndicator) {
            hudSectionIndicator.textContent = `0${idx} / 0${SECTIONS_ORDER.length}`;
        }
        if (hudCameraLabel && SECTION_CAMERA_STATES[sectionId]) {
            hudCameraLabel.textContent = SECTION_CAMERA_STATES[sectionId].label;
        }
    }

    if (hudPrevBtn) {
        hudPrevBtn.addEventListener('click', () => {
            const cur = SECTIONS_ORDER.indexOf(activeSectionId);
            const prevIdx = (cur - 1 + SECTIONS_ORDER.length) % SECTIONS_ORDER.length;
            scrollToSection(SECTIONS_ORDER[prevIdx]);
        });
    }

    if (hudNextBtn) {
        hudNextBtn.addEventListener('click', () => {
            const cur = SECTIONS_ORDER.indexOf(activeSectionId);
            const nextIdx = (cur + 1) % SECTIONS_ORDER.length;
            scrollToSection(SECTIONS_ORDER[nextIdx]);
        });
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
       6. THREE.JS 3D EXECUTIVE COMMAND CENTER (WITH 2D FALLBACK)
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

        const pts = Array.from({ length: 34 }, () => ({
            x: Math.random() * w,
            y: Math.random() * h,
            vx: (Math.random() - 0.5) * 0.3,
            vy: (Math.random() - 0.5) * 0.3,
            r: Math.random() * 1.6 + 0.8
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
                alpha: true,
                antialias: true,
                powerPreference: 'high-performance'
            });
        } catch {
            initFallback2DStage(canvas);
            return;
        }

        const isMobile = window.innerWidth < 768;
        renderer.setPixelRatio(isMobile ? Math.min(window.devicePixelRatio || 1, 1.35) : Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0x04060c, 1);

        const scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x04060c, 0.055);

        const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 100);
        camera.position.set(0, 0.9, 8.6);

        // Volumetric-feel Ambient & Directional Lighting
        const ambientLight = new THREE.AmbientLight(0x94a3b8, 0.65);
        scene.add(ambientLight);

        const skyLight = new THREE.PointLight(0x38bdf8, 2.2, 24);
        skyLight.position.set(4.5, 4.5, 5);
        scene.add(skyLight);

        const indigoLight = new THREE.PointLight(0x818cf8, 1.8, 24);
        indigoLight.position.set(-5, -2.5, 4);
        scene.add(indigoLight);

        // Architectural Command Group
        const commandGroup = new THREE.Group();
        scene.add(commandGroup);

        // 1. Dark Architectural Floor Grid
        const gridHelper = new THREE.GridHelper(32, 32, 0x1e3a5f, 0x0f172a);
        gridHelper.position.y = -2.8;
        const gridMats = Array.isArray(gridHelper.material) ? gridHelper.material : [gridHelper.material];
        gridMats.forEach((m) => {
            m.transparent = true;
            m.opacity = 0.45;
        });
        scene.add(gridHelper);

        // 2. Geospatial GIS Wireframe Sphere & Core
        const globeGeo = new THREE.IcosahedronGeometry(2.15, isMobile ? 1 : 2);
        const globeWireMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            wireframe: true,
            transparent: true,
            opacity: 0.22
        });
        const globeMesh = new THREE.Mesh(globeGeo, globeWireMat);
        commandGroup.add(globeMesh);

        const coreGeo = new THREE.IcosahedronGeometry(1.42, 1);
        const coreMat = new THREE.MeshStandardMaterial({
            color: 0x081329,
            emissive: 0x0f2547,
            roughness: 0.35,
            metalness: 0.85,
            transparent: true,
            opacity: 0.82
        });
        const coreMesh = new THREE.Mesh(coreGeo, coreMat);
        commandGroup.add(coreMesh);

        // 3. Tilted Orbital Rings (Cloud / Security Perimeter)
        function createOrbitalRing(radius, colorHex, opacity, tiltX, tiltZ) {
            const segments = 96;
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

        const ringSky = createOrbitalRing(2.85, 0x38bdf8, 0.36, 0.55, 0.25);
        const ringIndigo = createOrbitalRing(3.45, 0x818cf8, 0.24, -0.45, 0.35);
        const ringEmerald = createOrbitalRing(2.4, 0x34d399, 0.28, 0.12, -0.18);
        commandGroup.add(ringSky, ringIndigo, ringEmerald);

        // 4. Infrastructure Cloud Nodes & Interconnect Edges + Traveling Pulses
        const nodeCount = isMobile ? 18 : 28;
        const nodePositions = [];
        const nodeColors = [];
        const palette = [new THREE.Color(0x38bdf8), new THREE.Color(0x818cf8), new THREE.Color(0x34d399)];

        for (let i = 0; i < nodeCount; i++) {
            const phi = Math.acos(1 - (2 * (i + 0.5)) / nodeCount);
            const theta = Math.PI * (1 + Math.sqrt(5)) * i;
            const radius = 2.6 + (i % 3) * 0.55;
            const x = radius * Math.sin(phi) * Math.cos(theta);
            const y = radius * Math.cos(phi) * 0.82;
            const z = radius * Math.sin(phi) * Math.sin(theta);

            nodePositions.push(new THREE.Vector3(x, y, z));
            const c = palette[i % palette.length];
            nodeColors.push(c.r, c.g, c.b);
        }

        const nodesGeo = new THREE.BufferGeometry().setFromPoints(nodePositions);
        nodesGeo.setAttribute('color', new THREE.Float32BufferAttribute(nodeColors, 3));
        const nodesMat = new THREE.PointsMaterial({
            size: isMobile ? 0.12 : 0.1,
            vertexColors: true,
            transparent: true,
            opacity: 0.9
        });
        const nodesPoints = new THREE.Points(nodesGeo, nodesMat);
        commandGroup.add(nodesPoints);

        // Connect adjacent nodes with faint security/network filaments
        const edgePairs = [];
        const edgeVerts = [];
        for (let i = 0; i < nodePositions.length; i++) {
            for (let j = i + 1; j < nodePositions.length; j++) {
                if (nodePositions[i].distanceTo(nodePositions[j]) < 2.65) {
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
        const edgesMat = new THREE.LineBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.14
        });
        const edgesMesh = new THREE.LineSegments(edgesGeo, edgesMat);
        commandGroup.add(edgesMesh);

        // Traveling Signal Pulses along Edges
        const pulseCount = Math.min(edgePairs.length, isMobile ? 10 : 18);
        const pulseMeta = Array.from({ length: pulseCount }, (_, idx) => ({
            edge: edgePairs[idx % Math.max(1, edgePairs.length)],
            progress: Math.random(),
            speed: 0.004 + Math.random() * 0.004
        }));

        const pulsePositions = new Float32Array(pulseCount * 3);
        const pulseGeo = new THREE.BufferGeometry();
        pulseGeo.setAttribute('position', new THREE.BufferAttribute(pulsePositions, 3));
        const pulseMat = new THREE.PointsMaterial({
            color: 0x34d399,
            size: 0.13,
            transparent: true,
            opacity: 0.95
        });
        const pulsePoints = new THREE.Points(pulseGeo, pulseMat);
        commandGroup.add(pulsePoints);

        // Cursor Parallax & Subtle Drag Offset
        let targetMouseX = 0;
        let targetMouseY = 0;
        let mouseX = 0;
        let mouseY = 0;
        const currentLookAt = new THREE.Vector3(0, 0, 0);

        window.addEventListener(
            'mousemove',
            (e) => {
                targetMouseX = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
                targetMouseY = (e.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
            },
            { passive: true }
        );

        window.addEventListener(
            'touchmove',
            (e) => {
                if (e.touches && e.touches[0]) {
                    targetMouseX = (e.touches[0].clientX / Math.max(1, window.innerWidth)) * 2 - 1;
                    targetMouseY = (e.touches[0].clientY / Math.max(1, window.innerHeight)) * 2 - 1;
                }
            },
            { passive: true }
        );

        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });

        let animId = null;

        function animate() {
            mouseX += (targetMouseX - mouseX) * 0.045;
            mouseY += (targetMouseY - mouseY) * 0.045;
            scrollVelocity *= 0.92;

            const camTarget = SECTION_CAMERA_STATES[activeSectionId] || SECTION_CAMERA_STATES.home;
            const desiredX = camTarget.x + mouseX * 0.95;
            const desiredY = camTarget.y - mouseY * 0.55;
            const desiredZ = camTarget.z + Math.max(-0.5, Math.min(0.5, scrollVelocity * 0.02));

            camera.position.x += (desiredX - camera.position.x) * 0.04;
            camera.position.y += (desiredY - camera.position.y) * 0.04;
            camera.position.z += (desiredZ - camera.position.z) * 0.04;

            currentLookAt.x += (camTarget.lookX - currentLookAt.x) * 0.04;
            currentLookAt.y += (camTarget.lookY - currentLookAt.y) * 0.04;
            currentLookAt.z += (camTarget.lookZ - currentLookAt.z) * 0.04;
            camera.lookAt(currentLookAt);

            if (!prefersReducedMotion) {
                commandGroup.rotation.y += 0.0014;
                globeMesh.rotation.x += 0.0005;
                ringSky.rotation.y += 0.0022;
                ringIndigo.rotation.y -= 0.0018;
                ringEmerald.rotation.y += 0.0015;

                // Update traveling light pulses along topology edges
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

            if (!prefersReducedMotion && !document.hidden) {
                animId = requestAnimationFrame(animate);
            }
        }

        if (prefersReducedMotion) {
            animate();
        } else {
            animId = requestAnimationFrame(animate);
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    if (animId) cancelAnimationFrame(animId);
                    animId = null;
                } else if (!animId) {
                    animId = requestAnimationFrame(animate);
                }
            });
        }
    }

    initThreeCommandCenter();

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
            if (lenis) lenis.stop();
        }

        function closeStudy() {
            modal.classList.remove('is-open');
            if (lenis) lenis.start();
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
            if (e.key === 'Escape' && modal.classList.contains('is-open')) {
                closeStudy();
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
       9. GSAP + SCROLLTRIGGER CHOREOGRAPHY & ANIMATED KPI COUNTERS
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
        window.gsap.fromTo(
            '.hero-reveal',
            { y: 26, opacity: 0, filter: 'blur(8px)' },
            {
                y: 0,
                opacity: 1,
                filter: 'blur(0px)',
                duration: 0.9,
                delay: 0.65,
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
       10. BACK TO TOP BUTTON
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
