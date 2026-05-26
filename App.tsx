
import React, { useState, useEffect, useRef } from 'react';
import LandingPage from './components/LandingPage';
import LoadingScreen from './components/LoadingScreen';
import ResultsPage from './components/ResultsPage';
import { analyzePlayerProgressive, type AnalysisHandle } from './services/riotApiService';
import { analyzePlayerMock } from './services/mockAnalyticsService';
import type { AnalysisResult } from './types';
import {
  toSerializableReport,
  fromSerializableReport,
  saveReport,
  loadReport,
  getEmbeddedReport,
  cacheReport,
} from './services/reportService';

type View = 'landing' | 'loading' | 'results' | 'loading-report';

const App: React.FC = () => {
  const [view, setView] = useState<View>('landing');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summonerName, setSummonerName] = useState<string>('');
  const [reportId, setReportId] = useState<string | null>(null);
  const [isMock, setIsMock] = useState<boolean>(false);

  // Progressive loading state
  const [analysisHandle, setAnalysisHandle] = useState<AnalysisHandle | null>(null);

  // ---------------------------------------------------------------------------
  // On mount: check for SSR-embedded data or /report/{id} in the URL
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // Priority 1: SSR-embedded report JSON (injected by functions/report/[id].ts)
    const embedded = getEmbeddedReport();
    if (embedded) {
      cacheReport(embedded); // seed cache for back/forward
      const result = fromSerializableReport(embedded);
      setAnalysis(result);
      setSummonerName(embedded.summonerName);
      setReportId(embedded.id);
      setView('results');
      return;
    }

    // Priority 2: URL path /report/{id} — fetch from KV API
    const match = window.location.pathname.match(/^\/report\/([a-f0-9]+)$/i);
    if (match) {
      const id = match[1];
      setView('loading-report');
      loadReport(id)
        .then((report) => {
          if (report) {
            const result = fromSerializableReport(report);
            setAnalysis(result);
            setSummonerName(report.summonerName);
            setReportId(report.id);
            setView('results');
          } else {
            setError('Report not found. It may have expired.');
            setView('landing');
            window.history.replaceState({}, '', '/');
          }
        })
        .catch(() => {
          setError('Failed to load report.');
          setView('landing');
          window.history.replaceState({}, '', '/');
        });
      return;
    }

    // Priority 3: landing page (default)
  }, []);

  // ---------------------------------------------------------------------------
  // Handle browser back/forward navigation
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handlePopState = () => {
      const match = window.location.pathname.match(/^\/report\/([a-f0-9]+)$/i);
      if (match) {
        const id = match[1];
        if (reportId === id && analysis) return;
        setView('loading-report');
        loadReport(id)
          .then((report) => {
            if (report) {
              setAnalysis(fromSerializableReport(report));
              setSummonerName(report.summonerName);
              setReportId(report.id);
              setView('results');
            } else {
              handleReset();
            }
          })
          .catch(() => handleReset());
      } else {
        handleReset();
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [reportId, analysis]);

  // ---------------------------------------------------------------------------
  // Analysis flow — show first page immediately, auto-drain rest in background
  // ---------------------------------------------------------------------------
  const drainAbortRef = useRef(false); // lets us cancel the loop on reset

  const handleAnalysis = async (summoner: string, useMock: boolean) => {
    if (!useMock && (!summoner.trim() || !summoner.includes('#'))) {
        setError('Please enter a valid Summoner Name#Tag for live analysis.');
        return;
    }
    drainAbortRef.current = false; // allow a fresh drain
    setSummonerName(useMock ? 'Prototype#NA1' : summoner);
    setIsMock(useMock);
    setView('loading');
    setError(null);
    try {
      let result: AnalysisResult;
      if (useMock) {
        result = await analyzePlayerMock(summoner);
        setAnalysis(result);
        setAnalysisHandle(null);
      } else {
        const handle = await analyzePlayerProgressive(summoner);
        result = handle.result;
        setAnalysis(result);
        setAnalysisHandle(handle);

        // Background: auto-drain all remaining pages without blocking the UI.
        // Each page updates analysis state live as it comes in.
        if (handle.hasMore) {
          (async () => {
            let current = handle;
            while (current.hasMore && !drainAbortRef.current) {
              const updated = await current.loadMore();
              if (!updated || drainAbortRef.current) break;
              setAnalysis(updated);
              // loadMore mutates the closure inside the handle — keep same ref
            }
            // All pages loaded — clear handle so "Load More" button disappears
            if (!drainAbortRef.current) {
              setAnalysisHandle(prev => prev ? { ...prev, hasMore: false } : null);
            }
          })();
        }
      }

      // Save to KV for sharing (non-blocking)
      try {
        const serializable = toSerializableReport(result, '');
        const { id } = await saveReport(serializable);
        setReportId(id);
        window.history.pushState({ reportId: id }, '', `/report/${id}`);
      } catch (saveErr) {
        console.warn('[App] Failed to save report to KV (sharing disabled):', saveErr);
      }

      setTimeout(() => setView('results'), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
      setView('landing');
    }
  };

  // loadMore callback (manual button still works as a fallback)
  const handleLoadMore = async () => {
    if (!analysisHandle?.hasMore) return;
    const updated = await analysisHandle.loadMore();
    if (updated) {
      setAnalysis(updated);
    }
  };


  const handleTimeout = () => {
    setError('Request timed out. Please try again.');
    setView('landing');
  };

  const handleReset = () => {
    drainAbortRef.current = true; // cancel any in-progress background drain
    setView('landing');
    setAnalysis(null);
    setAnalysisHandle(null);
    setError(null);
    setSummonerName('');
    setReportId(null);
    window.history.pushState({ home: true }, '', '/');
  };

  const renderContent = () => {
    switch (view) {
      case 'loading':
        return <LoadingScreen summonerName={summonerName} onTimeout={handleTimeout} />;
      case 'loading-report':
        return <LoadingScreen summonerName="Loading report..." onTimeout={handleTimeout} />;
      case 'results':
        return analysis ? (
          <ResultsPage
            analysis={analysis}
            onReset={handleReset}
            reportId={reportId}
            hasMore={analysisHandle?.hasMore ?? false}
            loadedMatchCount={analysisHandle?.loadedMatchCount ?? analysis.matchData.length}
            onLoadMore={handleLoadMore}
            isMockData={isMock}
          />
        ) : <LoadingScreen summonerName={summonerName} onTimeout={handleTimeout} />;
      case 'landing':
      default:
        return <LandingPage onAnalyze={handleAnalysis} error={error} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#010A13] text-gray-200">
      <div className="relative isolate min-h-screen">
        <div 
          className="absolute inset-0 -z-10 bg-cover bg-center bg-no-repeat" 
          style={{backgroundImage: "url('https://images.contentstack.io/v3/assets/blt731acb42bb3d1659/blt845c476de86f39e3/637e73501f2f2510b64e53de/112422_Summoners_Rift_Update_Banner.jpg')"}}
        ></div>
        <div className="absolute inset-0 -z-10 bg-black/70 backdrop-blur-sm"></div>
        {renderContent()}
      </div>
    </div>
  );
};

export default App;
