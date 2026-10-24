CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  username VARCHAR(32) NOT NULL UNIQUE,
  display_name VARCHAR(50) NOT NULL,
  role ENUM('director','supervisor','engineer') NOT NULL,
  password_hash VARCHAR(512) NOT NULL,
  status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at DATETIME(3) NULL,
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  INDEX idx_users_role_status(role,status),
  INDEX idx_users_display_name(display_name),
  CONSTRAINT fk_users_creator FOREIGN KEY(created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sessions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  refresh_token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  ip VARCHAR(64) NOT NULL DEFAULT '',
  user_agent VARCHAR(500) NOT NULL DEFAULT '',
  last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_sessions_user(user_id,revoked_at),
  INDEX idx_sessions_expire(expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS products (
  id CHAR(36) NOT NULL PRIMARY KEY,
  product_code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  owner_id CHAR(36) NOT NULL,
  remark TEXT NOT NULL,
  status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  created_by CHAR(36) NOT NULL,
  updated_by CHAR(36) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  INDEX idx_products_owner(owner_id),
  INDEX idx_products_name(name),
  INDEX idx_products_updated(updated_at),
  CONSTRAINT fk_products_owner FOREIGN KEY(owner_id) REFERENCES users(id),
  CONSTRAINT fk_products_creator FOREIGN KEY(created_by) REFERENCES users(id),
  CONSTRAINT fk_products_updater FOREIGN KEY(updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS experiments (
  id CHAR(36) NOT NULL PRIMARY KEY,
  experiment_no VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  purpose TEXT NOT NULL,
  owner_id CHAR(36) NOT NULL,
  experiment_date DATE NOT NULL,
  remark TEXT NOT NULL,
  status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  created_by CHAR(36) NOT NULL,
  updated_by CHAR(36) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  INDEX idx_experiments_date(experiment_date),
  INDEX idx_experiments_owner(owner_id),
  INDEX idx_experiments_name(name),
  CONSTRAINT fk_experiments_owner FOREIGN KEY(owner_id) REFERENCES users(id),
  CONSTRAINT fk_experiments_creator FOREIGN KEY(created_by) REFERENCES users(id),
  CONSTRAINT fk_experiments_updater FOREIGN KEY(updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS experiment_sequences (
  seq_date DATE NOT NULL PRIMARY KEY,
  last_seq INT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS process_defs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_process_sort(status,sort_order),
  CONSTRAINT fk_process_creator FOREIGN KEY(created_by) REFERENCES users(id),
  CONSTRAINT fk_process_updater FOREIGN KEY(updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS templates (
  id CHAR(36) NOT NULL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(500) NOT NULL DEFAULT '',
  status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  version INT NOT NULL DEFAULT 1,
  created_by CHAR(36) NOT NULL,
  updated_by CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  INDEX idx_templates_status_name(status,name),
  CONSTRAINT fk_templates_creator FOREIGN KEY(created_by) REFERENCES users(id),
  CONSTRAINT fk_templates_updater FOREIGN KEY(updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS template_processes (
  id CHAR(36) NOT NULL PRIMARY KEY,
  template_id CHAR(36) NOT NULL,
  process_def_id CHAR(36) NULL,
  name VARCHAR(100) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uniq_tpl_process(template_id,name),
  INDEX idx_tpl_process_sort(template_id,sort_order),
  CONSTRAINT fk_tpl_process_template FOREIGN KEY(template_id) REFERENCES templates(id) ON DELETE CASCADE,
  CONSTRAINT fk_tpl_process_def FOREIGN KEY(process_def_id) REFERENCES process_defs(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS template_fields (
  id CHAR(36) NOT NULL PRIMARY KEY,
  template_process_id CHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  unit VARCHAR(30) NOT NULL DEFAULT '',
  value_type ENUM('number','text','date') NOT NULL,
  required BOOLEAN NOT NULL DEFAULT FALSE,
  min_value DECIMAL(30,10) NULL,
  max_value DECIMAL(30,10) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uniq_tpl_field(template_process_id,name),
  INDEX idx_tpl_field_sort(template_process_id,sort_order),
  CONSTRAINT fk_tpl_field_process FOREIGN KEY(template_process_id) REFERENCES template_processes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS records (
  id CHAR(36) NOT NULL PRIMARY KEY,
  subject_type ENUM('product','experiment') NOT NULL,
  subject_id CHAR(36) NOT NULL,
  process_def_id CHAR(36) NULL,
  process_name VARCHAR(100) NOT NULL,
  process_sort INT NOT NULL DEFAULT 0,
  source_template_id CHAR(36) NULL,
  source_template_version INT NULL,
  created_by CHAR(36) NOT NULL,
  updated_by CHAR(36) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  deleted_by CHAR(36) NULL,
  INDEX idx_records_subject(subject_type,subject_id,deleted_at,process_sort),
  INDEX idx_records_creator(created_by,created_at),
  INDEX idx_records_updated(updated_at),
  CONSTRAINT fk_records_process FOREIGN KEY(process_def_id) REFERENCES process_defs(id) ON DELETE SET NULL,
  CONSTRAINT fk_records_template FOREIGN KEY(source_template_id) REFERENCES templates(id),
  CONSTRAINT fk_records_creator FOREIGN KEY(created_by) REFERENCES users(id),
  CONSTRAINT fk_records_updater FOREIGN KEY(updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS record_fields (
  id CHAR(36) NOT NULL PRIMARY KEY,
  record_id CHAR(36) NOT NULL,
  source_template_field_id CHAR(36) NULL,
  name VARCHAR(100) NOT NULL,
  unit VARCHAR(30) NOT NULL DEFAULT '',
  value_type ENUM('number','text','date') NOT NULL,
  required BOOLEAN NOT NULL DEFAULT FALSE,
  min_value DECIMAL(30,10) NULL,
  max_value DECIMAL(30,10) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uniq_record_field(record_id,name),
  INDEX idx_record_field_sort(record_id,sort_order),
  CONSTRAINT fk_record_field_record FOREIGN KEY(record_id) REFERENCES records(id) ON DELETE CASCADE,
  CONSTRAINT fk_record_field_source FOREIGN KEY(source_template_field_id) REFERENCES template_fields(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS record_values (
  id CHAR(36) NOT NULL PRIMARY KEY,
  record_id CHAR(36) NOT NULL,
  record_field_id CHAR(36) NOT NULL,
  raw_value TEXT NOT NULL,
  value_number DECIMAL(30,10) NULL,
  value_text TEXT NULL,
  value_date DATE NULL,
  entered_by CHAR(36) NOT NULL,
  entered_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uniq_record_value(record_id,record_field_id),
  INDEX idx_values_record(record_id),
  INDEX idx_values_number(record_field_id,value_number),
  INDEX idx_values_entered(entered_by,entered_at),
  CONSTRAINT fk_values_record FOREIGN KEY(record_id) REFERENCES records(id) ON DELETE CASCADE,
  CONSTRAINT fk_values_field FOREIGN KEY(record_field_id) REFERENCES record_fields(id) ON DELETE CASCADE,
  CONSTRAINT fk_values_enterer FOREIGN KEY(entered_by) REFERENCES users(id),
  CONSTRAINT fk_values_updater FOREIGN KEY(updated_by) REFERENCES users(id),
  CONSTRAINT chk_one_value CHECK ((value_number IS NOT NULL)+(value_text IS NOT NULL)+(value_date IS NOT NULL) <= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS drafts (
  id CHAR(36) NOT NULL PRIMARY KEY,
  owner_id CHAR(36) NOT NULL,
  subject_type ENUM('product','experiment') NOT NULL,
  subject_id CHAR(36) NOT NULL,
  process_name VARCHAR(100) NOT NULL,
  payload_json JSON NOT NULL,
  client_updated_at DATETIME(3) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uniq_draft(owner_id,subject_type,subject_id,process_name),
  INDEX idx_drafts_owner_updated(owner_id,updated_at),
  CONSTRAINT fk_drafts_owner FOREIGN KEY(owner_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS import_jobs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  subject_type ENUM('product','experiment') NOT NULL,
  mode ENUM('append','overwrite') NULL,
  file_name VARCHAR(255) NOT NULL,
  file_hash CHAR(64) NOT NULL,
  status ENUM('previewed','confirmed','failed','expired') NOT NULL,
  summary_json JSON NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  confirmed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_import_user(user_id,created_at),
  INDEX idx_import_status(status,expires_at),
  CONSTRAINT fk_import_user FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS import_rows (
  id CHAR(36) NOT NULL PRIMARY KEY,
  job_id CHAR(36) NOT NULL,
  sheet_name VARCHAR(100) NOT NULL,
  row_no INT NOT NULL,
  subject_key VARCHAR(150) NOT NULL,
  process_name VARCHAR(100) NOT NULL DEFAULT '',
  status ENUM('valid','error') NOT NULL,
  error_message TEXT NULL,
  payload_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_import_rows_job(job_id,status),
  INDEX idx_import_rows_subject(job_id,subject_key),
  CONSTRAINT fk_import_rows_job FOREIGN KEY(job_id) REFERENCES import_jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS parse_traces (
  id CHAR(36) NOT NULL PRIMARY KEY,
  request_id VARCHAR(100) NOT NULL,
  actor_id CHAR(36) NOT NULL,
  subject_type ENUM('product','experiment') NULL,
  subject_id CHAR(36) NULL,
  raw_text TEXT NOT NULL,
  result_json JSON NOT NULL,
  issue_json JSON NOT NULL,
  parser_version VARCHAR(30) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_parse_actor(actor_id,created_at),
  INDEX idx_parse_request(request_id),
  CONSTRAINT fk_parse_actor FOREIGN KEY(actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  request_id VARCHAR(100) NOT NULL,
  actor_id CHAR(36) NULL,
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id CHAR(36) NOT NULL,
  subject_type ENUM('product','experiment') NULL,
  subject_id CHAR(36) NULL,
  before_json JSON NULL,
  after_json JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_audit_entity(entity_type,entity_id,created_at),
  INDEX idx_audit_actor(actor_id,created_at),
  INDEX idx_audit_subject(subject_type,subject_id,created_at),
  CONSTRAINT fk_audit_actor FOREIGN KEY(actor_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS idempotency_keys (
  idempotency_key VARCHAR(128) NOT NULL,
  user_id CHAR(36) NOT NULL,
  endpoint VARCHAR(255) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  response_json JSON NULL,
  response_status SMALLINT NULL,
  status ENUM('processing','completed') NOT NULL DEFAULT 'processing',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY(idempotency_key,user_id,endpoint),
  INDEX idx_idem_created(created_at),
  CONSTRAINT fk_idem_user FOREIGN KEY(user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
