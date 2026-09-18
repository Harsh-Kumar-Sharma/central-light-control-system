-- Phase 3: Device Control (SRS §5, Implementation Plan §3)

CREATE TABLE IF NOT EXISTS group_executions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  group_id INT NOT NULL,
  user_id INT NOT NULL,
  command VARCHAR(32) NOT NULL,
  parameter VARCHAR(32) NULL,
  aggregate_result ENUM('PENDING', 'SUCCESS', 'PARTIAL_SUCCESS', 'FAILED') NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES `groups`(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

-- Every command sent to a single receiver, whether issued individually or as
-- part of a group fan-out (group_execution_id links the latter). This table
-- IS the command audit trail (SRS §5.4 FR-AUDIT) and the per-device group
-- result tracking (SRS §5.2 FR-GRP-002).
CREATE TABLE IF NOT EXISTS commands (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  user_role VARCHAR(32) NOT NULL,
  transmitter_id INT NOT NULL,
  receiver_id INT NOT NULL,
  group_execution_id INT NULL,
  command VARCHAR(32) NOT NULL,
  parameter VARCHAR(32) NULL,
  command_string VARCHAR(64) NOT NULL,
  status ENUM(
    'CREATED', 'QUEUED', 'SENT_TO_TRANSMITTER', 'SENT_OVER_LORA',
    'ACKNOWLEDGED', 'SUCCESS',
    'TIMEOUT', 'FAILED', 'INVALID_COMMAND', 'INVALID_PARAMETER',
    'DEVICE_OFFLINE', 'TRANSMITTER_OFFLINE', 'NO_ACK'
  ) NOT NULL DEFAULT 'CREATED',
  rssi INT NULL,
  snr INT NULL,
  error_code VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (transmitter_id) REFERENCES transmitters(id),
  FOREIGN KEY (receiver_id) REFERENCES receivers(id),
  FOREIGN KEY (group_execution_id) REFERENCES group_executions(id),
  INDEX idx_commands_pending (receiver_id, status)
) ENGINE=InnoDB;
