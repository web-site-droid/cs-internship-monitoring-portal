document.addEventListener('DOMContentLoaded', () => {
  initOjtLocationModal();
  initOjtLocationSelection();
  initRegisteredStudentsSelection();
  initDailyTaskModals();
});

function initRegisteredStudentsSelection() {
  const bulkForm = document.getElementById('registeredStudentsHoursForm');
  const countEl = document.getElementById('registeredStudentsSelectedCount');
  const setHoursBtn = document.getElementById('registeredStudentsSetHoursBtn');
  const clearBtn = document.getElementById('registeredStudentsClearSelectionBtn');
  const selectAll = document.getElementById('registeredStudentsSelectAll');
  const checkboxes = () => Array.from(document.querySelectorAll('[data-registered-select]'));

  if (!bulkForm || !countEl) return;

  function selectableCheckboxes() {
    return checkboxes().filter((cb) => !cb.disabled);
  }

  function selectedCheckboxes() {
    return selectableCheckboxes().filter((cb) => cb.checked);
  }

  function updateBulkBar() {
    const selected = selectedCheckboxes();
    const count = selected.length;
    bulkForm.classList.toggle('hidden', count === 0);
    countEl.textContent = `${count} selected`;
    if (setHoursBtn) setHoursBtn.disabled = count === 0;

    document.querySelectorAll('[data-registered-row]').forEach((row) => {
      const cb = row.querySelector('[data-registered-select]');
      row.classList.toggle('is-selected', Boolean(cb?.checked));
    });

    if (selectAll) {
      const visible = selectableCheckboxes().filter((cb) => {
        const row = cb.closest('tr');
        return row && !row.classList.contains('hidden');
      });
      selectAll.checked = visible.length > 0 && visible.every((cb) => cb.checked);
      selectAll.indeterminate = visible.some((cb) => cb.checked) && !visible.every((cb) => cb.checked);
    }
  }

  document.addEventListener('change', (e) => {
    if (!e.target.closest('[data-registered-select]')) return;
    updateBulkBar();
  });

  selectAll?.addEventListener('change', () => {
    const checked = selectAll.checked;
    selectableCheckboxes().forEach((cb) => {
      const row = cb.closest('tr');
      if (row && !row.classList.contains('hidden')) cb.checked = checked;
    });
    updateBulkBar();
  });

  clearBtn?.addEventListener('click', () => {
    selectableCheckboxes().forEach((cb) => { cb.checked = false; });
    updateBulkBar();
  });

  bulkForm.addEventListener('submit', (e) => {
    if (!selectedCheckboxes().length) {
      e.preventDefault();
    }
  });
}

function initOjtLocationSelection() {
  const bulkBar = document.getElementById('ojtLocationBulkBar');
  const countEl = document.getElementById('ojtLocationSelectedCount');
  const bulkEditBtn = document.getElementById('ojtLocationBulkEditBtn');
  const clearBtn = document.getElementById('ojtLocationClearSelectionBtn');
  const selectAll = document.getElementById('ojtLocationSelectAll');
  const checkboxes = () => Array.from(document.querySelectorAll('[data-ojt-select]'));

  if (!bulkBar || !countEl) return;

  function selectedCheckboxes() {
    return checkboxes().filter((cb) => cb.checked);
  }

  function updateBulkBar() {
    const selected = selectedCheckboxes();
    const count = selected.length;
    bulkBar.classList.toggle('hidden', count === 0);
    countEl.textContent = `${count} selected`;
    if (bulkEditBtn) bulkEditBtn.disabled = count === 0;

    document.querySelectorAll('[data-ojt-row]').forEach((row) => {
      const cb = row.querySelector('[data-ojt-select]');
      row.classList.toggle('is-selected', Boolean(cb?.checked));
    });

    if (selectAll) {
      const visible = checkboxes().filter((cb) => {
        const row = cb.closest('tr');
        return row && !row.classList.contains('hidden');
      });
      selectAll.checked = visible.length > 0 && visible.every((cb) => cb.checked);
      selectAll.indeterminate = visible.some((cb) => cb.checked) && !visible.every((cb) => cb.checked);
    }
  }

  function selectSameSite(sourceCheckbox) {
    const siteKey = (sourceCheckbox.dataset.siteKey || '').trim();
    if (!siteKey || !sourceCheckbox.checked) return;
    checkboxes().forEach((cb) => {
      if ((cb.dataset.siteKey || '').trim() === siteKey) cb.checked = true;
    });
  }

  document.addEventListener('change', (e) => {
    const cb = e.target.closest('[data-ojt-select]');
    if (!cb) return;
    selectSameSite(cb);
    updateBulkBar();
  });

  selectAll?.addEventListener('change', () => {
    const checked = selectAll.checked;
    checkboxes().forEach((cb) => {
      const row = cb.closest('tr');
      if (row && !row.classList.contains('hidden')) cb.checked = checked;
    });
    updateBulkBar();
  });

  clearBtn?.addEventListener('click', () => {
    checkboxes().forEach((cb) => { cb.checked = false; });
    updateBulkBar();
  });

  bulkEditBtn?.addEventListener('click', () => {
    const selected = selectedCheckboxes();
    if (!selected.length) return;
    document.dispatchEvent(new CustomEvent('ojt-location-open-selected', { detail: { checkboxes: selected } }));
  });

  window.refreshOjtLocationSelection = updateBulkBar;
}

function initOjtLocationModal() {
  const modal = document.getElementById('ojtLocationModal');
  if (!modal) return;

  const studentLabel = document.getElementById('ojtLocationModalStudent');
  const studentIdInput = document.getElementById('ojtLocationStudentId');
  const studentIdsWrap = document.getElementById('ojtLocationStudentIds');
  const saveBtn = document.getElementById('ojtLocationSaveBtn');
  const siteInput = document.getElementById('ojtLocationSiteName');
  const latInput = document.getElementById('ojtLocationLat');
  const lngInput = document.getElementById('ojtLocationLng');
  const radiusInput = document.getElementById('ojtLocationRadius');

  function closeModal() {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }

  function setStudentIds(ids) {
    if (!studentIdsWrap) return;
    studentIdsWrap.innerHTML = '';
    ids.forEach((id) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'student_ids[]';
      input.value = String(id);
      studentIdsWrap.appendChild(input);
    });
    studentIdInput.value = ids[0] ? String(ids[0]) : '';
  }

  function fillLocationFields(source) {
    siteInput.value = source.siteName || source.dataset?.siteName || '';
    latInput.value = source.latitude || source.dataset?.latitude || '';
    lngInput.value = source.longitude || source.dataset?.longitude || '';
    radiusInput.value = source.radius || source.dataset?.radius || '150';
  }

  function openModalWithSource(source, studentIds, labelText) {
    setStudentIds(studentIds);
    studentLabel.textContent = labelText;
    fillLocationFields(source);
    latInput.dataset.student = studentIds[0] || '';
    lngInput.dataset.student = studentIds[0] || '';
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    if (typeof updateOjtLocationMapPreview === 'function') {
      updateOjtLocationMapPreview(latInput.value, lngInput.value);
    }
    document.dispatchEvent(new CustomEvent('ojt-location-open', {
      detail: {
        lat: latInput.value,
        lng: lngInput.value,
        siteName: siteInput.value,
      },
    }));
    if (saveBtn) {
      saveBtn.textContent = studentIds.length > 1 ? `Save for ${studentIds.length} students` : 'Save Location';
    }
    siteInput.focus();
  }

  function openModal(btn) {
    const studentId = btn.dataset.studentId || '';
    openModalWithSource(
      btn.dataset,
      [studentId],
      btn.dataset.studentName || 'Student'
    );
  }

  document.addEventListener('ojt-location-open-selected', (e) => {
    const selected = e.detail?.checkboxes || [];
    if (!selected.length) return;
    const withSite = selected.find((cb) => (cb.dataset.siteKey || '').trim());
    const source = withSite || selected[0];
    const names = selected.map((cb) => cb.dataset.studentName).filter(Boolean);
    const label = names.length <= 2
      ? names.join(' · ')
      : `${names.slice(0, 2).join(', ')} + ${names.length - 2} more`;
    openModalWithSource(
      source.dataset,
      selected.map((cb) => cb.dataset.studentId).filter(Boolean),
      label
    );
  });

  document.querySelectorAll('[data-ojt-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openModal(btn));
  });

  document.querySelectorAll('[data-ojt-modal-close]').forEach((el) => {
    el.addEventListener('click', closeModal);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
  });
}

function initDailyTaskModals() {
  const addModal = document.getElementById('dailyTaskModal');
  const viewModal = document.getElementById('dailyTasksViewModal');
  const tasksByStudent = window.TASKS_BY_STUDENT || {};

  if (addModal) {
    const studentLabel = document.getElementById('dailyTaskModalStudent');
    const studentIdInput = document.getElementById('dailyTaskStudentId');
    const titleInput = document.getElementById('dailyTaskTitle');
    const descInput = document.getElementById('dailyTaskDescription');

    function closeAddModal() {
      addModal.classList.add('hidden');
      addModal.setAttribute('aria-hidden', 'true');
    }

    function openAddModal(btn) {
      studentIdInput.value = btn.dataset.studentId || '';
      studentLabel.textContent = btn.dataset.studentName || 'Student';
      titleInput.value = '';
      descInput.value = '';
      addModal.classList.remove('hidden');
      addModal.setAttribute('aria-hidden', 'false');
      titleInput.focus();
    }

    document.querySelectorAll('[data-task-add]').forEach((btn) => {
      btn.addEventListener('click', () => openAddModal(btn));
    });

    document.querySelectorAll('[data-task-modal-close]').forEach((el) => {
      el.addEventListener('click', closeAddModal);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !addModal.classList.contains('hidden')) closeAddModal();
    });
  }

  if (viewModal) {
    const studentLabel = document.getElementById('dailyTasksViewStudent');
    const listEl = document.getElementById('dailyTasksViewList');

    function closeViewModal() {
      viewModal.classList.add('hidden');
      viewModal.setAttribute('aria-hidden', 'true');
    }

    function taskStatusLabel(status) {
      if (status === 'approved') return 'Approved';
      if (status === 'rejected') return 'Rejected';
      return 'Pending';
    }

    function renderTaskActions(task) {
      if (!task.student_progress || !task.proof_photo) return '';
      if (task.status === 'approved') {
        return '<small class="field-hint" style="color:var(--green-700)">Approved</small>';
      }
      if (task.status === 'rejected') {
        return `<small class="field-hint" style="color:var(--red-700)">Rejected${task.review_note ? `: ${escapeHtml(task.review_note)}` : ''}</small>`;
      }
      return `<div class="supervisor-task-review-actions">
        <button type="button" class="btn btn-primary btn-sm" data-task-review data-task-id="${task.id}" data-action="approved">Approve</button>
        <button type="button" class="btn btn-danger btn-sm" data-task-review data-task-id="${task.id}" data-action="rejected">Reject</button>
      </div>`;
    }

    function openViewModal(btn) {
      const studentId = btn.dataset.studentId;
      const tasks = tasksByStudent[studentId] || tasksByStudent[String(studentId)] || [];
      studentLabel.textContent = btn.dataset.studentName || 'Student';

      if (!tasks.length) {
        listEl.innerHTML = '<p class="field-hint">No tasks assigned for today.</p>';
      } else {
        listEl.innerHTML = `<ul class="supervisor-task-list">${tasks.map((task) => {
          const submitted = Boolean(task.student_progress && task.proof_photo);
          const progress = submitted
            ? `<br><em style="color:var(--green-700)">Student feedback:</em> ${escapeHtml(task.student_progress)}`
            : '<br><small style="color:var(--gray-600)">Awaiting student submission</small>';
          const proof = task.proof_photo
            ? `<br><button type="button" class="view-photo-btn" data-photo-url="${escapeHtml(task.proof_photo)}" data-photo-title="Proof Photo" data-photo-label="${escapeHtml(task.title)}">View proof photo</button>`
            : '';
          const status = submitted
            ? `<br><small>Status: ${taskStatusLabel(task.status || 'pending')}</small>${proof}`
            : '';
          const actions = renderTaskActions(task);
          return `<li class="${submitted ? 'is-done' : ''}"><strong>${escapeHtml(task.title)}</strong>${task.description ? `<br><small>${escapeHtml(task.description)}</small>` : ''}${progress}${status}${actions ? `<div style="margin-top:10px">${actions}</div>` : ''}</li>`;
        }).join('')}</ul>`;
      }

      viewModal.classList.remove('hidden');
      viewModal.setAttribute('aria-hidden', 'false');
    }

    listEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-task-review]');
      if (!btn) return;

      const taskId = btn.dataset.taskId;
      const action = btn.dataset.action;
      let note = null;

      if (action === 'rejected') {
        note = window.prompt('Reason for rejection (required):');
        if (note === null) return;
        if (!note.trim()) {
          alert('A reason is required when rejecting.');
          return;
        }
      } else if (!window.confirm('Approve this task submission?')) {
        return;
      }

      btn.disabled = true;
      try {
        const res = await fetch(`/supervisor/tasks/${taskId}/review`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({ action, note }),
        });
        const data = await res.json();
        if (data.type !== 'success') {
          alert(data.message || 'Could not update task.');
          btn.disabled = false;
          return;
        }
        location.reload();
      } catch (err) {
        alert(err.message || 'Could not update task.');
        btn.disabled = false;
      }
    });

    document.querySelectorAll('[data-task-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!btn.disabled) openViewModal(btn);
      });
    });

    document.querySelectorAll('[data-tasks-view-close]').forEach((el) => {
      el.addEventListener('click', closeViewModal);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !viewModal.classList.contains('hidden')) closeViewModal();
    });
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}
