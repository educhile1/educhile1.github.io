/* =================================================================
   EDUARDO CAYÚN M. — MAIN APP SCRIPTS
================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    /* -------------------------------------------------------------
       1. SMOOTH SCROLLING & AUTO-CLOSE MOBILE MENU
    ------------------------------------------------------------- */
    const mobileBtn = document.getElementById('mobile-menu-button');
    const mobileMenu = document.getElementById('mobile-menu');

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (!href || href === '#') return;
            const target = document.querySelector(href);
            if (!target) return;

            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth' });

            if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
                mobileMenu.classList.add('hidden');
                if (mobileBtn) mobileBtn.setAttribute('aria-expanded', 'false');
            }
        });
    });

    /* -------------------------------------------------------------
       2. MOBILE MENU TOGGLE
    ------------------------------------------------------------- */
    if (mobileBtn && mobileMenu) {
        mobileBtn.addEventListener('click', () => {
            const isHidden = mobileMenu.classList.toggle('hidden');
            mobileBtn.setAttribute('aria-expanded', String(!isHidden));
        });
    }

    /* -------------------------------------------------------------
       3. BACK TO TOP BUTTON
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
});
