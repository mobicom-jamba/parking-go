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

interface PaymentDetailsProps {
  plateNumber: string;
  caseData: ParkingCase | null;
  onPaid: () => void;
  onBack: () => void;
}

export default function PaymentDetails({ plateNumber, caseData, onPaid, onBack }: PaymentDetailsProps) {
  const data = caseData ?? {
    id: '',
    plate: plateNumber,
    base_penalty: 0,
    storage_fee: 0,
    total_amount: 0,
    nights: 0,
    district: 'Тодорхойгүй',
    status: 'unpaid' as const,
    car_type: 'суудлын' as const,
  };
  const isPaid = data.status === 'paid' || data.status === 'released';

  const handlePay = async () => {
    if (!caseData?.id || isPaid) return;
    const { error } = await supabase
      .from('parking_cases')
      .update({
        status: 'paid',
        paid_amount: caseData.total_amount,
        paid_at: new Date().toISOString(),
      })
      .eq('id', caseData.id);
    if (!error) onPaid();
  };

  return (
    <div className="min-h-screen flex flex-col items-center bg-surface">
      <nav className="flex justify-between items-center h-16 px-6 w-full max-w-md bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <button onClick={onBack} className="text-on-surface hover:text-primary transition-colors cursor-pointer">
          <ArrowLeft size={22} />
        </button>
        <span className="text-sm font-semibold text-on-surface uppercase tracking-widest">
          Төлбөр төлөх
        </span>
        <div className="w-[22px]" />
      </nav>

      <main className="w-full max-w-md px-6 py-8 flex-1 flex flex-col">
        <section className="text-center mb-10">
          <div className="inline-flex items-center px-3 py-1 bg-primary/10 rounded-full mb-4">
            {isPaid ? <CircleCheckBig className="text-green-700 mr-2" size={14} /> : <AlertTriangle className="text-primary mr-2" size={14} />}
            <span className="text-primary font-bold text-xs uppercase tracking-wider">{isPaid ? 'Төлсөн' : 'Төлөөгүй'}</span>
          </div>
          <h2 className="text-on-secondary-container text-sm font-medium mb-1">Нийт төлөх дүн</h2>
          <div className="flex flex-col items-center">
            <span className="text-5xl font-extrabold tracking-tight text-on-surface mb-2">
              {formatMoney(data.total_amount)}
            </span>
            <div className="h-1 w-12 bg-primary rounded-full"></div>
          </div>
        </section>

        <section className="bg-white rounded-xl p-6 shadow-sm mb-8 space-y-6">
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

          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-surface-low rounded-lg">
              <p className="text-[10px] text-on-secondary-container uppercase tracking-wider mb-1">Суурь торгууль</p>
              <p className="text-lg font-bold text-on-surface">{formatMoney(data.base_penalty)}</p>
            </div>
            <div className="p-4 bg-surface-low rounded-lg">
              <p className="text-[10px] text-on-secondary-container uppercase tracking-wider mb-1">Хоногийн төлбөр</p>
              <p className="text-lg font-bold text-on-surface">{formatMoney(data.storage_fee)}</p>
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Calendar className="text-outline-variant" size={18} />
                <span className="text-sm font-medium text-on-secondary-container">Хоног</span>
              </div>
              <span className="text-sm font-bold text-on-surface">{data.nights} өдөр</span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <MapPin className="text-outline-variant" size={18} />
                <span className="text-sm font-medium text-on-secondary-container">Байршил</span>
              </div>
              <span className="text-sm font-bold text-on-surface">{data.district}</span>
            </div>
          </div>
        </section>

        <div className="mt-auto pb-6">
          <button
            onClick={handlePay}
            disabled={isPaid}
            className="w-full bg-gradient-to-r from-primary to-primary-container text-white py-4 px-6 rounded-xl font-bold text-base shadow-lg active:scale-[0.98] transition-all duration-150 flex items-center justify-center gap-3 cursor-pointer hover:opacity-95 disabled:opacity-50"
          >
            <span>{isPaid ? 'Төлбөр төлөгдсөн' : 'Төлбөр төлөх'}</span>
            <CreditCard size={20} />
          </button>
          <p className="text-center text-[11px] text-on-secondary-container mt-4 px-6">
            {isPaid ? 'Төлбөр амжилттай баталгаажсан.' : 'Төлбөр амжилттай болсны дараа ажилтан машиныг гаргана.'}
          </p>
        </div>
      </main>
    </div>
  );
}
