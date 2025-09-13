document.addEventListener('DOMContentLoaded', () => {
    // Elementos del DOM
    const canvas = document.getElementById('tetris');
    const context = canvas.getContext('2d');
    const scoreElement = document.getElementById('score');
    const levelElement = document.getElementById('level');
    const finalScoreElement = document.getElementById('final-score');
    const nextPiecesContainer = document.getElementById('next-pieces');
    const holdCanvas = document.getElementById('hold-piece');
    const holdContext = holdCanvas.getContext('2d');

    // Pantallas
    const startScreen = document.getElementById('start-screen');
    const pauseScreen = document.getElementById('pause-screen');
    const gameOverScreen = document.getElementById('game-over-screen');

    // Botones
    const startBtn = document.getElementById('start-btn');
    const resumeBtn = document.getElementById('resume-btn');
    const playAgainBtn = document.getElementById('play-again-btn');

    // --- Lógica de Audio ---
    const muteBtn = document.getElementById('mute-btn');
    const volDownBtn = document.getElementById('vol-down-btn');
    const volUpBtn = document.getElementById('vol-up-btn');
    const volDisplay = document.getElementById('vol-display');
    const musicTrackBtns = document.querySelectorAll('.music-track-btn');

    // Crear elementos de audio
    const sounds = {
        move: new Audio('sounds/move.wav'),
        rotate: new Audio('sounds/move.wav'),
        drop: new Audio('sounds/drop.wav'),
        clear: new Audio('sounds/clear.wav'),
        gameOver: new Audio('sounds/gameover.wav'),
        hold: new Audio('sounds/hold.wav'),
        explosion: new Audio('sounds/explosion.wav') // Nuevo sonido de explosión
    };

    const musicTracks = [
        new Audio('music/music1.wav'),
        new Audio('music/music2.wav'),
        new Audio('music/music3.wav'),
        new Audio('music/music4.wav')
    ];
    musicTracks.forEach(track => track.loop = true);

    let volume = 0.5; // Volumen inicial (5 de 10)
    let currentTrack = null;
    let isMuted = true; // Empezar muteado

    function updateVolume() {
        const allAudio = [...Object.values(sounds), ...musicTracks];
        allAudio.forEach(audio => audio.volume = volume);
        volDisplay.textContent = Math.round(volume * 10);
        muteBtn.textContent = isMuted || volume === 0 ? '🔇' : '🔊';
    }

    function playSound(soundName) {
        if (!isMuted) {
            sounds[soundName].currentTime = 0;
            sounds[soundName].play();
        }
    }

    muteBtn.addEventListener('click', () => {
        isMuted = !isMuted;
        updateVolume();
        if (!isMuted && currentTrack !== null) musicTracks[currentTrack].play();
        else musicTracks.forEach(track => track.pause());
    });

    volUpBtn.addEventListener('click', () => {
        if (volume < 1) volume = Math.min(1, volume + 0.1);
        updateVolume();
    });

    volDownBtn.addEventListener('click', () => {
        if (volume > 0) volume = Math.max(0, volume - 0.1);
        updateVolume();
    });

    // Constantes del juego
    const COLS = 14;
    const ROWS = 24;
    const BLOCK_SIZE = 40;
    const NEXT_PIECE_BLOCK_SIZE = 12;

    context.canvas.width = COLS * BLOCK_SIZE;
    context.canvas.height = ROWS * BLOCK_SIZE;

    // Escalar el contexto para el tamaño de bloque
    context.scale(BLOCK_SIZE, BLOCK_SIZE);

    let board = createBoard(COLS, ROWS);
    let score = 0;
    let level = 0;
    let linesCleared = 0;
    let gameOver = false;
    let paused = false;
    let animationFrameId;

    // --- Lógica para el fondo de estrellas ---
    const PIECES = [
        // Tetrominós estándar
        [[1, 1, 1, 1]],         // I
        [[1, 1, 1], [0, 1, 0]], // T
        [[1, 1, 0], [0, 1, 1]], // Z
        [[0, 1, 1], [1, 1, 0]], // S
        [[1, 1], [1, 1]],       // O
        [[1, 0, 0], [1, 1, 1]], // L
        [[0, 0, 1], [1, 1, 1]], // J

        // Pentominós (piezas de 5 bloques)
        [[1, 1, 1, 1, 1]],         // I larga
        [[1, 1, 0], [0, 1, 1], [0, 1, 0]], // Y
        [[0, 1, 0], [1, 1, 1], [0, 1, 0]], // Cruz (+)
        [[1, 1, 1], [1, 0, 1]],     // U

        // Piezas pequeñas
        [[1]],                      // Punto
        [[1, 1]],                   // Línea de 2
        [[1, 1, 1]]                 // Línea de 3
    ];

    const COLORS = [
        null,
        '#00F0F0', // I
        '#A000F0', // T
        '#F00000', // Z
        '#00F000', // S
        '#F0F000', // O
        '#F0A000', // L
        '#0000F0', // J
        '#FF00FF', // I larga (Magenta)
        '#33FFDD', // Y (Turquesa)
        '#FFD700', // Cruz (Dorado)
        '#7CFC00', // U (Verde Césped)
        '#FF1493', // Punto (Rosa Profundo)
        '#ADFF2F', // Línea de 2 (Verde-Amarillo)
        '#7B68EE'  // Línea de 3 (Pizarra Medio Azul)
    ];

    let piece = null;
    let nextPieces = [];
    let heldPiece = null;
    let canHold = true;
    let stars = [];
    let lastMoveWasRotate = false; // Para detectar T-Spins
    let particles = [];
    let impactParticles = []; // Partículas para cuando la pieza aterriza
    let trailParticles = []; // Partículas de rastro al mover la pieza
    let explosionParticles = []; // Partículas para la explosión de líneas

    function createStars() {
        stars = [];
        for (let i = 0; i < 100; i++) {
            stars.push({
                x: Math.random() * COLS,
                y: Math.random() * ROWS,
                size: Math.random() * 0.05 + 0.02, // Tamaño relativo al bloque
                speed: Math.random() * 0.01 + 0.005 // Velocidad relativa
            });
        }
    }

    function createParticles() {
        particles = [];
        for (let i = 0; i < 50; i++) {
            particles.push({
                x: Math.random() * COLS,
                y: Math.random() * ROWS,
                size: Math.random() * 0.08 + 0.04,
                speedX: (Math.random() - 0.5) * 0.01,
                speedY: (Math.random() - 0.5) * 0.01,
                color: `rgba(100, 100, 255, ${Math.random() * 0.5 + 0.2})` // Azulado semitransparente
            });
        }
    }

    function drawStars() {
        context.fillStyle = 'white';
        stars.forEach(star => {
            context.fillRect(star.x, star.y, star.size, star.size);
        });
    }

    function drawTrailParticles() {
        for (let i = trailParticles.length - 1; i >= 0; i--) {
            const p = trailParticles[i];
            p.lifespan--;
            if (p.lifespan <= 0) {
                trailParticles.splice(i, 1);
                continue;
            }
            context.fillStyle = `rgba(${p.r}, ${p.g}, ${p.b}, ${p.lifespan / 60})`;
            context.fillRect(p.x, p.y, p.size, p.size);
        }
    }

    function drawImpactParticles() {
        for (let i = impactParticles.length - 1; i >= 0; i--) {
            const p = impactParticles[i];
            p.y += p.speedY;
            p.x += p.speedX;
            p.lifespan--;
            context.fillStyle = `rgba(${p.r}, ${p.g}, ${p.b}, ${p.lifespan / 60})`;
            context.fillRect(p.x, p.y, p.size, p.size);
        }
    }

    function drawExplosionParticles() {
        for (let i = explosionParticles.length - 1; i >= 0; i--) {
            const p = explosionParticles[i];
            p.x += p.speedX;
            p.y += p.speedY;
            p.lifespan--;
            if (p.lifespan <= 0) {
                explosionParticles.splice(i, 1);
                continue;
            }
            context.fillStyle = `rgba(${p.r}, ${p.g}, ${p.b}, ${p.lifespan / 60})`;
            context.fillRect(p.x, p.y, p.size, p.size);
        }
    }
    function drawParticles() {
        particles.forEach(p => {
            context.fillStyle = p.color;
            context.fillRect(p.x, p.y, p.size, p.size);
        });
    }

    function createBoard(cols, rows) {
        return Array.from({ length: rows }, () => Array(cols).fill(0));
    }

    function getRandomPiece() {
        const rand = Math.floor(Math.random() * PIECES.length);
        const newPiece = {
            matrix: PIECES[rand],
            color: COLORS[rand + 1],
            pos: { x: Math.floor(COLS / 2) - Math.floor(PIECES[rand][0].length / 2), y: 0 }
        };
        return newPiece;
    }

    function fillNextPieces() {
        while (nextPieces.length < 1) {
            nextPieces.push(getRandomPiece());
        }
    }

    function resetPlayer() {
        fillNextPieces();
        playSound('drop');
        piece = nextPieces.shift();
        fillNextPieces();
        drawNextPieces();

        // Reiniciar la bandera de rotación para la nueva pieza
        lastMoveWasRotate = false;

        // Comprobar si la nueva pieza colisiona inmediatamente
        // Esto es la condición de fin de juego
        if (collides(board, piece)) {
            gameOver = true;
            showGameOverScreen();
        }
    }

    function draw() {
        // Limpiar canvas principal
        context.fillStyle = '#111'; // Un negro un poco más suave
        context.fillRect(0, 0, context.canvas.width, context.canvas.height);

        // Mover y dibujar estrellas
        stars.forEach(star => {
            star.y += star.speed;
            if (star.y > ROWS) {
                star.y = 0;
                star.x = Math.random() * COLS;
            }
        });
        drawStars();

        // Mover y dibujar partículas
        particles.forEach(p => {
            p.x += p.speedX;
            p.y += p.speedY;

            // Si se salen de la pantalla, las reposicionamos
            if (p.x < 0 || p.x > COLS || p.y < 0 || p.y > ROWS) {
                p.x = Math.random() * COLS;
                p.y = Math.random() * ROWS;
            }
        });
        drawTrailParticles();
        drawImpactParticles();
        drawExplosionParticles();
        drawParticles(); 

        // Dibujar la pieza fantasma (Ghost Piece)
        if (piece) {
            drawGhostPiece();
        }

        // Dibujar el tablero y la pieza activa
        drawMatrix(board, { x: 0, y: 0 }, context);
        if (piece) {
            drawMatrix(piece.matrix, piece.pos, context, piece.color);
        }
    }

    function drawGhostPiece() {
        const ghostPiece = { ...piece, pos: { ...piece.pos } }; // Clonar la pieza
        
        // Mover la pieza fantasma hacia abajo hasta que colisione
        while (!collides(board, ghostPiece)) {
            ghostPiece.pos.y++;
        }
        ghostPiece.pos.y--; // Retroceder un paso a la última posición válida

        // Dibujar la pieza fantasma con un estilo diferente (semi-transparente)
        const ghostColor = `rgba(${hexToRgb(piece.color).r}, ${hexToRgb(piece.color).g}, ${hexToRgb(piece.color).b}, 0.25)`;
        drawMatrix(ghostPiece.matrix, ghostPiece.pos, context, ghostColor);
    }

    // Función para oscurecer/aclarar colores para el efecto 3D
    function shadeColor(color, percent) {
        let f = parseInt(color.slice(1), 16), t = percent < 0 ? 0 : 255, p = percent < 0 ? percent * -1 : percent, R = f >> 16, G = (f >> 8) & 0x00FF, B = f & 0x0000FF;
        return "#" + (0x1000000 + (Math.round((t - R) * p) + R) * 0x10000 + (Math.round((t - G) * p) + G) * 0x100 + (Math.round((t - B) * p) + B)).toString(16).slice(1);
    }

    function drawBlock(x, y, color, ctx) {
        const lightColor = shadeColor(color, 0.4);
        const darkColor = shadeColor(color, -0.5);

        // 1. Gradiente principal para el cuerpo del bloque (efecto biselado)
        const mainGradient = ctx.createLinearGradient(x, y, x + 1, y + 1);
        mainGradient.addColorStop(0, lightColor);
        mainGradient.addColorStop(1, darkColor);
        ctx.fillStyle = mainGradient;
        ctx.fillRect(x, y, 1, 1);

        // 2. Recuadro interior para dar profundidad
        ctx.fillStyle = color;
        ctx.fillRect(x + 0.1, y + 0.1, 0.8, 0.8);

        // 3. Brillo superior para un efecto "glossy"
        const glossGradient = ctx.createLinearGradient(x, y, x, y + 0.5);
        glossGradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
        glossGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = glossGradient;
        ctx.fillRect(x + 0.1, y + 0.1, 0.8, 0.4);
    }

    function drawGhostBlock(x, y, color, ctx) {
        // Dibuja solo el contorno del bloque para la pieza fantasma
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.1; // Grosor del borde relativo al tamaño del bloque
        ctx.strokeRect(x + 0.05, y + 0.05, 0.9, 0.9);
    }

    function drawMatrix(matrix, offset, ctx, color = null) {
        matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    const blockColor = color || COLORS[value];
                    // Si el color es RGBA (transparente), es una pieza fantasma
                    if (blockColor.startsWith('rgba')) {
                        drawGhostBlock(x + offset.x, y + offset.y, blockColor, ctx);
                    } else {
                        drawBlock(x + offset.x, y + offset.y, blockColor, ctx);
                    }
                }
            });
        });
    }

    function drawNextPieces() {
        nextPiecesContainer.innerHTML = '';
        nextPieces.forEach(p => {
            const pieceCanvas = document.createElement('canvas');
            const pieceCtx = pieceCanvas.getContext('2d');
            
            // Usar un tamaño estático para el canvas, suficiente para la pieza más grande (4x4)
            const canvasSize = 4 * NEXT_PIECE_BLOCK_SIZE;
            pieceCanvas.width = canvasSize;
            pieceCanvas.height = canvasSize;

            pieceCtx.scale(NEXT_PIECE_BLOCK_SIZE, NEXT_PIECE_BLOCK_SIZE);

            // Centrar la pieza en el canvas estático
            const w = p.matrix[0].length;
            const h = p.matrix.length;
            const x_offset = (4 - w) / 2;
            const y_offset = (4 - h) / 2;
            drawMatrix(p.matrix, { x: x_offset, y: y_offset }, pieceCtx, p.color);
            nextPiecesContainer.appendChild(pieceCanvas);
        });
    }

    function drawHoldPiece() {
        holdContext.fillStyle = '#000';
        holdContext.fillRect(0, 0, holdCanvas.width, holdCanvas.height);
        if (heldPiece) {
            const p = heldPiece;
            const scale = NEXT_PIECE_BLOCK_SIZE;
            const pieceCtx = holdContext;
            pieceCtx.save();
            pieceCtx.scale(scale, scale);
            const x_offset = (holdCanvas.width / scale - p.matrix[0].length) / 2;
            const y_offset = (holdCanvas.height / scale - p.matrix.length) / 2;
            drawMatrix(p.matrix, { x: x_offset, y: y_offset }, pieceCtx, p.color);
            pieceCtx.restore();
        }
    }

    function collides(board, piece) {
        const { matrix, pos } = piece;
        for (let y = 0; y < matrix.length; y++) {
            for (let x = 0; x < matrix[y].length; x++) {
                if (matrix[y][x] !== 0 &&
                    (board[y + pos.y] && board[y + pos.y][x + pos.x]) !== 0) {
                    return true;
                }
            }
        }
        return false;
    }

    function merge(board, piece) {
        piece.matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    board[y + piece.pos.y][x + piece.pos.x] = COLORS.indexOf(piece.color);
                }
            });
        });
    }

    function rotate(matrix, dir) {
        const newMatrix = [];
        for (let y = 0; y < matrix[0].length; y++) {
            newMatrix.push([]);
        }

        if (dir > 0) { // Rotar a la derecha
            for (let y = 0; y < matrix.length; y++) {
                for (let x = 0; x < matrix[y].length; x++) {
                    newMatrix[x][matrix.length - 1 - y] = matrix[y][x];
                }
            }
        } else { // Rotar a la izquierda
            for (let y = 0; y < matrix.length; y++) {
                for (let x = 0; x < matrix[y].length; x++) {
                    newMatrix[matrix[0].length - 1 - x][y] = matrix[y][x];
                }
            }
        }
        return newMatrix;
    }

    function pieceRotate(dir) {
        const pos = piece.pos.x;
        createTrailParticles(piece); // <-- Añadido aquí
        playSound('rotate');
        let offset = 1;
        const rotated = rotate(piece.matrix, dir);
        piece.matrix = rotated;

        while (collides(board, piece)) {
            piece.pos.x += offset;
            offset = -(offset + (offset > 0 ? 1 : -1));
            if (offset > piece.matrix[0].length) {
                piece.matrix = rotate(piece.matrix, -dir); // Revertir rotación
                piece.pos.x = pos;
                return;
            }
        }
        lastMoveWasRotate = true;
    }

    function createImpactParticles(piece) {
        const { matrix, pos, color } = piece;
        const rgb = hexToRgb(color);

        matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    for (let i = 0; i < 5; i++) { // 5 partículas por bloque
                        impactParticles.push({
                            x: pos.x + x + Math.random(),
                            y: pos.y + y + Math.random(),
                            size: Math.random() * 0.15 + 0.05,
                            speedX: (Math.random() - 0.5) * 0.1,
                            speedY: (Math.random() - 0.5) * 0.1,
                            lifespan: 60, // 60 frames de vida
                            r: rgb.r, g: rgb.g, b: rgb.b
                        });
                    }
                }
            });
        });
    }

    function createTrailParticles(piece, intensity = 1) {
        const { matrix, pos, color } = piece;
        const rgb = hexToRgb(color);
        if (!rgb) return;

        matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    for (let i = 0; i < intensity; i++) { // La intensidad controla cuántas partículas se generan
                        trailParticles.push({
                            x: pos.x + x + Math.random() * 0.8 + 0.1,
                            y: pos.y + y + Math.random() * 0.8 + 0.1,
                            size: Math.random() * 0.25 + 0.1, // Aumentamos un poco más el tamaño
                            lifespan: Math.random() * 30 + 30, // 30-60 frames de vida
                            r: rgb.r, g: rgb.g, b: rgb.b
                        });
                    }
                }
            });
        });
    }

    function createExplosionParticles(x, y, color) {
        const rgb = hexToRgb(color);
        if (!rgb) return;

        const particleCount = 20; // Más partículas para un efecto de explosión
        for (let i = 0; i < particleCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 0.15 + 0.05;
            explosionParticles.push({
                x: x + 0.5, // Empezar desde el centro del bloque
                y: y + 0.5,
                size: Math.random() * 0.3 + 0.1,
                speedX: Math.cos(angle) * speed,
                speedY: Math.sin(angle) * speed,
                lifespan: Math.random() * 40 + 20, // 20-60 frames de vida
                r: rgb.r,
                g: rgb.g,
                b: rgb.b
            });
        }
    }

    function pieceDrop() {
        piece.pos.y++;
        createTrailParticles(piece, 2); // Intensidad alta para el movimiento del usuario
        lastMoveWasRotate = false; // Mover hacia abajo no es una rotación
        if (collides(board, piece)) {
            piece.pos.y--;
            const tSpinLines = checkTSpin(); // Comprobar T-Spin ANTES de fijar y barrer
            merge(board, piece);
            sweep(tSpinLines); // Pasar el resultado del T-Spin a sweep
            resetPlayer();
            createImpactParticles(piece); // Crear partículas de impacto
            canHold = true;
            updateScore(0); // Para actualizar nivel si es necesario
        }
        dropCounter = 0;
    }

    function pieceMove(dir) {
        piece.pos.x += dir;
        createTrailParticles(piece, 2); // Intensidad alta
        playSound('move');
        lastMoveWasRotate = false; // Mover a los lados no es una rotación
        if (collides(board, piece)) {
            piece.pos.x -= dir;
        }
    }

    function hardDrop() {
        while (!collides(board, piece)) {
            piece.pos.y++;
        }
        piece.pos.y--;
        lastMoveWasRotate = false; // Hard drop no cuenta como rotación para T-Spin
        pieceDrop();
    }

    function hold() {
        if (!canHold) return;
        createTrailParticles(piece, 2); // Intensidad alta
        playSound('hold');
        lastMoveWasRotate = false;

        if (heldPiece) {
            [piece, heldPiece] = [heldPiece, piece];
            piece.pos = { x: Math.floor(COLS / 2) - Math.floor(piece.matrix[0].length / 2), y: 0 };
        } else {
            heldPiece = piece;
            resetPlayer();
        }
        canHold = false;
        drawHoldPiece();
    }

    function checkTSpin() {
        // 1. La pieza debe ser una 'T' (índice 1 en el array PIECES)
        //    y el último movimiento debe haber sido una rotación.
        if (piece.matrix[0].length !== 3 || piece.matrix.length !== 2 || !lastMoveWasRotate) {
            return 0;
        }

        // 2. Comprobar las 4 esquinas del "bounding box" de 3x3 de la pieza T.
        const { pos } = piece;
        const corners = [
            { y: pos.y,     x: pos.x },     // Arriba-izquierda
            { y: pos.y,     x: pos.x + 2 }, // Arriba-derecha
            { y: pos.y + 2, x: pos.x },     // Abajo-izquierda
            { y: pos.y + 2, x: pos.x + 2 }  // Abajo-derecha
        ];

        let occupiedCorners = 0;
        corners.forEach(corner => {
            // Si la esquina está fuera del tablero o si la celda está ocupada
            if (corner.x < 0 || corner.x >= COLS || corner.y < 0 || corner.y >= ROWS || board[corner.y][corner.x] !== 0) {
                occupiedCorners++;
            }
        });

        // 3. Un T-Spin requiere al menos 3 esquinas ocupadas.
        if (occupiedCorners >= 3) {
            // 4. Verificar si la pieza está "atascada" (no se puede mover sin rotar)
            // Intentamos moverla en las 4 direcciones. Si alguna es posible, no es un T-Spin válido.
            piece.pos.y++; // Mover abajo
            const canMoveDown = !collides(board, piece);
            piece.pos.y--;

            // Si no puede moverse hacia abajo, es un T-Spin válido.
            if (!canMoveDown) {
                return 1; // Devuelve 1 para indicar un T-Spin (sin líneas)
            }
        }
        return 0;
    }

    function sweep(tSpinLines) {
        let rowsCleared = 0;
        outer: for (let y = board.length - 1; y > 0; --y) {
            for (let x = 0; x < board[y].length; ++x) {
                if (board[y][x] === 0) {
                    continue outer;
                }
            }

            // Crear partículas de explosión para la fila que se va a eliminar
            for (let x = 0; x < board[y].length; ++x) {
                const colorIndex = board[y][x];
                if (colorIndex !== 0) {
                    createExplosionParticles(x, y, COLORS[colorIndex]);
                }
            }
            const row = board.splice(y, 1)[0].fill(0);
            board.unshift(row);
            ++y;
            rowsCleared++;
            playSound('clear');
        }

        if (rowsCleared > 0) {
            playSound('explosion');
            if (tSpinLines > 0) { // Puntuación de T-Spin con líneas
                const tSpinPoints = [0, 800, 1200, 1600]; // T-Spin Single, Double, Triple
                updateScore(tSpinPoints[rowsCleared] * (level + 1));
            } else { // Puntuación normal
                const linePoints = [0, 40, 100, 300, 1200];
                updateScore(linePoints[rowsCleared] * (level + 1));
            }
            linesCleared += rowsCleared;
        } else if (tSpinLines > 0) {
            // Puntuación para un T-Spin que no limpia líneas (T-Spin Mini o normal)
            // Usaremos 400 puntos, que es un estándar común.
            updateScore(400 * (level + 1));
            playSound('clear'); // Un sonido para indicar que algo pasó
        }
    }

    function updateScore(points) {
        score += points;
        scoreElement.innerText = score;

        const newLevel = Math.floor(linesCleared / 10);
        if (newLevel > level) {
            level = newLevel;
            levelElement.innerText = level;
            dropInterval = 1000 / (level + 1) + 200;
        }
    }

    // Game Loop
    let dropCounter = 0;
    let dropInterval = 1000;
    let lastTime = 0;

    function update(time = 0) {
        if (gameOver || paused) {
            return;
        }

        const deltaTime = time - lastTime;
        lastTime = time;

        dropCounter += deltaTime;
        if (dropCounter > dropInterval) {
            pieceDrop();
        }

        if (piece) {
            createTrailParticles(piece, 1); // Intensidad baja para la caída automática
        }

        draw();
        animationFrameId = requestAnimationFrame(update);
    }
    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
    }

    // Controles
    document.addEventListener('keydown', event => {
        if (paused || gameOver) return;

        if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') {
            pieceMove(-1);
        } else if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') {
            pieceMove(1);
        } else if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') {
            // La llamada a createTrailParticles ya está dentro de pieceDrop
            pieceDrop();
        } else if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') {
            pieceRotate(1); // Rotar a la derecha
        } else if (event.key.toLowerCase() === 'q') {
            pieceRotate(-1); // Rotar a la izquierda
        } else if (event.key === ' ') { // Barra espaciadora para Hard Drop
            event.preventDefault(); // Evita que la página haga scroll
            hardDrop();
        } else if (event.key.toLowerCase() === 'c') {
            hold();
        } else if (event.key.toLowerCase() === 'p' || event.key === 'Escape') {
            togglePause();
        }
    });

    function togglePause() {
        if (gameOver) return;
        paused = !paused;
        if (paused) {
            cancelAnimationFrame(animationFrameId);
            pauseScreen.classList.remove('hidden');
        } else {
            pauseScreen.classList.add('hidden');
            update();
        }
    }

    // UI Management
    function showStartScreen() {
        startScreen.classList.remove('hidden');
        gameOverScreen.classList.add('hidden');
        pauseScreen.classList.add('hidden');
    }

    function showGameOverScreen() {
        cancelAnimationFrame(animationFrameId);
        playSound('gameOver');
        finalScoreElement.innerText = score;
        gameOverScreen.classList.remove('hidden');
    }

    function startGame() {
        startScreen.classList.add('hidden');
        gameOverScreen.classList.add('hidden');
        pauseScreen.classList.add('hidden');

        board = createBoard(COLS, ROWS);
        score = 0;
        level = 0;
        linesCleared = 0;
        gameOver = false;
        paused = false;
        nextPieces = [];
        heldPiece = null;
        canHold = true;

        updateScore(0);
        levelElement.innerText = level;
        drawHoldPiece();

        updateVolume(); // Aplicar volumen inicial
        createStars();
        createParticles();
        resetPlayer();
        update();
    }

    // Event Listeners para botones de UI
    startBtn.addEventListener('click', () => {
        startGame();
    });

    resumeBtn.addEventListener('click', () => {
        togglePause();
    });

    playAgainBtn.addEventListener('click', () => {
        startGame();
    });

    musicTrackBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const trackIndex = parseInt(btn.dataset.track, 10);
            
            musicTrackBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            if (currentTrack !== null) {
                musicTracks[currentTrack].pause();
            }
            currentTrack = trackIndex;
            if (!isMuted) {
                musicTracks[currentTrack].play();
            }
        });
    });

    // Inicialización
    showStartScreen();
});


// --- Notas adicionales ---
// Este es un script de Tetris funcional pero básico.
// Faltan características avanzadas como:
// - Sonidos y música (los controles están en el HTML pero la lógica de audio no está implementada).
// - Personalización de controles.
// - Soporte para pantallas táctiles.


// Ejemplo de música:
// const musicTracks = [new Audio('music/track1.mp3'), new Audio('music/track2.mp3')];
// musicTracks.forEach(track => track.loop = true);
// Para cambiar de pista:
// `musicTracks[currentTrack].pause();`
// `currentTrack = newTrack;`
// `musicTracks[currentTrack].play();`