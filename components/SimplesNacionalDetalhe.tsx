
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { SimplesNacionalEmpresa, SimplesNacionalNota, SimplesNacionalImportResult, CnaeTaxDetail, SimplesHistoricoCalculo, DetalhamentoAnexo, SimplesNacionalResumo, SimplesNacionalAtividade, CnaeSuggestion } from '../types';
import * as simplesService from '../services/simplesNacionalService';
import { fetchCnaeTaxDetails, fetchCnaeSuggestions, fetchCnaeDescription } from '../services/geminiService';
import { ArrowLeftIcon, CalculatorIcon, DownloadIcon, SaveIcon, UserIcon, InfoIcon, AnimatedCheckIcon, PlusIcon, TrashIcon, CloseIcon, ShieldIcon, HistoryIcon, DocumentTextIcon, CopyIcon, PencilIcon, SearchIcon } from './Icons';
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
}

interface CnaeInputState {
    valor: string;
    issRetido: boolean;
    icmsSt: boolean;
}

type TabType = 'calculo' | 'analise' | 'historico_salvo';

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
    empresa, notas, onBack, onImport, onUpdateFolha12, onSaveFaturamentoManual, onUpdateEmpresa, onShowClienteView, onShowToast 
}) => {
    const [activeTab, setActiveTab] = useState<TabType>('calculo');
    const [mesApuracao, setMesApuracao] = useState(new Date());
    const [folha12Input, setFolha12Input] = useState(empresa.folha12);
    const [isImporting, setIsImporting] = useState(false);
    const [importResult, setImportResult] = useState<SimplesNacionalImportResult | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    
    // Novo estado complexo para suportar valor + checkboxes por CNAE
    const [faturamentoPorCnae, setFaturamentoPorCnae] = useState<Record<string, CnaeInputState>>({});
    
    // Estados para Histórico
    const [historicoManualEditavel, setHistoricoManualEditavel] = useState<Record<string, number>>({});
    const [historicoDetalhadoEditavel, setHistoricoDetalhadoEditavel] = useState<Record<string, Record<string, number>>>({});
    
    const [valorPadraoHistorico, setValorPadraoHistorico] = useState<number>(0); // Para aplicar em lote
    const [fatorRManual, setFatorRManual] = useState<string>(''); // Fator R manual input (percentage)

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

    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

    const [filterYear, setFilterYear] = useState<string>('all');
    const [filterMonth, setFilterMonth] = useState<string>('all');

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

    const allActivities = useMemo(() => {
        const list = [{ cnae: empresa.cnae, anexo: empresa.anexo, label: 'Principal' }];
        if (empresa.atividadesSecundarias) {
            empresa.atividadesSecundarias.forEach((sec, idx) => {
                list.push({ ...sec, label: `Secundário ${idx + 1}` });
            });
        }
        return list;
    }, [empresa]);

    const resumo: SimplesNacionalResumo = useMemo(() => {
        // Prepara os itens de cálculo com base no estado atual dos inputs (valores + retencoes)
        const itensCalculo: any[] = [];
        
        Object.entries(faturamentoPorCnae).forEach(([key, state]: [string, CnaeInputState]) => {
            // Nova lógica de chave: TIPO::INDEX::CNAE::ANEXO
            const parts = key.split('::');
            
            let cnaeCode = '';
            let anexoCode = '';
            
            if (parts.length >= 4) {
                cnaeCode = parts[2];
                anexoCode = parts[3];
            } else {
                [cnaeCode, anexoCode] = key.split('_');
            }

            const val = parseFloat(state.valor.replace(/\./g, '').replace(',', '.') || '0');
            
            if (val > 0) {
                itensCalculo.push({ 
                    cnae: cnaeCode, 
                    anexo: anexoCode, 
                    valor: val, 
                    issRetido: state.issRetido, 
                    icmsSt: state.icmsSt 
                });
            }
        });

        // Cria uma cópia da empresa com o histórico manual atualizado
        const empresaTemp = { ...empresa, faturamentoManual: historicoManualEditavel };

        // Parse fator R manual se existir
        let fatorRValue: number | undefined = undefined;
        if (fatorRManual.trim() !== '') {
            const parsed = parseFloat(fatorRManual.replace(',', '.'));
            if (!isNaN(parsed)) {
                fatorRValue = parsed / 100; // Converte 28.5 para 0.285
            }
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

    const discriminacaoImpostos = useMemo(() => {
        return simplesService.calcularDiscriminacaoImpostos(
            resumo.anexo_efetivo,
            resumo.faixa_index,
            resumo.das_mensal
        );
    }, [resumo]);

    const totalMesVigente = useMemo(() => {
        let total = 0;
        Object.values(faturamentoPorCnae).forEach((item: CnaeInputState) => {
            total += parseFloat(item.valor.replace(/\./g, '').replace(',', '.') || '0');
        });
        return total;
    }, [faturamentoPorCnae]);

    const availableYears = useMemo<number[]>(() => {
        if (!empresa.historicoCalculos) return [];
        const years = new Set<number>();
        empresa.historicoCalculos.forEach(h => {
            const date = new Date(h.dataCalculo);
            years.add(date.getFullYear());
        });
        return Array.from(years).sort((a, b) => b - a);
    }, [empresa.historicoCalculos]);

    const filteredHistory = useMemo<SimplesHistoricoCalculo[]>(() => {
        if (!empresa.historicoCalculos) return [];
        return empresa.historicoCalculos.filter(h => {
            const date = new Date(h.dataCalculo);
            const matchYear = filterYear === 'all' || date.getFullYear().toString() === filterYear;
            const matchMonth = filterMonth === 'all' || date.getMonth() === parseInt(filterMonth);
            return matchYear && matchMonth;
        }).sort((a, b) => b.dataCalculo - a.dataCalculo);
    }, [empresa.historicoCalculos, filterYear, filterMonth]);

    // --- EFFECTS ---

    useEffect(() => {
        const mesChave = `${mesApuracao.getFullYear()}-${(mesApuracao.getMonth() + 1).toString().padStart(2, '0')}`;
        const totalMes = empresa.faturamentoManual?.[mesChave] || 0;
        const detalheMes = empresa.faturamentoMensalDetalhado?.[mesChave] || {};
        
        // Verifica se há dados detalhados para este mês. Se houver, usa-os. Se não, usa o totalMes (Legacy) na principal.
        const hasDetalhe = Object.keys(detalheMes).length > 0;

        // Inicializa o estado complexo de inputs
        const novoFaturamentoPorCnae: Record<string, CnaeInputState> = {};
        
        const createInitialState = (val: number = 0): CnaeInputState => ({
            valor: val > 0 ? new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) : '0,00',
            issRetido: false,
            icmsSt: false
        });

        // Principal - Chave Única com Prefixo
        const keyPrincipal = `principal::0::${empresa.cnae}::${empresa.anexo}`;
        // Se tem detalhe, pega o valor específico do CNAE Principal. Se não tem detalhe mas tem total, assume tudo na principal.
        const valorPrincipal = hasDetalhe ? (detalheMes[empresa.cnae] || 0) : totalMes;
        novoFaturamentoPorCnae[keyPrincipal] = createInitialState(valorPrincipal);
        
        // Secundários - Chave Única com Prefixo e Índice
        if (empresa.atividadesSecundarias) {
            empresa.atividadesSecundarias.forEach((ativ, index) => {
                const key = `secundario::${index}::${ativ.cnae}::${ativ.anexo}`;
                // Se tem detalhe, pega o valor específico. Se não tem detalhe, secundários começam zerados (pois o total foi pra principal).
                const valorSecundario = hasDetalhe ? (detalheMes[ativ.cnae] || 0) : 0;
                
                if (!novoFaturamentoPorCnae[key]) {
                    novoFaturamentoPorCnae[key] = createInitialState(valorSecundario);
                }
            });
        }
        
        setFaturamentoPorCnae(novoFaturamentoPorCnae);
        setHistoricoManualEditavel(empresa.faturamentoManual || {});
        setHistoricoDetalhadoEditavel(empresa.faturamentoMensalDetalhado || {});

    }, [mesApuracao, empresa.id, empresa.faturamentoManual, empresa.faturamentoMensalDetalhado]);

    // Fecha sugestões ao clicar fora
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
                setCnaeSuggestions([]);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // --- HANDLERS ---

    const handleSearchCnae = (query: string) => {
        setNewCnaeCode(query);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);

        if (query.length < 3) {
            setCnaeSuggestions([]);
            return;
        }

        setIsSearchingCnae(true);
        searchTimeout.current = setTimeout(async () => {
            try {
                const suggestions = await fetchCnaeSuggestions(query);
                setCnaeSuggestions(suggestions);
            } catch (error) {
                console.error("Erro ao buscar sugestões CNAE:", error);
            } finally {
                setIsSearchingCnae(false);
            }
        }, 600);
    };

    const handleSelectSuggestion = (suggestion: CnaeSuggestion) => {
        setNewCnaeCode(suggestion.code);
        setCnaeSuggestions([]);
        // Tenta inferir anexo básico
        if (suggestion.code.startsWith('47')) setNewCnaeAnexo('I');
        else if (suggestion.code.startsWith('10')) setNewCnaeAnexo('II');
        else setNewCnaeAnexo('III');
    };

    const handleValidateCnae = async (cnaeToValidate: string) => {
        if (!cnaeToValidate.trim()) return;
        setIsValidatingCnae(cnaeToValidate);
        try {
            const result = await fetchCnaeDescription(cnaeToValidate);
            setCnaeAnalysis(result.text);
        } catch (e) {
            console.error(e);
            if(onShowToast) onShowToast("Erro ao validar CNAE.");
        } finally {
            setIsValidatingCnae(null);
        }
    };

    const handleFaturamentoChange = (key: string, field: keyof CnaeInputState, value: any) => {
        setFaturamentoPorCnae((prev: Record<string, CnaeInputState>) => ({
            ...prev,
            [key]: { ...prev[key], [field]: value }
        }));
    };

    const handleOptionToggle = (key: string, field: 'issRetido' | 'icmsSt') => {
        setFaturamentoPorCnae((prev: Record<string, CnaeInputState>) => ({
            ...prev,
            [key]: { ...prev[key], [field]: !prev[key][field] }
        }));
    };

    const handleSaveMesVigente = async () => {
        setIsSaving(true);
        try {
            let totalCalculado = 0;
            Object.values(faturamentoPorCnae).forEach((item: CnaeInputState) => {
                totalCalculado += parseFloat(item.valor.replace(/\./g, '').replace(',', '.') || '0');
            });

            const mesChave = `${mesApuracao.getFullYear()}-${(mesApuracao.getMonth() + 1).toString().padStart(2, '0')}`;
            const updatedManual = { ...historicoManualEditavel, [mesChave]: totalCalculado };
            
            const detalheMes: Record<string, number> = {};
            Object.entries(faturamentoPorCnae).forEach(([key, state]) => {
                 const parts = key.split('::');
                 // Chave é "principal::0::CNAE::ANEXO" ou "secundario::i::CNAE::ANEXO"
                 // Pega o CNAE da posição 2
                 let cnaeCode = parts.length >= 3 ? parts[2] : key;
                 
                 const typedState = state as CnaeInputState;
                 const val = parseFloat(typedState.valor.replace(/\./g, '').replace(',', '.') || '0');
                 if(val > 0) {
                     detalheMes[cnaeCode] = (detalheMes[cnaeCode] || 0) + val;
                 }
            });
            
            const updatedDetalhado = { ...historicoDetalhadoEditavel, [mesChave]: detalheMes };

            await onSaveFaturamentoManual(empresa.id, updatedManual, updatedDetalhado);
            setHistoricoManualEditavel(updatedManual);
            setHistoricoDetalhadoEditavel(updatedDetalhado);
            
            await simplesService.saveHistoricoCalculo(empresa.id, resumo, mesApuracao);
            
            if (onShowToast) onShowToast('Apuração salva com sucesso!');
        } catch (error) {
            console.error("Erro ao salvar:", error);
            if (onShowToast) onShowToast('Erro ao salvar apuração.');
        } finally {
            setIsSaving(false);
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

        setHistoricoDetalhadoEditavel(prev => ({
            ...prev,
            [mesIso]: newDetalheMes
        }));

        setHistoricoManualEditavel(prev => ({
            ...prev,
            [mesIso]: totalMes
        }));
    };

    const handleSaveHistorico = () => {
        if (window.confirm('Deseja salvar todo o faturamento manual dos meses informados? Isso substituirá os dados existentes.')) {
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
        
        if (onShowToast) onShowToast(`Valor R$ ${valorPadraoHistorico.toFixed(2)} aplicado a todos os meses (Atrib. Principal)!`);
    };

    const handleAnalyzeTax = async () => {
        setIsAnalyzingTax(true);
        setTaxDetails({});
        try {
            const cnaesToAnalyze = [empresa.cnae, ...(empresa.atividadesSecundarias?.map(a => a.cnae) || [])];
            const results: Record<string, CnaeTaxDetail[]> = {};
            
            for (const cnae of cnaesToAnalyze) {
                results[cnae] = await fetchCnaeTaxDetails(cnae, manualTaxRates);
            }
            setTaxDetails(results);
        } catch (e) {
            console.error("Tax analysis failed", e);
        } finally {
            setIsAnalyzingTax(false);
        }
    };

    const handleGerarDasPdf = async () => {
        setIsPdfGenerating(true);
        try {
            const { default: jsPDF } = await import('jspdf');
            const { default: html2canvas } = await import('html2canvas');
            const doc = new jsPDF();
            
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            let y = 20;
            const now = new Date();

            // 1. Header Text
            doc.setFontSize(18);
            doc.setTextColor(14, 165, 233); // Sky Blue
            doc.text("Relatório de Apuração - Simples Nacional", pageWidth / 2, y, { align: 'center' });
            
            y += 15;
            doc.setFontSize(12);
            doc.setTextColor(0);
            doc.setFont("helvetica", "bold");
            doc.text(`Empresa: ${empresa.nome}`, 20, y);
            doc.text(`CNPJ: ${empresa.cnpj}`, pageWidth - 20, y, { align: 'right' });
            
            y += 8;
            doc.setFont("helvetica", "normal");
            doc.text(`Competência: ${(mesApuracao as any).toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}`, 20, y);
            doc.text(`Emissão: ${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR')}`, pageWidth - 20, y, { align: 'right' });

            y += 10;
            doc.setDrawColor(200);
            doc.line(20, y, pageWidth - 20, y);
            y += 10;

            // 2. Resumo Textual
            doc.setFont("helvetica", "bold");
            doc.text("Resumo do Cálculo", 20, y);
            y += 10;
            
            doc.setFont("helvetica", "normal");
            doc.text(`Receita Bruta 12 Meses (RBT12): R$ ${resumo.rbt12.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 20, y);
            y += 7;
            doc.text(`Alíquota Efetiva Total: ${resumo.aliq_eff.toFixed(2)}%`, 20, y);
            y += 7;
            doc.text(`Valor do DAS (Estimado): R$ ${resumo.das_mensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 20, y);
            y += 7;
            doc.text(`Fator R: ${(resumo.fator_r * 100).toFixed(2)}%`, 20, y);

            y += 10;

            // 3. Chart Image Capture
            const chartElement = document.getElementById('chart-container');
            if (chartElement) {
                const originalBg = chartElement.style.backgroundColor;
                chartElement.style.backgroundColor = '#ffffff';
                
                const canvas = await html2canvas(chartElement, { scale: 2 });
                const imgData = canvas.toDataURL('image/png');
                
                chartElement.style.backgroundColor = originalBg;

                const imgProps = doc.getImageProperties(imgData);
                const pdfImgWidth = pageWidth - 40;
                const pdfImgHeight = (imgProps.height * pdfImgWidth) / imgProps.width;
                
                if (y + pdfImgHeight > pageHeight - 20) {
                    doc.addPage();
                    y = 20;
                }

                doc.addImage(imgData, 'PNG', 20, y, pdfImgWidth, pdfImgHeight);
                y += pdfImgHeight + 10;
            }

            // 4. Memória de Cálculo Table (Detalhamento dos Tributos)
            if (y + 60 > pageHeight - 20) {
                doc.addPage();
                y = 20;
            }

            doc.setFont("helvetica", "bold");
            doc.text("Discriminação dos Tributos (Repartição do DAS)", 20, y);
            y += 10;

            // Header Tabela
            doc.setFillColor(240, 240, 240);
            doc.rect(20, y, pageWidth - 40, 8, 'F');
            doc.setFontSize(10);
            doc.text("Tributo", 25, y + 5);
            doc.text("Valor (R$)", pageWidth - 25, y + 5, { align: 'right' });
            y += 10;

            // Rows Tabela
            doc.setFont("helvetica", "normal");
            Object.entries(discriminacaoImpostos).forEach(([key, val]) => {
                doc.text(key, 25, y + 5);
                doc.text((val as number).toLocaleString('pt-BR', { minimumFractionDigits: 2 }), pageWidth - 25, y + 5, { align: 'right' });
                y += 7;
            });

            // Add new page for RBT12 History
            doc.addPage();
            y = 20;
            
            doc.setFontSize(14);
            doc.setFont("helvetica", "bold");
            doc.text("Histórico de Receita Bruta (RBT12) - Últimos 12 Meses", 20, y);
            y += 15;

            doc.setFontSize(10);
            doc.setFillColor(240, 240, 240);
            doc.rect(20, y, pageWidth - 40, 8, 'F');
            doc.text("Mês de Referência", 25, y + 5);
            doc.text("Valor Faturado (R$)", pageWidth - 25, y + 5, { align: 'right' });
            y += 10;

            doc.setFont("helvetica", "normal");
            mesesHistorico.forEach(m => {
                const valor = historicoManualEditavel[m.iso] || 0;
                doc.text(m.label, 25, y + 5);
                doc.text(valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), pageWidth - 25, y + 5, { align: 'right' });
                y += 7;
            });

            // Footer with CNAE context
            y += 10;
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`CNAE Principal: ${empresa.cnae} (Anexo ${empresa.anexo})`, 20, y);
            
            // Check if array exists and has items before mapping
            const atividadesSecundarias = empresa.atividadesSecundarias;
            if (atividadesSecundarias && Array.isArray(atividadesSecundarias) && atividadesSecundarias.length > 0) {
                 y += 5;
                 const secCnaes = atividadesSecundarias.map((a: SimplesNacionalAtividade) => a.cnae).join(', ');
                 doc.text(`Atividades Secundárias: ${secCnaes}`, 20, y);
            }

            doc.save(`memoria-calculo-das-${empresa.nome.replace(/\s+/g, '-')}-${mesApuracao.toISOString().slice(0, 7)}.pdf`);

        } catch (e) {
            console.error("Erro ao gerar PDF", e);
            alert("Erro ao gerar PDF.");
        } finally {
            setIsPdfGenerating(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsImporting(true);
        try {
            const result = await onImport(empresa.id, file);
            setImportResult(result);
            if (result.successCount > 0) {
                 if (result.errors.length === 0 && file.name.endsWith('.pdf')) {
                     const updatedEmpresa = (await simplesService.getEmpresas(null)).find(e => e.id === empresa.id);
                     if(updatedEmpresa?.faturamentoManual) setHistoricoManualEditavel(updatedEmpresa.faturamentoManual);
                 }
                 if(onShowToast) onShowToast(`${result.successCount} registros importados com sucesso!`);
            }
        } catch (error) {
            setImportResult({ successCount: 0, failCount: 0, errors: ["Erro na importação"] });
        } finally {
            setIsImporting(false);
        }
    };

    const chartData = {
        labels: resumo.historico_simulado.map(h => h.label),
        datasets: [
            {
                label: 'Faturamento (R$)',
                data: resumo.historico_simulado.map(h => h.faturamento),
                backgroundColor: 'rgba(14, 165, 233, 0.6)',
                yAxisID: 'y',
            },
            {
                label: 'Alíquota (%)',
                data: resumo.historico_simulado.map(h => h.aliquotaEfetiva),
                type: 'line' as const,
                borderColor: 'rgb(245, 158, 11)',
                borderWidth: 2,
                yAxisID: 'y1',
            }
        ],
    };

    // Reusable Tax Analysis Component to maintain consistency across tabs
    const renderTaxAnalysisSection = (compact = false) => (
        <div className={`bg-white dark:bg-slate-800 ${compact ? 'p-4' : 'p-6'} rounded-xl shadow-sm ${compact ? 'border border-slate-200 dark:border-slate-700' : ''}`}>
            {/* Header and Button Logic */}
            <div className={`flex ${compact ? 'flex-col gap-3' : 'flex-col md:flex-row justify-between items-start md:items-center gap-4'} mb-4`}>
                <div>
                    <h3 className={`${compact ? 'text-sm' : 'text-lg'} font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2`}>
                        <ShieldIcon className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} text-sky-600`} />
                        {compact ? 'Consultor Tributário (IA)' : 'Análise Tributária Inteligente (IA)'}
                    </h3>
                    {!compact && <p className="text-sm text-slate-500">Consulte a incidência detalhada de impostos para os CNAEs desta empresa.</p>}
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    {!showRefinement ? (
                        <button 
                            onClick={() => {
                                if (Object.keys(taxDetails).length === 0) {
                                    handleAnalyzeTax();
                                } else {
                                    setShowRefinement(true);
                                }
                            }} 
                            disabled={isAnalyzingTax}
                            className={`btn-press flex-1 md:flex-none px-4 py-2 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-bold rounded-lg hover:bg-sky-200 text-sm h-[34px] flex items-center justify-center gap-2`}
                        >
                            {isAnalyzingTax ? <LoadingSpinner small /> : (
                                Object.keys(taxDetails).length === 0 ? 'Analisar Impostos' : 'Refinar Cálculo'
                            )}
                        </button>
                    ) : (
                        <button onClick={() => setShowRefinement(false)} className="p-1 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 ml-auto">
                            <CloseIcon className="w-5 h-5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Refinement Inputs */}
            {showRefinement && (
                <div className={`mb-6 p-4 bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-slate-200 dark:border-slate-600 animate-fade-in`}>
                    <p className="text-xs font-bold text-slate-500 mb-2">Informe alíquotas para maior precisão:</p>
                    <div className={`grid ${compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-4'} gap-3 items-end`}>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1 block">ICMS (%)</label>
                            <input type="text" className="w-full p-2 text-sm border rounded bg-white dark:bg-slate-800 dark:text-white dark:border-slate-600 outline-none focus:ring-2 focus:ring-sky-500" placeholder="18.00" value={manualTaxRates.icms} onChange={e => setManualTaxRates(p => ({...p, icms: e.target.value}))} />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1 block">PIS/COFINS (%)</label>
                            <input type="text" className="w-full p-2 text-sm border rounded bg-white dark:bg-slate-800 dark:text-white dark:border-slate-600 outline-none focus:ring-2 focus:ring-sky-500" placeholder="9.25" value={manualTaxRates.pisCofins} onChange={e => setManualTaxRates(p => ({...p, pisCofins: e.target.value}))} />
                        </div>
                        <div>
                            <label className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 mb-1 block">ISS (%)</label>
                            <input type="text" className="w-full p-2 text-sm border rounded bg-white dark:bg-slate-800 dark:text-white dark:border-slate-600 outline-none focus:ring-2 focus:ring-sky-500" placeholder="5.00" value={manualTaxRates.iss} onChange={e => setManualTaxRates(p => ({...p, iss: e.target.value}))} />
                        </div>
                        <button onClick={() => handleAnalyzeTax()} disabled={isAnalyzingTax} className="btn-press w-full py-2 bg-sky-600 text-white font-bold rounded-lg hover:bg-sky-700 disabled:opacity-50 text-sm h-[38px]">
                            {isAnalyzingTax ? 'Calculando...' : 'Aplicar'}
                        </button>
                    </div>
                </div>
            )}

            {/* Results List */}
            {Object.keys(taxDetails).length > 0 && (
                <div className="space-y-4 max-h-96 overflow-y-auto custom-scrollbar">
                    {Object.entries(taxDetails).map(([cnae, details]) => (
                        <div key={cnae} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                            <div className="bg-slate-50 dark:bg-slate-700/50 px-3 py-2 border-b border-slate-200 dark:border-slate-700">
                                <span className="font-bold text-sky-700 dark:text-sky-300 text-xs">CNAE: {cnae}</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs text-left text-slate-600 dark:text-slate-300">
                                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-500 uppercase font-bold">
                                        <tr>
                                            <th className="px-3 py-2">Tributo</th>
                                            <th className="px-3 py-2">Incidência</th>
                                            {!compact && <th className="px-3 py-2">Alíquota</th>}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                        {(details as CnaeTaxDetail[]).map((row, idx) => (
                                            <tr key={idx}>
                                                <td className="px-3 py-2 font-bold">{row.tributo}</td>
                                                <td className="px-3 py-2">{row.incidencia}</td>
                                                {!compact && <td className="px-3 py-2">{row.aliquotaMedia}</td>}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    const renderCardCnae = (cnae: string, anexo: string, label: string, isSecondary: boolean = false, index?: number) => {
        // Gera chave única baseada no tipo (principal/secundario) e índice
        const key = isSecondary 
            ? `secundario::${index}::${cnae}::${anexo}`
            : `principal::0::${cnae}::${anexo}`;
            
        const state = faturamentoPorCnae[key] || { valor: '0,00', issRetido: false, icmsSt: false };
        
        // Regras de Exibição de Checkbox:
        // ICMS ST: Anexos I e II (Comércio e Indústria)
        // Retenção ISS: Anexos III, IV, V (Serviços)
        const showIcmsSt = ['I', 'II'].includes(anexo);
        const showIss = ['III', 'IV', 'V', 'III_V'].includes(anexo);

        return (
            <div key={key} className="bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-600 rounded-lg p-4 relative group hover:border-sky-300 transition-colors shadow-sm">
                <div className="absolute top-2 right-2 flex gap-1">
                    {isSecondary && index !== undefined && (
                        <button 
                            onClick={() => handleRemoveSecondary(index)}
                            className="text-slate-400 hover:text-red-500 p-1"
                            title="Excluir atividade"
                            aria-label={`Excluir atividade secundária ${cnae}`}
                        >
                            <TrashIcon className="w-4 h-4" />
                        </button>
                    )}
                    <button
                        onClick={() => handleValidateCnae(cnae)}
                        disabled={!!isValidatingCnae}
                        className="text-slate-400 hover:text-sky-600 p-1"
                        title="Validar CNAE com IA"
                    >
                        {isValidatingCnae === cnae ? <LoadingSpinner small /> : <ShieldIcon className="w-4 h-4" />}
                    </button>
                </div>
                
                <div className="mb-3">
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</p>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="font-bold text-sky-700 dark:text-sky-400 text-sm font-mono bg-sky-100 dark:bg-sky-900/50 px-2 py-0.5 rounded">{cnae}</span>
                        <span className="text-[10px] bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded font-bold border border-slate-300 dark:border-slate-500">Anexo {anexo}</span>
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">R$</span>
                        <input 
                            type="text" 
                            value={state.valor} 
                            onChange={(e) => handleFaturamentoChange(key, 'valor', e.target.value)}
                            className="w-full pl-9 pr-3 py-3 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-500 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none text-right font-mono font-bold text-slate-900 dark:text-white text-xl shadow-inner"
                            aria-label={`Faturamento para CNAE ${cnae}`}
                        />
                    </div>

                    <div className="flex flex-wrap gap-4 pt-2 border-t border-slate-200 dark:border-slate-600/50">
                        {showIcmsSt && (
                            <label className="flex items-center gap-2 cursor-pointer select-none bg-white dark:bg-slate-800 px-2 py-1 rounded border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700">
                                <input 
                                    type="checkbox" 
                                    checked={state.icmsSt} 
                                    onChange={() => handleOptionToggle(key, 'icmsSt')} 
                                    className="rounded text-sky-600 focus:ring-sky-500 w-4 h-4" 
                                    aria-label="Deduzir ICMS ST"
                                />
                                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1">
                                    ST (Substituição Tributária)
                                    <Tooltip content="Marque se houve Substituição Tributária de ICMS nesta receita (o valor será deduzido do cálculo).">
                                        <InfoIcon className="w-3 h-3 text-slate-400 cursor-help" />
                                    </Tooltip>
                                </span>
                            </label>
                        )}
                        {showIss && (
                            <label className="flex items-center gap-2 cursor-pointer select-none bg-white dark:bg-slate-800 px-2 py-1 rounded border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700">
                                <input 
                                    type="checkbox" 
                                    checked={state.issRetido} 
                                    onChange={() => handleOptionToggle(key, 'issRetido')} 
                                    className="rounded text-sky-600 focus:ring-sky-500 w-4 h-4" 
                                    aria-label="Deduzir ISS Retido"
                                />
                                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1">
                                    Retenção ISS
                                    <Tooltip content="Marque se o ISS foi retido na fonte pelo tomador do serviço (o valor será deduzido do cálculo).">
                                        <InfoIcon className="w-3 h-3 text-slate-400 cursor-help" />
                                    </Tooltip>
                                </span>
                            </label>
                        )}
                        {!showIcmsSt && !showIss && <span className="text-[10px] text-slate-400 italic">Sem deduções aplicáveis para este Anexo</span>}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="animate-fade-in pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
                <div className="flex items-center gap-4 w-full md:w-auto">
                    <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-sky-600 transition-colors font-bold" aria-label="Voltar ao painel">
                        <ArrowLeftIcon className="w-5 h-5" /> Voltar
                    </button>
                    <div className="border-l border-slate-300 dark:border-slate-600 h-6 mx-2 hidden md:block"></div>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{empresa.nome}</h1>
                        <p className="text-slate-500 dark:text-slate-400 font-mono text-xs font-bold">CNPJ: {empresa.cnpj}</p>
                    </div>
                </div>

                <div className="flex gap-3 w-full md:w-auto">
                    <button 
                        onClick={handleGerarDasPdf} 
                        disabled={isPdfGenerating} 
                        className="flex-1 md:flex-none btn-press flex items-center justify-center gap-2 px-4 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-bold rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors disabled:opacity-50 shadow-sm text-xs md:text-sm"
                    >
                        <DocumentTextIcon className="w-5 h-5 text-sky-600" />
                        {isPdfGenerating ? 'Gerando...' : 'Exportar Memória'}
                    </button>
                    <button onClick={onShowClienteView} className="flex-1 md:flex-none btn-press flex items-center justify-center gap-2 px-4 py-2 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-bold rounded-lg hover:bg-sky-200 dark:hover:bg-sky-800 transition-colors text-xs md:text-sm">
                        <UserIcon className="w-5 h-5" /> Visão Cliente
                    </button>
                </div>
            </div>

            {/* Abas de Navegação */}
            <div className="flex overflow-x-auto gap-2 mb-6 pb-2 border-b border-slate-200 dark:border-slate-700 no-scrollbar">
                {[
                    { id: 'calculo', label: 'Cálculo & Apuração', icon: <CalculatorIcon className="w-4 h-4" /> },
                    { id: 'analise', label: 'Análise & Gráficos', icon: <SimpleChart type="bar" data={{labels:[], datasets:[]}} options={{}} /> },
                    { id: 'historico_salvo', label: 'Histórico Salvo', icon: <HistoryIcon className="w-4 h-4" /> },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as TabType)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-bold text-sm whitespace-nowrap transition-colors border-b-2 ${
                            activeTab === tab.id
                                ? 'border-sky-600 text-sky-700 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20'
                                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                    >
                        {tab.id !== 'analise' && tab.icon} 
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Conteúdo das Abas */}
            <div className="space-y-6">
                
                {/* ABA 1: CÁLCULO & APURAÇÃO (MAIN) */}
                {activeTab === 'calculo' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
                        {/* COLUNA ESQUERDA: CÁLCULO DO MÊS */}
                        <div className="lg:col-span-2 space-y-6">
                            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border-l-4 border-sky-500 dark:border-sky-400">
                                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
                                    <div className="w-full sm:w-auto">
                                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Competência (Mês/Ano)</label>
                                        <input 
                                            type="month" 
                                            value={mesApuracao.toISOString().substring(0, 7)}
                                            onChange={(e) => {
                                                if(e.target.value) {
                                                    const [y, m] = e.target.value.split('-');
                                                    setMesApuracao(new Date(parseInt(y), parseInt(m)-1, 1));
                                                }
                                            }}
                                            className="w-full p-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 font-bold dark:text-white"
                                        />
                                    </div>
                                    <div className="bg-sky-50 dark:bg-sky-900/20 px-4 py-2 rounded-lg border border-sky-100 dark:border-sky-800 text-center w-full sm:w-auto">
                                        <p className="text-[10px] font-bold text-sky-700 dark:text-sky-400 uppercase">Faturamento Mês</p>
                                        <p className="text-xl font-mono font-bold text-sky-800 dark:text-white">
                                            R$ {totalMesVigente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </p>
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
                                                {empresa.atividadesSecundarias.map((ativ: SimplesNacionalAtividade, i: number) => 
                                                    renderCardCnae(ativ.cnae, ativ.anexo, 'Secundária', true, i)
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {!isAddingCnae ? (
                                    <button onClick={() => setIsAddingCnae(true)} className="w-full mt-4 py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-slate-500 hover:text-sky-600 hover:border-sky-300 dark:hover:border-sky-700 transition-colors text-xs font-bold flex justify-center items-center gap-2">
                                        <PlusIcon className="w-4 h-4" /> Adicionar Outra Atividade
                                    </button>
                                ) : (
                                    <div className="mt-4 p-4 bg-sky-50 dark:bg-sky-900/20 rounded-lg border border-sky-200 dark:border-sky-800 animate-fade-in relative">
                                        <p className="text-xs font-bold text-sky-700 dark:text-sky-300 mb-3 uppercase tracking-wide">Nova Atividade</p>
                                        <div className="flex gap-2 mb-3 items-end">
                                            <div className="flex-grow relative">
                                                <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">CNAE (Busca Inteligente)</label>
                                                <div className="relative">
                                                    <input 
                                                        type="text" 
                                                        placeholder="Digite código ou descrição..." 
                                                        value={newCnaeCode}
                                                        onChange={e => handleSearchCnae(e.target.value)}
                                                        className="w-full p-2 pl-8 text-sm rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-sky-500"
                                                        autoComplete="off"
                                                    />
                                                    {isSearchingCnae ? (
                                                        <div className="absolute left-2 top-2.5">
                                                            <LoadingSpinner small />
                                                        </div>
                                                    ) : (
                                                        <SearchIcon className="absolute left-2 top-2.5 w-4 h-4 text-slate-400" />
                                                    )}
                                                </div>
                                                {(cnaeSuggestions.length > 0 || isSearchingCnae) && (
                                                    <div ref={suggestionsRef} className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-xl max-h-60 overflow-y-auto animate-fade-in">
                                                        {cnaeSuggestions.map((s) => (
                                                            <button
                                                                key={s.code}
                                                                type="button"
                                                                onClick={() => handleSelectSuggestion(s)}
                                                                className="w-full text-left px-4 py-2 hover:bg-sky-50 dark:hover:bg-slate-700 border-b border-slate-100 dark:border-slate-700 last:border-0 transition-colors"
                                                            >
                                                                <div className="flex items-center justify-between">
                                                                    <span className="font-bold text-sky-600 dark:text-sky-400 text-xs">{s.code}</span>
                                                                </div>
                                                                <p className="text-[10px] text-slate-600 dark:text-slate-300 truncate font-medium">{s.description}</p>
                                                            </button>
                                                        ))}
                                                        {cnaeSuggestions.length === 0 && isSearchingCnae && (
                                                            <div className="p-3 text-xs text-slate-500 text-center">Buscando...</div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="w-28">
                                                <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block">Anexo</label>
                                                <select 
                                                    value={newCnaeAnexo} 
                                                    onChange={e => setNewCnaeAnexo(e.target.value)}
                                                    className="w-full p-2 text-sm rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none"
                                                >
                                                    <option value="I">Anexo I</option>
                                                    <option value="II">Anexo II</option>
                                                    <option value="III">Anexo III</option>
                                                    <option value="IV">Anexo IV</option>
                                                    <option value="V">Anexo V</option>
                                                    <option value="III_V">III/V</option>
                                                </select>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleValidateCnae(newCnaeCode)}
                                                disabled={!!isValidatingCnae || !newCnaeCode.trim()}
                                                className="p-2 mb-[1px] bg-slate-100 dark:bg-slate-700 text-sky-600 dark:text-sky-400 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600 h-[38px] w-[38px] flex items-center justify-center"
                                                title="Validar CNAE com IA"
                                            >
                                                {isValidatingCnae === newCnaeCode ? <LoadingSpinner small /> : <ShieldIcon className="w-5 h-5" />}
                                            </button>
                                        </div>
                                        <div className="flex justify-end gap-2 mt-2">
                                            <button onClick={() => setIsAddingCnae(false)} className="px-3 py-1.5 text-xs text-red-500 font-bold hover:bg-red-50 rounded">Cancelar</button>
                                            <button onClick={handleAddNewCnae} className="px-4 py-1.5 bg-sky-600 text-white text-xs font-bold rounded hover:bg-sky-700 shadow-sm">Confirmar</button>
                                        </div>
                                    </div>
                                )}
                                
                                <button 
                                    onClick={handleSaveMesVigente}
                                    disabled={isSaving}
                                    className="btn-press w-full mt-6 py-3 bg-sky-600 text-white font-bold rounded-lg hover:bg-sky-700 transition-colors flex justify-center items-center gap-2 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSaving ? (
                                        <>
                                            <LoadingSpinner small />
                                            <span>Salvando...</span>
                                        </>
                                    ) : (
                                        <>
                                            <SaveIcon className="w-4 h-4" />
                                            <span>Calcular e Salvar Apuração</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* COLUNA DIREITA: DADOS DE REFERÊNCIA (SIDEBAR RESTAURADA) */}
                        <div className="space-y-6">
                            
                            {/* 4. ANÁLISE TRIBUTÁRIA (New) */}
                            {renderTaxAnalysisSection(true)}

                            {/* 1. IMPORTAÇÃO */}
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

                            {/* 2. RBT12 / HISTÓRICO MANUAL */}
                            <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                                <div className="flex justify-between items-center mb-3">
                                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                        <HistoryIcon className="w-4 h-4 text-sky-600" />
                                        RBT12 (Histórico)
                                    </h3>
                                    <button onClick={() => setIsHistoryModalOpen(true)} className="text-[10px] text-sky-600 hover:underline font-bold">
                                        Editar Manual
                                    </button>
                                </div>
                                <div className="p-3 bg-slate-100 dark:bg-slate-700/50 rounded-lg mb-3">
                                    <p className="text-[10px] text-slate-500 uppercase font-bold">Receita Bruta 12 Meses</p>
                                    <p className="text-lg font-mono font-bold text-slate-900 dark:text-white">
                                        R$ {totalRbt12Manual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </p>
                                </div>
                                <div className="max-h-32 overflow-y-auto custom-scrollbar text-[10px]">
                                    <table className="w-full text-left">
                                        <tbody>
                                            {mesesHistorico.map(m => (
                                                <tr key={m.iso} className="border-b border-slate-100 dark:border-slate-700 last:border-0">
                                                    <td className="py-1 text-slate-500 dark:text-slate-400 capitalize">{m.label}</td>
                                                    <td className="py-1 text-right font-mono text-slate-700 dark:text-slate-300">
                                                        {(historicoManualEditavel[m.iso] || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* 3. FOLHA DE SALÁRIOS */}
                            <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
                                    <UserIcon className="w-4 h-4 text-sky-600" />
                                    Folha de Salários (12m)
                                </h3>
                                <p className="text-[10px] text-slate-500 mb-2">Para cálculo do Fator R.</p>
                                <div className="space-y-3">
                                    <div className="flex gap-2">
                                        <CurrencyInput value={folha12Input} onChange={setFolha12Input} className="flex-1" />
                                        <button onClick={() => onUpdateFolha12(empresa.id, folha12Input)} className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 p-2 rounded-lg text-slate-600 dark:text-slate-300">
                                            <SaveIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                    
                                    <div className="pt-2 border-t border-slate-100 dark:border-slate-700">
                                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1 mb-1">
                                            Fator R (Manual %)
                                            <Tooltip content="Informe o percentual do Fator R manualmente se desejar sobrepor o cálculo automático (Folha/RBT12). Use ponto para decimais (ex: 28.5). Deixe em branco para automático.">
                                                <InfoIcon className="w-3 h-3 text-slate-400 cursor-help" />
                                            </Tooltip>
                                        </label>
                                        <div className="relative">
                                            <input 
                                                type="text" 
                                                value={fatorRManual} 
                                                onChange={(e) => setFatorRManual(e.target.value)}
                                                className="w-full pl-2 pr-6 py-1.5 text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none text-slate-900 font-bold dark:text-white dark:font-normal text-right"
                                                placeholder="Auto"
                                            />
                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-xs">%</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                )}

                {/* ABA 2: ANÁLISE & RESULTADOS */}
                {activeTab === 'analise' && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-800/50 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center gap-2">
                                <CalculatorIcon className="w-6 h-6 text-sky-600" /> Resumo Consolidado
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="p-4 bg-white dark:bg-slate-700/50 rounded-lg border border-slate-100 dark:border-slate-600">
                                    <p className="text-xs font-bold text-slate-500 uppercase">RBT12</p>
                                    <p className="text-2xl font-mono font-bold text-slate-800 dark:text-white">R$ {resumo.rbt12.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                </div>
                                <div className="p-4 bg-white dark:bg-slate-700/50 rounded-lg border border-slate-100 dark:border-slate-600">
                                    <p className="text-xs font-bold text-slate-500 uppercase">Alíquota Efetiva Global</p>
                                    <p className="text-2xl font-mono font-bold text-sky-600 dark:text-sky-400">{resumo.aliq_eff.toFixed(2)}%</p>
                                    <p className="text-xs text-slate-400">Nominal Ref.: {resumo.aliq_nom}%</p>
                                </div>
                                <div className="md:col-span-2 p-6 bg-sky-600 text-white rounded-xl shadow-lg relative overflow-hidden">
                                    <div className="relative z-10">
                                        <p className="text-sky-100 font-bold uppercase text-xs tracking-wider mb-1">Valor Estimado do DAS (A Pagar)</p>
                                        <p className="text-4xl font-extrabold">R$ {resumo.das_mensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                        <p className="text-sky-200 text-sm mt-2 font-medium">Competência: {mesApuracao.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {resumo.detalhamento_anexos && resumo.detalhamento_anexos.length > 0 && (
                            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden">
                                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30">
                                    <h3 className="font-bold text-slate-700 dark:text-slate-200">Detalhamento por Anexo</h3>
                                </div>
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 uppercase text-xs">
                                        <tr>
                                            <th className="px-6 py-3">Anexo</th>
                                            <th className="px-6 py-3 text-right">Base Cálculo</th>
                                            <th className="px-6 py-3 text-center">Aliq. Nominal</th>
                                            <th className="px-6 py-3 text-center">Aliq. Efetiva</th>
                                            <th className="px-6 py-3 text-right">Valor DAS</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                        {((resumo.detalhamento_anexos as DetalhamentoAnexo[]) || []).map((detalhe, idx) => (
                                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                                                <td className="px-6 py-4 font-bold text-slate-700 dark:text-slate-200">
                                                    Anexo {detalhe.anexo}
                                                    {(detalhe.issRetido || detalhe.icmsSt) && (
                                                        <div className="flex flex-col gap-0.5 mt-1">
                                                            {detalhe.issRetido && <span className="text-[10px] bg-sky-100 text-sky-700 px-1.5 rounded w-fit font-bold">ISS Retido</span>}
                                                            {detalhe.icmsSt && <span className="text-[10px] bg-sky-100 text-sky-700 px-1.5 rounded w-fit font-bold">ICMS ST</span>}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-right font-mono text-slate-600 dark:text-slate-300">{detalhe.faturamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                                <td className="px-6 py-4 text-center font-mono text-slate-500 dark:text-slate-400">{detalhe.aliquotaNominal ? detalhe.aliquotaNominal.toFixed(2) : '-'}%</td>
                                                <td className="px-6 py-4 text-center font-mono text-slate-600 dark:text-slate-300">{detalhe.aliquotaEfetiva.toFixed(2)}%</td>
                                                <td className="px-6 py-4 text-right font-mono font-bold text-sky-600 dark:text-sky-400">{detalhe.valorDas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Nova Seção: Discriminação dos Impostos na Aba Análise */}
                        {discriminacaoImpostos && Object.keys(discriminacaoImpostos).length > 0 && (
                            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden border border-slate-200 dark:border-slate-700">
                                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30">
                                    <h3 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                                        <ShieldIcon className="w-4 h-4 text-sky-600" />
                                        Discriminação dos Tributos (Estimativa do DAS)
                                    </h3>
                                </div>
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 uppercase text-xs">
                                        <tr>
                                            <th className="px-6 py-3">Tributo</th>
                                            <th className="px-6 py-3 text-right">Valor Estimado (R$)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                        {Object.entries(discriminacaoImpostos).map(([key, val]) => (
                                            <tr key={key} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                                                <td className="px-6 py-3 font-bold text-slate-700 dark:text-slate-200">{key}</td>
                                                <td className="px-6 py-3 text-right font-mono text-slate-600 dark:text-slate-300">
                                                    {(val as number).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm">
                            <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-4">Gráfico de Evolução</h3>
                            <div id="chart-container" className="h-80 w-full border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                                {resumo.historico_simulado.length > 0 ? <SimpleChart type="bar" data={chartData} /> : <div className="h-full flex flex-col items-center justify-center text-slate-400"><p>Sem dados suficientes para gráfico.</p></div>}
                            </div>
                        </div>

                        {/* IA Tax Analysis embedded in Analysis Tab (Reusable Component) */}
                        {renderTaxAnalysisSection(false)}
                    </div>
                )}

                {/* ABA 3: HISTÓRICO SALVO */}
                {activeTab === 'historico_salvo' && (
                    <div className="space-y-6 animate-fade-in">
                        {empresa.historicoCalculos && empresa.historicoCalculos.length > 0 ? (
                            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden h-fit">
                                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                    <h3 className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                                        <HistoryIcon className="w-4 h-4" /> Apurações Salvas
                                    </h3>
                                    
                                    <div className="flex gap-2">
                                        <select 
                                            value={filterYear} 
                                            onChange={(e) => setFilterYear(e.target.value)}
                                            className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-xs rounded px-2 py-1 focus:ring-2 focus:ring-sky-500 outline-none"
                                        >
                                            <option value="all">Todos os Anos</option>
                                            {(availableYears as number[]).map(year => (
                                                <option key={year} value={year}>{year}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="max-h-96 overflow-y-auto custom-scrollbar">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-500 uppercase text-xs">
                                            <tr>
                                                <th className="px-6 py-3">Competência</th>
                                                <th className="px-6 py-3 text-right">RBT12</th>
                                                <th className="px-6 py-3 text-right">DAS</th>
                                                <th className="px-6 py-3 text-center">Ação</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                            {(filteredHistory as SimplesHistoricoCalculo[]).map((hist) => (
                                                <tr key={hist.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 cursor-pointer" onClick={() => setSelectedHistoryItem(hist)}>
                                                    <td className="px-6 py-3 font-medium text-slate-700 dark:text-slate-200 capitalize">
                                                        {hist.mesReferencia}
                                                    </td>
                                                    <td className="px-6 py-3 text-right font-mono text-slate-600 dark:text-slate-300">
                                                        {hist.rbt12.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="px-6 py-3 text-right font-mono font-bold text-sky-600 dark:text-sky-400">
                                                        {hist.das_mensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="px-6 py-3 text-center">
                                                        <button className="text-slate-400 hover:text-sky-600" aria-label="Ver detalhes">
                                                            <InfoIcon className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-sm text-center text-slate-500">
                                <HistoryIcon className="w-12 h-12 mx-auto text-slate-300 mb-4" />
                                <p>Nenhum histórico de apuração salvo ainda.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Modal de Detalhes do Histórico */}
            {selectedHistoryItem && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[70] animate-fade-in" onClick={() => setSelectedHistoryItem(null)}>
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4 border-b border-slate-100 dark:border-slate-700 pb-4">
                            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Detalhes da Apuração</h3>
                            <button onClick={() => setSelectedHistoryItem(null)} className="text-slate-400 hover:text-slate-600"><CloseIcon className="w-5 h-5" /></button>
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between">
                                <span className="text-slate-500 dark:text-slate-400">Competência:</span>
                                <span className="font-bold text-slate-800 dark:text-slate-200 capitalize">{selectedHistoryItem.mesReferencia}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500 dark:text-slate-400">RBT12:</span>
                                <span className="font-mono text-slate-800 dark:text-slate-200">{selectedHistoryItem.rbt12.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500 dark:text-slate-400">Aliq. Efetiva:</span>
                                <span className="font-mono text-slate-800 dark:text-slate-200">{selectedHistoryItem.aliq_eff.toFixed(2)}%</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500 dark:text-slate-400">Fator R:</span>
                                <span className="font-mono text-slate-800 dark:text-slate-200">{(selectedHistoryItem.fator_r * 100).toFixed(2)}%</span>
                            </div>
                            <div className="mt-4 p-3 bg-sky-50 dark:bg-sky-900/30 rounded-lg flex justify-between items-center">
                                <span className="text-sky-800 dark:text-sky-300 font-bold">Valor DAS:</span>
                                <span className="text-xl font-extrabold text-sky-600 dark:text-sky-400">{selectedHistoryItem.das_mensal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Lançamento de Histórico Manual em Lote (Reformulado) */}
            {isHistoryModalOpen && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[70] animate-fade-in" onClick={() => setIsHistoryModalOpen(false)}>
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                <PencilIcon className="w-6 h-6 text-sky-600" />
                                Lançamento de Faturamento Manual (Detalhado)
                            </h3>
                            <button onClick={() => setIsHistoryModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                                <CloseIcon className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto bg-slate-50 dark:bg-slate-900/50 flex-grow">
                            {/* Novo Campo para Valor Padrão */}
                            <div className="mb-6 p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm">
                                <label className="block text-sm font-bold text-sky-600 dark:text-sky-400 mb-2">
                                    Preenchimento Rápido em Lote
                                </label>
                                <div className="flex gap-2 items-end">
                                    <div className="flex-grow">
                                        <CurrencyInput 
                                            label="Valor Padrão Mensal (Atividade Principal)" 
                                            value={valorPadraoHistorico} 
                                            onChange={setValorPadraoHistorico} 
                                            placeholder="Digite um valor para replicar..."
                                            className="w-full"
                                        />
                                    </div>
                                    <button 
                                        onClick={handleAplicarValorEmLote} 
                                        className="btn-press flex items-center gap-2 px-4 py-2.5 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-bold rounded-lg hover:bg-sky-200 dark:hover:bg-sky-800 border border-sky-200 dark:border-sky-800 h-[42px]"
                                    >
                                        <CopyIcon className="w-4 h-4" /> Aplicar a Todos
                                    </button>
                                </div>
                                <p className="text-[10px] text-slate-400 mt-2">
                                    *Isso preencherá a atividade principal de todos os 12 meses com o valor informado.
                                </p>
                            </div>

                            {/* Tabela de Entrada Matricial */}
                            <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-slate-700 uppercase bg-slate-100 dark:bg-slate-700 dark:text-slate-300">
                                        <tr>
                                            <th className="px-4 py-3 sticky left-0 bg-slate-100 dark:bg-slate-700 z-10 w-32">Competência</th>
                                            {allActivities.map((ativ) => (
                                                <th key={ativ.cnae} className="px-4 py-3 min-w-[150px]">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-sky-700 dark:text-sky-400">{ativ.label}</span>
                                                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">{ativ.cnae}</span>
                                                    </div>
                                                </th>
                                            ))}
                                            <th className="px-4 py-3 text-right bg-slate-200 dark:bg-slate-600/50 min-w-[140px]">Total (R$)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
                                        {(mesesHistorico as { date: Date; iso: string; label: string }[]).map(m => (
                                            <tr key={m.iso} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                                                <td className="px-4 py-3 font-bold text-slate-700 dark:text-slate-200 capitalize sticky left-0 bg-white dark:bg-slate-800 z-10 border-r border-slate-100 dark:border-slate-700">
                                                    {m.label}
                                                </td>
                                                {allActivities.map((ativ) => (
                                                    <td key={`${m.iso}-${ativ.cnae}`} className="px-4 py-2">
                                                        <CurrencyInput 
                                                            value={historicoDetalhadoEditavel[m.iso]?.[ativ.cnae] || 0} 
                                                            onChange={(val) => handleHistoricoDetalheChange(m.iso, ativ.cnae, val)} 
                                                            className="w-full"
                                                            placeholder="0,00"
                                                        />
                                                    </td>
                                                ))}
                                                <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-900/30">
                                                    {(historicoManualEditavel[m.iso] || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-b-xl flex justify-end gap-3">
                             <button onClick={() => setIsHistoryModalOpen(false)} className="px-4 py-2 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                                Cancelar
                            </button>
                            <button onClick={handleSaveHistorico} className="px-6 py-2 bg-sky-600 text-white font-bold rounded-lg hover:bg-sky-700 shadow-md">
                                Salvar Histórico Detalhado
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Análise Oficial do CNAE */}
            {cnaeAnalysis && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[100] animate-fade-in" onClick={() => setCnaeAnalysis(null)}>
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="bg-sky-50 dark:bg-sky-900/30 p-4 rounded-t-xl flex justify-between items-center border-b border-sky-100 dark:border-sky-800">
                            <h3 className="text-sky-800 dark:text-sky-200 font-bold text-lg flex items-center gap-2">
                                <ShieldIcon className="w-6 h-6" />
                                Análise Oficial do CNAE (IA)
                            </h3>
                            <button onClick={() => setCnaeAnalysis(null)} className="p-1 rounded-full text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700">
                                <CloseIcon className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto prose prose-slate dark:prose-invert max-w-none text-sm">
                            <FormattedText text={cnaeAnalysis} />
                        </div>
                        <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-b-xl border-t border-slate-200 dark:border-slate-700">
                            <button 
                                onClick={() => setCnaeAnalysis(null)} 
                                className="w-full py-2 bg-sky-600 text-white rounded-lg font-bold hover:bg-sky-700 transition-colors"
                            >
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SimplesNacionalDetalhe;
