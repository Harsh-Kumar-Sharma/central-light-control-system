-- Energy & reports.
-- There is no power meter on the receivers yet, so energy is an ESTIMATE:
-- rated watts of what each relay switches x the time it was on (x brightness).

-- Rated load per relay, in watts (NULL = not entered, the light is left out of energy totals).
ALTER TABLE receivers
  ADD COLUMN relay1_watts SMALLINT UNSIGNED NULL,
  ADD COLUMN relay2_watts SMALLINT UNSIGNED NULL;

-- Electricity price for the cost figures.
ALTER TABLE site_settings
  ADD COLUMN tariff_per_kwh DECIMAL(8,2) NULL,
  ADD COLUMN currency VARCHAR(8) NOT NULL DEFAULT 'INR';

-- Every change of a light's online state, relays or brightness, newest last.
-- Reports replay this to get uptime and hours lit. NULL = not known at that moment.
CREATE TABLE IF NOT EXISTS light_state_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  receiver_id INT NOT NULL,
  online TINYINT(1) NULL,
  relay1 TINYINT(1) NULL,
  relay2 TINYINT(1) NULL,
  brightness TINYINT NULL,
  at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_state_log_receiver (receiver_id, at),
  FOREIGN KEY (receiver_id) REFERENCES receivers(id) ON DELETE CASCADE
) ENGINE=InnoDB;
