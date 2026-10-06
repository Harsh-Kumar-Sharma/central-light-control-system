-- Per-user permission override. NULL = use the role's default template.
-- Shape: {"devices": ["view","edit"], "control": ["view","control"]}
-- (the Admin role always has everything; an override on an Admin is ignored.)
ALTER TABLE users ADD COLUMN permissions JSON NULL;
