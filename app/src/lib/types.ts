// Row shapes returned by Supabase (see supabase/migrations).

export type VisitStatus = 'uploading' | 'processing' | 'ready' | 'failed' | 'needs_consent';
export type ItemKind = 'liked' | 'concern' | 'question';

export interface Property {
  id: string;
  address_line: string;
  unit: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  /** 'address' when the coordinates were looked up from the street address (the house itself). */
  coords_source?: 'device' | 'address';
  last_visited_at: string | null;
  // Public facts (RentCast), filled in after the first note is processed.
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  price: number | null;
  price_kind: 'list' | 'last_sale' | null;
  price_date: string | null;
  listing_status: string | null;
  facts_status: 'pending' | 'found' | 'not_found' | 'error';
}

export interface Visit {
  id: string;
  property_id: string;
  recorded_at: string;
  duration_seconds: number;
  audio_path: string | null;
  status: VisitStatus;
  error: string | null;
}

export interface Note {
  id: string;
  visit_id: string;
  overall: string;
  personal_note: string;
}

export interface NoteItem {
  id: string;
  note_id: string;
  kind: ItemKind;
  text: string;
  quote: string | null;
  origin: 'ai' | 'buyer';
  edited: boolean;
  deleted: boolean;
  sort: number;
  created_at: string;
}

export interface ShareLink {
  id: string;
  token: string;
  include_transcript: boolean;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  view_count: number;
}

export const KIND_LABELS: Record<ItemKind, string> = {
  liked: 'Liked',
  concern: 'Concerns',
  question: 'Questions for your agent',
};
