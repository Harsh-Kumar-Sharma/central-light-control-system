-- Plans: an uploaded CAD drawing (DWG / DXF) of a project, with lights placed on it.
--
-- The drawing is converted once at upload into compact vector geometry (lines, polylines,
-- text, circles by layer) that the browser draws. The original file is kept too, so it can
-- be converted again later if the converter improves.

CREATE TABLE IF NOT EXISTS plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  source_name VARCHAR(255) NOT NULL,
  source_type ENUM('dwg', 'dxf') NOT NULL,
  size_bytes INT UNSIGNED NOT NULL,
  units VARCHAR(16) NULL,                 -- metres, feet, ... as the drawing says
  geometry_gz LONGBLOB NOT NULL,          -- gzip of the geometry JSON
  origin_json JSON NOT NULL,              -- [x, y] subtracted from every stored coordinate
  bounds_json JSON NOT NULL,              -- {x1,y1,x2,y2} sensible view of the drawing (stray points ignored)
  layers_json JSON NOT NULL,              -- [{ name, color, count, hidden }] as found in the file
  stats_json JSON NOT NULL,               -- what was drawn / skipped
  hidden_layers JSON NULL,                -- layer names the team chose to hide; NULL = the file's own defaults
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS plan_sources (
  plan_id INT NOT NULL PRIMARY KEY,
  data LONGBLOB NOT NULL,
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Where each light stands on a plan, in the drawing's own coordinates (the CAD units).
CREATE TABLE IF NOT EXISTS plan_lights (
  plan_id INT NOT NULL,
  receiver_id INT NOT NULL,
  x DOUBLE NOT NULL,
  y DOUBLE NOT NULL,
  PRIMARY KEY (plan_id, receiver_id),
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE,
  FOREIGN KEY (receiver_id) REFERENCES receivers(id) ON DELETE CASCADE
) ENGINE=InnoDB;
