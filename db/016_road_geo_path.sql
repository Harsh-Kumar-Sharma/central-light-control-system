-- The real-world route of a road on the GPS map: an ordered list of [latitude, longitude] points.
-- NULL = not drawn; the map then shows an estimated line through the road's lights.
ALTER TABLE roads ADD COLUMN geo_path JSON NULL;
