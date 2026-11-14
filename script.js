/* =================================================================
   EDU TETRIS ARCADE - CORE ENGINE & AUDIO
================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
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

    // UI Screens & Overlays
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

    // Audio & Synth fallback
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

    function playSynthSound(type) {
        if (isMuted) return;
        const ctx = getAudioCtx();
        if (!ctx) return;

        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        const currentVol = volume * 0.3;

        if (type === 'move') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(220, now);
            osc.frequency.exponentialRampToValueAtTime(140, now + 0.05);
            gain.gain.setValueAtTime(currentVol, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
            osc.start(now);
            osc.stop(now + 0.05);
        } else if (type === 'rotate') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(320, now);
            osc.frequency.exponentialRampToValueAtTime(520, now + 0.08);
            gain.gain.setValueAtTime(currentVol, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.08);
        } else if (type === 'drop') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(120, now);
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
            gain.gain.setValueAtTime(currentVol * 1.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === 'clear') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.setValueAtTime(587.33, now + 0.07);
            osc.frequency.setValueAtTime(880, now + 0.14);
            gain.gain.setValueAtTime(currentVol * 0.8, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);
            osc.start(now);
            osc.stop(now + 0.28);
        } else if (type === 'hold') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(350, now);
            osc.frequency.setValueAtTime(440, now + 0.05);
            gain.gain.setValueAtTime(currentVol, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === 'gameover') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.exponentialRampToValueAtTime(60, now + 0.6);
            gain.gain.setValueAtTime(currentVol, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
            osc.start(now);
            osc.stop(now + 0.6);
        }
    }

    const soundFiles = {
        move: new Audio('sounds/move.wav'),
        rotate: new Audio('sounds/rotate.wav'),
        drop: new Audio('sounds/drop.wav'),
        clear: new Audio('sounds/clear.wav'),
        gameOver: new Audio('sounds/gameover.wav'),
        hold: new Audio('sounds/hold.wav'),
        explosion: new Audio('sounds/explosion.wav')
    };

    const musicTracks = [
        new Audio(encodeURI('music/Cruzando Cielos.mp3')),
        new Audio(encodeURI('music/Opa Amor.mp3')),
        new Audio(encodeURI('music/Together.mp3'))
    ];
    musicTracks.forEach(track => {
        track.loop = true;
        track.preload = 'auto';
    });

    let volume = 0.5;
    let currentTrack = 0;
    let isMuted = false;

    function updateVolumeDisplay() {
        const displayVal = isMuted ? '0' : Math.round(volume * 10);
        if (volDisplay) volDisplay.textContent = displayVal;
        const icon = isMuted || volume === 0 ? '🔇' : '🔊';
        if (muteBtn) muteBtn.textContent = icon;
        if (quickMuteBtn) quickMuteBtn.textContent = icon;

        musicTracks.forEach(track => {
            track.volume = isMuted ? 0 : volume * 0.7;
        });
        Object.values(soundFiles).forEach(s => {
            s.volume = isMuted ? 0 : volume;
        });
    }

    function playSound(soundName) {
        if (isMuted) return;
        try {
            if (soundFiles[soundName]) {
                soundFiles[soundName].currentTime = 0;
                const p = soundFiles[soundName].play();
                if (p && p.catch) {
                    p.catch(() => playSynthSound(soundName));
                }
            } else {
                playSynthSound(soundName);
            }
        } catch (e) {
            playSynthSound(soundName);
        }
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
            targetTrack.volume = volume * 0.7;
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
    // RESPONSIVE GAME DIMENSIONS
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

    // Game State
    let board = createBoard(COLS, ROWS);
    let score = 0;
    let level = 1;
    let linesCleared = 0;
    let combo = 0;
    let gameOver = false;
    let paused = false;
    let animationFrameId;

    // High score from localStorage
    let highScore = parseInt(localStorage.getItem('edu_tetris_highscore') || '0', 10);
    if (highScoreElement) highScoreElement.textContent = highScore;

    // =================================================================
    // PIECES & COLORS
    // =================================================================
    const PIECES = [
        // Standard Tetrominoes
        [[1, 1, 1, 1]],                    // I (Cyan)
        [[1, 1, 1], [0, 1, 0]],            // T (Purple)
        [[1, 1, 0], [0, 1, 1]],            // Z (Red)
        [[0, 1, 1], [1, 1, 0]],            // S (Green)
        [[1, 1], [1, 1]],                  // O (Yellow)
        [[1, 0, 0], [1, 1, 1]],            // L (Orange)
        [[0, 0, 1], [1, 1, 1]],            // J (Blue)
        // Bonus Arcade Pieces
        [[1, 1, 1, 1, 1]],                 // Super I (Pink)
        [[0, 1, 0], [1, 1, 1], [0, 1, 0]], // Cruz / Cross (Gold)
        [[1, 1, 1], [1, 0, 1]],            // U shape (Emerald)
        [[1]]                              // Spark / Dot (White/Lime)
    ];

    const COLORS = [
        null,
        '#00f0ff', // I (Cyan)
        '#b026ff', // T (Purple)
        '#ff2a5f', // Z (Red)
        '#00ff88', // S (Green)
        '#ffe600', // O (Yellow)
        '#ff8800', // L (Orange)
        '#3b82f6', // J (Blue)
        '#ff00b7', // Super I
        '#ffd700', // Cross
        '#10b981', // U
        '#a3e635'  // Spark
    ];

    let piece = null;
    let nextPieces = [];
    let heldPiece = null;
    let canHold = true;
    let lastMoveWasRotate = false;

    // Particle FX
    let impactParticles = [];
    let explosionParticles = [];
    let stars = [];

    function initStars() {
        stars = [];
        for (let i = 0; i < 40; i++) {
            stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 2 + 1,
                speed: Math.random() * 0.4 + 0.2,
                opacity: Math.random() * 0.6 + 0.2
            });
        }
    }
    initStars();

    function showToast(text, color = '#ff007f') {
        if (!toastBadge) return;
        toastBadge.textContent = text;
        toastBadge.style.borderColor = color;
        toastBadge.style.boxShadow = `0 0 25px ${color}`;
        toastBadge.classList.add('show');
        setTimeout(() => toastBadge.classList.remove('show'), 900);
    }

    function createBoard(cols, rows) {
        return Array.from({ length: rows }, () => Array(cols).fill(0));
    }

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
    // RENDERING & VISUAL EFFECTS
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

    function drawNeonBlock(ctx, x, y, size, colorHex, isGhost = false) {
        const px = x * size;
        const py = y * size;

        if (isGhost) {
            ctx.save();
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.45)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 3]);
            ctx.strokeRect(px + 2, py + 2, size - 4, size - 4);
            ctx.fillStyle = 'rgba(0, 240, 255, 0.08)';
            ctx.fillRect(px + 2, py + 2, size - 4, size - 4);
            ctx.restore();
            return;
        }

        const rgb = hexToRgb(colorHex);

        // Block fill with 3D gradient
        const grad = ctx.createLinearGradient(px, py, px + size, py + size);
        grad.addColorStop(0, `rgb(${Math.min(255, rgb.r + 70)}, ${Math.min(255, rgb.g + 70)}, ${Math.min(255, rgb.b + 70)})`);
        grad.addColorStop(0.5, colorHex);
        grad.addColorStop(1, `rgb(${Math.max(0, rgb.r - 60)}, ${Math.max(0, rgb.g - 60)}, ${Math.max(0, rgb.b - 60)})`);

        ctx.fillStyle = grad;
        ctx.fillRect(px + 1, py + 1, size - 2, size - 2);

        // Gloss highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.fillRect(px + 2, py + 2, size - 4, Math.floor(size * 0.35));

        // Neon outline
        ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.8)`;
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 1, py + 1, size - 2, size - 2);
    }

    function drawMatrix(matrix, offset, ctx, blockSize, colorHex = null, isGhost = false) {
        matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    const blockColor = colorHex || COLORS[value];
                    drawNeonBlock(ctx, x + offset.x, y + offset.y, blockSize, blockColor, isGhost);
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
            const previewSize = Math.max(14, Math.floor(BLOCK_SIZE * 0.65));
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
            const previewSize = Math.max(14, Math.floor(BLOCK_SIZE * 0.65));
            const w = heldPiece.matrix[0].length;
            const h = heldPiece.matrix.length;
            const offsetX = (holdCanvas.width / previewSize - w) / 2;
            const offsetY = (holdCanvas.height / previewSize - h) / 2;

            drawMatrix(heldPiece.matrix, { x: offsetX, y: offsetY }, holdContext, previewSize, heldPiece.color);
        }
    }

    function createExplosion(x, y, colorHex) {
        const rgb = hexToRgb(colorHex);
        for (let i = 0; i < 18; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 4 + 1.5;
            explosionParticles.push({
                x: (x + 0.5) * BLOCK_SIZE,
                y: (y + 0.5) * BLOCK_SIZE,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: Math.random() * 4 + 2,
                color: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b},`,
                life: 1,
                decay: Math.random() * 0.03 + 0.02
            });
        }
    }

    function draw() {
        // Clear board with dark background
        context.fillStyle = '#070913';
        context.fillRect(0, 0, canvas.width, canvas.height);

        // Subtle background grid
        context.strokeStyle = 'rgba(255, 255, 255, 0.04)';
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

        // Draw Stars
        stars.forEach(s => {
            s.y += s.speed;
            if (s.y > canvas.height) {
                s.y = 0;
                s.x = Math.random() * canvas.width;
            }
            context.fillStyle = `rgba(0, 240, 255, ${s.opacity})`;
            context.fillRect(s.x, s.y, s.size, s.size);
        });

        // Draw Ghost piece
        if (piece) {
            drawGhostPiece();
        }

        // Draw settled blocks
        drawMatrix(board, { x: 0, y: 0 }, context, BLOCK_SIZE);

        // Draw active piece
        if (piece) {
            drawMatrix(piece.matrix, piece.pos, context, BLOCK_SIZE, piece.color);
        }

        // Draw explosions
        for (let i = explosionParticles.length - 1; i >= 0; i--) {
            const p = explosionParticles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= p.decay;
            if (p.life <= 0) {
                explosionParticles.splice(i, 1);
                continue;
            }
            context.fillStyle = `${p.color} ${p.life})`;
            context.shadowColor = p.color + ' 1)';
            context.shadowBlur = 6;
            context.fillRect(p.x, p.y, p.size, p.size);
            context.shadowBlur = 0;
        }
    }

    // =================================================================
    // GAME LOGIC & COLLISION
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
        playSound('rotate');

        // Wall kick
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
            playSound('move');
        }
    }

    function pieceDrop() {
        if (!piece || paused || gameOver) return;
        piece.pos.y++;
        lastMoveWasRotate = false;

        if (collides(board, piece)) {
            piece.pos.y--;
            playSound('drop');
            merge(board, piece);
            sweep();
            resetPlayer();
        }
        dropCounter = 0;
    }

    function hardDrop() {
        if (!piece || paused || gameOver) return;
        while (!collides(board, piece)) {
            piece.pos.y++;
        }
        piece.pos.y--;
        playSound('drop');
        merge(board, piece);
        sweep();
        resetPlayer();
        dropCounter = 0;
    }

    function hold() {
        if (!canHold || paused || gameOver || !piece) return;
        playSound('hold');

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

            // Explode row
            for (let x = 0; x < board[y].length; ++x) {
                createExplosion(x, y, COLORS[board[y][x]] || '#00f0ff');
            }

            const row = board.splice(y, 1)[0].fill(0);
            board.unshift(row);
            ++y;
            linesInSweep++;
        }

        if (linesInSweep > 0) {
            combo++;
            playSound('clear');
            const linePoints = [0, 100, 300, 600, 1200];
            const basePoints = linePoints[Math.min(linesInSweep, 4)] || (linesInSweep * 350);
            const comboBonus = (combo - 1) * 50;
            const pointsEarned = (basePoints + comboBonus) * level;

            updateScore(pointsEarned);
            linesCleared += linesInSweep;
            if (linesElement) linesElement.textContent = linesCleared;

            if (linesInSweep >= 4) {
                showToast('¡TETRIS!', '#00ff88');
            } else if (linesInSweep === 3) {
                showToast('¡TRIPLE!', '#00f0ff');
            } else if (linesInSweep === 2) {
                showToast('¡DOUBLE!', '#b026ff');
            } else if (combo > 1) {
                showToast(`COMBO x${combo}!`, '#ffaa00');
            }

            // Level up every 10 lines
            const nextLevel = Math.floor(linesCleared / 10) + 1;
            if (nextLevel > level) {
                level = nextLevel;
                if (levelElement) levelElement.textContent = level;
                dropInterval = Math.max(120, 900 - (level - 1) * 80);
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
    // MAIN LOOP
    // =================================================================
    let dropCounter = 0;
    let dropInterval = 900;
    let lastTime = 0;

    function gameLoop(time = 0) {
        if (gameOver || paused) {
            return;
        }
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
    // CONTROLS & EVENT LISTENERS
    // =================================================================
    document.addEventListener('keydown', event => {
        if (gameOver) return;

        // Resume / Pause with P or Escape
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

    // Mobile Touch buttons
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
        playSound('gameOver');
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
