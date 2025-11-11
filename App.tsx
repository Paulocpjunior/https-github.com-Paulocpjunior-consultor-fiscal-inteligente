
import React, { useState, useCallback, useRef, useEffect } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import LoadingSpinner from './components/LoadingSpinner';
import ComparisonDisplay from './components/ComparisonDisplay';
import { SearchType, type SearchResult, type ComparisonResult } from './types';
import { fetchFiscalData, fetchComparison } from './services/geminiService';

const SearchIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const InitialStateDisplay: React.FC<{ searchType: SearchType, mode: 'single' | 'compare' }> = ({ searchType, mode }) => (
    <div className="text-center p-8 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
        <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">Pronto para começar?</h3>
        <p className="mt-2 text-slate-500 dark:text-slate-400">
            {mode === 'single'
                ? `Digite um código ou descrição de ${searchType} no campo de busca acima para obter uma análise detalhada.`
                : `Digite dois códigos ${searchType} nos campos acima para comparar.`
            }
        </p>
    </div>
);

const FormattedText: React.FC<{ text: string }> = ({ text }) => {
    return (
        <>
            {text.split('\n').map((line, index) => {
                if (line.startsWith('**') && line.endsWith('**')) {
                    return <h3 key={index} className="text-lg font-semibold text-slate-800 dark:text-slate-100 mt-4 mb-2">{line.replaceAll('**', '')}</h3>;
                }
                if (line.startsWith('* ')) {
                    return <li key={index} className="ml-5 list-disc">{line.substring(2)}</li>;
                }
                return <p key={index} className="my-1">{line}</p>;
            })}
        </>
    );
};

const ResultsDisplay: React.FC<{ result: SearchResult | null; error: string | null; onStartCompare: () => void; }> = ({ result, error, onStartCompare }) => {
    if (error) {
        return (
            <div className="mt-6 p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30 rounded-lg text-red-700 dark:text-red-300">
                <p className="font-semibold">Ocorreu um erro</p>
                <p>{error}</p>
            </div>
        );
    }

    if (!result) {
        return null;
    }

    return (
        <div className="mt-6 p-6 bg-white dark:bg-slate-800 rounded-lg shadow-sm animate-fade-in">
            <div className="prose prose-slate dark:prose-invert max-w-none text-slate-600 dark:text-slate-300">
                <FormattedText text={result.text} />
            </div>
            
            <div className="mt-6 flex flex-col sm:flex-row gap-4">
                <button
                    onClick={onStartCompare}
                    className="w-full sm:w-auto px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 transition-colors"
                >
                    Comparar este código
                </button>
            </div>

            {result.sources && result.sources.length > 0 && (
                <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
                    <h4 className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-2">Fontes consultadas:</h4>
                    <ul className="space-y-1">
                        {result.sources.map((source, index) => (
                            <li key={index}>
                                <a
                                    href={source.web.uri}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sky-600 dark:text-sky-400 hover:underline text-sm truncate"
                                    title={source.web.title}
                                >
                                    {source.web.title || source.web.uri}
                                </a>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

const popularCfops = [
  { code: '5102', description: 'Venda de mercadoria adquirida ou recebida de terceiros' },
  { code: '1102', description: 'Compra para comercialização' },
  { code: '5405', description: 'Venda de mercadoria (Substituição Tributária)' },
  { code: '1403', description: 'Compra de mercadoria (Substituição Tributária)' },
  { code: '5949', description: 'Outra saída de mercadoria não especificada' },
];

const popularNcms = [
  { code: '8517.12.31', description: 'Telefones celulares (Smartphones)' },
  { code: '8703.23.10', description: 'Automóveis de passageiros' },
  { code: '3004.90.39', description: 'Medicamentos' },
  { code: '0201.30.00', description: 'Carne bovina, fresca ou refrigerada' },
  { code: '6403.99.90', description: 'Calçados' },
];

type AppMode = 'single' | 'compare';

const App: React.FC = () => {
  const [searchType, setSearchType] = useState<SearchType>(SearchType.CFOP);
  const [mode, setMode] = useState<AppMode>('single');
  
  // State for single search
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  
  // State for comparison search
  const [query1, setQuery1] = useState('');
  const [query2, setQuery2] = useState('');
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);

  // Common state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // State for suggestions UI
  const [suggestions, setSuggestions] = useState<{code: string, description: string}[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestionBox, setActiveSuggestionBox] = useState<number | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const clearState = () => {
    setResult(null);
    setComparisonResult(null);
    setError(null);
    setShowSuggestions(false);
  };

  const handleModeChange = (newMode: AppMode) => {
    setMode(newMode);
    clearState();
  };
  
  const handleTypeChange = (type: SearchType) => {
    setSearchType(type);
    setQuery('');
    setQuery1('');
    setQuery2('');
    clearState();
  }

  const handleSingleSearch = useCallback(async (e?: React.FormEvent<HTMLFormElement>, directQuery?: string) => {
    e?.preventDefault();
    const currentQuery = directQuery || query;
    if (!currentQuery.trim() || isLoading) return;

    setShowSuggestions(false);
    setIsLoading(true);
    clearState();

    try {
      const data = await fetchFiscalData(searchType, currentQuery);
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ocorreu um erro inesperado.');
    } finally {
      setIsLoading(false);
    }
  }, [query, searchType, isLoading]);

  const handleComparisonSearch = useCallback(async (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    if (!query1.trim() || !query2.trim() || isLoading) return;

    setIsLoading(true);
    clearState();

    try {
        const data = await fetchComparison(searchType, query1, query2);
        setComparisonResult(data);
    } catch(err: unknown) {
        setError(err instanceof Error ? err.message : 'Ocorreu um erro inesperado.');
    } finally {
        setIsLoading(false);
    }
  }, [query1, query2, searchType, isLoading]);


  const getPlaceholder = (index: number = 0) => {
    const cfopEx = index === 0 ? "Ex: 5102 ou 'venda'" : "Ex: 1102 ou 'compra'";
    const ncmEx = index === 0 ? "Ex: 8517.12.31" : "Ex: 8703.23.10";
    return searchType === SearchType.CFOP ? cfopEx : ncmEx;
  };
  
  const handleStartCompare = () => {
    setMode('compare');
    setQuery1(result?.query || '');
    setQuery2('');
    clearState();
    // A small delay to allow the UI to update before focusing
    setTimeout(() => {
        const input2 = document.getElementById('compare-input-2');
        input2?.focus();
    }, 100);
  };

  const handleInputChange = (value: string, inputIndex: number) => {
    if (mode === 'single') {
        setQuery(value);
    } else {
        if (inputIndex === 1) setQuery1(value);
        if (inputIndex === 2) setQuery2(value);
    }
    
    const source = searchType === SearchType.CFOP ? popularCfops : popularNcms;
    const lowerCaseValue = value.toLowerCase();

    if (lowerCaseValue.trim() === '') {
        setSuggestions(source);
    } else {
        const startsWith = source.filter(item => item.code.startsWith(lowerCaseValue) || item.description.toLowerCase().startsWith(lowerCaseValue));
        const includes = source.filter(item => !startsWith.includes(item) && (item.code.includes(lowerCaseValue) || item.description.toLowerCase().includes(lowerCaseValue)));
        setSuggestions([...startsWith, ...includes]);
    }
    
    setShowSuggestions(true);
    setActiveSuggestionBox(inputIndex);
  };
  
  const handleSuggestionClick = (suggestionCode: string) => {
    if (activeSuggestionBox === 0) { // Single search
        setQuery(suggestionCode);
        handleSingleSearch(undefined, suggestionCode);
    } else if (activeSuggestionBox === 1) {
        setQuery1(suggestionCode);
    } else if (activeSuggestionBox === 2) {
        setQuery2(suggestionCode);
    }
    setShowSuggestions(false);
    setActiveSuggestionBox(null);
  };
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center p-4 antialiased text-slate-800 dark:text-slate-200">
      <main className="w-full max-w-4xl mx-auto flex-grow">
        <Header />
        
        <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-xl shadow-md">
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 mb-4">
                {/* Mode Tabs */}
                <div className="flex">
                    <button onClick={() => handleModeChange('single')} className={`px-4 py-2 text-sm font-medium transition-colors duration-200 ${mode === 'single' ? 'border-b-2 border-sky-500 text-sky-600 dark:text-sky-400' : 'text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400'}`}>
                        Consulta Única
                    </button>
                    <button onClick={() => handleModeChange('compare')} className={`px-4 py-2 text-sm font-medium transition-colors duration-200 ${mode === 'compare' ? 'border-b-2 border-sky-500 text-sky-600 dark:text-sky-400' : 'text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400'}`}>
                        Comparar Códigos
                    </button>
                </div>
                {/* Search Type Toggle */}
                <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-1 text-sm">
                    <button onClick={() => handleTypeChange(SearchType.CFOP)} className={`px-3 py-1 rounded-md transition-colors ${searchType === SearchType.CFOP ? 'bg-white dark:bg-slate-600 shadow' : ''}`}>CFOP</button>
                    <button onClick={() => handleTypeChange(SearchType.NCM)} className={`px-3 py-1 rounded-md transition-colors ${searchType === SearchType.NCM ? 'bg-white dark:bg-slate-600 shadow' : ''}`}>NCM</button>
                </div>
            </div>

            <div ref={searchContainerRef} className="relative">
                {mode === 'single' ? (
                    <form onSubmit={handleSingleSearch} className="flex items-center gap-2">
                         <div className="relative flex-grow">
                            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                            <input type="text" value={query} onChange={(e) => handleInputChange(e.target.value, 0)} onFocus={() => handleInputChange(query, 0)} autoComplete="off" placeholder={getPlaceholder()} className="w-full pl-10 pr-4 py-2.5 text-base bg-slate-100 dark:bg-slate-700 rounded-lg border-2 border-transparent focus:outline-none focus:ring-2 focus:ring-sky-500 transition"/>
                        </div>
                        <button type="submit" disabled={isLoading || !query.trim()} className="px-5 py-2.5 bg-sky-600 text-white font-semibold rounded-lg hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 disabled:bg-slate-400 dark:disabled:bg-slate-600 transition-colors">
                            {isLoading ? 'Buscando...' : 'Buscar'}
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleComparisonSearch}>
                        <div className="flex flex-col sm:flex-row items-center gap-2">
                            <div className="relative flex-grow w-full">
                                <input type="text" id="compare-input-1" value={query1} onChange={(e) => handleInputChange(e.target.value, 1)} onFocus={() => handleInputChange(query1, 1)} autoComplete="off" placeholder={`Código ${searchType} 1: ${getPlaceholder(0)}`} className="w-full px-4 py-2.5 text-base bg-slate-100 dark:bg-slate-700 rounded-lg border-2 border-transparent focus:outline-none focus:ring-2 focus:ring-sky-500 transition"/>
                            </div>
                            <span className="text-slate-400 font-semibold hidden sm:block">vs</span>
                            <div className="relative flex-grow w-full">
                                <input type="text" id="compare-input-2" value={query2} onChange={(e) => handleInputChange(e.target.value, 2)} onFocus={() => handleInputChange(query2, 2)} autoComplete="off" placeholder={`Código ${searchType} 2: ${getPlaceholder(1)}`} className="w-full px-4 py-2.5 text-base bg-slate-100 dark:bg-slate-700 rounded-lg border-2 border-transparent focus:outline-none focus:ring-2 focus:ring-sky-500 transition"/>
                            </div>
                            <button type="submit" disabled={isLoading || !query1.trim() || !query2.trim()} className="w-full sm:w-auto px-5 py-2.5 bg-sky-600 text-white font-semibold rounded-lg hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 disabled:bg-slate-400 dark:disabled:bg-slate-600 transition-colors">
                                {isLoading ? 'Comparando...' : 'Comparar'}
                            </button>
                        </div>
                    </form>
                )}
                {showSuggestions && suggestions.length > 0 && (
                    <ul className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {suggestions.map((suggestion) => (
                            <li key={suggestion.code} onClick={() => handleSuggestionClick(suggestion.code)} className="px-4 py-3 cursor-pointer hover:bg-sky-50 dark:hover:bg-slate-600 border-b border-slate-100 dark:border-slate-600 last:border-b-0">
                                <span className="font-semibold text-slate-800 dark:text-slate-100">{suggestion.code}</span>
                                <span className="ml-2 text-sm text-slate-500 dark:text-slate-400">{suggestion.description}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>

        <div className="mt-6">
          {isLoading && <LoadingSpinner />}
          {!isLoading && !result && !comparisonResult && !error && <InitialStateDisplay searchType={searchType} mode={mode} />}
          {!isLoading && error && <ResultsDisplay result={null} error={error} onStartCompare={() => {}} />}
          {!isLoading && mode === 'single' && result && <ResultsDisplay result={result} error={null} onStartCompare={handleStartCompare} />}
          {!isLoading && mode === 'compare' && comparisonResult && <ComparisonDisplay result={comparisonResult} />}
        </div>

      </main>
      <Footer />
    </div>
  );
};

export default App;

export { FormattedText };
