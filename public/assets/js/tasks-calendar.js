document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('taskCalendarGrid');
  const panelBody = document.getElementById('taskDayPanelBody');
  if (!grid || !panelBody) return;

  const Calendar = window.CalendarDayStatus;
  if (!Calendar) return;

  const tasksByDate = window.TASKS_BY_DATE || {};
  const attendanceByDate = window.ATTENDANCE_BY_DATE || {};
  const internshipStartDate = window.INTERNSHIP_START_DATE || null;
  const monthLabel = document.getElementById('taskCalMonthLabel');
  const panelTitle = document.getElementById('taskDayPanelTitle');
  const panelSubtitle = document.getElementById('taskDayPanelSubtitle');

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function localTodayStr() {
    const t = new Date();
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  }

  const todayStr = window.TASK_TODAY || localTodayStr();

  let viewYear = new Date().getFullYear();
  let viewMonth = new Date().getMonth();
  let selectedDate = todayStr;

  function toDateStr(y, m, d) {
    return `${y}-${pad(m + 1)}-${pad(d)}`;
  }

  function formatDisplayDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function statusBadge(status) {
    const map = {
      approved: '<span class="status-badge status-approved">Approved</span>',
      pending: '<span class="status-badge status-pending">Pending</span>',
      rejected: '<span class="status-badge status-rejected">Rejected</span>',
    };
    return map[status] || '';
  }

  function dayStatusBanner(dateStr) {
    if (Calendar.isAbsent(dateStr, { todayStr, internshipStartDate, attendanceByDate })) {
      return '<div class="calendar-day-status-banner absent">Absent — no OJT time-in was recorded for this day.</div>';
    }
    const attendance = attendanceByDate[dateStr];
    if (attendance && attendance.present) {
      const detail = attendance.completed
        ? 'Present — OJT attendance completed for this day.'
        : 'Present — time-in recorded; time-out pending.';
      return `<div class="calendar-day-status-banner present">${detail}</div>`;
    }
    return '';
  }

  function renderTaskPanel(dateStr) {
    const tasks = tasksByDate[dateStr] || [];
    const isToday = dateStr === todayStr;
    panelTitle.textContent = isToday ? "Today's Assigned Tasks" : 'Tasks for Selected Day';
    panelSubtitle.textContent = isToday
      ? 'Tasks from your supervisor — submit feedback and a photo when done.'
      : formatDisplayDate(dateStr);

    const statusBanner = dayStatusBanner(dateStr);

    if (!tasks.length) {
      panelBody.innerHTML = `
        ${statusBanner}
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <p>${Calendar.isAbsent(dateStr, { todayStr, internshipStartDate, attendanceByDate }) ? 'No tasks — marked absent' : 'No tasks assigned for this day'}</p>
          <small>${isToday ? 'Your supervisor will add daily tasks on Daily Tasks.' : 'Pick another date on the calendar to view tasks.'}</small>
        </div>`;
      return;
    }

    panelBody.innerHTML = `${statusBanner}<ul class="ojt-task-list student-reports-tasks">${tasks.map((task) => {
      const displayStatus = task.displayStatus;
      const isSubmitted = Boolean(displayStatus);
      const isRejected = task.status === 'rejected';
      const canSubmit = isToday && (!isSubmitted || isRejected);

      return `
        <li class="ojt-task-item${isSubmitted && !isRejected ? ' is-done' : ''}" data-task-id="${task.id}">
          <div class="ojt-task-head">
            <strong>${Calendar.escapeHtml(task.title)}</strong>
            ${task.description ? `<br><small>${Calendar.escapeHtml(task.description)}</small>` : ''}
            <br><small style="color:var(--gray-500)">Assigned by ${Calendar.escapeHtml(task.supervisor_name)}</small>
            ${displayStatus ? `<div style="margin-top:8px">${statusBadge(displayStatus)}</div>` : ''}
          </div>
          ${isSubmitted ? `
            <p class="ojt-task-progress-text">${Calendar.escapeHtml(task.student_progress)}</p>
            <div class="ojt-photo-links">
              <button type="button" class="view-photo-btn" data-photo-url="${Calendar.escapeHtml(task.proof_photo)}" data-photo-title="Proof Photo" data-photo-label="${Calendar.escapeHtml(task.title)}">View proof photo</button>
            </div>
            ${isRejected && task.review_note ? `<p class="field-hint" style="color:var(--red-700);margin-top:8px">Supervisor note: ${Calendar.escapeHtml(task.review_note)}</p>` : ''}
            ${displayStatus === 'pending' ? '<small class="field-hint">Awaiting supervisor review.</small>' : ''}
            ${displayStatus === 'approved' ? '<small class="field-hint">Task completed and approved.</small>' : ''}
            ${isRejected ? '<small class="field-hint">Resubmit with updated feedback and photo below.</small>' : ''}
          ` : ''}
          ${canSubmit ? `
            <form class="student-task-form" data-task-id="${task.id}" enctype="multipart/form-data" data-noConfirm>
              <div class="form-group">
                <label>Your feedback</label>
                <textarea name="progress" rows="4" minlength="10" maxlength="1000" placeholder="Describe what you did and what you learned…" required>${isRejected ? Calendar.escapeHtml(task.student_progress) : ''}</textarea>
              </div>
              <div class="form-group">
                <label>Proof photo</label>
                <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required>
                <small class="field-hint">Photo showing completed work · Max 3 MB</small>
              </div>
              <button type="submit" class="btn btn-primary btn-sm" data-loading-text="Submitting…">${isRejected ? 'Resubmit Task' : 'Submit Task'}</button>
            </form>
          ` : ''}
        </li>`;
    }).join('')}</ul>`;
  }

  function renderCalendar() {
    grid.innerHTML = '';
    monthLabel.textContent = new Date(viewYear, viewMonth).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });

    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const pillOptions = {
      todayStr,
      internshipStartDate,
      attendanceByDate,
      tasksByDate,
    };

    for (let i = 0; i < firstDay; i++) {
      const empty = document.createElement('div');
      empty.className = 'calendar-day empty';
      grid.appendChild(empty);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = toDateStr(viewYear, viewMonth, day);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'calendar-day';
      btn.dataset.date = dateStr;

      const isToday = dateStr === todayStr;
      if (isToday) btn.classList.add('is-today');
      if (dateStr === selectedDate) btn.classList.add('is-selected');
      if (Calendar.isAbsent(dateStr, pillOptions)) btn.classList.add('has-absent');
      else if (Calendar.wasPresent(pillOptions.attendanceByDate, dateStr)) btn.classList.add('has-present');

      const { pills, moreCount } = Calendar.buildDayPills(dateStr, pillOptions);
      const pillsHtml = pills.map((pill) => pill.html).join('');
      const moreHtml = moreCount > 0 ? `<span class="cal-task-more">+${moreCount} more</span>` : '';

      btn.innerHTML = `
        <span class="cal-day-num${isToday ? ' is-today-num' : ''}">${day}</span>
        <span class="cal-task-pills">${pillsHtml}${moreHtml}</span>
      `;

      btn.addEventListener('click', () => selectDate(dateStr));
      grid.appendChild(btn);
    }
  }

  function selectDate(dateStr) {
    selectedDate = dateStr;
    renderCalendar();
    renderTaskPanel(dateStr);
  }

  document.getElementById('taskCalPrev')?.addEventListener('click', () => {
    viewMonth -= 1;
    if (viewMonth < 0) {
      viewMonth = 11;
      viewYear -= 1;
    }
    renderCalendar();
  });

  document.getElementById('taskCalNext')?.addEventListener('click', () => {
    viewMonth += 1;
    if (viewMonth > 11) {
      viewMonth = 0;
      viewYear += 1;
    }
    renderCalendar();
  });

  document.getElementById('taskCalToday')?.addEventListener('click', () => {
    const today = new Date();
    viewYear = today.getFullYear();
    viewMonth = today.getMonth();
    selectDate(localTodayStr());
  });

  selectDate(todayStr);
});
