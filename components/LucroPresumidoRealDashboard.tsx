import React, { useState, useEffect, useMemo } from 'react';
import { LucroPresumidoEmpresa, User, FichaFinanceiraRegistro } from '../types';
import * as lucroService from '../services/lucroPresumidoService';
import { fetchCnpjFromBrasilAPI } from '../services/externalApiService';
import { CalculatorIcon, BuildingIcon, SearchIcon, DownloadIcon, DocumentTextIcon, PlusIcon, TrashIcon, EyeIcon, ArrowLeftIcon, SaveIcon, ShieldIcon } from './Icons';
import LoadingSpinner from './LoadingSpinner';

const MASTER_ADMIN_EMAIL = 'junior@spassessoriacontabil.com.br';

const CurrencyInput: React.FC<{ label: string; value: number; onChange: (val: number) => void; disabled?: boolean }> = ({ label, value, onChange, disabled }) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value.replace(/\D/g, '');
        const num = parseFloat(raw) / 100;
        onChange(isNaN(num) ? 0 : num);
    };

    const formatted = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(value);

    return (
        <div className="flex flex-col">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-400 uppercase mb-1">{label}</label>
            <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">R$</span>
                <input 
                    type="text" 
                    value={formatted} 
                    onChange={handleChange} 
                    disabled={disabled}
                    className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none text-slate-900 font-bold dark:text-white dark:font-mono dark:font-normal disabled:bg-slate-100 dark:disabled:bg-slate-800 disabled:text-slate-500"
                />
            </div>
        </div>
    );
};

interface Props {
    currentUser?: User | null;
}

const LucroPresumidoRealDashboard: React.FC<Props> = ({ currentUser }) => {
    // View State
    const [view, setView] = useState<'list' | 'form'>('list');
    const [companies, setCompanies] = useState<LucroPresumidoEmpresa[]>([]);
    const [selectedEmpresaId, setSelectedEmpresaId] = useState<string | null>(null);

    // Company Data State
    const [empresa, setEmpresa] = useState<Partial<LucroPresumidoEmpresa>>({
        nome: '', cnpj: '', nomeFantasia: '', cnaePrincipal: undefined, cnaesSecundarios: [], endereco: ''
    });
    
    // Activity Types State (Multi-select)
    const [tiposAtividade, setTiposAtividade] = useState({
        comercio: true, industria: false, servico: false
    });

    // Validation & UI State
    const [isCnpjLoading, setIsCnpjLoading] = useState(false);
    const [cnpjError, setCnpjError] = useState('');
    const [isExporting, setIsExporting] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState('');

    // Financial Input State
    const [mesReferencia, setMesReferencia] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    
    const [financeiro, setFinanceiro] = useState({
        acumuladoAno: 0,
        faturamentoMesComercio: 0,
        faturamentoMesServico: 0,
        despesas: 0,
        folha: 0,
        cmv: 0
    });

    const isMasterAdmin = currentUser?.email === MASTER_ADMIN_EMAIL || currentUser?.role === 'admin';

    useEffect(() => {
        if (currentUser) {
            lucroService.getEmpresas(currentUser).then(setCompanies);
        }
    }, [currentUser]);

    // Load financial data when month or company changes
    useEffect(() => {
        if (selectedEmpresaId && empresa.fichaFinanceira) {
            const registro = empresa.fichaFinanceira.find(f => f.mesReferencia === mesReferencia);
            if (registro) {
                setFinanceiro({
                    acumuladoAno: registro.acumuladoAno,
                    faturamentoMesComercio: registro.faturamentoMesComercio,
                    faturamentoMesServico: registro.faturamentoMesServico,
                    despesas: registro.despesas,
                    folha: registro.folha,
                    cmv: registro.cmv
                });
            } else {
                // Reset fields if no record for this month
                setFinanceiro({
                    acumuladoAno: 0,
                    faturamentoMesComercio: 0,
                    faturamentoMesServico: 0,
                    despesas: 0,
                    folha: 0,
                    cmv: 0
                });
            }
        }
    }, [mesReferencia, selectedEmpresaId, empresa.fichaFinanceira]);

    const handleSelectEmpresa = (id: string) => {
        const target = companies.find(c => c.id === id);
        if (target) {
            setSelectedEmpresaId(id);
            setEmpresa(target);
            if (target.tiposAtividade) setTiposAtividade(target.tiposAtividade);
            setView('form');
        }
    };

    const handleDeleteEmpresa = async (id: string) => {
        if (!isMasterAdmin) return;
        if (window.confirm('Tem certeza que deseja excluir esta empresa?')) {
            if (await lucroService.deleteEmpresa(id)) {
                setCompanies(prev => prev.filter(c => c.id !== id));
                if (selectedEmpresaId === id) {
                    setView('list');
                    setSelectedEmpresaId(null);
                }
            }
        }
    };

    const handleNewEmpresa = () => {
        setSelectedEmpresaId(null);
        setEmpresa({ nome: '', cnpj: '', nomeFantasia: '', cnaePrincipal: undefined, cnaesSecundarios: [], endereco: '' });
        setTiposAtividade({ comercio: true, industria: false, servico: false });
        setFinanceiro({ acumuladoAno: 0, faturamentoMesComercio: 0, faturamentoMesServico: 0, despesas: 0, folha: 0, cmv: 0 });
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

        const empresaData = {
            ...empresa,
            tiposAtividade
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
                setEmpresa(saved); // Update local state with full saved object
                // Refresh list
                lucroService.getEmpresas(currentUser).then(setCompanies);
                setSaveSuccess('Empresa salva com sucesso!');
                setTimeout(() => setSaveSuccess(''), 3000);
            }
        } catch (e: any) {
            alert(e.message || "Erro ao salvar empresa.");
        }
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
        
        const registro: Omit<FichaFinanceiraRegistro, 'id' | 'dataRegistro'> = {
            mesReferencia: mesReferencia,
            acumuladoAno: financeiro.acumuladoAno,
            faturamentoMesComercio: financeiro.faturamentoMesComercio,
            faturamentoMesServico: financeiro.faturamentoMesServico,
            faturamentoMesTotal: totalMesVigente,
            totalGeral: totalGeralCalculado,
            despesas: financeiro.despesas,
            folha: financeiro.folha,
            cmv: financeiro.cmv
        };

        const updated = await lucroService.addFichaFinanceira(selectedEmpresaId, registro);
        if (updated) {
            setEmpresa(updated); // Update local state to reflect new history
            setCompanies(prev => prev.map(c => c.id === updated.id ? updated : c));
            alert('Cálculo salvo no histórico da empresa.');
        }
    };

    const handleExportPDF = async () => {
        if (!empresa.nome) {
            alert("Preencha os dados da empresa primeiro.");
            return;
        }
        setIsExporting(true);
        try {
            const { default: jsPDF } = await import('jspdf');
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const dataHoraEnvio = new Date().toLocaleString('pt-BR');
            const usuarioResponsavel = currentUser?.name || 'Usuário não identificado';

            // Preparar texto da Tributação
            const tributacaoArr = [];
            if (tiposAtividade.comercio) tributacaoArr.push('Comércio');
            if (tiposAtividade.industria) tributacaoArr.push('Indústria');
            if (tiposAtividade.servico) tributacaoArr.push('Serviço');
            const tributacaoTexto = tributacaoArr.length > 0 ? tributacaoArr.join(' / ') : 'Não informada';

            // Header
            doc.setFillColor(14, 165, 233); // Sky-600
            doc.rect(0, 0, pageWidth, 30, 'F');
            doc.setFontSize(20);
            doc.setTextColor(255);
            doc.text("FICHA FINANCEIRA & CADASTRO", pageWidth / 2, 20, { align: 'center' });

            // Company Info
            doc.setTextColor(0);
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.text("DADOS CADASTRAIS", 20, 45);
            doc.setLineWidth(0.5);
            doc.line(20, 47, pageWidth - 20, 47);

            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            
            let y = 55;
            doc.text(`Razão Social: ${empresa.nome}`, 20, y);
            doc.text(`CNPJ: ${empresa.cnpj}`, pageWidth - 80, y);
            y += 6;
            if (empresa.nomeFantasia) {
                doc.text(`Nome Fantasia: ${empresa.nomeFantasia}`, 20, y);
                y += 6;
            }
            doc.text(`Endereço: ${empresa.endereco || ''}`, 20, y);
            y += 6;
            doc.text(`Tributação/Atividade: ${tributacaoTexto}`, 20, y);
            y += 10;

            // Financial Data
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.text(`DADOS FINANCEIROS - ${mesReferencia}`, 20, y);
            doc.line(20, y + 2, pageWidth - 20, y + 2);
            y += 10;

            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");

            const formatMoney = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

            const addRow = (label: string, value: number, bold = false) => {
                doc.setFillColor(245, 247, 250);
                doc.rect(20, y - 4, pageWidth - 40, 8, 'F');
                if (bold) doc.setFont("helvetica", "bold");
                doc.text(label, 25, y + 1);
                doc.text(formatMoney(value), pageWidth - 25, y + 1, { align: 'right' });
                if (bold) doc.setFont("helvetica", "normal");
                y += 10;
            };

            addRow("Faturamento Acumulado (Ano)", financeiro.acumuladoAno);
            
            if (tiposAtividade.comercio || tiposAtividade.industria) {
                addRow("Faturamento Mês (Comércio/Ind.)", financeiro.faturamentoMesComercio);
                addRow("Custo Mercadoria (CMV)", financeiro.cmv);
            }
            if (tiposAtividade.servico) {
                addRow("Faturamento Mês (Serviços)", financeiro.faturamentoMesServico);
            }
            
            addRow("Total Mês Vigente", totalMesVigente, true);
            
            doc.setDrawColor(0);
            doc.line(20, y-2, pageWidth-20, y-2);
            addRow("TOTAL GERAL (Acumulado + Mês)", totalGeralCalculado, true);
            
            y+=5;
            addRow("Despesas Operacionais", financeiro.despesas);
            addRow("Folha de Pagamento", financeiro.folha);

            // Footer
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`Gerado por: ${usuarioResponsavel}`, 20, 280);
            doc.text(`Data/Hora do Envio: ${dataHoraEnvio}`, pageWidth - 20, 280, { align: 'right' });
            doc.text(`SP Assessoria Contábil`, pageWidth / 2, 285, { align: 'center' });

            doc.save(`ficha-financeira-${empresa.cnpj?.replace(/\D/g,'')}-${mesReferencia}.pdf`);

        } catch (e) {
            console.error("Erro ao gerar PDF:", e);
            alert("Erro ao gerar o arquivo PDF.");
        } finally {
            setIsExporting(false);
        }
    };

    const toggleTipoAtividade = (type: 'comercio' | 'industria' | 'servico') => {
        setTiposAtividade(prev => ({ ...prev, [type]: !prev[type] }));
    };

    // --- RENDER LIST VIEW ---
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
                                <th className="px-6 py-3 text-center">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {companies.length === 0 ? (
                                <tr>
                                    <td colSpan={3} className="px-6 py-8 text-center text-slate-500 font-bold dark:text-slate-400 dark:font-normal">Nenhuma empresa cadastrada.</td>
                                </tr>
                            ) : (
                                companies.map(c => (
                                    <tr key={c.id} className="border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                        <td className="px-6 py-4 font-bold text-slate-900 dark:text-white dark:font-normal">{c.nome}</td>
                                        <td className="px-6 py-4 font-mono text-slate-900 dark:text-slate-300 font-bold dark:font-normal">{c.cnpj}</td>
                                        <td className="px-6 py-4 text-center flex justify-center gap-3">
                                            <button onClick={() => handleSelectEmpresa(c.id)} className="text-sky-600 hover:text-sky-800" title="Visualizar/Editar">
                                                <EyeIcon className="w-5 h-5" />
                                            </button>
                                            {isMasterAdmin && (
                                                <button onClick={() => handleDeleteEmpresa(c.id)} className="text-red-500 hover:text-red-700" title="Excluir">
                                                    <TrashIcon className="w-5 h-5" />
                                                </button>
                                            )}
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

    // --- RENDER FORM VIEW ---
    return (
        <div className="space-y-6 animate-fade-in pb-10">
            <div className="flex items-center gap-4 mb-2">
                <button onClick={() => setView('list')} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500">
                    <ArrowLeftIcon className="w-5 h-5" />
                </button>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {selectedEmpresaId ? 'Editar Empresa' : 'Nova Empresa'}
                </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Cadastro */}
                <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm h-fit">
                    <div className="flex justify-between items-center mb-4 border-b pb-2 border-slate-100 dark:border-slate-700">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
                            <BuildingIcon className="w-5 h-5 text-sky-600" />
                            Dados Cadastrais
                        </h3>
                        <button onClick={handleSaveEmpresa} className="text-sm bg-green-600 text-white font-bold px-3 py-1 rounded hover:bg-green-700 flex items-center gap-1">
                            <SaveIcon className="w-4 h-4" /> Salvar
                        </button>
                    </div>
                    
                    {saveSuccess && <p className="text-green-600 font-bold text-sm mb-2">{saveSuccess}</p>}

                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-slate-800 dark:text-slate-500 uppercase mb-1">CNPJ</label>
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    value={empresa.cnpj} 
                                    onChange={e => setEmpresa(prev => ({...prev, cnpj: e.target.value}))}
                                    className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm font-mono text-slate-900 font-bold dark:text-white dark:font-normal"
                                    placeholder="00.000.000/0000-00"
                                />
                                <button onClick={handleCnpjVerification} disabled={isCnpjLoading} className="bg-slate-100 dark:bg-slate-700 px-3 rounded-lg hover:bg-slate-200">
                                    {isCnpjLoading ? <LoadingSpinner /> : <SearchIcon className="w-4 h-4" />}
                                </button>
                            </div>
                            {cnpjError && <p className="text-xs text-red-600 font-bold mt-1">{cnpjError}</p>}
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-800 dark:text-slate-500 uppercase mb-1">Razão Social</label>
                            <input type="text" value={empresa.nome} onChange={e => setEmpresa(prev => ({...prev, nome: e.target.value}))} className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 font-bold dark:text-white dark:font-normal" />
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-800 dark:text-slate-500 uppercase mb-1">Nome Fantasia</label>
                            <input type="text" value={empresa.nomeFantasia} onChange={e => setEmpresa(prev => ({...prev, nomeFantasia: e.target.value}))} className="w-full px-3 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 font-bold dark:text-white dark:font-normal" />
                        </div>

                        {empresa.cnaePrincipal && (
                            <div className="p-3 bg-sky-50 dark:bg-sky-900/20 rounded-lg border border-sky-100 dark:border-sky-800">
                                <p className="text-xs font-bold text-sky-700 uppercase">Atividade Principal</p>
                                <p className="text-sm font-mono font-bold text-slate-900 dark:text-white">{empresa.cnaePrincipal.codigo}</p>
                                <p className="text-xs text-slate-800 font-bold dark:text-slate-300 dark:font-normal">{empresa.cnaePrincipal.descricao}</p>
                            </div>
                        )}

                        {/* NEW: Secondary CNAEs List */}
                        {empresa.cnaesSecundarios && empresa.cnaesSecundarios.length > 0 && (
                            <div className="mt-3">
                                <label className="text-xs font-bold text-slate-800 dark:text-slate-500 uppercase mb-1 block">CNAEs Secundários</label>
                                <div className="bg-slate-50 dark:bg-slate-900/30 border border-slate-200 dark:border-slate-700 rounded-lg p-2 max-h-32 overflow-y-auto custom-scrollbar">
                                    {empresa.cnaesSecundarios.map((sec, idx) => (
                                        <div key={idx} className="mb-2 last:mb-0 border-b border-slate-100 dark:border-slate-700 last:border-0 pb-1 last:pb-0">
                                            <p className="text-xs font-mono font-bold text-slate-900 dark:text-slate-300">{sec.codigo}</p>
                                            <p className="text-[10px] text-slate-800 font-bold dark:text-slate-400 dark:font-normal leading-tight">{sec.descricao}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="pt-4 border-t dark:border-slate-700">
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-500 uppercase mb-2">Tipos de Atividade (Tributação)</p>
                            <div className="flex flex-wrap gap-3">
                                {['comercio', 'industria', 'servico'].map(type => (
                                    <label key={type} className="flex items-center gap-2 text-sm cursor-pointer bg-slate-50 dark:bg-slate-700/50 px-3 py-1 rounded border border-slate-200 dark:border-slate-600">
                                        <input type="checkbox" checked={(tiposAtividade as any)[type]} onChange={() => toggleTipoAtividade(type as any)} className="text-sky-600 rounded" />
                                        <span className="capitalize font-bold text-slate-900 dark:text-white dark:font-normal">{type}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right: Ficha Financeira */}
                <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm h-fit">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-200 mb-4 border-b pb-2 border-slate-100 dark:border-slate-700 flex items-center gap-2">
                        <CalculatorIcon className="w-5 h-5 text-sky-600" />
                        Ficha Financeira (Preenchimento)
                    </h3>

                    <div className="mb-6">
                        <label className="text-xs font-bold text-slate-800 dark:text-slate-500 uppercase mb-1">Mês de Referência</label>
                        <input 
                            type="month" 
                            value={mesReferencia} 
                            onChange={e => setMesReferencia(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-900 font-bold dark:text-white dark:font-normal"
                        />
                    </div>

                    <div className="space-y-4 p-4 bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-slate-100 dark:border-slate-700">
                        <CurrencyInput 
                            label="Faturamento Total Acumulado (Ano Vigente)" 
                            value={financeiro.acumuladoAno} 
                            onChange={v => setFinanceiro(prev => ({ ...prev, acumuladoAno: v }))} 
                        />

                        <div className="border-t border-slate-200 dark:border-slate-600 my-2 pt-2">
                            <p className="text-xs font-bold text-sky-600 mb-2 uppercase">Faturamento do Mês Vigente</p>
                            {(tiposAtividade.comercio || tiposAtividade.industria) && (
                                <div className="mb-2">
                                    <CurrencyInput 
                                        label="Comércio / Indústria" 
                                        value={financeiro.faturamentoMesComercio} 
                                        onChange={v => setFinanceiro(prev => ({ ...prev, faturamentoMesComercio: v }))} 
                                    />
                                </div>
                            )}
                            {tiposAtividade.servico && (
                                <CurrencyInput 
                                    label="Serviços" 
                                    value={financeiro.faturamentoMesServico} 
                                    onChange={v => setFinanceiro(prev => ({ ...prev, faturamentoMesServico: v }))} 
                                />
                            )}
                        </div>

                        <div className="bg-sky-100 dark:bg-sky-900/40 p-3 rounded-lg border border-sky-200 dark:border-sky-800">
                            <CurrencyInput 
                                label="FATURAMENTO TOTAL GERAL (Acumulado + Mês)" 
                                value={totalGeralCalculado} 
                                onChange={() => {}} 
                                disabled={true}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-2">
                            <CurrencyInput 
                                label="Despesas Operac." 
                                value={financeiro.despesas} 
                                onChange={v => setFinanceiro(prev => ({ ...prev, despesas: v }))} 
                            />
                            <CurrencyInput 
                                label="Folha Pagamento" 
                                value={financeiro.folha} 
                                onChange={v => setFinanceiro(prev => ({ ...prev, folha: v }))} 
                            />
                        </div>
                        {(tiposAtividade.comercio || tiposAtividade.industria) && (
                             <CurrencyInput 
                                label="CMV (Custo Mercadoria)" 
                                value={financeiro.cmv} 
                                onChange={v => setFinanceiro(prev => ({ ...prev, cmv: v }))} 
                            />
                        )}
                    </div>

                    <div className="flex gap-3 mt-6">
                        <button 
                            onClick={handleSaveCalculo} 
                            className="flex-1 bg-teal-600 text-white py-2 rounded-lg font-bold hover:bg-teal-700 transition-colors flex justify-center items-center gap-2"
                        >
                            <SaveIcon className="w-4 h-4" /> Salvar Cálculo
                        </button>
                        <button 
                            onClick={handleExportPDF} 
                            disabled={isExporting}
                            className="flex-1 bg-sky-600 text-white py-2 rounded-lg font-bold hover:bg-sky-700 transition-colors flex justify-center items-center gap-2 disabled:opacity-50"
                        >
                            <DownloadIcon className="w-4 h-4" /> Exportar Ficha
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LucroPresumidoRealDashboard;