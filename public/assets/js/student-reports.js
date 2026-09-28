document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('submit', async (e) => {
    const form = e.target.closest('.student-task-form');
    if (!form) return;
    e.preventDefault();

    const taskId = form.dataset.taskId;
    const textarea = form.querySelector('textarea[name="progress"]');
    const fileInput = form.querySelector('input[name="photo"]');
    const progress = textarea.value.trim();
    const btn = form.querySelector('button[type="submit"]');
    const defaultLabel = btn.textContent;

    if (progress.length < 10) {
      alert('Describe your feedback (at least 10 characters).');
      return;
    }
    if (!fileInput.files.length) {
      alert('Upload a proof photo for this task.');
      return;
    }

    const formData = new FormData();
    formData.append('progress', progress);
    formData.append('photo', fileInput.files[0]);

    btn.disabled = true;
    btn.textContent = 'Submitting…';

    try {
      const res = await fetch(`/student/tasks/${taskId}/progress`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
        body: formData,
      });
      const raw = await res.text();
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error('Could not submit task.');
      }
      if (data.type !== 'success') {
        alert(data.message || 'Could not submit task.');
        btn.disabled = false;
        btn.textContent = defaultLabel;
        return;
      }
      location.reload();
    } catch (err) {
      alert(err.message || 'Could not submit task.');
      btn.disabled = false;
      btn.textContent = defaultLabel;
    }
  });
});
