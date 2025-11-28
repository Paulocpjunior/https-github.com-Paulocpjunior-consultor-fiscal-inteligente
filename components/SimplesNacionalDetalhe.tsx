
import React, { useState, useMemo, useEffect } from 'react';
import { SimplesNacionalEmpresa, SimplesNacionalNota, SimplesNacionalImportResult, CnaeTaxDetail, SimplesHistoricoCalculo, DetalhamentoAnexo, SimplesNacionalResumo, SimplesNacionalAtividade, SimplesCalculoMensal } from '../types';
import * as simplesService from '../services/simplesNacionalService';
import { fetchCnaeTaxDetails } from '../services/geminiService';
import { ArrowLeftIcon, CalculatorIcon, DownloadIcon, SaveIcon, UserIcon, InfoIcon, AnimatedCheckIcon, PlusIcon, TrashIcon, CloseIcon, ShieldIcon, HistoryIcon, DocumentTextIcon, CopyIcon, PencilIcon } from './Icons';
import LoadingSpinner from './LoadingSpinner';
import SimpleChart from './SimpleChart';
import Tooltip from './Tooltip';

interface SimplesNacionalDetalheProps {
    empresa: SimplesNacionalEmpresa;
    notas: SimplesNacionalNota[];
    onBack: () => void;
    onImport: (empresaId: string, file: File) => Promise<SimplesNacionalImportResult>;
    onUpdateFolha12: (id: string, value: number) => void;
    onSaveFaturamentoManual: (id: string, faturamento: any) => void;
    onUpdateEmpresa: (id: string, data: Partial<SimplesNacionalEmpresa>) => void;
    onShowClienteView: () => void;
    onShowToast?: (msg: string) => void;
}

interface CnaeInputState {
    valor: string;
    issRetido: boolean;
    icmsSt: boolean;
    issRate?: string;
    icmsStRate?: string;
}

type TabType = 'cadastrais' | 'faturamento' | 'simulacoes' | 'historico';

const CurrencyInput: React.FC<{ 
    value: number; 
    onChange: (val: number) => void; 
    label?: string; 
    className?: string;
    error?: string;
    tooltip?: string;
}> = ({ value, onChange, label, className, error, tooltip }) => {
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
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">R$</span>
                <input 
                    type="text" 
                    value={formatted} 
                    onChange={handleChange} 
                    className={`w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-700 border rounded-lg focus:ring-2 focus:ring-sky-500 outline-none text-slate-900 font-bold dark:text-white dark:font-normal text-right ${error ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 dark:border-slate-600'}`}
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
    const [activeTab, setActiveTab] = useState<TabType>('faturamento');
    const [mesApuracao, setMesApuracao] = useState(new Date());
    const [folha12Input, setFolha12Input] = useState(empresa.folha12);
    const [isImporting, setIsImporting] = useState(false);
    const [importResult, setImportResult] = useState<SimplesNacionalImportResult | null>(null);
    
    const [faturamentoPorCnae, setFaturamentoPorCnae] = useState<Record<string, CnaeInputState>>({});
    const [historicoManualEditavel, setHistoricoManualEditavel] = useState<Record<string, number>>({});

    const [isAddingCnae, setIsAddingCnae] = useState(false);
    const [newCnaeCode, setNewCnaeCode] = useState('');
    const [newCnaeAnexo, setNewCnaeAnexo] = useState<any>('I');

    const [isAnalyzingTax, setIsAnalyzingTax] = useState(false);
    const [taxDetails, setTaxDetails] = useState<Record<string, CnaeTaxDetail[]>>({});
    const [manualTaxRates, setManualTaxRates] = useState({ icms: '', pisCofins: '', iss: '' });

    const [selectedHistoryItem, setSelectedHistoryItem] = useState<SimplesHistoricoCalculo | null>(null);
    const [isPdfGenerating, setIsPdfGenerating] = useState(false);

    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

    const [filterYear, setFilterYear] = useState<string>('all');
    const [filterMonth, setFilterMonth] = useState<string>('all');

    // --- CÁLCULOS (MOVED UP) ---

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

    const resumo: SimplesNacionalResumo = useMemo(() => {
        const itensCalculo: any[] = [];
        
        Object.entries(faturamentoPorCnae).forEach(([key, state]) => {
            const typedState = state as CnaeInputState;
            const [cnaeCode, anexoCode] = key.split('_');
            const val = parseFloat(typedState.valor.replace(/\./g, '').replace(',', '.') || '0');
            
            if (val > 0) {
                itensCalculo.push({ 
                    cnae: cnaeCode, 
                    anexo: anexoCode, 
                    valor: val, 
                    issRetido: typedState.issRetido, 
                    icmsSt: typedState.icmsSt 
                });
            }
        });

        const empresaTemp = { ...empresa, faturamentoManual: historicoManualEditavel };

        return simplesService.calcularResumoEmpresa(
            empresaTemp, 
            notas, 
            mesApuracao, 
            { itensCalculo: itensCalculo.length > 0 ? itensCalculo : undefined }
        );
    }, [empresa, notas, mesApuracao, faturamentoPorCnae, historicoManualEditavel]);

    const totalMesVigente = useMemo(() => {
        let total = 0;
        Object.values(faturamentoPorCnae).forEach((item) => {
            const typedItem = item as CnaeInputState;
            total += parseFloat(typedItem.valor.replace(/\./g, '').replace(',', '.') || '0');
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
        
        const novoFaturamentoPorCnae: Record<string, CnaeInputState> = {};
        
        const createInitialState = (val: number = 0): CnaeInputState => ({
            valor: val > 0 ? new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val) : '0,00',
            issRetido: false,
            icmsSt: false,
            issRate: '',
            icmsStRate: ''
        });

        const keyPrincipal = `${empresa.cnae}_${empresa.anexo}`;
        novoFaturamentoPorCnae[keyPrincipal] = createInitialState(totalMes);
        
        if (Array.isArray(empresa.atividadesSecundarias)) {
            empresa.atividadesSecundarias.forEach(ativ => {
                const key = `${ativ.cnae}_${ativ.anexo}`;
                if (!novoFaturamentoPorCnae[key]) {
                    novoFaturamentoPorCnae[key] = createInitialState(0);
                }
            });
        }
        
        setFaturamentoPorCnae(novoFaturamentoPorCnae);
        setHistoricoManualEditavel(empresa.faturamentoManual || {});

    // Stringify objects in dependency array to avoid loops if reference changes
    }, [mesApuracao, empresa.id, JSON.stringify(empresa.faturamentoManual), JSON.stringify(empresa.atividadesSecundarias)]); 

    // --- HANDLERS ---

    const handleFaturamentoChange = (key: string, field: keyof CnaeInputState, value: any) => {
        setFaturamentoPorCnae(prev => ({
            ...prev,
            [key]: { ...prev[key], [field]: value }
        }));
    };

    const handleOptionToggle = (key: string, field: 'issRetido' | 'icmsSt') => {
        setFaturamentoPorCnae(prev => ({
            ...prev,
            [key]: { ...prev[key], [field]: !prev[key][field] }
        }));
    };

    const handleSaveMesVigente = () => {
        let totalCalculado = 0;
        Object.values(faturamentoPorCnae).forEach((item) => {
            const typedItem = item as CnaeInputState;
            totalCalculado += parseFloat(typedItem.valor.replace(/\./g, '').replace(',', '.') || '0');
        });

        const mesChave = `${mesApuracao.getFullYear()}-${(mesApuracao.getMonth() + 1).toString().padStart(2, '0')}`;
        const updatedManual = { ...historicoManualEditavel, [mesChave]: totalCalculado };
        
        onSaveFaturamentoManual(empresa.id, updatedManual);
        setHistoricoManualEditavel(updatedManual);
        
        if (onShowToast) onShowToast('Apuração salva com sucesso!');
        
        // Salvar também no histórico de cálculos automaticamente
        simplesService.saveHistoricoCalculo(empresa.id, resumo, mesApuracao);
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

    const handleHistoricoChange = (mesIso: string, valor: number) => {
        setHistoricoManualEditavel(prev => ({ ...prev, [mesIso]: valor }));
    };

    const handleSaveHistorico = () => {
        if (window.confirm('Deseja salvar todo o faturamento manual dos meses informados? Isso substituirá os dados existentes.')) {
            onSaveFaturamentoManual(empresa.id, historicoManualEditavel);
            if (onShowToast) onShowToast('Faturamento manual salvo com sucesso!');
            setIsHistoryModalOpen(false);
        }
    };

    const handleReplicarUltimoValor = () => {
        const primeiroMesValido = mesesHistorico.find(m => (historicoManualEditavel[m.iso] || 0) > 0);
        const valorBase = primeiroMesValido ? historicoManualEditavel[primeiroMesValido.iso] : 0;
        
        if (valorBase > 0) {
            const novoHistorico = { ...historicoManualEditavel };
            mesesHistorico.forEach(m => {
                novoHistorico[m.iso] = valorBase;
            });
            setHistoricoManualEditavel(novoHistorico);
            if (onShowToast) onShowToast('Valor replicado para 12 meses!');
        } else {
            alert("Preencha pelo menos um mês com valor maior que zero para replicar.");
        }
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

            // 4. Memória de Cálculo Table
            if (y + 60 > pageHeight - 20) {
                doc.addPage();
                y = 20;
            }

            doc.setFont("helvetica", "bold");
            doc.text("Detalhamento dos Tributos (Repartição)", 20, y);
            y += 10;

            const impostos = simplesService.calcularDiscriminacaoImpostos(resumo.anexo_efetivo, resumo.faixa_index, resumo.das_mensal);
            
            doc.setFillColor(240, 240, 240);
            doc.rect(20, y, pageWidth - 40, 8, 'F');
            doc.setFontSize(10);
            doc.text("Tributo", 25, y + 5);
            doc.text("Valor (R$)", pageWidth - 25, y + 5, { align: 'right' });
            y += 10;

            doc.setFont("helvetica", "normal");
            Object.entries(impostos).forEach(([key, val]) => {
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
            if (atividadesSecundarias && atividadesSecundarias.length > 0) {
                 y += 5;
                 doc.text(`Atividades Secundárias: ${atividadesSecundarias.map((a) => a.cnae).join(', ')}`, 20, y);
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
        labels: (resumo.historico_simulado as SimplesCalculoMensal[] || []).map(h => h.label),
        datasets: [
            {
                label: 'Faturamento (R$)',
                data: (resumo.historico_simulado as SimplesCalculoMensal[] || []).map(h => h.faturamento),
                backgroundColor: 'rgba(14, 165, 233, 0.6)',
                yAxisID: 'y',
            },
            {
                label: 'Alíquota (%)',
                data: (resumo.historico_simulado as SimplesCalculoMensal[] || []).map(h => h.aliquotaEfetiva),
                type: 'line' as const,
                borderColor: 'rgb(245, 158, 11)',
                borderWidth: 2,
                yAxisID: 'y1',
            }
        ],
    };

    const renderCardCnae = (cnae: string, anexo: string, label: string, isSecondary: boolean = false, index?: number) => {
        const key = `${cnae}_${anexo}`;
        const state = faturamentoPorCnae[key] || { valor: '0,00', issRetido: false, icmsSt: false };
        const showIcmsSt = ['I', 'II', 'V'].includes(anexo);
        const showIss = ['III', 'IV', 'V', 'III_V'].includes(anexo);
        const isAnexoV = anexo === 'V';

        return (
            <div key={key} className="bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-600 rounded-lg p-4 relative group hover:border-sky-300 transition-colors shadow-sm">
                {isSecondary && index !== undefined && (
                    <button 
                        onClick={() => handleRemoveSecondary(index)}
                        className="absolute top-2 right-2 text-slate-400 hover:text-red-500 p-1"
                        title="Excluir atividade"
                        aria-label={`Excluir atividade secundária ${cnae}`}
                    >
                        <TrashIcon className="w-4 h-4" />
                    </button>
                )}
                
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
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input 
                                    type="checkbox" 
                                    checked={state.icmsSt} 
                                    onChange={() => handleOptionToggle(key, 'icmsSt')} 
                                    className="rounded text-sky-600 focus:ring-sky-500 w-4 h-4" 
                                    aria-label="Deduzir ICMS ST"
                                />
                                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1">
                                    Retenção ST
                                    <Tooltip content="Marque se houve Substituição Tributária de ICMS nesta receita (o valor será deduzido do cálculo).">
                                        <InfoIcon className="w-3 h-3 text-slate-400 cursor-help" />
                                    </Tooltip>
                                </span>
                            </label>
                        )}
                        {showIss && (
                            <label className="flex items-center gap-2 cursor-pointer select-none">
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
                        
                        {isAnexoV && (
                            <div className="w-full flex gap-3 mt-2 border-t border-dashed border-slate-200 dark:border-slate-700 pt-2">
                                <div className="flex-1">
                                    <label className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold block mb-1">Alíquota ISS (%)</label>
                                    <input 
                                        type="number" 
                                        placeholder="0.00" 
                                        value={state.issRate || ''}
                                        onChange={(e) => handleFaturamentoChange(key, 'issRate', e.target.value)}
                                        className="w-full p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:text-white"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold block mb-1">Alíquota ICMS ST (%)</label>
                                    <input 
                                        type="number" 
                                        placeholder="0.00"
                                        value={state.icmsStRate || ''}
                                        onChange={(e) => handleFaturamentoChange(key, 'icmsStRate', e.target.value)}
                                        className="w-full p-1 text-xs border rounded bg-white dark:bg-slate-700 dark:text-white"
                                    />
                                </div>
                            </div>
                        )}

                        {!showIcmsSt && !showIss && <span className="text-[10px] text-slate-400 italic">Sem deduções aplicáveis</span>}
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
                    { id: 'cadastrais', label: 'Dados Cadastrais', icon: <UserIcon className="w-4 h-4" /> },
                    { id: 'faturamento', label: 'Faturamento do Mês', icon: <CalculatorIcon className="w-4 h-4" /> },
                    { id: 'simulacoes', label: 'Simulações & Resultados', icon: <SimpleChart type="bar" data={{labels:[], datasets:[]}} options={{}} /> /* Icon Placeholder */ },
                    { id: 'historico', label: 'Histórico & Ajustes', icon: <HistoryIcon className="w-4 h-4" /> },
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
                        {tab.id !== 'simulacoes' && tab.icon} 
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Conteúdo das Abas */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* ABA 1: DADOS CADASTRAIS */}
                {activeTab === 'cadastrais' && (
                    <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
                        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm">
                            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                                <UserIcon className="w-5 h-5 text-sky-600" /> Folha de Salários (12m)
                            </h3>
                            <p className="text-xs text-slate-500 mb-4">Soma da folha de salários dos últimos 12 meses (incluindo encargos) para cálculo do Fator R.</p>
                            <CurrencyInput value={folha12Input} onChange={setFolha12Input} label="Valor Total Folha" />
                            <button onClick={() => onUpdateFolha12(empresa.id, folha12Input)} className="btn-press w-full mt-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold rounded-lg text-xs hover:bg-slate-200 transition-colors">
                                Atualizar Folha
                            </button>
                        </div>

                        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm">
                            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                                <DownloadIcon className="w-5 h-5 text-sky-600" /> Importar Arquivo
                            </h3>
                            <p className="text-xs text-slate-500 mb-4">Importe notas fiscais ou extrato do PGDAS (PDF, XML, Excel) para preenchimento automático.</p>
                            <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-8 text-center relative hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer group">
                                <input 
                                    type="file" 
                                    accept=".pdf, .xml, .xlsx, .xls"
                                    onChange={handleFileUpload}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    disabled={isImporting}
                                    aria-label="Upload de arquivo para importação"
                                />
                                {isImporting ? <LoadingSpinner /> : (
                                    <div className="flex flex-col items-center">
                                        <DocumentTextIcon className="w-8 h-8 text-slate-400 group-hover:text-sky-500 mb-2 transition-colors" />
                                        <p className="text-sm text-slate-600 font-bold dark:text-slate-300">Clique para enviar</p>
                                        <p className="text-xs text-slate-400">PDF, XML ou Excel</p>
                                    </div>
                                )}
                            </div>
                            {importResult && (
                                <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-900/50 rounded text-xs">
                                    <p className="text-green-600 font-bold">Sucesso: {importResult.successCount} registros</p>
                                    {importResult.failCount > 0 && <p className="text-red-500 font-bold">Falhas: {importResult.failCount}</p>}
                                </div>
                            )}
                        </div>

                        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm md:col-span-2">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
                                        <ShieldIcon className="w-5 h-5 text-sky-600" />
                                        Análise Tributária (IA)
                                    </h3>
                                    <p className="text-sm text-slate-500">Consulte a incidência de impostos para suas atividades.</p>
                                </div>
                                <div className="flex gap-2 items-end">
                                    <div className="flex gap-2">
                                        <div className="w-20">
                                            <label className="text-[10px] uppercase font-bold text-slate-500">ICMS (%)</label>
                                            <input type="text" className="w-full p-1 text-xs border rounded bg-slate-50 dark:bg-slate-700 dark:text-white" placeholder="Ex: 18" value={manualTaxRates.icms} onChange={e => setManualTaxRates(p => ({...p, icms: e.target.value}))} aria-label="Alíquota ICMS manual" />
                                        </div>
                                        <div className="w-20">
                                            <label className="text-[10px] uppercase font-bold text-slate-500">PIS/COF</label>
                                            <input type="text" className="w-full p-1 text-xs border rounded bg-slate-50 dark:bg-slate-700 dark:text-white" placeholder="Ex: 3.65" value={manualTaxRates.pisCofins} onChange={e => setManualTaxRates(p => ({...p, pisCofins: e.target.value}))} aria-label="Alíquota PIS/COFINS manual" />
                                        </div>
                                        <div className="w-20">
                                            <label className="text-[10px] uppercase font-bold text-slate-500">ISS (%)</label>
                                            <input type="text" className="w-full p-1 text-xs border rounded bg-slate-50 dark:bg-slate-700 dark:text-white" placeholder="Ex: 5" value={manualTaxRates.iss} onChange={e => setManualTaxRates(p => ({...p, iss: e.target.value}))} aria-label="Alíquota ISS manual" />
                                        </div>
                                    </div>
                                    <button onClick={handleAnalyzeTax} disabled={isAnalyzingTax} className="btn-press px-4 py-1.5 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-bold rounded-lg hover:bg-sky-200 text-sm h-[34px]">
                                        {isAnalyzingTax ? <LoadingSpinner /> : 'Refinar'}
                                    </button>
                                </div>
                            </div>
                            {Object.keys(taxDetails).length > 0 && (
                                <div className="space-y-4">
                                    {Object.entries(taxDetails).map(([cnae, details]) => (
                                        <div key={cnae} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                                            <div className="bg-slate-50 dark:bg-slate-700/50 px-4 py-2 border-b border-slate-200 dark:border-slate-700">
                                                <span className="font-bold text-sky-700 dark:text-sky-300 text-xs">CNAE: {cnae}</span>
                                            </div>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-xs text-left text-slate-600 dark:text-slate-300">
                                                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-500 uppercase font-bold">
                                                        <tr>
                                                            <th className="px-4 py-2">Tributo</th>
                                                            <th className="px-4 py-2">Incidência</th>
                                                            <th className="px-4 py-2">Alíquota Média</th>
                                                            <th className="px-4 py-2">Base Legal</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                                        {details.map((row, idx) => (
                                                            <tr key={idx}>
                                                                <td className="px-4 py-2 font-bold">{row.tributo}</td>
                                                                <td className="px-4 py-2">{row.incidencia}</td>
                                                                <td className="px-4 py-2">{row.aliquotaMedia}</td>
                                                                <td className="px-4 py-2">
                                                                    <a href={`https://www.google.com/search?q=${encodeURIComponent(row.baseLegal)}`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                                                                        {row.baseLegal}
                                                                    </a>
                                                                </td>
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
                    </div>
                )}

                {/* ABA 2: FATURAMENTO DO MÊS */}
                {activeTab === 'faturamento' && (
                    <div className="lg:col-span-3 grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
                        <div className="lg:col-span-1 bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm h-fit">
                            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Competência</label>
                            <input 
                                type="date" 
                                value={mesApuracao.toISOString().substring(0, 10)}
                                onChange={(e) => {
                                    if(e.target.value) setMesApuracao(new Date(e.target.value));
                                }}
                                className="w-full p-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-900 font-bold dark:text-white"
                                aria-label="Mês de competência"
                            />
                            <div className="mt-6 p-4 bg-sky-50 dark:bg-sky-900/20 rounded-lg border border-sky-100 dark:border-sky-800">
                                <p className="text-xs font-bold text-sky-700 dark:text-sky-400 uppercase mb-1">Faturamento Total do Mês</p>
                                <p className="text-2xl font-mono font-bold text-sky-800 dark:text-white">
                                    R$ {totalMesVigente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </p>
                            </div>
                        </div>

                        <div className="lg:col-span-2 bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border-2 border-sky-100 dark:border-sky-900">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                                    <CalculatorIcon className="w-5 h-5 text-sky-600" />
                                    Lançamento de Receita
                                </h3>
                            </div>

                            <div className="space-y-6">
                                {/* ATIVIDADE PRINCIPAL */}
                                <div>
                                    <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 border-b border-slate-100 dark:border-slate-700 pb-1">Atividade Principal</h4>
                                    {renderCardCnae(empresa.cnae, empresa.anexo, 'Principal')}
                                </div>

                                {/* ATIVIDADES SECUNDÁRIAS */}
                                {(Array.isArray(empresa.atividadesSecundarias) && empresa.atividadesSecundarias.length > 0) && (
                                    <div>
                                        <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 border-b border-slate-100 dark:border-slate-700 pb-1">Atividades Secundárias</h4>
                                        <div className="space-y-3">
                                            {(empresa.atividadesSecundarias as any[]).map((ativ, i) => 
                                                renderCardCnae(ativ.cnae, ativ.anexo, 'Secundária', true, i)
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {!isAddingCnae ? (
                                <button onClick={() => setIsAddingCnae(true)} className="w-full mt-6 py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-slate-500 hover:text-sky-600 hover:border-sky-300 dark:hover:border-sky-700 transition-colors text-xs font-bold flex justify-center items-center gap-2">
                                    <PlusIcon className="w-4 h-4" /> Adicionar Outra Atividade
                                </button>
                            ) : (
                                <div className="mt-4 p-4 bg-sky-50 dark:bg-sky-900/20 rounded-lg border border-sky-200 dark:border-sky-800 animate-fade-in">
                                    <p className="text-xs font-bold text-sky-700 dark:text-sky-300 mb-3 uppercase tracking-wide">Nova Atividade</p>
                                    <div className="flex gap-2 mb-3">
                                        <input 
                                            type="text" 
                                            placeholder="CNAE" 
                                            value={newCnaeCode}
                                            onChange={e => setNewCnaeCode(e.target.value)}
                                            className="flex-1 p-2 text-sm rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none"
                                            aria-label="Código CNAE"
                                        />
                                        <select 
                                            value={newCnaeAnexo} 
                                            onChange={e => setNewCnaeAnexo(e.target.value)}
                                            className="w-28 p-2 text-sm rounded border border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-white outline-none"
                                            aria-label="Anexo do Simples"
                                        >
                                            <option value="I">Anexo I</option>
                                            <option value="II">Anexo II</option>
                                            <option value="III">Anexo III</option>
                                            <option value="IV">Anexo IV</option>
                                            <option value="V">Anexo V</option>
                                        </select>
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => setIsAddingCnae(false)} className="px-3 py-1.5 text-xs text-red-500 font-bold hover:bg-red-50 rounded">Cancelar</button>
                                        <button onClick={handleAddNewCnae} className="px-4 py-1.5 bg-sky-600 text-white text-xs font-bold rounded hover:bg-sky-700 shadow-sm">Confirmar</button>
                                    </div>
                                </div>
                            )}
                            
                            <button 
                                onClick={handleSaveMesVigente}
                                className="btn-press w-full mt-6 py-3 bg-sky-600 text-white font-bold rounded-lg hover:bg-sky-700 transition-colors flex justify-center items-center gap-2 shadow-md"
                            >
                                <SaveIcon className="w-4 h-4" />
                                Salvar Apuração do Mês
                            </button>
                        </div>
                    </div>
                )}

                {/* ABA 3: SIMULAÇÕES & RESULTADOS */}
                {activeTab === 'simulacoes' && (
                    <div className="lg:col-span-3 space-y-6 animate-fade-in">
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
                                            <th className="px-6 py-3 text-center">Aliq. Efetiva</th>
                                            <th className="px-6 py-3 text-right">Valor DAS</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                        {(resumo.detalhamento_anexos || []).map((detalhe, idx) => (
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
                                                <td className="px-6 py-4 text-center font-mono text-slate-600 dark:text-slate-300">{detalhe.aliquotaEfetiva.toFixed(2)}%</td>
                                                <td className="px-6 py-4 text-right font-mono font-bold text-sky-600 dark:text-sky-400">{detalhe.valorDas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
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
                    </div>
                )}

                {/* ABA 4: HISTÓRICO & AJUSTES */}
                {activeTab === 'historico' && (
                    <div className="lg:col-span-3 grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
                        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm h-fit">
                            <div className="flex justify-between items-center mb-4">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">
                                        Faturamento Manual
                                    </h3>
                                    <p className="text-[10px] text-slate-500 font-bold">RBT12 Acumulado: <span className="text-sky-700 dark:text-sky-400 font-mono text-xs">R$ {totalRbt12Manual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></p>
                                </div>
                                <button 
                                    onClick={() => setIsHistoryModalOpen(true)}
                                    className="btn-press text-xs flex items-center gap-1 text-white bg-sky-600 hover:bg-sky-700 font-bold px-3 py-2 rounded-lg shadow-sm transition-colors"
                                >
                                    <PencilIcon className="w-4 h-4" /> Editar em Lote
                                </button>
                            </div>
                            
                            <div className="max-h-96 overflow-y-auto custom-scrollbar pr-1 border border-slate-100 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/20">
                                <table className="w-full text-sm">
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                        {mesesHistorico.map(m => (
                                            <tr key={m.iso}>
                                                <td className="px-3 py-2 text-slate-600 dark:text-slate-300 font-bold text-xs capitalize">{m.label}</td>
                                                <td className="px-3 py-2 text-right">
                                                    <span className="font-mono text-slate-700 dark:text-slate-200">
                                                        {(historicoManualEditavel[m.iso] || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

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
                                            {filteredHistory.map((hist) => (
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

            {/* Modal de Lançamento de Histórico Manual em Lote */}
            {isHistoryModalOpen && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[70] animate-fade-in" onClick={() => setIsHistoryModalOpen(false)}>
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                                <PencilIcon className="w-6 h-6 text-sky-600" />
                                Lançamento de Faturamento Manual (12 Meses)
                            </h3>
                            <button onClick={() => setIsHistoryModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                                <CloseIcon className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="p-6 overflow-y-auto bg-slate-50 dark:bg-slate-900/50">
                            <div className="mb-4 flex justify-end">
                                 <button 
                                    onClick={handleReplicarUltimoValor} 
                                    className="text-xs flex items-center gap-1 text-sky-600 hover:text-sky-800 font-bold bg-white dark:bg-slate-800 border border-sky-200 dark:border-sky-800 px-3 py-1.5 rounded shadow-sm"
                                >
                                    <CopyIcon className="w-4 h-4" /> Replicar 1º Valor para Todos
                                </button>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {mesesHistorico.map(m => (
                                    <div key={m.iso} className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1 capitalize">{m.label}</label>
                                        <CurrencyInput 
                                            value={historicoManualEditavel[m.iso] || 0} 
                                            onChange={(val) => handleHistoricoChange(m.iso, val)} 
                                            className="w-full"
                                            aria-label={`Faturamento em ${m.label}`}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-b-xl flex justify-end gap-3">
                             <button onClick={() => setIsHistoryModalOpen(false)} className="px-4 py-2 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                                Cancelar
                            </button>
                            <button onClick={handleSaveHistorico} className="px-6 py-2 bg-sky-600 text-white font-bold rounded-lg hover:bg-sky-700 shadow-md">
                                Salvar Faturamento Manual
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SimplesNacionalDetalhe;
