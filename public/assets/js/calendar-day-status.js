(function initCalendarDayStatus(global) {
  function isWeekday(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const weekday = new Date(y, m - 1, d).getDay();
    return weekday >= 1 && weekday <= 5;
  }

  function wasPresent(attendanceByDate, dateStr) {
    return Boolean(attendanceByDate && attendanceByDate[dateStr] && attendanceByDate[dateStr].present);
  }

  function isAbsent(dateStr, options) {
    const {
      todayStr,
      internshipStartDate,
      attendanceByDate,
    } = options || {};

    if (!internshipStartDate || dateStr < internshipStartDate) return false;
    if (dateStr >= todayStr) return false;
    if (!isWeekday(dateStr)) return false;
    return !wasPresent(attendanceByDate, dateStr);
  }

  function getPillStatus(task) {
    if (task.displayStatus === 'approved') return 'done';
    if (task.displayStatus === 'rejected') return 'rejected';
    if (task.displayStatus === 'pending') return 'review';
    return 'assigned';
  }

  function truncate(text, max) {
    const value = String(text || '').trim();
    if (value.length <= max) return value;
    return `${value.slice(0, max - 1)}…`;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildDayPills(dateStr, options) {
    const {
      todayStr,
      internshipStartDate,
      attendanceByDate,
      tasksByDate,
      hourEntriesByDate,
      maxTasks = 2,
    } = options || {};

    const pills = [];
    const dayTasks = (tasksByDate && tasksByDate[dateStr]) || [];
    const attendance = attendanceByDate && attendanceByDate[dateStr];
    const dayHours = (hourEntriesByDate && hourEntriesByDate[dateStr]) || [];

    if (isAbsent(dateStr, { todayStr, internshipStartDate, attendanceByDate })) {
      pills.push({
        type: 'absent',
        html: '<span class="cal-task-pill cal-task-pill-absent" title="Absent — no OJT time-in"><span class="cal-task-pill-dot"></span>Absent</span>',
      });
    } else if (attendance && attendance.present) {
      const hoursLabel = attendance.hours != null && attendance.hours > 0
        ? `${Number(attendance.hours).toFixed(1)}h`
        : (attendance.completed ? 'Present' : 'On site');
      pills.push({
        type: 'present',
        html: `<span class="cal-task-pill cal-task-pill-present" title="OJT attendance recorded"><span class="cal-task-pill-dot"></span>${escapeHtml(hoursLabel)}</span>`,
      });
    }

    dayTasks.slice(0, maxTasks).forEach((task) => {
      const pillStatus = getPillStatus(task);
      const doneMark = pillStatus === 'done' ? ' ✓' : '';
      pills.push({
        type: 'task',
        html: `<span class="cal-task-pill cal-task-pill-${pillStatus}" title="${escapeHtml(task.title)}"><span class="cal-task-pill-dot"></span>${escapeHtml(truncate(task.title, 14))}${doneMark}</span>`,
      });
    });

    if (!pills.length && dayHours.length) {
      const totalHours = dayHours.reduce((sum, entry) => sum + Number(entry.hours || 0), 0);
      const label = totalHours > 0 ? `${totalHours.toFixed(1)}h logged` : 'Hours logged';
      pills.push({
        type: 'hours',
        html: `<span class="cal-task-pill cal-task-pill-hours" title="Internship hours"><span class="cal-task-pill-dot"></span>${escapeHtml(label)}</span>`,
      });
    }

    const moreCount = Math.max(0, dayTasks.length - maxTasks);
    return { pills, moreCount };
  }

  global.CalendarDayStatus = {
    isWeekday,
    wasPresent,
    isAbsent,
    getPillStatus,
    truncate,
    escapeHtml,
    buildDayPills,
  };
})(window);
