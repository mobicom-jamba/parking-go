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
  violation_type: string;
  violation_reason: string;

  location: string;
  distance_km: number;

  officer_name: string;
  officer_rank: string;

  impounded_at: string;

  impound_fee: number;
  transfer_fee: number;
  nights: number;
  total_amount: number;

  district: string;
  worker_name: string;

  status: 'IMPOUNDED' | 'PENDING_PAYMENT' | 'PAID' | 'READY_FOR_PICKUP' | 'RELEASED';
  status_updated_at: string;
  paid_at: string | null;
  ready_for_pickup_at: string | null;
  released_at: string | null;

  created_at: string;
}

export type PaymentProvider = 'qpay';
export type PaymentStatus = 'pending' | 'success' | 'failed';

export interface Payment {
  id: string;
  case_id: string;
  provider: PaymentProvider;
  transaction_id: string;
  amount: number;
  currency: string;
  payment_status: PaymentStatus;
  paid_at: string | null;
  failed_at: string | null;
  created_at: string;
}

export const CAR_TYPE_OPTIONS: Array<{ value: CarType; label: string; penalty: number }> = [
  // PDF тариф: Саатуулах хашааны төлбөр
  // Жижиг машин 8,000₮
  // Дунд оврын машин 10,000₮
  // Ачааны машин 15,000₮
  // Том оврын ачааны машин / Автобус 20,000₮
  { value: 'суудлын', label: 'Суудлын машин', penalty: 8000 },
  { value: 'жийп', label: 'Жийп / Дунд оврын', penalty: 10000 },
  { value: 'ачааны', label: 'Ачааны машин', penalty: 15000 },
  { value: 'автобус', label: 'Автобус / Том оврын', penalty: 20000 },
];

export function formatMoney(amount: number) {
  return `${amount.toLocaleString('mn-MN')} ₮`;
}

export function formatCaseStatus(status: ParkingCase['status']) {
  switch (status) {
    case 'IMPOUNDED':
      return 'Импound (хоригдсон)';
    case 'PENDING_PAYMENT':
      return 'Төлбөр хүлээгдэж байна';
    case 'PAID':
      return 'Төлсөн';
    case 'READY_FOR_PICKUP':
      return 'Бэлтгэгдсэн (гаргахад бэлэн)';
    case 'RELEASED':
      return 'Машин гарсан';
  }
}

export function statusBadgeClass(status: ParkingCase['status']) {
  switch (status) {
    case 'IMPOUNDED':
      return 'bg-slate-100 text-slate-700';
    case 'PENDING_PAYMENT':
      return 'bg-amber-100 text-amber-700';
    case 'PAID':
      return 'bg-indigo-100 text-indigo-700';
    case 'READY_FOR_PICKUP':
      return 'bg-green-100 text-green-700';
    case 'RELEASED':
      return 'bg-slate-200 text-slate-700';
  }
}

export function formatRole(role: UserRole) {
  if (role === 'superadmin') return 'Супер админ';
  if (role === 'worker') return 'Ажилтан';
  return 'Хэрэглэгч';
}
