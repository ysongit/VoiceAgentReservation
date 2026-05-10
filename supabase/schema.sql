-- Voice Agent Reservation — Supabase schema
-- Paste into the Supabase SQL editor and run.

create table if not exists oauth_tokens (
  restaurant_id text primary key,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  calendar_id text not null default 'primary',
  scope text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null,
  confirmation_code text not null unique,
  customer_name text not null,
  customer_phone text,
  party_size int not null,
  reservation_at timestamptz not null,
  notes text,
  status text not null default 'confirmed', -- confirmed | cancelled
  calendar_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reservations_restaurant_time_idx
  on reservations (restaurant_id, reservation_at);

create index if not exists reservations_confirmation_code_idx
  on reservations (confirmation_code);
