/* =================================================================
   EDU TETRIS ARCADE — NEXT-GEN ENGINE, CRYSTAL TEXTURES & AUDIO
================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    // Canvas & Context
    const canvas = document.getElementById('tetris');
    const context = canvas.getContext('2d');
    const scoreElement = document.getElementById('score');
    const highScoreElement = document.getElementById('high-score');
    const levelElement = document.getElementById('level');
    const linesElement = document.getElementById('lines');
    const finalScoreElement = document.getElementById('final-score');
    const highScoreMsg = document.getElementById('high-score-msg');
    const nextPiecesContainer = document.getElementById('next-pieces');
    const holdCanvas = document.getElementById('hold-piece');
    const holdContext = holdCanvas.getContext('2d');
    const toastBadge = document.getElementById('toast-badge');

    // UI Overlays
    const startScreen = document.getElementById('start-screen');
    const pauseScreen = document.getElementById('pause-screen');
    const gameOverScreen = document.getElementById('game-over-screen');
    const startBtn = document.getElementById('start-btn');
    const resumeBtn = document.getElementById('resume-btn');
    const playAgainBtn = document.getElementById('play-again-btn');

    // Audio Elements
    const muteBtn = document.getElementById('mute-btn');
    const quickMuteBtn = document.getElementById('quick-mute');
    const volDownBtn = document.getElementById('vol-down-btn');
    const volUpBtn = document.getElementById('vol-up-btn');
    const volDisplay = document.getElementById('vol-display');
    const musicTrackBtns = document.querySelectorAll('.music-track-btn');

    // =================================================================
    // HIGH-FIDELITY WEB AUDIO SYNTHESIZER ENGINE
    // =================================================================
    let audioCtx = null;
    function getAudioCtx() {
        if (!audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) audioCtx = new AudioContext();
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        return audioCtx;
    }

    // Sound FX volume
    let volume = 0.55;
    let currentTrack = 0;
    let isMuted = false;

    // Advanced Synthesizer Sound Generator
    function playEnhancedSound(type, extra = 0) {
        if (isMuted) return;
        const ctx = getAudioCtx();
        if (!ctx) return;

        const now = ctx.currentTime;
        const masterGain = ctx.createGain();
        masterGain.connect(ctx.destination);
        masterGain.gain.setValueAtTime(volume * 0.45, now);

        if (type === 'move') {
            // Snappy arcade blip with stereo feel
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(260, now + 0.04);
            gain.gain.setValueAtTime(0.5, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.04);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(now);
            osc.stop(now + 0.045);
        } else if (type === 'rotate') {
            // Futuristic laser twirl
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(320, now);
            osc.frequency.exponentialRampToValueAtTime(740, now + 0.08);
            gain.gain.setValueAtTime(0.6, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(now);
            osc.stop(now + 0.085);
        } else if (type === 'drop') {
            // Sub-bass punch thud
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(140, now);
            osc.frequency.exponentialRampToValueAtTime(38, now + 0.12);
            gain.gain.setValueAtTime(0.9, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(now);
            osc.stop(now + 0.13);
        } else if (type === 'hardDrop') {
            // Heavy cyber impact with snap
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain = ctx.createGain();

            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(200, now);
            osc1.frequency.exponentialRampToValueAtTime(30, now + 0.18);

            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(600, now);
            osc2.frequency.exponentialRampToValueAtTime(80, now + 0.08);

            gain.gain.setValueAtTime(1.0, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(masterGain);

            osc1.start(now);
            osc2.start(now);
            osc1.stop(now + 0.19);
            osc2.stop(now + 0.19);
        } else if (type === 'hold') {
            // Ethereal dual-tone swap
            [523.25, 783.99].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + i * 0.03);
                gain.gain.setValueAtTime(0.5, now + i * 0.03);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.14);
                osc.connect(gain);
                gain.connect(masterGain);
                osc.start(now + i * 0.03);
                osc.stop(now + 0.15);
            });
        } else if (type === 'clear') {
            // Harmonic rising chord chime
            const baseNotes = [523.25, 659.25, 783.99, 1046.50];
            const count = Math.min(4, Math.max(1, extra));
            for (let i = 0; i < count; i++) {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(baseNotes[i], now + i * 0.05);
                gain.gain.setValueAtTime(0.7, now + i * 0.05);
                gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.05 + 0.28);
                osc.connect(gain);
                gain.connect(masterGain);
                osc.start(now + i * 0.05);
                osc.stop(now + i * 0.05 + 0.3);
            }
        } else if (type === 'tetris') {
            // Epic triumphant 4-line fanfare
            const fanfare = [523.25, 659.25, 783.99, 1046.50, 1318.51];
            fanfare.forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(freq, now + idx * 0.06);
                gain.gain.setValueAtTime(0.6, now + idx * 0.06);
                gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.06 + 0.4);
                osc.connect(gain);
                gain.connect(masterGain);
                osc.start(now + idx * 0.06);
                osc.stop(now + idx * 0.06 + 0.42);
            });
        } else if (type === 'combo') {
            // Incremental combo chime
            const pitch = 330 * Math.pow(1.12, Math.min(10, extra));
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(pitch, now);
            gain.gain.setValueAtTime(0.7, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(now);
            osc.stop(now + 0.22);
        } else if (type === 'gameover') {
            // Sad descending cadence
            [392, 349.23, 311.13, 261.63].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(freq, now + i * 0.12);
                gain.gain.setValueAtTime(0.5, now + i * 0.12);
                gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.12 + 0.35);
                osc.connect(gain);
                gain.connect(masterGain);
                osc.start(now + i * 0.12);
                osc.stop(now + i * 0.12 + 0.38);
            });
        }
    }

    // Audio file tracks for background music
    const musicTracks = [
        new Audio(encodeURI('music/Cruzando Cielos.mp3')),
        new Audio(encodeURI('music/Opa Amor.mp3')),
        new Audio(encodeURI('music/Together.mp3'))
    ];
    musicTracks.forEach(track => {
        track.loop = true;
        track.preload = 'auto';
    });

    function updateVolumeDisplay() {
        const displayVal = isMuted ? '0' : Math.round(volume * 10);
        if (volDisplay) volDisplay.textContent = displayVal;
        const icon = isMuted || volume === 0 ? '🔇' : '🔊';
        if (muteBtn) muteBtn.textContent = icon;
        if (quickMuteBtn) quickMuteBtn.textContent = icon;

        musicTracks.forEach(track => {
            track.volume = isMuted ? 0 : volume * 0.65;
        });
    }

    function startCurrentMusic() {
        if (isMuted) return;
        musicTracks.forEach((track, i) => {
            if (i !== currentTrack) {
                track.pause();
                track.currentTime = 0;
            }
        });
        const targetTrack = musicTracks[currentTrack];
        if (targetTrack) {
            targetTrack.volume = volume * 0.65;
            targetTrack.play().catch(() => {});
        }
    }

    function stopMusic() {
        musicTracks.forEach(track => track.pause());
    }

    function toggleMute() {
        isMuted = !isMuted;
        updateVolumeDisplay();
        if (isMuted) {
            stopMusic();
        } else if (!paused && !gameOver && piece) {
            startCurrentMusic();
        }
    }

    if (muteBtn) muteBtn.addEventListener('click', toggleMute);
    if (quickMuteBtn) quickMuteBtn.addEventListener('click', toggleMute);

    if (volUpBtn) {
        volUpBtn.addEventListener('click', () => {
            volume = Math.min(1, Math.round((volume + 0.1) * 10) / 10);
            if (isMuted) isMuted = false;
            updateVolumeDisplay();
        });
    }

    if (volDownBtn) {
        volDownBtn.addEventListener('click', () => {
            volume = Math.max(0, Math.round((volume - 0.1) * 10) / 10);
            updateVolumeDisplay();
        });
    }

    musicTrackBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const trackIndex = parseInt(btn.dataset.track, 10);
            musicTrackBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            if (currentTrack !== trackIndex) {
                musicTracks[currentTrack].pause();
                musicTracks[currentTrack].currentTime = 0;
                currentTrack = trackIndex;
                if (!isMuted && !gameOver && !paused) {
                    startCurrentMusic();
                }
            }
        });
    });

    // =================================================================
    // RESPONSIVE SIZING & BOARD GEOMETRY
    // =================================================================
    const COLS = 12;
    const ROWS = 22;
    let BLOCK_SIZE = 30;

    function resizeBoard() {
        const availableHeight = Math.max(380, window.innerHeight - 170);
        const availableWidth = Math.max(260, Math.min(window.innerWidth - 40, 480));

        const blockSizeFromHeight = Math.floor(availableHeight / ROWS);
        const blockSizeFromWidth = Math.floor(availableWidth / (COLS + 2));

        BLOCK_SIZE = Math.max(18, Math.min(34, Math.min(blockSizeFromHeight, blockSizeFromWidth)));

        canvas.width = COLS * BLOCK_SIZE;
        canvas.height = ROWS * BLOCK_SIZE;

        holdCanvas.width = 4 * BLOCK_SIZE;
        holdCanvas.height = 4 * BLOCK_SIZE;
    }

    window.addEventListener('resize', () => {
        resizeBoard();
        draw();
    });
    resizeBoard();

    // =================================================================
    // GAME STATE & HIGH SCORE
    // =================================================================
    let board = createBoard(COLS, ROWS);
    let score = 0;
    let level = 1;
    let linesCleared = 0;
    let combo = 0;
    let gameOver = false;
    let paused = false;
    let animationFrameId = null;

    let highScore = parseInt(localStorage.getItem('edu_tetris_highscore') || '0', 10);
    if (highScoreElement) highScoreElement.textContent = highScore;

    // Screenshake & Laser Trail FX
    let screenShake = 0;
    let laserBeams = [];
    let lineShockwaves = [];
    let particles = [];
    let stars = [];

    function addScreenShake(amount) {
        screenShake = Math.max(screenShake, amount);
    }

    function initStars() {
        stars = [];
        for (let i = 0; i < 50; i++) {
            stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 2 + 0.8,
                speed: Math.random() * 0.4 + 0.15,
                opacity: Math.random() * 0.7 + 0.2
            });
        }
    }
    initStars();

    function showToast(text, color = '#ff007f') {
        if (!toastBadge) return;
        toastBadge.textContent = text;
        toastBadge.style.borderColor = color;
        toastBadge.style.boxShadow = `0 0 35px ${color}`;
        toastBadge.classList.add('show');
        setTimeout(() => toastBadge.classList.remove('show'), 950);
    }

    function createBoard(cols, rows) {
        return Array.from({ length: rows }, () => Array(cols).fill(0));
    }

    // =================================================================
    // HIGH-DEFINITION CRYSTAL & NEON PALETTE
    // =================================================================
    const PIECES = [
        // Standard Tetrominoes
        [[1, 1, 1, 1]],                    // I (Cyan Crystal)
        [[1, 1, 1], [0, 1, 0]],            // T (Amethyst Purple)
        [[1, 1, 0], [0, 1, 1]],            // Z (Ruby Red)
        [[0, 1, 1], [1, 1, 0]],            // S (Emerald Lime)
        [[1, 1], [1, 1]],                  // O (Solar Topaz)
        [[1, 0, 0], [1, 1, 1]],            // L (Amber Fire)
        [[0, 0, 1], [1, 1, 1]],            // J (Sapphire Blue)
        // Bonus Arcade Pieces
        [[1, 1, 1, 1, 1]],                 // Super I (Neon Magenta)
        [[0, 1, 0], [1, 1, 1], [0, 1, 0]], // Cruz / Cross (Imperial Gold)
        [[1, 1, 1], [1, 0, 1]],            // U shape (Beryl Green)
        [[1]]                              // Spark / Dot (Prismatic White)
    ];

    const COLORS = [
        null,
        '#00f0ff', // 1: Cyan
        '#b026ff', // 2: Amethyst Purple
        '#ff1a53', // 3: Ruby Red
        '#00ff88', // 4: Emerald Green
        '#ffe600', // 5: Solar Yellow
        '#ff8400', // 6: Amber Orange
        '#2563eb', // 7: Sapphire Blue
        '#ff00b7', // 8: Neon Magenta
        '#ffd700', // 9: Gold
        '#059669', // 10: Deep Emerald
        '#f8fafc'  // 11: Prismatic White
    ];

    let piece = null;
    let nextPieces = [];
    let heldPiece = null;
    let canHold = true;
    let lastMoveWasRotate = false;

    function getRandomPiece() {
        const rand = Math.floor(Math.random() * PIECES.length);
        return {
            matrix: PIECES[rand],
            color: COLORS[rand + 1],
            colorIndex: rand + 1,
            pos: {
                x: Math.floor(COLS / 2) - Math.floor(PIECES[rand][0].length / 2),
                y: 0
            }
        };
    }

    function fillNextPieces() {
        while (nextPieces.length < 3) {
            nextPieces.push(getRandomPiece());
        }
    }

    function resetPlayer() {
        fillNextPieces();
        piece = nextPieces.shift();
        fillNextPieces();
        drawNextPieces();
        lastMoveWasRotate = false;
        canHold = true;

        if (collides(board, piece)) {
            gameOver = true;
            showGameOverScreen();
        }
    }

    // =================================================================
    // ULTRA-HIGH QUALITY BLOCK TEXTURE RENDERER
    // =================================================================
    function hexToRgb(hex) {
        if (!hex) return { r: 255, g: 255, b: 255 };
        const clean = hex.replace('#', '');
        const num = parseInt(clean, 16);
        return {
            r: (num >> 16) & 255,
            g: (num >> 8) & 255,
            b: num & 255
        };
    }

    function drawCrystalBlock(ctx, x, y, size, colorHex, isGhost = false) {
        const px = x * size;
        const py = y * size;

        if (isGhost) {
            ctx.save();
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.45)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 3]);
            ctx.strokeRect(px + 1.5, py + 1.5, size - 3, size - 3);
            ctx.fillStyle = 'rgba(0, 240, 255, 0.07)';
            ctx.fillRect(px + 1.5, py + 1.5, size - 3, size - 3);
            ctx.restore();
            return;
        }

        const rgb = hexToRgb(colorHex);

        // 1. Outer Bevel & Base Gradient
        const outerGrad = ctx.createLinearGradient(px, py, px + size, py + size);
        outerGrad.addColorStop(0, `rgb(${Math.min(255, rgb.r + 90)}, ${Math.min(255, rgb.g + 90)}, ${Math.min(255, rgb.b + 90)})`);
        outerGrad.addColorStop(0.35, colorHex);
        outerGrad.addColorStop(1, `rgb(${Math.max(0, rgb.r - 80)}, ${Math.max(0, rgb.g - 80)}, ${Math.max(0, rgb.b - 80)})`);

        ctx.fillStyle = outerGrad;
        ctx.fillRect(px + 1, py + 1, size - 2, size - 2);

        // 2. Crystal Core Inset Facet
        const inset = Math.max(3, Math.floor(size * 0.16));
        const innerGrad = ctx.createRadialGradient(
            px + size * 0.4, py + size * 0.35, 1,
            px + size * 0.5, py + size * 0.5, size * 0.65
        );
        innerGrad.addColorStop(0, `rgba(255, 255, 255, 0.7)`);
        innerGrad.addColorStop(0.2, colorHex);
        innerGrad.addColorStop(1, `rgba(${Math.max(0, rgb.r - 95)}, ${Math.max(0, rgb.g - 95)}, ${Math.max(0, rgb.b - 95)}, 0.95)`);

        ctx.fillStyle = innerGrad;
        ctx.fillRect(px + inset, py + inset, size - inset * 2, size - inset * 2);

        // 3. Diagonal Gloss Glare
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(px + 2, py + 2);
        ctx.lineTo(px + size - 2, py + 2);
        ctx.lineTo(px + 2, py + size - 2);
        ctx.closePath();
        const glare = ctx.createLinearGradient(px, py, px + size * 0.5, py + size * 0.5);
        glare.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
        glare.addColorStop(0.5, 'rgba(255, 255, 255, 0.12)');
        glare.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = glare;
        ctx.fill();
        ctx.restore();

        // 4. Center Micro Jewel Emblem
        const centerSize = Math.max(2, Math.floor(size * 0.18));
        ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
        ctx.fillRect(
            px + Math.floor((size - centerSize) / 2),
            py + Math.floor((size - centerSize) / 2),
            centerSize,
            centerSize
        );

        // 5. Crisp Neon Edge Rim
        ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.85)`;
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
    }

    function drawMatrix(matrix, offset, ctx, blockSize, colorHex = null, isGhost = false) {
        matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    const blockColor = colorHex || COLORS[value];
                    drawCrystalBlock(ctx, x + offset.x, y + offset.y, blockSize, blockColor, isGhost);
                }
            });
        });
    }

    function drawGhostPiece() {
        if (!piece) return;
        const ghost = {
            ...piece,
            pos: { ...piece.pos }
        };
        while (!collides(board, ghost)) {
            ghost.pos.y++;
        }
        ghost.pos.y--;
        drawMatrix(ghost.matrix, ghost.pos, context, BLOCK_SIZE, null, true);
    }

    function drawNextPieces() {
        if (!nextPiecesContainer) return;
        nextPiecesContainer.innerHTML = '';

        nextPieces.slice(0, 2).forEach(p => {
            const pCanvas = document.createElement('canvas');
            const previewSize = Math.max(14, Math.floor(BLOCK_SIZE * 0.68));
            pCanvas.width = 4 * previewSize;
            pCanvas.height = 3 * previewSize;

            const pCtx = pCanvas.getContext('2d');
            pCtx.fillStyle = '#060812';
            pCtx.fillRect(0, 0, pCanvas.width, pCanvas.height);

            const w = p.matrix[0].length;
            const h = p.matrix.length;
            const offsetX = (4 - w) / 2;
            const offsetY = (3 - h) / 2;

            drawMatrix(p.matrix, { x: offsetX, y: offsetY }, pCtx, previewSize, p.color);
            nextPiecesContainer.appendChild(pCanvas);
        });
    }

    function drawHoldPiece() {
        if (!holdContext) return;
        holdContext.fillStyle = '#060812';
        holdContext.fillRect(0, 0, holdCanvas.width, holdCanvas.height);

        if (heldPiece) {
            const previewSize = Math.max(14, Math.floor(BLOCK_SIZE * 0.68));
            const w = heldPiece.matrix[0].length;
            const h = heldPiece.matrix.length;
            const offsetX = (holdCanvas.width / previewSize - w) / 2;
            const offsetY = (holdCanvas.height / previewSize - h) / 2;

            drawMatrix(heldPiece.matrix, { x: offsetX, y: offsetY }, holdContext, previewSize, heldPiece.color);
        }
    }

    // Spark Burst Generator
    function createSparks(x, y, colorHex, count = 20) {
        const rgb = hexToRgb(colorHex);
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 5 + 2;
            particles.push({
                x: (x + 0.5) * BLOCK_SIZE,
                y: (y + 0.5) * BLOCK_SIZE,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 1.2,
                size: Math.random() * 4 + 1.5,
                color: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b},`,
                life: 1.0,
                decay: Math.random() * 0.035 + 0.02
            });
        }
    }

    // Hard Drop Laser Effect
    function addLaserBeam(colX, startY, endY, colorHex) {
        laserBeams.push({
            x: colX * BLOCK_SIZE,
            width: BLOCK_SIZE,
            startY: startY * BLOCK_SIZE,
            endY: (endY + 1) * BLOCK_SIZE,
            alpha: 0.9,
            color: colorHex
        });
    }

    // Shockwave Line Flash
    function addLineShockwave(rowY) {
        lineShockwaves.push({
            y: rowY * BLOCK_SIZE,
            alpha: 1.0,
            thickness: BLOCK_SIZE
        });
    }

    // =================================================================
    // MAIN DRAW LOOP WITH SCREEN SHAKE & EFFECTS
    // =================================================================
    function draw() {
        context.save();

        // 1. Apply Screen Shake
        if (screenShake > 0) {
            const dx = (Math.random() - 0.5) * screenShake;
            const dy = (Math.random() - 0.5) * screenShake;
            context.translate(dx, dy);
            screenShake *= 0.86;
            if (screenShake < 0.2) screenShake = 0;
        }

        // 2. Clear Board Canvas
        context.fillStyle = '#060812';
        context.fillRect(0, 0, canvas.width, canvas.height);

        // 3. Ambient Grid Lines
        context.strokeStyle = 'rgba(0, 240, 255, 0.05)';
        context.lineWidth = 0.5;
        for (let c = 0; c <= COLS; c++) {
            context.beginPath();
            context.moveTo(c * BLOCK_SIZE, 0);
            context.lineTo(c * BLOCK_SIZE, canvas.height);
            context.stroke();
        }
        for (let r = 0; r <= ROWS; r++) {
            context.beginPath();
            context.moveTo(0, r * BLOCK_SIZE);
            context.lineTo(canvas.width, r * BLOCK_SIZE);
            context.stroke();
        }

        // 4. Moving Stars
        stars.forEach(s => {
            s.y += s.speed;
            if (s.y > canvas.height) {
                s.y = 0;
                s.x = Math.random() * canvas.width;
            }
            context.fillStyle = `rgba(0, 240, 255, ${s.opacity})`;
            context.fillRect(s.x, s.y, s.size, s.size);
        });

        // 5. Draw Laser Beams
        for (let i = laserBeams.length - 1; i >= 0; i--) {
            const b = laserBeams[i];
            const rgb = hexToRgb(b.color);
            context.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${b.alpha * 0.35})`;
            context.fillRect(b.x, b.startY, b.width, b.endY - b.startY);
            b.alpha -= 0.12;
            if (b.alpha <= 0) laserBeams.splice(i, 1);
        }

        // 6. Draw Ghost Piece
        if (piece) {
            drawGhostPiece();
        }

        // 7. Settled Blocks
        drawMatrix(board, { x: 0, y: 0 }, context, BLOCK_SIZE);

        // 8. Active Piece
        if (piece) {
            drawMatrix(piece.matrix, piece.pos, context, BLOCK_SIZE, piece.color);
        }

        // 9. Shockwave Lines on Clear
        for (let i = lineShockwaves.length - 1; i >= 0; i--) {
            const sw = lineShockwaves[i];
            context.fillStyle = `rgba(255, 255, 255, ${sw.alpha * 0.85})`;
            context.fillRect(0, sw.y, canvas.width, sw.thickness);
            sw.alpha -= 0.14;
            if (sw.alpha <= 0) lineShockwaves.splice(i, 1);
        }

        // 10. Particle Sparks
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.15; // Gravity
            p.life -= p.decay;
            if (p.life <= 0) {
                particles.splice(i, 1);
                continue;
            }
            context.fillStyle = `${p.color} ${p.life})`;
            context.shadowColor = p.color + ' 1)';
            context.shadowBlur = 8;
            context.fillRect(p.x, p.y, p.size, p.size);
            context.shadowBlur = 0;
        }

        context.restore();
    }

    // =================================================================
    // COLLISION & ROTATION
    // =================================================================
    function collides(targetBoard, targetPiece) {
        const { matrix, pos } = targetPiece;
        for (let y = 0; y < matrix.length; y++) {
            for (let x = 0; x < matrix[y].length; x++) {
                if (matrix[y][x] !== 0) {
                    const by = y + pos.y;
                    const bx = x + pos.x;
                    if (bx < 0 || bx >= COLS || by >= ROWS) {
                        return true;
                    }
                    if (by >= 0 && targetBoard[by][bx] !== 0) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    function merge(targetBoard, targetPiece) {
        targetPiece.matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    const by = y + targetPiece.pos.y;
                    const bx = x + targetPiece.pos.x;
                    if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS) {
                        targetBoard[by][bx] = targetPiece.colorIndex || 1;
                    }
                }
            });
        });
    }

    function rotateMatrix(matrix, dir) {
        const result = [];
        for (let y = 0; y < matrix[0].length; y++) {
            result.push([]);
        }
        if (dir > 0) {
            for (let y = 0; y < matrix.length; y++) {
                for (let x = 0; x < matrix[y].length; x++) {
                    result[x][matrix.length - 1 - y] = matrix[y][x];
                }
            }
        } else {
            for (let y = 0; y < matrix.length; y++) {
                for (let x = 0; x < matrix[y].length; x++) {
                    result[matrix[0].length - 1 - x][y] = matrix[y][x];
                }
            }
        }
        return result;
    }

    function pieceRotate(dir) {
        if (!piece || paused || gameOver) return;
        const originalPos = piece.pos.x;
        const rotated = rotateMatrix(piece.matrix, dir);
        piece.matrix = rotated;
        playEnhancedSound('rotate');

        let offset = 1;
        while (collides(board, piece)) {
            piece.pos.x += offset;
            offset = -(offset + (offset > 0 ? 1 : -1));
            if (Math.abs(offset) > piece.matrix[0].length + 1) {
                piece.matrix = rotateMatrix(piece.matrix, -dir);
                piece.pos.x = originalPos;
                return;
            }
        }
        lastMoveWasRotate = true;
    }

    function pieceMove(dir) {
        if (!piece || paused || gameOver) return;
        piece.pos.x += dir;
        lastMoveWasRotate = false;
        if (collides(board, piece)) {
            piece.pos.x -= dir;
        } else {
            playEnhancedSound('move');
        }
    }

    function pieceDrop() {
        if (!piece || paused || gameOver) return;
        piece.pos.y++;
        lastMoveWasRotate = false;

        if (collides(board, piece)) {
            piece.pos.y--;
            playEnhancedSound('drop');
            addScreenShake(2);
            merge(board, piece);
            sweep();
            resetPlayer();
        }
        dropCounter = 0;
    }

    function hardDrop() {
        if (!piece || paused || gameOver) return;
        const startY = piece.pos.y;

        // Trace vertical laser beams down each column occupied by the piece
        piece.matrix.forEach((row, y) => {
            row.forEach((v, x) => {
                if (v !== 0) {
                    addLaserBeam(piece.pos.x + x, startY + y, piece.pos.y + y, piece.color);
                }
            });
        });

        while (!collides(board, piece)) {
            piece.pos.y++;
        }
        piece.pos.y--;

        playEnhancedSound('hardDrop');
        addScreenShake(8);
        merge(board, piece);
        sweep();
        resetPlayer();
        dropCounter = 0;
    }

    function hold() {
        if (!canHold || paused || gameOver || !piece) return;
        playEnhancedSound('hold');

        if (heldPiece) {
            const temp = heldPiece;
            heldPiece = {
                matrix: piece.matrix,
                color: piece.color,
                colorIndex: piece.colorIndex
            };
            piece = {
                ...temp,
                pos: {
                    x: Math.floor(COLS / 2) - Math.floor(temp.matrix[0].length / 2),
                    y: 0
                }
            };
        } else {
            heldPiece = {
                matrix: piece.matrix,
                color: piece.color,
                colorIndex: piece.colorIndex
            };
            resetPlayer();
        }

        canHold = false;
        drawHoldPiece();
    }

    function sweep() {
        let linesInSweep = 0;

        outer: for (let y = board.length - 1; y >= 0; --y) {
            for (let x = 0; x < board[y].length; ++x) {
                if (board[y][x] === 0) {
                    continue outer;
                }
            }

            // Explode row with sparks
            for (let x = 0; x < board[y].length; ++x) {
                createSparks(x, y, COLORS[board[y][x]] || '#00f0ff', 10);
            }
            addLineShockwave(y);

            const row = board.splice(y, 1)[0].fill(0);
            board.unshift(row);
            ++y;
            linesInSweep++;
        }

        if (linesInSweep > 0) {
            combo++;
            const linePoints = [0, 100, 300, 600, 1200];
            const basePoints = linePoints[Math.min(linesInSweep, 4)] || (linesInSweep * 350);
            const comboBonus = (combo - 1) * 60;
            const pointsEarned = (basePoints + comboBonus) * level;

            updateScore(pointsEarned);
            linesCleared += linesInSweep;
            if (linesElement) linesElement.textContent = linesCleared;

            if (linesInSweep >= 4) {
                playEnhancedSound('tetris');
                addScreenShake(18);
                showToast('¡TETRIS IMPERIAL!', '#00ff88');
            } else if (linesInSweep === 3) {
                playEnhancedSound('clear', 3);
                addScreenShake(10);
                showToast('¡TRIPLE COMBO!', '#00f0ff');
            } else if (linesInSweep === 2) {
                playEnhancedSound('clear', 2);
                addScreenShake(6);
                showToast('¡DOBLE!', '#b026ff');
            } else {
                playEnhancedSound('clear', 1);
                addScreenShake(4);
                if (combo > 1) {
                    playEnhancedSound('combo', combo);
                    showToast(`¡COMBO x${combo}!`, '#ffaa00');
                }
            }

            // Level up every 10 lines
            const nextLevel = Math.floor(linesCleared / 10) + 1;
            if (nextLevel > level) {
                level = nextLevel;
                if (levelElement) levelElement.textContent = level;
                dropInterval = Math.max(110, 900 - (level - 1) * 75);
                showToast(`¡NIVEL ${level}!`, '#ffe600');
            }
        } else {
            combo = 0;
        }
    }

    function updateScore(points) {
        score += points;
        if (scoreElement) scoreElement.textContent = score;

        if (score > highScore) {
            highScore = score;
            localStorage.setItem('edu_tetris_highscore', highScore);
            if (highScoreElement) highScoreElement.textContent = highScore;
        }
    }

    // =================================================================
    // GAME LOOP
    // =================================================================
    let dropCounter = 0;
    let dropInterval = 900;
    let lastTime = 0;

    function gameLoop(time = 0) {
        if (gameOver || paused) return;

        const deltaTime = time - lastTime;
        lastTime = time;

        dropCounter += deltaTime;
        if (dropCounter > dropInterval) {
            pieceDrop();
        }

        draw();
        animationFrameId = requestAnimationFrame(gameLoop);
    }

    // =================================================================
    // INPUT LISTENERS & TOUCH BINDINGS
    // =================================================================
    document.addEventListener('keydown', event => {
        if (gameOver) return;

        if (event.key === 'p' || event.key === 'P' || event.key === 'Escape') {
            togglePause();
            return;
        }

        if (paused) return;

        switch (event.code) {
            case 'ArrowLeft':
            case 'KeyA':
                pieceMove(-1);
                break;
            case 'ArrowRight':
            case 'KeyD':
                pieceMove(1);
                break;
            case 'ArrowDown':
            case 'KeyS':
                pieceDrop();
                break;
            case 'ArrowUp':
            case 'KeyW':
                pieceRotate(1);
                break;
            case 'KeyQ':
            case 'KeyZ':
                pieceRotate(-1);
                break;
            case 'Space':
                event.preventDefault();
                hardDrop();
                break;
            case 'KeyC':
            case 'ShiftLeft':
            case 'ShiftRight':
                hold();
                break;
        }
    });

    function bindTouch(id, action) {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('touchstart', (e) => {
            e.preventDefault();
            action();
        });
        el.addEventListener('click', (e) => {
            e.preventDefault();
            action();
        });
    }

    bindTouch('touch-left', () => pieceMove(-1));
    bindTouch('touch-right', () => pieceMove(1));
    bindTouch('touch-down', () => pieceDrop());
    bindTouch('touch-rotate', () => pieceRotate(1));
    bindTouch('touch-drop', () => hardDrop());
    bindTouch('touch-hold', () => hold());

    // Game lifecycle functions
    function togglePause() {
        if (gameOver) return;
        paused = !paused;
        if (paused) {
            cancelAnimationFrame(animationFrameId);
            pauseScreen.classList.remove('hidden');
            stopMusic();
        } else {
            pauseScreen.classList.add('hidden');
            lastTime = performance.now();
            startCurrentMusic();
            gameLoop();
        }
    }

    function showGameOverScreen() {
        cancelAnimationFrame(animationFrameId);
        playEnhancedSound('gameover');
        stopMusic();
        if (finalScoreElement) finalScoreElement.textContent = score;
        if (highScoreMsg) {
            highScoreMsg.style.display = score >= highScore && score > 0 ? 'block' : 'none';
        }
        gameOverScreen.classList.remove('hidden');
    }

    function startGame() {
        startScreen.classList.add('hidden');
        gameOverScreen.classList.add('hidden');
        pauseScreen.classList.add('hidden');

        resizeBoard();
        board = createBoard(COLS, ROWS);
        score = 0;
        level = 1;
        linesCleared = 0;
        combo = 0;
        gameOver = false;
        paused = false;
        nextPieces = [];
        heldPiece = null;
        canHold = true;
        dropInterval = 900;
        dropCounter = 0;
        screenShake = 0;
        laserBeams = [];
        lineShockwaves = [];
        particles = [];

        if (scoreElement) scoreElement.textContent = '0';
        if (levelElement) levelElement.textContent = '1';
        if (linesElement) linesElement.textContent = '0';

        drawHoldPiece();
        fillNextPieces();
        resetPlayer();
        updateVolumeDisplay();
        startCurrentMusic();

        lastTime = performance.now();
        gameLoop();
    }

    startBtn.addEventListener('click', startGame);
    resumeBtn.addEventListener('click', togglePause);
    playAgainBtn.addEventListener('click', startGame);

    // Initial state
    startScreen.classList.remove('hidden');
    updateVolumeDisplay();
});
