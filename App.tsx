
import React, { useState, useCallback, useRef, useEffect, useMemo, Suspense, lazy } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import LoadingSpinner from './components/LoadingSpinner';
import TaxAlerts from './components/TaxAlerts';
import NewsAlerts from './components/NewsAlerts';
import FavoritesSidebar from './components/FavoritesSidebar';
import SimplesNacionalDashboard from './components/SimplesNacionalDashboard';
import SimplesNacionalNovaEmpresa from './components/SimplesNacionalNovaEmpresa';
import InitialStateDisplay from './components/InitialStateDisplay';
import SimilarServicesDisplay from './components/SimilarServicesDisplay';
import { PopularSuggestions } from './components/PopularSuggestions';
import { SearchType, type SearchResult, type ComparisonResult, type FavoriteItem, type HistoryItem, type SimilarService, type CnaeSuggestion, SimplesNacionalEmpresa, SimplesNacionalNota, SimplesNacionalAnexo } from './types';
import { fetchFiscalData, fetchComparison, fetchSimilarServices, fetchCnaeSuggestions } from './services/geminiService';
import * as simplesService from './services/simplesNacionalService';
import { BuildingIcon, CalculatorIcon, ChevronDownIcon, DocumentTextIcon, LocationIcon, SearchIcon, TagIcon, UserIcon } from './components/Icons';

// Lazy load heavy components
const SimplesNacionalDetalhe = lazy(() => import('./components/SimplesNacionalDetalhe'));
const SimplesNacionalClienteView = lazy(() => import('./components/SimplesNacionalClienteView'));
const ResultsDisplay = lazy(() => import('./components/ResultsDisplay'));
const ComparisonDisplay = lazy(() => import('./components/ComparisonDisplay'));
const ReformaResultDisplay = lazy(() => import('./components/ReformaResultDisplay'));

const searchDescriptions: Record<SearchType, string> = {
    [SearchType.CFOP]: "Consulte códigos de operação e entenda a aplicação e tributação.",
    [SearchType.NCM]: "Classificação fiscal de mercadorias e incidência de impostos (IPI, ICMS).",
    [SearchType.SERVICO]: "Análise de retenção de ISS, local de incidência e alíquotas.",
    [SearchType.REFORMA_TRIBUTARIA]: "Simule o impacto da Reforma Tributária (IBS/CBS) para sua atividade.",
    [SearchType.SIMPLES_NACIONAL]: "Gestão de empresas do Simples, cálculo de DAS e Fator R.",
};

const App: React.FC = () => {
  
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
        if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.classList.add('dark');
            return 'dark';
        }
    }
    document.documentElement.classList.remove('dark');
    return 'light';
  });

  const [searchType, setSearchType] = useState<SearchType>(SearchType.CFOP);
  const [mode, setMode] = useState<'single' | 'compare'>('single');
  const [query1, setQuery1] = useState('');
  const [query2, setQuery2] = useState('');
  
  // Reforma fields
  const [cnae, setCnae] = useState('');
  const [cnae2, setCnae2] = useState('');
  const [reformaQuery, setReformaQuery] = useState('');

  // Serviço fields
  const [municipio, setMunicipio] = useState('');
  const [alias, setAlias] = useState('');
  const [responsavel, setResponsavel] = useState('');
  const [regimeTributario, setRegimeTributario] = useState('');
  const [aliquotaIcms, setAliquotaIcms] = useState('');
  const [aliquotaPisCofins, setAliquotaPisCofins] = useState('');
  const [aliquotaIss, setAliquotaIss] = useState('');
  
  const [result, setResult] = useState<SearchResult | null>(null);
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [similarServices, setSimilarServices] = useState<SimilarService[] | null>(null);
  const [isLoadingSimilar, setIsLoadingSimilar] = useState(false);
  const [errorSimilar, setErrorSimilar] = useState<string | null>(null);
  
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const [cnaeSuggestions, setCnaeSuggestions] = useState<CnaeSuggestion[]>([]);
  const [isLoadingCnaeSuggestions, setIsLoadingCnaeSuggestions] = useState(false);
  const [errorCnaeSuggestions, setErrorCnaeSuggestions] = useState<string | null>(null);
  const cnaeDebounceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionsContainerRef = useRef<HTMLDivElement>(null);
  
  // Simples Nacional State
  const [simplesView, setSimplesView] = useState<'dashboard' | 'detalhe' | 'nova' | 'cliente'>('dashboard');
  const [simplesEmpresas, setSimplesEmpresas] = useState<SimplesNacionalEmpresa[]>([]);
  const [simplesNotas, setSimplesNotas] = useState<Record<string, SimplesNacionalNota[]>>({});
  const [selectedSimplesEmpresaId, setSelectedSimplesEmpresaId] = useState<string | null>(null);
  
  useEffect(() => {
    // This effect runs once on component mount
    try {
        const storedFavorites = localStorage.getItem('fiscal-consultant-favorites');
        if (storedFavorites) setFavorites(JSON.parse(storedFavorites));

        const storedHistory = localStorage.getItem('fiscal-consultant-history');
        if (storedHistory) setHistory(JSON.parse(storedHistory));

        setSimplesEmpresas(simplesService.getEmpresas());
        setSimplesNotas(simplesService.getAllNotas());
    } catch (e) {
        console.error("Failed to parse data from localStorage", e);
    }
  }, []);

  useEffect(() => {
      if (theme === 'dark') {
          document.documentElement.classList.add('dark');
          localStorage.theme = 'dark';
      } else {
          document.documentElement.classList.remove('dark');
          localStorage.theme = 'light';
      }
  }, [theme]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (suggestionsContainerRef.current && !suggestionsContainerRef.current.contains(event.target as Node)) {
            setCnaeSuggestions([]);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
        document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  const saveFavorites = (newFavorites: FavoriteItem[]) => {
      setFavorites(newFavorites);
      localStorage.setItem('fiscal-consultant-favorites', JSON.stringify(newFavorites));
  };
  
  const addHistory = (item: Omit<HistoryItem, 'id' | 'timestamp'>) => {
      setHistory(prev => {
          const newHistory = [
              { ...item, id: crypto.randomUUID(), timestamp: Date.now() },
              ...prev.filter(h => h.queries.join() !== item.queries.join() || h.type !== item.type)
          ].slice(0, 50); // Keep last 50
          localStorage.setItem('fiscal-consultant-history', JSON.stringify(newHistory));
          return newHistory;
      });
  };

    const handleHistoryRemove = (id: string) => {
        setHistory(prev => {
            const updatedHistory = prev.filter(h => h.id !== id);
            localStorage.setItem('fiscal-consultant-history', JSON.stringify(updatedHistory));
            return updatedHistory;
        });
    };

    const handleHistoryClear = () => {
        setHistory([]);
        localStorage.removeItem('fiscal-consultant-history');
    };

  const handleSearch = useCallback(async (currentQuery1: string, currentQuery2?: string, options?: { reformaQuery?: string }) => {
    const isCompare = mode === 'compare' && !!currentQuery1 && !!currentQuery2;
    const isSingle = mode === 'single' && !!currentQuery1;

    if (!isSingle && !isCompare) return;

    setIsLoading(true);
    setError(null);
    setResult(null);
    setComparisonResult(null);
    setSimilarServices(null);

    try {
        if (isCompare) {
            const data = await fetchComparison(searchType, currentQuery1, currentQuery2 || '', municipio, responsavel, regimeTributario, aliquotaIcms, aliquotaPisCofins, aliquotaIss);
            setComparisonResult(data);
            addHistory({ 
                queries: [currentQuery1, currentQuery2 || ''], 
                type: searchType, 
                mode: 'compare', 
                municipio, 
                cnae: searchType === SearchType.REFORMA_TRIBUTARIA ? `${currentQuery1} vs ${currentQuery2}` : undefined,
                aliquotaIcms,
                aliquotaPisCofins,
                aliquotaIss,
            });
        } else {
            const finalReformaQuery = options?.reformaQuery;
            const cnaeForCall = searchType === SearchType.REFORMA_TRIBUTARIA ? currentQuery1 : '';
            const data = await fetchFiscalData(searchType, currentQuery1, municipio, alias, responsavel, cnaeForCall, regimeTributario, finalReformaQuery, aliquotaIcms, aliquotaPisCofins, aliquotaIss);
            setResult(data);
            addHistory({ queries: [currentQuery1], type: searchType, mode: 'single', municipio, alias, responsavel, cnae: cnaeForCall, regimeTributario, reformaQuery: finalReformaQuery, aliquotaIcms, aliquotaPisCofins, aliquotaIss });
        }
    } catch (e: any) {
        setError(e.message || 'Ocorreu um erro desconhecido.');
    } finally {
        setIsLoading(false);
    }
  }, [searchType, mode, municipio, alias, responsavel, regimeTributario, aliquotaIcms, aliquotaPisCofins, aliquotaIss]);
  
  const handleQuery1Change = (value: string) => {
      setQuery1(value);
  };
  
  const handleFormSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const q1 = searchType === SearchType.REFORMA_TRIBUTARIA ? cnae : query1;
      const q2 = searchType === SearchType.REFORMA_TRIBUTARIA ? cnae2 : query2;
      handleSearch(q1, q2, { reformaQuery });
  };

  const handleCnaeChange = (value: string) => {
    setCnae(value);
    
    if (cnaeDebounceTimeout.current) clearTimeout(cnaeDebounceTimeout.current);
    
    if (value.trim().length < 3) {
        setCnaeSuggestions([]);
        return;
    }

    setIsLoadingCnaeSuggestions(true);
    setErrorCnaeSuggestions(null);

    cnaeDebounceTimeout.current = setTimeout(async () => {
        try {
            const suggestions = await fetchCnaeSuggestions(value);
            setCnaeSuggestions(suggestions);
        } catch (e: any) {
            setErrorCnaeSuggestions(e.message || 'Erro ao buscar sugestões.');
        } finally {
            setIsLoadingCnaeSuggestions(false);
        }
    }, 500);
  };

  const handleCnaeSuggestionClick = (suggestion: CnaeSuggestion) => {
      setCnae(suggestion.code);
      setCnaeSuggestions([]);
  };

  const clearSearch = () => {
    setQuery1('');
    setQuery2('');
    setCnae('');
    setCnae2('');
    setReformaQuery('');
    setMunicipio('');
    setAlias('');
    setResponsavel('');
    setRegimeTributario('');
    setAliquotaIcms('');
    setAliquotaPisCofins('');
    setAliquotaIss('');
    setResult(null);
    setComparisonResult(null);
    setError(null);
    setIsLoading(false);
    setSimilarServices(null);
    setIsLoadingSimilar(false);
    setErrorSimilar(null);
    setCnaeSuggestions([]);
    setIsLoadingCnaeSuggestions(false);
    setErrorCnaeSuggestions(null);
  };
  
  const handleTypeChange = (newType: SearchType) => {
    setSearchType(newType);
    if (newType !== SearchType.SIMPLES_NACIONAL) {
        clearSearch();
    } else {
        setSimplesView('dashboard');
        setSelectedSimplesEmpresaId(null);
    }
  };
  
  const handleModeChange = (newMode: 'single' | 'compare') => {
      setMode(newMode);
      clearSearch();
  };
  
  const handleStartCompare = () => {
    if (result) {
        setQuery1(result.query);
        setMode('compare');
        setResult(null);
        setSimilarServices(null);
    }
  };

    const handleFetchSimilarServices = useCallback(async () => {
        if (!result || searchType !== SearchType.SERVICO) return;
        
        setIsLoadingSimilar(true);
        setErrorSimilar(null);
        setSimilarServices(null);
        
        try {
            const similar = await fetchSimilarServices(result.query);
            setSimilarServices(similar);
        } catch (e: any) {
            setErrorSimilar(e.message || 'Falha ao buscar serviços similares.');
        } finally {
            setIsLoadingSimilar(false);
        }
    }, [result, searchType]);

    const handleSimilarServiceSelect = (code: string) => {
        setMode('single');
        setQuery1(code);
        setAlias('');
        setResult(null);
        setComparisonResult(null);
        handleSearch(code);
    };

  const currentResultIsFavorite = useMemo(() => {
      if (mode !== 'single' || !result) return false;
      const code = searchType === SearchType.REFORMA_TRIBUTARIA ? cnae : result.query;
      return favorites.some(fav => fav.code === code && fav.type === searchType);
  }, [result, favorites, searchType, mode, cnae]);

  const handleToggleFavorite = () => {
    if (mode !== 'single' || !result) return;
    const code = searchType === SearchType.REFORMA_TRIBUTARIA ? (result.query.replace('Análise para CNAE ', '')) : result.query;
    const description = result.description || result.text.split('\n')[0].replace('**', '').trim();
    
    if (currentResultIsFavorite) {
        saveFavorites(favorites.filter(fav => !(fav.code === code && fav.type === searchType)));
    } else {
        saveFavorites([...favorites, { code, description, type: searchType }]);
    }
  };
  
  const handleFavoriteSelect = (item: FavoriteItem) => {
    setIsSidebarOpen(false);
    setMode('single');
    setSearchType(item.type);
    setComparisonResult(null);
    setSimilarServices(null);
    if (item.type === SearchType.REFORMA_TRIBUTARIA) {
        setCnae(item.code);
        handleSearch(item.code, undefined, { reformaQuery: '' });
    } else {
        setQuery1(item.code);
        handleSearch(item.code);
    }
  };
  
  const handleHistorySelect = (item: HistoryItem) => {
    setIsSidebarOpen(false);
    setMode(item.mode);
    setSearchType(item.type);
    setResult(null);
    setComparisonResult(null);
    setSimilarServices(null);
    
    if(item.type === SearchType.REFORMA_TRIBUTARIA){
        setReformaQuery(item.reformaQuery || '');
        if (item.mode === 'single') {
            setCnae(item.cnae || '');
            handleSearch(item.cnae || '', undefined, { reformaQuery: item.reformaQuery || '' });
        } else {
            const [c1, c2] = (item.cnae || ' vs ').split(' vs ');
            setCnae(c1);
            setCnae2(c2);
            handleSearch(c1, c2);
        }
    } else {
        setMunicipio(item.municipio || '');
        setAlias(item.alias || '');
        setResponsavel(item.responsavel || '');
        setRegimeTributario(item.regimeTributario || '');
        setAliquotaIcms(item.aliquotaIcms || '');
        setAliquotaPisCofins(item.aliquotaPisCofins || '');
        setAliquotaIss(item.aliquotaIss || '');
        setReformaQuery('');

        if (item.mode === 'single') {
            setQuery1(item.queries[0]);
            handleSearch(item.queries[0]);
        } else {
            setQuery1(item.queries[0]);
            setQuery2(item.queries[1]);
            handleSearch(item.queries[0], item.queries[1]);
        }
    }
  };

    // --- Simples Nacional Handlers ---
    const handleSaveSimplesEmpresa = (nome: string, cnpj: string, cnae: string, anexo: SimplesNacionalAnexo | 'auto') => {
        const newEmpresa = simplesService.saveEmpresa(nome, cnpj, cnae, anexo);
        setSimplesEmpresas(prev => [...prev, newEmpresa]);
        setSimplesView('dashboard');
    };
    
    const handleUpdateSimplesEmpresa = (empresaId: string, data: Partial<SimplesNacionalEmpresa>) => {
        const updatedEmpresa = simplesService.updateEmpresa(empresaId, data);
        if (updatedEmpresa) {
            setSimplesEmpresas(prev => prev.map(e => e.id === empresaId ? updatedEmpresa : e));
        }
        return updatedEmpresa;
    };

    const handleSelectSimplesEmpresa = (id: string, view: 'detalhe' | 'cliente' = 'detalhe') => {
        setSelectedSimplesEmpresaId(id);
        setSimplesView(view);
    };

    const handleImportNotas = async (empresaId: string, file: File): Promise<{count: number; error?: string}> => {
        try {
            const novasNotas = await simplesService.parseAndSaveNotas(empresaId, file);
            if (novasNotas.length === 0) {
                return { count: 0, error: 'Nenhuma nota válida encontrada no arquivo.'};
            }
            setSimplesNotas(simplesService.getAllNotas());
            return { count: novasNotas.length };
        } catch (e: any) {
            return { count: 0, error: e.message || 'Erro ao processar o arquivo.' };
        }
    };

    const handleUpdateFolha12 = (empresaId: string, folha12: number) => {
        const updatedEmpresa = simplesService.updateFolha12(empresaId, folha12);
        if (updatedEmpresa) {
            setSimplesEmpresas(prev => prev.map(e => e.id === empresaId ? updatedEmpresa : e));
        }
        return updatedEmpresa;
    };
    
    const handleSaveFaturamentoManual = (empresaId: string, faturamento: { [key: string]: number }) => {
        const updatedEmpresa = simplesService.saveFaturamentoManual(empresaId, faturamento);
        if (updatedEmpresa) {
            setSimplesEmpresas(prev => prev.map(e => e.id === empresaId ? updatedEmpresa : e));
        }
        return updatedEmpresa;
    };

    const selectedSimplesEmpresa = useMemo(() => {
        return simplesEmpresas.find(e => e.id === selectedSimplesEmpresaId) || null;
    }, [selectedSimplesEmpresaId, simplesEmpresas]);

  const searchResultsForAlerts = useMemo(() => {
    if (comparisonResult) return [comparisonResult.result1, comparisonResult.result2];
    if (result) return [result];
    return [];
  }, [result, comparisonResult]);

  const searchTypes = [SearchType.CFOP, SearchType.NCM, SearchType.SERVICO, SearchType.REFORMA_TRIBUTARIA, SearchType.SIMPLES_NACIONAL];

  const getButtonText = () => {
    if (isLoading) return 'Analisando...';
    if (mode === 'compare') return 'Comparar';
    if (searchType === SearchType.REFORMA_TRIBUTARIA) return 'Analisar CNAE';
    return 'Analisar';
  };

  const handleSuggestionSelect = (code: string) => {
    if (searchType === SearchType.REFORMA_TRIBUTARIA) {
        setCnae(code);
        handleSearch(code, undefined, { reformaQuery: '' });
    } else {
        setQuery1(code);
        handleSearch(code);
    }
  };

  const renderMainContent = () => {
    if (searchType === SearchType.SIMPLES_NACIONAL) {
        if (simplesView === 'nova') {
            return <SimplesNacionalNovaEmpresa onSave={handleSaveSimplesEmpresa} onCancel={() => setSimplesView('dashboard')} />;
        }
        if (simplesView === 'detalhe' && selectedSimplesEmpresa) {
            return (
                <Suspense fallback={<LoadingSpinner />}>
                    <SimplesNacionalDetalhe 
                        empresa={selectedSimplesEmpresa} 
                        notas={simplesNotas[selectedSimplesEmpresa.id] || []}
                        onBack={() => setSimplesView('dashboard')} 
                        onImport={handleImportNotas}
                        onUpdateFolha12={handleUpdateFolha12}
                        onSaveFaturamentoManual={handleSaveFaturamentoManual}
                        onUpdateEmpresa={handleUpdateSimplesEmpresa}
                        onShowClienteView={() => handleSelectSimplesEmpresa(selectedSimplesEmpresa.id, 'cliente')}
                    />
                </Suspense>
            );
        }
        if (simplesView === 'cliente' && selectedSimplesEmpresa) {
            return (
                <Suspense fallback={<LoadingSpinner />}>
                    <SimplesNacionalClienteView
                        empresa={selectedSimplesEmpresa}
                        notas={simplesNotas[selectedSimplesEmpresa.id] || []}
                        onBack={() => setSimplesView('dashboard')}
                    />
                </Suspense>
            );
        }
        return <SimplesNacionalDashboard 
                    empresas={simplesEmpresas} 
                    notas={simplesNotas}
                    onSelectEmpresa={handleSelectSimplesEmpresa} 
                    onAddNew={() => setSimplesView('nova')} 
                />;
    }

    return (
        <>
        <div className="flex flex-col sm:flex-row justify-end items-center gap-4 mb-6">
            <div className="flex-shrink-0 bg-slate-200 dark:bg-slate-800 p-1 rounded-lg flex">
                <button onClick={() => handleModeChange('single')} className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors ${mode === 'single' ? 'bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-400 shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'}`}>
                    Análise
                </button>
                    <button onClick={() => handleModeChange('compare')} className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors ${mode === 'compare' ? 'bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-400 shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'}`}>
                    Comparar
                </button>
            </div>
        </div>
        
        <form onSubmit={handleFormSubmit} className="space-y-4">
            {searchType === SearchType.REFORMA_TRIBUTARIA ? (
                <>
                    <div className={`grid grid-cols-1 ${mode === 'compare' ? 'md:grid-cols-2' : ''} gap-4`}>
                        <div ref={suggestionsContainerRef}>
                            <div className="relative">
                                <BuildingIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                                <input
                                    type="text"
                                    value={cnae}
                                    onChange={(e) => handleCnaeChange(e.target.value)}
                                    placeholder="Digite o código ou atividade do CNAE"
                                    className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                                    aria-label="CNAE 1"
                                    autoComplete="off"
                                />
                            </div>
                            {(isLoadingCnaeSuggestions || errorCnaeSuggestions || cnaeSuggestions.length > 0) && (
                                <div className="relative">
                                    <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                                        {isLoadingCnaeSuggestions && (
                                            <div className="p-3 text-sm text-slate-500 dark:text-slate-400">Buscando sugestões...</div>
                                        )}
                                        {errorCnaeSuggestions && (
                                            <div className="p-3 text-sm text-red-600 dark:text-red-400">{errorCnaeSuggestions}</div>
                                        )}
                                        <ul>
                                            {cnaeSuggestions.map((suggestion) => (
                                                <li key={suggestion.code}>
                                                    <button
                                                        type="button"
                                                        className="w-full text-left px-4 py-2 hover:bg-sky-100 dark:hover:bg-sky-900/50"
                                                        onClick={() => handleCnaeSuggestionClick(suggestion)}
                                                    >
                                                        <span className="font-bold text-slate-800 dark:text-slate-200">{suggestion.code}</span>
                                                        <span className="ml-2 text-slate-600 dark:text-slate-400">{suggestion.description}</span>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>

                        {mode === 'compare' && (
                            <div className="relative">
                                <BuildingIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                                <input
                                    type="text"
                                    value={cnae2}
                                    onChange={(e) => setCnae2(e.target.value)}
                                    placeholder="Digite o segundo CNAE"
                                    className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                                    aria-label="CNAE 2"
                                />
                            </div>
                        )}
                    </div>
                    {mode === 'single' && (
                        <div className="relative">
                            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                            <input
                                type="text"
                                value={reformaQuery}
                                onChange={(e) => setReformaQuery(e.target.value)}
                                placeholder="Pesquisa livre (opcional). Ex: qual o impacto para Simples Nacional?"
                                className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                                aria-label="Pesquisa livre para Reforma Tributária"
                            />
                        </div>
                    )}
                </>
            ) : (
                <div className={`grid grid-cols-1 ${mode === 'compare' ? 'md:grid-cols-2' : ''} gap-4`}>
                    <div className="relative">
                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                        <input
                            type="text"
                            value={query1}
                            onChange={(e) => handleQuery1Change(e.target.value)}
                            placeholder={`Digite o ${searchType === SearchType.SERVICO ? 'código ou descrição do serviço' : searchType}`}
                            className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                            aria-label="Query 1"
                        />
                    </div>
                    {mode === 'compare' && (
                        <div className="relative">
                            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                            <input
                                type="text"
                                value={query2}
                                onChange={(e) => setQuery2(e.target.value)}
                                placeholder={`Digite o segundo ${searchType === SearchType.SERVICO ? 'código' : searchType}`}
                                className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                                aria-label="Query 2"
                            />
                        </div>
                    )}
                </div>
            )}

            {searchType === SearchType.SERVICO && (
                <details className="p-4 bg-slate-100 dark:bg-slate-800/50 rounded-lg">
                    <summary className="font-semibold text-slate-700 dark:text-slate-300 cursor-pointer flex justify-between items-center">
                        Filtros Adicionais (Opcional)
                        <ChevronDownIcon className="w-5 h-5" />
                    </summary>
                    <div className="mt-4 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="relative">
                                <LocationIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                                <input type="text" value={municipio} onChange={(e) => setMunicipio(e.target.value)} placeholder="Município" className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                            </div>
                            <div className="relative">
                                <TagIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                                <input type="text" value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Alias/Termo de Busca" className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
                            </div>
                            <div className="relative">
                                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                                <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 appearance-none">
                                    <option value="">Responsável (ambos)</option>
                                    <option value="Tomador">Tomador</option>
                                    <option value="Prestador">Prestador</option>
                                </select>
                                <ChevronDownIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                            </div>
                        </div>
                        
                        <div className="relative">
                            <DocumentTextIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                            <select value={regimeTributario} onChange={(e) => setRegimeTributario(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 appearance-none">
                                <option value="">Regime Tributário (todos)</option>
                                <option value="Simples Nacional">Simples Nacional</option>
                                <option value="Lucro Presumido">Lucro Presumido</option>
                                <option value="Lucro Real">Lucro Real</option>
                            </select>
                            <ChevronDownIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
                        </div>

                        <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-slate-200 dark:border-slate-600">
                            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 uppercase tracking-wide flex items-center gap-2">
                                <CalculatorIcon className="w-4 h-4" />
                                Contexto Tributário (Alíquotas)
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                {/* ISS Input */}
                                <div className="relative group">
                                    <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block ml-1">Municipal (ISS)</label>
                                    <div className="relative">
                                        <BuildingIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-500 dark:text-purple-400 pointer-events-none" />
                                        <input
                                            type="number"
                                            value={aliquotaIss}
                                            onChange={(e) => setAliquotaIss(e.target.value)}
                                            placeholder="0.00"
                                            className="w-full pl-10 pr-8 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                                            step="0.01"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">%</span>
                                    </div>
                                </div>

                                {/* ICMS Input */}
                                <div className="relative group">
                                    <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block ml-1">Estadual (ICMS)</label>
                                    <div className="relative">
                                        <LocationIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-500 dark:text-blue-400 pointer-events-none" />
                                        <input
                                            type="text"
                                            value={aliquotaIcms}
                                            onChange={(e) => setAliquotaIcms(e.target.value)}
                                            placeholder="0.00"
                                            className="w-full pl-10 pr-8 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">%</span>
                                    </div>
                                </div>

                                {/* PIS/COFINS Input */}
                                <div className="relative group">
                                    <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block ml-1">Federal (PIS/COFINS)</label>
                                    <div className="relative">
                                        <CalculatorIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500 dark:text-green-400 pointer-events-none" />
                                        <input
                                            type="number"
                                            value={aliquotaPisCofins}
                                            onChange={(e) => setAliquotaPisCofins(e.target.value)}
                                            placeholder="0.00"
                                            className="w-full pl-10 pr-8 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all"
                                            step="0.01"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">%</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </details>
            )}
            
            <div className="flex justify-center pt-2">
                <button type="submit" className="btn-press px-8 py-3 bg-sky-600 text-white font-bold rounded-lg hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 transition-colors disabled:opacity-50" disabled={isLoading}>
                    {getButtonText()}
                </button>
            </div>

            {mode === 'single' && !result && !isLoading && (
                <PopularSuggestions searchType={searchType} onSelect={handleSuggestionSelect} />
            )}
        </form>

        <div className="mt-6">
            {isLoading && <LoadingSpinner />}
            {!isLoading && !result && !comparisonResult && <InitialStateDisplay searchType={searchType} mode={mode} />}
            <Suspense fallback={<LoadingSpinner />}>
                {mode === 'single' && !isLoading && result && searchType !== SearchType.REFORMA_TRIBUTARIA && (
                    <>
                        <ResultsDisplay 
                            result={result} 
                            error={error} 
                            onStartCompare={handleStartCompare} 
                            isFavorite={currentResultIsFavorite} 
                            onToggleFavorite={handleToggleFavorite} 
                            onError={setError}
                            searchType={searchType}
                            onFindSimilar={handleFetchSimilarServices}
                        />
                        <SimilarServicesDisplay 
                            services={similarServices}
                            isLoading={isLoadingSimilar}
                            error={errorSimilar}
                            onSelectService={handleSimilarServiceSelect}
                        />
                    </>
                )}
                {mode === 'single' && !isLoading && result && searchType === SearchType.REFORMA_TRIBUTARIA && <ReformaResultDisplay result={result} isFavorite={currentResultIsFavorite} onToggleFavorite={handleToggleFavorite} />}
                {mode === 'compare' && !isLoading && comparisonResult && <ComparisonDisplay result={comparisonResult} />}
            </Suspense>
            {error && !isLoading && (
                    <div className="mt-6 p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30 rounded-lg text-red-700 dark:text-red-300">
                    <p className="font-semibold">Ocorreu um erro</p>
                    <p>{error}</p>
                </div>
            )}
        </div>
        
        <TaxAlerts results={searchResultsForAlerts} searchType={searchType} />
        <NewsAlerts />
        </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors font-sans">
        <div className="container mx-auto px-4 max-w-7xl">
            <Header 
                theme={theme} 
                toggleTheme={toggleTheme} 
                onMenuClick={() => setIsSidebarOpen(true)} 
                description={searchDescriptions[searchType]}
            />
            
            <div className="flex flex-col md:flex-row gap-6">
                <main className="flex-grow min-w-0">
                    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
                        <div className="flex-wrap bg-slate-200 dark:bg-slate-800 p-1 rounded-lg flex">
                            {searchTypes.map(type => (
                                <button key={type} onClick={() => handleTypeChange(type)} className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors ${searchType === type ? 'bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-400 shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'}`}>
                                    {type}
                                </button>
                            ))}
                        </div>
                    </div>
                    {renderMainContent()}
                </main>

                <FavoritesSidebar
                    isOpen={isSidebarOpen}
                    onClose={() => setIsSidebarOpen(false)}
                    favorites={favorites}
                    onFavoriteRemove={(f) => saveFavorites(f)}
                    onFavoriteSelect={handleFavoriteSelect}
                    history={history}
                    onHistorySelect={handleHistorySelect}
                    onHistoryRemove={handleHistoryRemove}
                    onHistoryClear={handleHistoryClear}
                />
            </div>
            <Footer />
        </div>
    </div>
  );
};
export default App;
