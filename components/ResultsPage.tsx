
import React from 'react';
import type { AnalysisResult } from '../types';
import GrowthChart from './GrowthChart';

interface ResultsPageProps {
  analysis: AnalysisResult;
  onReset: () => void;
}

const Section: React.FC<{title: string; children: React.ReactNode; className?: string}> = ({ title, children, className = '' }) => (
    <div className={`w-full max-w-7xl mx-auto py-16 px-4 md:px-8 bg-[#0A1428]/50 border border-[#2D899B]/30 backdrop-blur-sm mb-8 ${className}`}>
        <h2 className="text-5xl font-bold text-center mb-12 uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-cyan-500">{title}</h2>
        {children}
    </div>
);

const ResultsPage: React.FC<ResultsPageProps> = ({ analysis, onReset }) => {
  return (
    <div className="min-h-screen p-4 pt-24 animate-fade-in">
        <button 
          onClick={onReset} 
          className="fixed top-4 left-4 z-50 bg-[#CDA434] text-[#010A13] font-bold py-2 px-4 text-xl hover:bg-transparent hover:text-[#CDA434] border-2 border-[#CDA434] transition-all duration-300"
        >
            Analyze Another
        </button>

      {/* Archetype Section */}
      <header className="text-center mb-16">
        <h1 className="text-6xl md:text-8xl font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-gray-100 to-gray-400">{analysis.summonerName}</h1>
        <p className="text-4xl text-[#CDA434] mt-2">{analysis.archetype.title} - {analysis.archetype.mbti}</p>
      </header>

      <Section title="Your Archetype">
        <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="md:w-1/2">
                <img src={analysis.archetype.imageUrl} alt={analysis.archetype.title} className="w-full h-auto border-4 border-[#CDA434]/50" />
            </div>
            <div className="md:w-1/2">
                <p className="text-2xl text-gray-300 leading-relaxed">{analysis.archetype.description}</p>
            </div>
        </div>
      </Section>
      
      {/* Strengths Section */}
      <Section title="Core Strengths">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {analysis.strengths.map((strength, index) => (
                <div key={index} className="bg-[#010A13]/70 p-6 border border-[#CDA434]/30 text-center">
                    <div className="flex justify-center mb-4">{strength.icon}</div>
                    <h3 className="text-3xl font-semibold text-[#CDA434] mb-2">{strength.title}</h3>
                    <p className="text-xl text-gray-400">{strength.description}</p>
                </div>
            ))}
        </div>
      </Section>

      {/* Growth Curve Section */}
      <Section title="Your Growth Curve">
          <div className="h-96">
            <GrowthChart data={analysis.growthCurve} />
          </div>
      </Section>

      {/* Top Champions Section */}
      <Section title="Champion Mastery">
        <div className="space-y-8">
            {analysis.topChampions.map(champ => (
                <div key={champ.name} className="flex flex-col md:flex-row items-center gap-6 bg-[#010A13]/70 p-6 border border-[#2D899B]/20">
                    <img src={champ.imageUrl} alt={champ.name} className="w-24 h-24 border-2 border-[#CDA434]"/>
                    <div className="flex-1 text-center md:text-left">
                        <h3 className="text-4xl font-bold text-white">{champ.name}</h3>
                        <p className="text-xl text-gray-400">{champ.playstyleAnalysis}</p>
                    </div>
                    <div className="flex gap-4 md:gap-8 text-center">
                        <div>
                            <p className="text-3xl font-bold text-cyan-400">{champ.gamesPlayed}</p>
                            <p className="text-lg text-gray-500">Games</p>
                        </div>
                        <div>
                            <p className="text-3xl font-bold text-cyan-400">{champ.winRate}%</p>
                            <p className="text-lg text-gray-500">Winrate</p>
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-cyan-400">{champ.kda.split('/')[0].trim()}</p>
                            <p className="text-lg text-gray-500">KDA</p>
                        </div>
                    </div>
                </div>
            ))}
        </div>
      </Section>

       {/* Shareable Card */}
      <Section title="Share Your Legend">
        <div className="bg-gradient-to-br from-[#0A1428] to-[#010A13] border-2 border-[#CDA434] p-8 max-w-3xl mx-auto">
            <p className="text-center text-2xl text-gray-400">Your 2025 Season Story</p>
            <h3 className="text-center text-5xl font-bold text-white mt-2">{analysis.summonerName}</h3>
            <div className="mt-6 border-t-2 border-[#CDA434]/50 pt-6 flex justify-around items-center text-center">
                <div>
                    <p className="text-xl text-gray-400">Archetype</p>
                    <p className="text-3xl font-bold text-[#CDA434]">{analysis.archetype.title}</p>
                    <p className="text-2xl text-cyan-400">{analysis.archetype.mbti}</p>
                </div>
                <div>
                     <p className="text-xl text-gray-400">Top Champion</p>
                    <p className="text-3xl font-bold text-white">{analysis.topChampions[0].name}</p>
                    <p className="text-2xl text-cyan-400">{analysis.topChampions[0].winRate}% WR</p>
                </div>
            </div>
            <button className="mt-8 w-full text-2xl font-bold uppercase tracking-widest text-[#010A13] bg-[#CDA434] px-8 py-3 border-2 border-[#CDA434] hover:bg-transparent hover:text-[#CDA434] transition-all duration-300">
                Share
            </button>
        </div>
      </Section>
    </div>
  );
};

export default ResultsPage;
