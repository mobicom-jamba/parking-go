import { useState } from 'react';
import DatePicker from 'react-datepicker';
import { CAR_TYPE_OPTIONS, supabase } from '../lib/supabase';

export default function Registration() {
  const [plate, setPlate] = useState('');
  const [vehicleType, setVehicleType] = useState<'суудлын' | 'жийп' | 'ачааны' | 'автобус'>('суудлын');
  const [district, setDistrict] = useState('Хан-Уул дүүрэг');
  const [nights, setNights] = useState(0);
  const [workerName, setWorkerName] = useState('Ажилтан');
  const [note, setNote] = useState('Зогсоолын дүрэм зөрчсөн');
  const [registeredDate, setRegisteredDate] = useState<Date>(new Date());
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');
  const [formatError, setFormatError] = useState('');

  const PLATE_REGEX = /^\d{4}\s[А-ЯӨҮЁ]{2}$/;

  const normalizePlateInput = (value: string) => {
    const upper = value.toUpperCase();
    const stripped = upper.replace(/\s+/g, '');
    const digits = stripped.replace(/\D/g, '').slice(0, 4);
    const rawLetters = stripped.slice(digits.length).replace(/[^А-ЯӨҮЁ]/g, '').slice(0, 2);
    return rawLetters.length > 0 ? `${digits} ${rawLetters}` : digits;
  };

  const handleSubmit = async () => {
    const cleanPlate = normalizePlateInput(plate);
    setPlate(cleanPlate);
    if (!PLATE_REGEX.test(cleanPlate)) {
      setFormatError('Улсын дугаар 4 тоо + 2 үсэг байх ёстой. Жишээ: 1234 УБ');
      return;
    }
    setFormatError('');

    setSubmitting(true);
    setSubmitMessage('');
    const selected = CAR_TYPE_OPTIONS.find((item) => item.value === vehicleType);

    const { error } = await supabase.from('parking_cases').insert({
      plate: cleanPlate,
      car_type: vehicleType,
      base_penalty: selected?.penalty ?? 40000,
      nights,
      district,
      worker_name: workerName,
      violation_note: note,
      status: 'unpaid',
      registered_at: registeredDate.toISOString(),
    });

    setSubmitting(false);

    if (error) {
      setSubmitMessage('Бүртгэл хадгалах үед алдаа гарлаа.');
      return;
    }

    setPlate('');
    setNights(0);
    setRegisteredDate(new Date());
    setSubmitMessage('Бүртгэл амжилттай хадгалагдлаа.');
  };

  return (
    <div className="p-10 max-w-4xl mx-auto w-full space-y-6">
      <div>
        <h2 className="text-3xl font-black">Зөрчил бүртгэх</h2>
        <p className="text-on-secondary-container mt-1">
          Машины дугаар, төрөл, хоног, байршлыг оруулж торгуулийг бүртгэнэ.
        </p>
      </div>

      <div className="bg-surface-low p-8 rounded-[20px]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <label className="text-xs font-bold text-on-secondary-container uppercase tracking-wider">Улсын дугаар</label>
            <input
              className="w-full bg-white rounded-xl p-4 text-lg font-bold outline-none"
              placeholder="Жишээ: 1234 УБ"
              type="text"
              maxLength={7}
              value={plate}
              onChange={(e) => setPlate(normalizePlateInput(e.target.value))}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-on-secondary-container uppercase tracking-wider">Машины төрөл</label>
            <select
              className="w-full bg-white rounded-xl p-4 outline-none"
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value as 'суудлын' | 'жийп' | 'ачааны' | 'автобус')}
            >
              {CAR_TYPE_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label} ({item.penalty.toLocaleString('mn-MN')} ₮)
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-on-secondary-container uppercase tracking-wider">Хадгалсан хоног</label>
            <input
              className="w-full bg-white rounded-xl p-4 outline-none"
              type="number"
              min={0}
              value={nights}
              onChange={(e) => setNights(Number(e.target.value))}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-on-secondary-container uppercase tracking-wider">Байршил</label>
            <input
              className="w-full bg-white rounded-xl p-4 outline-none"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-on-secondary-container uppercase tracking-wider">Бүртгэлийн огноо</label>
            <DatePicker
              selected={registeredDate}
              onChange={(date) => setRegisteredDate(date ?? new Date())}
              dateFormat="yyyy-MM-dd"
              className="w-full bg-white rounded-xl p-4 outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-on-secondary-container uppercase tracking-wider">Бүртгэсэн ажилтан</label>
            <input
              className="w-full bg-white rounded-xl p-4 outline-none"
              value={workerName}
              onChange={(e) => setWorkerName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-on-secondary-container uppercase tracking-wider">Зөрчлийн тайлбар</label>
            <input
              className="w-full bg-white rounded-xl p-4 outline-none"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-6 w-full py-4 rounded-xl bg-gradient-to-br from-primary to-primary-container text-white font-bold text-lg disabled:opacity-70"
        >
          {submitting ? 'Хадгалж байна...' : 'Зөрчил бүртгэх'}
        </button>
        {formatError && <p className="mt-3 text-sm font-semibold text-error">{formatError}</p>}
        {submitMessage && <p className="mt-3 text-sm font-semibold text-on-secondary-container">{submitMessage}</p>}
      </div>
    </div>
  );
}
