
import React, { useState, useCallback, useRef, useEffect } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import LoadingSpinner from './components/LoadingSpinner';
import { SearchType, type SearchResult } from './types';
import { fetchFiscalData } from './services/geminiService';

const SearchIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const InitialStateDisplay: React.FC<{ searchType: SearchType }> = ({ searchType }) => (
    <div className="text-center p-8 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
        <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">Pronto para começar?</h3>
        <p className="mt-2 text-slate-500 dark:text-slate-400">
            Digite um código ou descrição de {searchType} no campo de busca acima para obter uma análise detalhada.
        </p>
    </div>
);

const ResultsDisplay: React.FC<{ result: SearchResult | null; error: string | null }> = ({ result, error }) => {
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

    const formattedText = result.text.split('\n').map((line, index) => {
        if (line.startsWith('**') && line.endsWith('**')) {
            return <h3 key={index} className="text-lg font-semibold text-slate-800 dark:text-slate-100 mt-4 mb-2">{line.replaceAll('**', '')}</h3>;
        }
        if (line.startsWith('* ')) {
            return <li key={index} className="ml-5 list-disc">{line.substring(2)}</li>;
        }
        return <p key={index} className="my-1">{line}</p>;
    });

    return (
        <div className="mt-6 p-6 bg-white dark:bg-slate-800 rounded-lg shadow-sm animate-fade-in">
            <div className="prose prose-slate dark:prose-invert max-w-none text-slate-600 dark:text-slate-300">
                {formattedText}
            </div>
            {result.sources && result.sources.length > 0 && (
                <div className="mt-8 pt-4 border-t border-slate-200 dark:border-slate-700">
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
  { code: '5405', description: 'Venda de mercadoria com ST' },
  { code: '1403', description: 'Compra de mercadoria com ST' },
  { code: '5949', description: 'Outra saída de mercadoria não especificada' },
  { code: '1949', description: 'Outra entrada de mercadoria não especificada' },
  { code: '6102', description: 'Venda de mercadoria para fora do estado' },
];

const popularNcms = [
  { code: '8517.12.31', description: 'Telefones celulares (Smartphones)' },
  { code: '8703.23.10', description: 'Automóveis de passageiros' },
  { code: '3004.90.39', description: 'Medicamentos' },
  { code: '0201.30.00', description: 'Carne bovina, fresca ou refrigerada' },
  { code: '6403.99.90', description: 'Calçados' },
  { code: '9403.60.00', description: 'Móveis de madeira' },
];


const App: React.FC = () => {
  const [searchType, setSearchType] = useState<SearchType>(SearchType.CFOP);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<{code: string, description: string}[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const handleSearch = useCallback(async (e?: React.FormEvent<HTMLFormElement>, directQuery?: string) => {
    e?.preventDefault();
    const currentQuery = directQuery || query;
    if (!currentQuery.trim() || isLoading) return;

    setShowSuggestions(false);
    setIsLoading(true);
    setResult(null);
    setError(null);

    try {
      const data = await fetchFiscalData(searchType, currentQuery);
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ocorreu um erro inesperado.');
    } finally {
      setIsLoading(false);
    }
  }, [query, searchType, isLoading]);

  const handleTypeChange = (type: SearchType) => {
    setSearchType(type);
    setQuery('');
    setResult(null);
    setError(null);
    setShowSuggestions(false);
  }

  const getPlaceholder = () => {
    return searchType === SearchType.CFOP
      ? "Ex: 5102, 1949 ou 'venda de mercadoria'"
      : "Ex: 8517.12.31 ou 'smartphone'";
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    if (value.trim() === '') {
        setShowSuggestions(false);
        setSuggestions([]);
        return;
    }

    const source = searchType === SearchType.CFOP ? popularCfops : popularNcms;
    const filteredSuggestions = source.filter(item => 
        item.code.toLowerCase().includes(value.toLowerCase()) || 
        item.description.toLowerCase().includes(value.toLowerCase())
    );

    setSuggestions(filteredSuggestions);
    setShowSuggestions(filteredSuggestions.length > 0);
  };

  const handleSuggestionClick = (suggestionCode: string) => {
      setQuery(suggestionCode);
      setShowSuggestions(false);
      handleSearch(undefined, suggestionCode);
  };
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center p-4 antialiased text-slate-800 dark:text-slate-200">
      <main className="w-full max-w-3xl mx-auto flex-grow">
        <Header />
        
        <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-xl shadow-md">
            <div className="flex border-b border-slate-200 dark:border-slate-700 mb-4">
                <button 
                    onClick={() => handleTypeChange(SearchType.CFOP)}
                    className={`px-4 py-2 text-sm font-medium transition-colors duration-200 ${searchType === SearchType.CFOP ? 'border-b-2 border-sky-500 text-sky-600 dark:text-sky-400' : 'text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400'}`}
                >
                    Consultar CFOP
                </button>
                <button
                    onClick={() => handleTypeChange(SearchType.NCM)}
                    className={`px-4 py-2 text-sm font-medium transition-colors duration-200 ${searchType === SearchType.NCM ? 'border-b-2 border-sky-500 text-sky-600 dark:text-sky-400' : 'text-slate-500 dark:text-slate-400 hover:text-sky-600 dark:hover:text-sky-400'}`}
                >
                    Consultar NCM
                </button>
            </div>

            <div ref={searchContainerRef} className="relative">
                <form onSubmit={handleSearch} className="flex items-center gap-2">
                    <div className="relative flex-grow">
                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                            type="text"
                            value={query}
                            onChange={handleInputChange}
                            onFocus={() => { if (query.trim() && suggestions.length > 0) setShowSuggestions(true); }}
                            autoComplete="off"
                            placeholder={getPlaceholder()}
                            className="w-full pl-10 pr-4 py-2.5 text-base bg-slate-100 dark:bg-slate-700 rounded-lg border-2 border-transparent focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isLoading || !query.trim()}
                        className="px-5 py-2.5 bg-sky-600 text-white font-semibold rounded-lg hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 disabled:bg-slate-400 dark:disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors"
                    >
                        {isLoading ? 'Buscando...' : 'Buscar'}
                    </button>
                </form>
                {showSuggestions && suggestions.length > 0 && (
                    <ul className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                        {suggestions.map((suggestion) => (
                            <li 
                                key={suggestion.code} 
                                onClick={() => handleSuggestionClick(suggestion.code)}
                                className="px-4 py-3 cursor-pointer hover:bg-sky-50 dark:hover:bg-slate-600 border-b border-slate-100 dark:border-slate-600 last:border-b-0"
                            >
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
          {!isLoading && !result && !error && <InitialStateDisplay searchType={searchType} />}
          {!isLoading && (result || error) && <ResultsDisplay result={result} error={error} />}
        </div>

      </main>
      <Footer />
    </div>
  );
};

export default App;
