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
        const scenicTextures = SCENIC_LOCATIONS.map((loc) => {
            const tex = textureLoader.load(loc.image);
            tex.encoding = THREE.sRGBEncoding;
            tex.anisotropy = Math.min(8, renderer ? renderer.capabilities.getMaxAnisotropy() : 8);
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.generateMipmaps = true;
            return tex;
        });

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
            map: scenicTextures[0],
            transparent: true,
            opacity: 1.0,
            depthWrite: false
        });
        const scenicMeshA = new THREE.Mesh(scenicGeo, scenicMatA);
        scenicMeshA.renderOrder = 0;
        scenicGroup.add(scenicMeshA);

        const scenicMatB = basic({
            map: scenicTextures[1],
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
                scenicMeshA.material.map = scenicTextures[nextIdx];
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
                scenicMeshA.material.map = scenicTextures[currentScenicIdx];
                scenicMeshA.material.opacity = 1.0;
            }

            targetScenicIdx = nextIdx;
            scenicMeshB.material.map = scenicTextures[targetScenicIdx];
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
           EXECUTIVE DESK WITH LED STRIP
        --------------------------------------------------------- */
        const desk = new THREE.Group();
        desk.position.set(0.2, 0, 0.25);
        scene.add(desk);

        addMesh(new THREE.BoxGeometry(3.3, 0.94, 1.3), std(0x2b2d34, 0.55, 0.15), [0, 0.47, 0], desk);
        addMesh(new THREE.BoxGeometry(3.7, 0.1, 1.72), std(0x111215, 0.3, 0.35), [0, 1.0, 0], desk);
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

        // Keyboard, mousepad, mouse, notebook right at the robot's workspace
        addMesh(new THREE.BoxGeometry(0.9, 0.035, 0.3), std(0xd9dbe1, 0.5, 0.05), [0.30, 1.068, -0.46], desk);
        for (let r = 0; r < 4; r++) {
            addMesh(new THREE.BoxGeometry(0.82, 0.012, 0.045), std(0xf4f4f5, 0.6), [0.30, 1.09, -0.54 + r * 0.056], desk, { cast: false });
        }
        // Sleek dark mousepad & ergonomic mouse right beside the keyboard
        addMesh(new THREE.BoxGeometry(0.30, 0.005, 0.32), std(0x181b24, 0.75, 0.3), [0.86, 1.053, -0.44], desk);
        addMesh(new THREE.BoxGeometry(0.11, 0.035, 0.17), std(0xd9dbe1, 0.45), [0.86, 1.068, -0.44], desk);
        // Executive notebook on desk left
        addMesh(new THREE.BoxGeometry(0.38, 0.02, 0.26), std(0x1e1f26, 0.8), [-1.15, 1.06, -0.38], desk, { rot: [0, 0.15, 0] });

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

            const isHappyOrDancing = expr === 'happy' || expr === 'dancing';
            const eyeColor = (expr === 'dancing' && (beatVal || 0) > 0.45) ? '#f472b6' : '#00f0ff';

            // Cheeks glow
            if (isHappyOrDancing) {
                ctx.save();
                ctx.fillStyle = 'rgba(244, 114, 182, 0.65)';
                ctx.shadowColor = '#f472b6';
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
            if (isHappyOrDancing) {
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
            } catch (e) {}
        }

        const robotBubbleEl = document.getElementById('edubot-speech-bubble');
        const robotBubbleText = document.getElementById('edubot-bubble-text');
        const robotBubbleBadge = document.getElementById('edubot-bubble-badge');
        const robotCloseBtn = document.getElementById('edubot-close-btn');
        const robotNextTipBtn = document.getElementById('edubot-next-tip-btn');
        const robotProfileBtn = document.getElementById('edubot-profile-btn');
        const robotMeetBtn = document.getElementById('edubot-meet-btn');

        function showTip(idx) {
            currentTipIdx = (idx % EDUBOT_TIPS.length + EDUBOT_TIPS.length) % EDUBOT_TIPS.length;
            const tip = EDUBOT_TIPS[currentTipIdx];
            if (robotBubbleBadge) robotBubbleBadge.textContent = tip.badge;
            if (robotBubbleText) robotBubbleText.innerHTML = tip.text;
            if (robotBubbleEl) robotBubbleEl.classList.remove('hidden');

            if (dismissTimer) clearTimeout(dismissTimer);
            dismissTimer = setTimeout(() => {
                hideBubble();
            }, 12000);
        }

        function hideBubble() {
            if (robotBubbleEl) robotBubbleEl.classList.add('hidden');
            if (dismissTimer) clearTimeout(dismissTimer);
        }

        function triggerGreeting() {
            isGreetingActive = true;
            greetingStartTime = performance.now();
            playRobotChirp();
            showTip(currentTipIdx);
        }

        function nextTip() {
            triggerGreeting();
            showTip(currentTipIdx + 1);
        }

        if (robotCloseBtn) robotCloseBtn.addEventListener('click', hideBubble);
        if (robotNextTipBtn) robotNextTipBtn.addEventListener('click', nextTip);
        if (robotProfileBtn) {
            robotProfileBtn.addEventListener('click', () => {
                api.focusStation('home');
            });
        }
        if (robotMeetBtn) {
            robotMeetBtn.addEventListener('click', () => {
                window.open('https://calendar.app.google/bLJvGyt2hxUdHTNG7', '_blank', 'noopener,noreferrer');
            });
        }

        window.eduRobotAssistant = {
            triggerGreeting,
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
        portrait.position.set(-5.97, 3.45, -3.25);
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
            } catch (e) {}
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
        pegboard.position.set(4.15, 2.9, -4.97);
        scene.add(pegboard);
        glowPlane(4.3, 2.9, '210,225,255', 0.85, [0, 0, -0.012], null, pegboard, true);
        addMesh(new THREE.BoxGeometry(3.1, 1.75, 0.05), std(0xffffff, 0.8, 0.1, { map: pegTex }), [0, 0, 0.025], pegboard, { station: 'credentials' });
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
                ctx.fillRect(0, 0, w, 110);

                // Clip slit cutout
                ctx.fillStyle = '#ffffff';
                roundRect(ctx, w / 2 - 40, 14, 80, 14, 7);
                ctx.fill();

                // Header tag
                ctx.font = '800 18px "JetBrains Mono", monospace';
                ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                ctx.textAlign = 'center';
                ctx.fillText(b.tag, w / 2, 82);

                // Circular avatar with Eduardo's photo
                const avatarCx = w / 2;
                const avatarCy = 230;
                const avatarR = 76;

                ctx.save();
                ctx.beginPath();
                ctx.arc(avatarCx, avatarCy, avatarR, 0, Math.PI * 2);
                ctx.clip();

                if (portraitImg && portraitImg.complete && portraitImg.naturalWidth > 0) {
                    const cropSize = 520;
                    const sx = Math.max(0, (portraitImg.naturalWidth - cropSize) / 2);
                    const sy = 80;
                    ctx.drawImage(portraitImg, sx, sy, cropSize, cropSize, avatarCx - avatarR, avatarCy - avatarR, avatarR * 2, avatarR * 2);
                } else {
                    ctx.fillStyle = '#e2e8f0';
                    ctx.fillRect(avatarCx - avatarR, avatarCy - avatarR, avatarR * 2, avatarR * 2);
                    ctx.fillStyle = b.c;
                    ctx.font = '800 36px "Plus Jakarta Sans", sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText('EC', avatarCx, avatarCy + 12);
                }
                ctx.restore();

                // Outer border in badge color
                ctx.beginPath();
                ctx.arc(avatarCx, avatarCy, avatarR, 0, Math.PI * 2);
                ctx.strokeStyle = b.c;
                ctx.lineWidth = 5;
                ctx.stroke();

                // Small active dot
                ctx.fillStyle = '#10b981';
                ctx.beginPath();
                ctx.arc(avatarCx + 52, avatarCy + 52, 13, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 3.5;
                ctx.stroke();

                // Company Name
                ctx.textAlign = 'center';
                ctx.fillStyle = '#0f172a';
                ctx.font = '900 32px "Plus Jakarta Sans", sans-serif';
                ctx.fillText(b.company, w / 2, 360);

                // Role / Position (High contrast deep tone)
                ctx.fillStyle = '#0f172a';
                ctx.font = '800 22px "JetBrains Mono", monospace';
                ctx.fillText(b.role, w / 2, 398);

                // Dates
                ctx.fillStyle = '#334155';
                ctx.font = '700 20px "JetBrains Mono", monospace';
                ctx.fillText(b.dates, w / 2, 436);

                // Key Scope / Clients
                ctx.fillStyle = '#64748b';
                ctx.font = '600 18px "Inter", sans-serif';
                ctx.fillText(b.scope, w / 2, 474);

                // Security Barcode at bottom
                ctx.fillStyle = '#0f172a';
                const barcodeY = 515;
                const barcodeH = 40;
                const seedBars = [3, 6, 2, 5, 8, 3, 2, 6, 3, 5, 2, 8, 5, 3, 6, 2, 3, 5, 8, 3, 6, 2, 5, 3, 4, 2, 7, 3];
                let curX = 60;
                seedBars.forEach((bw) => {
                    ctx.fillRect(curX, barcodeY, bw, barcodeH);
                    curX += bw + 5;
                });

                ctx.font = '700 15px "JetBrains Mono", monospace';
                ctx.fillStyle = '#64748b';
                ctx.fillText(`ID-PASS · ${b.company.slice(0, 4)}-${2026 - i}`, w / 2, 584);

                // Interactive cue button pill (Solid prominent accent pill)
                ctx.fillStyle = b.c;
                roundRect(ctx, 36, 616, w - 72, 56, 14);
                ctx.fill();

                ctx.font = '900 16px "JetBrains Mono", monospace';
                ctx.fillStyle = '#ffffff';
                ctx.fillText('↺ CLIC PARA VER PROYECTOS', w / 2, 652);

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

            const x = -1.15 + i * 0.46;
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
            }), [0, 0, 0.003], cardHolder, {
                cast: false,
                station: 'badge'
            });
            frontMesh.userData.badgeIndex = i;

            // Back face plane (facing backward)
            const backMesh = addMesh(new THREE.PlaneGeometry(0.33, 0.465), std(0xffffff, 0.6, 0, {
                map: backTex,
                emissive: 0xffffff,
                emissiveMap: backTex,
                emissiveIntensity: 0.32
            }), [0, 0, -0.003], cardHolder, {
                rot: [0, Math.PI, 0],
                cast: false,
                station: 'badge'
            });
            backMesh.userData.badgeIndex = i;

            // Acrylic dark core for realistic card thickness
            addMesh(new THREE.BoxGeometry(0.33, 0.465, 0.004), std(0x0a0d14, 0.4, 0.3), [0, 0, 0], cardHolder, { cast: false });

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
            } catch (e) {}
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

        const turntable = new THREE.Group();
        turntable.position.set(0.42, 0.78, 0);
        cabinet.add(turntable);
        addMesh(new THREE.BoxGeometry(0.85, 0.09, 0.6), std(0x2a2b31, 0.5, 0.3), [0, 0.045, 0], turntable, { station: 'music' });
        const vinyl = addMesh(new THREE.CylinderGeometry(0.23, 0.23, 0.02, 32), std(0x09090b, 0.25, 0.5), [-0.1, 0.1, 0], turntable, { station: 'music' });
        addMesh(new THREE.CylinderGeometry(0.075, 0.075, 0.022, 20), basic({ color: 0x1ed760 }), [-0.1, 0.102, 0], turntable, { cast: false });
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
           HOTSPOTS (DIAMOND MARKERS) & CAMERA TARGETS
        --------------------------------------------------------- */
        const UP = new THREE.Vector3(0, 1, 0);
        const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
        const HOTSPOTS = [
            { id: 'projects', code: '01', label: 'Proyectos', anchor: [-0.38, 2.2, 0.13], target: [-0.38, 1.75, 0.13], normal: [Math.sin(0.32), 0, Math.cos(0.32)], dist: 2.2, lift: 0.05 },
            { id: 'credentials', code: '02', label: 'Credenciales', anchor: [4.15, 3.8, -4.85], target: [4.15, 2.55, -4.95], normal: [0, 0, 1], dist: 2.8, lift: 0.0 },
            { id: 'home', code: '03', label: 'Perfil', anchor: [0.50, 2.1, -0.74], target: [0.50, 1.45, -0.74], normal: [0.35, 0.15, 0.93], dist: 2.4, lift: 0.1 },
            { id: 'contact', code: '04', label: 'Contacto', anchor: [1.44, 1.84, 0.15], target: [1.44, 1.50, 0.15], normal: [0, 0.04, 0.999], dist: 1.12, lift: 0.0 },
            { id: 'arcade', code: '05', label: 'Edu Tetris', anchor: [-5.05, 2.2, -4.05], target: [-5.05, 1.36, -4.05], normal: [0.707, 0, 0.707], dist: 2.45, lift: 0.0 },
            { id: 'music', code: '06', label: 'Música IA', anchor: [3.9, 1.8, -4.5], target: [3.9, 1.15, -4.5], normal: [-0.1, 0.5, 0.86], dist: 1.8, lift: 0.2 },
            { id: 'cv', code: '2D', label: 'Ver Portafolio 2D', anchor: [-0.05, 1.48, 0.71], target: [-0.05, 1.07, 0.71], normal: [0, 0.85, 0.52], dist: 1.25, lift: 0.25 },
            { id: 'certifications', code: '07', label: 'Certificaciones', anchor: [-5.2, 3.9, 1.05], target: [-5.96, 2.85, 1.05], normal: [1, 0, 0], dist: 3.2, lift: 0.0 }
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
                    if (id === 'robot') {
                        if (window.eduRobotAssistant) {
                            window.eduRobotAssistant.triggerGreeting();
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
                }
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

            camera.position.lerp(desiredPos, k);
            currentLook.lerp(desiredLook, k);
            camera.lookAt(currentLook);

            if (!reduced) {
                // Speaker pulse & vinyl spin synchronized with Spotify player
                const isAudioPlaying = window.eduMusicState && window.eduMusicState.isPlaying;
                let beat = 0;
                if (isAudioPlaying) {
                    beat = (window.eduMusicState.getBeat ? window.eduMusicState.getBeat() : Math.pow(Math.max(0, Math.sin(t * 6.8)), 6));
                    ringOuter.scale.setScalar(1 + beat * 0.22);
                    ringInner.scale.setScalar(1 + beat * 0.36);
                    if (ringSpotify) ringSpotify.scale.setScalar(1 + beat * 0.26);
                    vinyl.rotation.y += dt * 4.2;
                    speakerLight.intensity = 0.55 + beat * 0.8;
                    if (speakerGreenLight) speakerGreenLight.intensity = 0.55 + beat * 0.9;
                    if (albumJacket) albumJacket.position.y = 0.94 + Math.sin(t * 3.5) * 0.005;
                } else {
                    ringOuter.scale.setScalar(1.0);
                    ringInner.scale.setScalar(1.0);
                    if (ringSpotify) ringSpotify.scale.setScalar(1.0);
                    vinyl.rotation.y += dt * 0.35;
                    speakerLight.intensity = 0.25;
                    if (speakerGreenLight) speakerGreenLight.intensity = 0.2;
                    if (albumJacket) albumJacket.position.y = 0.94;
                }

                // ROBOT ANIMATIONS: GREETING WAVE, DANCING WITH MUSIC, OR IDLE TYPING
                const nowMs = performance.now();
                const isGreetingNow = (nowMs - greetingStartTime) < GREETING_DURATION;

                // Face expression & Blinking logic
                let expr = 'normal';
                if (isGreetingNow) {
                    expr = 'happy';
                } else if (isAudioPlaying) {
                    expr = 'dancing';
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

                if (isGreetingNow) {
                    const waveT = (nowMs - greetingStartTime) / 1000;
                    const raiseProg = Math.min(1.0, waveT * 3.5);
                    const lowerProg = Math.max(0, (waveT - (GREETING_DURATION / 1000 - 0.6)) * 2.5);
                    const armBlend = Math.max(0, raiseProg - lowerProg);

                    // Wave right arm enthusiastically
                    armR.rotation.x = THREE.MathUtils.lerp(-1.2, 0.45, armBlend);
                    armR.rotation.z = THREE.MathUtils.lerp(0.12, 0.85 + Math.sin(waveT * 13) * 0.32, armBlend);
                    armR.rotation.y = THREE.MathUtils.lerp(0, Math.sin(waveT * 7) * 0.15, armBlend);

                    // Head turns toward user/camera and tilts cutely
                    head.rotation.y = THREE.MathUtils.lerp(Math.sin(t * 0.6) * 0.18, -0.28 + Math.sin(waveT * 4) * 0.08, armBlend);
                    head.rotation.z = Math.sin(waveT * 5) * 0.08 * armBlend;
                    head.rotation.x = Math.sin(waveT * 3) * 0.04 * armBlend;
                    head.position.y = 1.62 + Math.sin(waveT * 4) * 0.015;

                    // Left arm grooves if music, else types
                    if (isAudioPlaying) {
                        armL.rotation.x = -0.9 + Math.sin(t * 7.2) * 0.45;
                        armL.rotation.z = -0.35 + Math.sin(t * 3.6) * 0.15;
                        armL.rotation.y = 0;
                    } else {
                        // Left hand continues typing keystrokes over keyboard
                        armL.rotation.x = -1.18 + Math.sin(t * 20) * 0.04;
                        armL.rotation.z = -0.16 + Math.sin(t * 3) * 0.02;
                        armL.rotation.y = 0.12;
                    }
                    antennaTipL.scale.setScalar(1.2 + Math.sin(waveT * 8) * 0.3);
                    antennaTipR.scale.setScalar(1.2 + Math.sin(waveT * 8 + 1.5) * 0.3);
                    chestLed.visible = Math.sin(t * 6) > -0.3;

                } else if (isAudioPlaying) {
                    // DANCING ROUTINE TO THE BEAT
                    robot.position.y = Math.abs(Math.sin(t * 7.2)) * 0.038 * (0.6 + beat * 0.6);

                    // Head bobbing & grooving with rhythm
                    head.position.y = 1.62 + Math.abs(Math.sin(t * 7.2)) * 0.045;
                    head.rotation.x = Math.sin(t * 7.2) * 0.14;
                    head.rotation.z = Math.sin(t * 3.6) * 0.14;
                    head.rotation.y = Math.sin(t * 1.8) * 0.22;

                    // DJ arms pumping
                    if (beat > 0.65) {
                        // Hands in the air on heavy drops!
                        armL.rotation.x = 0.35 + beat * 0.35;
                        armL.rotation.z = -0.65;
                        armR.rotation.x = 0.35 + beat * 0.35;
                        armR.rotation.z = 0.65;
                        armR.rotation.y = 0;
                    } else {
                        // Alternating DJ groove
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
                    // DYNAMIC WORK & TYPING AT KEYBOARD
                    // Natural cycle: bursts of rapid keyboard keystrokes alternating with pauses to inspect the monitor & move the mouse
                    robot.position.y = 0;
                    const workCycle = (t % 5.8);
                    const isTyping = workCycle < 3.8;

                    if (isTyping) {
                        // Rapid alternating fingertip/wrist typing oscillations over the keys
                        const strokeL = Math.sin(t * 22) * 0.045 + Math.sin(t * 37) * 0.022;
                        const strokeR = Math.sin(t * 24 + 1.8) * 0.045 + Math.sin(t * 33 + 0.9) * 0.022;
                        const keyDriftX = Math.sin(t * 3.2) * 0.035;

                        armL.rotation.x = -1.18 + strokeL;
                        armL.rotation.z = -0.16 + keyDriftX;
                        armL.rotation.y = 0.12 + Math.sin(t * 2.8) * 0.03;

                        armR.rotation.x = -1.18 + strokeR;
                        armR.rotation.z = 0.16 + keyDriftX;
                        armR.rotation.y = -0.12 - Math.sin(t * 2.8) * 0.03;

                        // Head focused down towards keyboard keys
                        head.rotation.x = 0.14 + Math.sin(t * 11) * 0.012;
                        head.rotation.y = -0.18 + Math.sin(t * 2.5) * 0.04;
                        head.rotation.z = Math.sin(t * 4) * 0.018;
                        head.position.y = 1.62 + Math.sin(t * 5.5) * 0.005;
                    } else {
                        // Pause typing to inspect monitor screen / use mouse
                        const inspectT = workCycle - 3.8;
                        const useMouse = inspectT > 0.6 && inspectT < 1.6;

                        // Left hand rests lightly over home-row keys
                        armL.rotation.x = -1.14 + Math.sin(t * 2) * 0.008;
                        armL.rotation.z = -0.15;
                        armL.rotation.y = 0.10;

                        if (useMouse) {
                            // Right hand shifts over to the mouse beside the keyboard
                            armR.rotation.x = -1.14 + Math.sin(t * 14) * 0.018; // mouse clicks
                            armR.rotation.z = 0.28 + Math.sin(t * 3) * 0.025; // over mousepad
                            armR.rotation.y = -0.05;
                        } else {
                            // Right hand rests above keys
                            armR.rotation.x = -1.14 + Math.sin(t * 2) * 0.008;
                            armR.rotation.z = 0.15;
                            armR.rotation.y = -0.10;
                        }

                        // Head turns slightly toward monitor screen to review code
                        head.rotation.x = -0.06 + Math.sin(t * 1.5) * 0.015;
                        head.rotation.y = -0.32 + Math.sin(t * 1.8) * 0.025;
                        head.rotation.z = 0.02;
                        head.position.y = 1.622 + Math.sin(t * 2) * 0.004;
                    }

                    antennaTipL.scale.setScalar(1 + Math.sin(t * 3.5) * 0.18);
                    antennaTipR.scale.setScalar(1 + Math.sin(t * 3.5 + 1.5) * 0.18);
                    chestLed.visible = Math.sin(t * 4.5) > -0.35;
                }

                updateRobotBubble();

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
                cat.scale.y = 1 + Math.sin(t * 1.6) * 0.03;
                tail.rotation.z = 0.9 + Math.sin(t * 1.1) * 0.15;

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
                    scenicMeshA.material.map = scenicTextures[currentScenicIdx];
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
