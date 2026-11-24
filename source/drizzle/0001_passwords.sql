CREATE TABLE role_passwords (role TEXT PRIMARY KEY, salt TEXT NOT NULL, digest TEXT NOT NULL);
