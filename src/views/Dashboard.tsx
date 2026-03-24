import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, ShieldCheck, Wallet } from 'lucide-react';
import { formatMoney, supabase, type ParkingCase, type UserRole } from '../lib/supabase';

interface DashboardProps {
  role: UserRole;
}

function formatStatus(status: ParkingCase['status']) {
  if (status === 'paid') return 'Төлсөн';
  if (status === 'released') return 'Машин гарсан';
  return 'Төлөөгүй';
}

function statusClass(status: ParkingCase['status']) {
  if (status === 'paid') return 'bg-indigo-100 text-indigo-700';
  if (status === 'released') return 'bg-green-100 text-green-700';
  return 'bg-red-100 text-red-700';
}

export default function Dashboard({ role }: DashboardProps) {
  const [rows, setRows] = useState<ParkingCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const loadCases = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('parking_cases')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    setLoading(false);
    if (error) {
      setMessage('Өгөгдөл ачааллахад алдаа гарлаа.');
      return;
    }
    setRows((data as ParkingCase[]) || []);
  };

  useEffect(() => {
    void loadCases();
  }, []);

  const stats = useMemo(() => {
    const total = rows.length;
    const unpaid = rows.filter((r) => r.status === 'unpaid').length;
    const paid = rows.filter((r) => r.status === 'paid').length;
    const released = rows.filter((r) => r.status === 'released').length;
    const revenue = rows
      .filter((r) => r.status === 'paid' || r.status === 'released')
      .reduce((sum, r) => sum + (r.paid_amount ?? r.total_amount), 0);
    return { total, unpaid, paid, released, revenue };
  }, [rows]);

  const markReleased = async (id: string, status: ParkingCase['status']) => {
    if (status !== 'paid') {
      setMessage('Зөвхөн төлбөр төлсөн машиныг гаргах боломжтой.');
      return;
    }
    const { error } = await supabase
      .from('parking_cases')
      .update({ status: 'released', released_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      setMessage('Машин гаргах үед алдаа гарлаа.');
      return;
    }
    setMessage('Машиныг амжилттай гаргалаа.');
    await loadCases();
  };

  return (
    <div className="p-8 space-y-8">
      <div>
        <h2 className="text-3xl font-black tracking-tight">Хяналтын самбар</h2>
        <p className="text-on-secondary-container mt-1">
          Зөрчил, төлбөр, машин гаргалтын нэгдсэн мэдээлэл.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-ambient">
          <p className="text-xs text-on-secondary-container">Нийт бүртгэл</p>
          <p className="text-2xl font-black">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-ambient">
          <div className="flex items-center gap-2 text-error"><Clock3 size={16} /><span className="text-xs">Төлөөгүй</span></div>
          <p className="text-2xl font-black">{stats.unpaid}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-ambient">
          <div className="flex items-center gap-2 text-primary"><CheckCircle2 size={16} /><span className="text-xs">Төлсөн</span></div>
          <p className="text-2xl font-black">{stats.paid}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-ambient">
          <div className="flex items-center gap-2 text-green-700"><ShieldCheck size={16} /><span className="text-xs">Машин гарсан</span></div>
          <p className="text-2xl font-black">{stats.released}</p>
        </div>
        <div className="bg-gradient-to-br from-primary to-primary-container rounded-xl p-4 text-white shadow-ambient">
          <div className="flex items-center gap-2"><Wallet size={16} /><span className="text-xs">Нийт орлого</span></div>
          <p className="text-2xl font-black">{formatMoney(stats.revenue)}</p>
        </div>
      </div>

      {message && <p className="text-sm font-semibold text-primary">{message}</p>}

      <section className="bg-white rounded-xl shadow-ambient overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-low flex items-center justify-between">
          <h3 className="font-bold">Сүүлийн зөрчил бүртгэл</h3>
          <button onClick={() => void loadCases()} className="text-sm px-3 py-1 bg-surface-low rounded-md">Дахин ачаалах</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-surface-low">
              <tr>
                <th className="px-4 py-3 text-left">Дугаар</th>
                <th className="px-4 py-3 text-left">Төрөл</th>
                <th className="px-4 py-3 text-left">Суурь торгууль</th>
                <th className="px-4 py-3 text-left">Хоног</th>
                <th className="px-4 py-3 text-left">Нийт</th>
                <th className="px-4 py-3 text-left">Төлөв</th>
                <th className="px-4 py-3 text-left">Үйлдэл</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td className="px-4 py-5 text-on-secondary-container" colSpan={7}>Уншиж байна...</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td className="px-4 py-5 text-on-secondary-container" colSpan={7}>Бүртгэл олдсонгүй.</td></tr>
              )}
              {!loading && rows.map((row) => (
                <tr key={row.id} className="border-t border-surface-low">
                  <td className="px-4 py-4 font-bold">{row.plate}</td>
                  <td className="px-4 py-4">{row.car_type}</td>
                  <td className="px-4 py-4">{formatMoney(row.base_penalty)}</td>
                  <td className="px-4 py-4">{row.nights}</td>
                  <td className="px-4 py-4 font-bold">{formatMoney(row.total_amount)}</td>
                  <td className="px-4 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${statusClass(row.status)}`}>
                      {formatStatus(row.status)}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    {role !== 'user' ? (
                      <button
                        onClick={() => void markReleased(row.id, row.status)}
                        disabled={row.status !== 'paid'}
                        className="px-3 py-1 rounded-md bg-primary text-white disabled:opacity-40"
                      >
                        Машин гаргах
                      </button>
                    ) : (
                      <span className="text-on-secondary-container">-</span>
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
