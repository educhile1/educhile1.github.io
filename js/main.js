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
