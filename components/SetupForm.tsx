
import React, { useState } from 'react';

interface SetupFormProps {
  onStart: (name: string, playerCount: number, difficulty: 'EASY' | 'MEDIUM' | 'HARD') => void;
}

export const SetupForm: React.FC<SetupFormProps> = ({ onStart }) => {
  const [name, setName] = useState('');
  const [count, setCount] = useState(3);
  const [difficulty, setDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD'>('MEDIUM');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onStart(name, count, difficulty);
    }
  };

  return (
    <div className="max-w-md w-full mx-auto">
      <div className="bg-slate-800 p-6 sm:p-8 md:p-12 rounded-[2.5rem] shadow-2xl border border-slate-700 flex flex-col justify-center relative overflow-hidden">
        {/* Decorative elements */}
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-yellow-600/20 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-red-900/30 rounded-full blur-3xl"></div>

        <div className="flex justify-center mb-8 relative z-10">
           <div className="w-20 h-20 bg-gradient-to-br from-yellow-400 to-amber-600 rounded-2xl flex items-center justify-center border border-yellow-200 shadow-[0_15px_30px_rgba(180,83,9,0.4)] transform -rotate-3 hover:rotate-0 transition-transform duration-500">
              <span className="font-logo text-amber-950 text-5xl font-black drop-shadow-md">M</span>
           </div>
        </div>
        
        <h1 className="text-5xl font-logo text-center mb-2 text-transparent bg-clip-text bg-gradient-to-r from-yellow-200 to-yellow-500 tracking-wider uppercase relative z-10 drop-shadow-sm">Milanty</h1>
        <p className="text-center text-yellow-500/50 text-[10px] font-bold uppercase tracking-[0.4em] mb-10 relative z-10">Premium Card Strategy</p>
        
        <form onSubmit={handleSubmit} className="space-y-8 relative z-10">
          <div>
            <label className="block text-sm font-semibold mb-3 uppercase tracking-widest text-slate-400 text-xs">Player Alias</label>
            <input
              type="text"
              required
              className="w-full px-6 py-5 bg-slate-900 border-2 border-slate-700 rounded-2xl focus:border-yellow-400 outline-none transition-all text-xl placeholder:text-slate-800 text-white font-medium"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name..."
            />
          </div>
          
          <div>
            <label className="block text-sm font-semibold mb-4 uppercase tracking-widest text-slate-400 text-xs text-center">Seating Capacity</label>
            <div className="grid grid-cols-4 gap-3">
              {[3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setCount(num)}
                  className={`py-4 rounded-2xl border-2 font-black text-2xl transition-all duration-300 ${
                    count === num 
                      ? 'bg-yellow-400 border-yellow-400 text-slate-950 shadow-[0_10px_20px_rgba(234,179,8,0.3)] scale-105' 
                      : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-300'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-4 uppercase tracking-widest text-slate-400 text-xs text-center">Game Difficulty</label>
            <div className="grid grid-cols-3 gap-4">
              {(['EASY', 'MEDIUM', 'HARD'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setDifficulty(mode)}
                  className={`py-4 rounded-2xl border-2 font-black text-sm transition-all duration-300 uppercase tracking-widest ${
                    difficulty === mode 
                      ? mode === 'EASY'
                        ? 'bg-emerald-500 border-emerald-500 text-slate-950 shadow-[0_10px_20px_rgba(16,185,129,0.3)] scale-105' 
                        : mode === 'MEDIUM'
                        ? 'bg-yellow-400 border-yellow-400 text-slate-950 shadow-[0_10px_20px_rgba(234,179,8,0.3)] scale-105' 
                        : 'bg-rose-600 border-rose-600 text-white shadow-[0_10px_20px_rgba(225,29,72,0.3)] scale-105'
                      : 'bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-600 hover:text-slate-300'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-6 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-2xl transition-all shadow-xl hover:shadow-indigo-500/30 text-2xl uppercase tracking-widest transform active:scale-95 mt-4 border-b-4 border-indigo-800"
          >
            Join Table
          </button>
        </form>
      </div>
    </div>
  );
};
