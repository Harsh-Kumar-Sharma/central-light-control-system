-- Command delivery over LAN (TCP to the transmitter's IP:port).
--
-- lan_line_ending: characters appended after the command text (Tx_1_R1ON).
-- The firmware's LAN framing is not documented, so this is configurable per
-- transmitter instead of guessed; default sends the command exactly as is.
ALTER TABLE transmitters
  ADD COLUMN lan_line_ending ENUM('none', 'lf', 'crlf') NOT NULL DEFAULT 'none';

-- transport: how the command actually left the server. response: raw reply
-- text from the device, kept to debug firmware replies we can't parse.
ALTER TABLE commands
  ADD COLUMN transport ENUM('mqtt', 'lan') NULL,
  ADD COLUMN response VARCHAR(500) NULL;
