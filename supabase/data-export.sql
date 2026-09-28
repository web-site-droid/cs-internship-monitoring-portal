-- LSSTI data export for Supabase (project knrrurercehjkkizuzoq)
-- Run AFTER supabase/schema.sql


-- users (6 rows)
INSERT INTO users ("id", "name", "email", "password", "role", "organization_id", "created_at", "phone", "address", "student_number", "course_program", "emergency_contact", "emergency_phone", "profile_photo", "required_hours", "ojt_site_name", "ojt_latitude", "ojt_longitude", "ojt_radius_meters") VALUES (1, 'Juan Dela Cruz', 'student@example.com', '5f4dcc3b5aa765d61d8327deb882cf99', 'student', NULL, '2026-08-15 06:04:50.000+00', NULL, NULL, NULL, 'BS Criminology', NULL, NULL, NULL, 200, NULL, NULL, NULL, 150);
INSERT INTO users ("id", "name", "email", "password", "role", "organization_id", "created_at", "phone", "address", "student_number", "course_program", "emergency_contact", "emergency_phone", "profile_photo", "required_hours", "ojt_site_name", "ojt_latitude", "ojt_longitude", "ojt_radius_meters") VALUES (2, 'Maria Santos', 'supervisor@example.com', '5f4dcc3b5aa765d61d8327deb882cf99', 'supervisor', NULL, '2026-08-15 06:04:50.000+00', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 200, NULL, NULL, NULL, 150);
INSERT INTO users ("id", "name", "email", "password", "role", "organization_id", "created_at", "phone", "address", "student_number", "course_program", "emergency_contact", "emergency_phone", "profile_photo", "required_hours", "ojt_site_name", "ojt_latitude", "ojt_longitude", "ojt_radius_meters") VALUES (3, 'LSSTI Admin', 'school@example.com', '5f4dcc3b5aa765d61d8327deb882cf99', 'school', NULL, '2026-08-15 06:04:50.000+00', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 200, NULL, NULL, NULL, 150);
INSERT INTO users ("id", "name", "email", "password", "role", "organization_id", "created_at", "phone", "address", "student_number", "course_program", "emergency_contact", "emergency_phone", "profile_photo", "required_hours", "ojt_site_name", "ojt_latitude", "ojt_longitude", "ojt_radius_meters") VALUES (4, 'Justine Denila', 'justinedenila19@gmail.com', '$2a$10$WHLgFmB.6zwXQ7ecwcICY.QjunegVg6Tu971hJQeufAb0e2G29Sxq', 'student', NULL, '2026-08-15 06:36:50.000+00', NULL, NULL, NULL, 'BS Computer Studies', NULL, NULL, '/uploads/profiles/user-4-1786778053191.jpg', 10, NULL, NULL, NULL, 150);
INSERT INTO users ("id", "name", "email", "password", "role", "organization_id", "created_at", "phone", "address", "student_number", "course_program", "emergency_contact", "emergency_phone", "profile_photo", "required_hours", "ojt_site_name", "ojt_latitude", "ojt_longitude", "ojt_radius_meters") VALUES (5, 'Imae Denila', 'imaedenila@gmail.com', '$2a$10$QQphqHrqLYuwJAKn6F/0guhDO.fTQRgxm0j0wZsjEEq.U/FaOrbC2', 'student', NULL, '2026-08-15 09:03:35.000+00', NULL, NULL, NULL, 'BS Computer Studies', NULL, NULL, NULL, 10, 'Ace budget hotel', '7.9233290', '123.7722700', 150);
INSERT INTO users ("id", "name", "email", "password", "role", "organization_id", "created_at", "phone", "address", "student_number", "course_program", "emergency_contact", "emergency_phone", "profile_photo", "required_hours", "ojt_site_name", "ojt_latitude", "ojt_longitude", "ojt_radius_meters") VALUES (6, 'Kyle', 'justinedenila@ckcm.edu.ph', '$2a$10$N/qnc6fwnv.TkpvJYDBuxOLJgFLdrAz2OpJBquzjyRy.DpyCt9cOm', 'student', NULL, '2026-08-15 09:34:13.000+00', NULL, NULL, NULL, 'BS Computer Studies', NULL, NULL, NULL, 10, 'ace', '7.9229890', '123.7716992', 150);

-- program_clearance_requirements (1 rows)
INSERT INTO program_clearance_requirements ("course_program", "required_hours", "required_reports", "required_evaluations", "updated_at", "custom_requirements") VALUES ('BS Computer Studies', 10, 5, 5, '2026-08-15 10:48:36.000+00', '["make a e commerce system"]');

-- organizations (1 rows)
INSERT INTO organizations ("id", "name", "contact_person", "contact_email", "address", "approved", "registered_by", "created_at") VALUES (1, 'Tech Solutions Inc.', 'Ana Reyes', 'hr@techsolutions.com', '123 Business Park, Manila', 1, 3, '2026-08-15 06:04:50.000+00');

-- internship_logs (1 rows)
INSERT INTO internship_logs ("id", "student_id", "title", "description", "submitted_at", "status", "log_date") VALUES (1, 4, 'UI supervisor', 'fbajzbfgjuvedjufgv', '2026-08-15 08:00:03.000+00', 'approved', '2026-08-15');

-- internship_hours (5 rows)
INSERT INTO internship_hours ("id", "student_id", "log_date", "hours", "description", "created_at", "status", "validated_by", "validated_at", "proof_photo", "submit_ip") VALUES (1, 1, '2026-08-15', '8.00', 'tired', '2026-08-15 06:16:17.000+00', 'rejected', 2, '2026-08-15 06:47:13.000+00', NULL, NULL);
INSERT INTO internship_hours ("id", "student_id", "log_date", "hours", "description", "created_at", "status", "validated_by", "validated_at", "proof_photo", "submit_ip") VALUES (2, 4, '2026-08-15', '5.00', 'tired', '2026-08-15 06:42:11.000+00', 'validated', 2, '2026-08-15 06:47:05.000+00', NULL, NULL);
INSERT INTO internship_hours ("id", "student_id", "log_date", "hours", "description", "created_at", "status", "validated_by", "validated_at", "proof_photo", "submit_ip") VALUES (3, 4, '2026-08-07', '5.00', 'vbhnfshb', '2026-08-15 06:50:36.000+00', 'validated', 2, '2026-08-15 07:05:24.000+00', NULL, NULL);
INSERT INTO internship_hours ("id", "student_id", "log_date", "hours", "description", "created_at", "status", "validated_by", "validated_at", "proof_photo", "submit_ip") VALUES (4, 5, '2026-08-15', '0.25', 'Auto-logged from OJT attendance (5:12 PM – 5:15 PM).
No supervisor tasks assigned for this day.', '2026-08-15 09:15:09.000+00', 'validated', NULL, '2026-08-15 09:15:09.000+00', '/uploads/ojt-timein/timein-5-1786785308984.jpg', 'ojt-auto');
INSERT INTO internship_hours ("id", "student_id", "log_date", "hours", "description", "created_at", "status", "validated_by", "validated_at", "proof_photo", "submit_ip") VALUES (5, 6, '2026-08-15', '0.50', 'Auto-logged from OJT attendance (6:04 PM – 6:33 PM).
Work progress submitted:
- make e UI for LSSTI: ghcdjtgfcdycdjtu
- make e system: sgvesdhshfrhfh', '2026-08-15 10:33:04.000+00', 'validated', NULL, '2026-08-15 10:33:04.000+00', '/uploads/ojt-timein/timein-6-1786789983962.jpg', 'ojt-auto');

-- ojt_time_ins (2 rows)
INSERT INTO ojt_time_ins ("id", "student_id", "time_in_date", "time_in_at", "latitude", "longitude", "accuracy_meters", "distance_meters", "within_geofence", "time_in_photo", "time_out_at", "time_out_latitude", "time_out_longitude", "time_out_distance_meters", "time_out_photo", "auto_hours", "daily_progress_report", "progress_submitted_at") VALUES (1, 5, '2026-08-15', '2026-08-15 09:12:18.000+00', '7.9229317', '123.7717199', '159.00', '75.00', 1, '/uploads/ojt-timein/timein-5-1786785138866.jpg', '2026-08-15 09:15:09.000+00', '7.9229317', '123.7717199', '75.00', '/uploads/ojt-timein/timein-5-1786785308984.jpg', '0.25', NULL, NULL);
INSERT INTO ojt_time_ins ("id", "student_id", "time_in_date", "time_in_at", "latitude", "longitude", "accuracy_meters", "distance_meters", "within_geofence", "time_in_photo", "time_out_at", "time_out_latitude", "time_out_longitude", "time_out_distance_meters", "time_out_photo", "auto_hours", "daily_progress_report", "progress_submitted_at") VALUES (2, 6, '2026-08-15', '2026-08-15 10:04:35.000+00', '7.9229317', '123.7717199', '159.00', '6.80', 1, '/uploads/ojt-timein/timein-6-1786788275885.jpg', '2026-08-15 10:33:04.000+00', '7.9231087', '123.7717396', '14.00', '/uploads/ojt-timein/timein-6-1786789983962.jpg', '0.50', NULL, NULL);

-- student_daily_tasks (2 rows)
INSERT INTO student_daily_tasks ("id", "student_id", "supervisor_id", "task_date", "title", "description", "status", "completed_at", "created_at", "student_progress", "progress_submitted_at", "proof_photo", "reviewed_at", "review_note") VALUES (1, 6, 2, '2026-08-15', 'make e UI for LSSTI', NULL, 'approved', '2026-08-15 10:24:28.000+00', '2026-08-15 09:40:27.000+00', 'ghcdjtgfcdycdjtu', '2026-08-15 10:24:28.000+00', '/uploads/task-proof/task-1-1786789468713.jfif', NULL, NULL);
INSERT INTO student_daily_tasks ("id", "student_id", "supervisor_id", "task_date", "title", "description", "status", "completed_at", "created_at", "student_progress", "progress_submitted_at", "proof_photo", "reviewed_at", "review_note") VALUES (2, 6, 2, '2026-08-15', 'make e system', NULL, 'approved', NULL, '2026-08-15 10:29:09.000+00', 'sgvesdhshfrhfh', '2026-08-15 10:32:37.000+00', '/uploads/task-proof/task-2-1786789956934.jfif', '2026-08-15 10:32:44.000+00', NULL);

-- evaluations (3 rows)
INSERT INTO evaluations ("id", "supervisor_id", "student_id", "score", "comments", "status", "submitted_at") VALUES (1, 2, 1, 80, 'fool', 'submitted', '2026-08-15 06:46:49.000+00');
INSERT INTO evaluations ("id", "supervisor_id", "student_id", "score", "comments", "status", "submitted_at") VALUES (2, 2, 4, 20, 'okay lang', 'submitted', '2026-08-15 08:15:14.000+00');
INSERT INTO evaluations ("id", "supervisor_id", "student_id", "score", "comments", "status", "submitted_at") VALUES (3, 2, 5, 2, '', 'submitted', '2026-08-15 09:36:16.000+00');

-- validation_records (4 rows)
INSERT INTO validation_records ("id", "record_type", "record_id", "validator_id", "action", "feedback", "created_at") VALUES (1, 'hours', 2, 2, 'approved', 'k', '2026-08-15 06:47:05.000+00');
INSERT INTO validation_records ("id", "record_type", "record_id", "validator_id", "action", "feedback", "created_at") VALUES (2, 'hours', 1, 2, 'rejected', 'not', '2026-08-15 06:47:13.000+00');
INSERT INTO validation_records ("id", "record_type", "record_id", "validator_id", "action", "feedback", "created_at") VALUES (3, 'hours', 3, 2, 'approved', 'iok', '2026-08-15 07:05:24.000+00');
INSERT INTO validation_records ("id", "record_type", "record_id", "validator_id", "action", "feedback", "created_at") VALUES (4, 'log', 1, 2, 'approved', '', '2026-08-15 08:00:43.000+00');

-- clearance_reports (3 rows)
INSERT INTO clearance_reports ("id", "student_id", "generated_by", "total_hours", "total_logs", "evaluation_score", "clearance_status", "report_data", "generated_at", "certificate_type", "certificate_path", "certificate_issued_at") VALUES (1, 4, 2, '5.00', 0, '0.00', 'not_cleared', '{"total_hours":5,"approved_logs":0,"average_score":0,"required_hours":200}'::jsonb, '2026-08-15 06:47:38.000+00', NULL, NULL, NULL);
INSERT INTO clearance_reports ("id", "student_id", "generated_by", "total_hours", "total_logs", "evaluation_score", "clearance_status", "report_data", "generated_at", "certificate_type", "certificate_path", "certificate_issued_at") VALUES (2, 6, 2, '0.00', 0, '0.00', 'not_cleared', '{"total_hours":0,"approved_logs":0,"average_score":0,"required_hours":200,"required_reports":5,"required_evaluations":5,"custom_requirements":["make a e commerce system"]}'::jsonb, '2026-08-15 09:45:32.000+00', NULL, NULL, NULL);
INSERT INTO clearance_reports ("id", "student_id", "generated_by", "total_hours", "total_logs", "evaluation_score", "clearance_status", "report_data", "generated_at", "certificate_type", "certificate_path", "certificate_issued_at") VALUES (3, 4, 2, '10.00', 1, '20.00', 'not_cleared', '{"total_hours":10,"approved_logs":1,"average_score":20,"required_hours":1,"required_reports":5,"required_evaluations":5,"custom_requirements":["make a e commerce system"]}'::jsonb, '2026-08-15 09:52:24.000+00', 'uploaded', '/uploads/certificates/cert-3-1786790874626.png', '2026-08-15 10:47:54.000+00');

-- communication_logs (8 rows)
INSERT INTO communication_logs ("id", "sender_id", "receiver_id", "subject", "message", "is_read", "created_at") VALUES (1, 1, 3, 'afvgaezdgv', 'hi', 0, '2026-08-15 06:26:03.000+00');
INSERT INTO communication_logs ("id", "sender_id", "receiver_id", "subject", "message", "is_read", "created_at") VALUES (2, 2, 4, 'Hour log approved', 'k', 1, '2026-08-15 06:47:05.000+00');
INSERT INTO communication_logs ("id", "sender_id", "receiver_id", "subject", "message", "is_read", "created_at") VALUES (3, 2, 1, 'Hour log rejected', 'not', 0, '2026-08-15 06:47:13.000+00');
INSERT INTO communication_logs ("id", "sender_id", "receiver_id", "subject", "message", "is_read", "created_at") VALUES (4, 4, 2, 'problem', 'i cant log', 1, '2026-08-15 06:57:17.000+00');
INSERT INTO communication_logs ("id", "sender_id", "receiver_id", "subject", "message", "is_read", "created_at") VALUES (5, 2, 4, 'Hour log approved', 'iok', 1, '2026-08-15 07:05:24.000+00');
INSERT INTO communication_logs ("id", "sender_id", "receiver_id", "subject", "message", "is_read", "created_at") VALUES (6, 2, 6, 'Task rejected', 'safesdtf', 1, '2026-08-15 10:32:18.000+00');
INSERT INTO communication_logs ("id", "sender_id", "receiver_id", "subject", "message", "is_read", "created_at") VALUES (7, 2, 6, 'Task approved', 'Your task "make e system" was approved.', 1, '2026-08-15 10:32:44.000+00');
INSERT INTO communication_logs ("id", "sender_id", "receiver_id", "subject", "message", "is_read", "created_at") VALUES (8, 6, 3, 'frazf', 'dfade', 0, '2026-08-15 10:49:53.000+00');

-- notification_reads (3 rows)
INSERT INTO notification_reads ("id", "user_id", "notif_kind", "notif_id", "read_at") VALUES (1, 4, 'validation', 1, '2026-08-15 07:05:49.000+00');
INSERT INTO notification_reads ("id", "user_id", "notif_kind", "notif_id", "read_at") VALUES (2, 4, 'validation', 3, '2026-08-15 07:05:49.000+00');
INSERT INTO notification_reads ("id", "user_id", "notif_kind", "notif_id", "read_at") VALUES (4, 4, 'validation', 4, '2026-08-15 08:16:33.000+00');

-- Reset ID sequences
SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX(id) FROM users), 1), true);
SELECT setval(pg_get_serial_sequence('organizations', 'id'), COALESCE((SELECT MAX(id) FROM organizations), 1), true);
SELECT setval(pg_get_serial_sequence('internship_logs', 'id'), COALESCE((SELECT MAX(id) FROM internship_logs), 1), true);
SELECT setval(pg_get_serial_sequence('internship_hours', 'id'), COALESCE((SELECT MAX(id) FROM internship_hours), 1), true);
SELECT setval(pg_get_serial_sequence('ojt_time_ins', 'id'), COALESCE((SELECT MAX(id) FROM ojt_time_ins), 1), true);
SELECT setval(pg_get_serial_sequence('student_daily_tasks', 'id'), COALESCE((SELECT MAX(id) FROM student_daily_tasks), 1), true);
SELECT setval(pg_get_serial_sequence('evaluations', 'id'), COALESCE((SELECT MAX(id) FROM evaluations), 1), true);
SELECT setval(pg_get_serial_sequence('validation_records', 'id'), COALESCE((SELECT MAX(id) FROM validation_records), 1), true);
SELECT setval(pg_get_serial_sequence('clearance_reports', 'id'), COALESCE((SELECT MAX(id) FROM clearance_reports), 1), true);
SELECT setval(pg_get_serial_sequence('communication_logs', 'id'), COALESCE((SELECT MAX(id) FROM communication_logs), 1), true);
SELECT setval(pg_get_serial_sequence('notification_reads', 'id'), COALESCE((SELECT MAX(id) FROM notification_reads), 1), true);
SELECT setval(pg_get_serial_sequence('user_notifications', 'id'), COALESCE((SELECT MAX(id) FROM user_notifications), 1), true);
