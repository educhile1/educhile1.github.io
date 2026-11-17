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

        function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
            const words = String(text || '').split(' ');
            let line = '';
            let curY = y;
            for (let n = 0; n < words.length; n++) {
                const testLine = line + words[n] + ' ';
                const metrics = ctx.measureText(testLine);
                if (metrics.width > maxWidth && n > 0) {
                    ctx.fillText(line, x, curY);
                    line = words[n] + ' ';
                    curY += lineHeight;
                } else {
                    line = testLine;
                }
            }
            ctx.fillText(line, x, curY);
            return curY;
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

        const wallMatBack = std(0xffffff, 0.92, 0.02, { map: wallTexture(7, 5) });
        const wallMatLeft = std(0xffffff, 0.92, 0.02, { map: wallTexture(6, 5) });
        // Back wall segmented with aperture for panoramic window (extended height 9.2 to fully occlude outdoor backdrop)
        const backZ = -5.15;
        const backDepth = 0.3;
        // Left section: from x = -6.3 to x = -1.6 (width 4.7), reaches up to y = 9.05
        addMesh(new THREE.BoxGeometry(4.7, 9.2, backDepth), wallMatBack, [-3.95, 4.45, backZ], scene, { cast: false });
        // Right section: from x = 2.8 to x = 6.3 (width 3.5), reaches up to y = 9.05
        addMesh(new THREE.BoxGeometry(3.5, 9.2, backDepth), wallMatBack, [4.55, 4.45, backZ], scene, { cast: false });
        // Top header: from x = -1.6 to x = 2.8 (width 4.4), from window lintel y = 4.2 up to y = 9.05 (height 4.85)
        addMesh(new THREE.BoxGeometry(4.4, 4.85, backDepth), wallMatBack, [0.6, 6.625, backZ], scene, { cast: false });
        // Bottom sill-wall: from x = -1.6 to x = 2.8 (width 4.4), y from -0.15 to 1.6 (height 1.75)
        addMesh(new THREE.BoxGeometry(4.4, 1.75, backDepth), wallMatBack, [0.6, 0.725, backZ], scene, { cast: false });
        // Window opening architectural jamb trim
        const jambMat = std(0x111318, 0.5, 0.3);
        addMesh(new THREE.BoxGeometry(4.4, 0.025, backDepth), jambMat, [0.6, 4.2, backZ]);
        addMesh(new THREE.BoxGeometry(4.4, 0.025, backDepth), jambMat, [0.6, 1.6, backZ]);
        addMesh(new THREE.BoxGeometry(0.025, 2.6, backDepth), jambMat, [-1.6, 2.9, backZ]);
        addMesh(new THREE.BoxGeometry(0.025, 2.6, backDepth), jambMat, [2.8, 2.9, backZ]);
        // Left architectural wall: reaches up to y = 9.05
        addMesh(new THREE.BoxGeometry(0.3, 9.2, 10.3), wallMatLeft, [-6.15, 4.45, 0.15], scene, { cast: false });

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
           SCENIC WINDOW WITH REAL ICONIC WORLD LANDSCAPES & 3D PARALLAX
        --------------------------------------------------------- */
        const SCENIC_LOCATIONS = [
            {
                id: 'patagonia',
                name: 'Torres del Paine',
                region: 'Patagonia · Chile',
                icon: '🏔️',
                desc: 'Cuernos del Paine y lagos glaciares',
                image: 'images/landscape-patagonia.jpg',
                sunColor: 0xdbeafe,
                sunIntensity: 1.25,
                hemiSky: 0x93c5fd,
                hemiGround: 0x1e293b,
                dustColor: 0xe0f2fe,
                beamColor: 0xbfdbfe,
                beamOpacity: 0.26,
                floorGlowColor: 0x93c5fd,
                floorGlowOpacity: 0.22
            },
            {
                id: 'fuji',
                name: 'Monte Fuji',
                region: 'Lago Kawaguchi · Japón',
                icon: '🗻',
                desc: 'Amanecer sereno y reflejo en el lago',
                image: 'images/landscape-fuji.jpg',
                sunColor: 0xfecdd3,
                sunIntensity: 1.15,
                hemiSky: 0xf472b6,
                hemiGround: 0x2e1065,
                dustColor: 0xfda4af,
                beamColor: 0xfecdd3,
                beamOpacity: 0.24,
                floorGlowColor: 0xf472b6,
                floorGlowOpacity: 0.26
            },
            {
                id: 'alps',
                name: 'Alpes Suizos',
                region: 'Matterhorn · Zermatt, Suiza',
                icon: '⛷️',
                desc: 'Cumbre piramidal y luz dorada alpina',
                image: 'images/landscape-alps.jpg',
                sunColor: 0xfef08a,
                sunIntensity: 1.32,
                hemiSky: 0x7dd3fc,
                hemiGround: 0x1f2937,
                dustColor: 0xfef9c3,
                beamColor: 0xfef08a,
                beamOpacity: 0.32,
                floorGlowColor: 0xfde047,
                floorGlowOpacity: 0.28
            },
            {
                id: 'dolomites',
                name: 'Dolomitas & Braies',
                region: 'Tirol del Sur · Italia',
                icon: '🌲',
                desc: 'Bosques esmeralda y paredones calcáreos',
                image: 'images/landscape-dolomites.jpg',
                sunColor: 0xa7f3d0,
                sunIntensity: 1.2,
                hemiSky: 0x34d399,
                hemiGround: 0x134e4a,
                dustColor: 0xd1fae5,
                beamColor: 0xa7f3d0,
                beamOpacity: 0.25,
                floorGlowColor: 0x6ee7b7,
                floorGlowOpacity: 0.24
            },
            {
                id: 'santorini',
                name: 'Santorini & Caldera',
                region: 'Mar Egeo · Grecia',
                icon: '🏛️',
                desc: 'Cúpulas blancas y atardecer mediterráneo',
                image: 'images/landscape-santorini.jpg',
                sunColor: 0xffedd5,
                sunIntensity: 1.35,
                hemiSky: 0x38bdf8,
                hemiGround: 0x3b1c12,
                dustColor: 0xfed7aa,
                beamColor: 0xfde047,
                beamOpacity: 0.35,
                floorGlowColor: 0xfb923c,
                floorGlowOpacity: 0.32
            }
        ];

        const textureLoader = new THREE.TextureLoader();
        const scenicTextures = new Array(SCENIC_LOCATIONS.length).fill(null);

        function getScenicTexture(idx) {
            const safeIdx = ((idx % SCENIC_LOCATIONS.length) + SCENIC_LOCATIONS.length) % SCENIC_LOCATIONS.length;
            if (scenicTextures[safeIdx]) return scenicTextures[safeIdx];

            const tex = textureLoader.load(SCENIC_LOCATIONS[safeIdx].image);
            tex.encoding = THREE.sRGBEncoding;
            tex.anisotropy = Math.min(8, renderer ? renderer.capabilities.getMaxAnisotropy() : 8);
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.generateMipmaps = true;
            scenicTextures[safeIdx] = tex;
            return tex;
        }

        // Load only the initial visible vista at startup; remaining vistas load lazily on demand
        getScenicTexture(0);

        const winCenter = [0.6, 2.9, -4.99];
        const winW = 4.4;
        const winH = 2.6;

        // Group positioned behind aperture for authentic geometric parallax (z = -5.8 vs window at z = -4.96)
        const scenicGroup = new THREE.Group();
        scenicGroup.position.set(winCenter[0], winCenter[1], -5.8);
        scene.add(scenicGroup);

        // Perfectly proportioned backdrop plane (height 3.6 centered at y = 2.9, reaching y = 4.7, while wall reaches y = 9.05)
        const scenicGeo = new THREE.PlaneGeometry(6.6, 3.6);
        const scenicMatA = basic({
            map: getScenicTexture(0),
            transparent: true,
            opacity: 1.0,
            depthWrite: false
        });
        const scenicMeshA = new THREE.Mesh(scenicGeo, scenicMatA);
        scenicMeshA.renderOrder = 0;
        scenicGroup.add(scenicMeshA);

        const scenicMatB = basic({
            map: null,
            transparent: true,
            opacity: 0.0,
            depthWrite: false
        });
        const scenicMeshB = new THREE.Mesh(scenicGeo, scenicMatB);
        scenicMeshB.position.z = 0.005;
        scenicMeshB.renderOrder = 1;
        scenicGroup.add(scenicMeshB);

        // Exterior Blackout Shroud: Fully seals the top, back and sides of the outdoor window backdrop
        addMesh(new THREE.BoxGeometry(7.2, 0.15, 1.4), basic({ color: 0x060810 }), [winCenter[0], 4.75, -5.5], scene, { cast: false, receive: false });
        addMesh(new THREE.PlaneGeometry(7.2, 4.2), basic({ color: 0x060810 }), [winCenter[0], winCenter[1], -5.84], scene, { cast: false, receive: false });

        // Volumetric Sunbeams Streaming Through Window Aperture
        const beamCanvas = document.createElement('canvas');
        beamCanvas.width = 256;
        beamCanvas.height = 512;
        const beamCtx = beamCanvas.getContext('2d');
        const vGrad = beamCtx.createLinearGradient(0, 0, 0, 512);
        vGrad.addColorStop(0, 'rgba(255,255,255,0.7)');
        vGrad.addColorStop(0.2, 'rgba(255,255,255,0.48)');
        vGrad.addColorStop(0.6, 'rgba(255,255,255,0.15)');
        vGrad.addColorStop(0.92, 'rgba(255,255,255,0.02)');
        vGrad.addColorStop(1, 'rgba(255,255,255,0)');
        beamCtx.fillStyle = vGrad;
        beamCtx.fillRect(0, 0, 256, 512);

        const hGrad = beamCtx.createLinearGradient(0, 0, 256, 0);
        hGrad.addColorStop(0, 'rgba(0,0,0,1)');
        hGrad.addColorStop(0.18, 'rgba(0,0,0,0)');
        hGrad.addColorStop(0.82, 'rgba(0,0,0,0)');
        hGrad.addColorStop(1, 'rgba(0,0,0,1)');
        beamCtx.globalCompositeOperation = 'destination-out';
        beamCtx.fillStyle = hGrad;
        beamCtx.fillRect(0, 0, 256, 512);
        beamCtx.globalCompositeOperation = 'source-over';

        const beamTex = new THREE.CanvasTexture(beamCanvas);
        beamTex.encoding = THREE.sRGBEncoding;

        const sunbeamMat = new THREE.MeshBasicMaterial({
            map: beamTex,
            color: SCENIC_LOCATIONS[0].beamColor,
            transparent: true,
            opacity: SCENIC_LOCATIONS[0].beamOpacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        const sunbeamGroup = new THREE.Group();
        sunbeamGroup.position.set(winCenter[0], winCenter[1] + 0.2, -4.95);

        // Shaft 1: Primary wide beam
        const beam1 = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 6.2), sunbeamMat);
        beam1.position.set(0, -1.8, 2.3);
        beam1.rotation.set(-Math.PI / 4, 0.08, -0.06);
        beam1.renderOrder = 4;
        sunbeamGroup.add(beam1);

        // Shaft 2: Crossed secondary angled beam for volumetric body
        const beam2Mat = sunbeamMat.clone();
        beam2Mat.opacity = SCENIC_LOCATIONS[0].beamOpacity * 0.7;
        const beam2 = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 5.8), beam2Mat);
        beam2.position.set(0.2, -1.7, 2.2);
        beam2.rotation.set(-Math.PI / 3.7, -0.15, 0.1);
        beam2.renderOrder = 4;
        sunbeamGroup.add(beam2);

        // Shaft 3: Grazing ambient sheet
        const beam3Mat = sunbeamMat.clone();
        beam3Mat.opacity = SCENIC_LOCATIONS[0].beamOpacity * 0.55;
        const beam3 = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 5.2), beam3Mat);
        beam3.position.set(-0.2, -1.6, 2.0);
        beam3.rotation.set(-Math.PI / 4.4, 0.18, -0.08);
        beam3.renderOrder = 4;
        sunbeamGroup.add(beam3);

        scene.add(sunbeamGroup);

        // Architectural Double-Pane Glass with Specular Sheen (depthWrite false so scenery behind is always visible)
        const glass = new THREE.Mesh(
            new THREE.PlaneGeometry(winW, winH),
            new THREE.MeshStandardMaterial({
                color: 0x93c5fd,
                transparent: true,
                opacity: 0.08,
                roughness: 0.15,
                metalness: 0.1,
                depthWrite: false
            })
        );
        glass.position.set(winCenter[0], winCenter[1], -4.96);
        glass.renderOrder = 3;
        glass.userData.stationId = 'scenic';
        hitMeshes.push(glass);
        scene.add(glass);

        // Diagonal Glass Sheen highlight
        const glassSheenTex = canvasTexture(512, 512, (ctx, w, h) => {
            ctx.clearRect(0, 0, w, h);
            const grad = ctx.createLinearGradient(0, 0, w, h);
            grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
            grad.addColorStop(0.36, 'rgba(255, 255, 255, 0)');
            grad.addColorStop(0.48, 'rgba(255, 255, 255, 0.14)');
            grad.addColorStop(0.52, 'rgba(255, 255, 255, 0.22)');
            grad.addColorStop(0.56, 'rgba(255, 255, 255, 0.06)');
            grad.addColorStop(0.72, 'rgba(255, 255, 255, 0)');
            grad.addColorStop(0.82, 'rgba(255, 255, 255, 0.12)');
            grad.addColorStop(0.86, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
        });
        const glassSheen = new THREE.Mesh(
            new THREE.PlaneGeometry(winW, winH),
            new THREE.MeshBasicMaterial({
                map: glassSheenTex,
                transparent: true,
                opacity: 0.28,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            })
        );
        glassSheen.position.set(winCenter[0], winCenter[1], -4.958);
        glassSheen.renderOrder = 3;
        glassSheen.userData.stationId = 'scenic';
        hitMeshes.push(glassSheen);
        scene.add(glassSheen);

        // Window Frame & Sill
        const frameMat = std(0x101116, 0.4, 0.5);
        const ft = 0.1;
        addMesh(new THREE.BoxGeometry(winW + ft * 2, ft, 0.14), frameMat, [winCenter[0], winCenter[1] + winH / 2, -4.95]);
        addMesh(new THREE.BoxGeometry(winW + ft * 2, ft, 0.14), frameMat, [winCenter[0], winCenter[1] - winH / 2, -4.95]);
        addMesh(new THREE.BoxGeometry(ft, winH, 0.14), frameMat, [winCenter[0] - winW / 2, winCenter[1], -4.95]);
        addMesh(new THREE.BoxGeometry(ft, winH, 0.14), frameMat, [winCenter[0] + winW / 2, winCenter[1], -4.95]);
        addMesh(new THREE.BoxGeometry(0.07, winH, 0.12), frameMat, [winCenter[0], winCenter[1], -4.95]);
        addMesh(new THREE.BoxGeometry(winW + 0.5, 0.08, 0.4), std(0x1b1c22, 0.5, 0.2), [winCenter[0], winCenter[1] - winH / 2 - 0.06, -4.82]);

        // Interactive Plaque on Window Sill
        const plaqueCanvas = document.createElement('canvas');
        plaqueCanvas.width = 512;
        plaqueCanvas.height = 140;
        const plaqueTex = new THREE.CanvasTexture(plaqueCanvas);
        plaqueTex.encoding = THREE.sRGBEncoding;

        const plaqueMesh = addMesh(
            new THREE.PlaneGeometry(0.86, 0.24),
            basic({ map: plaqueTex }),
            [winCenter[0] + 1.35, winCenter[1] - winH / 2 + 0.18, -4.83],
            scene,
            { station: 'scenic' }
        );
        plaqueMesh.userData.stationId = 'scenic';
        hitMeshes.push(plaqueMesh);

        // Floor Light Spill from Window
        const windowFloorGlow = glowPlane(5.6, 4.2, '180,210,255', SCENIC_LOCATIONS[0].floorGlowOpacity, [1.2, 0.014, -2.6], [-Math.PI / 2, 0, 0.25]);

        /* ---------------------------------------------------------
           LIGHTING
        --------------------------------------------------------- */
        const hemiLight = new THREE.HemisphereLight(SCENIC_LOCATIONS[0].hemiSky, SCENIC_LOCATIONS[0].hemiGround, 0.58);
        scene.add(hemiLight);
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.12);
        scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(SCENIC_LOCATIONS[0].sunColor, SCENIC_LOCATIONS[0].sunIntensity);
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

        let deskLightRef = null;
        let lampLightRef = null;
        let shelfLightRef = null;
        let pegLightRef = null;
        let ledMatRef = null;
        let deskFloorGlowRef = null;

        /* ---------------------------------------------------------
           SCENIC LOCATION CONTROLLER & CROSS-FADE SYSTEM
        --------------------------------------------------------- */
        let currentScenicIdx = 0;
        let targetScenicIdx = 0;
        let crossFadeProg = 1.0;
        let isCrossFading = false;
        let autoTourEnabled = false;
        let lastAutoTourTime = 0;
        let dustMesh = null; // Bound when dust motes are created

        const colorLerpA = new THREE.Color();
        const colorLerpB = new THREE.Color();

        function redrawPlaque() {
            const loc = SCENIC_LOCATIONS[targetScenicIdx !== undefined && isCrossFading ? targetScenicIdx : currentScenicIdx];
            const w = 512, h = 140;
            const ctx = plaqueCanvas.getContext('2d');
            ctx.clearRect(0, 0, w, h);

            ctx.fillStyle = 'rgba(10, 12, 18, 0.92)';
            ctx.fillRect(0, 0, w, h);

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 3;
            ctx.strokeRect(3, 3, w - 6, h - 6);

            ctx.fillStyle = '#f472b6';
            ctx.fillRect(16, 20, 5, h - 40);

            ctx.font = '600 20px "JetBrains Mono", monospace';
            ctx.fillStyle = '#38bdf8';
            ctx.fillText('✦ VISTA PANORÁMICA REAL · 3D', 32, 42);

            ctx.font = '700 28px "Inter", sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(`${loc.icon} ${loc.name}`, 32, 80);

            ctx.font = '500 17px "Inter", sans-serif';
            ctx.fillStyle = '#94a3b8';
            ctx.fillText(`${loc.region}  [ Clic para cambiar ]`, 32, 112);

            plaqueTex.needsUpdate = true;
        }

        function updateScenicUI() {
            const activeIdx = targetScenicIdx !== undefined && isCrossFading ? targetScenicIdx : currentScenicIdx;
            const loc = SCENIC_LOCATIONS[activeIdx];
            const iconEl = document.getElementById('scenic-icon');
            const titleEl = document.getElementById('scenic-title');
            const badgeEl = document.getElementById('scenic-badge');
            const tourIconEl = document.getElementById('scenic-tour-icon');
            const tourBtn = document.getElementById('scenic-tour-btn');

            if (iconEl) iconEl.textContent = loc.icon;
            if (titleEl) titleEl.textContent = loc.name;
            if (badgeEl) badgeEl.textContent = `${activeIdx + 1}/${SCENIC_LOCATIONS.length}`;
            if (tourIconEl) {
                tourIconEl.textContent = autoTourEnabled ? '●' : '↻';
                tourIconEl.classList.toggle('text-emerald-400', autoTourEnabled);
            }
            if (tourBtn) {
                tourBtn.classList.toggle('bg-pink-500/20', autoTourEnabled);
                tourBtn.classList.toggle('text-pink-300', autoTourEnabled);
            }
        }

        function setScenicLocation(idx, immediate = false) {
            const nextIdx = ((idx % SCENIC_LOCATIONS.length) + SCENIC_LOCATIONS.length) % SCENIC_LOCATIONS.length;
            if (nextIdx === currentScenicIdx && !immediate && !isCrossFading) return;

            if (immediate) {
                currentScenicIdx = nextIdx;
                targetScenicIdx = nextIdx;
                isCrossFading = false;
                crossFadeProg = 1.0;
                scenicMeshA.material.map = getScenicTexture(nextIdx);
                scenicMeshA.material.opacity = 1.0;
                scenicMeshB.material.opacity = 0.0;
                const loc = SCENIC_LOCATIONS[nextIdx];
                sunLight.color.setHex(loc.sunColor);
                sunLight.intensity = loc.sunIntensity;
                hemiLight.color.setHex(loc.hemiSky);
                hemiLight.groundColor.setHex(loc.hemiGround);
                if (dustMesh) dustMesh.material.color.setHex(loc.dustColor);
                sunbeamMat.color.setHex(loc.beamColor);
                sunbeamMat.opacity = loc.beamOpacity;
                windowFloorGlow.material.color.setHex(loc.floorGlowColor);
                windowFloorGlow.material.opacity = loc.floorGlowOpacity;
                redrawPlaque();
                updateScenicUI();
                return;
            }

            if (isCrossFading) {
                currentScenicIdx = targetScenicIdx;
                scenicMeshA.material.map = getScenicTexture(currentScenicIdx);
                scenicMeshA.material.opacity = 1.0;
            }

            targetScenicIdx = nextIdx;
            scenicMeshB.material.map = getScenicTexture(targetScenicIdx);
            scenicMeshB.material.opacity = 0.0;
            crossFadeProg = 0.0;
            isCrossFading = true;
            redrawPlaque();
            updateScenicUI();
        }

        // Initialize plaque and UI
        redrawPlaque();
        updateScenicUI();

        // Wire DOM HUD buttons
        const prevBtn = document.getElementById('scenic-prev-btn');
        const nextBtn = document.getElementById('scenic-next-btn');
        const labelBox = document.getElementById('scenic-label-container');
        const tourBtn = document.getElementById('scenic-tour-btn');

        if (prevBtn) prevBtn.addEventListener('click', (ev) => { ev.stopPropagation(); setScenicLocation(currentScenicIdx - 1); });
        if (nextBtn) nextBtn.addEventListener('click', (ev) => { ev.stopPropagation(); setScenicLocation(currentScenicIdx + 1); });
        if (labelBox) labelBox.addEventListener('click', (ev) => { ev.stopPropagation(); setScenicLocation(currentScenicIdx + 1); });
        if (tourBtn) tourBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            autoTourEnabled = !autoTourEnabled;
            updateScenicUI();
        });

        // Global Scenic API
        window.eduScenic = {
            getLocations: () => SCENIC_LOCATIONS,
            getCurrentIndex: () => currentScenicIdx,
            getCurrentLocation: () => SCENIC_LOCATIONS[currentScenicIdx],
            set: (i, imm) => setScenicLocation(i, imm),
            next: () => setScenicLocation(currentScenicIdx + 1),
            prev: () => setScenicLocation(currentScenicIdx - 1),
            toggleAutoTour: () => {
                autoTourEnabled = !autoTourEnabled;
                updateScenicUI();
                return autoTourEnabled;
            },
            isAutoTour: () => autoTourEnabled
        };
        window._debugScene = scene;
        window._debugScenic = { scenicGroup, scenicMeshA, scenicMeshB, scenicTextures, sunbeamGroup, glass };

        /* ---------------------------------------------------------
           SHARED EXECUTIVE FURNITURE SKIN (SMOKED WALNUT,
           CALACATTA MARBLE & BRUSHED BRASS)
        --------------------------------------------------------- */
        const walnutTex = canvasTexture(1024, 512, (ctx, w, h) => {
            const grad = ctx.createLinearGradient(0, 0, w, 0);
            grad.addColorStop(0, '#26160e');
            grad.addColorStop(0.3, '#351f15');
            grad.addColorStop(0.65, '#2c1910');
            grad.addColorStop(1, '#23140c');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
            const rand = seededRandom(108);
            for (let y = 0; y < h; y += 2) {
                const alpha = 0.03 + rand() * 0.05;
                ctx.fillStyle = rand() > 0.5 ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha * 1.6})`;
                const wave = Math.sin(y * 0.04) * 3 + Math.sin(y * 0.12) * 1.5;
                ctx.fillRect(0, y + wave, w, 1.8);
            }
        });

        const marbleTex = canvasTexture(1024, 512, (ctx, w, h) => {
            ctx.fillStyle = '#f7f4ee';
            ctx.fillRect(0, 0, w, h);
            const rand = seededRandom(240);
            const drawVein = (color, width, alpha) => {
                ctx.strokeStyle = color;
                ctx.lineWidth = width;
                ctx.globalAlpha = alpha;
                ctx.beginPath();
                let x = rand() * w * 0.4;
                let y = 0;
                ctx.moveTo(x, y);
                while (y < h) {
                    x += (rand() - 0.35) * 45;
                    y += 20 + rand() * 30;
                    ctx.lineTo(x, y);
                }
                ctx.stroke();
            };
            for (let i = 0; i < 6; i++) {
                drawVein('#574b42', 2.5 + rand() * 2, 0.15 + rand() * 0.15);
                drawVein('#b58d5a', 1.5 + rand() * 1.5, 0.18 + rand() * 0.15);
            }
            ctx.globalAlpha = 1.0;
        });

        const walnutMat = std(0x2d1a11, 0.55, 0.15, { map: walnutTex });
        const marbleMat = std(0xfaf7f2, 0.28, 0.08, { map: marbleTex });
        const credenzaBrassMat = std(0xd4a24c, 0.25, 0.90);
        const credenzaDarkMat = std(0x1a120c, 0.65, 0.10);

        /* ---------------------------------------------------------
           EXECUTIVE DESK WITH LED STRIP (MATCHING WALNUT & MARBLE SKIN)
        --------------------------------------------------------- */
        const desk = new THREE.Group();
        desk.position.set(0.2, 0, 0.25);
        scene.add(desk);

        // Walnut pedestal body + fluted front slats + brass plinth trim
        addMesh(new THREE.BoxGeometry(3.3, 0.94, 1.3), walnutMat, [0, 0.47, 0], desk);
        addMesh(new THREE.BoxGeometry(3.32, 0.04, 1.32), credenzaBrassMat, [0, 0.02, 0], desk, { cast: false });
        for (let sx = -1.45; sx <= 1.45; sx += 0.065) {
            addMesh(new THREE.BoxGeometry(0.028, 0.82, 0.014), credenzaDarkMat, [sx, 0.48, 0.657], desk, { cast: false });
        }
        // Calacatta marble executive tabletop + brass under-rim
        addMesh(new THREE.BoxGeometry(3.7, 0.09, 1.72), marbleMat, [0, 1.005, 0], desk);
        addMesh(new THREE.BoxGeometry(3.72, 0.014, 1.74), credenzaBrassMat, [0, 0.956, 0], desk, { cast: false });
        const ledMat = basic({ color: 0xffb066 });
        ledMatRef = ledMat;
        addMesh(new THREE.BoxGeometry(3.74, 0.025, 1.76), ledMat, [0, 0.945, 0], desk, { cast: false, receive: false });
        deskFloorGlowRef = glowPlane(6.4, 4.6, '255,160,80', 0.55, [0, 0.012, 0.05], [-Math.PI / 2, 0, 0], desk);
        const deskLight = new THREE.PointLight(0xffa24d, 1.25, 5.5, 2);
        deskLightRef = deskLight;
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
        monitor.position.set(-0.58, 1.05, -0.12);
        monitor.rotation.y = 0.32;
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

        /* ---------------------------------------------------------
           CUSTOM MECHANICAL KEYBOARD & ERGONOMIC MOUSE WITH DYNAMIC RGB
        --------------------------------------------------------- */
        // XL Desk Mat / Deskpad (1.14m x 0.44m) with glowing RGB optical fiber perimeter
        const deskMatBase = addMesh(new THREE.BoxGeometry(1.14, 0.005, 0.44), std(0x0e131d, 0.88, 0.08), [0.52, 1.053, -0.44], desk);
        const deskMatRgbMat = basic({ color: 0x00f0ff });
        // 4 perimeter fiber optic border segments
        addMesh(new THREE.BoxGeometry(1.146, 0.006, 0.006), deskMatRgbMat, [0.52, 1.055, -0.66], desk, { cast: false });
        addMesh(new THREE.BoxGeometry(1.146, 0.006, 0.006), deskMatRgbMat, [0.52, 1.055, -0.22], desk, { cast: false });
        addMesh(new THREE.BoxGeometry(0.006, 0.006, 0.44), deskMatRgbMat, [-0.05, 1.055, -0.44], desk, { cast: false });
        addMesh(new THREE.BoxGeometry(0.006, 0.006, 0.44), deskMatRgbMat, [1.09, 1.055, -0.44], desk, { cast: false });

        // Custom Mechanical Keyboard Group (Tilted at 6.3 degrees ergonomic typing angle)
        const kbGroup = new THREE.Group();
        kbGroup.position.set(0.28, 1.060, -0.45);
        kbGroup.rotation.x = 0.11; // 6.3 degree ergonomic slope
        desk.add(kbGroup);

        // CNC Milled Anodized Aluminum Bottom Case (Space Gray / Slate)
        addMesh(new THREE.BoxGeometry(0.60, 0.018, 0.22), std(0x181e28, 0.35, 0.65), [0, 0.009, 0], kbGroup);

        // Frosted Acrylic Underglow Diffuser (Dynamic RGB)
        const keyboardUnderglowRgbMat = basic({ color: 0x38bdf8 });
        addMesh(new THREE.BoxGeometry(0.606, 0.006, 0.226), keyboardUnderglowRgbMat, [0, 0.016, 0], kbGroup, { cast: false });

        // Top Aluminum Bezel / Integrated Plate
        addMesh(new THREE.BoxGeometry(0.60, 0.010, 0.22), std(0x121720, 0.4, 0.5), [0, 0.022, 0], kbGroup);

        // Sculpted Double-Shot Keycaps (5 Rows with per-row dynamic RGB illumination)
        const keyRowRgbMats = [];
        const keyCapMatDark = std(0x1f2937, 0.55, 0.1);
        const escKeyMat = basic({ color: 0xf43f5e }); // Cyberpunk Hot Pink Esc
        const enterKeyMat = basic({ color: 0x06b6d4 }); // Electric Cyan Accent Enter
        const spaceBarMat = std(0x334155, 0.5, 0.15);

        // Keycap row offsets (z coordinates from back to front)
        const rowZ = [-0.076, -0.038, 0.000, 0.038, 0.076];
        for (let r = 0; r < 5; r++) {
            const rowMat = basic({ color: 0x38bdf8 });
            keyRowRgbMats.push(rowMat);

            // Under-keycap RGB lighting strip for this row
            addMesh(new THREE.BoxGeometry(0.56, 0.003, 0.032), rowMat, [0, 0.027, rowZ[r]], kbGroup, { cast: false });

            // Keycaps for Row 0: Function Row (Esc key + F1-F12 segments)
            if (r === 0) {
                // Esc key
                addMesh(new THREE.BoxGeometry(0.040, 0.014, 0.028), escKeyMat, [-0.255, 0.034, rowZ[0]], kbGroup, { cast: false });
                // F-key blocks
                for (let k = 0; k < 3; k++) {
                    addMesh(new THREE.BoxGeometry(0.14, 0.013, 0.028), keyCapMatDark, [-0.13 + k * 0.165, 0.034, rowZ[0]], kbGroup, { cast: false });
                }
            } else if (r === 3) {
                // Home Row with Enter accent key
                addMesh(new THREE.BoxGeometry(0.46, 0.014, 0.032), keyCapMatDark, [-0.045, 0.034, rowZ[3]], kbGroup, { cast: false });
                // Neon Enter Key
                addMesh(new THREE.BoxGeometry(0.065, 0.014, 0.032), enterKeyMat, [0.245, 0.034, rowZ[3]], kbGroup, { cast: false });
            } else if (r === 4) {
                // Bottom Row: Modifiers, Sculpted Spacebar, Arrow Cluster
                // Left modifiers (Ctrl, Win, Alt)
                addMesh(new THREE.BoxGeometry(0.12, 0.014, 0.032), keyCapMatDark, [-0.215, 0.034, rowZ[4]], kbGroup, { cast: false });
                // Wide Custom Spacebar with center accent line
                addMesh(new THREE.BoxGeometry(0.24, 0.014, 0.032), spaceBarMat, [-0.015, 0.034, rowZ[4]], kbGroup, { cast: false });
                addMesh(new THREE.BoxGeometry(0.18, 0.004, 0.005), rowMat, [-0.015, 0.041, rowZ[4]], kbGroup, { cast: false });
                // Right modifiers & Arrow Cluster (Inverted-T)
                addMesh(new THREE.BoxGeometry(0.05, 0.014, 0.032), keyCapMatDark, [0.155, 0.034, rowZ[4]], kbGroup, { cast: false });
                addMesh(new THREE.BoxGeometry(0.07, 0.014, 0.032), enterKeyMat, [0.240, 0.034, rowZ[4]], kbGroup, { cast: false });
            } else {
                // Regular alphanumeric rows
                addMesh(new THREE.BoxGeometry(0.55, 0.014, 0.032), keyCapMatDark, [0, 0.034, rowZ[r]], kbGroup, { cast: false });
            }
        }

        // Custom Coiled Aviator Cable (from keyboard back into desk grommet)
        const cableMat = std(0x0f172a, 0.75, 0.1);
        const chromeMat = std(0xe2e8f0, 0.15, 0.95);
        // Short straight lead out of keyboard
        addMesh(new THREE.CylinderGeometry(0.004, 0.004, 0.07, 10), cableMat, [-0.15, 0.016, -0.14], kbGroup, { rot: [Math.PI / 2, 0, 0] });
        // Heavy Chrome Aviator Quick-Disconnect Coupling
        addMesh(new THREE.CylinderGeometry(0.010, 0.010, 0.028, 16), chromeMat, [-0.15, 0.016, -0.18], kbGroup, { rot: [Math.PI / 2, 0, 0] });
        // Coiled cable loops (spring coils)
        for (let c = 0; c < 7; c++) {
            addMesh(new THREE.TorusGeometry(0.014, 0.0035, 10, 18), cableMat, [-0.15 + (c - 3) * 0.008, 0.017, -0.22], kbGroup, { rot: [0, Math.PI / 2, 0] });
        }
        // Cable path to desk grommet
        addMesh(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 10), cableMat, [-0.15, 1.056, -0.73], desk, { rot: [Math.PI / 2, 0, 0] });
        // Brushed metal desk grommet ring
        addMesh(new THREE.TorusGeometry(0.022, 0.004, 12, 24), chromeMat, [-0.15, 1.054, -0.80], desk, { rot: [-Math.PI / 2, 0, 0] });

        // Ergonomic Gamer Mouse Group with RGB Perimeter Halo & Light Wheel
        const mouseGroup = new THREE.Group();
        mouseGroup.position.set(0.80, 1.054, -0.44);
        mouseGroup.rotation.y = -0.10; // Natural ergonomic resting angle
        desk.add(mouseGroup);

        const mouseBodyMat = std(0x181e28, 0.38, 0.35);
        const mouseAccentMat = std(0x0f172a, 0.65, 0.15);
        const mouseBaseRgbMat = basic({ color: 0x00f0ff });
        const mouseWheelRgbMat = basic({ color: 0x38bdf8 });
        const mouseLogoRgbMat = basic({ color: 0x38bdf8 });

        // Mouse Underglow Base Halo Strip (projects dynamic RGB neon directly onto mousepad)
        addMesh(new THREE.BoxGeometry(0.125, 0.005, 0.185), mouseBaseRgbMat, [0, 0.003, 0], mouseGroup, { cast: false });
        // Mouse Lower Chassis & Left Ergonomic Thumb Flare
        addMesh(new THREE.BoxGeometry(0.118, 0.018, 0.178), mouseBodyMat, [0, 0.014, 0], mouseGroup);
        // Left thumb rest wing
        addMesh(new THREE.BoxGeometry(0.026, 0.012, 0.11), mouseAccentMat, [-0.064, 0.008, 0.01], mouseGroup);
        // Dual side thumb buttons (Forward / Back)
        addMesh(new THREE.BoxGeometry(0.006, 0.007, 0.022), chromeMat, [-0.061, 0.020, -0.016], mouseGroup, { cast: false });
        addMesh(new THREE.BoxGeometry(0.006, 0.007, 0.022), chromeMat, [-0.061, 0.020, 0.014], mouseGroup, { cast: false });

        // Sculpted Ergonomic Palm Arch (Curved palm hump)
        const mousePalm = addMesh(new THREE.SphereGeometry(0.058, 20, 16), mouseBodyMat, [0.004, 0.024, 0.018], mouseGroup);
        mousePalm.scale.set(0.96, 0.52, 1.38);

        // Split Left & Right Click Paddles (with tactile center separation slit)
        addMesh(new THREE.BoxGeometry(0.052, 0.012, 0.075), mouseBodyMat, [-0.028, 0.026, -0.052], mouseGroup, { rot: [0.12, 0, 0] });
        addMesh(new THREE.BoxGeometry(0.052, 0.012, 0.075), mouseBodyMat, [0.032, 0.026, -0.052], mouseGroup, { rot: [0.12, 0, 0] });
        // Center slit between clickers
        addMesh(new THREE.BoxGeometry(0.004, 0.014, 0.078), mouseAccentMat, [0.002, 0.027, -0.052], mouseGroup, { rot: [0.12, 0, 0], cast: false });

        // Tactile RGB Scroll Wheel (Rubber ribbed outer tread + glowing RGB core)
        addMesh(new THREE.CylinderGeometry(0.014, 0.014, 0.006, 18), mouseWheelRgbMat, [0.002, 0.033, -0.050], mouseGroup, { rot: [0, 0, Math.PI / 2], cast: false });
        addMesh(new THREE.TorusGeometry(0.014, 0.003, 10, 20), std(0x111827, 0.9), [0.002, 0.033, -0.050], mouseGroup, { rot: [0, Math.PI / 2, 0] });

        // Illuminated RGB Palm Rest Logo
        addMesh(new THREE.PlaneGeometry(0.022, 0.022), mouseLogoRgbMat, [0.004, 0.043, 0.036], mouseGroup, { rot: [-Math.PI / 2.3, 0, 0], cast: false });

        // Executive notebook on desk left
        addMesh(new THREE.BoxGeometry(0.38, 0.02, 0.26), std(0x1e1f26, 0.8), [-1.15, 1.06, -0.38], desk, { rot: [0, 0.15, 0] });

        /* ---------------------------------------------------------
           ARTISANAL ESPRESSO COFFEE MUG & INDUCTION COASTER
           (Interactive Pressable Object → Dar Café a EduBot → Cámara Dinámica)
        --------------------------------------------------------- */
        const coffeeGroup = new THREE.Group();
        coffeeGroup.position.set(0.66, 1.052, -0.16);
        desk.add(coffeeGroup);

        // Thermal cyber coaster with chamfered rim & pulsing induction ring
        const coasterBase = addMesh(new THREE.CylinderGeometry(0.096, 0.098, 0.014, 32), std(0x161a22, 0.45, 0.4), [0, 0.007, 0], coffeeGroup, { station: 'coffee' });
        coasterBase.userData.isCoffee = true;
        const coasterGlowMat = basic({ color: 0xf59e0b });
        const coasterRing = addMesh(new THREE.CylinderGeometry(0.097, 0.097, 0.004, 32), coasterGlowMat, [0, 0.010, 0], coffeeGroup, { cast: false, station: 'coffee' });
        coasterRing.userData.isCoffee = true;
        // Induction status micro-LED
        addMesh(new THREE.SphereGeometry(0.0035, 10, 10), basic({ color: 0x38bdf8 }), [0, 0.014, 0.088], coffeeGroup, { cast: false });

        // Glazed Ceramic Coffee Mug (Obsidian Slate / Deep Executive Navy with smooth specular luster)
        const mugMat = std(0x192231, 0.22, 0.32);
        const mugInteriorMat = std(0x111722, 0.35, 0.2);

        // Outer flared mug body (open ended to reveal liquid surface)
        const mugMesh = addMesh(new THREE.CylinderGeometry(0.065, 0.054, 0.120, 32, 1, true), mugMat, [0, 0.071, 0], coffeeGroup, { station: 'coffee' });
        mugMesh.userData.isCoffee = true;

        // Rounded ergonomic cup rim / lip (gives high tactile smoothness)
        const mugLip = addMesh(new THREE.TorusGeometry(0.061, 0.005, 16, 32), mugMat, [0, 0.128, 0], coffeeGroup, { rot: [-Math.PI / 2, 0, 0], station: 'coffee' });
        mugLip.userData.isCoffee = true;

        // Recessed mug interior wall (open ended)
        const mugInterior = addMesh(new THREE.CylinderGeometry(0.057, 0.047, 0.114, 24, 1, true), mugInteriorMat, [0, 0.072, 0], coffeeGroup, { station: 'coffee' });
        mugInterior.userData.isCoffee = true;
        // Mug bottom base disc
        addMesh(new THREE.CircleGeometry(0.054, 24), mugMat, [0, 0.012, 0], coffeeGroup, { rot: [Math.PI / 2, 0, 0] });

        // Ergonomic C-Handle with smooth filleted attachments
        const mugHandle = addMesh(new THREE.TorusGeometry(0.038, 0.011, 14, 24, Math.PI * 1.35), mugMat, [0.066, 0.071, 0], coffeeGroup, { rot: [0, 0, -Math.PI / 2], station: 'coffee' });
        mugHandle.userData.isCoffee = true;
        // Upper & lower handle fillets
        addMesh(new THREE.SphereGeometry(0.012, 12, 12), mugMat, [0.060, 0.098, 0], coffeeGroup, { cast: false });
        addMesh(new THREE.SphereGeometry(0.012, 12, 12), mugMat, [0.058, 0.044, 0], coffeeGroup, { cast: false });

        // Golden Metallic Emblem on front of the mug (Embossed EC monogram crest)
        const goldEmblemMat = std(0xfbbf24, 0.15, 0.95);
        addMesh(new THREE.CylinderGeometry(0.016, 0.016, 0.003, 20), goldEmblemMat, [0, 0.072, 0.061], coffeeGroup, { rot: [Math.PI / 2, 0, 0] });
        addMesh(new THREE.TorusGeometry(0.020, 0.002, 10, 24), goldEmblemMat, [0, 0.072, 0.061], coffeeGroup, { rot: [0, 0, 0] });

        // Rich Espresso Crema Surface with Hand-Poured Barista Latte Art (512x512 Canvas)
        const latteArtTex = canvasTexture(512, 512, (ctx, w, h) => {
            const cx = w / 2;
            const cy = h / 2;
            const r = w / 2;

            // 1. Espresso base radial gradient with rich golden crema froth
            const grad = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
            grad.addColorStop(0.0, '#b87c47');
            grad.addColorStop(0.45, '#8c5224');
            grad.addColorStop(0.82, '#4a2510');
            grad.addColorStop(0.96, '#261207');
            grad.addColorStop(1.0, '#1a0d05');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
            ctx.fill();

            // 2. Delicate crema micro-bubbles along the cup rim
            ctx.fillStyle = 'rgba(215, 160, 105, 0.35)';
            for (let b = 0; b < 48; b++) {
                const angle = (b / 48) * Math.PI * 2 + Math.sin(b * 3) * 0.05;
                const dist = r * 0.88 + Math.sin(b * 7) * (r * 0.04);
                const bx = cx + Math.cos(angle) * dist;
                const by = cy + Math.sin(angle) * dist;
                ctx.beginPath();
                ctx.arc(bx, by, 2.5 + (b % 4), 0, Math.PI * 2);
                ctx.fill();
            }

            // 3. Delicate outer latte art milk rings (feathered pour layers)
            ctx.strokeStyle = 'rgba(253, 244, 227, 0.42)';
            ctx.lineWidth = 14;
            ctx.beginPath();
            ctx.arc(cx, cy - 10, r * 0.58, 0.25 * Math.PI, 0.75 * Math.PI, false);
            ctx.stroke();

            ctx.strokeStyle = 'rgba(253, 244, 227, 0.65)';
            ctx.lineWidth = 10;
            ctx.beginPath();
            ctx.arc(cx, cy - 5, r * 0.44, 0.22 * Math.PI, 0.78 * Math.PI, false);
            ctx.stroke();

            // 4. Barista Latte Art Heart (Ivory micro-foam with feathered edge)
            ctx.save();
            ctx.translate(cx, cy - 12);

            // Heart shadow / crema contour
            ctx.fillStyle = 'rgba(92, 48, 20, 0.4)';
            ctx.beginPath();
            ctx.moveTo(0, 52);
            ctx.bezierCurveTo(-58, 12, -75, -45, -34, -62);
            ctx.bezierCurveTo(-14, -68, -4, -48, 0, -32);
            ctx.bezierCurveTo(4, -48, 14, -68, 34, -62);
            ctx.bezierCurveTo(75, -45, 58, 12, 0, 52);
            ctx.fill();

            // Main creamy foam heart
            ctx.fillStyle = '#fff9ee';
            ctx.beginPath();
            ctx.moveTo(0, 48);
            ctx.bezierCurveTo(-54, 10, -70, -42, -32, -58);
            ctx.bezierCurveTo(-12, -64, -2, -45, 0, -30);
            ctx.bezierCurveTo(2, -45, 12, -64, 32, -58);
            ctx.bezierCurveTo(70, -42, 54, 10, 0, 48);
            ctx.fill();

            // Heart inner feathering
            ctx.fillStyle = 'rgba(247, 235, 214, 0.9)';
            ctx.beginPath();
            ctx.moveTo(0, 32);
            ctx.bezierCurveTo(-38, 4, -48, -32, -22, -44);
            ctx.bezierCurveTo(-8, -48, -2, -34, 0, -22);
            ctx.bezierCurveTo(2, -34, 8, -48, 22, -44);
            ctx.bezierCurveTo(48, -32, 38, 4, 0, 32);
            ctx.fill();

            // Center barista pour line (stem down the heart)
            ctx.strokeStyle = '#fffbf4';
            ctx.lineWidth = 5;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(0, -58);
            ctx.lineTo(0, 72);
            ctx.stroke();

            // Tiny droplet at tail
            ctx.fillStyle = '#fffbf4';
            ctx.beginPath();
            ctx.arc(0, 80, 5, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        });

        const coffeeLiquidMesh = addMesh(new THREE.CircleGeometry(0.056, 32), basic({ map: latteArtTex }), [0, 0.116, 0], coffeeGroup, { rot: [-Math.PI / 2, 0, 0], cast: false, station: 'coffee' });
        coffeeLiquidMesh.userData.isCoffee = true;

        // Procedural Steam Particle System (Silky soft vapor puffs)
        const steamTex = canvasTexture(64, 64, (ctx, w, h) => {
            const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
            grad.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
            grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.45)');
            grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.12)');
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
        });

        const steamCount = 24;
        const steamGeo = new THREE.BufferGeometry();
        const steamPositions = new Float32Array(steamCount * 3);
        const steamPhases = new Float32Array(steamCount);
        for (let i = 0; i < steamCount; i++) {
            steamPositions[i * 3] = (Math.random() - 0.5) * 0.045;
            steamPositions[i * 3 + 1] = 0.12 + Math.random() * 0.35;
            steamPositions[i * 3 + 2] = (Math.random() - 0.5) * 0.045;
            steamPhases[i] = Math.random() * Math.PI * 2;
        }
        steamGeo.setAttribute('position', new THREE.BufferAttribute(steamPositions, 3));
        const steamMat = new THREE.PointsMaterial({
            map: steamTex,
            size: 0.045,
            transparent: true,
            opacity: 0.50,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const steamPoints = new THREE.Points(steamGeo, steamMat);
        coffeeGroup.add(steamPoints);

        /* ---------------------------------------------------------
           EXECUTIVE CV / RESUME PAPER ON DESK (Interactive → Modo 2D)
        --------------------------------------------------------- */
        const cvPaperTex = canvasTexture(600, 848, (ctx, w, h) => {
            // Crisp premium white paper
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, w, h);

            // Subtle paper border
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 4;
            ctx.strokeRect(8, 8, w - 16, h - 16);

            // Top Header: Dark Executive Navy
            ctx.fillStyle = '#0f172a';
            ctx.fillRect(20, 20, w - 40, 120);

            // Cyan stripe accent
            ctx.fillStyle = '#38bdf8';
            ctx.fillRect(20, 136, w - 40, 4);

            // Monogram Badge
            ctx.fillStyle = '#1e293b';
            roundRect(ctx, 40, 36, 88, 88, 14);
            ctx.fill();
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.font = '900 36px "Plus Jakarta Sans", sans-serif';
            ctx.fillStyle = '#38bdf8';
            ctx.textAlign = 'center';
            ctx.fillText('EC', 84, 92);
            ctx.textAlign = 'left';

            // Title & Subtitles
            ctx.font = '800 28px "Plus Jakarta Sans", sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.fillText('EDUARDO CAYÚN M.', 148, 68);

            ctx.font = '700 15px "JetBrains Mono", monospace';
            ctx.fillStyle = '#38bdf8';
            ctx.fillText('MBA & LÍDER DE PROYECTOS TI', 148, 94);

            ctx.font = '500 13px "Inter", sans-serif';
            ctx.fillStyle = '#94a3b8';
            ctx.fillText('Cloud AWS/OCI · Ciberseguridad · IA · Santiago, CL', 148, 118);

            // Section 1: Perfil Ejecutivo
            ctx.font = '800 14px "JetBrains Mono", monospace';
            ctx.fillStyle = '#0f172a';
            ctx.fillText('01 // RESUMEN EJECUTIVO & DIRECCIÓN B2B', 36, 178);
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(36, 188);
            ctx.lineTo(w - 36, 188);
            ctx.stroke();

            ctx.font = '500 13px "Inter", sans-serif';
            ctx.fillStyle = '#334155';
            ctx.fillText('Líder estratégico con +15 años articulando tecnología de alta complejidad', 36, 212);
            ctx.fillText('y valor de negocio. Especialista en modernización del Estado, banca y utilities.', 36, 232);

            // Section 2: Experiencia Laboral
            ctx.font = '800 14px "JetBrains Mono", monospace';
            ctx.fillStyle = '#0f172a';
            ctx.fillText('02 // TRAYECTORIA LABORAL RECIENTE', 36, 278);
            ctx.beginPath();
            ctx.moveTo(36, 288);
            ctx.lineTo(w - 36, 288);
            ctx.stroke();

            const jobs = [
                ['Tierra Ayni Ltda. · Jefe de Proyectos & Ciberseguridad', '2018 - Presente', '#0284c7'],
                ['Sentra Software House · Ingeniero de Software (BCI, Falabella)', '2016 - 2018', '#6366f1'],
                ['L & E Inversiones · Analista de Arquitectura JEE (AWS)', '2016', '#059669'],
                ['Contraloría General (CGR) · Analista Programador SICA (Oracle)', '2012 - 2015', '#d97706'],
                ['Everis / NTT DATA · Consultor TI (SIGFE 2 - DIPRES)', '2010 - 2011', '#db2777']
            ];

            jobs.forEach(([title, period, col], i) => {
                const y = 314 + i * 44;
                ctx.fillStyle = col;
                ctx.beginPath();
                ctx.arc(44, y - 4, 4.5, 0, Math.PI * 2);
                ctx.fill();

                ctx.font = '700 13px "Inter", sans-serif';
                ctx.fillStyle = '#0f172a';
                ctx.fillText(title, 56, y);

                ctx.font = '600 11px "JetBrains Mono", monospace';
                ctx.fillStyle = '#64748b';
                ctx.fillText(period, 56, y + 17);
            });

            // Section 3: Credenciales & Certificaciones
            ctx.font = '800 14px "JetBrains Mono", monospace';
            ctx.fillStyle = '#0f172a';
            ctx.fillText('03 // CREDENCIALES & FORMACIÓN', 36, 552);
            ctx.beginPath();
            ctx.moveTo(36, 562);
            ctx.lineTo(w - 36, 562);
            ctx.stroke();

            const creds = [
                'MBA (Magíster en Dirección de Empresas)',
                'Ingeniería en Informática · UDLA',
                'MIT Professional Education (2025-2026)',
                'ISC2 Certified in Cybersecurity (CC)',
                'Top 8 IA Generativa (Google & Alura)',
                'Oracle OCI Certified & AWS Cloud Architect'
            ];

            creds.forEach((c, i) => {
                const col = i % 2;
                const row = Math.floor(i / 2);
                const x = 36 + col * 268;
                const y = 588 + row * 26;
                ctx.fillStyle = '#38bdf8';
                ctx.fillRect(x, y - 9, 6, 6);
                ctx.font = '600 12px "Inter", sans-serif';
                ctx.fillStyle = '#1e293b';
                ctx.fillText(c, x + 14, y);
            });

            // Bottom CTA Banner (High Visibility Action)
            const btnY = h - 120;
            const g = ctx.createLinearGradient(32, btnY, w - 32, btnY + 76);
            g.addColorStop(0, '#0284c7');
            g.addColorStop(1, '#0369a1');
            ctx.fillStyle = g;
            roundRect(ctx, 32, btnY, w - 64, 76, 18);
            ctx.fill();
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.font = '800 21px "JetBrains Mono", monospace';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText('📄 CLIC AQUÍ · VER EN MODO 2D ↗', w / 2, btnY + 46);
            ctx.textAlign = 'left';
        });

        // 3D Paper Mesh Stack on Desk (Positioned far forward from the robot on the visitor side of the desk)
        const cvGroup = new THREE.Group();
        cvGroup.position.set(-0.25, 1.052, 0.46);
        cvGroup.rotation.y = 0.08;
        desk.add(cvGroup);

        // Lower sheets for physical 3D paper stack thickness
        addMesh(new THREE.BoxGeometry(0.302, 0.002, 0.422), std(0xe2e8f0, 0.9, 0.0), [0.002, 0.001, 0.002], cvGroup, { rot: [0, -0.02, 0], cast: false });
        addMesh(new THREE.BoxGeometry(0.301, 0.002, 0.421), std(0xf1f5f9, 0.9, 0.0), [-0.002, 0.002, -0.001], cvGroup, { rot: [0, 0.03, 0], cast: false });

        // Top printed CV sheet
        const cvMesh = addMesh(new THREE.PlaneGeometry(0.30, 0.42), basic({ map: cvPaperTex }), [0, 0.0035, 0], cvGroup, {
            rot: [-Math.PI / 2, 0, 0],
            station: 'cv',
            cast: false
        });
        cvMesh.userData.isCVPaper = true;

        // Interactive Luminous Cyan Aura under the paper
        glowPlane(0.52, 0.64, '56,189,248', 0.28, [0, 0.004, 0], [-Math.PI / 2, 0, 0], cvGroup);

        // Sleek Executive Pen on desk next to the document
        const pen = new THREE.Group();
        pen.position.set(0.18, 0.006, 0.05);
        pen.rotation.y = 0.22;
        cvGroup.add(pen);
        addMesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.16, 16), std(0x0f172a, 0.25, 0.9), [0, 0, 0], pen, { rot: [Math.PI / 2, 0, 0], cast: false });
        addMesh(new THREE.CylinderGeometry(0.0046, 0.0046, 0.05, 16), std(0xf59e0b, 0.2, 0.95), [0, 0, -0.05], pen, { rot: [Math.PI / 2, 0, 0], cast: false });
        addMesh(new THREE.BoxGeometry(0.002, 0.004, 0.04), std(0xf59e0b, 0.2, 0.95), [0.005, 0.003, -0.05], pen, { cast: false });

        // Phone → CONTACTO (Nothing-OS Dark Flagship Edition - Realistic High-End Unibody)
        function createRoundedRectShape(w, h, r) {
            const shape = new THREE.Shape();
            const x0 = -w / 2;
            const y0 = -h / 2;
            const radius = Math.min(r, w / 2, h / 2);

            shape.moveTo(x0 + radius, y0);
            shape.lineTo(x0 + w - radius, y0);
            shape.absarc(x0 + w - radius, y0 + radius, radius, -Math.PI / 2, 0, false);
            shape.lineTo(x0 + w, y0 + h - radius);
            shape.absarc(x0 + w - radius, y0 + h - radius, radius, 0, Math.PI / 2, false);
            shape.lineTo(x0 + radius, y0 + h);
            shape.absarc(x0 + radius, y0 + h - radius, radius, Math.PI / 2, Math.PI, false);
            shape.lineTo(x0, y0 + radius);
            shape.absarc(x0 + radius, y0 + radius, radius, Math.PI, Math.PI * 1.5, false);

            return shape;
        }

        function normalizeShapeUVs(geom) {
            geom.computeBoundingBox();
            const bb = geom.boundingBox;
            const dx = Math.max(0.0001, bb.max.x - bb.min.x);
            const dy = Math.max(0.0001, bb.max.y - bb.min.y);
            const uvAttr = geom.attributes.uv;
            const posAttr = geom.attributes.position;
            if (!uvAttr || !posAttr) return;
            for (let i = 0; i < posAttr.count; i++) {
                const u = (posAttr.getX(i) - bb.min.x) / dx;
                const v = (posAttr.getY(i) - bb.min.y) / dy;
                uvAttr.setXY(i, u, v);
            }
            uvAttr.needsUpdate = true;
        }

        const BITMAPS_5X7 = {
            '0': [1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1],
            '1': [0, 0, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 0],
            '2': [1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1],
            '3': [1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
            '4': [1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
            '5': [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
            '6': [1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1],
            '7': [1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0],
            '8': [1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1],
            '9': [1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]
        };

        const phoneTex = canvasTexture(768, 1536, (ctx, w, h) => {
            // Clip to rounded display corners
            ctx.save();
            roundRect(ctx, 0, 0, w, h, 68);
            ctx.clip();

            // Dark obsidian screen background
            ctx.fillStyle = '#080a12';
            ctx.fillRect(0, 0, w, h);

            // Subtle dot-matrix pattern
            ctx.fillStyle = 'rgba(255, 255, 255, 0.055)';
            for (let x = 24; x < w; x += 32) {
                for (let y = 24; y < h; y += 32) {
                    ctx.fillRect(x, y, 2.5, 2.5);
                }
            }

            // Top Status Bar
            ctx.font = '600 24px "JetBrains Mono", monospace';
            ctx.fillStyle = '#e2e8f0';
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
            ctx.fillText(timeStr, 48, 56);

            // Cellular signal bars
            ctx.fillStyle = '#cbd5e1';
            for (let b = 0; b < 4; b++) {
                ctx.fillRect(592 + b * 9, 54 - (b + 1) * 6, 6, (b + 1) * 6);
            }
            // 5G icon
            ctx.font = '700 18px "JetBrains Mono", monospace';
            ctx.fillStyle = '#94a3b8';
            ctx.fillText('5G', 638, 54);

            // Battery icon
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 2;
            roundRect(ctx, 672, 36, 44, 22, 5);
            ctx.stroke();
            ctx.fillStyle = '#34d399';
            roundRect(ctx, 676, 40, 30, 14, 3);
            ctx.fill();
            ctx.fillStyle = '#cbd5e1';
            ctx.fillRect(716, 42, 4, 10);

            // Pixel Dot-Matrix Clock
            const digits = [
                timeStr.charAt(0) || '0',
                timeStr.charAt(1) || '0',
                timeStr.charAt(3) || '0',
                timeStr.charAt(4) || '0'
            ];

            const dotSize = 13.0;
            const dotGap = 5.5;
            const digitW = 5 * (dotSize + dotGap) - dotGap;
            const colonW = 24;
            const digitSpacing = 22;
            const totalClockW = digitW * 4 + colonW + digitSpacing * 2;
            const startClockX = (w - totalClockW) / 2;
            const clockY = 96;

            function drawPixelDigit(char, px, py) {
                const pat = BITMAPS_5X7[char] || BITMAPS_5X7['0'];
                for (let r = 0; r < 7; r++) {
                    for (let c = 0; c < 5; c++) {
                        const isLit = pat[r * 5 + c] === 1;
                        if (isLit) {
                            ctx.fillStyle = '#ffffff';
                            ctx.shadowColor = 'rgba(255, 255, 255, 0.55)';
                            ctx.shadowBlur = 10;
                            roundRect(ctx, px + c * (dotSize + dotGap), py + r * (dotSize + dotGap), dotSize, dotSize, 2.5);
                            ctx.fill();
                            ctx.shadowBlur = 0;
                        } else {
                            ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
                            roundRect(ctx, px + c * (dotSize + dotGap), py + r * (dotSize + dotGap), dotSize, dotSize, 2.5);
                            ctx.fill();
                        }
                    }
                }
            }

            drawPixelDigit(digits[0], startClockX, clockY);
            drawPixelDigit(digits[1], startClockX + digitW + digitSpacing, clockY);

            // Glowing Colon
            const colonX = startClockX + (digitW + digitSpacing) * 2;
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = 'rgba(255, 255, 255, 0.55)';
            ctx.shadowBlur = 10;
            roundRect(ctx, colonX + 6, clockY + 28, dotSize, dotSize, 2.5);
            ctx.fill();
            roundRect(ctx, colonX + 6, clockY + 76, dotSize, dotSize, 2.5);
            ctx.fill();
            ctx.shadowBlur = 0;

            drawPixelDigit(digits[2], colonX + colonW, clockY);
            drawPixelDigit(digits[3], colonX + colonW + digitW + digitSpacing, clockY);

            // Subtitle: ● CLT · SANTIAGO
            ctx.fillStyle = '#f472b6';
            ctx.beginPath();
            ctx.arc(w / 2 - 105, 252, 6, 0, Math.PI * 2);
            ctx.fill();

            ctx.font = '700 22px "JetBrains Mono", monospace';
            ctx.fillStyle = '#94a3b8';
            ctx.textAlign = 'center';
            ctx.fillText('CLT · SANTIAGO', w / 2 + 10, 259);
            ctx.textAlign = 'left';

            // Identity Header (Nothing OS Tech Style)
            ctx.font = '800 38px "Plus Jakarta Sans", sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.fillText('Eduardo Cayún M.', 44, 320);

            ctx.font = '600 21px "Inter", sans-serif';
            ctx.fillStyle = '#94a3b8';
            ctx.fillText('MBA & Líder TI · Consultoría B2B & Cloud', 44, 356);

            const cardW = w - 88; // 680px wide
            const padX = 44;

            // Widget 1: Direct Contact / Email Card (Agrandado & Taller: y = 390 .. 590)
            const c1Y = 390;
            const c1H = 200;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.055)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
            ctx.lineWidth = 1.5;
            roundRect(ctx, padX, c1Y, cardW, c1H, 28);
            ctx.fill();
            ctx.stroke();

            // Inner badge & labels
            ctx.font = '700 18px "JetBrains Mono", monospace';
            ctx.fillStyle = '#64748b';
            ctx.fillText('✉  CONTACTO DIRECTO', padX + 28, c1Y + 44);

            // Emerald status badge
            ctx.fillStyle = '#34d399';
            ctx.beginPath();
            ctx.arc(padX + cardW - 130, c1Y + 39, 5.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.font = '700 15px "JetBrains Mono", monospace';
            ctx.fillStyle = '#34d399';
            ctx.fillText('DISPONIBLE', padX + cardW - 116, c1Y + 44);

            // Email text (large, high contrast)
            ctx.font = '800 32px "JetBrains Mono", monospace';
            ctx.fillStyle = '#ffffff';
            ctx.fillText('eduasesorti@gmail.com', padX + 28, c1Y + 104);

            ctx.font = '500 19px "Inter", sans-serif';
            ctx.fillStyle = '#94a3b8';
            ctx.fillText('Liderazgo Estratégico · Ciberseguridad · IA Cloud', padX + 28, c1Y + 152);

            // Right action arrow
            ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.beginPath();
            ctx.arc(padX + cardW - 46, c1Y + 104, 24, 0, Math.PI * 2);
            ctx.fill();
            ctx.font = '700 20px "Inter", sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText('↗', padX + cardW - 46, c1Y + 111);
            ctx.textAlign = 'left';

            // Widget 2: Split Row - GitHub & LinkedIn Widgets (Agrandados: y = 614 .. 844)
            const c2Y = 614;
            const c2H = 230;
            const colW = (cardW - 20) / 2; // 330px each

            // GitHub Card (Left)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.055)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
            ctx.lineWidth = 1.5;
            roundRect(ctx, padX, c2Y, colW, c2H, 28);
            ctx.fill();
            ctx.stroke();

            // GitHub Header
            ctx.font = '800 22px "JetBrains Mono", monospace';
            ctx.fillStyle = '#a855f7';
            ctx.fillText('</>', padX + 26, c2Y + 48);
            ctx.font = '700 17px "JetBrains Mono", monospace';
            ctx.fillStyle = '#64748b';
            ctx.fillText('GITHUB', padX + 72, c2Y + 47);

            // Corner indicator dot
            ctx.fillStyle = '#a855f7';
            ctx.beginPath();
            ctx.arc(padX + colW - 32, c2Y + 44, 5, 0, Math.PI * 2);
            ctx.fill();

            // Username
            ctx.font = '800 30px "JetBrains Mono", monospace';
            ctx.fillStyle = '#ffffff';
            ctx.fillText('@educhile1', padX + 26, c2Y + 118);

            ctx.font = '500 17px "Inter", sans-serif';
            ctx.fillStyle = '#94a3b8';
            ctx.fillText('Proyectos & Arquitecturas', padX + 26, c2Y + 160);

            // Action chip
            ctx.fillStyle = 'rgba(168, 85, 247, 0.14)';
            roundRect(ctx, padX + 26, c2Y + 182, 172, 30, 8);
            ctx.fill();
            ctx.font = '700 13px "JetBrains Mono", monospace';
            ctx.fillStyle = '#c084fc';
            ctx.fillText('REPOSITORIOS ↗', padX + 38, c2Y + 202);

            // LinkedIn Card (Right)
            const c2RightX = padX + colW + 20;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.055)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
            roundRect(ctx, c2RightX, c2Y, colW, c2H, 28);
            ctx.fill();
            ctx.stroke();

            // LinkedIn Header
            ctx.fillStyle = '#0284c7';
            roundRect(ctx, c2RightX + 26, c2Y + 30, 28, 24, 6);
            ctx.fill();
            ctx.font = '900 16px "Plus Jakarta Sans", sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.fillText('in', c2RightX + 33, c2Y + 47);

            ctx.font = '700 17px "JetBrains Mono", monospace';
            ctx.fillStyle = '#64748b';
            ctx.fillText('LINKEDIN', c2RightX + 66, c2Y + 47);

            // Corner indicator dot
            ctx.fillStyle = '#38bdf8';
            ctx.beginPath();
            ctx.arc(c2RightX + colW - 32, c2Y + 44, 5, 0, Math.PI * 2);
            ctx.fill();

            // Username
            ctx.font = '800 27px "JetBrains Mono", monospace';
            ctx.fillStyle = '#ffffff';
            ctx.fillText('/in/eduardocayun', c2RightX + 26, c2Y + 118);

            ctx.font = '500 17px "Inter", sans-serif';
            ctx.fillStyle = '#94a3b8';
            ctx.fillText('Red Ejecutiva Senior', c2RightX + 26, c2Y + 160);

            // Action chip
            ctx.fillStyle = 'rgba(2, 132, 199, 0.16)';
            roundRect(ctx, c2RightX + 26, c2Y + 182, 160, 30, 8);
            ctx.fill();
            ctx.font = '700 13px "JetBrains Mono", monospace';
            ctx.fillStyle = '#38bdf8';
            ctx.fillText('CONECTAR B2B ↗', c2RightX + 38, c2Y + 202);

            // Widget 3: THE SIGNATURE PINK CARD (Awwwards Highlight - Agrandado: y = 868 .. 1158)
            const c3Y = 868;
            const c3H = 290;
            const pinkGrad = ctx.createLinearGradient(padX, c3Y, padX + cardW, c3Y + c3H);
            pinkGrad.addColorStop(0, '#f472b6');
            pinkGrad.addColorStop(1, '#fb7185');
            ctx.fillStyle = pinkGrad;
            roundRect(ctx, padX, c3Y, cardW, c3H, 36);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Status pill inside pink card
            ctx.fillStyle = 'rgba(15, 23, 42, 0.16)';
            roundRect(ctx, padX + 32, c3Y + 32, 280, 36, 18);
            ctx.fill();
            ctx.font = '800 15px "JetBrains Mono", monospace';
            ctx.fillStyle = '#0f172a';
            ctx.fillText('● DISPONIBILIDAD INMEDIATA (30 MIN)', padX + 46, c3Y + 56);

            // Main meet cal title (Huge, bold, impactful)
            ctx.font = '800 44px "JetBrains Mono", monospace';
            ctx.fillStyle = '#0f172a';
            ctx.fillText('agendar_meet.cal', padX + 32, c3Y + 128);

            ctx.font = '600 23px "Inter", sans-serif';
            ctx.fillStyle = '#1e293b';
            ctx.fillText('Reservar videollamada directa con Eduardo', padX + 32, c3Y + 172);

            ctx.font = '500 18px "Inter", sans-serif';
            ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
            ctx.fillText('Consultoría Estratégica B2B · Evaluación de Proyectos & Cloud', padX + 32, c3Y + 224);

            // Big dark circular button with arrow inside pink card
            const circleBtnX = padX + cardW - 74;
            const circleBtnY = c3Y + 126;
            ctx.fillStyle = '#0f172a';
            ctx.beginPath();
            ctx.arc(circleBtnX, circleBtnY, 48, 0, Math.PI * 2);
            ctx.fill();

            ctx.font = '800 40px "Inter", sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText('↗', circleBtnX, circleBtnY + 14);
            ctx.textAlign = 'left';

            // Bottom App Dock (4 Big Circular Touch Buttons: y = 1200 .. 1380)
            const dockIcons = [
                { icon: '✉', label: 'Email', color: '#38bdf8' },
                { icon: '📅', label: 'Meet', color: '#f472b6' },
                { icon: '💼', label: 'LinkedIn', color: '#0284c7' },
                { icon: '🎵', label: 'Música', color: '#1ed760' }
            ];
            const dockStep = cardW / 4;
            dockIcons.forEach((item, i) => {
                const cx = padX + dockStep * i + dockStep / 2;
                const cy = 1270;
                const btnR = 48; // Big 96px diameter touch target!

                // Outer glass ring
                ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
                ctx.lineWidth = 1.8;
                ctx.beginPath();
                ctx.arc(cx, cy, btnR, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                // Inner glow accent
                ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
                ctx.beginPath();
                ctx.arc(cx, cy, btnR - 4, 0, Math.PI * 2);
                ctx.fill();

                // Icon
                ctx.font = '34px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(item.icon, cx, cy + 11);

                // Small micro-label below icon
                ctx.font = '700 13px "JetBrains Mono", monospace';
                ctx.fillStyle = '#94a3b8';
                ctx.fillText(item.label, cx, cy + btnR + 24);
            });
            ctx.textAlign = 'left';

            // Home Indicator Bar (Agrandada & centrada)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            roundRect(ctx, (w - 260) / 2, 1450, 260, 9, 4.5);
            ctx.fill();

            ctx.restore();
        });

        // Sleek obsidian charging pad on desk surface (Rounded aesthetic)
        const padShape = createRoundedRectShape(0.32, 0.58, 0.04);
        const padGeom = new THREE.ShapeGeometry(padShape, 24);
        padGeom.center();
        addMesh(padGeom, std(0x0c0e18, 0.8, 0.25), [1.24, 1.051, -0.25], desk, { rot: [-Math.PI / 2, 0, -0.25], cast: false });
        const padRimShape = createRoundedRectShape(0.328, 0.588, 0.042);
        const padRimGeom = new THREE.ShapeGeometry(padRimShape, 24);
        padRimGeom.center();
        addMesh(padRimGeom, std(0x222738, 0.5, 0.7), [1.24, 1.0505, -0.25], desk, { rot: [-Math.PI / 2, 0, -0.25], cast: false });
        // Tiny status LED on charging pad
        addMesh(new THREE.BoxGeometry(0.012, 0.006, 0.012), basic({ color: 0x34d399 }), [1.17, 1.053, 0.01], desk, { rot: [0, -0.25, 0], cast: false });

        const phone = new THREE.Group();
        phone.position.set(1.24, 1.05, -0.25);
        phone.rotation.y = -0.25;
        desk.add(phone);

        const phoneState = {
            restPos: new THREE.Vector3(1.24, 1.05, -0.25),
            restRot: new THREE.Vector3(0, -0.25, 0),
            liftedPos: new THREE.Vector3(1.24, 1.50, -0.05),
            liftedRot: new THREE.Vector3(Math.PI * 0.47, 0, 0),
            liftProgress: 0
        };

        // Realistic Unibody Titanium/Obsidian Chassis with Rounded Corners & Bevel
        const bodyShape = createRoundedRectShape(0.28, 0.54, 0.034);
        const extrudeSettings = {
            depth: 0.016,
            bevelEnabled: true,
            bevelSegments: 4,
            steps: 1,
            bevelSize: 0.003,
            bevelThickness: 0.003
        };
        const chassisGeom = new THREE.ExtrudeGeometry(bodyShape, extrudeSettings);
        chassisGeom.center();
        const chassisMat = std(0x121520, 0.28, 0.85);
        const chassisMesh = new THREE.Mesh(chassisGeom, chassisMat);
        chassisMesh.rotation.x = -Math.PI / 2;
        chassisMesh.castShadow = true;
        chassisMesh.receiveShadow = true;
        chassisMesh.userData.stationId = 'contact';
        hitMeshes.push(chassisMesh);
        phone.add(chassisMesh);

        // Screen Display with Matching Rounded Corners
        const screenShape = createRoundedRectShape(0.264, 0.524, 0.026);
        const screenGeom = new THREE.ShapeGeometry(screenShape, 24);
        screenGeom.center();
        normalizeShapeUVs(screenGeom);
        const screenMat = basic({ map: phoneTex });
        const phoneScreenMesh = new THREE.Mesh(screenGeom, screenMat);
        phoneScreenMesh.rotation.x = -Math.PI / 2;
        phoneScreenMesh.position.set(0, 0.0116, 0);
        phoneScreenMesh.userData.stationId = 'contact';
        phoneScreenMesh.userData.isPhoneScreen = true;
        hitMeshes.push(phoneScreenMesh);
        phone.add(phoneScreenMesh);

        // Reflective Protective Screen Glass Layer (adds authentic realistic specular glare)
        const glassGeom = new THREE.ShapeGeometry(screenShape, 24);
        glassGeom.center();
        const glassMat = std(0xffffff, 0.05, 0.2, {
            transparent: true,
            opacity: 0.12,
            depthWrite: false
        });
        const glassMesh = new THREE.Mesh(glassGeom, glassMat);
        glassMesh.rotation.x = -Math.PI / 2;
        glassMesh.position.set(0, 0.0119, 0);
        phone.add(glassMesh);

        // Realistic Punch-Hole Front Camera Lens with Anti-Reflective Glint
        addMesh(new THREE.RingGeometry(0.007, 0.011, 24), std(0x2d3345, 0.2, 0.9), [0, 0.0121, -0.218], phone, { rot: [-Math.PI / 2, 0, 0], cast: false });
        addMesh(new THREE.CircleGeometry(0.007, 24), std(0x04060d, 0.1, 0.4), [0, 0.0121, -0.218], phone, { rot: [-Math.PI / 2, 0, 0], cast: false });
        addMesh(new THREE.CircleGeometry(0.002, 12), basic({ color: 0x818cf8 }), [0.002, 0.0122, -0.219], phone, { rot: [-Math.PI / 2, 0, 0], cast: false });

        // Micro Earpiece Speaker Grille (Top edge)
        addMesh(new THREE.BoxGeometry(0.046, 0.002, 0.003), std(0x060810, 0.9, 0.1), [0, 0.0118, -0.252], phone, { cast: false });

        // Physical Side Buttons
        addMesh(new THREE.BoxGeometry(0.005, 0.009, 0.065), std(0x475569, 0.25, 0.9), [0.144, 0, -0.05], phone, { cast: false });
        addMesh(new THREE.BoxGeometry(0.005, 0.009, 0.045), std(0x475569, 0.25, 0.9), [-0.144, 0, -0.07], phone, { cast: false });
        addMesh(new THREE.BoxGeometry(0.005, 0.009, 0.045), std(0x475569, 0.25, 0.9), [-0.144, 0, -0.015], phone, { cast: false });

        // Back Dual Camera Island
        addMesh(new THREE.CylinderGeometry(0.024, 0.024, 0.005, 24), std(0x1a1e2d, 0.2, 0.8), [-0.075, -0.0135, -0.17], phone);
        addMesh(new THREE.CylinderGeometry(0.024, 0.024, 0.005, 24), std(0x1a1e2d, 0.2, 0.8), [-0.075, -0.0135, -0.11], phone);
        addMesh(new THREE.CylinderGeometry(0.016, 0.016, 0.006, 24), std(0x05070e, 0.05, 0.2), [-0.075, -0.0138, -0.17], phone);
        addMesh(new THREE.CylinderGeometry(0.016, 0.016, 0.006, 24), std(0x05070e, 0.05, 0.2), [-0.075, -0.0138, -0.11], phone);
        addMesh(new THREE.CylinderGeometry(0.007, 0.007, 0.002, 16), std(0xffffff, 0.2, 0.1), [-0.035, -0.012, -0.14], phone);

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
        lampLightRef = lampLight;
        lampLight.position.set(0.72, 0.8, 0);
        lamp.add(lampLight);
        glowPlane(1.6, 1.6, '255,150,200', 0.35, [0.85, 0.008, 0.05], [-Math.PI / 2, 0, 0], lamp);

        /* ---------------------------------------------------------
           AVATAR ROBOT AT DESK (clickable → Perfil)
        --------------------------------------------------------- */
        const chair = new THREE.Group();
        chair.position.set(0.50, 0, -0.86);
        scene.add(chair);
        const chairMat = std(0x18191f, 0.6, 0.2);
        addMesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 20), std(0x0f1014, 0.5, 0.5), [0, 0.06, 0], chair);
        addMesh(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 10), std(0x2a2b31, 0.4, 0.6), [0, 0.35, 0], chair);
        addMesh(new THREE.BoxGeometry(0.85, 0.12, 0.8), chairMat, [0, 0.68, 0], chair);
        addMesh(new THREE.BoxGeometry(0.85, 1.0, 0.12), chairMat, [0, 1.2, -0.42], chair);

        /* ---------------------------------------------------------
           3D ROBOT ASSISTANT: EDUBOT WITH DYNAMIC VISOR & HUD BUBBLE
        --------------------------------------------------------- */
        const EDUBOT_TIPS = [
            {
                badge: '🤖 RESUMEN EJECUTIVO',
                text: '¡Hola! Soy <strong>EduBot</strong>, copiloto de este espacio. Eduardo cuenta con <strong>+15 años de liderazgo en TI</strong>, dirigiendo proyectos de alta complejidad y arquitecturas de misión crítica en Chile, Paraguay y Uruguay.'
            },
            {
                badge: '💡 MBA & VISIÓN ESTRATÉGICA',
                text: 'Eduardo combina <strong>visión ejecutiva</strong> con capacidad técnica profunda: <strong>Executive MBA</strong>, certificaciones Cloud AWS, Databricks y especialización en Ciberseguridad por el MIT.'
            },
            {
                badge: '🏛️ SECTORES DE IMPACTO',
                text: 'Ha dirigido proyectos de alta complejidad para <strong>BancoEstado, BCI, Chilquinta, Gasvalpo, Entel</strong> y la <strong>Contraloría General de la República</strong>.'
            },
            {
                badge: '📅 REUNIÓN DIRECTA',
                text: '¿Tienes un desafío tecnológico? Puedes <strong>agendar una videollamada de 30 min</strong> haciendo clic en el smartphone del escritorio o en el botón "Agendar".'
            },
            {
                badge: '🕹️ RETRO ARCADE',
                text: '¿Quieres un break? A mi derecha tienes la <strong>máquina arcade</strong> para jugar <strong>Edu Tetris</strong> con banda sonora chiptune/synthwave exclusiva.'
            },
            {
                badge: '🎵 MODO FIESTA',
                text: '¡Me encanta la música! Haz clic en la <strong>tornamesa con vinilo</strong> o en el botón verde de Spotify para activar la bola disco, las luces de concierto ¡y me pondré a bailar!'
            }
        ];

        let currentTipIdx = 0;
        let isGreetingActive = false;
        let greetingStartTime = 0;
        const GREETING_DURATION = 4000;
        let dismissTimer = null;
        let lastFaceExpr = '';
        let lastFaceBlink = false;

        // Dynamic 2D Canvas for Robot Visor Face Expression
        const faceCanvas = document.createElement('canvas');
        faceCanvas.width = 512;
        faceCanvas.height = 384;
        const faceCtx = faceCanvas.getContext('2d');

        function drawFace(expr, blinking, beatVal) {
            const ctx = faceCtx;
            const w = 512;
            const h = 384;

            ctx.clearRect(0, 0, w, h);

            // Visor dark background
            ctx.fillStyle = '#070b16';
            ctx.fillRect(0, 0, w, h);

            // Subtle cyber tech inner border
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.18)';
            ctx.lineWidth = 4;
            ctx.strokeRect(8, 8, w - 16, h - 16);

            const isHappyOrDancing = expr === 'happy' || expr === 'dancing' || expr === 'welcome';
            const isStretch = expr === 'stretch';
            const isLove = expr === 'love';
            const isGaze = expr === 'gaze';
            const isTurbo = expr === 'turbo';
            const eyeColor = isTurbo ? '#fde047' : (isLove ? '#f43f5e' : (isGaze ? '#fbbf24' : ((expr === 'dancing' && (beatVal || 0) > 0.45) ? '#f472b6' : '#00f0ff')));

            if (isTurbo) {
                // Cheeks glow gold
                ctx.save();
                ctx.fillStyle = 'rgba(250, 204, 21, 0.75)';
                ctx.shadowColor = '#facc15';
                ctx.shadowBlur = 22;
                ctx.beginPath();
                ctx.ellipse(130, 260, 32, 16, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.ellipse(382, 260, 32, 16, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();

                // Electric lightning bolt eyes ⚡ ⚡
                ctx.save();
                ctx.fillStyle = '#fde047';
                ctx.shadowColor = '#facc15';
                ctx.shadowBlur = 24;

                function drawLightning(cx, cy, s) {
                    ctx.save();
                    ctx.translate(cx, cy);
                    ctx.scale(s, s);
                    ctx.beginPath();
                    ctx.moveTo(10, -30);
                    ctx.lineTo(-14, 0);
                    ctx.lineTo(2, 4);
                    ctx.lineTo(-8, 30);
                    ctx.lineTo(16, -2);
                    ctx.lineTo(0, -6);
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                }

                drawLightning(152, 175, 1.25);
                drawLightning(360, 175, 1.25);
                ctx.restore();

                // Energetic open laughing mouth
                ctx.save();
                ctx.strokeStyle = '#f472b6';
                ctx.shadowColor = '#f472b6';
                ctx.shadowBlur = 16;
                ctx.lineWidth = 9;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.arc(256, 260, 34, 0, Math.PI, false);
                ctx.stroke();
                ctx.restore();
                return;
            }

            // Cheeks glow
            if (isHappyOrDancing || isStretch || isLove || isGaze) {
                ctx.save();
                ctx.fillStyle = isLove ? 'rgba(244, 63, 94, 0.75)' : 'rgba(244, 114, 182, 0.65)';
                ctx.shadowColor = isLove ? '#f43f5e' : '#f472b6';
                ctx.shadowBlur = 18;
                ctx.beginPath();
                ctx.ellipse(130, 260, 32, 16, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.ellipse(382, 260, 32, 16, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            // Eyes
            ctx.save();
            ctx.fillStyle = eyeColor;
            ctx.strokeStyle = eyeColor;
            ctx.shadowColor = eyeColor;
            ctx.shadowBlur = 20;

            if (blinking) {
                // Sleek thin cyber slit line
                ctx.beginPath();
                ctx.roundRect ? ctx.roundRect(110, 172, 85, 8, 4) : ctx.rect(110, 172, 85, 8);
                ctx.fill();
                ctx.beginPath();
                ctx.roundRect ? ctx.roundRect(317, 172, 85, 8, 4) : ctx.rect(317, 172, 85, 8);
                ctx.fill();
            } else if (isLove) {
                // Loving sparkling heart eyes ♥ ♥
                function drawHeart(cx, cy, s) {
                    ctx.save();
                    ctx.translate(cx, cy);
                    ctx.scale(s, s);
                    ctx.beginPath();
                    ctx.moveTo(0, 8);
                    ctx.bezierCurveTo(-26, -18, -48, 8, 0, 44);
                    ctx.bezierCurveTo(48, 8, 26, -18, 0, 8);
                    ctx.fill();
                    ctx.restore();
                }
                drawHeart(152, 155, 0.95);
                drawHeart(360, 155, 0.95);
            } else if (isGaze) {
                // Starry contemplative eyes ✧ ✧
                function drawStar(cx, cy, r1, r2) {
                    ctx.save();
                    ctx.translate(cx, cy);
                    ctx.beginPath();
                    for (let i = 0; i < 8; i++) {
                        const a = (i * Math.PI) / 4;
                        const r = i % 2 === 0 ? r1 : r2;
                        const x = Math.cos(a) * r;
                        const y = Math.sin(a) * r;
                        if (i === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    }
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                }
                drawStar(152, 175, 44, 13);
                drawStar(360, 175, 44, 13);
            } else if (isStretch) {
                // Relaxed closed smiling crescent arcs ˘ ˘
                const arcY = 175;
                const radius = 38;
                ctx.lineWidth = 14;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.arc(152, arcY, radius, Math.PI * 0.15, Math.PI * 0.85, false);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(360, arcY, radius, Math.PI * 0.15, Math.PI * 0.85, false);
                ctx.stroke();
            } else if (isHappyOrDancing) {
                // Joyful smiling arcs ^ ^
                const arcY = 192;
                const radius = 42;
                ctx.lineWidth = 15;
                ctx.lineCap = 'round';

                ctx.beginPath();
                ctx.arc(152, arcY, radius, Math.PI * 1.15, Math.PI * 1.85, false);
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(360, arcY, radius, Math.PI * 1.15, Math.PI * 1.85, false);
                ctx.stroke();
            } else {
                // Cute rounded capsule eyes
                ctx.beginPath();
                ctx.roundRect ? ctx.roundRect(120, 130, 72, 98, 28) : ctx.rect(120, 130, 72, 98);
                ctx.fill();

                ctx.beginPath();
                ctx.roundRect ? ctx.roundRect(320, 130, 72, 98, 28) : ctx.rect(320, 130, 72, 98);
                ctx.fill();

                // Specular highlight gleam
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(142, 155, 8, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(342, 155, 8, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();

            // Mouth
            ctx.save();
            ctx.strokeStyle = '#f472b6';
            ctx.shadowColor = '#f472b6';
            ctx.shadowBlur = 12;
            if (isHappyOrDancing || isStretch || isLove || isGaze) {
                ctx.lineWidth = 8;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.arc(256, 268, 26, Math.PI * 0.15, Math.PI * 0.85, false);
                ctx.stroke();
            } else {
                ctx.lineWidth = 6;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(234, 284);
                ctx.lineTo(278, 284);
                ctx.stroke();
            }
            ctx.restore();
        }

        drawFace('normal', false, 0);
        const robotFaceTex = new THREE.CanvasTexture(faceCanvas);

        function playRobotChirp() {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                const ctx = new AudioCtx();
                if (ctx.state === 'suspended') ctx.resume();
                const now = ctx.currentTime;

                const osc1 = ctx.createOscillator();
                const osc2 = ctx.createOscillator();
                const gain = ctx.createGain();

                osc1.type = 'sine';
                osc2.type = 'triangle';

                // Playful harmonic rising chirp (520Hz -> 880Hz -> 1175Hz)
                osc1.frequency.setValueAtTime(520, now);
                osc1.frequency.exponentialRampToValueAtTime(880, now + 0.08);
                osc1.frequency.exponentialRampToValueAtTime(1175, now + 0.16);

                osc2.frequency.setValueAtTime(1040, now);
                osc2.frequency.exponentialRampToValueAtTime(1760, now + 0.12);

                gain.gain.setValueAtTime(0.001, now);
                gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

                osc1.connect(gain);
                osc2.connect(gain);
                gain.connect(ctx.destination);

                osc1.start(now);
                osc2.start(now);
                osc1.stop(now + 0.28);
                osc2.stop(now + 0.28);
            } catch (e) { }
        }

        function playRobotWelcomeSound() {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                const ctx = new AudioCtx();
                if (ctx.state === 'suspended') ctx.resume();
                const now = ctx.currentTime;
                const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6 (Harmonic arpeggio)
                notes.forEach((freq, i) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    const t = now + i * 0.10;
                    osc.type = i === 3 ? 'sine' : 'triangle';
                    osc.frequency.setValueAtTime(freq, t);
                    gain.gain.setValueAtTime(0.001, t);
                    gain.gain.linearRampToValueAtTime(0.12, t + 0.02);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(t);
                    osc.stop(t + 0.40);
                });
            } catch (e) { }
        }

        function playCatMeow(variant = 'happy') {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                const ctx = new AudioCtx();
                if (ctx.state === 'suspended') ctx.resume();
                const now = ctx.currentTime;

                const filter = ctx.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.setValueAtTime(variant === 'chirp' ? 1450 : (variant === 'hungry' ? 980 : 1150), now);
                filter.Q.setValueAtTime(2.4, now);

                const gain = ctx.createGain();
                gain.gain.setValueAtTime(0.001, now);

                const osc = ctx.createOscillator();
                osc.type = 'triangle';
                const osc2 = ctx.createOscillator();
                osc2.type = 'sine';

                if (variant === 'chirp') {
                    // Playful trill / chirp ("brrr-mew")
                    gain.gain.linearRampToValueAtTime(0.20, now + 0.04);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
                    osc.frequency.setValueAtTime(720, now);
                    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.12);
                    osc.frequency.exponentialRampToValueAtTime(940, now + 0.36);
                    osc2.frequency.setValueAtTime(1440, now);
                    osc2.frequency.exponentialRampToValueAtTime(2640, now + 0.12);
                    osc.start(now); osc.stop(now + 0.40);
                    osc2.start(now); osc2.stop(now + 0.40);
                } else if (variant === 'hungry') {
                    // Soft gentle mew asking for food/water
                    gain.gain.linearRampToValueAtTime(0.18, now + 0.06);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
                    osc.frequency.setValueAtTime(580, now);
                    osc.frequency.exponentialRampToValueAtTime(780, now + 0.18);
                    osc.frequency.exponentialRampToValueAtTime(520, now + 0.52);
                    osc2.frequency.setValueAtTime(1160, now);
                    osc2.frequency.exponentialRampToValueAtTime(1560, now + 0.18);
                    osc.start(now); osc.stop(now + 0.58);
                    osc2.start(now); osc2.stop(now + 0.58);
                } else {
                    // Sweet happy melodic meow
                    gain.gain.linearRampToValueAtTime(0.22, now + 0.08);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
                    osc.frequency.setValueAtTime(540, now);
                    osc.frequency.exponentialRampToValueAtTime(890, now + 0.18);
                    osc.frequency.exponentialRampToValueAtTime(610, now + 0.62);
                    osc2.frequency.setValueAtTime(1080, now);
                    osc2.frequency.exponentialRampToValueAtTime(1780, now + 0.18);
                    osc2.frequency.exponentialRampToValueAtTime(1220, now + 0.62);
                    osc.start(now); osc.stop(now + 0.68);
                    osc2.start(now); osc2.stop(now + 0.68);
                }

                osc.connect(filter);
                osc2.connect(filter);
                filter.connect(gain);
                gain.connect(ctx.destination);
            } catch (e) { }
        }

        function playCatPurr() {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                const ctx = new AudioCtx();
                if (ctx.state === 'suspended') ctx.resume();
                const now = ctx.currentTime;

                const purr = ctx.createOscillator();
                purr.type = 'sawtooth';
                purr.frequency.setValueAtTime(32, now);

                const mod = ctx.createOscillator();
                mod.type = 'sine';
                mod.frequency.setValueAtTime(24, now);
                const modGain = ctx.createGain();
                modGain.gain.setValueAtTime(14, now);
                mod.connect(modGain);
                modGain.connect(purr.frequency);

                const filter = ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(170, now);

                const gain = ctx.createGain();
                gain.gain.setValueAtTime(0.001, now);
                gain.gain.linearRampToValueAtTime(0.08, now + 0.15);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

                purr.connect(filter);
                filter.connect(gain);
                gain.connect(ctx.destination);

                mod.start(now);
                mod.stop(now + 1.55);
                purr.start(now);
                purr.stop(now + 1.55);
            } catch (e) { }
        }

        // LOUD, DEEP, HEARTFELT FELINE PURR (Ronroneo fuerte al recibir cariño)
        function playLoudCatPurr() {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                const ctx = new AudioCtx();
                if (ctx.state === 'suspended') ctx.resume();
                const now = ctx.currentTime;

                // Dual harmonic rumble: 34 Hz sub + 68 Hz warm body
                const purrLow = ctx.createOscillator();
                purrLow.type = 'sawtooth';
                purrLow.frequency.setValueAtTime(34, now);

                const purrHarm = ctx.createOscillator();
                purrHarm.type = 'sine';
                purrHarm.frequency.setValueAtTime(68, now);

                // Cadence vibrato LFO (~22 Hz rhythm of cat throat diaphragm)
                const mod = ctx.createOscillator();
                mod.type = 'sine';
                mod.frequency.setValueAtTime(22, now);
                const modGain = ctx.createGain();
                modGain.gain.setValueAtTime(18, now);
                mod.connect(modGain);
                modGain.connect(purrLow.frequency);
                modGain.connect(purrHarm.frequency);

                const filter = ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(240, now);
                filter.Q.setValueAtTime(1.9, now);

                // High gain and rich extended duration
                const gain = ctx.createGain();
                gain.gain.setValueAtTime(0.001, now);
                gain.gain.linearRampToValueAtTime(0.24, now + 0.22);
                gain.gain.setValueAtTime(0.22, now + 1.8);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 2.8);

                purrLow.connect(filter);
                purrHarm.connect(filter);
                filter.connect(gain);
                gain.connect(ctx.destination);

                mod.start(now);
                mod.stop(now + 2.85);
                purrLow.start(now);
                purrLow.stop(now + 2.85);
                purrHarm.start(now);
                purrHarm.stop(now + 2.85);
            } catch (e) { }
        }

        function playWaterLickSound() {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                const ctx = new AudioCtx();
                if (ctx.state === 'suspended') ctx.resume();
                const now = ctx.currentTime;
                const osc = ctx.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(780 + Math.random() * 220, now);
                osc.frequency.exponentialRampToValueAtTime(320, now + 0.08);
                const gain = ctx.createGain();
                gain.gain.setValueAtTime(0.001, now);
                gain.gain.linearRampToValueAtTime(0.08, now + 0.015);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.10);
            } catch (e) { }
        }

        function playFoodCrunchSound() {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                const ctx = new AudioCtx();
                if (ctx.state === 'suspended') ctx.resume();
                const now = ctx.currentTime;
                const osc = ctx.createOscillator();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(320 + Math.random() * 140, now);
                osc.frequency.exponentialRampToValueAtTime(140, now + 0.06);
                const filter = ctx.createBiquadFilter();
                filter.type = 'highpass';
                filter.frequency.setValueAtTime(1100, now);
                const gain = ctx.createGain();
                gain.gain.setValueAtTime(0.001, now);
                gain.gain.linearRampToValueAtTime(0.07, now + 0.01);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
                osc.connect(filter);
                filter.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.09);
            } catch (e) { }
        }

        function playToyMouseSqueak() {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                const ctx = new AudioCtx();
                if (ctx.state === 'suspended') ctx.resume();
                const now = ctx.currentTime;
                const osc = ctx.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(2200, now);
                osc.frequency.exponentialRampToValueAtTime(3200, now + 0.06);
                osc.frequency.exponentialRampToValueAtTime(1800, now + 0.16);
                const gain = ctx.createGain();
                gain.gain.setValueAtTime(0.001, now);
                gain.gain.linearRampToValueAtTime(0.14, now + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.20);
            } catch (e) { }
        }

        function playBedSquishSound(isJumpOn = true) {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                const ctx = new AudioCtx();
                if (ctx.state === 'suspended') ctx.resume();
                const now = ctx.currentTime;
                const osc = ctx.createOscillator();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(isJumpOn ? 140 : 105, now);
                osc.frequency.exponentialRampToValueAtTime(50, now + 0.22);
                const filter = ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(220, now);
                const gain = ctx.createGain();
                gain.gain.setValueAtTime(0.001, now);
                gain.gain.linearRampToValueAtTime(0.12, now + 0.03);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
                osc.connect(filter);
                filter.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.25);
            } catch (e) { }
        }

        function playCatPlayChirp() {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                const ctx = new AudioCtx();
                if (ctx.state === 'suspended') ctx.resume();
                const now = ctx.currentTime;

                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(680, now);
                osc.frequency.exponentialRampToValueAtTime(1240, now + 0.11);
                osc.frequency.exponentialRampToValueAtTime(940, now + 0.28);

                gain.gain.setValueAtTime(0.001, now);
                gain.gain.linearRampToValueAtTime(0.15, now + 0.04);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.34);
            } catch (e) { }
        }

        function playToyBounceSound() {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                const ctx = new AudioCtx();
                if (ctx.state === 'suspended') ctx.resume();
                const now = ctx.currentTime;

                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(540, now);
                osc.frequency.exponentialRampToValueAtTime(260, now + 0.12);

                gain.gain.setValueAtTime(0.001, now);
                gain.gain.linearRampToValueAtTime(0.12, now + 0.015);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.2);
            } catch (e) { }
        }

        function playCupPressSound() {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                const ctx = new AudioCtx();
                if (ctx.state === 'suspended') ctx.resume();
                const now = ctx.currentTime;

                // 1. Ceramic tactile ping
                const oscClink = ctx.createOscillator();
                const gainClink = ctx.createGain();
                oscClink.type = 'sine';
                oscClink.frequency.setValueAtTime(1760, now);
                oscClink.frequency.exponentialRampToValueAtTime(880, now + 0.12);
                gainClink.gain.setValueAtTime(0.09, now);
                gainClink.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
                oscClink.connect(gainClink);
                gainClink.connect(ctx.destination);
                oscClink.start(now);
                oscClink.stop(now + 0.15);

                // 2. Mechanical induction micro-switch click
                const oscClick = ctx.createOscillator();
                const gainClick = ctx.createGain();
                oscClick.type = 'triangle';
                oscClick.frequency.setValueAtTime(180, now);
                oscClick.frequency.exponentialRampToValueAtTime(60, now + 0.04);
                gainClick.gain.setValueAtTime(0.12, now);
                gainClick.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
                oscClick.connect(gainClick);
                gainClick.connect(ctx.destination);
                oscClick.start(now);
                oscClick.stop(now + 0.06);
            } catch (e) { }
        }

        function playCoffeeSound() {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                const ctx = new AudioCtx();
                if (ctx.state === 'suspended') ctx.resume();
                const now = ctx.currentTime;

                const chord = [392.00, 523.25, 659.25, 783.99, 1046.50, 1318.51];
                chord.forEach((freq, idx) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    const t = now + idx * 0.05;
                    osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
                    osc.frequency.setValueAtTime(freq, t);
                    gain.gain.setValueAtTime(0.001, t);
                    gain.gain.linearRampToValueAtTime(0.14, t + 0.015);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(t);
                    osc.stop(t + 0.35);
                });
            } catch (e) { }
        }

        function playTurntableNeedleSound() {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                const ctx = new AudioCtx();
                if (ctx.state === 'suspended') ctx.resume();
                const now = ctx.currentTime;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(140, now);
                osc.frequency.exponentialRampToValueAtTime(35, now + 0.04);
                gain.gain.setValueAtTime(0.18, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.06);
            } catch (e) { }
        }

        function playTurntableStopSound() {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                const ctx = new AudioCtx();
                if (ctx.state === 'suspended') ctx.resume();
                const now = ctx.currentTime;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(220, now);
                osc.frequency.exponentialRampToValueAtTime(40, now + 0.45);
                gain.gain.setValueAtTime(0.08, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.48);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.5);
            } catch (e) { }
        }

        function playStretchSound() {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                const ctx = new AudioCtx();
                if (ctx.state === 'suspended') ctx.resume();
                const now = ctx.currentTime;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(260, now);
                osc.frequency.exponentialRampToValueAtTime(680, now + 0.28);
                gain.gain.setValueAtTime(0.001, now);
                gain.gain.linearRampToValueAtTime(0.12, now + 0.04);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.35);

                [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
                    const oscC = ctx.createOscillator();
                    const gainC = ctx.createGain();
                    const t = now + 0.15 + idx * 0.055;
                    oscC.type = 'sine';
                    oscC.frequency.setValueAtTime(freq, t);
                    gainC.gain.setValueAtTime(0.001, t);
                    gainC.gain.linearRampToValueAtTime(0.10, t + 0.015);
                    gainC.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
                    oscC.connect(gainC);
                    gainC.connect(ctx.destination);
                    oscC.start(t);
                    oscC.stop(t + 0.4);
                });
            } catch (e) { }
        }

        function playGlobeSpinSound() {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                const ctx = new AudioCtx();
                if (ctx.state === 'suspended') ctx.resume();
                const now = ctx.currentTime;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(320, now);
                osc.frequency.exponentialRampToValueAtTime(160, now + 0.35);
                gain.gain.setValueAtTime(0.11, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + 0.4);

                [659.25, 987.77, 1318.51].forEach((freq, idx) => {
                    const oscC = ctx.createOscillator();
                    const gainC = ctx.createGain();
                    const t = now + 0.04 + idx * 0.07;
                    oscC.type = 'sine';
                    oscC.frequency.setValueAtTime(freq, t);
                    gainC.gain.setValueAtTime(0.001, t);
                    gainC.gain.linearRampToValueAtTime(0.08, t + 0.012);
                    gainC.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
                    oscC.connect(gainC);
                    gainC.connect(ctx.destination);
                    oscC.start(t);
                    oscC.stop(t + 0.45);
                });
            } catch (e) { }
        }

        function playChristmasJingleSound() {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                const ctx = new AudioCtx();
                if (ctx.state === 'suspended') ctx.resume();
                const now = ctx.currentTime;
                const notes = [
                    { f: 659.25, d: 0.16 }, // E5
                    { f: 659.25, d: 0.16 }, // E5
                    { f: 659.25, d: 0.28 }, // E5
                    { f: 659.25, d: 0.16 }, // E5
                    { f: 659.25, d: 0.16 }, // E5
                    { f: 659.25, d: 0.28 }, // E5
                    { f: 659.25, d: 0.16 }, // E5
                    { f: 783.99, d: 0.16 }, // G5
                    { f: 523.25, d: 0.16 }, // C5
                    { f: 587.33, d: 0.16 }, // D5
                    { f: 659.25, d: 0.42 }  // E5
                ];
                let curTime = now;
                notes.forEach((n) => {
                    const osc = ctx.createOscillator();
                    const oscHarm = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    oscHarm.type = 'triangle';
                    osc.frequency.setValueAtTime(n.f, curTime);
                    oscHarm.frequency.setValueAtTime(n.f * 2, curTime);
                    gain.gain.setValueAtTime(0.001, curTime);
                    gain.gain.linearRampToValueAtTime(0.14, curTime + 0.012);
                    gain.gain.exponentialRampToValueAtTime(0.001, curTime + n.d);
                    osc.connect(gain);
                    oscHarm.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(curTime);
                    oscHarm.start(curTime);
                    osc.stop(curTime + n.d + 0.05);
                    oscHarm.stop(curTime + n.d + 0.05);
                    curTime += n.d + 0.04;
                });
            } catch (e) { }
        }

        const robotBubbleEl = document.getElementById('edubot-speech-bubble');
        const robotBubbleText = document.getElementById('edubot-bubble-text');
        const robotBubbleBadge = document.getElementById('edubot-bubble-badge');
        const robotCloseBtn = document.getElementById('edubot-close-btn');
        const robotNextTipBtn = document.getElementById('edubot-next-tip-btn');
        const robotWalkBtn = document.getElementById('edubot-walk-btn');
        const robotProfileBtn = document.getElementById('edubot-profile-btn');
        const robotMeetBtn = document.getElementById('edubot-meet-btn');

        let isInitialWelcomeActive = false;
        let hasShownInitialWelcome = false;
        let standProg = 1.0; // Starts standing tall on first load
        let targetStand = 1.0;

        // EDUBOT MOBILITY & AUTONOMOUS WELLNESS STATE MACHINE
        let robotState = 'SEATED'; // 'SEATED' | 'STAND_PREP' | 'STRETCHING' | 'WALK_TO_CAT' | 'PET_CAT' | 'WALK_TO_WINDOW' | 'GAZE_WINDOW' | 'WALK_TO_DESK' | 'SIT_DOWN'
        let robotStateTime = 0;
        let timeSinceLastBreak = 0;
        const robotDeskSeatPos = new THREE.Vector3(0.50, 0, -0.74);
        const robotPos = new THREE.Vector3(0.50, 0, -0.74);
        let robotHeading = 0; // rotation.y (0 faces desk/camera, Math.PI faces window)
        let currentNavPath = [];
        let currentNavTargetIdx = 0;
        let robotWalkPhase = 0;
        let crouchProg = 0;

        function showRobotBubble(badge, text, durationMs = 12000) {
            if (robotBubbleBadge) robotBubbleBadge.textContent = badge;
            if (robotBubbleText) robotBubbleText.innerHTML = text;
            if (robotBubbleEl) robotBubbleEl.classList.remove('hidden');
            if (dismissTimer) clearTimeout(dismissTimer);
            dismissTimer = setTimeout(() => {
                hideBubble();
            }, durationMs);
        }

        function triggerStretchWalk() {
            if (robotState !== 'SEATED') return;
            isInitialWelcomeActive = false;
            isGreetingActive = false;
            robotState = 'STAND_PREP';
            robotStateTime = 0;
            targetStand = 1.0;
            playStretchSound();
            showRobotBubble('🧘 PAUSA ACTIVA', '¡Uff, tantas horas programando! Es momento de una pausa activa para estirar circuitos y articulaciones... 🧘‍♂️⚡', 6000);
        }

        function showTip(idx) {
            isInitialWelcomeActive = false;
            currentTipIdx = (idx % EDUBOT_TIPS.length + EDUBOT_TIPS.length) % EDUBOT_TIPS.length;
            const tip = EDUBOT_TIPS[currentTipIdx];
            if (robotBubbleBadge) robotBubbleBadge.textContent = tip.badge;
            if (robotBubbleText) robotBubbleText.innerHTML = tip.text;
            if (robotNextTipBtn) {
                robotNextTipBtn.innerHTML = '<span>💡 Siguiente tip</span>';
            }
            if (robotBubbleEl) robotBubbleEl.classList.remove('hidden');

            if (dismissTimer) clearTimeout(dismissTimer);
            dismissTimer = setTimeout(() => {
                hideBubble();
            }, 12000);
        }

        function hideBubble() {
            if (robotBubbleEl) robotBubbleEl.classList.add('hidden');
            if (dismissTimer) clearTimeout(dismissTimer);
            isInitialWelcomeActive = false;
            isGreetingActive = false;
            targetStand = 0.0;
        }

        function triggerGreeting() {
            isInitialWelcomeActive = false;
            isGreetingActive = true;
            targetStand = 1.0;
            greetingStartTime = performance.now();
            playRobotChirp();
            showTip(currentTipIdx);
        }

        function triggerWelcomeGreeting() {
            if (hasShownInitialWelcome) return;
            hasShownInitialWelcome = true;
            isInitialWelcomeActive = true;
            isGreetingActive = true;
            targetStand = 1.0;
            standProg = 1.0;
            greetingStartTime = performance.now();
            playRobotWelcomeSound();

            if (robotBubbleBadge) robotBubbleBadge.textContent = '🤖 ASISTENTE DE EDUARDO';
            if (robotBubbleText) {
                robotBubbleText.innerHTML = '¡Bienvenido! Soy el <strong>asistente virtual de Eduardo</strong> y me ha dejado para ayudarte. Si necesitas información haz clic en mí o en los <strong>elementos interactivos</strong> de nuestra oficina virtual, ¡estamos muy felices de que estés acá! ✨';
            }
            if (robotNextTipBtn) {
                robotNextTipBtn.innerHTML = '<span>✨ ¡Explorar oficina!</span>';
            }
            if (robotBubbleEl) robotBubbleEl.classList.remove('hidden');

            if (dismissTimer) clearTimeout(dismissTimer);
            dismissTimer = setTimeout(() => {
                hideBubble();
            }, 18000);
        }

        function nextTip() {
            if (isInitialWelcomeActive) {
                hideBubble();
                return;
            }
            triggerGreeting();
            showTip(currentTipIdx + 1);
        }

        if (robotCloseBtn) robotCloseBtn.addEventListener('click', hideBubble);
        if (robotNextTipBtn) robotNextTipBtn.addEventListener('click', nextTip);
        if (robotWalkBtn) robotWalkBtn.addEventListener('click', triggerStretchWalk);
        if (robotProfileBtn) {
            robotProfileBtn.addEventListener('click', () => {
                hideBubble();
                api.focusStation('home');
            });
        }
        if (robotMeetBtn) {
            robotMeetBtn.addEventListener('click', () => {
                window.open('https://calendar.app.google/bLJvGyt2hxUdHTNG7', '_blank', 'noopener,noreferrer');
            });
        }

        /* ---------------------------------------------------------
           COFFEE TURBO MODE & KOTETSU CAT MASCOT LOGIC
        --------------------------------------------------------- */
        let isTurboActive = false;
        let turboStartTime = 0;
        const TURBO_DURATION = 9500;
        let turboDismissTimer = null;
        let isCoffeeSipping = false;
        let coffeeSipStartTime = 0;
        let coffeePressProg = 0;

        function triggerCoffeeTurbo() {
            isTurboActive = true;
            turboStartTime = performance.now();
            coffeePressProg = 1.0;
            isCoffeeSipping = true;
            coffeeSipStartTime = performance.now();

            playCupPressSound();
            setTimeout(() => {
                playCoffeeSound();
            }, 180);

            if (api && api.focusStation) {
                api.focusStation('coffee');
            }

            if (robotBubbleBadge) robotBubbleBadge.textContent = '☕ CAFÉ TURBO PARA EDUBOT';
            if (robotBubbleText) {
                robotBubbleText.innerHTML = '¡Exquisito espresso artesanal! ☕⚡ <strong>Muchas gracias por el café.</strong> Mis núcleos cuánticos y algoritmos operan al 200% de potencia para asistirte.';
            }
            if (robotNextTipBtn) {
                robotNextTipBtn.innerHTML = '<span>⚡ ¡Velocidad Máxima (200%)!</span>';
            }
            if (robotBubbleEl) robotBubbleEl.classList.remove('hidden');

            if (turboDismissTimer) clearTimeout(turboDismissTimer);
            turboDismissTimer = setTimeout(() => {
                isTurboActive = false;
                hideBubble();
            }, TURBO_DURATION);
        }

        const catBubbleEl = document.getElementById('cat-speech-bubble');
        const catBubbleText = document.getElementById('cat-bubble-text');
        const catBubbleBadge = document.getElementById('cat-bubble-badge');
        const catCloseBtn = document.getElementById('cat-close-btn');
        const catPetBtn = document.getElementById('cat-pet-btn');
        const catPlayBtn = document.getElementById('cat-play-btn');
        const catDeskBtn = document.getElementById('cat-desk-btn');
        const catSleepBtn = document.getElementById('cat-sleep-btn');
        let isCatPetted = false;
        let catPetStartTime = 0;
        let catDismissTimer = null;

        const KOTETSU_THOUGHTS = [
            {
                badge: '🐾 SABIDURÍA FELINA',
                text: '¡Miau! Eduardo es un líder que <strong>mantiene la templanza, el foco y la empatía</strong> incluso en incidentes críticos y alta exigencia. Además, ¡siempre recuerda darme mis premios favoritos! 🐾✨'
            },
            {
                badge: '🐾 ASESOR DE BIENESTAR',
                text: '¡Purr! Mi función oficial es garantizar que el equipo tenga <strong>alta disponibilidad emocional</strong>. ¡Un equipo sin tiempo para caricias felinas no puede innovar a su máximo nivel!'
            },
            {
                badge: '🎾 MODO JUEGO & ZOOMIES',
                text: '¡Atrapé la pelotita de fibra óptica! Correr a <strong>latencia cero</strong> por la oficina virtual me mantiene en forma para supervisar los clusters y la nube.'
            },
            {
                badge: '🤖 COMPAÑERO DE ESCRITORIO',
                text: 'Me encanta estar junto a EduBot. Entre sus algoritmos de IA y mis ronroneos de baja frecuencia, <strong>la productividad del equipo sube un 300%</strong>.'
            },
            {
                badge: '🏔️ VISTA PANORÁMICA',
                text: 'Tomando el sol junto al ventanal mirando las Torres del Paine... La arquitectura de software debe ser tan majestuosa, limpia y sólida como la Patagonia.'
            }
        ];

        function showCatThought(badge, text) {
            if (catBubbleBadge) catBubbleBadge.textContent = badge;
            if (catBubbleText) catBubbleText.innerHTML = text;
            if (catBubbleEl) catBubbleEl.classList.remove('hidden');
            if (catDismissTimer) clearTimeout(catDismissTimer);
            catDismissTimer = setTimeout(() => {
                hideCatBubble();
            }, 12000);
        }

        function triggerCatInteraction() {
            isCatPetted = true;
            catPetStartTime = performance.now();
            playLoudCatPurr(); // RONRONEO FUERTE Y PROFUNDO
            playCatMeow('happy');
            if (typeof spawnCatHearts === 'function' && typeof catRoot !== 'undefined') {
                spawnCatHearts(catRoot.position);
            }
            const thought = KOTETSU_THOUGHTS[Math.floor(Math.random() * KOTETSU_THOUGHTS.length)];
            showCatThought(thought.badge, thought.text);
        }

        function triggerCatPlay() {
            if (typeof startCatPlayActivity === 'function') {
                startCatPlayActivity();
            }
            showCatThought('🎾 ¡A CORRER Y JUGAR!', '¡Miau! ¡Modo zoomies y juego activado! Persiguiendo mi ratoncito cyberpunk y la pelotita por toda la oficina virtual.');
        }

        function triggerCatDesk() {
            if (typeof sendCatToDesk === 'function') {
                sendCatToDesk();
            }
            showCatThought('📍 EN CAMINO AL ESCRITORIO', '¡Prrr! Voy directo al escritorio a saltar junto a EduBot y supervisar el teclado RGB y el código.');
        }

        function triggerCatFood() {
            if (typeof sendCatToFood === 'function') {
                sendCatToFood();
            }
            showCatThought('🍽️ GOURMET BISTRO FELINO', '¡Miau! Directo a mi bebedero y comedero a disfrutar de agua fresca filtrada y croquetas de salmón 🐟💧');
        }

        function triggerCatDance() {
            if (typeof startCatDance === 'function') {
                startCatDance();
            }
            showCatThought('🕺 ¡FIESTA Y BAILE EN 2 PATAS!', '¡Prrr! ¡Sonando el mejor sintetizador! ¡Bailando en 2 piernas con ritmo felino total! 🐾🎶✨');
        }

        function triggerCatSleep() {
            if (typeof sendCatToSleep === 'function') {
                sendCatToSleep();
            }
            showCatThought('💤 HORA DE LA SIESTA', 'Miau... fue un gran día de aventuras. Me acurruco en mi cama nido acolchada en la esquina a recargar ronroneos.');
        }

        function hideCatBubble() {
            if (catBubbleEl) catBubbleEl.classList.add('hidden');
            if (catDismissTimer) clearTimeout(catDismissTimer);
            isCatPetted = false;
        }

        if (catCloseBtn) catCloseBtn.addEventListener('click', hideCatBubble);
        if (catSleepBtn) catSleepBtn.addEventListener('click', triggerCatSleep);
        if (catPetBtn) catPetBtn.addEventListener('click', triggerCatInteraction);
        if (catPlayBtn) catPlayBtn.addEventListener('click', triggerCatPlay);
        if (catDeskBtn) catDeskBtn.addEventListener('click', triggerCatDesk);

        const catFoodBtn = document.getElementById('cat-food-btn');
        if (catFoodBtn) catFoodBtn.addEventListener('click', triggerCatFood);
        const catDanceBtn = document.getElementById('cat-dance-btn');
        if (catDanceBtn) catDanceBtn.addEventListener('click', triggerCatDance);

        window.eduKotetsuPet = {
            pet: triggerCatInteraction,
            play: triggerCatPlay,
            goToDesk: triggerCatDesk,
            goToFood: triggerCatFood,
            dance: triggerCatDance,
            goToSleep: triggerCatSleep,
            hideBubble: hideCatBubble,
            getState: () => ({
                state: typeof catState !== 'undefined' ? catState : 'unknown',
                x: typeof catRoot !== 'undefined' ? Number(catRoot.position.x.toFixed(2)) : 0,
                y: typeof catRoot !== 'undefined' ? Number(catRoot.position.y.toFixed(2)) : 0,
                z: typeof catRoot !== 'undefined' ? Number(catRoot.position.z.toFixed(2)) : 0,
                waypoint: typeof currentWaypointId !== 'undefined' ? currentWaypointId : '',
                pathQueue: typeof pathQueue !== 'undefined' ? [...pathQueue] : [],
                stateDuration: typeof stateDuration !== 'undefined' ? stateDuration : 0,
                stateElapsed: typeof stateStartTime !== 'undefined' ? (performance.now() - stateStartTime) / 1000 : 0,
                jumpStart: typeof jumpStartPos !== 'undefined' ? { x: Number(jumpStartPos.x.toFixed(2)), y: Number(jumpStartPos.y.toFixed(2)), z: Number(jumpStartPos.z.toFixed(2)) } : null,
                jumpEnd: typeof jumpEndPos !== 'undefined' ? { x: Number(jumpEndPos.x.toFixed(2)), y: Number(jumpEndPos.y.toFixed(2)), z: Number(jumpEndPos.z.toFixed(2)) } : null,
                isCatPetted: typeof isCatPetted !== 'undefined' ? isCatPetted : false,
                isCatVisitingDesk: typeof isCatVisitingDesk !== 'undefined' ? isCatVisitingDesk : false
            }),
            focusCamera: () => {
                if (api && api.focusStation) {
                    api.focusStation('cat');
                }
            }
        };

        window.eduRobotAssistant = {
            triggerGreeting,
            triggerWelcomeGreeting,
            triggerCoffeeTurbo,
            triggerCatInteraction,
            triggerStretchWalk,
            getState: () => ({
                state: robotState,
                x: Number(robotPos.x.toFixed(2)),
                y: Number(robot.position.y.toFixed(2)),
                z: Number(robotPos.z.toFixed(2)),
                heading: Number(robotHeading.toFixed(2))
            }),
            nextTip,
            hideBubble,
            showTip
        };

        const robot = new THREE.Group();
        robot.position.set(0.50, 0, -0.74);
        scene.add(robot);
        const robotWhite = std(0xe8eaef, 0.45, 0.1);
        const robotGray = std(0x52525b, 0.5, 0.4);
        addMesh(new THREE.BoxGeometry(0.64, 0.62, 0.42), robotWhite, [0, 1.06, 0], robot, { station: 'robot' });
        addMesh(new THREE.BoxGeometry(0.4, 0.3, 0.02), std(0x111827, 0.4, 0.4), [0, 1.1, 0.215], robot, { cast: false, station: 'robot' });
        const chestLed = addMesh(new THREE.BoxGeometry(0.08, 0.04, 0.02), basic({ color: 0xf472b6 }), [0.1, 1.18, 0.23], robot, { cast: false });
        addMesh(new THREE.BoxGeometry(0.08, 0.04, 0.02), basic({ color: 0x38bdf8 }), [-0.05, 1.18, 0.23], robot, { cast: false });

        const head = new THREE.Group();
        head.position.set(0, 1.62, 0);
        robot.add(head);
        addMesh(new THREE.BoxGeometry(0.64, 0.54, 0.54), robotWhite, [0, 0, 0], head, { station: 'robot' });
        addMesh(new THREE.PlaneGeometry(0.52, 0.38), basic({ map: robotFaceTex }), [0, -0.01, 0.272], head, { cast: false, station: 'robot' });
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
            pivot.rotation.x = -1.18;
            pivot.rotation.z = side * -0.16;
            pivot.rotation.y = side * 0.12;
            return pivot;
        }
        const armL = makeArm(-1);
        const armR = makeArm(1);

        // Articulated legs for sitting & standing kinematics
        function makeLeg(side) {
            const hip = new THREE.Group();
            hip.position.set(side * 0.18, 0.75, 0);
            robot.add(hip);

            // Thigh
            addMesh(new THREE.BoxGeometry(0.14, 0.30, 0.14), robotWhite, [0, -0.15, 0], hip);

            // Knee
            const knee = new THREE.Group();
            knee.position.set(0, -0.30, 0);
            hip.add(knee);
            addMesh(new THREE.CylinderGeometry(0.06, 0.06, 0.15, 16), robotGray, [0, 0, 0], knee, { rot: [0, 0, Math.PI / 2] });

            // Calf
            addMesh(new THREE.BoxGeometry(0.13, 0.30, 0.13), robotWhite, [0, -0.15, 0], knee);

            // Cyber Boot
            addMesh(new THREE.BoxGeometry(0.16, 0.08, 0.22), robotGray, [0, -0.32, 0.04], knee);
            addMesh(new THREE.BoxGeometry(0.14, 0.015, 0.18), basic({ color: 0x38bdf8 }), [0, -0.36, 0.04], knee, { cast: false });

            return { hip, knee };
        }
        const legL = makeLeg(-1);
        const legR = makeLeg(1);

        /* ---------------------------------------------------------
           LEFT WALL: FRAMELESS EXECUTIVE PORTRAIT (→ Perfil), ART, SHELF
        --------------------------------------------------------- */
        let portraitImg = null;
        const badgeFrontTextures = [];
        const portraitTex = canvasTexture(512, 640, (ctx, w, h) => {
            ctx.fillStyle = '#080c16';
            ctx.fillRect(0, 0, w, h);
            if (portraitImg) {
                drawCover(ctx, portraitImg, 0, 0, w, h);
            } else {
                ctx.font = '800 120px "Plus Jakarta Sans", sans-serif';
                ctx.fillStyle = '#38bdf8';
                ctx.fillText('EC', 150, 320);
            }
        });
        loadImage('images/perfil_pro_eduf.jpg', (img) => {
            portraitImg = img;
            portraitTex.userData.redraw();
            badgeFrontTextures.forEach((t) => {
                if (t && t.userData && t.userData.redraw) t.userData.redraw();
            });
        });

        const portrait = new THREE.Group();
        portrait.position.set(-5.97, 3.68, -3.28);
        portrait.rotation.y = Math.PI / 2;
        scene.add(portrait);

        // Soft ambient pink/sky backlight on the wall behind the frameless portrait
        glowPlane(1.35, 1.6, '244,114,182', 0.45, [0, 0, -0.015], null, portrait, true);

        // Ultra-slim beveled acrylic backing (frameless floating card)
        addMesh(new THREE.BoxGeometry(1.02, 1.28, 0.02), std(0x0e1017, 0.25, 0.4), [0, 0, 0.01], portrait, { station: 'home' });

        // The portrait canvas
        addMesh(new THREE.PlaneGeometry(1.0, 1.25), std(0xffffff, 0.5, 0, { map: portraitTex, emissive: 0xffffff, emissiveMap: portraitTex, emissiveIntensity: 0.35 }), [0, 0, 0.022], portrait, {
            station: 'home',
            cast: false
        });

        // Subtle acrylic glass sheen overlay
        addMesh(new THREE.PlaneGeometry(1.0, 1.25), basic({ color: 0xffffff, transparent: true, opacity: 0.06, depthWrite: false }), [0, 0, 0.024], portrait, {
            station: 'home',
            cast: false
        });

        /* ---------------------------------------------------------
           VINTAGE DIGITAL TELEMETRY CLOCK (OPEN APIs: GEOJS + OPEN-METEO)
        --------------------------------------------------------- */
        const visitorTelemetry = {
            city: 'Detectando...',
            country: '',
            lat: -33.4489,
            lon: -70.6693,
            temp: '--.-',
            humidity: '--',
            wind: '--',
            weatherLabel: 'Sincronizando clima...',
            weatherIcon: '🌤️',
            browser: /Edg/.test(navigator.userAgent) ? 'Edge' : /Chrome/.test(navigator.userAgent) ? 'Chrome' : /Firefox/.test(navigator.userAgent) ? 'Firefox' : /Safari/.test(navigator.userAgent) ? 'Safari' : 'Browser',
            lang: (navigator.language || 'es').toUpperCase(),
            screen: `${window.screen?.width || window.innerWidth}×${window.screen?.height || window.innerHeight}`
        };

        function mapWmoWeather(code) {
            if (code === 0) return { icon: '☀️', label: 'Despejado' };
            if (code <= 3) return { icon: '⛅', label: 'Parc. Nublado' };
            if (code === 45 || code === 48) return { icon: '🌫️', label: 'Niebla' };
            if (code >= 51 && code <= 67) return { icon: '🌧️', label: 'Lluvia' };
            if (code >= 71 && code <= 77) return { icon: '❄️', label: 'Nieve' };
            if (code >= 80 && code <= 82) return { icon: '🌦️', label: 'Chubascos' };
            if (code >= 95) return { icon: '⛈️', label: 'Tormenta' };
            return { icon: '🌤️', label: 'Variable' };
        }

        const vintageClockTex = canvasTexture(768, 456, (ctx, w, h) => {
            // Warm dark vintage VFD / Nixie bakelite display background
            const bg = ctx.createLinearGradient(0, 0, 0, h);
            bg.addColorStop(0, '#120d08');
            bg.addColorStop(1, '#090705');
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, w, h);

            // Subtle VFD CRT scanlines
            ctx.fillStyle = 'rgba(255, 180, 70, 0.03)';
            for (let y = 0; y < h; y += 4) {
                ctx.fillRect(0, y, w, 1.5);
            }

            // Inner brass/amber hairline border
            ctx.strokeStyle = 'rgba(212, 162, 76, 0.45)';
            ctx.lineWidth = 3;
            roundRect(ctx, 14, 14, w - 28, h - 28, 14);
            ctx.stroke();

            // Header bar
            ctx.fillStyle = '#d4a24c';
            ctx.font = '700 18px "JetBrains Mono", monospace';
            ctx.fillText('CHRONO-VFD // TELEMETRÍA EN VIVO', 34, 48);

            const now = new Date();
            const blinkOn = now.getSeconds() % 2 === 0;
            ctx.fillStyle = blinkOn ? '#34d399' : '#065f46';
            ctx.beginPath();
            ctx.arc(w - 115, 42, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#a7f3d0';
            ctx.font = '700 16px "JetBrains Mono", monospace';
            ctx.fillText('OPEN API', w - 102, 48);

            // Divider
            ctx.strokeStyle = 'rgba(212, 162, 76, 0.22)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(32, 66);
            ctx.lineTo(w - 32, 66);
            ctx.stroke();

            // Visitor Local Time (Nixie Amber Glow)
            const hh = String(now.getHours()).padStart(2, '0');
            const mm = String(now.getMinutes()).padStart(2, '0');
            const ss = String(now.getSeconds()).padStart(2, '0');
            const colon = blinkOn ? ':' : ' ';

            ctx.save();
            ctx.font = '800 94px "JetBrains Mono", monospace';
            ctx.fillStyle = '#ffaa33';
            ctx.shadowColor = 'rgba(255, 145, 0, 0.65)';
            ctx.shadowBlur = 18;
            ctx.fillText(`${hh}${colon}${mm}`, 34, 166);
            ctx.font = '700 42px "JetBrains Mono", monospace';
            ctx.fillStyle = '#fcd34d';
            ctx.fillText(`:${ss}`, 332, 166);
            ctx.restore();

            // Date & Visitor Timezone
            let dateStr = '';
            let tzStr = 'LOCAL';
            try {
                dateStr = new Intl.DateTimeFormat('es-ES', {
                    weekday: 'short',
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric'
                }).format(now).toUpperCase();
                tzStr = (Intl.DateTimeFormat().resolvedOptions().timeZone || 'LOCAL').toUpperCase();
            } catch {
                dateStr = now.toDateString().toUpperCase();
            }
            ctx.fillStyle = '#fde68a';
            ctx.font = '600 17px "JetBrains Mono", monospace';
            ctx.fillText(`${dateStr} · ${tzStr.slice(0, 22)}`, 36, 202);

            // Right Weather Card (Open-Meteo)
            ctx.fillStyle = 'rgba(255, 170, 51, 0.08)';
            roundRect(ctx, 438, 84, w - 472, 152, 12);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 170, 51, 0.28)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.fillStyle = '#94a3b8';
            ctx.font = '700 14px "JetBrains Mono", monospace';
            ctx.fillText('METEOROLOGÍA LOCAL', 456, 108);

            ctx.font = '800 46px "JetBrains Mono", monospace';
            ctx.fillStyle = '#5eead4';
            ctx.fillText(`${visitorTelemetry.temp}°C`, 456, 162);

            ctx.font = '600 18px "JetBrains Mono", monospace';
            ctx.fillStyle = '#e2e8f0';
            ctx.fillText(`${visitorTelemetry.weatherIcon} ${visitorTelemetry.weatherLabel}`, 456, 194);

            ctx.font = '500 15px "JetBrains Mono", monospace';
            ctx.fillStyle = '#cbd5e1';
            ctx.fillText(`💧 ${visitorTelemetry.humidity}%  💨 ${visitorTelemetry.wind} km/h`, 456, 220);

            // Visitor Info Panel (Bottom-left)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
            roundRect(ctx, 34, 254, w - 68, 114, 12);
            ctx.fill();
            ctx.strokeStyle = 'rgba(212, 162, 76, 0.22)';
            ctx.lineWidth = 1.2;
            ctx.stroke();

            const locLabel = visitorTelemetry.country
                ? `${visitorTelemetry.city}, ${visitorTelemetry.country}`
                : visitorTelemetry.city;

            ctx.fillStyle = '#d4a24c';
            ctx.font = '700 14px "JetBrains Mono", monospace';
            ctx.fillText('VISITANTE CONECTADO', 52, 280);

            ctx.fillStyle = '#f8fafc';
            ctx.font = '700 22px "Plus Jakarta Sans", sans-serif';
            ctx.fillText(`📍 ${locLabel.slice(0, 34)}`, 52, 314);

            ctx.fillStyle = '#94a3b8';
            ctx.font = '500 16px "JetBrains Mono", monospace';
            ctx.fillText(`🖥️ ${visitorTelemetry.browser} · Idioma ${visitorTelemetry.lang} · Pantalla ${visitorTelemetry.screen}`, 52, 348);

            // Footer: Eduardo's local time + availability
            let clTime = '--:--';
            try {
                clTime = new Intl.DateTimeFormat('es-CL', {
                    timeZone: 'America/Santiago',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                }).format(now);
            } catch {}
            ctx.fillStyle = '#34d399';
            ctx.font = '700 16px "JetBrains Mono", monospace';
            ctx.fillText(`🇨🇱 SANTIAGO (EDUARDO): ${clTime} CLT`, 36, 412);

            ctx.fillStyle = '#fcd34d';
            ctx.fillText('● DISPONIBLE PROYECTOS & B2B', w - 332, 412);
        });

        // Fetch open Visitor Geo + Open-Meteo Weather asynchronously (no API keys required)
        (async function fetchOpenTelemetry() {
            try {
                const geoRes = await fetch('https://get.geojs.io/v1/ip/geo.json');
                if (geoRes.ok) {
                    const geo = await geoRes.json();
                    if (geo.city) visitorTelemetry.city = geo.city;
                    if (geo.country) visitorTelemetry.country = geo.country;
                    if (geo.latitude && geo.longitude) {
                        visitorTelemetry.lat = parseFloat(geo.latitude);
                        visitorTelemetry.lon = parseFloat(geo.longitude);
                    }
                }
            } catch {
                if (visitorTelemetry.city === 'Detectando...') {
                    visitorTelemetry.city = 'Ubicación Local';
                }
            }

            try {
                const wUrl = `https://api.open-meteo.com/v1/forecast?latitude=${visitorTelemetry.lat}&longitude=${visitorTelemetry.lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`;
                const wRes = await fetch(wUrl);
                if (wRes.ok) {
                    const wData = await wRes.json();
                    if (wData.current) {
                        visitorTelemetry.temp = Number(wData.current.temperature_2m).toFixed(1);
                        visitorTelemetry.humidity = Math.round(wData.current.relative_humidity_2m);
                        visitorTelemetry.wind = Math.round(wData.current.wind_speed_10m);
                        const mapped = mapWmoWeather(wData.current.weather_code);
                        visitorTelemetry.weatherIcon = mapped.icon;
                        visitorTelemetry.weatherLabel = mapped.label;
                    }
                }
            } catch {
                visitorTelemetry.weatherLabel = 'Sin conexión clima';
            }

            if (vintageClockTex.userData && vintageClockTex.userData.redraw) {
                vintageClockTex.userData.redraw();
            }
        })();

        setInterval(() => {
            if (vintageClockTex.userData && vintageClockTex.userData.redraw) {
                vintageClockTex.userData.redraw();
            }
        }, 1000);

        const vintageClockGroup = new THREE.Group();
        vintageClockGroup.position.set(-5.96, 3.68, -1.55);
        vintageClockGroup.rotation.y = Math.PI / 2;
        scene.add(vintageClockGroup);

        // Warm amber backlight behind the vintage digital clock
        glowPlane(1.75, 1.12, '255,170,60', 0.35, [0, 0, -0.015], null, vintageClockGroup, true);
        // Walnut outer frame + brushed brass inner rim (consistent with office furniture skin)
        addMesh(new THREE.BoxGeometry(1.48, 0.90, 0.06), walnutMat, [0, 0, 0.01], vintageClockGroup, { station: 'clock' });
        addMesh(new THREE.BoxGeometry(1.38, 0.80, 0.02), credenzaBrassMat, [0, 0, 0.036], vintageClockGroup, { station: 'clock', cast: false });
        // Digital VFD Display Plane
        addMesh(new THREE.PlaneGeometry(1.32, 0.76), std(0xffffff, 0.35, 0.1, {
            map: vintageClockTex,
            emissive: 0xffffff,
            emissiveMap: vintageClockTex,
            emissiveIntensity: 0.65
        }), [0, 0, 0.048], vintageClockGroup, { station: 'clock', cast: false });

        // Floating bookshelf (repositioned cleanly below portrait & clock with breathing room)
        const shelf = new THREE.Group();
        shelf.position.set(-5.78, 2.18, -2.42);
        scene.add(shelf);
        addMesh(new THREE.BoxGeometry(0.42, 0.05, 2.80), walnutMat, [0, -0.005, 0], shelf);
        addMesh(new THREE.BoxGeometry(0.43, 0.016, 2.82), marbleMat, [0, 0.026, 0], shelf);
        addMesh(new THREE.BoxGeometry(0.012, 0.014, 2.82), credenzaBrassMat, [0.214, 0.012, 0], shelf, { cast: false });
        addMesh(new THREE.BoxGeometry(0.03, 0.02, 2.8), basic({ color: 0xffb066 }), [0.18, -0.04, 0], shelf, { cast: false, receive: false });
        glowPlane(3.6, 1.6, '255,170,90', 0.4, [-0.2, -0.55, 0], [0, Math.PI / 2, 0], shelf);
        const shelfLight = new THREE.PointLight(0xffb066, 0.6, 3.2, 2);
        shelfLightRef = shelfLight;
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
           LEFT WALL: INTERACTIVE CERTIFICATIONS & TECH STACK WHITEBOARD
        --------------------------------------------------------- */
        const CERTS_DATA = [
            {
                id: 'mit-ai',
                category: 'ai',
                title: 'IA Generativa, Transformación Digital & IoT',
                inst: 'Massachusetts Institute of Technology (MIT xPRO)',
                year: '2025 – 2026',
                badge: 'MIT xPRO',
                color: '#a31f34',
                icon: 'mit',
                desc: 'Especialización ejecutiva en adopción de IA generativa empresarial, IoT industrial, arquitecturas de datos e innovación tecnológica disruptiva.',
                competencies: ['Generative AI for Leaders', 'Transformación Digital', 'Industrial IoT', 'Modelos RAG & LLMs', 'Estrategia Tecnológica'],
                code: 'MIT-xPRO-GENAI-2025'
            },
            {
                id: 'isc2-cc',
                category: 'sec',
                title: 'Certified in Cybersecurity (CC) & INCIBE',
                inst: 'ISC2 · INCIBE España / Univ. de Málaga (315 hrs)',
                year: '2024 – Presente',
                badge: 'ISC2 & INCIBE',
                color: '#10b981',
                icon: 'isc2',
                desc: 'Certificación oficial ISC2 en principios de ciberseguridad, defensa de redes, SecOps, ISO 27001, gestión de incidentes y gobernanza de riesgos críticos.',
                competencies: ['Certified in Cybersecurity (ISC2)', 'ISO 27001 / NIST', 'Defensa Perimetral & SIEM', 'Ley Marco Ciberseguridad PSE', 'Respuesta a Incidentes (IR)'],
                code: 'ISC2-CC-REG-2024'
            },
            {
                id: 'aws-arch',
                category: 'cloud',
                title: 'AWS Cloud Solutions Architecture',
                inst: 'Amazon Web Services (AWS)',
                year: '2022 – Presente',
                badge: 'AWS CLOUD',
                color: '#ff9900',
                icon: 'aws',
                desc: 'Diseño e implementación de infraestructuras cloud resilientes, alta disponibilidad multi-AZ, microservicios, seguridad IAM, VPC y balanceo de carga.',
                competencies: ['AWS Well-Architected Framework', 'VPC / Subnets / Security Groups', 'RDS & DynamoDB', 'IAM & CloudWatch', 'Serverless & S3'],
                code: 'AWS-SOL-ARCH-2024'
            },
            {
                id: 'google-ai',
                category: 'ai',
                title: 'Inmersión en Inteligencia Artificial (Top 8 Latam)',
                inst: 'Google & Alura Latam',
                year: '2024',
                badge: 'GOOGLE TOP 8',
                color: '#4285F4',
                icon: 'google',
                desc: 'Distinción en el Top 8 entre más de 3.000 proyectos en Latinoamérica por el desarrollo de soluciones aplicadas con APIs de Gemini, embeddings y RAG.',
                competencies: ['Google Gemini API', 'Embeddings Vectoriales', 'Python Data Science', 'Prompt Engineering', 'RAG & Agentes Autónomos'],
                code: 'GOOGLE-ALURA-TOP8-LATAM'
            },
            {
                id: 'udd-mba',
                category: 'mgmt',
                title: 'MBA en Emprendimiento e Innovación',
                inst: 'Universidad del Desarrollo (UDD)',
                year: 'Graduado',
                badge: 'EXECUTIVE MBA',
                color: '#f59e0b',
                icon: 'mba',
                desc: 'Dirección estratégica de negocios B2B, liderazgo ejecutivo de células ágiles de ingeniería, evaluación financiera de proyectos y gobierno corporativo.',
                competencies: ['Estrategia Empresarial B2B', 'Dirección de Proyectos TI', 'Modelos de Negocio', 'Finanzas Corporativas', 'Liderazgo Ejecutivo'],
                code: 'UDD-MBA-ALUMNI'
            }
        ];

        const TECH_STACK_CATEGORIES = [
            {
                title: 'CLOUD & DEVOPS',
                cat: 'cloud',
                color: '#38bdf8',
                items: [
                    { name: 'AWS Cloud', desc: 'EC2, RDS, VPC, IAM', icon: 'aws' },
                    { name: 'Oracle OCI', desc: 'Compute, DB Cloud', icon: 'oracle' },
                    { name: 'Docker', desc: 'Contenedores Core', icon: 'docker' },
                    { name: 'Linux / Unix', desc: 'Red Team, Shell', icon: 'linux' },
                    { name: 'Terraform & CI/CD', desc: 'Infra as Code', icon: 'infra' }
                ]
            },
            {
                title: 'CIBERSEGURIDAD & SECOPS',
                cat: 'sec',
                color: '#34d399',
                items: [
                    { name: 'Wazuh (SIEM)', desc: 'Detección & Compliance', icon: 'wazuh' },
                    { name: 'Shuffle (SOAR)', desc: 'Automatización IR', icon: 'shuffle' },
                    { name: 'Nmap & Audits', desc: 'Mapeo Vulnerabilidades', icon: 'nmap' },
                    { name: 'Ley Marco PSE', desc: 'Gobernanza ANCI & CGR', icon: 'shield' }
                ]
            },
            {
                title: 'IA, DATA & BACKEND',
                cat: 'ai',
                color: '#f472b6',
                items: [
                    { name: 'Python & ML', desc: 'Scikit-learn, GenAI', icon: 'python' },
                    { name: 'PostgreSQL', desc: 'DBs Concurrentes', icon: 'postgres' },
                    { name: 'Java / JEE', desc: 'Spring, ADF, Core', icon: 'java' },
                    { name: 'Databricks', desc: 'Lakehouse & Analytics', icon: 'databricks' }
                ]
            },
            {
                title: 'DIRECCIÓN & ESTRATEGIA',
                cat: 'mgmt',
                color: '#fbbf24',
                items: [
                    { name: 'Agile & Scrum', desc: 'Dirección Células', icon: 'agile' },
                    { name: 'Jira & PMO', desc: 'Gestión Proyectos TI', icon: 'jira' },
                    { name: 'Smallworld GIS', desc: 'GIS Corporativo', icon: 'gis' }
                ]
            }
        ];

        function playTechClickSound(freq = 880, dur = 0.08) {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                const ctx = new AudioCtx();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                const now = ctx.currentTime;
                osc.frequency.setValueAtTime(freq, now);
                osc.frequency.exponentialRampToValueAtTime(freq * 1.4, now + dur * 0.4);
                osc.frequency.exponentialRampToValueAtTime(freq * 0.9, now + dur);
                gain.gain.setValueAtTime(0.08, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now);
                osc.stop(now + dur);
            } catch (e) { }
        }

        function drawAwsLogo(ctx, x, y, w, h) {
            ctx.save();
            ctx.translate(x, y);
            ctx.font = `900 ${Math.round(h * 0.52)}px "Inter", "Plus Jakarta Sans", sans-serif`;
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('aws', w / 2, h * 0.38);

            ctx.strokeStyle = '#ff9900';
            ctx.fillStyle = '#ff9900';
            ctx.lineWidth = Math.max(2.5, h * 0.08);
            ctx.lineCap = 'round';
            ctx.beginPath();
            const startX = w * 0.22, startY = h * 0.68;
            const endX = w * 0.78, endY = h * 0.68;
            const cpX = w * 0.5, cpY = h * 0.88;
            ctx.moveTo(startX, startY);
            ctx.quadraticCurveTo(cpX, cpY, endX, endY);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(endX + 2, endY - 6);
            ctx.lineTo(endX + 6, endY);
            ctx.lineTo(endX - 1, endY + 4);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        function drawMitLogo(ctx, x, y, w, h) {
            ctx.save();
            ctx.translate(x, y);
            ctx.fillStyle = '#a31f34';
            roundRect(ctx, 0, 0, w, h, 8);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            const bw = w * 0.085;
            const gap = w * 0.045;
            let bx = w * 0.16;
            const bot = h * 0.78;
            const topFull = h * 0.22;
            const topMid = h * 0.44;

            ctx.fillRect(bx, topFull, bw, bot - topFull);
            bx += bw + gap;
            ctx.fillRect(bx, topMid, bw, bot - topMid);
            bx += bw + gap;
            ctx.fillRect(bx, topFull, bw, bot - topFull);
            bx += bw + gap * 1.5;

            ctx.fillRect(bx, topMid, bw, bot - topMid);
            bx += bw + gap * 1.5;

            ctx.fillRect(bx, topFull, bw * 2.4, bw);
            ctx.fillRect(bx + bw * 0.7, topFull + bw, bw, bot - (topFull + bw));
            ctx.restore();
        }

        function drawIsc2Logo(ctx, x, y, w, h) {
            ctx.save();
            ctx.translate(x, y);
            ctx.fillStyle = '#064e3b';
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 2.5;
            const cx = w / 2, cy = h / 2;
            const r = Math.min(w, h) * 0.44;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const a = (i * Math.PI) / 3 - Math.PI / 6;
                const px = cx + Math.cos(a) * r;
                const py = cy + Math.sin(a) * r;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#34d399';
            ctx.font = `900 ${Math.round(h * 0.38)}px "JetBrains Mono", monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('CC', cx, cy + 1);
            ctx.restore();
        }

        function drawGoogleAiLogo(ctx, x, y, w, h) {
            ctx.save();
            ctx.translate(x, y);
            const cx = w / 2, cy = h / 2;
            const r = Math.min(w, h) * 0.44;

            const drawSpike = (angle, color) => {
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                const tipX = cx + Math.cos(angle) * r;
                const tipY = cy + Math.sin(angle) * r;
                const p1X = cx + Math.cos(angle - Math.PI / 4) * (r * 0.28);
                const p1Y = cy + Math.sin(angle - Math.PI / 4) * (r * 0.28);
                const p2X = cx + Math.cos(angle + Math.PI / 4) * (r * 0.28);
                const p2Y = cy + Math.sin(angle + Math.PI / 4) * (r * 0.28);
                ctx.moveTo(cx, cy);
                ctx.quadraticCurveTo(p1X, p1Y, tipX, tipY);
                ctx.quadraticCurveTo(p2X, p2Y, cx, cy);
                ctx.fill();
            };

            drawSpike(-Math.PI / 2, '#4285F4');
            drawSpike(0, '#EA4335');
            drawSpike(Math.PI / 2, '#FBBC05');
            drawSpike(Math.PI, '#34A853');

            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.18, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        function drawMbaLogo(ctx, x, y, w, h) {
            ctx.save();
            ctx.translate(x, y);
            ctx.fillStyle = '#78350f';
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 2.5;
            roundRect(ctx, 4, 4, w - 8, h - 8, 8);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#fbbf24';
            ctx.font = `900 ${Math.round(h * 0.36)}px "JetBrains Mono", monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('MBA', w / 2, h / 2 - 2);

            ctx.font = `600 ${Math.round(h * 0.18)}px "Inter", sans-serif`;
            ctx.fillText('UDD', w / 2, h * 0.78);
            ctx.restore();
        }

        function drawDockerLogo(ctx, x, y, w, h) {
            ctx.save();
            ctx.translate(x, y);
            ctx.fillStyle = '#0284c7';
            ctx.beginPath();
            ctx.ellipse(w * 0.5, h * 0.65, w * 0.36, h * 0.22, 0, 0, Math.PI);
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(w * 0.18, h * 0.65);
            ctx.lineTo(w * 0.08, h * 0.5);
            ctx.lineTo(w * 0.14, h * 0.62);
            ctx.closePath();
            ctx.fill();

            ctx.fillStyle = '#38bdf8';
            const cw = w * 0.09, ch = h * 0.1;
            for (let row = 0; row < 2; row++) {
                for (let col = 0; col < 3; col++) {
                    ctx.fillRect(w * 0.36 + col * (cw + 2), h * 0.42 - row * (ch + 2), cw, ch);
                }
            }
            ctx.restore();
        }

        function drawPythonLogo(ctx, x, y, w, h) {
            ctx.save();
            ctx.translate(x, y);
            const cx = w / 2, cy = h / 2;
            ctx.fillStyle = '#38bdf8';
            roundRect(ctx, cx - w * 0.35, cy - h * 0.35, w * 0.5, h * 0.42, 6);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(cx - w * 0.2, cy - h * 0.22, 2.5, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#fbbf24';
            roundRect(ctx, cx - w * 0.15, cy - h * 0.07, w * 0.5, h * 0.42, 6);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(cx + w * 0.2, cy + h * 0.22, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        function drawOracleLogo(ctx, x, y, w, h) {
            ctx.save();
            ctx.translate(x, y);
            ctx.fillStyle = '#ea2825';
            roundRect(ctx, 4, h * 0.2, w - 8, h * 0.6, 6);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = `800 ${Math.round(h * 0.34)}px "JetBrains Mono", monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('OCI', w / 2, h / 2);
            ctx.restore();
        }

        function drawWazuhLogo(ctx, x, y, w, h) {
            ctx.save();
            ctx.translate(x, y);
            ctx.fillStyle = '#0284c7';
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2;
            roundRect(ctx, 4, 4, w - 8, h - 8, 8);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#ffffff';
            ctx.font = `800 ${Math.round(h * 0.28)}px "JetBrains Mono", monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('SIEM', w / 2, h / 2 - 2);

            ctx.font = `600 ${Math.round(h * 0.18)}px "Inter", sans-serif`;
            ctx.fillStyle = '#7dd3fc';
            ctx.fillText('WAZUH', w / 2, h * 0.78);
            ctx.restore();
        }

        function drawLinuxLogo(ctx, x, y, w, h) {
            ctx.save();
            ctx.translate(x, y);
            ctx.fillStyle = '#1e293b';
            ctx.strokeStyle = '#4ade80';
            ctx.lineWidth = 2;
            roundRect(ctx, 4, 4, w - 8, h - 8, 6);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#4ade80';
            ctx.font = `900 ${Math.round(h * 0.42)}px "JetBrains Mono", monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('>_', w / 2, h / 2);
            ctx.restore();
        }

        function drawPostgresLogo(ctx, x, y, w, h) {
            ctx.save();
            ctx.translate(x, y);
            ctx.fillStyle = '#1e3a8a';
            ctx.strokeStyle = '#60a5fa';
            ctx.lineWidth = 2;
            roundRect(ctx, 4, 4, w - 8, h - 8, 6);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#ffffff';
            ctx.font = `900 ${Math.round(h * 0.34)}px "JetBrains Mono", monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('SQL', w / 2, h / 2);
            ctx.restore();
        }

        function drawJavaLogo(ctx, x, y, w, h) {
            ctx.save();
            ctx.translate(x, y);
            ctx.fillStyle = '#7c2d12';
            ctx.strokeStyle = '#f97316';
            ctx.lineWidth = 2;
            roundRect(ctx, 4, 4, w - 8, h - 8, 6);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#ffedd5';
            ctx.font = `900 ${Math.round(h * 0.32)}px "JetBrains Mono", monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('JAVA', w / 2, h / 2);
            ctx.restore();
        }

        function drawDatabricksLogo(ctx, x, y, w, h) {
            ctx.save();
            ctx.translate(x, y);
            ctx.fillStyle = '#7f1d1d';
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2;
            roundRect(ctx, 4, 4, w - 8, h - 8, 6);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#fca5a5';
            ctx.font = `900 ${Math.round(h * 0.34)}px "JetBrains Mono", monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('DATA', w / 2, h / 2);
            ctx.restore();
        }

        function drawAgileLogo(ctx, x, y, w, h) {
            ctx.save();
            ctx.translate(x, y);
            ctx.fillStyle = '#14532d';
            ctx.strokeStyle = '#22c55e';
            ctx.lineWidth = 2;
            roundRect(ctx, 4, 4, w - 8, h - 8, 6);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#86efac';
            ctx.font = `900 ${Math.round(h * 0.32)}px "JetBrains Mono", monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('AGILE', w / 2, h / 2);
            ctx.restore();
        }

        function drawGenericLogo(ctx, x, y, w, h, label, bg, fg) {
            ctx.save();
            ctx.translate(x, y);
            ctx.fillStyle = bg || '#1e293b';
            ctx.strokeStyle = fg || '#94a3b8';
            ctx.lineWidth = 2;
            roundRect(ctx, 4, 4, w - 8, h - 8, 6);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = fg || '#ffffff';
            ctx.font = `800 ${Math.round(h * 0.32)}px "JetBrains Mono", monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, w / 2, h / 2);
            ctx.restore();
        }

        function drawTechLogo(ctx, icon, x, y, w, h) {
            switch (icon) {
                case 'aws': return drawAwsLogo(ctx, x, y, w, h);
                case 'mit': return drawMitLogo(ctx, x, y, w, h);
                case 'isc2': return drawIsc2Logo(ctx, x, y, w, h);
                case 'google': return drawGoogleAiLogo(ctx, x, y, w, h);
                case 'mba': return drawMbaLogo(ctx, x, y, w, h);
                case 'docker': return drawDockerLogo(ctx, x, y, w, h);
                case 'python': return drawPythonLogo(ctx, x, y, w, h);
                case 'oracle': return drawOracleLogo(ctx, x, y, w, h);
                case 'wazuh': return drawWazuhLogo(ctx, x, y, w, h);
                case 'linux': return drawLinuxLogo(ctx, x, y, w, h);
                case 'postgres': return drawPostgresLogo(ctx, x, y, w, h);
                case 'java': return drawJavaLogo(ctx, x, y, w, h);
                case 'databricks': return drawDatabricksLogo(ctx, x, y, w, h);
                case 'agile': return drawAgileLogo(ctx, x, y, w, h);
                case 'shuffle': return drawGenericLogo(ctx, x, y, w, h, 'SOAR', '#701a75', '#f0abfc');
                case 'nmap': return drawGenericLogo(ctx, x, y, w, h, 'NMAP', '#134e4a', '#5eead4');
                case 'shield': return drawGenericLogo(ctx, x, y, w, h, 'ANCI', '#78350f', '#fcd34d');
                case 'infra': return drawGenericLogo(ctx, x, y, w, h, 'IAC', '#3b0764', '#d8b4fe');
                case 'jira': return drawGenericLogo(ctx, x, y, w, h, 'JIRA', '#1e3a8a', '#93c5fd');
                case 'gis': return drawGenericLogo(ctx, x, y, w, h, 'GIS', '#854d0e', '#fef08a');
                default: return drawGenericLogo(ctx, x, y, w, h, 'TECH', '#1e293b', '#e2e8f0');
            }
        }

        let activeCertIndex = 0;
        let currentCertCategory = 'all';

        const certBoardTex = canvasTexture(2048, 1216, (ctx, w, h) => {
            const grad = ctx.createLinearGradient(0, 0, w, h);
            grad.addColorStop(0, '#060a14');
            grad.addColorStop(0.5, '#0b1224');
            grad.addColorStop(1, '#070b16');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);

            // Cyber grid
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.04)';
            ctx.lineWidth = 1;
            for (let x = 0; x < w; x += 40) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, h);
                ctx.stroke();
            }
            for (let y = 0; y < h; y += 40) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(w, y);
                ctx.stroke();
            }

            // Outer bevel & neon border
            ctx.strokeStyle = '#1e293b';
            ctx.lineWidth = 6;
            ctx.strokeRect(10, 10, w - 20, h - 20);
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
            ctx.lineWidth = 2;
            ctx.strokeRect(14, 14, w - 28, h - 28);

            // 1. TOP HEADER BAR
            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            roundRect(ctx, 28, 24, w - 56, 82, 14);
            ctx.fill();
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Status LED dot
            ctx.fillStyle = '#34d399';
            ctx.shadowColor = '#34d399';
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(58, 65, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            // Header titles
            ctx.textAlign = 'left';
            ctx.fillStyle = '#38bdf8';
            ctx.font = '800 24px "JetBrains Mono", monospace';
            ctx.fillText('CERTIFICACIONES OFICIALES & STACK TECNOLÓGICO', 80, 56);
            ctx.fillStyle = '#94a3b8';
            ctx.font = '500 15px "Plus Jakarta Sans", sans-serif';
            ctx.fillText('Eduardo Cayún M. · Consultoría Estratégica, Arquitectura Cloud, Ciberseguridad & IA Aplicada', 80, 84);

            // Filter Tabs at Header Right
            const TABS = [
                { id: 'all', label: '★ Todo el Stack', x: 1090, w: 170 },
                { id: 'certs', label: '🎓 Certificaciones', x: 1275, w: 180 },
                { id: 'cloud', label: '☁ Cloud & DevOps', x: 1470, w: 180 },
                { id: 'sec', label: '🛡️ Ciberseguridad', x: 1665, w: 180 },
                { id: 'ai', label: '🤖 IA & Datos', x: 1860, w: 150 }
            ];

            TABS.forEach(t => {
                const isActive = currentCertCategory === t.id;
                ctx.save();
                if (isActive) {
                    ctx.fillStyle = 'rgba(56, 189, 248, 0.28)';
                    ctx.strokeStyle = '#38bdf8';
                    ctx.shadowColor = '#38bdf8';
                    ctx.shadowBlur = 14;
                } else {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
                }
                ctx.lineWidth = 2;
                roundRect(ctx, t.x, 38, t.w, 54, 12);
                ctx.fill();
                ctx.stroke();

                ctx.shadowBlur = 0;
                ctx.fillStyle = isActive ? '#ffffff' : '#cbd5e1';
                ctx.font = `${isActive ? '700' : '600'} 15px "Plus Jakarta Sans", sans-serif`;
                ctx.textAlign = 'center';
                ctx.fillText(t.label, t.x + t.w / 2, 71);
                ctx.restore();
            });

            // 2. VERTICAL COLUMN DIVIDER
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(1025, 125);
            ctx.lineTo(1025, 1120);
            ctx.stroke();

            // 3. LEFT COLUMN: CERTIFICACIONES Y ACREDITACIONES
            ctx.fillStyle = '#38bdf8';
            ctx.font = '800 18px "JetBrains Mono", monospace';
            ctx.textAlign = 'left';
            ctx.fillText('🎓 CERTIFICACIONES & ESPECIALIZACIONES INTERNACIONALES', 36, 148);

            CERTS_DATA.forEach((c, idx) => {
                const cardY = 170 + idx * 188;
                const isLit = (currentCertCategory === 'all' || currentCertCategory === 'certs' || currentCertCategory === c.category);
                ctx.save();
                ctx.globalAlpha = isLit ? 1.0 : 0.28;

                // Card background
                ctx.fillStyle = isLit ? 'rgba(15, 23, 42, 0.88)' : 'rgba(15, 23, 42, 0.4)';
                roundRect(ctx, 32, cardY, 965, 174, 14);
                ctx.fill();

                ctx.strokeStyle = isLit ? c.color : 'rgba(255, 255, 255, 0.08)';
                ctx.lineWidth = isLit ? 2 : 1;
                if (isLit && currentCertCategory === c.category) {
                    ctx.shadowColor = c.color;
                    ctx.shadowBlur = 12;
                }
                ctx.stroke();
                ctx.shadowBlur = 0;

                // Institution / Badge Logo
                drawTechLogo(ctx, c.icon, 52, cardY + 22, 60, 60);

                // Badge top right
                ctx.fillStyle = isLit ? c.color : '#64748b';
                ctx.font = '800 12px "JetBrains Mono", monospace';
                ctx.textAlign = 'right';
                ctx.fillText(`[ ${c.badge} · ${c.year} ]`, 975, cardY + 36);

                // Title
                ctx.textAlign = 'left';
                ctx.fillStyle = '#ffffff';
                ctx.font = '700 20px "Plus Jakarta Sans", sans-serif';
                ctx.fillText(c.title, 128, cardY + 40);

                // Institution
                ctx.fillStyle = isLit ? c.color : '#94a3b8';
                ctx.font = '600 14px "Inter", sans-serif';
                ctx.fillText(c.inst, 128, cardY + 66);

                // Description
                ctx.fillStyle = '#cbd5e1';
                ctx.font = '400 13px "Inter", sans-serif';
                wrapText(ctx, c.desc, 128, cardY + 92, 835, 18);

                // Tags
                let tagX = 128;
                c.competencies.slice(0, 4).forEach(comp => {
                    ctx.font = '600 11px "JetBrains Mono", monospace';
                    const tw = ctx.measureText(comp).width + 16;
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
                    roundRect(ctx, tagX, cardY + 138, tw, 24, 6);
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    ctx.fillStyle = '#e2e8f0';
                    ctx.fillText(comp, tagX + 8, cardY + 154);
                    tagX += tw + 8;
                });

                ctx.restore();
            });

            // 4. RIGHT COLUMN: STACK TECNOLÓGICO & HERRAMIENTAS ACTIVAS
            ctx.fillStyle = '#f472b6';
            ctx.font = '800 18px "JetBrains Mono", monospace';
            ctx.textAlign = 'left';
            ctx.fillText('⚡ ARQUITECTURA TECNOLÓGICA & HERRAMIENTAS ACTIVAS', 1045, 148);

            TECH_STACK_CATEGORIES.forEach((cat, cIdx) => {
                const boxY = 170 + cIdx * 235;
                const isCatLit = (currentCertCategory === 'all' || currentCertCategory === cat.cat);

                ctx.save();
                ctx.globalAlpha = isCatLit ? 1.0 : 0.28;

                // Category box background
                ctx.fillStyle = isCatLit ? 'rgba(15, 23, 42, 0.75)' : 'rgba(15, 23, 42, 0.3)';
                roundRect(ctx, 1040, boxY, 975, 222, 14);
                ctx.fill();
                ctx.strokeStyle = isCatLit ? cat.color : 'rgba(255, 255, 255, 0.08)';
                ctx.lineWidth = isCatLit && currentCertCategory === cat.cat ? 2.5 : 1;
                ctx.stroke();

                // Category Header
                ctx.fillStyle = cat.color;
                ctx.font = '800 14px "JetBrains Mono", monospace';
                ctx.fillText(`● ${cat.title}`, 1060, boxY + 28);

                // Tech chips row
                const chipCount = cat.items.length;
                const chipW = Math.floor((975 - 36 - (chipCount - 1) * 12) / chipCount);
                cat.items.forEach((item, iIdx) => {
                    const chipX = 1058 + iIdx * (chipW + 12);
                    const chipY = boxY + 44;
                    const chipH = 162;

                    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
                    roundRect(ctx, chipX, chipY, chipW, chipH, 10);
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
                    ctx.lineWidth = 1;
                    ctx.stroke();

                    // Logo in chip
                    const logoSize = Math.min(50, chipW - 24);
                    drawTechLogo(ctx, item.icon, chipX + (chipW - logoSize) / 2, chipY + 16, logoSize, logoSize);

                    // Name
                    ctx.fillStyle = '#ffffff';
                    ctx.font = '700 14px "Plus Jakarta Sans", sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(item.name, chipX + chipW / 2, chipY + 98);

                    // Desc
                    ctx.fillStyle = '#94a3b8';
                    ctx.font = '500 11px "Inter", sans-serif';
                    ctx.fillText(item.desc, chipX + chipW / 2, chipY + 122);
                    ctx.textAlign = 'left';
                });

                ctx.restore();
            });

            // 5. FOOTER BANNER
            ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
            roundRect(ctx, 32, 1135, w - 64, 56, 12);
            ctx.fill();
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.font = '700 15px "JetBrains Mono", monospace';
            ctx.fillStyle = '#7dd3fc';
            ctx.textAlign = 'center';
            ctx.fillText('🔍 CLIC EN LA PIZARRA PARA VER DETALLES DE CERTIFICACIONES · O SELECCIONA UNA PESTAÑA PARA FILTRAR EL STACK ↗', w / 2, 1170);
            ctx.textAlign = 'left';
        });

        // 3D Whiteboard Mesh Assembly on Left Wall
        const certBoard = new THREE.Group();
        certBoard.position.set(-5.96, 2.85, 1.05);
        certBoard.rotation.y = Math.PI / 2;
        scene.add(certBoard);

        // Soft ambient cyan/indigo wall wash
        glowPlane(3.6, 2.3, '56,189,248', 0.45, [0, 0, -0.015], null, certBoard, true);
        glowPlane(2.8, 1.8, '168,85,247', 0.25, [0, 0, -0.012], null, certBoard, true);

        // Dark obsidian chassis / frame
        addMesh(new THREE.BoxGeometry(3.24, 1.94, 0.04), std(0x0e111a, 0.3, 0.8), [0, 0, 0.01], certBoard);

        // Chrome wall standoffs (4 corner mounts)
        addMesh(new THREE.CylinderGeometry(0.028, 0.028, 0.05, 16), std(0xe2e8f0, 0.1, 0.95), [1.54, 0.89, 0.025], certBoard, { rot: [Math.PI / 2, 0, 0] });
        addMesh(new THREE.CylinderGeometry(0.028, 0.028, 0.05, 16), std(0xe2e8f0, 0.1, 0.95), [-1.54, 0.89, 0.025], certBoard, { rot: [Math.PI / 2, 0, 0] });
        addMesh(new THREE.CylinderGeometry(0.028, 0.028, 0.05, 16), std(0xe2e8f0, 0.1, 0.95), [1.54, -0.89, 0.025], certBoard, { rot: [Math.PI / 2, 0, 0] });
        addMesh(new THREE.CylinderGeometry(0.028, 0.028, 0.05, 16), std(0xe2e8f0, 0.1, 0.95), [-1.54, -0.89, 0.025], certBoard, { rot: [Math.PI / 2, 0, 0] });

        // Interactive Whiteboard Face
        const boardMesh = addMesh(
            new THREE.PlaneGeometry(3.2, 1.9),
            std(0xffffff, 0.45, 0.05, { map: certBoardTex, emissive: 0xffffff, emissiveMap: certBoardTex, emissiveIntensity: 0.42 }),
            [0, 0, 0.032],
            certBoard,
            { station: 'certifications', cast: false }
        );
        boardMesh.userData.isCertBoard = true;

        // Specular glass sheen
        addMesh(new THREE.PlaneGeometry(3.2, 1.9), basic({ color: 0xffffff, transparent: true, opacity: 0.05, depthWrite: false }), [0, 0, 0.035], certBoard, { station: 'certifications', cast: false });

        // Marker Tray at the bottom
        addMesh(new THREE.BoxGeometry(2.2, 0.025, 0.14), std(0x1a1e2b, 0.4, 0.7), [0, -0.98, 0.08], certBoard);
        addMesh(new THREE.BoxGeometry(2.22, 0.006, 0.015), std(0x38bdf8, 0.2, 0.9), [0, -0.965, 0.145], certBoard, { cast: false });

        // Stylus pens & magnetic eraser
        addMesh(new THREE.CylinderGeometry(0.01, 0.01, 0.18, 12), basic({ color: 0x38bdf8 }), [-0.45, -0.965, 0.08], certBoard, { rot: [0, 0, Math.PI / 2] });
        addMesh(new THREE.CylinderGeometry(0.01, 0.01, 0.18, 12), basic({ color: 0xf472b6 }), [-0.22, -0.965, 0.08], certBoard, { rot: [0, 0, Math.PI / 2] });
        addMesh(new THREE.CylinderGeometry(0.01, 0.01, 0.18, 12), basic({ color: 0x34d399 }), [0.02, -0.965, 0.08], certBoard, { rot: [0, 0, Math.PI / 2] });
        addMesh(new THREE.CylinderGeometry(0.01, 0.01, 0.18, 12), basic({ color: 0xfbbf24 }), [0.25, -0.965, 0.08], certBoard, { rot: [0, 0, Math.PI / 2] });
        addMesh(new THREE.BoxGeometry(0.18, 0.032, 0.07), std(0x2d3345, 0.7, 0.2), [0.55, -0.96, 0.08], certBoard);

        // Dedicated Point Light
        const certLight = new THREE.PointLight(0x7dd3fc, 0.85, 4.8, 2);
        certLight.position.set(0, 0.3, 0.8);
        certBoard.add(certLight);

        // Modal wiring
        const certModal = document.getElementById('cert-inspector-modal');
        const certTagBadge = document.getElementById('cert-tag-badge');
        const certIndexBadge = document.getElementById('cert-index-badge');
        const certModalIcon = document.getElementById('cert-modal-icon');
        const certModalYear = document.getElementById('cert-modal-year');
        const certModalTitle = document.getElementById('cert-modal-title');
        const certModalInst = document.getElementById('cert-modal-inst');
        const certModalDesc = document.getElementById('cert-modal-desc');
        const certModalTags = document.getElementById('cert-modal-tags');
        const certModalCode = document.getElementById('cert-modal-code');
        const certCloseBtn = document.getElementById('cert-close-btn');
        const certPrevBtn = document.getElementById('cert-prev-btn');
        const certNextBtn = document.getElementById('cert-next-btn');

        function updateCertModal(idx) {
            activeCertIndex = (idx % CERTS_DATA.length + CERTS_DATA.length) % CERTS_DATA.length;
            const c = CERTS_DATA[activeCertIndex];
            if (certTagBadge) {
                certTagBadge.textContent = c.badge;
                certTagBadge.style.color = c.color;
                certTagBadge.style.borderColor = c.color;
            }
            if (certIndexBadge) certIndexBadge.textContent = `${activeCertIndex + 1} / ${CERTS_DATA.length}`;
            if (certModalIcon) {
                certModalIcon.textContent = c.badge.slice(0, 3);
                certModalIcon.style.color = c.color;
                certModalIcon.style.borderColor = c.color;
            }
            if (certModalYear) certModalYear.textContent = c.year;
            if (certModalTitle) certModalTitle.textContent = c.title;
            if (certModalInst) certModalInst.textContent = c.inst;
            if (certModalDesc) certModalDesc.textContent = c.desc;
            if (certModalCode) certModalCode.textContent = c.code;

            if (certModalTags) {
                certModalTags.innerHTML = '';
                c.competencies.forEach((comp) => {
                    const pill = document.createElement('span');
                    pill.className = 'px-2 py-0.5 rounded bg-white/10 text-slate-200 border border-white/15';
                    pill.textContent = comp;
                    certModalTags.appendChild(pill);
                });
            }
        }

        function openCertInspector(idx = 0) {
            updateCertModal(idx);
            if (certModal) {
                certModal.classList.remove('hidden');
                requestAnimationFrame(() => {
                    certModal.classList.remove('opacity-0', 'translate-y-4', 'scale-95');
                    certModal.classList.add('opacity-100', 'translate-y-0', 'scale-100');
                });
            }
        }

        function closeCertInspector() {
            if (!certModal || certModal.classList.contains('hidden')) return;
            certModal.classList.remove('opacity-100', 'translate-y-0', 'scale-100');
            certModal.classList.add('opacity-0', 'translate-y-4', 'scale-95');
            setTimeout(() => {
                if (certModal && certModal.classList.contains('opacity-0')) {
                    certModal.classList.add('hidden');
                }
            }, 300);
        }

        if (certCloseBtn) certCloseBtn.addEventListener('click', closeCertInspector);
        if (certPrevBtn) certPrevBtn.addEventListener('click', () => {
            playTechClickSound(750, 0.05);
            updateCertModal(activeCertIndex - 1);
        });
        if (certNextBtn) certNextBtn.addEventListener('click', () => {
            playTechClickSound(950, 0.05);
            updateCertModal(activeCertIndex + 1);
        });

        window.eduCertSystem = {
            openInspector: openCertInspector,
            closeInspector: closeCertInspector,
            next: () => updateCertModal(activeCertIndex + 1),
            prev: () => updateCertModal(activeCertIndex - 1),
            setCategory: (cat) => {
                currentCertCategory = cat;
                playTechClickSound(980, 0.05);
                if (certBoardTex && certBoardTex.userData && certBoardTex.userData.redraw) {
                    certBoardTex.userData.redraw();
                }
            }
        };

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
        pegboard.position.set(4.52, 2.9, -4.97);
        scene.add(pegboard);
        glowPlane(3.8, 2.9, '210,225,255', 0.85, [0, 0, -0.012], null, pegboard, true);
        addMesh(new THREE.BoxGeometry(2.76, 1.75, 0.05), std(0xffffff, 0.8, 0.1, { map: pegTex }), [0, 0, 0.025], pegboard, { station: 'credentials' });
        const pegLight = new THREE.PointLight(0xdbeafe, 0.8, 4.5, 2);
        pegLightRef = pegLight;
        pegLight.position.set(0, 0, 0.9);
        pegboard.add(pegLight);

        const BADGES = [
            {
                company: 'TIERRA AYNI',
                role: 'Jefe Proyectos & Sec',
                dates: '2018 – Presente',
                scope: 'PSE · ANCI · Cloud AWS',
                c: '#10b981',
                glow: 'rgba(16, 185, 129, 0.35)',
                tag: 'LÍDER TI & SEC',
                cvRoleTitle: 'Jefe de Proyectos y Delegado de Ciberseguridad',
                cvPeriod: 'Ago 2018 – Presente (+6 Años)',
                cvCategory: 'Liderazgo Estratégico · Misión Crítica',
                cvKeyProjects: [
                    {
                        title: 'Gobernanza Ciberseguridad & ANCI',
                        desc: 'Asesor técnico y legal de gerencia; alineación Ley Marco como Prestador de Servicios Esenciales (PSE).'
                    },
                    {
                        title: 'SecOps: Wazuh (SIEM) + Shuffle (SOAR)',
                        desc: 'Visibilidad de endpoints/servidores y automatización de respuesta a incidentes (IR).'
                    },
                    {
                        title: 'Arquitectura Cloud ANDE Paraguay',
                        desc: 'Diseño e implementación de infraestructura escalable de alta disponibilidad y resiliencia en AWS.'
                    },
                    {
                        title: 'Líder Técnico Proyecto UNIS (Gasvalpo)',
                        desc: 'Dirección e integración de sistemas core con arquitectura GIS corporativa.'
                    },
                    {
                        title: 'Auditoría Red Team & Vulnerabilidades',
                        desc: 'Mapeo continuo de superficie de ataque y validación en entornos Linux/Nmap.'
                    }
                ],
                stack: ['AWS Cloud', 'Wazuh SIEM', 'Shuffle SOAR', 'Ley Marco PSE', 'Red Team', 'GE Smallworld']
            },
            {
                company: 'SENTRA',
                role: 'Ingeniero Software',
                dates: '2016 – 2018',
                scope: 'BCI · Falabella · BcoEstado',
                c: '#38bdf8',
                glow: 'rgba(56, 189, 248, 0.35)',
                tag: 'BANCA & RETAIL',
                cvRoleTitle: 'Ingeniero de Software Senior',
                cvPeriod: 'Ago 2016 – Jul 2018 (2 Años)',
                cvCategory: 'Banca Transaccional & Seguridad',
                cvKeyProjects: [
                    {
                        title: 'Motor de Pagos Banco BCI',
                        desc: 'Resolución de vulnerabilidades críticas en el core de pagos y transacciones bancarias.'
                    },
                    {
                        title: 'Seguridad Falabella Financiero Arg',
                        desc: 'Sistema anti-fuerza bruta y ataques de diccionario con Java y Oracle Service Bus (OSB).'
                    },
                    {
                        title: 'Sistema OPF v1 BancoEstado',
                        desc: 'Levantamiento y programación con capacitación a células ágiles en test automation (JMeter, SoapUI).'
                    }
                ],
                stack: ['Java EE', 'Oracle OSB', 'Banca Transaccional', 'JMeter', 'SoapUI', 'TestLink']
            },
            {
                company: 'PORVENIR',
                role: 'Analista Arq & Dev',
                dates: 'Feb – Ago 2016',
                scope: 'AWS · SISEG · PostgreSQL',
                c: '#f59e0b',
                glow: 'rgba(245, 158, 11, 0.35)',
                tag: 'SEGUROS & ERP',
                cvRoleTitle: 'Analista de Arquitectura y Programador',
                cvPeriod: 'Feb 2016 – Ago 2016',
                cvCategory: 'Arquitectura Cloud & Core Asegurador',
                cvKeyProjects: [
                    {
                        title: 'Núcleo Transaccional SISEG en AWS',
                        desc: 'Levantamiento de la arquitectura JEE para el núcleo transaccional en la nube.'
                    },
                    {
                        title: 'Modelado Relacional PostgreSQL',
                        desc: 'Diseño de base de datos relacional para alto volumen transaccional concurrente.'
                    },
                    {
                        title: 'Personalización ERP Adempiere',
                        desc: 'Implementación y adaptación de flujos operacionales y de gestión financiera.'
                    }
                ],
                stack: ['AWS Cloud', 'Java EE / SISEG', 'PostgreSQL', 'ERP Adempiere', 'SOA']
            },
            {
                company: 'CONTRALORÍA',
                role: 'Analista Programador',
                dates: '2012 – 2015',
                scope: 'SICA v3/v4 · Oracle SOA',
                c: '#818cf8',
                glow: 'rgba(129, 140, 248, 0.35)',
                tag: 'GOBIERNO & CGR',
                cvRoleTitle: 'Analista Programador SICA',
                cvPeriod: 'May 2012 – Sep 2015 (3.5 Años)',
                cvCategory: 'Sistemas Estatales de Fiscalización',
                cvKeyProjects: [
                    {
                        title: 'Sistema SICA v3 y v4 (Auditorías CGR)',
                        desc: 'Desarrollo del sistema central de control de auditorías con Oracle ADF, EJB 3 y JPA.'
                    },
                    {
                        title: 'Integración Estatal SOA (SIAPER & ASTREA)',
                        desc: 'Interconexión de bases de datos y servicios de control de legalidad del Estado.'
                    },
                    {
                        title: 'Despliegue Internacional PY & UY',
                        desc: 'Adaptación tecnológica e interoperabilidad para entidades de Paraguay y Uruguay.'
                    }
                ],
                stack: ['Oracle ADF', 'Oracle SOA Suite', 'EJB 3 / JPA', 'Oracle DB', 'WebLogic', 'Chile · PY · UY']
            },
            {
                company: 'ACCENTURE',
                role: 'Ingeniero Software',
                dates: '2011 – 2012',
                scope: 'QA & Auto UNIX · JEE',
                c: '#a855f7',
                glow: 'rgba(168, 85, 247, 0.35)',
                tag: 'CONSULTORÍA TI',
                cvRoleTitle: 'Ingeniero de Software & QA Automation',
                cvPeriod: 'Nov 2011 – May 2012',
                cvCategory: 'Consultoría TI & Telecomunicaciones',
                cvKeyProjects: [
                    {
                        title: 'QA Misión Crítica Entel Telecom',
                        desc: 'Control de calidad de software y auditoría de requerimientos de alta demanda.'
                    },
                    {
                        title: 'Automatización de Entornos UNIX',
                        desc: 'Creación de plataforma automatizada conectada remotamente a servidores UNIX vía JSCH/Zehon.'
                    },
                    {
                        title: 'Aplicativos JEE y Framework Struts',
                        desc: 'Desarrollo y refactorización sobre stack Java empresarial.'
                    }
                ],
                stack: ['QA Automation', 'UNIX Remote', 'Java EE / Struts', 'JSCH / Zehon', 'Telecom Core']
            },
            {
                company: 'EVERIS / NTT',
                role: 'Consultor TI',
                dates: '2010 – 2011',
                scope: 'SIGFE 2 · Min. Hacienda',
                c: '#06b6d4',
                glow: 'rgba(6, 182, 212, 0.35)',
                tag: 'HACIENDA PÚBLICA',
                cvRoleTitle: 'Consultor TI · Gestión Financiera del Estado',
                cvPeriod: 'Jun 2010 – Ago 2011',
                cvCategory: 'Hacienda Pública & Presupuesto Nacional',
                cvKeyProjects: [
                    {
                        title: 'SIGFE 2 (Min. Hacienda / DIPRES)',
                        desc: 'Desarrollo en el módulo de administración de contenidos del sistema financiero del Estado.'
                    },
                    {
                        title: 'Arquitectura Oracle ADF & WebLogic',
                        desc: 'Desarrollo multicapa con EJB 3, JPA y servicios en Oracle Application Server.'
                    },
                    {
                        title: 'Reglas de Negocio Presupuestarias',
                        desc: 'Validaciones contables y presupuestarias para ministerios y servicios públicos.'
                    }
                ],
                stack: ['SIGFE 2', 'DIPRES Hacienda', 'Oracle ADF', 'EJB 3 / JPA', 'Oracle WebLogic']
            }
        ];
        const badgeList = [];
        BADGES.forEach((b, i) => {
            // Front Face Texture (512x720) with Eduardo's Photo
            const frontTex = canvasTexture(512, 720, (ctx, w, h) => {
                const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
                bgGrad.addColorStop(0, '#ffffff');
                bgGrad.addColorStop(1, '#f8fafc');
                ctx.fillStyle = bgGrad;
                ctx.fillRect(0, 0, w, h);

                // Top company brand header banner
                ctx.fillStyle = b.c;
                ctx.fillRect(0, 0, w, 88);

                // Clip slit cutout
                ctx.fillStyle = '#ffffff';
                roundRect(ctx, w / 2 - 36, 12, 72, 12, 6);
                ctx.fill();

                // Header tag
                ctx.save();
                ctx.font = '800 17px "JetBrains Mono", monospace';
                ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
                ctx.shadowBlur = 6;
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.fillText(b.tag, w / 2, 66);
                ctx.restore();

                // Circular avatar with Eduardo's photo - prominent & high definition
                const avatarCx = w / 2;
                const avatarCy = 212;
                const avatarR = 118; // Large circular avatar: 236px diameter (46% width of card!)

                // Soft ambient drop-shadow under avatar circle
                ctx.save();
                ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
                ctx.shadowBlur = 18;
                ctx.shadowOffsetY = 6;
                ctx.beginPath();
                ctx.arc(avatarCx, avatarCy, avatarR + 4, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
                ctx.restore();

                // Photo clip
                ctx.save();
                ctx.beginPath();
                ctx.arc(avatarCx, avatarCy, avatarR, 0, Math.PI * 2);
                ctx.clip();

                if (portraitImg && portraitImg.complete && portraitImg.naturalWidth > 0) {
                    const nw = portraitImg.naturalWidth;
                    const nh = portraitImg.naturalHeight;
                    const cropSize = Math.min(nw, nh);
                    const sx = Math.max(0, (nw - cropSize) / 2);
                    const sy = Math.max(0, Math.min(nh - cropSize, (nh - cropSize) * 0.22));
                    ctx.drawImage(portraitImg, sx, sy, cropSize, cropSize, avatarCx - avatarR, avatarCy - avatarR, avatarR * 2, avatarR * 2);
                } else {
                    ctx.fillStyle = '#f1f5f9';
                    ctx.fillRect(avatarCx - avatarR, avatarCy - avatarR, avatarR * 2, avatarR * 2);
                    ctx.fillStyle = b.c;
                    ctx.font = '800 48px "Plus Jakarta Sans", sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText('EC', avatarCx, avatarCy + 16);
                }
                ctx.restore();

                // Outer borders: Executive dual ring (pure white inner rim + badge color outer rim)
                ctx.beginPath();
                ctx.arc(avatarCx, avatarCy, avatarR, 0, Math.PI * 2);
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 8;
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(avatarCx, avatarCy, avatarR + 3, 0, Math.PI * 2);
                ctx.strokeStyle = b.c;
                ctx.lineWidth = 6;
                ctx.stroke();

                // Holographic NFC Chip on top-right of badge
                ctx.save();
                const chipX = w - 74;
                const chipY = 104;
                ctx.fillStyle = 'rgba(241, 245, 249, 0.95)';
                roundRect(ctx, chipX, chipY, 44, 32, 6);
                ctx.fill();
                ctx.strokeStyle = '#cbd5e1';
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.strokeStyle = '#94a3b8';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(chipX + 8, chipY + 16); ctx.lineTo(chipX + 36, chipY + 16);
                ctx.moveTo(chipX + 18, chipY + 6); ctx.lineTo(chipX + 18, chipY + 26);
                ctx.moveTo(chipX + 26, chipY + 6); ctx.lineTo(chipX + 26, chipY + 26);
                ctx.stroke();
                ctx.restore();

                // Active / Verified status badge dot (Bottom-right corner of circle)
                const dotAngle = Math.PI * 0.25;
                const dotX = avatarCx + Math.cos(dotAngle) * (avatarR + 2);
                const dotY = avatarCy + Math.sin(dotAngle) * (avatarR + 2);
                ctx.save();
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(dotX, dotY, 20, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#10b981';
                ctx.beginPath();
                ctx.arc(dotX, dotY, 15.5, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.font = '900 13px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('✓', dotX, dotY + 4.5);
                ctx.restore();

                // Company Name (Deep contrast bold branding)
                ctx.textAlign = 'center';
                ctx.fillStyle = '#090d16';
                ctx.font = '900 36px "Plus Jakarta Sans", sans-serif';
                ctx.fillText(b.company, w / 2, 380);

                // Role / Position (High contrast executive typography)
                ctx.fillStyle = '#0f172a';
                ctx.font = '800 23px "Plus Jakarta Sans", sans-serif';
                ctx.fillText(b.role, w / 2, 418);

                // Dates (Clear tech monospaced format)
                ctx.fillStyle = '#1e293b';
                ctx.font = '800 21px "JetBrains Mono", monospace';
                ctx.fillText(b.dates, w / 2, 452);

                // Key Scope / Clients (Readable sans-serif)
                ctx.fillStyle = '#334155';
                ctx.font = '700 19px "Plus Jakarta Sans", sans-serif';
                ctx.fillText(b.scope, w / 2, 484);

                // Security Barcode at bottom
                ctx.fillStyle = '#090d16';
                const barcodeY = 516;
                const barcodeH = 38;
                const seedBars = [4, 7, 2, 6, 8, 4, 2, 7, 3, 6, 2, 8, 6, 3, 7, 2, 4, 6, 8, 3, 7, 2, 6, 3, 5, 2, 8, 4];
                let curX = 58;
                seedBars.forEach((bw) => {
                    ctx.fillRect(curX, barcodeY, bw, barcodeH);
                    curX += bw + 5;
                });

                ctx.font = '800 15px "JetBrains Mono", monospace';
                ctx.fillStyle = '#475569';
                ctx.fillText(`ID-PASS · ${b.company.slice(0, 4)}-${2026 - i}`, w / 2, 576);

                // Interactive cue button pill (Solid prominent accent pill)
                ctx.fillStyle = b.c;
                roundRect(ctx, 32, 608, w - 64, 58, 14);
                ctx.fill();

                ctx.save();
                ctx.font = '900 18px "JetBrains Mono", monospace';
                ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
                ctx.shadowBlur = 4;
                ctx.fillStyle = '#ffffff';
                ctx.fillText('↺ CLIC PARA VER PROYECTOS', w / 2, 645);
                ctx.restore();

                ctx.textAlign = 'left';
            });
            badgeFrontTextures.push(frontTex);

            // Back Face Texture (512x720) with CV Role & Projects
            const backTex = canvasTexture(512, 720, (ctx, w, h) => {
                const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
                bgGrad.addColorStop(0, '#111827');
                bgGrad.addColorStop(1, '#070a13');
                ctx.fillStyle = bgGrad;
                ctx.fillRect(0, 0, w, h);

                // Top accent header
                ctx.fillStyle = b.c;
                ctx.fillRect(0, 0, w, 70);

                // Clip slit cutout
                ctx.fillStyle = '#070a13';
                roundRect(ctx, w / 2 - 40, 14, 80, 14, 7);
                ctx.fill();

                // Top banner title
                ctx.font = '800 16px "JetBrains Mono", monospace';
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.fillText(`${b.company} · PROYECTOS & CV`, w / 2, 52);

                // Section Box: ROL MÁS IMPORTANTE SEGÚN CV
                ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                roundRect(ctx, 24, 86, w - 48, 114, 12);
                ctx.fill();
                ctx.strokeStyle = b.c;
                ctx.lineWidth = 1.5;
                ctx.stroke();

                ctx.textAlign = 'left';
                ctx.font = '800 12px "JetBrains Mono", monospace';
                ctx.fillStyle = b.c;
                ctx.fillText('★ ROL PRINCIPAL SEGÚN CV:', 40, 112);

                ctx.font = '800 18px "Plus Jakarta Sans", sans-serif';
                ctx.fillStyle = '#ffffff';
                wrapText(ctx, b.cvRoleTitle, 40, 138, w - 80, 22);

                ctx.font = '600 13px "JetBrains Mono", monospace';
                ctx.fillStyle = '#94a3b8';
                ctx.fillText(`${b.cvPeriod} · ${b.cvCategory}`, 40, 184);

                // Section Title: DETALLE DE PROYECTOS
                ctx.font = '800 14px "JetBrains Mono", monospace';
                ctx.fillStyle = '#f8fafc';
                ctx.fillText('⚡ DETALLE DE PROYECTOS & LOGROS:', 28, 228);

                let curY = 256;
                b.cvKeyProjects.slice(0, 4).forEach((proj) => {
                    ctx.fillStyle = b.c;
                    ctx.beginPath();
                    ctx.arc(36, curY - 5, 4.5, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.font = '700 15px "Plus Jakarta Sans", sans-serif';
                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(proj.title, 50, curY);

                    ctx.font = '400 13px "Inter", sans-serif';
                    ctx.fillStyle = '#cbd5e1';
                    const nextY = wrapText(ctx, proj.desc, 50, curY + 18, w - 76, 17);
                    curY = nextY + 16;
                });

                // Stack tags at bottom
                ctx.font = '800 12px "JetBrains Mono", monospace';
                ctx.fillStyle = '#94a3b8';
                ctx.fillText('STACK & TECNOLOGÍAS:', 28, 620);

                let chipX = 28;
                const chipY = 630;
                b.stack.forEach((st) => {
                    ctx.font = '600 11px "JetBrains Mono", monospace';
                    const tw = ctx.measureText(st).width;
                    if (chipX + tw + 18 > w - 24) return;
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
                    roundRect(ctx, chipX, chipY, tw + 14, 22, 5);
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                    ctx.lineWidth = 1;
                    ctx.stroke();

                    ctx.fillStyle = '#e2e8f0';
                    ctx.fillText(st, chipX + 7, chipY + 15);
                    chipX += tw + 18;
                });

                // Flip cue pill at bottom
                ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
                roundRect(ctx, 28, 664, w - 56, 42, 10);
                ctx.fill();
                ctx.strokeStyle = b.c;
                ctx.lineWidth = 1.5;
                ctx.stroke();

                ctx.textAlign = 'center';
                ctx.font = '800 13px "JetBrains Mono", monospace';
                ctx.fillStyle = b.c;
                ctx.fillText('↺ CLIC PARA VOLTEAR CREDENCIAL', w / 2, 690);

                ctx.textAlign = 'left';
            });

            const x = -1.075 + i * 0.43;
            const pivot = new THREE.Group();
            pivot.position.set(x, 0.62, 0.07);
            pegboard.add(pivot);

            addMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 6), std(0xcbd5e1, 0.3, 0.8), [0, 0, 0.02], pivot, { rot: [Math.PI / 2, 0, 0], cast: false });
            addMesh(new THREE.BoxGeometry(0.038, 0.62, 0.005), std(new THREE.Color(b.c), 0.6), [0, -0.31, 0.03], pivot, { cast: false });

            // Card holder rotating group for 180° flip
            const cardHolder = new THREE.Group();
            cardHolder.position.set(0, -0.84, 0.04);
            pivot.add(cardHolder);

            // Front face plane
            const frontMesh = addMesh(new THREE.PlaneGeometry(0.33, 0.465), std(0xffffff, 0.6, 0, {
                map: frontTex,
                emissive: 0xffffff,
                emissiveMap: frontTex,
                emissiveIntensity: 0.32
            }), [0, 0, 0.006], cardHolder, {
                cast: false,
                station: 'badge'
            });
            frontMesh.userData.badgeIndex = i;
            frontMesh.renderOrder = 2;
            frontMesh.material.polygonOffset = true;
            frontMesh.material.polygonOffsetFactor = -1;
            frontMesh.material.polygonOffsetUnits = -1;

            // Back face plane (facing backward)
            const backMesh = addMesh(new THREE.PlaneGeometry(0.33, 0.465), std(0xffffff, 0.6, 0, {
                map: backTex,
                emissive: 0xffffff,
                emissiveMap: backTex,
                emissiveIntensity: 0.32
            }), [0, 0, -0.006], cardHolder, {
                rot: [0, Math.PI, 0],
                cast: false,
                station: 'badge'
            });
            backMesh.userData.badgeIndex = i;
            backMesh.renderOrder = 2;
            backMesh.material.polygonOffset = true;
            backMesh.material.polygonOffsetFactor = -1;
            backMesh.material.polygonOffsetUnits = -1;

            // Acrylic dark core for realistic card thickness (subtly recessed so front and back faces never z-fight)
            addMesh(new THREE.BoxGeometry(0.324, 0.458, 0.004), std(0x0a0d14, 0.4, 0.3), [0, 0, 0], cardHolder, { cast: false });

            // Top lanyard clip
            addMesh(new THREE.BoxGeometry(0.065, 0.026, 0.016), std(0xd1d5db, 0.2, 0.9), [0, 0.235, 0], cardHolder, { cast: false });

            badgeList.push({
                pivot,
                cardHolder,
                phase: i * 0.9,
                isFlipped: false,
                currentRotY: 0,
                targetRotY: 0,
                wobble: 0
            });
        });

        /* ---------------------------------------------------------
           CREDENTIAL INSPECTOR SYSTEM & SOUNDS
        --------------------------------------------------------- */
        function playBadgeFlipSound() {
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                const ctx = new AudioCtx();
                if (ctx.state === 'suspended') ctx.resume();
                const now = ctx.currentTime;

                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                const filter = ctx.createBiquadFilter();

                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(1400, now);
                filter.frequency.exponentialRampToValueAtTime(350, now + 0.1);

                osc.type = 'triangle';
                osc.frequency.setValueAtTime(480, now);
                osc.frequency.exponentialRampToValueAtTime(240, now + 0.1);

                gain.gain.setValueAtTime(0.001, now);
                gain.gain.linearRampToValueAtTime(0.12, now + 0.015);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

                osc.connect(filter);
                filter.connect(gain);
                gain.connect(ctx.destination);

                osc.start(now);
                osc.stop(now + 0.1);
            } catch (e) { }
        }

        let activeBadgeIdx = 0;
        const inspectorModal = document.getElementById('credential-inspector-modal');
        const flipCard = document.getElementById('cred-flip-card');
        const tagBadge = document.getElementById('cred-tag-badge');
        const indexBadge = document.getElementById('cred-index-badge');
        const frontTag = document.getElementById('cred-front-tag');
        const frontAccentBar = document.getElementById('cred-front-accent-bar');
        const avatarRing = document.getElementById('cred-avatar-ring');
        const frontCompany = document.getElementById('cred-front-company');
        const frontRole = document.getElementById('cred-front-role');
        const frontDates = document.getElementById('cred-front-dates');
        const frontScope = document.getElementById('cred-front-scope');
        const frontPassId = document.getElementById('cred-front-pass-id');
        const backAccentBar = document.getElementById('cred-back-accent-bar');
        const backHeader = document.getElementById('cred-back-header');
        const backCvRole = document.getElementById('cred-back-cv-role');
        const backPeriodCat = document.getElementById('cred-back-period-cat');
        const backProjectsList = document.getElementById('cred-back-projects-list');
        const backStackList = document.getElementById('cred-back-stack-list');
        const mainFlipBtn = document.getElementById('cred-main-flip-btn');
        const credHint = document.getElementById('stage-credentials-hint');

        function updateInspectorDOM(idx) {
            const b = BADGES[idx];
            if (!b) return;
            activeBadgeIdx = idx;

            if (inspectorModal) {
                inspectorModal.style.setProperty('--cred-color', b.c);
                inspectorModal.style.setProperty('--cred-glow', b.glow);
            }

            if (tagBadge) {
                tagBadge.textContent = b.tag;
                tagBadge.style.color = b.c;
                tagBadge.style.borderColor = b.c;
            }
            if (indexBadge) indexBadge.textContent = `${idx + 1} / ${BADGES.length}`;
            if (frontTag) frontTag.textContent = b.tag;
            if (frontAccentBar) frontAccentBar.style.background = b.c;
            if (avatarRing) {
                avatarRing.style.borderColor = b.c;
                avatarRing.style.boxShadow = `0 0 18px ${b.glow}`;
            }
            if (frontCompany) frontCompany.textContent = b.company;
            if (frontRole) {
                frontRole.textContent = b.role;
                frontRole.style.color = b.c;
            }
            if (frontDates) frontDates.textContent = b.dates;
            if (frontScope) frontScope.textContent = b.scope;
            if (frontPassId) frontPassId.textContent = `ID-PASS · ${b.company.slice(0, 4)}-${2026 - idx}`;

            if (backAccentBar) backAccentBar.style.background = b.c;
            if (backHeader) backHeader.textContent = `${b.company} · PROYECTOS & CV`;
            if (backCvRole) backCvRole.textContent = b.cvRoleTitle;
            if (backPeriodCat) backPeriodCat.textContent = `${b.cvPeriod} · ${b.cvCategory}`;

            if (backProjectsList) {
                backProjectsList.innerHTML = b.cvKeyProjects.map((p) => `
                    <div class="cred-project-item">
                        <span class="cred-project-dot" style="color: ${b.c}">•</span>
                        <div class="cred-project-text">
                            <strong>${p.title}:</strong> ${p.desc}
                        </div>
                    </div>
                `).join('');
            }

            if (backStackList) {
                backStackList.innerHTML = b.stack.map((st) => `
                    <span class="cred-stack-pill">${st}</span>
                `).join('');
            }

            if (mainFlipBtn) {
                mainFlipBtn.style.background = b.c;
                mainFlipBtn.style.boxShadow = `0 0 12px ${b.glow}`;
            }
        }

        function openInspector(idx, flipped) {
            updateInspectorDOM(idx);
            if (flipCard) {
                if (flipped) flipCard.classList.add('is-flipped');
                else flipCard.classList.remove('is-flipped');
            }
            if (inspectorModal) {
                inspectorModal.classList.remove('hidden');
                requestAnimationFrame(() => {
                    inspectorModal.classList.remove('opacity-0', 'translate-y-4', 'scale-95');
                    inspectorModal.classList.add('opacity-100', 'translate-y-0', 'scale-100');
                });
            }
        }

        function closeInspector() {
            if (!inspectorModal) return;
            inspectorModal.classList.remove('opacity-100', 'translate-y-0', 'scale-100');
            inspectorModal.classList.add('opacity-0', 'translate-y-4', 'scale-95');
            setTimeout(() => {
                inspectorModal.classList.add('hidden');
            }, 250);
        }

        function flipBadge(idx) {
            const b = badgeList[idx];
            if (!b) return;
            b.isFlipped = !b.isFlipped;
            b.targetRotY = b.isFlipped ? Math.PI : 0;
            b.wobble = 0.09;
            playBadgeFlipSound();
            openInspector(idx, b.isFlipped);
        }

        window.eduBadgeSystem = {
            flipBadge,
            openInspector,
            closeInspector,
            getBadges: () => badgeList,
            BADGES,
            nextBadge() {
                const nextIdx = (activeBadgeIdx + 1) % BADGES.length;
                updateInspectorDOM(nextIdx);
                const b = badgeList[nextIdx];
                if (b && flipCard) {
                    if (flipCard.classList.contains('is-flipped')) {
                        b.isFlipped = true;
                        b.targetRotY = Math.PI;
                    }
                }
                playBadgeFlipSound();
            },
            prevBadge() {
                const prevIdx = (activeBadgeIdx - 1 + BADGES.length) % BADGES.length;
                updateInspectorDOM(prevIdx);
                const b = badgeList[prevIdx];
                if (b && flipCard) {
                    if (flipCard.classList.contains('is-flipped')) {
                        b.isFlipped = true;
                        b.targetRotY = Math.PI;
                    }
                }
                playBadgeFlipSound();
            },
            toggleCurrentFlip() {
                flipBadge(activeBadgeIdx);
            }
        };

        const credCloseBtn = document.getElementById('cred-close-btn');
        if (credCloseBtn) credCloseBtn.addEventListener('click', closeInspector);

        ['cred-flip-btn-header', 'cred-front-flip-cta', 'cred-back-flip-cta', 'cred-main-flip-btn'].forEach((btnId) => {
            const btn = document.getElementById(btnId);
            if (btn) btn.addEventListener('click', () => window.eduBadgeSystem.toggleCurrentFlip());
        });

        const credPrevBtn = document.getElementById('cred-prev-btn');
        if (credPrevBtn) credPrevBtn.addEventListener('click', () => window.eduBadgeSystem.prevBadge());

        const credNextBtn = document.getElementById('cred-next-btn');
        if (credNextBtn) credNextBtn.addEventListener('click', () => window.eduBadgeSystem.nextBadge());

        /* ---------------------------------------------------------
           CABINET + SPEAKER & TURNTABLE (→ Música IA)
           Matching Smoked Walnut, Calacatta Marble & Brushed Brass Skin
        --------------------------------------------------------- */
        const cabinet = new THREE.Group();
        cabinet.position.set(4.15, 0, -4.55);
        scene.add(cabinet);

        const mCabW = 2.1;
        const mCabH = 0.62;
        const mCabD = 0.72;
        // 1. Smoked Walnut main body
        addMesh(new THREE.BoxGeometry(mCabW, mCabH, mCabD), walnutMat, [0, 0.43, 0], cabinet);
        // 2. Calacatta Marble top + Brushed Brass under-trim (top sits at y = 0.78)
        addMesh(new THREE.BoxGeometry(mCabW + 0.04, 0.026, mCabD + 0.04), marbleMat, [0, 0.767, 0], cabinet);
        addMesh(new THREE.BoxGeometry(mCabW + 0.046, 0.008, mCabD + 0.046), credenzaBrassMat, [0, 0.750, 0], cabinet, { cast: false });
        // 3. Center fluted tambour slats + Left/Right door seams & Brass handles
        for (let ms = -0.34; ms <= 0.34; ms += 0.036) {
            addMesh(new THREE.BoxGeometry(0.02, 0.55, 0.014), credenzaDarkMat, [ms, 0.43, mCabD / 2 + 0.007], cabinet, { cast: false });
        }
        addMesh(new THREE.BoxGeometry(0.01, 0.56, 0.01), credenzaDarkMat, [-0.42, 0.43, mCabD / 2 + 0.006], cabinet, { cast: false });
        addMesh(new THREE.BoxGeometry(0.01, 0.56, 0.01), credenzaDarkMat, [0.42, 0.43, mCabD / 2 + 0.006], cabinet, { cast: false });
        addMesh(new THREE.CylinderGeometry(0.007, 0.007, 0.16, 12), credenzaBrassMat, [-0.49, 0.43, mCabD / 2 + 0.02], cabinet, { cast: false });
        addMesh(new THREE.CylinderGeometry(0.007, 0.007, 0.16, 12), credenzaBrassMat, [0.49, 0.43, mCabD / 2 + 0.02], cabinet, { cast: false });
        // 4. Tapered Brushed Brass legs
        [
            [-mCabW / 2 + 0.12, -mCabD / 2 + 0.10],
            [mCabW / 2 - 0.12, -mCabD / 2 + 0.10],
            [-mCabW / 2 + 0.12, mCabD / 2 - 0.10],
            [mCabW / 2 - 0.12, mCabD / 2 - 0.10]
        ].forEach(([lx, lz]) => {
            addMesh(new THREE.CylinderGeometry(0.020, 0.012, 0.12, 12), credenzaBrassMat, [lx, 0.06, lz], cabinet);
        });

        const speaker = new THREE.Group();
        speaker.position.set(-0.55, 0.78, 0);
        cabinet.add(speaker);
        addMesh(new THREE.BoxGeometry(0.55, 0.66, 0.45), std(0x111216, 0.5, 0.3), [0, 0.33, 0], speaker, { station: 'music' });

        // Spotify OLED Screen on front-top band of speaker (reacts to party mode)
        let isOledParty = false;
        const oledTex = canvasTexture(256, 80, (ctx, w, h) => {
            ctx.fillStyle = '#06080d';
            ctx.fillRect(0, 0, w, h);
            if (isOledParty) {
                // Party Mode Banner
                ctx.fillStyle = '#ff007f';
                ctx.fillRect(0, 0, 4, h);
                ctx.fillStyle = '#00f0ff';
                ctx.font = 'bold 18px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('🪩', 26, 46);

                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 13px "JetBrains Mono", monospace';
                ctx.textAlign = 'left';
                ctx.fillText('MODO FIESTA 3D', 48, 33);

                ctx.fillStyle = '#00f0ff';
                ctx.font = '10px "JetBrains Mono", monospace';
                ctx.fillText('● BOLA DISCO & LUCES', 48, 53);

                // Multi-color dynamic equalizer bars on right
                const colors = ['#ff007f', '#00f0ff', '#1ed760', '#f59e0b'];
                const heights = [28, 38, 24, 34];
                heights.forEach((barH, bi) => {
                    ctx.fillStyle = colors[bi];
                    ctx.fillRect(198 + bi * 11, 56 - barH, 6, barH);
                });
            } else {
                // Spotify icon
                ctx.fillStyle = '#1ed760';
                ctx.beginPath();
                ctx.arc(28, 40, 15, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#06080d';
                ctx.font = 'bold 16px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('≈', 28, 46);
                // Text
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 15px "JetBrains Mono", monospace';
                ctx.textAlign = 'left';
                ctx.fillText('SPOTIFY HI-FI', 54, 34);
                ctx.fillStyle = '#1ed760';
                ctx.font = '11px "JetBrains Mono", monospace';
                ctx.fillText('● CONNECTED', 54, 54);
                // Mini Green Equalizer Bars on right
                ctx.fillStyle = '#1ed760';
                ctx.fillRect(206, 26, 4, 30);
                ctx.fillRect(216, 18, 4, 38);
                ctx.fillRect(226, 32, 4, 24);
                ctx.fillRect(236, 22, 4, 34);
            }
        });
        addMesh(new THREE.PlaneGeometry(0.34, 0.11), basic({ map: oledTex }), [0, 0.55, 0.23], speaker, { station: 'music', cast: false });
        glowPlane(0.7, 0.35, '30,215,96', 0.4, [0, 0.55, 0.235], null, speaker);

        const ringMat = basic({ color: 0xf472b6 });
        const ringOuter = addMesh(new THREE.TorusGeometry(0.17, 0.016, 10, 40), ringMat, [0, 0.36, 0.23], speaker, { cast: false, station: 'music' });
        const ringInner = addMesh(new THREE.TorusGeometry(0.095, 0.013, 10, 32), ringMat, [0, 0.36, 0.23], speaker, { cast: false });
        const ringSpotify = addMesh(new THREE.TorusGeometry(0.185, 0.012, 10, 40), basic({ color: 0x1ed760 }), [0, 0.36, 0.232], speaker, { cast: false });
        addMesh(new THREE.SphereGeometry(0.045, 14, 14), std(0x27272a, 0.3, 0.6), [0, 0.36, 0.23], speaker);
        glowPlane(1.2, 1.2, '244,114,182', 0.45, [0, 0.36, 0.235], null, speaker);
        const speakerLight = new THREE.PointLight(0xf472b6, 0.55, 2.5, 2);
        speakerLight.position.set(0, 0.4, 0.5);
        speaker.add(speakerLight);
        const speakerGreenLight = new THREE.PointLight(0x1ed760, 0.5, 2.5, 2);
        speakerGreenLight.position.set(0, 0.45, 0.5);
        speaker.add(speakerGreenLight);

        /* ---------------------------------------------------------
           VINYL ALBUM COVER ART DISPLAY (→ Imagen pequeña de la música)
        --------------------------------------------------------- */
        // Display stand on credenza between speaker and turntable
        addMesh(new THREE.BoxGeometry(0.32, 0.024, 0.12), std(0x181920, 0.4, 0.6), [-0.05, 0.792, 0.08], cabinet);

        const albumJacket = new THREE.Group();
        albumJacket.position.set(-0.05, 0.94, 0.08);
        albumJacket.rotation.set(-0.16, 0.14, 0);
        cabinet.add(albumJacket);

        addMesh(new THREE.BoxGeometry(0.28, 0.28, 0.012), std(0x121318, 0.4, 0.3), [0, 0, 0], albumJacket, { station: 'music' });

        let coverImg = null;
        const albumCoverTex = canvasTexture(512, 512, (ctx, w, h) => {
            ctx.fillStyle = '#0a0b16';
            ctx.fillRect(0, 0, w, h);
            if (coverImg) {
                drawCover(ctx, coverImg, 0, 0, w, h);
            } else {
                const g = ctx.createLinearGradient(0, 0, w, h);
                g.addColorStop(0, '#180b30');
                g.addColorStop(1, '#070913');
                ctx.fillStyle = g;
                ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = '#ff007f';
                ctx.beginPath();
                ctx.arc(w / 2, h / 2 - 20, 90, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 30px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('CRUZANDO CIELOS', w / 2, h - 80);
            }
            // Sleek Spotify Badge in corner of the vinyl jacket
            ctx.save();
            ctx.fillStyle = 'rgba(18,18,18,0.92)';
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(w - 116, h - 42, 102, 30, 15);
            else ctx.rect(w - 116, h - 42, 102, 30);
            ctx.fill();
            ctx.strokeStyle = '#1ed760';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            // Spotify logo dot
            ctx.fillStyle = '#1ed760';
            ctx.beginPath();
            ctx.arc(w - 100, h - 27, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#121212';
            ctx.font = 'bold 9px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('≈', w - 100, h - 24);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText('SPOTIFY', w - 86, h - 23);
            ctx.restore();
        });
        loadImage('images/cruzando-cielos-cover.jpg', (img) => {
            coverImg = img;
            albumCoverTex.userData.redraw();
        });
        const albumCoverMat = std(0xffffff, 0.45, 0.05, {
            map: albumCoverTex,
            emissive: 0xffffff,
            emissiveMap: albumCoverTex,
            emissiveIntensity: 0.32
        });
        addMesh(new THREE.PlaneGeometry(0.274, 0.274), albumCoverMat, [0, 0, 0.007], albumJacket, { station: 'music', cast: false });
        glowPlane(0.65, 0.65, '30,215,96', 0.4, [0, 0, -0.012], null, albumJacket);

        // Listen for track & play state changes to dynamically update the 3D album cover and OLED
        if (window.eduSpotifyPlayer && window.eduSpotifyPlayer.onStateChange) {
            window.eduSpotifyPlayer.onStateChange((state) => {
                const playing = !!(state && state.isPlaying);
                if (isOledParty !== playing) {
                    isOledParty = playing;
                    if (oledTex.userData && oledTex.userData.redraw) oledTex.userData.redraw();
                }
                if (state && state.currentTrack && state.currentTrack.cover) {
                    loadImage(state.currentTrack.cover, (newImg) => {
                        coverImg = newImg;
                        albumCoverTex.userData.redraw();
                    });
                }
            });
        }

        /* ---------------------------------------------------------
           AUDIOPHILE HIGH-FIDELITY TURNTABLE & ARTICULATED TONEARM (→ Música IA)
        --------------------------------------------------------- */
        const turntable = new THREE.Group();
        turntable.position.set(0.42, 0.78, 0);
        cabinet.add(turntable);

        // 1. Sleek piano-black damped plinth with beveled chassis
        const plinthMat = std(0x13141a, 0.35, 0.45);
        addMesh(new THREE.BoxGeometry(0.86, 0.08, 0.62), plinthMat, [0, 0.04, 0], turntable, { station: 'music', isTurntable: true });
        addMesh(new THREE.BoxGeometry(0.88, 0.012, 0.64), std(0x232630, 0.4, 0.5), [0, 0.076, 0], turntable, { station: 'music', isTurntable: true });

        // 4 Isolation rubber feet with brass rings
        const footMat = std(0x181920, 0.6, 0.2);
        const brassMat = std(0xd4a24c, 0.25, 0.9);
        [[-0.36, -0.24], [0.36, -0.24], [-0.36, 0.24], [0.36, 0.24]].forEach(([fx, fz]) => {
            addMesh(new THREE.CylinderGeometry(0.038, 0.042, 0.024, 16), footMat, [fx, -0.012, fz], turntable);
            addMesh(new THREE.CylinderGeometry(0.042, 0.042, 0.008, 16), brassMat, [fx, 0.002, fz], turntable);
        });

        // Power switch & 33/45 RPM buttons with indicator micro-LED
        addMesh(new THREE.BoxGeometry(0.04, 0.018, 0.04), std(0x3f3f46, 0.4, 0.6), [-0.34, 0.088, 0.22], turntable, { isTurntable: true });
        addMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.016, 12), brassMat, [-0.26, 0.088, 0.22], turntable, { isTurntable: true });
        const turntablePowerLedMat = basic({ color: 0x1ed760 });
        const turntablePowerLed = addMesh(new THREE.SphereGeometry(0.006, 8, 8), turntablePowerLedMat, [-0.34, 0.10, 0.22], turntable, { cast: false });

        // Strobe light tower at back-left
        addMesh(new THREE.CylinderGeometry(0.018, 0.022, 0.045, 12), std(0x27272a, 0.4, 0.6), [-0.36, 0.10, -0.22], turntable);
        const strobeLamp = addMesh(new THREE.SphereGeometry(0.008, 8, 8), basic({ color: 0xff3b30 }), [-0.35, 0.118, -0.21], turntable, { cast: false });

        // 2. Heavy Machined Aluminum Platter (Plato) with Strobe Dots Rim
        const platterGroup = new THREE.Group();
        platterGroup.position.set(-0.09, 0.08, 0);
        turntable.add(platterGroup);

        const alumPlatterMat = std(0xd1d5db, 0.22, 0.88);
        addMesh(new THREE.CylinderGeometry(0.245, 0.245, 0.024, 48), alumPlatterMat, [0, 0.012, 0], platterGroup, { station: 'music', isTurntable: true });
        // Strobe rim dots ring
        addMesh(new THREE.CylinderGeometry(0.247, 0.247, 0.008, 36), std(0x18181b, 0.5, 0.3), [0, 0.012, 0], platterGroup, { cast: false });
        // Anti-static rubber slipmat
        addMesh(new THREE.CylinderGeometry(0.238, 0.238, 0.005, 36), std(0x111216, 0.7, 0.1), [0, 0.026, 0], platterGroup, { isTurntable: true });
        // Polished center chrome spindle pin
        const spindlePin = addMesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.042, 16), std(0xffffff, 0.1, 0.98), [0, 0.038, 0], platterGroup, { cast: false });

        // 3. High-Definition Vinyl Record Assembly (Placed on Platter, spins with it)
        const vinylGroup = new THREE.Group();
        vinylGroup.position.set(-0.09, 0.108, 0);
        turntable.add(vinylGroup);
        const vinyl = vinylGroup; // Maintain alias so any legacy reference remains valid

        // Vinyl Groove Texture Canvas (512x512 with light diffraction & micro-grooves)
        const vinylGrooveTex = canvasTexture(512, 512, (ctx, w, h) => {
            ctx.fillStyle = '#08090b';
            ctx.fillRect(0, 0, w, h);
            const cx = w / 2;
            const cy = h / 2;
            for (let r = 85; r < 240; r += 2) {
                const alpha = 0.03 + (Math.sin(r * 0.4) * 0.025) + ((r % 12 === 0) ? 0.06 : 0);
                ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.stroke();
            }
            [125, 165, 205].forEach(gapR => {
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(cx, cy, gapR, 0, Math.PI * 2);
                ctx.stroke();
            });
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(cx, cy, 78, 0, Math.PI * 2);
            ctx.stroke();
        });

        // Vinyl center label canvas texture (updates dynamically with current song)
        const vinylLabelTex = canvasTexture(256, 256, (ctx, w, h) => {
            const cx = w / 2;
            const cy = h / 2;
            ctx.fillStyle = '#0a0a0c';
            ctx.fillRect(0, 0, w, h);
            ctx.beginPath();
            ctx.arc(cx, cy, 120, 0, Math.PI * 2);
            ctx.fillStyle = '#121216';
            ctx.fill();
            ctx.strokeStyle = '#1ed760';
            ctx.lineWidth = 4;
            ctx.stroke();

            ctx.strokeStyle = 'rgba(212, 162, 76, 0.6)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(cx, cy, 108, 0, Math.PI * 2);
            ctx.stroke();

            if (coverImg) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(cx, cy, 48, 0, Math.PI * 2);
                ctx.clip();
                drawCover(ctx, coverImg, cx - 48, cy - 48, 96, 96);
                ctx.restore();
            }

            ctx.fillStyle = '#1ed760';
            ctx.font = 'bold 13px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('EDUARDO HI-FI', cx, 42);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 11px sans-serif';
            ctx.fillText('STEREO 33 ⅓ RPM', cx, 222);

            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.arc(cx, cy, 9, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#cccccc';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        });

        if (window.eduSpotifyPlayer && window.eduSpotifyPlayer.onStateChange) {
            window.eduSpotifyPlayer.onStateChange((state) => {
                if (state && state.currentTrack && state.currentTrack.cover) {
                    vinylLabelTex.userData.redraw();
                }
            });
        }

        const vinylDiscMat = std(0x0a0a0d, 0.22, 0.65, {
            map: vinylGrooveTex,
            roughnessMap: vinylGrooveTex
        });
        const vinylMesh = addMesh(new THREE.CylinderGeometry(0.235, 0.235, 0.014, 48), vinylDiscMat, [0, 0, 0], vinylGroup, { station: 'music', isTurntable: true });

        // Center Label Disc (rotates WITH the vinyl)
        const vinylLabelMat = basic({ map: vinylLabelTex });
        const vinylLabelMesh = addMesh(new THREE.CylinderGeometry(0.082, 0.082, 0.016, 32), vinylLabelMat, [0, 0.001, 0], vinylGroup, { station: 'music', isTurntable: true, cast: false });

        // 4. Articulated Audiophile Tonearm (Brazo Fonocaptor)
        const tonearmBaseGroup = new THREE.Group();
        tonearmBaseGroup.position.set(0.25, 0.08, -0.16);
        turntable.add(tonearmBaseGroup);

        addMesh(new THREE.CylinderGeometry(0.028, 0.034, 0.045, 20), brassMat, [0, 0.022, 0], tonearmBaseGroup);
        addMesh(new THREE.CylinderGeometry(0.018, 0.018, 0.022, 16), std(0x27272a, 0.3, 0.7), [0, 0.048, 0], tonearmBaseGroup);

        const tonearmArmGroup = new THREE.Group();
        tonearmArmGroup.position.set(0, 0.054, 0);
        tonearmBaseGroup.add(tonearmArmGroup);

        addMesh(new THREE.CylinderGeometry(0.005, 0.005, 0.09, 12), std(0xffffff, 0.15, 0.9), [0, 0, -0.045], tonearmArmGroup, { rot: [Math.PI / 2, 0, 0] });
        addMesh(new THREE.CylinderGeometry(0.024, 0.024, 0.032, 20), std(0x27272a, 0.3, 0.8), [0, 0, -0.065], tonearmArmGroup, { rot: [Math.PI / 2, 0, 0] });
        addMesh(new THREE.CylinderGeometry(0.025, 0.025, 0.008, 20), brassMat, [0, 0, -0.052], tonearmArmGroup, { rot: [Math.PI / 2, 0, 0] });

        const chromeWandMat = std(0xf4f4f5, 0.15, 0.95);
        addMesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.34, 12), chromeWandMat, [0, 0, 0.17], tonearmArmGroup, { rot: [Math.PI / 2, 0, 0] });

        const headshellGroup = new THREE.Group();
        headshellGroup.position.set(0, 0, 0.34);
        tonearmArmGroup.add(headshellGroup);
        addMesh(new THREE.BoxGeometry(0.022, 0.014, 0.048), std(0x18181b, 0.5, 0.4), [-0.005, -0.004, 0.018], headshellGroup, { rot: [0, -0.16, 0] });
        addMesh(new THREE.BoxGeometry(0.016, 0.015, 0.026), std(0xdc2626, 0.35, 0.3), [-0.005, -0.014, 0.020], headshellGroup, { rot: [0, -0.16, 0] });
        addMesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.012, 8), std(0xffffff, 0.1, 0.9), [-0.005, -0.022, 0.028], headshellGroup, { rot: [0.35, -0.16, 0] });
        addMesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.025, 8), chromeWandMat, [0.012, 0.008, 0.015], headshellGroup, { rot: [0, 0, -Math.PI / 3] });

        const tonearmRest = new THREE.Group();
        tonearmRest.position.set(0.24, 0.08, 0.14);
        turntable.add(tonearmRest);
        addMesh(new THREE.CylinderGeometry(0.008, 0.010, 0.052, 12), std(0x3f3f46, 0.4, 0.6), [0, 0.026, 0], tonearmRest);
        addMesh(new THREE.BoxGeometry(0.024, 0.010, 0.016), std(0x18181b, 0.5, 0.3), [0, 0.054, 0], tonearmRest);

        let vinylSpinSpeed = 0;
        let tonearmAngle = -0.03;
        let tonearmCueLift = 1.0;
        let vinylPlacementProg = 1.0;
        let isTurntablePlayingPrev = false;

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
           RETRO ARCADE CABINET (→ Edu Tetris) - HIGH DEFINITION REMASTER
        --------------------------------------------------------- */
        // 1. Top Illuminated Marquee Texture (1024 x 256)
        const marqueeTex = canvasTexture(1024, 256, (ctx, w, h) => {
            const bg = ctx.createLinearGradient(0, 0, w, 0);
            bg.addColorStop(0, '#090514');
            bg.addColorStop(0.12, '#be185d');
            bg.addColorStop(0.5, '#7c3aed');
            bg.addColorStop(0.88, '#0284c7');
            bg.addColorStop(1, '#090514');
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, w, h);

            // Subtle scanline stripes
            ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
            for (let y = 0; y < h; y += 4) {
                ctx.fillRect(0, y, w, 2);
            }

            // Neon horizontal trim
            ctx.fillStyle = '#00f0ff';
            ctx.fillRect(20, 10, w - 40, 3);
            ctx.fillStyle = '#f43f5e';
            ctx.fillRect(20, h - 13, w - 40, 3);

            // Top subtitle
            ctx.font = '700 20px "JetBrains Mono", monospace';
            ctx.fillStyle = '#fef08a';
            ctx.textAlign = 'center';
            ctx.fillText('★ ARCADE CLASSIC · 1984 - 2026 ★', w / 2, 42);

            // Main 3D Title "EDU TETRIS"
            ctx.font = '900 84px "Plus Jakarta Sans", sans-serif';
            for (let s = 8; s > 0; s--) {
                ctx.fillStyle = s > 4 ? '#1e1b4b' : '#4338ca';
                ctx.fillText('EDU TETRIS', w / 2 + s * 1.5, 142 + s * 1.5);
            }
            ctx.lineWidth = 14;
            ctx.strokeStyle = '#f43f5e';
            ctx.strokeText('EDU TETRIS', w / 2, 142);
            ctx.lineWidth = 6;
            ctx.strokeStyle = '#00f0ff';
            ctx.strokeText('EDU TETRIS', w / 2, 142);

            const textGrad = ctx.createLinearGradient(0, 70, 0, 150);
            textGrad.addColorStop(0, '#ffffff');
            textGrad.addColorStop(0.48, '#e0f2fe');
            textGrad.addColorStop(0.52, '#38bdf8');
            textGrad.addColorStop(1, '#0284c7');
            ctx.fillStyle = textGrad;
            ctx.fillText('EDU TETRIS', w / 2, 142);

            ctx.font = '700 17px "JetBrains Mono", monospace';
            ctx.fillStyle = '#a7f3d0';
            ctx.fillText('HTML5 PRO ENGINE · WEB AUDIO SYNTH · CHILE CYBERNETICS', w / 2, 202);
        });

        // 2. CRT Screen Texture (1024 x 800) with matrix, stats & "¡JUGAR AHORA!!" CTA
        const arcadeScreenTex = canvasTexture(1024, 800, (ctx, w, h) => {
            ctx.fillStyle = '#060814';
            ctx.fillRect(0, 0, w, h);

            // Scanlines
            ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
            for (let y = 0; y < h; y += 4) {
                ctx.fillRect(0, y, w, 2);
            }

            // Top Header Bar
            ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
            ctx.fillRect(40, 18, w - 80, 78);
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
            ctx.lineWidth = 2;
            ctx.strokeRect(40, 18, w - 80, 78);

            ctx.font = '800 22px "JetBrains Mono", monospace';
            ctx.fillStyle = '#facc15';
            ctx.textAlign = 'left';
            ctx.fillText('TOP: 999,990', 60, 56);
            ctx.fillStyle = '#ffffff';
            ctx.fillText('SCORE: 184,200', 320, 56);
            ctx.fillStyle = '#38bdf8';
            ctx.fillText('LINES: 048', 630, 56);
            ctx.fillStyle = '#ec4899';
            ctx.fillText('LV: 09', 850, 56);

            // Playfield Matrix (center)
            const mw = 380;
            const mh = 490;
            const mx = (w - mw) / 2;
            const my = 112;

            ctx.fillStyle = '#03050d';
            ctx.fillRect(mx, my, mw, mh);
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
            ctx.lineWidth = 1;
            const cols = 10;
            const rows = 16;
            const cellW = mw / cols;
            const cellH = mh / rows;
            for (let c = 0; c <= cols; c++) {
                ctx.beginPath();
                ctx.moveTo(mx + c * cellW, my);
                ctx.lineTo(mx + c * cellW, my + mh);
                ctx.stroke();
            }
            for (let r = 0; r <= rows; r++) {
                ctx.beginPath();
                ctx.moveTo(mx, my + r * cellH);
                ctx.lineTo(mx + mw, my + r * cellH);
                ctx.stroke();
            }

            ctx.strokeStyle = '#00f0ff';
            ctx.lineWidth = 3;
            ctx.strokeRect(mx - 2, my - 2, mw + 4, mh + 4);

            function drawBlock(gx, gy, col, highlight) {
                const bx = mx + gx * cellW + 1.5;
                const by = my + gy * cellH + 1.5;
                const bw = cellW - 3;
                const bh = cellH - 3;
                ctx.fillStyle = col;
                ctx.fillRect(bx, by, bw, bh);
                ctx.fillStyle = highlight || 'rgba(255, 255, 255, 0.45)';
                ctx.fillRect(bx, by, bw, 4);
                ctx.fillRect(bx, by, 4, bh);
                ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
                ctx.fillRect(bx, by + bh - 4, bw, 4);
                ctx.fillRect(bx + bw - 4, by, 4, bh);
            }

            // Board stacked blocks
            for (let x = 0; x < 10; x++) {
                if (x !== 7) drawBlock(x, 15, '#0284c7', '#38bdf8');
            }
            drawBlock(0, 14, '#be185d', '#f472b6');
            drawBlock(1, 14, '#be185d', '#f472b6');
            drawBlock(2, 14, '#059669', '#34d399');
            drawBlock(3, 14, '#059669', '#34d399');
            drawBlock(4, 14, '#d97706', '#fbbf24');
            drawBlock(5, 14, '#d97706', '#fbbf24');
            drawBlock(6, 14, '#7c3aed', '#a78bfa');
            drawBlock(8, 14, '#dc2626', '#f87171');
            drawBlock(9, 14, '#dc2626', '#f87171');

            drawBlock(0, 13, '#be185d', '#f472b6');
            drawBlock(1, 13, '#be185d', '#f472b6');
            drawBlock(3, 13, '#059669', '#34d399');
            drawBlock(4, 13, '#059669', '#34d399');
            drawBlock(6, 13, '#7c3aed', '#a78bfa');

            drawBlock(4, 12, '#7c3aed', '#c084fc');
            drawBlock(3, 11, '#7c3aed', '#c084fc');
            drawBlock(4, 11, '#7c3aed', '#c084fc');
            drawBlock(5, 11, '#7c3aed', '#c084fc');

            drawBlock(7, 12, '#d97706', '#fde047');
            drawBlock(8, 12, '#d97706', '#fde047');
            drawBlock(7, 11, '#d97706', '#fde047');
            drawBlock(8, 11, '#d97706', '#fde047');

            // Falling piece
            drawBlock(4, 5, '#00f0ff', '#ffffff');
            drawBlock(3, 6, '#00f0ff', '#ffffff');
            drawBlock(4, 6, '#00f0ff', '#ffffff');
            drawBlock(5, 6, '#00f0ff', '#ffffff');

            // Ghost piece
            ctx.strokeStyle = '#00f0ff';
            ctx.lineWidth = 2;
            [[4, 9], [3, 10], [4, 10], [5, 10]].forEach(([gx, gy]) => {
                ctx.strokeRect(mx + gx * cellW + 2, my + gy * cellH + 2, cellW - 4, cellH - 4);
            });

            // Left HUD: HOLD & Controls
            ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
            ctx.fillRect(50, 140, 220, 160);
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
            ctx.lineWidth = 2;
            ctx.strokeRect(50, 140, 220, 160);
            ctx.font = '700 17px "JetBrains Mono", monospace';
            ctx.fillStyle = '#38bdf8';
            ctx.textAlign = 'center';
            ctx.fillText('HOLD [C]', 160, 172);
            for (let i = 0; i < 4; i++) {
                ctx.fillStyle = '#00f0ff';
                ctx.fillRect(80 + i * 40, 205, 34, 30);
            }

            ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
            ctx.fillRect(50, 320, 220, 250);
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
            ctx.strokeRect(50, 320, 220, 250);
            ctx.font = '700 15px "JetBrains Mono", monospace';
            ctx.fillStyle = '#f472b6';
            ctx.fillText('CONTROLES', 160, 350);
            ctx.fillStyle = '#94a3b8';
            ctx.font = '13px "JetBrains Mono", monospace';
            ctx.fillText('◀ ▶  MOVER', 160, 385);
            ctx.fillText('▲ / Z  ROTAR', 160, 415);
            ctx.fillText('SPACE  DROP', 160, 445);
            ctx.fillText('▼  SOFT DROP', 160, 475);
            ctx.fillText('P  PAUSA', 160, 505);
            ctx.fillText('M  AUDIO', 160, 535);

            // Right HUD: NEXT & Speed
            ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
            ctx.fillRect(754, 140, 220, 240);
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
            ctx.strokeRect(754, 140, 220, 240);
            ctx.font = '700 17px "JetBrains Mono", monospace';
            ctx.fillStyle = '#34d399';
            ctx.fillText('SIGUIENTE', 864, 172);
            ctx.fillStyle = '#fbbf24';
            ctx.fillRect(825, 195, 36, 32);
            ctx.fillRect(865, 195, 36, 32);
            ctx.fillRect(825, 230, 36, 32);
            ctx.fillRect(865, 230, 36, 32);
            ctx.fillStyle = '#34d399';
            ctx.fillRect(845, 290, 32, 28);
            ctx.fillRect(880, 290, 32, 28);
            ctx.fillRect(810, 320, 32, 28);
            ctx.fillRect(845, 320, 32, 28);

            ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
            ctx.fillRect(754, 400, 220, 170);
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
            ctx.strokeRect(754, 400, 220, 170);
            ctx.font = '700 15px "JetBrains Mono", monospace';
            ctx.fillStyle = '#fbbf24';
            ctx.fillText('COMBO RACER', 864, 435);
            ctx.font = '800 34px "JetBrains Mono", monospace';
            ctx.fillStyle = '#fde047';
            ctx.fillText('x4', 864, 480);
            ctx.font = '12px "JetBrains Mono", monospace';
            ctx.fillStyle = '#a7f3d0';
            ctx.fillText('MAX MULTIPLIER', 864, 520);

            // PROMINENT "¡JUGAR AHORA!!" BUTTON / CALL TO ACTION BANNER
            const btnW = 760;
            const btnH = 120;
            const btnX = (w - btnW) / 2;
            const btnY = 635;
            const r = 26;

            ctx.shadowColor = 'rgba(16, 185, 129, 0.9)';
            ctx.shadowBlur = 32;

            const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY);
            btnGrad.addColorStop(0, '#10b981');
            btnGrad.addColorStop(0.5, '#06b6d4');
            btnGrad.addColorStop(1, '#3b82f6');
            ctx.fillStyle = btnGrad;

            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(btnX, btnY, btnW, btnH, r);
            } else {
                ctx.rect(btnX, btnY, btnW, btnH);
            }
            ctx.fill();

            ctx.shadowBlur = 0;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 5;
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(btnX, btnY, btnW, btnH, r);
            } else {
                ctx.rect(btnX, btnY, btnW, btnH);
            }
            ctx.stroke();

            ctx.font = '900 44px "Plus Jakarta Sans", sans-serif';
            ctx.fillStyle = '#06131c';
            ctx.textAlign = 'center';
            ctx.fillText('🕹️  ¡JUGAR AHORA!!  →', w / 2, btnY + 58);

            ctx.font = '800 18px "JetBrains Mono", monospace';
            ctx.fillStyle = '#04222e';
            ctx.fillText('INSERT COIN (25¢) · CLIC EN LA MÁQUINA PARA ENTRAR', w / 2, btnY + 95);
        });

        // 3. Side Art Decals (512 x 1024)
        const arcadeSideArtTex = canvasTexture(512, 1024, (ctx, w, h) => {
            const bg = ctx.createLinearGradient(0, 0, 0, h);
            bg.addColorStop(0, '#0c071e');
            bg.addColorStop(0.4, '#2e0854');
            bg.addColorStop(0.7, '#831843');
            bg.addColorStop(1, '#0f172a');
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, w, h);

            // Synthwave Sun
            const sunY = 560;
            const sunR = 120;
            const sunGrad = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
            sunGrad.addColorStop(0, '#fef08a');
            sunGrad.addColorStop(0.5, '#f43f5e');
            sunGrad.addColorStop(1, '#8b5cf6');
            ctx.fillStyle = sunGrad;
            ctx.beginPath();
            ctx.arc(w / 2, sunY, sunR, Math.PI, 0, false);
            ctx.fill();

            ctx.fillStyle = '#0c071e';
            for (let i = 0; i < 7; i++) {
                ctx.fillRect(w / 2 - sunR, sunY - 4 - i * 16, sunR * 2, 4 + i * 2);
            }

            // Floor perspective grid
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
            ctx.lineWidth = 2;
            for (let y = sunY + 10; y < h; y += 30) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(w, y);
                ctx.stroke();
            }
            for (let x = -200; x <= w + 200; x += 60) {
                ctx.beginPath();
                ctx.moveTo(w / 2, sunY);
                ctx.lineTo(x, h);
                ctx.stroke();
            }

            // Tetris crystal blocks
            const pieces = [
                { x: 120, y: 220, col: '#00f0ff', s: 38 },
                { x: 380, y: 180, col: '#f43f5e', s: 44 },
                { x: 260, y: 310, col: '#fbbf24', s: 40 },
                { x: 90, y: 440, col: '#34d399', s: 36 },
                { x: 390, y: 420, col: '#a855f7', s: 42 },
                { x: 200, y: 720, col: '#0284c7', s: 36 }
            ];
            pieces.forEach((p) => {
                ctx.fillStyle = p.col;
                ctx.fillRect(p.x, p.y, p.s, p.s);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.fillRect(p.x, p.y, p.s, 6);
                ctx.fillRect(p.x, p.y, 6, p.s);
            });

            // Slanted Logo
            ctx.save();
            ctx.translate(w / 2, 280);
            ctx.rotate(-Math.PI / 10);
            ctx.font = '900 68px "Plus Jakarta Sans", sans-serif';
            ctx.textAlign = 'center';
            for (let s = 6; s > 0; s--) {
                ctx.fillStyle = '#312e81';
                ctx.fillText('EDU TETRIS', s * 2, s * 2);
            }
            ctx.lineWidth = 10;
            ctx.strokeStyle = '#00f0ff';
            ctx.strokeText('EDU TETRIS', 0, 0);
            ctx.fillStyle = '#ffffff';
            ctx.fillText('EDU TETRIS', 0, 0);
            ctx.restore();

            ctx.strokeStyle = '#00f0ff';
            ctx.lineWidth = 6;
            ctx.strokeRect(10, 10, w - 20, h - 20);
        });

        // 4. Control Panel Texture (1024 x 512)
        const arcadeControlPanelTex = canvasTexture(1024, 512, (ctx, w, h) => {
            ctx.fillStyle = '#11131b';
            ctx.fillRect(0, 0, w, h);

            ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
            for (let x = 0; x < w; x += 8) {
                for (let y = 0; y < h; y += 8) {
                    if ((x + y) % 16 === 0) ctx.fillRect(x, y, 8, 8);
                }
            }

            ctx.strokeStyle = '#00f0ff';
            ctx.lineWidth = 3;
            ctx.strokeRect(16, 16, w - 32, h - 32);

            // Joystick Area
            ctx.strokeStyle = 'rgba(244, 63, 94, 0.6)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(280, 260, 140, 0, Math.PI * 2);
            ctx.stroke();

            ctx.font = '800 24px "Plus Jakarta Sans", sans-serif';
            ctx.fillStyle = '#f43f5e';
            ctx.textAlign = 'center';
            ctx.fillText('1 PLAYER', 280, 80);
            ctx.font = '700 14px "JetBrains Mono", monospace';
            ctx.fillStyle = '#94a3b8';
            ctx.fillText('8-WAY PRECISION STICK', 280, 110);

            ctx.font = '700 20px "JetBrains Mono", monospace';
            ctx.fillStyle = '#00f0ff';
            ctx.fillText('▲', 280, 150);
            ctx.fillText('▼', 280, 390);
            ctx.fillText('◀', 160, 265);
            ctx.fillText('▶', 400, 265);

            // Buttons Area
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(540, 60, 440, 380, 24);
            } else {
                ctx.rect(540, 60, 440, 380);
            }
            ctx.stroke();

            ctx.font = '800 24px "Plus Jakarta Sans", sans-serif';
            ctx.fillStyle = '#38bdf8';
            ctx.fillText('ACTION MATRIX', 760, 100);
            ctx.font = '700 13px "JetBrains Mono", monospace';
            ctx.fillStyle = '#94a3b8';
            ctx.fillText('HARD DROP · ROTAR · HOLD · SOFT DROP', 760, 130);

            ctx.font = '800 15px "JetBrains Mono", monospace';
            ctx.fillStyle = '#fef08a';
            ctx.fillText('INSERT COIN · PRESS TO PLAY', w / 2, 470);
        });

        // 5. Coin Door Texture (512 x 512)
        const arcadeCoinDoorTex = canvasTexture(512, 512, (ctx, w, h) => {
            ctx.fillStyle = '#141419';
            ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = '#272733';
            ctx.lineWidth = 12;
            ctx.strokeRect(10, 10, w - 20, h - 20);

            const frameW = 160;
            const frameH = 220;
            [100, 310].forEach((fx) => {
                ctx.fillStyle = '#0a0a0f';
                ctx.fillRect(fx - 40, 60, frameW, frameH);
                ctx.strokeStyle = '#3f3f4e';
                ctx.lineWidth = 4;
                ctx.strokeRect(fx - 40, 60, frameW, frameH);

                ctx.fillStyle = '#ea580c';
                ctx.fillRect(fx - 15, 100, 110, 60);
                ctx.strokeStyle = '#fbbf24';
                ctx.lineWidth = 3;
                ctx.strokeRect(fx - 15, 100, 110, 60);

                ctx.font = '800 24px "JetBrains Mono", monospace';
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.fillText('25¢', fx + 40, 132);
                ctx.font = '700 11px "JetBrains Mono", monospace';
                ctx.fillStyle = '#fef08a';
                ctx.fillText('INSERT COIN', fx + 40, 150);

                ctx.fillStyle = '#000000';
                ctx.fillRect(fx + 36, 75, 8, 20);

                ctx.fillStyle = '#1c1c24';
                ctx.fillRect(fx - 20, 200, 120, 60);
                ctx.strokeStyle = '#333342';
                ctx.strokeRect(fx - 20, 200, 120, 60);
                ctx.font = '700 11px "JetBrains Mono", monospace';
                ctx.fillStyle = '#64748b';
                ctx.fillText('PUSH COIN', fx + 40, 235);
            });

            ctx.fillStyle = '#64748b';
            ctx.beginPath();
            ctx.arc(w / 2, 330, 16, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#0a0a0f';
            ctx.fillRect(w / 2 - 3, 320, 6, 20);
        });

        // 3D Cabinet Construction
        const arcade = new THREE.Group();
        arcade.position.set(-5.05, 0, -4.05);
        arcade.rotation.y = Math.PI / 4;
        scene.add(arcade);

        const arcadeBodyMat = std(0x0a0b12, 0.68, 0.18);
        const neonCyanMat = basic({ color: 0x00f0ff });
        const neonPinkMat = basic({ color: 0xf43f5e });

        // Core structural bodies
        addMesh(new THREE.BoxGeometry(0.86, 0.96, 0.76), arcadeBodyMat, [0, 0.48, -0.02], arcade, { station: 'arcade' });
        addMesh(new THREE.BoxGeometry(0.88, 1.96, 0.04), arcadeBodyMat, [0, 1.0, -0.41], arcade, { station: 'arcade' });
        addMesh(new THREE.BoxGeometry(0.88, 0.04, 0.72), arcadeBodyMat, [0, 1.98, -0.04], arcade, { station: 'arcade' });
        addMesh(new THREE.BoxGeometry(0.86, 0.58, 0.22), std(0x0a0b12, 0.75, 0.1), [0, 1.36, 0.12], arcade, { station: 'arcade' });

        // Contoured Side Wings (Left & Right)
        [-0.45, 0.45].forEach((sx) => {
            addMesh(new THREE.BoxGeometry(0.035, 1.04, 0.82), arcadeBodyMat, [sx, 0.52, 0.01], arcade, { station: 'arcade' });
            addMesh(new THREE.BoxGeometry(0.035, 0.24, 0.26), arcadeBodyMat, [sx, 1.02, 0.42], arcade, { station: 'arcade' });
            addMesh(new THREE.BoxGeometry(0.035, 0.46, 0.64), arcadeBodyMat, [sx, 1.76, 0.14], arcade, { station: 'arcade' });
        });

        // Outer Side Art Decals (Left & Right)
        addMesh(new THREE.PlaneGeometry(0.82, 1.92), basic({ map: arcadeSideArtTex }), [-0.472, 1.0, 0], arcade, {
            rot: [0, -Math.PI / 2, 0],
            cast: false,
            station: 'arcade'
        });
        addMesh(new THREE.PlaneGeometry(0.82, 1.92), basic({ map: arcadeSideArtTex }), [0.472, 1.0, 0], arcade, {
            rot: [0, Math.PI / 2, 0],
            cast: false,
            station: 'arcade'
        });

        // Glowing Neon T-Molding on front edges
        [-0.468, 0.468].forEach((sx) => {
            addMesh(new THREE.BoxGeometry(0.016, 0.94, 0.016), neonCyanMat, [sx, 0.48, 0.41], arcade, { cast: false, receive: false });
            addMesh(new THREE.BoxGeometry(0.016, 0.16, 0.016), neonCyanMat, [sx, 1.02, 0.54], arcade, { cast: false, receive: false });
            addMesh(new THREE.BoxGeometry(0.016, 0.38, 0.016), neonCyanMat, [sx, 1.80, 0.45], arcade, { cast: false, receive: false });
        });

        // Top Canopy & Illuminated Marquee
        addMesh(new THREE.BoxGeometry(0.86, 0.24, 0.06), arcadeBodyMat, [0, 1.83, 0.42], arcade, {
            rot: [0.08, 0, 0],
            station: 'arcade'
        });
        addMesh(new THREE.PlaneGeometry(0.85, 0.22), basic({ map: marqueeTex }), [0, 1.83, 0.452], arcade, {
            rot: [0.08, 0, 0],
            cast: false,
            station: 'arcade'
        });
        // Marquee retainers (top & bottom black aluminum clamps)
        addMesh(new THREE.BoxGeometry(0.87, 0.02, 0.04), std(0x0a0a0f, 0.3, 0.8), [0, 1.945, 0.455], arcade, { rot: [0.08, 0, 0] });
        addMesh(new THREE.BoxGeometry(0.87, 0.02, 0.04), std(0x0a0a0f, 0.3, 0.8), [0, 1.715, 0.455], arcade, { rot: [0.08, 0, 0] });

        // Under-Marquee Stereo Speaker Grille & Downlight
        addMesh(new THREE.BoxGeometry(0.86, 0.12, 0.04), std(0x181822, 0.6, 0.2), [0, 1.66, 0.33], arcade, {
            rot: [-0.42, 0, 0],
            station: 'arcade'
        });
        addMesh(new THREE.BoxGeometry(0.72, 0.012, 0.012), neonCyanMat, [0, 1.64, 0.35], arcade, {
            rot: [-0.42, 0, 0],
            cast: false,
            receive: false
        });

        // Recessed CRT Monitor Bezel & Screen
        addMesh(new THREE.BoxGeometry(0.86, 0.62, 0.04), std(0x0c0d14, 0.85, 0.1), [0, 1.36, 0.22], arcade, {
            rot: [-0.18, 0, 0],
            station: 'arcade'
        });
        addMesh(new THREE.PlaneGeometry(0.82, 0.58), basic({ map: arcadeScreenTex }), [0, 1.36, 0.245], arcade, {
            rot: [-0.18, 0, 0],
            cast: false,
            station: 'arcade'
        });
        // Glass Reflection Sheen
        addMesh(new THREE.PlaneGeometry(0.82, 0.58), new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.08,
            metalness: 0.9,
            transparent: true,
            opacity: 0.14,
            depthWrite: false
        }), [0, 1.36, 0.248], arcade, {
            rot: [-0.18, 0, 0],
            cast: false,
            receive: false
        });

        // Angled Ergonomic Control Panel (CPO)
        addMesh(new THREE.BoxGeometry(0.86, 0.05, 0.34), std(0x11131c, 0.5, 0.3), [0, 1.01, 0.40], arcade, {
            rot: [0.26, 0, 0],
            station: 'arcade'
        });
        addMesh(new THREE.PlaneGeometry(0.85, 0.33), basic({ map: arcadeControlPanelTex }), [0, 1.036, 0.40], arcade, {
            rot: [-Math.PI / 2 + 0.26, 0, 0],
            cast: false,
            station: 'arcade'
        });
        // Front rubber bullnose bumper
        addMesh(new THREE.BoxGeometry(0.87, 0.03, 0.03), neonCyanMat, [0, 0.965, 0.56], arcade, {
            rot: [0.26, 0, 0],
            cast: false,
            receive: false
        });

        // Joystick (Player 1)
        addMesh(new THREE.CylinderGeometry(0.042, 0.042, 0.006, 16), std(0x0a0a0f, 0.3), [-0.24, 1.045, 0.42], arcade, { rot: [0.26, 0, 0] });
        addMesh(new THREE.CylinderGeometry(0.011, 0.011, 0.075, 12), std(0xffffff, 0.08, 0.95), [-0.24, 1.085, 0.42], arcade, { rot: [0.26, 0, 0] });
        addMesh(new THREE.SphereGeometry(0.042, 20, 20), std(0xef4444, 0.1, 0.35), [-0.24, 1.13, 0.42], arcade);

        // 6 Illuminated Arcade Action Buttons (Sanwa style 2x3 curved layout)
        const arcadeButtonColors = [
            [0x00f0ff, 0.06, 0.45], // Cyan (Top-left)
            [0x10b981, 0.17, 0.43], // Emerald (Top-mid)
            [0xfbbf24, 0.28, 0.45], // Yellow (Top-right)
            [0xf43f5e, 0.06, 0.37], // Pink (Bot-left)
            [0xa855f7, 0.17, 0.35], // Purple (Bot-mid)
            [0xf97316, 0.28, 0.37]  // Orange (Bot-right)
        ];
        arcadeButtonColors.forEach(([col, bx, bz]) => {
            // Button black collar
            addMesh(new THREE.CylinderGeometry(0.032, 0.032, 0.016, 16), std(0x0a0a0f, 0.3), [bx, 1.035, bz], arcade, {
                rot: [0.26, 0, 0],
                cast: false
            });
            // Button convex plunger with emissive glow
            addMesh(new THREE.CylinderGeometry(0.026, 0.026, 0.024, 16), basic({ color: col }), [bx, 1.045, bz], arcade, {
                rot: [0.26, 0, 0],
                cast: false
            });
        });

        // 1P & 2P Start buttons
        addMesh(new THREE.CylinderGeometry(0.016, 0.016, 0.016, 12), basic({ color: 0xffffff }), [-0.20, 1.08, 0.30], arcade, { rot: [0.26, 0, 0], cast: false });
        addMesh(new THREE.CylinderGeometry(0.016, 0.016, 0.016, 12), basic({ color: 0xffffff }), [-0.12, 1.08, 0.30], arcade, { rot: [0.26, 0, 0], cast: false });

        // Lower Cabinet & Heavy Steel Coin Door
        addMesh(new THREE.BoxGeometry(0.86, 0.72, 0.03), std(0x161822, 0.6, 0.3), [0, 0.56, 0.38], arcade, { station: 'arcade' });
        addMesh(new THREE.PlaneGeometry(0.56, 0.56), basic({ map: arcadeCoinDoorTex }), [0, 0.56, 0.398], arcade, { cast: false, station: 'arcade' });
        // 3D Glowing Orange Coin Reject Buttons
        addMesh(new THREE.BoxGeometry(0.08, 0.04, 0.02), basic({ color: 0xf97316 }), [-0.11, 0.61, 0.408], arcade, { cast: false });
        addMesh(new THREE.BoxGeometry(0.08, 0.04, 0.02), basic({ color: 0xf97316 }), [0.11, 0.61, 0.408], arcade, { cast: false });

        // Diamond-plate Lower Kickplate
        addMesh(new THREE.BoxGeometry(0.86, 0.18, 0.03), std(0x222634, 0.4, 0.5), [0, 0.09, 0.31], arcade, { station: 'arcade' });

        // Ambient Lights & Floor Underglow
        glowPlane(2.2, 2.2, '0,240,255', 0.42, [0, 0.012, 0.6], [-Math.PI / 2, 0, 0], arcade);
        const arcadeMarqueeLight = new THREE.PointLight(0xa855f7, 0.9, 3.5, 2);
        arcadeMarqueeLight.position.set(0, 1.83, 0.65);
        arcade.add(arcadeMarqueeLight);
        const arcadeScreenLight = new THREE.PointLight(0x00f0ff, 0.6, 2.5, 2);
        arcadeScreenLight.position.set(0, 1.36, 0.7);
        arcade.add(arcadeScreenLight);

        /* ---------------------------------------------------------
           CORNER LUXURY DARK CAT BED & INTERACTIVE 3D ROAMING MASCOT
        --------------------------------------------------------- */
        const lounge = new THREE.Group();
        lounge.position.set(-4.75, 0, 1.25);
        scene.add(lounge);

        // Circular dark velvet accent rug under bed with cyber-accent rim
        addMesh(new THREE.CylinderGeometry(1.05, 1.05, 0.015, 36), std(0x06070a, 0.60, 0.08), [0, 0.008, 0], lounge, { cast: false });
        addMesh(new THREE.TorusGeometry(1.04, 0.016, 10, 36), std(0x38bdf8, 0.35, 0.5), [0, 0.018, 0], lounge, { rot: [Math.PI / 2, 0, 0], cast: false });

        // Raised donut bolster ring in deep obsidian noir velvet
        const bedOuterMat = std(0x0c0e14, 0.52, 0.14);
        const bedOuterRim = addMesh(new THREE.TorusGeometry(0.72, 0.22, 16, 36), bedOuterMat, [0, 0.22, 0], lounge, {
            rot: [Math.PI / 2, 0, 0],
            station: 'cat'
        });
        bedOuterRim.userData.isCat = true;
        bedOuterRim.userData.isCatBed = true;

        // Beveled deep charcoal bottom casing
        addMesh(new THREE.CylinderGeometry(0.88, 0.92, 0.22, 32), std(0x080a0e, 0.52, 0.14), [0, 0.11, 0], lounge, { station: 'cat' });

        // Cognac saddle leather badge with gold embossed paw
        const bedTagMat = std(0x854d0e, 0.45, 0.4);
        addMesh(new THREE.BoxGeometry(0.24, 0.08, 0.016), bedTagMat, [0, 0.22, 0.88], lounge, { cast: false });
        addMesh(new THREE.SphereGeometry(0.014, 8, 8), basic({ color: 0xfbbf24 }), [0, 0.22, 0.89], lounge, { cast: false });

        // Inner memory-foam sunken cushion with squish & bounce elastic deformation
        const catBedCushion = new THREE.Group();
        catBedCushion.position.set(0, 0.18, 0);
        lounge.add(catBedCushion);

        const bedCushionMat = std(0x11131a, 0.58, 0.10);
        const bedCushionMesh = addMesh(new THREE.CylinderGeometry(0.68, 0.65, 0.24, 28), bedCushionMat, [0, 0.12, 0], catBedCushion, { station: 'cat' });
        bedCushionMesh.userData.isCat = true;
        bedCushionMesh.userData.isCatBed = true;

        const beanbag = bedCushionMesh; // Alias for raycaster compatibility

        // Bed Squish Physics State
        let bedSquishCompression = 0.22;
        let bedSquishTarget = 0.22;
        let bedSquishSpring = 0.0;
        let bedSquishVel = 0.0;

        function triggerBedSquish(isJumpOn) {
            playBedSquishSound(isJumpOn);
            if (isJumpOn) {
                bedSquishTarget = 0.26;
                bedSquishVel = -2.6;
            } else {
                bedSquishTarget = 0.0;
                bedSquishVel = 3.0;
            }
            if (typeof spawnCatHearts === 'function') {
                spawnCatHearts(catRoot.position);
            }
        }

        /* ---------------------------------------------------------
           KOTETSU CAT MASCOT (ARTICULATED 3D CHARACTER)
        --------------------------------------------------------- */
        const catRoot = new THREE.Group();
        catRoot.position.set(-4.75, 0.80, 1.25);
        catRoot.rotation.y = 0.25;
        scene.add(catRoot);
        const cat = catRoot; // Alias for compatibility with all existing references

        // Fur materials
        const catMat = std(0xfdfdfd, 0.82, 0.05); // soft pearlescent white fur
        const catSpotMat = std(0xe08b48, 0.85, 0.05); // warm caramel/ginger calico patch
        const catPinkMat = basic({ color: 0xf472b6 });
        const catCollarMat = std(0xec4899, 0.4, 0.5);
        const catBellMat = basic({ color: 0x38bdf8 }); // cyber LED pendant
        const catEyeMat = basic({ color: 0x10b981 }); // emerald eyes
        const catPupilMat = basic({ color: 0x052e16 });
        const catPawPadMat = basic({ color: 0xfb7185 });

        // Spine group (handles breathing, arching, bending)
        const catSpine = new THREE.Group();
        catRoot.add(catSpine);

        // Torso / body
        const catBody = addMesh(new THREE.SphereGeometry(0.22, 18, 14), catMat, [0, 0, 0], catSpine, { station: 'cat' });
        catBody.scale.set(1.42, 0.65, 0.92);
        catBody.userData.isCat = true;

        // Ginger calico patch on back
        const catPatch = addMesh(new THREE.SphereGeometry(0.12, 12, 10), catSpotMat, [-0.06, 0.08, 0.04], catSpine, { station: 'cat' });
        catPatch.scale.set(1.2, 0.4, 0.9);
        catPatch.userData.isCat = true;

        // Cyber Collar + Glowing LED pendant / bell
        const catCollar = addMesh(new THREE.TorusGeometry(0.115, 0.016, 10, 24), catCollarMat, [0.22, 0.02, 0.0], catSpine, { rot: [0, Math.PI / 2, 0], cast: false });
        const catBell = addMesh(new THREE.SphereGeometry(0.022, 10, 10), catBellMat, [0.24, -0.065, 0.0], catSpine, { cast: false });
        const catBellLight = new THREE.PointLight(0x38bdf8, 0.4, 0.8);
        catBellLight.position.set(0.24, -0.065, 0);
        catSpine.add(catBellLight);

        // Head Group (allows tilting, sniffing, turning)
        const catHeadGroup = new THREE.Group();
        catHeadGroup.position.set(0.29, 0.05, 0);
        catSpine.add(catHeadGroup);

        const catHead = addMesh(new THREE.SphereGeometry(0.135, 18, 14), catMat, [0, 0, 0], catHeadGroup, { station: 'cat' });
        catHead.userData.isCat = true;

        // Calico patch on right ear/brow
        const headPatch = addMesh(new THREE.SphereGeometry(0.075, 10, 8), catSpotMat, [0.03, 0.05, 0.045], catHeadGroup, { station: 'cat' });
        headPatch.scale.set(1.0, 0.6, 0.8);
        headPatch.userData.isCat = true;

        // Ears (Pointed + Pink inner)
        const earL = new THREE.Group();
        earL.position.set(0.03, 0.11, -0.06);
        earL.rotation.set(-0.15, 0, -0.2);
        catHeadGroup.add(earL);
        addMesh(new THREE.ConeGeometry(0.045, 0.09, 8), catMat, [0, 0.04, 0], earL);
        addMesh(new THREE.ConeGeometry(0.026, 0.062, 8), catPinkMat, [0.005, 0.036, 0.005], earL, { cast: false });

        const earR = new THREE.Group();
        earR.position.set(0.03, 0.11, 0.06);
        earR.rotation.set(0.15, 0, -0.2);
        catHeadGroup.add(earR);
        addMesh(new THREE.ConeGeometry(0.045, 0.09, 8), catSpotMat, [0, 0.04, 0], earR);
        addMesh(new THREE.ConeGeometry(0.026, 0.062, 8), catPinkMat, [0.005, 0.036, -0.005], earR, { cast: false });

        // Eyes (Glowing emerald)
        const eyeGroupL = new THREE.Group();
        eyeGroupL.position.set(0.11, 0.025, -0.055);
        catHeadGroup.add(eyeGroupL);
        const catEyeL = addMesh(new THREE.SphereGeometry(0.022, 10, 10), catEyeMat, [0, 0, 0], eyeGroupL, { cast: false });
        addMesh(new THREE.SphereGeometry(0.008, 8, 8), basic({ color: 0xffffff }), [0.015, 0.006, -0.003], eyeGroupL, { cast: false });

        const eyeGroupR = new THREE.Group();
        eyeGroupR.position.set(0.11, 0.025, 0.055);
        catHeadGroup.add(eyeGroupR);
        const catEyeR = addMesh(new THREE.SphereGeometry(0.022, 10, 10), catEyeMat, [0, 0, 0], eyeGroupR, { cast: false });
        addMesh(new THREE.SphereGeometry(0.008, 8, 8), basic({ color: 0xffffff }), [0.015, 0.006, 0.003], eyeGroupR, { cast: false });

        // Muzzle & Pink nose
        addMesh(new THREE.SphereGeometry(0.014, 8, 8), catPinkMat, [0.134, -0.006, 0], catHeadGroup, { cast: false });
        addMesh(new THREE.SphereGeometry(0.034, 10, 8), catMat, [0.11, -0.026, -0.026], catHeadGroup);
        addMesh(new THREE.SphereGeometry(0.034, 10, 8), catMat, [0.11, -0.026, 0.026], catHeadGroup);

        // Delicate Whiskers (3 left, 3 right)
        const whiskerMat = basic({ color: 0xe2e8f0 });
        [-0.015, 0, 0.015].forEach((dy) => {
            addMesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.07, 4), whiskerMat, [0.115, -0.02 + dy, -0.065], catHeadGroup, { rot: [0.35 + dy * 4, 0.4, 1.45], cast: false });
            addMesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.07, 4), whiskerMat, [0.115, -0.02 + dy, 0.065], catHeadGroup, { rot: [-0.35 - dy * 4, -0.4, 1.45], cast: false });
        });

        // 4 Articulated Quadruped Legs
        // Front Left Leg
        const legFL = new THREE.Group();
        legFL.position.set(0.16, -0.05, -0.11);
        catSpine.add(legFL);
        const legMeshFL = addMesh(new THREE.CylinderGeometry(0.032, 0.026, 0.13, 8), catMat, [0, -0.05, 0], legFL);
        const pawFL = addMesh(new THREE.SphereGeometry(0.038, 10, 8), catMat, [0.015, -0.11, 0], legFL);
        addMesh(new THREE.CircleGeometry(0.016, 8), catPawPadMat, [0.015, -0.125, 0], legFL, { rot: [Math.PI / 2, 0, 0], cast: false });

        // Front Right Leg
        const legFR = new THREE.Group();
        legFR.position.set(0.16, -0.05, 0.11);
        catSpine.add(legFR);
        const legMeshFR = addMesh(new THREE.CylinderGeometry(0.032, 0.026, 0.13, 8), catMat, [0, -0.05, 0], legFR);
        const pawFR = addMesh(new THREE.SphereGeometry(0.038, 10, 8), catMat, [0.015, -0.11, 0], legFR);
        addMesh(new THREE.CircleGeometry(0.016, 8), catPawPadMat, [0.015, -0.125, 0], legFR, { rot: [Math.PI / 2, 0, 0], cast: false });

        // Back Left Leg
        const legBL = new THREE.Group();
        legBL.position.set(-0.16, -0.03, -0.115);
        catSpine.add(legBL);
        const haunchBL = addMesh(new THREE.SphereGeometry(0.055, 10, 8), catMat, [0, 0, 0], legBL);
        haunchBL.scale.set(0.9, 1.25, 0.85);
        const legMeshBL = addMesh(new THREE.CylinderGeometry(0.028, 0.024, 0.12, 8), catMat, [0.01, -0.07, 0], legBL);
        const pawBL = addMesh(new THREE.SphereGeometry(0.036, 10, 8), catMat, [0.02, -0.125, 0], legBL);
        addMesh(new THREE.CircleGeometry(0.015, 8), catPawPadMat, [0.02, -0.138, 0], legBL, { rot: [Math.PI / 2, 0, 0], cast: false });

        // Back Right Leg
        const legBR = new THREE.Group();
        legBR.position.set(-0.16, -0.03, 0.115);
        catSpine.add(legBR);
        const haunchBR = addMesh(new THREE.SphereGeometry(0.055, 10, 8), catMat, [0, 0, 0], legBR);
        haunchBR.scale.set(0.9, 1.25, 0.85);
        const legMeshBR = addMesh(new THREE.CylinderGeometry(0.028, 0.024, 0.12, 8), catMat, [0.01, -0.07, 0], legBR);
        const pawBR = addMesh(new THREE.SphereGeometry(0.036, 10, 8), catMat, [0.02, -0.125, 0], legBR);
        addMesh(new THREE.CircleGeometry(0.015, 8), catPawPadMat, [0.02, -0.138, 0], legBR, { rot: [Math.PI / 2, 0, 0], cast: false });

        // Articulated 3-Segment Tail
        const tailRoot = new THREE.Group();
        tailRoot.position.set(-0.25, 0.03, 0);
        catSpine.add(tailRoot);

        const tailSeg1 = addMesh(new THREE.CylinderGeometry(0.030, 0.026, 0.14, 8), catMat, [0, 0.07, 0], tailRoot);
        tailSeg1.rotation.set(0, 0, -0.4);

        const tailMid = new THREE.Group();
        tailMid.position.set(0.03, 0.13, 0);
        tailRoot.add(tailMid);
        const tailSeg2 = addMesh(new THREE.CylinderGeometry(0.026, 0.022, 0.13, 8), catMat, [0, 0.065, 0], tailMid);

        const tailTipGroup = new THREE.Group();
        tailTipGroup.position.set(0.015, 0.12, 0);
        tailMid.add(tailTipGroup);
        const tailTipMesh = addMesh(new THREE.CylinderGeometry(0.022, 0.016, 0.12, 8), catSpotMat, [0, 0.06, 0], tailTipGroup);
        addMesh(new THREE.SphereGeometry(0.016, 8, 8), catSpotMat, [0, 0.12, 0], tailTipGroup);

        // Legacy reference so old code doesn't break
        const tail = tailRoot;

        /* ---------------------------------------------------------
           KOTETSU'S CYBER-YARN TOY BALL (INTERACTIVE 3D OBJECT)
        --------------------------------------------------------- */
        const catToy = new THREE.Group();
        catToy.position.set(-1.8, 0.08, 0.8);
        scene.add(catToy);

        const toyCoreMat = std(0xf472b6, 0.35, 0.5);
        const toyCore = addMesh(new THREE.SphereGeometry(0.075, 18, 14), toyCoreMat, [0, 0, 0], catToy, { station: 'cat' });
        toyCore.userData.isCat = true;
        toyCore.userData.isCatToy = true;

        const toyRing1 = addMesh(new THREE.TorusGeometry(0.078, 0.010, 8, 24), basic({ color: 0x38bdf8 }), [0, 0, 0], catToy, { rot: [0.6, 0.4, 0], cast: false });
        toyRing1.userData.isCat = true;
        toyRing1.userData.isCatToy = true;

        const toyRing2 = addMesh(new THREE.TorusGeometry(0.078, 0.010, 8, 24), basic({ color: 0xfacc15 }), [0, 0, 0], catToy, { rot: [-0.7, 1.1, 0.4], cast: false });
        toyRing2.userData.isCat = true;
        toyRing2.userData.isCatToy = true;

        const toyLight = new THREE.PointLight(0xf472b6, 0.75, 2.2);
        toyLight.position.set(0, 0.06, 0);
        catToy.add(toyLight);

        /* ---------------------------------------------------------
           KOTETSU'S PLAY AREA: PLUSH CYBER-MOUSE & COZY YARN BALL
        --------------------------------------------------------- */
        const catPlayArea = new THREE.Group();
        catPlayArea.position.set(-3.25, 0.04, 1.45);
        scene.add(catPlayArea);

        // 1. Plush Toy Mouse (Ratón de felpa con orejas, bigotes y colita con cascabel)
        const toyMouseGroup = new THREE.Group();
        toyMouseGroup.position.set(0, 0, 0);
        catPlayArea.add(toyMouseGroup);

        const mousePlushMat = std(0x6366f1, 0.85, 0.08); // Plush indigo/lavender fur
        const mouseBody = addMesh(new THREE.SphereGeometry(0.065, 14, 12), mousePlushMat, [0, 0.05, 0], toyMouseGroup, { station: 'cat' });
        mouseBody.scale.set(1.45, 0.85, 0.95);
        mouseBody.userData.isCat = true;
        mouseBody.userData.isToyMouse = true;

        // Pink Felt Ears
        const mouseEarMat = basic({ color: 0xf472b6 });
        addMesh(new THREE.CircleGeometry(0.024, 10), mouseEarMat, [0.04, 0.09, -0.04], toyMouseGroup, { rot: [0, -0.4, 0.3], cast: false });
        addMesh(new THREE.CircleGeometry(0.024, 10), mouseEarMat, [0.04, 0.09, 0.04], toyMouseGroup, { rot: [0, 0.4, -0.3], cast: false });

        // Pink Nose & Glowing cyan LED eyes
        addMesh(new THREE.SphereGeometry(0.009, 8, 8), basic({ color: 0xf43f5e }), [0.095, 0.045, 0], toyMouseGroup, { cast: false });
        addMesh(new THREE.SphereGeometry(0.007, 8, 8), basic({ color: 0x38bdf8 }), [0.07, 0.065, -0.035], toyMouseGroup, { cast: false });
        addMesh(new THREE.SphereGeometry(0.007, 8, 8), basic({ color: 0x38bdf8 }), [0.07, 0.065, 0.035], toyMouseGroup, { cast: false });

        // Long braided rope tail with gold bell
        const mouseTailCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(-0.08, 0.04, 0),
            new THREE.Vector3(-0.16, 0.06, -0.05),
            new THREE.Vector3(-0.24, 0.03, -0.02),
            new THREE.Vector3(-0.30, 0.05, -0.07)
        ]);
        const mouseTailMesh = new THREE.Mesh(new THREE.TubeGeometry(mouseTailCurve, 16, 0.006, 6, false), std(0xf472b6, 0.8, 0.1));
        toyMouseGroup.add(mouseTailMesh);
        addMesh(new THREE.SphereGeometry(0.015, 8, 8), basic({ color: 0xfbbf24 }), [-0.30, 0.05, -0.07], toyMouseGroup, { cast: false });

        // 2. Cozy Wool Yarn Ball (Pelota de Lana de Estambre Texturada)
        const yarnBallGroup = new THREE.Group();
        yarnBallGroup.position.set(0.35, 0.06, -0.15);
        catPlayArea.add(yarnBallGroup);

        const yarnMat = std(0x06b6d4, 0.90, 0.05); // Cyan wool yarn
        const yarnBallMesh = addMesh(new THREE.SphereGeometry(0.065, 16, 14), yarnMat, [0, 0, 0], yarnBallGroup, { station: 'cat' });
        yarnBallMesh.userData.isCat = true;
        yarnBallMesh.userData.isYarnBall = true;
        addMesh(new THREE.TorusGeometry(0.066, 0.008, 8, 20), std(0x0891b2, 0.85, 0.05), [0, 0, 0], yarnBallGroup, { rot: [0.6, 0.4, 0], cast: false });
        addMesh(new THREE.TorusGeometry(0.066, 0.008, 8, 20), std(0x22d3ee, 0.85, 0.05), [0, 0, 0], yarnBallGroup, { rot: [-0.8, 0.9, 0.5], cast: false });

        /* ---------------------------------------------------------
           KOTETSU'S GOURMET BISTRO: WATER FOUNTAIN & FOOD STATION
        --------------------------------------------------------- */
        const catFoodStation = new THREE.Group();
        catFoodStation.position.set(-2.85, 0, 3.05);
        catFoodStation.rotation.y = 0;
        scene.add(catFoodStation);

        // 1. Walnut wood elevated feeder tray with beveled stand
        const trayMat = std(0x2c1b12, 0.65, 0.12);
        addMesh(new THREE.BoxGeometry(0.78, 0.09, 0.42), trayMat, [0, 0.045, 0], catFoodStation, { station: 'cat' });
        const trayBrassMat = std(0xd4a24c, 0.3, 0.85);
        [[-0.34, -0.16], [0.34, -0.16], [-0.34, 0.16], [0.34, 0.16]].forEach(([fx, fz]) => {
            addMesh(new THREE.CylinderGeometry(0.016, 0.020, 0.024, 12), trayBrassMat, [fx, -0.01, fz], catFoodStation);
        });
        // Brass nameplate "🍽️ KOTETSU BISTRO"
        addMesh(new THREE.BoxGeometry(0.28, 0.038, 0.008), trayBrassMat, [0, 0.055, 0.215], catFoodStation, { cast: false });

        // 2. Bowl 1: WATER FOUNTAIN (Bebedero de Agua Filtrada con ondas animadas)
        const bowlMat = std(0xf8fafc, 0.25, 0.4);
        const waterBowlGroup = new THREE.Group();
        waterBowlGroup.position.set(-0.20, 0.09, 0);
        catFoodStation.add(waterBowlGroup);

        addMesh(new THREE.CylinderGeometry(0.14, 0.11, 0.08, 24), bowlMat, [0, 0.04, 0], waterBowlGroup, { station: 'cat' });
        addMesh(new THREE.TorusGeometry(0.138, 0.014, 10, 24), bowlMat, [0, 0.08, 0], waterBowlGroup, { rot: [Math.PI / 2, 0, 0], cast: false });

        const waterMat = std(0x38bdf8, 0.15, 0.90, { transparent: true, opacity: 0.85 });
        const waterSurface = addMesh(new THREE.CircleGeometry(0.13, 24), waterMat, [0, 0.072, 0], waterBowlGroup, { rot: [-Math.PI / 2, 0, 0], cast: false });
        const waterRipples = addMesh(new THREE.RingGeometry(0.015, 0.035, 20), basic({ color: 0xbae6fd, transparent: true, opacity: 0.75 }), [0, 0.074, 0], waterBowlGroup, { rot: [-Math.PI / 2, 0, 0], cast: false });

        addMesh(new THREE.CylinderGeometry(0.012, 0.016, 0.032, 12), trayBrassMat, [0, 0.078, 0], waterBowlGroup, { cast: false });
        const waterLed = new THREE.PointLight(0x38bdf8, 0.65, 1.4);
        waterLed.position.set(0, 0.10, 0);
        waterBowlGroup.add(waterLed);

        // 3. Bowl 2: FOOD BOWL (Comedero con Croquetas Gourmet)
        const foodBowlGroup = new THREE.Group();
        foodBowlGroup.position.set(0.20, 0.09, 0);
        catFoodStation.add(foodBowlGroup);

        addMesh(new THREE.CylinderGeometry(0.14, 0.11, 0.08, 24), bowlMat, [0, 0.04, 0], foodBowlGroup, { station: 'cat' });
        addMesh(new THREE.TorusGeometry(0.138, 0.014, 10, 24), bowlMat, [0, 0.08, 0], foodBowlGroup, { rot: [Math.PI / 2, 0, 0], cast: false });

        const kibbleSalmonMat = std(0xf472b6, 0.8, 0.1);
        const kibbleTunaMat = std(0x854d0e, 0.85, 0.08);
        addMesh(new THREE.CylinderGeometry(0.125, 0.08, 0.045, 18), kibbleTunaMat, [0, 0.065, 0], foodBowlGroup);
        for (let k = 0; k < 14; k++) {
            const ka = (k / 14) * Math.PI * 2 + (k % 3) * 0.4;
            const kr = 0.03 + (k % 4) * 0.02;
            const kx = Math.cos(ka) * kr;
            const kz = Math.sin(ka) * kr;
            const kMat = (k % 2 === 0) ? kibbleSalmonMat : kibbleTunaMat;
            addMesh(new THREE.BoxGeometry(0.024, 0.020, 0.028), kMat, [kx, 0.085 + (k % 3) * 0.008, kz], foodBowlGroup, {
                rot: [0.2, ka, 0.1]
            });
        }
        addMesh(new THREE.ConeGeometry(0.018, 0.045, 8), std(0xf59e0b, 0.5, 0.5), [0, 0.105, 0], foodBowlGroup, { rot: [0, 0, Math.PI / 2], cast: false });

        // Hearts & sparkles particle system
        const CAT_PART_COUNT = 24;
        const catPartPos = new Float32Array(CAT_PART_COUNT * 3);
        const catPartVels = [];
        const catPartAges = new Float32Array(CAT_PART_COUNT);
        for (let i = 0; i < CAT_PART_COUNT; i++) {
            catPartPos[i * 3] = 0;
            catPartPos[i * 3 + 1] = -50;
            catPartPos[i * 3 + 2] = 0;
            catPartAges[i] = 999;
            catPartVels.push({ x: 0, y: 0.35, z: 0 });
        }
        const catPartGeo = new THREE.BufferGeometry();
        catPartGeo.setAttribute('position', new THREE.BufferAttribute(catPartPos, 3));
        const catPartMat = new THREE.PointsMaterial({
            color: 0xf472b6,
            size: 0.055,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const catParticles = new THREE.Points(catPartGeo, catPartMat);
        scene.add(catParticles);

        function spawnCatHearts(origin) {
            for (let i = 0; i < 8; i++) {
                const idx = Math.floor(Math.random() * CAT_PART_COUNT);
                catPartPos[idx * 3] = origin.x + (Math.random() - 0.5) * 0.28;
                catPartPos[idx * 3 + 1] = origin.y + 0.12 + Math.random() * 0.14;
                catPartPos[idx * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.28;
                catPartVels[idx].x = (Math.random() - 0.5) * 0.16;
                catPartVels[idx].y = 0.22 + Math.random() * 0.28;
                catPartVels[idx].z = (Math.random() - 0.5) * 0.16;
                catPartAges[idx] = 0;
            }
            catPartGeo.attributes.position.needsUpdate = true;
        }

        /* ---------------------------------------------------------
           KOTETSU WAYPOINT MAP, GRAPH & PATHFINDING (ROAMING & FURNITURE)
        --------------------------------------------------------- */
        const KOTETSU_WAYPOINTS = {
            'beanbag': { id: 'beanbag', x: -4.75, y: 0.44, z: 1.25, isBed: true, name: 'Cama Nido Escandinava', action: 'sleep' },
            'lounge_rug': { id: 'lounge_rug', x: -3.55, y: 0.16, z: 1.35, name: 'Zona Lounge', action: 'stretch' },
            'food_station': { id: 'food_station', x: -2.85, y: 0.16, z: 2.65, name: 'Gourmet Bistro (Agua & Comida)', action: 'nourish' },
            'toy_mouse': { id: 'toy_mouse', x: -3.25, y: 0.16, z: 1.50, name: 'Rincón de Juguetes', action: 'play_mouse' },
            'whiteboard': { id: 'whiteboard', x: -4.25, y: 0.16, z: -0.25, name: 'Pizarra de Certificaciones', action: 'sniff' },
            'arcade': { id: 'arcade', x: -4.30, y: 0.16, z: -3.00, name: 'Edu Tetris Arcade', action: 'watch_arcade' },
            'window': { id: 'window', x: 0.40, y: 0.16, z: -3.20, name: 'Ventanal Panorámico', action: 'sunbathe' },
            'window_ledge': { id: 'window_ledge', x: 0.40, y: 0.91, z: -4.25, isFurniture: true, name: 'Alféizar del Ventanal', action: 'watch_birds' },
            'dj': { id: 'dj', x: 2.80, y: 0.16, z: -3.20, name: 'Estación de Música IA', action: 'listen_music' },
            'credenza_front': { id: 'credenza_front', x: 1.75, y: 0.16, z: -3.65, name: 'Frente al Mapamundi', action: 'ponder_globe' },
            'credenza_surface': { id: 'credenza_surface', x: 2.25, y: 0.88, z: -4.40, isFurniture: true, name: 'Sobre la Credenza del Mapamundi', action: 'perch_credenza' },
            'desk_front': { id: 'desk_front', x: -0.30, y: 0.16, z: 0.95, name: 'Frente al Escritorio', action: 'groom' },
            'desk_surface': { id: 'desk_surface', x: -0.05, y: 1.24, z: 0.28, isFurniture: true, name: 'Sobre el Escritorio de Eduardo', action: 'loaf_desk' },
            'desk_robot': { id: 'desk_robot', x: 0.65, y: 0.16, z: 0.75, name: 'Junto a EduBot', action: 'greet_robot' },
            'center': { id: 'center', x: -1.20, y: 0.16, z: 0.20, name: 'Alfombra Central', action: 'play_ball' }
        };

        const WAYPOINT_GRAPH = {
            'beanbag': ['lounge_rug'],
            'lounge_rug': ['beanbag', 'food_station', 'toy_mouse', 'whiteboard', 'center'],
            'food_station': ['lounge_rug', 'toy_mouse', 'center'],
            'toy_mouse': ['lounge_rug', 'food_station', 'whiteboard', 'center'],
            'whiteboard': ['lounge_rug', 'toy_mouse', 'arcade', 'center'],
            'arcade': ['whiteboard', 'window', 'window_ledge'],
            'window': ['arcade', 'window_ledge', 'credenza_front', 'dj', 'center'],
            'window_ledge': ['window'],
            'dj': ['window', 'credenza_front', 'desk_robot', 'center'],
            'credenza_front': ['window', 'dj', 'credenza_surface', 'center'],
            'credenza_surface': ['credenza_front'],
            'desk_robot': ['dj', 'credenza_front', 'desk_front', 'center'],
            'desk_front': ['desk_robot', 'desk_surface', 'center', 'lounge_rug'],
            'desk_surface': ['desk_front'],
            'center': ['lounge_rug', 'food_station', 'toy_mouse', 'whiteboard', 'window', 'dj', 'credenza_front', 'desk_robot', 'desk_front']
        };

        function findCatPath(startId, goalId) {
            if (startId === goalId) return [goalId];
            const queue = [[startId]];
            const visited = new Set([startId]);
            while (queue.length > 0) {
                const path = queue.shift();
                const node = path[path.length - 1];
                const neighbors = WAYPOINT_GRAPH[node] || [];
                for (const next of neighbors) {
                    if (next === goalId) {
                        return path.slice(1).concat(next);
                    }
                    if (!visited.has(next)) {
                        visited.add(next);
                        queue.push(path.concat(next));
                    }
                }
            }
            return [goalId];
        }

        function getClosestWaypoint(px, pz) {
            let bestId = 'center';
            let bestDist = 999999;
            for (const [id, wp] of Object.entries(KOTETSU_WAYPOINTS)) {
                if (id === 'beanbag' || wp.isFurniture) continue;
                const dist = Math.hypot(wp.x - px, wp.z - pz);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestId = id;
                }
            }
            return bestId;
        }

        function lerpAngle(current, target, alpha) {
            let diff = (target - current) % (Math.PI * 2);
            if (diff < -Math.PI) diff += Math.PI * 2;
            if (diff > Math.PI) diff -= Math.PI * 2;
            return current + diff * alpha;
        }

        /* ---------------------------------------------------------
           KOTETSU STATE MACHINE & AUTONOMOUS ROAMING
        --------------------------------------------------------- */
        let catState = 'sleeping'; // 'sleeping', 'waking', 'jumping_down', 'walking', 'running_zoomies', 'hunting_wiggle', 'pouncing', 'investigating', 'grooming', 'jumping_up', 'drinking', 'eating', 'dancing', 'perch_furniture'
        let currentWaypointId = 'beanbag';
        let pathQueue = [];
        let stateStartTime = performance.now();
        let stateDuration = 28.0;
        let walkPhase = 0;
        let runPhase = 0;
        let jumpStartPos = new THREE.Vector3();
        let jumpEndPos = new THREE.Vector3();
        let pounceCount = 0;
        let isCatVisitingDesk = false;
        let lastAutoActionTime = performance.now();
        let nextActivityAfterLanding = null;
        let lastLickSoundTime = 0;
        let lastCrunchSoundTime = 0;

        const toyPos = new THREE.Vector3(-1.8, 0.08, 0.8);
        const toyVel = new THREE.Vector2(0, 0);

        function startWaking() {
            catState = 'waking';
            stateStartTime = performance.now();
            stateDuration = 2.2;
            catEyeMat.color.setHex(0x10b981);
            playCatMeow('chirp');
        }

        function startJumpDown(afterLanding = null) {
            catState = 'jumping_down';
            nextActivityAfterLanding = afterLanding;
            stateStartTime = performance.now();
            stateDuration = 0.75;
            jumpStartPos.copy(catRoot.position);
            jumpEndPos.set(-3.55, 0.16, 1.35); // lounge_rug
            catRoot.rotation.y = -Math.atan2(jumpEndPos.z - jumpStartPos.z, jumpEndPos.x - jumpStartPos.x);
            triggerBedSquish(false); // Elastic rebound of bed cushion
        }

        function startJumpUp(goalWpId = 'beanbag') {
            catState = 'jumping_up';
            stateStartTime = performance.now();
            stateDuration = 0.85;
            jumpStartPos.copy(catRoot.position);
            const targetWp = KOTETSU_WAYPOINTS[goalWpId] || KOTETSU_WAYPOINTS['beanbag'];
            jumpEndPos.set(targetWp.x, targetWp.y, targetWp.z);
            currentWaypointId = goalWpId;
            catRoot.rotation.y = -Math.atan2(jumpEndPos.z - jumpStartPos.z, jumpEndPos.x - jumpStartPos.x);
            if (goalWpId === 'beanbag') {
                triggerBedSquish(true);
            }
            if (goalWpId === 'desk_surface') {
                isCatVisitingDesk = true;
                playCatMeow('happy');
            }
        }

        function startWalkTo(goalId, mode = 'walking') {
            if (currentWaypointId === 'beanbag' && goalId !== 'beanbag') {
                startJumpDown(goalId);
                return;
            }
            // If already on furniture, jump down to floor base first
            if (currentWaypointId === 'desk_surface' && goalId !== 'desk_surface') {
                jumpStartPos.copy(catRoot.position);
                jumpEndPos.set(-0.30, 0.16, 0.95);
                catState = 'jumping_down';
                nextActivityAfterLanding = goalId;
                stateStartTime = performance.now();
                stateDuration = 0.70;
                return;
            }
            if (currentWaypointId === 'credenza_surface' && goalId !== 'credenza_surface') {
                jumpStartPos.copy(catRoot.position);
                jumpEndPos.set(3.10, 0.16, -1.35);
                catState = 'jumping_down';
                nextActivityAfterLanding = goalId;
                stateStartTime = performance.now();
                stateDuration = 0.70;
                return;
            }
            if (currentWaypointId === 'window_ledge' && goalId !== 'window_ledge') {
                jumpStartPos.copy(catRoot.position);
                jumpEndPos.set(0.40, 0.16, -3.20);
                catState = 'jumping_down';
                nextActivityAfterLanding = goalId;
                stateStartTime = performance.now();
                stateDuration = 0.70;
                return;
            }

            const startId = currentWaypointId === 'beanbag' ? 'lounge_rug' : currentWaypointId;
            pathQueue = findCatPath(startId, goalId);
            catState = mode;
            stateStartTime = performance.now();
        }

        function startCatPlayActivity() {
            pounceCount = 0;
            // Kick toy into room
            toyVel.x = (Math.random() - 0.5) * 3.2;
            toyVel.y = (Math.random() - 0.5) * 3.2;
            playToyMouseSqueak();
            playCatPlayChirp();

            if (currentWaypointId === 'beanbag') {
                startJumpDown('running_zoomies');
            } else {
                catState = 'running_zoomies';
            }
        }

        function sendCatToDesk() {
            isCatVisitingDesk = false;
            startWalkTo('desk_surface', 'walking');
        }

        function sendCatToFood() {
            isCatVisitingDesk = false;
            startWalkTo('food_station', 'walking');
        }

        function sendCatToSleep() {
            isCatVisitingDesk = false;
            if (currentWaypointId === 'beanbag') {
                catState = 'sleeping';
                return;
            }
            startWalkTo('lounge_rug', 'walking');
        }

        function startCatDance() {
            catState = 'dancing';
            stateStartTime = performance.now();
            playCatMeow('chirp');
            if (window.eduSpotifyPlayer) {
                window.eduSpotifyPlayer.play();
            }
        }

        function startHuntingWiggle() {
            catState = 'hunting_wiggle';
            stateStartTime = performance.now();
            stateDuration = 0.65;
        }

        function startPounce() {
            catState = 'pouncing';
            stateStartTime = performance.now();
            stateDuration = 0.50;
            playCatPlayChirp();
        }

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
                color: SCENIC_LOCATIONS[0].dustColor,
                size: 0.035,
                transparent: true,
                opacity: 0.55,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            })
        );
        scene.add(dust);
        dustMesh = dust;

        /* ---------------------------------------------------------
           DISCO BALL & STAGE PARTY LIGHTING SYSTEM (→ Fiesta 3D)
        --------------------------------------------------------- */
        const discoCenterX = 0.2;
        const discoCenterZ = -0.6;
        const discoRetractedY = 8.85; // Tucked into upper ceiling (walls reach 9.05)
        const discoPartyY = 4.85;     // Lowered into stage center above desk
        let discoCurrentY = discoRetractedY;
        let partyModeLerp = 0.0;

        // 1. Ceiling mount flange & eyelet hook
        addMesh(
            new THREE.CylinderGeometry(0.24, 0.24, 0.04, 24),
            std(0x27272a, 0.3, 0.9),
            [discoCenterX, 8.98, discoCenterZ],
            scene,
            { cast: false }
        );
        addMesh(
            new THREE.TorusGeometry(0.045, 0.012, 10, 20),
            std(0xd4d4d8, 0.2, 0.95),
            [discoCenterX, 8.94, discoCenterZ],
            scene,
            { cast: false }
        );

        // 2. Dynamic hanging metallic chain/cable
        const chainMesh = addMesh(
            new THREE.CylinderGeometry(0.014, 0.014, 1, 12),
            std(0xd4d4d8, 0.2, 0.95),
            [discoCenterX, 7.0, discoCenterZ],
            scene,
            { cast: false }
        );
        chainMesh.visible = false;

        // 3. Disco Ball Root Group (moves vertically)
        const discoBallGroup = new THREE.Group();
        discoBallGroup.position.set(discoCenterX, discoRetractedY, discoCenterZ);
        scene.add(discoBallGroup);

        // 4. Disco Ball Rotating Body
        const discoBallBody = new THREE.Group();
        discoBallGroup.add(discoBallBody);

        // Procedural Faceted Mirror Mosaic Texture (512x512)
        const discoTileTex = canvasTexture(512, 512, (ctx, w, h) => {
            ctx.fillStyle = '#0f1117';
            ctx.fillRect(0, 0, w, h);
            const cols = 24, rows = 24;
            const tw = w / cols, th = h / rows;
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const x = c * tw, y = r * th;
                    const grad = ctx.createLinearGradient(x, y, x + tw, y + th);
                    const b = 0.65 + Math.random() * 0.35;
                    const rC = Math.floor(b * 220 + Math.random() * 35);
                    const gC = Math.floor(b * 230 + Math.random() * 25);
                    const bC = Math.floor(b * 255);
                    grad.addColorStop(0, `rgb(${rC}, ${gC}, ${bC})`);
                    grad.addColorStop(0.45, '#ffffff');
                    grad.addColorStop(1, `rgb(${Math.floor(rC * 0.5)}, ${Math.floor(gC * 0.5)}, ${Math.floor(bC * 0.6)})`);
                    ctx.fillStyle = grad;
                    ctx.fillRect(x + 1, y + 1, tw - 2, th - 2);

                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
                    ctx.lineWidth = 0.8;
                    ctx.strokeRect(x + 1.5, y + 1.5, tw - 3, th - 3);
                }
            }
        });

        // Mirror sphere with flat shading for sharp specular facet gleams
        const discoBallMat = std(0xffffff, 0.05, 0.98, {
            map: discoTileTex,
            roughness: 0.08,
            metalness: 0.98,
            flatShading: true,
            envMapIntensity: 2.8
        });
        addMesh(
            new THREE.SphereGeometry(0.44, 28, 20),
            discoBallMat,
            [0, 0, 0],
            discoBallBody,
            { cast: false, receive: false }
        );

        // Top suspension cap & loop
        addMesh(new THREE.CylinderGeometry(0.1, 0.04, 0.05, 16), std(0xd4d4d8, 0.2, 0.95), [0, 0.44, 0], discoBallBody, { cast: false });
        addMesh(new THREE.TorusGeometry(0.04, 0.01, 8, 16), std(0xd4d4d8, 0.2, 0.95), [0, 0.48, 0], discoBallBody, { cast: false });
        // Bottom chrome finial cap
        addMesh(new THREE.CylinderGeometry(0.03, 0.08, 0.04, 16), std(0xd4d4d8, 0.2, 0.95), [0, -0.44, 0], discoBallBody, { cast: false });

        // 5. Volumetric Sweeping Party Light Beams (Atmospheric misty beams radiating outwards across room)
        const partyBeamGroup = new THREE.Group();
        discoBallBody.add(partyBeamGroup);

        const beamAlphaTex = canvasTexture(64, 256, (ctx, w, h) => {
            const grad = ctx.createLinearGradient(0, 0, 0, h);
            grad.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
            grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.28)');
            grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.10)');
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
        });

        const beamColors = [0xff007f, 0x00e5ff, 0xf59e0b, 0xa855f7, 0x10b981, 0xec4899, 0x38bdf8, 0xf43f5e];
        const beamMeshes = [];
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            const tilt = 0.82 + (i % 3) * 0.14; // Wide angles (47 - 63 deg) so beams sweep walls & perimeter, never converging on desk
            const beamGeo = new THREE.ConeGeometry(0.55, 8.2, 16, 1, true);
            beamGeo.translate(0, -4.1, 0);
            const beamMat = new THREE.MeshBasicMaterial({
                map: beamAlphaTex,
                color: beamColors[i],
                transparent: true,
                opacity: 0.0,
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            const beamMesh = new THREE.Mesh(beamGeo, beamMat);
            beamMesh.rotation.set(Math.sin(angle) * tilt, angle, Math.cos(angle) * tilt);
            partyBeamGroup.add(beamMesh);
            beamMeshes.push(beamMesh);
        }

        // 6. Saturated Dynamic Orbiting Stage Party PointLights (Magenta, Cyan, Gold, Violet, Emerald)
        const partyPointLights = [
            { light: new THREE.PointLight(0xff007f, 0, 14.0, 1.3), color: 0xff007f, baseInt: 4.0, beatAmp: 3.5, offset: 0, speed: 2.2, r: 3.2, yAmp: 0.8 },
            { light: new THREE.PointLight(0x00f0ff, 0, 14.0, 1.3), color: 0x00f0ff, baseInt: 4.0, beatAmp: 3.5, offset: Math.PI * 0.5, speed: 2.5, r: 3.0, yAmp: 0.7 },
            { light: new THREE.PointLight(0xf59e0b, 0, 13.0, 1.3), color: 0xf59e0b, baseInt: 3.5, beatAmp: 3.0, offset: Math.PI, speed: 1.9, r: 3.5, yAmp: 0.9 },
            { light: new THREE.PointLight(0xa855f7, 0, 14.0, 1.3), color: 0xa855f7, baseInt: 3.8, beatAmp: 3.2, offset: Math.PI * 1.5, speed: 2.7, r: 2.9, yAmp: 0.75 },
            { light: new THREE.PointLight(0x10b981, 0, 13.0, 1.3), color: 0x10b981, baseInt: 3.2, beatAmp: 2.8, offset: Math.PI * 0.8, speed: 2.1, r: 3.2, yAmp: 0.6 }
        ];
        partyPointLights.forEach(p => {
            scene.add(p.light);
        });

        // 7. Stage Wall Washers (Powerful uplights/par fixtures washing left and back walls in concert neons)
        const stageWallWashers = [
            {
                spot: new THREE.SpotLight(0xa855f7, 0, 16.0, 0.75, 0.9, 1.2),
                pos: [-5.4, 0.3, -3.8],
                targetPos: [-6.15, 4.2, -3.8],
                baseInt: 6.5,
                beatAmp: 5.0
            },
            {
                spot: new THREE.SpotLight(0x00f0ff, 0, 16.0, 0.75, 0.9, 1.2),
                pos: [-5.4, 0.3, 1.5],
                targetPos: [-6.15, 4.2, 1.5],
                baseInt: 6.5,
                beatAmp: 5.0
            },
            {
                spot: new THREE.SpotLight(0xff007f, 0, 16.0, 0.78, 0.9, 1.2),
                pos: [-3.8, 0.3, -4.5],
                targetPos: [-3.8, 4.5, -5.15],
                baseInt: 7.0,
                beatAmp: 5.5
            },
            {
                spot: new THREE.SpotLight(0x00e5ff, 0, 16.0, 0.78, 0.9, 1.2),
                pos: [3.8, 0.3, -4.5],
                targetPos: [3.8, 4.5, -5.15],
                baseInt: 7.0,
                beatAmp: 5.5
            }
        ];
        stageWallWashers.forEach(ww => {
            ww.target = new THREE.Object3D();
            ww.spot.position.set(ww.pos[0], ww.pos[1], ww.pos[2]);
            ww.target.position.set(ww.targetPos[0], ww.targetPos[1], ww.targetPos[2]);
            scene.add(ww.spot);
            scene.add(ww.target);
            ww.spot.target = ww.target;
        });

        // 8. Dynamic Stage Moving-Head Spotlights (Magenta, Cyan, Gold) sweeping walls and perimeter
        const stageSpotlights = [
            {
                spot: new THREE.SpotLight(0xff007f, 0, 16.0, 0.48, 0.85, 1.2),
                target: new THREE.Object3D(),
                baseInt: 7.0,
                beatAmp: 6.0,
                origin: [discoCenterX - 1.8, 7.8, discoCenterZ - 1.4],
                speed: 1.6,
                phase: 0,
                rX: 4.2,
                rZ: 3.2,
                yBase: 3.2,
                yAmp: 1.8
            },
            {
                spot: new THREE.SpotLight(0x00e5ff, 0, 16.0, 0.48, 0.85, 1.2),
                target: new THREE.Object3D(),
                baseInt: 7.0,
                beatAmp: 6.0,
                origin: [discoCenterX + 1.8, 7.8, discoCenterZ - 1.4],
                speed: 1.9,
                phase: Math.PI * 0.7,
                rX: 3.8,
                rZ: 3.5,
                yBase: 2.8,
                yAmp: 2.0
            },
            {
                spot: new THREE.SpotLight(0xfacc15, 0, 15.0, 0.46, 0.85, 1.2),
                target: new THREE.Object3D(),
                baseInt: 6.0,
                beatAmp: 5.0,
                origin: [discoCenterX, 8.0, discoCenterZ + 1.6],
                speed: 2.2,
                phase: Math.PI * 1.3,
                rX: 3.5,
                rZ: 3.6,
                yBase: 0.3,
                yAmp: 0.4
            }
        ];
        stageSpotlights.forEach(sp => {
            sp.spot.position.set(sp.origin[0], sp.origin[1], sp.origin[2]);
            scene.add(sp.spot);
            scene.add(sp.target);
            sp.spot.target = sp.target;
        });

        // 9. Overhead Beat Strobe Point Light (flashes on kick/snare impacts)
        const strobeLight = new THREE.PointLight(0xffffff, 0, 16.0, 1.4);
        strobeLight.position.set(discoCenterX, 6.2, discoCenterZ);
        scene.add(strobeLight);

        // 10. Saturated Moving Neon Light Pools & Wall Gobos across stage surfaces
        const stageGobos = [
            // Floor Pools (cyan lounge, magenta DJ station, amber arcade, violet front, emerald front-left)
            { type: 'floor', color: 0x00e5ff, radX: 3.8, radZ: 1.8, speed: 1.1, phase: 0, scale: 2.5, y: 0.018 },
            { type: 'floor', color: 0xff007f, radX: 3.8, radZ: -2.4, speed: 1.4, phase: Math.PI * 0.4, scale: 2.5, y: 0.019 },
            { type: 'floor', color: 0xf59e0b, radX: -3.8, radZ: -2.4, speed: 1.2, phase: Math.PI * 0.8, scale: 2.5, y: 0.020 },
            { type: 'floor', color: 0xa855f7, radX: 2.0, radZ: 2.8, speed: 1.3, phase: Math.PI * 1.2, scale: 2.5, y: 0.021 },
            { type: 'floor', color: 0x10b981, radX: -2.2, radZ: 2.6, speed: 1.5, phase: Math.PI * 1.6, scale: 2.5, y: 0.022 },
            // Left Wall Gobos (sweeping across the dark wall panels)
            { type: 'wallLeft', color: 0xff007f, yMin: 2.0, yMax: 5.5, zMin: -3.8, zMax: 2.5, speed: 1.2, phase: 0.5, scale: 3.2, x: -5.99 },
            { type: 'wallLeft', color: 0x00f0ff, yMin: 1.5, yMax: 5.0, zMin: -2.5, zMax: 3.5, speed: 1.6, phase: 2.4, scale: 3.0, x: -5.98 },
            // Back Wall Gobos (sweeping across back wall & window surrounds)
            { type: 'wallBack', color: 0xa855f7, xMin: -4.8, xMax: 4.8, yMin: 2.0, yMax: 6.2, speed: 1.1, phase: 1.8, scale: 3.4, z: -4.99 },
            { type: 'wallBack', color: 0xfacc15, xMin: -4.2, xMax: 4.2, yMin: 1.8, yMax: 5.8, speed: 1.4, phase: 3.6, scale: 2.8, z: -4.98 }
        ];

        const goboAlphaTex = canvasTexture(256, 256, (ctx, w, h) => {
            const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
            grad.addColorStop(0, 'rgba(255, 255, 255, 0.75)');
            grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.45)');
            grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.10)');
            grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, h);
        });

        const stageGoboMeshes = [];
        stageGobos.forEach((gb) => {
            const mat = new THREE.MeshBasicMaterial({
                map: goboAlphaTex,
                color: gb.color,
                transparent: true,
                opacity: 0,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(gb.scale, gb.scale), mat);
            if (gb.type === 'floor') {
                mesh.rotation.x = -Math.PI / 2;
                mesh.position.set(0, gb.y, 0);
            } else if (gb.type === 'wallLeft') {
                mesh.rotation.y = Math.PI / 2;
                mesh.position.set(gb.x, 3.5, 0);
            } else if (gb.type === 'wallBack') {
                mesh.position.set(0, 3.5, gb.z);
            }
            scene.add(mesh);
            stageGoboMeshes.push({
                mesh,
                mat,
                ...gb
            });
        });

        // 11. Dynamic Concert Stage Laser Beams (cutting through the air and hitting surfaces)
        const laserBeams = [];
        const laserColors = [0xff007f, 0x00f0ff, 0x22c55e, 0xa855f7, 0x00f0ff, 0xff007f];
        const laserGroup = new THREE.Group();
        scene.add(laserGroup);

        for (let i = 0; i < 6; i++) {
            const laserGeo = new THREE.CylinderGeometry(0.008, 0.012, 11, 8);
            laserGeo.translate(0, -5.5, 0);
            const laserMat = new THREE.MeshBasicMaterial({
                color: laserColors[i],
                transparent: true,
                opacity: 0,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            const laserMesh = new THREE.Mesh(laserGeo, laserMat);
            laserMesh.position.set(discoCenterX, 7.8, discoCenterZ);
            laserGroup.add(laserMesh);
            laserBeams.push({
                mesh: laserMesh,
                mat: laserMat,
                speedX: 2.0 + (i % 3) * 0.6,
                speedZ: 2.4 + ((i + 1) % 3) * 0.5,
                phase: (i / 6) * Math.PI * 2,
                baseTilt: 0.54 + (i % 2) * 0.24
            });
        }

        // 11. Specular Disco Ball Reflection Sparkles (crisp spots covering floor, walls, desk)
        const sparkleCount = mobileAtStart ? 120 : 240;
        const sparklePos = new Float32Array(sparkleCount * 3);
        const sparkleColors = new Float32Array(sparkleCount * 3);
        const sparkleRand = seededRandom(42);
        const colorPalette = [
            [1.0, 0.0, 0.55],  // neon magenta
            [0.0, 0.95, 1.0],  // electric cyan
            [1.0, 0.85, 0.2],  // gold
            [0.7, 0.3, 1.0],   // violet
            [0.15, 0.95, 0.4], // emerald
            [1.0, 1.0, 1.0]    // pure specular white
        ];
        for (let i = 0; i < sparkleCount; i++) {
            const theta = sparkleRand() * Math.PI * 2;
            const phi = (sparkleRand() - 0.5) * Math.PI * 0.9;
            const rad = 2.4 + sparkleRand() * 5.4;
            sparklePos[i * 3] = discoCenterX + Math.cos(theta) * Math.cos(phi) * rad;
            sparklePos[i * 3 + 1] = Math.max(0.08, Math.min(8.8, 3.8 + Math.sin(phi) * rad));
            sparklePos[i * 3 + 2] = discoCenterZ + Math.sin(theta) * Math.cos(phi) * rad;

            const c = colorPalette[Math.floor(sparkleRand() * colorPalette.length)];
            sparkleColors[i * 3] = c[0];
            sparkleColors[i * 3 + 1] = c[1];
            sparkleColors[i * 3 + 2] = c[2];
        }
        const sparklesGeo = new THREE.BufferGeometry();
        sparklesGeo.setAttribute('position', new THREE.BufferAttribute(sparklePos, 3));
        sparklesGeo.setAttribute('color', new THREE.BufferAttribute(sparkleColors, 3));
        const sparklesMat = new THREE.PointsMaterial({
            size: 0.09,
            vertexColors: true,
            transparent: true,
            opacity: 0.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const sparklesGroup = new THREE.Group();
        sparklesGroup.position.set(discoCenterX, 0, discoCenterZ);
        const sparklesPoints = new THREE.Points(sparklesGeo, sparklesMat);
        sparklesGroup.add(sparklesPoints);
        scene.add(sparklesGroup);

        /* ---------------------------------------------------------
           MUEBLE DE LUJO JUNTO AL VENTANAL: CREDENZA NÓRDICA EN NOGAL SMOKED,
           MÁRMOL CALACATTA & LATÓN CEPILLADO CON MAPAMUNDI GIRATORIO HD
        --------------------------------------------------------- */
        const globeCredenzaGroup = new THREE.Group();
        globeCredenzaGroup.position.set(1.75, 0, -4.42);
        scene.add(globeCredenzaGroup);

        // 1. Cuerpo principal del mueble (Nogal oscuro con bisel - usa skin compartida)
        const credW = 1.72;
        const credH = 0.60;
        const credD = 0.50;
        addMesh(new THREE.BoxGeometry(credW, credH, credD), walnutMat, [0, 0.42, 0], globeCredenzaGroup, { station: 'globe' });

        // 2. Cubierta superior de Mármol Calacatta con bisel y marco perimetral de latón
        addMesh(new THREE.BoxGeometry(credW + 0.03, 0.024, credD + 0.03), marbleMat, [0, 0.732, 0], globeCredenzaGroup, { station: 'globe' });
        // Moldura perimetral de latón cepillado bajo el mármol
        addMesh(new THREE.BoxGeometry(credW + 0.036, 0.008, credD + 0.036), credenzaBrassMat, [0, 0.716, 0], globeCredenzaGroup, { cast: false });

        // 3. Fachada frontal detallada en 3 secciones arquitectónicas (+Z hacia la habitación)
        // Sección Izquierda: 3 Cajones horizontales ejecutivos con tiradores de barra de latón
        const drawerX = -0.56;
        for (let d = 0; d < 3; d++) {
            const dy = 0.21 + d * 0.185;
            // Ranura / junta de sombra perimetral del cajón
            addMesh(new THREE.BoxGeometry(0.50, 0.165, 0.012), walnutMat, [drawerX, dy, credD / 2 + 0.006], globeCredenzaGroup);
            // Tirador horizontal en barra de latón cepillado
            addMesh(new THREE.BoxGeometry(0.18, 0.012, 0.018), credenzaBrassMat, [drawerX, dy, credD / 2 + 0.020], globeCredenzaGroup, { cast: false });
        }

        // Sección Central: Puertas correderas con palillaje de listones verticales (fluted tambour)
        for (let s = -0.25; s <= 0.25; s += 0.032) {
            addMesh(new THREE.BoxGeometry(0.018, 0.54, 0.014), credenzaDarkMat, [s, 0.42, credD / 2 + 0.007], globeCredenzaGroup);
        }
        // Tiradores verticales gemelos de latón en el centro
        addMesh(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 12), credenzaBrassMat, [-0.035, 0.42, credD / 2 + 0.022], globeCredenzaGroup);
        addMesh(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 12), credenzaBrassMat, [0.035, 0.42, credD / 2 + 0.022], globeCredenzaGroup);

        // Sección Derecha: Puerta lisa de nogal con tirador vertical y moldura
        const doorX = 0.56;
        addMesh(new THREE.BoxGeometry(0.50, 0.54, 0.012), walnutMat, [doorX, 0.42, credD / 2 + 0.006], globeCredenzaGroup);
        addMesh(new THREE.CylinderGeometry(0.007, 0.007, 0.18, 12), credenzaBrassMat, [doorX - 0.20, 0.42, credD / 2 + 0.022], globeCredenzaGroup);

        // 4. Chasis arquitectónico inferior con largueros de latón y 4 patas cónicas mid-century
        // Largueros de conexión en latón (underframe stretcher chassis)
        addMesh(new THREE.BoxGeometry(credW - 0.20, 0.022, 0.022), credenzaBrassMat, [0, 0.11, 0.16], globeCredenzaGroup, { cast: false });
        addMesh(new THREE.BoxGeometry(credW - 0.20, 0.022, 0.022), credenzaBrassMat, [0, 0.11, -0.16], globeCredenzaGroup, { cast: false });
        addMesh(new THREE.BoxGeometry(0.022, 0.022, 0.32), credenzaBrassMat, [-0.70, 0.11, 0], globeCredenzaGroup, { cast: false });
        addMesh(new THREE.BoxGeometry(0.022, 0.022, 0.32), credenzaBrassMat, [0.70, 0.11, 0], globeCredenzaGroup, { cast: false });

        // 4 Patas cónicas anguladas mid-century con regatones antideslizantes
        [[-0.72, -0.17], [0.72, -0.17], [-0.72, 0.17], [0.72, 0.17]].forEach(([lx, lz]) => {
            const leg = addMesh(new THREE.CylinderGeometry(0.012, 0.024, 0.14, 14), credenzaBrassMat, [lx, 0.065, lz], globeCredenzaGroup);
            leg.rotation.z = lx > 0 ? 0.10 : -0.10;
            leg.rotation.x = lz > 0 ? -0.10 : 0.10;
            addMesh(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 12), std(0x121214, 0.7, 0.2), [lx + (lx > 0 ? 0.01 : -0.01), 0.006, lz + (lz > 0 ? -0.01 : 0.01)], globeCredenzaGroup);
        });

        // 5. Luz cálida arquitectónica bajo el mueble (iluminación suave sobre el suelo de madera)
        const credenzaUnderglow = new THREE.PointLight(0xffb74d, 0.45, 2.2, 1.8);
        credenzaUnderglow.position.set(0, 0.08, 0);
        globeCredenzaGroup.add(credenzaUnderglow);

        // 6. Accesorios de lujo sobre la cubierta de mármol
        // Lado Izquierdo: Lámpara de mesa nórdica Bauhaus en latón y esfera de vidrio opalino
        const lampX = -0.58;
        const lampZ = -0.02;
        addMesh(new THREE.CylinderGeometry(0.075, 0.085, 0.018, 24), credenzaBrassMat, [lampX, 0.753, lampZ], globeCredenzaGroup, { station: 'globe' });
        addMesh(new THREE.CylinderGeometry(0.008, 0.008, 0.28, 12), credenzaBrassMat, [lampX, 0.89, lampZ], globeCredenzaGroup, { rot: [0, 0, -0.08], cast: false });
        const lampGlobe = addMesh(new THREE.SphereGeometry(0.065, 24, 24), std(0xffffff, 0.15, 0.05, { transparent: true, opacity: 0.92 }), [lampX + 0.02, 1.04, lampZ], globeCredenzaGroup, { cast: false });
        const credenzaLampLight = new THREE.PointLight(0xfff3db, 0.55, 2.4, 2);
        credenzaLampLight.position.set(lampX + 0.02, 1.04, lampZ);
        globeCredenzaGroup.add(credenzaLampLight);

        // Pila de libros ejecutivos de tapa dura (Architecture & Cloud Strategy)
        const bookX = -0.32;
        const bookZ = 0.05;
        addMesh(new THREE.BoxGeometry(0.24, 0.030, 0.32), std(0x0f172a, 0.55, 0.15), [bookX, 0.760, bookZ], globeCredenzaGroup, { rot: [0, 0.12, 0] });
        addMesh(new THREE.BoxGeometry(0.22, 0.026, 0.30), std(0x9a3412, 0.55, 0.15), [bookX + 0.01, 0.788, bookZ - 0.01], globeCredenzaGroup, { rot: [0, -0.05, 0] });
        // Cinta marcapáginas dorada y lupa de latón vintage
        addMesh(new THREE.BoxGeometry(0.025, 0.004, 0.14), credenzaBrassMat, [bookX + 0.08, 0.796, bookZ + 0.12], globeCredenzaGroup, { rot: [0, 0.2, 0], cast: false });
        // Lupa vintage (aro de latón + lente + mango de madera torneada)
        addMesh(new THREE.TorusGeometry(0.038, 0.005, 12, 24), credenzaBrassMat, [bookX - 0.02, 0.812, bookZ - 0.04], globeCredenzaGroup, { rot: [Math.PI / 2, 0, 0.3], cast: false });
        addMesh(new THREE.CylinderGeometry(0.004, 0.006, 0.08, 8), std(0x351e0e, 0.6, 0.1), [bookX + 0.035, 0.808, bookZ - 0.085], globeCredenzaGroup, { rot: [0, 0.6, Math.PI / 2], cast: false });

        // Lado Derecho: Maceta acanalada de cerámica con suculenta jade
        const potX = 0.56;
        const potZ = 0.06;
        const ceramicMat = std(0xf1f5f9, 0.40, 0.08);
        addMesh(new THREE.CylinderGeometry(0.085, 0.065, 0.11, 24), ceramicMat, [potX, 0.798, potZ], globeCredenzaGroup, { station: 'globe' });
        // Tierra fértil y hojas de suculenta en roseta
        addMesh(new THREE.CylinderGeometry(0.078, 0.078, 0.01, 16), std(0x271910, 0.85, 0.02), [potX, 0.850, potZ], globeCredenzaGroup, { cast: false });
        const succulentMat = std(0x1e5a38, 0.60, 0.05);
        for (let l = 0; l < 10; l++) {
            const lAng = (l / 10) * Math.PI * 2;
            const lx = potX + Math.cos(lAng) * 0.045;
            const lz = potZ + Math.sin(lAng) * 0.045;
            const leaf = addMesh(new THREE.SphereGeometry(0.035, 10, 8), succulentMat, [lx, 0.875, lz], globeCredenzaGroup, { cast: false });
            leaf.scale.set(1.2, 0.5, 0.8);
            leaf.rotation.y = -lAng;
            leaf.rotation.x = 0.35;
        }
        addMesh(new THREE.SphereGeometry(0.035, 12, 10), std(0x2a754b, 0.55, 0.05), [potX, 0.895, potZ], globeCredenzaGroup, { cast: false });

        // 7. MAPAMUNDI / GLOBO TERRÁQUEO GIRATORIO DE ALTA DEFINICIÓN (CENTRO DEL MUEBLE)
        const globeStandGroup = new THREE.Group();
        globeStandGroup.position.set(0, 0.745, 0);
        globeCredenzaGroup.add(globeStandGroup);

        // Base escalonada de latón macizo con molduras clásicas
        addMesh(new THREE.CylinderGeometry(0.20, 0.23, 0.035, 36), credenzaBrassMat, [0, 0.018, 0], globeStandGroup, { station: 'globe', isGlobe: true });
        addMesh(new THREE.CylinderGeometry(0.16, 0.19, 0.022, 28), credenzaBrassMat, [0, 0.045, 0], globeStandGroup, { station: 'globe', isGlobe: true });
        addMesh(new THREE.CylinderGeometry(0.028, 0.042, 0.14, 20), credenzaBrassMat, [0, 0.125, 0], globeStandGroup, { station: 'globe', isGlobe: true });
        addMesh(new THREE.SphereGeometry(0.042, 20, 20), credenzaBrassMat, [0, 0.195, 0], globeStandGroup, { station: 'globe', isGlobe: true });

        // Semi-Meridiano de Latón Calibrado (Inclinación Axial Terrestre exacta de 23.44°)
        const meridianGroup = new THREE.Group();
        meridianGroup.position.set(0, 0.48, 0);
        meridianGroup.rotation.z = -0.409;
        globeStandGroup.add(meridianGroup);

        addMesh(new THREE.TorusGeometry(0.34, 0.018, 16, 54, Math.PI + 0.18), credenzaBrassMat, [0, 0, 0], meridianGroup, {
            rot: [0, 0, -Math.PI / 2 - 0.09],
            station: 'globe',
            isGlobe: true
        });
        // Cojinetes polares Norte y Sur con tuercas estriadas
        addMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.075, 14), credenzaBrassMat, [0, 0.35, 0], meridianGroup, { station: 'globe', isGlobe: true });
        addMesh(new THREE.SphereGeometry(0.022, 14, 14), credenzaBrassMat, [0, 0.39, 0], meridianGroup, { station: 'globe', isGlobe: true });
        addMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.075, 14), credenzaBrassMat, [0, -0.35, 0], meridianGroup, { station: 'globe', isGlobe: true });
        addMesh(new THREE.SphereGeometry(0.022, 14, 14), credenzaBrassMat, [0, -0.39, 0], meridianGroup, { station: 'globe', isGlobe: true });

        // Esfera del Globo Terráqueo con rotación libre sobre el eje polar
        const globeRotatorGroup = new THREE.Group();
        meridianGroup.add(globeRotatorGroup);

        // Textura Cartográfica Náutica HD (2048 x 1024)
        const globeCanvasTex = canvasTexture(2048, 1024, (ctx, w, h) => {
            // Océano Profundo con gradiente batimétrico
            const oceanGrad = ctx.createLinearGradient(0, 0, 0, h);
            oceanGrad.addColorStop(0, '#061326');
            oceanGrad.addColorStop(0.2, '#0a1d3b');
            oceanGrad.addColorStop(0.5, '#0e2a52');
            oceanGrad.addColorStop(0.8, '#0a1d3b');
            oceanGrad.addColorStop(1, '#061326');
            ctx.fillStyle = oceanGrad;
            ctx.fillRect(0, 0, w, h);

            // Rejilla náutica de coordenadas (Meridianos y Paralelos en oro sutil)
            ctx.strokeStyle = 'rgba(212, 162, 76, 0.22)';
            ctx.lineWidth = 1;
            for (let x = 0; x < w; x += w / 24) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, h);
                ctx.stroke();
            }
            for (let y = 0; y < h; y += h / 12) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(w, y);
                ctx.stroke();
            }

            // Línea del Ecuador destacada en oro doble
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(0, h / 2);
            ctx.lineTo(w, h / 2);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, h / 2 - 4);
            ctx.lineTo(w, h / 2 - 4);
            ctx.moveTo(0, h / 2 + 4);
            ctx.lineTo(w, h / 2 + 4);
            ctx.stroke();

            // Trópicos de Cáncer y Capricornio punteados
            ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
            ctx.lineWidth = 1.8;
            ctx.setLineDash([8, 6]);
            ctx.beginPath();
            ctx.moveTo(0, h * 0.37);
            ctx.lineTo(w, h * 0.37);
            ctx.moveTo(0, h * 0.63);
            ctx.lineTo(w, h * 0.63);
            ctx.stroke();
            ctx.setLineDash([]);

            // Círculos Polares
            ctx.strokeStyle = 'rgba(186, 230, 253, 0.4)';
            ctx.setLineDash([4, 6]);
            ctx.beginPath();
            ctx.moveTo(0, h * 0.14);
            ctx.lineTo(w, h * 0.14);
            ctx.moveTo(0, h * 0.86);
            ctx.lineTo(w, h * 0.86);
            ctx.stroke();
            ctx.setLineDash([]);

            // Función para dibujar continentes con halos de plataforma costera turquesa
            function drawContinent(points, isAntarctica = false) {
                // Halo de plataforma continental costera
                ctx.strokeStyle = 'rgba(14, 165, 233, 0.35)';
                ctx.lineWidth = 12;
                ctx.beginPath();
                ctx.moveTo(points[0][0] * 2, points[0][1] * 2);
                for (let i = 1; i < points.length; i++) {
                    ctx.lineTo(points[i][0] * 2, points[i][1] * 2);
                }
                ctx.closePath();
                ctx.stroke();

                // Relleno de tierra firme
                ctx.fillStyle = isAntarctica ? '#e0f2fe' : '#1f4d38';
                ctx.beginPath();
                ctx.moveTo(points[0][0] * 2, points[0][1] * 2);
                for (let i = 1; i < points.length; i++) {
                    ctx.lineTo(points[i][0] * 2, points[i][1] * 2);
                }
                ctx.closePath();
                ctx.fill();

                // Costas doradas
                ctx.strokeStyle = isAntarctica ? '#7dd3fc' : '#d4a24c';
                ctx.lineWidth = 3;
                ctx.stroke();
            }

            // América del Sur (con silueta estilizada y Patagonia bien definida)
            drawContinent([
                [285, 260], [330, 250], [375, 285], [370, 345], [350, 400],
                [325, 450], [300, 480], [285, 475], [275, 430], [270, 360], [270, 290]
            ]);
            // América del Norte
            drawContinent([
                [160, 70], [250, 60], [315, 105], [330, 140], [285, 165],
                [250, 235], [220, 240], [185, 210], [145, 145], [140, 95]
            ]);
            // Groenlandia
            drawContinent([
                [350, 45], [390, 40], [410, 75], [380, 95], [345, 80]
            ]);
            // Europa
            drawContinent([
                [470, 100], [535, 85], [575, 130], [540, 180], [475, 175], [455, 130]
            ]);
            // África
            drawContinent([
                [465, 195], [545, 195], [575, 265], [545, 375], [495, 385],
                [470, 315], [435, 250], [445, 205]
            ]);
            // Asia
            drawContinent([
                [575, 75], [745, 70], [830, 135], [800, 245], [720, 255],
                [675, 285], [615, 230], [565, 175]
            ]);
            // Oceanía / Australia
            drawContinent([
                [780, 340], [865, 330], [875, 395], [815, 425], [775, 380]
            ]);
            // Antártica
            drawContinent([
                [70, 475], [960, 475], [930, 508], [100, 508]
            ], true);

            // Rosa de los Vientos Náutica en el Pacífico Sur
            const roseX = 420;
            const roseY = 760;
            ctx.save();
            ctx.translate(roseX, roseY);
            for (let r = 0; r < 8; r++) {
                ctx.rotate(Math.PI / 4);
                ctx.fillStyle = r % 2 === 0 ? '#f59e0b' : '#b45309';
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(-6, -18);
                ctx.lineTo(0, -36);
                ctx.lineTo(6, -18);
                ctx.closePath();
                ctx.fill();
            }
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(0, 0, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#d4a24c';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();

            // ---------------------------------------------------------
            // CENTRO DE OPERACIONES GLOBAL & TELETRABAJO DEL JEFE EDUARDO
            // ---------------------------------------------------------
            // Ubicación 1: Chillán (HQ Remoto / Teletrabajo - Sur de Chile)
            const chillanX = 568;
            const chillanY = 760;
            // Ubicación 2: Santiago (Sede Presencial / Clientes Corporativos)
            const stgoX = 574;
            const stgoY = 724;

            // Nodos Internacionales de Proyectos
            const projectNodes = [
                { name: '🇵🇾 ANDE · CLOUD AWS & CGR', x: 648, y: 650, color: '#38bdf8' },
                { name: '🇺🇾 MONTEVIDEO · SICA v3', x: 672, y: 726, color: '#a855f7' },
                { name: '🇦🇷 BS AS · FALABELLA OSB', x: 648, y: 712, color: '#f59e0b' },
                { name: '🇺🇸 BOSTON / MIT · IA GEN', x: 620, y: 250, color: '#ef4444' },
                { name: '🇪🇸 ESPAÑA · INCIBE CIBER', x: 1005, y: 265, color: '#10b981' }
            ];

            // Función para dibujar arcos de telemetría y proyectos
            function drawFlightArc(fromX, fromY, toX, toY, color = '#f59e0b', dash = [6, 6]) {
                ctx.strokeStyle = color;
                ctx.lineWidth = 2.0;
                ctx.setLineDash(dash);
                ctx.beginPath();
                ctx.moveTo(fromX, fromY);
                const midX = (fromX + toX) / 2 + (fromX < toX ? -35 : 35);
                const midY = Math.min(fromY, toY) - 50;
                ctx.quadraticCurveTo(midX, midY, toX, toY);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // Arcos de telemetría desde Chillán / Santiago a los proyectos internacionales
            projectNodes.forEach(pn => {
                drawFlightArc(stgoX, stgoY, pn.x, pn.y, 'rgba(56, 189, 248, 0.45)', [6, 6]);

                // Halo de nodo internacional
                ctx.fillStyle = pn.color;
                ctx.beginPath();
                ctx.arc(pn.x, pn.y, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.stroke();

                // Cartela náutica del proyecto
                ctx.save();
                ctx.fillStyle = 'rgba(6, 12, 24, 0.88)';
                ctx.strokeStyle = pn.color;
                ctx.lineWidth = 1.5;
                const pW = 160;
                const pH = 24;
                if (ctx.roundRect) ctx.roundRect(pn.x + 8, pn.y - 12, pW, pH, 6);
                else ctx.rect(pn.x + 8, pn.y - 12, pW, pH);
                ctx.fill();
                ctx.stroke();
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 11px sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText(pn.name, pn.x + 14, pn.y + 4);
                ctx.restore();
            });

            // Arcos hacia Nube Global (Silicon Valley, New York, Frankfurt, Tokyo)
            drawFlightArc(stgoX, stgoY, 400, 340, 'rgba(245, 158, 11, 0.35)', [8, 8]);
            drawFlightArc(stgoX, stgoY, 560, 300, 'rgba(245, 158, 11, 0.35)', [8, 8]);
            drawFlightArc(stgoX, stgoY, 1000, 260, 'rgba(245, 158, 11, 0.35)', [8, 8]);
            drawFlightArc(stgoX, stgoY, 1560, 320, 'rgba(245, 158, 11, 0.35)', [8, 8]);

            // Ruta de Movilidad y Teletrabajo Activo (Chillán <-> Santiago)
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.moveTo(chillanX, chillanY);
            ctx.lineTo(stgoX, stgoY);
            ctx.stroke();
            ctx.strokeStyle = '#fde047';
            ctx.lineWidth = 1.8;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(chillanX, chillanY);
            ctx.lineTo(stgoX, stgoY);
            ctx.stroke();
            ctx.setLineDash([]);

            // BEACON 1: CHILLÁN · HQ TELETRABAJO (SUR DE CHILE)
            const chillanGrad = ctx.createRadialGradient(chillanX, chillanY, 2, chillanX, chillanY, 28);
            chillanGrad.addColorStop(0, 'rgba(16, 185, 129, 1.0)');
            chillanGrad.addColorStop(0.4, 'rgba(52, 211, 153, 0.75)');
            chillanGrad.addColorStop(0.8, 'rgba(6, 182, 212, 0.35)');
            chillanGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = chillanGrad;
            ctx.beginPath();
            ctx.arc(chillanX, chillanY, 28, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(chillanX, chillanY, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 2.5;
            ctx.stroke();

            // BEACON 2: SANTIAGO · PRESENCIAL & PARTNERS
            const stgoGrad = ctx.createRadialGradient(stgoX, stgoY, 2, stgoX, stgoY, 26);
            stgoGrad.addColorStop(0, 'rgba(245, 158, 11, 1.0)');
            stgoGrad.addColorStop(0.4, 'rgba(56, 189, 248, 0.75)');
            stgoGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = stgoGrad;
            ctx.beginPath();
            ctx.arc(stgoX, stgoY, 26, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(stgoX, stgoY, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 2.5;
            ctx.stroke();

            // Cartela Principal de Chile: Eduardo Cayún M.
            ctx.save();
            ctx.fillStyle = 'rgba(6, 12, 24, 0.94)';
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 2.5;
            const bW = 310;
            const bH = 50;
            const bX = chillanX - bW / 2 - 20;
            const bY = chillanY + 22;
            if (ctx.roundRect) ctx.roundRect(bX, bY, bW, bH, 10);
            else ctx.rect(bX, bY, bW, bH);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#fde047';
            ctx.font = 'bold 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('🇨🇱 CHILE · Eduardo Cayún M.', bX + bW / 2, bY + 22);

            ctx.fillStyle = '#34d399';
            ctx.font = 'bold 12px "JetBrains Mono", monospace';
            ctx.fillText('🟢 Chillán (Teletrabajo) · Santiago (Presencial)', bX + bW / 2, bY + 40);
            ctx.restore();
        });

        const globeMat = std(0xffffff, 0.32, 0.08, {
            map: globeCanvasTex,
            emissive: 0x38bdf8,
            emissiveMap: globeCanvasTex,
            emissiveIntensity: 0.45
        });
        const globeMesh = addMesh(new THREE.SphereGeometry(0.26, 64, 48), globeMat, [0, 0, 0], globeRotatorGroup, {
            station: 'globe',
            isGlobe: true
        });
        globeMesh.rotation.y = 2.45;

        // Foco de iluminación rasante y exposición de galería para la credenza y mapamundi
        const credenzaShowcaseLight = new THREE.PointLight(0xfff6eb, 1.35, 4.5, 1.5);
        credenzaShowcaseLight.position.set(0, 1.35, 1.25);
        globeCredenzaGroup.add(credenzaShowcaseLight);

        // ---------------------------------------------------------
        // 3D HOLOGRAPHIC PINS & BEACONS DIRECTLY ATTACHED TO GLOBEMESH
        // ---------------------------------------------------------
        const globePinsGroup = new THREE.Group();
        globeMesh.add(globePinsGroup);

        function canvasCoordToVec3(cx, cy, r = 0.262) {
            const u = cx / 2048;
            const v = cy / 1024;
            const theta = v * Math.PI;
            const phi = u * Math.PI * 2;
            return new THREE.Vector3(
                -r * Math.cos(phi) * Math.sin(theta),
                r * Math.cos(theta),
                r * Math.sin(phi) * Math.sin(theta)
            );
        }

        // Materiales para marcadores 3D
        const pinStemMat = std(0xd4a24c, 0.25, 0.85);
        const emeraldPinMat = basic({ color: 0x10b981 });
        const cyanPinMat = basic({ color: 0x38bdf8 });
        const goldPinMat = basic({ color: 0xf59e0b });
        const violetPinMat = basic({ color: 0xa855f7 });
        const redPinMat = basic({ color: 0xef4444 });

        // Función para colocar un pin 3D en la superficie del globo
        function addGlobe3DPin(cx, cy, headMat, label = '') {
            const posSurface = canvasCoordToVec3(cx, cy, 0.260);
            const posHead = canvasCoordToVec3(cx, cy, 0.278);

            const pinGroup = new THREE.Group();
            pinGroup.position.copy(posSurface);
            pinGroup.lookAt(posHead.clone().multiplyScalar(2));

            // Vástago de latón hacia afuera
            const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.003, 0.018, 8), pinStemMat);
            stem.rotation.x = Math.PI / 2;
            stem.position.z = 0.009;
            pinGroup.add(stem);

            // Cabeza esférica brillante
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 12, 12), headMat);
            head.position.z = 0.018;
            pinGroup.add(head);

            globePinsGroup.add(pinGroup);
            return { group: pinGroup, posSurface, posHead };
        }

        // Pin 3D Chillán (HQ Teletrabajo)
        const chillanPin = addGlobe3DPin(568, 760, emeraldPinMat, 'Chillán');
        // Anillo de pulso radar expansivo para Chillán
        const chillanPulseTorus = new THREE.Mesh(
            new THREE.TorusGeometry(0.016, 0.002, 8, 24),
            basic({ color: 0x10b981, transparent: true, opacity: 0.85 })
        );
        chillanPulseTorus.position.copy(chillanPin.posSurface);
        chillanPulseTorus.lookAt(chillanPin.posHead.clone().multiplyScalar(2));
        globePinsGroup.add(chillanPulseTorus);

        // Pin 3D Santiago (Presencial)
        const stgoPin = addGlobe3DPin(574, 724, goldPinMat, 'Santiago');

        // Trayectoria curva 3D de vuelo entre Chillán y Santiago
        const chillanV = canvasCoordToVec3(568, 760, 0.261);
        const stgoV = canvasCoordToVec3(574, 724, 0.261);
        const midMobilityV = chillanV.clone().add(stgoV).multiplyScalar(0.5).normalize().multiplyScalar(0.266);
        const mobilityCurve = new THREE.CatmullRomCurve3([chillanV, midMobilityV, stgoV]);
        const mobilityGeo = new THREE.TubeGeometry(mobilityCurve, 12, 0.0018, 6, false);
        const mobilityMesh = new THREE.Mesh(mobilityGeo, basic({ color: 0x00f0ff }));
        globePinsGroup.add(mobilityMesh);

        // Pines 3D Internacionales
        addGlobe3DPin(648, 650, cyanPinMat, 'Asunción');
        addGlobe3DPin(672, 726, violetPinMat, 'Montevideo');
        addGlobe3DPin(648, 712, goldPinMat, 'Buenos Aires');
        addGlobe3DPin(620, 250, redPinMat, 'Boston');
        addGlobe3DPin(1005, 265, emeraldPinMat, 'Madrid');

        // Arcos de conexión 3D Intercontinentales desde Chile
        const intlNodesCoords = [
            { cx: 648, cy: 650, color: 0x38bdf8 },
            { cx: 672, cy: 726, color: 0xa855f7 },
            { cx: 648, cy: 712, color: 0xf59e0b },
            { cx: 620, cy: 250, color: 0xef4444 },
            { cx: 1005, cy: 265, color: 0x10b981 }
        ];
        intlNodesCoords.forEach(dst => {
            const dstV = canvasCoordToVec3(dst.cx, dst.cy, 0.261);
            const midV = stgoV.clone().add(dstV).multiplyScalar(0.5).normalize().multiplyScalar(0.278);
            const arcCurve = new THREE.CatmullRomCurve3([stgoV, midV, dstV]);
            const arcGeo = new THREE.TubeGeometry(arcCurve, 20, 0.0012, 5, false);
            const arcMesh = new THREE.Mesh(arcGeo, basic({ color: dst.color, transparent: true, opacity: 0.65 }));
            globePinsGroup.add(arcMesh);
        });

        // ---------------------------------------------------------
        // GLOBE INTERACTIVE SYSTEM & GLOBAL PROJECTS DATA
        // ---------------------------------------------------------
        const GLOBE_PROJECTS_DATA = [
            {
                id: 'chile',
                flag: '🇨🇱',
                flagCode: 'CL',
                code3: 'CHL',
                scope: 'HQ TELETRABAJO & ATENCIÓN PRESENCIAL',
                title: 'Chillán (HQ Remoto) & Santiago (Presencial)',
                city: 'Chillán (Ñuble) · Santiago (RM) · Valparaíso',
                desc: 'El Jefe Eduardo opera mediante teletrabajo de alto rendimiento desde Chillán (sur de Chile), liderando arquitectura cloud y dirección tecnológica. Además, atiende presencialmente en Santiago para reuniones ejecutivas, comités de directorio y clientes como Falabella, BCI, BancoEstado, Contraloría y Ministerio de Hacienda.',
                tags: ['Teletrabajo HQ (Chillán)', 'Presencial (Santiago)', 'Tierra Ayni', 'BCI', 'Falabella', 'BancoEstado', 'CGR', 'Gasvalpo'],
                rotY: 2.45,
                bubbleText: '¡El Jefe Eduardo está actualmente conectado desde Chillán (Sur de Chile) en modalidad de teletrabajo de alto rendimiento, y atiende presencialmente en Santiago para reuniones directivas y clientes corporativos! 🇨🇱💼⚡'
            },
            {
                id: 'paraguay',
                flag: '🇵🇾',
                flagCode: 'PY',
                code3: 'PRY',
                scope: 'ENERGÍA, CLOUD AWS & GIS CORPORATIVO',
                title: 'Administración Nacional de Electricidad (ANDE)',
                city: 'Asunción, Paraguay',
                desc: 'Consultoría y modernización tecnológica: Arquitectura Cloud en Amazon Web Services (AWS), diseño de sistemas corporativos GIS para la red de distribución eléctrica nacional y soporte técnico de auditoría CGR.',
                tags: ['ANDE Paraguay', 'Cloud AWS', 'GIS Corporativo', 'CGR Paraguay', 'Infraestructura Crítica'],
                rotY: 2.20,
                bubbleText: '¡Proyecto internacional en Asunción, Paraguay! Modernización Cloud AWS y plataforma GIS territorial para la Administración Nacional de Electricidad (ANDE). 🇵🇾⚡☁️'
            },
            {
                id: 'uruguay',
                flag: '🇺🇾',
                flagCode: 'UY',
                code3: 'URY',
                scope: 'AUDITORÍA GUBERNAMENTAL & CONTROL ESTATAL',
                title: 'Sistema de Control de Auditoría (SICA v3)',
                city: 'Montevideo, Uruguay',
                desc: 'Implementación y soporte consultivo de la plataforma SICA v3 para organismos de control estatal, garantizando trazabilidad y fiscalización electrónica de compras y presupuestos públicos.',
                tags: ['SICA v3', 'Auditoría Pública', 'Oracle SOA', 'Trazabilidad Fiscal', 'Modernización Estatal'],
                rotY: 2.15,
                bubbleText: '¡Consultoría técnica gubernamental en Montevideo, Uruguay! Implementación y optimización de la plataforma SICA v3 para auditoría y control estatal. 🇺🇾🏛️📋'
            },
            {
                id: 'argentina',
                flag: '🇦🇷',
                flagCode: 'AR',
                code3: 'ARG',
                scope: 'RETAIL FINANCIERO & MIDDLEWARE TRANSACCIONAL',
                title: 'Falabella Financiero & Integración OSB',
                city: 'Buenos Aires, Argentina',
                desc: 'Ingeniería de integración y seguridad transaccional mediante Oracle Service Bus (OSB) para plataformas de crédito, seguros y medios de pago regionales de alta concurrencia.',
                tags: ['Falabella Financiero', 'Oracle Service Bus', 'Seguridad Transaccional', 'Middleware SOA', 'Alta Disponibilidad'],
                rotY: 2.18,
                bubbleText: '¡Plataformas transaccionales en Buenos Aires, Argentina! Integración de alta concurrencia y seguridad OSB para Falabella Financiero. 🇦🇷💳🔒'
            },
            {
                id: 'usa',
                flag: '🇺🇸',
                flagCode: 'US',
                code3: 'USA',
                scope: 'INNOVACIÓN, IA GENERATIVA & QUANTUM COMPUTING',
                title: 'Massachusetts Institute of Technology (MIT xPRO)',
                city: 'Cambridge / Boston, MA, EE.UU.',
                desc: 'Especialización ejecutiva en IA Generativa empresarial, Internet de las Cosas (IoT) industrial, arquitecturas RAG/LLM y computación cuántica orientada a la toma de decisiones estratégicas.',
                tags: ['MIT xPRO', 'Generative AI', 'Industrial IoT', 'Quantum Computing', 'Digital Strategy'],
                rotY: 2.30,
                bubbleText: '¡Formación ejecutiva global en MIT xPRO (Boston / Cambridge, EE.UU.)! Especialización en IA Generativa, IoT industrial y computación cuántica. 🇺🇸🎓🤖'
            },
            {
                id: 'spain',
                flag: '🇪🇸',
                flagCode: 'ES',
                code3: 'ESP',
                scope: 'CIBERSEGURIDAD EUROPEA & CERTIFICACIÓN GLOBAL',
                title: 'INCIBE & ISC2 España',
                city: 'Madrid / León, España',
                desc: 'Certificación y mejores prácticas internacionales en ciberseguridad, gestión de incidentes, protección de infraestructura crítica y estándares bajo el marco de INCIBE e ISC2.',
                tags: ['INCIBE', 'ISC2 Certified in Cybersecurity', 'Gestión de Incidentes', 'Ciberdefensa', 'Seguridad de la Información'],
                rotY: 1.15,
                bubbleText: '¡Colaboración y certificación en ciberseguridad desde España con INCIBE y el consorcio global ISC2! Máximos estándares en ciberdefensa. 🇪🇸🛡️🌐'
            }
        ];

        let activeGlobeIndex = 0;
        let targetGlobeRotationY = 2.45;
        let globeSpinVelocity = 0.55;
        let isGlobeDragging = false;

        const globeModal = document.getElementById('globe-inspector-modal');
        const globeCloseBtn = document.getElementById('globe-close-btn');
        const globePrevBtn = document.getElementById('globe-prev-btn');
        const globeNextBtn = document.getElementById('globe-next-btn');
        const globeSpinBtn = document.getElementById('globe-spin-btn');

        const globeIndexBadge = document.getElementById('globe-index-badge');
        const globeTagBadgeText = document.getElementById('globe-tag-badge-text');
        const globeModalIcon = document.getElementById('globe-modal-icon');
        const globeModalScope = document.getElementById('globe-modal-scope');
        const globeModalTitle = document.getElementById('globe-modal-title');
        const globeModalCity = document.getElementById('globe-modal-city');
        const globeModalDesc = document.getElementById('globe-modal-desc');
        const globeModalTags = document.getElementById('globe-modal-tags');

        function updateGlobeModal(idx) {
            activeGlobeIndex = (idx % GLOBE_PROJECTS_DATA.length + GLOBE_PROJECTS_DATA.length) % GLOBE_PROJECTS_DATA.length;
            const p = GLOBE_PROJECTS_DATA[activeGlobeIndex];

            if (globeIndexBadge) globeIndexBadge.textContent = `${activeGlobeIndex + 1} / ${GLOBE_PROJECTS_DATA.length}`;
            if (globeTagBadgeText) globeTagBadgeText.textContent = activeGlobeIndex === 0 ? 'TELETRABAJO ACTIVO · CHILE' : 'PROYECTO INTERNACIONAL';
            if (globeModalIcon) {
                globeModalIcon.innerHTML = `<div class="flex flex-col items-center justify-center leading-none"><span class="text-sm font-black font-mono-tech text-white">${p.flagCode}</span><span class="text-[9px] font-bold text-emerald-400 tracking-wider">${p.code3}</span></div>`;
            }
            if (globeModalScope) globeModalScope.textContent = p.scope;
            if (globeModalTitle) globeModalTitle.textContent = p.title;
            if (globeModalCity) globeModalCity.textContent = p.city;
            if (globeModalDesc) globeModalDesc.textContent = p.desc;

            if (globeModalTags) {
                globeModalTags.innerHTML = '';
                p.tags.forEach(t => {
                    const pill = document.createElement('span');
                    pill.className = 'px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/10 text-slate-300 hover:text-white hover:border-emerald-400/40 transition';
                    pill.textContent = t;
                    globeModalTags.appendChild(pill);
                });
            }
        }

        function openGlobeInspector(idx = 0) {
            updateGlobeModal(idx);
            const p = GLOBE_PROJECTS_DATA[activeGlobeIndex];
            targetGlobeRotationY = p.rotY;

            if (globeModal) {
                globeModal.classList.remove('hidden');
                requestAnimationFrame(() => {
                    globeModal.classList.remove('opacity-0', 'translate-y-4', 'scale-95');
                    globeModal.classList.add('opacity-100', 'translate-y-0', 'scale-100');
                });
            }

            playGlobeSpinSound();
            showRobotBubble('🌍 ' + p.scope, p.bubbleText, 8500);
        }

        function closeGlobeInspector() {
            if (!globeModal || globeModal.classList.contains('hidden')) return;
            globeModal.classList.remove('opacity-100', 'translate-y-0', 'scale-100');
            globeModal.classList.add('opacity-0', 'translate-y-4', 'scale-95');
            setTimeout(() => {
                if (globeModal.classList.contains('opacity-0')) {
                    globeModal.classList.add('hidden');
                }
            }, 280);
        }

        function goToGlobeNode(idx) {
            updateGlobeModal(idx);
            const p = GLOBE_PROJECTS_DATA[activeGlobeIndex];
            targetGlobeRotationY = p.rotY;
            playGlobeSpinSound();
            showRobotBubble('🌍 ' + p.scope, p.bubbleText, 8000);
        }

        if (globeCloseBtn) globeCloseBtn.addEventListener('click', closeGlobeInspector);
        if (globePrevBtn) globePrevBtn.addEventListener('click', () => goToGlobeNode(activeGlobeIndex - 1));
        if (globeNextBtn) globeNextBtn.addEventListener('click', () => goToGlobeNode(activeGlobeIndex + 1));
        if (globeSpinBtn) globeSpinBtn.addEventListener('click', () => {
            targetGlobeRotationY = null;
            spinGlobeWithImpulse(6.5);
        });

        window.eduGlobeSystem = {
            openInspector: openGlobeInspector,
            closeInspector: closeGlobeInspector,
            goToNode: goToGlobeNode,
            nextNode: () => goToGlobeNode(activeGlobeIndex + 1),
            prevNode: () => goToGlobeNode(activeGlobeIndex - 1),
            spin: (force = 6.0) => spinGlobeWithImpulse(force),
            getData: () => GLOBE_PROJECTS_DATA,
            getState: () => ({ activeIndex: activeGlobeIndex, currentNode: GLOBE_PROJECTS_DATA[activeGlobeIndex] })
        };

        function spinGlobeWithImpulse(force = 6.0) {
            targetGlobeRotationY = null;
            globeSpinVelocity = force;
            playGlobeSpinSound();
            showRobotBubble('🌍 MAPAMUNDI INTERACTIVO', '¡Girando el globo terráqueo junto al ventanal! Eduardo lidera consultoría tecnológica y proyectos de alta complejidad conectando desde Chile hacia el mundo 🇨🇱🌐✨', 8000);
        }

        /* ---------------------------------------------------------
           ÁRBOL DE NAVIDAD FESTIVO ESTILIZADO 3D (Ref: Tono Verde Bosque Pino,
           Faldones Ondulados/Festoneados, Guirnalda Dorada, Esferas Brillantes,
           Estrella 3D de 5 Puntas, Luces Hada Twinkle y Cajas de Regalo)
        --------------------------------------------------------- */
        const christmasTreeGroup = new THREE.Group();
        christmasTreeGroup.position.set(-4.65, 0, 4.10);
        christmasTreeGroup.scale.set(0.92, 1.24, 0.92);
        scene.add(christmasTreeGroup);

        // 1. Plataforma circular base festiva (Bandeja plato crema con borde verde bosque)
        const skirtBaseMat = std(0xede2d2, 0.80, 0.04);
        const skirtRimMat = std(0x144530, 0.65, 0.15);
        addMesh(new THREE.CylinderGeometry(1.48, 1.48, 0.065, 48), skirtBaseMat, [0, 0.032, 0], christmasTreeGroup, { station: 'tree', isChristmasTree: true });
        addMesh(new THREE.TorusGeometry(1.48, 0.038, 16, 48), skirtRimMat, [0, 0.065, 0], christmasTreeGroup, { rot: [Math.PI / 2, 0, 0], cast: false, station: 'tree', isChristmasTree: true });

        // 2. Tronco de madera estriado (acanalado vertical estilo 3D clay)
        const trunkWoodMat = std(0x4a2e16, 0.72, 0.08);
        addMesh(new THREE.CylinderGeometry(0.24, 0.26, 0.45, 24), trunkWoodMat, [0, 0.22, 0], christmasTreeGroup, { station: 'tree', isChristmasTree: true });
        for (let tr = 0; tr < 12; tr++) {
            const tAng = (tr / 12) * Math.PI * 2;
            const tx = Math.cos(tAng) * 0.245;
            const tz = Math.sin(tAng) * 0.245;
            addMesh(new THREE.CylinderGeometry(0.018, 0.020, 0.45, 8), std(0x351e0e, 0.78, 0.06), [tx, 0.22, tz], christmasTreeGroup, { cast: false });
        }

        // 3. Tiers de Follaje Verde Bosque Pino Cálido con Faldones Ondulados Integrados
        // R > B calibrado para que bajo la iluminación de la sala el render sea idéntico a la referencia (#3a6a3c / #487347)
        const foliageTiers = [
            { r: 1.05, h: 0.65, y: 0.68, col: 0x092206, scallops: 20, scallopR: 0.095, dip: 0.12 },
            { r: 0.88, h: 0.58, y: 1.10, col: 0x0b2807, scallops: 18, scallopR: 0.084, dip: 0.10 },
            { r: 0.72, h: 0.52, y: 1.48, col: 0x0e2f09, scallops: 16, scallopR: 0.074, dip: 0.09 },
            { r: 0.54, h: 0.46, y: 1.84, col: 0x11360b, scallops: 14, scallopR: 0.064, dip: 0.08 },
            { r: 0.36, h: 0.40, y: 2.16, col: 0x143e0e, scallops: 12, scallopR: 0.054, dip: 0.06 }
        ];

        const goldBeadMat = std(0xf59e0b, 0.15, 0.95);
        const beadMeshes = [];

        foliageTiers.forEach((tier, tIdx) => {
            const tierMat = std(tier.col, 0.88, 0.02);
            // Cono principal del nivel
            addMesh(new THREE.ConeGeometry(tier.r, tier.h, 32), tierMat, [0, tier.y, 0], christmasTreeGroup, { station: 'tree', isChristmasTree: true });

            // Faldones festoneados integrados en la base del cono (ondulaciones suaves como en la referencia)
            const baseY = tier.y - tier.h * 0.48;
            const scallopMat = std(tier.col, 0.88, 0.02);
            for (let s = 0; s < tier.scallops; s++) {
                const sAng = (s / tier.scallops) * Math.PI * 2;
                const sx = Math.cos(sAng) * (tier.r * 0.92);
                const sz = Math.sin(sAng) * (tier.r * 0.92);

                const scallop = addMesh(
                    new THREE.SphereGeometry(tier.scallopR, 12, 10),
                    scallopMat,
                    [sx, baseY, sz],
                    christmasTreeGroup,
                    { station: 'tree', isChristmasTree: true }
                );
                // Forma de festón semicircular sutil
                scallop.scale.set(1.0, 0.60, 0.75);
                scallop.rotation.y = -sAng + Math.PI / 2;
                scallop.rotation.x = 0.25;
            }

            // Guirnalda de cuentas doradas drapeadas en festones colgantes (catenary swags como en la referencia)
            const numSwags = Math.max(3, Math.floor(tier.scallops / 3.8));
            const beadsPerSwag = 8;
            for (let sw = 0; sw < numSwags; sw++) {
                const startAng = (sw / numSwags) * Math.PI * 2;
                const endAng = ((sw + 1) / numSwags) * Math.PI * 2;
                for (let b = 0; b <= beadsPerSwag; b++) {
                    const u = b / beadsPerSwag;
                    const ang = startAng + (endAng - startAng) * u;
                    const sag = Math.sin(u * Math.PI) * tier.dip;
                    const bRad = (tier.r * 0.90) * (1.0 - (1.0 - u * 0.5) * 0.08);
                    const bx = Math.cos(ang) * bRad;
                    const bz = Math.sin(ang) * bRad;
                    const by = (tier.y - tier.h * 0.12) - sag;
                    const bMesh = addMesh(new THREE.SphereGeometry(0.016, 8, 8), goldBeadMat, [bx, by, bz], christmasTreeGroup, { cast: false });
                    beadMeshes.push(bMesh);
                }
            }
        });

        // 4. Esferas / Baubles Navideños Brillantes (Rojo vivo, Amarillo dorado, Azul cyan cielo - Ref exacto)
        const ornamentPalette = [
            std(0xdc2626, 0.12, 0.92), // Rojo festivo vibrante
            std(0xf59e0b, 0.10, 0.95), // Amarillo oro brillante
            std(0x0284c7, 0.12, 0.92)  // Cyan cielo vibrante
        ];
        const ornamentCapMat = std(0xfbbf24, 0.18, 0.90);

        // Distribución armoniosa de esferas por nivel de follaje
        foliageTiers.forEach((tier, tIdx) => {
            const count = 3 + tIdx * 2;
            const baseY = tier.y - tier.h * 0.35;
            for (let o = 0; o < count; o++) {
                const oAng = (o / count) * Math.PI * 2 + (tIdx * 0.45);
                const oRadius = tier.r * 0.92;
                const ox = Math.cos(oAng) * oRadius;
                const oz = Math.sin(oAng) * oRadius;
                const oy = baseY - 0.04 + (o % 2 === 0 ? 0.03 : -0.03);
                const mat = ornamentPalette[(o + tIdx) % ornamentPalette.length];
                const bSize = 0.048 + (tIdx % 2) * 0.006;
                addMesh(new THREE.SphereGeometry(bSize, 16, 16), mat, [ox, oy, oz], christmasTreeGroup, { station: 'tree', isChristmasTree: true });
                addMesh(new THREE.CylinderGeometry(0.013, 0.015, 0.018, 10), ornamentCapMat, [ox, oy + bSize * 0.92, oz], christmasTreeGroup, { cast: false });
            }
        });

        // 5. Luces Hada LED Festivas Twinkle (Multicolor suave en espiral)
        const lightColors = [0xffd166, 0xef4444, 0x38bdf8, 0x10b981, 0xfffbeb, 0xfbbf24];
        const treeLightMats = lightColors.map((c) => basic({ color: c, transparent: true }));
        const treeLightMeshes = [];

        const lightCount = 48;
        for (let i = 0; i < lightCount; i++) {
            const prog = i / lightCount;
            const y = 0.45 + prog * 1.85;
            const radius = (1 - prog * 0.70) * 0.96;
            const angle = prog * Math.PI * 11.0;
            const lx = Math.cos(angle) * radius;
            const lz = Math.sin(angle) * radius;
            const matIdx = i % lightColors.length;
            const lightMesh = addMesh(new THREE.SphereGeometry(0.022, 8, 8), treeLightMats[matIdx], [lx, y, lz], christmasTreeGroup, { cast: false, station: 'tree', isChristmasTree: true });
            treeLightMeshes.push({ mesh: lightMesh, phase: i * 0.52, baseScale: 1.0 });
        }

        // Luz cálida interior suave (muy suave para no sobreexponer el follaje verde)
        const treeWarmLight = new THREE.PointLight(0xffedd5, 0.22, 2.8, 2.0);
        treeWarmLight.position.set(0, 1.25, 0);
        christmasTreeGroup.add(treeWarmLight);

        // 6. Estrella 3D Dorada de 5 Puntas en la Cúspide (Biselada, Idéntica a la Referencia)
        const starGroup = new THREE.Group();
        starGroup.position.set(0, 2.42, 0);
        christmasTreeGroup.add(starGroup);

        const starShape = new THREE.Shape();
        const starPoints = 5;
        const rOuter = 0.22;
        const rInner = 0.095;
        for (let p = 0; p < starPoints * 2; p++) {
            const r = p % 2 === 0 ? rOuter : rInner;
            const ang = (p * Math.PI) / starPoints - Math.PI / 2;
            const sx = Math.cos(ang) * r;
            const sy = -Math.sin(ang) * r;
            if (p === 0) starShape.moveTo(sx, sy);
            else starShape.lineTo(sx, sy);
        }
        starShape.closePath();

        const starExtrudeSettings = {
            depth: 0.052,
            bevelEnabled: true,
            bevelThickness: 0.020,
            bevelSize: 0.014,
            bevelSegments: 3
        };
        const starGeo = new THREE.ExtrudeGeometry(starShape, starExtrudeSettings);
        starGeo.center();
        const starGoldMat = std(0xfbbf24, 0.12, 0.95);
        const starMesh = addMesh(starGeo, starGoldMat, [0, 0, 0], starGroup, { station: 'tree', isChristmasTree: true });

        // Luz tenue de la estrella superior
        const starPointLight = new THREE.PointLight(0xffea80, 0.45, 2.2, 1.8);
        starPointLight.position.set(0, 2.44, 0);
        christmasTreeGroup.add(starPointLight);

        // 7. Cajas de Regalos Decorativas con Moños (Exactas a la Imagen de Referencia)
        function createGiftBox(w, h, d, boxColor, ribbonColor, [gx, gy, gz], rotY) {
            const boxGrp = new THREE.Group();
            boxGrp.position.set(gx, gy, gz);
            boxGrp.rotation.y = rotY;
            christmasTreeGroup.add(boxGrp);

            const bMat = std(boxColor, 0.50, 0.12);
            const rMat = std(ribbonColor, 0.28, 0.60);

            addMesh(new THREE.BoxGeometry(w, h, d), bMat, [0, h / 2, 0], boxGrp, { station: 'tree', isChristmasTree: true });

            const ribW = Math.min(w, d) * 0.18;
            addMesh(new THREE.BoxGeometry(ribW, h + 0.003, d + 0.003), rMat, [0, h / 2, 0], boxGrp, { cast: false });
            addMesh(new THREE.BoxGeometry(w + 0.003, h + 0.003, ribW), rMat, [0, h / 2, 0], boxGrp, { cast: false });

            // Lazos y nudo superior
            addMesh(new THREE.TorusGeometry(ribW * 0.95, ribW * 0.35, 8, 16), rMat, [-ribW * 0.5, h + ribW * 0.5, 0], boxGrp, { rot: [0, Math.PI / 4, Math.PI / 4], cast: false });
            addMesh(new THREE.TorusGeometry(ribW * 0.95, ribW * 0.35, 8, 16), rMat, [ribW * 0.5, h + ribW * 0.5, 0], boxGrp, { rot: [0, -Math.PI / 4, -Math.PI / 4], cast: false });
            addMesh(new THREE.SphereGeometry(ribW * 0.55, 8, 8), rMat, [0, h + ribW * 0.35, 0], boxGrp, { cast: false });
        }

        // 6 Regalos estilizados colocados sobre la bandeja circular
        createGiftBox(0.38, 0.26, 0.34, 0xd99b00, 0xdc2626, [-0.72, 0.065, 0.22], 0.28);  // Mostaza con lazo rojo
        createGiftBox(0.40, 0.30, 0.36, 0x0f766e, 0xdc2626, [-0.38, 0.065, 0.68], 0.12);  // Turquesa con lazo rojo
        createGiftBox(0.42, 0.22, 0.32, 0xb91c1c, 0xfbbf24, [0.18, 0.065, 0.74], -0.22);  // Rojo plano con lazo oro
        createGiftBox(0.30, 0.24, 0.30, 0xe2e8f0, 0x166534, [0.58, 0.065, 0.54], 0.45);   // Blanco con lazo verde
        createGiftBox(0.36, 0.34, 0.34, 0xc2410c, 0xf59e0b, [0.74, 0.065, 0.16], -0.35);  // Coral/Salmón con lazo oro
        createGiftBox(0.34, 0.28, 0.34, 0x0369a1, 0xdc2626, [0.66, 0.065, -0.32], 0.65);  // Cyan azul con lazo rojo

        // Esferas decorativas sueltas sobre la bandeja base
        addMesh(new THREE.SphereGeometry(0.032, 12, 12), std(0xdc2626, 0.12, 0.92), [-0.18, 0.097, 0.88], christmasTreeGroup, { cast: false });
        addMesh(new THREE.SphereGeometry(0.032, 12, 12), std(0x0284c7, 0.12, 0.92), [0.05, 0.097, 0.94], christmasTreeGroup, { cast: false });
        addMesh(new THREE.SphereGeometry(0.026, 12, 12), std(0xf59e0b, 0.10, 0.95), [0.24, 0.091, 0.86], christmasTreeGroup, { cast: false });

        let treeLightSurge = 0;

        function triggerChristmasTreeJoy() {
            treeLightSurge = 1.0;
            playChristmasJingleSound();
            showRobotBubble('🎄 ¡FELICES FIESTAS!', '¡Feliz Navidad y próspero Año Nuevo! Eduardo, EduBot & Kotetsu te desean éxito, alegría y código impecable ✨🎁', 10000);
        }

        /* ---------------------------------------------------------
           HOTSPOTS (DIAMOND MARKERS) & CAMERA TARGETS
        --------------------------------------------------------- */
        const UP = new THREE.Vector3(0, 1, 0);
        const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
        const HOTSPOTS = [
            { id: 'projects', code: '01', label: 'Proyectos', anchor: [-0.38, 2.32, 0.13], target: [-0.38, 1.75, 0.13], normal: [Math.sin(0.32), 0, Math.cos(0.32)], dist: 2.2, lift: 0.05 },
            { id: 'credentials', code: '02', label: 'Credenciales', anchor: [4.52, 3.85, -4.85], target: [4.52, 2.65, -4.95], normal: [0, 0, 1], dist: 2.55, lift: 0.0 },
            { id: 'home', code: '🤖', label: 'EduBot IA', anchor: [0.55, 2.35, -0.74], target: [0.50, 1.45, -0.74], normal: [0.35, 0.15, 0.93], dist: 2.4, lift: 0.1 },
            { id: 'contact', code: '04', label: 'Contacto', anchor: [1.56, 1.48, 0.18], target: [1.44, 1.50, 0.15], normal: [0, 0.04, 0.999], dist: 1.12, lift: 0.0 },
            { id: 'arcade', code: '05', label: 'Edu Tetris', anchor: [-5.05, 2.35, -4.05], target: [-5.05, 1.36, -4.05], normal: [0.707, 0, 0.707], dist: 2.45, lift: 0.0 },
            { id: 'music', code: '06', label: 'Música IA', anchor: [3.9, 1.85, -4.5], target: [3.9, 1.15, -4.5], normal: [-0.1, 0.5, 0.86], dist: 1.8, lift: 0.2 },
            { id: 'cv', code: '📄', label: 'Portafolio 2D', anchor: [-0.10, 1.38, 0.72], target: [-0.05, 1.07, 0.71], normal: [0, 0.85, 0.52], dist: 1.25, lift: 0.25 },
            { id: 'certifications', code: '07', label: 'Certificaciones', anchor: [-5.2, 4.05, 1.05], target: [-5.96, 2.85, 1.05], normal: [1, 0, 0], dist: 3.2, lift: 0.0 },
            { id: 'clock', code: '🕒', label: 'Reloj & Clima', anchor: [-5.88, 4.30, -1.55], target: [-5.96, 3.68, -1.55], normal: [1, 0, 0], dist: 2.05, lift: 0.0 },
            { id: 'cat', code: '🐾', label: 'Kotetsu', anchor: [-4.75, 0.9, 1.25], target: [-4.75, 0.86, 1.25], normal: [0.6, 0.2, 0.77], dist: 1.8, lift: 0.1 },
            { id: 'coffee', code: '☕', label: 'Café Turbo', anchor: [0.72, 1.42, 0.00], target: [0.48, 1.48, -0.45], normal: [0.42, 0.18, 0.88], dist: 2.15, lift: 0.15 },
            { id: 'coffee_macro', code: '☕', label: 'Latte Art Macro', anchor: [0.86, 1.35, 0.09], target: [0.86, 1.12, 0.09], normal: [0.35, 0.68, 0.64], dist: 0.48, lift: 0.02, noDiamond: true },
            { id: 'globe', code: '🌍', label: 'Mapamundi', anchor: [1.75, 1.70, -4.42], target: [1.75, 1.12, -4.42], normal: [-0.18, 0.22, 0.96], dist: 2.35, lift: 0.08 },
            { id: 'tree', code: '🎄', label: 'Árbol Navideño', anchor: [-4.65, 3.45, 4.10], target: [-4.65, 1.48, 4.10], normal: [0.80, 0.15, -0.58], dist: 5.45, lift: 0.0 },
            { id: 'scenic', code: '🏔️', label: 'Ventanal Panorámico', anchor: [-0.20, 4.15, -4.95], target: [0.60, 2.90, -4.99], normal: [0, 0, 1], dist: 3.4, lift: 0.0 }
        ];
        const hotspotMap = new Map();
        let hoveredId = null;

        HOTSPOTS.forEach((hs) => {
            hs.anchorV = v3(hs.anchor);
            hs.targetV = v3(hs.target);
            hs.normalV = v3(hs.normal).normalize();
            hotspotMap.set(hs.id, hs);

            if (markersContainer && !hs.noDiamond) {
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
                    if (hs.id === 'scenic') {
                        if (window.eduScenic) window.eduScenic.next();
                        return;
                    }
                    if (hs.id === 'coffee') {
                        triggerCoffeeTurbo();
                        return;
                    }
                    if (hs.id === 'cat') {
                        triggerCatInteraction();
                        return;
                    }
                    if (hs.id === 'tree') {
                        triggerChristmasTreeJoy();
                    }
                    if (hs.id === 'globe') {
                        spinGlobeWithImpulse(6.0);
                    }
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
                orbit.tAz = AZ_BASE;
                orbit.tR = baseRadius();
                orbit.tPol = POL_BASE;
            }
            if (stationId === 'music' && window.eduSpotifyPlayer) {
                window.eduSpotifyPlayer.expand();
            }
            const arcadeCta = document.getElementById('stage-arcade-cta');
            if (arcadeCta) {
                if (stationId === 'arcade') {
                    arcadeCta.classList.remove('hidden');
                    requestAnimationFrame(() => {
                        arcadeCta.classList.remove('opacity-0', 'scale-95');
                        arcadeCta.classList.add('opacity-100', 'scale-100');
                    });
                } else {
                    arcadeCta.classList.remove('opacity-100', 'scale-100');
                    arcadeCta.classList.add('opacity-0', 'scale-95');
                    setTimeout(() => {
                        if (api.getActiveStation() !== 'arcade') arcadeCta.classList.add('hidden');
                    }, 250);
                }
            }
            if (stationId === 'credentials') {
                if (credHint) {
                    credHint.classList.remove('hidden');
                    requestAnimationFrame(() => {
                        credHint.classList.remove('opacity-0', '-translate-y-2');
                        credHint.classList.add('opacity-100', 'translate-y-0');
                    });
                    setTimeout(() => {
                        if (credHint && api.getActiveStation() === 'credentials') {
                            credHint.classList.remove('opacity-100', 'translate-y-0');
                            credHint.classList.add('opacity-0', '-translate-y-2');
                            setTimeout(() => {
                                if (api.getActiveStation() !== 'credentials' || credHint.classList.contains('opacity-0')) {
                                    credHint.classList.add('hidden');
                                }
                            }, 300);
                        }
                    }, 5000);
                }
            } else {
                if (credHint) {
                    credHint.classList.remove('opacity-100', 'translate-y-0');
                    credHint.classList.add('opacity-0', '-translate-y-2');
                    credHint.classList.add('hidden');
                }
                if (window.eduBadgeSystem) {
                    window.eduBadgeSystem.closeInspector();
                }
            }
            if (stationId === 'certifications') {
                if (window.eduCertSystem) {
                    window.eduCertSystem.openInspector();
                }
            } else {
                if (window.eduCertSystem) {
                    window.eduCertSystem.closeInspector();
                }
            }
        });

        const raycaster = new THREE.Raycaster();
        const ndc = new THREE.Vector2();
        let dragging = false;
        let lastX = 0;
        let lastY = 0;
        let dragDist = 0;
        let lastInteraction = 0;

        function pickHit(clientX, clientY) {
            ndc.x = (clientX / Math.max(1, window.innerWidth)) * 2 - 1;
            ndc.y = -(clientY / Math.max(1, window.innerHeight)) * 2 + 1;
            raycaster.setFromCamera(ndc, camera);
            const hits = raycaster.intersectObjects(hitMeshes, false);
            return hits.length > 0 ? hits[0] : null;
        }

        function pickStation(clientX, clientY) {
            const hit = pickHit(clientX, clientY);
            return hit ? hit.object.userData.stationId : null;
        }

        canvas.addEventListener('pointerdown', (e) => {
            if (api.getViewMode() !== 'stage3d') return;
            dragging = true;
            lastX = e.clientX;
            lastY = e.clientY;
            dragDist = 0;
            lastInteraction = performance.now();
            canvas.classList.add('is-dragging');

            const hitDown = pickHit(e.clientX, e.clientY);
            if (hitDown && (hitDown.object.userData.isGlobe || hitDown.object.userData.stationId === 'globe')) {
                isGlobeDragging = true;
            } else {
                isGlobeDragging = false;
            }
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

                if (isGlobeDragging) {
                    globeSpinVelocity += dx * 0.08;
                    return;
                }

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
            if (api.getActiveStation() === 'contact' && phoneScreenMesh) {
                ndc.x = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
                ndc.y = -(e.clientY / Math.max(1, window.innerHeight)) * 2 + 1;
                raycaster.setFromCamera(ndc, camera);
                const screenHits = raycaster.intersectObject(phoneScreenMesh, false);
                if (screenHits.length > 0 && screenHits[0].uv) {
                    const py = (1 - screenHits[0].uv.y) * 1536;
                    if ((py >= 390 && py <= 590) || (py >= 614 && py <= 844) || (py >= 868 && py <= 1158) || (py >= 1210 && py <= 1390)) {
                        canvas.style.cursor = 'pointer';
                        return;
                    }
                }
            }
            const hit = pickHit(e.clientX, e.clientY);
            if (hit) {
                hoveredId = hit.object.userData.stationId;
                canvas.style.cursor = 'pointer';
            } else {
                if (hoveredId && !(hotspotMap.get(hoveredId) || {}).el?.matches(':hover')) hoveredId = null;
                canvas.style.cursor = '';
            }
        });

        window.addEventListener('pointerup', (e) => {
            if (!dragging) return;
            dragging = false;
            isGlobeDragging = false;
            canvas.classList.remove('is-dragging');
            if (api.getViewMode() === 'stage3d' && dragDist < 7 && e.target === canvas) {
                if (api.getActiveStation() === 'contact' && phoneScreenMesh) {
                    ndc.x = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
                    ndc.y = -(e.clientY / Math.max(1, window.innerHeight)) * 2 + 1;
                    raycaster.setFromCamera(ndc, camera);
                    const screenHits = raycaster.intersectObject(phoneScreenMesh, false);
                    if (screenHits.length > 0 && screenHits[0].uv) {
                        const uv = screenHits[0].uv;
                        const px = uv.x * 768;
                        const py = (1 - uv.y) * 1536;
                        if (py >= 390 && py <= 590) {
                            window.location.href = 'mailto:eduasesorti@gmail.com';
                            return;
                        } else if (py >= 614 && py <= 844) {
                            if (px < 384) {
                                window.open('https://github.com/educhile1', '_blank', 'noopener,noreferrer');
                            } else {
                                window.open('https://www.linkedin.com/in/eduardocayun/', '_blank', 'noopener,noreferrer');
                            }
                            return;
                        } else if (py >= 868 && py <= 1158) {
                            window.open('https://calendar.app.google/bLJvGyt2hxUdHTNG7', '_blank', 'noopener,noreferrer');
                            return;
                        } else if (py >= 1210 && py <= 1390) {
                            if (px < 192) {
                                window.location.href = 'mailto:eduasesorti@gmail.com';
                            } else if (px < 384) {
                                window.open('https://calendar.app.google/bLJvGyt2hxUdHTNG7', '_blank', 'noopener,noreferrer');
                            } else if (px < 576) {
                                window.open('https://www.linkedin.com/in/eduardocayun/', '_blank', 'noopener,noreferrer');
                            } else {
                                if (window.eduSpotifyPlayer) {
                                    window.eduSpotifyPlayer.expand();
                                    window.eduSpotifyPlayer.togglePlay();
                                }
                            }
                            return;
                        }
                    }
                }
                const hit = pickHit(e.clientX, e.clientY);
                if (hit) {
                    const id = hit.object.userData.stationId;
                    const badgeIdx = hit.object.userData.badgeIndex;
                    if (badgeIdx !== undefined) {
                        if (api.getActiveStation() !== 'credentials') {
                            api.focusStation('credentials');
                        }
                        if (window.eduBadgeSystem) {
                            window.eduBadgeSystem.flipBadge(badgeIdx);
                        }
                        return;
                    }
                    if (id === 'coffee' || (hit.object && hit.object.userData && hit.object.userData.isCoffee)) {
                        triggerCoffeeTurbo();
                        return;
                    }
                    if (id === 'cat' || (hit.object && hit.object.userData && hit.object.userData.isCat)) {
                        if (hit.object && hit.object.userData && hit.object.userData.isCatToy) {
                            triggerCatPlay();
                        } else {
                            triggerCatInteraction();
                        }
                        return;
                    }
                    if (id === 'globe' || (hit.object && hit.object.userData && hit.object.userData.isGlobe)) {
                        spinGlobeWithImpulse(6.0);
                        if (api.getActiveStation() !== 'globe') {
                            api.focusStation('globe');
                        }
                        return;
                    }
                    if (id === 'tree' || (hit.object && hit.object.userData && hit.object.userData.isChristmasTree)) {
                        triggerChristmasTreeJoy();
                        if (api.getActiveStation() !== 'tree') {
                            api.focusStation('tree');
                        }
                        return;
                    }
                    if (id === 'music' || (hit.object && hit.object.userData && hit.object.userData.isTurntable)) {
                        playTurntableNeedleSound();
                        if (window.eduSpotifyPlayer) {
                            window.eduSpotifyPlayer.expand();
                            window.eduSpotifyPlayer.togglePlay();
                        }
                        return;
                    }
                    if (id === 'robot') {
                        if (robotState === 'SEATED') {
                            if (window.eduRobotAssistant) {
                                window.eduRobotAssistant.triggerGreeting();
                            }
                        } else {
                            showRobotBubble('🤖 ASISTENTE EN MOVIMIENTO', '¡Disfrutando de mi pausa activa por la oficina virtual! 🧘⚡', 4000);
                        }
                        return;
                    }
                    if (id === 'scenic') {
                        if (window.eduScenic) window.eduScenic.next();
                        return;
                    }
                    if (id === 'arcade') {
                        if (api.getActiveStation() === 'arcade') {
                            window.location.href = 'tetris.html';
                            return;
                        }
                    }
                    if (id === 'certifications' || (hit.object && hit.object.userData && hit.object.userData.isCertBoard)) {
                        playTechClickSound(1040, 0.06);
                        if (hit.uv) {
                            const px = hit.uv.x * 2048;
                            const py = (1 - hit.uv.y) * 1216;
                            // Check tabs
                            if (py >= 24 && py <= 105) {
                                if (px >= 1090 && px < 1275) window.eduCertSystem.setCategory('all');
                                else if (px >= 1275 && px < 1470) window.eduCertSystem.setCategory('certs');
                                else if (px >= 1470 && px < 1665) window.eduCertSystem.setCategory('cloud');
                                else if (px >= 1665 && px < 1860) window.eduCertSystem.setCategory('sec');
                                else if (px >= 1860 && px < 2020) window.eduCertSystem.setCategory('ai');
                                return;
                            }
                            // Check cert cards on left
                            if (px < 1010 && py >= 170 && py <= 1120) {
                                const cardIdx = Math.min(CERTS_DATA.length - 1, Math.max(0, Math.floor((py - 170) / 188)));
                                if (api.getActiveStation() !== 'certifications') {
                                    api.focusStation('certifications');
                                }
                                if (window.eduCertSystem) {
                                    window.eduCertSystem.openInspector(cardIdx);
                                }
                                return;
                            }
                        }
                        if (api.getActiveStation() !== 'certifications') {
                            api.focusStation('certifications');
                        }
                        if (window.eduCertSystem) {
                            window.eduCertSystem.openInspector();
                        }
                        return;
                    }
                    api.focusStation(id);
                    if (id === 'music' && window.eduSpotifyPlayer) {
                        window.eduSpotifyPlayer.expand();
                        window.eduSpotifyPlayer.togglePlay();
                    }
                } else if (api.getActiveStation() !== 'overview') {
                    // Event strategy: clicking empty/non-interactive space while zoomed in exits to overview
                    api.focusStation('overview');
                }
            }
        });

        canvas.addEventListener('dblclick', (e) => {
            if (api.getViewMode() === 'stage3d' && api.getActiveStation() !== 'overview') {
                e.preventDefault();
                api.focusStation('overview');
            }
        });

        canvas.addEventListener('contextmenu', (e) => {
            if (api.getViewMode() === 'stage3d' && api.getActiveStation() !== 'overview') {
                e.preventDefault();
                api.focusStation('overview');
            }
        });

        canvas.addEventListener(
            'wheel',
            (e) => {
                if (api.getViewMode() !== 'stage3d') return;
                if (hotspotMap.has(api.getActiveStation())) {
                    // Event strategy: scrolling out while zoomed in returns to office overview
                    if (e.deltaY > 35) {
                        e.preventDefault();
                        api.focusStation('overview');
                    }
                    return;
                }
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
        const robotAnchor = new THREE.Vector3(0.50, 1.85, -0.74);

        function updateRobotBubble() {
            if (!robotBubbleEl || robotBubbleEl.classList.contains('hidden') || api.getViewMode() !== 'stage3d') {
                return;
            }
            projVec.copy(robotAnchor);
            projVec.project(camera);
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const px = (projVec.x * 0.5 + 0.5) * vw;
            const py = (-projVec.y * 0.5 + 0.5) * vh;

            if (projVec.z > 1 || px < -80 || px > vw + 80 || py < -80 || py > vh + 80) {
                robotBubbleEl.style.opacity = '0';
                return;
            }

            robotBubbleEl.style.opacity = '1';
            const bubbleW = robotBubbleEl.offsetWidth || 320;
            const bubbleH = robotBubbleEl.offsetHeight || 170;

            const isDesktop = vw >= 768;
            let targetX, targetY;

            if (isDesktop && (px + bubbleW + 35) <= vw) {
                // Side bubble (positioned neatly to the right of robot)
                targetX = px + 28;
                targetY = Math.max(90, Math.min(vh - bubbleH - 75, py - bubbleH * 0.4));
                robotBubbleEl.classList.add('tail-left');
                robotBubbleEl.classList.remove('tail-bottom');
            } else {
                // Top bubble (centered above robot)
                targetX = Math.max(14, Math.min(vw - bubbleW - 14, px - bubbleW * 0.3));
                targetY = Math.max(90, Math.min(vh - bubbleH - 75, py - bubbleH - 22));
                robotBubbleEl.classList.add('tail-bottom');
                robotBubbleEl.classList.remove('tail-left');

                const tailEl = robotBubbleEl.querySelector('.edubot-bubble-tail');
                if (tailEl) {
                    const tailX = Math.max(22, Math.min(bubbleW - 26, px - targetX));
                    tailEl.style.left = `${tailX.toFixed(1)}px`;
                }
            }

            robotBubbleEl.style.transform = `translate3d(${targetX.toFixed(1)}px, ${targetY.toFixed(1)}px, 0)`;
        }

        const catAnchor = new THREE.Vector3(-4.25, 1.35, 2.45);
        function updateCatBubble() {
            if (!catBubbleEl || catBubbleEl.classList.contains('hidden') || api.getViewMode() !== 'stage3d') return;
            if (typeof catRoot !== 'undefined') {
                catAnchor.set(catRoot.position.x, catRoot.position.y + 0.46, catRoot.position.z);
            }
            projVec.copy(catAnchor);
            projVec.project(camera);
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const px = (projVec.x * 0.5 + 0.5) * vw;
            const py = (-projVec.y * 0.5 + 0.5) * vh;

            if (projVec.z > 1 || px < -80 || px > vw + 80 || py < -80 || py > vh + 80) {
                catBubbleEl.style.opacity = '0';
                return;
            }

            catBubbleEl.style.opacity = '1';
            const bubbleW = catBubbleEl.offsetWidth || 320;
            const bubbleH = catBubbleEl.offsetHeight || 160;

            const targetX = Math.max(14, Math.min(vw - bubbleW - 14, px - bubbleW * 0.45));
            const targetY = Math.max(80, Math.min(vh - bubbleH - 75, py - bubbleH - 24));

            catBubbleEl.style.transform = `translate3d(${targetX.toFixed(1)}px, ${targetY.toFixed(1)}px, 0)`;

            const tailEl = catBubbleEl.querySelector('.cat-bubble-tail');
            if (tailEl) {
                const tailX = Math.max(22, Math.min(bubbleW - 26, px - targetX));
                tailEl.style.left = `${tailX.toFixed(1)}px`;
            }
        }

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
                if (active === 'cat' && typeof catRoot !== 'undefined') {
                    if (currentWaypointId === 'beanbag' || (catRoot.position.x < -4.1 && catRoot.position.z > 0.5 && catRoot.position.z < 2.2)) {
                        // Bed corner view: captures dark bed, squish effect and nearby plush mouse & yarn toys!
                        hs.targetV.set(-4.35, 0.32, 1.30);
                        hs.normalV.set(0.68, 0.42, 0.60).normalize();
                        hs.dist = 2.45;
                        hs.lift = 0.18;
                    } else if (currentWaypointId === 'desk_surface' || catRoot.position.y > 0.85) {
                        // Perched cleanly ON TOP of the desk beside EduBot and RGB keyboard
                        hs.targetV.set(-0.05, 1.28, 0.28);
                        hs.normalV.set(0.18, 0.38, 0.91).normalize();
                        hs.dist = 1.65;
                        hs.lift = 0.16;
                    } else if (catState === 'dancing') {
                        // Bipedal dancing mode: upright feline disco dance
                        hs.targetV.set(catRoot.position.x, catRoot.position.y + 0.22, catRoot.position.z);
                        hs.normalV.set(0.35, 0.25, 0.90).normalize();
                        hs.dist = 1.70;
                        hs.lift = 0.10;
                    } else if (currentWaypointId === 'food_station' || catState === 'drinking' || catState === 'eating') {
                        // Gourmet bistro: water fountain and salmon kibbles
                        hs.targetV.set(catRoot.position.x, catRoot.position.y + 0.12, catRoot.position.z);
                        hs.normalV.set(0.38, 0.48, 0.79).normalize();
                        hs.dist = 1.65;
                        hs.lift = 0.18;
                    } else {
                        // Roaming / investigating
                        hs.targetV.set(catRoot.position.x, catRoot.position.y + 0.16, catRoot.position.z);
                        hs.normalV.set(0.50, 0.35, 0.79).normalize();
                        hs.dist = 1.95;
                        hs.lift = 0.24;
                    }
                }
                tmpN.copy(hs.normalV).applyAxisAngle(UP, focusYaw);
                const dist = hs.dist * (isMobile() ? 1.3 : 1);
                // Elements always centered directly in the middle of the screen
                desiredPos.copy(hs.targetV).addScaledVector(tmpN, dist);
                desiredPos.y += hs.lift + focusPitch * 1.5;
                desiredLook.copy(hs.targetV);
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

            // Phone Lift & Float Physics (Station 04 - Contact)
            const isContactActive = active === 'contact';
            const liftTarget = isContactActive ? 1 : 0;
            const liftRate = 1 - Math.exp(-dt * (isContactActive ? 4.5 : 5.5));
            phoneState.liftProgress += (liftTarget - phoneState.liftProgress) * liftRate;
            const lp = phoneState.liftProgress;

            const px = THREE.MathUtils.lerp(phoneState.restPos.x, phoneState.liftedPos.x, lp);
            const floatY = lp > 0.05 && !reduced ? Math.sin(t * 2.4) * 0.012 * lp : 0;
            const py = THREE.MathUtils.lerp(phoneState.restPos.y, phoneState.liftedPos.y, lp) + floatY;
            const pz = THREE.MathUtils.lerp(phoneState.restPos.z, phoneState.liftedPos.z, lp);
            phone.position.set(px, py, pz);

            const rx = THREE.MathUtils.lerp(phoneState.restRot.x, phoneState.liftedRot.x, lp);
            const ry = THREE.MathUtils.lerp(phoneState.restRot.y, phoneState.liftedRot.y, lp) + focusYaw * 0.45 * lp;
            const rz = THREE.MathUtils.lerp(phoneState.restRot.z, phoneState.liftedRot.z, lp) + (lp > 0.05 && !reduced ? Math.sin(t * 1.8) * 0.008 * lp : 0);
            phone.rotation.set(rx, ry, rz);

            const contactHs = hotspotMap.get('contact');
            if (contactHs) {
                contactHs.anchorV.set(0.2 + phone.position.x, phone.position.y + 0.34, 0.25 + phone.position.z);
            }

            // CV Paper magnetic elevation on hover / active
            const isCvActive = active === 'cv';
            const isCvHovered = hoveredId === 'cv';
            const targetPaperY = 1.052 + (isCvActive ? 0.028 : (isCvHovered ? 0.009 : 0));
            cvGroup.position.y += (targetPaperY - cvGroup.position.y) * (1 - Math.exp(-dt * 6.0));
            const cvHs = hotspotMap.get('cv');
            if (cvHs) {
                cvHs.anchorV.set(0.2 + cvGroup.position.x, cvGroup.position.y + 0.38, 0.25 + cvGroup.position.z);
                cvHs.targetV.set(0.2 + cvGroup.position.x, cvGroup.position.y + 0.02, 0.25 + cvGroup.position.z);
            }

            // Dynamic anchor tracking for Kotetsu and EduBot
            const catHs = hotspotMap.get('cat');
            if (catHs && typeof catRoot !== 'undefined') {
                catHs.anchorV.set(catRoot.position.x, catRoot.position.y + 0.48, catRoot.position.z);
            }
            const homeHs = hotspotMap.get('home');
            if (homeHs && typeof robot !== 'undefined') {
                homeHs.anchorV.set(robot.position.x, robot.position.y + 1.25, robot.position.z);
            }

            camera.position.lerp(desiredPos, k);
            currentLook.lerp(desiredLook, k);
            camera.lookAt(currentLook);

            if (!reduced) {
                // Speaker pulse & audiophile turntable kinematics synchronized with Spotify player
                const isAudioPlaying = window.eduMusicState && window.eduMusicState.isPlaying;
                let beat = 0;
                if (isAudioPlaying) {
                    beat = (window.eduMusicState.getBeat ? window.eduMusicState.getBeat() : Math.pow(Math.max(0, Math.sin(t * 6.8)), 6));
                    ringOuter.scale.setScalar(1 + beat * 0.22);
                    ringInner.scale.setScalar(1 + beat * 0.36);
                    if (ringSpotify) ringSpotify.scale.setScalar(1 + beat * 0.26);
                    speakerLight.intensity = 0.55 + beat * 0.8;
                    if (speakerGreenLight) speakerGreenLight.intensity = 0.55 + beat * 0.9;
                    if (albumJacket) albumJacket.position.y = 0.94 + Math.sin(t * 3.5) * 0.005;

                    if (turntablePowerLedMat) turntablePowerLedMat.color.setHex(0x1ed760);

                    // Vinyl Placement on Turntable Platter
                    if (!isTurntablePlayingPrev) {
                        isTurntablePlayingPrev = true;
                        vinylPlacementProg = 1.0;
                    }

                    // Spin platter and vinyl up to ~33 1/3 RPM (~3.8 rad/s)
                    const targetSpeed = 3.9 + Math.sin(t * 1.5) * 0.05 + beat * 0.15;
                    vinylSpinSpeed += (targetSpeed - vinylSpinSpeed) * (1 - Math.exp(-dt * 3.2));

                    // Tonearm swings smoothly over vinyl grooves & tracks inward
                    const songProg = (window.eduMusicState && window.eduMusicState.duration > 0) ? Math.min(1, Math.max(0, window.eduMusicState.currentTime / window.eduMusicState.duration)) : 0.15;
                    const targetTonearmAngle = THREE.MathUtils.lerp(-0.36, -0.72, songProg);
                    tonearmAngle += (targetTonearmAngle - tonearmAngle) * (1 - Math.exp(-dt * 2.8));
                    tonearmCueLift += (0.0 - tonearmCueLift) * (1 - Math.exp(-dt * 4.5)); // Needle down on groove

                } else {
                    ringOuter.scale.setScalar(1.0);
                    ringInner.scale.setScalar(1.0);
                    if (ringSpotify) ringSpotify.scale.setScalar(1.0);
                    speakerLight.intensity = 0.25;
                    if (speakerGreenLight) speakerGreenLight.intensity = 0.2;
                    if (albumJacket) albumJacket.position.y = 0.94;

                    if (turntablePowerLedMat) turntablePowerLedMat.color.setHex(0x3f3f46);
                    isTurntablePlayingPrev = false;

                    // Vinyl & Platter decelerate smoothly with natural friction until COMPLETELY STOPPED
                    vinylSpinSpeed *= Math.exp(-dt * 2.4);
                    if (vinylSpinSpeed < 0.0008) vinylSpinSpeed = 0.0;

                    // Tonearm lifts off record and returns to rest cradle
                    tonearmCueLift += (1.0 - tonearmCueLift) * (1 - Math.exp(-dt * 4.2));
                    tonearmAngle += (-0.03 - tonearmAngle) * (1 - Math.exp(-dt * 2.5));
                }

                // Apply turntable physical rotations
                if (vinylGroup) vinylGroup.rotation.y += vinylSpinSpeed * dt;
                if (platterGroup) platterGroup.rotation.y += vinylSpinSpeed * dt;
                if (tonearmArmGroup) {
                    tonearmArmGroup.rotation.y = tonearmAngle;
                    tonearmArmGroup.rotation.x = tonearmCueLift * 0.07;
                }

                // Mapamundi Globe continuous inertia & friction
                if (globeMesh) {
                    if (!isGlobeDragging) {
                        globeSpinVelocity *= Math.exp(-dt * 0.92);
                    }
                    globeMesh.rotation.y += globeSpinVelocity * dt;
                }

                // Christmas Tree Lights Twinkle & Surge
                if (treeLightMeshes && treeLightMeshes.length > 0) {
                    treeLightSurge *= Math.exp(-dt * 2.5);
                    const treeSpeed = 4.2 + treeLightSurge * 14.0;
                    treeLightMeshes.forEach((tl, idx) => {
                        const pulse = Math.sin(t * treeSpeed + tl.phase);
                        const s = 0.85 + Math.max(0, pulse) * 0.55 + treeLightSurge * 0.8;
                        tl.mesh.scale.setScalar(s);
                        if (treeLightMats[idx % treeLightMats.length]) {
                            treeLightMats[idx % treeLightMats.length].opacity = 0.65 + Math.max(0, pulse) * 0.35 + treeLightSurge * 0.3;
                        }
                    });
                    if (typeof starPointLight !== 'undefined' && starPointLight) {
                        starPointLight.intensity = 0.45 + Math.sin(t * 2.5) * 0.12 + treeLightSurge * 0.8;
                    }
                    if (typeof treeWarmLight !== 'undefined' && treeWarmLight) {
                        treeWarmLight.intensity = 0.22 + Math.sin(t * 2.0) * 0.06 + treeLightSurge * 0.5;
                    }
                }

                // ROBOT ANIMATIONS: MOBILITY PAUSA ACTIVA, GREETING WAVE, DANCING WITH MUSIC, OR IDLE TYPING
                const nowMs = performance.now();
                const isGreetingNow = isInitialWelcomeActive || (isGreetingActive && (nowMs - greetingStartTime) < (isInitialWelcomeActive ? 18000 : 5000));
                const isUserInspecting = hotspotMap.has(api.getActiveStation()) && api.getActiveStation() !== 'overview' && api.getActiveStation() !== 'cat' && api.getActiveStation() !== 'globe' && api.getActiveStation() !== 'tree';

                // Check autonomous break timer when seated
                if (robotState === 'SEATED') {
                    if (!isAudioPlaying && !isUserInspecting && !isInitialWelcomeActive && !isGreetingNow && !isCoffeeSipping) {
                        timeSinceLastBreak += dt;
                        if (timeSinceLastBreak > 75.0) {
                            triggerStretchWalk();
                        }
                    }
                }

                // Face expression & Blinking logic
                let expr = 'normal';
                if (robotState === 'STRETCHING') {
                    expr = 'stretch';
                } else if (robotState === 'PET_CAT') {
                    expr = 'love';
                } else if (robotState === 'GAZE_WINDOW' || robotState === 'WALK_TO_WINDOW') {
                    expr = 'gaze';
                } else if (robotState === 'WALK_TO_CAT' || robotState === 'WALK_TO_DESK') {
                    expr = 'welcome';
                } else if (isCoffeeSipping && (nowMs - coffeeSipStartTime) < 2200) {
                    expr = 'happy';
                } else if (isTurboActive) {
                    expr = 'turbo';
                } else if (isAudioPlaying) {
                    expr = 'dancing';
                } else if (isGreetingNow || isInitialWelcomeActive) {
                    expr = 'welcome';
                }

                nextBlink -= dt;
                const blinking = nextBlink < 0 && nextBlink > -0.14;
                if (nextBlink < -0.14) nextBlink = 2.2 + Math.random() * 3.2;

                if (expr !== lastFaceExpr || blinking !== lastFaceBlink || (expr === 'dancing' && beat > 0.4)) {
                    lastFaceExpr = expr;
                    lastFaceBlink = blinking;
                    drawFace(expr, blinking, beat);
                    robotFaceTex.needsUpdate = true;
                }

                // ROBOT STATE MACHINE EXECUTION
                if (robotState !== 'SEATED') {
                    targetStand = (robotState === 'SIT_DOWN') ? 0.0 : 1.0;
                    standProg += (targetStand - standProg) * (1 - Math.exp(-dt * 4.2));
                    const standY = standProg * 0.38;
                    chair.position.z = -0.86 - standProg * 0.26;

                    robotStateTime += dt;

                    if (robotState === 'STAND_PREP') {
                        robot.position.set(robotDeskSeatPos.x, standY, robotDeskSeatPos.z);
                        robot.rotation.set(0, 0, 0);
                        legL.hip.rotation.x = THREE.MathUtils.lerp(-1.45, 0.0, standProg);
                        legL.knee.rotation.x = THREE.MathUtils.lerp(1.45, 0.0, standProg);
                        legR.hip.rotation.x = THREE.MathUtils.lerp(-1.45, 0.0, standProg);
                        legR.knee.rotation.x = THREE.MathUtils.lerp(1.45, 0.0, standProg);
                        armL.rotation.set(-0.35, 0.1, -0.15);
                        armR.rotation.set(-0.35, -0.1, 0.15);
                        head.rotation.set(0, 0, 0);

                        if (standProg > 0.94 && robotStateTime > 0.8) {
                            robotState = 'STRETCHING';
                            robotStateTime = 0;
                            showRobotBubble('🧘 PAUSA ACTIVA', '¡Uff, tantas horas programando! Momento de estirar la columna y los servomotores... 🧘‍♂️⚡', 6000);
                        }
                    } else if (robotState === 'STRETCHING') {
                        robot.position.set(robotDeskSeatPos.x, standY, robotDeskSeatPos.z);
                        legL.hip.rotation.set(0, 0, 0);
                        legL.knee.rotation.set(0, 0, 0);
                        legR.hip.rotation.set(0, 0, 0);
                        legR.knee.rotation.set(0, 0, 0);

                        if (robotStateTime < 2.2) {
                            const p = Math.min(1, robotStateTime / 2.2);
                            const ease = p * p * (3 - 2 * p);
                            armL.rotation.x = THREE.MathUtils.lerp(-0.35, 2.35, ease);
                            armR.rotation.x = THREE.MathUtils.lerp(-0.35, 2.35, ease);
                            armL.rotation.z = -0.25;
                            armR.rotation.z = 0.25;
                            robot.rotation.x = THREE.MathUtils.lerp(0, -0.12, ease);
                            head.rotation.x = THREE.MathUtils.lerp(0, -0.28, ease);
                            head.rotation.y = 0;
                            head.rotation.z = 0;
                        } else if (robotStateTime < 4.4) {
                            const sideT = (robotStateTime - 2.2) * 3.2;
                            robot.rotation.x = 0;
                            robot.rotation.z = Math.sin(sideT) * 0.14;
                            robot.rotation.y = Math.sin(sideT * 0.5) * 0.18;
                            armL.rotation.x = 0.2;
                            armL.rotation.z = -0.75 - Math.sin(sideT) * 0.2;
                            armR.rotation.x = 0.2;
                            armR.rotation.z = 0.75 - Math.sin(sideT) * 0.2;
                            head.rotation.z = -robot.rotation.z * 0.8;
                            head.rotation.x = 0.05;
                        } else if (robotStateTime < 5.8) {
                            robot.rotation.set(0, 0, 0);
                            head.rotation.set(0, 0, 0);
                            armL.rotation.x = -0.25 + Math.sin(robotStateTime * 16) * 0.06;
                            armR.rotation.x = -0.25 + Math.sin(robotStateTime * 16 + 1.2) * 0.06;
                            armL.rotation.z = -0.15;
                            armR.rotation.z = 0.15;
                        } else {
                            // Target location for visiting Kotetsu
                            const isCatOnDesk = (typeof catRoot !== 'undefined' && (currentWaypointId === 'desk_surface' || catRoot.position.y > 0.85));
                            let targetCatX = -3.35;
                            let targetCatZ = 2.05;
                            if (typeof catRoot !== 'undefined') {
                                if (isCatOnDesk) {
                                    // Gato sobre el escritorio: pararse frente al escritorio limpiamente
                                    targetCatX = -0.30;
                                    targetCatZ = 1.15;
                                } else {
                                    // Gato en el lounge / rincón: acercarse a Kotetsu
                                    targetCatX = Math.max(-4.2, Math.min(-1.6, catRoot.position.x + 0.65));
                                    targetCatZ = Math.max(0.6, Math.min(2.5, catRoot.position.z - 0.15));
                                }
                            }

                            // Ruta 100% libre de colisiones: sale por el flanco despejado lateral
                            // evitando la silla y el escritorio, caminando siempre hacia adelante por los pasillos
                            if (isCatOnDesk) {
                                currentNavPath = [
                                    [0.10, -0.85],
                                    [0.10, -1.45],
                                    [-2.15, -1.45],
                                    [-2.15, 1.15],
                                    [targetCatX, targetCatZ]
                                ];
                            } else {
                                currentNavPath = [
                                    [0.10, -0.85],
                                    [0.10, -1.45],
                                    [-2.15, -1.45],
                                    [-2.15, 0.40],
                                    [-2.20, 1.40],
                                    [targetCatX, targetCatZ]
                                ];
                            }
                            currentNavTargetIdx = 0;
                            robotState = 'WALK_TO_CAT';
                            robotStateTime = 0;
                            showRobotBubble('🐾 VISITA A KOTETSU', 'Voy a saludar y hacerle cariño a nuestro gato Kotetsu... 🐱', 5000);
                        }
                    } else if (robotState === 'WALK_TO_CAT') {
                        const targetWP = currentNavPath[currentNavTargetIdx];
                        const dx = targetWP[0] - robotPos.x;
                        const dz = targetWP[1] - robotPos.z;
                        const distWP = Math.hypot(dx, dz);

                        // ORIENTACIÓN FRONTAL ESTRICTA: Math.atan2(dx, dz) orienta siempre hacia adelante
                        const targetAngle = Math.atan2(dx, dz);
                        let diff = targetAngle - robotHeading;
                        while (diff < -Math.PI) diff += Math.PI * 2;
                        while (diff > Math.PI) diff -= Math.PI * 2;
                        robotHeading += diff * (1 - Math.exp(-dt * 9.5));

                        // Gira hacia el destino antes de avanzar (evita caminar de espaldas o derrapar)
                        const turnAlign = Math.max(0, Math.cos(diff));
                        const walkSpeed = 1.35 * (0.2 + 0.8 * turnAlign);
                        robotWalkPhase += dt * 7.5 * (0.2 + 0.8 * turnAlign);

                        if (distWP > 0.08) {
                            const step = Math.min(distWP, walkSpeed * dt);
                            robotPos.x += (dx / distWP) * step;
                            robotPos.z += (dz / distWP) * step;
                        } else {
                            currentNavTargetIdx++;
                            if (currentNavTargetIdx >= currentNavPath.length) {
                                robotState = 'PET_CAT';
                                robotStateTime = 0;
                                const catPos = (typeof catRoot !== 'undefined') ? catRoot.position : { x: -4.25, y: 0.86, z: 2.45 };
                                const toCatX = catPos.x - robotPos.x;
                                const toCatZ = catPos.z - robotPos.z;
                                robotHeading = Math.atan2(toCatX, toCatZ); // Mira de frente al gato
                                playCatPurr();
                                playCatMeow();
                                if (typeof spawnCatHearts === 'function') {
                                    spawnCatHearts(catPos);
                                }
                                showCatThought('🐱 ¡RONRONEO MÁXIMO!', '¡Miau! ¡Prrrr! (EduBot da los mejores cariños felinos) 🐾❤️');
                                showRobotBubble('🐱 CARIÑO FELINO', '¡Hola Kotetsu! Qué suave eres... La mejor pausa para recargar serotonina y energía 🐱❤️✨', 6000);
                            }
                        }

                        robot.position.set(robotPos.x, standY + Math.abs(Math.sin(robotWalkPhase)) * 0.038, robotPos.z);
                        robot.rotation.set(0, robotHeading, Math.sin(robotWalkPhase) * 0.032);
                        legL.hip.rotation.set(Math.sin(robotWalkPhase) * 0.55, 0, 0);
                        legR.hip.rotation.set(-Math.sin(robotWalkPhase) * 0.55, 0, 0);
                        legL.knee.rotation.set(Math.max(0, -Math.sin(robotWalkPhase) * 0.72), 0, 0);
                        legR.knee.rotation.set(Math.max(0, Math.sin(robotWalkPhase) * 0.72), 0, 0);
                        armL.rotation.set(-Math.sin(robotWalkPhase) * 0.45, 0, -0.15);
                        armR.rotation.set(Math.sin(robotWalkPhase) * 0.45, 0, 0.15);
                        head.rotation.set(0.04, 0, 0);

                    } else if (robotState === 'PET_CAT') {
                        crouchProg += (1.0 - crouchProg) * (1 - Math.exp(-dt * 5.0));
                        const crouchY = standY * (1.0 - crouchProg * 0.65);
                        robot.position.set(robotPos.x, crouchY, robotPos.z);
                        robot.rotation.set(0, robotHeading, 0);

                        legL.hip.rotation.set(-0.85 * crouchProg, 0, 0);
                        legR.hip.rotation.set(-0.85 * crouchProg, 0, 0);
                        legL.knee.rotation.set(1.25 * crouchProg, 0, 0);
                        legR.knee.rotation.set(1.25 * crouchProg, 0, 0);

                        const strokeT = Math.sin(robotStateTime * 4.2);
                        armR.rotation.x = -0.52 + strokeT * 0.16;
                        armR.rotation.z = 0.28;
                        armR.rotation.y = -0.18;
                        armL.rotation.set(-0.65, 0.1, -0.22);
                        head.rotation.set(0.32, 0.12, 0.05);

                        if (robotStateTime > 5.5) {
                            currentNavPath = [
                                [-2.15, 0.80],
                                [-2.15, -1.45],
                                [-1.30, -2.50],
                                [-0.20, -3.60]
                            ];
                            currentNavTargetIdx = 0;
                            robotState = 'WALK_TO_WINDOW';
                            robotStateTime = 0;
                            showRobotBubble('🏔️ RUTA AL VENTANAL', 'Ahora voy al ventanal panorámico a admirar la Patagonia... 🏔️', 5000);
                        }

                    } else if (robotState === 'WALK_TO_WINDOW') {
                        crouchProg += (0.0 - crouchProg) * (1 - Math.exp(-dt * 6.0));
                        const targetWP = currentNavPath[currentNavTargetIdx];
                        const dx = targetWP[0] - robotPos.x;
                        const dz = targetWP[1] - robotPos.z;
                        const distWP = Math.hypot(dx, dz);

                        // ORIENTACIÓN FRONTAL AL CAMINAR
                        const targetAngle = Math.atan2(dx, dz);
                        let diff = targetAngle - robotHeading;
                        while (diff < -Math.PI) diff += Math.PI * 2;
                        while (diff > Math.PI) diff -= Math.PI * 2;
                        robotHeading += diff * (1 - Math.exp(-dt * 9.5));

                        const turnAlign = Math.max(0, Math.cos(diff));
                        const walkSpeed = 1.35 * (0.2 + 0.8 * turnAlign);
                        robotWalkPhase += dt * 7.5 * (0.2 + 0.8 * turnAlign);

                        if (distWP > 0.08) {
                            const step = Math.min(distWP, walkSpeed * dt);
                            robotPos.x += (dx / distWP) * step;
                            robotPos.z += (dz / distWP) * step;
                        } else {
                            currentNavTargetIdx++;
                            if (currentNavTargetIdx >= currentNavPath.length) {
                                robotState = 'GAZE_WINDOW';
                                robotStateTime = 0;
                                showRobotBubble('🏔️ INSPIRACIÓN PATAGÓNICA', 'Qué majestuosa la vista de las Torres del Paine... Momento de contemplación para diseñar arquitecturas de software limpias y escalables 🏔️❄️✨', 7000);
                            }
                        }

                        robot.position.set(robotPos.x, standY + Math.abs(Math.sin(robotWalkPhase)) * 0.038, robotPos.z);
                        robot.rotation.set(0, robotHeading, Math.sin(robotWalkPhase) * 0.032);
                        legL.hip.rotation.set(Math.sin(robotWalkPhase) * 0.55, 0, 0);
                        legR.hip.rotation.set(-Math.sin(robotWalkPhase) * 0.55, 0, 0);
                        legL.knee.rotation.set(Math.max(0, -Math.sin(robotWalkPhase) * 0.72), 0, 0);
                        legR.knee.rotation.set(Math.max(0, Math.sin(robotWalkPhase) * 0.72), 0, 0);
                        armL.rotation.set(-Math.sin(robotWalkPhase) * 0.45, 0, -0.15);
                        armR.rotation.set(Math.sin(robotWalkPhase) * 0.45, 0, 0.15);
                        head.rotation.set(-0.06, 0, 0);

                    } else if (robotState === 'GAZE_WINDOW') {
                        let diff = Math.PI - robotHeading; // Mira hacia el ventanal (-Z)
                        while (diff < -Math.PI) diff += Math.PI * 2;
                        while (diff > Math.PI) diff -= Math.PI * 2;
                        robotHeading += diff * (1 - Math.exp(-dt * 6.0));

                        robot.position.set(robotPos.x, standY, robotPos.z);
                        robot.rotation.set(0, robotHeading, 0);
                        legL.hip.rotation.set(0, 0, 0);
                        legL.knee.rotation.set(0, 0, 0);
                        legR.hip.rotation.set(0, 0, 0);
                        legR.knee.rotation.set(0, 0, 0);

                        armL.rotation.set(0.32, -0.48, -0.12);
                        armR.rotation.set(0.32, 0.48, 0.12);

                        head.rotation.y = Math.sin(robotStateTime * 0.65) * 0.22;
                        head.rotation.x = -0.08 + Math.sin(robotStateTime * 0.3) * 0.04;
                        head.rotation.z = 0;

                        if (robotStateTime > 6.2) {
                            currentNavPath = [
                                [-1.30, -2.50],
                                [-2.15, -1.45],
                                [0.10, -1.45],
                                [0.10, -0.85],
                                [robotDeskSeatPos.x, robotDeskSeatPos.z]
                            ];
                            currentNavTargetIdx = 0;
                            robotState = 'WALK_TO_DESK';
                            robotStateTime = 0;
                            showRobotBubble('💻 DE VUELTA AL ESCRITORIO', '¡Mente y articulaciones al 100%! De vuelta al teclado mecánico a seguir construyendo software de alto nivel 🚀', 5000);
                        }

                    } else if (robotState === 'WALK_TO_DESK') {
                        const targetWP = currentNavPath[currentNavTargetIdx];
                        const dx = targetWP[0] - robotPos.x;
                        const dz = targetWP[1] - robotPos.z;
                        const distWP = Math.hypot(dx, dz);

                        // ORIENTACIÓN FRONTAL AL CAMINAR
                        const targetAngle = Math.atan2(dx, dz);
                        let diff = targetAngle - robotHeading;
                        while (diff < -Math.PI) diff += Math.PI * 2;
                        while (diff > Math.PI) diff -= Math.PI * 2;
                        robotHeading += diff * (1 - Math.exp(-dt * 9.5));

                        const turnAlign = Math.max(0, Math.cos(diff));
                        const walkSpeed = 1.35 * (0.2 + 0.8 * turnAlign);
                        robotWalkPhase += dt * 7.5 * (0.2 + 0.8 * turnAlign);

                        if (distWP > 0.08) {
                            const step = Math.min(distWP, walkSpeed * dt);
                            robotPos.x += (dx / distWP) * step;
                            robotPos.z += (dz / distWP) * step;
                        } else {
                            currentNavTargetIdx++;
                            if (currentNavTargetIdx >= currentNavPath.length) {
                                robotState = 'SIT_DOWN';
                                robotStateTime = 0;
                            }
                        }

                        robot.position.set(robotPos.x, standY + Math.abs(Math.sin(robotWalkPhase)) * 0.038, robotPos.z);
                        robot.rotation.set(0, robotHeading, Math.sin(robotWalkPhase) * 0.032);
                        legL.hip.rotation.set(Math.sin(robotWalkPhase) * 0.55, 0, 0);
                        legR.hip.rotation.set(-Math.sin(robotWalkPhase) * 0.55, 0, 0);
                        legL.knee.rotation.set(Math.max(0, -Math.sin(robotWalkPhase) * 0.72), 0, 0);
                        legR.knee.rotation.set(Math.max(0, Math.sin(robotWalkPhase) * 0.72), 0, 0);
                        armL.rotation.set(-Math.sin(robotWalkPhase) * 0.45, 0, -0.15);
                        armR.rotation.set(Math.sin(robotWalkPhase) * 0.45, 0, 0.15);
                        head.rotation.set(0.04, 0, 0);

                    } else if (robotState === 'SIT_DOWN') {
                        let diff = 0 - robotHeading; // Vuelve a mirar al frente hacia el escritorio (+Z)
                        while (diff < -Math.PI) diff += Math.PI * 2;
                        while (diff > Math.PI) diff -= Math.PI * 2;
                        robotHeading += diff * (1 - Math.exp(-dt * 6.0));

                        robot.position.set(robotDeskSeatPos.x, standY, robotDeskSeatPos.z);
                        robot.rotation.set(0, robotHeading, 0);

                        legL.hip.rotation.x = THREE.MathUtils.lerp(-1.45, 0.0, standProg);
                        legL.knee.rotation.x = THREE.MathUtils.lerp(1.45, 0.0, standProg);
                        legR.hip.rotation.x = THREE.MathUtils.lerp(-1.45, 0.0, standProg);
                        legR.knee.rotation.x = THREE.MathUtils.lerp(1.45, 0.0, standProg);
                        armL.rotation.set(-1.18, 0.10, -0.15);
                        armR.rotation.set(-1.18, -0.10, 0.15);
                        head.rotation.set(0.14, -0.18, 0);

                        if (standProg < 0.05 && robotStateTime > 1.2) {
                            robotState = 'SEATED';
                            timeSinceLastBreak = 0;
                        }
                    }

                    const baseAnchorY = 1.72;
                    robotAnchor.set(robot.position.x, baseAnchorY + standY * 0.32, robot.position.z);

                } else {
                    // SEATED ROUTINE (Typing, sipping coffee, greeting, dancing)
                    robotPos.set(robotDeskSeatPos.x, 0, robotDeskSeatPos.z);
                    robotHeading = 0;
                    robot.rotation.set(0, 0, 0);

                    // Smooth standing & sitting kinematics transition
                    targetStand = (isInitialWelcomeActive || isGreetingNow) ? 1.0 : 0.0;
                    standProg += (targetStand - standProg) * (1 - Math.exp(-dt * 4.2));

                    const standY = standProg * 0.38;
                    robot.position.set(robotDeskSeatPos.x, (isAudioPlaying ? (Math.abs(Math.sin(t * 7.2)) * 0.038 * (0.6 + beat * 0.6)) : 0) + standY, robotDeskSeatPos.z);
                    chair.position.z = -0.86 - standProg * 0.22;

                    // Leg articulation
                    const hipAngle = THREE.MathUtils.lerp(-1.45, 0.0, standProg);
                    const kneeAngle = THREE.MathUtils.lerp(1.45, 0.0, standProg);
                    legL.hip.rotation.x = hipAngle;
                    legL.knee.rotation.x = kneeAngle;
                    legR.hip.rotation.x = hipAngle;
                    legR.knee.rotation.x = kneeAngle;

                    // Dynamic speech bubble anchor following the standing elevation
                    const baseAnchorY = (api.getActiveStation() === 'coffee') ? 1.58 : 1.72;
                    robotAnchor.set(robot.position.x, baseAnchorY + standY * 0.32, robot.position.z);

                    if (isGreetingNow) {
                        const waveT = (nowMs - greetingStartTime) / 1000;
                        const armBlend = THREE.MathUtils.clamp(waveT * 3.5, 0, 1);

                        // Wave right arm high and enthusiastically
                        armR.rotation.x = THREE.MathUtils.lerp(-1.18, 0.55, armBlend);
                        armR.rotation.z = THREE.MathUtils.lerp(0.16, 0.88 + Math.sin(waveT * 11) * 0.36, armBlend);
                        armR.rotation.y = THREE.MathUtils.lerp(-0.12, Math.sin(waveT * 5) * 0.18, armBlend);

                        // Left arm in friendly welcoming pose at side/hip
                        armL.rotation.x = THREE.MathUtils.lerp(-1.18, -0.42 + Math.sin(waveT * 3) * 0.06, armBlend);
                        armL.rotation.z = THREE.MathUtils.lerp(-0.16, -0.38, armBlend);
                        armL.rotation.y = THREE.MathUtils.lerp(0.12, 0.22, armBlend);

                        // Head turns toward user/camera and tilts cutely
                        head.rotation.y = THREE.MathUtils.lerp(Math.sin(t * 0.6) * 0.18, -0.24 + Math.sin(waveT * 2.5) * 0.08, armBlend);
                        head.rotation.z = THREE.MathUtils.lerp(0, 0.06 + Math.sin(waveT * 3.5) * 0.04, armBlend);
                        head.rotation.x = THREE.MathUtils.lerp(0, 0.04 + Math.sin(waveT * 4) * 0.04, armBlend);
                        head.position.y = 1.62 + Math.sin(waveT * 3) * 0.015;

                        antennaTipL.scale.setScalar(1.2 + Math.sin(waveT * 8) * 0.25);
                        antennaTipR.scale.setScalar(1.2 + Math.sin(waveT * 8 + 1.5) * 0.25);
                        chestLed.visible = Math.sin(t * 7) > -0.2;

                    } else if (isAudioPlaying) {
                        // DANCING ROUTINE TO THE BEAT
                        head.position.y = 1.62 + Math.abs(Math.sin(t * 7.2)) * 0.045;
                        head.rotation.x = Math.sin(t * 7.2) * 0.14;
                        head.rotation.z = Math.sin(t * 3.6) * 0.14;
                        head.rotation.y = Math.sin(t * 1.8) * 0.22;

                        if (beat > 0.65) {
                            armL.rotation.x = 0.35 + beat * 0.35;
                            armL.rotation.z = -0.65;
                            armR.rotation.x = 0.35 + beat * 0.35;
                            armR.rotation.z = 0.65;
                            armR.rotation.y = 0;
                        } else {
                            armL.rotation.x = -0.9 + Math.sin(t * 7.2) * 0.45;
                            armL.rotation.z = -0.35 + Math.sin(t * 3.6) * 0.18;
                            armR.rotation.x = -0.9 + Math.sin(t * 7.2 + Math.PI) * 0.45;
                            armR.rotation.z = 0.35 + Math.sin(t * 3.6 + Math.PI) * 0.18;
                            armR.rotation.y = 0;
                        }

                        antennaTipL.scale.setScalar(1 + beat * 0.55);
                        antennaTipR.scale.setScalar(1 + beat * 0.55);
                        chestLed.visible = Math.sin(t * 10) > -0.2;

                    } else {
                        // DYNAMIC WORK, SIPPING COFFEE & TYPING AT KEYBOARD (With Turbo Mode support)
                        const turboMult = isTurboActive ? 3.6 : 1.0;
                        const workCycle = ((t * turboMult) % 5.8);
                        const isTyping = isTurboActive || workCycle < 3.8;

                        if (isCoffeeSipping) {
                            const sipT = (nowMs - coffeeSipStartTime) / 1000;
                            if (sipT < 0.9) {
                                const prog = Math.min(1, sipT / 0.9);
                                const ease = prog * prog * (3 - 2 * prog);
                                armR.rotation.x = THREE.MathUtils.lerp(-1.18, -0.68, ease);
                                armR.rotation.z = THREE.MathUtils.lerp(0.16, 0.44, ease);
                                armR.rotation.y = THREE.MathUtils.lerp(-0.12, 0.28, ease);

                                armL.rotation.x = THREE.MathUtils.lerp(-1.18, -1.05, ease);
                                armL.rotation.z = -0.15;
                                armL.rotation.y = 0.10;

                                head.rotation.x = THREE.MathUtils.lerp(0.14, 0.18, ease);
                                head.rotation.y = THREE.MathUtils.lerp(-0.18, 0.38, ease);
                                head.rotation.z = THREE.MathUtils.lerp(0.0, 0.06, ease);
                            } else if (sipT < 2.2) {
                                const sipPhase = (sipT - 0.9) / 1.3;
                                const bob = Math.sin(sipPhase * Math.PI);
                                armR.rotation.x = -0.68 + bob * 0.16;
                                armR.rotation.z = 0.44 - bob * 0.08;
                                armR.rotation.y = 0.28;

                                armL.rotation.x = -1.05;
                                armL.rotation.z = -0.15;
                                armL.rotation.y = 0.10;

                                head.rotation.x = 0.18 + bob * 0.10;
                                head.rotation.y = 0.38 - bob * 0.08;
                                head.rotation.z = 0.06 + bob * 0.06;
                            } else if (sipT < 3.0) {
                                const retProg = (sipT - 2.2) / 0.8;
                                const ease = retProg * retProg * (3 - 2 * retProg);
                                armR.rotation.x = THREE.MathUtils.lerp(-0.68, -1.18, ease);
                                armR.rotation.z = THREE.MathUtils.lerp(0.44, 0.16, ease);
                                armR.rotation.y = THREE.MathUtils.lerp(0.28, -0.12, ease);

                                head.rotation.x = THREE.MathUtils.lerp(0.18, 0.14, ease);
                                head.rotation.y = THREE.MathUtils.lerp(0.38, -0.18, ease);
                                head.rotation.z = THREE.MathUtils.lerp(0.06, 0.0, ease);
                            } else {
                                isCoffeeSipping = false;
                            }
                        } else if (isTyping) {
                            const freqL1 = isTurboActive ? 75 : 22;
                            const freqL2 = isTurboActive ? 120 : 37;
                            const freqR1 = isTurboActive ? 80 : 24;
                            const freqR2 = isTurboActive ? 115 : 33;
                            const strokeL = Math.sin(t * freqL1) * 0.045 + Math.sin(t * freqL2) * 0.022;
                            const strokeR = Math.sin(t * freqR1 + 1.8) * 0.045 + Math.sin(t * freqR2 + 0.9) * 0.022;
                            const keyDriftX = Math.sin(t * 3.2) * 0.035;

                            armL.rotation.x = -1.18 + strokeL;
                            armL.rotation.z = -0.16 + keyDriftX;
                            armL.rotation.y = 0.12 + Math.sin(t * 2.8) * 0.03;

                            armR.rotation.x = -1.18 + strokeR;
                            armR.rotation.z = 0.16 + keyDriftX;
                            armR.rotation.y = -0.12 - Math.sin(t * 2.8) * 0.03;

                            head.rotation.x = 0.14 + Math.sin(t * (isTurboActive ? 32 : 11)) * (isTurboActive ? 0.02 : 0.012);
                            head.rotation.y = -0.18 + Math.sin(t * 2.5) * 0.04;
                            head.rotation.z = Math.sin(t * 4) * 0.018;
                            head.position.y = 1.62 + Math.sin(t * (isTurboActive ? 18 : 5.5)) * (isTurboActive ? 0.009 : 0.005);
                        } else {
                            const inspectT = workCycle - 3.8;
                            const useMouse = inspectT > 0.6 && inspectT < 1.6;

                            armL.rotation.x = -1.14 + Math.sin(t * 2) * 0.008;
                            armL.rotation.z = -0.15;
                            armL.rotation.y = 0.10;

                            if (useMouse) {
                                armR.rotation.x = -1.14 + Math.sin(t * 14) * 0.018;
                                armR.rotation.z = 0.28 + Math.sin(t * 3) * 0.025;
                                armR.rotation.y = -0.05;
                            } else {
                                armR.rotation.x = -1.14 + Math.sin(t * 2) * 0.008;
                                armR.rotation.z = 0.15;
                                armR.rotation.y = -0.10;
                            }

                            if (isCatVisitingDesk) {
                                head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, 0.22, 0.08);
                                head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, 0.44, 0.08);
                                head.rotation.z = 0.02;
                                head.position.y = 1.622;
                            } else {
                                head.rotation.x = -0.06 + Math.sin(t * 1.5) * 0.015;
                                head.rotation.y = -0.32 + Math.sin(t * 1.8) * 0.025;
                                head.rotation.z = 0.02;
                                head.position.y = 1.622 + Math.sin(t * 2) * 0.004;
                            }
                        }

                        antennaTipL.scale.setScalar(1 + Math.sin(t * (isTurboActive ? 8 : 3.5)) * (isTurboActive ? 0.4 : 0.18));
                        antennaTipR.scale.setScalar(1 + Math.sin(t * (isTurboActive ? 8 : 3.5) + 1.5) * (isTurboActive ? 0.4 : 0.18));
                        chestLed.visible = isTurboActive ? (Math.sin(t * 18) > -0.2) : (Math.sin(t * 4.5) > -0.35);
                    }
                }

                updateRobotBubble();
                updateCatBubble();

                // DISCO BALL & STAGE PARTY ANIMATION LOOP
                const targetParty = isAudioPlaying ? 1.0 : 0.0;
                partyModeLerp += (targetParty - partyModeLerp) * (1 - Math.exp(-dt * 2.6));

                if (partyModeLerp > 0.001) {
                    discoCurrentY = THREE.MathUtils.lerp(discoRetractedY, discoPartyY, partyModeLerp);
                    discoBallGroup.position.y = discoCurrentY;

                    const chainTop = 8.94;
                    const chainBottom = discoCurrentY + 0.44;
                    const chainLength = Math.max(0.01, chainTop - chainBottom);
                    chainMesh.position.set(discoCenterX, (chainTop + chainBottom) / 2, discoCenterZ);
                    chainMesh.scale.set(1, chainLength, 1);
                    chainMesh.visible = true;

                    discoBallBody.rotation.y += dt * 1.85;

                    // 1. High-impact volumetric light beams (ethereal haze)
                    const beamOp = partyModeLerp * (0.09 + beat * 0.08);
                    beamMeshes.forEach((bm) => {
                        bm.material.opacity = beamOp;
                    });

                    // 2. High-power stage point lights orbiting
                    const pT = t * 2.2;
                    partyPointLights.forEach((p, idx) => {
                        const angle = pT * (p.speed * 0.5) + p.offset;
                        const lx = discoCenterX + Math.cos(angle) * p.r;
                        const lz = discoCenterZ + Math.sin(angle) * p.r;
                        const ly = discoCurrentY + Math.sin(pT * 1.4 + idx) * p.yAmp;
                        p.light.position.set(lx, ly, lz);
                        p.light.intensity = partyModeLerp * (p.baseInt + beat * p.beatAmp);
                    });

                    // 3. Stage Wall Washers (intense concert uplights on walls)
                    stageWallWashers.forEach(ww => {
                        ww.spot.intensity = partyModeLerp * (ww.baseInt + beat * ww.beatAmp);
                    });

                    // 4. Stage Moving-Head Spotlights sweeping walls and stage perimeter
                    stageSpotlights.forEach(sp => {
                        sp.target.position.set(
                            discoCenterX + Math.cos(t * sp.speed + sp.phase) * sp.rX,
                            sp.yBase + Math.sin(t * sp.speed * 1.3 + sp.phase) * sp.yAmp,
                            discoCenterZ + Math.sin(t * sp.speed * 0.85 + sp.phase) * sp.rZ
                        );
                        sp.spot.intensity = partyModeLerp * (sp.baseInt + beat * sp.beatAmp);
                    });

                    // 5. Strobe light flashing on heavy beats
                    if (beat > 0.75) {
                        strobeLight.intensity = partyModeLerp * 4.5;
                    } else {
                        strobeLight.intensity = 0;
                    }

                    // 6. Dynamic moving neon light pools and wall gobos
                    stageGoboMeshes.forEach(gb => {
                        if (gb.type === 'floor') {
                            gb.mesh.position.x = discoCenterX + Math.cos(t * gb.speed + gb.phase) * gb.radX;
                            gb.mesh.position.z = discoCenterZ + Math.sin(t * gb.speed * 1.15 + gb.phase) * gb.radZ;
                        } else if (gb.type === 'wallLeft') {
                            gb.mesh.position.z = (gb.zMin + gb.zMax) * 0.5 + Math.sin(t * gb.speed + gb.phase) * (gb.zMax - gb.zMin) * 0.5;
                            gb.mesh.position.y = (gb.yMin + gb.yMax) * 0.5 + Math.cos(t * gb.speed * 1.2 + gb.phase) * (gb.yMax - gb.yMin) * 0.5;
                        } else if (gb.type === 'wallBack') {
                            gb.mesh.position.x = (gb.xMin + gb.xMax) * 0.5 + Math.sin(t * gb.speed + gb.phase) * (gb.xMax - gb.xMin) * 0.5;
                            gb.mesh.position.y = (gb.yMin + gb.yMax) * 0.5 + Math.cos(t * gb.speed * 1.2 + gb.phase) * (gb.yMax - gb.yMin) * 0.5;
                        }
                        gb.mat.opacity = partyModeLerp * (0.34 + beat * 0.22);
                        gb.mesh.scale.setScalar(1 + beat * 0.18);
                    });

                    // 7. Laser beams sweeping rhythmically
                    laserBeams.forEach(lb => {
                        lb.mesh.rotation.x = Math.sin(t * lb.speedX + lb.phase) * lb.baseTilt;
                        lb.mesh.rotation.z = Math.cos(t * lb.speedZ + lb.phase) * lb.baseTilt;
                        lb.mat.opacity = partyModeLerp * (0.65 + (beat > 0.4 ? 0.35 : 0));
                    });

                    // 8. Specular reflection sparkles on surfaces
                    sparklesGroup.visible = true;
                    sparklesGroup.rotation.y += dt * 0.95;
                    sparklesMat.opacity = partyModeLerp * (0.8 + beat * 0.4);

                    // 9. DRAMATIC STAGE DARKENING: Dim daytime/office lights to create true nightclub contrast!
                    ambientLight.intensity = THREE.MathUtils.lerp(0.12, 0.015, partyModeLerp);
                    hemiLight.intensity = THREE.MathUtils.lerp(0.58, 0.035, partyModeLerp);
                    fillLight.intensity = THREE.MathUtils.lerp(0.35, 0.015, partyModeLerp);
                    if (!isCrossFading) {
                        const currLoc = SCENIC_LOCATIONS[currentScenicIdx];
                        sunLight.intensity = THREE.MathUtils.lerp(currLoc.sunIntensity, 0.04, partyModeLerp);
                        windowFloorGlow.material.opacity = THREE.MathUtils.lerp(currLoc.floorGlowOpacity, 0.02, partyModeLerp);
                    }
                    if (deskFloorGlowRef) deskFloorGlowRef.material.opacity = THREE.MathUtils.lerp(0.55, 0.04, partyModeLerp);
                    if (deskLightRef) {
                        deskLightRef.color.setHSL((t * 0.25) % 1, 1.0, 0.5);
                        deskLightRef.intensity = THREE.MathUtils.lerp(1.25, 0.15 + beat * 0.25, partyModeLerp);
                    }
                    if (lampLightRef) lampLightRef.intensity = THREE.MathUtils.lerp(1.1, 0.08, partyModeLerp);
                    if (shelfLightRef) shelfLightRef.intensity = THREE.MathUtils.lerp(0.6, 0.05, partyModeLerp);
                    if (pegLightRef) pegLightRef.intensity = THREE.MathUtils.lerp(0.8, 0.08, partyModeLerp);
                    if (ledMatRef) ledMatRef.color.setHSL((t * 0.25) % 1, 1.0, 0.5);
                } else {
                    discoBallGroup.position.y = discoRetractedY;
                    chainMesh.visible = false;
                    partyPointLights.forEach(p => { p.light.intensity = 0; });
                    stageWallWashers.forEach(ww => { ww.spot.intensity = 0; });
                    stageSpotlights.forEach(sp => { sp.spot.intensity = 0; });
                    strobeLight.intensity = 0;
                    stageGoboMeshes.forEach(gb => { gb.mat.opacity = 0; });
                    laserBeams.forEach(lb => { lb.mat.opacity = 0; });
                    beamMeshes.forEach(bm => { bm.material.opacity = 0; });
                    sparklesGroup.visible = false;

                    // Restore daytime office lighting
                    ambientLight.intensity = 0.12;
                    hemiLight.intensity = 0.58;
                    fillLight.intensity = 0.35;
                    if (deskFloorGlowRef) deskFloorGlowRef.material.opacity = 0.55;
                    if (deskLightRef) {
                        deskLightRef.color.setHex(0xffa24d);
                        deskLightRef.intensity = 1.15 + Math.sin(t * 1.4) * 0.12;
                    }
                    if (lampLightRef) lampLightRef.intensity = 1.1;
                    if (shelfLightRef) shelfLightRef.intensity = 0.6;
                    if (pegLightRef) pegLightRef.intensity = 0.8;
                    if (ledMatRef) ledMatRef.color.setHex(0xffb066);
                }

                // Badges sway, 3D flip rotation & cat breathing
                badgeList.forEach((b) => {
                    b.pivot.rotation.z = Math.sin(t * 0.9 + b.phase) * 0.035;

                    const diff = b.targetRotY - b.currentRotY;
                    if (Math.abs(diff) > 0.001) {
                        b.currentRotY += diff * Math.min(1.0, dt * 9.0);
                        b.wobble *= 0.92;
                        b.cardHolder.rotation.y = b.currentRotY + Math.sin(t * 18.0) * b.wobble;
                    } else {
                        b.currentRotY = b.targetRotY;
                        b.cardHolder.rotation.y = b.targetRotY;
                    }
                });
                // =========================================================
                // KOTETSU CAT MASCOT: 3D LOCOMOTION, STATE MACHINE & PLAY
                // =========================================================
                const stateElapsed = (now - stateStartTime) / 1000;

                // Autonomous state progression timers (variedad de acciones aleatorias)
                if (now - lastAutoActionTime > 14000) {
                    lastAutoActionTime = now;
                    if (catState === 'sleeping' && Math.random() < 0.65) {
                        startWaking();
                    } else if (catState === 'investigating' || catState === 'grooming' || catState === 'perch_furniture') {
                        const rand = Math.random();
                        if (rand < 0.28) {
                            startCatPlayActivity();
                        } else if (rand < 0.50) {
                            sendCatToFood();
                        } else if (rand < 0.78) {
                            // Subirse a muebles o explorar la oficina
                            const furnitureDestinations = ['desk_surface', 'credenza_surface', 'window_ledge', 'center', 'whiteboard', 'arcade'];
                            const nextChoice = furnitureDestinations[Math.floor(Math.random() * furnitureDestinations.length)];
                            startWalkTo(nextChoice, 'walking');
                        } else {
                            sendCatToSleep();
                        }
                    }
                }

                // Bed Squish Spring Damper Physics (Deformación de la cama al subir y bajar)
                if (typeof catBedCushion !== 'undefined' && catBedCushion) {
                    const squishForce = (bedSquishTarget - bedSquishCompression) * 90.0 - bedSquishVel * 12.0;
                    bedSquishVel += squishForce * dt;
                    bedSquishCompression += bedSquishVel * dt;
                    catBedCushion.scale.set(
                        1.0 + bedSquishCompression * 0.12,
                        1.0 - bedSquishCompression * 0.36,
                        1.0 + bedSquishCompression * 0.12
                    );
                    catBedCushion.position.y = 0.18 - bedSquishCompression * 0.04;
                }

                // Water Fountain Ripples Animation at Food Station
                if (typeof waterRipples !== 'undefined' && waterRipples) {
                    const wavePhase = (t * 2.8) % 1.0;
                    waterRipples.scale.setScalar(1.0 + wavePhase * 1.6);
                    waterRipples.material.opacity = Math.max(0, 0.75 * (1.0 - wavePhase));
                }

                // MUSIC DETECTED -> Bipedal Cat Dancing on 2 Legs!
                const isMusicPlaying = !!(window.eduMusicState && window.eduMusicState.isPlaying);
                if (isMusicPlaying && catState !== 'jumping_up' && catState !== 'jumping_down') {
                    if (catState !== 'dancing') {
                        catState = 'dancing';
                        stateStartTime = performance.now();
                        playCatMeow('chirp');
                        showCatThought('🕺 ¡KOTETSU MODO FIESTA!', '¡Miau! ¡Sonó la música! ¡A bailar en 2 patas al ritmo de los sintetizadores! 🐾🎶✨');
                    }
                } else if (!isMusicPlaying && catState === 'dancing') {
                    catState = 'grooming';
                    stateStartTime = performance.now();
                    stateDuration = 3.5;
                    const baseFloorY = (currentWaypointId === 'desk_surface') ? 1.24 :
                        (currentWaypointId === 'credenza_surface') ? 0.92 :
                            (currentWaypointId === 'window_ledge') ? 0.91 :
                                (currentWaypointId === 'beanbag') ? 0.44 : 0.16;
                    catRoot.position.y = baseFloorY;
                    catSpine.rotation.set(0, 0, 0);
                    playCatMeow('happy');
                }

                // Cyber-Yarn Toy Ball physics
                if (toyVel.lengthSq() > 0.0001) {
                    toyPos.x += toyVel.x * dt;
                    toyPos.z += toyVel.y * dt;
                    toyVel.multiplyScalar(Math.pow(0.88, dt * 60));

                    // Room bounds bounce
                    if (toyPos.x < -4.8) { toyPos.x = -4.8; toyVel.x *= -0.7; }
                    if (toyPos.x > 3.8) { toyPos.x = 3.8; toyVel.x *= -0.7; }
                    if (toyPos.z < -4.0) { toyPos.z = -4.0; toyVel.y *= -0.7; }
                    if (toyPos.z > 2.8) { toyPos.z = 2.8; toyVel.y *= -0.7; }

                    // Desk obstacle bounce (approx bounds x: [-0.7, 1.7], z: [-0.6, 0.6])
                    if (toyPos.x > -0.7 && toyPos.x < 1.7 && toyPos.z > -0.6 && toyPos.z < 0.6) {
                        if (Math.abs(toyPos.x - 0.5) > Math.abs(toyPos.z)) {
                            toyVel.x *= -0.75;
                            toyPos.x += Math.sign(toyPos.x - 0.5) * 0.05;
                        } else {
                            toyVel.y *= -0.75;
                            toyPos.z += Math.sign(toyPos.z) * 0.05;
                        }
                    }

                    // Ball roll spin
                    toyCore.rotation.x += toyVel.y * dt * 9;
                    toyCore.rotation.z -= toyVel.x * dt * 9;
                    toyRing1.rotation.x += toyVel.y * dt * 9;
                    toyRing2.rotation.z -= toyVel.x * dt * 9;
                }
                catToy.position.copy(toyPos);

                // Floating Hearts / Sparkles particle update
                let anyPartActive = false;
                for (let i = 0; i < CAT_PART_COUNT; i++) {
                    if (catPartAges[i] < 1.4) {
                        catPartAges[i] += dt;
                        catPartPos[i * 3] += catPartVels[i].x * dt;
                        catPartPos[i * 3 + 1] += catPartVels[i].y * dt;
                        catPartPos[i * 3 + 2] += catPartVels[i].z * dt;
                        anyPartActive = true;
                    } else {
                        catPartPos[i * 3 + 1] = -50;
                    }
                }
                if (anyPartActive) {
                    catPartGeo.attributes.position.needsUpdate = true;
                }

                // If user currently petted Kotetsu:
                if (isCatPetted) {
                    const petT = (now - catPetStartTime) / 1000;
                    const stretch = Math.sin(Math.min(Math.PI, petT * 2.2));
                    catSpine.scale.y = 1 + stretch * 0.28;
                    // LOUD PURR VIBRATION (vibración física en el lomo al ronronear fuerte)
                    catSpine.position.y = stretch * 0.05 + Math.sin(t * 36.0) * 0.009;
                    tailRoot.rotation.z = 0.35 + Math.sin(t * 8) * 0.35;
                    tailMid.rotation.z = 0.3 + Math.sin(t * 8 + 0.4) * 0.25;
                    catEyeMat.color.setHex(0x10b981);
                    catEyeL.scale.y = 1.0;
                    catEyeR.scale.y = 1.0;
                    if (petT > 4.5) isCatPetted = false;
                }
                // STATE MACHINE IMPLEMENTATION
                else if (catState === 'sleeping') {
                    // Resting breathing on dark corner bed
                    catRoot.position.set(-4.75, 0.44, 1.25);
                    catRoot.rotation.y = -2.15;
                    catSpine.scale.set(1.0, 1 + Math.sin(t * 1.5) * 0.035, 1.0);
                    catSpine.position.set(0, -0.02, 0);
                    catSpine.rotation.set(0, 0, 0);
                    catHeadGroup.position.set(0.24, -0.01, 0.04);
                    catHeadGroup.rotation.set(0.08, 0.2, 0.12);
                    catEyeL.scale.y = 0.15;
                    catEyeR.scale.y = 0.15;
                    catEyeMat.color.setHex(0x044837);

                    legFL.rotation.set(-1.1, 0, 0); legFL.position.y = -0.01;
                    legFR.rotation.set(-1.1, 0, 0); legFR.position.y = -0.01;
                    legBL.rotation.set(1.1, 0, 0); legBL.position.y = 0.02;
                    legBR.rotation.set(1.1, 0, 0); legBR.position.y = 0.02;

                    tailRoot.rotation.set(0.2, 1.3, -0.35);
                    tailMid.rotation.z = 0.75;
                    tailTipGroup.rotation.z = 0.55;
                }
                else if (catState === 'waking') {
                    // Yawn and 2-phase feline stretch
                    const prog = Math.min(1.0, stateElapsed / stateDuration);
                    catEyeL.scale.y = 0.9;
                    catEyeR.scale.y = 0.9;
                    catEyeMat.color.setHex(0x10b981);

                    if (prog < 0.5) {
                        const p = prog * 2;
                        catSpine.position.y = -0.06 * Math.sin(p * Math.PI);
                        catSpine.rotation.z = 0.22 * Math.sin(p * Math.PI);
                        legFL.rotation.z = 0.55 * Math.sin(p * Math.PI);
                        legFR.rotation.z = 0.55 * Math.sin(p * Math.PI);
                        catHeadGroup.rotation.x = -0.35 * Math.sin(p * Math.PI);
                    } else {
                        const p = (prog - 0.5) * 2;
                        catSpine.position.y = 0.04 * Math.sin(p * Math.PI);
                        catSpine.rotation.z = -0.2 * Math.sin(p * Math.PI);
                        legBL.rotation.z = -0.6 * Math.sin(p * Math.PI);
                        legBR.rotation.z = -0.6 * Math.sin(p * Math.PI);
                    }

                    if (prog >= 1.0) {
                        if (currentWaypointId === 'beanbag') {
                            startJumpDown();
                        } else {
                            startWalkTo('center', 'walking');
                        }
                    }
                }
                else if (catState === 'jumping_down') {
                    const prog = Math.min(1.0, stateElapsed / stateDuration);
                    catRoot.position.x = THREE.MathUtils.lerp(jumpStartPos.x, jumpEndPos.x, prog);
                    catRoot.position.z = THREE.MathUtils.lerp(jumpStartPos.z, jumpEndPos.z, prog);
                    catRoot.position.y = THREE.MathUtils.lerp(jumpStartPos.y, jumpEndPos.y, prog) + Math.sin(prog * Math.PI) * 0.38;

                    // Flight pose
                    legFL.rotation.z = 0.4;
                    legFR.rotation.z = 0.4;
                    legBL.rotation.z = -0.5;
                    legBR.rotation.z = -0.5;
                    tailRoot.rotation.z = 0.8;

                    if (prog >= 1.0) {
                        const floorWpId = (currentWaypointId === 'desk_surface') ? 'desk_front' :
                            (currentWaypointId === 'credenza_surface') ? 'credenza_front' :
                                (currentWaypointId === 'window_ledge') ? 'window' : 'lounge_rug';
                        currentWaypointId = floorWpId;
                        catRoot.position.copy(jumpEndPos);
                        catSpine.position.y = -0.04;
                        playCatMeow('chirp');
                        const target = nextActivityAfterLanding;
                        nextActivityAfterLanding = null;
                        if (target === 'running_zoomies') {
                            catState = 'running_zoomies';
                        } else if (target) {
                            startWalkTo(target, 'walking');
                        } else {
                            catState = 'investigating';
                            stateStartTime = performance.now();
                            stateDuration = 4.0;
                        }
                    }
                }
                else if (catState === 'jumping_up') {
                    const prog = Math.min(1.0, stateElapsed / stateDuration);
                    catRoot.position.x = THREE.MathUtils.lerp(jumpStartPos.x, jumpEndPos.x, prog);
                    catRoot.position.z = THREE.MathUtils.lerp(jumpStartPos.z, jumpEndPos.z, prog);
                    catRoot.position.y = THREE.MathUtils.lerp(jumpStartPos.y, jumpEndPos.y, prog) + Math.sin(prog * Math.PI) * 0.44;

                    legFL.rotation.z = 0.3;
                    legFR.rotation.z = 0.3;
                    legBL.rotation.z = -0.4;
                    legBR.rotation.z = -0.4;

                    if (prog >= 1.0) {
                        catRoot.position.copy(jumpEndPos);
                        stateStartTime = performance.now();
                        if (currentWaypointId === 'beanbag') {
                            catState = 'sleeping';
                        } else {
                            catState = 'perch_furniture';
                            stateDuration = 8.5;
                            playCatPurr();
                        }
                    }
                }
                else if (catState === 'walking') {
                    catRoot.position.y = 0.16;
                    catSpine.scale.set(1.0, 1.0, 1.0);
                    catEyeL.scale.y = 1.0;
                    catEyeR.scale.y = 1.0;
                    catEyeMat.color.setHex(0x10b981);

                    let targetX = 0, targetZ = 0;
                    if (pathQueue.length > 0) {
                        const targetWp = KOTETSU_WAYPOINTS[pathQueue[0]];
                        targetX = targetWp.x;
                        targetZ = targetWp.z;
                    } else {
                        targetX = KOTETSU_WAYPOINTS[currentWaypointId].x;
                        targetZ = KOTETSU_WAYPOINTS[currentWaypointId].z;
                    }

                    const dx = targetX - catRoot.position.x;
                    const dz = targetZ - catRoot.position.z;
                    const dist = Math.hypot(dx, dz);

                    if (dist > 0.08) {
                        const targetRotY = -Math.atan2(dz, dx);
                        catRoot.rotation.y = lerpAngle(catRoot.rotation.y, targetRotY, Math.min(1.0, dt * 7.0));

                        const walkSpeed = 0.88;
                        const step = Math.min(dist, walkSpeed * dt);
                        catRoot.position.x += (dx / dist) * step;
                        catRoot.position.z += (dz / dist) * step;

                        // Quadruped walking gait
                        walkPhase += dt * 7.5;
                        legFL.rotation.z = Math.sin(walkPhase) * 0.45;
                        legBR.rotation.z = Math.sin(walkPhase + 0.3) * 0.45;
                        legFR.rotation.z = Math.sin(walkPhase + Math.PI) * 0.45;
                        legBL.rotation.z = Math.sin(walkPhase + Math.PI + 0.3) * 0.45;

                        legFL.position.y = -0.05 + Math.max(0, Math.sin(walkPhase)) * 0.035;
                        legFR.position.y = -0.05 + Math.max(0, Math.sin(walkPhase + Math.PI)) * 0.035;
                        legBL.position.y = -0.03 + Math.max(0, Math.sin(walkPhase + Math.PI + 0.3)) * 0.03;
                        legBR.position.y = -0.03 + Math.max(0, Math.sin(walkPhase + 0.3)) * 0.03;

                        catSpine.position.y = Math.sin(walkPhase * 2) * 0.012;
                        catHeadGroup.rotation.y = Math.sin(walkPhase * 0.5) * 0.08;

                        // Happy upright "question mark" tail
                        tailRoot.rotation.set(0.08, 0, 0.65 + Math.sin(walkPhase * 0.7) * 0.12);
                        tailMid.rotation.z = 0.35;
                        tailTipGroup.rotation.z = 0.25;
                    } else {
                        // Waypoint reached
                        if (pathQueue.length > 0) {
                            currentWaypointId = pathQueue.shift();
                        }
                        // If the very next target is a piece of furniture, jump directly up from here!
                        if (pathQueue.length > 0 && KOTETSU_WAYPOINTS[pathQueue[0]] && KOTETSU_WAYPOINTS[pathQueue[0]].isFurniture) {
                            const furnitureTarget = pathQueue.shift();
                            startJumpUp(furnitureTarget);
                        } else if (pathQueue.length === 0) {
                            // Arrived at destination waypoint!
                            const destWp = KOTETSU_WAYPOINTS[currentWaypointId];
                            if (destWp && destWp.isFurniture && currentWaypointId !== 'beanbag') {
                                startJumpUp(currentWaypointId);
                            } else if (currentWaypointId === 'desk_robot') {
                                isCatVisitingDesk = true;
                                catState = 'investigating';
                                stateStartTime = performance.now();
                                stateDuration = 9.0;
                                playCatMeow('happy');
                            } else if (currentWaypointId === 'food_station') {
                                catState = (Math.random() < 0.5) ? 'drinking' : 'eating';
                                stateStartTime = performance.now();
                                stateDuration = 5.2;
                                playCatMeow('hungry');
                            } else if (currentWaypointId === 'toy_mouse') {
                                catState = 'hunting_wiggle';
                                stateStartTime = performance.now();
                                stateDuration = 1.2;
                                playToyMouseSqueak();
                            } else if (currentWaypointId === 'lounge_rug' && catState !== 'waking') {
                                startJumpUp('beanbag');
                            } else {
                                catState = 'investigating';
                                stateStartTime = performance.now();
                                stateDuration = 5.0;
                            }
                        }
                    }
                }
                else if (catState === 'drinking') {
                    // Head bobbing down into water fountain
                    catRoot.position.y = 0.16;
                    catSpine.position.set(0, -0.04, 0);
                    catSpine.rotation.set(0.12, 0, 0);
                    catHeadGroup.position.set(0.30, -0.04, -0.06);
                    catHeadGroup.rotation.set(0.48 + Math.sin(t * 14.0) * 0.04, -0.15, 0);

                    legFL.rotation.set(0.1, 0, 0);
                    legFR.rotation.set(0.1, 0, 0);
                    legBL.rotation.set(-0.15, 0, 0);
                    legBR.rotation.set(-0.15, 0, 0);
                    tailRoot.rotation.set(0.2, 0, 0.5 + Math.sin(t * 2.5) * 0.15);

                    if (now - lastLickSoundTime > 360) {
                        lastLickSoundTime = now;
                        playWaterLickSound();
                    }

                    if (stateElapsed > stateDuration) {
                        catState = 'grooming';
                        stateStartTime = performance.now();
                        stateDuration = 4.0;
                    }
                }
                else if (catState === 'eating') {
                    // Head bobbing down into kibble bowl
                    catRoot.position.y = 0.16;
                    catSpine.position.set(0, -0.04, 0);
                    catSpine.rotation.set(0.14, 0, 0);
                    catHeadGroup.position.set(0.30, -0.04, 0.06);
                    catHeadGroup.rotation.set(0.50 + Math.sin(t * 10.0) * 0.05, 0.15, 0);

                    legFL.rotation.set(0.1, 0, 0);
                    legFR.rotation.set(0.1, 0, 0);
                    legBL.rotation.set(-0.15, 0, 0);
                    legBR.rotation.set(-0.15, 0, 0);
                    tailRoot.rotation.set(0.2, 0, 0.4 + Math.sin(t * 2.0) * 0.12);

                    if (now - lastCrunchSoundTime > 450) {
                        lastCrunchSoundTime = now;
                        playFoodCrunchSound();
                    }

                    if (stateElapsed > stateDuration) {
                        catState = 'grooming';
                        stateStartTime = performance.now();
                        stateDuration = 4.2;
                    }
                }
                else if (catState === 'perch_furniture') {
                    // Resting or loafing on furniture (Desk, Credenza, Window Ledge)
                    const isDesk = currentWaypointId === 'desk_surface';
                    const isCredenza = currentWaypointId === 'credenza_surface';
                    const isWindow = currentWaypointId === 'window_ledge';

                    catSpine.scale.set(1.0, 1 + Math.sin(t * 1.8) * 0.025, 1.0);
                    catSpine.position.y = -0.035;
                    legFL.rotation.set(-1.0, 0, 0); legFL.position.y = 0.01;
                    legFR.rotation.set(-1.0, 0, 0); legFR.position.y = 0.01;
                    legBL.rotation.set(0.9, 0, 0); legBL.position.y = 0.02;
                    legBR.rotation.set(0.9, 0, 0); legBR.position.y = 0.02;

                    if (isDesk) {
                        catRoot.position.set(-0.05, 1.24, 0.28);
                        catRoot.rotation.y = lerpAngle(catRoot.rotation.y, -0.45, Math.min(1.0, dt * 4.0));
                        catHeadGroup.rotation.set(0.12, Math.sin(t * 1.5) * 0.25, 0.05);
                        tailRoot.rotation.set(0.2, 0.4, Math.sin(t * 2.2) * 0.35);
                    } else if (isCredenza) {
                        catRoot.position.set(2.25, 0.88, -4.40);
                        catHeadGroup.rotation.set(0.08, -0.3 + Math.sin(t * 1.2) * 0.2, 0);
                        tailRoot.rotation.set(0.1, 0.8, -0.2);
                        if (Math.random() < 0.015 && typeof spinGlobeWithImpulse === 'function') {
                            spinGlobeWithImpulse(1.6);
                        }
                    } else {
                        catRoot.position.set(0.40, 0.91, -4.25);
                        catHeadGroup.rotation.set(0.15, 0.4 + Math.sin(t * 1.0) * 0.15, 0);
                        tailRoot.rotation.set(0.1, 0, 0.4 + Math.sin(t * 1.5) * 0.2);
                    }

                    if (stateElapsed > stateDuration) {
                        startJumpDown('center');
                    }
                }
                else if (catState === 'dancing') {
                    // BIPEDAL DANCING FELINE (Baila en 2 piernas, mueve la cola)
                    const beat = (window.eduMusicState && window.eduMusicState.getBeat) ? window.eduMusicState.getBeat() : Math.pow(Math.max(0, Math.sin(t * 7.2)), 4);
                    const danceTempo = t * 7.8;
                    const stepSide = Math.sin(danceTempo);

                    // 1. Stands upright on hind legs facing the audience / camera
                    const baseFloorY = (currentWaypointId === 'desk_surface') ? 1.24 :
                        (currentWaypointId === 'credenza_surface') ? 0.92 :
                            (currentWaypointId === 'window_ledge') ? 0.91 :
                                (currentWaypointId === 'beanbag') ? 0.44 : 0.16;
                    catRoot.position.y = baseFloorY + 0.16 + Math.abs(Math.sin(danceTempo)) * 0.04 + beat * 0.03;
                    catRoot.rotation.y = -Math.PI * 0.5 + Math.sin(danceTempo * 0.5) * 0.20;
                    catSpine.rotation.z = 1.32 + Math.sin(danceTempo * 0.5) * 0.08;
                    catSpine.rotation.y = Math.sin(danceTempo * 0.5) * 0.22;
                    catSpine.rotation.x = Math.cos(danceTempo) * 0.08;

                    // 2. Hind legs supporting & stepping rhythmically
                    legBL.position.set(-0.16, -0.03, -0.115);
                    legBR.position.set(-0.16, -0.03, 0.115);
                    legBL.rotation.z = -1.28 + stepSide * 0.24;
                    legBR.rotation.z = -1.28 - stepSide * 0.24;
                    legBL.rotation.x = stepSide * 0.16;
                    legBR.rotation.x = -stepSide * 0.16;

                    // 3. Front paws dancing up in the air (Disco Paw Wave!)
                    legFL.rotation.z = -0.35 + Math.sin(danceTempo) * 0.55;
                    legFR.rotation.z = -0.35 - Math.sin(danceTempo) * 0.55;
                    legFL.rotation.x = 0.45 + Math.cos(danceTempo * 0.5) * 0.35;
                    legFR.rotation.x = -0.45 - Math.cos(danceTempo * 0.5) * 0.35;
                    legFL.rotation.y = Math.sin(danceTempo) * 0.30;
                    legFR.rotation.y = -Math.sin(danceTempo) * 0.30;

                    // 4. Head bobbing enthusiastically
                    catHeadGroup.rotation.z = -1.25 + 0.10 + Math.sin(danceTempo) * 0.18;
                    catHeadGroup.rotation.y = Math.cos(danceTempo * 0.5) * 0.25;
                    catHeadGroup.rotation.x = Math.sin(danceTempo) * 0.12;

                    // 5. Ears bouncing happily
                    earL.rotation.x = -0.15 + Math.sin(danceTempo * 1.5) * 0.25;
                    earR.rotation.x = 0.15 - Math.sin(danceTempo * 1.5) * 0.25;

                    // 6. ENERGETIC SERPENTINE DANCE TAIL (Mueve la cola rítmicamente)
                    tailRoot.rotation.z = Math.sin(danceTempo) * 0.65;
                    tailRoot.rotation.y = Math.cos(danceTempo * 0.5) * 0.55;
                    tailSeg1.rotation.set(0, 0, Math.sin(danceTempo) * 0.45);
                    tailMid.rotation.set(Math.cos(danceTempo) * 0.35, 0, Math.sin(danceTempo + 1.2) * 0.65);
                    tailTipGroup.rotation.set(0, Math.sin(danceTempo) * 0.4, Math.sin(danceTempo + 2.4) * 0.85);

                    // 7. Glowing cyber-collar pulsating to beat
                    catBellLight.intensity = 0.5 + beat * 0.8;
                    catBellMat.color.setHSL((t * 0.8) % 1.0, 1.0, 0.55);
                }
                else if (catState === 'running_zoomies') {
                    catEyeL.scale.y = 1.0;
                    catEyeR.scale.y = 1.0;
                    catEyeMat.color.setHex(0x34d399);

                    // Running towards the toy ball!
                    const dx = toyPos.x - catRoot.position.x;
                    const dz = toyPos.z - catRoot.position.z;
                    const distToToy = Math.hypot(dx, dz);

                    if (distToToy > 0.42) {
                        const targetRotY = -Math.atan2(dz, dx);
                        catRoot.rotation.y = lerpAngle(catRoot.rotation.y, targetRotY, Math.min(1.0, dt * 10.0));

                        const runSpeed = 2.4;
                        const step = Math.min(distToToy, runSpeed * dt);
                        catRoot.position.x += (dx / distToToy) * step;
                        catRoot.position.z += (dz / distToToy) * step;

                        // High speed gallop bounding
                        runPhase += dt * 17.0;
                        catRoot.position.y = 0.16 + Math.abs(Math.sin(runPhase)) * 0.075;
                        catSpine.scale.x = 1.0 + Math.sin(runPhase) * 0.22;

                        legFL.rotation.z = Math.sin(runPhase) * 0.85;
                        legFR.rotation.z = Math.sin(runPhase + 0.2) * 0.85;
                        legBL.rotation.z = -Math.sin(runPhase) * 0.95;
                        legBR.rotation.z = -Math.sin(runPhase + 0.2) * 0.95;

                        // Sleek racing tail
                        tailRoot.rotation.set(0, 0, -0.15 + Math.sin(runPhase * 2) * 0.12);
                        tailMid.rotation.z = 0.15;
                        tailTipGroup.rotation.z = 0.2;

                        if (Math.random() < 0.25) spawnCatHearts(catRoot.position);
                    } else {
                        // Reached ball: prepare to hunt & pounce!
                        startHuntingWiggle();
                    }
                }
                else if (catState === 'hunting_wiggle') {
                    // Crouched hunting posture facing toy
                    const dx = toyPos.x - catRoot.position.x;
                    const dz = toyPos.z - catRoot.position.z;
                    const targetRotY = -Math.atan2(dz, dx);
                    catRoot.rotation.y = lerpAngle(catRoot.rotation.y, targetRotY, Math.min(1.0, dt * 9.0));

                    catRoot.position.y = 0.15;
                    catSpine.position.y = -0.055;
                    catSpine.scale.set(1.1, 0.9, 1.0);

                    // Front legs crouched, hind legs coiled
                    legFL.rotation.z = 0.35;
                    legFR.rotation.z = 0.35;
                    legBL.rotation.z = -0.45;
                    legBR.rotation.z = -0.45;

                    // Classic Cat Butt/Hip Wiggle!
                    const wT = stateElapsed;
                    catSpine.rotation.y = Math.sin(wT * 28.0) * 0.16;
                    tailRoot.rotation.set(0, 0, 0.35);
                    tailTipGroup.rotation.z = Math.sin(wT * 24.0) * 0.55;

                    if (stateElapsed > stateDuration) {
                        startPounce();
                    }
                }
                else if (catState === 'pouncing') {
                    const prog = Math.min(1.0, stateElapsed / stateDuration);

                    // Forward leap towards ball
                    const dx = toyPos.x - catRoot.position.x;
                    const dz = toyPos.z - catRoot.position.z;
                    const dist = Math.hypot(dx, dz);
                    if (dist > 0.05) {
                        catRoot.position.x += (dx / dist) * Math.min(dist, dt * 2.2);
                        catRoot.position.z += (dz / dist) * Math.min(dist, dt * 2.2);
                    }
                    catRoot.position.y = 0.15 + Math.sin(prog * Math.PI) * 0.12;

                    // Front right paw lightning swat!
                    legFR.rotation.z = Math.sin(prog * Math.PI) * 1.35;
                    legFL.rotation.z = 0.2;

                    // Contact moment (at 50% through pounce)
                    if (prog >= 0.45 && prog <= 0.65 && toyVel.lengthSq() < 0.2) {
                        playToyBounceSound();
                        const swatAngle = catRoot.rotation.y + (Math.random() - 0.5) * 1.2;
                        const impulse = 2.8 + Math.random() * 1.6;
                        toyVel.x = Math.cos(swatAngle) * impulse;
                        toyVel.y = -Math.sin(swatAngle) * impulse;
                        spawnCatHearts(toyPos);
                    }

                    if (prog >= 1.0) {
                        pounceCount++;
                        if (pounceCount < 3) {
                            // Immediately sprint after the rolling ball!
                            catState = 'running_zoomies';
                        } else {
                            pounceCount = 0;
                            catState = 'investigating';
                            stateStartTime = performance.now();
                            stateDuration = 4.0;
                            playCatPurr();
                        }
                    }
                }
                else if (catState === 'investigating') {
                    catRoot.position.y = 0.16;
                    catSpine.position.set(0, 0, 0);
                    catSpine.scale.set(1.0, 1.0, 1.0);
                    legFL.rotation.set(0, 0, 0);
                    legFR.rotation.set(0, 0, 0);
                    legBL.rotation.set(0, 0, 0);
                    legBR.rotation.set(0, 0, 0);

                    // Sniffing around, ears twitching, tail flicking
                    catHeadGroup.rotation.set(Math.sin(t * 2.2) * 0.08, Math.sin(t * 1.6) * 0.14, Math.sin(t * 2.8) * 0.05);
                    earL.rotation.x = -0.15 + Math.sin(t * 3.8) * 0.12;
                    earR.rotation.x = 0.15 + Math.cos(t * 3.2) * 0.12;
                    tailRoot.rotation.z = 0.45 + Math.sin(t * 2.0) * 0.18;

                    if (isCatVisitingDesk) {
                        // Looking up at EduBot
                        catHeadGroup.rotation.x = 0.38 + Math.sin(t * 2) * 0.05;
                    }

                    if (stateElapsed > stateDuration) {
                        catState = 'grooming';
                        stateStartTime = performance.now();
                        stateDuration = 4.2;
                    }
                }
                else if (catState === 'grooming') {
                    // Sits on haunches, washes face with front paw
                    catSpine.rotation.x = -0.22;
                    legBL.rotation.x = 0.9;
                    legBR.rotation.x = 0.9;

                    const groomT = stateElapsed * 3.5;
                    legFL.position.set(0.12, 0.07 + Math.sin(groomT) * 0.02, -0.03);
                    legFL.rotation.set(0.3, 0.5, 1.1 + Math.sin(groomT) * 0.2);

                    catHeadGroup.rotation.set(0.15, -0.18 + Math.sin(groomT) * 0.1, 0.1);
                    tailRoot.rotation.set(0.2, 0.8, -0.2);

                    if (stateElapsed > stateDuration) {
                        if (Math.random() < 0.45) {
                            sendCatToSleep();
                        } else {
                            startCatPlayActivity();
                        }
                    }
                }

                // Coffee Mug Elastic Spring Press Physical Animation
                if (coffeePressProg > 0) {
                    coffeePressProg = Math.max(0, coffeePressProg - dt * 4.5);
                    const pressOffset = Math.sin(coffeePressProg * Math.PI) * 0.024;
                    coffeeGroup.position.y = 1.052 - pressOffset;
                } else {
                    coffeeGroup.position.y = 1.052;
                }

                // DYNAMIC RGB CHROMA LIGHTING (Mechanical Keyboard, Ergonomic Mouse & XL Desk Mat)
                const rgbSpeed = isTurboActive ? 2.6 : 0.85;
                const baseHue = (t * rgbSpeed) % 1.0;

                // 1. XL Desk Mat RGB Fiber Optic Edge
                if (typeof deskMatRgbMat !== 'undefined' && deskMatRgbMat) {
                    deskMatRgbMat.color.setHSL(baseHue, 1.0, 0.52);
                }

                // 2. Keyboard Frosted Acrylic Underglow Diffuser
                if (typeof keyboardUnderglowRgbMat !== 'undefined' && keyboardUnderglowRgbMat) {
                    keyboardUnderglowRgbMat.color.setHSL((baseHue + 0.12) % 1.0, 1.0, 0.55);
                }

                // 3. Keyboard Sculpted Keycap Rows Wave
                if (typeof keyRowRgbMats !== 'undefined' && keyRowRgbMats.length) {
                    for (let r = 0; r < keyRowRgbMats.length; r++) {
                        const rowHue = (baseHue + r * 0.09) % 1.0;
                        keyRowRgbMats[r].color.setHSL(rowHue, 0.95, isTurboActive ? 0.65 : 0.50);
                    }
                }

                // 4. Mouse Base Halo Underglow, Illuminated Scroll Wheel & Palm Logo
                if (typeof mouseBaseRgbMat !== 'undefined' && mouseBaseRgbMat) {
                    const mouseHue = (baseHue + 0.45) % 1.0;
                    mouseBaseRgbMat.color.setHSL(mouseHue, 1.0, 0.55);
                    if (typeof mouseWheelRgbMat !== 'undefined' && mouseWheelRgbMat) mouseWheelRgbMat.color.setHSL((mouseHue + 0.15) % 1.0, 1.0, 0.60);
                    if (typeof mouseLogoRgbMat !== 'undefined' && mouseLogoRgbMat) mouseLogoRgbMat.color.setHSL((mouseHue + 0.25) % 1.0, 1.0, 0.55);
                }

                // Steam animation over espresso coffee mug
                const steamPos = steamGeo.attributes.position.array;
                const steamSpeed = isTurboActive ? 0.38 : 0.14;
                for (let i = 0; i < steamCount; i++) {
                    steamPos[i * 3 + 1] += dt * steamSpeed;
                    steamPos[i * 3] += Math.sin(t * 3.5 + steamPhases[i]) * 0.0008;
                    steamPos[i * 3 + 2] += Math.cos(t * 2.8 + steamPhases[i]) * 0.0008;
                    if (steamPos[i * 3 + 1] > 0.48) {
                        steamPos[i * 3 + 1] = 0.12;
                        steamPos[i * 3] = (Math.random() - 0.5) * 0.04;
                        steamPos[i * 3 + 2] = (Math.random() - 0.5) * 0.04;
                    }
                }
                steamGeo.attributes.position.needsUpdate = true;
                steamMat.opacity = isTurboActive ? 0.75 : 0.35;
                coasterGlowMat.color.setHex(isTurboActive ? 0x38bdf8 : 0xf59e0b);

                // Dust motes drifting
                dust.rotation.y = Math.sin(t * 0.05) * 0.08;
                dust.position.y = Math.sin(t * 0.3) * 0.08;
            }

            // Scenic window crossfade interpolation
            if (isCrossFading) {
                crossFadeProg += dt * 0.85;
                const p = Math.min(1.0, crossFadeProg);
                const ease = p * p * (3 - 2 * p); // smoothstep

                scenicMeshA.material.opacity = 1.0 - ease;
                scenicMeshB.material.opacity = ease;

                const curr = SCENIC_LOCATIONS[currentScenicIdx];
                const next = SCENIC_LOCATIONS[targetScenicIdx];

                colorLerpA.setHex(curr.sunColor);
                colorLerpB.setHex(next.sunColor);
                sunLight.color.copy(colorLerpA).lerp(colorLerpB, ease);
                sunLight.intensity = THREE.MathUtils.lerp(curr.sunIntensity, next.sunIntensity, ease);

                colorLerpA.setHex(curr.hemiSky);
                colorLerpB.setHex(next.hemiSky);
                hemiLight.color.copy(colorLerpA).lerp(colorLerpB, ease);

                colorLerpA.setHex(curr.hemiGround);
                colorLerpB.setHex(next.hemiGround);
                hemiLight.groundColor.copy(colorLerpA).lerp(colorLerpB, ease);

                if (dustMesh) {
                    colorLerpA.setHex(curr.dustColor);
                    colorLerpB.setHex(next.dustColor);
                    dustMesh.material.color.copy(colorLerpA).lerp(colorLerpB, ease);
                }

                colorLerpA.setHex(curr.beamColor);
                colorLerpB.setHex(next.beamColor);
                sunbeamMat.color.copy(colorLerpA).lerp(colorLerpB, ease);

                colorLerpA.setHex(curr.floorGlowColor);
                colorLerpB.setHex(next.floorGlowColor);
                windowFloorGlow.material.color.copy(colorLerpA).lerp(colorLerpB, ease);
                windowFloorGlow.material.opacity = THREE.MathUtils.lerp(curr.floorGlowOpacity, next.floorGlowOpacity, ease);

                if (crossFadeProg >= 1.0) {
                    crossFadeProg = 1.0;
                    isCrossFading = false;
                    currentScenicIdx = targetScenicIdx;
                    scenicMeshA.material.map = getScenicTexture(currentScenicIdx);
                    scenicMeshA.material.opacity = 1.0;
                    scenicMeshB.material.opacity = 0.0;
                }
            }

            // Living micro wind drift & optical 3D perspective parallax
            const windX = Math.sin(t * 0.28) * 0.038;
            const windY = Math.cos(t * 0.19) * 0.022;
            const camRelX = (camera.position.x - 0.6) * 0.045;
            const camRelY = (camera.position.y - 2.9) * 0.038;
            scenicGroup.position.set(0.6 + camRelX + windX, 2.9 + camRelY + windY, -5.8);

            // Volumetric sunbeam shaft pulse
            const currLoc = SCENIC_LOCATIONS[currentScenicIdx];
            const baseOp = currLoc.beamOpacity;
            const beamPulse = 0.9 + Math.sin(t * 1.5) * 0.12;
            sunbeamMat.opacity = baseOp * beamPulse;

            // Auto-tour timer check
            if (autoTourEnabled && !isCrossFading) {
                if (t - lastAutoTourTime > 14) {
                    lastAutoTourTime = t;
                    setScenicLocation(currentScenicIdx + 1);
                }
            }

            renderer.render(scene, camera);
            updateMarkers(t);

            if (!reduced) {
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

        // Automatic first-time welcome greeting after boot screen fades
        setTimeout(() => {
            if (window.eduRobotAssistant && window.eduRobotAssistant.triggerWelcomeGreeting) {
                window.eduRobotAssistant.triggerWelcomeGreeting();
            }
        }, 1600);

        return true;
    }

    window.EduRoomScene = { init };
})();
