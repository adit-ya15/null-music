/**
 * Database schema migration for Music DNA feature
 * Run this to set up the necessary tables
 */

export async function initializeMusicDNASchema(pool) {
  const client = await pool.connect();
  
  try {
    // Create user_dna_profiles table
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_dna_profiles (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE,
        dna_id TEXT NOT NULL,
        profile_data JSONB NOT NULL,
        calculated_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_user_dna_profiles_user_id ON user_dna_profiles(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_dna_profiles_calculated_at ON user_dna_profiles(calculated_at);
    `);

    // Add features column to tracks table if not exists
    await client.query(`
      ALTER TABLE IF EXISTS tracks 
      ADD COLUMN IF NOT EXISTS features JSONB;

      CREATE INDEX IF NOT EXISTS idx_tracks_features ON tracks USING GIN (features);
    `);

    // Update user_tracks to store features
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_tracks (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        track_id TEXT NOT NULL,
        title TEXT,
        artist TEXT,
        features JSONB,
        completion_ratio NUMERIC DEFAULT 0,
        play_count INTEGER DEFAULT 1,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, track_id)
      );

      CREATE INDEX IF NOT EXISTS idx_user_tracks_user_id ON user_tracks(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_tracks_completion ON user_tracks(completion_ratio);
    `);

    console.log('✓ Music DNA schema initialized successfully');
  } finally {
    client.release();
  }
}
