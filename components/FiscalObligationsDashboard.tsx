import React, { useState, useMemo } from 'react';
import {
    SearchType,
    FiscalObligation,
    FiscalBranch,
    TaxationRegime,
    FiscalStatus,
    ManagerAlert
} from '../types';
import {
    CalendarIcon,
    ChevronDownIcon,
    InfoIcon,
    BuildingIcon,
    CalculatorIcon,
    BriefcaseIcon,
    SearchIcon,
    PlusIcon,
    CloseIcon
} from './Icons';
import Tooltip from './Tooltip';

// Mock Data for demonstration
const MOCK_OBLIGATIONS: FiscalObligation[] = [
    {
        id: '1',
        title: 'DAS - Simples Nacional',
        description: 'Documento de Arrecadação do Simples Nacional.',
        dueDate: new Date(2026, 2, 20).getTime(),
        status: 'pending',
        branch: 'Varejo',
        regime: 'Simples Nacional',
        frequency: 'Mensal',
        category: 'Federal'
    },
    {
        id: '2',
        title: 'DCTFWeb',
        description: 'Declaração de Débitos e Créditos Tributários Federais Previdenciários.',
        dueDate: new Date(2026, 2, 15).getTime(),
        status: 'completed',
        branch: 'Serviço',
        regime: 'Lucro Presumido',
        frequency: 'Mensal',
        category: 'Federal'
    },
    {
        id: '3',
        title: 'EFD-ICMS/IPI (Sped Fiscal)',
        description: 'Escrituração Fiscal Digital de ICMS e IPI.',
        dueDate: new Date(2026, 2, 10).getTime(),
        status: 'overdue',
        branch: 'Indústria',
        regime: 'Lucro Real',
        frequency: 'Mensal',
        category: 'Estadual'
    },
    {
        id: '4',
        title: 'GIA - ICMS',
        description: 'Guia de Informação e Apuração do ICMS.',
        dueDate: new Date(2026, 2, 18).getTime(),
        status: 'warning',
        branch: 'Varejo',
        regime: 'Lucro Presumido',
        frequency: 'Mensal',
        category: 'Estadual'
    },
    {
        id: '5',
        title: 'ISS Próprio',
        description: 'Imposto Sobre Serviços de Qualquer Natureza.',
        dueDate: new Date(2026, 2, 10).getTime(),
        status: 'overdue',
        branch: 'Serviço',
        regime: 'Simples Nacional',
        frequency: 'Mensal',
        category: 'Municipal'
    },
    {
        id: '6',
        title: 'EFD-Reinf',
        description: 'Escrituração Fiscal Digital de Retenções e Outras Informações Fiscais.',
        dueDate: new Date(2026, 2, 15).getTime(),
        status: 'completed',
        branch: 'Serviço',
        regime: 'Lucro Real',
        frequency: 'Mensal',
        category: 'Federal'
    }
];

const FiscalObligationsDashboard: React.FC = () => {
    const [branchFilter, setBranchFilter] = useState<FiscalBranch>('Todos');
    const [regimeFilter, setRegimeFilter] = useState<TaxationRegime>('Todos');
    const [searchTerm, setSearchTerm] = useState('');

    const filteredObligations = useMemo(() => {
        return MOCK_OBLIGATIONS.filter(ob => {
            const matchesBranch = branchFilter === 'Todos' || ob.branch === branchFilter;
            const matchesRegime = regimeFilter === 'Todos' || ob.regime === regimeFilter;
            const matchesSearch = ob.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                ob.description.toLowerCase().includes(searchTerm.toLowerCase());
            return matchesBranch && matchesRegime && matchesSearch;
        }).sort((a, b) => a.dueDate - b.dueDate);
    }, [branchFilter, regimeFilter, searchTerm]);

    const alerts = useMemo(() => {
        const result: ManagerAlert[] = [];
        const overdue = MOCK_OBLIGATIONS.filter(ob => ob.status === 'overdue');
        const upcoming = MOCK_OBLIGATIONS.filter(ob => {
            const diffDays = (ob.dueDate - Date.now()) / (1000 * 60 * 60 * 24);
            return ob.status === 'pending' && diffDays >= 0 && diffDays <= 3;
        });

        overdue.forEach(ob => {
            result.push({
                id: `alert-ov-${ob.id}`,
                type: 'overdue',
                message: `ALERTA: A obrigação "${ob.title}" está atrasada!`,
                obligationId: ob.id,
                timestamp: Date.now()
            });
        });

        upcoming.forEach(ob => {
            result.push({
                id: `alert-up-${ob.id}`,
                type: 'upcoming',
                message: `DICA: "${ob.title}" vence em poucos dias.`,
                obligationId: ob.id,
                timestamp: Date.now()
            });
        });

        return result;
    }, []);

    const formatDate = (timestamp: number) => {
        return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(timestamp));
    };

    const getStatusColor = (status: FiscalStatus) => {
        switch (status) {
            case 'completed': return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400';
            case 'overdue': return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400';
            case 'warning': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400';
            default: return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
        }
    };

    const getStatusLabel = (status: FiscalStatus) => {
        switch (status) {
            case 'completed': return 'Concluído';
            case 'overdue': return 'Em Atraso';
            case 'warning': return 'Atenção';
            default: return 'Pendente';
        }
    };

    return (
        <div className="animate-fade-in pb-12">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden mb-8 border border-slate-200 dark:border-slate-700">
                <div className="bg-gradient-to-r from-sky-600 to-indigo-700 p-8 text-white">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div>
                            <h1 className="text-3xl font-extrabold mb-2">Obrigações Fiscais</h1>
                            <p className="text-sky-100 max-w-2xl">
                                Acompanhe os vencimentos, status e conformidade fiscal da sua empresa ou clientes.
                                Centralize as obrigações acessórias e guias de recolhimento.
                            </p>
                        </div>
                        <div className="flex gap-4">
                            <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl text-center min-w-[100px] border border-white/20">
                                <div className="text-2xl font-black">{MOCK_OBLIGATIONS.filter(o => o.status === 'overdue').length}</div>
                                <div className="text-[10px] uppercase font-bold text-sky-200">Em Atraso</div>
                            </div>
                            <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl text-center min-w-[100px] border border-white/20">
                                <div className="text-2xl font-black">{MOCK_OBLIGATIONS.filter(o => o.status === 'pending').length}</div>
                                <div className="text-[10px] uppercase font-bold text-sky-200">Pendentes</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Manager Alerts Section */}
                {alerts.length > 0 && (
                    <div className="p-6 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
                        <div className="flex items-center gap-2 mb-4">
                            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-widest">Alertas do Gestor</h2>
                            <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse"></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {alerts.map(alert => (
                                <div
                                    key={alert.id}
                                    className={`p-4 rounded-xl border flex items-center gap-3 transition-all hover:shadow-md ${alert.type === 'overdue'
                                            ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
                                            : 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                                        }`}
                                >
                                    <div className={`p-2 rounded-full ${alert.type === 'overdue' ? 'bg-red-200 dark:bg-red-800' : 'bg-amber-200 dark:bg-amber-800'}`}>
                                        <InfoIcon className="w-5 h-5" />
                                    </div>
                                    <p className="text-xs font-bold leading-tight">{alert.message}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="p-6">
                    {/* Filters Toolbar */}
                    <div className="flex flex-col lg:flex-row gap-6 items-end mb-8 bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl border border-slate-100 dark:border-slate-800">
                        <div className="flex-grow w-full">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 block tracking-wider">Buscar por Nome ou Descrição</label>
                            <div className="relative">
                                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    placeholder="Ex: Simples Nacional, ICMS, Sped..."
                                    className="w-full pl-10 pr-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none transition-all font-bold text-slate-800 dark:text-white dark:font-normal"
                                />
                            </div>
                        </div>

                        <div className="w-full lg:w-48">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 block tracking-wider">Ramo de Atividade</label>
                            <div className="relative">
                                <BuildingIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                <select
                                    value={branchFilter}
                                    onChange={e => setBranchFilter(e.target.value as any)}
                                    className="w-full pl-9 pr-8 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl appearance-none focus:ring-2 focus:ring-sky-500 outline-none transition-all font-bold text-slate-700 dark:text-slate-200 text-sm"
                                >
                                    {['Todos', 'Varejo', 'Indústria', 'Serviço', 'Agronegócio', 'E-commerce'].map(b => (
                                        <option key={b} value={b}>{b}</option>
                                    ))}
                                </select>
                                <ChevronDownIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                            </div>
                        </div>

                        <div className="w-full lg:w-48">
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 block tracking-wider">Tributação</label>
                            <div className="relative">
                                <CalculatorIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                                <select
                                    value={regimeFilter}
                                    onChange={e => setRegimeFilter(e.target.value as any)}
                                    className="w-full pl-9 pr-8 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl appearance-none focus:ring-2 focus:ring-sky-500 outline-none transition-all font-bold text-slate-700 dark:text-slate-200 text-sm"
                                >
                                    {['Todos', 'Simples Nacional', 'Lucro Presumido', 'Lucro Real', 'MEI'].map(r => (
                                        <option key={r} value={r}>{r}</option>
                                    ))}
                                </select>
                                <ChevronDownIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                            </div>
                        </div>

                        <button className="w-full lg:w-auto px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 group">
                            <PlusIcon className="w-5 h-5 group-hover:rotate-90 transition-transform" />
                            <span>Nova Obrigação</span>
                        </button>
                    </div>

                    {/* Table / List View */}
                    <div className="overflow-x-auto rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-900/50">
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800">Status</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800">Obrigação</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800">Vencimento</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 text-center">Ramo</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-bold">
                                {filteredObligations.length > 0 ? (
                                    filteredObligations.map((ob) => (
                                        <tr key={ob.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group">
                                            <td className="px-6 py-5">
                                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${getStatusColor(ob.status)}`}>
                                                    {getStatusLabel(ob.status)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-5">
                                                <div>
                                                    <div className="text-sm text-slate-900 dark:text-white mb-0.5">{ob.title}</div>
                                                    <div className="text-xs text-slate-500 dark:text-slate-400 font-normal line-clamp-1">{ob.description}</div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5 whitespace-nowrap">
                                                <div className="flex items-center gap-2">
                                                    <CalendarIcon className="w-4 h-4 text-sky-500" />
                                                    <span className={`text-sm ${ob.status === 'overdue' ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'}`}>
                                                        {formatDate(ob.dueDate)}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5 text-center">
                                                <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-600 font-black uppercase">
                                                    {ob.branch}
                                                </span>
                                            </td>
                                            <td className="px-6 py-5 text-right">
                                                <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button className="p-2 text-slate-400 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-lg transition-all" title="Ver Detalhes">
                                                        <InfoIcon className="w-5 h-5" />
                                                    </button>
                                                    <button className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-all" title="Concluir">
                                                        <BriefcaseIcon className="w-5 h-5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-12 text-center">
                                            <div className="flex flex-col items-center justify-center text-slate-400 dark:text-slate-600">
                                                <SearchIcon className="w-12 h-12 mb-4 opacity-20" />
                                                <p className="text-lg font-bold">Nenhuma obrigação encontrada</p>
                                                <p className="text-sm font-normal">Tente ajustar seus filtros de busca.</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Calendar Support Message */}
            <div className="bg-sky-50 dark:bg-sky-900/10 border border-sky-100 dark:border-sky-800 rounded-2xl p-6 flex flex-col md:flex-row items-center gap-6">
                <div className="bg-sky-600 p-4 rounded-2xl shadow-lg shadow-sky-600/30">
                    <CalendarIcon className="w-8 h-8 text-white" />
                </div>
                <div className="flex-grow text-center md:text-left">
                    <h3 className="text-lg font-extrabold text-sky-900 dark:text-sky-100">Visão Geral Mensal</h3>
                    <p className="text-sky-600 dark:text-sky-400 font-bold">Sincronize com o Google Calendar ou Outlook para não perder nenhum prazo.</p>
                </div>
                <button className="bg-white dark:bg-slate-800 text-sky-600 dark:text-sky-400 px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest border border-sky-200 dark:border-sky-800 hover:shadow-md transition-all">
                    Configurar Sincronização
                </button>
            </div>
        </div>
    );
};

export default FiscalObligationsDashboard;
