
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

    const [isItemModalOpen, setIsItemModalOpen] = useState(false);
    const [itensAvulsos, setItensAvulsos] = useState<ItemFinanceiroAvulso[]>([]);
    const [editingItem, setEditingItem] = useState<Partial<ItemFinanceiroAvulso> | null>(null);

    const [issConfig, setIssConfig] = useState<IssConfig>({
        tipo: 'aliquota_municipal', aliquota: 5, qtdeSocios: 1, valorPorSocio: 0
    });

    const [financeiro, setFinanceiro] = useState({
        acumuladoAno: 0, faturamentoMesComercio: 0, faturamentoMesServico: 0, faturamentoMonofasico: 0, 
        despesas: 0, despesasDedutiveis: 0, folha: 0, cmv: 0,
        retencaoPis: 0, retencaoCofins: 0, retencaoIrpj: 0, retencaoCsll: 0
    });

    /**
     * Define whether the current user is a master admin.
     * Fixed error: "Cannot find name 'isMasterAdmin'."
     */
    const isMasterAdmin = useMemo(() => {
        return currentUser?.role === 'admin' || currentUser?.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase();
    }, [currentUser]);

    const resultadoCalculado = useMemo(() => {
        const input: LucroInput = {
            regimeSelecionado, periodoApuracao,
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
        return calcularLucro(input);
    }, [financeiro, regimeSelecionado, periodoApuracao, issConfig, isEquiparacaoHospitalar, itensAvulsos]);

    useEffect(() => {
        if (currentUser) lucroService.getEmpresas(currentUser).then(setCompanies);
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

    const handleExportPDF = async () => {
        if (!empresa.nome || !resultadoCalculado || !currentUser) return;
        setIsExporting(true);
        try {
            const { default: jsPDF } = await import('jspdf');
            const { default: html2canvas } = await import('html2canvas');

            const element = document.getElementById('extrato-lucro-completo');
            if (!element) throw new Error('Template não encontrado.');

            await new Promise(r => setTimeout(r, 200));

            const canvas = await html2canvas(element, {
                scale: 2.5,
                backgroundColor: '#ffffff',
                useCORS: true,
                windowWidth: 1050
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

            pdf.save(`extrato-lucro-${empresa.nome.replace(/\s+/g, '-')}-${mesReferencia}.pdf`);
        } catch (e) {
            console.error(e);
            alert("Erro ao gerar PDF.");
        } finally { setIsExporting(false); }
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

    const handleSaveCalculo = async () => {
        if (!selectedEmpresaId) return;
        setIsSaving(true);
        /**
         * Creating the calculation record.
         * Fixed error: "Property 'acumuladoAno' is missing in type ... but required in type 'FichaFinanceiraRegistro'."
         */
        const registro: FichaFinanceiraRegistro = {
            id: Date.now().toString(),
            dataRegistro: Date.now(),
            mesReferencia,
            regime: regimeSelecionado,
            periodoApuracao,
            acumuladoAno: financeiro.acumuladoAno,
            faturamentoMesComercio: financeiro.faturamentoMesComercio,
            faturamentoMesServico: financeiro.faturamentoMesServico,
            faturamentoMonofasico: financeiro.faturamentoMonofasico,
            faturamentoMesTotal: financeiro.faturamentoMesComercio + financeiro.faturamentoMesServico,
            totalGeral: financeiro.acumuladoAno + financeiro.faturamentoMesComercio + financeiro.faturamentoMesServico,
            despesas: financeiro.despesas,
            despesasDedutiveis: financeiro.despesasDedutiveis,
            folha: financeiro.folha,
            cmv: financeiro.cmv,
            retencaoPis: financeiro.retencaoPis,
            retencaoCofins: financeiro.retencaoCofins,
            retencaoIrpj: financeiro.retencaoIrpj,
            retencaoCsll: financeiro.retencaoCsll,
            isEquiparacaoHospitalar,
            itensAvulsos,
            totalImpostos: resultadoCalculado.totalImpostos,
            cargaTributaria: resultadoCalculado.cargaTributaria
        };
        try {
            const updated = await lucroService.addFichaFinanceira(selectedEmpresaId, registro);
            if (updated) {
                setEmpresa(updated);
                setSaveSuccess('Cálculo salvo!');
                setTimeout(() => setSaveSuccess(''), 3000);
            }
        } finally { setIsSaving(false); }
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
                endereco: `${data.logradouro}, ${data.numero} - ${data.municipio}/${data.uf}`
            }));
        } catch (e: any) { setCnpjError(e.message || 'Erro ao buscar CNPJ.'); } finally { setIsCnpjLoading(false); }
    };

    if (view === 'list') {
        return (
            <div className="space-y-6 animate-fade-in">
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold">Lucro Presumido / Real</h2>
                    <button onClick={() => { setView('form'); setSelectedEmpresaId(null); setEmpresa({nome:'', cnpj:''}); }} className="btn-press bg-sky-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-sky-700 font-bold shadow-md">
                        <PlusIcon className="w-5 h-5" /> Nova Empresa
                    </button>
                </div>
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden border border-slate-200 dark:border-slate-700">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-300">
                            <tr><th className="px-6 py-3">Empresa</th><th className="px-6 py-3">CNPJ</th><th className="px-6 py-3 text-center">Ações</th></tr>
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
                                    <input type="text" value={empresa.cnpj} onChange={e => setEmpresa(prev => ({...prev, cnpj: e.target.value}))} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border rounded-lg font-mono font-bold" />
                                    <button onClick={handleCnpjVerification} className="bg-slate-100 px-3 rounded-lg"><SearchIcon className="w-4 h-4" /></button>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Razão Social</label>
                                <input type="text" value={empresa.nome} onChange={e => setEmpresa(prev => ({...prev, nome: e.target.value}))} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border rounded-lg font-bold" />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2 border-b pb-2"><CalculatorIcon className="w-5 h-5 text-sky-600" /> Movimentação</h3>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Regime</label>
                                <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
                                    <button onClick={() => setRegimeSelecionado('Presumido')} className={`flex-1 py-1 text-xs font-bold rounded-md ${regimeSelecionado === 'Presumido' ? 'bg-white shadow text-sky-700' : 'text-slate-500'}`}>Presumido</button>
                                    <button onClick={() => setRegimeSelecionado('Real')} className={`flex-1 py-1 text-xs font-bold rounded-md ${regimeSelecionado === 'Real' ? 'bg-white shadow text-purple-700' : 'text-slate-500'}`}>Real</button>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Competência</label>
                                <input type="month" value={mesReferencia} onChange={e => setMesReferencia(e.target.value)} className="w-full px-3 py-1.5 bg-white dark:bg-slate-700 border rounded-lg font-bold text-xs" />
                            </div>
                        </div>
                        <div className="space-y-4">
                            <CurrencyInput label="Faturamento Comércio" value={financeiro.faturamentoMesComercio} onChange={v => setFinanceiro(p => ({...p, faturamentoMesComercio: v}))} />
                            <CurrencyInput label="Faturamento Serviços" value={financeiro.faturamentoMesServico} onChange={v => setFinanceiro(p => ({...p, faturamentoMesServico: v}))} />
                            <CurrencyInput label="Monofásicos (Exclusão PIS/COF)" value={financeiro.faturamentoMonofasico} onChange={v => setFinanceiro(p => ({...p, faturamentoMonofasico: v}))} className="bg-green-50/20 p-2 rounded border border-green-100" />
                            <div className="grid grid-cols-2 gap-4">
                                <CurrencyInput label="CMV" value={financeiro.cmv} onChange={v => setFinanceiro(p => ({...p, cmv: v}))} />
                                <CurrencyInput label="Folha" value={financeiro.folha} onChange={v => setFinanceiro(p => ({...p, folha: v}))} />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold flex items-center gap-2"><PlusIcon className="w-5 h-5 text-sky-600" /> Itens Extra-Operacionais</h3>
                            <button onClick={() => setIsItemModalOpen(true)} className="text-xs bg-sky-600 text-white px-3 py-1.5 rounded-lg hover:bg-sky-700 font-bold">+ Adicionar</button>
                        </div>
                        <div className="space-y-2">
                            {itensAvulsos.length === 0 ? <p className="text-center text-slate-400 text-xs py-4 italic">Nenhum item adicionado.</p> : itensAvulsos.map(item => (
                                <div key={item.id} className={`p-2 rounded-lg border flex justify-between items-center ${item.tipo === 'receita' ? 'bg-green-50/30 border-green-100' : 'bg-red-50/30 border-red-100'}`}>
                                    <div>
                                        <p className="text-xs font-bold">{item.descricao}</p>
                                        <p className="text-[10px] text-slate-500 uppercase">{item.categoriaEspecial}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-mono font-bold">R$ {item.valor.toLocaleString('pt-BR', {minimumFractionDigits:2})}</p>
                                        <button onClick={() => setItensAvulsos(prev => prev.filter(i => i.id !== item.id))} className="text-red-400 hover:text-red-600"><TrashIcon className="w-4 h-4" /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2 border-b pb-2"><InfoIcon className="w-5 h-5 text-sky-600" /> Resultado da Apuração</h3>
                        <div className="space-y-3">
                            {resultadoCalculado.detalhamento.map((det, idx) => (
                                <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="text-sm font-bold">{det.imposto}</p>
                                            <p className="text-[10px] text-slate-500">Base: R$ {det.baseCalculo.toLocaleString('pt-BR')} ({det.aliquota.toFixed(2)}%)</p>
                                        </div>
                                        <p className="text-lg font-mono font-bold text-sky-900">R$ {det.valor.toLocaleString('pt-BR', {minimumFractionDigits:2})}</p>
                                    </div>
                                    {det.cotaInfo && det.cotaInfo.disponivel && (
                                        <div className="mt-2 pt-2 border-t border-dashed flex justify-between items-center text-[10px] text-sky-600 font-bold uppercase">
                                            <span>Opção de Cotas: {det.cotaInfo.numeroCotas}x</span>
                                            <span>R$ {det.cotaInfo.valorPrimeiraCota.toLocaleString('pt-BR')} cada</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                            <div className="p-4 bg-sky-600 text-white rounded-xl shadow-lg flex justify-between items-center">
                                <span className="font-bold uppercase text-xs">Total de Impostos</span>
                                <span className="text-2xl font-black">R$ {resultadoCalculado.totalImpostos.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button onClick={handleSaveCalculo} disabled={isSaving} className="flex-1 bg-teal-600 text-white py-3 rounded-xl font-bold flex justify-center items-center gap-2"><SaveIcon className="w-5 h-5" /> Salvar</button>
                            <button onClick={handleExportPDF} disabled={isExporting} className="flex-1 bg-sky-600 text-white py-3 rounded-xl font-bold flex justify-center items-center gap-2"><DownloadIcon className="w-5 h-5" /> PDF</button>
                        </div>
                    </div>
                </div>
            </div>

            {/* MODAL ITENS AVULSOS */}
            {isItemModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6 animate-pop-in">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold">Adicionar Item Financeiro</h3>
                            <button onClick={() => setIsItemModalOpen(false)}><CloseIcon className="w-6 h-6 text-slate-400" /></button>
                        </div>
                        <div className="space-y-4">
                            <div className="flex bg-slate-100 p-1 rounded-lg">
                                <button onClick={() => setEditingItem({...editingItem, tipo: 'receita'})} className={`flex-1 py-1.5 text-xs font-bold rounded ${editingItem?.tipo === 'receita' ? 'bg-white text-green-600' : 'text-slate-500'}`}>Receita</button>
                                <button onClick={() => setEditingItem({...editingItem, tipo: 'despesa'})} className={`flex-1 py-1.5 text-xs font-bold rounded ${editingItem?.tipo === 'despesa' ? 'bg-white text-red-600' : 'text-slate-500'}`}>Despesa</button>
                            </div>
                            <input type="text" placeholder="Descrição" value={editingItem?.descricao || ''} onChange={e => setEditingItem({...editingItem, descricao: e.target.value})} className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-sm" />
                            <CurrencyInput label="Valor" value={editingItem?.valor || 0} onChange={v => setEditingItem({...editingItem, valor: v})} />
                            <select value={editingItem?.categoriaEspecial || 'padrao'} onChange={e => setEditingItem({...editingItem, categoriaEspecial: e.target.value as any})} className="w-full p-3 bg-slate-50 border rounded-xl font-bold text-sm">
                                <option value="padrao">Geral</option>
                                <option value="aplicacao_financeira">Aplicação Financeira</option>
                                <option value="importacao">Importação</option>
                            </select>
                            <button onClick={() => { if(editingItem?.descricao) { setItensAvulsos(prev => [...prev, { ...editingItem as ItemFinanceiroAvulso, id: Date.now().toString() }]); setIsItemModalOpen(false); setEditingItem(null); } }} className="w-full bg-sky-600 text-white py-3 rounded-xl font-bold shadow-lg hover:bg-sky-700 transition-colors">Confirmar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* TEMPLATE OCULTO PARA PDF - EXTRATO COMPLETO */}
            <div id="extrato-lucro-completo" className="fixed left-[-9999px] top-0 w-[1000px] bg-white text-slate-900 p-12 font-sans">
                <div className="flex justify-between items-start border-b-4 border-sky-800 pb-8 mb-10">
                    <div className="flex items-center gap-5">
                        <Logo className="h-20 w-auto text-sky-800" />
                        <div>
                            <h1 className="text-3xl font-black text-sky-800 uppercase tracking-tighter">Extrato Detalhado de Apuração</h1>
                            <p className="text-sm font-bold text-slate-500 tracking-wider">SP ASSESSORIA CONTÁBIL - DOCUMENTO GERENCIAL</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] font-black text-slate-400 uppercase">Regime e Competência</p>
                        <p className="text-xl font-black text-sky-700">Lucro {regimeSelecionado} - {new Date(mesReferencia + '-02').toLocaleDateString('pt-BR', {month:'long', year:'numeric'})}</p>
                        <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-widest">Emissão: {new Date().toLocaleString('pt-BR')}</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-8 mb-10">
                    <div className="p-6 bg-slate-50 rounded-3xl border-2 border-slate-100 shadow-sm">
                        <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Contribuinte / Razão Social</p>
                        <p className="text-xl font-bold text-slate-800 leading-tight">{empresa.nome}</p>
                        <p className="text-md font-mono text-slate-600 mt-1">{empresa.cnpj}</p>
                        <p className="text-[11px] text-slate-400 mt-4 leading-relaxed italic">{empresa.endereco}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-sky-50 rounded-2xl border border-sky-100 text-center flex flex-col justify-center">
                            <p className="text-[10px] font-black text-sky-600 uppercase mb-1">Carga Tributária Efetiva</p>
                            <p className="text-3xl font-black text-sky-900">{resultadoCalculado?.cargaTributaria.toFixed(2)}%</p>
                        </div>
                        <div className="p-4 bg-green-50 rounded-2xl border border-green-100 text-center flex flex-col justify-center">
                            <p className="text-[10px] font-black text-green-600 uppercase mb-1">Lucro Líquido Estimado</p>
                            <p className="text-2xl font-black text-green-900">R$ {resultadoCalculado?.lucroLiquidoEstimado.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
                        </div>
                    </div>
                </div>

                <div className="mb-10">
                    <h3 className="text-sm font-black text-slate-800 uppercase mb-4 flex items-center gap-2 border-l-8 border-sky-600 pl-4">1. Memória de Receitas e Custos</h3>
                    <div className="grid grid-cols-2 gap-8">
                        <div className="border-2 border-slate-100 rounded-3xl overflow-hidden">
                            <div className="bg-slate-50 px-6 py-3 border-b text-[11px] font-black text-slate-600 uppercase">Receitas Brutas</div>
                            <div className="p-6 space-y-3">
                                <div className="flex justify-between text-sm"><span>Comércio:</span><span className="font-bold">R$ {financeiro.faturamentoMesComercio.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span></div>
                                <div className="flex justify-between text-sm"><span>Serviços:</span><span className="font-bold">R$ {financeiro.faturamentoMesServico.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span></div>
                                <div className="flex justify-between text-sm text-orange-600 font-bold border-t pt-2"><span>(-) Monofásicos:</span><span>R$ {financeiro.faturamentoMonofasico.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span></div>
                            </div>
                        </div>
                        <div className="border-2 border-slate-100 rounded-3xl overflow-hidden">
                            <div className="bg-slate-50 px-6 py-3 border-b text-[11px] font-black text-slate-600 uppercase">Custos Informados</div>
                            <div className="p-6 space-y-3">
                                <div className="flex justify-between text-sm"><span>CMV:</span><span className="font-bold">R$ {financeiro.cmv.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span></div>
                                <div className="flex justify-between text-sm"><span>Folha de Salários:</span><span className="font-bold">R$ {financeiro.folha.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span></div>
                                <div className="flex justify-between text-sm text-purple-700 font-bold border-t pt-2"><span>Operacional Geral:</span><span>R$ {financeiro.despesas.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span></div>
                            </div>
                        </div>
                    </div>
                </div>

                {itensAvulsos.length > 0 && (
                    <div className="mb-10">
                        <h3 className="text-sm font-black text-slate-800 uppercase mb-4 flex items-center gap-2 border-l-8 border-amber-500 pl-4">2. Quadro de Itens Extra-Operacionais</h3>
                        <div className="border-2 border-slate-100 rounded-3xl overflow-hidden">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 text-slate-500 font-black uppercase text-[10px]">
                                    <tr><th className="px-6 py-4">Tipo</th><th className="px-6 py-4">Descrição</th><th className="px-6 py-4 text-center">Categoria</th><th className="px-6 py-4 text-right">Valor</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {itensAvulsos.map((item, idx) => (
                                        <tr key={idx}>
                                            <td className="px-6 py-4 uppercase font-bold text-[9px]">{item.tipo}</td>
                                            <td className="px-6 py-4 font-bold">{item.descricao}</td>
                                            <td className="px-6 py-4 text-center text-[10px]">{item.categoriaEspecial}</td>
                                            <td className="px-6 py-4 text-right font-mono font-black">R$ {item.valor.toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                <div className="mb-10">
                    <h3 className="text-sm font-black text-slate-800 uppercase mb-4 flex items-center gap-2 border-l-8 border-sky-800 pl-4">3. Quadro de Apuração Tributária Final</h3>
                    <div className="border-4 border-sky-800 rounded-[2.5rem] overflow-hidden shadow-2xl">
                        <table className="w-full text-left text-md">
                            <thead className="bg-sky-800 text-white font-black uppercase text-xs">
                                <tr><th className="px-10 py-6">Imposto</th><th className="px-10 py-6 text-right">Base de Cálculo</th><th className="px-10 py-6 text-center">Alíquota</th><th className="px-10 py-6 text-right">Valor Líquido</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {resultadoCalculado?.detalhamento.map((item, idx) => (
                                    <tr key={idx}>
                                        <td className="px-10 py-5 font-black">{item.imposto}</td>
                                        <td className="px-10 py-5 text-right font-mono text-slate-600">R$ {item.baseCalculo.toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
                                        <td className="px-10 py-5 text-center font-black">{item.aliquota.toFixed(2)}%</td>
                                        <td className="px-10 py-5 text-right font-mono font-black text-sky-900">R$ {item.valor.toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
                                    </tr>
                                ))}
                                <tr className="bg-sky-50">
                                    <td colSpan={3} className="px-10 py-8 text-right font-black text-sky-900 uppercase text-xl">Total a Recolher:</td>
                                    <td className="px-10 py-8 text-right font-mono font-black text-sky-900 text-3xl">R$ {resultadoCalculado?.totalImpostos.toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {resultadoCalculado.detalhamento.some(d => d.cotaInfo?.disponivel) && (
                    <div className="mb-10 p-8 border-2 border-dashed border-sky-300 rounded-[2rem] bg-sky-50/20">
                        <h3 className="text-sm font-black text-sky-800 uppercase mb-4 flex items-center gap-2">OPÇÃO DE PARCELAMENTO EM COTAS (IRPJ/CSLL)</h3>
                        <div className="grid grid-cols-3 gap-6">
                            {resultadoCalculado.detalhamento.filter(d => d.cotaInfo?.disponivel).map((d, idx) => (
                                <div key={idx} className="bg-white p-4 rounded-2xl border border-sky-100 shadow-sm">
                                    <p className="text-[10px] font-black text-slate-400 uppercase mb-1">{d.imposto}</p>
                                    <p className="text-lg font-black text-sky-900">{d.cotaInfo?.numeroCotas}x de R$ {d.cotaInfo?.valorPrimeiraCota.toLocaleString('pt-BR', {minimumFractionDigits:2})}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="bg-slate-900 text-white p-8 rounded-[2rem] flex justify-between items-center">
                    <div>
                        <p className="text-[11px] font-black text-sky-400 uppercase mb-2">SP Assessoria Contábil</p>
                        <p className="text-sm text-slate-400">Software de Gestão Tributária • Uso Interno e Planejamento</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[11px] font-bold text-slate-500 uppercase mb-1">Código de Controle</p>
                        <p className="text-md font-mono font-bold">LRP-{Date.now().toString(36).toUpperCase()}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LucroPresumidoRealDashboard;
