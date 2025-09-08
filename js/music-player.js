/* =================================================================
    MUSIC PLAYER
================================================================== */
document.addEventListener('DOMContentLoaded', function() {
    // =================================================================
    // CONFIGURATION
    // =================================================================
    const musicFolder = 'music/';
    const songs = [
        { title: 'Cruzando cielos', artist: 'Eduardo Cayún M. / IA', file: 'Cruzando Cielos.mp3' },
        { title: 'Maxi y Luka, para su Opa', artist: 'Eduardo Cayún M. / IA', file: 'Opa Amor.mp3' },
        { title: 'Together', artist: 'Eduardo Cayún M. / IA', file: 'Together.mp3' }
    ];

    // =================================================================
    // DOM ELEMENTS
    // =================================================================
    // Common
    const audioPlayer = new Audio();
    const songTitleElement = document.getElementById('song-title');
    const songArtistElement = document.getElementById('song-artist');
    const playlistElement = document.getElementById('playlist');

    // Mobile
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

    // Desktop
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

    // =================================================================
    // STATE VARIABLES
    // =================================================================
    let currentSongIndex = 0;
    let isPlaying = false;
    let isShuffle = false;
    let repeatMode = 'none'; // 'none', 'one', 'all'

    // =================================================================
    // PLAYER INITIALIZATION
    // =================================================================
    function initPlayer() {
        // Create playlist
        songs.forEach((song, index) => {
            const songElement = document.createElement('div');
            songElement.className = `song-item p-3 rounded-lg flex justify-between items-center ${index === currentSongIndex ? 'active' : ''}`;
            songElement.innerHTML = `
                <div>
                    <div class="font-medium">${song.title}</div>
                    <div class="text-sm text-slate-400">${song.artist}</div>
                </div>
                <span class="text-xs text-slate-500">${formatTime(0)}</span>
            `;
            songElement.addEventListener('click', () => playSong(index));
            playlistElement.appendChild(songElement);
        });

        // Load the first song
        loadSong(currentSongIndex);

        // Add event listeners
        // Mobile
        playBtn.addEventListener('click', togglePlay);
        prevBtn.addEventListener('click', prevSong);
        nextBtn.addEventListener('click', nextSong);
        progressBar.parentElement.addEventListener('click', seek);
        volumeSlider.addEventListener('input', setVolume);
        shuffleBtn.addEventListener('click', toggleShuffle);
        repeatBtn.addEventListener('click', toggleRepeat);

        // Desktop
        playBtnDesktop.addEventListener('click', togglePlay);
        prevBtnDesktop.addEventListener('click', prevSong);
        nextBtnDesktop.addEventListener('click', nextSong);
        progressBarDesktop.parentElement.addEventListener('click', seek);
        volumeSliderDesktop.addEventListener('input', setVolume);
        shuffleBtnDesktop.addEventListener('click', toggleShuffle);
        repeatBtnDesktop.addEventListener('click', toggleRepeat);

        // Global Audio Events
        audioPlayer.addEventListener('timeupdate', updateProgress);
        audioPlayer.addEventListener('loadedmetadata', updateDuration);
        audioPlayer.addEventListener('ended', handleSongEnd);
    }

    // =================================================================
    // VOLUME CONTROL
    // =================================================================
    function setVolume() {
        audioPlayer.volume = volumeSlider.value;
        // Sync desktop slider if it exists
        if (volumeSliderDesktop) {
            volumeSliderDesktop.value = volumeSlider.value;
        }
    }

    // =================================================================
    // PLAYER FUNCTIONS
    // =================================================================
    // Load a song
    function loadSong(index) {
        const song = songs[index];
        audioPlayer.src = musicFolder + song.file;
        songTitleElement.textContent = song.title;
        songArtistElement.textContent = song.artist;

        // Update active class in playlist
        document.querySelectorAll('.song-item').forEach((item, i) => {
            if (i === index) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // Reset progress bar
        progressBar.style.width = '0%';
        currentTimeElement.textContent = '0:00';

        // Apply animation
        document.querySelector('.album-cover').classList.add('animate-pulse');
        setTimeout(() => {
            document.querySelector('.album-cover').classList.remove('animate-pulse');
        }, 500);
    }

    // Play a song
    function playSong(index) {
        // Load the song
        loadSong(index);
        // Play the song
        audioPlayer.play();
        // Update the play/pause icon
        playIcon.setAttribute('d', 'M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z');
        playIconDesktop.setAttribute('d', 'M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z');
        // Update the state
        isPlaying = true;
    }

    // Play/pause a song
    function togglePlay() {
        if (isPlaying) {
            audioPlayer.pause();
            playIcon.setAttribute('d', 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z');
            playIconDesktop.setAttribute('d', 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z');
            isPlaying = false;
        } else {
            // If no song is loaded, play the first one
            if (!audioPlayer.src) {
                playSong(0);
            } else {
                audioPlayer.play();
                playIcon.setAttribute('d', 'M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z');
                playIconDesktop.setAttribute('d', 'M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z');
                isPlaying = true;
            }
        }
        playBtn.classList.toggle('bg-indigo-700', isPlaying);
        playBtnDesktop.classList.toggle('bg-indigo-700', isPlaying);
        playBtn.classList.toggle('active', isPlaying);
        playBtnDesktop.classList.toggle('active', isPlaying);
    }

    // Play previous song
    function prevSong() {
        currentSongIndex = (currentSongIndex - 1 + songs.length) % songs.length;
        playSong(currentSongIndex);
    }

    // Play next song
    function nextSong() {
        if (isShuffle) {
            let newIndex;
            do {
                newIndex = Math.floor(Math.random() * songs.length);
            } while (newIndex === currentSongIndex);
            currentSongIndex = newIndex;
        } else {
            currentSongIndex = (currentSongIndex + 1) % songs.length;
        }
        playSong(currentSongIndex);
    }

    // Toggle shuffle mode
    function toggleShuffle() {
        isShuffle = !isShuffle;
        shuffleBtn.classList.toggle('active', isShuffle);
        shuffleBtnDesktop.classList.toggle('active', isShuffle);
    }

    // Toggle repeat mode
    function toggleRepeat() {
        const repeatSVG = {
            all: `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7l-4 4 4 4M17 17l4-4-4-4M3 12h18" /></svg>`,
            one: `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7l-4 4 4 4M17 17l4-4-4-4M3 12h18" /><path d="M12 8v8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
            none: `<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 2l4 4-4 4M3 12h18M7 22l-4-4 4-4" /></svg>`
        };

        if (repeatMode === 'none') {
            repeatMode = 'all';
            repeatBtn.classList.add('active');
            repeatBtnDesktop.classList.add('active');
            repeatBtn.innerHTML = repeatSVG.all;
            repeatBtnDesktop.innerHTML = repeatSVG.all;
        } else if (repeatMode === 'all') {
            repeatMode = 'one';
            repeatBtn.innerHTML = repeatSVG.one;
            repeatBtnDesktop.innerHTML = repeatSVG.one;
        } else {
            repeatMode = 'none';
            repeatBtn.classList.remove('active');
            repeatBtnDesktop.classList.remove('active');
            repeatBtn.innerHTML = repeatSVG.none;
            repeatBtnDesktop.innerHTML = repeatSVG.none;
        }
    }

    // Handle song end
    function handleSongEnd() {
        if (repeatMode === 'one') {
            playSong(currentSongIndex);
        } else if (repeatMode === 'all') {
            nextSong();
        }
    }

    // Update progress bar
    function updateProgress() {
        const { currentTime, duration } = audioPlayer;
        const progressPercent = (currentTime / duration) * 100;
        if (progressBar) progressBar.style.width = `${progressPercent}%`;
        if (progressBarDesktop) progressBarDesktop.style.width = `${progressPercent}%`;
        if (currentTimeElement) currentTimeElement.textContent = formatTime(currentTime);
        if (currentTimeElementDesktop) currentTimeElementDesktop.textContent = formatTime(currentTime);
    }

    // Update duration display
    function updateDuration() {
        const duration = audioPlayer.duration;
        if (durationElement) durationElement.textContent = formatTime(duration);
        if (durationElementDesktop) durationElementDesktop.textContent = formatTime(duration);
        updateSongDurations();
    }

    // Seek in the song
    function seek(e) {
        const width = this.clientWidth;
        const clickX = e.offsetX;
        const duration = audioPlayer.duration;
        audioPlayer.currentTime = (clickX / width) * duration;
    }

    // Format time to mm:ss
    function formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';

        const minutes = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
    }

    // Update song durations in the playlist
    function updateSongDurations() {
        document.querySelectorAll('.song-item').forEach((item, index) => {
            if (index === currentSongIndex) {
                const durationSpan = item.querySelector('span');
                if (durationSpan) {
                    durationSpan.textContent = formatTime(audioPlayer.duration);
                }
            }
        });
    }

    // =================================================================
    // START PLAYER
    // =================================================================
    initPlayer();
});

/* =================================================================
    PARTICLE ANIMATION
================================================================== */
const canvas = document.getElementById('particle-canvas');
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
        this.shape = Math.floor(Math.random() * 3); // 0=circle, 1=square, 2=triangle
        this.rotation = 0;
        this.rotationSpeed = Math.random() * 0.1 - 0.05;
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.rotation += this.rotationSpeed;

        if (this.x > canvas.width || this.x < 0) this.speedX *= -1;
        if (this.y > canvas.height || this.y < 0) this.speedY *= -1;

        // Random size changes
        if (Math.random() < 0.02) {
            this.targetSize = this.baseSize * (0.5 + Math.random());
        }
        this.size += (this.targetSize - this.size) * 0.1;

        // Random shape changes
        if (Math.random() < 0.005) {
            this.shape = Math.floor(Math.random() * 3);
        }

        // Change color randomly
        if (Math.random() < 0.01) {
            this.color = colors[Math.floor(Math.random() * colors.length)];
        }
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        switch(this.shape) {
            case 0: // Circle
                ctx.beginPath();
                ctx.arc(0, 0, this.size, 0, Math.PI * 2);
                ctx.fill();
                break;

            case 1: // Square
                ctx.fillRect(-this.size, -this.size, this.size * 2, this.size * 2);
                break;

            case 2: // Triangle
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
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
    }
}

function initParticles() {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    particles.length = 0; // Limpiar partículas existentes antes de crear nuevas
    for (let i = 0; i < 80; i++) {
        particles.push(new Particle());
    }
}

function animate() {

    for (let i = 0; i < particles.length; i++) {
        particles[i].update();
        particles[i].draw();
    }

    requestAnimationFrame(animate);
}

initParticles();
animate();
