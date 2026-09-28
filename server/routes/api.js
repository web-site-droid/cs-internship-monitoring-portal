const express = require('express');
const pool = require('../db');
const { recordValidation, reviewDailyTask, createUserNotification } = require('../helpers');

const router = express.Router();

router.post('/validate', async (req, res) => {
  if (!req.user || !['supervisor', 'admin', 'school'].includes(req.user.role)) {
    return res.json({ type: 'error', title: 'Unauthorized', message: 'You are not allowed to perform this action.' });
  }

  const { id, action, note = '', type = 'hours' } = req.body;
  const recordId = parseInt(id, 10);
  const feedback = (note || '').trim();

  if (!recordId || !['approved', 'rejected'].includes(action)) {
    return res.json({ type: 'error', title: 'Invalid', message: 'Invalid parameters.' });
  }

  if (type === 'hours') {
    if (req.user.role !== 'school') {
      return res.json({
        type: 'error',
        title: 'Company Only',
        message: 'Hour logs must be validated by the company partner. Administrators can monitor but not approve hours.',
      });
    }
    if (action === 'rejected' && !feedback) {
      return res.json({
        type: 'error',
        title: 'Feedback Required',
        message: 'Please provide a reason when rejecting hour logs.',
      });
    }

    const [rows] = await pool.execute(
      'SELECT h.*, u.id AS student_user_id FROM internship_hours h JOIN users u ON h.student_id = u.id WHERE h.id = ?',
      [recordId]
    );
    const record = rows[0];
    if (!record) {
      return res.json({ type: 'error', title: 'Not Found', message: 'Hour log not found.' });
    }
    if (record.status !== 'pending') {
      return res.json({ type: 'error', title: 'Locked', message: 'This entry was already reviewed and cannot be changed.' });
    }

    const status = action === 'approved' ? 'validated' : 'rejected';
    await pool.execute(
      'UPDATE internship_hours SET status = ?, validated_by = ?, validated_at = NOW() WHERE id = ?',
      [status, req.user.id, recordId]
    );
    await recordValidation('hours', recordId, req.user.id, action, feedback);

    return res.json({
      type: 'success',
      title: 'Done',
      message: `Hour log has been ${action === 'approved' ? 'validated' : 'rejected'}.`,
    });
  }

  if (type === 'log') {
    const [rows] = await pool.execute(
      'SELECT l.*, u.id AS student_user_id FROM internship_logs l JOIN users u ON l.student_id = u.id WHERE l.id = ?',
      [recordId]
    );
    const record = rows[0];
    if (!record) {
      return res.json({ type: 'error', title: 'Not Found', message: 'Internship log not found.' });
    }

    const status = action === 'approved' ? 'approved' : 'rejected';
    await pool.execute('UPDATE internship_logs SET status = ? WHERE id = ?', [status, recordId]);
    await recordValidation('log', recordId, req.user.id, action, feedback);

    return res.json({ type: 'success', title: 'Done', message: `Internship log has been ${status}.` });
  }

  if (type === 'task') {
    if (req.user.role !== 'supervisor' && req.user.role !== 'admin') {
      return res.json({
        type: 'error',
        title: 'Administrator Only',
        message: 'Daily task submissions must be reviewed by the administrator.',
      });
    }

    const result = await reviewDailyTask(recordId, req.user.id, action, feedback, {
      allowAny: req.user.role === 'admin',
    });
    if (result.error) {
      return res.json({ type: 'error', title: 'Failed', message: result.error });
    }

    const [[task]] = await pool.execute(
      'SELECT student_id, title FROM student_daily_tasks WHERE id = ? LIMIT 1',
      [recordId]
    );
    if (task) {
      const title = `Task ${action === 'approved' ? 'approved' : 'rejected'}`;
      const body = feedback || `Your task "${task.title}" was ${action === 'approved' ? 'approved' : 'rejected'}.`;
      await createUserNotification(task.student_id, req.user.id, title, body, 'task');
    }

    return res.json({
      type: 'success',
      title: 'Done',
      message: `Task has been ${result.status}.`,
    });
  }

  return res.json({ type: 'error', title: 'Invalid', message: 'Unknown record type.' });
});

module.exports = router;
