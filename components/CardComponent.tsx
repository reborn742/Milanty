
import React from 'react';

interface CardProps {
  value?: number;
  isFaceDown: boolean;
  onClick?: () => void;
  isSelected?: boolean;
  disabled?: boolean;
}

export const CardComponent: React.FC<CardProps> = ({ 
  value, 
  isFaceDown, 
  onClick, 
  isSelected, 
  disabled 
}) => {
  return (
    <div
      onClick={!disabled ? onClick : undefined}
      className={`
        relative w-16 h-24 sm:w-20 sm:h-28 md:w-24 md:h-36 rounded-xl cursor-pointer transition-all duration-300 transform overflow-hidden
        ${isSelected ? '-translate-y-4 shadow-2xl scale-110 ring-4 ring-yellow-400' : 'hover:-translate-y-2'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${isFaceDown ? 'bg-indigo-700' : 'bg-white text-slate-900 card-shimmer'}
        flex items-center justify-center font-bold shadow-lg border-2 border-slate-700/30
      `}
    >
      {isFaceDown ? (
        <div className="w-full h-full p-1 sm:p-2 flex items-center justify-center overflow-hidden">
          <div className="w-full h-full border-4 border-indigo-400/30 rounded-lg flex items-center justify-center">
            <span className="text-indigo-300 opacity-20 text-2xl sm:text-4xl select-none">?</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center select-none w-full">
          <span className={`${value !== undefined && value >= 100 ? 'text-lg sm:text-xl md:text-2xl' : 'text-xl sm:text-2xl md:text-3xl'} font-brand whitespace-nowrap tracking-tighter leading-none`}>
            {value}
          </span>
          <div className="w-8 sm:w-10 md:w-12 h-1 bg-slate-200 mt-1 sm:mt-2 rounded-full"></div>
        </div>
      )}
    </div>
  );
};
