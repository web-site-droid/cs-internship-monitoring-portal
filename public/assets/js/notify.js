document.addEventListener('DOMContentLoaded', function () {
  const flashElement = document.querySelector('[data-flash]');
  if (flashElement && typeof Swal !== 'undefined') {
    Swal.fire({
      icon: flashElement.dataset.flashType || 'info',
      title: flashElement.dataset.flashTitle || '',
      text: flashElement.dataset.flashMessage || '',
      confirmButtonColor: '#15803d',
    });
  }

  const menuToggle = document.getElementById('menuToggle');
  const sidebar = document.getElementById('sidebar');
  if (menuToggle && sidebar) {
    menuToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
  }

  document.querySelectorAll('textarea[data-maxlength]').forEach((textarea) => {
    const maxLength = parseInt(textarea.dataset.maxlength, 10);
    const counter = document.createElement('div');
    counter.className = 'text-counter';
    counter.textContent = `${textarea.value.length}/${maxLength}`;
    textarea.after(counter);

    textarea.addEventListener('input', () => {
      if (textarea.value.length > maxLength) {
        textarea.value = textarea.value.substring(0, maxLength);
      }
      counter.textContent = `${textarea.value.length}/${maxLength}`;
    });
  });
});
