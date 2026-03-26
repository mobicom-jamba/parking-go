import { useCallback, useEffect, useMemo, useState } from 'react';
import { Wallet } from 'lucide-react';
import { formatMoney, supabase, type ParkingCase } from '../lib/supabase';
import PlateVisual from '../components/PlateVisual';

function formatStatus(status: ParkingCase['status']) {
  if (status === 'IMPOUNDED') return 'Хоригдсон';
  if (status === 'PENDING_PAYMENT') return 'Төлбөр хүлээгдэж байна';
  if (status === 'PAID') return 'Төлсөн';
  if (status === 'READY_FOR_PICKUP') return 'Бэлтгэгдсэн';
  return 'Машин гарсан';
}

function statusBadgeClass(status: ParkingCase['status']) {
  if (status === 'PENDING_PAYMENT') return 'bg-amber-100 text-amber-800';
  if (status === 'PAID') return 'bg-indigo-100 text-indigo-700';
  if (status === 'READY_FOR_PICKUP') return 'bg-green-100 text-green-700';
  if (status === 'RELEASED') return 'bg-slate-200 text-slate-700';
  return 'bg-slate-100 text-slate-700';
}

export default function WorkerQueue() {
  const [rows, setRows] = useState<ParkingCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadCases = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('parking_cases')
      .select('*')
      .in('status', ['PENDING_PAYMENT', 'PAID', 'READY_FOR_PICKUP'])
      .order('created_at', { ascending: false })
      .limit(100);

    setLoading(false);
    if (error) {
      setMessage('Төлбөрийн жагсаалт ачаалахад алдаа гарлаа.');
      return;
    }
    setRows((data as ParkingCase[]) || []);
  }, []);

  useEffect(() => {
    void loadCases();
    const channel = supabase
      .channel('parking-queue-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parking_cases' }, () => {
        void loadCases();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadCases]);

  const stats = useMemo(() => {
    const pending = rows.filter((r) => r.status === 'PENDING_PAYMENT').length;
    const paid = rows.filter((r) => r.status === 'PAID').length;
    const ready = rows.filter((r) => r.status === 'READY_FOR_PICKUP').length;
    const revenue = rows
      .filter((r) => r.status === 'PAID' || r.status === 'READY_FOR_PICKUP')
      .reduce((sum, r) => sum + r.total_amount, 0);
    return { pending, paid, ready, revenue };
  }, [rows]);

  const verifyPayment = async (id: string, status: ParkingCase['status']) => {
    if (status !== 'PENDING_PAYMENT') return;
    const pendingPayment = await supabase
      .from('payments')
      .select('id')
      .eq('case_id', id)
      .eq('payment_status', 'pending')
      .limit(1);

    if (pendingPayment.error) {
      setMessage('Төлбөрийг унших үед алдаа гарлаа.');
      return;
    }
    if (!pendingPayment.data || pendingPayment.data.length === 0) {
      setMessage('Төлбөрийн pending бичлэг олдсонгүй.');
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
      .update({
        status: 'PAID',
        status_updated_at: new Date().toISOString(),
        paid_at: new Date().toISOString(),
      })
      .eq('id', id);

    setBusyId(null);

    if (caseError) {
      setMessage('Case status шинэчлэх үед алдаа гарлаа.');
      return;
    }

    await supabase.from('audit_logs').insert({
      actor_name: 'Ажилтан',
      actor_role: 'worker',
      case_id: id,
      action: 'PAYMENT_VERIFIED',
      before_status: 'PENDING_PAYMENT',
      after_status: 'PAID',
      metadata: {},
    });

    setMessage('Төлбөр баталгаажсан.');
    await loadCases();
  };

  const markReady = async (id: string, status: ParkingCase['status']) => {
    if (status !== 'PAID') return;
    const confirmed = window.confirm('Гаргахад бэлтгэх гэж баталгаажуулах уу?');
    if (!confirmed) return;

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

    await supabase.from('audit_logs').insert({
      actor_name: 'Ажилтан',
      actor_role: 'worker',
      case_id: id,
      action: 'READY_FOR_PICKUP_SET',
      before_status: 'PAID',
      after_status: 'READY_FOR_PICKUP',
      metadata: {},
    });

    setMessage('Гаргахад бэлэн боллоо.');
    await loadCases();
  };

  const markReleased = async (id: string, status: ParkingCase['status']) => {
    if (status !== 'READY_FOR_PICKUP') return;
    setBusyId(id);
    const confirmed = window.confirm('Энэ машиныг гаргасан гэж баталгаажуулах уу?');
    if (!confirmed) {
      setBusyId(null);
      return;
    }

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

    await supabase.from('audit_logs').insert({
      actor_name: 'Ажилтан',
      actor_role: 'worker',
      case_id: id,
      action: 'CASE_RELEASED',
      before_status: 'READY_FOR_PICKUP',
      after_status: 'RELEASED',
      metadata: {},
    });

    setMessage('Машиныг амжилттай гаргалаа.');
    await loadCases();
  };

  return (
    <div className="p-4 md:p-8 space-y-6 md:space-y-8">
      <div>
        <h2 className="text-2xl md:text-3xl font-black tracking-tight">Төлбөр баталгаажуулалтын жагсаалт</h2>
        <p className="text-sm md:text-base text-on-secondary-container mt-1">
          Төлбөр хүлээгдэж буй машинуудыг баталгаажуулж, гаргахад бэлтгэн, гаргана.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-ambient">
          <p className="text-xs text-on-secondary-container">Төлбөр хүлээгдэж</p>
          <p className="text-2xl font-black">{stats.pending}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-ambient">
          <p className="text-xs text-on-secondary-container">Төлсөн</p>
          <p className="text-2xl font-black">{stats.paid}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-ambient">
          <p className="text-xs text-on-secondary-container">Гаргахад бэлэн</p>
          <p className="text-2xl font-black">{stats.ready}</p>
        </div>
        <div className="bg-gradient-to-br from-primary to-primary-container rounded-xl p-4 text-white shadow-ambient md:col-span-2 xl:col-span-2">
          <div className="flex items-center gap-2"><Wallet size={16} /><span className="text-xs">Нийт орлого</span></div>
          <p className="text-2xl font-black">{formatMoney(stats.revenue)}</p>
        </div>
      </div>

      {message && <p className="text-sm font-semibold text-primary">{message}</p>}

      <section className="md:hidden space-y-3">
        {!loading && rows.length === 0 && (
          <div className="bg-white rounded-xl p-4 text-sm text-on-secondary-container shadow-ambient">Жагсаалт хоосон байна.</div>
        )}
        {rows.map((row) => (
          <div key={`mobile-${row.id}`} className="bg-white rounded-xl p-4 shadow-ambient space-y-3">
            <div className="flex items-center justify-between">
              <PlateVisual plate={row.plate} size="sm" />
              <span className={`px-2 py-1 rounded-full text-xs font-bold ${statusBadgeClass(row.status)}`}>
                {formatStatus(row.status)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <p className="text-on-secondary-container">Төрөл</p>
              <p className="font-semibold text-right">{row.car_type}</p>
              <p className="text-on-secondary-container">Нийт</p>
              <p className="font-black text-right">{formatMoney(row.total_amount)}</p>
              <p className="text-on-secondary-container">Хоног</p>
              <p className="font-semibold text-right">{row.nights}</p>
              <p className="text-on-secondary-container">Байршил</p>
              <p className="font-semibold text-right">{row.location}</p>
            </div>

            <div className="space-y-2">
              {row.status === 'PENDING_PAYMENT' && (
                <button
                  onClick={() => void verifyPayment(row.id, row.status)}
                  disabled={busyId === row.id}
                  className="w-full px-3 py-2 rounded-lg bg-primary text-white disabled:opacity-40 inline-flex items-center justify-center gap-2"
                >
                  {busyId === row.id && <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                  Төлбөр баталгаажуулах
                </button>
              )}
              {row.status === 'PAID' && (
                <button
                  onClick={() => void markReady(row.id, row.status)}
                  disabled={busyId === row.id}
                  className="w-full px-3 py-2 rounded-lg bg-primary text-white disabled:opacity-40 inline-flex items-center justify-center gap-2"
                >
                  {busyId === row.id && <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                  Гаргахад бэлтгэх
                </button>
              )}
              {row.status === 'READY_FOR_PICKUP' && (
                <button
                  onClick={() => void markReleased(row.id, row.status)}
                  disabled={busyId === row.id}
                  className="w-full px-3 py-2 rounded-lg bg-primary text-white disabled:opacity-40 inline-flex items-center justify-center gap-2"
                >
                  {busyId === row.id && <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                  Машин гаргах
                </button>
              )}
            </div>
          </div>
        ))}
      </section>

      <section className="hidden md:block bg-white rounded-xl shadow-ambient overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-low flex items-center justify-between">
          <h3 className="font-bold">Төлбөрийн жагсаалт</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-low">
              <tr>
                <th className="px-4 py-3 text-left">Дугаар</th>
                <th className="px-4 py-3 text-left">Төрөл</th>
                <th className="px-4 py-3 text-left">Нийт</th>
                <th className="px-4 py-3 text-left">Төлөв</th>
                <th className="px-4 py-3 text-left">Үйлдэл</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <>
                  {Array.from({ length: 6 }).map((_, idx) => (
                    <tr key={`skeleton-${idx}`} className="border-t border-surface-low animate-pulse">
                      <td className="px-4 py-4"><div className="h-4 w-20 bg-slate-200 rounded" /></td>
                      <td className="px-4 py-4"><div className="h-4 w-16 bg-slate-200 rounded" /></td>
                      <td className="px-4 py-4"><div className="h-4 w-24 bg-slate-200 rounded" /></td>
                      <td className="px-4 py-4"><div className="h-6 w-24 bg-slate-200 rounded-full" /></td>
                      <td className="px-4 py-4"><div className="h-8 w-28 bg-slate-200 rounded-md" /></td>
                    </tr>
                  ))}
                </>
              )}
              {!loading &&
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-surface-low">
                    <td className="px-4 py-4">
                      <PlateVisual plate={row.plate} size="sm" />
                    </td>
                    <td className="px-4 py-4">{row.car_type}</td>
                    <td className="px-4 py-4 font-bold">{formatMoney(row.total_amount)}</td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${statusBadgeClass(row.status)}`}>
                        {formatStatus(row.status)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {row.status === 'PENDING_PAYMENT' && (
                        <button
                          onClick={() => void verifyPayment(row.id, row.status)}
                          disabled={busyId === row.id}
                          className="px-3 py-1 rounded-md bg-primary text-white disabled:opacity-40 inline-flex items-center gap-2"
                        >
                          {busyId === row.id && <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                          Төлбөр баталгаажуулах
                        </button>
                      )}
                      {row.status === 'PAID' && (
                        <button
                          onClick={() => void markReady(row.id, row.status)}
                          disabled={busyId === row.id}
                          className="px-3 py-1 rounded-md bg-primary text-white disabled:opacity-40 inline-flex items-center gap-2"
                        >
                          {busyId === row.id && <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                          Гаргахад бэлтгэх
                        </button>
                      )}
                      {row.status === 'READY_FOR_PICKUP' && (
                        <button
                          onClick={() => void markReleased(row.id, row.status)}
                          disabled={busyId === row.id}
                          className="px-3 py-1 rounded-md bg-primary text-white disabled:opacity-40 inline-flex items-center gap-2"
                        >
                          {busyId === row.id && <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                          Машин гаргах
                        </button>
                      )}
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

