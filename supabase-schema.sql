-- Supabase SQL Editor дээр бүтнээр нь ажиллуулна.

create extension if not exists pgcrypto;

drop table if exists public.vehicle_registrations;
drop table if exists public.parking_fines;
drop table if exists public.parking_cases;

create table public.parking_cases (
  id uuid primary key default gen_random_uuid(),
  plate text not null,
  car_type text not null check (car_type in ('суудлын', 'жийп', 'ачааны', 'автобус')),
  base_penalty integer not null check (base_penalty in (40000, 50000, 60000, 80000)),
  nights integer not null default 0 check (nights >= 0),
  nightly_fee integer not null default 6000 check (nightly_fee = 6000),
  storage_fee integer generated always as (nights * nightly_fee) stored,
  total_amount integer generated always as (base_penalty + (nights * nightly_fee)) stored,
  paid_amount integer,
  status text not null default 'unpaid' check (status in ('unpaid', 'paid', 'released')),
  district text not null default 'Тодорхойгүй',
  violation_note text not null default 'Зөрчил илэрсэн',
  worker_name text not null default 'Ажилтан',
  registered_at timestamptz not null default now(),
  paid_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now()
);

create index parking_cases_plate_idx on public.parking_cases (plate);
create index parking_cases_status_idx on public.parking_cases (status);
create index parking_cases_created_idx on public.parking_cases (created_at desc);

alter table public.parking_cases enable row level security;

drop policy if exists "parking_cases_select_all" on public.parking_cases;
create policy "parking_cases_select_all"
on public.parking_cases
for select
to anon
using (true);

drop policy if exists "parking_cases_insert_all" on public.parking_cases;
create policy "parking_cases_insert_all"
on public.parking_cases
for insert
to anon
with check (true);

drop policy if exists "parking_cases_update_all" on public.parking_cases;
create policy "parking_cases_update_all"
on public.parking_cases
for update
to anon
using (true)
with check (true);

insert into public.parking_cases (plate, car_type, base_penalty, nights, district, violation_note, worker_name, status)
values
  ('1234 УБ', 'суудлын', 40000, 2, 'Хан-Уул дүүрэг', 'Зогсоолын дүрэм зөрчсөн', 'Б. Бат', 'unpaid'),
  ('5678 АБ', 'жийп', 50000, 1, 'Баянгол дүүрэг', 'Хориглосон бүсэд зогссон', 'Г. Сүрэн', 'paid'),
  ('9012 ТУ', 'ачааны', 60000, 3, 'Сүхбаатар дүүрэг', 'Тэмдэг, тэмдэглэгээ зөрчсөн', 'Б. Бат', 'released'),
  ('3456 УН', 'автобус', 80000, 0, 'Чингэлтэй дүүрэг', 'Нийтийн замд саад учруулсан', 'Д. Төгөлдөр', 'unpaid');
