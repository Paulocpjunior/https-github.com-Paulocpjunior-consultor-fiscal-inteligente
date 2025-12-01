
import React, { useState, useMemo, useRef } from 'react';
import { SimplesNacionalEmpresa, SimplesNacionalNota, SimplesNacionalImportResult, User } from '../types';
import * as simplesService from '../services/simplesNacionalService';
import { fetchSimplesNacionalExplanation } from '../services/geminiService';
import SimpleChart from './SimpleChart';
import LoadingSpinner from './LoadingSpinner';
import { FormattedText } from './FormattedText';
import { 
    ArrowLeftIcon, 
    SaveIcon, 
    CalculatorIcon, 
    DocumentTextIcon, 
    EyeIcon, 
    PencilIcon,
    DownloadIcon,
    SparkleStarIcon,
    InfoIcon,
    TrashIcon
} from './Icons';

interface SimplesNacionalDetalheProps {
    empresa: SimplesNacionalEmpresa;
    notas: SimplesNacionalNota[];
    onBack: () => void;
    onImport: (empresaId: string, file: File) => Promise<SimplesNacionalImportResult>;
    onUpdateFolha12: (empresaId: string, val: number) => void;
    onSaveFaturamentoManual: (empresaId: string, faturamento: any, faturamentoDetalhado?: any) => Promise<SimplesNacionalEmpresa | null>;
    onUpdateEmpresa: (empresaId: string, data: Partial<SimplesNacionalEmpresa>) => void;
    onShowClienteView: () => void;
    onShowToast: (msg: string) => void;
    currentUser?: User | null;
}

const SimplesNacionalDetalhe: React.FC<SimplesNacionalDetalheProps> = ({ 
    empresa, 
    notas, 
    onBack, 
    onImport, 
    onUpdateFolha12, 
    onSaveFaturamentoManual, 
    onUpdateEmpresa,
    onShowClienteView,
    onShowToast,
    currentUser 
}) => {
    const [mesReferencia, setMesReferencia] = useState(new Date());
    const [isImporting, setIsImporting] = useState(false);
    const [editFolha, setEditFolha] = useState(false);
    const [folhaValue, setFolhaValue] = useState(empresa.folha12.toString());
    
    // AI State
    const [aiQuestion, setAiQuestion] = useState('');
    const [aiResponse, setAiResponse] = useState<string | null>(null);
    const [isAiLoading, setIsAiLoading] = useState(false);

    // Manual Entry State
    const [manualEntryDate, setManualEntryDate] = useState('');
    const [manualEntryValue, setManualEntryValue] = useState('');

    const fileInputRef = useRef<HTMLInputElement>(null);

    const resumo = useMemo(() => {
        return simplesService.calcularResumoEmpresa(empresa, notas, mesReferencia);
    }, [empresa, notas, mesReferencia]);

    const handleUpdateFolha = () => {
        const val = parseFloat(folhaValue.replace(',', '.'));
        if (!isNaN(val)) {
            onUpdateFolha12(empresa.id, val);
            setEditFolha(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setIsImporting(true);
            try {
                const result = await onImport(empresa.id, e.target.files[0]);
                // Toast logic handled by parent via handleImportNotas usually, but we can double check
            } catch (error) {
                console.error(error);
                onShowToast("Erro ao importar arquivo.");
            } finally {
                setIsImporting(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        }
    };

    const handleManualEntry = async () => {
        if (!manualEntryDate || !manualEntryValue) return;
        const val = parseFloat(manualEntryValue.replace(',', '.'));
        if (isNaN(val)) return;

        const currentManual = { ...empresa.faturamentoManual };
        currentManual[manualEntryDate] = val; // YYYY-MM format expected

        await onSaveFaturamentoManual(empresa.id, currentManual);
        setManualEntryDate('');
        setManualEntryValue('');
        onShowToast("Faturamento manual atualizado!");
    };

    const handleDeleteManualEntry = async (key: string) => {
        if (!window.confirm(`Remover faturamento de ${key}?`)) return;
        const currentManual = { ...empresa.faturamentoManual };
        delete currentManual[key];
        await onSaveFaturamentoManual(empresa.id, currentManual);
        onShowToast("Registro removido.");
    };

    const handleAskAi = async () => {
        if (!aiQuestion.trim()) return;
        setIsAiLoading(true);
        setAiResponse(null);
        try {
            const result = await fetchSimplesNacionalExplanation(empresa, resumo, aiQuestion);
            setAiResponse(result.text);
        } catch (e) {
            setAiResponse("Erro ao consultar IA. Tente novamente.");
        } finally {
            setIsAiLoading(false);
        }
    };

    const handleSaveCalculation = async () => {
        await simplesService.saveHistoricoCalculo(empresa.id, resumo, mesReferencia);
        onShowToast("Cálculo salvo no histórico!");
    };

    const chartData = {
        labels: resumo.historico_simulado.map(h => h.label),
        datasets: [
            {
                label: 'Receita Bruta (R$)',
                data: resumo.historico_simulado.map(h => h.faturamento),
                backgroundColor: 'rgba(14, 165, 233, 0.5)',
                borderColor: 'rgb(14, 165, 233)',
                borderWidth: 1
            }
        ]
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false }
        }
    };

    return (
        <div className="animate-fade-in space-y-6 pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors">
                        <ArrowLeftIcon className="w-6 h-6" />
                    </button>
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{empresa.nome}</h2>
                        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                            <span className="font-mono">{empresa.cnpj}</span>
                            <span>•</span>
                            <span className="font-semibold text-sky-600 dark:text-sky-400">Anexo {empresa.anexo}</span>
                        </div>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={onShowClienteView}
                        className="btn-press flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600"
                    >
                        <EyeIcon className="w-5 h-5" />
                        Visão do Cliente
                    </button>
                     <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept=".xml,.pdf,.xlsx,.xls"
                        onChange={handleFileUpload}
                    />
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isImporting}
                        className="btn-press flex items-center gap-2 px-4 py-2 bg-sky-600 text-white font-semibold rounded-lg hover:bg-sky-700 disabled:opacity-50"
                    >
                        {isImporting ? <LoadingSpinner small /> : <DownloadIcon className="w-5 h-5" />}
                        Importar NFe/PGDAS
                    </button>
                </div>
            </div>

            {/* Warning Cards */}
            {resumo.ultrapassou_sublimite && (
                 <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-500 rounded-r text-orange-800 dark:text-orange-200 flex items-start gap-3">
                    <InfoIcon className="w-6 h-6 flex-shrink-0" />
                    <div>
                        <h4 className="font-bold">Sub-limite Excedido!</h4>
                        <p className="text-sm">O RBT12 ultrapassou R$ 3.600.000,00. ICMS e ISS devem ser recolhidos separadamente fora do DAS.</p>
                    </div>
                 </div>
            )}

            {/* Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                    <p className="text-xs font-bold text-slate-500 uppercase">RBT12 (Atual)</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                        R$ {resumo.rbt12.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                    <p className="text-xs font-bold text-slate-500 uppercase">Alíquota Efetiva</p>
                    <p className="text-2xl font-bold text-sky-600 dark:text-sky-400 mt-1">
                        {resumo.aliq_eff.toFixed(2)}%
                    </p>
                    <p className="text-xs text-slate-400 mt-1">Nominal: {resumo.aliq_nom}%</p>
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 relative group">
                    <div className="flex justify-between items-start">
                        <p className="text-xs font-bold text-slate-500 uppercase">Folha 12 Meses</p>
                        <button onClick={() => setEditFolha(!editFolha)} className="text-slate-400 hover:text-sky-500">
                            <PencilIcon className="w-4 h-4" />
                        </button>
                    </div>
                    {editFolha ? (
                        <div className="mt-1 flex gap-1">
                            <input 
                                type="number" 
                                value={folhaValue} 
                                onChange={(e) => setFolhaValue(e.target.value)}
                                className="w-full px-2 py-1 text-sm border rounded dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                            />
                            <button onClick={handleUpdateFolha} className="p-1 bg-green-500 text-white rounded"><SaveIcon className="w-4 h-4" /></button>
                        </div>
                    ) : (
                        <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                            R$ {empresa.folha12.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                    )}
                    {empresa.anexo === 'III_V' && (
                        <p className={`text-xs font-bold mt-1 ${resumo.fator_r >= 0.28 ? 'text-green-600' : 'text-red-500'}`}>
                            Fator R: {(resumo.fator_r * 100).toFixed(1)}% ({resumo.fator_r >= 0.28 ? 'Anexo III' : 'Anexo V'})
                        </p>
                    )}
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                    <p className="text-xs font-bold text-slate-500 uppercase">DAS Estimado (Mês)</p>
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                        R$ {resumo.das_mensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Chart & Manual Data */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Chart */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">Evolução da Receita</h3>
                        <div className="h-64">
                            <SimpleChart type="bar" data={chartData} options={chartOptions} />
                        </div>
                    </div>

                    {/* Manual Entry Table */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Lançamentos Mensais (Faturamento)</h3>
                        </div>
                        
                        <div className="flex flex-wrap gap-2 mb-4 p-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                            <input 
                                type="month" 
                                value={manualEntryDate}
                                onChange={e => setManualEntryDate(e.target.value)}
                                className="px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                            />
                            <input 
                                type="number" 
                                placeholder="Valor R$"
                                value={manualEntryValue}
                                onChange={e => setManualEntryValue(e.target.value)}
                                className="px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                            />
                            <button 
                                onClick={handleManualEntry}
                                className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-bold hover:bg-sky-700"
                            >
                                Adicionar / Atualizar
                            </button>
                        </div>

                        <div className="overflow-y-auto max-h-60">
                            <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
                                <thead className="text-xs text-slate-700 uppercase bg-slate-100 dark:bg-slate-700 dark:text-slate-300">
                                    <tr>
                                        <th className="px-4 py-2">Competência</th>
                                        <th className="px-4 py-2 text-right">Valor</th>
                                        <th className="px-4 py-2 text-center">Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {Object.entries(empresa.faturamentoManual || {}).sort().reverse().map(([key, val]) => (
                                        <tr key={key} className="border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                            <td className="px-4 py-2 font-mono">{key}</td>
                                            <td className="px-4 py-2 text-right font-bold text-slate-700 dark:text-slate-200">
                                                R$ {val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="px-4 py-2 text-center">
                                                <button onClick={() => handleDeleteManualEntry(key)} className="text-red-500 hover:text-red-700 p-1">
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {Object.keys(empresa.faturamentoManual || {}).length === 0 && (
                                        <tr>
                                            <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                                                Nenhum lançamento manual registrado.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* Right Column: AI & Actions */}
                <div className="space-y-6">
                    {/* Calculation Controls */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                            <CalculatorIcon className="w-5 h-5" />
                            Simulador
                        </h3>
                        <div className="mb-4">
                            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Mês de Apuração</label>
                            <input 
                                type="month" 
                                value={mesReferencia.toISOString().slice(0, 7)}
                                onChange={e => {
                                    if(e.target.value) setMesReferencia(new Date(e.target.value + '-02')); // Avoid timezone issues
                                }}
                                className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                            />
                        </div>
                        <div className="p-3 bg-slate-50 dark:bg-slate-700/30 rounded-lg text-sm mb-4">
                            <div className="flex justify-between mb-1">
                                <span className="text-slate-500">Faturamento Mês:</span>
                                <span className="font-bold text-slate-800 dark:text-white">
                                    R$ {(resumo.mensal[mesReferencia.toISOString().slice(0, 7)] || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">DAS Estimado:</span>
                                <span className="font-bold text-sky-600">
                                    R$ {resumo.das_mensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>
                        <button 
                            onClick={handleSaveCalculation}
                            className="w-full py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors flex justify-center items-center gap-2"
                        >
                            <SaveIcon className="w-4 h-4" />
                            Salvar Apuração
                        </button>
                    </div>

                    {/* AI Assistant */}
                    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-slate-800 dark:to-slate-800 p-6 rounded-xl shadow-sm border border-indigo-100 dark:border-slate-700">
                        <div className="flex items-center gap-2 mb-4">
                            <SparkleStarIcon className="w-5 h-5 text-indigo-500" size="w-6 h-6" />
                            <h3 className="text-lg font-bold text-indigo-900 dark:text-indigo-300">IA Assistant</h3>
                        </div>
                        
                        <div className="space-y-3">
                            <textarea
                                value={aiQuestion}
                                onChange={e => setAiQuestion(e.target.value)}
                                placeholder="Ex: Analise a variação do faturamento ou explique o aumento da alíquota."
                                className="w-full p-3 rounded-lg border border-indigo-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm focus:ring-2 focus:ring-indigo-500 dark:text-white min-h-[100px]"
                            />
                            <button
                                onClick={handleAskAi}
                                disabled={isAiLoading || !aiQuestion.trim()}
                                className="w-full py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                            >
                                {isAiLoading ? <LoadingSpinner small /> : 'Consultar Inteligência'}
                            </button>
                        </div>

                        {aiResponse && (
                            <div className="mt-4 p-4 bg-white dark:bg-slate-900 rounded-lg border border-indigo-100 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-300 prose prose-sm dark:prose-invert max-w-none">
                                <FormattedText text={aiResponse} />
                            </div>
                        )}
                    </div>

                    {/* Calculation History List */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                            <DocumentTextIcon className="w-5 h-5" />
                            Histórico Salvo
                        </h3>
                        <div className="max-h-60 overflow-y-auto space-y-2">
                            {empresa.historicoCalculos && empresa.historicoCalculos.length > 0 ? (
                                [...empresa.historicoCalculos].reverse().map(hist => (
                                    <div key={hist.id} className="p-3 bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-slate-100 dark:border-slate-700">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="font-bold text-slate-700 dark:text-slate-200 capitalize">{hist.mesReferencia}</span>
                                            <span className="text-xs text-slate-400">{new Date(hist.dataCalculo).toLocaleDateString()}</span>
                                        </div>
                                        <div className="flex justify-between text-xs">
                                            <span className="text-slate-500">DAS: R$ {hist.das_mensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                            <span className="text-sky-600 font-semibold">{hist.aliq_eff.toFixed(2)}%</span>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-center text-slate-400 text-sm py-4">Nenhum cálculo salvo.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SimplesNacionalDetalhe;
