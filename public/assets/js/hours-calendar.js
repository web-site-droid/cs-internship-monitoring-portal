document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('calendarGrid');
  if (!grid) return;

  const Calendar = window.CalendarDayStatus;
  const entries = window.HOUR_ENTRIES || {};
  const tasksByDate = window.TASKS_BY_DATE || {};
  const attendanceByDate = window.ATTENDANCE_BY_DATE || {};
  const internshipStartDate = window.INTERNSHIP_START_DATE || null;
  const monthLabel = document.getElementById('calMonthLabel');
  const tableRows = Array.from(document.querySelectorAll('#hourLogTable tbody tr[data-date]'));

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function localTodayStr() {
    const t = new Date();
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  }

  const todayStr = window.HOUR_TODAY || localTodayStr();

  let viewYear = new Date().getFullYear();
  let viewMonth = new Date().getMonth();
  let selectedDate = todayStr;

  function toDateStr(y, m, d) {
    return `${y}-${pad(m + 1)}-${pad(d)}`;
  }

  function filterTableRows(dateStr) {
    if (!tableRows.length) return;
    let firstMatch = null;
    tableRows.forEach((row) => {
      const match = row.dataset.date === dateStr;
      row.classList.toggle('is-highlighted', match);
      if (match && !firstMatch) firstMatch = row;
    });
    if (firstMatch) {
      firstMatch.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
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
      hourEntriesByDate: entries,
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
      if (dateStr > todayStr) btn.classList.add('is-future');
      if (Calendar && Calendar.isAbsent(dateStr, pillOptions)) btn.classList.add('has-absent');
      else if (Calendar && Calendar.wasPresent(attendanceByDate, dateStr)) btn.classList.add('has-present');

      let innerHtml;
      if (Calendar) {
        const { pills, moreCount } = Calendar.buildDayPills(dateStr, pillOptions);
        const pillsHtml = pills.map((pill) => pill.html).join('');
        const moreHtml = moreCount > 0 ? `<span class="cal-task-more">+${moreCount} more</span>` : '';
        innerHtml = `
          <span class="cal-day-num${isToday ? ' is-today-num' : ''}">${day}</span>
          <span class="cal-task-pills">${pillsHtml}${moreHtml}</span>
        `;
      } else {
        const dayEntries = entries[dateStr] || [];
        const totalHours = dayEntries.reduce((s, e) => s + parseFloat(e.hours), 0);
        innerHtml = `
          <span class="cal-day-num">${day}</span>
          ${totalHours ? `<span class="cal-day-hours">${totalHours}h</span>` : ''}
        `;
      }

      btn.innerHTML = innerHtml;
      btn.addEventListener('click', () => selectDate(dateStr));
      grid.appendChild(btn);
    }
  }

  function selectDate(dateStr) {
    selectedDate = dateStr;
    filterTableRows(dateStr);
    renderCalendar();
  }

  document.getElementById('calPrev').addEventListener('click', () => {
    viewMonth -= 1;
    if (viewMonth < 0) {
      viewMonth = 11;
      viewYear -= 1;
    }
    renderCalendar();
  });

  document.getElementById('calNext').addEventListener('click', () => {
    viewMonth += 1;
    if (viewMonth > 11) {
      viewMonth = 0;
      viewYear += 1;
    }
    renderCalendar();
  });

  document.getElementById('calToday').addEventListener('click', () => {
    const today = new Date();
    viewYear = today.getFullYear();
    viewMonth = today.getMonth();
    selectDate(localTodayStr());
  });

  tableRows.forEach((row) => {
    row.style.cursor = 'pointer';
    row.addEventListener('click', () => {
      const dateStr = row.dataset.date;
      if (!dateStr) return;
      const [y, m] = dateStr.split('-').map(Number);
      viewYear = y;
      viewMonth = m - 1;
      selectDate(dateStr);
    });
  });

  selectDate(todayStr);
});
