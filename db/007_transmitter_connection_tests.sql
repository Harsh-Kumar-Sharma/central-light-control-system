-- Connection mode + connectivity test results for transmitters.
--
-- transmitters.status keeps meaning "record enabled/disabled" (shown as
-- Enabled/Disabled in the UI). It says nothing about the real connection;
-- that is what last_test_* below record, updated by ping / port checks.
ALTER TABLE transmitters
  ADD COLUMN connection_mode ENUM('lan', 'mqtt') NOT NULL DEFAULT 'lan' AFTER lora_address,
  ADD COLUMN port INT NULL AFTER ip_address,
  ADD COLUMN last_test_at TIMESTAMP NULL,
  ADD COLUMN last_test_ok BOOLEAN NULL,
  ADD COLUMN last_test_latency_ms INT NULL;

-- Audit of every test an operator ran. Cascades with the transmitter, so a
-- never-used transmitter (only test rows) can still be deleted.
CREATE TABLE IF NOT EXISTS device_tests (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  transmitter_id INT NOT NULL,
  user_id INT NOT NULL,
  kind ENUM('ping', 'port', 'send') NOT NULL,
  target VARCHAR(64) NOT NULL,
  ok BOOLEAN NOT NULL,
  latency_ms INT NULL,
  detail VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (transmitter_id) REFERENCES transmitters(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_device_tests_tx (transmitter_id, created_at)
) ENGINE=InnoDB;
