-- Per-transmitter MQTT connection (connection_mode = 'mqtt').
-- Four settings, the same ones configured inside the device itself:
--   mqtt_host            broker address: an IP or a host name
--   mqtt_port            broker port; NULL = the standard 1883
--   mqtt_publish_topic   control room -> device: commands are published here
--   mqtt_subscribe_topic device -> control room: replies / status arrive here
-- A transmitter in MQTT mode with no host set keeps using the server's default broker
-- (MQTT_URL) and the esp/sub|pub/<address> topics, as before.
ALTER TABLE transmitters
  ADD COLUMN mqtt_host VARCHAR(255) NULL,
  ADD COLUMN mqtt_port INT UNSIGNED NULL,
  ADD COLUMN mqtt_publish_topic VARCHAR(255) NULL,
  ADD COLUMN mqtt_subscribe_topic VARCHAR(255) NULL;

-- A "connect" test (open the MQTT connection and subscribe) is logged like ping / port / send.
ALTER TABLE device_tests MODIFY kind ENUM('ping', 'port', 'send', 'connect') NOT NULL;
