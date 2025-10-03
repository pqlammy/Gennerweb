-- Einfache Datenbank-Initialisierung OHNE auth Schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users Tabelle (einfach)
CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email varchar(255) UNIQUE NOT NULL,
    password_hash varchar(255) NOT NULL,
    role varchar(50) DEFAULT 'user',
    created_at timestamptz DEFAULT now()
);

-- Contributions Tabelle (einfach)
CREATE TABLE IF NOT EXISTS contributions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    amount numeric NOT NULL CHECK (amount > 0),
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text NOT NULL,
    address text NOT NULL,
    city text NOT NULL,
    postal_code text NOT NULL,
    gennervogt_id uuid REFERENCES users(id) ON DELETE SET NULL,
    paid boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);

-- Login Logs Tabelle (einfach)
CREATE TABLE IF NOT EXISTS login_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    ip_address text NOT NULL,
    success boolean NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- Indexes für Performance
CREATE INDEX IF NOT EXISTS idx_contributions_user_id ON contributions(user_id);
CREATE INDEX IF NOT EXISTS idx_contributions_gennervogt_id ON contributions(gennervogt_id);
CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON login_logs(user_id);
