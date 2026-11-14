/* =================================================================
   EDUARDO CAYÚN M. — ROBUST AUDIO PLAYER & PARTICLE VISUALIZER
================================================================== */
(function () {
    const songs = [
        {
            title: 'Cruzando cielos',
            artist: 'Eduardo Cayún M. / IA',
            file: 'music/Cruzando Cielos.mp3'
        },
        {
            title: 'Maxi y Luka, para su Opa',
            artist: 'Eduardo Cayún M. / IA',
            file: 'music/Opa Amor.mp3'
        },
        {
            title: 'Together',
            artist: 'Eduardo Cayún M. / IA',
            file: 'music/Together.mp3'
        }
    ];

    let audio = null;
    let currentIndex = 0;
    let isPlaying = false;
    let isShuffle = false;
    let repeatMode = 'none'; // 'none', 'one', 'all'
    let particleAnimationId = null;

    function formatTime(seconds) {
        if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    function initAudio() {
        if (!audio) {
            audio = new Audio();
            audio.preload = 'metadata';

            audio.addEventListener('timeupdate', onTimeUpdate);
            audio.addEventListener('loadedmetadata', onLoadedMetadata);
            audio.addEventListener('ended', onSongEnded);
            audio.addEventListener('play', () => updatePlayButtons(true));
            audio.addEventListener('pause', () => updatePlayButtons(false));
            audio.addEventListener('error', (e) => {
                console.warn('Audio playback notice:', e);
            });
        }
    }

    function updatePlayButtons(playing) {
        isPlaying = playing;
        const playBtns = document.querySelectorAll('.music-play-btn, #play-btn, #play-btn-desktop');
        playBtns.forEach(btn => {
            const svg = btn.querySelector('svg');
            if (svg) {
                if (playing) {
                    svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />';
                } else {
                    svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />';
                }
            }
            btn.classList.toggle('bg-indigo-700', playing);
            btn.classList.toggle('playing', playing);
        });

        // Pulsing album art
        const covers = document.querySelectorAll('.album-cover');
        covers.forEach(c => {
            c.classList.toggle('ring-4', playing);
            c.classList.toggle('ring-indigo-500/50', playing);
        });
    }

    function loadTrack(index) {
        initAudio();
        currentIndex = (index + songs.length) % songs.length;
        const song = songs[currentIndex];

        audio.src = encodeURI(song.file);

        // Update titles
        document.querySelectorAll('.song-title-display, #song-title').forEach(el => {
            el.textContent = song.title;
        });
        document.querySelectorAll('.song-artist-display, #song-artist').forEach(el => {
            el.textContent = song.artist;
        });

        // Update playlist active item
        document.querySelectorAll('.playlist-container, #playlist').forEach(list => {
            const items = list.querySelectorAll('.song-item');
            items.forEach((item, i) => {
                const active = i === currentIndex;
                item.classList.toggle('active', active);
                item.classList.toggle('bg-indigo-600/30', active);
                item.classList.toggle('border-l-4', active);
                item.classList.toggle('border-indigo-500', active);
            });
        });

        // Reset progress bar
        document.querySelectorAll('.progress-bar-fill, #progress-bar, #progress-bar-desktop').forEach(bar => {
            bar.style.width = '0%';
        });
        document.querySelectorAll('.current-time-display, #current-time, #current-time-desktop').forEach(el => {
            el.textContent = '0:00';
        });
    }

    function playTrack(index) {
        loadTrack(index);
        audio.play().then(() => {
            updatePlayButtons(true);
        }).catch(err => {
            console.log('Playback requires user gesture:', err);
        });
    }

    function togglePlay() {
        initAudio();
        if (!audio.src) {
            playTrack(0);
            return;
        }

        if (isPlaying) {
            audio.pause();
            updatePlayButtons(false);
        } else {
            audio.play().then(() => {
                updatePlayButtons(true);
            }).catch(err => console.log('Playback error:', err));
        }
    }

    function nextTrack() {
        if (isShuffle && songs.length > 1) {
            let next;
            do {
                next = Math.floor(Math.random() * songs.length);
            } while (next === currentIndex);
            playTrack(next);
        } else {
            playTrack(currentIndex + 1);
        }
    }

    function prevTrack() {
        playTrack(currentIndex - 1);
    }

    function onTimeUpdate() {
        if (!audio || !audio.duration) return;
        const percent = (audio.currentTime / audio.duration) * 100;
        document.querySelectorAll('.progress-bar-fill, #progress-bar, #progress-bar-desktop').forEach(bar => {
            bar.style.width = `${percent}%`;
        });
        const formatted = formatTime(audio.currentTime);
        document.querySelectorAll('.current-time-display, #current-time, #current-time-desktop').forEach(el => {
            el.textContent = formatted;
        });
    }

    function onLoadedMetadata() {
        if (!audio) return;
        const dur = formatTime(audio.duration);
        document.querySelectorAll('.duration-display, #duration, #duration-desktop').forEach(el => {
            el.textContent = dur;
        });
    }

    function onSongEnded() {
        if (repeatMode === 'one') {
            audio.currentTime = 0;
            audio.play();
        } else if (repeatMode === 'all') {
            nextTrack();
        } else {
            if (currentIndex < songs.length - 1) {
                nextTrack();
            } else {
                updatePlayButtons(false);
            }
        }
    }

    function setVolume(val) {
        initAudio();
        const v = Math.max(0, Math.min(1, parseFloat(val)));
        audio.volume = v;
        document.querySelectorAll('.volume-slider, #volume-slider, #volume-slider-desktop').forEach(slider => {
            slider.value = v;
        });
    }

    function seek(e) {
        initAudio();
        if (!audio.duration) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const fraction = clickX / rect.width;
        audio.currentTime = fraction * audio.duration;
    }

    function toggleShuffle() {
        isShuffle = !isShuffle;
        document.querySelectorAll('.shuffle-btn, #shuffle-btn, #shuffle-btn-desktop').forEach(b => {
            b.classList.toggle('text-indigo-400', isShuffle);
            b.classList.toggle('active', isShuffle);
        });
    }

    function toggleRepeat() {
        if (repeatMode === 'none') {
            repeatMode = 'all';
        } else if (repeatMode === 'all') {
            repeatMode = 'one';
        } else {
            repeatMode = 'none';
        }
        document.querySelectorAll('.repeat-btn, #repeat-btn, #repeat-btn-desktop').forEach(b => {
            b.classList.toggle('text-indigo-400', repeatMode !== 'none');
            b.classList.toggle('active', repeatMode !== 'none');
            b.title = `Repetir: ${repeatMode}`;
        });
    }

    // Build Playlist DOM
    function renderPlaylist(container) {
        if (!container) return;
        container.innerHTML = '';

        songs.forEach((song, i) => {
            const item = document.createElement('div');
            item.className = `song-item p-3.5 rounded-xl flex items-center justify-between cursor-pointer transition ${i === currentIndex ? 'active bg-indigo-600/30 border-l-4 border-indigo-500' : 'hover:bg-white/5'}`;
            item.innerHTML = `
                <div class="flex items-center gap-3">
                    <span class="w-6 text-center text-xs font-mono text-slate-400 font-bold">${i + 1}</span>
                    <div>
                        <div class="font-semibold text-sm text-white">${song.title}</div>
                        <div class="text-xs text-slate-400">${song.artist}</div>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button type="button" class="w-8 h-8 rounded-full bg-white/10 hover:bg-indigo-600 flex items-center justify-center text-white transition" aria-label="Reproducir pista">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        </svg>
                    </button>
                </div>
            `;
            item.addEventListener('click', () => playTrack(i));
            container.appendChild(item);
        });
    }

    // Particle Visualizer
    function setupVisualizer(canvasId = 'particle-canvas') {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const particles = [];
        const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#00f0ff', '#10b981', '#f59e0b'];

        function resize() {
            if (!canvas.parentElement) return;
            canvas.width = canvas.parentElement.clientWidth || 280;
            canvas.height = canvas.parentElement.clientHeight || 280;
        }
        resize();
        window.addEventListener('resize', resize);

        class Dot {
            constructor() {
                this.reset();
            }
            reset() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.radius = Math.random() * 5 + 2;
                this.color = colors[Math.floor(Math.random() * colors.length)];
                this.vx = (Math.random() - 0.5) * 1.5;
                this.vy = (Math.random() - 0.5) * 1.5;
                this.alpha = Math.random() * 0.7 + 0.3;
            }
            update() {
                this.x += this.vx * (isPlaying ? 2.2 : 0.8);
                this.y += this.vy * (isPlaying ? 2.2 : 0.8);

                if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
                if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
            }
            draw() {
                ctx.save();
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius * (isPlaying ? 1.3 : 1), 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.globalAlpha = this.alpha;
                ctx.shadowColor = this.color;
                ctx.shadowBlur = isPlaying ? 12 : 4;
                ctx.fill();
                ctx.restore();
            }
        }

        for (let i = 0; i < 45; i++) {
            particles.push(new Dot());
        }

        function animate() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            particles.forEach(p => {
                p.update();
                p.draw();
            });
            particleAnimationId = requestAnimationFrame(animate);
        }

        if (particleAnimationId) cancelAnimationFrame(particleAnimationId);
        animate();
    }

    // Global Initializer
    window.initEduAudioPlayer = function () {
        initAudio();

        // Render playlists
        document.querySelectorAll('.playlist-container, #playlist').forEach(renderPlaylist);

        // Bind Play / Pause
        document.querySelectorAll('.music-play-btn, #play-btn, #play-btn-desktop').forEach(b => {
            b.onclick = (e) => {
                e.preventDefault();
                togglePlay();
            };
        });

        // Bind Prev / Next
        document.querySelectorAll('.music-prev-btn, #prev-btn, #prev-btn-desktop').forEach(b => {
            b.onclick = (e) => {
                e.preventDefault();
                prevTrack();
            };
        });
        document.querySelectorAll('.music-next-btn, #next-btn, #next-btn-desktop').forEach(b => {
            b.onclick = (e) => {
                e.preventDefault();
                nextTrack();
            };
        });

        // Bind Shuffle / Repeat
        document.querySelectorAll('.shuffle-btn, #shuffle-btn, #shuffle-btn-desktop').forEach(b => {
            b.onclick = (e) => {
                e.preventDefault();
                toggleShuffle();
            };
        });
        document.querySelectorAll('.repeat-btn, #repeat-btn, #repeat-btn-desktop').forEach(b => {
            b.onclick = (e) => {
                e.preventDefault();
                toggleRepeat();
            };
        });

        // Bind Seek bars
        document.querySelectorAll('.progress-bar-container, .progress-bar-track').forEach(track => {
            track.onclick = seek;
        });

        // Bind Volume sliders
        document.querySelectorAll('.volume-slider, #volume-slider, #volume-slider-desktop').forEach(slider => {
            slider.oninput = (e) => setVolume(e.target.value);
        });

        // Setup visualizer
        setupVisualizer('particle-canvas');

        // Initial track load
        loadTrack(currentIndex);
    };

    // Auto initialize if DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', window.initEduAudioPlayer);
    } else {
        window.initEduAudioPlayer();
    }
})();
