// Row shapes for the tables and views the app reads. Kept by hand in sync with
// supabase/migrations; regenerate with `supabase gen types` if preferred.

export type AppRole = "admin" | "organizer" | "timer";
export type RaceFormat = "backyard" | "fixed_distance";
export type EventStatus = "upcoming" | "race_day" | "results_pending" | "results_published" | "completed";
export type ResultsPublication = "hidden" | "provisional" | "official";
export type ParticipationStatus = "registered" | "started" | "finished" | "dns" | "dnf" | "dsq";
export type TimingKind = "start" | "lap" | "checkpoint" | "finish";
export type LocationKind = "venue" | "start" | "finish" | "parking" | "packet_pickup" | "aid_station" | "accommodation" | "other";
export type ContentPage = "home" | "info" | "manual";

export interface Race {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  format: RaceFormat;
  timezone: string;
  event_date: string | null;
  event_status: EventStatus;
  results_publication: ResultsPublication;
  results_published_at: string | null;
  is_published: boolean;
  registration_note: string;
  venue_name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  logo_path: string | null;
  hero_image_path: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  social_links: { label: string; url: string }[];
  ranking_basis: "gun" | "net";
  manual_version: string | null;
  manual_updated_at: string | null;
  manual_pdf_path: string | null;
  updated_at: string;
}

export interface Location {
  id: string;
  race_id: string;
  kind: LocationKind;
  name: string;
  description: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  sort_order: number;
  is_public: boolean;
}

export interface ElevationPoint {
  d: number; // km from start
  e: number; // metres
}

export interface GpxStats {
  distance_km: number;
  gain_m: number;
  loss_m: number;
  min_ele_m: number | null;
  max_ele_m: number | null;
  points: number;
  has_elevation: boolean;
}

export interface Distance {
  id: string;
  race_id: string;
  slug: string;
  name: string;
  distance_km: number | null;
  elevation_gain_m: number | null;
  elevation_loss_m: number | null;
  description: string | null;
  instructions: string | null;
  start_location_id: string | null;
  finish_location_id: string | null;
  start_time: string | null;
  cutoff_minutes: number | null;
  loop_interval_minutes: number | null;
  gpx_path: string | null;
  gpx_filename: string | null;
  route_geojson: { type: "LineString"; coordinates: [number, number][] } | null;
  elevation_profile: ElevationPoint[] | null;
  gpx_stats: GpxStats | null;
  sort_order: number;
  is_published: boolean;
}

export interface Category {
  id: string;
  race_id: string;
  code: string;
  name: string;
  gender: "F" | "M" | "X" | null;
  min_age: number | null;
  max_age: number | null;
  sort_order: number;
}

export interface Checkpoint {
  id: string;
  race_id: string;
  distance_id: string;
  name: string;
  kind: "aid_station" | "checkpoint" | "timing_point";
  km_mark: number | null;
  latitude: number | null;
  longitude: number | null;
  sort_order: number;
  cutoff_minutes: number | null;
  is_timed: boolean;
  services: string | null;
  notes: string | null;
}

export interface ContentSection {
  id: string;
  race_id: string;
  page: ContentPage;
  slug: string;
  title: string;
  body: string;
  sort_order: number;
  is_published: boolean;
  updated_at: string;
}

export interface ScheduleItem {
  id: string;
  race_id: string;
  distance_id: string | null;
  location_id: string | null;
  starts_at: string;
  ends_at: string | null;
  title: string;
  description: string | null;
}

export interface Faq {
  id: string;
  question: string;
  answer: string;
  sort_order: number;
  is_published: boolean;
}

export interface Contact {
  id: string;
  kind: "organizer" | "emergency" | "medical" | "other";
  name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_public: boolean;
  sort_order: number;
}

export interface Sponsor {
  id: string;
  name: string;
  tier: string | null;
  logo_path: string | null;
  website_url: string | null;
  sort_order: number;
  is_published: boolean;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  severity: "info" | "important" | "urgent";
  is_pinned: boolean;
  published_at: string | null;
  expires_at: string | null;
}

export interface PodcastEpisode {
  id: string;
  episode_number: number | null;
  title: string;
  description: string | null;
  cover_path: string | null;
  listen_url: string | null;
  published_on: string | null;
  sort_order: number;
  is_published: boolean;
}

export interface DocumentRow {
  id: string;
  kind: "manual_pdf" | "gpx" | "image" | "other";
  title: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  version: string | null;
  is_public: boolean;
  created_at: string;
}

export interface Split {
  type: "checkpoint" | "lap";
  checkpoint_id?: string;
  name?: string;
  lap: number | null;
  at: string;
  elapsed_ms: number | null;
  lap_ms?: number | null;
  valid?: boolean;
}

export interface PublicResult {
  registration_id: string;
  race_id: string;
  results_publication: ResultsPublication;
  bib: string | null;
  first_name: string;
  last_name: string;
  gender: string | null;
  distance_id: string;
  distance_slug: string;
  distance_name: string;
  category_id: string | null;
  category_code: string | null;
  category_name: string | null;
  status: ParticipationStatus;
  laps_completed: number;
  finish_at: string | null;
  gun_elapsed_ms: number | null;
  net_elapsed_ms: number | null;
  ranking_elapsed_s: number | null;
  overall_rank: number | null;
  category_rank: number | null;
  gender_rank: number | null;
  splits: Split[];
  computed_at: string;
}

export interface RosterEntry {
  registration_id: string;
  race_id: string;
  bib: string | null;
  first_name: string;
  last_name: string;
  gender: string | null;
  distance_id: string;
  distance_name: string;
  category_id: string | null;
  category_name: string | null;
  status: ParticipationStatus;
  status_reason: string | null;
}

export interface TimingEvent {
  id: string;
  race_id: string;
  registration_id: string;
  kind: TimingKind;
  lap_number: number | null;
  checkpoint_id: string | null;
  recorded_at: string;
  source: "manual" | "csv" | "chip" | "api";
  note: string | null;
  recorded_by: string | null;
  created_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  replaced_by: string | null;
}

/** Personal data: organizers and admins only (RLS). Never sent to public pages. */
export interface Participant {
  id: string;
  race_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  birth_date: string | null;
  age: number | null;
  gender: "F" | "M" | "X" | null;
  shirt_size: string | null;
  nationality: string | null;
  city: string | null;
  club: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  medical_notes: string | null;
  internal_notes: string | null;
  external_ref: string | null;
}

export interface AdminEntry {
  id: string;
  bib: string | null;
  status: ParticipationStatus;
  status_reason: string | null;
  public_listing: boolean;
  signup_seq: number;
  distance_id: string;
  category_id: string | null;
  participant: Participant;
}
