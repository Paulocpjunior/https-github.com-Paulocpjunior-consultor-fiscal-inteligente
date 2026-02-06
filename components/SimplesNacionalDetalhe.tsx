
import React, { useState, useMemo } from 'react';
import { SimplesNacionalEmpresa, SimplesNacionalNota, SimplesNacionalImportResult, User } from '../types';
import * as simplesService from '../services/simplesNacionalService';
import { ArrowLeftIcon, SaveIcon, UserIcon, HistoryIcon, EyeIcon, DownloadIcon, CalculatorIcon } from './Icons';

interface SimplesNacionalDetalheProps {
    empresa: SimplesNacionalEmpresa;
    notas: SimplesNacionalNota[];
    onBack: () => void;
    onImport: (empresaId: string, file: File) => Promise<SimplesNacionalImportResult>;
    onUpdateFolha12: (empresaId: string, val: number) => void;
    onSaveFaturamentoManual: (empresaId: string, faturamento: any, faturamentoDetalhado?: any) => Promise<any>;
    onUpdateEmpresa: (empresaId: string, data: Partial<SimplesNacionalEmpresa>) => Promise<any>;
    onShowClienteView: () => void;
    onShowToast: (message: string) => void;
    currentUser?: User | null;
}

const CurrencyInput: React.FC<{ value: number; onChange: (val: number) => void; className?: string }> = ({ value, onChange, className }) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value.replace(/\D/g, '');
        const num = parseFloat(raw) / 100;
        onChange(isNaN(num) ? 0 : num);
    };
    const formatted = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(value);
    return (
        <div className={`relative ${className || ''}`}>
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-xs">R$</span>
            <input 
                type="text" 
                value={formatted} 
                onChange={handleChange} 
                className="w-full pl-8 pr-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none text-slate-900 font-bold dark:text-white dark:font-mono text-right text-sm"
            />
        </div>
    );
};

const SimplesNacionalDetalhe: React.FC<SimplesNacionalDetalheProps> = ({ 
    empresa, notas, onBack, onImport, onUpdateFolha12, onSaveFaturamentoManual, onUpdateEmpresa, onShowClienteView, onShowToast, currentUser 
}) => {
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [folha12Input, setFolha12Input] = useState(empresa.folha12);
    
    // Derived state for calculation
    const resumo = useMemo(() => {
        // We use a dummy date or current date for general overview, 
        // usually the dashboard shows current month projection.
        return simplesService.calcularResumoEmpresa(empresa, notas, new Date());
    }, [empresa, notas]);

    // Manual RBT12 editing state
    const [manualRbtHistory, setManualRbtHistory] = useState<Record<string, number>>(empresa.faturamentoManual || {});

    // Calculate total from manual inputs for display
    const totalRbt12Manual = useMemo(() => {
        let total = 0;
        // Logic to sum last 12 months from manual history relative to current date
        const today = new Date();
        for (let i = 1; i <= 12; i++) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const k = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
            total += (manualRbtHistory[k] || 0);
        }
        return total;
    }, [manualRbtHistory]);

    const handleSaveHistory = async () => {
        await onSaveFaturamentoManual(empresa.id, manualRbtHistory);
        setIsHistoryModalOpen(false);
        onShowToast("Histórico de faturamento atualizado!");
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const res = await onImport(empresa.id, file);
            if (res.errors.length > 0) {
                // Handle errors or warnings
                onShowToast(`Importação com avisos: ${res.errors[0]}`);
            } else {
                onShowToast(`Importado com sucesso!`);
            }
        }
    };

    return (
        <div className="animate-fade-in pb-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors">
                        <ArrowLeftIcon className="w-5 h-5" />
                    </button>
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{empresa.nome}</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-mono">{empresa.cnpj} • Anexo {empresa.anexo}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={onShowClienteView} className="btn-press flex items-center gap-2 px-4 py-2 bg-sky-100 text-sky-700 font-bold rounded-lg hover:bg-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:hover:bg-sky-900/50">
                        <EyeIcon className="w-5 h-5" />
                        Visão Cliente
                    </button>
                    <label className="btn-press flex items-center gap-2 px-4 py-2 bg-slate-800 text-white font-bold rounded-lg hover:bg-slate-700 cursor-pointer">
                        <DownloadIcon className="w-5 h-5" />
                        Importar NFe/PGDAS
                        <input type="file" accept=".xml,.pdf,.xls,.xlsx" className="hidden" onChange={handleFileUpload} />
                    </label>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Stats & Controls */}
                <div className="lg:col-span-1 space-y-6">
                    {/* RBT12 Card */}
                    <div className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-2">
                            <HistoryIcon className="w-4 h-4 text-sky-600" /> RBT12 (Histórico 12m)
                        </h3>
                        <button onClick={() => setIsHistoryModalOpen(true)} className="text-[10px] text-sky-600 hover:underline font-bold w-full text-right mb-2">Editar Manual</button>
                        <div className="p-3 bg-slate-100 dark:bg-slate-700/50 rounded-lg mb-3">
                            <p className="text-[10px] text-slate-500 uppercase font-bold">Receita Bruta Acumulada</p>
                            <p className="text-lg font-mono font-bold text-slate-900 dark:text-white">R$ {resumo.rbt12.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            
                            {/* Exibição Segregada */}
                            <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-600 flex justify-between text-[10px] font-bold">
                                <div className="text-slate-600 dark:text-slate-400">
                                    <span className="block uppercase text-[9px] text-slate-400">Interno</span>
                                    R$ {resumo.rbt12Interno.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </div>
                                <div className="text-indigo-600 dark:text-indigo-400 text-right">
                                    <span className="block uppercase text-[9px] text-indigo-400">Externo</span>
                                    R$ {resumo.rbt12Externo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                            <p className="text-[9px] text-slate-400 mt-2 italic text-center">* Base de cálculo segregada para faixa</p>
                        </div>
                    </div>

                    {/* Folha Card */}
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
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1">Fator R Calculado</label>
                                    <span className={`text-xs font-bold ${resumo.fator_r >= 0.28 ? 'text-green-600' : 'text-orange-600'}`}>
                                        {(resumo.fator_r * 100).toFixed(2)}%
                                    </span>
                                </div>
                                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                                    <div className={`h-2 rounded-full ${resumo.fator_r >= 0.28 ? 'bg-green-500' : 'bg-orange-500'}`} style={{ width: `${Math.min(resumo.fator_r * 100, 100)}%` }}></div>
                                </div>
                                <p className="text-[9px] text-slate-400 mt-1">Meta: 28% para Anexo III (se aplicável)</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Calculations & Details */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Alíquota Efetiva Card */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-sky-100 dark:bg-sky-900/30 rounded-lg text-sky-600 dark:text-sky-400">
                                <CalculatorIcon className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Alíquota Efetiva Atual</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Baseado no RBT12 e Anexo</p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-6">
                            <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg">
                                <p className="text-xs font-bold text-slate-500 uppercase mb-1">Alíquota Nominal</p>
                                <p className="text-2xl font-mono font-bold text-slate-800 dark:text-slate-200">{resumo.aliq_nom}%</p>
                            </div>
                            <div className="bg-sky-50 dark:bg-sky-900/20 p-4 rounded-lg border border-sky-100 dark:border-sky-800">
                                <p className="text-xs font-bold text-sky-700 dark:text-sky-300 uppercase mb-1">Alíquota Efetiva</p>
                                <p className="text-3xl font-mono font-bold text-sky-600 dark:text-sky-400">{resumo.aliq_eff.toFixed(2)}%</p>
                            </div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                            <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">
                                Estimativa de DAS sobre R$ 10.000,00: <span className="font-bold text-slate-900 dark:text-white">R$ {(10000 * resumo.aliq_eff / 100).toFixed(2)}</span>
                            </p>
                        </div>
                    </div>

                    {/* Notas Recentes */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">Notas / Faturamento Importado</h3>
                        {notas.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
                                    <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-300">
                                        <tr>
                                            <th className="px-4 py-2">Data</th>
                                            <th className="px-4 py-2">Origem</th>
                                            <th className="px-4 py-2">Descrição</th>
                                            <th className="px-4 py-2 text-right">Valor</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {notas.slice(0, 5).map(nota => (
                                            <tr key={nota.id} className="border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                                <td className="px-4 py-2">{new Date(nota.data).toLocaleDateString()}</td>
                                                <td className="px-4 py-2">{nota.origem}</td>
                                                <td className="px-4 py-2 truncate max-w-xs">{nota.descricao}</td>
                                                <td className="px-4 py-2 text-right font-mono font-bold text-slate-700 dark:text-slate-200">
                                                    {nota.valor.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {notas.length > 5 && <p className="text-center text-xs text-slate-400 mt-2">Exibindo 5 de {notas.length} registros</p>}
                            </div>
                        ) : (
                            <p className="text-slate-500 dark:text-slate-400 text-sm text-center py-4">Nenhuma nota importada.</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Modal de Histórico Manual */}
            {isHistoryModalOpen && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[60] animate-fade-in" onClick={() => setIsHistoryModalOpen(false)}>
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center">
                            <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100">Editor de Histórico RBT12</h3>
                            <button onClick={() => setIsHistoryModalOpen(false)} className="text-slate-400 hover:text-slate-600"><PlusIcon className="w-5 h-5 rotate-45" /></button>
                        </div>
                        <div className="p-4 overflow-y-auto flex-grow space-y-3">
                            <p className="text-xs text-slate-500 mb-2">Informe o faturamento bruto mensal dos últimos 12 meses para cálculo correto da alíquota.</p>
                            {Array.from({length: 12}).map((_, i) => {
                                const d = new Date();
                                d.setMonth(d.getMonth() - (i + 1));
                                const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
                                const label = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                                
                                return (
                                    <div key={key} className="flex justify-between items-center gap-4">
                                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 capitalize w-1/3">{label}</label>
                                        <CurrencyInput 
                                            value={manualRbtHistory[key] || 0} 
                                            onChange={(val) => setManualRbtHistory(prev => ({...prev, [key]: val}))}
                                            className="flex-grow"
                                        />
                                    </div>
                                )
                            })}
                        </div>
                        <div className="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2">
                            <button onClick={() => setIsHistoryModalOpen(false)} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-100 rounded-lg">Cancelar</button>
                            <button onClick={handleSaveHistory} className="px-4 py-2 bg-sky-600 text-white font-bold rounded-lg hover:bg-sky-700">Salvar Histórico</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SimplesNacionalDetalhe;
