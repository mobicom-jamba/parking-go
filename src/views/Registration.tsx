import { useState } from 'react';
import DatePicker from 'react-datepicker';
import { ChevronDown } from 'lucide-react';
import { CAR_TYPE_OPTIONS, supabase } from '../lib/supabase';

export default function Registration() {
  const [plate, setPlate] = useState('');
  const [vehicleType, setVehicleType] = useState<'суудлын' | 'жийп' | 'ачааны' | 'автобус'>('суудлын');
  const [location, setLocation] = useState<'Хэрлэн сум дотор' | 'Орон нутгаас'>('Хэрлэн сум дотор');
  const [distanceKm, setDistanceKm] = useState(0);
  const [violationType, setViolationType] = useState('Дүрэм зөрчил');
  const [officerName, setOfficerName] = useState('Ажилтан');
  const [officerRank, setOfficerRank] = useState('Ахлах');
  const [nights, setNights] = useState(0);
  const [note, setNote] = useState('Зогсоолын дүрэм зөрчсөн');
  const [registeredDate, setRegisteredDate] = useState<Date>(new Date());
  const [frontImg, setFrontImg] = useState<File | null>(null);
  const [backImg, setBackImg] = useState<File | null>(null);
  const [leftImg, setLeftImg] = useState<File | null>(null);
  const [rightImg, setRightImg] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');
  const [formatError, setFormatError] = useState('');

  const PLATE_REGEX = /^\d{4}\s[А-ЯӨҮЁ]{3}$/;

  const normalizePlateInput = (value: string) => {
    const upper = value.toUpperCase();
    const stripped = upper.replace(/\s+/g, '');
    const digits = stripped.replace(/\D/g, '').slice(0, 4);
    const rawLetters = stripped.slice(digits.length).replace(/[^А-ЯӨҮЁ]/g, '').slice(0, 3);
    return rawLetters.length > 0 ? `${digits} ${rawLetters}` : digits;
  };

  const handleSubmit = async () => {
    const cleanPlate = normalizePlateInput(plate);
    setPlate(cleanPlate);
    if (!PLATE_REGEX.test(cleanPlate)) {
      setFormatError('Улсын дугаар 4 тоо + 3 үсэг байх ёстой. Жишээ: 1234 УБА');
      return;
    }
    setFormatError('');

    if (!frontImg || !backImg || !leftImg || !rightImg) {
      setSubmitMessage('4 талын зураг (урд/хойд/зүүн/баруун) бүгдийг сонгоно уу.');
      return;
    }

    setSubmitting(true);
    setSubmitMessage('');
    const selected = CAR_TYPE_OPTIONS.find((item) => item.value === vehicleType);
    const impoundFee = selected?.penalty ?? 8000;
    const transferFee = location === 'Хэрлэн сум дотор' ? 60000 : Math.round(distanceKm * 2500);

    const { data: inserted, error } = await supabase
      .from('parking_cases')
      .insert({
      plate: cleanPlate,
      car_type: vehicleType,
      impound_fee: impoundFee,
      transfer_fee: transferFee,
      nights,
      worker_name: 'Ажилтан',
      violation_type: violationType,
      violation_reason: note,
      location,
      distance_km: distanceKm,
      officer_name: officerName,
      officer_rank: officerRank,
      impounded_at: registeredDate.toISOString(),
      status: 'IMPOUNDED',
      district: location,
    })
      .select('id')
      .single();

    setSubmitting(false);

    if (error) {
      setSubmitMessage('Бүртгэл хадгалах үед алдаа гарлаа.');
      return;
    }

    const caseId = inserted?.id as string;

    const uploadSide = async (side: 'front' | 'back' | 'left' | 'right', file: File) => {
      const storagePath = `${caseId}/${side}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from('impound-images').upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const { error: imgError } = await supabase.from('parking_case_images').insert({
        case_id: caseId,
        side,
        storage_path: storagePath,
      });
      if (imgError) throw imgError;
    };

    try {
      await Promise.all([
        uploadSide('front', frontImg),
        uploadSide('back', backImg),
        uploadSide('left', leftImg),
        uploadSide('right', rightImg),
      ]);
    } catch {
      setSubmitMessage('Зургийг хадгалах үед алдаа гарлаа.');
      return;
    }

    await supabase.from('audit_logs').insert({
      actor_name: officerName,
      actor_role: 'worker',
      case_id: caseId,
      action: 'CASE_REGISTERED',
      before_status: null,
      after_status: 'IMPOUNDED',
      metadata: { plate: cleanPlate, car_type: vehicleType },
    });

    setPlate('');
    setNights(0);
    setRegisteredDate(new Date());
    setSubmitMessage('Бүртгэл амжилттай хадгалагдлаа.');
    setFrontImg(null);
    setBackImg(null);
    setLeftImg(null);
    setRightImg(null);
  };

  return (
    <div className="p-4 md:p-10 max-w-4xl mx-auto w-full space-y-6">
      <div>
        <h2 className="text-2xl md:text-3xl font-black">Зөрчил бүртгэх</h2>
        <p className="text-sm md:text-base text-on-secondary-container mt-1">
          Машины дугаар, төрөл, хоног, байршлыг оруулж торгуулийг бүртгэнэ.
        </p>
      </div>

      <div className="bg-surface-low p-4 md:p-8 rounded-[20px]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <label className="text-xs font-bold text-on-secondary-container uppercase tracking-wider">Улсын дугаар</label>
            <input
              className="w-full bg-white rounded-xl p-4 text-lg font-bold outline-none"
              placeholder="Жишээ: 1234 УБА"
              type="text"
              maxLength={8}
              value={plate}
              onChange={(e) => setPlate(normalizePlateInput(e.target.value))}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-on-secondary-container uppercase tracking-wider">Машины төрөл</label>
            <div className="relative">
              <select
                className="w-full bg-white rounded-xl p-4 pr-12 outline-none border border-surface-high focus:border-primary focus:ring-2 focus:ring-primary/20 appearance-none text-on-surface font-semibold"
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value as 'суудлын' | 'жийп' | 'ачааны' | 'автобус')}
              >
                {CAR_TYPE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label} ({item.penalty.toLocaleString('mn-MN')} ₮)
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-on-secondary-container pointer-events-none" size={18} />
            </div>
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
            <label className="text-xs font-bold text-on-secondary-container uppercase tracking-wider">
              Хаанаас саатуулагдан
            </label>
            <select
              className="w-full bg-white rounded-xl p-4 outline-none border border-surface-high focus:border-primary focus:ring-2 focus:ring-primary/20 appearance-none"
              value={location}
              onChange={(e) => setLocation(e.target.value as 'Хэрлэн сум дотор' | 'Орон нутгаас')}
            >
              <option value="Хэрлэн сум дотор">Хэрлэн сум дотор</option>
              <option value="Орон нутгаас">Орон нутгаас</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-on-secondary-container uppercase tracking-wider">
              Орон нутгаас (км) / Саатуулах зай
            </label>
            <input
              className="w-full bg-white rounded-xl p-4 outline-none"
              type="number"
              min={0}
              value={distanceKm}
              disabled={location === 'Хэрлэн сум дотор'}
              onChange={(e) => setDistanceKm(Number(e.target.value))}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-on-secondary-container uppercase tracking-wider">Бүртгэлийн огноо</label>
            <DatePicker
              selected={registeredDate}
              onChange={(date) => setRegisteredDate(date ?? new Date())}
              dateFormat="yyyy-MM-dd"
              className="w-full bg-white rounded-xl p-4 outline-none border border-surface-high focus:border-primary focus:ring-2 focus:ring-primary/20"
              calendarClassName="!border-0 !shadow-xl !rounded-2xl"
              dayClassName={() => "hover:!bg-primary/10 !rounded-md"}
              popperClassName="!z-50"
              showPopperArrow={false}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-on-secondary-container uppercase tracking-wider">Зөрчлийн төрөл</label>
            <input
              className="w-full bg-white rounded-xl p-4 outline-none"
              value={violationType}
              onChange={(e) => setViolationType(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-on-secondary-container uppercase tracking-wider">Офицерийн нэр</label>
            <input
              className="w-full bg-white rounded-xl p-4 outline-none"
              value={officerName}
              onChange={(e) => setOfficerName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-on-secondary-container uppercase tracking-wider">Офицерийн цол/албан тушаал</label>
            <input
              className="w-full bg-white rounded-xl p-4 outline-none"
              value={officerRank}
              onChange={(e) => setOfficerRank(e.target.value)}
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

          <div className="space-y-2 md:col-span-2">
            <label className="text-xs font-bold text-on-secondary-container uppercase tracking-wider">4 талын зураг</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className="bg-surface-lowest rounded-xl border border-surface-high p-3 cursor-pointer text-xs font-semibold text-on-secondary-container text-center">
                Урд тал
                <input className="hidden" type="file" accept="image/*" onChange={(e) => setFrontImg(e.target.files?.[0] ?? null)} />
              </label>
              <label className="bg-surface-lowest rounded-xl border border-surface-high p-3 cursor-pointer text-xs font-semibold text-on-secondary-container text-center">
                Хойд тал
                <input className="hidden" type="file" accept="image/*" onChange={(e) => setBackImg(e.target.files?.[0] ?? null)} />
              </label>
              <label className="bg-surface-lowest rounded-xl border border-surface-high p-3 cursor-pointer text-xs font-semibold text-on-secondary-container text-center">
                Зүүн тал
                <input className="hidden" type="file" accept="image/*" onChange={(e) => setLeftImg(e.target.files?.[0] ?? null)} />
              </label>
              <label className="bg-surface-lowest rounded-xl border border-surface-high p-3 cursor-pointer text-xs font-semibold text-on-secondary-container text-center">
                Баруун тал
                <input className="hidden" type="file" accept="image/*" onChange={(e) => setRightImg(e.target.files?.[0] ?? null)} />
              </label>
            </div>
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-6 w-full py-4 rounded-xl bg-gradient-to-br from-primary to-primary-container text-white font-bold text-lg disabled:opacity-70 flex items-center justify-center gap-3"
        >
          {submitting ? (
            <>
              <span className="inline-block w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Хадгалж байна...
            </>
          ) : (
            'Зөрчил бүртгэх'
          )}
        </button>
        {formatError && <p className="mt-3 text-sm font-semibold text-error">{formatError}</p>}
        {submitMessage && <p className="mt-3 text-sm font-semibold text-on-secondary-container">{submitMessage}</p>}
      </div>
    </div>
  );
}
