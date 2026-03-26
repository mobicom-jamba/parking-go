-- Supabase SQL Editor дээр бүтнээр нь ажиллуулна (dev/demo).
-- Plate стандарт: 4 тоо + 3 үсэг (ж: 1234 УБА)

create extension if not exists pgcrypto;

drop table if exists public.audit_logs;
drop table if exists public.parking_case_images;
drop table if exists public.payments;
drop table if exists public.parking_cases;

-- Main impound case
create table public.parking_cases (
  id uuid primary key default gen_random_uuid(),

  plate text not null check (plate ~ '^[0-9]{4}\s[А-ЯӨҮЁ]{3}$'),

  car_type text not null check (car_type in ('мотоцикл', 'суудлын', 'жийп', 'ачааны', 'автобус')),
  violation_type text not null default 'Дүрэм зөрчил',
  violation_reason text not null default 'Зөрчил илэрсэн',

  location text not null default 'Тодорхойгүй',
  distance_km numeric(6,2) not null default 0,

  officer_name text not null default 'Ажилтан',
  officer_rank text not null default 'Ахлах',

  impounded_at timestamptz not null default now(),

  -- Penalty system
  -- PDF тариф:
  -- Саатуулах хашааны төлбөр:
  -- жижиг машин 8000, дунд оврын 10000, ачааны 15000, том/автобус 20000
  -- 24 цагийн тарифын үнийг хоногийн тоогоор үржүүлсний дараах нийт дүн
  -- Жишээ: 2 хоног => (суурь тариф * 2)
  impound_fee integer not null,
  -- Зөөж шилжүүлсэн төлбөр:
  -- Хэрлэн сум дотор: 60,000
  -- Орон нутгаас: км тутам 2,500
  transfer_fee integer not null default 0,
  nights integer not null default 0 check (nights >= 0),
  total_amount integer generated always as (impound_fee + transfer_fee) stored,

  district text not null default 'Тодорхойгүй',

  -- State machine (Worker can move forward)
  status text not null default 'IMPOUNDED'
    check (status in ('IMPOUNDED','PENDING_PAYMENT','PAID','READY_FOR_PICKUP','RELEASED')),

  -- Timestamps
  paid_at timestamptz,
  ready_for_pickup_at timestamptz,
  released_at timestamptz,

  -- Ownership/scope
  worker_name text not null default 'Ажилтан',

  status_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index parking_cases_plate_idx on public.parking_cases (plate);
create index parking_cases_status_idx on public.parking_cases (status);
create index parking_cases_updated_idx on public.parking_cases (status_updated_at desc);

-- Payments (QPay)
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.parking_cases(id) on delete cascade,

  provider text not null default 'qpay' check (provider = 'qpay'),
  transaction_id text not null,
  amount integer not null,
  currency text not null default 'MNT',

  payment_status text not null check (payment_status in ('pending','success','failed')),

  paid_at timestamptz,
  failed_at timestamptz,

  created_at timestamptz not null default now(),

  unique(provider, transaction_id)
);

create index payments_case_idx on public.payments (case_id);
create index payments_status_idx on public.payments (payment_status);

-- Images metadata (4 sides)
create table public.parking_case_images (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.parking_cases(id) on delete cascade,
  side text not null check (side in ('front','back','left','right','permit')),
  storage_path text not null,
  created_at timestamptz not null default now(),
  unique(case_id, side)
);

-- Audit logs
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_name text not null default 'Хэрэглэгч',
  actor_role text not null default 'worker',
  case_id uuid references public.parking_cases(id) on delete set null,
  action text not null,
  before_status text,
  after_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_case_idx on public.audit_logs (case_id);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

alter table public.parking_cases enable row level security;
alter table public.payments enable row level security;
alter table public.parking_case_images enable row level security;
alter table public.audit_logs enable row level security;

-- Demo-friendly policies (anon reads/writes).
-- Production: replace with Supabase Auth + strict RBAC policies.
drop policy if exists "cases_demo_select" on public.parking_cases;
create policy "cases_demo_select" on public.parking_cases for select to anon using (true);
drop policy if exists "cases_demo_insert" on public.parking_cases;
create policy "cases_demo_insert" on public.parking_cases for insert to anon with check (true);
drop policy if exists "cases_demo_update" on public.parking_cases;
create policy "cases_demo_update" on public.parking_cases for update to anon using (true) with check (true);

drop policy if exists "payments_demo_select" on public.payments;
create policy "payments_demo_select" on public.payments for select to anon using (true);
drop policy if exists "payments_demo_insert" on public.payments;
create policy "payments_demo_insert" on public.payments for insert to anon with check (true);
drop policy if exists "payments_demo_update" on public.payments;
create policy "payments_demo_update" on public.payments for update to anon using (true) with check (true);

drop policy if exists "images_demo_select" on public.parking_case_images;
create policy "images_demo_select" on public.parking_case_images for select to anon using (true);
drop policy if exists "images_demo_insert" on public.parking_case_images;
create policy "images_demo_insert" on public.parking_case_images for insert to anon with check (true);
drop policy if exists "images_demo_update" on public.parking_case_images;
create policy "images_demo_update" on public.parking_case_images for update to anon using (true) with check (true);

drop policy if exists "audit_demo_select" on public.audit_logs;
create policy "audit_demo_select" on public.audit_logs for select to anon using (true);
drop policy if exists "audit_demo_insert" on public.audit_logs;
create policy "audit_demo_insert" on public.audit_logs for insert to anon with check (true);

-- Storage: images bucket (demo)
do $$
begin
  perform storage.create_bucket('impound-images', public := false);
exception
  when others then null;
end $$;

-- Demo-friendly storage policies (anon read/write)
drop policy if exists "storage_demo_insert" on storage.objects;
create policy "storage_demo_insert"
on storage.objects
for insert
to anon
with check (bucket_id = 'impound-images');

drop policy if exists "storage_demo_select" on storage.objects;
create policy "storage_demo_select"
on storage.objects
for select
to anon
using (bucket_id = 'impound-images');

-- Seed demo data
insert into public.parking_cases
  (plate, car_type, violation_type, violation_reason, location, distance_km, officer_name, officer_rank, impounded_at, impound_fee, transfer_fee, nights, district, status, worker_name, status_updated_at, created_at)
values
  -- nights = floor(өнгөрсөн хоног) + 1
  ('1234 УБА', 'суудлын', 'Зогсоолын дүрэм зөрчил', 'Зогсоолын дүрэм зөрчсөн', 'Хэрлэн сум дотор', 0, 'Б. Бат', 'Ажилтан', now() - interval '1 day', 8000 * 2, 60000, 2, 'Хэрлэн сум дотор', 'IMPOUNDED', 'Б. Бат', now() - interval '1 day', now() - interval '1 day'),
  ('5678 АБВ', 'жийп', 'Хориглосон бүс', 'Хориглосон бүсэд зогссон', 'Орон нутгаас', 20, 'Г. Сүрэн', 'Ажилтан', now() - interval '12 hour', 10000 * 1, 20 * 2 * 2500, 1, 'Орон нутгаас', 'PENDING_PAYMENT', 'Г. Сүрэн', now() - interval '12 hour', now() - interval '12 hour'),
  ('9012 ТУХ', 'ачааны', 'Тэмдэг, тэмдэглэгээ зөрчил', 'Тэмдэг, тэмдэглэгээ зөрчсөн', 'Хэрлэн сум дотор', 0, 'Б. Бат', 'Ажилтан', now() - interval '2 day', 15000 * 3, 60000, 3, 'Хэрлэн сум дотор', 'READY_FOR_PICKUP', 'Б. Бат', now() - interval '2 day', now() - interval '2 day'),
  ('3456 УНЗ', 'автобус', 'Нийтийн замын саад', 'Нийтийн замд саад учруулсан', 'Орон нутгаас', 10, 'Д. Төгөлдөр', 'Ахлах', now() - interval '12 hour', 20000 * 1, 10 * 2 * 2500, 1, 'Орон нутгаас', 'IMPOUNDED', 'Д. Төгөлдөр', now() - interval '12 hour', now() - interval '12 hour');

-- Payments seed (төлбөрийн жагсаалтын demo)
-- 5678 АБВ: pending payment
insert into public.payments (case_id, provider, transaction_id, amount, currency, payment_status, paid_at, failed_at)
select
  pc.id,
  'qpay'::text,
  'seed_pending_' || pc.plate::text,
  pc.total_amount,
  'MNT'::text,
  'pending'::text,
  null,
  null
from public.parking_cases pc
where pc.plate = '5678 АБВ'
on conflict (provider, transaction_id) do nothing;

-- 9012 ТУХ: success payment
insert into public.payments (case_id, provider, transaction_id, amount, currency, payment_status, paid_at, failed_at)
select
  pc.id,
  'qpay'::text,
  'seed_success_' || pc.plate::text,
  pc.total_amount,
  'MNT'::text,
  'success'::text,
  now(),
  null
from public.parking_cases pc
where pc.plate = '9012 ТУХ'
on conflict (provider, transaction_id) do nothing;
