export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Profile {
  id: string;
  display_name: string;
  avatar_id: string;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export type RoomStatus = 'lobby' | 'in_game' | 'ended';

export interface RoomSettings {
  max_players: number;
  testing_mode: boolean;
  rounds?: number;
  categories?: string[];
  allow_voting?: boolean;
  [key: string]: unknown;
}

export interface Room {
  id: string;
  code: string;
  host_id: string;
  status: RoomStatus;
  settings: RoomSettings;
  current_game: string | null;
  phase: string;
  game_state: Record<string, unknown>;
  phase_started_at: string;
  phase_ends_at: string | null;
  version: number;
  created_at: string;
  last_active_at: string;
}

export interface RoomPlayer {
  room_id: string;
  user_id: string;
  joined_at: string;
  last_seen_at: string;
  is_spectator: boolean;
  total_score: number;
  profile?: Profile;
}

export interface GameSession {
  id: string;
  room_id: string;
  game: string;
  options: Record<string, unknown>;
  started_at: string;
  ended_at: string | null;
  results: Record<string, unknown> | null;
}

export interface RoundSecret {
  id: string;
  room_id: string;
  session_id: string | null;
  round_no: number;
  visible_to: string | null;
  kind: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface ScoreEvent {
  id: string;
  session_id: string;
  user_id: string;
  points: number;
  reason: string;
  created_at: string;
}

export interface ContentItem {
  id: string;
  game: 'quiz' | 'pictionary' | 'charades' | 'typing';
  payload: Record<string, unknown>;
  category: string;
  difficulty: 1 | 2 | 3;
  content_hash: string;
  created_at: string;
  created_by: string | null;
}

export interface RoundSubmission {
  id: string;
  room_id: string;
  round_no: number;
  user_id: string;
  kind: 'quiz_answer' | 'reaction_tap' | 'typing_result' | 'guess' | 'guess_correct' | 'word';
  payload: Record<string, unknown>;
  arrived_at: string;
}

export interface RoundStroke {
  id: string;
  room_id: string;
  round_no: number;
  batch_seq: number;
  strokes: Record<string, unknown>[];
  created_at: string;
}


