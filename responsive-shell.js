const isMobile = () => window.matchMedia('(max-width: 820px)').matches;

function syncResponsiveNavigation() {
  const nav = document.getElementById('mobileNav');
  if (!nav) return;
  nav.querySelectorAll('.mobile-nav-item').forEach(item => {
    item.setAttribute('aria-current', item.classList.contains('active') ? 'page' : 'false');
  });
  const settings = nav.querySelector('[data-view="profile"] small');
  if (settings) settings.textContent = 'Settings';
}

document.addEventListener('DOMContentLoaded', syncResponsiveNavigation);
window.addEventListener('resize', syncResponsiveNavigation, { passive: true });

// Keep the mobile shell from exposing the conversation panel behind the navigation.
document.addEventListener('click', event => {
  const button = event.target.closest('[data-view]');
  if (!button || !isMobile()) return;
  if (button.dataset.view !== 'chats' && document.body.classList.contains('chat-open')) {
    document.body.classList.remove('chat-open');
  }
  requestAnimationFrame(syncResponsiveNavigation);
}, true);

new MutationObserver(syncResponsiveNavigation).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
