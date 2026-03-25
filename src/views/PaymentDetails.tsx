import {
  ArrowLeft,
  AlertTriangle,
  Car,
  Calendar,
  MapPin,
  CreditCard,
  CircleCheckBig
} from 'lucide-react';
import { formatMoney, supabase, type ParkingCase } from '../lib/supabase';
import { useState } from 'react';

interface PaymentDetailsProps {
  plateNumber: string;
  caseData: ParkingCase | null;
  onCaseUpdated: (id: string) => void;
  onBack: () => void;
}

export default function PaymentDetails({ plateNumber, caseData, onCaseUpdated, onBack }: PaymentDetailsProps) {
  const [paying, setPaying] = useState(false);
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

  const handlePay = async () => {
    if (!caseData?.id) return;
    if (isPaid || isPendingPayment) return;
    if (paying) return;
    setPaying(true);
    const transactionId = `mock_${Date.now()}`;

    const { error: paymentError } = await supabase.from('payments').insert({
      case_id: caseData.id,
      provider: 'qpay',
      transaction_id: transactionId,
      amount: caseData.total_amount,
      currency: 'MNT',
      payment_status: 'pending',
      paid_at: null,
      failed_at: null,
    });

    if (paymentError) {
      setPaying(false);
      return;
    }

    const { error: caseError } = await supabase
      .from('parking_cases')
      .update({
        status: 'PENDING_PAYMENT',
        status_updated_at: new Date().toISOString(),
      })
      .eq('id', caseData.id);

    setPaying(false);

    if (!caseError) {
      await supabase.from('audit_logs').insert({
        actor_name: 'Хэрэглэгч',
        actor_role: 'user',
        case_id: caseData.id,
        action: 'PAYMENT_CREATED',
        before_status: 'IMPOUNDED',
        after_status: 'PENDING_PAYMENT',
        metadata: { transaction_id: transactionId, amount: caseData.total_amount },
      });
      onCaseUpdated(caseData.id);
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
              {formatMoney(data.total_amount)}
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
              <p className="text-lg font-bold text-on-surface">{formatMoney(data.impound_fee)}</p>
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
              <span className="text-sm font-bold text-on-surface">{data.nights} өдөр</span>
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
                ? 'Хэрлэн сум дотор: 60,000₮'
                : `Орон нутгаас: ${data.distance_km.toLocaleString('mn-MN')} км × 2,500₮`}
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <p className="text-xs font-bold text-on-secondary-container uppercase tracking-wider">Зөвшөөрлийн хуудасны зураг</p>
            <input
              className="w-full text-sm"
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

        <div className="mt-auto pb-4 md:pb-6">
          <button
            onClick={handlePay}
            disabled={isPaid || isPendingPayment || paying}
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
                  {isReleased ? 'Машин гарсан' : isPaid ? 'Төлбөр баталгаажсан' : isPendingPayment ? 'Хүлээгдэж байна' : 'Төлбөр төлөх'}
                </span>
                <CreditCard size={20} />
              </>
            )}
          </button>
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
