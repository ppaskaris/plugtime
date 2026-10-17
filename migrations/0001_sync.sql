CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  body TEXT NOT NULL CHECK (json_valid(body))
);
CREATE UNIQUE INDEX one_active_session
  ON sessions(json_extract(body, '$.state'))
  WHERE json_extract(body, '$.state') = 'active';

CREATE TABLE mutation_receipts (
  id TEXT PRIMARY KEY NOT NULL,
  digest TEXT NOT NULL,
  session_id TEXT NOT NULL,
  base_revision INTEGER NOT NULL CHECK (base_revision >= 0),
  body TEXT NOT NULL CHECK (json_valid(body)),
  received_at TEXT NOT NULL
);

-- A single receipt insert performs the revision check and session write atomically.
-- Any trigger/index error rolls back the receipt too, allowing safe retries.
CREATE TRIGGER check_session_revision BEFORE INSERT ON mutation_receipts
BEGIN
  SELECT CASE WHEN COALESCE((SELECT revision FROM sessions WHERE id = NEW.session_id), 0) != NEW.base_revision
    THEN RAISE(ABORT, 'revision_conflict') END;
END;

CREATE TRIGGER apply_session_mutation AFTER INSERT ON mutation_receipts
BEGIN
  INSERT INTO sessions(id, revision, body) VALUES (NEW.session_id, NEW.base_revision + 1, NEW.body)
    ON CONFLICT(id) DO UPDATE SET revision = excluded.revision, body = excluded.body;
END;
