-- Phase 6 QA fix: found via a real end-to-end smoke test against Docker
-- Compose (MySQL + MQTT). commands.error_code (VARCHAR(64)) was too narrow
-- for the descriptive validation messages commandService.js writes into it,
-- causing ER_DATA_TOO_LONG (500) instead of the intended 400 response.
ALTER TABLE commands MODIFY COLUMN error_code VARCHAR(255) NULL;
