-- Demo accounts (password for all: password)
-- Run AFTER schema.sql in Supabase SQL Editor

INSERT INTO users (name, email, password, role) VALUES
  ('Juan Dela Cruz', 'student@example.com', md5('password'), 'student'),
  ('Maria Santos', 'supervisor@example.com', md5('password'), 'supervisor'),
  ('LSSTI Admin', 'school@example.com', md5('password'), 'school');

INSERT INTO organizations (name, contact_person, contact_email, address, approved, registered_by)
SELECT 'Tech Solutions Inc.', 'Ana Reyes', 'hr@techsolutions.com', '123 Business Park, Manila', 1, u.id
FROM users u WHERE u.email = 'school@example.com';

INSERT INTO program_clearance_requirements (course_program, required_hours, required_reports, required_evaluations)
VALUES ('BS Computer Studies', 200, 1, 1);
