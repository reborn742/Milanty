import React from 'react';

interface ModeSelectProps {
  onSelect: (mode: 'AI' | 'MULTIPLAYER') => void;
}

export const ModeSelect: React.FC<ModeSelectProps> = ({ onSelect }) => {
  return (
    <div className="max-w-md w-full mx-auto">
      <div className="bg-slate-800 p-6 sm:p-8 md:p-12 rounded-[2.5rem] shadow-2xl border border-slate-700 flex flex-col justify-center relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-yellow-600/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-red-900/30 rounded-full blur-3xl"></div>

        <div className="flex justify-center mb-8 relative z-10">
          <div className="w-20 h-20 bg-gradient-to-br from-yellow-400 to-amber-600 rounded-2xl flex items-center justify-center border border-yellow-200 shadow-[0_15px_30px_rgba(180,83,9,0.4)] transform -rotate-3 hover:rotate-0 transition-transform duration-500">
            <span className="font-logo text-amber-950 text-5xl font-black drop-shadow-md">M</span>
          </div>
        </div>

        <h1 className="text-5xl font-logo text-center mb-2 text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 to-yellow-500 tracking-wider uppercase relative z-10 drop-shadow-sm">Milanty</h1>
        <p className="text-center text-yellow-500/50 text-[10px] font-bold uppercase tracking-[0.4em] mb-10 relative z-10">Premium Card Strategy</p>

        <div className="space-y-4 relative z-10">
          <button
            onClick={() => onSelect('AI')}
            className="w-full py-6 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl transition-all shadow-xl hover:shadow-indigo-500/30 text-xl uppercase tracking-widest transform active:scale-95 border-b-4 border-indigo-800"
          >
            Play vs AI
          </button>
          <button
            onClick={() => onSelect('MULTIPLAYER')}
            className="w-full py-6 bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-black rounded-2xl transition-all shadow-xl text-xl uppercase tracking-widest transform active:scale-95 border-b-4 border-yellow-600"
          >
            Multiplayer
          </button>
        </div>
      </div>
    </div>
  );
};
