-- Sensors: readings that arrive inside a receiver's status reply
-- (ambient light, motion, voltage, current, power, energy, temperature).

-- Latest value of each, one row per light.
CREATE TABLE IF NOT EXISTS device_sensors (
  receiver_id INT NOT NULL PRIMARY KEY,
  ambient_lux DECIMAL(9,1) NULL,
  motion TINYINT(1) NULL,
  voltage_v DECIMAL(7,2) NULL,
  current_a DECIMAL(8,3) NULL,
  power_w DECIMAL(10,2) NULL,
  energy_kwh DECIMAL(12,3) NULL,
  temperature_c DECIMAL(5,1) NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (receiver_id) REFERENCES receivers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- History for the charts: written at most about once a minute per light, kept 30 days.
CREATE TABLE IF NOT EXISTS sensor_readings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  receiver_id INT NOT NULL,
  ambient_lux DECIMAL(9,1) NULL,
  motion TINYINT(1) NULL,
  voltage_v DECIMAL(7,2) NULL,
  current_a DECIMAL(8,3) NULL,
  power_w DECIMAL(10,2) NULL,
  energy_kwh DECIMAL(12,3) NULL,
  temperature_c DECIMAL(5,1) NULL,
  at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_sensor_readings (receiver_id, at),
  FOREIGN KEY (receiver_id) REFERENCES receivers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Alarm rules on sensor values.
--   threshold    : raise when metric is below (lt) / above (gt) the value
--   lamp_failure : the light is ON but draws (almost) no power - a dead lamp or driver
CREATE TABLE IF NOT EXISTS sensor_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  kind ENUM('threshold', 'lamp_failure') NOT NULL DEFAULT 'threshold',
  metric ENUM('ambient_lux', 'voltage_v', 'current_a', 'power_w', 'temperature_c') NULL,
  op ENUM('lt', 'gt') NULL,
  value DECIMAL(12,3) NULL,
  severity ENUM('critical', 'warning') NOT NULL DEFAULT 'warning',
  receiver_id INT NULL,                        -- NULL = every light
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (receiver_id) REFERENCES receivers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Tunnels: lights grouped into zones, each zone with its own brightness per mode.
CREATE TABLE IF NOT EXISTS tunnels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  length_m INT UNSIGNED NULL,
  current_mode ENUM('day', 'evening', 'night', 'off') NULL,   -- last mode applied
  applied_at TIMESTAMP NULL,
  last_ok INT NULL,
  last_failed INT NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tunnel_zones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tunnel_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  kind ENUM('threshold', 'transition', 'interior', 'exit', 'custom') NOT NULL DEFAULT 'custom',
  position INT NOT NULL DEFAULT 0,             -- entrance first
  day_brightness TINYINT NOT NULL DEFAULT 99,
  evening_brightness TINYINT NOT NULL DEFAULT 70,
  night_brightness TINYINT NOT NULL DEFAULT 50,
  FOREIGN KEY (tunnel_id) REFERENCES tunnels(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tunnel_zone_lights (
  zone_id INT NOT NULL,
  receiver_id INT NOT NULL,
  tunnel_id INT NOT NULL,
  PRIMARY KEY (zone_id, receiver_id),
  UNIQUE KEY uq_tunnel_light (tunnel_id, receiver_id),   -- a light sits in one zone per tunnel
  FOREIGN KEY (zone_id) REFERENCES tunnel_zones(id) ON DELETE CASCADE,
  FOREIGN KEY (receiver_id) REFERENCES receivers(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Alarms can now come from sensor rules and from tunnel mode changes.
ALTER TABLE alarms
  MODIFY type ENUM('device_offline', 'transmitter_offline', 'schedule_failed', 'sensor_rule', 'tunnel_failed') NOT NULL,
  ADD COLUMN tunnel_id INT NULL,
  ADD CONSTRAINT fk_alarms_tunnel FOREIGN KEY (tunnel_id) REFERENCES tunnels(id) ON DELETE CASCADE;

-- Schedules can switch a whole tunnel to a mode.
ALTER TABLE schedules
  MODIFY target_type ENUM('road', 'group', 'receiver', 'tunnel') NOT NULL,
  MODIFY action ENUM('on', 'off', 'brightness', 'tunnel_mode') NOT NULL,
  ADD COLUMN mode ENUM('day', 'evening', 'night', 'off') NULL;
