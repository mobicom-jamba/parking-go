import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bike, Bus, CheckCircle2, Car, Clock3, Eye, ShieldCheck, Truck, Wallet, X } from 'lucide-react';
import { formatMoney, supabase, type ParkingCase, type UserRole } from '../lib/supabase';
import PlateVisual from '../components/PlateVisual';

interface DashboardProps {
  role: UserRole;
}

function formatStatus(status: ParkingCase['status']) {
  if (status === 'IMPOUNDED') return 'Саатуулагдсан';
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
  return 'bg-slate-100 text-slate-400';
}

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, '0');
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const yyyy = d.getFullYear();
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${mm}/${dd}/${yyyy}, ${hh}:${min}`;
}

function carTypePillClass(carType: ParkingCase['car_type']) {
  if (carType === 'мотоцикл') return 'bg-indigo-50 text-indigo-700 border-indigo-200';
  if (carType === 'жийп') return 'bg-amber-50 text-amber-700 border-amber-200';
  if (carType === 'ачааны') return 'bg-sky-50 text-sky-700 border-sky-200';
  if (carType === 'автобус') return 'bg-rose-50 text-rose-700 border-rose-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
}

function carTypeIcon(carType: ParkingCase['car_type']) {
  if (carType === 'мотоцикл') return <Bike size={14} className="shrink-0" />;
  if (carType === 'ачааны') return <Truck size={14} className="shrink-0" />;
  if (carType === 'автобус') return <Bus size={14} className="shrink-0" />;
  // суудлын/жийп - нэг icon ашиглаж болно
  return <Car size={14} className="shrink-0" />;
}

function locationPillClass(location: string) {
  if (location === 'Хэрлэн сум дотор') return 'bg-green-50 text-green-700 border-green-200';
  if (location === 'Орон нутгаас') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
}

function violationTypePillClass(violationType: string) {
  // Зөвхөн ерөнхий өнгө ялгахад ашиглана (violation_type нь текст тул тогтмол ангилал байхгүй).
  if (violationType.includes('Хориглосон')) return 'bg-amber-50 text-amber-700 border-amber-200';
  if (violationType.includes('Зогсоолын')) return 'bg-primary/10 text-primary border-primary/20';
  return 'bg-slate-50 text-slate-700 border-slate-200';
}

interface CaseImage {
  side: string;
  url: string;
}

const SIDE_LABELS: Record<string, string> = {
  front: 'Урд тал',
  back: 'Хойд тал',
  left: 'Зүүн тал',
  right: 'Баруун тал',
};

export default function Dashboard({ role }: DashboardProps) {
  const [rows, setRows] = useState<ParkingCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detailCase, setDetailCase] = useState<ParkingCase | null>(null);
  const [detailImages, setDetailImages] = useState<CaseImage[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);

  const openDetail = async (row: ParkingCase) => {
    setDetailCase(row);
    setDetailImages([]);
    setImagesLoading(true);
    const { data: imgRows } = await supabase
      .from('parking_case_images')
      .select('side, storage_path')
      .eq('case_id', row.id);
    if (imgRows && imgRows.length > 0) {
      const urls: CaseImage[] = imgRows.map((img: { side: string; storage_path: string }) => {
        const { data } = supabase.storage.from('impound-images').getPublicUrl(img.storage_path);
        return { side: img.side, url: data.publicUrl };
      });
      setDetailImages(urls);
    }
    setImagesLoading(false);
  };

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
              <PlateVisual plate={row.plate} size="sm" />
              <span className={`px-2 py-1 rounded-full text-xs font-bold ${statusClass(row.status)}`}>
                {formatStatus(row.status)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <p className="text-on-secondary-container">Төрөл</p>
              <p className="font-semibold text-right">
                <span className={`inline-flex items-center justify-center px-2 py-1 rounded-full text-[11px] font-bold border gap-1 ${carTypePillClass(row.car_type)}`}>
                  {carTypeIcon(row.car_type)}
                  <span>{row.car_type}</span>
                </span>
              </p>
              <p className="text-on-secondary-container">Нийт</p>
              <p className="font-black text-right">{formatMoney(row.total_amount)}</p>
            </div>
            <button
              onClick={() => void openDetail(row)}
              className="w-full text-center py-2 rounded-lg bg-primary/10 text-primary text-sm font-bold hover:bg-primary/20 transition flex items-center justify-center gap-2"
            >
              <Eye size={15} />
              Дэлгэрэнгүй
            </button>
          </div>
        ))}
      </section>

      <section className="hidden md:block bg-white rounded-2xl shadow-ambient overflow-hidden border border-surface-high/60">
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
        <div className="overflow-x-auto p-2 bg-surface-low/20">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead className="bg-gradient-to-r from-surface-low/70 to-white">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-on-secondary-container whitespace-nowrap">Дугаар</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-on-secondary-container whitespace-nowrap">Төрөл</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-on-secondary-container whitespace-nowrap">Саатуулсан огноо</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-on-secondary-container whitespace-nowrap">Нийт дүн</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-on-secondary-container whitespace-nowrap">Хоног</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-on-secondary-container whitespace-nowrap">Төлөв</th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-on-secondary-container whitespace-nowrap">Үйлдэл</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 6 }).map((_, idx) => (
                  <tr key={`skeleton-${idx}`} className="border-t border-surface-low animate-pulse">
                    <td className="px-4 py-3"><div className="h-4 w-24 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-16 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-28 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-20 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-10 bg-slate-200 rounded" /></td>
                    <td className="px-4 py-3"><div className="h-6 w-20 bg-slate-200 rounded-full" /></td>
                    <td className="px-4 py-3"><div className="h-8 w-24 bg-slate-200 rounded-md mx-auto" /></td>
                  </tr>
                ))}
              {!loading && rows.length === 0 && (
                <tr><td className="px-4 py-5 text-on-secondary-container" colSpan={7}>Бүртгэл олдсонгүй.</td></tr>
              )}
              {!loading && rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-surface-low hover:bg-surface-low/40 even:bg-surface-low/15 transition-colors"
                >
                  <td className="px-4 py-3 align-middle whitespace-nowrap">
                    <PlateVisual plate={row.plate} size="sm" />
                  </td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold border gap-1.5 ${carTypePillClass(row.car_type)}`}>
                      {carTypeIcon(row.car_type)}
                      <span>{row.car_type}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap text-on-secondary-container">{formatDate(row.impounded_at)}</td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap font-bold">{formatMoney(row.total_amount)}</td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap">{row.nights}</td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${statusClass(row.status)}`}>
                      {formatStatus(row.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-middle whitespace-nowrap text-center">
                    <button
                      onClick={() => void openDetail(row)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition"
                    >
                      <Eye size={14} />
                      Дэлгэрэнгүй
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {detailCase && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setDetailCase(null)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto animate-[slideDown_0.3s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white z-10 px-6 py-4 border-b border-surface-low flex items-center justify-between rounded-t-2xl">
              <h3 className="text-lg font-black">Дэлгэрэнгүй мэдээлэл</h3>
              <button
                onClick={() => setDetailCase(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-low transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="flex items-center gap-4">
                <PlateVisual plate={detailCase.plate} />
                <div>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border gap-1.5 ${carTypePillClass(detailCase.car_type)}`}>
                    {carTypeIcon(detailCase.car_type)}
                    <span>{detailCase.car_type}</span>
                  </span>
                  <div className="mt-1">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${statusClass(detailCase.status)}`}>
                      {formatStatus(detailCase.status)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-0.5">
                  <p className="text-[11px] uppercase font-semibold text-on-secondary-container tracking-wide">Зөрчлийн төрөл</p>
                  <p className="text-sm font-bold">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${violationTypePillClass(detailCase.violation_type)}`}>
                      {detailCase.violation_type}
                    </span>
                  </p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[11px] uppercase font-semibold text-on-secondary-container tracking-wide">Зөрчлийн тайлбар</p>
                  <p className="text-sm font-semibold">{detailCase.violation_reason}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[11px] uppercase font-semibold text-on-secondary-container tracking-wide">Алба хаагч</p>
                  <p className="text-sm font-semibold flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold border bg-slate-50 text-slate-700 border-slate-200">{detailCase.officer_rank}</span>
                    {detailCase.officer_name}
                  </p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[11px] uppercase font-semibold text-on-secondary-container tracking-wide">Саатуулсан огноо</p>
                  <p className="text-sm font-semibold">{formatDate(detailCase.impounded_at)}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[11px] uppercase font-semibold text-on-secondary-container tracking-wide">Байршил</p>
                  <p className="text-sm font-bold">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${locationPillClass(detailCase.location)}`}>
                      {detailCase.location}
                    </span>
                  </p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[11px] uppercase font-semibold text-on-secondary-container tracking-wide">Зай (км)</p>
                  <p className="text-sm font-semibold">{detailCase.distance_km} км</p>
                </div>
              </div>

              <div className="bg-surface-low/40 rounded-xl p-4">
                <p className="text-[11px] uppercase font-semibold text-on-secondary-container tracking-wide mb-3">Төлбөрийн мэдээлэл</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-on-secondary-container">Саатуулах хашааны</p>
                    <p className="text-sm font-bold">{formatMoney(detailCase.impound_fee)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-on-secondary-container">Зөөж шилжүүлсэн</p>
                    <p className="text-sm font-bold">{formatMoney(detailCase.transfer_fee)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-on-secondary-container">Саатуулагдсан хоног</p>
                    <p className="text-sm font-bold">{detailCase.nights} хоног</p>
                  </div>
                  <div>
                    <p className="text-xs text-on-secondary-container">Нийт дүн</p>
                    <p className="text-lg font-black text-primary">{formatMoney(detailCase.total_amount)}</p>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-[11px] uppercase font-semibold text-on-secondary-container tracking-wide mb-3">4 талын зураг</p>
                {imagesLoading ? (
                  <div className="grid grid-cols-2 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="aspect-video bg-slate-100 rounded-xl animate-pulse" />
                    ))}
                  </div>
                ) : detailImages.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3">
                    {detailImages.map((img) => (
                      <div key={img.side} className="space-y-1">
                        <p className="text-xs font-semibold text-on-secondary-container">{SIDE_LABELS[img.side] ?? img.side}</p>
                        <img
                          src={img.url}
                          alt={SIDE_LABELS[img.side] ?? img.side}
                          className="w-full aspect-video object-cover rounded-xl border border-surface-high"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-on-secondary-container bg-surface-low/40 rounded-xl p-4 text-center">
                    Зураг оруулаагүй байна.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
