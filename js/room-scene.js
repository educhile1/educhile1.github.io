/* =================================================================
   EDUARDO CAYÚN M. — 3D EXECUTIVE OFFICE ROOM (Three.js r149 UMD)
   Cozy isometric office diorama with clickable diamond hotspots:
   Monitor → Proyectos · Pegboard → Credenciales · Retrato → Perfil
   Teléfono → Contacto · Arcade → Edu Tetris · Parlante → Música IA
================================================================== */
(function () {
    'use strict';

    /* ---------------------------------------------------------
       CANVAS HELPERS
    --------------------------------------------------------- */
    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function seededRandom(seed) {
        let s = seed >>> 0;
        return function () {
            s = (s * 1664525 + 1013904223) >>> 0;
            return s / 4294967296;
        };
    }

    function init(options) {
        const THREE = window.THREE;
        const canvas = options && options.canvas;
        const markersContainer = options.markersContainer || null;
        const api = options.api;
        const reduced = !!options.reducedMotion;
        if (!THREE || !canvas || !api) return false;

        let renderer;
        try {
            renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
        } catch (err) {
            return false;
        }
        if (!renderer || !renderer.getContext()) return false;

        const isMobile = () => window.innerWidth < 768;
        const mobileAtStart = isMobile();

        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobileAtStart ? 1.5 : 2));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0x05060b, 1);
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.08;
        renderer.shadowMap.enabled = !mobileAtStart;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        const scene = new THREE.Scene();
        scene.fog = new THREE.Fog(0x05060b, 26, 48);

        const camera = new THREE.PerspectiveCamera(
            mobileAtStart ? 52 : 38,
            window.innerWidth / window.innerHeight,
            0.1,
            120
        );

        /* ---------------------------------------------------------
           TEXTURE FACTORY (redraws once web fonts are ready)
        --------------------------------------------------------- */
        const redrawQueue = [];
        function canvasTexture(w, h, draw, opts) {
            const c = document.createElement('canvas');
            c.width = w;
            c.height = h;
            const ctx = c.getContext('2d');
            const tex = new THREE.CanvasTexture(c);
            tex.encoding = THREE.sRGBEncoding;
            tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
            if (opts && opts.repeat) {
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(opts.repeat[0], opts.repeat[1]);
            }
            const redraw = () => {
                ctx.clearRect(0, 0, w, h);
                draw(ctx, w, h);
                tex.needsUpdate = true;
            };
            redraw();
            redrawQueue.push(redraw);
            tex.userData.redraw = redraw;
            return tex;
        }

        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => redrawQueue.forEach((fn) => fn()));
        }

        const glowCache = {};
        function radialGlowTexture(rgb) {
            const key = `r-${rgb}`;
            if (glowCache[key]) return glowCache[key];
            const c = document.createElement('canvas');
            c.width = 256;
            c.height = 256;
            const ctx = c.getContext('2d');
            const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
            g.addColorStop(0, `rgba(${rgb},1)`);
            g.addColorStop(0.35, `rgba(${rgb},0.45)`);
            g.addColorStop(1, `rgba(${rgb},0)`);
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, 256, 256);
            const tex = new THREE.CanvasTexture(c);
            glowCache[key] = tex;
            return tex;
        }

        function rectGlowTexture(rgb) {
            const key = `q-${rgb}`;
            if (glowCache[key]) return glowCache[key];
            const c = document.createElement('canvas');
            c.width = 256;
            c.height = 256;
            const ctx = c.getContext('2d');
            ctx.shadowColor = `rgba(${rgb},1)`;
            ctx.shadowBlur = 46;
            ctx.fillStyle = `rgba(${rgb},0.95)`;
            ctx.fillRect(52, 52, 152, 152);
            const tex = new THREE.CanvasTexture(c);
            glowCache[key] = tex;
            return tex;
        }

        function loadImage(src, onLoad) {
            const img = new Image();
            img.onload = () => onLoad(img);
            img.src = src;
            return img;
        }

        function drawCover(ctx, img, x, y, w, h) {
            const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
            const dw = img.naturalWidth * scale;
            const dh = img.naturalHeight * scale;
            ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) * 0.15, dw, dh);
        }

        /* ---------------------------------------------------------
           MATERIAL & MESH HELPERS
        --------------------------------------------------------- */
        const std = (color, rough = 0.7, metal = 0.05, extra = {}) =>
            new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: metal }, extra));
        const basic = (opts) => new THREE.MeshBasicMaterial(Object.assign({ toneMapped: false }, opts));

        const hitMeshes = [];
        function addMesh(geo, mat, pos, parent, opts = {}) {
            const m = new THREE.Mesh(geo, mat);
            m.position.set(pos[0], pos[1], pos[2]);
            if (opts.rot) m.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
            m.castShadow = opts.cast !== false;
            m.receiveShadow = opts.receive !== false;
            if (opts.station) {
                m.userData.stationId = opts.station;
                hitMeshes.push(m);
            }
            (parent || scene).add(m);
            return m;
        }

        function glowPlane(w, h, rgb, opacity, pos, rot, parent, rect) {
            const mat = new THREE.MeshBasicMaterial({
                map: rect ? rectGlowTexture(rgb) : radialGlowTexture(rgb),
                transparent: true,
                opacity,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
                toneMapped: false
            });
            const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
            m.position.set(pos[0], pos[1], pos[2]);
            if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
            m.renderOrder = 2;
            (parent || scene).add(m);
            return m;
        }

        /* ---------------------------------------------------------
           ROOM SHELL: FLOOR, WALLS, RUG
           Room spans x[-6,6], z[-5,5], height 5
        --------------------------------------------------------- */
        const floorTex = canvasTexture(
            512,
            512,
            (ctx) => {
                const rand = seededRandom(7);
                const shades = ['#2a2520', '#2f2924', '#26221e', '#332c26', '#2c2622'];
                const pw = 128;
                const ph = 32;
                for (let row = 0; row < 16; row++) {
                    const offset = row % 2 === 0 ? 0 : pw / 2;
                    for (let col = -1; col < 5; col++) {
                        const x = col * pw + offset;
                        const y = row * ph;
                        ctx.fillStyle = shades[Math.floor(rand() * shades.length)];
                        ctx.fillRect(x, y, pw, ph);
                        ctx.strokeStyle = '#17130f';
                        ctx.lineWidth = 2;
                        ctx.strokeRect(x + 1, y + 1, pw - 2, ph - 2);
                        ctx.fillStyle = 'rgba(255,255,255,0.025)';
                        ctx.fillRect(x + 4, y + 4, pw - 8, 3);
                    }
                }
            },
            { repeat: [5, 4.2] }
        );
        floorTex.center.set(0.5, 0.5);
        floorTex.rotation = Math.PI / 4;

        addMesh(new THREE.BoxGeometry(12.3, 0.3, 10.3), std(0xffffff, 0.62, 0.05, { map: floorTex }), [0.15, -0.15, 0.15], scene, {
            cast: false
        });

        function wallTexture(rx, ry) {
            return canvasTexture(
                256,
                256,
                (ctx, w, h) => {
                    const g = ctx.createLinearGradient(0, 0, 0, h);
                    g.addColorStop(0, '#1f2128');
                    g.addColorStop(1, '#1a1c22');
                    ctx.fillStyle = g;
                    ctx.fillRect(0, 0, w, h);
                    ctx.strokeStyle = '#0f1014';
                    ctx.lineWidth = 6;
                    ctx.strokeRect(0, 0, w, h);
                    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(6, 6, w - 12, h - 12);
                },
                { repeat: [rx, ry] }
            );
        }

        const wallMatBack = std(0xffffff, 0.92, 0.02, { map: wallTexture(7, 3) });
        const wallMatLeft = std(0xffffff, 0.92, 0.02, { map: wallTexture(6, 3) });
        addMesh(new THREE.BoxGeometry(12.6, 5.2, 0.3), wallMatBack, [0.0, 2.45, -5.15], scene, { cast: false });
        addMesh(new THREE.BoxGeometry(0.3, 5.2, 10.3), wallMatLeft, [-6.15, 2.45, 0.15], scene, { cast: false });

        // Baseboards
        const baseMat = std(0x121318, 0.6, 0.2);
        addMesh(new THREE.BoxGeometry(12, 0.16, 0.06), baseMat, [0, 0.08, -4.98], scene, { cast: false });
        addMesh(new THREE.BoxGeometry(0.06, 0.16, 10), baseMat, [-5.98, 0.08, 0], scene, { cast: false });

        // Rug
        const rugTex = canvasTexture(512, 400, (ctx, w, h) => {
            ctx.fillStyle = '#3a3c43';
            ctx.fillRect(0, 0, w, h);
            const rand = seededRandom(19);
            for (let i = 0; i < 2600; i++) {
                ctx.fillStyle = `rgba(255,255,255,${rand() * 0.035})`;
                ctx.fillRect(rand() * w, rand() * h, 2, 2);
            }
            ctx.strokeStyle = '#565962';
            ctx.lineWidth = 10;
            ctx.strokeRect(26, 26, w - 52, h - 52);
            ctx.strokeStyle = '#2c2e34';
            ctx.lineWidth = 4;
            ctx.strokeRect(48, 48, w - 96, h - 96);
        });
        addMesh(new THREE.PlaneGeometry(6.6, 5.2), std(0xffffff, 1, 0, { map: rugTex }), [0.3, 0.006, 0.6], scene, {
            rot: [-Math.PI / 2, 0, 0],
            cast: false
        });

        /* ---------------------------------------------------------
           WINDOW WITH SANTIAGO SUNSET SKYLINE & ANDES
        --------------------------------------------------------- */
        const cityTex = canvasTexture(1024, 640, (ctx, w, h) => {
            const sky = ctx.createLinearGradient(0, 0, 0, h);
            sky.addColorStop(0, '#1e1b4b');
            sky.addColorStop(0.3, '#5b21b6');
            sky.addColorStop(0.55, '#e8590c');
            sky.addColorStop(0.75, '#fdba74');
            sky.addColorStop(1, '#fde68a');
            ctx.fillStyle = sky;
            ctx.fillRect(0, 0, w, h);

            const sun = ctx.createRadialGradient(w * 0.64, h * 0.6, 8, w * 0.64, h * 0.6, 300);
            sun.addColorStop(0, 'rgba(255,240,190,1)');
            sun.addColorStop(0.15, 'rgba(255,210,140,0.8)');
            sun.addColorStop(1, 'rgba(255,170,90,0)');
            ctx.fillStyle = sun;
            ctx.fillRect(0, 0, w, h);

            // Andes ranges
            const rand = seededRandom(42);
            function range(baseY, amp, colTop, colBottom, peaks) {
                const g = ctx.createLinearGradient(0, baseY - amp, 0, baseY + 40);
                g.addColorStop(0, colTop);
                g.addColorStop(0.35, colBottom);
                g.addColorStop(1, colBottom);
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.moveTo(0, h);
                ctx.lineTo(0, baseY);
                for (let i = 0; i <= peaks; i++) {
                    const x = (i / peaks) * w;
                    const y = baseY - amp * (0.35 + rand() * 0.65);
                    ctx.lineTo(x - w / peaks / 2, baseY - amp * 0.2 * rand());
                    ctx.lineTo(x, y);
                }
                ctx.lineTo(w, h);
                ctx.closePath();
                ctx.fill();
            }
            range(h * 0.6, 170, '#efe3ff', '#6b4f8f', 9);
            range(h * 0.66, 110, '#a58bc7', '#3b2d58', 12);

            // Skyline
            function skyline(minH, maxH, color, windowAlpha, seed) {
                const r = seededRandom(seed);
                let x = -20;
                while (x < w) {
                    const bw = 46 + r() * 90;
                    const bh = minH + r() * (maxH - minH);
                    ctx.fillStyle = color;
                    ctx.fillRect(x, h - bh, bw, bh);
                    for (let wy = h - bh + 14; wy < h - 10; wy += 18) {
                        for (let wx = x + 8; wx < x + bw - 10; wx += 14) {
                            if (r() > 0.52) {
                                ctx.fillStyle = `rgba(255,${190 + Math.floor(r() * 50)},120,${windowAlpha})`;
                                ctx.fillRect(wx, wy, 6, 9);
                            }
                        }
                    }
                    x += bw + 3 + r() * 6;
                }
            }
            skyline(90, 260, '#1b1630', 0.55, 3);
            skyline(150, 420, '#0d0b18', 0.85, 11);

            // Costanera-like tower silhouette
            ctx.fillStyle = '#0a0913';
            ctx.beginPath();
            ctx.moveTo(w * 0.28, h);
            ctx.lineTo(w * 0.29, h * 0.12);
            ctx.lineTo(w * 0.305, h * 0.08);
            ctx.lineTo(w * 0.32, h * 0.12);
            ctx.lineTo(w * 0.33, h);
            ctx.closePath();
            ctx.fill();
        });

        const winCenter = [0.6, 2.9, -4.99];
        const winW = 4.4;
        const winH = 2.6;
        const cityMesh = addMesh(new THREE.PlaneGeometry(winW, winH), basic({ map: cityTex }), [winCenter[0], winCenter[1], -4.985], scene, {
            cast: false,
            receive: false
        });
        cityMesh.renderOrder = 1;
        const glass = new THREE.Mesh(
            new THREE.PlaneGeometry(winW, winH),
            new THREE.MeshStandardMaterial({ color: 0x9fb4ff, transparent: true, opacity: 0.07, roughness: 0.05, metalness: 0.9 })
        );
        glass.position.set(winCenter[0], winCenter[1], -4.96);
        scene.add(glass);

        const frameMat = std(0x101116, 0.4, 0.5);
        const ft = 0.1;
        addMesh(new THREE.BoxGeometry(winW + ft * 2, ft, 0.14), frameMat, [winCenter[0], winCenter[1] + winH / 2, -4.95]);
        addMesh(new THREE.BoxGeometry(winW + ft * 2, ft, 0.14), frameMat, [winCenter[0], winCenter[1] - winH / 2, -4.95]);
        addMesh(new THREE.BoxGeometry(ft, winH, 0.14), frameMat, [winCenter[0] - winW / 2, winCenter[1], -4.95]);
        addMesh(new THREE.BoxGeometry(ft, winH, 0.14), frameMat, [winCenter[0] + winW / 2, winCenter[1], -4.95]);
        addMesh(new THREE.BoxGeometry(0.07, winH, 0.12), frameMat, [winCenter[0], winCenter[1], -4.95]);
        addMesh(new THREE.BoxGeometry(winW + 0.5, 0.08, 0.4), std(0x1b1c22, 0.5, 0.2), [winCenter[0], winCenter[1] - winH / 2 - 0.06, -4.82]);

        // Warm sunset light spill on floor
        glowPlane(5.6, 4.2, '255,150,70', 0.32, [1.2, 0.014, -2.6], [-Math.PI / 2, 0, 0.25]);
        glowPlane(6.2, 3.6, '255,140,70', 0.18, [winCenter[0], winCenter[1], -4.97], [0, 0, 0], null, true);

        /* ---------------------------------------------------------
           LIGHTING
        --------------------------------------------------------- */
        scene.add(new THREE.HemisphereLight(0x8fa3ff, 0x221a14, 0.55));
        scene.add(new THREE.AmbientLight(0xffffff, 0.12));

        const sunLight = new THREE.DirectionalLight(0xffb27a, 1.15);
        sunLight.position.set(1.8, 5.2, -4.4);
        sunLight.target.position.set(-0.6, 0, 2.2);
        sunLight.castShadow = true;
        sunLight.shadow.mapSize.set(1024, 1024);
        sunLight.shadow.camera.left = -8;
        sunLight.shadow.camera.right = 8;
        sunLight.shadow.camera.top = 8;
        sunLight.shadow.camera.bottom = -8;
        sunLight.shadow.camera.near = 0.5;
        sunLight.shadow.camera.far = 20;
        sunLight.shadow.bias = -0.0008;
        sunLight.shadow.radius = 4;
        scene.add(sunLight);
        scene.add(sunLight.target);

        const fillLight = new THREE.DirectionalLight(0x9db4ff, 0.35);
        fillLight.position.set(8, 9, 8);
        scene.add(fillLight);

        /* ---------------------------------------------------------
           EXECUTIVE DESK WITH LED STRIP
        --------------------------------------------------------- */
        const desk = new THREE.Group();
        desk.position.set(0.2, 0, 0.25);
        scene.add(desk);

        addMesh(new THREE.BoxGeometry(3.3, 0.94, 1.3), std(0x2b2d34, 0.55, 0.15), [0, 0.47, 0], desk);
        addMesh(new THREE.BoxGeometry(3.7, 0.1, 1.72), std(0x111215, 0.3, 0.35), [0, 1.0, 0], desk);
        const ledMat = basic({ color: 0xffb066 });
        addMesh(new THREE.BoxGeometry(3.74, 0.025, 1.76), ledMat, [0, 0.945, 0], desk, { cast: false, receive: false });
        glowPlane(6.4, 4.6, '255,160,80', 0.55, [0, 0.012, 0.05], [-Math.PI / 2, 0, 0], desk);
        const deskLight = new THREE.PointLight(0xffa24d, 1.25, 5.5, 2);
        deskLight.position.set(0, 0.55, 1.3);
        desk.add(deskLight);

        // Monitor → PROYECTOS
        const monitorTex = canvasTexture(1024, 600, (ctx, w, h) => {
            const g = ctx.createLinearGradient(0, 0, w, h);
            g.addColorStop(0, '#0a1024');
            g.addColorStop(1, '#161d3d');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = 'rgba(255,255,255,0.025)';
            for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);

            ctx.font = '600 26px "JetBrains Mono", monospace';
            ctx.fillStyle = '#7dd3fc';
            ctx.fillText('~/eduardo-cayun/proyectos-criticos', 70, 84);

            ctx.font = '700 118px "JetBrains Mono", monospace';
            ctx.fillStyle = '#f9a8d4';
            ctx.shadowColor = 'rgba(249,168,212,0.6)';
            ctx.shadowBlur = 24;
            const word = 'PROYECTOS';
            for (let i = 0; i < word.length; i++) ctx.fillText(word[i], 70 + i * 100, 228);
            ctx.shadowBlur = 0;

            const items = [
                ['Sentra · Banca & Ciberseguridad', '#38bdf8'],
                ['SICA · Contraloría CL · PY · UY', '#818cf8'],
                ['SIGFE 2 · Min. Hacienda (DIPRES)', '#34d399'],
                ['UNIS GIS · Tierra-Ayni', '#fbbf24'],
                ['ANDE Paraguay · AWS & GIS', '#f472b6']
            ];
            items.forEach(([label, col], i) => {
                const y = 318 + i * 52;
                ctx.fillStyle = col;
                ctx.fillRect(74, y - 20, 18, 18);
                ctx.font = '500 32px "Inter", sans-serif';
                ctx.fillStyle = '#e2e8f0';
                ctx.fillText(label, 112, y);
            });
        });

        const monitor = new THREE.Group();
        monitor.position.set(-0.65, 1.05, -0.05);
        monitor.rotation.y = 0.42;
        desk.add(monitor);
        const monitorDark = std(0x0d0e12, 0.35, 0.5);
        addMesh(new THREE.BoxGeometry(0.55, 0.03, 0.32), monitorDark, [0, 0.015, 0], monitor);
        addMesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), monitorDark, [0, 0.27, -0.04], monitor);
        addMesh(new THREE.BoxGeometry(1.66, 0.98, 0.07), monitorDark, [0, 0.8, 0], monitor, { station: 'projects' });
        addMesh(new THREE.PlaneGeometry(1.56, 0.9), basic({ map: monitorTex }), [0, 0.8, 0.037], monitor, {
            station: 'projects',
            cast: false
        });
        glowPlane(2.4, 1.6, '249,168,212', 0.12, [0, 0.8, 0.045], null, monitor, true);

        // Keyboard, mouse, notebook
        addMesh(new THREE.BoxGeometry(0.9, 0.035, 0.3), std(0xd9dbe1, 0.5, 0.05), [0.45, 1.068, 0.3], desk);
        for (let r = 0; r < 4; r++) {
            addMesh(new THREE.BoxGeometry(0.82, 0.012, 0.045), std(0xf4f4f5, 0.6), [0.45, 1.09, 0.2 + r * 0.065], desk, { cast: false });
        }
        addMesh(new THREE.BoxGeometry(0.11, 0.035, 0.17), std(0xd9dbe1, 0.45), [1.05, 1.068, 0.32], desk);
        addMesh(new THREE.BoxGeometry(0.4, 0.02, 0.28), std(0x1e1f26, 0.8), [-1.3, 1.06, 0.45], desk, { rot: [0, 0.2, 0] });

        // Phone → CONTACTO (Nothing-OS Dark Flagship Edition)
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

        const phoneTex = canvasTexture(512, 1024, (ctx, w, h) => {
            // Dark obsidian screen background
            ctx.fillStyle = '#080a12';
            ctx.fillRect(0, 0, w, h);

            // Subtle dot-matrix pattern
            ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
            for (let x = 16; x < w; x += 22) {
                for (let y = 16; y < h; y += 22) {
                    ctx.fillRect(x, y, 2, 2);
                }
            }

            // Top Status Bar
            ctx.font = '600 22px "JetBrains Mono", monospace';
            ctx.fillStyle = '#cbd5e1';
            let timeStr = '18:00';
            try {
                timeStr = new Intl.DateTimeFormat('es-CL', {
                    timeZone: 'America/Santiago',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                }).format(new Date());
            } catch {
                timeStr = '18:00';
            }
            ctx.fillText(timeStr, 34, 46);

            // Hole-punch front camera
            ctx.fillStyle = '#030408';
            ctx.beginPath();
            ctx.arc(w / 2, 40, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Status bar icons (cellular, wifi, battery)
            ctx.fillStyle = '#cbd5e1';
            for (let b = 0; b < 4; b++) {
                ctx.fillRect(390 + b * 6, 44 - (b + 1) * 4, 4, (b + 1) * 4);
            }
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(436, 31, 32, 16);
            ctx.fillRect(440, 35, 22, 8);
            ctx.fillRect(468, 35, 3, 8);

            // Pixel Dot-Matrix Clock
            const digits = [
                timeStr.charAt(0) || '0',
                timeStr.charAt(1) || '0',
                timeStr.charAt(3) || '0',
                timeStr.charAt(4) || '0'
            ];

            const dotSize = 7.5;
            const dotGap = 3.5;
            const digitW = 5 * (dotSize + dotGap) - dotGap;
            const colonW = 16;
            const digitSpacing = 16;
            const totalClockW = digitW * 4 + colonW + digitSpacing * 2;
            const startClockX = (w - totalClockW) / 2;
            const clockY = 88;

            function drawPixelDigit(char, px, py) {
                const pat = BITMAPS_5X7[char] || BITMAPS_5X7['0'];
                for (let r = 0; r < 7; r++) {
                    for (let c = 0; c < 5; c++) {
                        const isLit = pat[r * 5 + c] === 1;
                        ctx.fillStyle = isLit ? '#ffffff' : 'rgba(255, 255, 255, 0.05)';
                        ctx.fillRect(px + c * (dotSize + dotGap), py + r * (dotSize + dotGap), dotSize, dotSize);
                    }
                }
            }

            drawPixelDigit(digits[0], startClockX, clockY);
            drawPixelDigit(digits[1], startClockX + digitW + digitSpacing, clockY);

            // Colon
            const colonX = startClockX + (digitW + digitSpacing) * 2;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(colonX + 4, clockY + 18, dotSize, dotSize);
            ctx.fillRect(colonX + 4, clockY + 44, dotSize, dotSize);

            drawPixelDigit(digits[2], colonX + colonW, clockY);
            drawPixelDigit(digits[3], colonX + colonW + digitW + digitSpacing, clockY);

            // Subtitle: ● CLT · SANTIAGO
            ctx.fillStyle = '#f472b6';
            ctx.beginPath();
            ctx.arc(w / 2 - 80, 196, 4.5, 0, Math.PI * 2);
            ctx.fill();

            ctx.font = '600 18px "JetBrains Mono", monospace';
            ctx.fillStyle = '#94a3b8';
            ctx.textAlign = 'center';
            ctx.fillText('CLT · SANTIAGO', w / 2 + 10, 202);
            ctx.textAlign = 'left';

            // Identity Header (Nothing OS Tech Style)
            ctx.font = '700 28px "JetBrains Mono", monospace';
            ctx.fillStyle = '#ffffff';
            ctx.fillText('Eduardo Cayún M.', 36, 260);

            ctx.font = '500 17px "Inter", sans-serif';
            ctx.fillStyle = '#94a3b8';
            ctx.fillText('MBA & Líder TI · Consultoría B2B', 36, 288);

            // Widget 1: Direct Email / Contact Card
            ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
            ctx.lineWidth = 1;
            roundRect(ctx, 32, 318, w - 64, 88, 20);
            ctx.fill();
            ctx.stroke();

            ctx.font = '600 14px "JetBrains Mono", monospace';
            ctx.fillStyle = '#64748b';
            ctx.fillText('✉  contacto directo', 52, 348);

            ctx.font = '700 20px "JetBrains Mono", monospace';
            ctx.fillStyle = '#f1f5f9';
            ctx.fillText('contacto@eduardocayun.com', 52, 382);

            ctx.fillStyle = '#34d399';
            ctx.beginPath();
            ctx.arc(w - 56, 344, 4.5, 0, Math.PI * 2);
            ctx.fill();

            // Split Row: GitHub & LinkedIn Widgets
            const colW = (w - 64 - 16) / 2;

            // GitHub Card
            ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
            roundRect(ctx, 32, 422, colW, 98, 18);
            ctx.fill();
            ctx.stroke();

            ctx.font = '600 14px "JetBrains Mono", monospace';
            ctx.fillStyle = '#64748b';
            ctx.fillText('</> github', 50, 452);

            ctx.font = '700 20px "JetBrains Mono", monospace';
            ctx.fillStyle = '#ffffff';
            ctx.fillText('@educhile1', 50, 492);

            // LinkedIn Card
            ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
            roundRect(ctx, 32 + colW + 16, 422, colW, 98, 18);
            ctx.fill();
            ctx.stroke();

            ctx.font = '700 15px "Plus Jakarta Sans", sans-serif';
            ctx.fillStyle = '#38bdf8';
            ctx.fillText('in  linkedin', 32 + colW + 36, 452);

            ctx.font = '700 18px "JetBrains Mono", monospace';
            ctx.fillStyle = '#ffffff';
            ctx.fillText('/eduardocayun', 32 + colW + 36, 492);

            // Widget 3: Trajectory & Credentials Badge
            ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)';
            roundRect(ctx, 32, 536, w - 64, 88, 18);
            ctx.fill();
            ctx.stroke();

            // White MBA badge
            ctx.fillStyle = '#ffffff';
            roundRect(ctx, 48, 554, 46, 50, 10);
            ctx.fill();
            ctx.font = '900 15px "Plus Jakarta Sans", sans-serif';
            ctx.fillStyle = '#0b0f19';
            ctx.fillText('MBA', 55, 584);

            ctx.font = '700 18px "Plus Jakarta Sans", sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.fillText('Trayectoria TI & Gobierno', 108, 568);

            ctx.font = '500 14px "JetBrains Mono", monospace';
            ctx.fillStyle = '#94a3b8';
            ctx.fillText('DIPRES · Contraloría · BCI · Falabella', 108, 594);

            // Widget 4: THE SIGNATURE PINK CARD (Awwwards Nothing-OS Highlight)
            ctx.fillStyle = '#f9a8d4';
            roundRect(ctx, 32, 642, w - 64, 118, 22);
            ctx.fill();

            ctx.font = '800 24px "JetBrains Mono", monospace';
            ctx.fillStyle = '#0f172a';
            ctx.fillText('agendar_meet.cal', 52, 686);

            ctx.font = '600 16px "Inter", sans-serif';
            ctx.fillStyle = '#334155';
            ctx.fillText('Reservar videollamada directa (30 min)', 52, 722);

            // Dark circular button with arrow inside pink card
            const circleBtnX = w - 82;
            const circleBtnY = 701;
            ctx.fillStyle = '#0f172a';
            ctx.beginPath();
            ctx.arc(circleBtnX, circleBtnY, 26, 0, Math.PI * 2);
            ctx.fill();

            ctx.font = '800 22px "Inter", sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText('↗', circleBtnX, circleBtnY + 8);
            ctx.textAlign = 'left';

            // Bottom App Dock (4 circular buttons)
            const dockIcons = ['📞', '💬', '🌐', '🎮'];
            const dockStep = (w - 64) / 4;
            dockIcons.forEach((icon, i) => {
                const cx = 32 + dockStep * i + dockStep / 2;
                const cy = 824;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
                ctx.beginPath();
                ctx.arc(cx, cy, 26, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                ctx.font = '20px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(icon, cx, cy + 7);
            });
            ctx.textAlign = 'left';

            // Home Indicator Bar
            ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
            roundRect(ctx, (w - 140) / 2, 882, 140, 5, 3);
            ctx.fill();
        });

        const phone = new THREE.Group();
        phone.position.set(1.35, 1.05, 0.6);
        phone.rotation.y = -0.32;
        desk.add(phone);

        // Dark matte obsidian phone chassis
        addMesh(new THREE.BoxGeometry(0.28, 0.022, 0.54), std(0x0e101a, 0.4, 0.5), [0, 0.011, 0], phone, { station: 'contact' });
        // Metallic edge border
        addMesh(new THREE.BoxGeometry(0.284, 0.02, 0.544), std(0x282c3c, 0.35, 0.8), [0, 0.01, 0], phone, { cast: false });
        // Phone screen plane with Nothing-OS dark UI
        addMesh(new THREE.PlaneGeometry(0.264, 0.524), basic({ map: phoneTex }), [0, 0.023, 0], phone, {
            rot: [-Math.PI / 2, 0, 0],
            station: 'contact',
            cast: false
        });
        // Side buttons (Power and Volume)
        addMesh(new THREE.BoxGeometry(0.006, 0.012, 0.07), std(0x33384c, 0.3, 0.8), [0.144, 0.011, -0.05], phone, { cast: false });
        addMesh(new THREE.BoxGeometry(0.006, 0.012, 0.045), std(0x33384c, 0.3, 0.8), [0.144, 0.011, 0.05], phone, { cast: false });
        // Soft under-phone pink ambient glow
        glowPlane(0.72, 1.0, '249,168,212', 0.26, [0, 0.025, 0], [-Math.PI / 2, 0, 0], phone);

        // Pink desk lamp
        const lamp = new THREE.Group();
        lamp.position.set(-1.5, 1.05, -0.45);
        desk.add(lamp);
        const pinkMat = std(0xf472b6, 0.45, 0.2);
        addMesh(new THREE.CylinderGeometry(0.16, 0.18, 0.05, 24), pinkMat, [0, 0.025, 0], lamp);
        const arm1 = addMesh(new THREE.CylinderGeometry(0.022, 0.022, 0.75, 8), std(0x1f2937, 0.4, 0.6), [0.08, 0.38, 0], lamp, { rot: [0, 0, -0.25] });
        arm1.castShadow = true;
        addMesh(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 8), std(0x1f2937, 0.4, 0.6), [0.38, 0.86, 0], lamp, { rot: [0, 0, -1.1] });
        addMesh(new THREE.ConeGeometry(0.22, 0.3, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.45, side: THREE.DoubleSide }), [0.66, 0.92, 0], lamp, {
            rot: [0, 0, -0.6]
        });
        addMesh(new THREE.SphereGeometry(0.07, 16, 16), basic({ color: 0xffe4f1 }), [0.7, 0.86, 0], lamp, { cast: false, receive: false });
        const lampLight = new THREE.PointLight(0xff8fc8, 1.1, 4.5, 2);
        lampLight.position.set(0.72, 0.8, 0);
        lamp.add(lampLight);
        glowPlane(1.6, 1.6, '255,150,200', 0.35, [0.85, 0.008, 0.05], [-Math.PI / 2, 0, 0], lamp);

        /* ---------------------------------------------------------
           AVATAR ROBOT AT DESK (clickable → Perfil)
        --------------------------------------------------------- */
        const chair = new THREE.Group();
        chair.position.set(0.85, 0, -1.25);
        scene.add(chair);
        const chairMat = std(0x18191f, 0.6, 0.2);
        addMesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 20), std(0x0f1014, 0.5, 0.5), [0, 0.06, 0], chair);
        addMesh(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 10), std(0x2a2b31, 0.4, 0.6), [0, 0.35, 0], chair);
        addMesh(new THREE.BoxGeometry(0.85, 0.12, 0.8), chairMat, [0, 0.68, 0], chair);
        addMesh(new THREE.BoxGeometry(0.85, 1.0, 0.12), chairMat, [0, 1.2, -0.42], chair);

        const robot = new THREE.Group();
        robot.position.set(0.85, 0, -1.15);
        scene.add(robot);
        const robotWhite = std(0xe8eaef, 0.45, 0.1);
        const robotGray = std(0x52525b, 0.5, 0.4);
        addMesh(new THREE.BoxGeometry(0.64, 0.62, 0.42), robotWhite, [0, 1.06, 0], robot, { station: 'home' });
        addMesh(new THREE.BoxGeometry(0.4, 0.3, 0.02), std(0x111827, 0.4, 0.4), [0, 1.1, 0.215], robot, { cast: false });
        const chestLed = addMesh(new THREE.BoxGeometry(0.08, 0.04, 0.02), basic({ color: 0xf472b6 }), [0.1, 1.18, 0.23], robot, { cast: false });
        addMesh(new THREE.BoxGeometry(0.08, 0.04, 0.02), basic({ color: 0x38bdf8 }), [-0.05, 1.18, 0.23], robot, { cast: false });

        const head = new THREE.Group();
        head.position.set(0, 1.62, 0);
        robot.add(head);
        addMesh(new THREE.BoxGeometry(0.64, 0.54, 0.54), robotWhite, [0, 0, 0], head, { station: 'home' });
        addMesh(new THREE.PlaneGeometry(0.52, 0.38), basic({ color: 0x0f172a }), [0, -0.01, 0.272], head, { cast: false, station: 'home' });
        const eyeMat = basic({ color: 0xf9a8d4 });
        const eyeL = addMesh(new THREE.PlaneGeometry(0.08, 0.12), eyeMat, [-0.12, 0.03, 0.274], head, { cast: false });
        const eyeR = addMesh(new THREE.PlaneGeometry(0.08, 0.12), eyeMat, [0.12, 0.03, 0.274], head, { cast: false });
        addMesh(new THREE.PlaneGeometry(0.1, 0.02), eyeMat, [0, -0.11, 0.274], head, { cast: false });
        addMesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 16), robotGray, [-0.36, 0, 0], head, { rot: [0, 0, Math.PI / 2] });
        addMesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 16), robotGray, [0.36, 0, 0], head, { rot: [0, 0, Math.PI / 2] });
        addMesh(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 8), robotGray, [-0.14, 0.38, 0], head);
        addMesh(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 8), robotGray, [0.14, 0.38, 0], head);
        const antennaTipL = addMesh(new THREE.SphereGeometry(0.035, 12, 12), basic({ color: 0xf472b6 }), [-0.14, 0.5, 0], head, { cast: false });
        const antennaTipR = addMesh(new THREE.SphereGeometry(0.035, 12, 12), basic({ color: 0x38bdf8 }), [0.14, 0.5, 0], head, { cast: false });

        function makeArm(side) {
            const pivot = new THREE.Group();
            pivot.position.set(side * 0.4, 1.28, 0);
            robot.add(pivot);
            addMesh(new THREE.BoxGeometry(0.14, 0.5, 0.14), robotWhite, [0, -0.25, 0], pivot);
            addMesh(new THREE.SphereGeometry(0.085, 14, 14), robotGray, [0, -0.52, 0], pivot);
            pivot.rotation.x = -1.2;
            pivot.rotation.z = side * -0.12;
            return pivot;
        }
        const armL = makeArm(-1);
        const armR = makeArm(1);

        /* ---------------------------------------------------------
           LEFT WALL: PORTRAIT (→ Perfil), ART, BOOKSHELF WITH LED
        --------------------------------------------------------- */
        let portraitImg = null;
        const portraitTex = canvasTexture(400, 500, (ctx, w, h) => {
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(0, 0, w, h);
            if (portraitImg) {
                drawCover(ctx, portraitImg, 0, 0, w, h);
            } else {
                ctx.font = '800 120px "Plus Jakarta Sans", sans-serif';
                ctx.fillStyle = '#38bdf8';
                ctx.fillText('EC', 110, 290);
            }
            const g = ctx.createLinearGradient(0, h * 0.65, 0, h);
            g.addColorStop(0, 'rgba(4,6,12,0)');
            g.addColorStop(1, 'rgba(4,6,12,0.85)');
            ctx.fillStyle = g;
            ctx.fillRect(0, h * 0.65, w, h * 0.35);
            ctx.font = '700 26px "Plus Jakarta Sans", sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.fillText('EDUARDO CAYÚN M.', 24, h - 50);
            ctx.font = '600 16px "JetBrains Mono", monospace';
            ctx.fillStyle = '#f9a8d4';
            ctx.fillText('MBA · ING. INFORMÁTICA', 24, h - 22);
        });
        loadImage('images/perfil_pro_eduf.jpg', (img) => {
            portraitImg = img;
            portraitTex.userData.redraw();
        });

        const portrait = new THREE.Group();
        portrait.position.set(-5.97, 3.45, -3.25);
        portrait.rotation.y = Math.PI / 2;
        scene.add(portrait);
        addMesh(new THREE.BoxGeometry(1.12, 1.38, 0.06), std(0x0c0d10, 0.4, 0.4), [0, 0, 0], portrait, { station: 'home' });
        addMesh(new THREE.PlaneGeometry(1.0, 1.25), std(0xffffff, 0.5, 0, { map: portraitTex, emissive: 0xffffff, emissiveMap: portraitTex, emissiveIntensity: 0.35 }), [0, 0, 0.032], portrait, {
            station: 'home',
            cast: false
        });

        const artTex = canvasTexture(256, 320, (ctx, w, h) => {
            const g = ctx.createLinearGradient(0, 0, 0, h);
            g.addColorStop(0, '#312e81');
            g.addColorStop(0.6, '#db2777');
            g.addColorStop(1, '#f59e0b');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = 'rgba(255,230,180,0.9)';
            ctx.beginPath();
            ctx.arc(w * 0.5, h * 0.55, 46, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#1e1b4b';
            ctx.beginPath();
            ctx.moveTo(0, h);
            ctx.lineTo(0, h * 0.72);
            ctx.lineTo(w * 0.3, h * 0.6);
            ctx.lineTo(w * 0.55, h * 0.74);
            ctx.lineTo(w * 0.8, h * 0.58);
            ctx.lineTo(w, h * 0.7);
            ctx.lineTo(w, h);
            ctx.fill();
        });
        const art = new THREE.Group();
        art.position.set(-5.97, 3.6, -1.7);
        art.rotation.y = Math.PI / 2;
        scene.add(art);
        addMesh(new THREE.BoxGeometry(0.82, 1.0, 0.05), std(0xe5e7eb, 0.5), [0, 0, 0], art);
        addMesh(new THREE.PlaneGeometry(0.7, 0.88), std(0xffffff, 0.6, 0, { map: artTex }), [0, 0, 0.027], art, { cast: false });

        // Floating bookshelf
        const shelf = new THREE.Group();
        shelf.position.set(-5.78, 2.3, -2.5);
        scene.add(shelf);
        addMesh(new THREE.BoxGeometry(0.42, 0.06, 2.9), std(0x15161b, 0.5, 0.3), [0, 0, 0], shelf);
        addMesh(new THREE.BoxGeometry(0.03, 0.02, 2.8), basic({ color: 0xffb066 }), [0.18, -0.04, 0], shelf, { cast: false, receive: false });
        glowPlane(3.6, 1.6, '255,170,90', 0.4, [-0.2, -0.55, 0], [0, Math.PI / 2, 0], shelf);
        const shelfLight = new THREE.PointLight(0xffb066, 0.6, 3.2, 2);
        shelfLight.position.set(0.1, -0.3, 0);
        shelf.add(shelfLight);

        const bookColors = [0xfbbf24, 0x38bdf8, 0x1d4ed8, 0xf472b6, 0x10b981, 0xe5e7eb, 0x6366f1, 0xef4444, 0x0ea5e9, 0x1e293b, 0xa78bfa, 0xf59e0b, 0x334155];
        let bz = -1.32;
        const bookRand = seededRandom(5);
        bookColors.forEach((col, i) => {
            const bh = 0.3 + bookRand() * 0.2;
            const bw = 0.06 + bookRand() * 0.05;
            const tilt = i === bookColors.length - 1 ? 0.35 : 0;
            addMesh(new THREE.BoxGeometry(0.3, bh, bw), std(col, 0.7), [0, 0.03 + bh / 2, bz + bw / 2], shelf, { rot: [tilt, 0, 0] });
            bz += bw + 0.012;
        });
        // Small plant on shelf
        addMesh(new THREE.CylinderGeometry(0.08, 0.06, 0.12, 12), std(0xe5e7eb, 0.6), [0, 0.09, 1.05], shelf);
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            addMesh(new THREE.SphereGeometry(0.06, 8, 8), std(0x4ade80, 0.7), [Math.cos(a) * 0.05, 0.2, 1.05 + Math.sin(a) * 0.05], shelf);
        }
        // Stack of books lying flat
        addMesh(new THREE.BoxGeometry(0.32, 0.05, 0.4), std(0x1f2937, 0.7), [0, 0.055, 0.6], shelf);
        addMesh(new THREE.BoxGeometry(0.3, 0.05, 0.38), std(0x64748b, 0.7), [0, 0.105, 0.6], shelf);

        /* ---------------------------------------------------------
           BACK WALL: BACKLIT PEGBOARD WITH CREDENTIAL BADGES
        --------------------------------------------------------- */
        const pegTex = canvasTexture(512, 290, (ctx, w, h) => {
            ctx.fillStyle = '#121a2e';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#070b16';
            for (let y = 14; y < h; y += 22) {
                for (let x = 14; x < w; x += 22) {
                    ctx.beginPath();
                    ctx.arc(x, y, 3.2, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        });
        const pegboard = new THREE.Group();
        pegboard.position.set(4.15, 2.9, -4.97);
        scene.add(pegboard);
        glowPlane(4.3, 2.9, '210,225,255', 0.85, [0, 0, -0.012], null, pegboard, true);
        addMesh(new THREE.BoxGeometry(3.1, 1.75, 0.05), std(0xffffff, 0.8, 0.1, { map: pegTex }), [0, 0, 0.025], pegboard, { station: 'credentials' });
        const pegLight = new THREE.PointLight(0xdbeafe, 0.8, 4.5, 2);
        pegLight.position.set(0, 0, 0.9);
        pegboard.add(pegLight);

        const BADGES = [
            {
                company: 'TIERRA AYNI',
                role: 'Jefe Proyectos & Sec',
                dates: '2018 – Presente',
                scope: 'PSE · ANCI · Cloud AWS',
                c: '#10b981',
                tag: 'LÍDER TI & SEC'
            },
            {
                company: 'SENTRA',
                role: 'Ingeniero Software',
                dates: '2016 – 2018',
                scope: 'BCI · Falabella · BcoEstado',
                c: '#38bdf8',
                tag: 'BANCA & RETAIL'
            },
            {
                company: 'PORVENIR',
                role: 'Analista Arq & Dev',
                dates: 'Feb – Ago 2016',
                scope: 'AWS · SISEG · PostgreSQL',
                c: '#f59e0b',
                tag: 'SEGUROS & ERP'
            },
            {
                company: 'CONTRALORÍA',
                role: 'Analista Programador',
                dates: '2012 – 2015',
                scope: 'SICA v3/v4 · Oracle SOA',
                c: '#818cf8',
                tag: 'GOBIERNO & CGR'
            },
            {
                company: 'ACCENTURE',
                role: 'Ingeniero Software',
                dates: '2011 – 2012',
                scope: 'QA & Auto UNIX · JEE',
                c: '#a855f7',
                tag: 'CONSULTORÍA TI'
            },
            {
                company: 'EVERIS / NTT',
                role: 'Consultor TI',
                dates: '2010 – 2011',
                scope: 'SIGFE 2 · Min. Hacienda',
                c: '#06b6d4',
                tag: 'HACIENDA PÚBLICA'
            }
        ];
        const badgePivots = [];
        BADGES.forEach((b, i) => {
            const tex = canvasTexture(256, 360, (ctx, w, h) => {
                // Card background
                ctx.fillStyle = '#f8fafc';
                ctx.fillRect(0, 0, w, h);

                // Top company brand header banner
                ctx.fillStyle = b.c;
                ctx.fillRect(0, 0, w, 70);

                // Clip slit cutout
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(w / 2 - 22, 10, 44, 9);

                // Header tag
                ctx.font = '700 12px "JetBrains Mono", monospace';
                ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                ctx.textAlign = 'center';
                ctx.fillText(b.tag, w / 2, 52);

                // Circular avatar / security emblem
                ctx.fillStyle = '#e2e8f0';
                ctx.beginPath();
                ctx.arc(w / 2, 118, 32, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = b.c;
                ctx.lineWidth = 3;
                ctx.stroke();

                // Inner chip glyph
                ctx.fillStyle = b.c;
                ctx.beginPath();
                ctx.arc(w / 2, 118, 14, 0, Math.PI * 2);
                ctx.fill();

                // Company Name
                ctx.fillStyle = '#0f172a';
                ctx.font = '800 20px "Plus Jakarta Sans", sans-serif';
                ctx.fillText(b.company, w / 2, 184);

                // Role / Position
                ctx.fillStyle = b.c;
                ctx.font = '700 13px "JetBrains Mono", monospace';
                ctx.fillText(b.role, w / 2, 210);

                // Dates
                ctx.fillStyle = '#334155';
                ctx.font = '600 13px "JetBrains Mono", monospace';
                ctx.fillText(b.dates, w / 2, 236);

                // Key Scope / Clients
                ctx.fillStyle = '#64748b';
                ctx.font = '500 11px "Inter", sans-serif';
                ctx.fillText(b.scope, w / 2, 262);

                // Security Barcode at bottom
                ctx.fillStyle = '#0f172a';
                const barcodeY = 292;
                const barcodeH = 26;
                const seedBars = [2, 4, 1, 3, 5, 2, 1, 4, 2, 3, 1, 5, 3, 2, 4, 1, 2, 3, 5, 2, 4, 1, 3, 2];
                let curX = 36;
                seedBars.forEach((bw) => {
                    ctx.fillRect(curX, barcodeY, bw, barcodeH);
                    curX += bw + 3;
                });

                ctx.font = '600 9px "JetBrains Mono", monospace';
                ctx.fillStyle = '#94a3b8';
                ctx.fillText(`ID-PASS · ${b.company.slice(0, 4)}-${2026 - i}`, w / 2, 338);

                ctx.textAlign = 'left';
            });

            const x = -1.15 + i * 0.46;
            const pivot = new THREE.Group();
            pivot.position.set(x, 0.62, 0.07);
            pegboard.add(pivot);
            addMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 6), std(0xcbd5e1, 0.3, 0.8), [0, 0, 0.02], pivot, { rot: [Math.PI / 2, 0, 0], cast: false });
            addMesh(new THREE.BoxGeometry(0.038, 0.62, 0.005), std(new THREE.Color(b.c), 0.6), [0, -0.31, 0.03], pivot, { cast: false });
            addMesh(new THREE.PlaneGeometry(0.32, 0.45), std(0xffffff, 0.6, 0, { map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.28 }), [0, -0.84, 0.04], pivot, {
                station: 'credentials',
                cast: false
            });
            badgePivots.push({ pivot, phase: i * 0.9 });
        });

        /* ---------------------------------------------------------
           CABINET + SPEAKER & TURNTABLE (→ Música IA)
        --------------------------------------------------------- */
        const cabinet = new THREE.Group();
        cabinet.position.set(4.15, 0, -4.55);
        scene.add(cabinet);
        addMesh(new THREE.BoxGeometry(2.1, 0.78, 0.75), std(0x1c1d23, 0.55, 0.15), [0, 0.39, 0], cabinet);
        addMesh(new THREE.BoxGeometry(0.01, 0.6, 0.01), std(0x0a0a0d, 0.5), [0, 0.4, 0.376], cabinet, { cast: false });
        addMesh(new THREE.BoxGeometry(0.03, 0.14, 0.03), std(0xd4a24c, 0.3, 0.9), [-0.08, 0.42, 0.39], cabinet, { cast: false });
        addMesh(new THREE.BoxGeometry(0.03, 0.14, 0.03), std(0xd4a24c, 0.3, 0.9), [0.08, 0.42, 0.39], cabinet, { cast: false });

        const speaker = new THREE.Group();
        speaker.position.set(-0.55, 0.78, 0);
        cabinet.add(speaker);
        addMesh(new THREE.BoxGeometry(0.55, 0.66, 0.45), std(0x111216, 0.5, 0.3), [0, 0.33, 0], speaker, { station: 'music' });
        const ringMat = basic({ color: 0xf472b6 });
        const ringOuter = addMesh(new THREE.TorusGeometry(0.17, 0.016, 10, 40), ringMat, [0, 0.36, 0.23], speaker, { cast: false, station: 'music' });
        const ringInner = addMesh(new THREE.TorusGeometry(0.095, 0.013, 10, 32), ringMat, [0, 0.36, 0.23], speaker, { cast: false });
        addMesh(new THREE.SphereGeometry(0.045, 14, 14), std(0x27272a, 0.3, 0.6), [0, 0.36, 0.23], speaker);
        glowPlane(1.2, 1.2, '244,114,182', 0.45, [0, 0.36, 0.235], null, speaker);
        const speakerLight = new THREE.PointLight(0xf472b6, 0.55, 2.5, 2);
        speakerLight.position.set(0, 0.4, 0.5);
        speaker.add(speakerLight);

        const turntable = new THREE.Group();
        turntable.position.set(0.42, 0.78, 0);
        cabinet.add(turntable);
        addMesh(new THREE.BoxGeometry(0.85, 0.09, 0.6), std(0x2a2b31, 0.5, 0.3), [0, 0.045, 0], turntable, { station: 'music' });
        const vinyl = addMesh(new THREE.CylinderGeometry(0.23, 0.23, 0.02, 32), std(0x09090b, 0.25, 0.5), [-0.1, 0.1, 0], turntable, { station: 'music' });
        addMesh(new THREE.CylinderGeometry(0.07, 0.07, 0.022, 20), basic({ color: 0xf9a8d4 }), [-0.1, 0.102, 0], turntable, { cast: false });
        addMesh(new THREE.BoxGeometry(0.02, 0.02, 0.32), std(0xd4d4d8, 0.3, 0.8), [0.25, 0.12, 0.02], turntable, { rot: [0, 0.4, 0] });

        // Plant next to window
        const plant = new THREE.Group();
        plant.position.set(-2.4, 0, -4.35);
        scene.add(plant);
        addMesh(new THREE.CylinderGeometry(0.26, 0.2, 0.5, 18), std(0xe5e7eb, 0.6), [0, 0.25, 0], plant);
        const leafMat = std(0x16a34a, 0.65);
        for (let i = 0; i < 9; i++) {
            const a = (i / 9) * Math.PI * 2;
            const leaf = addMesh(new THREE.SphereGeometry(0.16, 10, 10), leafMat, [Math.cos(a) * 0.18, 0.75 + (i % 3) * 0.22, Math.sin(a) * 0.18], plant);
            leaf.scale.set(0.6, 1.8, 0.35);
            leaf.rotation.set(Math.sin(a) * 0.5, a, Math.cos(a) * 0.5);
        }

        /* ---------------------------------------------------------
           RETRO ARCADE CABINET (→ Edu Tetris)
        --------------------------------------------------------- */
        const arcadeScreenTex = canvasTexture(256, 200, (ctx, w, h) => {
            ctx.fillStyle = '#05060f';
            ctx.fillRect(0, 0, w, h);
            const cols = ['#38bdf8', '#f472b6', '#34d399', '#fbbf24', '#818cf8'];
            const blocks = [
                [3, 9, 0], [4, 9, 0], [5, 9, 0], [6, 9, 0],
                [2, 8, 1], [2, 7, 1], [3, 8, 1], [3, 7, 1],
                [5, 8, 2], [6, 8, 2], [6, 7, 2], [7, 7, 2],
                [4, 6, 3], [5, 6, 3], [6, 6, 3], [5, 5, 3],
                [4, 2, 4], [5, 2, 4], [5, 3, 4], [6, 3, 4]
            ];
            blocks.forEach(([bx, by, ci]) => {
                ctx.fillStyle = cols[ci];
                ctx.fillRect(40 + bx * 16, by * 18 + 8, 14, 16);
            });
            ctx.strokeStyle = 'rgba(56,189,248,0.6)';
            ctx.strokeRect(38, 6, 16 * 10 + 4, 18 * 10 + 4);
            ctx.font = '700 13px "JetBrains Mono", monospace';
            ctx.fillStyle = '#f9a8d4';
            ctx.fillText('SCORE', 208, 30);
            ctx.fillStyle = '#ffffff';
            ctx.fillText('15000', 206, 50);
        });
        const marqueeTex = canvasTexture(256, 64, (ctx, w, h) => {
            const g = ctx.createLinearGradient(0, 0, w, 0);
            g.addColorStop(0, '#db2777');
            g.addColorStop(1, '#7c3aed');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);
            ctx.font = '800 30px "Plus Jakarta Sans", sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText('EDU TETRIS', w / 2, 43);
            ctx.textAlign = 'left';
        });

        const arcade = new THREE.Group();
        arcade.position.set(-5.05, 0, -4.05);
        arcade.rotation.y = Math.PI / 4;
        scene.add(arcade);
        const arcadeBody = std(0x14141c, 0.5, 0.25);
        addMesh(new THREE.BoxGeometry(0.95, 1.95, 0.85), arcadeBody, [0, 0.975, 0], arcade, { station: 'arcade' });
        addMesh(new THREE.BoxGeometry(0.97, 0.06, 0.87), basic({ color: 0xf472b6 }), [0, 1.86, 0], arcade, { cast: false, receive: false });
        addMesh(new THREE.BoxGeometry(0.02, 1.7, 0.6), basic({ color: 0x7c3aed }), [0.486, 1.0, 0.05], arcade, { cast: false, receive: false });
        addMesh(new THREE.BoxGeometry(0.02, 1.7, 0.6), basic({ color: 0x7c3aed }), [-0.486, 1.0, 0.05], arcade, { cast: false, receive: false });
        addMesh(new THREE.PlaneGeometry(0.78, 0.6), basic({ map: arcadeScreenTex }), [0, 1.38, 0.43], arcade, {
            rot: [-0.18, 0, 0],
            station: 'arcade',
            cast: false
        });
        addMesh(new THREE.PlaneGeometry(0.9, 0.22), basic({ map: marqueeTex }), [0, 1.76, 0.432], arcade, { cast: false, station: 'arcade' });
        addMesh(new THREE.BoxGeometry(0.95, 0.08, 0.42), std(0x1f1f2b, 0.5, 0.3), [0, 1.0, 0.55], arcade, { rot: [0.25, 0, 0] });
        addMesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 8), std(0x0a0a0a, 0.4), [-0.22, 1.1, 0.55], arcade);
        addMesh(new THREE.SphereGeometry(0.045, 12, 12), std(0xef4444, 0.3), [-0.22, 1.17, 0.55], arcade);
        [0x38bdf8, 0x34d399, 0xfbbf24].forEach((c, i) => {
            addMesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 14), basic({ color: c }), [0.05 + i * 0.12, 1.06, 0.55 + (i % 2) * 0.04], arcade, {
                rot: [0.25, 0, 0],
                cast: false
            });
        });
        glowPlane(1.8, 1.8, '244,114,182', 0.35, [0, 0.012, 0.7], [-Math.PI / 2, 0, 0], arcade);
        const arcadeLight = new THREE.PointLight(0xa855f7, 0.7, 3, 2);
        arcadeLight.position.set(0, 1.4, 0.9);
        arcade.add(arcadeLight);

        /* ---------------------------------------------------------
           BEANBAG + SLEEPING CAT (decor)
        --------------------------------------------------------- */
        const lounge = new THREE.Group();
        lounge.position.set(-4.3, 0, 2.4);
        scene.add(lounge);
        const beanbag = addMesh(new THREE.SphereGeometry(0.9, 28, 20), std(0xf9a8d4, 0.92), [0, 0.44, 0], lounge);
        beanbag.scale.set(1, 0.55, 1);
        const cat = new THREE.Group();
        cat.position.set(0.05, 0.86, 0.05);
        lounge.add(cat);
        const catMat = std(0xf8fafc, 0.85);
        const catBody = addMesh(new THREE.SphereGeometry(0.22, 18, 14), catMat, [0, 0, 0], cat);
        catBody.scale.set(1.45, 0.62, 0.95);
        addMesh(new THREE.SphereGeometry(0.13, 16, 12), catMat, [0.3, 0.02, 0.06], cat);
        addMesh(new THREE.ConeGeometry(0.045, 0.09, 8), catMat, [0.33, 0.13, 0.0], cat, { rot: [0, 0, -0.2] });
        addMesh(new THREE.ConeGeometry(0.045, 0.09, 8), catMat, [0.33, 0.13, 0.12], cat, { rot: [0, 0, -0.2] });
        const tail = addMesh(new THREE.CylinderGeometry(0.035, 0.03, 0.42, 8), catMat, [-0.3, -0.04, 0.16], cat, { rot: [Math.PI / 2, 0, 0.9] });

        /* ---------------------------------------------------------
           FLOATING DUST MOTES IN SUNLIGHT
        --------------------------------------------------------- */
        const dustCount = mobileAtStart ? 60 : 130;
        const dustPos = new Float32Array(dustCount * 3);
        const dustRand = seededRandom(99);
        for (let i = 0; i < dustCount; i++) {
            dustPos[i * 3] = -2 + dustRand() * 6;
            dustPos[i * 3 + 1] = 0.4 + dustRand() * 3.8;
            dustPos[i * 3 + 2] = -4.5 + dustRand() * 6;
        }
        const dustGeo = new THREE.BufferGeometry();
        dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
        const dust = new THREE.Points(
            dustGeo,
            new THREE.PointsMaterial({
                color: 0xffd7a8,
                size: 0.035,
                transparent: true,
                opacity: 0.55,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            })
        );
        scene.add(dust);

        /* ---------------------------------------------------------
           HOTSPOTS (DIAMOND MARKERS) & CAMERA TARGETS
        --------------------------------------------------------- */
        const UP = new THREE.Vector3(0, 1, 0);
        const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
        const HOTSPOTS = [
            { id: 'projects', code: '01', label: 'Proyectos', anchor: [-0.55, 2.5, 0.12], target: [-0.5, 1.82, 0.12], normal: [Math.sin(0.42), 0, Math.cos(0.42)], dist: 2.7, lift: 0.3 },
            { id: 'credentials', code: '02', label: 'Credenciales', anchor: [4.15, 4.05, -4.85], target: [4.15, 2.75, -4.95], normal: [0, 0, 1], dist: 3.6, lift: 0.15 },
            { id: 'home', code: '03', label: 'Perfil', anchor: [-5.85, 4.45, -3.25], target: [-5.95, 3.45, -3.0], normal: [1, 0, 0], dist: 3.5, lift: 0.0 },
            { id: 'contact', code: '04', label: 'Contacto', anchor: [1.35, 1.45, 0.6], target: [1.35, 1.06, 0.6], normal: [0.28, 0, 0.96], dist: 1.55, lift: 0.85 },
            { id: 'arcade', code: '05', label: 'Edu Tetris', anchor: [-5.05, 2.4, -4.05], target: [-4.85, 1.4, -3.85], normal: [1, 0, 1], dist: 3.0, lift: 0.25 },
            { id: 'music', code: '06', label: 'Música IA', anchor: [3.6, 2.0, -4.5], target: [3.95, 1.1, -4.5], normal: [0, 0, 1], dist: 2.7, lift: 0.55 }
        ];
        const hotspotMap = new Map();
        let hoveredId = null;

        HOTSPOTS.forEach((hs) => {
            hs.anchorV = v3(hs.anchor);
            hs.targetV = v3(hs.target);
            hs.normalV = v3(hs.normal).normalize();
            hotspotMap.set(hs.id, hs);

            if (markersContainer) {
                const el = document.createElement('button');
                el.type = 'button';
                el.className = 'room-hotspot';
                el.dataset.stationId = hs.id;
                el.setAttribute('aria-label', `${hs.code} ${hs.label}`);
                el.innerHTML =
                    '<span class="room-hotspot-diamond" aria-hidden="true"></span>' +
                    `<span class="room-hotspot-label"><span class="room-hotspot-code">${hs.code}</span>${hs.label}</span>`;
                el.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    api.focusStation(hs.id);
                });
                el.addEventListener('pointerdown', (ev) => ev.stopPropagation());
                el.addEventListener('mouseenter', () => {
                    hoveredId = hs.id;
                });
                el.addEventListener('mouseleave', () => {
                    if (hoveredId === hs.id) hoveredId = null;
                });
                markersContainer.appendChild(el);
                hs.el = el;
            }
        });

        /* ---------------------------------------------------------
           CAMERA CONTROLLER: LIMITED ORBIT + ZOOM + FOCUS FLIGHT
        --------------------------------------------------------- */
        const overviewTarget = new THREE.Vector3(-0.35, 1.45, -1.35);
        function baseRadius() {
            const aspect = window.innerWidth / Math.max(1, window.innerHeight);
            return aspect < 1 ? (13.2 / Math.max(0.45, aspect)) * 0.74 : 14.6;
        }
        const AZ_BASE = 0.74;
        const POL_BASE = 0.46;
        const orbit = { az: AZ_BASE, tAz: AZ_BASE, pol: POL_BASE, tPol: POL_BASE, r: baseRadius(), tR: baseRadius() };
        let focusYaw = 0;
        let focusPitch = 0;

        const desiredPos = new THREE.Vector3();
        const desiredLook = overviewTarget.clone();
        const currentLook = overviewTarget.clone();
        const tmpN = new THREE.Vector3();
        const tmpR = new THREE.Vector3();

        function orbitPosition(out) {
            return out.set(
                overviewTarget.x + Math.sin(orbit.az) * Math.cos(orbit.pol) * orbit.r,
                overviewTarget.y + Math.sin(orbit.pol) * orbit.r,
                overviewTarget.z + Math.cos(orbit.az) * Math.cos(orbit.pol) * orbit.r
            );
        }
        orbitPosition(camera.position);
        camera.lookAt(currentLook);

        api.onFocusChange((stationId) => {
            focusYaw = 0;
            focusPitch = 0;
            if (!hotspotMap.has(stationId)) {
                orbit.tR = baseRadius();
                orbit.tPol = POL_BASE;
            }
        });

        const raycaster = new THREE.Raycaster();
        const ndc = new THREE.Vector2();
        let dragging = false;
        let lastX = 0;
        let lastY = 0;
        let dragDist = 0;
        let lastInteraction = 0;

        function pickStation(clientX, clientY) {
            ndc.x = (clientX / Math.max(1, window.innerWidth)) * 2 - 1;
            ndc.y = -(clientY / Math.max(1, window.innerHeight)) * 2 + 1;
            raycaster.setFromCamera(ndc, camera);
            const hits = raycaster.intersectObjects(hitMeshes, false);
            return hits.length > 0 ? hits[0].object.userData.stationId : null;
        }

        canvas.addEventListener('pointerdown', (e) => {
            if (api.getViewMode() !== 'stage3d') return;
            dragging = true;
            lastX = e.clientX;
            lastY = e.clientY;
            dragDist = 0;
            lastInteraction = performance.now();
            canvas.classList.add('is-dragging');
        });

        window.addEventListener('pointermove', (e) => {
            if (api.getViewMode() !== 'stage3d') return;
            if (dragging) {
                const dx = e.clientX - lastX;
                const dy = e.clientY - lastY;
                lastX = e.clientX;
                lastY = e.clientY;
                dragDist += Math.hypot(dx, dy);
                lastInteraction = performance.now();
                if (!hotspotMap.has(api.getActiveStation())) {
                    orbit.tAz = Math.max(0.12, Math.min(1.42, orbit.tAz - dx * 0.004));
                    orbit.tPol = Math.max(0.2, Math.min(0.95, orbit.tPol + dy * 0.003));
                } else {
                    focusYaw = Math.max(-0.45, Math.min(0.45, focusYaw - dx * 0.0028));
                    focusPitch = Math.max(-0.3, Math.min(0.35, focusPitch + dy * 0.0022));
                }
                return;
            }
            if (e.target !== canvas) return;
            const id = pickStation(e.clientX, e.clientY);
            if (id) {
                hoveredId = id;
                canvas.style.cursor = 'pointer';
            } else {
                if (hoveredId && !(hotspotMap.get(hoveredId) || {}).el?.matches(':hover')) hoveredId = null;
                canvas.style.cursor = '';
            }
        });

        window.addEventListener('pointerup', (e) => {
            if (!dragging) return;
            dragging = false;
            canvas.classList.remove('is-dragging');
            if (api.getViewMode() === 'stage3d' && dragDist < 7 && e.target === canvas) {
                const id = pickStation(e.clientX, e.clientY);
                if (id) api.focusStation(id);
            }
        });

        canvas.addEventListener(
            'wheel',
            (e) => {
                if (api.getViewMode() !== 'stage3d' || hotspotMap.has(api.getActiveStation())) return;
                e.preventDefault();
                lastInteraction = performance.now();
                const base = baseRadius();
                orbit.tR = Math.max(base * 0.6, Math.min(base * 1.35, orbit.tR + e.deltaY * 0.008));
            },
            { passive: false }
        );

        window.addEventListener('resize', () => {
            camera.fov = isMobile() ? 52 : 38;
            camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
            if (!hotspotMap.has(api.getActiveStation())) orbit.tR = baseRadius();
        });

        /* ---------------------------------------------------------
           PROJECT DIAMOND MARKERS TO SCREEN
        --------------------------------------------------------- */
        const projVec = new THREE.Vector3();
        function updateMarkers(timeSec) {
            if (!markersContainer || api.getViewMode() !== 'stage3d') return;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const active = api.getActiveStation();
            HOTSPOTS.forEach((hs) => {
                if (!hs.el) return;
                projVec.copy(hs.anchorV);
                projVec.y += reduced ? 0 : Math.sin(timeSec * 2 + hs.anchorV.x) * 0.04;
                projVec.project(camera);
                const px = (projVec.x * 0.5 + 0.5) * vw;
                const py = (-projVec.y * 0.5 + 0.5) * vh;
                const off = projVec.z > 1 || px < 12 || px > vw - 12 || py < 48 || py > vh - 70;
                hs.el.classList.toggle('is-hidden', off);
                if (off) return;
                hs.el.classList.toggle('is-hovered', hoveredId === hs.id);
                hs.el.classList.toggle('is-active', active === hs.id);
                hs.el.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0) translate(-50%, -50%)`;
            });
        }

        /* ---------------------------------------------------------
           RENDER LOOP
        --------------------------------------------------------- */
        let animId = null;
        let lastTime = performance.now();
        let nextBlink = 2.5;

        function frame(now) {
            const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
            lastTime = now;
            const t = now * 0.001;
            const k = 1 - Math.exp(-dt * 4.2);
            const active = api.getActiveStation();
            const hs = api.getViewMode() === 'stage3d' ? hotspotMap.get(active) : null;

            if (hs) {
                tmpN.copy(hs.normalV).applyAxisAngle(UP, focusYaw);
                tmpR.set(tmpN.z, 0, -tmpN.x);
                const dist = hs.dist * (isMobile() ? 1.4 : 1);
                const shift = window.innerWidth >= 1024 ? hs.dist * 0.36 : 0;
                desiredPos.copy(hs.targetV).addScaledVector(tmpN, dist).addScaledVector(tmpR, shift);
                desiredPos.y += hs.lift + focusPitch * 1.6;
                desiredLook.copy(hs.targetV).addScaledVector(tmpR, shift);
            } else {
                if (!reduced && !dragging && now - lastInteraction > 3000) {
                    orbit.tAz = AZ_BASE + Math.sin(t * 0.12) * 0.16;
                }
                orbit.az += (orbit.tAz - orbit.az) * k;
                orbit.pol += (orbit.tPol - orbit.pol) * k;
                orbit.r += (orbit.tR - orbit.r) * k;
                orbitPosition(desiredPos);
                desiredLook.copy(overviewTarget);
            }

            camera.position.lerp(desiredPos, k);
            currentLook.lerp(desiredLook, k);
            camera.lookAt(currentLook);

            if (!reduced) {
                // Robot idle: typing arms, head bob, blinking eyes
                armL.rotation.x = -1.2 + Math.sin(t * 13) * 0.05;
                armR.rotation.x = -1.2 + Math.sin(t * 13 + 1.7) * 0.05;
                head.rotation.y = Math.sin(t * 0.6) * 0.18;
                head.rotation.x = Math.sin(t * 0.9) * 0.04;
                head.position.y = 1.62 + Math.sin(t * 1.8) * 0.012;
                nextBlink -= dt;
                const blinking = nextBlink < 0 && nextBlink > -0.14;
                eyeL.scale.y = eyeR.scale.y = blinking ? 0.12 : 1;
                if (nextBlink < -0.14) nextBlink = 2 + Math.random() * 3;
                antennaTipL.scale.setScalar(1 + Math.sin(t * 3) * 0.2);
                antennaTipR.scale.setScalar(1 + Math.sin(t * 3 + 1.5) * 0.2);
                chestLed.visible = Math.sin(t * 4) > -0.4;

                // Speaker pulse & vinyl spin
                const beat = Math.pow(Math.max(0, Math.sin(t * 6.2)), 6);
                ringOuter.scale.setScalar(1 + beat * 0.12);
                ringInner.scale.setScalar(1 + beat * 0.2);
                vinyl.rotation.y += dt * 3.4;

                // Badges sway & cat breathing
                badgePivots.forEach((b) => {
                    b.pivot.rotation.z = Math.sin(t * 0.9 + b.phase) * 0.035;
                });
                cat.scale.y = 1 + Math.sin(t * 1.6) * 0.03;
                tail.rotation.z = 0.9 + Math.sin(t * 1.1) * 0.15;

                // Dust motes drifting
                dust.rotation.y = Math.sin(t * 0.05) * 0.08;
                dust.position.y = Math.sin(t * 0.3) * 0.08;

                // LED breathing
                deskLight.intensity = 1.15 + Math.sin(t * 1.4) * 0.12;
            }

            renderer.render(scene, camera);
            updateMarkers(t);

            if (!reduced && !document.hidden) {
                animId = requestAnimationFrame(frame);
            } else {
                animId = null;
            }
        }

        animId = requestAnimationFrame(frame);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && !animId) {
                lastTime = performance.now();
                animId = requestAnimationFrame(frame);
            }
        });
        if (reduced) {
            // Keep camera transitions responsive even with reduced motion (render on demand)
            setInterval(() => {
                if (!animId) animId = requestAnimationFrame(frame);
            }, 120);
        }

        return true;
    }

    window.EduRoomScene = { init };
})();
