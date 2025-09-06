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
    const audioPlayer = new Audio();
    const playBtn = document.getElementById('play-btn');
    const playIcon = document.getElementById('play-icon');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const progressBar = document.getElementById('progress-bar');
    const currentTimeElement = document.getElementById('current-time');
    const durationElement = document.getElementById('duration');
    const songTitleElement = document.getElementById('song-title');
    const songArtistElement = document.getElementById('song-artist');
    const volumeControl = document.getElementById('volume');
    const playlistElement = document.getElementById('playlist');

    // =================================================================
    // STATE VARIABLES
    // =================================================================
    let currentSongIndex = 0;
    let isPlaying = false;

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
        playBtn.addEventListener('click', togglePlay);
        prevBtn.addEventListener('click', prevSong);
        nextBtn.addEventListener('click', nextSong);
        audioPlayer.addEventListener('timeupdate', updateProgress);
        audioPlayer.addEventListener('ended', nextSong);
        audioPlayer.addEventListener('loadedmetadata', () => {
            durationElement.textContent = formatTime(audioPlayer.duration);
            updateSongDurations();
        });
        progressBar.parentElement.addEventListener('click', seek);
        volumeControl.addEventListener('input', setVolume);
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

    // Play/pause a song
    function togglePlay() {
        if (isPlaying) {
            audioPlayer.pause();
            playIcon.setAttribute('d', 'M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z');
        } else {
            audioPlayer.play();
            playIcon.setAttribute('d', 'M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z');
        }
        isPlaying = !isPlaying;

        // Add visual effect
        playBtn.classList.toggle('bg-indigo-700', isPlaying);
    }

    // Play previous song
    function prevSong() {
        currentSongIndex = (currentSongIndex - 1 + songs.length) % songs.length;
        loadSong(currentSongIndex);
        if (isPlaying) {
            audioPlayer.play();
        }
    }

    // Play next song
    function nextSong() {
        currentSongIndex = (currentSongIndex + 1) % songs.length;
        loadSong(currentSongIndex);
        if (isPlaying) {
            audioPlayer.play();
        }
    }

    // Update progress bar
    function updateProgress() {
        const { currentTime, duration } = audioPlayer;
        const progressPercent = (currentTime / duration) * 100;
        progressBar.style.width = `${progressPercent}%`;
        currentTimeElement.textContent = formatTime(currentTime);
    }

    // Seek in the song
    function seek(e) {
        const width = this.clientWidth;
        const clickX = e.offsetX;
        const duration = audioPlayer.duration;
        audioPlayer.currentTime = (clickX / width) * duration;
    }

    // Set volume
    function setVolume() {
        audioPlayer.volume = this.value;
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
canvas.width = 320;
canvas.height = 320;

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

function initParticles() {
    for (let i = 0; i < 80; i++) {
        particles.push(new Particle());
    }
}

function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < particles.length; i++) {
        particles[i].update();
        particles[i].draw();
    }

    requestAnimationFrame(animate);
}

initParticles();
animate();
