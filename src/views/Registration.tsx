import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DatePicker from 'react-datepicker';
import { ChevronDown, CheckCircle2, ImagePlus, Calculator, CircleCheckBig } from 'lucide-react';
import { CAR_TYPE_OPTIONS, supabase } from '../lib/supabase';

export default function Registration() {
  const navigate = useNavigate();
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [plate, setPlate] = useState('');
  const [vehicleType, setVehicleType] = useState<'мотоцикл' | 'суудлын' | 'жийп' | 'ачааны' | 'автобус'>('суудлын');
  const [location, setLocation] = useState<'Хэрлэн сум дотор' | 'Орон нутгаас'>('Хэрлэн сум дотор');
  const [distanceKm, setDistanceKm] = useState<number | ''>('');
  const [violationType, setViolationType] = useState('Дүрэм зөрчил');
  const [officerName, setOfficerName] = useState('Ажилтан');
  const [officerRank, setOfficerRank] = useState('Ахлах');
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
    const now = new Date();
    // Хугацааны бодол нь бүртгэсэн цагаас эхэлнэ: date picker дээрх өдрийг ашиглаад одоогийн цагийн хэсгийг залгана.
    const impoundedAt = new Date(registeredDate);
    impoundedAt.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    const elapsedMs = Math.max(0, now.getTime() - impoundedAt.getTime());
    const dayMs = 24 * 60 * 60 * 1000;
    const nights = Math.max(1, Math.floor(elapsedMs / dayMs) + 1);

    const baseDailyFee = selected?.penalty ?? 6000;
    const impoundFee = baseDailyFee * nights;
    const distanceKmNumber = typeof distanceKm === 'number' ? distanceKm : 0;
    const billedDistanceKm = location === 'Орон нутгаас' ? distanceKmNumber * 2 : 0;
    const transferFee =
      location === 'Хэрлэн сум дотор'
        ? vehicleType === 'мотоцикл'
          ? 30000
          : 60000
        : Math.round(billedDistanceKm * 2500);

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
      distance_km: distanceKmNumber,
      officer_name: officerName,
      officer_rank: officerRank,
      impounded_at: impoundedAt.toISOString(),
      status: 'IMPOUNDED',
      district: location,
    })
      .select('id')
      .single();

    setSubmitting(false);

    if (error) {
      setToast({ message: 'Бүртгэл хадгалах үед алдаа гарлаа.', type: 'error' });
      return;
    }

    const caseId = inserted?.id as string;

    const imageSides: { side: 'front' | 'back' | 'left' | 'right'; file: File | null }[] = [
      { side: 'front', file: frontImg },
      { side: 'back', file: backImg },
      { side: 'left', file: leftImg },
      { side: 'right', file: rightImg },
    ];
    const imagesToUpload = imageSides.filter((s) => s.file !== null) as { side: string; file: File }[];

    if (imagesToUpload.length > 0) {
      const uploadSide = async (side: string, file: File) => {
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
        await Promise.all(imagesToUpload.map((s) => uploadSide(s.side, s.file)));
      } catch {
        setToast({ message: 'Зургийг хадгалах үед алдаа гарлаа.', type: 'error' });
        return;
      }
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
    setDistanceKm('');
    setRegisteredDate(new Date());
    setFrontImg(null);
    setBackImg(null);
    setLeftImg(null);
    setRightImg(null);
    setSubmitMessage('');
    setToast({ message: 'Бүртгэл амжилттай хадгалагдлаа!', type: 'success' });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => {
      setToast(null);
      if (toast.type === 'success') {
        navigate('/admin/dashboard');
      }
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [toast, navigate]);

  const selectedType = CAR_TYPE_OPTIONS.find((item) => item.value === vehicleType);
  const now = new Date();
  const impoundedAtPreview = new Date(registeredDate);
  impoundedAtPreview.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  const dayMs = 24 * 60 * 60 * 1000;
  const elapsedMs = Math.max(0, now.getTime() - impoundedAtPreview.getTime());
  const nightsPreview = Math.max(1, Math.floor(elapsedMs / dayMs) + 1);

  const baseDailyFeePreview = selectedType?.penalty ?? 6000;
  const impoundFeePreview = baseDailyFeePreview * nightsPreview;
  const distanceKmNumber = typeof distanceKm === 'number' ? distanceKm : 0;
  const billedDistanceKm = location === 'Орон нутгаас' ? distanceKmNumber * 2 : 0;
  const transferFeePreview =
    location === 'Хэрлэн сум дотор' ? (vehicleType === 'мотоцикл' ? 30000 : 60000) : Math.round(billedDistanceKm * 2500);
  const totalPreview = impoundFeePreview + transferFeePreview;
  const uploadedCount = [frontImg, backImg, leftImg, rightImg].filter(Boolean).length;

  return (
    <div className="p-4 md:p-8 lg:p-10 max-w-5xl mx-auto w-full space-y-6">
      {toast && (
        <div
          className={[
            'fixed top-6 left-1/2 -translate-x-1/2 z-[999] flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl border text-base font-semibold animate-[slideDown_0.35s_ease-out]',
            toast.type === 'success'
              ? 'bg-green-50 border-green-300 text-green-800'
              : 'bg-red-50 border-red-300 text-red-800',
          ].join(' ')}
        >
          {toast.type === 'success' ? (
            <CircleCheckBig className="w-6 h-6 text-green-600 shrink-0" />
          ) : (
            <span className="w-6 h-6 text-red-600 shrink-0 font-bold text-xl leading-none">!</span>
          )}
          {toast.message}
        </div>
      )}
      <div>
        <h2 className="text-2xl md:text-3xl font-black">Зөрчил бүртгэх</h2>
        <p className="text-sm md:text-base text-on-secondary-container mt-1">
          Машины дугаар, төрөл, байршлын мэдээллийг оруулж төлбөрийг бүртгэнэ.
        </p>
      </div>

      <div className="bg-surface-low p-4 md:p-6 lg:p-8 rounded-[20px] border border-surface-high/60 shadow-sm">
        <div className="mb-5 md:mb-6 rounded-2xl bg-white border border-surface-high p-4 md:p-5">
          <div className="flex items-center gap-2 mb-3">
            <Calculator size={16} className="text-primary" />
            <p className="text-xs font-bold uppercase tracking-wider text-on-secondary-container">Урьдчилсан тооцоо</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="bg-surface-low rounded-xl p-3">
              <p className="text-xs text-on-secondary-container">Саатуулах хашааны төлбөр</p>
              <p className="font-black mt-1">{impoundFeePreview.toLocaleString('mn-MN')} ₮</p>
              <p className="text-[11px] text-on-secondary-container mt-1">{nightsPreview} хоногийн төлбөр</p>
            </div>
            <div className="bg-surface-low rounded-xl p-3">
              <p className="text-xs text-on-secondary-container">Зөөж шилжүүлсэн төлбөр</p>
              <p className="font-black mt-1">{transferFeePreview.toLocaleString('mn-MN')} ₮</p>
            </div>
            <div className="bg-primary/10 rounded-xl p-3 border border-primary/20">
              <p className="text-xs text-on-secondary-container">Нийт төлбөр</p>
              <p className="font-black mt-1 text-primary">{totalPreview.toLocaleString('mn-MN')} ₮</p>
            </div>
          </div>
          {location === 'Орон нутгаас' && (
            <p className="mt-3 text-xs text-on-secondary-container">
              Орон нутгийн тээвэрлэлтийн тооцоо: {distanceKmNumber.toLocaleString('mn-MN')} км x 2 x 2,500₮
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          <div className="space-y-2">
            <label className="text-xs font-bold text-on-secondary-container uppercase tracking-wider">Улсын дугаар</label>
            <input
              className="w-full bg-white rounded-xl p-4 text-lg font-bold outline-none border border-transparent focus:border-primary focus:ring-2 focus:ring-primary/20"
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
                onChange={(e) => setVehicleType(e.target.value as 'мотоцикл' | 'суудлын' | 'жийп' | 'ачааны' | 'автобус')}
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
            <label className="text-xs font-bold text-on-secondary-container uppercase tracking-wider">
              Хаанаас саатуулагдан
            </label>
            <div className="relative">
              <select
                className="w-full bg-white rounded-xl p-4 pr-12 outline-none border border-surface-high focus:border-primary focus:ring-2 focus:ring-primary/20 appearance-none text-on-surface font-semibold"
                value={location}
                onChange={(e) => setLocation(e.target.value as 'Хэрлэн сум дотор' | 'Орон нутгаас')}
              >
                <option value="Хэрлэн сум дотор">Хэрлэн сум дотор</option>
                <option value="Орон нутгаас">Орон нутгаас</option>
              </select>
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-on-secondary-container pointer-events-none" size={18} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-on-secondary-container uppercase tracking-wider">
              Орон нутгаас (км) / Саатуулах зай
            </label>
            <input
              className="w-full bg-white rounded-xl p-4 outline-none border border-transparent focus:border-primary focus:ring-2 focus:ring-primary/20 appearance-none disabled:bg-surface-low disabled:text-on-secondary-container disabled:cursor-not-allowed [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              type="number"
              min={0}
              placeholder={location === 'Хэрлэн сум дотор' ? 'Сум дотор' : 'Км оруулна уу'}
              value={distanceKm}
              disabled={location === 'Хэрлэн сум дотор'}
              onChange={(e) => {
                const raw = e.target.value;
                setDistanceKm(raw === '' ? '' : Number(raw));
              }}
            />
            {location === 'Орон нутгаас' && (
              <p className="text-xs text-on-secondary-container">Төлбөр бодохдоо км-ийг 2-р үржүүлж тооцно.</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-on-secondary-container uppercase tracking-wider">Бүртгэлийн огноо</label>
            <div className="w-full">
              <DatePicker
                selected={registeredDate}
                onChange={(date) => setRegisteredDate(date ?? new Date())}
                dateFormat="yyyy-MM-dd"
                wrapperClassName="!block w-full"
                className="w-full bg-white rounded-xl p-4 outline-none border border-transparent focus:border-primary focus:ring-2 focus:ring-primary/20 font-semibold"
                calendarClassName="!border-0 !shadow-xl !rounded-2xl"
                dayClassName={() => "hover:!bg-primary/10 !rounded-md"}
                popperClassName="!z-50"
                showPopperArrow={false}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-on-secondary-container uppercase tracking-wider">Зөрчлийн төрөл</label>
            <input
              className="w-full bg-white rounded-xl p-4 outline-none border border-transparent focus:border-primary focus:ring-2 focus:ring-primary/20"
              value={violationType}
              onChange={(e) => setViolationType(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-on-secondary-container uppercase tracking-wider">Офицерийн нэр</label>
            <input
              className="w-full bg-white rounded-xl p-4 outline-none border border-transparent focus:border-primary focus:ring-2 focus:ring-primary/20"
              value={officerName}
              onChange={(e) => setOfficerName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-on-secondary-container uppercase tracking-wider">Офицерийн цол/албан тушаал</label>
            <input
              className="w-full bg-white rounded-xl p-4 outline-none border border-transparent focus:border-primary focus:ring-2 focus:ring-primary/20"
              value={officerRank}
              onChange={(e) => setOfficerRank(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-on-secondary-container uppercase tracking-wider">Зөрчлийн тайлбар</label>
            <input
              className="w-full bg-white rounded-xl p-4 outline-none border border-transparent focus:border-primary focus:ring-2 focus:ring-primary/20"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-on-secondary-container uppercase tracking-wider">4 талын зураг</label>
              <span className="text-xs font-semibold text-on-secondary-container">{uploadedCount}/4 оруулсан</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className={`rounded-xl border p-3 cursor-pointer text-xs font-semibold text-center transition ${frontImg ? 'bg-green-50 border-green-300 text-green-700' : 'bg-surface-lowest border-surface-high text-on-secondary-container hover:border-primary/40'}`}>
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  {frontImg ? <CheckCircle2 size={14} /> : <ImagePlus size={14} />}
                  <span>Урд тал</span>
                </div>
                <p className="truncate text-[10px]">{frontImg?.name ?? 'Зураг сонгох'}</p>
                <input className="hidden" type="file" accept="image/*" onChange={(e) => setFrontImg(e.target.files?.[0] ?? null)} />
              </label>
              <label className={`rounded-xl border p-3 cursor-pointer text-xs font-semibold text-center transition ${backImg ? 'bg-green-50 border-green-300 text-green-700' : 'bg-surface-lowest border-surface-high text-on-secondary-container hover:border-primary/40'}`}>
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  {backImg ? <CheckCircle2 size={14} /> : <ImagePlus size={14} />}
                  <span>Хойд тал</span>
                </div>
                <p className="truncate text-[10px]">{backImg?.name ?? 'Зураг сонгох'}</p>
                <input className="hidden" type="file" accept="image/*" onChange={(e) => setBackImg(e.target.files?.[0] ?? null)} />
              </label>
              <label className={`rounded-xl border p-3 cursor-pointer text-xs font-semibold text-center transition ${leftImg ? 'bg-green-50 border-green-300 text-green-700' : 'bg-surface-lowest border-surface-high text-on-secondary-container hover:border-primary/40'}`}>
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  {leftImg ? <CheckCircle2 size={14} /> : <ImagePlus size={14} />}
                  <span>Зүүн тал</span>
                </div>
                <p className="truncate text-[10px]">{leftImg?.name ?? 'Зураг сонгох'}</p>
                <input className="hidden" type="file" accept="image/*" onChange={(e) => setLeftImg(e.target.files?.[0] ?? null)} />
              </label>
              <label className={`rounded-xl border p-3 cursor-pointer text-xs font-semibold text-center transition ${rightImg ? 'bg-green-50 border-green-300 text-green-700' : 'bg-surface-lowest border-surface-high text-on-secondary-container hover:border-primary/40'}`}>
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  {rightImg ? <CheckCircle2 size={14} /> : <ImagePlus size={14} />}
                  <span>Баруун тал</span>
                </div>
                <p className="truncate text-[10px]">{rightImg?.name ?? 'Зураг сонгох'}</p>
                <input className="hidden" type="file" accept="image/*" onChange={(e) => setRightImg(e.target.files?.[0] ?? null)} />
              </label>
            </div>
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="mt-6 w-full py-4 rounded-xl bg-gradient-to-br from-primary to-primary-container text-white font-bold text-lg disabled:opacity-70 flex items-center justify-center gap-3 shadow-lg shadow-primary/25 hover:opacity-95 active:scale-[0.99] transition"
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
