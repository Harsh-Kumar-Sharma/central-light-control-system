-- Alarms: something needs attention (a light or transmitter went offline, a schedule failed).
-- An alarm is raised once per problem (dedupe_key), stays open until the problem
-- goes away (resolved automatically) and can be acknowledged by a person meanwhile.
CREATE TABLE IF NOT EXISTS alarms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type ENUM('device_offline', 'transmitter_offline', 'schedule_failed') NOT NULL,
  severity ENUM('critical', 'warning', 'info') NOT NULL DEFAULT 'warning',
  dedupe_key VARCHAR(64) NOT NULL,                 -- e.g. device_offline:12 - one open alarm per key
  receiver_id INT NULL,
  transmitter_id INT NULL,
  schedule_id INT NULL,
  title VARCHAR(160) NOT NULL,
  detail VARCHAR(255) NULL,
  status ENUM('active', 'acknowledged', 'resolved') NOT NULL DEFAULT 'active',
  raised_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_by INT NULL,
  acknowledged_at TIMESTAMP NULL,
  resolved_at TIMESTAMP NULL,
  INDEX idx_alarms_status (status, raised_at),
  INDEX idx_alarms_key (dedupe_key, status),
  FOREIGN KEY (receiver_id) REFERENCES receivers(id) ON DELETE CASCADE,
  FOREIGN KEY (transmitter_id) REFERENCES transmitters(id) ON DELETE CASCADE,
  FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
  FOREIGN KEY (acknowledged_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
