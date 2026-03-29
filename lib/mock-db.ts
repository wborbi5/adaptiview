/**
 * Mock Database Layer
 *
 * In-memory store for demo purposes. In production, this is replaced by:
 *   - Supabase PostgreSQL for user profiles and session history
 *   - Row-level security (RLS) policies per reviewer/site
 *   - Encrypted at rest via Supabase Vault for PHI compliance
 */

export interface UserProfile {
  id: string;
  style_scores: { visualizer: number; verbalizer: number; spatial: number };
  raw_features: number[];
  session_count: number;
}

export interface GazeSession {
  user_id: string;
  aoi_dwell_times: Record<string, number>;
  dominant_style: string;
  confidence: number;
  timestamp: number;
}

const profiles: Map<string, UserProfile> = new Map();
const sessions: GazeSession[] = [];

export const mockDB = {
  upsertProfile(profile: UserProfile) {
    profiles.set(profile.id, profile);
  },
  getProfile(id: string): UserProfile | undefined {
    return profiles.get(id);
  },
  insertSession(session: GazeSession) {
    sessions.push(session);
  },
  getAllSessions(): GazeSession[] {
    return sessions;
  },
};
