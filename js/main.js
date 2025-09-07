/* =================================================================
    SMOOTH SCROLLING
================================================================== */
// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        document.querySelector(this.getAttribute('href')).scrollIntoView({
            behavior: 'smooth'
        });
    });
});

/* =================================================================
    BACK TO TOP BUTTON
================================================================== */
// Back to top button
const backToTopButton = document.getElementById('back-to-top');

// Show or hide the button based on scroll position
window.addEventListener('scroll', () => {
    if (window.pageYOffset > 300) {
        backToTopButton.classList.remove('hidden');
        backToTopButton.classList.add('flex');
    } else {
        backToTopButton.classList.add('hidden');
        backToTopButton.classList.remove('flex');
    }
});

// Scroll to top when the button is clicked
backToTopButton.addEventListener('click', () => {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
});

/* =================================================================
    MOBILE MENU
================================================================== */
// Mobile menu toggle
const mobileMenuButton = document.getElementById('mobile-menu-button');
const mobileMenu = document.getElementById('mobile-menu');

mobileMenuButton.addEventListener('click', () => {
    mobileMenu.classList.toggle('hidden');
});

/* =================================================================
    DARK MODE
================================================================== */
const darkToggle = document.getElementById('dark-toggle');
const body = document.body;

// Function to update the dark mode icon
function updateDarkIcon() {
    if (body.classList.contains('dark')) {
        darkToggle.textContent = '☀️';
    } else {
        darkToggle.textContent = '🌙';
    }
}

// Toggle dark mode when the button is clicked
darkToggle.addEventListener('click', () => {
    body.classList.toggle('dark');
    updateDarkIcon();
    // Save user preference in localStorage
    if (body.classList.contains('dark')) {
        localStorage.setItem('theme', 'dark');
    } else {
        localStorage.setItem('theme', 'light');
    }
});

// Check for saved user preference on page load
if (localStorage.getItem('theme') === 'dark') {
    body.classList.add('dark');
}

// Update the icon on page load
updateDarkIcon();

/* =================================================================
    MUSIC PLAYER
================================================================== */
const musicPlayerContainer = document.getElementById('music-player-container');
const showMusicPlayerBtn = document.getElementById('show-music-player');
const showMusicPlayerMobileBtn = document.getElementById('show-music-player-mobile');

function openMusicPlayer() {
    fetch('music_player.html')
        .then(response => response.text())
        .then(html => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const musicPlayerNode = doc.querySelector('.container');

            if (musicPlayerNode) {
                musicPlayerContainer.innerHTML = ''; // Clear previous content
                musicPlayerContainer.appendChild(musicPlayerNode);
                musicPlayerContainer.classList.remove('hidden');
                musicPlayerContainer.classList.add('music-player-overlay');
                document.body.classList.add('body-no-scroll');

                // Add close button
                const closeBtn = document.createElement('button');
                closeBtn.innerHTML = '&times;';
                closeBtn.className = 'close-btn';
                closeBtn.onclick = closeMusicPlayer;
                musicPlayerContainer.prepend(closeBtn);

                // Load music player script
                const script = document.createElement('script');
                script.src = 'js/music-player.js';
                script.onload = () => {
                    // Script loaded
                };
                document.body.appendChild(script);
            }
        })
        .catch(error => console.error('Error loading the music player:', error));
}

function closeMusicPlayer() {
    musicPlayerContainer.classList.add('hidden');
    musicPlayerContainer.classList.remove('music-player-overlay');
    musicPlayerContainer.innerHTML = '';
    document.body.classList.remove('body-no-scroll');
}

showMusicPlayerBtn.addEventListener('click', (e) => {
    e.preventDefault();
    openMusicPlayer();
});

showMusicPlayerMobileBtn.addEventListener('click', (e) => {
    e.preventDefault();
    openMusicPlayer();
});
