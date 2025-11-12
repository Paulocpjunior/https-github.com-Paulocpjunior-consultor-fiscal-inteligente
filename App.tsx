
import React, { useState, useCallback, useRef, useEffect } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import LoadingSpinner from './components/LoadingSpinner';
import ComparisonDisplay from './components/ComparisonDisplay';
import TaxAlerts from './components/TaxAlerts';
import FavoritesSidebar from './components/FavoritesSidebar';
import { SearchType, type SearchResult, type ComparisonResult, type FavoriteItem, type HistoryItem } from './types';
import { fetchFiscalData, fetchComparison } from './services/geminiService';

const SearchIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const LocationIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

const TagIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5a2 2 0 012 2v5a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2zM17 17h.01M17 13h5a2 2 0 012 2v5a2 2 0 01-2 2h-5a2 2 0 01-2-2v-5a2 2 0 012-2z" />
    </svg>
);

const UserIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
);

const ChevronDownIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
);

const StarIcon: React.FC<{ className?: string, solid?: boolean }> = ({ className, solid }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill={solid ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
);


const InitialStateDisplay: React.FC<{ searchType: SearchType, mode: 'single' | 'compare' }> = ({ searchType, mode }) => (
    <div className="text-center p-8 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
        <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">Pronto para começar?</h3>
        <p className="mt-2 text-slate-500 dark:text-slate-400">
            {mode === 'single'
                ? `Digite um código ou descrição de ${searchType} no campo de busca acima para obter uma análise detalhada.`
                : `Digite dois códigos ${searchType === SearchType.SERVICO ? 'de serviço' : searchType} nos campos acima para comparar.`
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

interface ResultsDisplayProps {
    result: SearchResult | null;
    error: string | null;
    onStartCompare: () => void;
    isFavorite: boolean;
    onToggleFavorite: () => void;
}


const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ result, error, onStartCompare, isFavorite, onToggleFavorite }) => {
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
                 <button
                    onClick={onToggleFavorite}
                    title={isFavorite ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos'}
                    className={`w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 font-semibold rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 transition-colors ${
                        isFavorite 
                        ? 'bg-amber-100 dark:bg-amber-800/50 text-amber-600 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-800' 
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                >
                    <StarIcon className="w-5 h-5" solid={isFavorite} />
                    {isFavorite ? 'Favorito' : 'Favoritar'}
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
  // Fix: Replaced a non-standard quote character `ʻ` with a standard single quote `'` to resolve syntax errors.
  { code: '8703.23.10', description: 'Automóveis de passageiros' },
  { code: '3004.90.39', description: 'Medicamentos' },
  { code: '0201.30.00', description: 'Carne bovina, fresca ou refrigerada' },
  { code: '6403.99.90', description: 'Calçados' },
];

const popularServicos = [
  { code: '7.02', description: 'Execução de obras de construção civil' },
  { code: '7.05', description: 'Reparação e conservação de edifícios' },
  { code: '14.01', description: 'Limpeza, manutenção e conservação' },
  { code: '17.05', description: 'Fornecimento de mão de obra' },
  { code: '1.03', description: 'Processamento de dados' },
];

type AppMode = 'single' | 'compare';

const App: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme === 'dark' || storedTheme === 'light') return storedTheme;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };
  
  const [searchType, setSearchType] = useState<SearchType>(SearchType.CFOP);
  const [mode, setMode] = useState<AppMode>('single');
  
  // State for single search
  const [query, setQuery] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [alias, setAlias] = useState('');
  const [responsavelTributario, setResponsavelTributario] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  
  // State for comparison search
  const [query1, setQuery1] = useState('');
  const [query2, setQuery2] = useState('');
  const [compareMunicipio, setCompareMunicipio] = useState('');
  const [compareResponsavel, setCompareResponsavel] = useState('');
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);

  // State for Tax Alerts
  const [taxableResults, setTaxableResults] = useState<SearchResult[]>([]);

  // Common state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // State for suggestions UI
  const [suggestions, setSuggestions] = useState<{code: string, description: string}[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestionBox, setActiveSuggestionBox] = useState<number | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Favorites State
  const [favorites, setFavorites] = useState<FavoriteItem[]>(() => {
    try {
        const storedFavorites = localStorage.getItem('fiscal-favorites');
        return storedFavorites ? JSON.parse(storedFavorites) : [];
    } catch (e) {
        return [];
    }
  });

  // History State
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
        const storedHistory = localStorage.getItem('fiscal-history');
        return storedHistory ? JSON.parse(storedHistory) : [];
    } catch (e) {
        return [];
    }
  });

  const [showSidebar, setShowSidebar] = useState(true);

  useEffect(() => {
    localStorage.setItem('fiscal-favorites', JSON.stringify(favorites));
  }, [favorites]);
  
  useEffect(() => {
    localStorage.setItem('fiscal-history', JSON.stringify(history));
  }, [history]);

  const isCurrentResultFavorite = result ? favorites.some(fav => fav.code === result.query && fav.type === searchType) : false;

  const extractDescriptionFromResult = (text: string): string => {
      const firstLine = text.split('\n')[0];
      // Attempt to find a line with a description after a "**...**" block
      const match = text.match(/\*\*Código e Descrição\*\*\n(.+)/);
      if (match && match[1]) {
          return match[1].replace(/^\d[\d.]*\s*-\s*/, '').trim();
      }
      return firstLine.substring(0, 100); // Fallback
  };
  
  const toggleFavorite = () => {
      if (!result) return;
  
      if (isCurrentResultFavorite) {
          setFavorites(prev => prev.filter(fav => !(fav.code === result.query && fav.type === searchType)));
      } else {
          const description = popularCfops.find(p => p.code === result.query)?.description || 
                              popularNcms.find(p => p.code === result.query)?.description || 
                              popularServicos.find(p => p.code === result.query)?.description || 
                              extractDescriptionFromResult(result.text);

          const newFavorite: FavoriteItem = {
              code: result.query,
              description: description,
              type: searchType,
          };
          setFavorites(prev => [...prev, newFavorite]);
      }
  };

  const handleFavoriteSearch = (item: FavoriteItem) => {
    setSearchType(item.type);
    setMode('single');
    setQuery(item.code);
    setAlias('');
    setMunicipio('');
    setResponsavelTributario('');
    handleSingleSearch(undefined, item.code, item.type);
  };
  
  const addToHistory = (item: Omit<HistoryItem, 'id' | 'timestamp'>) => {
    setHistory(prev => {
        const newHistoryItem: HistoryItem = { ...item, id: crypto.randomUUID(), timestamp: Date.now() };
        const filteredHistory = prev.filter(h => !(h.queries.join(',') === item.queries.join(',') && h.type === item.type));
        const updatedHistory = [newHistoryItem, ...filteredHistory];
        return updatedHistory.slice(0, 20); // Keep only the last 20 items
    });
  };

  const handleHistorySearch = (item: HistoryItem) => {
    setSearchType(item.type);
    setMode(item.mode);
    clearResults();

    if (item.mode === 'single') {
        setQuery(item.queries[0]);
        setAlias(item.alias || '');
        setMunicipio(item.municipio || '');
        setResponsavelTributario(item.responsavel || '');
        handleSingleSearch(undefined, item.queries[0], item.type, item.municipio, item.alias, item.responsavel);
    } else {
        setQuery1(item.queries[0]);
        setQuery2(item.queries[1]);
        setCompareMunicipio(item.municipio || '');
        setCompareResponsavel(item.responsavel || '');
        handleComparisonSearch(undefined, item.queries[0], item.queries[1], item.type, item.municipio, item.responsavel);
    }
  };

  const handleRemoveHistoryItem = (id: string) => {
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const handleClearHistory = () => {
    setHistory([]);
  };

  const clearResults = () => {
    setResult(null);
    setComparisonResult(null);
    setError(null);
    setShowSuggestions(false);
    setTaxableResults([]);
  };

  const handleModeChange = (newMode: AppMode) => {
    setMode(newMode);
    setQuery('');
    setQuery1('');
    setQuery2('');
    setMunicipio('');
    setAlias('');
    setCompareMunicipio('');
    setResponsavelTributario('');
    setCompareResponsavel('');
    clearResults();
  };
  
  const handleTypeChange = (type: SearchType) => {
    setSearchType(type);
    setQuery('');
    setQuery1('');
    setQuery2('');
    setMunicipio('');
    setAlias('');
    setCompareMunicipio('');
    setResponsavelTributario('');
    setCompareResponsavel('');
    clearResults();
  }

  const handleSingleSearch = useCallback(async (e?: React.FormEvent<HTMLFormElement>, directQuery?: string, directType?: SearchType, directMunicipio?: string, directAlias?: string, directResponsavel?: string) => {
    e?.preventDefault();
    const currentQuery = directQuery || query || alias;
    const currentType = directType || searchType;
    const currentMunicipio = directMunicipio || municipio;
    const currentAlias = directAlias || alias;
    const currentResponsavel = directResponsavel || responsavelTributario;
    
    if (!currentQuery.trim() || isLoading) return;

    setShowSuggestions(false);
    setIsLoading(true);
    clearResults();

    try {
      const data = await fetchFiscalData(currentType, directQuery || query, currentType === SearchType.SERVICO ? currentMunicipio : undefined, currentType === SearchType.SERVICO ? currentAlias : undefined, currentType === SearchType.SERVICO ? currentResponsavel : undefined);
      setResult(data);
      setTaxableResults([data]);
      addToHistory({
          queries: [data.query],
          type: currentType,
          mode: 'single',
          municipio: currentType === SearchType.SERVICO ? currentMunicipio : undefined,
          alias: currentType === SearchType.SERVICO ? currentAlias : undefined,
          responsavel: currentType === SearchType.SERVICO ? currentResponsavel : undefined,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ocorreu um erro inesperado.');
    } finally {
      setIsLoading(false);
    }
  }, [query, municipio, alias, responsavelTributario, searchType, isLoading]);

  const handleComparisonSearch = useCallback(async (e?: React.FormEvent<HTMLFormElement>, directQuery1?: string, directQuery2?: string, directType?: SearchType, directMunicipio?: string, directResponsavel?: string) => {
    e?.preventDefault();
    const currentQuery1 = directQuery1 || query1;
    const currentQuery2 = directQuery2 || query2;
    const currentType = directType || searchType;
    const currentMunicipio = directMunicipio || compareMunicipio;
    const currentResponsavel = directResponsavel || compareResponsavel;
    
    if (!currentQuery1.trim() || !currentQuery2.trim() || isLoading) return;

    setIsLoading(true);
    clearResults();

    try {
        const data = await fetchComparison(currentType, currentQuery1, currentQuery2, currentType === SearchType.SERVICO ? currentMunicipio : undefined, currentType === SearchType.SERVICO ? currentResponsavel : undefined);
        setComparisonResult(data);
        setTaxableResults([data.result1, data.result2]);
        addToHistory({
            queries: [data.result1.query, data.result2.query],
            type: currentType,
            mode: 'compare',
            municipio: currentType === SearchType.SERVICO ? currentMunicipio : undefined,
            responsavel: currentType === SearchType.SERVICO ? currentResponsavel : undefined,
        });
    } catch(err: unknown) {
        setError(err instanceof Error ? err.message : 'Ocorreu um erro inesperado.');
    } finally {
        setIsLoading(false);
    }
  }, [query1, query2, compareMunicipio, compareResponsavel, searchType, isLoading]);


  const getPlaceholder = (index: number = 0) => {
    switch (searchType) {
        case SearchType.CFOP:
            return index === 0 ? "Ex: 5102 ou 'venda'" : "Ex: 1102 ou 'compra'";
        case SearchType.NCM:
            return index === 0 ? "Ex: 8517.12.31" : "Ex: 8703.23.10";
        case SearchType.SERVICO:
            return index === 0 ? "Ex: 7.02 ou 'construção'" : "Ex: 14.01 ou 'limpeza'";
        default:
            return "Digite para buscar...";
    }
  };
  
  const handleStartCompare = () => {
    setMode('compare');
    setQuery1(result?.query || '');
    setQuery2('');
    // Persist municipio and responsavel when switching to compare mode
    if (searchType === SearchType.SERVICO) {
        setCompareMunicipio(municipio);
        setCompareResponsavel(responsavelTributario);
    }
    clearResults();
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
    
    const source = searchType === SearchType.CFOP 
        ? popularCfops 
        : (searchType === SearchType.NCM ? popularNcms : popularServicos);
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
        <div className="fixed top-20 right-4 z-20">
            <button 
                onClick={() => setShowSidebar(prev => !prev)}
                className="p-3 bg-white dark:bg-slate-700 rounded-full shadow-lg text-amber-500 dark:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500"
                title={showSidebar ? 'Ocultar Painel' : 'Mostrar Painel'}>
                <StarIcon className="w-6 h-6" solid />
            </button>
        </div>
      <main className="w-full max-w-4xl mx-auto flex-grow">
        <Header theme={theme} toggleTheme={toggleTheme} />
        
        <div className="flex gap-6">
            <div className="flex-grow">

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
                            <button onClick={() => handleTypeChange(SearchType.SERVICO)} className={`px-3 py-1 rounded-md transition-colors ${searchType === SearchType.SERVICO ? 'bg-white dark:bg-slate-600 shadow' : ''}`}>Serviço</button>
                        </div>
                    </div>

                    <div ref={searchContainerRef} className="relative">
                        {mode === 'single' ? (
                            <form onSubmit={handleSingleSearch} className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <div className="relative flex-grow">
                                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                        <input type="text" value={query} onChange={(e) => handleInputChange(e.target.value, 0)} onFocus={() => handleInputChange(query, 0)} autoComplete="off" placeholder={getPlaceholder()} className="w-full pl-10 pr-4 py-2.5 text-base bg-slate-100 dark:bg-slate-700 rounded-lg border-2 border-transparent focus:outline-none focus:ring-2 focus:ring-sky-500 transition"/>
                                    </div>
                                    <button type="submit" disabled={isLoading || (!query.trim() && !alias.trim())} className="px-5 py-2.5 bg-sky-600 text-white font-semibold rounded-lg hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 disabled:bg-slate-400 dark:disabled:bg-slate-600 transition-colors">
                                        {isLoading ? 'Buscando...' : 'Buscar'}
                                    </button>
                                </div>
                                {searchType === SearchType.SERVICO && (
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 animate-fade-in">
                                        <div className="relative">
                                            <LocationIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                                            <input type="text" value={municipio} onChange={(e) => setMunicipio(e.target.value)} autoComplete="off" placeholder="Município (Opcional)" className="w-full pl-10 pr-4 py-2.5 text-base bg-slate-100 dark:bg-slate-700 rounded-lg border-2 border-transparent focus:outline-none focus:ring-2 focus:ring-sky-500 transition"/>
                                        </div>
                                        <div className="relative">
                                            <TagIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                                            <input type="text" value={alias} onChange={(e) => setAlias(e.target.value)} autoComplete="off" placeholder="Alias (Opcional)" className="w-full pl-10 pr-4 py-2.5 text-base bg-slate-100 dark:bg-slate-700 rounded-lg border-2 border-transparent focus:outline-none focus:ring-2 focus:ring-sky-500 transition"/>
                                        </div>
                                        <div className="relative">
                                            <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                                            <select
                                                value={responsavelTributario}
                                                onChange={(e) => setResponsavelTributario(e.target.value)}
                                                className="w-full pl-10 pr-10 py-2.5 text-base bg-slate-100 dark:bg-slate-700 rounded-lg border-2 border-transparent focus:outline-none focus:ring-2 focus:ring-sky-500 transition appearance-none"
                                            >
                                                <option value="">Responsável (Opcional)</option>
                                                <option value="Tomador">Tomador</option>
                                                <option value="Prestador">Prestador</option>
                                                <option value="Ambos">Ambos</option>
                                            </select>
                                            <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                        </div>
                                    </div>
                                )}
                            </form>
                        ) : (
                            <form onSubmit={handleComparisonSearch} className="space-y-3">
                                <div className="flex flex-col sm:flex-row items-center gap-2">
                                    <div className="relative flex-grow w-full">
                                        <input type="text" id="compare-input-1" value={query1} onChange={(e) => handleInputChange(e.target.value, 1)} onFocus={() => handleInputChange(query1, 1)} autoComplete="off" placeholder={`${searchType} 1: ${getPlaceholder(0)}`} className="w-full px-4 py-2.5 text-base bg-slate-100 dark:bg-slate-700 rounded-lg border-2 border-transparent focus:outline-none focus:ring-2 focus:ring-sky-500 transition"/>
                                    </div>
                                    <span className="text-slate-400 font-semibold hidden sm:block">vs</span>
                                    <div className="relative flex-grow w-full">
                                        <input type="text" id="compare-input-2" value={query2} onChange={(e) => handleInputChange(e.target.value, 2)} onFocus={() => handleInputChange(query2, 2)} autoComplete="off" placeholder={`${searchType} 2: ${getPlaceholder(1)}`} className="w-full px-4 py-2.5 text-base bg-slate-100 dark:bg-slate-700 rounded-lg border-2 border-transparent focus:outline-none focus:ring-2 focus:ring-sky-500 transition"/>
                                    </div>
                                    <button type="submit" disabled={isLoading || !query1.trim() || !query2.trim()} className="w-full sm:w-auto px-5 py-2.5 bg-sky-600 text-white font-semibold rounded-lg hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 disabled:bg-slate-400 dark:disabled:bg-slate-600 transition-colors">
                                        {isLoading ? 'Comparando...' : 'Comparar'}
                                    </button>
                                </div>
                                {searchType === SearchType.SERVICO && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 animate-fade-in">
                                        <div className="relative">
                                            <LocationIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                                            <input type="text" value={compareMunicipio} onChange={(e) => setCompareMunicipio(e.target.value)} autoComplete="off" placeholder="Município (Opcional)" className="w-full pl-10 pr-4 py-2.5 text-base bg-slate-100 dark:bg-slate-700 rounded-lg border-2 border-transparent focus:outline-none focus:ring-2 focus:ring-sky-500 transition"/>
                                        </div>
                                        <div className="relative">
                                            <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                                            <select
                                                value={compareResponsavel}
                                                onChange={(e) => setCompareResponsavel(e.target.value)}
                                                className="w-full pl-10 pr-10 py-2.5 text-base bg-slate-100 dark:bg-slate-700 rounded-lg border-2 border-transparent focus:outline-none focus:ring-2 focus:ring-sky-500 transition appearance-none"
                                            >
                                                <option value="">Responsável (Opcional)</option>
                                                <option value="Tomador">Tomador</option>
                                                <option value="Prestador">Prestador</option>
                                                <option value="Ambos">Ambos</option>
                                            </select>
                                            <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                        </div>
                                    </div>
                                )}
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
                {!isLoading && error && <ResultsDisplay result={null} error={error} onStartCompare={() => {}} isFavorite={false} onToggleFavorite={() => {}} />}
                {!isLoading && mode === 'single' && result && <ResultsDisplay result={result} error={null} onStartCompare={handleStartCompare} isFavorite={isCurrentResultFavorite} onToggleFavorite={toggleFavorite} />}
                {!isLoading && mode === 'compare' && comparisonResult && <ComparisonDisplay result={comparisonResult} />}
                </div>
                
                {!isLoading && taxableResults.length > 0 && (
                    <TaxAlerts results={taxableResults} searchType={searchType} />
                )}
            </div>

            <FavoritesSidebar 
                favorites={favorites} 
                onFavoriteSelect={handleFavoriteSearch}
                onFavoriteRemove={setFavorites} 
                history={history}
                onHistorySelect={handleHistorySearch}
                onHistoryRemove={handleRemoveHistoryItem}
                onHistoryClear={handleClearHistory}
                isVisible={showSidebar}
                onClose={() => setShowSidebar(false)}
            />
        </div>

      </main>
      <Footer />
    </div>
  );
};

export default App;

export { FormattedText };