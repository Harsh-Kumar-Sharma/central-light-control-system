-- Scheduling: automatic ON/OFF/dim at a clock time or at sunrise/sunset.

-- One row of site-wide settings. Sunrise/sunset need the site's position;
-- timezone decides what "18:30" means. Latitude/longitude stay NULL until set,
-- and sunrise/sunset schedules do nothing until then.
CREATE TABLE IF NOT EXISTS site_settings (
  id TINYINT NOT NULL PRIMARY KEY,
  latitude DECIMAL(9,6) NULL,
  longitude DECIMAL(9,6) NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Kolkata'
) ENGINE=InnoDB;
INSERT IGNORE INTO site_settings (id) VALUES (1);

CREATE TABLE IF NOT EXISTS schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  -- what it acts on: a whole road map, a group, or one receiver
  target_type ENUM('road', 'group', 'receiver') NOT NULL,
  target_id INT NOT NULL,
  action ENUM('on', 'off', 'brightness') NOT NULL,
  relay ENUM('1', '2', 'both') NOT NULL DEFAULT 'both',   -- for on / off
  brightness TINYINT NULL,                                 -- for action = brightness (1-99)
  trigger_type ENUM('time', 'sunrise', 'sunset') NOT NULL,
  time_of_day CHAR(5) NULL,                                -- 'HH:MM' for trigger = time
  offset_minutes SMALLINT NOT NULL DEFAULT 0,              -- minutes after (+) / before (-) sunrise or sunset
  days CHAR(7) NOT NULL DEFAULT '1111111',                 -- Mon..Sun, 1 = runs that day
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_by INT NOT NULL,
  last_run_date CHAR(10) NULL,                             -- local date 'YYYY-MM-DD' of the last run, so it runs once a day
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS schedule_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  schedule_id INT NOT NULL,
  schedule_name VARCHAR(100) NOT NULL,
  trigger_kind ENUM('auto', 'manual') NOT NULL,
  total INT NOT NULL DEFAULT 0,
  ok INT NOT NULL DEFAULT 0,
  failed INT NOT NULL DEFAULT 0,
  skipped INT NOT NULL DEFAULT 0,                          -- disabled receivers that were not contacted
  note VARCHAR(255) NULL,
  ran_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_schedule_runs_schedule (schedule_id, ran_at),
  FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE
) ENGINE=InnoDB;
