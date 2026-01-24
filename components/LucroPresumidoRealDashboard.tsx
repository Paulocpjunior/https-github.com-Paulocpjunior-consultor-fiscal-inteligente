
import React, { useState, useEffect, useMemo } from 'react';
import { LucroPresumidoEmpresa, User, FichaFinanceiraRegistro, SearchType, LucroInput, LucroResult, IssConfig, ItemFinanceiroAvulso, CategoriaItemEspecial } from '../types';
import * as lucroService from '../services/lucroPresumidoService';
import { calcularLucro } from '../services/lucroService';
import { fetchCnpjFromBrasilAPI } from '../services/externalApiService';
import { CalculatorIcon, BuildingIcon, SearchIcon, DownloadIcon, DocumentTextIcon, PlusIcon, TrashIcon, EyeIcon, ArrowLeftIcon, SaveIcon, ShieldIcon, InfoIcon, UserIcon, AnimatedCheckIcon, CloseIcon, PencilIcon, BriefcaseIcon, SparkleStarIcon } from './Icons';
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
                {!disabled && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">R$</span>}
                <input 
                    type="text" 
                    value={formatted} 
                    onChange={handleChange} 
                    disabled={disabled}
                    className={`w-full ${!disabled ? 'pl-9' : 'pl-3'} pr-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none text-slate-900 font-bold dark:text-white dark:font-mono dark:font-normal disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-500 text-right transition-all`}
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
    const [editingItem, setEditingItem] = useState<Partial<ItemFinanceiroAvulso>>({
        descricao: '',
        valor: 0,
        tipo: 'receita',
        categoriaEspecial: 'padrao',
        dedutivelIrpj: true,
        geraCreditoPisCofins: false
    });

    // Estado local para gerenciar visualização de cotas (não persiste, apenas UI)
    const [quotasSelected, setQuotasSelected] = useState<Record<string, boolean>>({});

    const [issConfig, setIssConfig] = useState<IssConfig>({
        tipo: 'aliquota_municipal', aliquota: 5, qtdeSocios: 1, valorPorSocio: 0
    });

    const [financeiro, setFinanceiro] = useState({
        acumuladoAno: 0, 
        faturamentoMesComercio: 0, 
        faturamentoMesIndustria: 0, 
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

    const isMasterAdmin = useMemo(() => {
        return currentUser?.role === 'admin' || currentUser?.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase();
    }, [currentUser]);

    const resultadoCalculado = useMemo(() => {
        const input: LucroInput = {
            regimeSelecionado, periodoApuracao,
            mesReferencia, // Necessário para checagem do ano (LC 224/2025)
            faturamentoComercio: financeiro.faturamentoMesComercio,
            faturamentoIndustria: financeiro.faturamentoMesIndustria,
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
            itensAvulsos,
            acumuladoAno: financeiro.acumuladoAno // Necessário para checagem do limite de R$ 5M
        };
        return calcularLucro(input);
    }, [financeiro, regimeSelecionado, periodoApuracao, issConfig, isEquiparacaoHospitalar, itensAvulsos, mesReferencia]);

    useEffect(() => {
        if (currentUser) lucroService.getEmpresas(currentUser).then(setCompanies);
    }, [currentUser]);

    // Handle company selection and loading PREFERENCES
    const handleSelectCompany = (c: LucroPresumidoEmpresa) => {
        setSelectedEmpresaId(c.id);
        setEmpresa(c);
        setView('form');
        
        // Load Saved Configuration
        if (c.regimePadrao) setRegimeSelecionado(c.regimePadrao);
        if (c.issPadraoConfig) setIssConfig(c.issPadraoConfig);
        if (c.isEquiparacaoHospitalar !== undefined) setIsEquiparacaoHospitalar(c.isEquiparacaoHospitalar);
        
        // Load Default Retentions if available
        if (c.retencoesPadrao) {
            setFinanceiro(prev => ({
                ...prev,
                retencaoPis: c.retencoesPadrao?.pis || 0,
                retencaoCofins: c.retencoesPadrao?.cofins || 0,
                retencaoIrpj: c.retencoesPadrao?.irpj || 0,
                retencaoCsll: c.retencoesPadrao?.csll || 0
            }));
        } else {
            // Reset to 0 if not saved
            setFinanceiro(prev => ({
                ...prev,
                retencaoPis: 0, retencaoCofins: 0, retencaoIrpj: 0, retencaoCsll: 0
            }));
        }

        // Load Activity Types
        if (c.tiposAtividade) setTiposAtividade(c.tiposAtividade);
    };

    useEffect(() => {
        if (selectedEmpresaId && empresa.fichaFinanceira) {
            const registro = empresa.fichaFinanceira.find(f => f.mesReferencia === mesReferencia);
            if (registro) {
                setFinanceiro({
                    acumuladoAno: registro.acumuladoAno,
                    faturamentoMesComercio: registro.faturamentoMesComercio,
                    faturamentoMesIndustria: registro.faturamentoMesIndustria || 0,
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
            // Collect current inputs as default settings for the company profile
            const retencoesPadrao = {
                pis: financeiro.retencaoPis,
                cofins: financeiro.retencaoCofins,
                irpj: financeiro.retencaoIrpj,
                csll: financeiro.retencaoCsll
            };

            const empresaData = { 
                ...empresa, 
                tiposAtividade, 
                regimePadrao: regimeSelecionado, 
                issPadraoConfig: issConfig, 
                isEquiparacaoHospitalar,
                retencoesPadrao // Save default retentions
            } as Omit<LucroPresumidoEmpresa, 'id' | 'fichaFinanceira'>;
            
            let saved;
            if (selectedEmpresaId) saved = await lucroService.updateEmpresa(selectedEmpresaId, empresaData);
            else saved = await lucroService.saveEmpresa(empresaData, currentUser.id);
            
            if (saved) {
                setEmpresa(saved);
                const updatedList = await lucroService.getEmpresas(currentUser);
                setCompanies(updatedList);
                setSaveSuccess('Perfil da empresa atualizado com sucesso!');
                setTimeout(() => setSaveSuccess(''), 3000);
            }
        } finally { setIsSaving(false); }
    };

    const handleSaveCalculo = async () => {
        if (!selectedEmpresaId) return;
        setIsSaving(true);
        const registro: FichaFinanceiraRegistro = {
            id: Date.now().toString(),
            dataRegistro: Date.now(),
            mesReferencia,
            regime: regimeSelecionado,
            periodoApuracao,
            acumuladoAno: financeiro.acumuladoAno,
            faturamentoMesComercio: financeiro.faturamentoMesComercio,
            faturamentoMesIndustria: financeiro.faturamentoMesIndustria,
            faturamentoMesServico: financeiro.faturamentoMesServico,
            faturamentoMonofasico: financeiro.faturamentoMonofasico,
            faturamentoMesTotal: financeiro.faturamentoMesComercio + financeiro.faturamentoMesIndustria + financeiro.faturamentoMesServico,
            totalGeral: financeiro.acumuladoAno + financeiro.faturamentoMesComercio + financeiro.faturamentoMesIndustria + financeiro.faturamentoMesServico,
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
            cargaTributaria: resultadoCalculado.cargaTributaria,
            aplicouLc224: resultadoCalculado.alertaLc224
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

    const openAddItemModal = () => {
        setEditingItem({
            descricao: '',
            valor: 0,
            tipo: 'receita',
            categoriaEspecial: 'padrao',
            dedutivelIrpj: true,
            geraCreditoPisCofins: false
        });
        setIsItemModalOpen(true);
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
                            <tr>
                                <th className="px-6 py-3">Empresa</th>
                                {isMasterAdmin && <th className="px-6 py-3">Usuário</th>}
                                <th className="px-6 py-3">CNPJ</th>
                                <th className="px-6 py-3 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {companies.map(c => (
                                <tr key={c.id} className="border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                    <td className="px-6 py-4 font-bold">{c.nome}</td>
                                    {isMasterAdmin && (
                                        <td className="px-6 py-4">
                                            <span className="text-xs font-mono bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">
                                                {c.createdByEmail || 'Desconhecido'}
                                            </span>
                                        </td>
                                    )}
                                    <td className="px-6 py-4 font-mono">{c.cnpj}</td>
                                    <td className="px-6 py-4 text-center flex justify-center gap-3">
                                        <button onClick={() => handleSelectCompany(c)} className="text-sky-600 hover:text-sky-800 transition-colors"><EyeIcon className="w-5 h-5" /></button>
                                        {isMasterAdmin && <button onClick={async () => { if(window.confirm('Excluir?')) { await lucroService.deleteEmpresa(c.id); setCompanies(prev => prev.filter(e => e.id !== c.id)); } }} className="text-red-500 hover:text-red-700 transition-colors"><TrashIcon className="w-5 h-5" /></button>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    // Calcula total de retenções para exibir no PDF
    const totalRetencoes = financeiro.retencaoPis + financeiro.retencaoCofins + financeiro.retencaoIrpj + financeiro.retencaoCsll;

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div className="flex items-center gap-4">
                <button onClick={() => setView('list')} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-all"><ArrowLeftIcon className="w-5 h-5" /></button>
                <h2 className="text-2xl font-bold">{selectedEmpresaId ? 'Editar Apuração' : 'Nova Empresa'}</h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                    {/* Cadastro */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                        <div className="flex justify-between items-center mb-4 pb-2 border-b">
                            <h3 className="text-lg font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100"><BuildingIcon className="w-5 h-5 text-sky-600" /> Cadastro</h3>
                            <button onClick={handleSaveEmpresa} disabled={isSaving} className="text-sm bg-green-600 text-white font-bold px-3 py-1 rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-1 transition-colors">
                                {isSaving ? <LoadingSpinner small /> : <SaveIcon className="w-4 h-4" />} Salvar
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase">CNPJ</label>
                                <div className="flex gap-2">
                                    <input type="text" value={empresa.cnpj} onChange={e => setEmpresa(prev => ({...prev, cnpj: e.target.value}))} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg font-mono font-bold focus:ring-2 focus:ring-sky-500 outline-none" />
                                    <button onClick={handleCnpjVerification} className="bg-slate-100 dark:bg-slate-600 px-3 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-500 transition-colors"><SearchIcon className="w-4 h-4" /></button>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Razão Social</label>
                                <input type="text" value={empresa.nome} onChange={e => setEmpresa(prev => ({...prev, nome: e.target.value}))} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg font-bold focus:ring-2 focus:ring-sky-500 outline-none" />
                            </div>
                        </div>
                    </div>

                    {/* Configuração de ISS */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                         <h3 className="text-lg font-bold mb-4 flex items-center gap-2 border-b pb-2 text-slate-800 dark:text-slate-100"><CalculatorIcon className="w-5 h-5 text-sky-600" /> Configuração de ISS</h3>
                         <div className="space-y-4">
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <input 
                                        type="radio" 
                                        checked={issConfig.tipo === 'aliquota_municipal'} 
                                        onChange={() => setIssConfig(prev => ({ ...prev, tipo: 'aliquota_municipal' }))}
                                        className="text-sky-600 w-4 h-4"
                                    />
                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 group-hover:text-sky-600 transition-colors">Alíquota Municipal (%)</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <input 
                                        type="radio" 
                                        checked={issConfig.tipo === 'sup_fixo'} 
                                        onChange={() => setIssConfig(prev => ({ ...prev, tipo: 'sup_fixo' }))}
                                        className="text-sky-600 w-4 h-4"
                                    />
                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 group-hover:text-sky-600 transition-colors">ISS Fixo (SUP)</span>
                                </label>
                            </div>

                            {issConfig.tipo === 'aliquota_municipal' ? (
                                <div className="animate-fade-in">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase">Alíquota do ISS (%)</label>
                                    <input 
                                        type="number" 
                                        step="0.01"
                                        value={issConfig.aliquota || ''} 
                                        onChange={e => setIssConfig(prev => ({ ...prev, aliquota: parseFloat(e.target.value) }))}
                                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg font-bold focus:ring-2 focus:ring-sky-500 outline-none"
                                        placeholder="Ex: 5"
                                    />
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-4 animate-fade-in">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Quantidade de Sócios</label>
                                        <input 
                                            type="number" 
                                            value={issConfig.qtdeSocios || ''} 
                                            onChange={e => setIssConfig(prev => ({ ...prev, qtdeSocios: parseInt(e.target.value) }))}
                                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg font-bold focus:ring-2 focus:ring-sky-500 outline-none"
                                            placeholder="Ex: 2"
                                        />
                                    </div>
                                    <CurrencyInput 
                                        label="Valor Fixo por Sócio" 
                                        value={issConfig.valorPorSocio || 0} 
                                        onChange={v => setIssConfig(prev => ({ ...prev, valorPorSocio: v }))} 
                                    />
                                </div>
                            )}
                         </div>
                    </div>

                    {/* Movimentação Financeira */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2 border-b pb-2 text-slate-800 dark:text-slate-100"><CalculatorIcon className="w-5 h-5 text-sky-600" /> Movimentação Financeira</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Regime</label>
                                <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
                                    <button onClick={() => setRegimeSelecionado('Presumido')} className={`flex-1 py-1 text-xs font-bold rounded-md transition-all ${regimeSelecionado === 'Presumido' ? 'bg-white shadow text-sky-700' : 'text-slate-500'}`}>Presumido</button>
                                    <button onClick={() => setRegimeSelecionado('Real')} className={`flex-1 py-1 text-xs font-bold rounded-md transition-all ${regimeSelecionado === 'Real' ? 'bg-white shadow text-purple-700' : 'text-slate-500'}`}>Real</button>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Período de Apuração</label>
                                <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
                                    <button onClick={() => setPeriodoApuracao('Mensal')} className={`flex-1 py-1 text-xs font-bold rounded-md transition-all ${periodoApuracao === 'Mensal' ? 'bg-sky-500 text-white shadow' : 'text-slate-500'}`}>Mensal</button>
                                    <button onClick={() => setPeriodoApuracao('Trimestral')} className={`flex-1 py-1 text-xs font-bold rounded-md transition-all ${periodoApuracao === 'Trimestral' ? 'bg-indigo-600 text-white shadow' : 'text-slate-500'}`}>Trimestral</button>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Competência</label>
                                <input type="month" value={mesReferencia} onChange={e => setMesReferencia(e.target.value)} className="w-full px-3 py-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg font-bold text-xs focus:ring-2 focus:ring-sky-500 outline-none" />
                            </div>
                        </div>
                        <div className="mb-4">
                            <CurrencyInput 
                                label="Receita Bruta Acumulada no Ano (Anterior)" 
                                value={financeiro.acumuladoAno} 
                                onChange={v => setFinanceiro(p => ({...p, acumuladoAno: v}))}
                                tooltip="Soma do faturamento desde o início do ano até o mês anterior. Usado para limites da LC 224/2025."
                                className="bg-slate-50/50 p-2 rounded border border-slate-100" 
                            />
                        </div>
                        <div className="space-y-4">
                            <CurrencyInput label="Faturamento Comércio" value={financeiro.faturamentoMesComercio} onChange={v => setFinanceiro(p => ({...p, faturamentoMesComercio: v}))} />
                            <CurrencyInput label="Faturamento Indústria" value={financeiro.faturamentoMesIndustria} onChange={v => setFinanceiro(p => ({...p, faturamentoMesIndustria: v}))} />
                            <CurrencyInput label="Faturamento Serviços" value={financeiro.faturamentoMesServico} onChange={v => setFinanceiro(p => ({...p, faturamentoMesServico: v}))} />
                            <CurrencyInput label="Monofásicos (Exclusão PIS/COF)" value={financeiro.faturamentoMonofasico} onChange={v => setFinanceiro(p => ({...p, faturamentoMonofasico: v}))} className="bg-green-50/20 dark:bg-green-900/10 p-2 rounded border border-green-100 dark:border-green-800" />
                            <div className="grid grid-cols-2 gap-4">
                                <CurrencyInput label="CMV" value={financeiro.cmv} onChange={v => setFinanceiro(p => ({...p, cmv: v}))} />
                                <CurrencyInput label="Folha de Salários" value={financeiro.folha} onChange={v => setFinanceiro(p => ({...p, folha: v}))} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <CurrencyInput label="Despesas Operacionais" value={financeiro.despesas} onChange={v => setFinanceiro(p => ({...p, despesas: v}))} />
                                <CurrencyInput label="Despesas Dedutíveis (Real)" value={financeiro.despesasDedutiveis} onChange={v => setFinanceiro(p => ({...p, despesasDedutiveis: v}))} />
                            </div>
                        </div>
                    </div>

                    {/* Retenções na Fonte */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2 border-b pb-2 text-slate-800 dark:text-slate-100"><ShieldIcon className="w-5 h-5 text-sky-600" /> Retenções na Fonte (Crédito)</h3>
                        <p className="text-xs text-slate-500 mb-2">Valores salvos no perfil da empresa serão carregados automaticamente.</p>
                        <div className="grid grid-cols-2 gap-4">
                            <CurrencyInput label="Retenção PIS" value={financeiro.retencaoPis} onChange={v => setFinanceiro(p => ({...p, retencaoPis: v}))} />
                            <CurrencyInput label="Retenção COFINS" value={financeiro.retencaoCofins} onChange={v => setFinanceiro(p => ({...p, retencaoCofins: v}))} />
                            <CurrencyInput label="Retenção IRPJ" value={financeiro.retencaoIrpj} onChange={v => setFinanceiro(p => ({...p, retencaoIrpj: v}))} />
                            <CurrencyInput label="Retenção CSLL" value={financeiro.retencaoCsll} onChange={v => setFinanceiro(p => ({...p, retencaoCsll: v}))} />
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    {/* Itens Extra-Operacionais */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100"><PlusIcon className="w-5 h-5 text-sky-600" /> Itens Adicionais (Ajustes)</h3>
                            <button onClick={openAddItemModal} className="text-xs bg-sky-600 text-white px-3 py-1.5 rounded-lg hover:bg-sky-700 font-bold transition-all shadow-sm flex items-center gap-1"><PlusIcon className="w-4 h-4" /> Adicionar</button>
                        </div>
                        <div className="space-y-2">
                            {itensAvulsos.length === 0 ? <p className="text-center text-slate-400 text-xs py-8 italic font-bold">Nenhum ajuste operacional lançado para este período.</p> : itensAvulsos.map(item => (
                                <div key={item.id} className={`p-3 rounded-lg border flex justify-between items-center transition-all ${item.tipo === 'receita' ? 'bg-green-50/40 border-green-100 dark:bg-green-900/10 dark:border-green-800' : 'bg-red-50/40 border-red-100 dark:bg-red-900/10 dark:border-red-800'}`}>
                                    <div className="flex-grow">
                                        <div className="flex items-center gap-2">
                                            <span className={`w-2 h-2 rounded-full ${item.tipo === 'receita' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{item.descricao}</p>
                                        </div>
                                        <div className="flex flex-wrap gap-2 items-center mt-1 ml-4">
                                            <span className="text-[9px] text-slate-500 dark:text-slate-400 font-black uppercase bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">{item.categoriaEspecial === 'padrao' ? 'Ajuste Geral' : item.categoriaEspecial}</span>
                                            {item.tipo === 'despesa' && item.dedutivelIrpj && <span className="text-[9px] bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300 px-1.5 py-0.5 rounded font-black border border-sky-200 dark:border-sky-700">DEDUTÍVEL IRPJ/CSLL</span>}
                                            {item.tipo === 'despesa' && item.geraCreditoPisCofins && <span className="text-[9px] bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300 px-1.5 py-0.5 rounded font-black border border-teal-200 dark:border-teal-700">CRÉDITO PIS/COFINS</span>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <p className="text-sm font-mono font-bold text-slate-900 dark:text-white">R$ {item.valor.toLocaleString('pt-BR', {minimumFractionDigits:2})}</p>
                                        <button onClick={() => setItensAvulsos(prev => prev.filter(i => i.id !== item.id))} className="text-slate-400 hover:text-red-500 transition-colors p-1"><TrashIcon className="w-4 h-4" /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Resultado da Apuração */}
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2 border-b pb-2 text-slate-800 dark:text-slate-100"><InfoIcon className="w-5 h-5 text-sky-600" /> Resultado da Apuração</h3>
                        
                        {/* ALERTA LC 224/2025 */}
                        {resultadoCalculado.alertaLc224 && (
                            <div className="mb-4 p-4 bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-500 rounded-r-lg animate-fade-in">
                                <div className="flex items-start gap-3">
                                    <ShieldIcon className="w-6 h-6 text-orange-600 dark:text-orange-400 flex-shrink-0" />
                                    <div>
                                        <h4 className="text-sm font-bold text-orange-800 dark:text-orange-200 uppercase">Atenção: Aumento de Carga Tributária (LC 224/2025)</h4>
                                        <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">
                                            Devido ao faturamento anual exceder R$ 5 milhões, foi aplicado um <strong>acréscimo de 10%</strong> nos percentuais de presunção do IRPJ e CSLL, conforme nova legislação vigente a partir de 2026.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-3">
                            {resultadoCalculado.detalhamento.map((det, idx) => (
                                <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm transition-all hover:border-sky-300">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="text-sm font-bold text-slate-800 dark:text-white uppercase">{det.imposto}</p>
                                            <p className="text-[10px] text-slate-500 uppercase font-bold mt-0.5">
                                                {det.imposto.includes('ISS-SUP') 
                                                    ? `Sócios: ${det.baseCalculo}`
                                                    : `Base: R$ ${det.baseCalculo.toLocaleString('pt-BR')} (${det.aliquota.toFixed(2)}%)`
                                                }
                                            </p>
                                        </div>
                                        <p className="text-lg font-mono font-bold text-sky-900 dark:text-sky-400">R$ {det.valor.toLocaleString('pt-BR', {minimumFractionDigits:2})}</p>
                                    </div>
                                    {det.observacao && <p className="text-[10px] text-slate-500 italic mt-1.5 border-t border-slate-200 dark:border-slate-700 pt-1 font-bold">{det.observacao}</p>}
                                    
                                    {/* Nova Lógica para Exibir Cotas */}
                                    {det.cotaInfo && det.cotaInfo.disponivel && (
                                        <div className="mt-2 pt-2 border-t border-dashed border-sky-200 dark:border-sky-800 flex flex-col gap-1">
                                            <label className="flex items-center gap-2 cursor-pointer group mt-1 bg-white dark:bg-slate-800 p-2 rounded border border-slate-100 dark:border-slate-700 hover:border-sky-300 transition-colors">
                                                <input 
                                                    type="checkbox" 
                                                    className="w-4 h-4 text-sky-600 rounded focus:ring-sky-500"
                                                    checked={!!quotasSelected[det.imposto]}
                                                    onChange={(e) => setQuotasSelected(prev => ({...prev, [det.imposto]: e.target.checked}))}
                                                />
                                                <span className="text-[10px] font-bold uppercase text-sky-700 dark:text-sky-400 flex items-center gap-1">
                                                    <CalculatorIcon className="w-3 h-3" /> Pagar em Cotas (3x)
                                                </span>
                                            </label>
                                            
                                            {quotasSelected[det.imposto] && (
                                                <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 animate-fade-in">
                                                    {det.cotaInfo.vencimentos?.map((venc, i) => {
                                                        const valorCota = i === 0 ? det.cotaInfo!.valorPrimeiraCota : det.cotaInfo!.valorDemaisCotas!;
                                                        // Juros simples apenas para visualização estimativa (não compõe o valor base do imposto)
                                                        const estimativaJuros = i === 0 ? 0 : (i === 1 ? valorCota * 0.01 : valorCota * 0.02); // 1% fixo para cota 2 e ~2% (Selic+1%) para cota 3 simplificado
                                                        
                                                        return (
                                                            <div key={i} className="bg-sky-50 dark:bg-sky-900/20 p-2 rounded border border-sky-100 dark:border-sky-800 text-center">
                                                                <p className="text-[9px] font-black text-slate-500 uppercase mb-1">{i + 1}ª Quota</p>
                                                                <p className="text-xs font-bold text-sky-800 dark:text-sky-400">R$ {valorCota.toLocaleString('pt-BR', {minimumFractionDigits:2})}</p>
                                                                {i > 0 && <p className="text-[8px] text-red-500 font-bold mt-0.5">+ Juros Selic</p>}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                            <div className="p-4 bg-sky-600 text-white rounded-xl shadow-lg flex justify-between items-center mt-4">
                                <span className="font-bold uppercase text-xs">Total de Impostos</span>
                                <span className="text-2xl font-black">R$ {resultadoCalculado.totalImpostos.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                            </div>
                        </div>
                        <div className="flex gap-3 mt-6">
                            <button onClick={handleSaveCalculo} disabled={isSaving} className="flex-1 bg-teal-600 text-white py-3 rounded-xl font-bold flex justify-center items-center gap-2 hover:bg-teal-700 transition-all shadow-md transform active:scale-95"><SaveIcon className="w-5 h-5" /> Salvar</button>
                            <button onClick={handleExportPDF} disabled={isExporting} className="flex-1 bg-sky-600 text-white py-3 rounded-xl font-bold flex justify-center items-center gap-2 hover:bg-sky-700 transition-all shadow-md transform active:scale-95"><DownloadIcon className="w-5 h-5" /> PDF</button>
                        </div>
                    </div>
                </div>
            </div>

            {/* MODAL ITENS AVULSOS */}
            {isItemModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-pop-in border border-white/20">
                        {/* ... (rest of the modal remains same) ... */}
                        <div className="bg-sky-600 p-6 flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                    <SparkleStarIcon size="w-6 h-6" className="text-white" />
                                    Lançamento de Ajuste Fiscal
                                </h3>
                                <p className="text-sky-100 text-xs mt-1">Insira receitas ou despesas adicionais para compor a apuração.</p>
                            </div>
                            <button onClick={() => setIsItemModalOpen(false)} className="text-white/80 hover:text-white transition-colors p-1 bg-white/10 rounded-full"><CloseIcon className="w-6 h-6" /></button>
                        </div>

                        <div className="p-6 space-y-6">
                            {/* ... (modal content) ... */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Natureza do Item</label>
                                <div className="flex bg-slate-100 dark:bg-slate-700 p-1.5 rounded-xl border border-slate-200 dark:border-slate-600">
                                    <button 
                                        onClick={() => setEditingItem(prev => ({...prev, tipo: 'receita', dedutivelIrpj: true}))} 
                                        className={`flex-1 py-2.5 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-2 ${editingItem.tipo === 'receita' ? 'bg-white dark:bg-slate-600 text-green-600 shadow-md ring-1 ring-green-100' : 'text-slate-500 hover:bg-white/50'}`}
                                    >
                                        <div className={`w-2 h-2 rounded-full ${editingItem.tipo === 'receita' ? 'bg-green-500' : 'bg-slate-400'}`}></div>
                                        RECEITA ADICIONAL
                                    </button>
                                    <button 
                                        onClick={() => setEditingItem(prev => ({...prev, tipo: 'despesa'}))} 
                                        className={`flex-1 py-2.5 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-2 ${editingItem.tipo === 'despesa' ? 'bg-white dark:bg-slate-600 text-red-600 shadow-md ring-1 ring-red-100' : 'text-slate-500 hover:bg-white/50'}`}
                                    >
                                        <div className={`w-2 h-2 rounded-full ${editingItem.tipo === 'despesa' ? 'bg-red-500' : 'bg-slate-400'}`}></div>
                                        DESPESA / DEDUÇÃO
                                    </button>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Descrição do Lançamento</label>
                                    <input 
                                        type="text" 
                                        placeholder="Ex: Venda de Ativo, Juros sobre Capital Próprio..." 
                                        value={editingItem.descricao || ''} 
                                        onChange={e => setEditingItem(prev => ({...prev, descricao: e.target.value}))} 
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-sky-500 transition-all" 
                                    />
                                </div>
                                
                                <CurrencyInput 
                                    label="Valor Financeiro" 
                                    value={editingItem.valor || 0} 
                                    onChange={v => setEditingItem(prev => ({...prev, valor: v}))} 
                                />

                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">Classificação Especial</label>
                                    <select 
                                        value={editingItem.categoriaEspecial || 'padrao'} 
                                        onChange={e => setEditingItem(prev => ({...prev, categoriaEspecial: e.target.value as any}))} 
                                        className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-sm outline-none cursor-pointer focus:ring-2 focus:ring-sky-500 transition-all appearance-none"
                                    >
                                        <option value="padrao">Ajuste Geral Operacional</option>
                                        <option value="aplicacao_financeira">Receita Financeira / Aplicação</option>
                                        <option value="importacao">Insumos de Importação</option>
                                    </select>
                                </div>
                            </div>

                            <div className="p-4 bg-slate-50 dark:bg-slate-900/80 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-4">
                                <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-700 pb-2 mb-2">
                                    <ShieldIcon className="w-4 h-4 text-sky-600" />
                                    <span className="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-tighter">Parâmetros de Lucro Real</span>
                                </div>

                                <div className="space-y-3">
                                    <label className={`flex items-start gap-3 cursor-pointer group p-2 rounded-xl transition-all ${editingItem.tipo === 'receita' ? 'opacity-50 pointer-events-none' : 'hover:bg-white dark:hover:bg-slate-800'}`}>
                                        <div className="relative mt-0.5">
                                            <input 
                                                type="checkbox" 
                                                checked={editingItem.dedutivelIrpj} 
                                                disabled={editingItem.tipo === 'receita'}
                                                onChange={() => setEditingItem(prev => ({...prev, dedutivelIrpj: !prev.dedutivelIrpj}))}
                                                className="w-5 h-5 rounded-lg border-slate-300 dark:border-slate-600 text-sky-600 focus:ring-sky-500"
                                            />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Item Dedutível (Abatimento)</span>
                                            <span className="text-[10px] text-slate-500 leading-tight">Se marcado, o valor será subtraído da base de cálculo do IRPJ e da CSLL (Regime Real).</span>
                                        </div>
                                    </label>
                                    
                                    <label className={`flex items-start gap-3 cursor-pointer group p-2 rounded-xl transition-all ${editingItem.tipo === 'receita' ? 'opacity-50 pointer-events-none' : 'hover:bg-white dark:hover:bg-slate-800'}`}>
                                        <div className="relative mt-0.5">
                                            <input 
                                                type="checkbox" 
                                                checked={editingItem.geraCreditoPisCofins} 
                                                disabled={editingItem.tipo === 'receita'}
                                                onChange={() => setEditingItem(prev => ({...prev, geraCreditoPisCofins: !prev.geraCreditoPisCofins}))}
                                                className="w-5 h-5 rounded-lg border-slate-300 dark:border-slate-600 text-sky-600 focus:ring-sky-500"
                                            />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Gera Crédito PIS/COFINS</span>
                                            <span className="text-[10px] text-slate-500 leading-tight">O valor compõe a base de créditos no regime não-cumulativo, reduzindo o PIS e COFINS a pagar.</span>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            <button 
                                onClick={() => { 
                                    if(editingItem.descricao && editingItem.valor && editingItem.valor > 0) { 
                                        setItensAvulsos(prev => [...prev, { ...editingItem as ItemFinanceiroAvulso, id: Date.now().toString() }]); 
                                        setIsItemModalOpen(false); 
                                    } else {
                                        alert("Por favor, preencha a descrição e um valor maior que zero.");
                                    }
                                }} 
                                className="w-full bg-sky-600 text-white py-4 rounded-2xl font-black shadow-xl hover:bg-sky-700 transition-all transform active:scale-95 flex justify-center items-center gap-3 group"
                            >
                                <div className="bg-white/20 p-1.5 rounded-lg group-hover:rotate-12 transition-transform">
                                    <AnimatedCheckIcon size="w-5 h-5" className="text-white" />
                                </div>
                                CONFIRMAR LANÇAMENTO
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* TEMPLATE PDF OCULTO */}
            <div id="extrato-lucro-completo" className="fixed left-[-9999px] top-0 w-[1000px] bg-white text-slate-900 p-12 font-sans">
                {/* ... (Existing PDF Template Code) ... */}
                {/* Header Principal */}
                <div className="flex justify-between items-start border-b-4 border-sky-800 pb-8 mb-10">
                    <div className="flex items-center gap-5">
                        <Logo className="h-24 w-auto text-sky-800" />
                        <div>
                            <h1 className="text-4xl font-black text-sky-800 uppercase tracking-tighter">Memória de Apuração Tributária</h1>
                            <p className="text-lg font-bold text-slate-500 tracking-wider uppercase">SP Assessoria Contábil • Auditoria e Planejamento</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-[11px] font-black text-slate-400 uppercase">Enquadramento Aplicado</p>
                        <p className="text-2xl font-black text-sky-700">LUCRO {regimeSelecionado.toUpperCase()}</p>
                        <p className="text-md font-bold text-slate-500 mt-1 uppercase bg-slate-100 px-3 py-1 rounded-full inline-block">
                            {new Date(mesReferencia + '-02').toLocaleDateString('pt-BR', {month:'long', year:'numeric'})}
                        </p>
                    </div>
                </div>

                {/* Alerta PDF LC 224/25 */}
                {resultadoCalculado.alertaLc224 && (
                    <div className="mb-8 p-6 bg-orange-50 border-l-8 border-orange-500 rounded-r-xl">
                        <h3 className="text-xl font-black text-orange-800 uppercase tracking-tight mb-2">Aviso Legal: Lei Complementar nº 224/2025</h3>
                        <p className="text-sm font-bold text-orange-900 leading-relaxed">
                            Informamos que, devido ao faturamento bruto anual da empresa exceder o limite de R$ 5.000.000,00, a partir do exercício de 2026, aplica-se obrigatoriamente um acréscimo de 10% (dez por cento) sobre os percentuais de presunção do Lucro Presumido para fins de cálculo do IRPJ e da CSLL. Os valores apresentados neste demonstrativo já contemplam essa majoração legal.
                        </p>
                    </div>
                )}

                {/* Bloco de Identificação */}
                <div className="grid grid-cols-3 gap-8 mb-12">
                    <div className="col-span-2 p-8 bg-slate-50 rounded-[2.5rem] border-2 border-slate-100 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-5">
                             <BuildingIcon className="w-24 h-24" />
                        </div>
                        <p className="text-[11px] font-black text-slate-400 uppercase mb-2">Empresa / Contribuinte</p>
                        <p className="text-2xl font-black text-slate-800 leading-tight mb-2">{empresa.nome}</p>
                        <p className="text-lg font-mono font-bold text-sky-800 bg-sky-50 px-3 py-1 rounded-lg inline-block border border-sky-100">{empresa.cnpj}</p>
                    </div>
                    <div className="p-8 bg-sky-600 rounded-[2.5rem] text-white text-center flex flex-col justify-center shadow-xl">
                        <p className="text-[11px] font-black text-sky-200 uppercase mb-1">Carga Tributária Efetiva</p>
                        <p className="text-5xl font-black">{resultadoCalculado?.cargaTributaria.toFixed(2)}%</p>
                        <p className="text-[11px] font-bold text-sky-100 mt-2">SOBRE FATURAMENTO BRUTO</p>
                    </div>
                </div>

                {/* Seção 1: Operações de Receita e Custo */}
                <div className="mb-12">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="bg-sky-800 text-white p-2 rounded-xl"><BriefcaseIcon className="w-6 h-6" /></div>
                        <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">1. Fluxo Operacional de Receitas e Custos</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-8">
                        <div className="bg-white border-2 border-slate-100 rounded-[2rem] p-8 shadow-sm">
                            <h4 className="text-xs font-black text-slate-400 uppercase mb-6 border-b pb-2">Receitas Operacionais Brutas</h4>
                            <div className="space-y-4">
                                <div className="flex justify-between text-sm font-bold"><span>Comércio:</span><span className="text-slate-800">R$ {financeiro.faturamentoMesComercio.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span></div>
                                <div className="flex justify-between text-sm font-bold"><span>Indústria:</span><span className="text-slate-800">R$ {financeiro.faturamentoMesIndustria.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span></div>
                                <div className="flex justify-between text-sm font-bold"><span>Prestação de Serviços:</span><span className="text-slate-800">R$ {financeiro.faturamentoMesServico.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span></div>
                                {itensAvulsos.filter(i => i.tipo === 'receita').length > 0 && (
                                    <div className="flex justify-between text-sm font-bold text-green-600">
                                        <span>(+) Outras Receitas:</span>
                                        <span>R$ {itensAvulsos.filter(i => i.tipo === 'receita').reduce((a, b) => a + b.valor, 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-xs text-red-500 font-bold border-t pt-4 italic"><span>(-) Exclusão Monofásicos PIS/COFINS:</span><span>R$ {financeiro.faturamentoMonofasico.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span></div>
                                <div className="flex justify-between text-lg text-sky-900 font-black border-t-2 border-sky-50 pt-4"><span>Base para Cálculo:</span><span>R$ {(financeiro.faturamentoMesComercio + financeiro.faturamentoMesIndustria + financeiro.faturamentoMesServico + itensAvulsos.filter(i => i.tipo === 'receita').reduce((a, b) => a + b.valor, 0) - financeiro.faturamentoMonofasico).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span></div>
                            </div>
                        </div>
                        <div className="bg-white border-2 border-slate-100 rounded-[2rem] p-8 shadow-sm">
                            <h4 className="text-xs font-black text-slate-400 uppercase mb-6 border-b pb-2">Custos e Gastos Informados</h4>
                            <div className="space-y-4">
                                <div className="flex justify-between text-sm font-bold text-slate-600"><span>Custo de Mercadoria (CMV):</span><span>R$ {financeiro.cmv.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span></div>
                                <div className="flex justify-between text-sm font-bold text-slate-600"><span>Folha e Encargos Sociais:</span><span>R$ {financeiro.folha.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span></div>
                                <div className="flex justify-between text-sm font-bold text-slate-600"><span>Despesas Operacionais:</span><span>R$ {financeiro.despesas.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span></div>
                                {itensAvulsos.filter(i => i.tipo === 'despesa').length > 0 && (
                                    <div className="flex justify-between text-sm font-bold text-slate-600">
                                        <span>(+) Outras Despesas:</span>
                                        <span>R$ {itensAvulsos.filter(i => i.tipo === 'despesa').reduce((a, b) => a + b.valor, 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-sm font-black text-sky-900 border-t pt-4"><span>Total Desembolsos:</span><span>R$ {(financeiro.cmv + financeiro.folha + financeiro.despesas + itensAvulsos.filter(i => i.tipo === 'despesa').reduce((a, b) => a + b.valor, 0)).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Seção 2: Itens Adicionais (Ajustes Digitados) */}
                {itensAvulsos.length > 0 && (
                    <div className="mb-12">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="bg-amber-600 text-white p-2 rounded-xl"><PlusIcon className="w-6 h-6" /></div>
                            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">2. Detalhamento de Itens Extra-Operacionais e Ajustes</h3>
                        </div>
                        <div className="border-4 border-amber-100 rounded-[2rem] overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-amber-50 text-amber-900 font-black text-[10px] uppercase">
                                    <tr>
                                        <th className="px-8 py-4">Descrição do Lançamento</th>
                                        <th className="px-8 py-4 text-center">Tipo</th>
                                        <th className="px-8 py-4 text-right">Valor Bruto</th>
                                        <th className="px-8 py-4">Aproveitamento Fiscal (Regime Real)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {itensAvulsos.map((item, idx) => (
                                        <tr key={idx} className="text-sm">
                                            <td className="px-8 py-4 font-bold text-slate-700">{item.descricao}</td>
                                            <td className="px-8 py-4 text-center">
                                                <span className={`text-[10px] font-black px-3 py-1 rounded-full ${item.tipo === 'receita' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                    {item.tipo.toUpperCase()}
                                                </span>
                                            </td>
                                            <td className="px-8 py-4 text-right font-mono font-bold">R$ {item.valor.toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
                                            <td className="px-8 py-4">
                                                <div className="flex flex-wrap gap-2">
                                                    {item.tipo === 'despesa' ? (
                                                        <>
                                                            {item.dedutivelIrpj ? <span className="bg-sky-50 text-sky-700 px-2 py-0.5 rounded text-[9px] font-black border border-sky-100">DEDUTÍVEL IRPJ</span> : <span className="text-slate-300 text-[9px] font-bold">NÃO DEDUTÍVEL</span>}
                                                            {item.geraCreditoPisCofins && <span className="bg-teal-50 text-teal-700 px-2 py-0.5 rounded text-[9px] font-black border border-teal-100">CRÉDITO PIS/COF</span>}
                                                        </>
                                                    ) : '-'}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Seção 2B: Retenções na Fonte */}
                {totalRetencoes > 0 && (
                    <div className="mb-12">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="bg-teal-700 text-white p-2 rounded-xl"><ShieldIcon className="w-6 h-6" /></div>
                            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">3. Deduções e Retenções na Fonte (Lei 10.833)</h3>
                        </div>
                        <div className="bg-teal-50/50 rounded-[2rem] border-2 border-teal-100 p-8 grid grid-cols-4 gap-4 shadow-sm">
                            <div className="text-center p-4 bg-white rounded-xl shadow-sm border border-teal-50">
                                <p className="text-[10px] font-black text-slate-400 uppercase">Retenção PIS</p>
                                <p className="text-lg font-mono font-bold text-teal-700">R$ {financeiro.retencaoPis.toLocaleString('pt-BR', {minimumFractionDigits:2})}</p>
                            </div>
                            <div className="text-center p-4 bg-white rounded-xl shadow-sm border border-teal-50">
                                <p className="text-[10px] font-black text-slate-400 uppercase">Retenção COFINS</p>
                                <p className="text-lg font-mono font-bold text-teal-700">R$ {financeiro.retencaoCofins.toLocaleString('pt-BR', {minimumFractionDigits:2})}</p>
                            </div>
                            <div className="text-center p-4 bg-white rounded-xl shadow-sm border border-teal-50">
                                <p className="text-[10px] font-black text-slate-400 uppercase">Retenção CSLL</p>
                                <p className="text-lg font-mono font-bold text-teal-700">R$ {financeiro.retencaoCsll.toLocaleString('pt-BR', {minimumFractionDigits:2})}</p>
                            </div>
                            <div className="text-center p-4 bg-white rounded-xl shadow-sm border border-teal-50">
                                <p className="text-[10px] font-black text-slate-400 uppercase">Retenção IRPJ</p>
                                <p className="text-lg font-mono font-bold text-teal-700">R$ {financeiro.retencaoIrpj.toLocaleString('pt-BR', {minimumFractionDigits:2})}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Seção 3: Quadro Tributário Final */}
                <div className="mb-12">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="bg-sky-900 text-white p-2 rounded-xl"><CalculatorIcon className="w-6 h-6" /></div>
                        <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">4. Quadro de Apuração Tributária Final</h3>
                    </div>
                    <div className="border-4 border-sky-900 rounded-[2.5rem] overflow-hidden shadow-2xl">
                        <table className="w-full text-left">
                            <thead className="bg-sky-900 text-white font-black uppercase text-[11px]">
                                <tr>
                                    <th className="px-10 py-6">Imposto / Base Legal</th>
                                    <th className="px-10 py-6 text-right">Base de Cálculo</th>
                                    <th className="px-10 py-6 text-center">Alíquota Efetiva</th>
                                    <th className="px-10 py-6 text-right">Valor Líquido a Pagar</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {resultadoCalculado?.detalhamento.map((item, idx) => (
                                    <React.Fragment key={idx}>
                                        <tr className="bg-white hover:bg-sky-50/50">
                                            <td className="px-10 py-6">
                                                <p className="font-black text-slate-900 text-sm uppercase">{item.imposto}</p>
                                                {item.observacao && <p className="text-[9px] text-slate-400 font-bold mt-1 leading-tight uppercase italic">{item.observacao}</p>}
                                                {quotasSelected[item.imposto] && (
                                                    <span className="inline-block mt-2 px-2 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-black rounded uppercase border border-amber-200">
                                                        OPÇÃO: PARCELADO EM COTAS
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-10 py-6 text-right font-mono font-bold text-slate-600">
                                                {item.imposto.includes('ISS-SUP') ? item.baseCalculo : `R$ ${item.baseCalculo.toLocaleString('pt-BR', {minimumFractionDigits:2})}`}
                                            </td>
                                            <td className="px-10 py-6 text-center font-black text-slate-700">
                                                {item.aliquota > 0 ? `${item.aliquota.toFixed(2)}%` : '-'}
                                            </td>
                                            <td className="px-10 py-6 text-right font-mono font-black text-sky-900 text-xl">
                                                R$ {item.valor.toLocaleString('pt-BR', {minimumFractionDigits:2})}
                                            </td>
                                        </tr>
                                        {/* Detalhamento de Cotas no PDF se Selecionado */}
                                        {quotasSelected[item.imposto] && item.cotaInfo && item.cotaInfo.disponivel && (
                                            <tr className="bg-amber-50/30">
                                                <td colSpan={4} className="px-10 py-4">
                                                    <div className="flex gap-4">
                                                        {item.cotaInfo.vencimentos?.map((venc, i) => {
                                                            const valorCota = i === 0 ? item.cotaInfo!.valorPrimeiraCota : item.cotaInfo!.valorDemaisCotas!;
                                                            return (
                                                                <div key={i} className="flex-1 bg-white border border-amber-200 p-3 rounded-lg text-center">
                                                                    <p className="text-[9px] font-black text-amber-800 uppercase mb-1">{venc}</p>
                                                                    <p className="text-sm font-mono font-bold text-slate-800">R$ {valorCota.toLocaleString('pt-BR', {minimumFractionDigits:2})}</p>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                                <tr className="bg-sky-50">
                                    <td colSpan={3} className="px-10 py-10 text-right font-black text-sky-900 uppercase text-2xl tracking-tighter">Total Geral de Tributos:</td>
                                    <td className="px-10 py-10 text-right font-mono font-black text-sky-900 text-4xl">R$ {resultadoCalculado?.totalImpostos.toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Rodapé Institucional */}
                <div className="bg-slate-900 text-white p-12 rounded-[3rem] flex justify-between items-center shadow-inner">
                    <div>
                        <Logo className="h-10 w-auto text-sky-400 mb-4" />
                        <p className="text-[11px] font-black text-sky-400 uppercase tracking-widest mb-1">SP Assessoria Contábil</p>
                        <p className="text-sm text-slate-400 font-medium">Software Gerencial de Inteligência Tributária • Emissão em {new Date().toLocaleString('pt-BR')}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[11px] font-bold text-slate-500 uppercase mb-2">Hash de Autenticação Interna</p>
                        <p className="text-lg font-mono font-bold text-sky-200">ERP-LRP-{Date.now().toString(36).toUpperCase()}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LucroPresumidoRealDashboard;
