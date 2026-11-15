/* =================================================================
   EDU TETRIS ARCADE — PRO ENGINE, CRYSTAL TEXTURES & MULTILAYER AUDIO
================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    // Canvas & Context
    const canvas = document.getElementById('tetris');
    const context = canvas.getContext('2d');
    const scoreElement = document.getElementById('score');
    const highScoreElement = document.getElementById('high-score');
    const comboElement = document.getElementById('combo');
    const levelElement = document.getElementById('level');
    const linesElement = document.getElementById('lines');
    const finalScoreElement = document.getElementById('final-score');
    const highScoreMsg = document.getElementById('high-score-msg');
    const nextPiecesContainer = document.getElementById('next-pieces');
    const holdCanvas = document.getElementById('hold-piece');
    const holdContext = holdCanvas.getContext('2d');
    const toastBadge = document.getElementById('toast-badge');

    // UI Overlays & Buttons
    const startScreen = document.getElementById('start-screen');
    const pauseScreen = document.getElementById('pause-screen');
    const gameOverScreen = document.getElementById('game-over-screen');
    const startBtn = document.getElementById('start-btn');
    const resumeBtn = document.getElementById('resume-btn');
    const playAgainBtn = document.getElementById('play-again-btn');

    // Audio & Nav Elements
    const muteBtn = document.getElementById('mute-btn');
    const quickMuteBtn = document.getElementById('quick-mute');
    const quickPauseBtn = document.getElementById('quick-pause');
    const volDownBtn = document.getElementById('vol-down-btn');
    const volUpBtn = document.getElementById('vol-up-btn');
    const volDisplay = document.getElementById('vol-display');
    const musicTrackBtns = document.querySelectorAll('.music-track-btn');

    // =================================================================
    // PRO WEB AUDIO SYNTHESIZER ENGINE (MASTER BUS + SPATIAL FX)
    // =================================================================
    let audioCtx = null;
    let masterGain = null;
    let masterComp = null;
    let reverbSend = null;
    let noiseBuffer = null;
    let softClipCurve = null;

    let volume = 0.6;
    let currentTrack = 0;
    let isMuted = false;

    function createNoiseBuffer(ctx) {
        const length = Math.floor(ctx.sampleRate * 1.5);
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < length; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99765 * b0 + white * 0.099046;
            b1 = 0.96300 * b1 + white * 0.2965164;
            b2 = 0.57000 * b2 + white * 1.0526913;
            data[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + white * 0.5) * 0.22));
        }
        return buffer;
    }

    function createSoftClipCurve() {
        const samples = 1024;
        const curve = new Float32Array(samples);
        for (let i = 0; i < samples; i++) {
            const x = (i * 2) / samples - 1;
            curve[i] = Math.tanh(x * 2.4);
        }
        return curve;
    }

    function ensureAudioEngine() {
        if (!audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return null;
            audioCtx = new AudioContext();

            // Master compressor prevents clipping during multi-line clears + impacts
            masterComp = audioCtx.createDynamicsCompressor();
            masterComp.threshold.setValueAtTime(-14, audioCtx.currentTime);
            masterComp.knee.setValueAtTime(12, audioCtx.currentTime);
            masterComp.ratio.setValueAtTime(4, audioCtx.currentTime);
            masterComp.attack.setValueAtTime(0.002, audioCtx.currentTime);
            masterComp.release.setValueAtTime(0.15, audioCtx.currentTime);
            masterComp.connect(audioCtx.destination);

            masterGain = audioCtx.createGain();
            masterGain.gain.setValueAtTime(isMuted ? 0 : volume * 0.65, audioCtx.currentTime);
            masterGain.connect(masterComp);

            // Stereo spatial delay / reverb send for crystalline depth
            reverbSend = audioCtx.createGain();
            reverbSend.gain.setValueAtTime(1, audioCtx.currentTime);

            const delayL = audioCtx.createDelay(0.5);
            const delayR = audioCtx.createDelay(0.5);
            delayL.delayTime.setValueAtTime(0.036, audioCtx.currentTime);
            delayR.delayTime.setValueAtTime(0.054, audioCtx.currentTime);

            const dampFilter = audioCtx.createBiquadFilter();
            dampFilter.type = 'lowpass';
            dampFilter.frequency.setValueAtTime(3400, audioCtx.currentTime);

            const feedbackL = audioCtx.createGain();
            const feedbackR = audioCtx.createGain();
            feedbackL.gain.setValueAtTime(0.24, audioCtx.currentTime);
            feedbackR.gain.setValueAtTime(0.24, audioCtx.currentTime);

            const wetGain = audioCtx.createGain();
            wetGain.gain.setValueAtTime(0.32, audioCtx.currentTime);

            const merger = audioCtx.createChannelMerger(2);

            reverbSend.connect(dampFilter);
            dampFilter.connect(delayL);
            dampFilter.connect(delayR);

            delayL.connect(feedbackR);
            feedbackR.connect(delayR);
            delayR.connect(feedbackL);
            feedbackL.connect(delayL);

            delayL.connect(merger, 0, 0);
            delayR.connect(merger, 0, 1);
            merger.connect(wetGain);
            wetGain.connect(masterGain);

            noiseBuffer = createNoiseBuffer(audioCtx);
            softClipCurve = createSoftClipCurve();
        }

        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        return audioCtx;
    }

    function createStereoRouter(ctx, pan = 0) {
        if (typeof ctx.createStereoPanner === 'function') {
            const panner = ctx.createStereoPanner();
            panner.pan.setValueAtTime(Math.max(-0.85, Math.min(0.85, pan)), ctx.currentTime);
            panner.connect(masterGain);
            return panner;
        }
        const fallback = ctx.createGain();
        fallback.connect(masterGain);
        return fallback;
    }

    function playNoiseBurst(ctx, dest, startTime, duration, filterType, freqStart, freqEnd, q, gainLevel, wetAmount = 0) {
        if (!noiseBuffer) return;
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer;

        const filter = ctx.createBiquadFilter();
        filter.type = filterType;
        filter.frequency.setValueAtTime(freqStart, startTime);
        if (freqEnd && freqEnd !== freqStart) {
            filter.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), startTime + duration);
        }
        filter.Q.setValueAtTime(q, startTime);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(gainLevel, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        src.connect(filter);
        filter.connect(gain);
        gain.connect(dest);

        if (wetAmount > 0 && reverbSend) {
            const send = ctx.createGain();
            send.gain.setValueAtTime(wetAmount, startTime);
            gain.connect(send);
            send.connect(reverbSend);
        }

        src.start(startTime);
        src.stop(startTime + duration + 0.02);
    }

    // Musical pentatonic frequencies mapped to piece color indices for crystalline feedback
    const PIECE_TONES = [
        523.25, // 1: C5
        587.33, // 2: D5
        659.25, // 3: E5
        783.99, // 4: G5
        880.00, // 5: A5
        1046.50, // 6: C6
        1174.66, // 7: D6
        1318.51, // 8: E6
        1567.98, // 9: G6
        659.25, // 10: E5
        1760.00 // 11: A6
    ];

    function playEnhancedSound(type, extra = 0) {
        if (isMuted || volume <= 0) return;
        const ctx = ensureAudioEngine();
        if (!ctx || !masterGain) return;

        const now = ctx.currentTime;
        masterGain.gain.setTargetAtTime(volume * 0.65, now, 0.005);

        if (type === 'move') {
            // Crisp mechanical-crystal tick with subtle stereo panning by board column
            const normX = typeof extra === 'number' ? extra : 0.5;
            const pan = (normX - 0.5) * 1.1;
            const dest = createStereoRouter(ctx, pan);

            playNoiseBurst(ctx, dest, now, 0.018, 'bandpass', 1850 + normX * 400, 1200, 2.6, 0.16);

            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'triangle';
            const baseFreq = 500 + (normX - 0.5) * 70;
            osc.frequency.setValueAtTime(baseFreq, now);
            osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.58, now + 0.032);
            g.gain.setValueAtTime(0.24, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.034);
            osc.connect(g);
            g.connect(dest);
            osc.start(now);
            osc.stop(now + 0.04);
        } else if (type === 'softDrop') {
            // Subtle tactile micro-step when manually accelerating downward
            const dest = createStereoRouter(ctx, 0);
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(760, now);
            osc.frequency.exponentialRampToValueAtTime(410, now + 0.022);
            g.gain.setValueAtTime(0.11, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.024);
            osc.connect(g);
            g.connect(dest);
            osc.start(now);
            osc.stop(now + 0.028);
        } else if (type === 'rotate') {
            // 2-operator FM crystalline twirl (CW vs CCW)
            const dir = typeof extra === 'object' ? extra.dir : (extra || 1);
            const pan = typeof extra === 'object' ? (extra.normX - 0.5) * 0.9 : 0;
            const dest = createStereoRouter(ctx, pan);

            const carrier = ctx.createOscillator();
            const mod = ctx.createOscillator();
            const modGain = ctx.createGain();
            const env = ctx.createGain();

            carrier.type = 'triangle';
            mod.type = 'sine';

            const fStart = dir > 0 ? 350 : 620;
            const fEnd = dir > 0 ? 740 : 390;

            carrier.frequency.setValueAtTime(fStart, now);
            carrier.frequency.exponentialRampToValueAtTime(fEnd, now + 0.075);

            mod.frequency.setValueAtTime(fStart * 2.5, now);
            mod.frequency.exponentialRampToValueAtTime(fEnd * 2.0, now + 0.075);

            modGain.gain.setValueAtTime(140, now);
            modGain.gain.exponentialRampToValueAtTime(8, now + 0.07);

            env.gain.setValueAtTime(0.32, now);
            env.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

            mod.connect(modGain);
            modGain.connect(carrier.frequency);
            carrier.connect(env);
            env.connect(dest);

            if (reverbSend) {
                const send = ctx.createGain();
                send.gain.setValueAtTime(0.22, now);
                env.connect(send);
                send.connect(reverbSend);
            }

            mod.start(now);
            carrier.start(now);
            mod.stop(now + 0.085);
            carrier.stop(now + 0.085);
        } else if (type === 'wallKick') {
            // Resonant metallic anchor chime when rotation kicks off wall/blocks
            const dest = createStereoRouter(ctx, 0);
            [880, 1318.5].forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.type = idx === 0 ? 'sine' : 'triangle';
                osc.frequency.setValueAtTime(freq, now);
                osc.frequency.exponentialRampToValueAtTime(freq * 1.12, now + 0.06);
                g.gain.setValueAtTime(0.16, now);
                g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
                osc.connect(g);
                g.connect(dest);
                if (reverbSend) {
                    const send = ctx.createGain();
                    send.gain.setValueAtTime(0.35, now);
                    g.connect(send);
                    send.connect(reverbSend);
                }
                osc.start(now);
                osc.stop(now + 0.095);
            });
        } else if (type === 'drop') {
            // Soft lock impact: warm sub-thud + crystal lock click
            const pan = typeof extra === 'number' ? (extra - 0.5) * 0.8 : 0;
            const dest = createStereoRouter(ctx, pan);

            // Layer 1: Sub-thud
            const sub = ctx.createOscillator();
            const subGain = ctx.createGain();
            sub.type = 'sine';
            sub.frequency.setValueAtTime(145, now);
            sub.frequency.exponentialRampToValueAtTime(36, now + 0.115);
            subGain.gain.setValueAtTime(0.65, now);
            subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            sub.connect(subGain);
            subGain.connect(dest);
            sub.start(now);
            sub.stop(now + 0.125);

            // Layer 2: Crystal lock click
            playNoiseBurst(ctx, dest, now, 0.032, 'bandpass', 1400, 650, 1.8, 0.25);

            const clickOsc = ctx.createOscillator();
            const clickGain = ctx.createGain();
            clickOsc.type = 'triangle';
            clickOsc.frequency.setValueAtTime(1080, now);
            clickOsc.frequency.exponentialRampToValueAtTime(420, now + 0.035);
            clickGain.gain.setValueAtTime(0.22, now);
            clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.038);
            clickOsc.connect(clickGain);
            clickGain.connect(dest);
            clickOsc.start(now);
            clickOsc.stop(now + 0.042);
        } else if (type === 'hardDrop') {
            // Heavy 3-layer cinematic slam
            const info = typeof extra === 'object' ? extra : { colNorm: 0.5, colorIndex: 1, distance: 10 };
            const pan = (info.colNorm - 0.5) * 0.9;
            const dest = createStereoRouter(ctx, pan);

            // Layer 1: Transient slam (filtered noise sweep)
            playNoiseBurst(ctx, dest, now, 0.08, 'lowpass', 3600, 130, 1.2, 0.58, 0.18);

            // Layer 2: Warm saturated sub-bass punch
            const sub = ctx.createOscillator();
            const shaper = ctx.createWaveShaper();
            const subGain = ctx.createGain();
            shaper.curve = softClipCurve;
            shaper.oversample = '2x';

            sub.type = 'sine';
            sub.frequency.setValueAtTime(195, now);
            sub.frequency.exponentialRampToValueAtTime(28, now + 0.21);

            subGain.gain.setValueAtTime(0.88, now);
            subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

            sub.connect(shaper);
            shaper.connect(subGain);
            subGain.connect(dest);
            sub.start(now);
            sub.stop(now + 0.23);

            // Layer 3: Crystalline piece resonance
            const toneIdx = Math.max(0, Math.min(PIECE_TONES.length - 1, (info.colorIndex || 1) - 1));
            const rootFreq = PIECE_TONES[toneIdx];
            [rootFreq, rootFreq * 1.5].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.type = i === 0 ? 'triangle' : 'sine';
                osc.frequency.setValueAtTime(freq, now + i * 0.01);
                g.gain.setValueAtTime(0.16 / (i + 1), now + i * 0.01);
                g.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
                osc.connect(g);
                g.connect(dest);
                if (reverbSend) {
                    const send = ctx.createGain();
                    send.gain.setValueAtTime(0.4, now);
                    g.connect(send);
                    send.connect(reverbSend);
                }
                osc.start(now + i * 0.01);
                osc.stop(now + 0.17);
            });
        } else if (type === 'hold') {
            // Holographic stereo swap
            const dest = createStereoRouter(ctx, 0);
            [
                { f1: 587.33, f2: 880, pan: -0.35, delay: 0 },
                { f1: 591.0, f2: 885, pan: 0.35, delay: 0.03 }
            ].forEach(layer => {
                const pDest = createStereoRouter(ctx, layer.pan);
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(layer.f1, now + layer.delay);
                osc.frequency.exponentialRampToValueAtTime(layer.f2, now + layer.delay + 0.11);
                g.gain.setValueAtTime(0.28, now + layer.delay);
                g.gain.exponentialRampToValueAtTime(0.001, now + layer.delay + 0.15);
                osc.connect(g);
                g.connect(pDest);
                if (reverbSend) {
                    const send = ctx.createGain();
                    send.gain.setValueAtTime(0.35, now + layer.delay);
                    g.connect(send);
                    send.connect(reverbSend);
                }
                osc.start(now + layer.delay);
                osc.stop(now + layer.delay + 0.16);
            });
            void dest;
        } else if (type === 'clear') {
            // Polyphonic rising chord + sparkling air burst
            const linesCount = Math.min(3, Math.max(1, extra || 1));
            const dest = createStereoRouter(ctx, 0);

            // Air burst
            playNoiseBurst(ctx, dest, now, 0.24, 'highpass', 1800, 5200, 1.0, 0.24, 0.45);

            // Sub punch
            const sub = ctx.createOscillator();
            const subG = ctx.createGain();
            sub.type = 'sine';
            sub.frequency.setValueAtTime(125, now);
            sub.frequency.exponentialRampToValueAtTime(34, now + 0.18);
            subG.gain.setValueAtTime(0.5, now);
            subG.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
            sub.connect(subG);
            subG.connect(dest);
            sub.start(now);
            sub.stop(now + 0.2);

            const notes = [523.25, 659.25, 783.99, 1046.5];
            for (let i = 0; i < linesCount + 1; i++) {
                const pan = (i - linesCount / 2) * 0.35;
                const pDest = createStereoRouter(ctx, pan);
                const osc = ctx.createOscillator();
                const filter = ctx.createBiquadFilter();
                const g = ctx.createGain();

                osc.type = 'triangle';
                osc.frequency.setValueAtTime(notes[i], now + i * 0.045);

                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(3800, now + i * 0.045);
                filter.frequency.exponentialRampToValueAtTime(900, now + i * 0.045 + 0.28);

                g.gain.setValueAtTime(0.35, now + i * 0.045);
                g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.045 + 0.32);

                osc.connect(filter);
                filter.connect(g);
                g.connect(pDest);
                if (reverbSend) {
                    const send = ctx.createGain();
                    send.gain.setValueAtTime(0.45, now + i * 0.045);
                    g.connect(send);
                    send.connect(reverbSend);
                }

                osc.start(now + i * 0.045);
                osc.stop(now + i * 0.045 + 0.34);
            }
        } else if (type === 'tetris') {
            // Epic 4+ line explosion + shimmering triumphant fanfare
            const dest = createStereoRouter(ctx, 0);

            // Deep cinematic sub explosion
            const sub = ctx.createOscillator();
            const shaper = ctx.createWaveShaper();
            const subG = ctx.createGain();
            shaper.curve = softClipCurve;
            sub.type = 'sine';
            sub.frequency.setValueAtTime(160, now);
            sub.frequency.exponentialRampToValueAtTime(26, now + 0.38);
            subG.gain.setValueAtTime(0.85, now);
            subG.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            sub.connect(shaper);
            shaper.connect(subG);
            subG.connect(dest);
            sub.start(now);
            sub.stop(now + 0.42);

            playNoiseBurst(ctx, dest, now, 0.35, 'bandpass', 2400, 6200, 0.8, 0.36, 0.55);

            const fanfare = [523.25, 659.25, 783.99, 987.77, 1046.50, 1318.51];
            fanfare.forEach((freq, idx) => {
                const pan = ((idx % 2 === 0 ? -1 : 1) * 0.45);
                const pDest = createStereoRouter(ctx, pan);
                const osc = ctx.createOscillator();
                const filter = ctx.createBiquadFilter();
                const g = ctx.createGain();

                osc.type = idx >= 4 ? 'triangle' : 'sawtooth';
                osc.frequency.setValueAtTime(freq, now + idx * 0.05);

                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(4800, now + idx * 0.05);
                filter.frequency.exponentialRampToValueAtTime(1100, now + idx * 0.05 + 0.42);

                g.gain.setValueAtTime(0.28, now + idx * 0.05);
                g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.45);

                osc.connect(filter);
                filter.connect(g);
                g.connect(pDest);
                if (reverbSend) {
                    const send = ctx.createGain();
                    send.gain.setValueAtTime(0.55, now + idx * 0.05);
                    g.connect(send);
                    send.connect(reverbSend);
                }

                osc.start(now + idx * 0.05);
                osc.stop(now + idx * 0.05 + 0.48);
            });
        } else if (type === 'tspin') {
            // Harmonic FM shimmer + bright resonant triad
            const notes = [587.33, 739.99, 880.00, 1174.66];
            notes.forEach((freq, i) => {
                const pDest = createStereoRouter(ctx, (i - 1.5) * 0.35);
                const osc = ctx.createOscillator();
                const shaper = ctx.createWaveShaper();
                const g = ctx.createGain();
                shaper.curve = softClipCurve;
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq * 0.96, now + i * 0.04);
                osc.frequency.exponentialRampToValueAtTime(freq, now + i * 0.04 + 0.08);
                g.gain.setValueAtTime(0.32, now + i * 0.04);
                g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.04 + 0.36);
                osc.connect(shaper);
                shaper.connect(g);
                g.connect(pDest);
                if (reverbSend) {
                    const send = ctx.createGain();
                    send.gain.setValueAtTime(0.5, now + i * 0.04);
                    g.connect(send);
                    send.connect(reverbSend);
                }
                osc.start(now + i * 0.04);
                osc.stop(now + i * 0.04 + 0.38);
            });
        } else if (type === 'combo') {
            // Musical pentatonic ascending chime
            const scale = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50, 1174.66, 1318.51, 1567.98, 1760.00];
            const idx = Math.min(scale.length - 1, Math.max(0, (extra || 2) - 2));
            const freq = scale[idx];
            const dest = createStereoRouter(ctx, 0);

            [1, 2].forEach((mult, i) => {
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.type = i === 0 ? 'sine' : 'triangle';
                osc.frequency.setValueAtTime(freq * mult, now);
                g.gain.setValueAtTime(i === 0 ? 0.36 : 0.14, now);
                g.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
                osc.connect(g);
                g.connect(dest);
                if (reverbSend) {
                    const send = ctx.createGain();
                    send.gain.setValueAtTime(0.42, now);
                    g.connect(send);
                    send.connect(reverbSend);
                }
                osc.start(now);
                osc.stop(now + 0.26);
            });
        } else if (type === 'levelUp') {
            // Crisp ascending 4-note level-up arpeggio
            [783.99, 987.77, 1174.66, 1567.98].forEach((freq, i) => {
                const pDest = createStereoRouter(ctx, (i - 1.5) * 0.3);
                const osc = ctx.createOscillator();
                const g = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, now + i * 0.055);
                g.gain.setValueAtTime(0.32, now + i * 0.055);
                g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.055 + 0.25);
                osc.connect(g);
                g.connect(pDest);
                if (reverbSend) {
                    const send = ctx.createGain();
                    send.gain.setValueAtTime(0.45, now + i * 0.055);
                    g.connect(send);
                    send.connect(reverbSend);
                }
                osc.start(now + i * 0.055);
                osc.stop(now + i * 0.055 + 0.27);
            });
        } else if (type === 'gameover') {
            // Cinematic descending minor cadence with lowpass close
            const dest = createStereoRouter(ctx, 0);
            [392.0, 349.23, 311.13, 261.63].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const filter = ctx.createBiquadFilter();
                const g = ctx.createGain();

                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(freq, now + i * 0.13);

                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(2200, now + i * 0.13);
                filter.frequency.exponentialRampToValueAtTime(280, now + i * 0.13 + 0.36);

                g.gain.setValueAtTime(0.3, now + i * 0.13);
                g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.13 + 0.38);

                osc.connect(filter);
                filter.connect(g);
                g.connect(dest);
                if (reverbSend) {
                    const send = ctx.createGain();
                    send.gain.setValueAtTime(0.4, now + i * 0.13);
                    g.connect(send);
                    send.connect(reverbSend);
                }
                osc.start(now + i * 0.13);
                osc.stop(now + i * 0.13 + 0.42);
            });
        }
    }

    // Background Music Tracks
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

        if (masterGain && audioCtx) {
            masterGain.gain.setTargetAtTime(isMuted ? 0 : volume * 0.65, audioCtx.currentTime, 0.01);
        }
        musicTracks.forEach(track => {
            track.volume = isMuted ? 0 : volume * 0.55;
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
            targetTrack.volume = volume * 0.55;
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
    if (quickPauseBtn) quickPauseBtn.addEventListener('click', togglePause);

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
        initStars();
        drawNextPieces();
        drawHoldPiece();
        draw();
    });
    resizeBoard();

    // =================================================================
    // GAME STATE, HIGH SCORE & PHYSICS FX BUFFERS
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

    // Visual Physics & Effects
    let screenShake = 0;
    let boardSpringY = 0;
    let boardVelocityY = 0;
    let boardFlashAlpha = 0;
    let boardFlashColor = '#00f0ff';

    let laserBeams = [];
    let lineShockwaves = [];
    let impactRings = [];
    let lockFlashes = [];
    let particles = [];
    let floatingTexts = [];
    let stars = [];

    function addScreenShake(amount) {
        screenShake = Math.max(screenShake, amount);
    }

    function addBoardImpulse(velocity) {
        boardVelocityY = Math.min(12, boardVelocityY + velocity);
    }

    function initStars() {
        stars = [];
        for (let i = 0; i < 65; i++) {
            stars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 2 + 0.6,
                speed: Math.random() * 0.45 + 0.12,
                opacity: Math.random() * 0.65 + 0.15,
                hue: Math.random() > 0.35 ? '0, 240, 255' : '176, 38, 255'
            });
        }
    }
    initStars();

    let toastTimeout = null;
    function showToast(text, color = '#ff007f') {
        if (!toastBadge) return;
        toastBadge.textContent = text;
        toastBadge.style.borderColor = color;
        toastBadge.style.boxShadow = `0 0 35px ${color}`;
        toastBadge.classList.add('show');
        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => toastBadge.classList.remove('show'), 950);
    }

    function updateComboDisplay() {
        if (!comboElement) return;
        comboElement.textContent = combo >= 2 ? `${combo}x` : (combo === 1 ? '1x' : '—');
    }

    function createBoard(cols, rows) {
        return Array.from({ length: rows }, () => Array(cols).fill(0));
    }

    // =================================================================
    // HIGH-DEFINITION CRYSTAL & NEON PALETTE
    // =================================================================
    const PIECES = [
        // Standard Tetrominoes
        [[1, 1, 1, 1]],                    // 0: I (Cyan Crystal)
        [[1, 1, 1], [0, 1, 0]],            // 1: T (Amethyst Purple)
        [[1, 1, 0], [0, 1, 1]],            // 2: Z (Ruby Red)
        [[0, 1, 1], [1, 1, 0]],            // 3: S (Emerald Lime)
        [[1, 1], [1, 1]],                  // 4: O (Solar Topaz)
        [[1, 0, 0], [1, 1, 1]],            // 5: L (Amber Fire)
        [[0, 0, 1], [1, 1, 1]],            // 6: J (Sapphire Blue)
        // Bonus Arcade Pieces
        [[1, 1, 1, 1, 1]],                 // 7: Super I (Neon Magenta)
        [[0, 1, 0], [1, 1, 1], [0, 1, 0]], // 8: Cruz / Cross (Imperial Gold)
        [[1, 1, 1], [1, 0, 1]],            // 9: U shape (Beryl Green)
        [[1]]                              // 10: Spark / Dot (Prismatic White)
    ];

    const COLORS = [
        null,
        '#00f0ff', // 1: Cyan
        '#b026ff', // 2: Amethyst Purple
        '#ff1a53', // 3: Ruby Red
        '#00ff88', // 4: Emerald Green
        '#ffe600', // 5: Solar Yellow
        '#ff8400', // 6: Amber Orange
        '#3b82f6', // 7: Sapphire Blue
        '#ff00b7', // 8: Neon Magenta
        '#ffd700', // 9: Gold
        '#10b981', // 10: Deep Emerald
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
            matrix: PIECES[rand].map(row => [...row]),
            color: COLORS[rand + 1],
            colorIndex: rand + 1,
            typeIndex: rand,
            pos: {
                x: Math.floor(COLS / 2) - Math.floor(PIECES[rand][0].length / 2),
                y: 0
            }
        };
    }

    function fillNextPieces() {
        while (nextPieces.length < 4) {
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
        drawHoldPiece();

        if (collides(board, piece)) {
            gameOver = true;
            showGameOverScreen();
        }
    }

    // =================================================================
    // ULTRA-HIGH QUALITY CRYSTAL TEXTURE RENDERER
    // =================================================================
    const rgbCache = {};
    function hexToRgb(hex) {
        if (!hex) return { r: 255, g: 255, b: 255 };
        if (rgbCache[hex]) return rgbCache[hex];
        const clean = hex.replace('#', '');
        const num = parseInt(clean, 16);
        const rgb = {
            r: (num >> 16) & 255,
            g: (num >> 8) & 255,
            b: num & 255
        };
        rgbCache[hex] = rgb;
        return rgb;
    }

    function drawCrystalBlock(ctx, x, y, size, colorHex, options = {}) {
        const { isGhost = false, ghostPulse = 0.5, isActive = false } = options;
        const px = x * size;
        const py = y * size;
        const rgb = hexToRgb(colorHex);

        if (isGhost) {
            ctx.save();
            const inset = 1.5;
            const bx = px + inset;
            const by = py + inset;
            const bw = size - inset * 2;
            const bh = size - inset * 2;
            const corner = Math.max(4, Math.floor(size * 0.25));

            ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.06 + ghostPulse * 0.05})`;
            ctx.fillRect(bx, by, bw, bh);

            ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.55 + ghostPulse * 0.35})`;
            ctx.lineWidth = 1.6;
            ctx.shadowColor = colorHex;
            ctx.shadowBlur = 6;

            // Holographic precision corner brackets
            ctx.beginPath();
            // Top-left
            ctx.moveTo(bx, by + corner);
            ctx.lineTo(bx, by);
            ctx.lineTo(bx + corner, by);
            // Top-right
            ctx.moveTo(bx + bw - corner, by);
            ctx.lineTo(bx + bw, by);
            ctx.lineTo(bx + bw, by + corner);
            // Bottom-right
            ctx.moveTo(bx + bw, by + bh - corner);
            ctx.lineTo(bx + bw, by + bh);
            ctx.lineTo(bx + bw - corner, by + bh);
            // Bottom-left
            ctx.moveTo(bx + corner, by + bh);
            ctx.lineTo(bx, by + bh);
            ctx.lineTo(bx, by + bh - corner);
            ctx.stroke();

            ctx.restore();
            return;
        }

        ctx.save();

        if (isActive) {
            ctx.shadowColor = colorHex;
            ctx.shadowBlur = 12;
        }

        const pad = 0.8;
        const bx = px + pad;
        const by = py + pad;
        const bs = size - pad * 2;

        // 1. Outer Beveled Metallic-Crystal Base
        const outerGrad = ctx.createLinearGradient(bx, by, bx + bs, by + bs);
        outerGrad.addColorStop(0, `rgb(${Math.min(255, rgb.r + 105)}, ${Math.min(255, rgb.g + 105)}, ${Math.min(255, rgb.b + 105)})`);
        outerGrad.addColorStop(0.32, colorHex);
        outerGrad.addColorStop(0.75, `rgb(${Math.max(0, rgb.r - 45)}, ${Math.max(0, rgb.g - 45)}, ${Math.max(0, rgb.b - 45)})`);
        outerGrad.addColorStop(1, `rgb(${Math.max(0, rgb.r - 110)}, ${Math.max(0, rgb.g - 110)}, ${Math.max(0, rgb.b - 110)})`);

        ctx.fillStyle = outerGrad;
        ctx.fillRect(bx, by, bs, bs);

        // Reset shadowBlur for sharp internal crystal facets
        ctx.shadowBlur = 0;

        // 2. Top & Left Specular Rim + Bottom & Right Deep Bevel
        const bevel = Math.max(2, Math.floor(size * 0.13));
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + bs, by);
        ctx.lineTo(bx + bs - bevel, by + bevel);
        ctx.lineTo(bx + bevel, by + bevel);
        ctx.lineTo(bx + bevel, by + bs - bevel);
        ctx.lineTo(bx, by + bs);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
        ctx.beginPath();
        ctx.moveTo(bx + bs, by);
        ctx.lineTo(bx + bs, by + bs);
        ctx.lineTo(bx, by + bs);
        ctx.lineTo(bx + bevel, by + bs - bevel);
        ctx.lineTo(bx + bs - bevel, by + bs - bevel);
        ctx.lineTo(bx + bs - bevel, by + bevel);
        ctx.closePath();
        ctx.fill();

        // 3. Faceted Crystal Core Inset
        const inset = Math.max(3, Math.floor(size * 0.18));
        const innerSize = bs - inset * 2;
        const innerGrad = ctx.createRadialGradient(
            bx + bs * 0.38, by + bs * 0.35, 1,
            bx + bs * 0.5, by + bs * 0.5, bs * 0.62
        );
        innerGrad.addColorStop(0, 'rgba(255, 255, 255, 0.78)');
        innerGrad.addColorStop(0.24, colorHex);
        innerGrad.addColorStop(1, `rgba(${Math.max(0, rgb.r - 95)}, ${Math.max(0, rgb.g - 95)}, ${Math.max(0, rgb.b - 95)}, 0.96)`);

        ctx.fillStyle = innerGrad;
        ctx.fillRect(bx + inset, by + inset, innerSize, innerSize);

        // 4. Diagonal Glass Glare Slice
        ctx.beginPath();
        ctx.moveTo(bx + 1.5, by + 1.5);
        ctx.lineTo(bx + bs * 0.85, by + 1.5);
        ctx.lineTo(bx + 1.5, by + bs * 0.85);
        ctx.closePath();
        const glare = ctx.createLinearGradient(bx, by, bx + bs * 0.55, by + bs * 0.55);
        glare.addColorStop(0, 'rgba(255, 255, 255, 0.52)');
        glare.addColorStop(0.55, 'rgba(255, 255, 255, 0.1)');
        glare.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = glare;
        ctx.fill();

        // 5. Center Micro-Diamond Emblem
        const cx = bx + bs / 2;
        const cy = by + bs / 2;
        const cr = Math.max(1.8, size * 0.12);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
        ctx.beginPath();
        ctx.moveTo(cx, cy - cr);
        ctx.lineTo(cx + cr, cy);
        ctx.lineTo(cx, cy + cr);
        ctx.lineTo(cx - cr, cy);
        ctx.closePath();
        ctx.fill();

        // 6. Crisp Neon Edge Rim
        ctx.strokeStyle = isActive
            ? `rgba(255, 255, 255, 0.65)`
            : `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.85)`;
        ctx.lineWidth = 0.9;
        ctx.strokeRect(bx + 0.3, by + 0.3, bs - 0.6, bs - 0.6);

        ctx.restore();
    }

    function drawMatrix(matrix, offset, ctx, blockSize, colorHex = null, options = {}) {
        matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    const blockColor = colorHex || COLORS[value];
                    drawCrystalBlock(ctx, x + offset.x, y + offset.y, blockSize, blockColor, options);
                }
            });
        });
    }

    function drawGhostPiece(now) {
        if (!piece) return;
        const ghost = {
            ...piece,
            pos: { ...piece.pos }
        };
        while (!collides(board, ghost)) {
            ghost.pos.y++;
        }
        ghost.pos.y--;

        if (ghost.pos.y <= piece.pos.y) return;

        const pulse = 0.5 + 0.5 * Math.sin(now * 0.007);
        const rgb = hexToRgb(piece.color);

        // Vertical holographic alignment guides from active piece to ghost piece
        let minCol = COLS;
        let maxCol = -1;
        piece.matrix.forEach(row => {
            row.forEach((v, x) => {
                if (v !== 0) {
                    minCol = Math.min(minCol, piece.pos.x + x);
                    maxCol = Math.max(maxCol, piece.pos.x + x);
                }
            });
        });

        if (maxCol >= minCol) {
            const leftX = minCol * BLOCK_SIZE;
            const rightX = (maxCol + 1) * BLOCK_SIZE;
            const topY = (piece.pos.y + 1) * BLOCK_SIZE;
            const bottomY = (ghost.pos.y + piece.matrix.length) * BLOCK_SIZE;

            if (bottomY > topY) {
                context.save();
                const guideGrad = context.createLinearGradient(0, topY, 0, bottomY);
                guideGrad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.02)`);
                guideGrad.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.16)`);

                context.strokeStyle = guideGrad;
                context.lineWidth = 1;
                context.setLineDash([4, 5]);

                context.beginPath();
                context.moveTo(leftX + 1, topY);
                context.lineTo(leftX + 1, bottomY);
                context.moveTo(rightX - 1, topY);
                context.lineTo(rightX - 1, bottomY);
                context.stroke();
                context.restore();
            }
        }

        drawMatrix(ghost.matrix, ghost.pos, context, BLOCK_SIZE, piece.color, {
            isGhost: true,
            ghostPulse: pulse
        });
    }

    function drawNextPieces() {
        if (!nextPiecesContainer) return;
        nextPiecesContainer.innerHTML = '';

        nextPieces.slice(0, 3).forEach((p, idx) => {
            const pCanvas = document.createElement('canvas');
            const scale = idx === 0 ? 0.68 : 0.54;
            const previewSize = Math.max(12, Math.floor(BLOCK_SIZE * scale));
            const colsBox = Math.max(4, p.matrix[0].length);
            const rowsBox = Math.max(3, p.matrix.length);

            pCanvas.width = colsBox * previewSize;
            pCanvas.height = rowsBox * previewSize;

            const pCtx = pCanvas.getContext('2d');
            pCtx.fillStyle = '#050710';
            pCtx.fillRect(0, 0, pCanvas.width, pCanvas.height);

            const w = p.matrix[0].length;
            const h = p.matrix.length;
            const offsetX = (colsBox - w) / 2;
            const offsetY = (rowsBox - h) / 2;

            drawMatrix(p.matrix, { x: offsetX, y: offsetY }, pCtx, previewSize, p.color, {
                isActive: idx === 0
            });
            nextPiecesContainer.appendChild(pCanvas);
        });
    }

    function drawHoldPiece() {
        if (!holdContext) return;
        holdContext.fillStyle = '#050710';
        holdContext.fillRect(0, 0, holdCanvas.width, holdCanvas.height);

        if (heldPiece) {
            holdContext.save();
            if (!canHold) {
                holdContext.globalAlpha = 0.42;
            }
            const previewSize = Math.max(12, Math.floor(BLOCK_SIZE * 0.64));
            const w = heldPiece.matrix[0].length;
            const h = heldPiece.matrix.length;
            const offsetX = (holdCanvas.width / previewSize - w) / 2;
            const offsetY = (holdCanvas.height / previewSize - h) / 2;

            drawMatrix(heldPiece.matrix, { x: offsetX, y: offsetY }, holdContext, previewSize, heldPiece.color, {
                isActive: canHold
            });
            holdContext.restore();
        }
    }

    // =================================================================
    // PARTICLE, LASER TRAIL, SHOCKWAVE & FLOATING TEXT GENERATORS
    // =================================================================
    function createSparks(x, y, colorHex, count = 18, speedMult = 1) {
        const rgb = hexToRgb(colorHex);
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = (Math.random() * 4.5 + 1.5) * speedMult;
            particles.push({
                x: (x + 0.5) * BLOCK_SIZE,
                y: (y + 0.5) * BLOCK_SIZE,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 1.3,
                size: Math.random() * 3.8 + 1.5,
                rgb,
                life: 1.0,
                decay: Math.random() * 0.028 + 0.018,
                gravity: 0.14
            });
        }
    }

    function createImpactSparks(cellX, cellY, colorHex, count = 8, isHard = true) {
        const rgb = hexToRgb(colorHex);
        const baseY = (cellY + 1) * BLOCK_SIZE;
        const baseX = (cellX + 0.5) * BLOCK_SIZE;
        for (let i = 0; i < count; i++) {
            const dir = (Math.random() - 0.5) * 2;
            particles.push({
                x: baseX + (Math.random() - 0.5) * BLOCK_SIZE * 0.8,
                y: baseY - 2,
                vx: dir * (isHard ? 3.8 : 1.8),
                vy: -(Math.random() * (isHard ? 3.6 : 1.6) + 0.6),
                size: Math.random() * (isHard ? 3.2 : 2.2) + 1.2,
                rgb,
                life: 1.0,
                decay: isHard ? 0.032 : 0.048,
                gravity: 0.16
            });
        }
    }

    function addLaserBeam(colX, startY, endY, colorHex) {
        if (endY <= startY) return;
        laserBeams.push({
            x: colX * BLOCK_SIZE,
            width: BLOCK_SIZE,
            startY: startY * BLOCK_SIZE,
            endY: (endY + 1) * BLOCK_SIZE,
            alpha: 0.95,
            color: colorHex
        });
    }

    function addLineShockwave(rowY, colorHex = '#ffffff') {
        lineShockwaves.push({
            y: rowY * BLOCK_SIZE,
            alpha: 1.0,
            thickness: BLOCK_SIZE,
            color: colorHex
        });
    }

    function addImpactRing(centerX, bottomY, widthPx, colorHex) {
        impactRings.push({
            x: centerX,
            y: bottomY,
            radiusX: widthPx * 0.35,
            radiusY: 4,
            maxRadiusX: widthPx * 1.45,
            alpha: 0.9,
            color: colorHex
        });
    }

    function addFloatingText(text, gridX, gridY, color = '#ffffff', fontSize = 16) {
        floatingTexts.push({
            text,
            x: Math.max(48, Math.min(canvas.width - 48, gridX * BLOCK_SIZE)),
            y: Math.max(30, Math.min(canvas.height - 20, gridY * BLOCK_SIZE)),
            color,
            fontSize,
            life: 1.0
        });
    }

    // =================================================================
    // MAIN DRAW LOOP WITH PHYSICS, SPRING RECOIL & CRYSTAL FX
    // =================================================================
    function draw(dt = 1, now = performance.now()) {
        context.save();

        // 1. Update board vertical spring physics (recoil on piece lock / hardDrop)
        const springForce = -boardSpringY * 0.28 * dt;
        boardVelocityY = (boardVelocityY + springForce) * Math.pow(0.72, dt);
        boardSpringY += boardVelocityY * dt;
        if (Math.abs(boardSpringY) < 0.05 && Math.abs(boardVelocityY) < 0.05) {
            boardSpringY = 0;
            boardVelocityY = 0;
        }

        // 2. Apply Screen Shake + Spring Recoil
        let tx = 0;
        let ty = boardSpringY;
        if (screenShake > 0) {
            tx += (Math.random() - 0.5) * screenShake;
            ty += (Math.random() - 0.5) * screenShake;
            screenShake *= Math.pow(0.86, dt);
            if (screenShake < 0.2) screenShake = 0;
        }
        context.translate(tx, ty);

        // 3. Deep Space Gradient Canvas Backdrop
        const bgGrad = context.createLinearGradient(0, 0, 0, canvas.height);
        bgGrad.addColorStop(0, '#040610');
        bgGrad.addColorStop(0.6, '#070b1a');
        bgGrad.addColorStop(1, '#0b1228');
        context.fillStyle = bgGrad;
        context.fillRect(-16, -16, canvas.width + 32, canvas.height + 32);

        // 4. Moving Parallax Starfield
        stars.forEach(s => {
            s.y += s.speed * dt;
            if (s.y > canvas.height) {
                s.y = 0;
                s.x = Math.random() * canvas.width;
            }
            context.fillStyle = `rgba(${s.hue}, ${s.opacity})`;
            context.fillRect(s.x, s.y, s.size, s.size);
        });

        // 5. Tactical Ambient Grid & Crosshair Intersections
        context.strokeStyle = 'rgba(0, 240, 255, 0.055)';
        context.lineWidth = 0.6;
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

        context.fillStyle = 'rgba(0, 240, 255, 0.14)';
        for (let c = 1; c < COLS; c++) {
            for (let r = 1; r < ROWS; r++) {
                context.fillRect(c * BLOCK_SIZE - 0.5, r * BLOCK_SIZE - 0.5, 1, 1);
            }
        }

        // 6. Hard-Drop Vertical Laser Trails
        for (let i = laserBeams.length - 1; i >= 0; i--) {
            const b = laserBeams[i];
            const rgb = hexToRgb(b.color);
            const beamGrad = context.createLinearGradient(0, b.startY, 0, b.endY);
            beamGrad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
            beamGrad.addColorStop(0.45, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${b.alpha * 0.22})`);
            beamGrad.addColorStop(1, `rgba(255, 255, 255, ${b.alpha * 0.48})`);
            context.fillStyle = beamGrad;
            context.fillRect(b.x + 1, b.startY, b.width - 2, b.endY - b.startY);
            b.alpha -= 0.075 * dt;
            if (b.alpha <= 0) laserBeams.splice(i, 1);
        }

        // 7. Holographic Ghost Piece
        if (piece) {
            drawGhostPiece(now);
        }

        // 8. Settled Blocks
        drawMatrix(board, { x: 0, y: 0 }, context, BLOCK_SIZE);

        // 9. Active Piece (with crystal glow)
        if (piece) {
            drawMatrix(piece.matrix, piece.pos, context, BLOCK_SIZE, piece.color, { isActive: true });
        }

        // 10. Piece Lock-In Flashes
        for (let i = lockFlashes.length - 1; i >= 0; i--) {
            const lf = lockFlashes[i];
            const rgb = hexToRgb(lf.color);
            const px = lf.x * BLOCK_SIZE;
            const py = lf.y * BLOCK_SIZE;
            context.save();
            context.fillStyle = `rgba(255, 255, 255, ${lf.life * 0.72})`;
            context.shadowColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
            context.shadowBlur = 14 * lf.life;
            context.fillRect(px + 1, py + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
            context.restore();
            lf.life -= 0.085 * dt;
            if (lf.life <= 0) lockFlashes.splice(i, 1);
        }

        // 11. Impact Elliptical Shockwave Rings
        for (let i = impactRings.length - 1; i >= 0; i--) {
            const ring = impactRings[i];
            const rgb = hexToRgb(ring.color);
            context.save();
            context.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${ring.alpha})`;
            context.lineWidth = 2;
            context.shadowColor = ring.color;
            context.shadowBlur = 10;
            context.beginPath();
            context.ellipse(ring.x, ring.y, ring.radiusX, ring.radiusY, 0, 0, Math.PI * 2);
            context.stroke();
            context.restore();

            ring.radiusX += (ring.maxRadiusX - ring.radiusX) * 0.22 * dt;
            ring.radiusY += 0.55 * dt;
            ring.alpha -= 0.08 * dt;
            if (ring.alpha <= 0) impactRings.splice(i, 1);
        }

        // 12. Shockwave Line Flash on Clear
        for (let i = lineShockwaves.length - 1; i >= 0; i--) {
            const sw = lineShockwaves[i];
            const rgb = hexToRgb(sw.color);
            context.save();
            const swGrad = context.createLinearGradient(0, sw.y, canvas.width, sw.y);
            swGrad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${sw.alpha * 0.5})`);
            swGrad.addColorStop(0.5, `rgba(255, 255, 255, ${sw.alpha * 0.95})`);
            swGrad.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${sw.alpha * 0.5})`);
            context.fillStyle = swGrad;
            context.shadowColor = '#ffffff';
            context.shadowBlur = 16;
            const shrink = (1 - sw.alpha) * (sw.thickness * 0.35);
            context.fillRect(0, sw.y + shrink, canvas.width, Math.max(2, sw.thickness - shrink * 2));
            context.restore();
            sw.alpha -= 0.085 * dt;
            if (sw.alpha <= 0) lineShockwaves.splice(i, 1);
        }

        // 13. Particle Sparks & Crystal Shards
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += p.gravity * dt;
            p.life -= p.decay * dt;
            if (p.life <= 0) {
                particles.splice(i, 1);
                continue;
            }
            context.save();
            context.fillStyle = `rgba(${p.rgb.r}, ${p.rgb.g}, ${p.rgb.b}, ${p.life})`;
            context.shadowColor = `rgba(${p.rgb.r}, ${p.rgb.g}, ${p.rgb.b}, 1)`;
            context.shadowBlur = 8;
            context.fillRect(p.x, p.y, p.size, p.size);
            context.restore();
        }

        // 14. Board Ambient Impact Flash Overlay
        if (boardFlashAlpha > 0) {
            const rgb = hexToRgb(boardFlashColor);
            context.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${boardFlashAlpha})`;
            context.fillRect(0, 0, canvas.width, canvas.height);
            boardFlashAlpha -= 0.04 * dt;
            if (boardFlashAlpha < 0) boardFlashAlpha = 0;
        }

        // 15. Floating Canvas Score / Action Texts
        for (let i = floatingTexts.length - 1; i >= 0; i--) {
            const ft = floatingTexts[i];
            context.save();
            context.font = `900 ${ft.fontSize}px Orbitron, monospace`;
            context.textAlign = 'center';
            context.globalAlpha = Math.max(0, Math.min(1, ft.life * 1.4));
            context.shadowColor = ft.color;
            context.shadowBlur = 12;
            context.fillStyle = '#ffffff';
            context.fillText(ft.text, ft.x, ft.y);
            context.strokeStyle = ft.color;
            context.lineWidth = 0.8;
            context.strokeText(ft.text, ft.x, ft.y);
            context.restore();

            ft.y -= 0.85 * dt;
            ft.life -= 0.022 * dt;
            if (ft.life <= 0) floatingTexts.splice(i, 1);
        }

        context.restore();
    }

    // =================================================================
    // COLLISION, ROTATION & T-SPIN DETECTION
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
                        lockFlashes.push({
                            x: bx,
                            y: by,
                            color: targetPiece.color || '#00f0ff',
                            life: 1.0
                        });
                    }
                }
            });
        });
    }

    function detectTSpin(targetPiece) {
        if (!targetPiece || targetPiece.typeIndex !== 1 || !lastMoveWasRotate) return false;
        const m = targetPiece.matrix;
        let pivotX = -1;
        let pivotY = -1;

        // Locate the T-piece center cell (the single cell with 3 orthogonal neighbors)
        for (let y = 0; y < m.length; y++) {
            for (let x = 0; x < m[y].length; x++) {
                if (m[y][x] !== 0) {
                    let neighbors = 0;
                    if (y > 0 && m[y - 1][x] !== 0) neighbors++;
                    if (y < m.length - 1 && m[y + 1][x] !== 0) neighbors++;
                    if (x > 0 && m[y][x - 1] !== 0) neighbors++;
                    if (x < m[y].length - 1 && m[y][x + 1] !== 0) neighbors++;
                    if (neighbors === 3) {
                        pivotX = targetPiece.pos.x + x;
                        pivotY = targetPiece.pos.y + y;
                        break;
                    }
                }
            }
            if (pivotX !== -1) break;
        }

        if (pivotX === -1) return false;

        const corners = [
            [pivotX - 1, pivotY - 1],
            [pivotX + 1, pivotY - 1],
            [pivotX - 1, pivotY + 1],
            [pivotX + 1, pivotY + 1]
        ];

        let occupiedCorners = 0;
        corners.forEach(([cx, cy]) => {
            if (cx < 0 || cx >= COLS || cy >= ROWS || (cy >= 0 && board[cy][cx] !== 0)) {
                occupiedCorners++;
            }
        });

        return occupiedCorners >= 3;
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

        let offset = 1;
        while (collides(board, piece)) {
            piece.pos.x += offset;
            offset = -(offset + (offset > 0 ? 1 : -1));
            if (Math.abs(offset) > piece.matrix[0].length + 2) {
                piece.matrix = rotateMatrix(piece.matrix, -dir);
                piece.pos.x = originalPos;
                return;
            }
        }

        const normX = (piece.pos.x + piece.matrix[0].length / 2) / COLS;
        playEnhancedSound('rotate', { dir, normX });
        if (piece.pos.x !== originalPos) {
            playEnhancedSound('wallKick');
        }
        lastMoveWasRotate = true;
    }

    function pieceMove(dir) {
        if (!piece || paused || gameOver) return;
        piece.pos.x += dir;
        if (collides(board, piece)) {
            piece.pos.x -= dir;
        } else {
            lastMoveWasRotate = false;
            const normX = (piece.pos.x + piece.matrix[0].length / 2) / COLS;
            playEnhancedSound('move', normX);
        }
    }

    function emitPieceContactFX(targetPiece, isHard) {
        let minCol = COLS;
        let maxCol = -1;
        let maxRow = 0;
        targetPiece.matrix.forEach((row, y) => {
            row.forEach((v, x) => {
                if (v !== 0) {
                    const isBottomEdge = y === targetPiece.matrix.length - 1 || targetPiece.matrix[y + 1][x] === 0;
                    if (isBottomEdge) {
                        createImpactSparks(targetPiece.pos.x + x, targetPiece.pos.y + y, targetPiece.color, isHard ? 9 : 4, isHard);
                    }
                    minCol = Math.min(minCol, targetPiece.pos.x + x);
                    maxCol = Math.max(maxCol, targetPiece.pos.x + x);
                    maxRow = Math.max(maxRow, targetPiece.pos.y + y);
                }
            });
        });

        if (isHard && maxCol >= minCol) {
            const centerPx = ((minCol + maxCol + 1) / 2) * BLOCK_SIZE;
            const bottomPx = (maxRow + 1) * BLOCK_SIZE;
            const widthPx = (maxCol - minCol + 1) * BLOCK_SIZE;
            addImpactRing(centerPx, bottomPx, widthPx, targetPiece.color);
        }
    }

    function pieceDrop(isManual = false) {
        if (!piece || paused || gameOver) return;
        piece.pos.y++;

        if (collides(board, piece)) {
            piece.pos.y--;
            const wasTSpin = detectTSpin(piece);
            const normX = (piece.pos.x + piece.matrix[0].length / 2) / COLS;
            playEnhancedSound('drop', normX);
            addScreenShake(2.5);
            addBoardImpulse(2.2);
            emitPieceContactFX(piece, false);

            const lockX = piece.pos.x + piece.matrix[0].length / 2;
            const lockY = piece.pos.y;
            merge(board, piece);
            sweep(wasTSpin, lockX, lockY);
            resetPlayer();
        } else {
            lastMoveWasRotate = false;
            if (isManual) {
                playEnhancedSound('softDrop');
            }
        }
        dropCounter = 0;
    }

    function hardDrop() {
        if (!piece || paused || gameOver) return;
        const startY = piece.pos.y;

        while (!collides(board, piece)) {
            piece.pos.y++;
        }
        piece.pos.y--;
        const endY = piece.pos.y;
        const dropDist = Math.max(0, endY - startY);

        // Draw vertical laser trails from original startY down to landed endY
        piece.matrix.forEach((row, y) => {
            row.forEach((v, x) => {
                if (v !== 0) {
                    addLaserBeam(piece.pos.x + x, startY + y, endY + y, piece.color);
                }
            });
        });

        const normX = (piece.pos.x + piece.matrix[0].length / 2) / COLS;
        playEnhancedSound('hardDrop', {
            colNorm: normX,
            colorIndex: piece.colorIndex,
            distance: dropDist
        });

        addScreenShake(Math.min(11, 5 + dropDist * 0.25));
        addBoardImpulse(Math.min(10, 4.5 + dropDist * 0.28));
        emitPieceContactFX(piece, true);

        const wasTSpin = detectTSpin(piece);
        const lockX = piece.pos.x + piece.matrix[0].length / 2;
        const lockY = piece.pos.y;
        merge(board, piece);
        sweep(wasTSpin, lockX, lockY);
        resetPlayer();
        dropCounter = 0;
    }

    function hold() {
        if (!canHold || paused || gameOver || !piece) return;
        playEnhancedSound('hold');

        if (heldPiece) {
            const temp = heldPiece;
            heldPiece = {
                matrix: PIECES[piece.typeIndex].map(row => [...row]),
                color: piece.color,
                colorIndex: piece.colorIndex,
                typeIndex: piece.typeIndex
            };
            piece = {
                ...temp,
                matrix: temp.matrix.map(row => [...row]),
                pos: {
                    x: Math.floor(COLS / 2) - Math.floor(temp.matrix[0].length / 2),
                    y: 0
                }
            };
        } else {
            heldPiece = {
                matrix: PIECES[piece.typeIndex].map(row => [...row]),
                color: piece.color,
                colorIndex: piece.colorIndex,
                typeIndex: piece.typeIndex
            };
            resetPlayer();
        }

        canHold = false;
        lastMoveWasRotate = false;
        drawHoldPiece();
    }

    function sweep(wasTSpin = false, actionX = COLS / 2, actionY = ROWS / 2) {
        let linesInSweep = 0;
        let lastClearedY = actionY;

        outer: for (let y = board.length - 1; y >= 0; --y) {
            for (let x = 0; x < board[y].length; ++x) {
                if (board[y][x] === 0) {
                    continue outer;
                }
            }

            lastClearedY = y;
            for (let x = 0; x < board[y].length; ++x) {
                createSparks(x, y, COLORS[board[y][x]] || '#00f0ff', 11, 1.15);
            }
            addLineShockwave(y, wasTSpin ? '#b026ff' : '#00f0ff');

            const row = board.splice(y, 1)[0].fill(0);
            board.unshift(row);
            ++y;
            linesInSweep++;
        }

        if (linesInSweep > 0) {
            combo++;
            updateComboDisplay();

            const linePoints = [0, 100, 300, 600, 1200];
            let basePoints = linePoints[Math.min(linesInSweep, 4)] || (linesInSweep * 350);
            if (wasTSpin) {
                basePoints += 400 * linesInSweep;
            }
            const comboBonus = (combo - 1) * 60;
            const pointsEarned = (basePoints + comboBonus) * level;

            updateScore(pointsEarned);
            linesCleared += linesInSweep;
            if (linesElement) linesElement.textContent = linesCleared;

            if (wasTSpin) {
                playEnhancedSound('tspin');
                addScreenShake(15);
                boardFlashColor = '#b026ff';
                boardFlashAlpha = 0.16;
                const label = linesInSweep >= 3 ? '¡T-SPIN TRIPLE!' : (linesInSweep === 2 ? '¡T-SPIN DOUBLE!' : '¡T-SPIN!');
                showToast(label, '#b026ff');
                addFloatingText(`+${pointsEarned} T-SPIN`, actionX, lastClearedY, '#b026ff', 17);
            } else if (linesInSweep >= 4) {
                playEnhancedSound('tetris');
                addScreenShake(18);
                boardFlashColor = '#00ff88';
                boardFlashAlpha = 0.18;
                showToast('¡TETRIS IMPERIAL!', '#00ff88');
                addFloatingText(`+${pointsEarned} TETRIS!`, actionX, lastClearedY, '#00ff88', 18);
            } else if (linesInSweep === 3) {
                playEnhancedSound('clear', 3);
                addScreenShake(10);
                showToast('¡TRIPLE COMBO!', '#00f0ff');
                addFloatingText(`+${pointsEarned} TRIPLE`, actionX, lastClearedY, '#00f0ff', 16);
            } else if (linesInSweep === 2) {
                playEnhancedSound('clear', 2);
                addScreenShake(6);
                showToast('¡DOBLE!', '#b026ff');
                addFloatingText(`+${pointsEarned}`, actionX, lastClearedY, '#a78bfa', 15);
            } else {
                playEnhancedSound('clear', 1);
                addScreenShake(4);
                addFloatingText(`+${pointsEarned}`, actionX, lastClearedY, '#00f0ff', 14);
            }

            if (combo > 1) {
                playEnhancedSound('combo', combo);
                if (!wasTSpin && linesInSweep < 3) {
                    showToast(`¡COMBO x${combo}!`, '#ffaa00');
                }
                addFloatingText(`COMBO x${combo}`, actionX, Math.max(2, lastClearedY - 1.2), '#ffaa00', 14);
            }

            // Level up every 10 lines
            const nextLevel = Math.floor(linesCleared / 10) + 1;
            if (nextLevel > level) {
                level = nextLevel;
                if (levelElement) levelElement.textContent = level;
                dropInterval = Math.max(105, 900 - (level - 1) * 75);
                playEnhancedSound('levelUp');
                showToast(`¡NIVEL ${level}!`, '#ffe600');
                addFloatingText(`LEVEL ${level}!`, COLS / 2, ROWS * 0.35, '#ffe600', 20);
            }
        } else {
            if (wasTSpin) {
                const tSpinBonus = 150 * level;
                updateScore(tSpinBonus);
                playEnhancedSound('tspin');
                showToast('¡T-SPIN!', '#b026ff');
                addFloatingText(`+${tSpinBonus} T-SPIN`, actionX, actionY, '#b026ff', 15);
            }
            combo = 0;
            updateComboDisplay();
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
    // GAME LOOP (60/120FPS DELTA-NORMALIZED)
    // =================================================================
    let dropCounter = 0;
    let dropInterval = 900;
    let lastTime = 0;

    function gameLoop(time = 0) {
        if (gameOver || paused) return;

        const rawDelta = time - lastTime;
        const deltaTime = Math.min(50, Math.max(0, rawDelta));
        const dt = deltaTime / 16.6667;
        lastTime = time;

        dropCounter += deltaTime;
        if (dropCounter > dropInterval) {
            pieceDrop(false);
        }

        draw(dt, time);
        animationFrameId = requestAnimationFrame(gameLoop);
    }

    // =================================================================
    // INPUT LISTENERS & TOUCH BINDINGS
    // =================================================================
    document.addEventListener('keydown', event => {
        if (gameOver) return;

        if (event.key === 'p' || event.key === 'P' || event.key === 'Escape') {
            if (!startScreen.classList.contains('hidden')) return;
            togglePause();
            return;
        }

        if (paused || !startScreen.classList.contains('hidden')) return;

        switch (event.code) {
            case 'ArrowLeft':
            case 'KeyA':
                event.preventDefault();
                pieceMove(-1);
                break;
            case 'ArrowRight':
            case 'KeyD':
                event.preventDefault();
                pieceMove(1);
                break;
            case 'ArrowDown':
            case 'KeyS':
                event.preventDefault();
                pieceDrop(true);
                break;
            case 'ArrowUp':
            case 'KeyW':
                event.preventDefault();
                pieceRotate(1);
                break;
            case 'KeyQ':
            case 'KeyZ':
                event.preventDefault();
                pieceRotate(-1);
                break;
            case 'Space':
                event.preventDefault();
                hardDrop();
                break;
            case 'KeyC':
            case 'ShiftLeft':
            case 'ShiftRight':
                event.preventDefault();
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
        }, { passive: false });
        el.addEventListener('click', (e) => {
            e.preventDefault();
            action();
        });
    }

    bindTouch('touch-left', () => pieceMove(-1));
    bindTouch('touch-right', () => pieceMove(1));
    bindTouch('touch-down', () => pieceDrop(true));
    bindTouch('touch-rotate', () => pieceRotate(1));
    bindTouch('touch-drop', () => hardDrop());
    bindTouch('touch-hold', () => hold());

    // =================================================================
    // GAME LIFECYCLE
    // =================================================================
    function togglePause() {
        if (gameOver || !startScreen.classList.contains('hidden')) return;
        paused = !paused;
        if (paused) {
            cancelAnimationFrame(animationFrameId);
            pauseScreen.classList.remove('hidden');
            stopMusic();
        } else {
            pauseScreen.classList.add('hidden');
            lastTime = performance.now();
            startCurrentMusic();
            gameLoop(lastTime);
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
        ensureAudioEngine();
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
        boardSpringY = 0;
        boardVelocityY = 0;
        boardFlashAlpha = 0;
        laserBeams = [];
        lineShockwaves = [];
        impactRings = [];
        lockFlashes = [];
        particles = [];
        floatingTexts = [];

        if (scoreElement) scoreElement.textContent = '0';
        if (levelElement) levelElement.textContent = '1';
        if (linesElement) linesElement.textContent = '0';
        updateComboDisplay();

        drawHoldPiece();
        fillNextPieces();
        resetPlayer();
        updateVolumeDisplay();
        startCurrentMusic();

        lastTime = performance.now();
        gameLoop(lastTime);
    }

    startBtn.addEventListener('click', startGame);
    resumeBtn.addEventListener('click', togglePause);
    playAgainBtn.addEventListener('click', startGame);

    // Initial idle render behind start screen
    startScreen.classList.remove('hidden');
    updateVolumeDisplay();
    updateComboDisplay();
    drawHoldPiece();
    draw(1, performance.now());
});
