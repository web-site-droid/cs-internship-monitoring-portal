-- LSSTI Internship Portal — PostgreSQL schema for Supabase
-- Run this in Supabase Dashboard → SQL Editor (NOT CSV import)

-- Drop in dependency order
DROP TABLE IF EXISTS lssti_student CASCADE;
DROP TABLE IF EXISTS user_notifications CASCADE;
DROP TABLE IF EXISTS notification_reads CASCADE;
DROP TABLE IF EXISTS communication_logs CASCADE;
DROP TABLE IF EXISTS portal_settings CASCADE;
DROP TABLE IF EXISTS clearance_reports CASCADE;
DROP TABLE IF EXISTS validation_records CASCADE;
DROP TABLE IF EXISTS evaluations CASCADE;
DROP TABLE IF EXISTS student_daily_tasks CASCADE;
DROP TABLE IF EXISTS ojt_time_ins CASCADE;
DROP TABLE IF EXISTS internship_hours CASCADE;
DROP TABLE IF EXISTS internship_logs CASCADE;
DROP TABLE IF EXISTS program_clearance_requirements CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  first_name VARCHAR(50) DEFAULT NULL,
  last_name VARCHAR(50) DEFAULT NULL,
  middle_initial VARCHAR(5) DEFAULT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('student', 'supervisor', 'school')),
  organization_id INT DEFAULT NULL,
  phone VARCHAR(20) DEFAULT NULL,
  address TEXT DEFAULT NULL,
  student_number VARCHAR(50) DEFAULT NULL,
  course_program VARCHAR(120) DEFAULT NULL,
  year_of_study VARCHAR(20) DEFAULT NULL,
  college_university VARCHAR(120) DEFAULT NULL,
  emergency_contact VARCHAR(100) DEFAULT NULL,
  emergency_phone VARCHAR(20) DEFAULT NULL,
  profile_photo VARCHAR(255) DEFAULT NULL,
  required_hours INT DEFAULT 200,
  internship_clearance_status VARCHAR(20) DEFAULT 'pending',
  ojt_site_name VARCHAR(200) DEFAULT NULL,
  ojt_latitude DECIMAL(10,7) DEFAULT NULL,
  ojt_longitude DECIMAL(10,7) DEFAULT NULL,
  ojt_radius_meters INT DEFAULT 150,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE program_clearance_requirements (
  course_program VARCHAR(120) PRIMARY KEY,
  required_hours INT NOT NULL DEFAULT 200,
  required_reports INT NOT NULL DEFAULT 1,
  required_evaluations INT NOT NULL DEFAULT 1,
  custom_requirements TEXT DEFAULT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE organizations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  contact_person VARCHAR(100),
  contact_email VARCHAR(150),
  address TEXT,
  approved SMALLINT DEFAULT 0,
  registered_by INT DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE internship_logs (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  log_date DATE DEFAULT NULL,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'approved', 'rejected')),
  UNIQUE (student_id, log_date)
);

CREATE TABLE internship_hours (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  hours DECIMAL(5,2) NOT NULL,
  description VARCHAR(500),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'validated', 'rejected')),
  proof_photo VARCHAR(255) DEFAULT NULL,
  submit_ip VARCHAR(45) DEFAULT NULL,
  validated_by INT DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
  validated_at TIMESTAMPTZ DEFAULT NULL
);

CREATE TABLE ojt_time_ins (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  time_in_date DATE NOT NULL,
  time_in_at TIMESTAMPTZ DEFAULT NOW(),
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  accuracy_meters DECIMAL(8,2) DEFAULT NULL,
  distance_meters DECIMAL(8,2) DEFAULT NULL,
  within_geofence SMALLINT DEFAULT 0,
  time_in_photo VARCHAR(255) DEFAULT NULL,
  time_out_at TIMESTAMPTZ DEFAULT NULL,
  time_out_latitude DECIMAL(10,7) DEFAULT NULL,
  time_out_longitude DECIMAL(10,7) DEFAULT NULL,
  time_out_distance_meters DECIMAL(8,2) DEFAULT NULL,
  time_out_photo VARCHAR(255) DEFAULT NULL,
  auto_hours DECIMAL(5,2) DEFAULT NULL,
  daily_progress_report TEXT DEFAULT NULL,
  progress_submitted_at TIMESTAMPTZ DEFAULT NULL,
  UNIQUE (student_id, time_in_date)
);

CREATE TABLE student_daily_tasks (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supervisor_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_date DATE NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT DEFAULT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  completed_at TIMESTAMPTZ DEFAULT NULL,
  student_progress TEXT DEFAULT NULL,
  progress_submitted_at TIMESTAMPTZ DEFAULT NULL,
  proof_photo VARCHAR(500) DEFAULT NULL,
  reviewed_at TIMESTAMPTZ DEFAULT NULL,
  review_note TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE evaluations (
  id SERIAL PRIMARY KEY,
  supervisor_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INT NOT NULL,
  comments TEXT,
  status VARCHAR(20) DEFAULT 'submitted' CHECK (status IN ('pending', 'submitted', 'reviewed')),
  submitted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE validation_records (
  id SERIAL PRIMARY KEY,
  record_type VARCHAR(20) NOT NULL CHECK (record_type IN ('hours', 'log', 'evaluation')),
  record_id INT NOT NULL,
  validator_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(20) NOT NULL CHECK (action IN ('approved', 'rejected', 'pending')),
  feedback TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE clearance_reports (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  generated_by INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total_hours DECIMAL(8,2) DEFAULT 0,
  total_logs INT DEFAULT 0,
  evaluation_score DECIMAL(5,2) DEFAULT 0,
  clearance_status VARCHAR(20) DEFAULT 'pending' CHECK (clearance_status IN ('pending', 'cleared', 'not_cleared')),
  report_data JSONB,
  certificate_type VARCHAR(20) DEFAULT NULL CHECK (certificate_type IS NULL OR certificate_type IN ('system', 'uploaded')),
  certificate_path VARCHAR(500) DEFAULT NULL,
  certificate_issued_at TIMESTAMPTZ DEFAULT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE portal_settings (
  setting_key VARCHAR(64) PRIMARY KEY,
  setting_value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by INT NULL REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE communication_logs (
  id SERIAL PRIMARY KEY,
  sender_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject VARCHAR(200),
  message TEXT NOT NULL,
  is_read SMALLINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notification_reads (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notif_kind VARCHAR(20) NOT NULL DEFAULT 'validation' CHECK (notif_kind IN ('validation')),
  notif_id INT NOT NULL,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, notif_kind, notif_id)
);

CREATE TABLE user_notifications (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id INT DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  category VARCHAR(32) DEFAULT 'system',
  is_read SMALLINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE password_reset_codes (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_password_reset_codes_user_id ON password_reset_codes (user_id);
CREATE INDEX idx_internship_hours_student ON internship_hours(student_id);
CREATE INDEX idx_internship_logs_student ON internship_logs(student_id);
CREATE INDEX idx_ojt_time_ins_student_date ON ojt_time_ins(student_id, time_in_date);
CREATE INDEX idx_daily_tasks_student_date ON student_daily_tasks(student_id, task_date);
CREATE INDEX idx_clearance_reports_student ON clearance_reports(student_id);
CREATE INDEX idx_comm_logs_receiver ON communication_logs(receiver_id);
