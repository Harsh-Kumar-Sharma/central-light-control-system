-- Real-world position of each light (WGS84 decimal degrees) for the GPS map.
-- Both NULL = not placed on the map yet.
ALTER TABLE receivers
  ADD COLUMN latitude DECIMAL(9,6) NULL,
  ADD COLUMN longitude DECIMAL(9,6) NULL;
