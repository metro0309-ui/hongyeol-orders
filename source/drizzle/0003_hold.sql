ALTER TABLE orders ADD COLUMN held TEXT;
--> statement-breakpoint
CREATE TABLE admin_sessions (token TEXT PRIMARY KEY, owner TEXT NOT NULL, version TEXT NOT NULL, expires INTEGER NOT NULL);
