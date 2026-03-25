import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, ShieldCheck, Wallet } from 'lucide-react';
import { formatMoney, supabase, type ParkingCase, type UserRole } from '../lib/supabase';

interface DashboardProps {
  role: UserRole;
}

function formatStatus(status: ParkingCase['status']) {
  if (status === 'IMPOUNDED') return 'Хоригдсон';
  if (status === 'PENDING_PAYMENT') return 'Төлбөр хүлээгдэж байна';
  if (status === 'PAID') return 'Төлсөн';
  if (status === 'READY_FOR_PICKUP') return 'Бэлтгэгдсэн';
  return 'Машин гарсан';
}

function statusClass(status: ParkingCase['status']) {
  if (status === 'PENDING_PAYMENT') return 'bg-amber-100 text-amber-800';
  if (status === 'PAID') return 'bg-indigo-100 text-indigo-700';
  if (status === 'READY_FOR_PICKUP') return 'bg-green-100 text-green-700';
  if (status === 'RELEASED') return 'bg-slate-200 text-slate-700';
  return 'bg-slate-100 text-slate-700';
}

export default function Dashboard({ role }: DashboardProps) {
  const [rows, setRows] = useState<ParkingCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadCases = useCallback(async (withSpinner = false) => {
    if (withSpinner) setRefreshing(true);
    setLoading(true);
    const { data, error } = await supabase
      .from('parking_cases')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    setLoading(false);
    if (withSpinner) setRefreshing(false);
    if (error) {
      setMessage('Өгөгдөл ачааллахад алдаа гарлаа.');
      return;
    }
    setRows((data as ParkingCase[]) || []);
  }, []);

  useEffect(() => {
    void loadCases();
    const channel = supabase
      .channel('parking-cases-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parking_cases' }, () => {
        void loadCases();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadCases]);

  const stats = useMemo(() => {
    const total = rows.length;
    const pending = rows.filter((r) => r.status === 'PENDING_PAYMENT').length;
    const paid = rows.filter((r) => r.status === 'PAID').length;
    const ready = rows.filter((r) => r.status === 'READY_FOR_PICKUP').length;
    const released = rows.filter((r) => r.status === 'RELEASED').length;
    const revenue = rows
      .filter((r) => r.status === 'PAID' || r.status === 'READY_FOR_PICKUP' || r.status === 'RELEASED')
      .reduce((sum, r) => sum + r.total_amount, 0);
    return { total, pending, paid, ready, released, revenue };
  }, [rows]);

  const verifyPayment = async (id: string, status: ParkingCase['status']) => {
    if (status !== 'PENDING_PAYMENT') {
      setMessage('Зөвхөн төлбөр хүлээгдэж буй машиныг баталгаажуулна.');
      return;
    }
    const confirmed = window.confirm('Энэ машины төлбөрийг баталгаажуулах уу?');
    if (!confirmed) return;
    setBusyId(id);

    const { error: paymentError } = await supabase
      .from('payments')
      .update({ payment_status: 'success', paid_at: new Date().toISOString() })
      .eq('case_id', id)
      .eq('payment_status', 'pending');

    if (paymentError) {
      setBusyId(null);
      setMessage('Төлбөр баталгаажуулах үед алдаа гарлаа.');
      return;
    }

    const { error: caseError } = await supabase
      .from('parking_cases')
      .update({ status: 'PAID', status_updated_at: new Date().toISOString(), paid_at: new Date().toISOString() })
      .eq('id', id);

    setBusyId(null);

    if (caseError) {
      setMessage('Case status шинэчлэх үед алдаа гарлаа.');
      return;
    }

    setMessage('Төлбөр баталгаажсан.');
    await loadCases();
  };

  const markReady = async (id: string, status: ParkingCase['status']) => {
    if (status !== 'PAID') {
      setMessage('Зөвхөн төлсөн машиныг гаргахад бэлтгэх боломжтой.');
      return;
    }
    setBusyId(id);
    const { error } = await supabase
      .from('parking_cases')
      .update({
        status: 'READY_FOR_PICKUP',
        status_updated_at: new Date().toISOString(),
        ready_for_pickup_at: new Date().toISOString(),
      })
      .eq('id', id);

    setBusyId(null);

    if (error) {
      setMessage('Гаргахад бэлтгэх үед алдаа гарлаа.');
      return;
    }

    setMessage('Гаргахад бэлэн боллоо.');
    await loadCases();
  };

  const markReleased = async (id: string, status: ParkingCase['status']) => {
    if (status !== 'READY_FOR_PICKUP') {
      setMessage('Зөвхөн бэлтгэгдсэн машиныг гаргах боломжтой.');
      return;
    }
    const confirmed = window.confirm('Энэ машиныг гаргасан гэж баталгаажуулах уу?');
    if (!confirmed) return;
    setBusyId(id);
    const { error } = await supabase
      .from('parking_cases')
      .update({
        status: 'RELEASED',
        status_updated_at: new Date().toISOString(),
        released_at: new Date().toISOString(),
      })
      .eq('id', id);

    setBusyId(null);

    if (error) {
      setMessage('Машин гаргах үед алдаа гарлаа.');
      return;
    }
    setMessage('Машиныг амжилттай гаргалаа.');
    await loadCases();
  };

  return (
    <div className="p-4 md:p-8 space-y-6 md:space-y-8">
      <div>
        <h2 className="text-2xl md:text-3xl font-black tracking-tight">Хяналтын самбар</h2>
        <p className="text-sm md:text-base text-on-secondary-container mt-1">
          Зөрчил, төлбөр, машин гаргалтын нэгдсэн мэдээлэл.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        {loading ? (
          Array.from({ length: 5 }).map((_, idx) => (
            <div key={idx} className="bg-white rounded-xl p-4 shadow-ambient animate-pulse">
              <div className="h-3 w-24 bg-slate-200 rounded mb-3" />
              <div className="h-7 w-16 bg-slate-300 rounded" />
            </div>
          ))
        ) : (
          <>
            <div className="bg-white rounded-xl p-4 shadow-ambient">
              <p className="text-xs text-on-secondary-container">Нийт бүртгэл</p>
              <p className="text-2xl font-black">{stats.total}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-ambient">
              <div className="flex items-center gap-2 text-error"><Clock3 size={16} /><span className="text-xs">Хүлээгдэж байна</span></div>
              <p className="text-2xl font-black">{stats.pending}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-ambient">
              <div className="flex items-center gap-2 text-primary"><CheckCircle2 size={16} /><span className="text-xs">Төлсөн</span></div>
              <p className="text-2xl font-black">{stats.paid}</p>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-ambient">
              <div className="flex items-center gap-2 text-green-700"><ShieldCheck size={16} /><span className="text-xs">Гаргахад бэлэн</span></div>
              <p className="text-2xl font-black">{stats.ready}</p>
            </div>
            <div className="bg-gradient-to-br from-primary to-primary-container rounded-xl p-4 text-white shadow-ambient">
              <div className="flex items-center gap-2"><Wallet size={16} /><span className="text-xs">Нийт орлого</span></div>
              <p className="text-2xl font-black">{formatMoney(stats.revenue)}</p>
            </div>
          </>
        )}
      </div>

      {message && <p className="text-sm font-semibold text-primary">{message}</p>}

      <section className="md:hidden space-y-3">
        {!loading && rows.length === 0 && (
          <div className="bg-white rounded-xl p-4 text-sm text-on-secondary-container shadow-ambient">Бүртгэл олдсонгүй.</div>
        )}
        {!loading && rows.map((row) => (
          <div key={`mobile-${row.id}`} className="bg-white rounded-xl p-4 shadow-ambient space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-black text-lg">{row.plate}</p>
              <span className={`px-2 py-1 rounded-full text-xs font-bold ${statusClass(row.status)}`}>
                {formatStatus(row.status)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <p className="text-on-secondary-container">Төрөл</p>
              <p className="font-semibold text-right">{row.car_type}</p>
              <p className="text-on-secondary-container">Саатуулах хашааны төлбөр</p>
              <p className="font-semibold text-right">{formatMoney(row.impound_fee)}</p>
              <p className="text-on-secondary-container">Зөөж шилжүүлсэн төлбөр</p>
              <p className="font-semibold text-right">{formatMoney(row.transfer_fee)}</p>
              <p className="text-on-secondary-container">Саатуулагдсан хоног</p>
              <p className="font-semibold text-right">{row.nights}</p>
              <p className="text-on-secondary-container">Нийт</p>
              <p className="font-black text-right">{formatMoney(row.total_amount)}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="hidden md:block bg-white rounded-xl shadow-ambient overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-low flex items-center justify-between">
          <h3 className="font-bold">Сүүлийн зөрчил бүртгэл</h3>
          <button
            onClick={() => void loadCases(true)}
            disabled={refreshing}
            className="text-xs md:text-sm px-3 py-1 bg-surface-low rounded-md inline-flex items-center gap-2 disabled:opacity-60"
          >
            {refreshing && <span className="inline-block w-4 h-4 border-2 border-slate-400/40 border-t-slate-500 rounded-full animate-spin" />}
            Дахин ачаалах
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-low">
              <tr>
                <th className="px-4 py-3 text-left">Дугаар</th>
                <th className="px-4 py-3 text-left">Төрөл</th>
                <th className="px-4 py-3 text-left">Саатуулах хашааны төлбөр</th>
                <th className="px-4 py-3 text-left">Зөөж шилжүүлсэн төлбөр</th>
                <th className="px-4 py-3 text-left">Саатуулагдсан хоног</th>
                <th className="px-4 py-3 text-left">Нийт</th>
                <th className="px-4 py-3 text-left">Төлөв</th>
                <th className="px-4 py-3 text-left">Үйлдэл</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 6 }).map((_, idx) => (
                  <tr key={`skeleton-${idx}`} className="border-t border-surface-low animate-pulse">
                    <td className="px-4 py-4"><div className="h-4 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-16 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-28 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-28 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-12 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-4"><div className="h-6 w-20 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-4"><div className="h-8 w-24 bg-slate-200 rounded-md" /></td>
                  </tr>
                ))}
              {!loading && rows.length === 0 && (
                <tr><td className="px-4 py-5 text-on-secondary-container" colSpan={8}>Бүртгэл олдсонгүй.</td></tr>
              )}
              {!loading && rows.map((row) => (
                <tr key={row.id} className="border-t border-surface-low">
                  <td className="px-4 py-4 font-bold">{row.plate}</td>
                  <td className="px-4 py-4">{row.car_type}</td>
                  <td className="px-4 py-4">{formatMoney(row.impound_fee)}</td>
                  <td className="px-4 py-4">{formatMoney(row.transfer_fee)}</td>
                  <td className="px-4 py-4">{row.nights}</td>
                  <td className="px-4 py-4 font-bold">{formatMoney(row.total_amount)}</td>
                  <td className="px-4 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${statusClass(row.status)}`}>
                      {formatStatus(row.status)}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className="text-on-secondary-container">—</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
