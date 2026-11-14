/* =================================================================
    SMOOTH SCROLLING
================================================================== */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (!href || href === '#') {
            return;
        }
        const target = document.querySelector(href);
        if (!target) {
            return;
        }
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });

        // Close mobile menu after navigating
        const mobileMenuEl = document.getElementById('mobile-menu');
        const mobileMenuBtn = document.getElementById('mobile-menu-button');
        if (mobileMenuEl && !mobileMenuEl.classList.contains('hidden')) {
            mobileMenuEl.classList.add('hidden');
            if (mobileMenuBtn) {
                mobileMenuBtn.setAttribute('aria-expanded', 'false');
            }
        }
    });
});

/* =================================================================
    BACK TO TOP BUTTON
================================================================== */
const backToTopButton = document.getElementById('back-to-top');

if (backToTopButton) {
    window.addEventListener('scroll', () => {
        if (window.pageYOffset > 300) {
            backToTopButton.classList.remove('hidden');
            backToTopButton.classList.add('flex');
        } else {
            backToTopButton.classList.add('hidden');
            backToTopButton.classList.remove('flex');
        }
    });

    backToTopButton.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

/* =================================================================
    MOBILE MENU
================================================================== */
const mobileMenuButton = document.getElementById('mobile-menu-button');
const mobileMenu = document.getElementById('mobile-menu');

if (mobileMenuButton && mobileMenu) {
    mobileMenuButton.addEventListener('click', () => {
        const isHidden = mobileMenu.classList.toggle('hidden');
        mobileMenuButton.setAttribute('aria-expanded', String(!isHidden));
    });
}

/* =================================================================
    DARK MODE
================================================================== */
const darkToggle = document.getElementById('dark-toggle');
const body = document.body;

function applyTheme(isDark) {
    document.documentElement.classList.toggle('dark', isDark);
    body.classList.toggle('dark', isDark);
    if (darkToggle) {
        darkToggle.textContent = isDark ? '☀️' : '🌙';
    }
}

const savedTheme = localStorage.getItem('theme');
applyTheme(savedTheme === 'dark');

if (darkToggle) {
    darkToggle.addEventListener('click', () => {
        const nextIsDark = !document.documentElement.classList.contains('dark');
        applyTheme(nextIsDark);
        localStorage.setItem('theme', nextIsDark ? 'dark' : 'light');
    });
}

/* =================================================================
    CONTACT FORM (AJAX VIA FORMSUBMIT)
================================================================== */
const contactForm = document.getElementById('contact-form');
const formStatus = document.getElementById('form-status');
const submitBtn = document.getElementById('contact-submit-btn');

function setFormStatus(message, isSuccess) {
    if (!formStatus) return;
    formStatus.textContent = message;
    formStatus.className = isSuccess
        ? 'rounded-xl p-4 text-sm font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-800'
        : 'rounded-xl p-4 text-sm font-medium bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-800';
}

if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(contactForm);
        if (formData.get('_honey')) {
            return;
        }

        const originalBtnText = submitBtn ? submitBtn.textContent : '';
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Enviando...';
        }
        if (formStatus) {
            formStatus.classList.add('hidden');
        }

        try {
            const response = await fetch('https://formsubmit.co/ajax/d0b7036e47711b369cb182e140653fa5', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json'
                },
                body: formData
            });

            const result = await response.json().catch(() => ({}));
            if (response.ok && (result.success === 'true' || result.success === true || response.status === 200)) {
                setFormStatus('¡Mensaje enviado con éxito! Gracias por escribirme, te responderé a la brevedad.', true);
                contactForm.reset();
            } else {
                setFormStatus('No se pudo completar el envío en este momento. Por favor intenta nuevamente o agenda una reunión en Google Calendar.', false);
            }
        } catch (error) {
            setFormStatus('Error de conexión al enviar el mensaje. Intenta nuevamente o agenda una reunión directa en Google Calendar.', false);
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = originalBtnText;
            }
        }
    });
}

/* =================================================================
    MUSIC PLAYER MODAL
================================================================== */
const musicPlayerContainer = document.getElementById('music-player-container');
const showMusicPlayerBtn = document.getElementById('show-music-player');

function loadMusicPlayerScript() {
    if (typeof window.initMusicPlayer === 'function') {
        window.initMusicPlayer();
        return;
    }

    const existingScript = document.querySelector('script[data-music-player-script="true"]');
    if (existingScript) {
        existingScript.addEventListener('load', () => {
            if (typeof window.initMusicPlayer === 'function') {
                window.initMusicPlayer();
            }
        });
        return;
    }

    const script = document.createElement('script');
    script.src = 'js/music-player.js';
    script.dataset.musicPlayerScript = 'true';
    script.onload = () => {
        if (typeof window.initMusicPlayer === 'function') {
            window.initMusicPlayer();
        }
    };
    document.body.appendChild(script);
}

function openMusicPlayer() {
    if (!musicPlayerContainer) return;

    fetch('music_player.html')
        .then(response => {
            if (!response.ok) {
                throw new Error('No se pudo cargar el reproductor');
            }
            return response.text();
        })
        .then(html => {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const musicPlayerNode = doc.getElementById('music-player-root');

            if (musicPlayerNode) {
                musicPlayerContainer.innerHTML = '';

                const dialog = document.createElement('div');
                dialog.className = 'music-player-dialog';

                const closeBtn = document.createElement('button');
                closeBtn.type = 'button';
                closeBtn.innerHTML = '&times;';
                closeBtn.className = 'close-btn';
                closeBtn.setAttribute('aria-label', 'Cerrar reproductor');
                closeBtn.addEventListener('click', closeMusicPlayer);

                dialog.appendChild(closeBtn);
                dialog.appendChild(musicPlayerNode);
                musicPlayerContainer.appendChild(dialog);

                musicPlayerContainer.classList.remove('hidden');
                musicPlayerContainer.classList.add('music-player-overlay');
                document.body.classList.add('body-no-scroll');

                loadMusicPlayerScript();
            }
        })
        .catch(error => console.error('Error loading the music player:', error));
}

function closeMusicPlayer() {
    if (!musicPlayerContainer) return;

    if (typeof window.stopMusicPlayer === 'function') {
        window.stopMusicPlayer();
    }

    musicPlayerContainer.classList.add('hidden');
    musicPlayerContainer.classList.remove('music-player-overlay');
    musicPlayerContainer.innerHTML = '';
    document.body.classList.remove('body-no-scroll');
}

if (showMusicPlayerBtn) {
    showMusicPlayerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openMusicPlayer();
    });
}

if (musicPlayerContainer) {
    musicPlayerContainer.addEventListener('click', (e) => {
        if (e.target === musicPlayerContainer) {
            closeMusicPlayer();
        }
    });
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && musicPlayerContainer && !musicPlayerContainer.classList.contains('hidden')) {
        closeMusicPlayer();
    }
});
