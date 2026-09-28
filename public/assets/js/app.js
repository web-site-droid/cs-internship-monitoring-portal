document.addEventListener('DOMContentLoaded', function () {
  const roleCards = document.querySelectorAll('[data-role]');
  const signinModal = document.getElementById('signinModal');

  function selectRole(role) {
    roleCards.forEach((card) => {
      card.classList.toggle('selected', card.dataset.role === role);
    });
  }

  function openSignin() {
    if (!signinModal) return;
    signinModal.hidden = false;
    signinModal.classList.add('is-open');
    document.body.classList.add('signin-open');
    const email = document.getElementById('email');
    if (email) email.focus();
  }

  function closeSignin() {
    if (!signinModal) return;
    signinModal.hidden = true;
    signinModal.classList.remove('is-open');
    document.body.classList.remove('signin-open');
  }

  roleCards.forEach((card) => {
    card.addEventListener('click', (event) => {
      selectRole(card.dataset.role);
      if (card.classList.contains('js-open-signin')) {
        event.preventDefault();
        openSignin();
      }
    });
  });

  document.querySelectorAll('.js-open-signin').forEach((link) => {
    if (link.hasAttribute('data-role')) return;
    link.addEventListener('click', (event) => {
      event.preventDefault();
      openSignin();
    });
  });

  if (signinModal) {
    signinModal.querySelectorAll('[data-close-signin]').forEach((el) => {
      el.addEventListener('click', closeSignin);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !signinModal.hidden) closeSignin();
    });
    if (signinModal.classList.contains('is-open')) {
      document.body.classList.add('signin-open');
    }
  }

  const params = new URLSearchParams(window.location.search);
  const preRole = params.get('role');
  if (preRole) selectRole(preRole);

  const backToTop = document.getElementById('backToTop');
  if (backToTop) {
    const toggleBackToTop = () => {
      const show = window.scrollY > 280;
      backToTop.hidden = !show;
    };
    toggleBackToTop();
    window.addEventListener('scroll', toggleBackToTop, { passive: true });
    backToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
});
