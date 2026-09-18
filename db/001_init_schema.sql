-- Phase 1 Foundation schema (SRS §10.1 / Implementation Plan §1.2)
-- Core tables only: users, roles, transmitters, receivers, groups, group_members.
-- Command/status/audit tables land in later phases (see Implementation Plan).

CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(32) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role_id INT NOT NULL,
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS transmitters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  junction_location VARCHAR(255) NULL,
  network_id INT NULL,
  connectivity_type ENUM('fiber', 'gsm', 'lan', 'unknown') NOT NULL DEFAULT 'unknown',
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS receivers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_name VARCHAR(128) NOT NULL,
  lora_address INT NOT NULL,
  network_id INT NULL,
  parent_transmitter_id INT NOT NULL,
  location VARCHAR(255) NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_transmitter_id) REFERENCES transmitters(id),
  UNIQUE KEY uq_receiver_address (parent_transmitter_id, lora_address)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `groups` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS group_members (
  group_id INT NOT NULL,
  receiver_id INT NOT NULL,
  PRIMARY KEY (group_id, receiver_id),
  FOREIGN KEY (group_id) REFERENCES `groups`(id),
  FOREIGN KEY (receiver_id) REFERENCES receivers(id)
) ENGINE=InnoDB;

-- Seed roles and a default Admin user.
-- Default password is "ChangeMe123!" — bcrypt hash below. CHANGE ON FIRST LOGIN.
INSERT IGNORE INTO roles (id, name) VALUES (1, 'Admin'), (2, 'Operator'), (3, 'User');
