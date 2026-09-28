document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('photoViewerModal');
  const modalImg = document.getElementById('photoViewerModalImg');
  const modalTitle = document.getElementById('photoViewerModalTitle');
  const modalSubtitle = document.getElementById('photoViewerModalSubtitle');

  if (!modal || !modalImg) return;

  function openPhoto(url, title, label) {
    modalImg.src = url;
    modalImg.alt = label || title || 'Photo preview';
    if (modalTitle) modalTitle.textContent = title || 'Photo';
    if (modalSubtitle) modalSubtitle.textContent = label || '';
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closePhoto() {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    modalImg.src = '';
    document.body.style.overflow = '';
  }

  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('.view-photo-btn, .ojt-view-photo-btn, .attendance-photo-thumb, .file-explorer-photo');
    if (!btn) return;
    e.preventDefault();
    const url = btn.dataset.photoUrl;
    const title = btn.dataset.photoTitle || 'Photo';
    const label = btn.dataset.photoLabel || '';
    if (url) openPhoto(url, title, label);
  });

  modal.querySelectorAll('[data-photo-viewer-close]').forEach((el) => {
    el.addEventListener('click', closePhoto);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) closePhoto();
  });
});
