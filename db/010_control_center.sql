-- Control center: road layouts + per-receiver status settings.

-- Per receiver, set from the device's own settings:
--   relay1_name / relay2_name : optional display names ("Street light", ...)
--   status_command            : text sent to ask the device for its state.
--                               "{address}" is replaced by the receiver's
--                               address, e.g. Tx_{address}_STATUS -> Tx_1_STATUS.
--                               Empty = the device is never polled.
ALTER TABLE receivers
  ADD COLUMN relay1_name VARCHAR(64) NULL,
  ADD COLUMN relay2_name VARCHAR(64) NULL,
  ADD COLUMN status_command VARCHAR(500) NULL;

-- Where the relay/brightness values came from:
--   reported = the device told us (reply to the status command)
--   command  = inferred from the last command the device acknowledged
ALTER TABLE device_status
  ADD COLUMN state_source ENUM('reported', 'command') NULL,
  ADD COLUMN state_at TIMESTAMP NULL;

-- One row per road. layout_json holds the drawing: road segments, lights
-- (each linked to a receiver id) and labels. Shape is validated by the
-- backend (src/services/roadLayout.js), not by the database.
CREATE TABLE IF NOT EXISTS roads (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  layout_json JSON NOT NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;
