/* =================================================================
   EDUARDO CAYÚN M. — SPOTIFY HI-FI PLAYER & 3D SPEAKER INTEGRATION
   Integrates the 3D room speaker with Spotify design & audio playback
================================================================== */
(function () {
    const TRACKS = [
        {
            id: 'cruzando-cielos',
            title: 'Cruzando cielos',
            artist: 'Eduardo Cayún M. / IA',
            album: 'AI Ambient Synth · 2026',
            file: 'music/Cruzando Cielos.mp3',
            cover: 'images/cruzando-cielos-cover.jpg',
            coverSvg: 'images/cover-cruzando-cielos.svg',
            spotifyUrl: 'https://open.spotify.com/search/Eduardo%20Cayun%20Cruzando%20Cielos',
            embedUrl: 'https://open.spotify.com/embed/playlist/37i9dQZF1DXdLEN7aqioXM?utm_source=generator&theme=0'
        },
        {
            id: 'together',
            title: 'Together',
            artist: 'Eduardo Cayún M. / IA',
            album: 'Upbeat Electronica · 2026',
            file: 'music/Together.mp3',
            cover: 'images/cover-together.svg',
            coverSvg: 'images/cover-together.svg',
            spotifyUrl: 'https://open.spotify.com/search/Eduardo%20Cayun%20Together',
            embedUrl: 'https://open.spotify.com/embed/playlist/37i9dQZF1DWWQRwui0ExPn?utm_source=generator&theme=0'
        },
        {
            id: 'opa-amor',
            title: 'Maxi y Luka, para su Opa',
            artist: 'Eduardo Cayún M. / IA',
            album: 'Balada & Acústica IA',
            file: 'music/Opa Amor.mp3',
            cover: 'images/cover-opa-amor.svg',
            coverSvg: 'images/cover-opa-amor.svg',
            spotifyUrl: 'https://open.spotify.com/search/Eduardo%20Cayun',
            embedUrl: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX4t95PaoR1zy?utm_source=generator&theme=0'
        }
    ];

    let audio = null;
    let currentIndex = 0;
    let isPlaying = false;
    let isMuted = false;
    let previousVolume = 0.85;
    let isExpanded = false;
    let isMinimized = true;
    let activeTab = 'local'; // 'local' | 'spotify'
    let partyHudDismissed = false;
    let listeners = [];
    let analyserCtx = null;
    let analyserNode = null;
    let analyserData = null;
    let analyserFailed = false;

    function setupAudioAnalyser() {
        if (analyserNode || analyserFailed || !audio) return;
        if (window.location && window.location.protocol === 'file:') {
            analyserFailed = true;
            return;
        }
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) {
                analyserFailed = true;
                return;
            }
            analyserCtx = new AudioContext();
            const source = analyserCtx.createMediaElementSource(audio);
            analyserNode = analyserCtx.createAnalyser();
            analyserNode.fftSize = 256;
            analyserNode.smoothingTimeConstant = 0.72;
            source.connect(analyserNode);
            analyserNode.connect(analyserCtx.destination);
            analyserData = new Uint8Array(analyserNode.frequencyBinCount);
        } catch (err) {
            analyserFailed = true;
            analyserNode = null;
        }
    }

    // Global state object accessible by 3D room-scene.js
    window.eduMusicState = {
        isPlaying: false,
        currentIndex: 0,
        currentTrack: TRACKS[0],
        currentTime: 0,
        duration: 0,
        volume: 0.85,
        getBeat: function () {
            if (!isPlaying) return 0;

            if (analyserNode && analyserData) {
                analyserNode.getByteFrequencyData(analyserData);
                // Average low-end bass + kick bins (indices 0..10)
                let sum = 0;
                const bins = 10;
                for (let i = 0; i < bins; i++) {
                    sum += analyserData[i];
                }
                const avg = sum / (bins * 255);
                if (avg > 0.01) {
                    return Math.min(1, Math.pow(avg * 1.35, 1.35));
                }
            }

            const t = (audio ? audio.currentTime : performance.now() / 1000);
            // Fallback synthetic beat rhythm when analyser is unavailable (e.g. file://)
            const kick = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * 1.95)), 8);
            const snare = Math.pow(Math.max(0, Math.sin((t + 0.25) * Math.PI * 2 * 0.98)), 10) * 0.6;
            return Math.min(1, kick + snare);
        }
    };

    function formatTime(sec) {
        if (!isFinite(sec) || isNaN(sec)) return '0:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    function initAudio() {
        if (audio) return audio;
        audio = new Audio();
        audio.preload = 'metadata';
        audio.volume = previousVolume;

        audio.addEventListener('timeupdate', () => {
            window.eduMusicState.currentTime = audio.currentTime;
            window.eduMusicState.duration = audio.duration || 0;
            updateProgress();
        });

        audio.addEventListener('loadedmetadata', () => {
            window.eduMusicState.duration = audio.duration || 0;
            updateProgress();
        });

        audio.addEventListener('play', () => {
            setupAudioAnalyser();
            if (analyserCtx && analyserCtx.state === 'suspended') {
                analyserCtx.resume().catch(() => {});
            }
            isPlaying = true;
            window.eduMusicState.isPlaying = true;
            syncUIState();
            notifyChange();
        });

        audio.addEventListener('pause', () => {
            isPlaying = false;
            window.eduMusicState.isPlaying = false;
            syncUIState();
            notifyChange();
        });

        audio.addEventListener('ended', () => {
            nextTrack();
        });

        audio.addEventListener('error', (err) => {
            console.warn('[SpotifyPlayer] Audio error:', err);
        });

        return audio;
    }

    function notifyChange() {
        listeners.forEach(fn => {
            try { fn(window.eduMusicState); } catch(e) {}
        });
    }

    function loadTrack(index, autoPlay = false) {
        currentIndex = (index + TRACKS.length) % TRACKS.length;
        const track = TRACKS[currentIndex];
        window.eduMusicState.currentIndex = currentIndex;
        window.eduMusicState.currentTrack = track;

        if (autoPlay || audio) {
            initAudio();
            const targetSrc = encodeURI(track.file);
            if (!audio.src || !audio.src.endsWith(targetSrc)) {
                audio.src = targetSrc;
            }
        }

        // Update widget elements
        const titleEls = document.querySelectorAll('.spotify-track-title');
        titleEls.forEach(el => el.textContent = track.title);

        const artistEls = document.querySelectorAll('.spotify-track-artist');
        artistEls.forEach(el => el.textContent = track.artist);

        const albumEls = document.querySelectorAll('.spotify-track-album');
        albumEls.forEach(el => el.textContent = track.album);

        const coverImgs = document.querySelectorAll('.spotify-track-cover');
        coverImgs.forEach(img => {
            img.src = track.cover;
            img.onerror = () => { img.src = track.coverSvg; };
            img.alt = `Portada: ${track.title}`;
        });

        const spotifyLinks = document.querySelectorAll('.spotify-open-link');
        spotifyLinks.forEach(a => {
            a.href = track.spotifyUrl;
        });

        const iframe = document.getElementById('spotify-embed-iframe');
        if (iframe) {
            iframe.dataset.pendingSrc = track.embedUrl;
            if (activeTab === 'web' && iframe.dataset.currentId !== track.id) {
                iframe.src = track.embedUrl;
                iframe.dataset.currentId = track.id;
            }
        }

        updateProgress();
        syncUIState();
        notifyChange();

        if (autoPlay && audio) {
            const p = audio.play();
            if (p && typeof p.catch === 'function') {
                p.catch(e => {
                    if (e && e.name === 'AbortError') return;
                    console.log('Autoplay deferred:', e);
                });
            }
        }
    }

    function play() {
        partyHudDismissed = false;
        initAudio();
        if (!audio || !audio.src) {
            loadTrack(currentIndex, true);
            return;
        }
        const p = audio.play();
        if (p && typeof p.catch === 'function') {
            p.catch(e => {
                if (e && e.name === 'AbortError') return;
                console.log('Play gesture required:', e);
            });
        }
    }

    function pause() {
        if (audio) audio.pause();
    }

    function togglePlay() {
        initAudio();
        if (!audio.src) {
            loadTrack(currentIndex, true);
            return;
        }
        if (isPlaying) {
            pause();
        } else {
            play();
        }
    }

    function nextTrack() {
        loadTrack(currentIndex + 1, isPlaying);
    }

    function prevTrack() {
        loadTrack(currentIndex - 1, isPlaying);
    }

    function seekToFraction(fraction) {
        if (!audio || !audio.duration) return;
        const target = Math.max(0, Math.min(audio.duration, fraction * audio.duration));
        audio.currentTime = target;
        updateProgress();
    }

    function setVolume(v) {
        initAudio();
        const clamped = Math.max(0, Math.min(1, parseFloat(v)));
        audio.volume = clamped;
        previousVolume = clamped;
        isMuted = clamped === 0;
        window.eduMusicState.volume = clamped;
        syncVolumeUI();
    }

    function toggleMute() {
        initAudio();
        if (isMuted) {
            audio.volume = previousVolume > 0 ? previousVolume : 0.85;
            isMuted = false;
        } else {
            previousVolume = audio.volume;
            audio.volume = 0;
            isMuted = true;
        }
        syncVolumeUI();
    }

    function updateProgress() {
        const cur = audio ? audio.currentTime : 0;
        const dur = audio && audio.duration ? audio.duration : 0;
        const pct = dur > 0 ? (cur / dur) * 100 : 0;

        document.querySelectorAll('.spotify-progress-bar-fill').forEach(bar => {
            bar.style.width = `${pct}%`;
        });
        document.querySelectorAll('.spotify-current-time').forEach(el => {
            el.textContent = formatTime(cur);
        });
        document.querySelectorAll('.spotify-total-time').forEach(el => {
            el.textContent = formatTime(dur);
        });
    }

    function syncVolumeUI() {
        const v = audio ? audio.volume : 0.85;
        document.querySelectorAll('.spotify-volume-slider').forEach(s => {
            s.value = v;
        });
        document.querySelectorAll('.spotify-volume-icon').forEach(icon => {
            if (isMuted || v === 0) {
                icon.textContent = '🔇';
            } else if (v < 0.4) {
                icon.textContent = '🔈';
            } else {
                icon.textContent = '🔊';
            }
        });
    }

    function syncUIState() {
        const widget = document.getElementById('spotify-widget');
        if (widget) {
            widget.classList.toggle('is-playing', isPlaying);
            const partyBanner = widget.querySelector('.spotify-party-banner');
            if (partyBanner) {
                partyBanner.classList.toggle('hidden', !isPlaying);
                partyBanner.classList.toggle('flex', isPlaying);
            }
        }

        const pill = document.getElementById('spotify-mini-pill');
        if (pill) {
            pill.classList.toggle('is-playing', isPlaying);
            pill.classList.toggle('is-party-mode', isPlaying);
        }

        const partyHud = document.getElementById('party-music-hud');
        if (partyHud) {
            partyHud.classList.toggle('is-playing', isPlaying);
            if (isPlaying && !partyHudDismissed) {
                partyHud.classList.remove('hidden');
                partyHud.classList.add('flex');
            } else {
                partyHud.classList.remove('flex');
                partyHud.classList.add('hidden');
            }
        }

        // Toggle play/pause SVGs
        document.querySelectorAll('.spotify-play-btn').forEach(btn => {
            const svg = btn.querySelector('svg');
            if (svg) {
                if (isPlaying) {
                    svg.innerHTML = '<path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
                    btn.setAttribute('aria-label', 'Pausar música');
                    btn.title = 'Pausar música';
                } else {
                    svg.innerHTML = '<path fill="currentColor" d="M8 5v14l11-7z"/>';
                    btn.setAttribute('aria-label', 'Reproducir música');
                    btn.title = 'Reproducir música';
                }
            }
        });

        // 2D lab demo play button sync
        document.querySelectorAll('.lab-audio-play-btn').forEach(btn => {
            btn.classList.toggle('bg-emerald-500', isPlaying);
            btn.classList.toggle('text-slate-950', isPlaying);
            const label = btn.querySelector('.btn-label');
            if (label) label.textContent = isPlaying ? 'Pausar Demo IA' : 'Escuchar Demo IA';
        });
    }

    function expandWidget() {
        const widget = document.getElementById('spotify-widget');
        const pill = document.getElementById('spotify-mini-pill');
        if (widget) {
            widget.classList.remove('hidden');
            widget.classList.add('is-visible');
        }
        if (pill) {
            pill.classList.add('hidden');
        }
        isExpanded = true;
        isMinimized = false;
    }

    function minimizeWidget() {
        const widget = document.getElementById('spotify-widget');
        const pill = document.getElementById('spotify-mini-pill');
        if (widget) {
            widget.classList.add('hidden');
            widget.classList.remove('is-visible');
        }
        if (pill) {
            pill.classList.remove('hidden');
        }
        isExpanded = false;
        isMinimized = true;
    }

    function setTab(tab) {
        activeTab = tab;
        const localTabBtn = document.getElementById('spotify-tab-local');
        const webTabBtn = document.getElementById('spotify-tab-web');
        const localBody = document.getElementById('spotify-body-local');
        const webBody = document.getElementById('spotify-body-web');

        if (localTabBtn) localTabBtn.classList.toggle('is-active', tab === 'local');
        if (webTabBtn) webTabBtn.classList.toggle('is-active', tab === 'web');
        if (localBody) localBody.classList.toggle('hidden', tab !== 'local');
        if (webBody) webBody.classList.toggle('hidden', tab !== 'web');

        if (tab === 'web') {
            const iframe = document.getElementById('spotify-embed-iframe');
            const targetSrc = (iframe && iframe.dataset.pendingSrc) || TRACKS[currentIndex].embedUrl || (iframe && iframe.dataset.src);
            if (iframe && targetSrc && iframe.getAttribute('src') !== targetSrc) {
                iframe.src = targetSrc;
                iframe.dataset.currentId = TRACKS[currentIndex].id;
            }
        }
    }

    function setupDOMBindings() {
        // Play / Pause buttons
        document.querySelectorAll('.spotify-play-btn, .lab-audio-play-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                togglePlay();
            };
        });

        // Prev & Next buttons
        document.querySelectorAll('.spotify-prev-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                prevTrack();
            };
        });
        document.querySelectorAll('.spotify-next-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                nextTrack();
            };
        });

        // Progress Bar Seeking
        document.querySelectorAll('.spotify-progress-container').forEach(track => {
            track.onclick = (e) => {
                const rect = track.getBoundingClientRect();
                const frac = (e.clientX - rect.left) / rect.width;
                seekToFraction(frac);
            };
        });

        // Volume controls
        document.querySelectorAll('.spotify-volume-slider').forEach(slider => {
            slider.oninput = (e) => setVolume(e.target.value);
        });
        document.querySelectorAll('.spotify-volume-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                toggleMute();
            };
        });

        // Minimize / Close button
        const minBtn = document.getElementById('spotify-btn-minimize');
        if (minBtn) {
            minBtn.onclick = (e) => {
                e.preventDefault();
                minimizeWidget();
            };
        }

        // Pill Click to Expand
        const pill = document.getElementById('spotify-mini-pill');
        if (pill) {
            pill.onclick = (e) => {
                // If clicked play button inside pill, toggle play
                if (e.target.closest('.spotify-pill-play-btn')) {
                    e.stopPropagation();
                    togglePlay();
                    return;
                }
                expandWidget();
            };
        }

        // Party Music HUD Controls
        const partyCloseBtn = document.getElementById('party-hud-close');
        if (partyCloseBtn) {
            partyCloseBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                partyHudDismissed = true;
                syncUIState();
            };
        }

        const partyExpandEl = document.getElementById('party-hud-expand');
        if (partyExpandEl) {
            partyExpandEl.onclick = (e) => {
                e.preventDefault();
                expandWidget();
            };
        }

        // Tab Switching
        const localTabBtn = document.getElementById('spotify-tab-local');
        const webTabBtn = document.getElementById('spotify-tab-web');
        if (localTabBtn) localTabBtn.onclick = () => setTab('local');
        if (webTabBtn) webTabBtn.onclick = () => setTab('web');

        // Track selector items (if any list)
        document.querySelectorAll('[data-track-index]').forEach(el => {
            el.onclick = () => {
                const idx = parseInt(el.dataset.trackIndex, 10);
                if (!isNaN(idx)) loadTrack(idx, true);
            };
        });

        // Initial track load without autoplay
        loadTrack(0, false);
    }

    // Public API
    window.eduSpotifyPlayer = {
        play: play,
        pause: pause,
        togglePlay: togglePlay,
        nextTrack: nextTrack,
        prevTrack: prevTrack,
        loadTrack: loadTrack,
        expand: expandWidget,
        minimize: minimizeWidget,
        setTab: setTab,
        onStateChange: (fn) => { listeners.push(fn); },
        getCurrentTrack: () => TRACKS[currentIndex],
        isPlaying: () => isPlaying,
        setSimulatedPlayback: (state) => {
            isPlaying = !!state;
            window.eduMusicState.isPlaying = isPlaying;
            syncUIState();
            notifyChange();
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupDOMBindings);
    } else {
        setupDOMBindings();
    }
})();
