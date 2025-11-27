import React, { useState, useCallback, useRef, useEffect, useMemo, Suspense, lazy } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import LoadingSpinner from './components/LoadingSpinner';
import LoginScreen from './components/LoginScreen';
import TaxAlerts from './components/TaxAlerts';
import NewsAlerts from './components/NewsAlerts';
import FavoritesSidebar from './components/FavoritesSidebar';
import SimplesNacionalDashboard from './components/SimplesNacionalDashboard';
import SimplesNacionalNovaEmpresa from './components/SimplesNacionalNovaEmpresa';
import InitialStateDisplay from './components/InitialStateDisplay';
import SimilarServicesDisplay from './components/SimilarServicesDisplay';
import AccessLogsModal from './components/AccessLogsModal';
import UserManagementModal from './components/UserManagementModal';
import { PopularSuggestions } from './components/PopularSuggestions';
import Tooltip from './components/Tooltip';
import Toast from './components/Toast';
import { SearchType, type SearchResult, type ComparisonResult, type FavoriteItem, type HistoryItem, type SimilarService, type CnaeSuggestion, SimplesNacionalEmpresa, SimplesNacionalNota, SimplesNacionalAnexo, SimplesNacionalImportResult, SimplesNacionalAtividade, User } from './types';
import { fetchFiscalData, fetchComparison, fetchSimilarServices, fetchCnaeSuggestions } from './services/geminiService';
import * as simplesService from './services/simplesNacionalService';
import * as authService from './services/authService';
import { BuildingIcon, CalculatorIcon, ChevronDownIcon, DocumentTextIcon, LocationIcon, SearchIcon, TagIcon, UserIcon, InfoIcon } from './components/Icons';
import { auth, isFirebaseConfigured } from './services/firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';

const SimplesNacionalDetalhe = lazy(() => import('./components/SimplesNacionalDetalhe'));
const SimplesNacionalClienteView = lazy(() => import('./components/SimplesNacionalClienteView'));
const ResultsDisplay = lazy(() => import('./components/ResultsDisplay'));
const ComparisonDisplay = lazy(() => import('./components/ComparisonDisplay'));
const ReformaResultDisplay = lazy(() => import('./components/ReformaResultDisplay'));
const LucroPresumidoRealDashboard = lazy(() => import('./components/LucroPresumidoRealDashboard'));

const searchDescriptions: Record<SearchType, string> = {
    [SearchType.CFOP]: "Consulte códigos de operação e entenda a aplicação e tributação.",
    [SearchType.NCM]: "Classificação fiscal de mercadorias e incidência de impostos (IPI, ICMS).",
    [SearchType.SERVICO]: "Análise de retenção de ISS, local de incidência e alíquotas.",
    [SearchType.REFORMA_TRIBUTARIA]: "Simule o impacto da Reforma Tributária (IBS/CBS) para sua atividade.",
    [SearchType.SIMPLES_NACIONAL]: "Gestão de empresas do Simples, cálculo de DAS e Fator R.",
    [SearchType.LUCRO_PRESUMIDO_REAL]: "Ficha Financeira e Cadastro para Lucro Presumido/Real.",
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

  // Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLogsModalOpen, setIsLogsModalOpen] = useState(false);
  const [isUsersModalOpen, setIsUsersModalOpen] = useState(false);

  const [searchType, setSearchType] = useState<SearchType>(SearchType.CFOP);
  const [mode, setMode] = useState<'single' | 'compare'>('single');
  const [query1, setQuery1] = useState('');
  const [query2, setQuery2] = useState('');
  
  const [cnae, setCnae] = useState('');
  const [cnae2, setCnae2] = useState('');
  const [reformaQuery, setReformaQuery] = useState('');

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
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const [similarServices, setSimilarServices] = useState<SimilarService[] | null>(null);
  const [isLoadingSimilar, setIsLoadingSimilar] = useState(false);
  const [errorSimilar, setErrorSimilar] = useState<string | null>(null);
  
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
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
  
  const loadSimplesData = async (user?: User | null) => {
      try {
          const empresas = await simplesService.getEmpresas(user || currentUser);
          const notas = await simplesService.getAllNotas();
          setSimplesEmpresas(empresas);
          setSimplesNotas(notas);
      } catch (e) {
          console.error("Erro ao carregar dados do Simples", e);
      }
  };

  useEffect(() => {
    try {
        const user = authService.getCurrentUser();
        setCurrentUser(user);

        const storedFavorites = localStorage.getItem('fiscal-consultant-favorites');
        if (storedFavorites) setFavorites(JSON.parse(storedFavorites));

        const storedHistory = localStorage.getItem('fiscal-consultant-history');
        if (storedHistory) setHistory(JSON.parse(storedHistory));

        if (isFirebaseConfigured && auth) {
            const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
                if (firebaseUser) {
                    // Recover user profile from DB or Auth data securely
                    const syncedUser = await authService.syncUserFromAuth(firebaseUser);
                    setCurrentUser(syncedUser);
                    loadSimplesData(syncedUser);
                }
            });
            return () => unsubscribe();
        } else {
            if(user) loadSimplesData(user);
        }
    } catch (e) {
        console.error("Initialization error", e);
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

  const handleLoginSuccess = (user: User) => {
      setCurrentUser(user);
      loadSimplesData(user); 
  };

  const handleLogout = () => {
      authService.logout();
      setCurrentUser(null);
      setSimplesEmpresas([]);
  };

  const handleSelectHistoryItem = (item: HistoryItem) => {
      setSearchType(item.type);
      setMode(item.mode);
      setMunicipio(item.municipio || '');
      setAlias(item.alias || '');
      setResponsavel(item.responsavel || '');
      setRegimeTributario(item.regimeTributario || '');
      setReformaQuery(item.reformaQuery || '');
      
      if (item.type === SearchType.REFORMA_TRIBUTARIA) {
          if (item.mode === 'single') {
              setReformaQuery(item.queries[0]);
          } else {
              setCnae(item.queries[0]);
              setCnae2(item.queries[1]);
          }
      } else {
          setQuery1(item.queries[0]);
          if (item.mode === 'compare' && item.queries[1]) {
              setQuery2(item.queries[1]);
          }
      }
      handleSearch(item.queries[0], item.queries[1]);
      if(window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const handleHistoryRemove = (id: string) => {
      const newHistory = history.filter(item => item.id !== id);
      setHistory(newHistory);
      localStorage.setItem('fiscal-consultant-history', JSON.stringify(newHistory));
  };

  const handleHistoryClear = () => {
      setHistory([]);
      localStorage.removeItem('fiscal-consultant-history');
  };

  const addHistory = (item: Omit<HistoryItem, 'id' | 'timestamp'>) => {
      const newHistoryItem: HistoryItem = {
          ...item,
          id: Date.now().toString(),
          timestamp: Date.now(),
      };
      const updatedHistory = [newHistoryItem, ...history].slice(0, 50);
      setHistory(updatedHistory);
      localStorage.setItem('fiscal-consultant-history', JSON.stringify(updatedHistory));
  };

  const handleSelectFavorite = (item: FavoriteItem) => {
      setSearchType(item.type);
      setMode('single');
      if (item.type === SearchType.REFORMA_TRIBUTARIA) {
          setReformaQuery(item.code);
      } else {
          setQuery1(item.code);
      }
      handleSearch(item.code);
      if(window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const saveFavorites = (newFavorites: FavoriteItem[]) => {
      setFavorites(newFavorites);
      localStorage.setItem('fiscal-consultant-favorites', JSON.stringify(newFavorites));
  };

  const handleToggleFavorite = () => {
      if (!result) return;
      const code = searchType === SearchType.REFORMA_TRIBUTARIA ? result.query : query1; 
      const description = result.text.split('\n')[0].substring(0, 50) + '...';
      
      const existingIndex = favorites.findIndex(f => f.code === code && f.type === searchType);
      
      let newFavorites;
      if (existingIndex >= 0) {
          newFavorites = favorites.filter((_, i) => i !== existingIndex);
          setToastMessage("Favorito removido com sucesso!");
      } else {
          newFavorites = [...favorites, { code, description, type: searchType }];
          setToastMessage("Adicionado aos Favoritos!");
      }
      saveFavorites(newFavorites);
  };

  // Auxiliar para formatar erros amigáveis
  const getFriendlyErrorMessage = (error: any): string => {
      const message = error?.message || '';
      
      if (message.includes('429') || message.includes('Quota exceeded')) {
          return "Limite de consultas excedido (Erro 429). A IA está sobrecarregada ou sua cota acabou. Por favor, aguarde alguns instantes antes de tentar novamente.";
      }
      
      if (message.includes('503') || message.includes('Service Unavailable')) {
          return "O serviço de IA está temporariamente indisponível (Erro 503). Isso geralmente é passageiro. Tente novamente em alguns minutos.";
      }
      
      if (message.includes('400') || message.includes('Invalid argument')) {
          return "A consulta parece inválida ou incompleta (Erro 400). Verifique os dados digitados e tente novamente.";
      }
      
      if (message.includes('500')) {
          return "Erro interno no servidor da IA (Erro 500). Por favor, tente novamente.";
      }
      
      if (message.includes('Failed to fetch')) {
          return "Erro de conexão. Verifique sua internet.";
      }

      return message || "Ocorreu um erro inesperado ao comunicar com a API.";
  };

  const validateInputs = (q1: string, q2?: string) => {
      const errors: Record<string, string> = {};
      if (!q1.trim()) {
          errors.query1 = "O campo de busca é obrigatório.";
      }
      if (mode === 'compare' && q2 !== undefined && !q2.trim()) {
          errors.query2 = "O segundo campo é obrigatório para comparação.";
      }
      
      const validateRate = (rate: string, fieldName: string) => {
          if (rate) {
              const num = parseFloat(rate);
              if (isNaN(num) || num < 0 || num > 100) {
                  errors[fieldName] = "Alíquota inválida (0-100).";
              }
          }
      };

      validateRate(aliquotaIcms, 'aliquotaIcms');
      validateRate(aliquotaPisCofins, 'aliquotaPisCofins');
      validateRate(aliquotaIss, 'aliquotaIss');

      setValidationErrors(errors);
      return Object.keys(errors).length === 0;
  };

  const handleSearch = useCallback(async (currentQuery1: string, currentQuery2?: string) => {
    if (isLoading) return; // Prevent double submission
    if (!validateInputs(currentQuery1, currentQuery2)) return;

    setIsLoading(true);
    setError(null);
    setResult(null);
    setComparisonResult(null);
    
    if (currentUser) authService.logAction(currentUser.id, currentUser.name, 'search', `${searchType}: ${currentQuery1}`);

    try {
      if (mode === 'compare' && currentQuery2) {
          const data = await fetchComparison(searchType, currentQuery1, currentQuery2);
          setComparisonResult(data);
          addHistory({
              queries: [currentQuery1, currentQuery2],
              type: searchType,
              mode: 'compare'
          });
      } else {
          const data = await fetchFiscalData(
              searchType, 
              currentQuery1, 
              municipio, 
              alias, 
              responsavel, 
              undefined, 
              regimeTributario, 
              undefined,
              aliquotaIcms,
              aliquotaPisCofins,
              aliquotaIss
          );
          setResult(data);
          addHistory({
              queries: [currentQuery1],
              type: searchType,
              mode: 'single',
              municipio,
              alias,
              responsavel,
              regimeTributario,
              aliquotaIcms,
              aliquotaPisCofins,
              aliquotaIss
          });
      }
    } catch (err) {
      const msg = getFriendlyErrorMessage(err);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [searchType, mode, municipio, alias, responsavel, regimeTributario, currentUser, aliquotaIcms, aliquotaPisCofins, aliquotaIss, isLoading]);

  const handleReformaSearch = useCallback(async (query: string) => {
      if (isLoading) return;
      if (!query.trim()) {
          setValidationErrors({ reformaQuery: "Digite um termo para pesquisar." });
          return;
      }
      setValidationErrors({});
      setIsLoading(true);
      setError(null);
      setResult(null);
      
      if (currentUser) authService.logAction(currentUser.id, currentUser.name, 'search_reforma', query);

      try {
          const data = await fetchFiscalData(SearchType.REFORMA_TRIBUTARIA, query, undefined, undefined, undefined, query);
          setResult(data);
          addHistory({
              queries: [query],
              type: SearchType.REFORMA_TRIBUTARIA,
              mode: 'single',
              reformaQuery: query
          });
      } catch (err) {
          const msg = getFriendlyErrorMessage(err);
          setError(msg);
      } finally {
          setIsLoading(false);
      }
  }, [currentUser, isLoading]);

  const handleFindSimilar = async () => {
      if (!result || searchType !== SearchType.SERVICO) return;
      setIsLoadingSimilar(true);
      setErrorSimilar(null);
      try {
          const similar = await fetchSimilarServices(result.query);
          setSimilarServices(similar);
      } catch (e) {
          setErrorSimilar("Não foi possível buscar serviços similares.");
      } finally {
          setIsLoadingSimilar(false);
      }
  };

  // Simples Nacional Handlers
  const handleSaveSimplesEmpresa = async (nome: string, cnpj: string, cnae: string, anexo: any, atividadesSecundarias?: any[]) => {
      if (!currentUser) return;
      const newEmpresa = await simplesService.saveEmpresa(nome, cnpj, cnae, anexo, atividadesSecundarias || [], currentUser.id);
      setSimplesEmpresas(prev => [...prev, newEmpresa]);
      if (currentUser) authService.logAction(currentUser.id, currentUser.name, 'create_empresa', nome);
      setSimplesView('dashboard');
  };

  const handleImportNotas = async (empresaId: string, file: File): Promise<SimplesNacionalImportResult> => {
      try {
          const result = await simplesService.parseAndSaveNotas(empresaId, file);
          const notas = await simplesService.getAllNotas();
          const empresas = await simplesService.getEmpresas(currentUser);
          setSimplesNotas(notas);
          setSimplesEmpresas(empresas); 
          if (currentUser) authService.logAction(currentUser.id, currentUser.name, 'import_notas', empresaId);
          return result;
      } catch (e: any) {
          return { successCount: 0, failCount: 0, errors: [e.message] };
      }
  };

  const handleUpdateFolha12 = (empresaId: string, val: number) => {
      simplesService.updateFolha12(empresaId, val);
      const updated = simplesEmpresas.map(e => e.id === empresaId ? { ...e, folha12: val } : e);
      setSimplesEmpresas(updated);
      return updated.find(e => e.id === empresaId) || null;
  };

  const handleSaveFaturamentoManual = (empresaId: string, faturamento: any) => {
      simplesService.saveFaturamentoManual(empresaId, faturamento);
      const updated = simplesEmpresas.map(e => e.id === empresaId ? { ...e, faturamentoManual: faturamento } : e);
      setSimplesEmpresas(updated);
      return updated.find(e => e.id === empresaId) || null;
  };
  
  const handleUpdateEmpresa = (empresaId: string, data: Partial<SimplesNacionalEmpresa>) => {
      simplesService.updateEmpresa(empresaId, data);
      const updated = simplesEmpresas.map(e => e.id === empresaId ? { ...e, ...data } : e);
      setSimplesEmpresas(updated);
      return updated.find(e => e.id === empresaId) || null;
  }

  const isFavorite = useMemo(() => {
      const code = searchType === SearchType.REFORMA_TRIBUTARIA ? reformaQuery : query1;
      return favorites.some(f => f.code === code && f.type === searchType);
  }, [favorites, searchType, query1, reformaQuery]);

  if (!currentUser) {
      return (
        <>
          <LoginScreen onLoginSuccess={handleLoginSuccess} />
          <div className="fixed bottom-4 right-4 flex gap-2">
             <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} className="p-2 bg-white dark:bg-slate-800 rounded-full shadow-lg">
                {theme === 'light' ? '🌙' : '☀️'}
             </button>
          </div>
        </>
      );
  }

  const selectedEmpresa = simplesEmpresas.find(e => e.id === selectedSimplesEmpresaId);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors font-sans">
        <div className="container mx-auto px-4 max-w-7xl">
            <Header 
                theme={theme} 
                toggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')} 
                onMenuClick={() => setIsSidebarOpen(true)} 
                description={searchDescriptions[searchType]}
                user={currentUser}
                onLogout={handleLogout}
                onShowLogs={currentUser.role === 'admin' ? () => setIsLogsModalOpen(true) : undefined}
                onShowUsers={currentUser.role === 'admin' ? () => setIsUsersModalOpen(true) : undefined}
            />
            
            <div className="flex flex-col md:flex-row gap-6">
                <main className="flex-grow min-w-0">
                    {/* Search Type Selection Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 mb-8">
                        {Object.values(SearchType).map((type) => (
                            <button
                                key={type}
                                onClick={() => { 
                                    setSearchType(type); 
                                    setResult(null); 
                                    setQuery1(''); 
                                    setQuery2(''); 
                                    setError(null);
                                    setValidationErrors({});
                                    if (type === SearchType.SIMPLES_NACIONAL) {
                                        setSimplesView('dashboard');
                                        loadSimplesData(currentUser);
                                    }
                                }}
                                className={`
                                    flex flex-col items-center justify-center p-3 rounded-xl border transition-all duration-200
                                    ${searchType === type 
                                        ? 'bg-sky-600 text-white border-sky-600 shadow-md scale-105' 
                                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-sky-300 hover:bg-sky-50 dark:hover:bg-slate-700'
                                    }
                                `}
                            >
                                <div className="mb-2">
                                    {type === SearchType.CFOP && <TagIcon className="w-5 h-5" />}
                                    {type === SearchType.NCM && <DocumentTextIcon className="w-5 h-5" />}
                                    {type === SearchType.SERVICO && <BuildingIcon className="w-5 h-5" />}
                                    {type === SearchType.REFORMA_TRIBUTARIA && <CalculatorIcon className="w-5 h-5" />}
                                    {type === SearchType.SIMPLES_NACIONAL && <CalculatorIcon className="w-5 h-5" />}
                                    {type === SearchType.LUCRO_PRESUMIDO_REAL && <BuildingIcon className="w-5 h-5" />}
                                </div>
                                <span className="text-xs font-bold text-center leading-tight">{type}</span>
                            </button>
                        ))}
                    </div>

                    {/* Standard Search Views (CFOP, NCM, Serviço) */}
                    {[SearchType.CFOP, SearchType.NCM, SearchType.SERVICO].includes(searchType) && (
                        <>
                            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm mb-6 animate-fade-in">
                                <div className="flex items-center gap-4 mb-4">
                                    <button 
                                        onClick={() => setMode('single')}
                                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${mode === 'single' ? 'bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                                    >
                                        Consulta Individual
                                    </button>
                                    <button 
                                        onClick={() => setMode('compare')}
                                        className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors ${mode === 'compare' ? 'bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                                    >
                                        Comparar Códigos
                                    </button>
                                </div>

                                <div className="flex flex-col md:flex-row gap-4">
                                    <div className="flex-grow relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <SearchIcon className="h-5 w-5 text-slate-400" />
                                        </div>
                                        <input
                                            type="text"
                                            value={query1}
                                            onChange={(e) => { setQuery1(e.target.value); if(validationErrors.query1) setValidationErrors({...validationErrors, query1: ''}); }}
                                            onKeyDown={(e) => e.key === 'Enter' && handleSearch(query1, query2)}
                                            placeholder={mode === 'single' ? `Digite o código ou descrição do ${searchType}` : `Primeiro código ${searchType}`}
                                            className={`w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none transition-all text-slate-900 font-bold dark:text-white dark:font-normal ${validationErrors.query1 ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                                            aria-label="Campo de busca principal"
                                            aria-invalid={!!validationErrors.query1}
                                            aria-describedby="query1-error"
                                        />
                                        {validationErrors.query1 && <p id="query1-error" className="text-xs text-red-500 mt-1">{validationErrors.query1}</p>}
                                    </div>
                                    
                                    {mode === 'compare' && (
                                        <div className="flex-grow relative animate-fade-in">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <SearchIcon className="h-5 w-5 text-slate-400" />
                                            </div>
                                            <input
                                                type="text"
                                                value={query2}
                                                onChange={(e) => { setQuery2(e.target.value); if(validationErrors.query2) setValidationErrors({...validationErrors, query2: ''}); }}
                                                onKeyDown={(e) => e.key === 'Enter' && handleSearch(query1, query2)}
                                                placeholder={`Segundo código ${searchType}`}
                                                className={`w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none transition-all text-slate-900 font-bold dark:text-white dark:font-normal ${validationErrors.query2 ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                                                aria-label="Segundo campo de busca para comparação"
                                            />
                                            {validationErrors.query2 && <p className="text-xs text-red-500 mt-1">{validationErrors.query2}</p>}
                                        </div>
                                    )}
                                    
                                    <button
                                        onClick={() => handleSearch(query1, query2)}
                                        disabled={isLoading}
                                        className="btn-press px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 min-w-[120px]"
                                    >
                                        {isLoading ? (
                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <span>Consultar</span>
                                        )}
                                    </button>
                                </div>

                                {/* Optional Context Inputs for Service Analysis */}
                                {searchType === SearchType.SERVICO && (
                                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="text-xs font-bold text-slate-500 uppercase">Município Prestador</label>
                                            <input type="text" value={municipio} onChange={e => setMunicipio(e.target.value)} className="w-full mt-1 p-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-slate-900 font-bold dark:text-white dark:font-normal" placeholder="Ex: São Paulo" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-500 uppercase">Tomador (Opcional)</label>
                                            <input type="text" value={alias} onChange={e => setAlias(e.target.value)} className="w-full mt-1 p-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-slate-900 font-bold dark:text-white dark:font-normal" placeholder="Ex: Empresa X" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-500 uppercase">Regime (Opcional)</label>
                                            <select value={regimeTributario} onChange={e => setRegimeTributario(e.target.value)} className="w-full mt-1 p-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-slate-900 font-bold dark:text-white dark:font-normal">
                                                <option value="">Selecione</option>
                                                <option value="simples">Simples Nacional</option>
                                                <option value="lucro_presumido">Lucro Presumido</option>
                                                <option value="lucro_real">Lucro Real</option>
                                            </select>
                                        </div>
                                    </div>
                                )}
                                
                                {/* Optional Tax Rates */}
                                {[SearchType.CFOP, SearchType.NCM, SearchType.SERVICO].includes(searchType) && (
                                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                                        <p className="text-xs font-bold text-sky-600 dark:text-sky-400 mb-2 uppercase flex items-center gap-2">
                                            Refinar Análise com Alíquotas (Opcional)
                                            <Tooltip content="Informe as alíquotas para um cálculo mais preciso dos impostos.">
                                                <InfoIcon className="w-4 h-4 text-sky-400 cursor-help" />
                                            </Tooltip>
                                        </p>
                                        <div className="grid grid-cols-3 gap-4">
                                            <div>
                                                <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                                                    ICMS (%)
                                                    <Tooltip content="Alíquota do ICMS (Imposto sobre Circulação de Mercadorias).">
                                                        <InfoIcon className="w-3 h-3 text-slate-400 cursor-help" />
                                                    </Tooltip>
                                                </label>
                                                <input 
                                                    type="number" 
                                                    min="0" 
                                                    max="100"
                                                    value={aliquotaIcms} 
                                                    onChange={e => { setAliquotaIcms(e.target.value); if(validationErrors.aliquotaIcms) setValidationErrors({...validationErrors, aliquotaIcms: ''}); }}
                                                    className={`w-full mt-1 p-2 text-sm bg-slate-50 dark:bg-slate-900 border rounded text-slate-900 font-bold dark:text-white dark:font-normal ${validationErrors.aliquotaIcms ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                                                    placeholder="0.00" 
                                                    aria-label="Alíquota ICMS"
                                                />
                                                {validationErrors.aliquotaIcms && <p className="text-[10px] text-red-500 mt-1">{validationErrors.aliquotaIcms}</p>}
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                                                    PIS/COFINS (%)
                                                    <Tooltip content="Alíquota combinada de PIS e COFINS.">
                                                        <InfoIcon className="w-3 h-3 text-slate-400 cursor-help" />
                                                    </Tooltip>
                                                </label>
                                                <input 
                                                    type="number" 
                                                    min="0" 
                                                    max="100"
                                                    value={aliquotaPisCofins} 
                                                    onChange={e => { setAliquotaPisCofins(e.target.value); if(validationErrors.aliquotaPisCofins) setValidationErrors({...validationErrors, aliquotaPisCofins: ''}); }}
                                                    className={`w-full mt-1 p-2 text-sm bg-slate-50 dark:bg-slate-900 border rounded text-slate-900 font-bold dark:text-white dark:font-normal ${validationErrors.aliquotaPisCofins ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                                                    placeholder="0.00" 
                                                    aria-label="Alíquota PIS e COFINS"
                                                />
                                                {validationErrors.aliquotaPisCofins && <p className="text-[10px] text-red-500 mt-1">{validationErrors.aliquotaPisCofins}</p>}
                                            </div>
                                            <div>
                                                <label className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">
                                                    ISS (%)
                                                    <Tooltip content="Alíquota do ISS (Imposto Sobre Serviços).">
                                                        <InfoIcon className="w-3 h-3 text-slate-400 cursor-help" />
                                                    </Tooltip>
                                                </label>
                                                <input 
                                                    type="number" 
                                                    min="0" 
                                                    max="100"
                                                    value={aliquotaIss} 
                                                    onChange={e => { setAliquotaIss(e.target.value); if(validationErrors.aliquotaIss) setValidationErrors({...validationErrors, aliquotaIss: ''}); }}
                                                    className={`w-full mt-1 p-2 text-sm bg-slate-50 dark:bg-slate-900 border rounded text-slate-900 font-bold dark:text-white dark:font-normal ${validationErrors.aliquotaIss ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                                                    placeholder="0.00" 
                                                    aria-label="Alíquota ISS"
                                                />
                                                {validationErrors.aliquotaIss && <p className="text-[10px] text-red-500 mt-1">{validationErrors.aliquotaIss}</p>}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* Reforma Tributária View */}
                    {searchType === SearchType.REFORMA_TRIBUTARIA && (
                        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm mb-6 animate-fade-in">
                            <div className="flex flex-col md:flex-row gap-4">
                                <div className="flex-grow">
                                    <input
                                        type="text"
                                        value={reformaQuery}
                                        onChange={(e) => setReformaQuery(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleReformaSearch(reformaQuery)}
                                        placeholder="Digite o CNAE ou descrição da atividade..."
                                        className={`w-full pl-4 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border rounded-lg focus:ring-2 focus:ring-sky-500 outline-none text-slate-900 font-bold dark:text-white dark:font-normal ${validationErrors.reformaQuery ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'}`}
                                        aria-label="Busca Reforma Tributária"
                                    />
                                    {validationErrors.reformaQuery && <p className="text-xs text-red-500 mt-1">{validationErrors.reformaQuery}</p>}
                                </div>
                                <button
                                    onClick={() => handleReformaSearch(reformaQuery)}
                                    disabled={isLoading}
                                    className="btn-press px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-lg shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-w-[120px]"
                                >
                                    {isLoading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <span>Analisar Impacto</span>}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Simples Nacional Views */}
                    {searchType === SearchType.SIMPLES_NACIONAL && (
                        <Suspense fallback={<LoadingSpinner />}>
                            {simplesView === 'dashboard' && (
                                <SimplesNacionalDashboard 
                                    empresas={simplesEmpresas} 
                                    notas={simplesNotas}
                                    onSelectEmpresa={(id, view) => { setSelectedSimplesEmpresaId(id); setSimplesView(view); }} 
                                    onAddNew={() => setSimplesView('nova')}
                                />
                            )}
                            {simplesView === 'nova' && (
                                <SimplesNacionalNovaEmpresa 
                                    onSave={handleSaveSimplesEmpresa} 
                                    onCancel={() => setSimplesView('dashboard')} 
                                />
                            )}
                            {simplesView === 'detalhe' && selectedEmpresa && (
                                <SimplesNacionalDetalhe 
                                    empresa={selectedEmpresa}
                                    notas={simplesNotas[selectedEmpresa.id] || []}
                                    onBack={() => setSimplesView('dashboard')}
                                    onImport={handleImportNotas}
                                    onUpdateFolha12={handleUpdateFolha12}
                                    onSaveFaturamentoManual={handleSaveFaturamentoManual}
                                    onUpdateEmpresa={handleUpdateEmpresa}
                                    onShowClienteView={() => setSimplesView('cliente')}
                                />
                            )}
                            {simplesView === 'cliente' && selectedEmpresa && (
                                <SimplesNacionalClienteView
                                    empresa={selectedEmpresa}
                                    notas={simplesNotas[selectedEmpresa.id] || []}
                                    onBack={() => setSimplesView('dashboard')}
                                />
                            )}
                        </Suspense>
                    )}

                    {/* Lucro Presumido View */}
                    {searchType === SearchType.LUCRO_PRESUMIDO_REAL && (
                        <Suspense fallback={<LoadingSpinner />}>
                            <LucroPresumidoRealDashboard currentUser={currentUser} />
                        </Suspense>
                    )}

                    {/* Results Display */}
                    <Suspense fallback={<LoadingSpinner />}>
                        {!result && !comparisonResult && ![SearchType.SIMPLES_NACIONAL, SearchType.LUCRO_PRESUMIDO_REAL].includes(searchType) && (
                            <InitialStateDisplay searchType={searchType} mode={mode} />
                        )}

                        {comparisonResult && (
                            <ComparisonDisplay result={comparisonResult} />
                        )}

                        {result && searchType === SearchType.REFORMA_TRIBUTARIA && (
                            <ReformaResultDisplay 
                                result={result} 
                                isFavorite={isFavorite}
                                onToggleFavorite={handleToggleFavorite}
                            />
                        )}

                        {result && searchType !== SearchType.REFORMA_TRIBUTARIA && (
                            <ResultsDisplay 
                                result={result} 
                                error={error} 
                                onStartCompare={() => { setMode('compare'); setQuery2(''); }}
                                isFavorite={isFavorite}
                                onToggleFavorite={handleToggleFavorite}
                                onError={(msg) => setError(msg)}
                                searchType={searchType}
                                onFindSimilar={handleFindSimilar}
                                onShowToast={(msg) => setToastMessage(msg)}
                            />
                        )}
                    </Suspense>

                    <SimilarServicesDisplay 
                        services={similarServices} 
                        isLoading={isLoadingSimilar} 
                        error={errorSimilar}
                        onSelectService={(code) => { setQuery1(code); handleSearch(code); }}
                    />

                    {[SearchType.CFOP, SearchType.NCM, SearchType.SERVICO, SearchType.REFORMA_TRIBUTARIA].includes(searchType) && !result && (
                        <PopularSuggestions searchType={searchType} onSelect={(code) => { 
                            if (searchType === SearchType.REFORMA_TRIBUTARIA) setReformaQuery(code);
                            else setQuery1(code); 
                        }} />
                    )}

                    {![SearchType.SIMPLES_NACIONAL, SearchType.LUCRO_PRESUMIDO_REAL].includes(searchType) && (
                        <NewsAlerts />
                    )}
                    
                    {searchType !== SearchType.SIMPLES_NACIONAL && searchType !== SearchType.LUCRO_PRESUMIDO_REAL && (
                        <TaxAlerts results={result ? [result] : []} searchType={searchType} />
                    )}
                </main>

                {/* Sidebar */}
                <FavoritesSidebar 
                    favorites={favorites} 
                    onFavoriteRemove={saveFavorites} 
                    onFavoriteSelect={handleSelectFavorite}
                    history={history}
                    onHistorySelect={handleSelectHistoryItem}
                    onHistoryRemove={handleHistoryRemove}
                    onHistoryClear={handleHistoryClear}
                    isOpen={isSidebarOpen}
                    onClose={() => setIsSidebarOpen(false)}
                />
            </div>
            <Footer />
        </div>

        {/* Global Toast Notification */}
        {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}

        {/* Modals */}
        <AccessLogsModal isOpen={isLogsModalOpen} onClose={() => setIsLogsModalOpen(false)} />
        <UserManagementModal 
            isOpen={isUsersModalOpen} 
            onClose={() => setIsUsersModalOpen(false)} 
            currentUserEmail={currentUser.email}
        />
    </div>
  );
};

export default App;