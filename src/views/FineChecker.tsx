import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  ShieldCheck,
  Car,
  BadgeCheck,
  Tag,
  HelpCircle,
  ParkingCircle
} from 'lucide-react';
import { formatMoney, type ParkingCase } from '../lib/supabase';

interface FineCheckerProps {
  onSearch: (plate: string) => Promise<void>;
  onPlateSuggestions: (platePrefix: string) => Promise<ParkingCase[]>;
  onSelectCase: (item: ParkingCase) => void;
  loading: boolean;
  error: string;
}

export default function FineChecker({ onSearch, onPlateSuggestions, onSelectCase, loading, error }: FineCheckerProps) {
  const navigate = useNavigate();
  const [plateNumber, setPlateNumber] = useState('');
  const [formatError, setFormatError] = useState('');
  const [suggestions, setSuggestions] = useState<ParkingCase[]>([]);
  const [suggestionLoading, setSuggestionLoading] = useState(false);

  const PLATE_REGEX = /^\d{4}\s[А-ЯӨҮЁ]{3}$/;

  const normalizePlateInput = (value: string) => {
    const upper = value.toUpperCase();
    const stripped = upper.replace(/\s+/g, '');
    const digits = stripped.replace(/\D/g, '').slice(0, 4);
    const rawLetters = stripped.slice(digits.length).replace(/[^А-ЯӨҮЁ]/g, '').slice(0, 3);
    return rawLetters.length > 0 ? `${digits} ${rawLetters}` : digits;
  };

  const handleSearch = async () => {
    const normalized = normalizePlateInput(plateNumber);
    setPlateNumber(normalized);

    if (!PLATE_REGEX.test(normalized)) {
      setFormatError('Улсын дугаарын формат буруу байна. Жишээ: 1234 УБА');
      return;
    }

    setFormatError('');
    await onSearch(normalized);
  };

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      await handleSearch();
    }
  };

  useEffect(() => {
    const normalized = normalizePlateInput(plateNumber);
    if (!normalized.trim()) {
      setSuggestions([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      setSuggestionLoading(true);
      const results = await onPlateSuggestions(normalized);
      setSuggestions(results);
      setSuggestionLoading(false);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [plateNumber]);

  return (
    <div className="min-h-screen flex flex-col bg-surface">
      {/* TopAppBar */}
      <header className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-xl shadow-[0_4px_20px_rgba(71,85,105,0.06)]">
        <div className="flex justify-between items-center px-4 md:px-6 py-3 md:py-4 max-w-7xl mx-auto">
          <button
            onClick={() => navigate('/fine-check')}
            className="flex items-center gap-2 cursor-pointer"
            aria-label="Нүүр хуудас руу очих"
          >
            <ParkingCircle className="text-primary" size={24} />
            <span className="text-lg md:text-xl font-extrabold tracking-tighter text-primary">
              ParkCheck
            </span>
          </button>
          <div className="flex items-center gap-2 md:gap-4">
            <nav className="hidden md:flex gap-8 items-center">
              <a className="text-primary font-semibold transition-colors cursor-pointer" href="#">
                Төлбөр шалгах
              </a>
              <a className="text-slate-500 hover:bg-slate-200/50 rounded-full px-3 py-1 transition-colors cursor-pointer" href="#">
                Тусламж
              </a>
            </nav>
            <div className="hidden md:block p-2 hover:bg-slate-200/50 rounded-full transition-colors active:scale-95 cursor-pointer">
              <HelpCircle className="text-slate-500" size={22} />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow flex items-center justify-center px-4 md:px-6 pt-20 md:pt-24 pb-8 md:pb-12">
        <div className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-12 items-center">
          {/* Left Side: Editorial Headline */}
          <div className="lg:col-span-7 space-y-5 md:space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary-container text-on-secondary-container text-xs font-bold tracking-widest uppercase">
              <BadgeCheck size={14} />
              Албан ёсны систем
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-7xl font-extrabold text-on-surface tracking-tight leading-[1.1]">
              Төлбөр <span className="text-primary">шалгах</span>
            </h1>
            <p className="text-base md:text-lg text-on-secondary-container max-w-lg leading-relaxed">
              Улсын дугаараа оруулаад төлбөрийн мэдээллээ шууд шалгана уу.
            </p>
            {/* Decoration Element */}
            <div className="hidden lg:block relative h-32 w-full">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent rounded-2xl flex items-center px-8 border-l-4 border-primary">
                <Car className="text-primary/20 absolute right-8" size={72} />
                <div className="space-y-1">
                  <span className="block text-sm font-bold text-primary uppercase tracking-tighter">
                    Нийслэлийн Замын Хөдөлгөөн
                  </span>
                  <span className="block text-xs text-secondary italic">
                    Аюулгүй байдал, дэг журам, хяналт
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Interaction Card */}
          <div className="lg:col-span-5 relative">
            {/* Background Geometric Glow */}
            <div className="absolute -top-12 -right-12 w-64 h-64 bg-primary/5 rounded-full blur-3xl -z-10"></div>

            <div className="bg-white p-5 md:p-8 lg:p-10 rounded-[24px] border border-outline-variant/10 shadow-ambient">
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-secondary uppercase tracking-[0.05em]">
                    Улсын дугаар
                  </label>
                  <div className="relative group">
                    <input
                      className="w-full bg-surface-highest border-none rounded-xl px-4 md:px-6 py-4 md:py-5 text-xl md:text-2xl font-bold tracking-widest text-on-surface placeholder:text-outline-variant focus:ring-2 focus:ring-primary/40 transition-all outline-none"
                      placeholder="Жишээ: 0000 УБА"
                      type="text"
                      value={plateNumber}
                      maxLength={8}
                      onChange={(e) => {
                        setPlateNumber(normalizePlateInput(e.target.value));
                        if (formatError) setFormatError('');
                      }}
                      onKeyDown={handleKeyDown}
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-primary/40 group-focus-within:text-primary transition-colors">
                      <Tag size={28} />
                    </div>
                  </div>
                  {(suggestionLoading || suggestions.length > 0) && (
                    <div className="mt-2 bg-surface rounded-xl border border-surface-highest overflow-hidden max-h-56 overflow-y-auto">
                      {suggestionLoading && (
                        <div className="px-4 py-3 text-xs text-on-secondary-container">Хайж байна...</div>
                      )}
                      {!suggestionLoading &&
                        suggestions.map((item) => (
                          <button
                            key={item.id}
                            onClick={() => onSelectCase(item)}
                            className="w-full text-left px-4 py-3 hover:bg-surface-low transition-colors border-b last:border-b-0 border-surface-low"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-on-surface">{item.plate}</span>
                              <span className="text-xs text-on-secondary-container">{formatMoney(item.total_amount)}</span>
                            </div>
                            <p className="text-xs text-on-secondary-container mt-1">
                              {item.car_type} • {item.district}
                            </p>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={handleSearch}
                  disabled={loading}
                  className="w-full bg-gradient-to-br from-primary to-primary-container text-white py-4 md:py-5 rounded-full font-bold text-base md:text-lg flex items-center justify-center gap-3 shadow-lg shadow-primary/20 active:scale-95 transition-transform hover:opacity-95 cursor-pointer disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none disabled:from-slate-400 disabled:to-slate-500"
                >
                  {loading ? (
                    <>
                      <span className="inline-block w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Шалгаж байна...
                    </>
                  ) : (
                    <>
                      <Search size={22} />
                      Шалгах
                    </>
                  )}
                </button>
                {(formatError || error) && <p className="text-sm text-error font-semibold">{formatError || error}</p>}
              </div>
            </div>

            {/* Floating Security Element */}
            <div className="absolute -bottom-6 -left-6 bg-white p-4 rounded-xl shadow-ambient hidden md:flex items-center gap-4 animate-pulse">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <ShieldCheck className="text-primary" size={20} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-secondary uppercase tracking-widest">
                  Аюулгүй холболт
                </p>
                <p className="text-xs font-semibold text-on-surface">SSL хамгаалалттай</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-8 mt-auto bg-slate-100">
        <div className="flex flex-col md:flex-row justify-between items-center px-8 gap-4 max-w-7xl mx-auto">
          <span className="text-xs uppercase tracking-widest text-slate-500">
            © 2026 ParkCheck. Торгууль төлбөрийн нэгдсэн систем.
          </span>
          <div className="flex gap-8">
            <a className="text-xs uppercase tracking-widest text-slate-500 hover:text-primary transition-colors cursor-pointer" href="#">
              Нууцлал
            </a>
            <a className="text-xs uppercase tracking-widest text-slate-500 hover:text-primary transition-colors cursor-pointer" href="#">
              Нөхцөл
            </a>
            <a className="text-xs uppercase tracking-widest text-slate-500 hover:text-primary transition-colors cursor-pointer" href="#">
              Холбоо барих
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
