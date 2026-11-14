/* =================================================================
    MUSIC PLAYER & PARTICLE ANIMATION
================================================================== */
(function () {
    let activeAudioPlayer = null;
    let activeAnimationFrame = null;
    let resizeHandler = null;

    window.stopMusicPlayer = function () {
        if (activeAudioPlayer) {
            activeAudioPlayer.pause();
            activeAudioPlayer.src = '';
            activeAudioPlayer = null;
        }
        if (activeAnimationFrame !== null) {
            cancelAnimationFrame(activeAnimationFrame);
            activeAnimationFrame = null;
        }
        if (resizeHandler) {
            window.removeEventListener('resize', resizeHandler);
            resizeHandler = null;
        }
    };

    window.initMusicPlayer = function () {
        window.stopMusicPlayer();

        const musicFolder = 'music/';
        const songs = [
            { title: 'Cruzando cielos', artist: 'Eduardo Cayún M. / IA', file: 'Cruzando Cielos.mp3' },
            { title: 'Maxi y Luka, para su Opa', artist: 'Eduardo Cayún M. / IA', file: 'Opa Amor.mp3' },
            { title: 'Together', artist: 'Eduardo Cayún M. / IA', file: 'Together.mp3' }
        ];

        const audioPlayer = new Audio();
        activeAudioPlayer = audioPlayer;

        const songTitleElement = document.getElementById('song-title');
        const songArtistElement = document.getElementById('song-artist');
        const playlistElement = document.getElementById('playlist');

        // Mobile controls
        const playBtn = document.getElementById('play-btn');
        const playIcon = document.getElementById('play-icon');
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');
        const progressBar = document.getElementById('progress-bar');
        const currentTimeElement = document.getElementById('current-time');
        const durationElement = document.getElementById('duration');
        const volumeSlider = document.getElementById('volume-slider');
        const shuffleBtn = document.getElementById('shuffle-btn');
        const repeatBtn = document.getElementById('repeat-btn');

        // Desktop controls
        const playBtnDesktop = document.getElementById('play-btn-desktop');
        const playIconDesktop = document.getElementById('play-icon-desktop');
        const prevBtnDesktop = document.getElementById('prev-btn-desktop');
        const nextBtnDesktop = document.getElementById('next-btn-desktop');
        const progressBarDesktop = document.getElementById('progress-bar-desktop');
        const currentTimeElementDesktop = document.getElementById('current-time-desktop');
        const durationElementDesktop = document.getElementById('duration-desktop');
        const volumeSliderDesktop = document.getElementById('volume-slider-desktop');
        const shuffleBtnDesktop = document.getElementById('shuffle-btn-desktop');
        const repeatBtnDesktop = document.getElementById('repeat-btn-desktop');

        if (!playlistElement || !songTitleElement || !songArtistElement) {
            return;
        }

        let currentSongIndex = 0;
        let isPlaying = false;
        let isShuffle = false;
        let repeatMode = 'none'; // 'none', 'one', 'all'

        const PLAY_ICON_PATH = 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z';
        const PAUSE_ICON_PATH = 'M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z';

        function formatTime(seconds) {
            if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
            const minutes = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
        }

        function setPlayState(playing) {
            isPlaying = playing;
            const path = playing ? PAUSE_ICON_PATH : PLAY_ICON_PATH;
            if (playIcon) playIcon.setAttribute('d', path);
            if (playIconDesktop) playIconDesktop.setAttribute('d', path);
            if (playBtn) {
                playBtn.classList.toggle('bg-indigo-700', playing);
                playBtn.classList.toggle('active', playing);
            }
            if (playBtnDesktop) {
                playBtnDesktop.classList.toggle('bg-indigo-700', playing);
                playBtnDesktop.classList.toggle('active', playing);
            }
        }

        function setVolume(event) {
            const newVolume = parseFloat(event.target.value);
            audioPlayer.volume = newVolume;
            if (volumeSlider) volumeSlider.value = newVolume;
            if (volumeSliderDesktop) volumeSliderDesktop.value = newVolume;
        }

        function loadSong(index) {
            currentSongIndex = index;
            const song = songs[index];
            audioPlayer.src = encodeURI(musicFolder + song.file);
            songTitleElement.textContent = song.title;
            songArtistElement.textContent = song.artist;

            document.querySelectorAll('#music-player-root .song-item').forEach((item, i) => {
                item.classList.toggle('active', i === index);
            });

            if (progressBar) progressBar.style.width = '0%';
            if (progressBarDesktop) progressBarDesktop.style.width = '0%';
            if (currentTimeElement) currentTimeElement.textContent = '0:00';
            if (currentTimeElementDesktop) currentTimeElementDesktop.textContent = '0:00';

            const cover = document.querySelector('#music-player-root .album-cover');
            if (cover) {
                cover.classList.add('animate-pulse');
                setTimeout(() => cover.classList.remove('animate-pulse'), 500);
            }
        }

        function playSong(index) {
            loadSong(index);
            audioPlayer.play().then(() => {
                setPlayState(true);
            }).catch(err => console.error('Audio playback error:', err));
        }

        function togglePlay() {
            if (isPlaying) {
                audioPlayer.pause();
                setPlayState(false);
            } else if (!audioPlayer.src) {
                playSong(0);
            } else {
                audioPlayer.play().then(() => {
                    setPlayState(true);
                }).catch(err => console.error('Audio playback error:', err));
            }
        }

        function prevSong() {
            const prevIndex = (currentSongIndex - 1 + songs.length) % songs.length;
            playSong(prevIndex);
        }

        function nextSong() {
            let nextIndex;
            if (isShuffle && songs.length > 1) {
                do {
                    nextIndex = Math.floor(Math.random() * songs.length);
                } while (nextIndex === currentSongIndex);
            } else {
                nextIndex = (currentSongIndex + 1) % songs.length;
            }
            playSong(nextIndex);
        }

        function toggleShuffle() {
            isShuffle = !isShuffle;
            if (shuffleBtn) shuffleBtn.classList.toggle('active', isShuffle);
            if (shuffleBtnDesktop) shuffleBtnDesktop.classList.toggle('active', isShuffle);
        }

        function toggleRepeat() {
            const repeatSVG = {
                all: `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7l-4 4 4 4M17 17l4-4-4-4M3 12h18" /></svg>`,
                one: `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7l-4 4 4 4M17 17l4-4-4-4M3 12h18" /><path d="M12 8v8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
                none: `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 2l4 4-4 4M3 12h18M7 22l-4-4 4-4" /></svg>`
            };

            if (repeatMode === 'none') {
                repeatMode = 'all';
                if (repeatBtn) {
                    repeatBtn.classList.add('active');
                    repeatBtn.innerHTML = repeatSVG.all;
                }
                if (repeatBtnDesktop) {
                    repeatBtnDesktop.classList.add('active');
                    repeatBtnDesktop.innerHTML = repeatSVG.all;
                }
            } else if (repeatMode === 'all') {
                repeatMode = 'one';
                if (repeatBtn) repeatBtn.innerHTML = repeatSVG.one;
                if (repeatBtnDesktop) repeatBtnDesktop.innerHTML = repeatSVG.one;
            } else {
                repeatMode = 'none';
                if (repeatBtn) {
                    repeatBtn.classList.remove('active');
                    repeatBtn.innerHTML = repeatSVG.none;
                }
                if (repeatBtnDesktop) {
                    repeatBtnDesktop.classList.remove('active');
                    repeatBtnDesktop.innerHTML = repeatSVG.none;
                }
            }
        }

        function handleSongEnd() {
            if (repeatMode === 'one') {
                playSong(currentSongIndex);
            } else if (repeatMode === 'all') {
                nextSong();
            } else {
                setPlayState(false);
            }
        }

        function updateProgress() {
            const { currentTime, duration } = audioPlayer;
            const progressPercent = duration ? (currentTime / duration) * 100 : 0;
            if (progressBar) progressBar.style.width = `${progressPercent}%`;
            if (progressBarDesktop) progressBarDesktop.style.width = `${progressPercent}%`;
            if (currentTimeElement) currentTimeElement.textContent = formatTime(currentTime);
            if (currentTimeElementDesktop) currentTimeElementDesktop.textContent = formatTime(currentTime);
        }

        function updateSongDurations() {
            document.querySelectorAll('#music-player-root .song-item').forEach((item, index) => {
                if (index === currentSongIndex) {
                    const durationSpan = item.querySelector('span');
                    if (durationSpan) {
                        durationSpan.textContent = formatTime(audioPlayer.duration);
                    }
                }
            });
        }

        function updateDuration() {
            const duration = audioPlayer.duration;
            if (durationElement) durationElement.textContent = formatTime(duration);
            if (durationElementDesktop) durationElementDesktop.textContent = formatTime(duration);
            updateSongDurations();
        }

        function seek(e) {
            const width = this.clientWidth;
            const duration = audioPlayer.duration;
            if (!width || !isFinite(duration) || duration <= 0) return;
            audioPlayer.currentTime = (e.offsetX / width) * duration;
        }

        // Build playlist cleanly
        playlistElement.innerHTML = '';
        songs.forEach((song, index) => {
            const songElement = document.createElement('div');
            songElement.className = `song-item p-3 rounded-lg flex justify-between items-center ${index === currentSongIndex ? 'active' : ''}`;
            songElement.innerHTML = `
                <div>
                    <div class="font-medium text-white">${song.title}</div>
                    <div class="text-sm text-slate-400">${song.artist}</div>
                </div>
                <span class="text-xs text-slate-400">${formatTime(0)}</span>
            `;
            songElement.addEventListener('click', () => playSong(index));
            playlistElement.appendChild(songElement);
        });

        loadSong(currentSongIndex);

        if (playBtn) playBtn.addEventListener('click', togglePlay);
        if (prevBtn) prevBtn.addEventListener('click', prevSong);
        if (nextBtn) nextBtn.addEventListener('click', nextSong);
        if (progressBar && progressBar.parentElement) progressBar.parentElement.addEventListener('click', seek);
        if (volumeSlider) volumeSlider.addEventListener('input', setVolume);
        if (shuffleBtn) shuffleBtn.addEventListener('click', toggleShuffle);
        if (repeatBtn) repeatBtn.addEventListener('click', toggleRepeat);

        if (playBtnDesktop) playBtnDesktop.addEventListener('click', togglePlay);
        if (prevBtnDesktop) prevBtnDesktop.addEventListener('click', prevSong);
        if (nextBtnDesktop) nextBtnDesktop.addEventListener('click', nextSong);
        if (progressBarDesktop && progressBarDesktop.parentElement) progressBarDesktop.parentElement.addEventListener('click', seek);
        if (volumeSliderDesktop) volumeSliderDesktop.addEventListener('input', setVolume);
        if (shuffleBtnDesktop) shuffleBtnDesktop.addEventListener('click', toggleShuffle);
        if (repeatBtnDesktop) repeatBtnDesktop.addEventListener('click', toggleRepeat);

        audioPlayer.addEventListener('timeupdate', updateProgress);
        audioPlayer.addEventListener('loadedmetadata', updateDuration);
        audioPlayer.addEventListener('ended', handleSongEnd);

        // =================================================================
        // PARTICLE ANIMATION
        // =================================================================
        const canvas = document.getElementById('particle-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const particles = [];
        const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#f59e0b', '#10b981', '#06b6d4'];

        class Particle {
            constructor() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.baseSize = Math.random() * 8 + 2;
                this.size = this.baseSize;
                this.targetSize = this.baseSize;
                this.color = colors[Math.floor(Math.random() * colors.length)];
                this.speedX = Math.random() * 3 - 1.5;
                this.speedY = Math.random() * 3 - 1.5;
                this.shape = Math.floor(Math.random() * 3);
                this.rotation = 0;
                this.rotationSpeed = Math.random() * 0.1 - 0.05;
            }

            update() {
                this.x += this.speedX;
                this.y += this.speedY;
                this.rotation += this.rotationSpeed;

                if (this.x > canvas.width || this.x < 0) this.speedX *= -1;
                if (this.y > canvas.height || this.y < 0) this.speedY *= -1;

                if (Math.random() < 0.02) {
                    this.targetSize = this.baseSize * (0.5 + Math.random());
                }
                this.size += (this.targetSize - this.size) * 0.1;

                if (Math.random() < 0.005) {
                    this.shape = Math.floor(Math.random() * 3);
                }

                if (Math.random() < 0.01) {
                    this.color = colors[Math.floor(Math.random() * colors.length)];
                }
            }

            draw() {
                ctx.fillStyle = this.color;
                ctx.save();
                ctx.translate(this.x, this.y);
                ctx.rotate(this.rotation);

                switch (this.shape) {
                    case 0:
                        ctx.beginPath();
                        ctx.arc(0, 0, this.size, 0, Math.PI * 2);
                        ctx.fill();
                        break;
                    case 1:
                        ctx.fillRect(-this.size, -this.size, this.size * 2, this.size * 2);
                        break;
                    case 2:
                        ctx.beginPath();
                        ctx.moveTo(0, -this.size);
                        ctx.lineTo(-this.size, this.size);
                        ctx.lineTo(this.size, this.size);
                        ctx.closePath();
                        ctx.fill();
                        break;
                }

                ctx.restore();
            }
        }

        function resizeCanvas() {
            const container = canvas.parentElement;
            if (container) {
                canvas.width = container.clientWidth || 300;
                canvas.height = container.clientHeight || 300;
            }
        }

        resizeCanvas();
        resizeHandler = resizeCanvas;
        window.addEventListener('resize', resizeHandler);

        for (let i = 0; i < 65; i++) {
            particles.push(new Particle());
        }

        function animate() {
            if (!document.body.contains(canvas)) {
                activeAnimationFrame = null;
                return;
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (let i = 0; i < particles.length; i++) {
                particles[i].update();
                particles[i].draw();
            }

            activeAnimationFrame = requestAnimationFrame(animate);
        }

        animate();
    };

    // Auto-initialize when opened directly via music_player.html
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (document.getElementById('playlist')) {
                window.initMusicPlayer();
            }
        });
    }
})();
