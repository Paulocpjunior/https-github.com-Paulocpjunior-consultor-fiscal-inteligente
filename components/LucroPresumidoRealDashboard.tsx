
import React, { useState, useEffect, useMemo } from 'react';
import { LucroPresumidoEmpresa, User, FichaFinanceiraRegistro, SearchType, LucroInput, LucroResult, IssConfig, ItemFinanceiroAvulso, CategoriaItemEspecial } from '../types';
import * as lucroService from '../services/lucroPresumidoService';
import { calcularLucro } from '../services/lucroService';
import { fetchCnpjFromBrasilAPI } from '../services/externalApiService';
import { CalculatorIcon, BuildingIcon, SearchIcon, DownloadIcon, DocumentTextIcon, PlusIcon, TrashIcon, EyeIcon, ArrowLeftIcon, SaveIcon, ShieldIcon, InfoIcon, UserIcon, AnimatedCheckIcon, CloseIcon, PencilIcon } from './Icons';
import LoadingSpinner from './LoadingSpinner';
import Tooltip from './Tooltip';
import SimpleChart from './SimpleChart';
import Logo from './Logo';

const MASTER_ADMIN_EMAIL = 'junior@spassessoriacontabil.com.br';

const CurrencyInput: React.FC<{ label?: string; value: number; onChange: (val: number) => void; disabled?: boolean; tooltip?: string; className?: string }> = ({ label, value, onChange, disabled, tooltip, className }) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value.replace(/\D/g, '');
        const num = parseFloat(raw) / 100;
        onChange(isNaN(num) ? 0 : num);
    };
    const formatted = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(value);
    return (
        <div className={`flex flex-col ${className || ''}`}>
            {label && (
                <label className="text-xs font-bold text-slate-800 dark:text-slate-400 uppercase mb-1 flex items-center gap-1">
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
                    disabled={disabled}
                    className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none text-slate-900 font-bold dark:text-white dark:font-mono dark:font-normal disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-500 text-right"
                />
            </div>
        </div>
    );
};

interface Props {
    currentUser?: User | null;
    externalSelectedId?: string | null;
    onAddToHistory?: (item: any) => void;
}

const LucroPresumidoRealDashboard: React.FC<Props> = ({ currentUser, externalSelectedId, onAddToHistory }) => {
    const [view, setView] = useState<'list' | 'form'>('list');
    const [companies, setCompanies] = useState<LucroPresumidoEmpresa[]>([]);
    const [selectedEmpresaId, setSelectedEmpresaId] = useState<string | null>(null);

    const [empresa, setEmpresa] = useState<Partial<LucroPresumidoEmpresa>>({
        nome: '', cnpj: '', nomeFantasia: '', cnaePrincipal: undefined, cnaesSecundarios: [], endereco: '', regimePadrao: 'Presumido'
    });
    
    const [tiposAtividade, setTiposAtividade] = useState({ comercio: true, industria: false, servico: false });
    const [isCnpjLoading, setIsCnpjLoading] = useState(false);
    const [cnpjError, setCnpjError] = useState('');
    const [isExporting, setIsExporting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState('');

    const [mesReferencia, setMesReferencia] = useState(new Date().toISOString().slice(0, 7));
    const [regimeSelecionado, setRegimeSelecionado] = useState<'Presumido' | 'Real'>('Presumido');
    const [periodoApuracao, setPeriodoApuracao] = useState<'Mensal' | 'Trimestral'>('Mensal');
    const [isEquiparacaoHospitalar, setIsEquiparacaoHospitalar] = useState(false);

    // Dynamic Items Modal State
    const [isItemModalOpen, setIsItemModalOpen] = useState(false);
    const [itensAvulsos, setItensAvulsos] = useState<ItemFinanceiroAvulso[]>([]);
    const [editingItem, setEditingItem] = useState<Partial<ItemFinanceiroAvulso> | null>(null);

    const [issConfig, setIssConfig] = useState<IssConfig>({
        tipo: 'aliquota_municipal',
        aliquota: 5,
        qtdeSocios: 1,
        valorPorSocio: 0
    });

    const [financeiro, setFinanceiro] = useState({
        acumuladoAno: 0,
        faturamentoMesComercio: 0,
        faturamentoMesServico: 0,
        faturamentoMonofasico: 0, 
        despesas: 0,
        despesasDedutiveis: 0, 
        folha: 0,
        cmv: 0,
        retencaoPis: 0,
        retencaoCofins: 0,
        retencaoIrpj: 0,
        retencaoCsll: 0
    });

    const [resultadoCalculado, setResultadoCalculado] = useState<LucroResult | null>(null);
    const isMasterAdmin = currentUser?.email === MASTER_ADMIN_EMAIL || currentUser?.role === 'admin';

    useEffect(() => {
        if (currentUser) {
            lucroService.getEmpresas(currentUser).then(setCompanies);
        }
    }, [currentUser]);

    useEffect(() => {
        if (selectedEmpresaId && empresa.fichaFinanceira) {
            const registro = empresa.fichaFinanceira.find(f => f.mesReferencia === mesReferencia);
            if (registro) {
                setFinanceiro({
                    acumuladoAno: registro.acumuladoAno,
                    faturamentoMesComercio: registro.faturamentoMesComercio,
                    faturamentoMesServico: registro.faturamentoMesServico,
                    faturamentoMonofasico: registro.faturamentoMonofasico || 0,
                    despesas: registro.despesas,
                    despesasDedutiveis: registro.despesasDedutiveis || 0,
                    folha: registro.folha,
                    cmv: registro.cmv,
                    retencaoPis: registro.retencaoPis || 0,
                    retencaoCofins: registro.retencaoCofins || 0,
                    retencaoIrpj: registro.retencaoIrpj || 0,
                    retencaoCsll: registro.retencaoCsll || 0
                });
                setItensAvulsos(registro.itensAvulsos || []);
                if (registro.regime) setRegimeSelecionado(registro.regime);
                if (registro.periodoApuracao) setPeriodoApuracao(registro.periodoApuracao);
            }
        }
    }, [mesReferencia, selectedEmpresaId, empresa.fichaFinanceira]);

    useEffect(() => {
        const input: LucroInput = {
            regimeSelecionado,
            periodoApuracao,
            faturamentoComercio: financeiro.faturamentoMesComercio,
            faturamentoServico: financeiro.faturamentoMesServico,
            faturamentoMonofasico: financeiro.faturamentoMonofasico,
            despesasOperacionais: financeiro.despesas,
            despesasDedutiveis: financeiro.despesasDedutiveis,
            folhaPagamento: financeiro.folha,
            custoMercadoriaVendida: financeiro.cmv,
            issConfig,
            retencaoPis: financeiro.retencaoPis,
            retencaoCofins: financeiro.retencaoCofins,
            retencaoIrpj: financeiro.retencaoIrpj,
            retencaoCsll: financeiro.retencaoCsll,
            isEquiparacaoHospitalar,
            itensAvulsos
        };
        const result = calcularLucro(input);
        setResultadoCalculado(result);
    }, [financeiro, regimeSelecionado, periodoApuracao, issConfig, isEquiparacaoHospitalar, itensAvulsos]);

    const handleOpenItemModal = (item?: ItemFinanceiroAvulso) => {
        setEditingItem(item || {
            id: Date.now().toString(),
            descricao: '',
            valor: 0,
            tipo: 'receita',
            categoriaEspecial: 'padrao',
            dedutivelIrpj: false,
            geraCreditoPisCofins: false
        });
        setIsItemModalOpen(true);
    };

    const handleSaveItem = () => {
        if (!editingItem || !editingItem.descricao) return;
        setItensAvulsos(prev => {
            const exists = prev.find(i => i.id === editingItem.id);
            if (exists) return prev.map(i => i.id === editingItem.id ? editingItem as ItemFinanceiroAvulso : i);
            return [...prev, editingItem as ItemFinanceiroAvulso];
        });
        setIsItemModalOpen(false);
    };

    const handleRemoveItem = (id: string) => {
        setItensAvulsos(prev => prev.filter(i => i.id !== id));
    };

    const handleCnpjVerification = async () => {
        const cleanCnpj = (empresa.cnpj || '').replace(/\D/g, '');
        if (cleanCnpj.length !== 14) { setCnpjError('CNPJ inválido.'); return; }
        setIsCnpjLoading(true); setCnpjError('');
        try {
            const data = await fetchCnpjFromBrasilAPI(cleanCnpj);
            setEmpresa(prev => ({
                ...prev,
                nome: data.razaoSocial,
                nomeFantasia: data.nomeFantasia,
                cnaePrincipal: data.cnaePrincipal,
                endereco: `${data.logradouro}, ${data.numero} - ${data.municipio}/${data.uf}`
            }));
        } catch (e: any) { setCnpjError(e.message || 'Erro ao buscar CNPJ.'); } finally { setIsCnpjLoading(false); }
    };

    const handleSaveEmpresa = async () => {
        if (!empresa.nome || !empresa.cnpj || !currentUser) return;
        setIsSaving(true);
        try {
            const empresaData = { ...empresa, tiposAtividade, regimePadrao: regimeSelecionado, issPadraoConfig: issConfig, isEquiparacaoHospitalar } as Omit<LucroPresumidoEmpresa, 'id' | 'fichaFinanceira'>;
            let saved;
            if (selectedEmpresaId) saved = await lucroService.updateEmpresa(selectedEmpresaId, empresaData);
            else saved = await lucroService.saveEmpresa(empresaData, currentUser.id);
            if (saved) {
                setEmpresa(saved);
                const updatedList = await lucroService.getEmpresas(currentUser);
                setCompanies(updatedList);
                setSaveSuccess('Empresa salva!');
                setTimeout(() => setSaveSuccess(''), 3000);
            }
        } finally { setIsSaving(false); }
    };

    if (view === 'list') {
        return (
            <div className="space-y-6 animate-fade-in">
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Lucro Presumido / Real</h2>
                    <button onClick={() => { setView('form'); setSelectedEmpresaId(null); setEmpresa({nome:'', cnpj:''}); }} className="btn-press bg-sky-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-sky-700 font-bold shadow-md">
                        <PlusIcon className="w-5 h-5" /> Nova Empresa
                    </button>
                </div>
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-300">
                            <tr>
                                <th className="px-6 py-3">Empresa</th>
                                <th className="px-6 py-3">CNPJ</th>
                                <th className="px-6 py-3 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {companies.map(c => (
                                <tr key={c.id} className="border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                    <td className="px-6 py-4 font-bold">{c.nome}</td>
                                    <td className="px-6 py-4 font-mono">{c.cnpj}</td>
                                    <td className="px-6 py-4 text-center flex justify-center gap-3">
                                        <button onClick={() => { setSelectedEmpresaId(c.id); setEmpresa(c); setView('form'); }} className="text-sky-600 hover:text-sky-800"><EyeIcon className="w-5 h-5" /></button>
                                        {isMasterAdmin && <button onClick={async () => { if(window.confirm('Excluir?')) { await lucroService.deleteEmpresa(c.id); setCompanies(prev => prev.filter(e => e.id !== c.id)); } }} className="text-red-500 hover:text-red-700"><TrashIcon className="w-5 h-5" /></button>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div className="flex items-center gap-4">
                <button onClick={() => setView('list')} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500"><ArrowLeftIcon className="w-5 h-5" /></button>
                <h2 className="text-2xl font-bold">{selectedEmpresaId ? 'Editar Apuração' : 'Nova Empresa'}</h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                        <div className="flex justify-between items-center mb-4 pb-2 border-b">
                            <h3 className="text-lg font-bold flex items-center gap-2"><BuildingIcon className="w-5 h-5 text-sky-600" /> Cadastro</h3>
                            <button onClick={handleSaveEmpresa} disabled={isSaving} className="text-sm bg-green-600 text-white font-bold px-3 py-1 rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-1">
                                {isSaving ? <LoadingSpinner small /> : <SaveIcon className="w-4 h-4" />} Salvar
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase">CNPJ</label>
                                <div className="flex gap-2">
                                    <input type="text" value={empresa.cnpj} onChange={e => setEmpresa(prev => ({...prev, cnpj: e.target.value}))} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border rounded-lg font-mono font-bold" placeholder="00.000.000/0000-00" />
                                    <button onClick={handleCnpjVerification} disabled={isCnpjLoading} className="bg-slate-100 dark:bg-slate-600 px-3 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-900 transition-colors">{isCnpjLoading ? <LoadingSpinner small /> : <SearchIcon className="w-4 h-4" />}</button>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Razão Social</label>
                                <input type="text" value={empresa.nome} onChange={e => setEmpresa(prev => ({...prev, nome: e.target.value}))} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border rounded-lg font-bold" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2 border-b pb-2"><CalculatorIcon className="w-5 h-5 text-sky-600" /> Apuração Financeira</h3>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Regime</label>
                                <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
                                    <button onClick={() => setRegimeSelecionado('Presumido')} className={`flex-1 py-1 text-xs font-bold rounded-md ${regimeSelecionado === 'Presumido' ? 'bg-white dark:bg-slate-600 shadow text-sky-700' : 'text-slate-500'}`}>Presumido</button>
                                    <button onClick={() => setRegimeSelecionado('Real')} className={`flex-1 py-1 text-xs font-bold rounded-md ${regimeSelecionado === 'Real' ? 'bg-white dark:bg-slate-600 shadow text-purple-700' : 'text-slate-500'}`}>Real</button>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Período</label>
                                <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
                                    <button onClick={() => setPeriodoApuracao('Mensal')} className={`flex-1 py-1 text-xs font-bold rounded-md ${periodoApuracao === 'Mensal' ? 'bg-white dark:bg-slate-600 shadow text-sky-700' : 'text-slate-500'}`}>Mensal</button>
                                    <button onClick={() => setPeriodoApuracao('Trimestral')} className={`flex-1 py-1 text-xs font-bold rounded-md ${periodoApuracao === 'Trimestral' ? 'bg-white dark:bg-slate-600 shadow text-sky-700' : 'text-slate-500'}`}>Trimestral</button>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <CurrencyInput label="Faturamento Comércio" value={financeiro.faturamentoMesComercio} onChange={v => setFinanceiro(p => ({...p, faturamentoMesComercio: v}))} />
                            <CurrencyInput label="Faturamento Serviços" value={financeiro.faturamentoMesServico} onChange={v => setFinanceiro(p => ({...p, faturamentoMesServico: v}))} />
                            <CurrencyInput label="Monofásicos (Isenção PIS/COF)" value={financeiro.faturamentoMonofasico} onChange={v => setFinanceiro(p => ({...p, faturamentoMonofasico: v}))} className="bg-green-50/30 p-2 rounded" />
                            <div className="grid grid-cols-2 gap-4">
                                <CurrencyInput label="Retenção PIS" value={financeiro.retencaoPis} onChange={v => setFinanceiro(p => ({...p, retencaoPis: v}))} />
                                <CurrencyInput label="Retenção COFINS" value={financeiro.retencaoCofins} onChange={v => setFinanceiro(p => ({...p, retencaoCofins: v}))} />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold flex items-center gap-2"><PlusIcon className="w-5 h-5 text-sky-600" /> Outras Receitas / Despesas</h3>
                            <button onClick={() => handleOpenItemModal()} className="text-xs bg-sky-600 text-white font-bold px-3 py-1.5 rounded-lg hover:bg-sky-700 flex items-center gap-1 shadow">
                                <PlusIcon className="w-4 h-4" /> Adicionar Item
                            </button>
                        </div>
                        
                        <div className="space-y-3">
                            {itensAvulsos.length === 0 ? (
                                <p className="text-xs text-slate-400 italic text-center py-4">Nenhum item extra adicionado.</p>
                            ) : (
                                itensAvulsos.map(item => (
                                    <div key={item.id} className={`flex items-center justify-between p-3 rounded-xl border transition-all ${item.tipo === 'receita' ? 'bg-green-50/50 border-green-100 dark:bg-green-900/10 dark:border-green-800' : 'bg-red-50/50 border-red-100 dark:bg-red-900/10 dark:border-red-800'}`}>
                                        <div className="flex-grow">
                                            <div className="flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${item.tipo === 'receita' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{item.descricao}</p>
                                                {item.dedutivelIrpj && <Tooltip content="Dedutível IRPJ/CSLL"><ShieldIcon className="w-3 h-3 text-sky-600" /></Tooltip>}
                                                {item.geraCreditoPisCofins && <Tooltip content="Gera Crédito PIS/COFINS"><CalculatorIcon className="w-3 h-3 text-green-600" /></Tooltip>}
                                            </div>
                                            <p className="text-[10px] text-slate-500 uppercase font-bold mt-0.5">{item.categoriaEspecial?.replace('_', ' ')}</p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <p className="text-sm font-mono font-bold text-slate-900 dark:text-white">
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.valor)}
                                            </p>
                                            <div className="flex gap-1">
                                                <button onClick={() => handleOpenItemModal(item)} className="p-1.5 text-slate-400 hover:text-sky-600 bg-white dark:bg-slate-700 rounded-lg shadow-sm border border-slate-100 dark:border-slate-600"><PencilIcon className="w-4 h-4" /></button>
                                                <button onClick={() => handleRemoveItem(item.id)} className="p-1.5 text-slate-400 hover:text-red-600 bg-white dark:bg-slate-700 rounded-lg shadow-sm border border-slate-100 dark:border-slate-600"><TrashIcon className="w-4 h-4" /></button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {resultadoCalculado && (
                        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 animate-fade-in">
                            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 border-b pb-2"><InfoIcon className="w-5 h-5 text-sky-600" /> Resumo da Guia</h3>
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 gap-3">
                                    {resultadoCalculado.detalhamento.map((det, idx) => (
                                        <div key={idx} className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{det.imposto}</p>
                                                    <p className="text-[10px] font-bold text-slate-500 uppercase">Base: {new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(det.baseCalculo)} ({det.aliquota.toFixed(2)}%)</p>
                                                </div>
                                                <p className="text-lg font-mono font-bold text-slate-900 dark:text-white">{new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(det.valor)}</p>
                                            </div>
                                            {det.cotaInfo && det.cotaInfo.disponivel && (
                                                <div className="mt-3 pt-3 border-t border-dashed border-slate-200 dark:border-slate-700">
                                                    <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400 text-xs font-bold mb-2">
                                                        <CalculatorIcon className="w-4 h-4" /> Plano de Cotas Disponível
                                                    </div>
                                                    <div className="grid grid-cols-3 gap-2">
                                                        {det.cotaInfo.vencimentos?.map((v, i) => (
                                                            <div key={i} className="text-center p-2 bg-sky-50 dark:bg-sky-900/30 rounded border border-sky-100 dark:border-sky-800">
                                                                <p className="text-[9px] font-black text-sky-800 dark:text-sky-300 uppercase">{v}</p>
                                                                <p className="text-[11px] font-bold text-sky-900 dark:text-white">{new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(det.cotaInfo!.valorPrimeiraCota)}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <div className="p-4 bg-sky-600 text-white rounded-xl shadow-lg flex justify-between items-center">
                                    <span className="font-bold uppercase text-xs">Total de Impostos</span>
                                    <span className="text-2xl font-black">{new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(resultadoCalculado.totalImpostos)}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* MODAL PARA ITENS AVULSOS */}
            {isItemModalOpen && editingItem && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[100] animate-fade-in" onClick={() => setIsItemModalOpen(false)}>
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="bg-sky-600 p-4 flex justify-between items-center text-white">
                            <h3 className="font-bold text-lg flex items-center gap-2"><PlusIcon className="w-6 h-6" /> Adicionar Receita/Despesa</h3>
                            <button onClick={() => setIsItemModalOpen(false)} className="p-1 hover:bg-white/20 rounded-full transition-colors"><CloseIcon className="w-6 h-6" /></button>
                        </div>
                        
                        <div className="p-6 space-y-6">
                            <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-xl">
                                <button onClick={() => setEditingItem({...editingItem, tipo: 'receita'})} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${editingItem.tipo === 'receita' ? 'bg-white dark:bg-slate-600 shadow text-green-600' : 'text-slate-500'}`}>Receita (+)</button>
                                <button onClick={() => setEditingItem({...editingItem, tipo: 'despesa'})} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${editingItem.tipo === 'despesa' ? 'bg-white dark:bg-slate-600 shadow text-red-600' : 'text-slate-500'}`}>Despesa (-)</button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Descrição</label>
                                    <input type="text" value={editingItem.descricao} onChange={e => setEditingItem({...editingItem, descricao: e.target.value})} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-sky-500 outline-none text-slate-900 dark:text-white font-bold" placeholder="Ex: Rendimentos de Aplicação, Manutenção..." />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <CurrencyInput label="Valor do Item" value={editingItem.valor || 0} onChange={v => setEditingItem({...editingItem, valor: v})} />
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Categoria</label>
                                        <select value={editingItem.categoriaEspecial} onChange={e => setEditingItem({...editingItem, categoriaEspecial: e.target.value as CategoriaItemEspecial})} className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl font-bold outline-none focus:ring-2 focus:ring-sky-500">
                                            <option value="padrao">Padrão</option>
                                            {editingItem.tipo === 'receita' && <option value="aplicacao_financeira">Aplicação Financeira</option>}
                                            {editingItem.tipo === 'despesa' && <option value="importacao">Importação</option>}
                                        </select>
                                    </div>
                                </div>
                                
                                {regimeSelecionado === 'Real' && editingItem.tipo === 'despesa' && (
                                    <div className="p-4 bg-purple-50 dark:bg-purple-900/10 rounded-2xl border border-purple-100 dark:border-purple-800 space-y-3">
                                        <p className="text-[10px] font-black text-purple-700 dark:text-purple-400 uppercase tracking-widest mb-1">Configurações Fiscais (Lucro Real)</p>
                                        <div className="flex gap-4">
                                            <label className="flex items-center gap-2 cursor-pointer group">
                                                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${editingItem.dedutivelIrpj ? 'bg-purple-600 border-purple-600' : 'bg-white border-slate-300'}`}>
                                                    {editingItem.dedutivelIrpj && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4"><path d="M5 13l4 4L19 7" /></svg>}
                                                </div>
                                                <input type="checkbox" className="hidden" checked={editingItem.dedutivelIrpj} onChange={e => setEditingItem({...editingItem, dedutivelIrpj: e.target.checked})} />
                                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Dedutível IRPJ/CSLL</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer group">
                                                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${editingItem.geraCreditoPisCofins ? 'bg-green-600 border-green-600' : 'bg-white border-slate-300'}`}>
                                                    {editingItem.geraCreditoPisCofins && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4"><path d="M5 13l4 4L19 7" /></svg>}
                                                </div>
                                                <input type="checkbox" className="hidden" checked={editingItem.geraCreditoPisCofins} onChange={e => setEditingItem({...editingItem, geraCreditoPisCofins: e.target.checked})} />
                                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Gerar Crédito PIS/COF</span>
                                            </label>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t flex gap-3">
                            <button onClick={() => setIsItemModalOpen(false)} className="flex-1 py-3 text-sm font-bold text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors">Cancelar</button>
                            <button onClick={handleSaveItem} className="flex-[2] py-3 text-sm font-bold bg-sky-600 text-white hover:bg-sky-700 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2">
                                <AnimatedCheckIcon size="w-5 h-5" className="text-white" /> Confirmar Item
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LucroPresumidoRealDashboard;
