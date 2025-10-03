/*
  # Contributions Table

  1. New Tables
    - `contributions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `amount` (numeric, contribution amount)
      - `first_name` (text, encrypted)
      - `last_name` (text, encrypted)
      - `email` (text, encrypted)
      - `address` (text, encrypted)
      - `city` (text, encrypted)
      - `postal_code` (text, encrypted)
      - `gennervogt_id` (uuid, foreign key to auth.users)
      - `paid` (boolean, payment status)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `contributions` table
    - Add policies for authenticated users
    - Add policies for admins (service_role)

  3. Constraints
    - Amount must be positive
    - Required fields validation
*/

-- Create contributions table
CREATE TABLE IF NOT EXISTS contributions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    amount numeric NOT NULL CHECK (amount > 0),
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text NOT NULL,
    address text NOT NULL,
    city text NOT NULL,
    postal_code text NOT NULL,
    gennervogt_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    paid boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE contributions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can insert their own contributions
CREATE POLICY "Users can insert own contributions"
    ON contributions
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id OR auth.uid() = gennervogt_id);

-- Policy: Users can read contributions they created or are assigned to
CREATE POLICY "Users can read own contributions"
    ON contributions
    FOR SELECT
    TO authenticated
    USING (
        auth.uid() = user_id 
        OR auth.uid() = gennervogt_id 
        OR (
            SELECT raw_app_meta_data->>'role' 
            FROM auth.users 
            WHERE id = auth.uid()
        ) = 'service_role'
    );

-- Policy: Only admins can update contributions
CREATE POLICY "Admins can update contributions"
    ON contributions
    FOR UPDATE
    TO authenticated
    USING (
        (
            SELECT raw_app_meta_data->>'role' 
            FROM auth.users 
            WHERE id = auth.uid()
        ) = 'service_role'
    )
    WITH CHECK (
        (
            SELECT raw_app_meta_data->>'role' 
            FROM auth.users 
            WHERE id = auth.uid()
        ) = 'service_role'
    );

-- Policy: Only admins can delete contributions
CREATE POLICY "Admins can delete contributions"
    ON contributions
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
CREATE INDEX IF NOT EXISTS idx_contributions_user_id ON contributions(user_id);
CREATE INDEX IF NOT EXISTS idx_contributions_gennervogt_id ON contributions(gennervogt_id);
CREATE INDEX IF NOT EXISTS idx_contributions_created_at ON contributions(created_at);
CREATE INDEX IF NOT EXISTS idx_contributions_paid ON contributions(paid);
