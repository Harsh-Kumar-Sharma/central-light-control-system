-- Saved test commands per transmitter: the Test dialog shows a button for
-- each one (by name) and sends the stored command text behind the scenes,
-- instead of the operator typing the raw command every time.
CREATE TABLE IF NOT EXISTS transmitter_commands (
  id INT AUTO_INCREMENT PRIMARY KEY,
  transmitter_id INT NOT NULL,
  name VARCHAR(64) NOT NULL,
  command VARCHAR(500) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_tx_command_name (transmitter_id, name),
  FOREIGN KEY (transmitter_id) REFERENCES transmitters(id) ON DELETE CASCADE
) ENGINE=InnoDB;
