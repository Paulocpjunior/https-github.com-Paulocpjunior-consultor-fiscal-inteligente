
import React, { useState, useEffect, useMemo } from 'react';
import { LucroPresumidoEmpresa, User, FichaFinanceiraRegistro, SearchType, LucroInput, LucroResult, IssConfig, ItemFinanceiroAvulso, CategoriaItemEspecial } from '../types';
import * as lucroService from '../services/lucroPresumidoService';
import { calcularLucro } from '../services/lucroService';
import { fetchCnpjFromBrasilAPI } from '../services/externalApiService';
import { CalculatorIcon, BuildingIcon, SearchIcon, DownloadIcon, DocumentTextIcon, PlusIcon, TrashIcon, EyeIcon, ArrowLeftIcon, SaveIcon, ShieldIcon, InfoIcon, UserIcon, AnimatedCheckIcon } from './Icons';
import LoadingSpinner from './LoadingSpinner';
import Tooltip from './Tooltip';
import SimpleChart from './SimpleChart';
import Logo from './Logo';

const MASTER_ADMIN_EMAIL = 'junior@spassessoriacontabil.com.br';

const CurrencyInput: React.FC<{ label: string; value: number; onChange: (val: number) => void; disabled?: boolean; tooltip?: string; className?: string }> = ({ label, value, onChange, disabled, tooltip, className }) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value.replace(/\D/g, '');
        const num = parseFloat(raw) / 100;
        onChange(isNaN(num) ? 0 : num);
    };

    const formatted = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(value);

    return (
        <div className={`flex flex-col ${className || ''}`}>
            <label className="text-xs font-bold text-slate-800 dark:text-slate-400 uppercase mb-1 flex items-center gap-1">
                {label}
                {tooltip && (
                    <Tooltip content={tooltip}>
                        <InfoIcon className="w-3 h-3 text-slate-400 cursor-help" />
                    </Tooltip>
                )}
            </label>
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
    // View State
    const [view, setView] = useState<'list' | 'form'>('list');
    const [companies, setCompanies] = useState<LucroPresumidoEmpresa[]>([]);
    const [selectedEmpresaId, setSelectedEmpresaId] = useState<string | null>(null);

    // Company Data State
    const [empresa, setEmpresa] = useState<Partial<LucroPresumidoEmpresa>>({
        nome: '', cnpj: '', nomeFantasia: '', cnaePrincipal: undefined, cnaesSecundarios: [], endereco: '', regimePadrao: 'Presumido'
    });
    
    const [tiposAtividade, setTiposAtividade] = useState({
        comercio: true, industria: false, servico: false
    });

    // Validation & UI State
    const [isCnpjLoading, setIsCnpjLoading] = useState(false);
    const [cnpjError, setCnpjError] = useState('');
    const [isExporting, setIsExporting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState('');

    // Financial Input State
    const [mesReferencia, setMesReferencia] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [regimeSelecionado, setRegimeSelecionado] = useState<'Presumido' | 'Real'>('Presumido');
    const [periodoApuracao, setPeriodoApuracao] = useState<'Mensal' | 'Trimestral'>('Mensal');
    
    // Configurações Especiais
    const [isEquiparacaoHospitalar, setIsEquiparacaoHospitalar] = useState(false);

    // Dynamic Fields (Receitas/Despesas Extras)
    const [itensAvulsos, setItensAvulsos] = useState<ItemFinanceiroAvulso[]>([]);

    // ISS Configuration
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
        // Retenções
        retencaoPis: 0,
        retencaoCofins: 0,
        retencaoIrpj: 0,
        retencaoCsll: 0
    });

    // Resultado Calculado em Tempo Real
    const [resultadoCalculado, setResultadoCalculado] = useState<LucroResult | null>(null);

    const isMasterAdmin = currentUser?.email === MASTER_ADMIN_EMAIL || currentUser?.role === 'admin';

    // Chart Data Preparation
    const chartData = useMemo(() => {
        if (!empresa.fichaFinanceira || empresa.fichaFinanceira.length === 0) return null;
        
        // Sort by date ASC
        const sorted = [...empresa.fichaFinanceira].sort((a, b) => a.mesReferencia.localeCompare(b.mesReferencia));
        const slice = sorted.slice(-12); // Last 12 months

        return {
            labels: slice.map(f => {
                const [y, m] = f.mesReferencia.split('-');
                return `${m}/${y}`;
            }),
            datasets: [
                {
                    label: 'Faturamento Total (R$)',
                    data: slice.map(f => f.totalGeral || (f.faturamentoMesComercio + f.faturamentoMesServico)),
                    borderColor: 'rgb(14, 165, 233)', // Sky 500
                    backgroundColor: 'rgba(14, 165, 233, 0.1)',
                    yAxisID: 'y',
                    fill: true,
                    tension: 0.3
                },
                {
                    label: 'Carga Tributária (%)',
                    data: slice.map(f => f.cargaTributaria || 0),
                    borderColor: 'rgb(239, 68, 68)', // Red 500
                    backgroundColor: 'rgb(239, 68, 68)',
                    yAxisID: 'y1',
                    type: 'line' as const,
                    borderWidth: 2,
                    pointRadius: 4
                }
            ]
        };
    }, [empresa.fichaFinanceira]);

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom' as const },
            tooltip: {
                callbacks: {
                    label: function(context: any) {
                        let label = context.dataset.label || '';
                        if (label) {
                            label += ': ';
                        }
                        if (context.parsed.y !== null) {
                            if (context.dataset.yAxisID === 'y1') {
                                label += context.parsed.y.toFixed(2) + '%';
                            } else {
                                label += new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(context.parsed.y);
                            }
                        }
                        return label;
                    }
                }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                position: 'left' as const,
                ticks: {
                    callback: (val: any) => val >= 1000 ? `${(val/1000).toFixed(0)}k` : val
                }
            },
            y1: {
                beginAtZero: true,
                position: 'right' as const,
                grid: { drawOnChartArea: false },
                ticks: { callback: (val: any) => `${val}%` }
            }
        }
    };

    useEffect(() => {
        if (currentUser) {
            lucroService.getEmpresas(currentUser).then(setCompanies);
        }
    }, [currentUser]);

    // Handle External Selection
    useEffect(() => {
        if (externalSelectedId && companies.length > 0) {
            const target = companies.find(c => c.id === externalSelectedId);
            if (target) {
                setSelectedEmpresaId(externalSelectedId);
                setEmpresa(target);
                if (target.tiposAtividade) setTiposAtividade(target.tiposAtividade);
                if (target.regimePadrao) setRegimeSelecionado(target.regimePadrao);
                if (target.issPadraoConfig) setIssConfig(target.issPadraoConfig);
                if (target.isEquiparacaoHospitalar) setIsEquiparacaoHospitalar(target.isEquiparacaoHospitalar);
                setView('form');
            }
        }
    }, [externalSelectedId, companies]);

    // Load financial data when month or company changes
    useEffect(() => {
        if (selectedEmpresaId && empresa.fichaFinanceira) {
            const registro = empresa.fichaFinanceira.find(f => f.mesReferencia === mesReferencia);
            if (registro) {
                // Lógica de migração para PIS/COFINS separados se houver registro antigo
                let pisValue = registro.retencaoPis || 0;
                let cofinsValue = registro.retencaoCofins || 0;
                
                if (registro.retencaoPisCofins && (!pisValue && !cofinsValue)) {
                    pisValue = registro.retencaoPisCofins * (0.65 / 3.65);
                    cofinsValue = registro.retencaoPisCofins * (3.00 / 3.65);
                }

                setFinanceiro({
                    acumuladoAno: registro.acumuladoAno,
                    faturamentoMesComercio: registro.faturamentoMesComercio,
                    faturamentoMesServico: registro.faturamentoMesServico,
                    faturamentoMonofasico: registro.faturamentoMonofasico || 0,
                    despesas: registro.despesas,
                    despesasDedutiveis: registro.despesasDedutiveis || 0,
                    folha: registro.folha,
                    cmv: registro.cmv,
                    retencaoPis: pisValue,
                    retencaoCofins: cofinsValue,
                    retencaoIrpj: registro.retencaoIrpj || 0,
                    retencaoCsll: registro.retencaoCsll || 0
                });
                
                // Carregar itens avulsos
                setItensAvulsos(registro.itensAvulsos || []);

                if (registro.regime) setRegimeSelecionado(registro.regime);
                if (registro.periodoApuracao) setPeriodoApuracao(registro.periodoApuracao);
                if (registro.isEquiparacaoHospitalar !== undefined) {
                    setIsEquiparacaoHospitalar(registro.isEquiparacaoHospitalar);
                } else {
                    setIsEquiparacaoHospitalar(!!empresa.isEquiparacaoHospitalar);
                }

                if (registro.issTipo) {
                    setIssConfig(prev => ({
                        ...prev,
                        tipo: registro.issTipo || 'aliquota_municipal',
                        aliquota: registro.issTipo === 'aliquota_municipal' ? (registro.issValorOuAliquota || 5) : prev.aliquota,
                        valorPorSocio: registro.issTipo === 'sup_fixo' ? (registro.issValorOuAliquota || 0) : prev.valorPorSocio
                    }));
                }
            } else {
                setFinanceiro({
                    acumuladoAno: 0, faturamentoMesComercio: 0, faturamentoMesServico: 0, faturamentoMonofasico: 0,
                    despesas: 0, despesasDedutiveis: 0, folha: 0, cmv: 0,
                    retencaoPis: 0, retencaoCofins: 0, retencaoIrpj: 0, retencaoCsll: 0
                });
                setItensAvulsos([]);
                setIsEquiparacaoHospitalar(!!empresa.isEquiparacaoHospitalar);
            }
        }
    }, [mesReferencia, selectedEmpresaId, empresa.fichaFinanceira, empresa.isEquiparacaoHospitalar]);

    // Calcular Resultado sempre que houver alteração
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

    const handleSelectEmpresa = (id: string) => {
        const target = companies.find(c => c.id === id);
        if (target) {
            setSelectedEmpresaId(id);
            setEmpresa(target);
            if (target.tiposAtividade) setTiposAtividade(target.tiposAtividade);
            if (target.regimePadrao) setRegimeSelecionado(target.regimePadrao);
            if (target.issPadraoConfig) setIssConfig(target.issPadraoConfig);
            if (target.isEquiparacaoHospitalar) setIsEquiparacaoHospitalar(target.isEquiparacaoHospitalar);
            setView('form');
        }
    };

    const handleNewEmpresa = () => {
        setSelectedEmpresaId(null);
        setEmpresa({ nome: '', cnpj: '', nomeFantasia: '', cnaePrincipal: undefined, cnaesSecundarios: [], endereco: '', regimePadrao: 'Presumido' });
        setTiposAtividade({ comercio: true, industria: false, servico: false });
        setFinanceiro({ 
            acumuladoAno: 0, faturamentoMesComercio: 0, faturamentoMesServico: 0, faturamentoMonofasico: 0, 
            despesas: 0, despesasDedutiveis: 0, folha: 0, cmv: 0,
            retencaoPis: 0, retencaoCofins: 0, retencaoIrpj: 0, retencaoCsll: 0
        });
        setItensAvulsos([]);
        setIssConfig({ tipo: 'aliquota_municipal', aliquota: 5, qtdeSocios: 1, valorPorSocio: 0 });
        setIsEquiparacaoHospitalar(false);
        setView('form');
    };

    const handleCnpjVerification = async () => {
        const cleanCnpj = (empresa.cnpj || '').replace(/\D/g, '');
        if (cleanCnpj.length !== 14) {
            setCnpjError('CNPJ inválido.');
            return;
        }
        setIsCnpjLoading(true);
        setCnpjError('');
        try {
            const data = await fetchCnpjFromBrasilAPI(cleanCnpj);
            let enderecoCompleto = `${data.logradouro || ''}, ${data.numero || ''}`;
            if (data.bairro) enderecoCompleto += ` - ${data.bairro}`;
            if (data.municipio) enderecoCompleto += ` - ${data.municipio}/${data.uf || ''}`;
            if (data.cep) enderecoCompleto += ` - CEP: ${data.cep}`;

            setEmpresa(prev => ({
                ...prev,
                nome: data.razaoSocial,
                nomeFantasia: data.nomeFantasia,
                cnaePrincipal: data.cnaePrincipal || undefined,
                cnaesSecundarios: data.cnaesSecundarios || [],
                endereco: enderecoCompleto
            }));
        } catch (e: any) {
            setCnpjError(e.message || 'Erro ao buscar CNPJ.');
        } finally {
            setIsCnpjLoading(false);
        }
    };

    const handleSaveEmpresa = async () => {
        if (!empresa.nome || !empresa.cnpj) {
            alert('Nome e CNPJ são obrigatórios.');
            return;
        }
        if (!currentUser) {
            alert("Sessão expirada. Faça login novamente.");
            return;
        }

        setIsSaving(true);
        const empresaData = {
            ...empresa,
            tiposAtividade,
            regimePadrao: regimeSelecionado,
            issPadraoConfig: issConfig,
            isEquiparacaoHospitalar
        } as Omit<LucroPresumidoEmpresa, 'id' | 'fichaFinanceira'>;

        try {
            let saved: LucroPresumidoEmpresa | null;
            if (selectedEmpresaId) {
                saved = await lucroService.updateEmpresa(selectedEmpresaId, empresaData);
            } else {
                saved = await lucroService.saveEmpresa(empresaData, currentUser.id);
                setSelectedEmpresaId(saved.id);
            }

            if (saved) {
                setEmpresa(saved);
                const updatedList = await lucroService.getEmpresas(currentUser);
                setCompanies(updatedList);
                setSaveSuccess('Empresa salva com sucesso na nuvem!');
                if (onAddToHistory) {
                    onAddToHistory({ queries: [saved.nome], type: SearchType.LUCRO_PRESUMIDO_REAL, mode: 'single', entityId: saved.id });
                }
                setTimeout(() => setSaveSuccess(''), 3000);
            }
        } catch (e: any) {
            alert(e.message || "Erro ao salvar empresa.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddItemAvulso = () => {
        setItensAvulsos(prev => [
            ...prev, 
            { id: Date.now().toString(), descricao: '', valor: 0, tipo: 'receita', dedutivelIrpj: false, geraCreditoPisCofins: false, categoriaEspecial: 'padrao' }
        ]);
    };

    const handleUpdateItemAvulso = (id: string, field: keyof ItemFinanceiroAvulso, value: any) => {
        setItensAvulsos(prev => prev.map(item => 
            item.id === id ? { ...item, [field]: value } : item
        ));
    };

    const handleRemoveItemAvulso = (id: string) => {
        setItensAvulsos(prev => prev.filter(item => item.id !== id));
    };

    const totalMesVigente = useMemo(() => {
        return financeiro.faturamentoMesComercio + financeiro.faturamentoMesServico;
    }, [financeiro]);

    const totalGeralCalculado = useMemo(() => {
        return financeiro.acumuladoAno + totalMesVigente;
    }, [financeiro.acumuladoAno, totalMesVigente]);

    const handleSaveCalculo = async () => {
        if (!selectedEmpresaId) {
            alert("Salve a empresa antes de salvar o cálculo.");
            return;
        }
        
        setIsSaving(true);
        
        const registro: FichaFinanceiraRegistro = {
            id: Date.now().toString(),
            dataRegistro: Date.now(),
            mesReferencia: mesReferencia,
            regime: regimeSelecionado,
            periodoApuracao: periodoApuracao,
            issTipo: issConfig.tipo,
            issValorOuAliquota: issConfig.tipo === 'aliquota_municipal' ? issConfig.aliquota : issConfig.valorPorSocio,
            acumuladoAno: financeiro.acumuladoAno,
            faturamentoMesComercio: financeiro.faturamentoMesComercio,
            faturamentoMesServico: financeiro.faturamentoMesServico,
            faturamentoMonofasico: financeiro.faturamentoMonofasico,
            faturamentoMesTotal: totalMesVigente,
            totalGeral: totalGeralCalculado,
            despesas: financeiro.despesas,
            despesasDedutiveis: financeiro.despesasDedutiveis,
            folha: financeiro.folha,
            cmv: financeiro.cmv,
            retencaoPis: financeiro.retencaoPis,
            retencaoCofins: financeiro.retencaoCofins,
            retencaoIrpj: financeiro.retencaoIrpj,
            retencaoCsll: financeiro.retencaoCsll,
            isEquiparacaoHospitalar: isEquiparacaoHospitalar,
            itensAvulsos: itensAvulsos,
            // Saving Analysis Data
            totalImpostos: resultadoCalculado?.totalImpostos,
            cargaTributaria: resultadoCalculado?.cargaTributaria
        };

        try {
            const updatedEmpresa = await lucroService.addFichaFinanceira(selectedEmpresaId, registro);
            
            if (updatedEmpresa) {
                setEmpresa(updatedEmpresa);
                setCompanies(prev => prev.map(c => c.id === updatedEmpresa.id ? updatedEmpresa : c));
                setSaveSuccess('Cálculo salvo no banco de dados!');
                
                if (onAddToHistory) {
                    onAddToHistory({ 
                        queries: [`Cálculo Lucro: ${updatedEmpresa.nome}`], 
                        type: SearchType.LUCRO_PRESUMIDO_REAL, 
                        mode: 'single', 
                        entityId: updatedEmpresa.id 
                    });
                }
                setTimeout(() => setSaveSuccess(''), 3000);
            }
        } catch (error: any) {
            console.error(error);
            alert("Erro ao salvar cálculo: " + error.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleExportPDF = async () => {
        if (!empresa.nome || !resultadoCalculado || !currentUser) return;
        setIsExporting(true);
        try {
            const { default: jsPDF } = await import('jspdf');
            const { default: html2canvas } = await import('html2canvas');

            const element = document.getElementById('extrato-lucro-completo');
            if (!element) throw new Error('Template de exportação não encontrado.');

            const canvas = await html2canvas(element, {
                scale: 2,
                backgroundColor: '#ffffff',
                logging: false,
                windowWidth: 1000
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

            const fileName = `extrato-lucro-${empresa.nome.replace(/\s+/g, '-')}-${mesReferencia}.pdf`;
            pdf.save(fileName);
        } catch (e) {
            console.error(e);
            alert("Erro ao gerar PDF.");
        } finally {
            setIsExporting(false);
        }
    };

    const toggleTipoAtividade = (type: 'comercio' | 'industria' | 'servico') => {
        setTiposAtividade(prev => ({ ...prev, [type]: !prev[type] }));
    };

    const handleDeleteEmpresa = async (id: string) => {
        if (window.confirm("Tem certeza que deseja excluir esta empresa? Esta ação não pode ser desfeita.")) {
            try {
                const success = await lucroService.deleteEmpresa(id);
                if (success) {
                    setCompanies(prev => prev.filter(c => c.id !== id));
                    if (selectedEmpresaId === id) {
                        setSelectedEmpresaId(null);
                        setView('list');
                    }
                }
            } catch (e: any) {
                console.error("Failed to delete company", e);
                alert("Erro ao excluir empresa.");
            }
        }
    };

    if (view === 'list') {
        return (
            <div className="space-y-6 animate-fade-in">
                <div className="flex justify-between items-center">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Lucro Presumido / Real</h2>
                            {isMasterAdmin && (
                                <span className="px-2 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400 text-xs font-bold rounded-full flex items-center gap-1">
                                    <ShieldIcon className="w-3 h-3" /> Admin View
                                </span>
                            )}
                        </div>
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-400 dark:font-normal">Gestão de cadastros e fichas financeiras.</p>
                    </div>
                    <button onClick={handleNewEmpresa} className="btn-press bg-sky-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-sky-700 font-bold">
                        <PlusIcon className="w-5 h-5" />
                        Nova Empresa
                    </button>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden">
                    <table className="w-full text-sm text-left text-slate-800 font-bold dark:text-slate-400 dark:font-normal">
                        <thead className="text-xs text-slate-900 font-bold dark:text-slate-300 uppercase bg-slate-100 dark:bg-slate-700">
                            <tr>
                                <th className="px-6 py-3">Empresa</th>
                                <th className="px-6 py-3">CNPJ</th>
                                <th className="px-6 py-3">Regime Padrão</th>
                                <th className="px-6 py-3 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {companies.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-slate-500 font-bold dark:text-slate-400 dark:font-normal">Nenhuma empresa cadastrada.</td>
                                </tr>
                            ) : (
                                companies.map(c => (
                                    <tr key={c.id} className="border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                        <td className="px-6 py-4 font-bold text-slate-900 dark:text-white dark:font-normal">{c.nome}</td>
                                        <td className="px-6 py-4 font-mono text-slate-900 dark:text-slate-300 font-bold dark:font-normal">{c.cnpj}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${c.regimePadrao === 'Real' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                                {c.regimePadrao || 'Presumido'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center flex justify-center gap-3">
                                            <button onClick={() => handleSelectEmpresa(c.id)} className="text-sky-600 hover:text-sky-800" title="Visualizar/Editar"><EyeIcon className="w-5 h-5" /></button>
                                            {isMasterAdmin && <button onClick={() => handleDeleteEmpresa(c.id)} className="text-red-500 hover:text-red-700" title="Excluir"><TrashIcon className="w-5 h-5" /></button>}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div className="flex items-center gap-4 mb-2">
                <button onClick={() => setView('list')} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500">
                    <ArrowLeftIcon className="w-5 h-5" />
                </button>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {selectedEmpresaId ? 'Editar Empresa e Apuração' : 'Nova Empresa'}
                </h2>
            </div>

            {/* Gráfico de Performance */}
            {chartData && (
                <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 animate-fade-in">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center gap-2">
                        <CalculatorIcon className="w-5 h-5 text-sky-600" />
                        Análise de Performance Tributária (12 Meses)
                    </h3>
                    <div className="h-64 w-full">
                        <SimpleChart type="bar" data={chartData} options={chartOptions} />
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Cadastro */}
                <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm h-fit">
                    <div className="flex justify-between items-center mb-4 border-b pb-2 border-slate-100 dark:border-slate-700">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
                            <BuildingIcon className="w-5 h-5 text-sky-600" /> Dados Cadastrais
                        </h3>
                        <button onClick={handleSaveEmpresa} disabled={isSaving} className="text-sm bg-green-600 text-white font-bold px-3 py-1 rounded hover:bg-green-700 flex items-center gap-1 disabled:opacity-50">
                            {isSaving ? <LoadingSpinner small /> : <SaveIcon className="w-4 h-4" />} Salvar
                        </button>
                    </div>
                    {saveSuccess && <p className="text-green-600 font-bold text-sm mb-2">{saveSuccess}</p>}
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-slate-800 dark:text-slate-500 uppercase mb-1">CNPJ</label>
                            <div className="flex gap-2">
                                <input type="text" value={empresa.cnpj} onChange={e => setEmpresa(prev => ({...prev, cnpj: e.target.value}))} className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm font-mono text-slate-900 font-bold dark:text-white dark:font-normal" placeholder="00.000.000/0000-00" />
                                <button onClick={handleCnpjVerification} disabled={isCnpjLoading} className="bg-slate-100 dark:bg-slate-700 px-3 rounded-lg hover:bg-slate-200">{isCnpjLoading ? <LoadingSpinner small /> : <SearchIcon className="w-4 h-4" />}</button>
                            </div>
                            {cnpjError && <p className="text-xs text-red-600 font-bold mt-1">{cnpjError}</p>}
                        </div>
                        <div><label className="text-xs font-bold text-slate-800 dark:text-slate-500 uppercase mb-1">Razão Social</label><input type="text" value={empresa.nome} onChange={e => setEmpresa(prev => ({...prev, nome: e.target.value}))} className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 font-bold dark:text-white dark:font-normal" /></div>
                        {empresa.cnaePrincipal && <div className="p-3 bg-sky-50 dark:bg-sky-900/20 rounded-lg border border-sky-100 dark:border-sky-800"><p className="text-xs font-bold text-sky-700 uppercase">Atividade Principal</p><p className="text-sm font-mono font-bold text-slate-900 dark:text-white">{empresa.cnaePrincipal.codigo}</p><p className="text-xs text-slate-800 font-bold dark:text-slate-300 dark:font-normal">{empresa.cnaePrincipal.descricao}</p></div>}
                        <div className="pt-4 border-t dark:border-slate-700">
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-500 uppercase mb-2">Tipos de Atividade</p>
                            <div className="flex flex-wrap gap-3">
                                {['comercio', 'industria', 'servico'].map(type => (
                                    <label key={type} className="flex items-center gap-2 text-sm cursor-pointer bg-slate-50 dark:bg-slate-700/50 px-3 py-1 rounded border border-slate-200 dark:border-slate-600">
                                        <input type="checkbox" checked={(tiposAtividade as any)[type]} onChange={() => toggleTipoAtividade(type as any)} className="text-sky-600 rounded" />
                                        <span className="capitalize font-bold text-slate-900 dark:text-white dark:font-normal">{type}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        
                        {/* Configuração de ISS */}
                        <div className="pt-4 border-t dark:border-slate-700">
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-500 uppercase mb-2">Configuração de ISS (Serviços)</p>
                            <div className="space-y-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-600">
                                <div className="flex gap-4 mb-2">
                                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                                        <input 
                                            type="radio" 
                                            name="issType" 
                                            checked={issConfig.tipo === 'aliquota_municipal'} 
                                            onChange={() => setIssConfig(prev => ({...prev, tipo: 'aliquota_municipal'}))} 
                                        /> Variável (Alíquota)
                                    </label>
                                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                                        <input 
                                            type="radio" 
                                            name="issType" 
                                            checked={issConfig.tipo === 'sup_fixo'} 
                                            onChange={() => setIssConfig(prev => ({...prev, tipo: 'sup_fixo'}))} 
                                        /> Fixo (ISS-SUP)
                                    </label>
                                </div>
                                {issConfig.tipo === 'aliquota_municipal' ? (
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold">Alíquota Municipal (%):</span>
                                        <input 
                                            type="number" 
                                            value={issConfig.aliquota} 
                                            onChange={(e) => setIssConfig(prev => ({...prev, aliquota: parseFloat(e.target.value)}))}
                                            className="w-20 p-1 text-sm border rounded"
                                        />
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <span className="text-xs font-bold block">Qtde Sócios</span>
                                            <input 
                                                type="number" 
                                                value={issConfig.qtdeSocios} 
                                                onChange={(e) => setIssConfig(prev => ({...prev, qtdeSocios: parseInt(e.target.value)}))}
                                                className="w-full p-1 text-sm border rounded"
                                            />
                                        </div>
                                        <div>
                                            <span className="text-xs font-bold block">Valor/Sócio (R$)</span>
                                            <input 
                                                type="number" 
                                                value={issConfig.valorPorSocio} 
                                                onChange={(e) => setIssConfig(prev => ({...prev, valorPorSocio: parseFloat(e.target.value)}))}
                                                className="w-full p-1 text-sm border rounded"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right: Ficha Financeira & Cálculo */}
                <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm h-fit">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-200 mb-4 border-b pb-2 border-slate-100 dark:border-slate-700 flex items-center gap-2">
                        <CalculatorIcon className="w-5 h-5 text-sky-600" /> Apuração de Impostos
                    </h3>

                    <div className="mb-4 space-y-3">
                        <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                            <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Regime Tributário</label>
                            <div className="flex gap-2">
                                <label className={`flex-1 flex items-center justify-center gap-2 p-2 rounded cursor-pointer border text-xs font-bold transition-all ${regimeSelecionado === 'Presumido' ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-white border-slate-300'}`}>
                                    <input type="radio" name="regime" value="Presumido" checked={regimeSelecionado === 'Presumido'} onChange={() => setRegimeSelecionado('Presumido')} className="hidden" />
                                    Presumido
                                </label>
                                <label className={`flex-1 flex items-center justify-center gap-2 p-2 rounded cursor-pointer border text-xs font-bold transition-all ${regimeSelecionado === 'Real' ? 'bg-purple-100 border-purple-300 text-purple-800' : 'bg-white border-slate-300'}`}>
                                    <input type="radio" name="regime" value="Real" checked={regimeSelecionado === 'Real'} onChange={() => setRegimeSelecionado('Real')} className="hidden" />
                                    Lucro Real
                                </label>
                            </div>
                        </div>
                        
                        <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700">
                            <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Período de Apuração (Fechamento)</label>
                            <div className="flex gap-2">
                                <label className={`flex-1 flex items-center justify-center gap-2 p-2 rounded cursor-pointer border text-xs font-bold transition-all ${periodoApuracao === 'Mensal' ? 'bg-sky-100 border-sky-300 text-sky-800' : 'bg-white border-slate-300'}`}>
                                    <input type="radio" name="periodo" value="Mensal" checked={periodoApuracao === 'Mensal'} onChange={() => setPeriodoApuracao('Mensal')} className="hidden" />
                                    Mensal
                                </label>
                                <label className={`flex-1 flex items-center justify-center gap-2 p-2 rounded cursor-pointer border text-xs font-bold transition-all ${periodoApuracao === 'Trimestral' ? 'bg-sky-100 border-sky-300 text-sky-800' : 'bg-white border-slate-300'}`}>
                                    <input type="radio" name="periodo" value="Trimestral" checked={periodoApuracao === 'Trimestral'} onChange={() => setPeriodoApuracao('Trimestral')} className="hidden" />
                                    Trimestral (Fechamento)
                                </label>
                            </div>
                        </div>
                    </div>

                    <div className="mb-4">
                        <label className="text-xs font-bold text-slate-800 dark:text-slate-500 uppercase mb-1">Competência Referência</label>
                        <input type="month" value={mesReferencia} onChange={e => setMesReferencia(e.target.value)} className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 font-bold dark:text-white dark:font-normal" />
                    </div>

                    <div className="space-y-4 p-4 bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-slate-100 dark:border-slate-700">
                        <p className="text-xs font-bold text-sky-600 mb-2 uppercase">Receitas e Benefícios</p>
                        
                        {(tiposAtividade.comercio || tiposAtividade.industria) && (
                            <CurrencyInput label={periodoApuracao === 'Trimestral' ? "Faturamento Comércio (Trimestre)" : "Faturamento Comércio (Mês)"} value={financeiro.faturamentoMesComercio} onChange={v => setFinanceiro(prev => ({ ...prev, faturamentoMesComercio: v }))} />
                        )}
                        {tiposAtividade.servico && (
                            <div>
                                <CurrencyInput label={periodoApuracao === 'Trimestral' ? "Faturamento Serviços (Trimestre)" : "Faturamento Serviços (Mês)"} value={financeiro.faturamentoMesServico} onChange={v => setFinanceiro(prev => ({ ...prev, faturamentoMesServico: v }))} />
                                <div className="mt-2 flex items-center gap-2 p-2 bg-sky-50 dark:bg-sky-900/20 rounded border border-sky-100 dark:border-sky-800">
                                    <input 
                                        type="checkbox" 
                                        id="checkHospitalar"
                                        checked={isEquiparacaoHospitalar} 
                                        onChange={(e) => setIsEquiparacaoHospitalar(e.target.checked)} 
                                        className="rounded text-sky-600 focus:ring-sky-500 w-4 h-4"
                                    />
                                    <label htmlFor="checkHospitalar" className="text-xs font-bold text-sky-700 dark:text-sky-300 cursor-pointer flex-1">
                                        Regime Equiparação Hospitalar
                                        <span className="block text-[10px] font-normal text-sky-600 dark:text-sky-400">Reduz base IRPJ para 8% e CSLL para 12%.</span>
                                    </label>
                                </div>
                            </div>
                        )}
                        
                        <CurrencyInput 
                            label="Receita Monofásica (Isenta PIS/COFINS)" 
                            tooltip="Valor da receita de produtos com tributação monofásica (ex: bebidas frias, autopeças). Este valor será deduzido da base de cálculo de PIS/COFINS."
                            value={financeiro.faturamentoMonofasico} 
                            onChange={v => setFinanceiro(prev => ({ ...prev, faturamentoMonofasico: v }))} 
                            className="bg-green-50/50 p-2 rounded border border-green-100"
                        />

                        <div className="border-t border-slate-200 dark:border-slate-600 my-2 pt-2"></div>
                        <p className="text-xs font-bold text-red-600 dark:text-red-400 mb-2 uppercase">Retenções na Fonte (Créditos)</p>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <CurrencyInput label="Retenção PIS" value={financeiro.retencaoPis} onChange={v => setFinanceiro(prev => ({ ...prev, retencaoPis: v }))}/>
                            <CurrencyInput label="Retenção COFINS" value={financeiro.retencaoCofins} onChange={v => setFinanceiro(prev => ({ ...prev, retencaoCofins: v }))}/>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <CurrencyInput label="Retenção IRPJ" value={financeiro.retencaoIrpj} onChange={v => setFinanceiro(prev => ({ ...prev, retencaoIrpj: v }))}/>
                            <CurrencyInput label="Retenção CSLL" value={financeiro.retencaoCsll} onChange={v => setFinanceiro(prev => ({ ...prev, retencaoCsll: v }))}/>
                        </div>

                        <div className="border-t border-slate-200 dark:border-slate-600 my-2 pt-2"></div>
                        <p className="text-xs font-bold text-sky-600 mb-2 uppercase">Custos e Despesas</p>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <CurrencyInput label="Despesas Operacionais" value={financeiro.despesas} onChange={v => setFinanceiro(prev => ({ ...prev, despesas: v }))} />
                            <CurrencyInput label="Folha de Pagamento" value={financeiro.folha} onChange={v => setFinanceiro(prev => ({ ...prev, folha: v }))} />
                        </div>
                        
                        <CurrencyInput 
                            label={regimeSelecionado === 'Real' ? "Despesas Dedutíveis (Abate IRPJ/CSLL)" : "Despesas Dedutíveis / Créditos"} 
                            tooltip={regimeSelecionado === 'Real' ? "No Lucro Real, estas despesas reduzem diretamente a base de cálculo do IRPJ e CSLL." : "Informativo."}
                            value={financeiro.despesasDedutiveis} 
                            onChange={v => setFinanceiro(prev => ({ ...prev, despesasDedutiveis: v }))} 
                            className="bg-purple-50/50 p-2 rounded border border-purple-100"
                        />
                        
                        {(tiposAtividade.comercio || tiposAtividade.industria) && (
                             <CurrencyInput label="CMV (Custo Mercadoria)" value={financeiro.cmv} onChange={v => setFinanceiro(prev => ({ ...prev, cmv: v }))} />
                        )}
                        
                        <div className="border-t border-slate-200 dark:border-slate-600 my-4 pt-2"></div>
                        <div className="flex justify-between items-center mb-2">
                            <p className="text-xs font-bold text-slate-500 uppercase">Outras Receitas e Despesas</p>
                            <button 
                                onClick={handleAddItemAvulso} 
                                className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded hover:bg-slate-200 flex items-center gap-1 font-bold text-sky-600"
                            >
                                <PlusIcon className="w-3 h-3" /> Adicionar Item
                            </button>
                        </div>
                        
                        {itensAvulsos.map((item) => (
                            <div key={item.id} className="flex flex-col gap-2 mb-2 bg-slate-50 dark:bg-slate-900/30 p-2 rounded border border-slate-100 dark:border-slate-700">
                                <div className="flex gap-2 items-center">
                                    <select 
                                        value={item.tipo} 
                                        onChange={(e) => handleUpdateItemAvulso(item.id, 'tipo', e.target.value)}
                                        className="text-[10px] p-1 rounded border dark:bg-slate-700 dark:border-slate-600 font-bold"
                                    >
                                        <option value="receita">Receita (+)</option>
                                        <option value="despesa">Despesa (-)</option>
                                    </select>
                                    <input 
                                        type="text" 
                                        placeholder="Descrição" 
                                        value={item.descricao} 
                                        onChange={(e) => handleUpdateItemAvulso(item.id, 'descricao', e.target.value)}
                                        className="flex-grow text-xs p-1 rounded border dark:bg-slate-700 dark:border-slate-600"
                                    />
                                    <input 
                                        type="text" 
                                        placeholder="R$ 0,00" 
                                        value={new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(item.valor)} 
                                        onChange={(e) => {
                                            const raw = e.target.value.replace(/\D/g, '');
                                            handleUpdateItemAvulso(item.id, 'valor', parseFloat(raw)/100);
                                        }}
                                        className="w-24 text-xs p-1 rounded border text-right font-mono dark:bg-slate-700 dark:border-slate-600"
                                    />
                                    <button onClick={() => handleRemoveItemAvulso(item.id)} className="text-red-400 hover:text-red-600">
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </div>
                                
                                <div className="flex flex-wrap gap-2 items-center px-1">
                                    <select 
                                        value={item.categoriaEspecial || 'padrao'}
                                        onChange={(e) => handleUpdateItemAvulso(item.id, 'categoriaEspecial', e.target.value)}
                                        className="text-[9px] p-0.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-sky-700 dark:text-sky-400 font-bold uppercase"
                                    >
                                        <option value="padrao">Padrão</option>
                                        {item.tipo === 'receita' && <option value="aplicacao_financeira">Aplicação Financeira (PIS 0.65% / COF 4%)</option>}
                                        {item.tipo === 'despesa' && <option value="importacao">Importação (PIS 2.1% / COF 9.65%)</option>}
                                    </select>

                                    {item.tipo === 'despesa' && regimeSelecionado === 'Real' && (
                                        <div className="flex gap-3">
                                            <label className="flex items-center gap-1 text-[10px] text-slate-600 dark:text-slate-400 font-bold cursor-pointer">
                                                <input 
                                                    type="checkbox" 
                                                    checked={!!item.dedutivelIrpj} 
                                                    onChange={(e) => handleUpdateItemAvulso(item.id, 'dedutivelIrpj', e.target.checked)}
                                                    className="rounded text-purple-600 focus:ring-purple-500 w-3 h-3"
                                                />
                                                Dedutível (IRPJ)
                                            </label>
                                            {item.categoriaEspecial === 'padrao' && (
                                                <label className="flex items-center gap-1 text-[10px] text-slate-600 dark:text-slate-400 font-bold cursor-pointer">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={!!item.geraCreditoPisCofins} 
                                                        onChange={(e) => handleUpdateItemAvulso(item.id, 'geraCreditoPisCofins', e.target.checked)}
                                                        className="rounded text-green-600 focus:ring-green-500 w-3 h-3"
                                                    />
                                                    Crédito PIS/COFINS
                                                </label>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {resultadoCalculado && (
                        <div className="mt-6 border-t border-slate-200 dark:border-slate-700 pt-4">
                            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-3 flex justify-between">
                                Resumo de Impostos
                                <span className="text-sky-600">{resultadoCalculado.regime} - {resultadoCalculado.periodo}</span>
                            </h4>
                            <div className="overflow-x-auto bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-500 uppercase font-bold">
                                        <tr>
                                            <th className="px-3 py-2">Tributo</th>
                                            <th className="px-3 py-2 text-right">Base Calc.</th>
                                            <th className="px-3 py-2 text-center">Aliq.</th>
                                            <th className="px-3 py-2 text-right">Valor</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                        {resultadoCalculado.detalhamento.map((item, idx) => (
                                            <React.Fragment key={idx}>
                                                <tr>
                                                    <td className="px-3 py-2 font-medium">
                                                        {item.imposto}
                                                        {item.observacao && <span className="block text-[9px] text-slate-400 italic">{item.observacao}</span>}
                                                    </td>
                                                    <td className="px-3 py-2 text-right">{new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(item.baseCalculo)}</td>
                                                    <td className="px-3 py-2 text-center">{item.aliquota.toFixed(2)}%</td>
                                                    <td className="px-3 py-2 text-right font-bold text-slate-800 dark:text-slate-200">{new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(item.valor)}</td>
                                                </tr>
                                                {item.cotaInfo && item.cotaInfo.disponivel && (
                                                    <tr className="bg-sky-50 dark:bg-sky-900/10">
                                                        <td colSpan={4} className="px-3 py-1 text-[10px] text-sky-700 italic text-right">
                                                            Opção Parcelamento: 3 Cotas de {new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(item.cotaInfo.valorPrimeiraCota)}
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        ))}
                                        <tr className="bg-slate-50 dark:bg-slate-800 font-bold">
                                            <td colSpan={3} className="px-3 py-2 text-right uppercase">Total a Pagar:</td>
                                            <td className="px-3 py-2 text-right text-sky-700 dark:text-sky-400 text-sm">
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(resultadoCalculado.totalImpostos)}
                                            </td>
                                        </tr>
                                        <tr className="bg-green-50 dark:bg-green-900/20 font-bold border-t border-green-100 dark:border-green-800">
                                            <td colSpan={3} className="px-3 py-2 text-right uppercase text-green-700 dark:text-green-400">Lucro Líquido (Est.):</td>
                                            <td className="px-3 py-2 text-right text-green-700 dark:text-green-400 text-sm">
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(resultadoCalculado.lucroLiquidoEstimado)}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-3 mt-6">
                        <button onClick={handleSaveCalculo} disabled={isSaving} className="flex-1 bg-teal-600 text-white py-2 rounded-lg font-bold hover:bg-teal-700 transition-colors flex justify-center items-center gap-2 disabled:opacity-50">
                            {isSaving ? <LoadingSpinner small /> : <SaveIcon className="w-4 h-4" />} Salvar Apuração
                        </button>
                        <button onClick={handleExportPDF} disabled={isExporting} className="flex-1 bg-sky-600 text-white py-2 rounded-lg font-bold hover:bg-sky-700 transition-colors flex justify-center items-center gap-2 disabled:opacity-50">
                            <DownloadIcon className="w-4 h-4" /> Extrato PDF
                        </button>
                    </div>
                </div>
            </div>

            {/* TEMPLATE OCULTO PARA EXPORTAÇÃO PDF - TOTALMENTE ATUALIZADO COM MEMÓRIA DE CÁLCULO */}
            <div id="extrato-lucro-completo" className="fixed left-[-9999px] top-0 w-[950px] bg-white text-slate-900 p-10 font-sans">
                {/* CABEÇALHO */}
                <div className="flex justify-between items-start border-b-2 border-sky-800 pb-6 mb-8">
                    <div className="flex items-center gap-4">
                        <Logo className="h-16 w-auto text-sky-800" />
                        <div>
                            <h1 className="text-3xl font-extrabold text-sky-800 uppercase tracking-tight">Extrato Detalhado de Apuração</h1>
                            <p className="text-sm font-bold text-slate-500 tracking-widest">SP ASSESSORIA CONTÁBIL</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="mb-2">
                            <p className="text-xs font-bold text-slate-400 uppercase">Regime Tributário</p>
                            <p className="text-lg font-bold text-sky-700">Lucro {regimeSelecionado}</p>
                        </div>
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase">Emissão do Relatório</p>
                            <p className="text-sm font-bold text-slate-700">{new Date().toLocaleString('pt-BR')}</p>
                        </div>
                    </div>
                </div>

                {/* DADOS EMPRESA E COMPETÊNCIA */}
                <div className="grid grid-cols-2 gap-6 mb-8">
                    <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200">
                        <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Dados da Empresa</p>
                        <p className="text-xl font-bold text-slate-800 leading-tight">{empresa.nome}</p>
                        <p className="text-sm font-mono text-slate-600 mt-1">{empresa.cnpj}</p>
                        <p className="text-[11px] text-slate-500 mt-3 italic line-clamp-2">{empresa.endereco}</p>
                    </div>
                    <div className="p-5 bg-sky-50 rounded-2xl border border-sky-100 flex flex-col justify-center">
                        <p className="text-[10px] font-black text-sky-600 uppercase mb-2">Período de Referência</p>
                        <p className="text-2xl font-black text-sky-900 capitalize">
                            {new Date(mesReferencia + '-02').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                        </p>
                        <div className="flex gap-4 mt-2">
                             <span className="text-[11px] font-bold bg-sky-100 text-sky-700 px-2 py-0.5 rounded">Fechamento {periodoApuracao}</span>
                             {isEquiparacaoHospitalar && <span className="text-[11px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded">Equiparação Hospitalar</span>}
                        </div>
                    </div>
                </div>

                {/* MEMÓRIA DE CÁLCULO - ENTRADAS FINANCEIRAS */}
                <div className="mb-8">
                    <h3 className="text-sm font-black text-slate-800 uppercase mb-4 flex items-center gap-2 border-l-4 border-sky-600 pl-3">
                        1. Base de Cálculo e Insumos (Memória de Cálculo)
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                        {/* Coluna 1: Receitas e Faturamentos */}
                        <div className="border border-slate-100 rounded-xl overflow-hidden shadow-sm">
                            <p className="bg-slate-50 px-4 py-2 text-[10px] font-bold text-slate-600 uppercase border-b">Receitas Brutas</p>
                            <div className="p-4 space-y-2">
                                <div className="flex justify-between text-xs font-medium"><span className="text-slate-500">Faturamento Comércio:</span><span className="font-bold">R$ {financeiro.faturamentoMesComercio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                                <div className="flex justify-between text-xs font-medium"><span className="text-slate-500">Faturamento Serviços:</span><span className="font-bold">R$ {financeiro.faturamentoMesServico.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                                <div className="flex justify-between text-xs font-medium border-t pt-1 mt-1 text-sky-700 uppercase font-bold"><span className="text-[9px]">Total Bruto do Período:</span><span>R$ {totalMesVigente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                                <div className="flex justify-between text-xs font-medium text-orange-600"><span className="text-[10px]">(-) Dedução Monofásico:</span><span className="font-bold">R$ {financeiro.faturamentoMonofasico.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                            </div>
                        </div>
                        {/* Coluna 2: Custos e Despesas */}
                        <div className="border border-slate-100 rounded-xl overflow-hidden shadow-sm">
                            <p className="bg-slate-50 px-4 py-2 text-[10px] font-bold text-slate-600 uppercase border-b">Custos e Operacional</p>
                            <div className="p-4 space-y-2">
                                <div className="flex justify-between text-xs font-medium"><span className="text-slate-500">CMV (Mercadorias):</span><span className="font-bold">R$ {financeiro.cmv.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                                <div className="flex justify-between text-xs font-medium"><span className="text-slate-500">Folha de Pagamento:</span><span className="font-bold">R$ {financeiro.folha.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                                <div className="flex justify-between text-xs font-medium"><span className="text-slate-500">Despesas Operacionais:</span><span className="font-bold">R$ {financeiro.despesas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                                <div className="flex justify-between text-xs font-medium text-purple-600 bg-purple-50/50 px-1 rounded"><span className="text-[9px]">Despesas Dedutíveis/Crédito:</span><span className="font-bold">R$ {financeiro.despesasDedutiveis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* RETENÇÕES E CRÉDITOS NA FONTE */}
                <div className="mb-8">
                    <h3 className="text-sm font-black text-slate-800 uppercase mb-4 flex items-center gap-2 border-l-4 border-red-500 pl-3">
                        2. Retenções na Fonte e Créditos de Insumo
                    </h3>
                    <div className="grid grid-cols-4 gap-4">
                        <div className="p-3 border border-slate-100 rounded-xl">
                            <p className="text-[9px] font-bold text-slate-400 uppercase">PIS Retido</p>
                            <p className="text-sm font-bold text-slate-800">R$ {financeiro.retencaoPis.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div className="p-3 border border-slate-100 rounded-xl">
                            <p className="text-[9px] font-bold text-slate-400 uppercase">COFINS Retido</p>
                            <p className="text-sm font-bold text-slate-800">R$ {financeiro.retencaoCofins.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div className="p-3 border border-slate-100 rounded-xl">
                            <p className="text-[9px] font-bold text-slate-400 uppercase">IRPJ Retido</p>
                            <p className="text-sm font-bold text-slate-800">R$ {financeiro.retencaoIrpj.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <div className="p-3 border border-slate-100 rounded-xl">
                            <p className="text-[9px] font-bold text-slate-400 uppercase">CSLL Retido</p>
                            <p className="text-sm font-bold text-slate-800">R$ {financeiro.retencaoCsll.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                    </div>
                </div>

                {/* OUTRAS RECEITAS E DESPESAS (LISTAGEM ITEM A ITEM) */}
                {itensAvulsos.length > 0 && (
                    <div className="mb-8">
                        <h3 className="text-sm font-black text-slate-800 uppercase mb-4 flex items-center gap-2 border-l-4 border-purple-600 pl-3">
                            3. Detalhamento de Itens Extras (Aplicações, Importações, etc)
                        </h3>
                        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-slate-50 text-slate-500 font-black uppercase text-[9px]">
                                    <tr>
                                        <th className="px-4 py-3">Tipo</th>
                                        <th className="px-4 py-3">Descrição / Classificação</th>
                                        <th className="px-4 py-3 text-center">Cat. Especial</th>
                                        <th className="px-4 py-3 text-right">Valor Financeiro</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {itensAvulsos.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50">
                                            <td className="px-4 py-3">
                                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${item.tipo === 'receita' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                    {item.tipo}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 font-medium text-slate-700">{item.descricao || '(Sem descrição)'}</td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={`text-[9px] font-bold ${item.categoriaEspecial !== 'padrao' ? 'text-sky-700 bg-sky-50 px-2 py-0.5 rounded' : 'text-slate-400'}`}>
                                                    {item.categoriaEspecial === 'aplicacao_financeira' ? 'Aplicação Fin.' : item.categoriaEspecial === 'importacao' ? 'Importação' : 'Geral'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* DETALHAMENTO DE TRIBUTOS APURADOS */}
                <div className="mb-10">
                    <h3 className="text-sm font-black text-slate-800 uppercase mb-4 flex items-center gap-2 border-l-4 border-sky-800 pl-3">
                        4. Apuração Final de Impostos
                    </h3>
                    <div className="border-2 border-sky-800 rounded-2xl overflow-hidden shadow-md">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-sky-800 text-white font-black uppercase text-[10px]">
                                <tr>
                                    <th className="px-6 py-4">Imposto Apurado</th>
                                    <th className="px-6 py-4 text-right">Base de Cálculo</th>
                                    <th className="px-6 py-4 text-center">Alíquota</th>
                                    <th className="px-6 py-4 text-right">Valor Líquido</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {resultadoCalculado?.detalhamento.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50/50">
                                        <td className="px-6 py-4">
                                            <p className="font-black text-slate-800">{item.imposto}</p>
                                            {item.observacao && <p className="text-[10px] text-slate-400 italic font-medium leading-tight">{item.observacao}</p>}
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono font-bold text-slate-600 text-xs">
                                            R$ {item.baseCalculo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-6 py-4 text-center font-black text-slate-700">
                                            {item.aliquota.toFixed(2)}%
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono font-black text-slate-900">
                                            R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                ))}
                                {/* TOTALIZAÇÃO */}
                                <tr className="bg-sky-50 border-t-2 border-sky-200">
                                    <td colSpan={3} className="px-6 py-5 text-right font-black text-sky-900 uppercase tracking-tighter">Total de Impostos a Recolher no Período:</td>
                                    <td className="px-6 py-5 text-right font-mono font-black text-sky-900 text-xl">
                                        R$ {resultadoCalculado?.totalImpostos.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </td>
                                </tr>
                                <tr className="bg-green-50 border-t border-green-100">
                                    <td colSpan={3} className="px-6 py-4 text-right font-black text-green-900 uppercase tracking-tighter">Lucro Líquido Estimado do Período (DRE Simulado):</td>
                                    <td className="px-6 py-4 text-right font-mono font-black text-green-900 text-lg">
                                        R$ {resultadoCalculado?.lucroLiquidoEstimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* INDICADORES E RODAPÉ */}
                <div className="grid grid-cols-3 gap-6 mb-12">
                    <div className="p-4 border-2 border-slate-100 rounded-2xl text-center shadow-sm">
                        <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Carga Tributária Efetiva</p>
                        <p className="text-2xl font-black text-slate-800">{resultadoCalculado?.cargaTributaria.toFixed(2)}%</p>
                    </div>
                    <div className="p-4 border-2 border-slate-100 rounded-2xl text-center shadow-sm">
                        <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Faturamento Total Bruto</p>
                        <p className="text-2xl font-black text-slate-800">R$ {totalMesVigente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="p-4 border-2 border-slate-100 rounded-2xl text-center shadow-sm">
                        <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Total Custos/Despesas</p>
                        <p className="text-2xl font-black text-slate-800">R$ {(financeiro.despesas + financeiro.folha + financeiro.cmv + (itensAvulsos.filter(i => i.tipo === 'despesa').reduce((acc,i)=>acc+i.valor,0))).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    </div>
                </div>

                <div className="bg-slate-900 text-white p-6 rounded-2xl flex justify-between items-center">
                    <div>
                        <p className="text-xs font-black text-sky-400 uppercase mb-1">Relatório Gerencial de Apoio à Gestão</p>
                        <p className="text-sm font-medium text-slate-300">Desenvolvido pela equipe técnica da SP Assessoria Contábil para apoio na tomada de decisão.</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Documento ID</p>
                        <p className="text-sm font-mono font-bold">LRP-{Date.now().toString(36).toUpperCase()}</p>
                    </div>
                </div>
                
                <p className="text-[9px] text-slate-400 text-center mt-8 uppercase font-black tracking-widest">
                    Atenção: Este extrato é uma simulação gerada por software. Valores sujeitos a conferência contábil final e validação via DCTF/ECF.
                </p>
            </div>
        </div>
    );
};

export default LucroPresumidoRealDashboard;
