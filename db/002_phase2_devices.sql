-- Phase 2: Device & MQTT Integration Core (SRS §4, Implementation Plan §2)

-- The transmitter's own LoRa address (used as the esp/pub/<address> / esp/sub/<address>
-- topic suffix). Missing from the Phase 1 schema — needed to subscribe per transmitter.
ALTER TABLE transmitters
  ADD COLUMN lora_address INT NULL AFTER network_id,
  ADD UNIQUE KEY uq_transmitter_address (lora_address);

-- Latest-snapshot status per receiver (SRS §6.5 / §10.1 device_status).
-- History (heartbeats, command results) is Phase 3/4 scope, not duplicated here.
CREATE TABLE IF NOT EXISTS device_status (
  receiver_id INT NOT NULL PRIMARY KEY,
  online BOOLEAN NOT NULL DEFAULT FALSE,
  brightness INT NULL,
  relay1 BOOLEAN NULL,
  relay2 BOOLEAN NULL,
  rssi INT NULL,
  snr INT NULL,
  last_seen TIMESTAMP NULL,
  last_status_at TIMESTAMP NULL,
  FOREIGN KEY (receiver_id) REFERENCES receivers(id)
) ENGINE=InnoDB;
