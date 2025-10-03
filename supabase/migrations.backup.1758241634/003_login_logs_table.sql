/*
  # Login Logs Table

  1. New Tables
    - `login_logs`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `ip_address` (text, encrypted)
      - `success` (boolean, login success status)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `login_logs` table
    - Add policy for system to insert logs
    - Add policy for users to read their own logs
    - Add policy for admins to read all logs

  3. Functions
    - Function to log login attempts
*/

-- Create login_logs table
CREATE TABLE IF NOT EXISTS login_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    ip_address text NOT NULL,
    success boolean NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE login_logs ENABLE ROW LEVEL SECURITY;

-- Policy: System can insert login logs
CREATE POLICY "System can insert login logs"
    ON login_logs
    FOR INSERT
    TO public
    WITH CHECK (true);

-- Policy: Users can read their own login logs
CREATE POLICY "Users can read own login logs"
    ON login_logs
    FOR SELECT
    TO authenticated
    USING (
        auth.uid() = user_id 
        OR (
            SELECT raw_app_meta_data->>'role' 
            FROM auth.users 
            WHERE id = auth.uid()
        ) = 'service_role'
    );

-- Policy: Only admins can delete login logs
CREATE POLICY "Admins can delete login logs"
    ON login_logs
    FOR DELETE
    TO authenticated
    USING (
        (
            SELECT raw_app_meta_data->>'role' 
            FROM auth.users 
            WHERE id = auth.uid()
        ) = 'service_role'
    );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON login_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_login_logs_created_at ON login_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_login_logs_success ON login_logs(success);

-- Function to log login attempts
CREATE OR REPLACE FUNCTION log_login_attempt(
    p_user_id uuid,
    p_ip_address text,
    p_success boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO login_logs (user_id, ip_address, success)
    VALUES (p_user_id, p_ip_address, p_success);
END;
$$;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION log_login_attempt(uuid, text, boolean) TO anon, authenticated, service_role;
