-- Phase 4: Status & Health Monitoring (SRS §6, Implementation Plan §4)

-- Heartbeat is a distinct record from status/ACK responses (SRS §6.1
-- FR-MON-003) — never conflated into device_status alone.
CREATE TABLE IF NOT EXISTS heartbeats (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  receiver_id INT NOT NULL,
  received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (receiver_id) REFERENCES receivers(id),
  INDEX idx_heartbeats_receiver (receiver_id, received_at)
) ENGINE=InnoDB;

-- Admin-configurable monitoring parameters (SRS §6.2 FR-MONCFG). Hierarchy
-- (system/transmitter/group/device) is TBD per the SRS — only the system
-- scope is implemented; scope_id is reserved for when that hierarchy lands.
CREATE TABLE IF NOT EXISTS monitoring_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  scope_type ENUM('system', 'transmitter', 'group', 'device') NOT NULL DEFAULT 'system',
  scope_id INT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  polling_interval_seconds INT NULL,
  response_timeout_seconds INT NULL,
  retry_count INT NULL,
  offline_threshold_seconds INT NULL,
  status_polling_mode VARCHAR(32) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_monitoring_scope (scope_type, scope_id)
) ENGINE=InnoDB;

-- Seed one system-level row so the offline sweep has something to read.
-- offline_threshold_seconds = 90 (3x the protocol's 30s heartbeat) is a
-- development placeholder, NOT a confirmed requirement — SRS §13.1 item 15
-- lists this value as an open issue. Admins can change it via
-- PUT /api/status-monitoring.
INSERT IGNORE INTO monitoring_config (id, scope_type, scope_id, enabled, offline_threshold_seconds)
VALUES (1, 'system', NULL, TRUE, 90);
