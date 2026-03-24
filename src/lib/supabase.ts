import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase config. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type UserRole = 'superadmin' | 'worker' | 'user';

export type CarType = 'суудлын' | 'жийп' | 'ачааны' | 'автобус';

export interface ParkingCase {
  id: string;
  plate: string;
  car_type: CarType;
  base_penalty: number;
  nights: number;
  nightly_fee: number;
  storage_fee: number;
  total_amount: number;
  paid_amount: number | null;
  status: 'unpaid' | 'paid' | 'released';
  district: string;
  violation_note: string;
  worker_name: string;
  registered_at: string;
  paid_at: string | null;
  released_at: string | null;
  created_at: string;
}

export const CAR_TYPE_OPTIONS: Array<{ value: CarType; label: string; penalty: number }> = [
  { value: 'суудлын', label: 'Суудлын машин', penalty: 40000 },
  { value: 'жийп', label: 'Жийп', penalty: 50000 },
  { value: 'ачааны', label: 'Ачааны машин', penalty: 60000 },
  { value: 'автобус', label: 'Автобус', penalty: 80000 },
];

export function formatMoney(amount: number) {
  return `${amount.toLocaleString('mn-MN')} ₮`;
}

export function formatRole(role: UserRole) {
  if (role === 'superadmin') return 'Супер админ';
  if (role === 'worker') return 'Ажилтан';
  return 'Хэрэглэгч';
}
