import React from 'react';

type PlateVisualProps = {
  plate: string;
  size?: 'sm' | 'md';
};

import plateMongolIcon from '../assets/plate-mongol-icon.png';

function parsePlate(plate: string) {
  const value = plate.trim().toUpperCase();
  const match = value.match(/^(\d{4})\s([А-ЯӨҮЁ]{3})$/);
  if (!match) return null;
  return { digits: match[1], letters: match[2] };
}

export default function PlateVisual({ plate, size = 'md' }: PlateVisualProps) {
  const parsed = parsePlate(plate);
  if (!parsed) {
    return (
      <span className={`font-black ${size === 'sm' ? 'text-base' : 'text-lg'}`}>
        {plate}
      </span>
    );
  }

  const isSm = size === 'sm';
  const digitsClass = isSm ? 'text-[18px]' : 'text-[30px]';
  const lettersClass = isSm ? 'text-[14px]' : 'text-[22px]';

  return (
    <div
      className={[
        'relative inline-flex items-center',
        'bg-white border-[3px] border-black rounded-xl',
        'shadow-[0_6px_18px_rgba(0,0,0,0.08)]',
        isSm ? 'px-2 py-1 gap-2' : 'px-3 py-2 gap-3',
      ].join(' ')}
    >
      <div
        className="absolute top-1/2 -translate-y-1/2 bg-[#e11d48] rounded-r-lg overflow-hidden flex items-center justify-center"
        style={{ left: isSm ? 3 : 6, padding: isSm ? '0px 2px' : '2px 4px' }}
      >
        <img
          src={plateMongolIcon}
          alt="Mongol"
          className={isSm ? 'w-[16px] h-[34px] object-contain' : 'w-[28px] h-[46px] object-contain'}
        />
      </div>

      <div className={`flex flex-col leading-none pl-6`}>
        <span className={`font-black tracking-widest ${digitsClass}`}>{parsed.digits}</span>
        <span className={`font-black tracking-widest ${lettersClass}`}>{parsed.letters}</span>
      </div>

      <div className="ml-auto flex items-center pr-1">
        <div
          className={[
            'border-[3px] border-black rounded-full flex items-center justify-center font-black',
            isSm ? 'w-10 h-6 text-[10px]' : 'w-[56px] h-[34px] text-[14px]',
          ].join(' ')}
        >
          MNG
        </div>
      </div>
    </div>
  );
}

