/**
 * Global button & action handlers for LSSTI Internship Portal
 */
const CANCEL_BUTTON_COLOR = '#b91c1c';

document.addEventListener('DOMContentLoaded', () => {
  initValidateButtons();
  initConfirmForms();
  initSubmitLoading();
  initMobileNavClose();
  initClickableCards();
  initLogoutConfirm();
  initProgramStudentPanels();
  initFeedbackPanels();
  initFeedbackModal();
  initTableSearch();
});

function initValidateButtons() {
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-validate]');
    if (!btn || typeof Swal === 'undefined') return;

    const id = parseInt(btn.dataset.id, 10);
    const action = btn.dataset.action;
    const type = btn.dataset.type || 'hours';
    const apiUrl = btn.dataset.api || '/api/validate';

    if (!id || !action) return;
    e.preventDefault();
    validateLog(id, action, apiUrl, type, btn.dataset.requireRejectNote === '1');
  });
}

function shouldSkipSubmitConfirm(form) {
  if (form.dataset.noConfirm !== undefined) return true;
  if (form.classList.contains('login-form')) return true;
  if (form.classList.contains('student-task-form')) return true;
  if ((form.getAttribute('method') || 'get').toLowerCase() === 'get') return true;
  return false;
}

function shouldConfirmForm(form) {
  if (shouldSkipSubmitConfirm(form)) return false;
  return Boolean(form.dataset.confirm);
}

function showSubmitConfirm(message) {
  const text = message || 'Are you sure you want to submit?';
  if (typeof Swal === 'undefined') {
    return Promise.resolve(window.confirm(text));
  }
  return Swal.fire({
    title: 'Are you sure?',
    text,
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#15803d',
    cancelButtonColor: CANCEL_BUTTON_COLOR,
    confirmButtonText: 'Yes, submit',
    cancelButtonText: 'Cancel',
  }).then((result) => result.isConfirmed);
}

const approvedFormSubmits = new WeakSet();

function initConfirmForms() {
  document.addEventListener(
    'submit',
    (e) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (!shouldConfirmForm(form)) return;

      if (approvedFormSubmits.has(form)) {
        approvedFormSubmits.delete(form);
        return;
      }

      e.preventDefault();
      e.stopImmediatePropagation();

      showSubmitConfirm(form.dataset.confirm).then((confirmed) => {
        if (!confirmed) return;
        approvedFormSubmits.add(form);
        form.requestSubmit();
      });
    },
    true
  );
}

function setSubmitButtonLoading(btn, loading) {
  if (!btn) return;

  if (loading) {
    const loadingText = btn.dataset.loadingText;
    if (!loadingText) return;

    if (btn.dataset.originalText === undefined) {
      btn.dataset.originalText = btn.tagName === 'INPUT' ? btn.value : btn.textContent;
    }
    btn.disabled = true;
    if (btn.tagName === 'INPUT') btn.value = loadingText;
    else btn.textContent = loadingText;
    return;
  }

  if (btn.dataset.originalText !== undefined) {
    if (btn.tagName === 'INPUT') btn.value = btn.dataset.originalText;
    else btn.textContent = btn.dataset.originalText;
    delete btn.dataset.originalText;
  }
  btn.disabled = false;
}

function initSubmitLoading() {
  document.addEventListener(
    'submit',
    (e) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.dataset.noLoading !== undefined) return;
      if (form.classList.contains('student-task-form')) return;

      const btn = form.querySelector('button[type="submit"], input[type="submit"]');
      if (!btn || btn.disabled || !btn.dataset.loadingText) return;

      setSubmitButtonLoading(btn, true);
    },
    false
  );
}

function initMobileNavClose() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  sidebar.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', () => sidebar.classList.remove('open'));
  });
}

function initClickableCards() {
  document.querySelectorAll('[data-href]').forEach((el) => {
    el.addEventListener('click', () => {
      window.location.href = el.dataset.href;
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        window.location.href = el.dataset.href;
      }
    });
  });
}

function initLogoutConfirm() {
  document.querySelectorAll('a[href="/logout"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const go = () => { window.location.href = '/logout'; };
      if (typeof Swal === 'undefined') {
        if (window.confirm('Sign out of your account?')) go();
        return;
      }
      Swal.fire({
        title: 'Sign out?',
        text: 'You will need to sign in again to access the portal.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#15803d',
        cancelButtonColor: CANCEL_BUTTON_COLOR,
        confirmButtonText: 'Yes',
        cancelButtonText: 'No',
      }).then((result) => {
        if (result.isConfirmed) go();
      });
    });
  });
}

function validateLog(id, action, apiUrl, type = 'hours', requireRejectNote = false) {
  const isReject = action === 'rejected';
  const noteRequired = isReject && (requireRejectNote || type === 'hours' || type === 'task');
  Swal.fire({
    title: isReject ? 'Reject entry' : 'Approve entry',
    input: 'textarea',
    inputLabel: noteRequired ? 'Reason (required — sent to the student)' : 'Feedback (optional — sent to the student)',
    inputPlaceholder: noteRequired ? 'Explain why this entry is rejected...' : 'Enter your feedback...',
    showCancelButton: true,
    confirmButtonText: isReject ? 'Reject' : 'Approve',
    confirmButtonColor: isReject ? '#b91c1c' : '#15803d',
    cancelButtonColor: CANCEL_BUTTON_COLOR,
    inputValidator: (value) => {
      if (noteRequired && !(value || '').trim()) return 'A reason is required when rejecting.';
      return undefined;
    },
    preConfirm: (note) =>
      fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id, action, note: note || '', type }),
      }).then((res) => res.json()),
  }).then((result) => {
    if (result.isConfirmed && result.value) {
      const data = result.value;
      Swal.fire({
        icon: data.type === 'success' ? 'success' : 'error',
        title: data.title,
        text: data.message,
        confirmButtonColor: '#15803d',
      }).then(() => location.reload());
    }
  });
}

window.showSubmitConfirm = showSubmitConfirm;
window.validateLog = validateLog;
window.setSubmitButtonLoading = setSubmitButtonLoading;

function initProgramStudentPanels() {
  const cards = document.querySelectorAll('[data-program-view]');
  const panels = document.querySelectorAll('[data-program-panel]');
  const detailWrap = document.getElementById('programDetailWrap');
  if (!cards.length || !detailWrap) return;

  function closePanels() {
    detailWrap.classList.add('hidden');
    panels.forEach((panel) => panel.classList.add('hidden'));
    cards.forEach((card) => {
      card.classList.remove('is-active');
      card.setAttribute('aria-expanded', 'false');
    });
  }

  function openPanel(slug) {
    detailWrap.classList.remove('hidden');
    panels.forEach((panel) => {
      panel.classList.toggle('hidden', panel.dataset.programPanel !== slug);
    });
    cards.forEach((card) => {
      const active = card.dataset.programView === slug;
      card.classList.toggle('is-active', active);
      card.setAttribute('aria-expanded', active ? 'true' : 'false');
    });
    detailWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  cards.forEach((card) => {
    card.addEventListener('click', () => {
      const slug = card.dataset.programView;
      const isOpen = card.classList.contains('is-active') && !detailWrap.classList.contains('hidden');
      if (isOpen) {
        closePanels();
        return;
      }
      openPanel(slug);
    });
  });

  document.querySelectorAll('[data-program-close]').forEach((btn) => {
    btn.addEventListener('click', closePanels);
  });
}

function initFeedbackPanels() {
  const cards = document.querySelectorAll('[data-feedback-view]');
  const panels = document.querySelectorAll('[data-feedback-panel]');
  const detailWrap = document.getElementById('feedbackDetailWrap');
  if (!cards.length || !detailWrap) return;

  function closePanels() {
    detailWrap.classList.add('hidden');
    panels.forEach((panel) => panel.classList.add('hidden'));
    cards.forEach((card) => {
      card.classList.remove('is-active');
      card.setAttribute('aria-expanded', 'false');
    });
  }

  function openPanel(slug) {
    detailWrap.classList.remove('hidden');
    panels.forEach((panel) => {
      panel.classList.toggle('hidden', panel.dataset.feedbackPanel !== slug);
    });
    cards.forEach((card) => {
      const active = card.dataset.feedbackView === slug;
      card.classList.toggle('is-active', active);
      card.setAttribute('aria-expanded', active ? 'true' : 'false');
    });
    detailWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  cards.forEach((card) => {
    card.addEventListener('click', () => {
      const slug = card.dataset.feedbackView;
      const isOpen = card.classList.contains('is-active') && !detailWrap.classList.contains('hidden');
      if (isOpen) {
        closePanels();
        return;
      }
      openPanel(slug);
    });
  });

  document.querySelectorAll('[data-feedback-close]').forEach((btn) => {
    btn.addEventListener('click', closePanels);
  });
}

function initFeedbackModal() {
  const modal = document.getElementById('feedbackModal');
  const form = document.getElementById('feedbackModalForm');
  const studentIdInput = document.getElementById('feedbackStudentId');
  const studentLabel = document.getElementById('feedbackModalStudent');
  const scoreInput = document.getElementById('feedbackScore');
  const commentsInput = document.getElementById('feedbackComments');
  if (!modal || !form) return;

  function closeModal() {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    form.reset();
    studentIdInput.value = '';
  }

  function openModal(btn) {
    studentIdInput.value = btn.dataset.studentId || '';
    const name = btn.dataset.studentName || 'Student';
    const program = btn.dataset.studentProgram || '';
    studentLabel.textContent = program ? `${name} · ${program}` : name;
    scoreInput.value = '';
    commentsInput.value = '';
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    scoreInput.focus();
  }

  document.querySelectorAll('[data-feedback-open]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      openModal(btn);
    });
  });

  document.querySelectorAll('[data-feedback-modal-close]').forEach((el) => {
    el.addEventListener('click', closeModal);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
  });
}

function initTableSearch() {
  document.querySelectorAll('.table-wrapper').forEach((wrapper, index) => {
    const table = wrapper.querySelector('table.table');
    if (!table || wrapper.querySelector('.table-search-input')) return;

    const tbody = table.tBodies[0];
    if (!tbody) return;

    const rows = Array.from(tbody.rows);
    if (!rows.length) return;

    const label = wrapper.dataset.searchLabel
      || table.dataset.searchLabel
      || wrapper.closest('.card')?.querySelector('.section-title, h2, h3')?.textContent?.trim()
      || 'this table';

    const searchWrap = document.createElement('div');
    searchWrap.className = 'table-search-bar';

    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'table-search-input';
    input.placeholder = `Search ${label.toLowerCase()}…`;
    input.setAttribute('aria-label', `Search ${label}`);

    const meta = document.createElement('span');
    meta.className = 'table-search-meta';
    meta.textContent = `${rows.length} row${rows.length === 1 ? '' : 's'}`;

    const empty = document.createElement('div');
    empty.className = 'table-search-empty hidden';
    empty.textContent = 'No matching results.';

    searchWrap.appendChild(input);
    searchWrap.appendChild(meta);
    wrapper.insertBefore(searchWrap, table);
    wrapper.appendChild(empty);

    const sessionRows = rows.filter((row) => !row.classList.contains('attendance-group-row'));
    const countedRows = sessionRows.length && sessionRows.length !== rows.length ? sessionRows : rows;
    meta.textContent = `${countedRows.length} row${countedRows.length === 1 ? '' : 's'}`;

    function filterRows() {
      const query = input.value.trim().toLowerCase();
      const grouped = rows.some((row) => row.classList.contains('attendance-group-row'));
      let visible = 0;

      if (!grouped) {
        rows.forEach((row) => {
          const match = !query || row.textContent.toLowerCase().includes(query);
          row.classList.toggle('hidden', !match);
          if (match) visible += 1;
        });
      } else {
        const byGroup = new Map();
        rows.forEach((row) => {
          const key = row.dataset.group || '';
          if (!byGroup.has(key)) byGroup.set(key, []);
          byGroup.get(key).push(row);
        });

        byGroup.forEach((groupRows) => {
          const header = groupRows.find((row) => row.classList.contains('attendance-group-row'));
          const sessions = groupRows.filter((row) => row !== header);
          const headerMatch = !query || (header?.textContent || '').toLowerCase().includes(query);
          sessions.forEach((row) => {
            const match = headerMatch || row.textContent.toLowerCase().includes(query);
            row.classList.toggle('hidden', !match);
            if (match) visible += 1;
          });
          if (header) {
            header.classList.toggle('hidden', !sessions.some((row) => !row.classList.contains('hidden')));
          }
        });
      }

      meta.textContent = query
        ? `${visible} of ${countedRows.length} shown`
        : `${countedRows.length} row${countedRows.length === 1 ? '' : 's'}`;
      empty.classList.toggle('hidden', visible > 0);
    }

    input.addEventListener('input', filterRows);
    input.id = input.id || `table-search-${index + 1}`;
  });
}
