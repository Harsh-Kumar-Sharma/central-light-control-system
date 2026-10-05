-- Records the LAN network configuration manually set on the physical
-- transmitter (IP/gateway/subnet), for documentation and troubleshooting.
--
-- This does NOT push these settings to the device. The supplied firmware
-- has no documented mechanism for the backend to remotely configure
-- Ethernet/static-IP settings — see PRD Open Issue "Device configuration:
-- remotely from dashboard vs local configuration portal" (unresolved).
-- These fields exist so an Admin can record what was configured directly
-- on the device (e.g. via its local setup portal or a manual static config).
ALTER TABLE transmitters
  ADD COLUMN ip_address VARCHAR(45) NULL AFTER connectivity_type,
  ADD COLUMN gateway VARCHAR(45) NULL AFTER ip_address,
  ADD COLUMN subnet_mask VARCHAR(45) NULL AFTER gateway;
