
import React, { useState } from 'react';

interface LandingPageProps {
  onAnalyze: (summonerName: string, useMock: boolean) => void;
  error: string | null;
}

const LandingPage: React.FC<LandingPageProps> = ({ onAnalyze, error }) => {
  const [summonerName, setSummonerName] = useState('');
  const [useMockData, setUseMockData] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAnalyze(summonerName, useMockData);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
      <div className="max-w-2xl">
        <h1 className="text-6xl md:text-8xl font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-gray-200 to-gray-500 uppercase" style={{ textShadow: '0 0 10px rgba(205, 164, 52, 0.5)' }}>
          League-MBTI
        </h1>
        <h2 className="mt-4 text-2xl md:text-3xl text-cyan-200 tracking-wide">
          Your AI coach & chronicler — turning your 2025 ranked grind into a story of growth, triumph, and chaos.
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="mt-12 w-full max-w-lg">
        <div className="relative border-2 border-transparent p-1 bg-gradient-to-r from-[#0E3955] to-[#2D899B] rounded-sm">
           <input
            type="text"
            value={summonerName}
            onChange={(e) => setSummonerName(e.target.value)}
            placeholder="Summoner Name #TAG"
            disabled={useMockData}
            className="w-full bg-[#010A13] text-gray-200 text-2xl px-6 py-4 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#CDA434] transition-all duration-300 disabled:bg-gray-800/50 disabled:cursor-not-allowed"
          />
        </div>
        
        <div className="mt-4 flex items-center justify-center">
          <input
            id="mock-data-checkbox"
            type="checkbox"
            checked={useMockData}
            onChange={(e) => setUseMockData(e.target.checked)}
            className="w-5 h-5 accent-[#CDA434] bg-gray-700 border-gray-600 rounded focus:ring-[#CDA434] focus:ring-2"
          />
          <label htmlFor="mock-data-checkbox" className="ml-3 text-xl text-gray-300">
            Use Mock Data (No API Key needed)
          </label>
        </div>
        
        {error && <p className="text-red-400 mt-4 text-xl">{error}</p>}
        
        <button
          type="submit"
          className="mt-8 w-full text-3xl font-bold uppercase tracking-widest text-[#010A13] bg-[#CDA434] px-8 py-4 border-2 border-[#CDA434] hover:bg-transparent hover:text-[#CDA434] transition-all duration-300 ease-in-out transform hover:scale-105"
        >
          Generate My Story
        </button>
      </form>

      <footer className="absolute bottom-4 text-gray-500 text-lg">
        Not affiliated with Riot Games.
      </footer>
    </div>
  );
};

export default LandingPage;
