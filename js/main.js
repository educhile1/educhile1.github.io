/* =================================================================
   EDUARDO CAYÚN M. — MAIN APP SCRIPTS
================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    /* -------------------------------------------------------------
       1. SMOOTH SCROLLING
    ------------------------------------------------------------- */
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (!href || href === '#') return;
            const target = document.querySelector(href);
            if (!target) return;

            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth' });

            // Close mobile menu if open
            const mobileMenu = document.getElementById('mobile-menu');
            const mobileBtn = document.getElementById('mobile-menu-button');
            if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
                mobileMenu.classList.add('hidden');
                if (mobileBtn) mobileBtn.setAttribute('aria-expanded', 'false');
            }
        });
    });

    /* -------------------------------------------------------------
       2. MOBILE MENU
    ------------------------------------------------------------- */
    const mobileBtn = document.getElementById('mobile-menu-button');
    const mobileMenu = document.getElementById('mobile-menu');
    if (mobileBtn && mobileMenu) {
        mobileBtn.addEventListener('click', () => {
            const isHidden = mobileMenu.classList.toggle('hidden');
            mobileBtn.setAttribute('aria-expanded', String(!isHidden));
        });
    }

    /* -------------------------------------------------------------
       3. DARK / LIGHT THEME TOGGLE
    ------------------------------------------------------------- */
    const darkToggle = document.getElementById('dark-toggle');

    function applyTheme(isDark) {
        document.documentElement.classList.toggle('dark', isDark);
        document.body.classList.toggle('dark', isDark);
        if (darkToggle) {
            darkToggle.textContent = isDark ? '☀️' : '🌙';
        }
    }

    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialIsDark = savedTheme ? savedTheme === 'dark' : true; // Default to dark for tech aesthetic
    applyTheme(initialIsDark);

    if (darkToggle) {
        darkToggle.addEventListener('click', () => {
            const nextIsDark = !document.documentElement.classList.contains('dark');
            applyTheme(nextIsDark);
            localStorage.setItem('theme', nextIsDark ? 'dark' : 'light');
        });
    }

    /* -------------------------------------------------------------
       4. BACK TO TOP BUTTON
    ------------------------------------------------------------- */
    const backToTopBtn = document.getElementById('back-to-top');
    if (backToTopBtn) {
        window.addEventListener('scroll', () => {
            if (window.pageYOffset > 350) {
                backToTopBtn.classList.remove('hidden');
                backToTopBtn.classList.add('flex');
            } else {
                backToTopBtn.classList.add('hidden');
                backToTopBtn.classList.remove('flex');
            }
        });

        backToTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    /* -------------------------------------------------------------
       5. CONTACT FORM (AJAX VIA FORMSUBMIT)
    ------------------------------------------------------------- */
    const contactForm = document.getElementById('contact-form');
    const formStatus = document.getElementById('form-status');
    const submitBtn = document.getElementById('contact-submit-btn');

    if (contactForm) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const formData = new FormData(contactForm);
            if (formData.get('_honey')) return; // Honeypot triggered

            const originalText = submitBtn ? submitBtn.textContent : '';
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Enviando mensaje...';
            }
            if (formStatus) {
                formStatus.classList.add('hidden');
            }

            try {
                const response = await fetch('https://formsubmit.co/ajax/d0b7036e47711b369cb182e140653fa5', {
                    method: 'POST',
                    headers: { 'Accept': 'application/json' },
                    body: formData
                });

                const result = await response.json().catch(() => ({}));
                if (response.ok && (result.success === 'true' || result.success === true || response.status === 200)) {
                    if (formStatus) {
                        formStatus.textContent = '¡Mensaje enviado con éxito! Gracias por tu interés, te responderé a la brevedad.';
                        formStatus.className = 'rounded-xl p-4 text-sm font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 block';
                        formStatus.classList.remove('hidden');
                    }
                    contactForm.reset();
                } else {
                    throw new Error('Error en el servicio de envío');
                }
            } catch (err) {
                if (formStatus) {
                    formStatus.textContent = 'Hubo un inconveniente al enviar. Por favor intenta nuevamente o agenda una reunión en Google Calendar.';
                    formStatus.className = 'rounded-xl p-4 text-sm font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/40 block';
                    formStatus.classList.remove('hidden');
                }
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalText;
                }
            }
        });
    }

    /* -------------------------------------------------------------
       6. INITIALIZE INTEGRATED MUSIC PLAYER
    ------------------------------------------------------------- */
    if (typeof window.initEduAudioPlayer === 'function') {
        window.initEduAudioPlayer();
    }
});
