
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { SimplesNacionalEmpresa, SimplesNacionalNota, SimplesNacionalImportResult, CnaeTaxDetail, SimplesHistoricoCalculo, SimplesNacionalResumo, CnaeSuggestion, SimplesItemCalculo, User, SimplesNacionalAtividade, SimplesDetalheItem } from '../types';
import * as simplesService from '../services/simplesNacionalService';
import { ANEXOS_TABELAS, REPARTICAO_IMPOSTOS, calcularDiscriminacaoImpostos } from '../services/simplesNacionalService';
import { fetchCnaeTaxDetails, fetchCnaeSuggestions, fetchCnaeDescription } from '../services/geminiService';
import { ArrowLeftIcon, CalculatorIcon, DownloadIcon, SaveIcon, UserIcon, InfoIcon, PlusIcon, TrashIcon, CloseIcon, ShieldIcon, HistoryIcon, DocumentTextIcon, AnimatedCheckIcon } from './Icons';
import LoadingSpinner from './LoadingSpinner';
import SimpleChart from './SimpleChart';
import Tooltip from './Tooltip';
import { FormattedText } from './FormattedText';
import Logo from './Logo';

interface SimplesNacionalDetalheProps {
    empresa: SimplesNacionalEmpresa;
    notas: SimplesNacionalNota[];
    onBack: () => void;
    onImport: (empresaId: string, file: File) => Promise<SimplesNacionalImportResult>;
    onUpdateFolha12: (id: string, value: number) => void;
    onSaveFaturamentoManual: (id: string, faturamento: any, faturamentoDetalhado: any) => Promise<void> | void;
    onUpdateEmpresa: (id: string, data: Partial<SimplesNacionalEmpresa>) => Promise<any> | void;
    onShowClienteView: () => void;
    onShowToast?: (msg: string) => void;
    currentUser?: User | null;
}

interface CnaeInputState {
    valor: string;
    issRetido: boolean;
    icmsSt: boolean;
    isSup: boolean; // Sociedade Uniprofissional (ISS Fixo)
    isMonofasico: boolean; // PIS/COFINS Monofásico
    isImune: boolean; // Imunidade de Livros/Papel
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
    const [isExportingExtrato, setIsExportingExtrato] = useState(false);
    
    // Novo estado complexo para suportar valor + checkboxes por CNAE
    const [faturamentoPorCnae, setFaturamentoPorCnae] = useState<Record<string, CnaeInputState>>({});
    
    // Estados para Histórico
    const [historicoManualEditavel, setHistoricoManualEditavel] = useState<Record<string, number>>({});
    
    // Agora o histórico detalhado suporta objeto complexo ou número
    const [historicoDetalhadoEditavel, setHistoricoDetalhadoEditavel] = useState<Record<string, Record<string, number | SimplesDetalheItem>>>({});
    
    const [isSavingHistory, setIsSavingHistory] = useState(false);
    
    const [valorPadraoHistorico, setValorPadraoHistorico] = useState<number>(0); 
    const [fatorRManual, setFatorRManual] = useState<string>(''); 

    // Estados para Adição de CNAE com IA
    const [isAddingCnae, setIsAddingCnae] = useState(false);
    const [newCnaeCode, setNewCnaeCode] = useState('');
    const [newCnaeAnexo, setNewCnaeAnexo] = useState<any>('I');
    const [cnaeSuggestions, setCnaeSuggestions] = useState<CnaeSuggestion[]>([]);
    const [isSearchingCnae, setIsSearchingCnae] = useState(false);
    const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    
    // Validação/Análise de Impostos
    const [isAnalyzingTax, setIsAnalyzingTax] = useState(false);
    const [taxDetails, setTaxDetails] = useState<Record<string, CnaeTaxDetail[]>>({});
    const [manualTaxRates, setManualTaxRates] = useState({ icms: '', pisCofins: '', iss: '' });
    const [showRefinement, setShowRefinement] = useState(false);
    
    // Modal de Análise CNAE
    const [cnaeAnalysis, setCnaeAnalysis] = useState<string | null>(null);
    const [isValidatingCnae, setIsValidatingCnae] = useState<string | null>(null);

    const [selectedHistoryItem, setSelectedHistoryItem] = useState<SimplesHistoricoCalculo | null>(null);
    const [isPdfGenerating, setIsPdfGenerating] = useState(false);
    const [isChartExporting, setIsChartExporting] = useState(false);

    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

    const chartContainerRef = useRef<HTMLDivElement>(null); 
    const chartFaixasContainerRef = useRef<HTMLDivElement>(null);

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

    const allActivities = useMemo<{cnae: string, anexo: string, label: string}[]>(() => {
        const list: {cnae: string, anexo: string, label: string}[] = [{ cnae: empresa.cnae, anexo: empresa.anexo, label: 'Principal' }];
        if (empresa.atividadesSecundarias) {
            empresa.atividadesSecundarias.forEach((sec, idx) => {
                list.push({ ...sec, label: `Secundário ${idx + 1}` });
            });
        }
        return list;
    }, [empresa.cnae, empresa.anexo, empresa.atividadesSecundarias]);

    const uniqueAnexos = useMemo<string[]>(() => {
        const anexos = allActivities.map(a => a.anexo);
        return Array.from(new Set(anexos));
    }, [allActivities]);

    // Recalcula o total do mês vigente com base nos inputs
    const totalMesVigente = useMemo(() => {
        let total = 0;
        Object.values(faturamentoPorCnae).forEach((item: CnaeInputState) => {
            const raw = item.valor ? item.valor.replace(/\./g, '').replace(',', '.') : '0';
            total += parseFloat(raw) || 0;
        });
        return total;
    }, [faturamentoPorCnae]);

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
            
            itensCalculo.push({ 
                cnae: cnaeCode, 
                anexo: anexoCode, 
                valor: val, 
                issRetido: state.issRetido, 
                icmsSt: state.icmsSt, 
                isSup: state.isSup,
                isMonofasico: state.isMonofasico,
                isImune: state.isImune
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

    const discriminacaoImpostos = useMemo(() => {
        return calcularDiscriminacaoImpostos(
            resumo.anexo_efetivo,
            resumo.faixa_index,
            resumo.das_mensal
        );
    }, [resumo]);

    const percentuaisImpostos = useMemo(() => {
        return REPARTICAO_IMPOSTOS[resumo.anexo_efetivo]?.[Math.min(resumo.faixa_index, 5)] || {};
    }, [resumo]);

    // --- EFFECTS ---

    // Load Data - Smart Fallback to previous month for configuration
    useEffect(() => {
        const mesChave = `${mesApuracao.getFullYear()}-${(mesApuracao.getMonth() + 1).toString().padStart(2, '0')}`;
        const totalMes = empresa.faturamentoManual?.[mesChave] || 0;
        const detalheMes = empresa.faturamentoMensalDetalhado?.[mesChave] || {};
        const hasDetalhe = Object.keys(detalheMes).length > 0;

        // Tenta encontrar uma configuração anterior se o mês atual estiver vazio
        let previousConfig: Record<string, SimplesDetalheItem | number> = {};
        if (!hasDetalhe && totalMes === 0 && empresa.faturamentoMensalDetalhado) {
            // Procura o último mês com dados
            const sortedKeys = Object.keys(empresa.faturamentoMensalDetalhado).sort().reverse();
            const lastKey = sortedKeys.find(k => k < mesChave); // Find closest past month
            if (lastKey) {
                previousConfig = empresa.faturamentoMensalDetalhado[lastKey];
            }
        }

        setFaturamentoPorCnae(prev => {
            const novoFaturamentoPorCnae: Record<string, CnaeInputState> = { ...prev };
            
            const getOrCreateState = (key: string, storedItem: number | SimplesDetalheItem | undefined, fallbackTotal: number, cnae: string): CnaeInputState => {
                
                let val = 0;
                let flags = { issRetido: false, icmsSt: false, isSup: false, isMonofasico: false, isImune: false };

                if (storedItem !== undefined) {
                    // Caso 1: Existe dado exato para este mês (prioridade máxima)
                    if (typeof storedItem === 'number') {
                        val = storedItem;
                    } else {
                        val = storedItem.valor;
                        flags = { 
                            issRetido: storedItem.issRetido, 
                            icmsSt: storedItem.icmsSt, 
                            isSup: storedItem.isSup, 
                            isMonofasico: storedItem.isMonofasico,
                            isImune: storedItem.isImune || false
                        };
                    }
                } else if (!hasDetalhe && previousConfig) {
                    // Caso 2: Não existe dado no mês, tenta copiar FLAGS do mês anterior (mantendo valor 0)
                    // Busca na config anterior por chave completa ou parcial (CNAE)
                    let prevItem = previousConfig[key]; 
                    if (!prevItem) {
                        // Tenta encontrar pela chave parcial (algumas versões salvavam só o CNAE)
                        const partialKeyEntry = Object.entries(previousConfig).find(([k, v]) => k.includes(cnae));
                        if(partialKeyEntry) prevItem = partialKeyEntry[1];
                    }

                    if (prevItem && typeof prevItem === 'object') {
                        // Copia apenas as flags, valor inicia zerado para novo mês
                        flags = { 
                            issRetido: prevItem.issRetido, 
                            icmsSt: prevItem.icmsSt, 
                            isSup: prevItem.isSup, 
                            isMonofasico: prevItem.isMonofasico,
                            isImune: prevItem.isImune || false
                        };
                    }
                    val = fallbackTotal; // Geralmente 0 se for novo mês
                } else if (!hasDetalhe) {
                    val = fallbackTotal;
                }

                const formattedVal = val > 0 ? new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) : '0,00';
                
                return {
                    valor: formattedVal,
                    ...flags
                };
            };

            // 1. Principal
            const keyPrincipal = `principal::0::${empresa.cnae}::${empresa.anexo}`;
            let storedPrincipal = detalheMes[keyPrincipal] || detalheMes[empresa.cnae];
            
            novoFaturamentoPorCnae[keyPrincipal] = getOrCreateState(keyPrincipal, storedPrincipal, totalMes, empresa.cnae);
            
            // 2. Secundários
            if (empresa.atividadesSecundarias) {
                empresa.atividadesSecundarias.forEach((ativ, index) => {
                    const keySec = `secundario::${index}::${ativ.cnae}::${ativ.anexo}`;
                    let storedSec = detalheMes[keySec] || detalheMes[ativ.cnae];
                    
                    if (ativ.cnae === empresa.cnae && storedSec === storedPrincipal) storedSec = undefined;

                    novoFaturamentoPorCnae[keySec] = getOrCreateState(keySec, storedSec, 0, ativ.cnae);
                });
            }
            
            return novoFaturamentoPorCnae;
        });
        
        setHistoricoManualEditavel(empresa.faturamentoManual || {});
        setHistoricoDetalhadoEditavel(empresa.faturamentoMensalDetalhado || {});

    }, [mesApuracao, empresa.id, empresa.faturamentoManual, empresa.faturamentoMensalDetalhado, empresa.atividadesSecundarias, empresa.cnae, empresa.anexo]);

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

    const handleOptionToggle = (key: string, field: 'issRetido' | 'icmsSt' | 'isSup' | 'isMonofasico' | 'isImune') => {
        setFaturamentoPorCnae((prev) => ({
            ...prev,
            [key]: { ...prev[key], [field]: !prev[key][field] }
        }));
    };

    const handleSaveMesVigente = async () => {
        setIsSaving(true);
        try {
            let totalCalculado = 0;
            const detalheMes: Record<string, SimplesDetalheItem> = {}; // Agora salva objeto completo
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

                // Salva SEMPRE o objeto completo com flags para persistência, mesmo que valor seja 0
                // Isso permite carregar as flags no futuro (mês seguinte)
                detalheMes[key] = {
                     valor: val,
                     issRetido: state.issRetido,
                     icmsSt: state.icmsSt,
                     isSup: state.isSup,
                     isMonofasico: state.isMonofasico,
                     isImune: state.isImune
                };

                if(val >= 0) { // Add to calc list
                     itensCalculoParaSalvar.push({
                        cnae: cnaeCode, anexo: anexoCode as any, valor: val,
                        issRetido: state.issRetido, icmsSt: state.icmsSt, isSup: state.isSup, isMonofasico: state.isMonofasico,
                        isImune: state.isImune
                     });
                }
            });

            const mesChave = `${mesApuracao.getFullYear()}-${(mesApuracao.getMonth() + 1).toString().padStart(2, '0')}`;
            const updatedManual = { ...historicoManualEditavel, [mesChave]: totalCalculado };
            
            // Atualiza o histórico detalhado preservando outros meses
            const updatedDetalhado = { ...historicoDetalhadoEditavel, [mesChave]: detalheMes };

            setHistoricoManualEditavel(updatedManual);
            setHistoricoDetalhadoEditavel(updatedDetalhado);

            const empresaTemp = { ...empresa, faturamentoManual: updatedManual, faturamentoMensalDetalhado: updatedDetalhado };
            let fatorRValue: number | undefined = undefined;
            if (fatorRManual.trim() !== '') {
                const parsed = parseFloat(fatorRManual.replace(',', '.'));
                if (!isNaN(parsed)) fatorRValue = parsed / 100;
            }

            const resumoAtualizado = simplesService.calcularResumoEmpresa(empresaTemp, notas, mesApuracao, { itensCalculo: itensCalculoParaSalvar, fatorRManual: fatorRValue });

            const novoItemHistorico: SimplesHistoricoCalculo = {
                id: Date.now().toString(), dataCalculo: Date.now(), mesReferencia: mesApuracao.toLocaleString('pt-BR', { month: 'long', year: 'numeric' }),
                rbt12: resumoAtualizado.rbt12, aliq_eff: resumoAtualizado.aliq_eff, fator_r: resumoAtualizado.fator_r,
                das_mensal: resumoAtualizado.das_mensal, anexo_efetivo: resumoAtualizado.anexo_efetivo
            };
            
            const novoHistoricoCalculos = [...(empresa.historicoCalculos || []), novoItemHistorico];
            await onUpdateEmpresa(empresa.id, { faturamentoManual: updatedManual, faturamentoMensalDetalhado: updatedDetalhado, historicoCalculos: novoHistoricoCalculos });

            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 2500);
            if (onShowToast) onShowToast('Apuração salva!');
        } catch (error) {
            console.error("Erro ao salvar:", error);
            if (onShowToast) onShowToast('Erro ao salvar.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveHistory = async () => {
        setIsSavingHistory(true);
        try {
            await onSaveFaturamentoManual(empresa.id, historicoManualEditavel, historicoDetalhadoEditavel);
            setIsHistoryModalOpen(false);
            if (onShowToast) onShowToast("Histórico atualizado!");
        } catch (error) {
            console.error("Erro ao salvar histórico:", error);
            if (onShowToast) onShowToast("Erro ao salvar histórico.");
        } finally {
            setIsSavingHistory(false);
        }
    }

    const handleExportExtrato = async () => {
        setIsExportingExtrato(true);
        try {
            const { default: jsPDF } = await import('jspdf');
            const { default: html2canvas } = await import('html2canvas');

            // Renderiza o elemento oculto
            const element = document.getElementById('extrato-simples-completo');
            if (!element) throw new Error('Elemento de extrato não encontrado');

            // Temporariamente torna visível para o canvas se necessário, 
            // mas a técnica de absolute fora da tela geralmente funciona.
            // Para garantir estilos, forçamos um reflow se precisar.

            const canvas = await html2canvas(element, {
                scale: 2,
                backgroundColor: '#ffffff', // Força fundo branco
                logging: false,
                windowWidth: 1200 // Largura fixa para layout consistente
            });

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const imgProps = pdf.getImageProperties(imgData);
            const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;

            let heightLeft = imgHeight;
            let position = 0;

            pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
            heightLeft -= pdfHeight;

            while (heightLeft > 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
                heightLeft -= pdfHeight;
            }

            const fileName = `extrato-simples-${empresa.nome.replace(/\s+/g, '-')}-${mesApuracao.toISOString().slice(0, 7)}.pdf`;
            pdf.save(fileName);

        } catch (e) {
            console.error("Erro ao exportar PDF:", e);
            if (onShowToast) onShowToast('Erro ao gerar PDF.');
        } finally {
            setIsExportingExtrato(false);
        }
    };

    const handleSearchCnae = (query: string) => {
        setNewCnaeCode(query);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        if (query.length < 3) { setCnaeSuggestions([]); return; }
        setIsSearchingCnae(true);
        searchTimeout.current = setTimeout(async () => {
            try { setCnaeSuggestions(await fetchCnaeSuggestions(query)); } catch (e) { console.error(e); } finally { setIsSearchingCnae(false); }
        }, 600);
    };
    const handleSelectSuggestion = (suggestion: CnaeSuggestion) => {
        setNewCnaeCode(suggestion.code); setCnaeSuggestions([]);
        if (suggestion.code.startsWith('47')) setNewCnaeAnexo('I');
        else if (suggestion.code.startsWith('10')) setNewCnaeAnexo('II');
        else setNewCnaeAnexo('III');
    };
    const handleAddNewCnae = () => {
        if (!newCnaeCode) return;
        const newAtividades = [...(empresa.atividadesSecundarias || []), { cnae: newCnaeCode, anexo: newCnaeAnexo }];
        onUpdateEmpresa(empresa.id, { atividadesSecundarias: newAtividades });
        setIsAddingCnae(false); setNewCnaeCode(''); setNewCnaeAnexo('I');
    };
    const handleRemoveSecondary = (index: number) => {
        if (!empresa.atividadesSecundarias) return;
        const newAtividades = empresa.atividadesSecundarias.filter((_, i) => i !== index);
        onUpdateEmpresa(empresa.id, { atividadesSecundarias: newAtividades });
    };
    const handleValidateCnae = async (cnaeToValidate: string) => {
        if (!cnaeToValidate.trim()) return;
        setIsValidatingCnae(cnaeToValidate);
        try {
            const result = await fetchCnaeDescription(cnaeToValidate);
            setCnaeAnalysis(result.text || '');
        } catch (e) { if(onShowToast) onShowToast("Erro ao validar CNAE."); } finally { setIsValidatingCnae(null); }
    };
    const handleAnalyzeTax = async () => {
        setIsAnalyzingTax(true); setTaxDetails({});
        try {
            const cnaesToAnalyze = [empresa.cnae, ...(empresa.atividadesSecundarias?.map(a => a.cnae) || [])];
            const uniqueCnaes = Array.from(new Set(cnaesToAnalyze));
            const results: Record<string, CnaeTaxDetail[]> = {};
            for (const cnae of uniqueCnaes) {
                if (cnae) results[cnae] = await fetchCnaeTaxDetails(cnae, manualTaxRates);
            }
            setTaxDetails(results);
        } catch (e) { console.error(e); if(onShowToast) onShowToast("Erro ao analisar impostos."); } finally { setIsAnalyzingTax(false); }
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
    
    // ... (Render Helpers)
    const renderCardCnae = (cnaeCode: string, anexoCode: string, label: string, isSecondary = false, index?: number) => {
        const key = isSecondary 
            ? `secundario::${index}::${cnaeCode}::${anexoCode}`
            : `principal::0::${cnaeCode}::${anexoCode}`;
            
        const state = faturamentoPorCnae[key] || { valor: '0,00', issRetido: false, icmsSt: false, isSup: false, isMonofasico: false, isImune: false };
        const showIcmsSt = ['I', 'II'].includes(anexoCode);
        const showIss = ['III', 'IV', 'V', 'III_V'].includes(anexoCode);
        const showMonofasico = ['I', 'II'].includes(anexoCode);

        return (
            <div key={key} className="bg-white dark:bg-slate-700/30 border border-slate-200 dark:border-slate-600 rounded-lg p-4 shadow-sm hover:border-sky-300 transition-colors">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${isSecondary ? 'bg-slate-100 dark:bg-slate-600' : 'bg-sky-100 dark:bg-sky-900/30'}`}>
                            <DocumentTextIcon className={`w-5 h-5 ${isSecondary ? 'text-slate-500 dark:text-slate-300' : 'text-sky-600 dark:text-sky-400'}`} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <p className="font-mono font-bold text-lg text-slate-800 dark:text-slate-100">{cnaeCode}</p>
                                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${isSecondary ? 'bg-slate-100 text-slate-500' : 'bg-sky-100 text-sky-700'}`}>
                                    {label}
                                </span>
                            </div>
                            <div className="flex gap-2 mt-1">
                                <span className="text-xs font-bold bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded border border-amber-100 dark:border-amber-800">
                                    Anexo {anexoCode}
                                </span>
                                <button onClick={() => handleValidateCnae(cnaeCode)} className="text-[10px] text-sky-600 hover:underline flex items-center gap-1">
                                    <ShieldIcon className="w-3 h-3" /> Validar
                                </button>
                            </div>
                        </div>
                    </div>
                    
                    <div className="w-full md:w-48">
                        <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1">Faturamento (R$)</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">R$</span>
                            <input 
                                type="text" 
                                value={state.valor} 
                                onChange={(e) => handleFaturamentoChange(key, e.target.value)}
                                className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-500 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none text-right font-mono font-bold text-lg text-slate-900 dark:text-white"
                                placeholder="0,00"
                            />
                            {state.valor && state.valor !== '0,00' && (
                                <button 
                                    onClick={() => handleFaturamentoChange(key, '0')}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 p-1"
                                    title="Limpar valor"
                                >
                                    <TrashIcon className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Opções de Impostos Retidos - Layout em Grid/Pills */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-600">
                    <p className="text-[10px] uppercase font-bold text-slate-400 mb-2">Opções de Retenção / Dedução</p>
                    <div className="flex flex-wrap gap-2">
                        {/* IMUNIDADE DE LIVROS (NOVO) */}
                        <label className={`flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg border transition-all select-none ${state.isImune ? 'bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-900/30 dark:border-purple-700 dark:text-purple-300' : 'bg-slate-50 border-transparent text-slate-500 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-400'}`}>
                            <input type="checkbox" checked={state.isImune} onChange={() => handleOptionToggle(key, 'isImune')} className="hidden" />
                            <div className={`w-4 h-4 rounded border flex items-center justify-center ${state.isImune ? 'bg-purple-500 border-purple-500' : 'bg-white border-slate-300'}`}>
                                {state.isImune && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                            </div>
                            <span className="text-xs font-bold" title="Imunidade Constitucional (Livros, Jornais, Papel)">Imunidade (Livros)</span>
                        </label>

                        {showMonofasico && (
                            <label className={`flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg border transition-all select-none ${state.isMonofasico ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-700 dark:text-indigo-300' : 'bg-slate-50 border-transparent text-slate-500 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-400'}`}>
                                <input type="checkbox" checked={state.isMonofasico} onChange={() => handleOptionToggle(key, 'isMonofasico')} className="hidden" />
                                <div className={`w-4 h-4 rounded border flex items-center justify-center ${state.isMonofasico ? 'bg-indigo-500 border-indigo-500' : 'bg-white border-slate-300'}`}>
                                    {state.isMonofasico && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                </div>
                                <span className="text-xs font-bold">Monofásico (PIS/COFINS)</span>
                            </label>
                        )}
                        {showIcmsSt && (
                            <label className={`flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg border transition-all select-none ${state.icmsSt ? 'bg-sky-50 border-sky-200 text-sky-700 dark:bg-sky-900/30 dark:border-sky-700 dark:text-sky-300' : 'bg-slate-50 border-transparent text-slate-500 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-400'}`}>
                                <input type="checkbox" checked={state.icmsSt} onChange={() => handleOptionToggle(key, 'icmsSt')} className="hidden" />
                                <div className={`w-4 h-4 rounded border flex items-center justify-center ${state.icmsSt ? 'bg-sky-500 border-sky-500' : 'bg-white border-slate-300'}`}>
                                    {state.icmsSt && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                </div>
                                <span className="text-xs font-bold">ICMS ST (Subst. Trib.)</span>
                            </label>
                        )}
                        {showIss && (
                            <>
                                <label className={`flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg border transition-all select-none ${state.issRetido ? 'bg-teal-50 border-teal-200 text-teal-700 dark:bg-teal-900/30 dark:border-teal-700 dark:text-teal-300' : 'bg-slate-50 border-transparent text-slate-500 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-400'}`}>
                                    <input type="checkbox" checked={state.issRetido} onChange={() => handleOptionToggle(key, 'issRetido')} className="hidden" />
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${state.issRetido ? 'bg-teal-500 border-teal-500' : 'bg-white border-slate-300'}`}>
                                        {state.issRetido && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                    </div>
                                    <span className="text-xs font-bold">ISS Retido</span>
                                </label>
                                <label className={`flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg border transition-all select-none ${state.isSup ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-300' : 'bg-slate-50 border-transparent text-slate-500 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-400'}`}>
                                    <input type="checkbox" checked={state.isSup} onChange={() => handleOptionToggle(key, 'isSup')} className="hidden" />
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center ${state.isSup ? 'bg-amber-500 border-amber-500' : 'bg-white border-slate-300'}`}>
                                        {state.isSup && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                    </div>
                                    <span className="text-xs font-bold" title="Sociedade Uniprofissional - ISS Fixo">SUP (ISS Fixo)</span>
                                </label>
                            </>
                        )}
                    </div>
                </div>
                
                {isSecondary && (
                    <button onClick={() => handleRemoveSecondary(index!)} className="absolute top-4 right-4 text-slate-400 hover:text-red-500 p-1" title="Remover Atividade">
                        <TrashIcon className="w-4 h-4" />
                    </button>
                )}
            </div>
        );
    };

    // --- RENDER ---
    const renderTaxAnalysisSection = () => {
        return (
            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 mt-6">
                <div className="mb-4">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <ShieldIcon className="w-5 h-5 text-sky-600" /> Análise Tributária por CNAE (IA)
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Alíquotas médias e bases legais (ICMS, ISS, PIS/COFINS) obtidas via IA.
                    </p>
                </div>
                <div className="mb-6">
                    <button onClick={() => setShowRefinement(!showRefinement)} className="text-xs font-bold text-sky-600 hover:text-sky-700 dark:text-sky-400 flex items-center gap-1 mb-2 transition-colors">
                        {showRefinement ? '▼ Ocultar Refinamento' : '▶ Refinar com Alíquotas Manuais (Opcional)'}
                    </button>
                    {showRefinement && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-slate-50 dark:bg-slate-900/30 rounded-lg border border-slate-200 dark:border-slate-700 animate-fade-in mb-4">
                            <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">ICMS (%)</label><input type="number" placeholder="Ex: 18" value={manualTaxRates.icms} onChange={(e) => setManualTaxRates(prev => ({ ...prev, icms: e.target.value }))} className="w-full p-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none" /></div>
                            <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">PIS/COFINS (%)</label><input type="number" placeholder="Ex: 9.25" value={manualTaxRates.pisCofins} onChange={(e) => setManualTaxRates(prev => ({ ...prev, pisCofins: e.target.value }))} className="w-full p-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none" /></div>
                            <div><label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">ISS (%)</label><input type="number" placeholder="Ex: 5" value={manualTaxRates.iss} onChange={(e) => setManualTaxRates(prev => ({ ...prev, iss: e.target.value }))} className="w-full p-2 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none" /></div>
                        </div>
                    )}
                    {!isAnalyzingTax && (
                        <button onClick={handleAnalyzeTax} className="w-full sm:w-auto btn-press bg-sky-600 text-white px-6 py-2 rounded-lg font-bold text-sm hover:bg-sky-700 transition-colors flex items-center justify-center gap-2">
                            <ShieldIcon className="w-4 h-4" /> {Object.keys(taxDetails).length > 0 ? 'Recalcular Análise' : 'Gerar Análise Tributária'}
                        </button>
                    )}
                </div>
                {isAnalyzingTax && <div className="py-8 flex justify-center"><LoadingSpinner /></div>}
                {!isAnalyzingTax && Object.keys(taxDetails).length > 0 && (
                    <div className="space-y-6 animate-fade-in">
                        {Object.entries(taxDetails).map(([cnae, details]: [string, CnaeTaxDetail[]]) => (
                            <div key={cnae} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden shadow-sm">
                                <div className="bg-slate-50 dark:bg-slate-700/50 px-4 py-2 border-b border-slate-200 dark:border-slate-700"><p className="font-bold text-sm text-sky-800 dark:text-sky-300">CNAE: {cnae}</p></div>
                                <div className="overflow-x-auto"><table className="w-full text-xs text-left"><thead className="bg-white dark:bg-slate-800 text-slate-500 font-bold uppercase"><tr><th className="px-4 py-2">Tributo</th><th className="px-4 py-2">Incidência</th><th className="px-4 py-2 text-center">Alíquota</th><th className="px-4 py-2">Obs</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-700">{details.map((d, i) => (<tr key={i}><td className="px-4 py-2 font-bold">{d.tributo}</td><td className="px-4 py-2">{d.incidencia}</td><td className="px-4 py-2 text-center">{d.aliquotaMedia}</td><td className="px-4 py-2 italic">{d.baseLegal}</td></tr>))}</tbody></table></div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
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
                    <button
                        onClick={handleExportExtrato}
                        disabled={isExportingExtrato}
                        className="flex-1 md:flex-none btn-press flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 disabled:opacity-50"
                        title="Exportar Extrato PDF"
                    >
                        {isExportingExtrato ? <LoadingSpinner small /> : <DownloadIcon className="w-5 h-5" />}
                        <span className="hidden sm:inline">Exportar Extrato</span>
                    </button>
                    <button onClick={onShowClienteView} className="flex-1 md:flex-none btn-press flex items-center justify-center gap-2 px-4 py-2 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-bold rounded-lg hover:bg-sky-200 dark:hover:bg-sky-800 text-xs md:text-sm">
                        <UserIcon className="w-5 h-5" /> Visão Cliente
                    </button>
                </div>
            </div>

            <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border-l-4 border-sky-500 dark:border-sky-400">
                            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-6">
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

                            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase mb-3 flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 pb-2">
                                <CalculatorIcon className="w-4 h-4 text-sky-600" /> Discriminativo de Receitas por CNAE
                            </h4>

                            <div className="space-y-4">
                                {/* Lista Unificada de CNAEs */}
                                {renderCardCnae(empresa.cnae, empresa.anexo, 'Principal')}
                                {(empresa.atividadesSecundarias || []).map((ativ, i) => renderCardCnae(ativ.cnae, ativ.anexo, 'Secundária', true, i))}
                            </div>

                            {!isAddingCnae ? (
                                <button onClick={() => setIsAddingCnae(true)} className="w-full mt-4 py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-slate-500 hover:text-sky-600 font-bold flex justify-center items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
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
                                        <div className="absolute z-10 bg-white border rounded shadow-lg max-h-40 overflow-y-auto w-full left-0">
                                            {(cnaeSuggestions as CnaeSuggestion[]).map(s => (
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
                            
                            <div className="mt-6 flex gap-3">
                                <button 
                                    onClick={handleSaveMesVigente} 
                                    disabled={isSaving} 
                                    className={`flex-1 py-4 font-bold text-lg rounded-xl transition-all flex justify-center items-center gap-2 shadow-lg ${
                                        saveSuccess 
                                        ? 'bg-green-500 hover:bg-green-600 text-white' 
                                        : 'bg-sky-600 hover:bg-sky-700 text-white'
                                    }`}
                                >
                                    {isSaving ? (
                                        <LoadingSpinner small />
                                    ) : saveSuccess ? (
                                        <><AnimatedCheckIcon className="text-white" size="w-6 h-6" /><span>Apuração Salva!</span></>
                                    ) : (
                                        <><SaveIcon className="w-5 h-5" /><span>Calcular e Salvar</span></>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Coluna Direita (Ferramentas) */}
                    <div className="space-y-6">
                        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
                                <HistoryIcon className="w-4 h-4 text-sky-600" /> RBT12 (Histórico 12m)
                            </h3>
                            <button onClick={() => setIsHistoryModalOpen(true)} className="text-[10px] text-sky-600 hover:underline font-bold w-full text-right mb-2">Editar Manual</button>
                            <div className="p-3 bg-slate-100 dark:bg-slate-700/50 rounded-lg mb-3">
                                <p className="text-[10px] text-slate-500 uppercase font-bold">Receita Bruta Acumulada</p>
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

                        <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
                                <DownloadIcon className="w-4 h-4 text-sky-600" /> Importar Notas (XML/PDF)
                            </h3>
                            <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-6 text-center relative hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer group">
                                <input type="file" accept=".pdf, .xml, .xlsx, .xls" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={isImporting} />
                                {isImporting ? <LoadingSpinner /> : (
                                    <div className="flex flex-col items-center">
                                        <DocumentTextIcon className="w-6 h-6 text-slate-400 group-hover:text-sky-500 mb-1 transition-colors" />
                                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Arraste ou Clique</span>
                                    </div>
                                )}
                            </div>
                            {importResult && (
                                <div className={`mt-3 p-2 text-xs rounded ${importResult.successCount > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    <b>{importResult.successCount}</b> notas importadas.
                                    {importResult.errors.length > 0 && <span className="block mt-1 text-[10px]">{importResult.errors[0]}</span>}
                                </div>
                            )}
                        </div>

                         {/* Seção de Análise Tributária IA */}
                         {renderTaxAnalysisSection()}
                    </div>
                </div>

                {/* Seção Histórico de Cálculos Salvos (Tabela) */}
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <div className="p-6 border-b border-slate-200 dark:border-slate-700">
                         <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            <HistoryIcon className="w-5 h-5 text-sky-600" /> Histórico de Apurações Salvas
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
                            <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-300">
                                <tr>
                                    <th className="px-6 py-3">Competência</th>
                                    <th className="px-6 py-3 text-right">RBT12</th>
                                    <th className="px-6 py-3 text-center">Aliq. Efetiva</th>
                                    <th className="px-6 py-3 text-right">Valor DAS</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(empresa.historicoCalculos || []).slice().reverse().map((hist, idx) => (
                                    <tr key={idx} className="bg-white dark:bg-slate-800 border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                        <td className="px-6 py-4 font-bold text-slate-900 dark:text-white capitalize">
                                            {hist.mesReferencia}
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono">
                                            {hist.rbt12.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-6 py-4 text-center font-mono">
                                            {hist.aliq_eff.toFixed(2)}%
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono font-bold text-sky-700 dark:text-sky-400">
                                            {hist.das_mensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                ))}
                                {(!empresa.historicoCalculos || empresa.historicoCalculos.length === 0) && (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                                            Nenhuma apuração salva ainda.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

             {/* Modal Histórico Manual */}
             {isHistoryModalOpen && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-fade-in" onClick={() => setIsHistoryModalOpen(false)}>
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800 dark:text-slate-100">Editar Histórico RBT12</h3>
                            <button onClick={() => setIsHistoryModalOpen(false)}><CloseIcon className="w-5 h-5 text-slate-400" /></button>
                        </div>
                        <div className="p-4 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 flex gap-2 items-center">
                            <input 
                                type="number" 
                                placeholder="Valor Padrão (R$)" 
                                onChange={(e) => setValorPadraoHistorico(parseFloat(e.target.value) || 0)}
                                className="flex-grow p-2 text-sm border rounded dark:bg-slate-700 dark:border-slate-600"
                            />
                            <button 
                                onClick={() => {
                                    const novoHistorico = { ...historicoManualEditavel };
                                    mesesHistorico.forEach(m => novoHistorico[m.iso] = valorPadraoHistorico);
                                    setHistoricoManualEditavel(novoHistorico);
                                }}
                                className="bg-sky-600 text-white px-3 py-2 rounded text-xs font-bold"
                            >
                                Preencher Todos
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto space-y-3">
                            {mesesHistorico.map(m => (
                                <div key={m.iso} className="flex justify-between items-center">
                                    <span className="text-sm font-semibold text-slate-600 dark:text-slate-400 capitalize">{m.label}</span>
                                    <CurrencyInput 
                                        value={historicoManualEditavel[m.iso] || 0} 
                                        onChange={(val) => setHistoricoManualEditavel(prev => ({ ...prev, [m.iso]: val }))} 
                                        className="w-32" 
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 rounded-b-xl flex justify-end gap-2">
                             <button onClick={() => setIsHistoryModalOpen(false)} disabled={isSavingHistory} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg disabled:opacity-50">Cancelar</button>
                             <button onClick={handleSaveHistory} disabled={isSavingHistory} className="px-4 py-2 text-sm font-bold bg-sky-600 text-white rounded-lg hover:bg-sky-700 flex items-center gap-2 disabled:opacity-50">
                                {isSavingHistory ? <LoadingSpinner small /> : <SaveIcon className="w-4 h-4" />}
                                <span>{isSavingHistory ? 'Salvando...' : 'Salvar Alterações'}</span>
                             </button>
                        </div>
                    </div>
                </div>
             )}

             {/* ELEMENTO OCULTO PARA EXPORTAÇÃO PDF */}
             <div id="extrato-simples-completo" className="fixed left-[-9999px] top-0 w-[900px] bg-white text-slate-900 p-8 font-sans">
                {/* Header Institucional */}
                <div className="flex justify-between items-start border-b-2 border-sky-700 pb-4 mb-6">
                    <div className="flex items-center gap-3">
                        <Logo className="h-16 w-auto text-sky-800" />
                        <div>
                            <h1 className="text-2xl font-bold text-sky-800">Extrato Simples Nacional</h1>
                            <p className="text-sm text-slate-500 font-semibold">SP ASSESSORIA CONTÁBIL</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="mb-2">
                            <p className="text-xs font-bold text-slate-500 uppercase">Emitido Por</p>
                            <p className="text-sm font-bold text-slate-800">{currentUser?.name}</p>
                            <p className="text-xs text-slate-600">{currentUser?.email}</p>
                        </div>
                        <div>
                            <p className="text-xs font-bold text-slate-500 uppercase">Data de Emissão</p>
                            <p className="text-sm font-bold text-slate-800">{new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR')}</p>
                        </div>
                    </div>
                </div>

                {/* Dados da Empresa */}
                <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-xs uppercase font-bold text-slate-500">Razão Social</p>
                            <p className="text-lg font-bold">{empresa.nome}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs uppercase font-bold text-slate-500">CNPJ</p>
                            <p className="text-lg font-mono font-bold">{empresa.cnpj}</p>
                        </div>
                        <div>
                            <p className="text-xs uppercase font-bold text-slate-500">Competência</p>
                            <p className="text-md font-bold capitalize">{mesApuracao.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs uppercase font-bold text-slate-500">CNAE Principal</p>
                            <p className="text-md font-bold">{empresa.cnae}</p>
                        </div>
                    </div>
                </div>

                {/* Resumo do Cálculo */}
                <div className="mb-8">
                    <h3 className="text-lg font-bold text-sky-800 border-l-4 border-sky-600 pl-3 mb-4">Resumo da Apuração</h3>
                    <div className="grid grid-cols-4 gap-4 text-center">
                        <div className="p-3 bg-slate-100 rounded">
                            <p className="text-xs font-bold text-slate-500 uppercase">Receita Bruta (RBT12)</p>
                            <p className="text-lg font-bold">R$ {resumo.rbt12.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div className="p-3 bg-slate-100 rounded">
                            <p className="text-xs font-bold text-slate-500 uppercase">Alíquota Efetiva</p>
                            <p className="text-lg font-bold text-sky-700">{resumo.aliq_eff.toFixed(4)}%</p>
                        </div>
                        <div className="p-3 bg-slate-100 rounded">
                            <p className="text-xs font-bold text-slate-500 uppercase">Fator R</p>
                            <p className="text-lg font-bold">{(resumo.fator_r * 100).toFixed(2)}%</p>
                        </div>
                        <div className="p-3 bg-sky-100 rounded border border-sky-200">
                            <p className="text-xs font-bold text-sky-800 uppercase">Valor a Recolher (DAS)</p>
                            <p className="text-xl font-bold text-sky-900">R$ {resumo.das_mensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                    </div>
                </div>

                {/* Tabela Dinâmica do Anexo */}
                {ANEXOS_TABELAS[resumo.anexo_efetivo] && (
                    <div className="mb-8">
                        <h3 className="text-lg font-bold text-sky-800 border-l-4 border-sky-600 pl-3 mb-4">
                            Tabela de Enquadramento - Anexo {resumo.anexo_efetivo}
                        </h3>
                        <div className="border rounded-lg overflow-hidden">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-200 text-slate-700 uppercase font-bold text-xs">
                                    <tr>
                                        <th className="px-4 py-2">Faixa</th>
                                        <th className="px-4 py-2">Receita Bruta em 12 Meses (R$)</th>
                                        <th className="px-4 py-2 text-center">Alíquota Nominal</th>
                                        <th className="px-4 py-2 text-right">Valor a Deduzir (R$)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {ANEXOS_TABELAS[resumo.anexo_efetivo].map((faixa: any, index: number) => {
                                        const isFaixaAtual = index === resumo.faixa_index;
                                        const faixaAnterior = index === 0 ? 0 : ANEXOS_TABELAS[resumo.anexo_efetivo][index - 1].limite;
                                        
                                        return (
                                            <tr key={index} className={`border-b border-slate-100 ${isFaixaAtual ? 'bg-yellow-50 border-yellow-200' : ''}`}>
                                                <td className={`px-4 py-2 ${isFaixaAtual ? 'font-bold text-sky-800' : ''}`}>
                                                    {index + 1}ª Faixa
                                                    {isFaixaAtual && <span className="ml-2 text-[10px] bg-sky-600 text-white px-2 py-0.5 rounded-full uppercase">Sua Faixa</span>}
                                                </td>
                                                <td className={`px-4 py-2 ${isFaixaAtual ? 'font-bold' : ''}`}>
                                                    {index === 0 
                                                        ? `Até ${faixa.limite.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                                                        : `De ${(faixaAnterior + 0.01).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} até ${faixa.limite.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                                                </td>
                                                <td className="px-4 py-2 text-center">{faixa.aliquota}%</td>
                                                <td className="px-4 py-2 text-right">R$ {faixa.parcela.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SimplesNacionalDetalhe;
