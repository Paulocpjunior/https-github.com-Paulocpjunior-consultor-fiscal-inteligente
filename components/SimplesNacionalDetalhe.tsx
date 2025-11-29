import React, { useState, useMemo, useEffect, useRef } from 'react';
import { SimplesNacionalEmpresa, SimplesNacionalNota, SimplesNacionalImportResult, CnaeTaxDetail, SimplesHistoricoCalculo, DetalhamentoAnexo, SimplesNacionalResumo, SimplesNacionalAtividade, CnaeSuggestion, SimplesItemCalculo, User } from '../types';
import * as simplesService from '../services/simplesNacionalService';
import { ANEXOS_TABELAS, REPARTICAO_IMPOSTOS } from '../services/simplesNacionalService';
import { fetchCnaeTaxDetails, fetchCnaeSuggestions, fetchCnaeDescription } from '../services/geminiService';
import { ArrowLeftIcon, CalculatorIcon, DownloadIcon, SaveIcon, UserIcon, InfoIcon, PlusIcon, TrashIcon, CloseIcon, ShieldIcon, HistoryIcon, DocumentTextIcon, CopyIcon, PencilIcon, SearchIcon, AnimatedCheckIcon } from './Icons';
import LoadingSpinner from './LoadingSpinner';
import SimpleChart from './SimpleChart';
import Tooltip from './Tooltip';
import { FormattedText } from './FormattedText';

interface SimplesNacionalDetalheProps {
    empresa: SimplesNacionalEmpresa;
    notas: SimplesNacionalNota[];
    onBack: () => void;
    onImport: (empresaId: string, file: File) => Promise<SimplesNacionalImportResult>;
    onUpdateFolha12: (id: string, value: number) => void;
    onSaveFaturamentoManual: (id: string, faturamento: any, faturamentoDetalhado: any) => Promise<void> | void;
    onUpdateEmpresa: (id: string, data: Partial<SimplesNacionalEmpresa>) => void;
    onShowClienteView: () => void;
    onShowToast?: (msg: string) => void;
    currentUser?: User | null;
}

interface CnaeInputState {
    valor: string;
    issRetido: boolean;
    icmsSt: boolean;
    isSup: boolean; // Sociedade Uniprofissional (ISS Fixo)
}

type TabType = 'calculo' | 'analise' | 'historico_salvo';

// Componente Input de Moeda Reutilizável
const CurrencyInput: React.FC<{ 
    value: number; 
    onChange: (val: number) => void; 
    label?: string; 
    className?: string;
    error?: string;
    tooltip?: string;
    placeholder?: string;
    disabled?: boolean;
}> = ({ value, onChange, label, className, error, tooltip, placeholder, disabled }) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value.replace(/\D/g, '');
        const num = parseFloat(raw) / 100;
        onChange(isNaN(num) ? 0 : num);
    };

    const formatted = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(value);

    return (
        <div className={className}>
            {label && (
                <label className="flex items-center gap-1 text-xs font-bold text-slate-500 uppercase mb-1">
                    {label}
                    {tooltip && (
                        <Tooltip content={tooltip}>
                            <InfoIcon className="w-3 h-3 text-slate-400 cursor-help" />
                        </Tooltip>
                    )}
                </label>
            )}
            <div className="relative">
                {!disabled && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">R$</span>}
                <input 
                    type="text" 
                    value={value === 0 && placeholder && !disabled ? '' : formatted} 
                    onChange={handleChange} 
                    placeholder={placeholder}
                    disabled={disabled}
                    className={`w-full ${!disabled ? 'pl-9' : 'pl-3'} pr-3 py-2 bg-white dark:bg-slate-700 border rounded-lg focus:ring-2 focus:ring-sky-500 outline-none text-slate-900 font-bold dark:text-white dark:font-normal text-right ${error ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 dark:border-slate-600'} ${disabled ? 'bg-slate-100 dark:bg-slate-800 text-slate-500' : ''}`}
                    aria-label={label || "Valor monetário"}
                    aria-invalid={!!error}
                />
            </div>
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        </div>
    );
};

const SimplesNacionalDetalhe: React.FC<SimplesNacionalDetalheProps> = ({ 
    empresa, notas, onBack, onImport, onUpdateFolha12, onSaveFaturamentoManual, onUpdateEmpresa, onShowClienteView, onShowToast, currentUser
}) => {
    const [activeTab, setActiveTab] = useState<TabType>('calculo');
    const [mesApuracao, setMesApuracao] = useState(new Date());
    const [folha12Input, setFolha12Input] = useState(empresa.folha12);
    const [isImporting, setIsImporting] = useState(false);
    const [importResult, setImportResult] = useState<SimplesNacionalImportResult | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    
    // Novo estado complexo para suportar valor + checkboxes por CNAE
    const [faturamentoPorCnae, setFaturamentoPorCnae] = useState<Record<string, CnaeInputState>>({});
    
    // Estados para Histórico
    const [historicoManualEditavel, setHistoricoManualEditavel] = useState<Record<string, number>>({});
    const [historicoDetalhadoEditavel, setHistoricoDetalhadoEditavel] = useState<Record<string, Record<string, number>>>({});
    
    const [valorPadraoHistorico, setValorPadraoHistorico] = useState<number>(0); 
    const [fatorRManual, setFatorRManual] = useState<string>(''); 

    // Estados para Adição de CNAE com IA
    const [isAddingCnae, setIsAddingCnae] = useState(false);
    const [newCnaeCode, setNewCnaeCode] = useState('');
    const [newCnaeAnexo, setNewCnaeAnexo] = useState<any>('I');
    const [cnaeSuggestions, setCnaeSuggestions] = useState<CnaeSuggestion[]>([]);
    const [isSearchingCnae, setIsSearchingCnae] = useState(false);
    const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const suggestionsRef = useRef<HTMLDivElement>(null);

    // Estados para Validação/Análise de Impostos
    const [isAnalyzingTax, setIsAnalyzingTax] = useState(false);
    const [taxDetails, setTaxDetails] = useState<Record<string, CnaeTaxDetail[]>>({});
    const [manualTaxRates, setManualTaxRates] = useState({ icms: '', pisCofins: '', iss: '' });
    const [showRefinement, setShowRefinement] = useState(false);
    
    // Modal de Análise CNAE
    const [cnaeAnalysis, setCnaeAnalysis] = useState<string | null>(null);
    const [isValidatingCnae, setIsValidatingCnae] = useState<string | null>(null);

    const [selectedHistoryItem, setSelectedHistoryItem] = useState<SimplesHistoricoCalculo | null>(null);
    const [isPdfGenerating, setIsPdfGenerating] = useState(false);
    const [isChartExporting, setIsChartExporting] = useState(false); // Novo estado para exportação do gráfico

    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

    const [filterYear, setFilterYear] = useState<string>('all');
    const [filterMonth, setFilterMonth] = useState<string>('all');

    const chartContainerRef = useRef<HTMLDivElement>(null); // Ref para o gráfico de Faturamento
    const chartFaixasContainerRef = useRef<HTMLDivElement>(null); // Ref para o gráfico de Faixas

    // --- CÁLCULOS ---

    const mesesHistorico = useMemo<{ date: Date; iso: string; label: string }[]>(() => {
        const lista: { date: Date; iso: string; label: string }[] = [];
        const dataBase = new Date(mesApuracao.getFullYear(), mesApuracao.getMonth() - 1, 1);
        for (let i = 0; i < 12; i++) {
            const d = new Date(dataBase.getFullYear(), dataBase.getMonth() - i, 1);
            const iso = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
            lista.push({
                date: d,
                iso: iso,
                label: d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
            });
        }
        return lista;
    }, [mesApuracao]);

    const totalRbt12Manual = useMemo(() => {
        return mesesHistorico.reduce((acc, m) => acc + (historicoManualEditavel[m.iso] || 0), 0);
    }, [mesesHistorico, historicoManualEditavel]);

    const allActivities = useMemo<{cnae: string, anexo: any, label: string}[]>(() => {
        const list: {cnae: string, anexo: any, label: string}[] = [{ cnae: empresa.cnae, anexo: empresa.anexo, label: 'Principal' }];
        if (empresa.atividadesSecundarias) {
            empresa.atividadesSecundarias.forEach((sec, idx) => {
                list.push({ ...sec, label: `Secundário ${idx + 1}` });
            });
        }
        return list;
    }, [empresa.cnae, empresa.anexo, empresa.atividadesSecundarias]);

    // Recalcula o total do mês vigente com base nos inputs
    const totalMesVigente = useMemo(() => {
        let total = 0;
        Object.values(faturamentoPorCnae).forEach((item: CnaeInputState) => {
            // Garante que o parse é seguro e trata vazio como 0
            const raw = item.valor ? item.valor.replace(/\./g, '').replace(',', '.') : '0';
            total += parseFloat(raw) || 0;
        });
        return total;
    }, [faturamentoPorCnae]);

    // Estado calculado de Resumo (apenas visualização, o salvamento recalcula com dados frescos)
    const resumo: SimplesNacionalResumo = useMemo(() => {
        const itensCalculo: any[] = [];
        
        Object.entries(faturamentoPorCnae).forEach(([key, state]: [string, CnaeInputState]) => {
            const parts = key.split('::');
            let cnaeCode = '', anexoCode = '';
            
            if (parts.length >= 4) {
                cnaeCode = parts[2];
                anexoCode = parts[3];
            } else {
                [cnaeCode, anexoCode] = key.split('_');
            }

            const val = parseFloat(state.valor.replace(/\./g, '').replace(',', '.') || '0');
            
            // Só adiciona se tiver valor > 0 ou se for um dos itens principais que o usuário está manipulando
            itensCalculo.push({ 
                cnae: cnaeCode, 
                anexo: anexoCode, 
                valor: val, 
                issRetido: state.issRetido, 
                icmsSt: state.icmsSt,
                isSup: state.isSup
            });
        });

        const empresaTemp = { ...empresa, faturamentoManual: historicoManualEditavel };

        let fatorRValue: number | undefined = undefined;
        if (fatorRManual.trim() !== '') {
            const parsed = parseFloat(fatorRManual.replace(',', '.'));
            if (!isNaN(parsed)) fatorRValue = parsed / 100;
        }

        return simplesService.calcularResumoEmpresa(
            empresaTemp, 
            notas, 
            mesApuracao, 
            { 
                itensCalculo: itensCalculo.length > 0 ? itensCalculo : undefined,
                fatorRManual: fatorRValue
            }
        );
    }, [empresa, notas, mesApuracao, faturamentoPorCnae, historicoManualEditavel, fatorRManual]);

    // Cálculo da Evolução de Faixas e RBT12 (Últimos 12 meses)
    const dadosEvolucaoFaixas = useMemo(() => {
        const dados = [];
        const labels = [];
        
        const dataFim = new Date(mesApuracao);
        const dataInicio = new Date(mesApuracao.getFullYear(), mesApuracao.getMonth() - 11, 1); 

        const anexoParaCalculo = empresa.anexo === 'III_V' ? 'III' : empresa.anexo;
        const tabela = ANEXOS_TABELAS[anexoParaCalculo];

        for (let i = 0; i < 12; i++) {
            const dataRef = new Date(dataInicio.getFullYear(), dataInicio.getMonth() + i, 1);
            labels.push(dataRef.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }));

            let rbt12Historico = 0;
            // RBT12 = Soma dos 12 meses ANTERIORES ao dataRef
            const dataInicioRbt = new Date(dataRef.getFullYear(), dataRef.getMonth() - 12, 1);
            
            for (let j = 0; j < 12; j++) {
                const d = new Date(dataInicioRbt.getFullYear(), dataInicioRbt.getMonth() + j, 1);
                const k = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
                rbt12Historico += (historicoManualEditavel[k] || 0);
            }

            let faixa = 1;
            if (tabela) {
                let faixaIndex = tabela.findIndex((f: any) => rbt12Historico <= f.limite);
                if (faixaIndex === -1 && rbt12Historico > 0) faixaIndex = 5; 
                if (faixaIndex !== -1) faixa = faixaIndex + 1;
                if (rbt12Historico === 0) faixa = 1;
            }

            dados.push({ rbt12: rbt12Historico, faixa });
        }

        return {
            labels,
            datasets: [
                {
                    type: 'bar' as const,
                    label: 'RBT12 (Acumulado 12m)',
                    data: dados.map(d => d.rbt12),
                    backgroundColor: 'rgba(14, 165, 233, 0.3)',
                    borderColor: 'rgb(14, 165, 233)',
                    borderWidth: 1,
                    yAxisID: 'y',
                    order: 2
                },
                {
                    type: 'line' as const,
                    label: 'Faixa do Simples',
                    data: dados.map(d => d.faixa),
                    borderColor: 'rgb(245, 158, 11)',
                    backgroundColor: 'rgb(245, 158, 11)',
                    borderWidth: 3,
                    stepped: true,
                    yAxisID: 'y1',
                    order: 1
                }
            ]
        };
    }, [historicoManualEditavel, mesApuracao, empresa.anexo]);

    const filteredHistory = useMemo(() => {
        if (!empresa.historicoCalculos) return [];
        return [...empresa.historicoCalculos].sort((a, b) => b.dataCalculo - a.dataCalculo);
    }, [empresa.historicoCalculos]);

    // --- EFFECTS ---

    useEffect(() => {
        const mesChave = `${mesApuracao.getFullYear()}-${(mesApuracao.getMonth() + 1).toString().padStart(2, '0')}`;
        const totalMes = empresa.faturamentoManual?.[mesChave] || 0;
        const detalheMes = empresa.faturamentoMensalDetalhado?.[mesChave] || {};
        const hasDetalhe = Object.keys(detalheMes).length > 0;

        setFaturamentoPorCnae(prev => {
            const novoFaturamentoPorCnae: Record<string, CnaeInputState> = { ...prev };
            
            // Função auxiliar para criar estado inicial ou preservar existente
            const getOrCreateState = (key: string, val: number): CnaeInputState => {
                const existing = prev[key];
                const formattedVal = val > 0 ? new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) : '0,00';
                
                if (existing) {
                    return {
                        ...existing,
                        valor: formattedVal 
                    };
                }
                
                return {
                    valor: formattedVal,
                    issRetido: false,
                    icmsSt: false,
                    isSup: false
                };
            };

            // 1. Principal
            const keyPrincipal = `principal::0::${empresa.cnae}::${empresa.anexo}`;
            let valorPrincipal = 0;
            
            if (detalheMes[keyPrincipal] !== undefined) {
                valorPrincipal = detalheMes[keyPrincipal];
            } else if (detalheMes[empresa.cnae] !== undefined) {
                valorPrincipal = detalheMes[empresa.cnae];
            } else if (!hasDetalhe) {
                valorPrincipal = totalMes;
            }
            
            novoFaturamentoPorCnae[keyPrincipal] = getOrCreateState(keyPrincipal, valorPrincipal);
            
            // 2. Secundários
            if (empresa.atividadesSecundarias) {
                empresa.atividadesSecundarias.forEach((ativ, index) => {
                    const keySec = `secundario::${index}::${ativ.cnae}::${ativ.anexo}`;
                    let valorSec = 0;
                    
                    if (detalheMes[keySec] !== undefined) {
                        valorSec = detalheMes[keySec];
                    } else if (detalheMes[ativ.cnae] !== undefined && detalheMes[ativ.cnae] !== valorPrincipal) {
                        valorSec = detalheMes[ativ.cnae];
                    }

                    novoFaturamentoPorCnae[keySec] = getOrCreateState(keySec, valorSec);
                });
            }
            
            return novoFaturamentoPorCnae;
        });
        
        setHistoricoManualEditavel(empresa.faturamentoManual || {});
        setHistoricoDetalhadoEditavel(empresa.faturamentoMensalDetalhado || {});

    }, [mesApuracao, empresa.id, empresa.faturamentoManual, empresa.faturamentoMensalDetalhado, empresa.atividadesSecundarias]);

    // --- HANDLERS ---

    const handleFaturamentoChange = (key: string, rawValue: string) => {
        const digits = rawValue.replace(/\D/g, '');
        const numberValue = parseInt(digits, 10) / 100;
        const formatted = isNaN(numberValue) ? '0,00' : new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numberValue);

        setFaturamentoPorCnae((prev) => ({
            ...prev,
            [key]: { ...prev[key], valor: formatted }
        }));
    };

    const handleOptionToggle = (key: string, field: 'issRetido' | 'icmsSt' | 'isSup') => {
        setFaturamentoPorCnae((prev) => ({
            ...prev,
            [key]: { ...prev[key], [field]: !prev[key][field] }
        }));
    };

    const handleSaveMesVigente = async () => {
        setIsSaving(true);
        try {
            let totalCalculado = 0;
            const detalheMes: Record<string, number> = {};
            const itensCalculoParaSalvar: SimplesItemCalculo[] = [];

            Object.entries(faturamentoPorCnae).forEach(([key, state]: [string, CnaeInputState]) => {
                const val = parseFloat(state.valor.replace(/\./g, '').replace(',', '.') || '0');
                
                const parts = key.split('::');
                let cnaeCode = '', anexoCode = '';
                if (parts.length >= 4) {
                    cnaeCode = parts[2];
                    anexoCode = parts[3];
                } else {
                    [cnaeCode, anexoCode] = key.split('_');
                }

                totalCalculado += val;

                if(val >= 0) {
                     detalheMes[key] = val; 
                     
                     itensCalculoParaSalvar.push({
                        cnae: cnaeCode,
                        anexo: anexoCode as any,
                        valor: val,
                        issRetido: state.issRetido,
                        icmsSt: state.icmsSt,
                        isSup: state.isSup
                     });
                }
            });

            const mesChave = `${mesApuracao.getFullYear()}-${(mesApuracao.getMonth() + 1).toString().padStart(2, '0')}`;
            
            const updatedManual = { ...historicoManualEditavel, [mesChave]: totalCalculado };
            const updatedDetalhado = { ...historicoDetalhadoEditavel, [mesChave]: detalheMes };

            setHistoricoManualEditavel(updatedManual);
            setHistoricoDetalhadoEditavel(updatedDetalhado);

            const empresaTemp = { 
                ...empresa, 
                faturamentoManual: updatedManual, 
                faturamentoMensalDetalhado: updatedDetalhado 
            };

            let fatorRValue: number | undefined = undefined;
            if (fatorRManual.trim() !== '') {
                const parsed = parseFloat(fatorRManual.replace(',', '.'));
                if (!isNaN(parsed)) fatorRValue = parsed / 100;
            }

            const resumoAtualizado = simplesService.calcularResumoEmpresa(
                empresaTemp, 
                notas, 
                mesApuracao, 
                { 
                    itensCalculo: itensCalculoParaSalvar,
                    fatorRManual: fatorRValue
                }
            );

            const novoItemHistorico: SimplesHistoricoCalculo = {
                id: Date.now().toString(),
                dataCalculo: Date.now(),
                mesReferencia: mesApuracao.toLocaleString('pt-BR', { month: 'long', year: 'numeric' }),
                rbt12: resumoAtualizado.rbt12,
                aliq_eff: resumoAtualizado.aliq_eff,
                fator_r: resumoAtualizado.fator_r,
                das_mensal: resumoAtualizado.das_mensal,
                anexo_efetivo: resumoAtualizado.anexo_efetivo
            };
            
            const novoHistoricoCalculos = [...(empresa.historicoCalculos || []), novoItemHistorico];

            const payloadFinal: Partial<SimplesNacionalEmpresa> = {
                faturamentoManual: updatedManual,
                faturamentoMensalDetalhado: updatedDetalhado,
                historicoCalculos: novoHistoricoCalculos
            };

            await onUpdateEmpresa(empresa.id, payloadFinal);

            // Visual feedback logic
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 2500);

            if (onShowToast) onShowToast('Apuração calculada e salva com sucesso!');
        } catch (error) {
            console.error("Erro ao salvar:", error);
            if (onShowToast) onShowToast('Erro ao salvar apuração. Tente novamente.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSearchCnae = (query: string) => {
        setNewCnaeCode(query);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        if (query.length < 3) { setCnaeSuggestions([]); return; }
        setIsSearchingCnae(true);
        searchTimeout.current = setTimeout(async () => {
            try { setCnaeSuggestions(await fetchCnaeSuggestions(query)); } 
            catch (e) { console.error(e); } 
            finally { setIsSearchingCnae(false); }
        }, 600);
    };

    const handleSelectSuggestion = (suggestion: CnaeSuggestion) => {
        setNewCnaeCode(suggestion.code);
        setCnaeSuggestions([]);
        if (suggestion.code.startsWith('47')) setNewCnaeAnexo('I');
        else if (suggestion.code.startsWith('10')) setNewCnaeAnexo('II');
        else setNewCnaeAnexo('III');
    };

    const handleValidateCnae = async (cnaeToValidate: string) => {
        if (!cnaeToValidate.trim()) return;
        setIsValidatingCnae(cnaeToValidate);
        try {
            const result = await fetchCnaeDescription(cnaeToValidate);
            setCnaeAnalysis(result.text || '');
        } catch (e) {
            if(onShowToast) onShowToast("Erro ao validar CNAE.");
        } finally {
            setIsValidatingCnae(null);
        }
    };

    const handleAddNewCnae = () => {
        if (!newCnaeCode) return;
        const newAtividades = [...(empresa.atividadesSecundarias || []), { cnae: newCnaeCode, anexo: newCnaeAnexo }];
        onUpdateEmpresa(empresa.id, { atividadesSecundarias: newAtividades });
        setIsAddingCnae(false);
        setNewCnaeCode('');
        setNewCnaeAnexo('I');
    };

    const handleRemoveSecondary = (index: number) => {
        if (!empresa.atividadesSecundarias) return;
        const newAtividades = empresa.atividadesSecundarias.filter((_, i) => i !== index);
        onUpdateEmpresa(empresa.id, { atividadesSecundarias: newAtividades });
    };

    const handleHistoricoDetalheChange = (mesIso: string, cnaeKey: string, valor: number) => {
        const currentDetalheMes = historicoDetalhadoEditavel[mesIso] || {};
        const newDetalheMes = { ...currentDetalheMes, [cnaeKey]: valor };
        let totalMes = 0;
        Object.values(newDetalheMes).forEach((v: number) => totalMes += v);
        setHistoricoDetalhadoEditavel(prev => ({ ...prev, [mesIso]: newDetalheMes }));
        setHistoricoManualEditavel(prev => ({ ...prev, [mesIso]: totalMes }));
    };

    const handleSaveHistorico = () => {
        if (window.confirm('Deseja salvar o faturamento manual? Isso substituirá os dados existentes.')) {
            onSaveFaturamentoManual(empresa.id, historicoManualEditavel, historicoDetalhadoEditavel);
            if (onShowToast) onShowToast('Faturamento manual salvo com sucesso!');
            setIsHistoryModalOpen(false);
        }
    };

    const handleAplicarValorEmLote = () => {
        const novoHistorico = { ...historicoManualEditavel };
        const novoDetalhado = { ...historicoDetalhadoEditavel };
        mesesHistorico.forEach(m => {
            novoHistorico[m.iso] = valorPadraoHistorico;
            novoDetalhado[m.iso] = { [empresa.cnae]: valorPadraoHistorico };
        });
        setHistoricoManualEditavel(novoHistorico);
        setHistoricoDetalhadoEditavel(novoDetalhado);
        if (onShowToast) onShowToast(`Valor aplicado a todos os meses!`);
    };

    const handleDeleteHistory = async (calculoId: string) => {
        if (window.confirm('Tem certeza que deseja excluir este registro do histórico? Esta ação é irreversível.')) {
            const updatedHistory = (empresa.historicoCalculos || []).filter(h => h.id !== calculoId);
            await onUpdateEmpresa(empresa.id, { historicoCalculos: updatedHistory });
            if (onShowToast) onShowToast('Registro excluído com sucesso.');
            if (selectedHistoryItem?.id === calculoId) setSelectedHistoryItem(null);
        }
    };

    const handleAnalyzeTax = async () => {
        setIsAnalyzingTax(true);
        setTaxDetails({});
        try {
            const cnaesToAnalyze = [empresa.cnae, ...(empresa.atividadesSecundarias?.map(a => a.cnae) || [])];
            const uniqueCnaes = Array.from(new Set(cnaesToAnalyze));
            
            const results: Record<string, CnaeTaxDetail[]> = {};
            for (const cnae of uniqueCnaes) {
                if (cnae) results[cnae] = await fetchCnaeTaxDetails(cnae, manualTaxRates);
            }
            setTaxDetails(results);
        } catch (e) {
            console.error(e);
            if(onShowToast) onShowToast("Erro ao analisar impostos.");
        } finally {
            setIsAnalyzingTax(false);
        }
    };
    
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            setIsImporting(true);
            try {
                const res = await onImport(empresa.id, e.target.files[0]);
                setImportResult(res);
            } catch (error) {
                console.error(error);
                if (onShowToast) onShowToast("Erro na importação.");
            } finally {
                setIsImporting(false);
            }
        }
    };

    const handleGerarDasPdf = async () => { 
        setIsPdfGenerating(true); 
        try {
            const { default: jsPDF } = await import('jspdf');
            const doc = new jsPDF();
            
            // Header
            doc.setFillColor(14, 165, 233);
            doc.rect(0, 0, 210, 25, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(16);
            doc.text("Memória de Cálculo - Simples Nacional", 105, 12, { align: 'center' });
            
            // Meta Info (Data/Hora e Usuário)
            doc.setFontSize(8);
            const dataHora = new Date().toLocaleString('pt-BR');
            const responsavel = currentUser?.name || 'Sistema';
            doc.text(`Gerado em: ${dataHora}`, 14, 20);
            doc.text(`Responsável: ${responsavel}`, 196, 20, { align: 'right' });

            doc.setTextColor(0, 0, 0);
            doc.setFontSize(10);
            let y = 35;
            doc.text(`Empresa: ${empresa.nome}`, 14, y);
            doc.text(`CNPJ: ${empresa.cnpj}`, 140, y);
            y += 6;
            doc.text(`Competência: ${mesApuracao.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}`, 14, y);
            y += 10;
            
            doc.setDrawColor(200);
            doc.line(14, y, 196, y);
            y += 10;

            // --- RESUMO DA APURAÇÃO (Novo Box) ---
            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(14, 165, 233);
            doc.rect(14, y, 182, 35, 'FD'); // Fill and Draw
            
            doc.setFontSize(12);
            doc.setTextColor(14, 165, 233);
            doc.setFont(undefined, 'bold');
            doc.text("Resumo Executivo da Apuração", 105, y + 8, { align: 'center' });
            
            doc.setTextColor(50);
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            
            const col1 = 20;
            const col2 = 110;
            let summaryY = y + 18;

            doc.text("Receita Bruta (12 Meses):", col1, summaryY);
            doc.setFont(undefined, 'bold');
            doc.text(`R$ ${resumo.rbt12.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, col1 + 50, summaryY);
            doc.setFont(undefined, 'normal');

            doc.text("Alíquota Efetiva:", col2, summaryY);
            doc.setFont(undefined, 'bold');
            doc.text(`${resumo.aliq_eff.toFixed(4)}%`, col2 + 35, summaryY);
            doc.setFont(undefined, 'normal');

            summaryY += 8;
            doc.text("Anexo Principal:", col1, summaryY);
            doc.setFont(undefined, 'bold');
            doc.text(`${resumo.anexo_efetivo}`, col1 + 50, summaryY);
            doc.setFont(undefined, 'normal');

            doc.text("Valor Total do DAS:", col2, summaryY);
            doc.setFontSize(12);
            doc.setTextColor(14, 165, 233);
            doc.setFont(undefined, 'bold');
            doc.text(`R$ ${resumo.das_mensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, col2 + 35, summaryY);
            
            y += 45; // Move cursor past the box
            
            // --- DETALHAMENTO ---

            doc.setTextColor(0);
            doc.setFontSize(11);
            doc.setFont(undefined, 'bold');
            doc.text("1. Receita Bruta Acumulada (Últimos 12 Meses)", 14, y);
            y += 6;
            
            doc.setFontSize(9);
            doc.setFillColor(240, 240, 240);
            doc.rect(14, y, 182, 6, 'F');
            doc.text("Período de Apuração", 16, y + 4);
            doc.text("Receita Bruta (R$)", 190, y + 4, { align: 'right' });
            y += 8;
            
            doc.setFont(undefined, 'normal');
            
            resumo.historico_simulado.forEach((hist, index) => {
                if (index % 2 === 0) {
                    doc.setFillColor(250, 250, 250);
                    doc.rect(14, y-2, 182, 5, 'F');
                }
                doc.text(hist.label, 16, y+2);
                doc.text(hist.faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), 190, y+2, { align: 'right' });
                y += 5;
            });
            
            y += 4;
            doc.setFont(undefined, 'bold');
            doc.text(`RBT12 Total: R$ ${resumo.rbt12.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 190, y, { align: 'right' });
            y += 10;

            doc.setFontSize(11);
            doc.text("2. Enquadramento e Faixa (Tabela Simples Nacional)", 14, y);
            y += 6;
            
            const tabela = (ANEXOS_TABELAS as any)[resumo.anexo_efetivo] as any[];
            if (tabela) {
                doc.setFontSize(8);
                doc.setFillColor(230, 240, 255);
                doc.rect(14, y, 182, 6, 'F');
                doc.text("Faixa", 16, y + 4);
                doc.text("Limite de Receita (R$)", 80, y + 4, { align: 'right' });
                doc.text("Alíquota Nominal", 130, y + 4, { align: 'right' });
                doc.text("Valor a Deduzir (R$)", 190, y + 4, { align: 'right' });
                y += 8;
                
                doc.setFont(undefined, 'normal');
                let faixaIndexCalculada = tabela.findIndex((f: any) => resumo.rbt12 <= f.limite);
                if (faixaIndexCalculada === -1 && resumo.rbt12 > 0) faixaIndexCalculada = 5;
                if (resumo.rbt12 === 0) faixaIndexCalculada = 0;

                tabela.forEach((faixa, idx) => {
                    const isCurrent = idx === faixaIndexCalculada;
                    if (isCurrent) {
                        doc.setFillColor(255, 250, 205); 
                        doc.rect(14, y-2, 182, 5, 'F');
                        doc.setFont(undefined, 'bold');
                    }
                    doc.text(`${idx + 1}ª Faixa`, 16, y+2);
                    doc.text(faixa.limite.toLocaleString('pt-BR'), 80, y+2, { align: 'right' });
                    doc.text(`${faixa.aliquota}%`, 130, y+2, { align: 'right' });
                    doc.text(faixa.parcela.toLocaleString('pt-BR'), 190, y+2, { align: 'right' });
                    if (isCurrent) doc.setFont(undefined, 'normal');
                    y += 5;
                });
            }
            y += 10;

            doc.setFontSize(11);
            doc.setFont(undefined, 'bold');
            doc.text("3. Memória de Cálculo do Imposto (Mês Atual)", 14, y);
            y += 6;

            doc.setFillColor(240, 240, 240);
            doc.rect(14, y, 182, 8, 'F');
            doc.setFontSize(9);
            doc.text("Anexo/CNAE", 16, y + 5);
            doc.text("Base de Cálculo", 70, y + 5, { align: 'right' });
            doc.text("Aliq. Nom.", 110, y + 5, { align: 'right' });
            doc.text("Aliq. Efetiva", 150, y + 5, { align: 'right' });
            doc.text("Valor DAS", 190, y + 5, { align: 'right' });
            y += 10;

            doc.setFont(undefined, 'normal');
            if (resumo.detalhamento_anexos) {
                (resumo.detalhamento_anexos || []).forEach(item => {
                    doc.text(`Anexo ${item.anexo} ${item.cnae ? `(${item.cnae})` : ''}`, 16, y);
                    doc.text(`R$ ${item.faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 70, y, { align: 'right' });
                    doc.text(`${item.aliquotaNominal}%`, 110, y, { align: 'right' });
                    doc.text(`${item.aliquotaEfetiva.toFixed(4)}%`, 150, y, { align: 'right' });
                    doc.text(`R$ ${item.valorDas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 190, y, { align: 'right' });
                    y += 6;
                });
            } else {
                doc.text("Sem dados de cálculo.", 16, y);
                y += 8;
            }

            // NOVA SEÇÃO: DISCRIMINAÇÃO DOS TRIBUTOS
            y += 4;
            doc.setFontSize(11);
            doc.setFont(undefined, 'bold');
            doc.text("4. Discriminação dos Tributos (Repartição)", 14, y);
            y += 6;

            const discriminacao = simplesService.calcularDiscriminacaoImpostos(
                resumo.anexo_efetivo,
                resumo.faixa_index,
                resumo.das_mensal
            );
            const percentuais = REPARTICAO_IMPOSTOS[resumo.anexo_efetivo]?.[Math.min(resumo.faixa_index, 5)] || {};

            doc.setFillColor(240, 240, 240);
            doc.rect(14, y, 182, 6, 'F');
            doc.setFontSize(9);
            doc.text("Tributo", 16, y + 4);
            doc.text("% Partilha", 100, y + 4, { align: 'center' });
            doc.text("Valor Estimado (R$)", 190, y + 4, { align: 'right' });
            y += 8;

            doc.setFont(undefined, 'normal');
            Object.entries(discriminacao).forEach(([imposto, valor], index) => {
                const perc = percentuais[imposto] || 0;
                doc.text(imposto, 16, y+2);
                doc.text(`${perc.toFixed(2)}%`, 100, y+2, { align: 'center' });
                doc.text((valor as number).toLocaleString('pt-BR', { minimumFractionDigits: 2 }), 190, y+2, { align: 'right' });
                y += 5;
            });

            y += 6;
            doc.line(14, y, 196, y);
            y += 8;
            
            doc.setFont(undefined, 'bold');
            doc.setFontSize(12);
            doc.text("Total a Pagar (DAS):", 130, y, { align: 'right' });
            doc.setTextColor(14, 165, 233);
            doc.text(`R$ ${resumo.das_mensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 190, y, { align: 'right' });

            // RODAPÉ
            const pageHeight = doc.internal.pageSize.getHeight();
            doc.setFontSize(8);
            doc.setTextColor(150);
            const footerText = `Gerado em: ${new Date().toLocaleString('pt-BR')} por ${currentUser?.name || 'Sistema'}`;
            doc.text(footerText, 14, pageHeight - 10);
            doc.text("SP Assessoria Contábil", 196, pageHeight - 10, { align: 'right' });

            doc.save(`memoria-das-${empresa.cnpj.replace(/\D/g, '')}.pdf`);
        } catch (e) {
            console.error(e);
            if(onShowToast) onShowToast("Erro ao gerar PDF.");
        } finally {
            setIsPdfGenerating(false); 
        }
    };

    const handleExportChartPdf = async () => {
        if (!chartContainerRef.current) return;
        setIsChartExporting(true);
        try {
            const { default: jsPDF } = await import('jspdf');
            const { default: html2canvas } = await import('html2canvas');
            
            const canvas = await html2canvas(chartContainerRef.current, { scale: 2, backgroundColor: '#ffffff' });
            const imgData = canvas.toDataURL('image/png');
            
            const pdf = new jsPDF('landscape');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            
            pdf.setFontSize(18);
            pdf.setTextColor(40);
            pdf.text(`Histórico de Faturamento - ${empresa.nome}`, 14, 20);
            
            const imgProps = pdf.getImageProperties(imgData);
            const imgHeight = (imgProps.height * (pdfWidth - 28)) / imgProps.width;
            pdf.addImage(imgData, 'PNG', 14, 30, pdfWidth - 28, imgHeight);
            
            let y = 30 + imgHeight + 10;
            
            if (y + 30 > pdfHeight) {
                pdf.addPage();
                y = 20;
            }
            
            pdf.setFontSize(12);
            pdf.setTextColor(0);
            pdf.text("Detalhamento Mensal", 14, y);
            y += 8;
            
            pdf.setFontSize(10);
            pdf.setFillColor(240, 240, 240);
            pdf.rect(14, y, pdfWidth - 28, 8, 'F');
            pdf.setFont(undefined, 'bold');
            pdf.text("Mês/Ano", 16, y + 5);
            pdf.text("Faturamento (R$)", 100, y + 5);
            pdf.text("Alíquota Efetiva (%)", 180, y + 5);
            y += 10;
            
            pdf.setFont(undefined, 'normal');
            resumo.historico_simulado.forEach((h) => {
                if (y > pdfHeight - 10) {
                    pdf.addPage();
                    y = 20;
                }
                pdf.text(h.label, 16, y);
                pdf.text(h.faturamento.toLocaleString('pt-BR', {minimumFractionDigits: 2}), 100, y);
                pdf.text((h.aliquotaEfetiva || 0).toFixed(2), 180, y);
                y += 7;
            });
            
            pdf.save(`grafico-faturamento-${empresa.cnpj.replace(/\D/g, '')}.pdf`);
            
        } catch(e) {
            console.error(e);
            if(onShowToast) onShowToast("Erro ao exportar gráfico.");
        } finally {
            setIsChartExporting(false);
        }
    };
    
    const renderCardCnae = (cnaeCode: string, anexoCode: string, label: string, isSecondary = false, index?: number) => {
        const key = isSecondary 
            ? `secundario::${index}::${cnaeCode}::${anexoCode}`
            : `principal::0::${cnaeCode}::${anexoCode}`;
            
        const state = faturamentoPorCnae[key] || { valor: '0,00', issRetido: false, icmsSt: false, isSup: false };
        const showIcmsSt = ['I', 'II'].includes(anexoCode);
        const showIss = ['III', 'IV', 'V', 'III_V'].includes(anexoCode);

        return (
            <div key={key} className="bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-600 rounded-lg p-4 relative group hover:border-sky-300 transition-colors shadow-sm">
                <div className="flex justify-between items-start mb-3">
                    <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400">{label}</span>
                        <p className="font-mono font-bold text-slate-800 dark:text-slate-200">{cnaeCode}</p>
                    </div>
                    <span className="text-xs font-bold bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 px-2 py-1 rounded">
                        Anexo {anexoCode}
                    </span>
                </div>

                <div className="flex flex-col gap-3">
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">R$</span>
                        <input 
                            type="text" 
                            value={state.valor} 
                            onChange={(e) => handleFaturamentoChange(key, e.target.value)}
                            onFocus={(e) => e.target.select()}
                            className="w-full pl-9 pr-3 py-3 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-500 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none text-right font-mono font-bold text-slate-900 dark:text-white text-xl shadow-inner"
                            aria-label={`Faturamento para CNAE ${cnaeCode}`}
                            placeholder="0,00"
                        />
                    </div>

                    <div className="flex flex-wrap gap-4 pt-2 border-t border-slate-200 dark:border-slate-600/50">
                        {showIcmsSt && (
                            <label className="flex items-center gap-2 cursor-pointer select-none bg-slate-100 dark:bg-slate-700/50 px-2 py-1 rounded border border-transparent hover:border-slate-300 dark:hover:border-slate-500 transition-colors">
                                <input type="checkbox" checked={state.icmsSt} onChange={() => handleOptionToggle(key, 'icmsSt')} className="rounded text-sky-600 focus:ring-sky-500 w-4 h-4" />
                                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1">
                                    ST (Subst. Trib.)
                                </span>
                            </label>
                        )}
                        {showIss && (
                            <>
                                <label className="flex items-center gap-2 cursor-pointer select-none bg-slate-100 dark:bg-slate-700/50 px-2 py-1 rounded border border-transparent hover:border-slate-300 dark:hover:border-slate-500 transition-colors">
                                    <input type="checkbox" checked={state.issRetido} onChange={() => handleOptionToggle(key, 'issRetido')} className="rounded text-sky-600 focus:ring-sky-500 w-4 h-4" />
                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1">
                                        Retenção ISS
                                    </span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer select-none bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded border border-transparent hover:border-amber-300 dark:hover:border-amber-700 transition-colors">
                                    <input type="checkbox" checked={state.isSup} onChange={() => handleOptionToggle(key, 'isSup')} className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4" />
                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1" title="Sociedade Uniprofissional - ISS Fixo (Não incide no DAS)">
                                        SUP (ISS Fixo)
                                    </span>
                                </label>
                            </>
                        )}
                    </div>
                </div>
                
                <div className="mt-3 flex gap-2 justify-between items-center">
                    <button 
                        onClick={() => handleValidateCnae(cnaeCode)}
                        className="text-[10px] text-sky-600 hover:underline flex items-center gap-1"
                    >
                        <ShieldIcon className="w-3 h-3" /> Validar Enquadramento
                    </button>
                    {isSecondary && index !== undefined && (
                        <button onClick={() => handleRemoveSecondary(index)} className="text-slate-400 hover:text-red-500 p-1" title="Remover Atividade">
                            <TrashIcon className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
        );
    };

    const renderTabelaReferencia = (anexoCode: string, rbt12Value: number) => {
        // Cast ANEXOS_TABELAS to any to ensure index access works and result is castable to array
        const tabelaRaw = (ANEXOS_TABELAS as any)[anexoCode];
        
        if (!Array.isArray(tabelaRaw)) return null; 
        
        const tabela = tabelaRaw as any[];

        let faixaIndex = tabela.findIndex((f: any) => rbt12Value <= f.limite);
        if (faixaIndex === -1 && rbt12Value > 0) faixaIndex = 5;
        if (rbt12Value === 0) faixaIndex = 0;

        return (
            <div key={anexoCode} className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                <h3 className="font-bold text-slate-800 dark:text-slate-100 mb-3">Tabela Anexo {anexoCode}</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50 dark:bg-slate-700 text-slate-500 font-bold uppercase">
                            <tr>
                                <th className="px-2 py-2">Faixa</th>
                                <th className="px-2 py-2 text-right">Limite (R$)</th>
                                <th className="px-2 py-2 text-center">Aliq.</th>
                                <th className="px-2 py-2 text-right">Deduzir</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {tabela.map((faixa: any, idx: number) => {
                                const isCurrent = idx === faixaIndex;
                                return (
                                    <tr key={idx} className={isCurrent ? "bg-sky-50 dark:bg-sky-900/20" : ""}>
                                        <td className="px-2 py-2 font-bold text-slate-700 dark:text-slate-300">{idx + 1}ª</td>
                                        <td className="px-2 py-2 text-right font-mono text-slate-600 dark:text-slate-400">{faixa.limite.toLocaleString('pt-BR')}</td>
                                        <td className={`px-2 py-2 text-center font-bold ${isCurrent ? 'text-sky-600 dark:text-sky-400' : 'text-slate-600 dark:text-slate-400'}`}>{faixa.aliquota}%</td>
                                        <td className="px-2 py-2 text-right font-mono text-slate-600 dark:text-slate-400">{faixa.parcela.toLocaleString('pt-BR')}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const renderTaxAnalysisSection = () => {
        return (
            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            <ShieldIcon className="w-5 h-5 text-sky-600" /> Análise Tributária por CNAE
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Alíquotas médias e bases legais (ICMS, ISS, PIS/COFINS) obtidas via IA.
                        </p>
                    </div>
                    {Object.keys(taxDetails).length === 0 && !isAnalyzingTax && (
                        <button onClick={handleAnalyzeTax} className="btn-press bg-sky-600 text-white px-4 py-2 rounded-lg font-bold text-xs hover:bg-sky-700 transition-colors flex items-center gap-2">
                            <ShieldIcon className="w-3 h-3" /> Analisar Tributos
                        </button>
                    )}
                </div>

                {isAnalyzingTax && (
                    <div className="py-8 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900/30 rounded-lg">
                        <LoadingSpinner />
                        <p className="text-xs font-bold text-slate-500 mt-3 animate-pulse">Consultando legislação vigente...</p>
                    </div>
                )}

                {!isAnalyzingTax && Object.keys(taxDetails).length > 0 && (
                    <div className="space-y-6">
                        {Object.entries(taxDetails).map(([cnae, details]) => (
                            <div key={cnae} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                                <div className="bg-slate-50 dark:bg-slate-700/50 px-4 py-2 border-b border-slate-200 dark:border-slate-700">
                                    <p className="font-bold text-sm text-sky-800 dark:text-sky-300">CNAE: {cnae}</p>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs text-left">
                                        <thead className="bg-white dark:bg-slate-800 text-slate-500 font-bold uppercase border-b border-slate-100 dark:border-slate-700">
                                            <tr>
                                                <th className="px-4 py-2 w-1/4">Tributo</th>
                                                <th className="px-4 py-2 w-1/4">Incidência</th>
                                                <th className="px-4 py-2 w-1/6 text-center">Alíquota Média</th>
                                                <th className="px-4 py-2">Base Legal / Obs.</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                            {details.map((d, i) => (
                                                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                                                    <td className="px-4 py-2 font-bold text-slate-700 dark:text-slate-300">{d.tributo}</td>
                                                    <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{d.incidencia}</td>
                                                    <td className="px-4 py-2 text-center font-mono font-bold text-sky-600 dark:text-sky-400">{d.aliquotaMedia}</td>
                                                    <td className="px-4 py-2 text-slate-500 dark:text-slate-400 italic">{d.baseLegal || d.observacao}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ))}
                        <div className="flex justify-end">
                             <button onClick={handleAnalyzeTax} className="text-xs text-slate-500 hover:text-sky-600 underline">Atualizar Análise</button>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const chartData = {
        labels: resumo.historico_simulado.map(h => h.label),
        datasets: [
            { label: 'Faturamento (R$)', data: resumo.historico_simulado.map(h => h.faturamento), backgroundColor: 'rgba(14, 165, 233, 0.6)', yAxisID: 'y' },
            { label: 'Alíquota (%)', data: resumo.historico_simulado.map(h => h.aliquotaEfetiva), type: 'line' as const, borderColor: 'rgb(245, 158, 11)', borderWidth: 2, yAxisID: 'y1' }
        ],
    };

    // Opções essenciais para o gráfico de dois eixos
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index' as const,
            intersect: false,
        },
        scales: {
            y: {
                type: 'linear' as const,
                display: true,
                position: 'left' as const,
                title: { display: true, text: 'Faturamento (R$)', color: '#64748b', font: { weight: 'bold' } },
                grid: { color: 'rgba(0, 0, 0, 0.05)' },
                ticks: {
                    callback: function(value: any) {
                        return new Intl.NumberFormat('pt-BR', { notation: 'compact', compactDisplay: 'short' }).format(value);
                    }
                }
            },
            y1: {
                type: 'linear' as const,
                display: true,
                position: 'right' as const,
                title: { display: true, text: 'Alíquota Efetiva (%)', color: '#f59e0b', font: { weight: 'bold' } },
                grid: {
                    drawOnChartArea: false, 
                },
                ticks: {
                    callback: function(value: any) {
                        return value + '%';
                    }
                }
            }
        }
    };

    const evolucaoFaixasOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            mode: 'index' as const,
            intersect: false,
        },
        scales: {
            y: {
                type: 'linear' as const,
                display: true,
                position: 'left' as const,
                title: { display: true, text: 'RBT12 (Acumulado)', color: '#64748b', font: { weight: 'bold' } },
                grid: { color: 'rgba(0, 0, 0, 0.05)' },
                ticks: {
                    callback: function(value: any) {
                        return new Intl.NumberFormat('pt-BR', { notation: 'compact', compactDisplay: 'short' }).format(value);
                    }
                }
            },
            y1: {
                type: 'linear' as const,
                display: true,
                position: 'right' as const,
                title: { display: true, text: 'Faixa (1-6)', color: '#f59e0b', font: { weight: 'bold' } },
                min: 0,
                max: 7, 
                ticks: {
                    stepSize: 1,
                    callback: function(value: any) {
                        if (value > 0 && value <= 6) return value + 'ª Faixa';
                        return '';
                    }
                },
                grid: {
                    drawOnChartArea: false, 
                }
            }
        },
        plugins: {
            tooltip: {
                callbacks: {
                    label: function(context: any) {
                        let label = context.dataset.label || '';
                        if (label) {
                            label += ': ';
                        }
                        if (context.parsed.y !== null) {
                            if (context.dataset.yAxisID === 'y1') {
                                return label + context.parsed.y + 'ª Faixa';
                            }
                            return label + new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed.y);
                        }
                        return label;
                    }
                }
            }
        }
    };

    return (
        <div className="animate-fade-in pb-12">
            <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-sky-600 transition-colors font-bold">
                        <ArrowLeftIcon className="w-5 h-5" /> Voltar
                    </button>
                    <div className="border-l border-slate-300 dark:border-slate-600 h-6 mx-2 hidden md:block"></div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{empresa.nome}</h1>
                        <p className="text-slate-500 dark:text-slate-400 font-mono text-xs font-bold">CNPJ: {empresa.cnpj}</p>
                    </div>
                </div>
                <div className="flex gap-3 w-full md:w-auto">
                    <button onClick={handleGerarDasPdf} disabled={isPdfGenerating} className="btn-press flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 text-xs md:text-sm border border-slate-200 dark:border-slate-600">
                        <DownloadIcon className="w-4 h-4" /> 
                        {isPdfGenerating ? 'Gerando...' : 'Exportar Extrato DAS'}
                    </button>
                    <button onClick={onShowClienteView} className="flex-1 md:flex-none btn-press flex items-center justify-center gap-2 px-4 py-2 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-bold rounded-lg hover:bg-sky-200 dark:hover:bg-sky-800 text-xs md:text-sm">
                        <UserIcon className="w-5 h-5" /> Visão Cliente
                    </button>
                </div>
            </div>

            <div className="flex overflow-x-auto gap-2 mb-6 pb-2 border-b border-slate-200 dark:border-slate-700 no-scrollbar">
                {[
                    { id: 'calculo', label: 'Cálculo & Apuração', icon: <CalculatorIcon className="w-4 h-4" /> },
                    { id: 'analise', label: 'Análise & Gráficos', icon: <SimpleChart type="bar" data={{labels:[], datasets:[]}} options={{}} /> },
                    { id: 'historico_salvo', label: 'Histórico Salvo', icon: <HistoryIcon className="w-4 h-4" /> },
                ].map((tab) => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id as TabType)} className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-bold text-sm whitespace-nowrap transition-colors border-b-2 ${activeTab === tab.id ? 'border-sky-600 text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
                        {tab.id !== 'analise' && tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            <div className="space-y-6">
                {activeTab === 'calculo' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
                        <div className="lg:col-span-2 space-y-6">
                            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border-l-4 border-sky-500 dark:border-sky-400">
                                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
                                    <div className="w-full sm:w-auto">
                                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Competência</label>
                                        <input type="month" value={mesApuracao.toISOString().substring(0, 7)} onChange={(e) => { if(e.target.value) { const [y, m] = e.target.value.split('-'); setMesApuracao(new Date(parseInt(y), parseInt(m)-1, 1)); } }} className="w-full p-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 font-bold dark:text-white" />
                                    </div>
                                    <div className="flex gap-4">
                                        <div className="bg-slate-50 dark:bg-slate-700/50 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-600 text-center">
                                            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Apuração do Mês</p>
                                            <p className="text-xl font-mono font-bold text-slate-900 dark:text-white">R$ {totalMesVigente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                        </div>
                                        <div className="bg-sky-50 dark:bg-sky-900/20 px-4 py-2 rounded-lg border border-sky-100 dark:border-sky-800 text-center">
                                            <p className="text-[10px] font-bold text-sky-700 dark:text-sky-400 uppercase">DAS Estimado</p>
                                            <p className="text-xl font-mono font-bold text-sky-800 dark:text-white">R$ {resumo.das_mensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 border-b border-slate-100 dark:border-slate-700 pb-1">Atividade Principal</h4>
                                        {renderCardCnae(empresa.cnae, empresa.anexo, 'Principal')}
                                    </div>
                                    {(Array.isArray(empresa.atividadesSecundarias) && empresa.atividadesSecundarias.length > 0) && (
                                        <div>
                                            <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 border-b border-slate-100 dark:border-slate-700 pb-1">Atividades Secundárias</h4>
                                            <div className="space-y-3">
                                                {empresa.atividadesSecundarias.map((ativ: SimplesNacionalAtividade, i: number) => renderCardCnae(ativ.cnae, ativ.anexo, 'Secundária', true, i))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {!isAddingCnae ? (
                                    <button onClick={() => setIsAddingCnae(true)} className="w-full mt-4 py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-slate-500 hover:text-sky-600 font-bold flex justify-center items-center gap-2">
                                        <PlusIcon className="w-4 h-4" /> Adicionar Outra Atividade
                                    </button>
                                ) : (
                                    <div className="mt-4 p-4 bg-sky-50 dark:bg-sky-900/20 rounded-lg border border-sky-200 dark:border-sky-800 relative">
                                        <p className="text-xs font-bold text-sky-700 mb-3 uppercase">Nova Atividade</p>
                                        <div className="flex gap-2 mb-3 items-end">
                                            <div className="flex-grow">
                                                <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">CNAE</label>
                                                <input type="text" placeholder="Digite..." value={newCnaeCode} onChange={e => handleSearchCnae(e.target.value)} className="w-full p-2 text-sm rounded border dark:bg-slate-700 dark:border-slate-600" />
                                            </div>
                                            <div className="w-28">
                                                <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Anexo</label>
                                                <select value={newCnaeAnexo} onChange={e => setNewCnaeAnexo(e.target.value)} className="w-full p-2 text-sm rounded border dark:bg-slate-700 dark:border-slate-600">
                                                    <option value="I">Anexo I</option>
                                                    <option value="II">Anexo II</option>
                                                    <option value="III">Anexo III</option>
                                                    <option value="IV">Anexo IV</option>
                                                    <option value="V">Anexo V</option>
                                                    <option value="III_V">III/V</option>
                                                </select>
                                            </div>
                                        </div>
                                        {cnaeSuggestions.length > 0 && (
                                            <div className="absolute z-10 bg-white border rounded shadow-lg max-h-40 overflow-y-auto w-full">
                                                {cnaeSuggestions.map(s => (
                                                    <button key={s.code} onClick={() => handleSelectSuggestion(s)} className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100">
                                                        <b>{s.code}</b> - {s.description}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        <div className="flex justify-end gap-2 mt-2">
                                            <button onClick={() => setIsAddingCnae(false)} className="px-3 py-1 text-xs text-red-500 font-bold">Cancelar</button>
                                            <button onClick={handleAddNewCnae} className="px-3 py-1 bg-sky-600 text-white text-xs font-bold rounded">Confirmar</button>
                                        </div>
                                    </div>
                                )}
                                
                                <div className="mt-6 flex flex-col sm:flex-row gap-3">
                                    <button 
                                        onClick={handleSaveMesVigente} 
                                        disabled={isSaving} 
                                        className={`btn-press flex-1 py-3 font-bold rounded-lg transition-all flex justify-center items-center gap-2 shadow-md ${
                                            saveSuccess 
                                            ? 'bg-green-500 hover:bg-green-600 text-white' 
                                            : 'bg-sky-600 hover:bg-sky-700 text-white'
                                        }`}
                                    >
                                        {isSaving ? (
                                            <LoadingSpinner small />
                                        ) : saveSuccess ? (
                                            <><AnimatedCheckIcon className="text-white" size="w-5 h-5" /><span>Salvo com Sucesso!</span></>
                                        ) : (
                                            <><SaveIcon className="w-4 h-4" /><span>Calcular e Salvar</span></>
                                        )}
                                    </button>
                                    <button onClick={handleGerarDasPdf} disabled={isPdfGenerating} className="btn-press py-3 px-6 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors flex justify-center items-center gap-2 shadow-sm border border-slate-200 dark:border-slate-600">
                                        <DownloadIcon className="w-4 h-4" /> 
                                        {isPdfGenerating ? 'Gerando...' : 'PDF Detalhado'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Coluna Direita (Ferramentas) */}
                        <div className="space-y-6">
                            {/* ... (Import, RBT12, Folha cards unchanged) */}
                            <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
                                    <DownloadIcon className="w-4 h-4 text-sky-600" />
                                    Importar Dados (IA)
                                </h3>
                                <p className="text-[10px] text-slate-500 mb-3">Arraste ou clique para enviar notas ou extrato PGDAS (PDF, XML).</p>
                                <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-6 text-center relative hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer group">
                                    <input 
                                        type="file" 
                                        accept=".pdf, .xml, .xlsx, .xls"
                                        onChange={handleFileUpload}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        disabled={isImporting}
                                    />
                                    {isImporting ? <LoadingSpinner /> : (
                                        <div className="flex flex-col items-center">
                                            <DocumentTextIcon className="w-6 h-6 text-slate-400 group-hover:text-sky-500 mb-1 transition-colors" />
                                            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Selecionar Arquivo</span>
                                        </div>
                                    )}
                                </div>
                                {importResult && (
                                    <div className="mt-3 p-2 bg-slate-50 dark:bg-slate-900/50 rounded text-[10px]">
                                        <p className="text-green-600 font-bold">Sucesso: {importResult.successCount}</p>
                                        {importResult.failCount > 0 && <p className="text-red-500 font-bold">Erros: {importResult.failCount}</p>}
                                    </div>
                                )}
                            </div>

                            <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
                                    <HistoryIcon className="w-4 h-4 text-sky-600" /> RBT12 (Histórico)
                                </h3>
                                <button onClick={() => setIsHistoryModalOpen(true)} className="text-[10px] text-sky-600 hover:underline font-bold w-full text-right mb-2">Editar Manual</button>
                                <div className="p-3 bg-slate-100 dark:bg-slate-700/50 rounded-lg mb-3">
                                    <p className="text-[10px] text-slate-500 uppercase font-bold">Receita Bruta 12 Meses</p>
                                    <p className="text-lg font-mono font-bold text-slate-900 dark:text-white">R$ {totalRbt12Manual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
                                    <UserIcon className="w-4 h-4 text-sky-600" /> Folha de Salários (12m)
                                </h3>
                                <div className="space-y-3">
                                    <div className="flex gap-2">
                                        <CurrencyInput value={folha12Input} onChange={setFolha12Input} className="flex-1" />
                                        <button onClick={() => onUpdateFolha12(empresa.id, folha12Input)} className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 p-2 rounded-lg text-slate-600 dark:text-slate-300"><SaveIcon className="w-4 h-4" /></button>
                                    </div>
                                    <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
                                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1 mb-1">Fator R (Manual %)</label>
                                        <div className="relative">
                                            <input type="text" value={fatorRManual} onChange={(e) => setFatorRManual(e.target.value)} className="w-full pl-2 pr-6 py-1.5 text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg outline-none text-right font-bold" placeholder="Auto" />
                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-xs">%</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'analise' && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-800/50 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2"><CalculatorIcon className="w-6 h-6 text-sky-600" /> Resumo Consolidado</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="p-4 bg-white dark:bg-slate-700/50 rounded-lg border border-slate-100 dark:border-slate-600">
                                    <p className="text-xs font-bold text-slate-500 uppercase">RBT12</p>
                                    <p className="text-2xl font-mono font-bold text-slate-800 dark:text-white">R$ {resumo.rbt12.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                </div>
                                <div className="p-4 bg-white dark:bg-slate-700/50 rounded-lg border border-slate-100 dark:border-slate-600">
                                    <p className="text-xs font-bold text-slate-500 uppercase">Aliq. Efetiva</p>
                                    <p className="text-2xl font-mono font-bold text-sky-600 dark:text-sky-400">{resumo.aliq_eff.toFixed(2)}%</p>
                                </div>
                                <div className="md:col-span-2 p-6 bg-sky-600 text-white rounded-xl shadow-lg relative overflow-hidden">
                                    <div className="relative z-10">
                                        <p className="text-sky-100 font-bold uppercase text-xs tracking-wider mb-1">Valor Estimado do DAS</p>
                                        <p className="text-4xl font-extrabold">R$ {resumo.das_mensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        {renderTaxAnalysisSection()}

                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                            {Array.from(new Set(allActivities.map(a => a.anexo))).map((anexo: any) => {
                                let anexosToShow: string[] = [anexo];
                                if (anexo === 'III_V') anexosToShow = ['III', 'V'];
                                
                                return anexosToShow.map(a => renderTabelaReferencia(a, resumo.rbt12));
                            })}
                        </div>

                        {resumo.detalhamento_anexos && resumo.detalhamento_anexos.length > 0 && (
                            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 uppercase text-xs">
                                        <tr>
                                            <th className="px-6 py-3">Anexo</th>
                                            <th className="px-6 py-3 text-right">Base</th>
                                            <th className="px-6 py-3 text-center">Aliq. Nom.</th>
                                            <th className="px-6 py-3 text-center">Aliq. Ef.</th>
                                            <th className="px-6 py-3 text-right">Valor DAS</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                        {resumo.detalhamento_anexos.map((detalhe, idx) => (
                                            <tr key={idx}>
                                                <td className="px-6 py-4 font-bold text-slate-700 dark:text-slate-200">Anexo {detalhe.anexo}</td>
                                                <td className="px-6 py-4 text-right font-mono">{detalhe.faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                <td className="px-6 py-4 text-center font-mono">{detalhe.aliquotaNominal}%</td>
                                                <td className="px-6 py-4 text-center font-mono">{detalhe.aliquotaEfetiva.toFixed(2)}%</td>
                                                <td className="px-6 py-4 text-right font-mono font-bold text-sky-600">{detalhe.valorDas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm relative">
                             <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-slate-800 dark:text-slate-100">Evolução do Faturamento</h3>
                                <button onClick={handleExportChartPdf} disabled={isChartExporting} className="text-xs bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 font-bold px-3 py-2 rounded-lg flex items-center gap-1 transition-colors">
                                    <DownloadIcon className="w-3 h-3" />
                                    {isChartExporting ? 'Exportando...' : 'Exportar Gráfico'}
                                </button>
                             </div>
                             <div ref={chartContainerRef} className="h-80 w-full bg-white dark:bg-slate-800">
                                <SimpleChart type="bar" data={chartData} options={chartOptions} />
                             </div>
                        </div>

                        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm relative mt-6">
                             <div className="mb-4">
                                <h3 className="font-bold text-slate-800 dark:text-slate-100">Evolução da Faixa e RBT12 (12 Meses)</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Acompanhamento histórico do enquadramento da empresa nas faixas do Simples Nacional.</p>
                             </div>
                             <div ref={chartFaixasContainerRef} className="h-80 w-full bg-white dark:bg-slate-800">
                                <SimpleChart type="bar" data={dadosEvolucaoFaixas} options={evolucaoFaixasOptions} />
                             </div>
                        </div>
                    </div>
                )}

                {activeTab === 'historico_salvo' && (
                    <div className="space-y-6 animate-fade-in">
                        {empresa.historicoCalculos && empresa.historicoCalculos.length > 0 ? (
                            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden h-fit max-h-96 overflow-y-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 uppercase text-xs">
                                        <tr>
                                            <th className="px-6 py-3">Competência</th>
                                            <th className="px-6 py-3 text-right">RBT12</th>
                                            <th className="px-6 py-3 text-right">DAS</th>
                                            <th className="px-6 py-3 text-center">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                        {filteredHistory.map((hist) => (
                                            <tr key={hist.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 cursor-pointer" onClick={() => setSelectedHistoryItem(hist)}>
                                                <td className="px-6 py-3 font-medium capitalize">{hist.mesReferencia}</td>
                                                <td className="px-6 py-3 text-right font-mono">{hist.rbt12.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                <td className="px-6 py-3 text-right font-mono font-bold text-sky-600">{hist.das_mensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                <td className="px-6 py-3 text-center">
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteHistory(hist.id); }}
                                                        className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-full transition-colors"
                                                        title="Excluir Cálculo"
                                                    >
                                                        <TrashIcon className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : <div className="text-center p-8 text-slate-500">Sem histórico salvo.</div>}
                    </div>
                )}
            </div>

            {/* Modals Auxiliares */}
            {isHistoryModalOpen && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[70] animate-fade-in" onClick={() => setIsHistoryModalOpen(false)}>
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b dark:border-slate-700 flex justify-between items-center">
                            <h3 className="text-xl font-bold dark:text-slate-100">Faturamento Manual (Detalhado)</h3>
                            <button onClick={() => setIsHistoryModalOpen(false)}><CloseIcon className="w-5 h-5 text-slate-400" /></button>
                        </div>
                        <div className="p-6 overflow-y-auto bg-slate-50 dark:bg-slate-900/50 flex-grow">
                            <div className="mb-6 p-4 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg shadow-sm flex gap-2 items-end">
                                <div className="flex-grow"><CurrencyInput label="Valor Padrão (Principal)" value={valorPadraoHistorico} onChange={setValorPadraoHistorico} className="w-full" /></div>
                                <button onClick={handleAplicarValorEmLote} className="btn-press px-4 py-2 bg-sky-100 text-sky-700 font-bold rounded-lg h-[42px]">Aplicar a Todos</button>
                            </div>
                            <div className="overflow-x-auto border dark:border-slate-700 rounded-lg shadow-sm">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-slate-700 uppercase bg-slate-100 dark:bg-slate-700 dark:text-slate-300">
                                        <tr>
                                            <th className="px-4 py-3 sticky left-0 bg-slate-100 dark:bg-slate-700 z-10 w-32">Competência</th>
                                            {allActivities.map((ativ) => <th key={ativ.cnae} className="px-4 py-3 min-w-[150px]">{ativ.label} ({ativ.cnae})</th>)}
                                            <th className="px-4 py-3 text-right bg-slate-200 dark:bg-slate-600/50 min-w-[140px]">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
                                        {mesesHistorico.map(m => (
                                            <tr key={m.iso} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                                                <td className="px-4 py-3 font-bold sticky left-0 bg-white dark:bg-slate-800 z-10 border-r dark:border-slate-700">{m.label}</td>
                                                {allActivities.map((ativ) => (
                                                    <td key={`${m.iso}-${ativ.cnae}`} className="px-4 py-2">
                                                        <CurrencyInput value={historicoDetalhadoEditavel[m.iso]?.[ativ.cnae] || 0} onChange={(val) => handleHistoricoDetalheChange(m.iso, ativ.cnae, val)} className="w-full" />
                                                    </td>
                                                ))}
                                                <td className="px-4 py-3 text-right font-mono font-bold bg-slate-50 dark:bg-slate-900/30">{(historicoManualEditavel[m.iso] || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="p-4 border-t dark:border-slate-700 bg-white dark:bg-slate-800 rounded-b-xl flex justify-end gap-3">
                             <button onClick={() => setIsHistoryModalOpen(false)} className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                            <button onClick={handleSaveHistorico} className="px-6 py-2 bg-sky-600 text-white font-bold rounded-lg hover:bg-sky-700 shadow-md">Salvar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Análise CNAE / Detalhes Histórico (Simplificados) */}
            {selectedHistoryItem && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[70] animate-fade-in" onClick={() => setSelectedHistoryItem(null)}>
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
                        <h3 className="font-bold text-lg mb-4">Detalhes {selectedHistoryItem.mesReferencia}</h3>
                        <div className="space-y-2">
                            <p className="flex justify-between"><span>RBT12:</span> <span className="font-mono">{selectedHistoryItem.rbt12.toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</span></p>
                            <p className="flex justify-between"><span>Aliq. Efetiva:</span> <span className="font-mono">{selectedHistoryItem.aliq_eff.toFixed(2)}%</span></p>
                            <p className="flex justify-between font-bold text-sky-600 mt-2 border-t pt-2"><span>DAS:</span> <span>{selectedHistoryItem.das_mensal.toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</span></p>
                        </div>
                        <button onClick={() => setSelectedHistoryItem(null)} className="w-full mt-6 py-2 bg-slate-100 hover:bg-slate-200 rounded font-bold">Fechar</button>
                    </div>
                </div>
            )}
            
            {cnaeAnalysis && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[100]" onClick={() => setCnaeAnalysis(null)}>
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between mb-4"><h3 className="font-bold text-lg flex gap-2"><ShieldIcon className="w-6 h-6 text-sky-600"/> Análise CNAE</h3><button onClick={() => setCnaeAnalysis(null)}><CloseIcon className="w-5 h-5"/></button></div>
                        <div className="prose prose-sm dark:prose-invert"><FormattedText text={String(cnaeAnalysis || '')} /></div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SimplesNacionalDetalhe;