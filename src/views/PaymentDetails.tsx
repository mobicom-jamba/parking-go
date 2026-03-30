import {
  ArrowLeft,
  AlertTriangle,
  Car,
  Calendar,
  MapPin,
  CreditCard,
  CircleCheckBig
} from 'lucide-react';
import { formatMoney, supabase, type ParkingCase, CAR_TYPE_OPTIONS } from '../lib/supabase';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface PaymentDetailsProps {
  plateNumber: string;
  caseData: ParkingCase | null;
  onCaseUpdated: (id: string) => void;
  onBack: () => void;
}

export default function PaymentDetails({ plateNumber, caseData, onCaseUpdated, onBack }: PaymentDetailsProps) {
  const navigate = useNavigate();
  const [paying, setPaying] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [qpayInvoice, setQpayInvoice] = useState<{
    invoice_id: string;
    qr_text: string;
    qr_image: string;
    qPay_shortUrl?: string;
    urls?: Array<{ name: string; description?: string; logo?: string; link: string }>;
  } | null>(null);
  const [qpayError, setQpayError] = useState('');
  const [permitFile, setPermitFile] = useState<File | null>(null);
  const [permitUploading, setPermitUploading] = useState(false);
  const [permitMessage, setPermitMessage] = useState('');
  const data = caseData ?? {
    id: '',
    plate: plateNumber,
    impound_fee: 0,
    transfer_fee: 0,
    total_amount: 0,
    nights: 0,
    district: 'Тодорхойгүй',
    violation_type: '',
    violation_reason: '',
    location: '',
    distance_km: 0,
    officer_name: '',
    officer_rank: '',
    impounded_at: new Date().toISOString(),
    status: 'IMPOUNDED' as const,
    status_updated_at: new Date().toISOString(),
    paid_at: null,
    ready_for_pickup_at: null,
    released_at: null,
    worker_name: '',
    car_type: 'суудлын' as const,
  };
  const isReleased = data.status === 'RELEASED';
  const isPaid = data.status === 'PAID' || data.status === 'READY_FOR_PICKUP' || isReleased;
  const isPendingPayment = data.status === 'PENDING_PAYMENT';

  const computeNightsFromImpoundedAt = (impoundedAtIso: string) => {
    const impoundedAt = new Date(impoundedAtIso);
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    const elapsedMs = Math.max(0, now.getTime() - impoundedAt.getTime());
    // 0-24 цаг => 1 хоног, 24-48 цаг => 2 хоног гэх мэт (24 цаг дээр 2 болохоор floor + 1)
    return Math.max(1, Math.floor(elapsedMs / dayMs) + 1);
  };

  const baseDailyFee = CAR_TYPE_OPTIONS.find((x) => x.value === data.car_type)?.penalty ?? 6000;
  const computedNights = computeNightsFromImpoundedAt(data.impounded_at);
  const computedImpoundFee = baseDailyFee * computedNights;
  const computedTotalAmount = computedImpoundFee + data.transfer_fee;
  const invoiceCacheKey = caseData?.id ? `qpay-invoice:${caseData.id}` : null;

  // While waiting for payment confirmation via QPay callback,
  // periodically refresh this case so UI updates without manual reload.
  useEffect(() => {
    if (!caseData?.id) return;
    if (data.status !== 'PENDING_PAYMENT') return;

    let cancelled = false;
    const interval = setInterval(async () => {
      if (cancelled) return;
      await onCaseUpdated(caseData.id);
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [caseData?.id, data.status, onCaseUpdated]);

  // If the case leaves PENDING_PAYMENT state (paid/failed/returned),
  // clear the displayed invoice so user can retry with a new one.
  useEffect(() => {
    if (!caseData?.id) {
      setQpayInvoice(null);
      return;
    }
    if (data.status !== 'PENDING_PAYMENT') {
      setQpayInvoice(null);
    }
  }, [caseData?.id, data.status]);

  useEffect(() => {
    if (!invoiceCacheKey || qpayInvoice) return;
    if (data.status !== 'PENDING_PAYMENT') return;
    try {
      const raw = window.localStorage.getItem(invoiceCacheKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.invoice_id && parsed?.qr_text) {
        setQpayInvoice(parsed);
      }
    } catch {
      // ignore
    }
  }, [invoiceCacheKey, qpayInvoice, data.status]);

  const handlePay = async () => {
    if (!caseData?.id) return;
    if (isPaid) return;
    if (paying) return;
    if (qpayInvoice) return;

    setQpayError('');
    setPaying(true);
    try {
      const res = await fetch('/api/qpay/invoice/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: caseData.id,
          plate: caseData.plate,
          amount: computedTotalAmount,
          impoundFee: computedImpoundFee,
          nights: computedNights,
          invoiceDescription: `Parking fee for ${caseData.plate}`,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setQpayError(json?.error ?? 'QPay invoice үүсгэхэд алдаа гарлаа.');
        return;
      }

      const invoiceData = json?.invoice ?? json;
      setQpayInvoice(invoiceData);
      if (invoiceCacheKey) {
        window.localStorage.setItem(invoiceCacheKey, JSON.stringify(invoiceData));
      }
      await onCaseUpdated(caseData.id);
    } catch {
      setQpayError('Сүлжээ/серверийн алдаа гарлаа. Дахин оролдоно уу.');
    } finally {
      setPaying(false);
    }
  };

  const handleUploadPermit = async () => {
    if (!caseData?.id || !permitFile) return;
    setPermitUploading(true);
    setPermitMessage('');

    const storagePath = `${caseData.id}/permit/${Date.now()}-${permitFile.name}`;
    const { error: uploadError } = await supabase.storage.from('impound-images').upload(storagePath, permitFile, {
      contentType: permitFile.type,
      upsert: false,
    });

    if (uploadError) {
      setPermitUploading(false);
      setPermitMessage('Зөвшөөрлийн зураг хадгалахад алдаа гарлаа.');
      return;
    }

    const { error: upsertError } = await supabase.from('parking_case_images').upsert(
      {
        case_id: caseData.id,
        side: 'permit',
        storage_path: storagePath,
      },
      { onConflict: 'case_id,side' }
    );

    setPermitUploading(false);
    if (upsertError) {
      setPermitMessage('Зөвшөөрлийн зураг metadata хадгалахад алдаа гарлаа.');
      return;
    }

    setPermitMessage('Зөвшөөрлийн хуудасны зураг амжилттай хадгалагдлаа.');
  };

  const handleCheckPayment = async () => {
    if (!caseData?.id) return;
    setQpayError('');
    setCheckingPayment(true);
    try {
      const res = await fetch('/api/qpay/payment/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId: caseData.id }),
      });
      const json = await res.json();

      if (!res.ok) {
        setQpayError(json?.error ?? 'Төлбөр шалгахад алдаа гарлаа.');
        return;
      }

      await onCaseUpdated(caseData.id);

      if (json?.payment_status === 'success') {
        if (invoiceCacheKey) window.localStorage.removeItem(invoiceCacheKey);
        navigate('/payment/success');
        return;
      }

      if (json?.payment_status === 'failed') {
        setQpayError('Төлбөр амжилтгүй байна. Дахин оролдоно уу.');
        return;
      }

      setQpayError('Одоогоор төлбөр төлөгдөөгүй байна.');
    } catch {
      setQpayError('Сүлжээ/серверийн алдаа гарлаа. Дахин оролдоно уу.');
    } finally {
      setCheckingPayment(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center bg-surface">
      <nav className="flex justify-between items-center h-14 md:h-16 px-4 md:px-6 w-full max-w-md bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <button onClick={onBack} className="text-on-surface hover:text-primary transition-colors cursor-pointer">
          <ArrowLeft size={22} />
        </button>
        <span className="text-sm font-semibold text-on-surface uppercase tracking-widest">
          Төлбөр төлөх
        </span>
        <div className="w-[22px]" />
      </nav>

      <main className="w-full max-w-md px-4 md:px-6 py-6 md:py-8 flex-1 flex flex-col">
        <section className="text-center mb-6 md:mb-10">
          <div className="inline-flex items-center px-3 py-1 bg-primary/10 rounded-full mb-4">
            {isReleased || isPaid ? (
              <CircleCheckBig className="text-green-700 mr-2" size={14} />
            ) : (
              <AlertTriangle className="text-primary mr-2" size={14} />
            )}
            <span className="text-primary font-bold text-xs uppercase tracking-wider">
              {isReleased
                ? 'Машин гарсан'
                : isPaid
                  ? 'Төлбөр баталгаажсан'
                  : isPendingPayment
                    ? 'Төлбөр хүлээгдэж байна'
                    : 'Төлөөгүй'}
            </span>
          </div>
          <h2 className="text-on-secondary-container text-sm font-medium mb-1">Нийт төлөх дүн</h2>
          <div className="flex flex-col items-center">
            <span className="text-4xl md:text-5xl font-extrabold tracking-tight text-on-surface mb-2">
              {formatMoney(computedTotalAmount)}
            </span>
            <div className="h-1 w-12 bg-primary rounded-full"></div>
          </div>
        </section>

        <section className="bg-white rounded-xl p-4 md:p-6 shadow-sm mb-6 md:mb-8 space-y-5 md:space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-surface-low flex items-center justify-center">
                <Car className="text-secondary" size={20} />
              </div>
              <div>
                <p className="text-xs text-on-secondary-container uppercase tracking-wider">Улсын дугаар</p>
                <p className="text-base font-bold text-on-surface">{data.plate}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            <div className="p-4 bg-surface-low rounded-lg">
              <p className="text-[10px] text-on-secondary-container uppercase tracking-wider mb-1">Саатуулах хашааны төлбөр</p>
              <p className="text-lg font-bold text-on-surface">{formatMoney(computedImpoundFee)}</p>
            </div>
            <div className="p-4 bg-surface-low rounded-lg">
              <p className="text-[10px] text-on-secondary-container uppercase tracking-wider mb-1">Зөөж шилжүүлсэн төлбөр</p>
              <p className="text-lg font-bold text-on-surface">{formatMoney(data.transfer_fee)}</p>
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Calendar className="text-outline-variant" size={18} />
                <span className="text-sm font-medium text-on-secondary-container">Саатуулагдсан хоног</span>
              </div>
              <span className="text-sm font-bold text-on-surface">{computedNights} өдөр</span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <MapPin className="text-outline-variant" size={18} />
                <span className="text-sm font-medium text-on-secondary-container">Хаанаас саатуулагдан</span>
              </div>
              <span className="text-sm font-bold text-on-surface">{data.location}</span>
            </div>
            <div className="text-xs text-on-secondary-container">
              {data.location === 'Хэрлэн сум дотор'
                ? data.car_type === 'мотоцикл'
                  ? 'Хэрлэн сум дотор: 30,000₮'
                  : 'Хэрлэн сум дотор: 60,000₮'
                : `Орон нутгаас: ${data.distance_km.toLocaleString('mn-MN')} км × 2 × 2,500₮`}
            </div>
          </div>

          <div className="space-y-3 pt-2 rounded-xl border-2 border-primary/20 bg-primary/5 p-4">
            <p className="text-xs font-bold text-primary uppercase tracking-wider">Зөвшөөрлийн хуудасны зураг</p>
            <p className="text-sm text-on-secondary-container">Цагдаагийн газраас авсан зөвшөөрлийн хуудсаа энд оруулна уу.</p>
            <input
              className="w-full text-sm bg-white border border-surface-high rounded-lg p-2"
              type="file"
              accept="image/*"
              onChange={(e) => setPermitFile(e.target.files?.[0] ?? null)}
              disabled={permitUploading || isReleased}
            />
            <button
              onClick={() => void handleUploadPermit()}
              disabled={permitUploading || !permitFile || isReleased}
              className="w-full bg-surface-low rounded-xl py-3 font-bold text-on-surface disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            >
              {permitUploading ? (
                <>
                  <span className="inline-block w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Хадгалж байна...
                </>
              ) : (
                'Зураг оруулах'
              )}
            </button>
            {permitMessage && <p className="text-sm font-semibold text-on-secondary-container">{permitMessage}</p>}
          </div>
        </section>

        {qpayInvoice && (
          <section className="bg-white rounded-xl p-4 md:p-5 shadow-sm mb-6 md:mb-8 space-y-3 border border-surface-high/60">
            <div>
              <p className="text-sm font-bold text-green-700">Амжилттай! QPay нэхэмжлэл үүслээ.</p>
              <p className="text-xs text-on-secondary-container mt-1">QR-ийг банкны апп эсвэл дэмждэг wallet-ээр уншуулна уу.</p>
            </div>

            <div className="rounded-lg bg-surface-low p-3 space-y-1">
              <p className="text-[11px] text-on-secondary-container uppercase tracking-wider">Invoice ID</p>
              <p className="text-xs font-mono break-all text-on-surface">{qpayInvoice.invoice_id}</p>
              {qpayInvoice.qPay_shortUrl && (
                <a
                  className="text-xs font-semibold text-primary underline break-all"
                  href={qpayInvoice.qPay_shortUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {qpayInvoice.qPay_shortUrl}
                </a>
              )}
            </div>

            <div className="flex items-center justify-center">
              {qpayInvoice.qr_image ? (
                <img
                  className="w-56 max-w-full h-auto rounded-lg border border-surface-high/70 bg-white"
                  src={`data:image/png;base64,${qpayInvoice.qr_image}`}
                  alt="QPay QR"
                />
              ) : (
                <div className="w-full rounded-lg border border-surface-high/70 bg-surface-low p-3 text-xs text-on-secondary-container text-center">
                  QR мэдээлэл дутуу байна. Доорх аппын жагсаалтаар нээж төлбөрөө хийнэ үү.
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {qpayInvoice.urls?.[0]?.link && (
                <button
                  className="flex-1 min-w-[160px] bg-gradient-to-r from-primary to-primary-container text-white py-3 rounded-xl font-bold text-base shadow-lg active:scale-[0.98] transition-all duration-150 cursor-pointer hover:opacity-95"
                  onClick={() => {
                    window.location.href = qpayInvoice.urls?.[0]?.link;
                  }}
                >
                  Deeplink-ээр нээх
                </button>
              )}
              <button
                className="flex-1 min-w-[160px] bg-surface-low text-on-surface py-3 rounded-xl font-bold text-base border border-surface-high/60 active:scale-[0.98] transition-all duration-150 cursor-pointer hover:bg-surface-low/70"
                onClick={() => {
                  void navigator.clipboard?.writeText(qpayInvoice.qr_text);
                }}
              >
                QR утгыг хуулах
              </button>
            </div>

            <button
              onClick={() => void handleCheckPayment()}
              disabled={checkingPayment}
              className="w-full bg-primary text-white py-3 rounded-xl font-bold text-base shadow-lg active:scale-[0.98] transition-all duration-150 cursor-pointer hover:opacity-95 disabled:opacity-50"
            >
              {checkingPayment ? 'Шалгаж байна...' : 'Төлбөр шалгах'}
            </button>

            {!!qpayInvoice.urls?.length && (
              <div className="space-y-2">
                <p className="text-xs font-bold text-on-secondary-container uppercase tracking-wider">Бүх апп / банк</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {qpayInvoice.urls.map((item) => (
                    <button
                      key={`${item.name}-${item.link}`}
                      className="w-full bg-white border border-surface-high rounded-lg p-2 text-left hover:bg-surface-low/40 transition-colors"
                      onClick={() => {
                        window.location.href = item.link;
                      }}
                    >
                      <div className="flex items-center gap-2">
                        {item.logo ? (
                          <img src={item.logo} alt={item.name} className="w-8 h-8 rounded-md object-cover border border-surface-high" />
                        ) : (
                          <div className="w-8 h-8 rounded-md bg-surface-low border border-surface-high" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-on-surface truncate">{item.name}</p>
                          {item.description && <p className="text-[11px] text-on-secondary-container truncate">{item.description}</p>}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <div className="mt-auto pb-4 md:pb-6">
          <button
            onClick={handlePay}
            disabled={isPaid || paying}
            className="w-full bg-gradient-to-r from-primary to-primary-container text-white py-4 px-6 rounded-xl font-bold text-base shadow-lg active:scale-[0.98] transition-all duration-150 flex items-center justify-center gap-3 cursor-pointer hover:opacity-95 disabled:opacity-50"
          >
            {paying ? (
              <>
                <span className="inline-block w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                <span>Боловсруулж байна...</span>
              </>
            ) : (
              <>
                <span>
                  {isReleased ? 'Машин гарсан' : isPaid ? 'Төлбөр баталгаажсан' : 'Төлбөр төлөх'}
                </span>
                <CreditCard size={20} />
              </>
            )}
          </button>
          {qpayError && <p className="text-center text-sm font-semibold text-error mt-3 px-2">{qpayError}</p>}
          <p className="text-center text-[11px] text-on-secondary-container mt-4 px-6">
            {isReleased
              ? 'Таны машиныг гаргасан байна.'
              : isPaid
                ? 'Ажилтан машиныг гаргахад бэлтгэж байна.'
                : isPendingPayment
                  ? 'Төлбөрийг ажилтан баталгаажуулж байна.'
                  : 'Төлбөр амжилттай хийгдсэний дараа ажилтан баталгаажуулна.'}
          </p>
        </div>
      </main>
    </div>
  );
}
