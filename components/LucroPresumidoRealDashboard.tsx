
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { LucroPresumidoEmpresa, User, FichaFinanceiraRegistro, LucroInput, HistoryItem, SearchType, ItemFinanceiroAvulso } from '../types';
import * as lucroPresumidoService from '../services/lucroPresumidoService';
import { fetchCnpjFromBrasilAPI } from '../services/externalApiService';
import { calcularLucro } from '../services/lucroService';
import { PlusIcon, CalculatorIcon, DownloadIcon, TrashIcon, ArrowLeftIcon, SaveIcon, UserIcon, BuildingIcon, PencilIcon, CloseIcon, TagIcon } from './Icons';
import LoadingSpinner from './LoadingSpinner';

// Helper to convert Ficha to Input for Calculation Service
const convertFichaToInput = (ficha: FichaFinanceiraRegistro, empresa: LucroPresumidoEmpresa): LucroInput => {
    return {
        regimeSelecionado: ficha.regime,
        periodoApuracao: ficha.periodoApuracao,
        mesReferencia: ficha.mesReferencia,
        faturamentoComercio: ficha.faturamentoMesComercio,
        faturamentoIndustria: ficha.faturamentoMesIndustria,
        faturamentoServico: ficha.faturamentoMesServico,
        faturamentoServicoRetido: ficha.faturamentoMesServicoRetido,
        faturamentoLocacao: ficha.faturamentoMesLocacao,
        faturamentoServicoHospitalar: ficha.faturamentoMesServicoHospitalar,
        
        faturamentoFiliais: {
            comercio: ficha.faturamentoFiliaisComercio || 0,
            industria: ficha.faturamentoFiliaisIndustria || 0,
            servico: ficha.faturamentoFiliaisServico || 0,
            servicoRetido: ficha.faturamentoFiliaisServicoRetido || 0,
            locacao: ficha.faturamentoFiliaisLocacao || 0,
            servicoHospitalar: ficha.faturamentoFiliaisServicoHospitalar || 0
        },

        faturamentoMonofasico: ficha.faturamentoMonofasico,
        valorIpi: ficha.valorIpi,
        valorDevolucoes: ficha.valorDevolucoes,
        icmsVendas: ficha.icmsVendas,

        receitaFinanceira: ficha.receitaFinanceira,
        despesasOperacionais: ficha.despesas,
        despesasDedutiveis: ficha.despesasDedutiveis,
        folhaPagamento: ficha.folha,
        custoMercadoriaVendida: ficha.cmv,
        
        issConfig: empresa.issPadraoConfig || { tipo: 'aliquota_municipal', aliquota: 5 },
        
        retencaoPis: ficha.retencaoPis,
        retencaoCofins: ficha.retencaoCofins,
        retencaoIrpj: ficha.retencaoIrpj,
        retencaoCsll: ficha.retencaoCsll,

        isEquiparacaoHospitalar: ficha.isEquiparacaoHospitalar,
        isPresuncaoReduzida16: ficha.isPresuncaoReduzida16,
        itensAvulsos: ficha.itensAvulsos,
        
        acumuladoAno: ficha.acumuladoAno,
        acumuladoTrimestre: ficha.dadosTrimestrais,

        ipiRecolher: ficha.ipiRecolher,
        icmsProprioRecolher: ficha.icmsProprioRecolher,
        icmsStRecolher: ficha.icmsStRecolher
    };
};

// Helper component for Currency Input
const CurrencyInput: React.FC<{ label: string; value: number; onChange: (val: number) => void; className?: string; disabled?: boolean }> = ({ label, value, onChange, className, disabled }) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value.replace(/\D/g, '');
        const num = parseFloat(raw) / 100;
        onChange(isNaN(num) ? 0 : num);
    };
    const formatted = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(value);
    
    return (
        <div className={className}>
            <label className={`block text-xs font-bold uppercase mb-1 ${disabled ? 'text-slate-400' : 'text-slate-500'}`}>{label}</label>
            <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">R$</span>
                <input 
                    type="text" 
                    value={formatted} 
                    onChange={handleChange} 
                    disabled={disabled}
                    className={`w-full pl-8 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-sky-500 outline-none font-mono text-sm font-bold text-right ${disabled ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700' : 'bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-600'}`}
                />
            </div>
        </div>
    );
};

interface LucroPresumidoRealDashboardProps {
    currentUser: User | null;
    externalSelectedId: string | null;
    onAddToHistory: (item: any) => void;
}

const LucroPresumidoRealDashboard: React.FC<LucroPresumidoRealDashboardProps> = ({ currentUser, externalSelectedId, onAddToHistory }) => {
    const [empresas, setEmpresas] = useState<LucroPresumidoEmpresa[]>([]);
    const [selectedEmpresaId, setSelectedEmpresaId] = useState<string | null>(null);
    const [selectedFichaId, setSelectedFichaId] = useState<string | null>(null);
    const [view, setView] = useState<'list' | 'details' | 'report' | 'new_company' | 'new_ficha'>('list');
    const [loading, setLoading] = useState(false);

    // New Company Form State
    const [newName, setNewName] = useState('');
    const [newCnpj, setNewCnpj] = useState('');
    const [newCnae, setNewCnae] = useState('');
    const [newRegime, setNewRegime] = useState<'Presumido' | 'Real'>('Presumido');
    
    // CNPJ Verification State
    const [isCnpjLoading, setIsCnpjLoading] = useState(false);
    const [cnpjError, setCnpjError] = useState('');

    // New Ficha State
    const [fichaMes, setFichaMes] = useState(new Date().toISOString().substring(0, 7));
    
    // Matriz
    const [fichaComercio, setFichaComercio] = useState(0);
    const [fichaIndustria, setFichaIndustria] = useState(0);
    const [fichaServico, setFichaServico] = useState(0);
    const [fichaServicoRetido, setFichaServicoRetido] = useState(0);
    const [fichaLocacao, setFichaLocacao] = useState(0);
    const [fichaRecFinanceira, setFichaRecFinanceira] = useState(0);
    
    // Filiais (Consolidação)
    const [fichaFilialComercio, setFichaFilialComercio] = useState(0);
    const [fichaFilialIndustria, setFichaFilialIndustria] = useState(0);
    const [fichaFilialServico, setFichaFilialServico] = useState(0);
    
    // Deduções e Ajustes
    const [isMonofasicoOption, setIsMonofasicoOption] = useState(false);
    const [fichaMonofasico, setFichaMonofasico] = useState(0);
    const [fichaIpi, setFichaIpi] = useState(0);
    const [fichaIcmsVendas, setFichaIcmsVendas] = useState(0); // Para dedução de base
    const [fichaDevolucoes, setFichaDevolucoes] = useState(0);
    
    // Custos
    const [fichaCmv, setFichaCmv] = useState(0);
    const [fichaFolha, setFichaFolha] = useState(0);
    const [fichaDespesas, setFichaDespesas] = useState(0);

    // Retenções
    const [fichaRetPis, setFichaRetPis] = useState(0);
    const [fichaRetCofins, setFichaRetCofins] = useState(0);
    const [fichaRetIrpj, setFichaRetIrpj] = useState(0);
    const [fichaRetCsll, setFichaRetCsll] = useState(0);

    useEffect(() => {
        loadEmpresas();
    }, [currentUser]);

    useEffect(() => {
        if (externalSelectedId && empresas.length > 0) {
            const exists = empresas.find(e => e.id === externalSelectedId);
            if (exists) {
                setSelectedEmpresaId(externalSelectedId);
                setView('details');
            }
        }
    }, [externalSelectedId, empresas]);

    const loadEmpresas = async () => {
        setLoading(true);
        try {
            const data = await lucroPresumidoService.getEmpresas(currentUser);
            setEmpresas(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleCnpjVerification = async () => {
        if (!newCnpj.trim()) {
            setCnpjError('Digite um CNPJ para verificar.');
            return;
        }
        setIsCnpjLoading(true);
        setCnpjError('');
        try {
            const data = await fetchCnpjFromBrasilAPI(newCnpj);
            if (data && data.razaoSocial) {
                setNewName(data.razaoSocial);
                if (data.cnaePrincipal) {
                    setNewCnae(data.cnaePrincipal.codigo);
                }
            }
        } catch (e: any) {
            setCnpjError(e.message || 'Erro ao verificar o CNPJ.');
        } finally {
            setIsCnpjLoading(false);
        }
    };

    const handleSaveNewCompany = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUser) return;
        setLoading(true);
        try {
            await lucroPresumidoService.saveEmpresa({
                nome: newName,
                cnpj: newCnpj,
                cnaePrincipal: { codigo: newCnae, descricao: '' },
                regimePadrao: newRegime,
                fichaFinanceira: []
            }, currentUser.id);
            await loadEmpresas();
            setView('list');
            setNewName('');
            setNewCnpj('');
            setNewCnae('');
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteCompany = async (id: string) => {
        if (window.confirm('Tem certeza que deseja excluir esta empresa?')) {
            await lucroPresumidoService.deleteEmpresa(id);
            loadEmpresas();
            if (selectedEmpresaId === id) {
                setSelectedEmpresaId(null);
                setView('list');
            }
        }
    };

    const handleSaveFicha = async () => {
        if (!selectedEmpresaId) return;
        const empresa = empresas.find(e => e.id === selectedEmpresaId);
        if (!empresa) return;

        setLoading(true);
        try {
            const totalFaturamento = 
                fichaComercio + fichaIndustria + fichaServico + fichaServicoRetido + fichaLocacao + fichaRecFinanceira +
                fichaFilialComercio + fichaFilialIndustria + fichaFilialServico;
            
            // Simulação de cálculo para obter total de impostos
            const tempFicha: FichaFinanceiraRegistro = {
                id: Date.now().toString(),
                dataRegistro: Date.now(),
                mesReferencia: fichaMes,
                regime: empresa.regimePadrao || 'Presumido',
                periodoApuracao: 'Mensal',
                acumuladoAno: 0,
                
                faturamentoMesComercio: fichaComercio,
                faturamentoMesIndustria: fichaIndustria,
                faturamentoMesServico: fichaServico,
                faturamentoMesServicoRetido: fichaServicoRetido,
                faturamentoMesLocacao: fichaLocacao,
                faturamentoMesServicoHospitalar: 0,
                
                faturamentoFiliaisComercio: fichaFilialComercio,
                faturamentoFiliaisIndustria: fichaFilialIndustria,
                faturamentoFiliaisServico: fichaFilialServico,

                faturamentoMonofasico: isMonofasicoOption ? fichaMonofasico : 0,
                valorIpi: fichaIpi,
                valorDevolucoes: fichaDevolucoes,
                icmsVendas: fichaIcmsVendas,
                
                receitaFinanceira: fichaRecFinanceira,
                faturamentoMesTotal: totalFaturamento,
                totalGeral: totalFaturamento,
                
                despesas: fichaDespesas,
                despesasDedutiveis: 0,
                folha: fichaFolha,
                cmv: fichaCmv,
                
                retencaoPis: fichaRetPis,
                retencaoCofins: fichaRetCofins,
                retencaoIrpj: fichaRetIrpj,
                retencaoCsll: fichaRetCsll,
                
                totalImpostos: 0, // Será calculado
                cargaTributaria: 0
            };

            const calculo = calcularLucro(convertFichaToInput(tempFicha, empresa));
            tempFicha.totalImpostos = calculo.totalImpostos;
            tempFicha.cargaTributaria = calculo.cargaTributaria;

            await lucroPresumidoService.addFichaFinanceira(selectedEmpresaId, tempFicha);
            await loadEmpresas(); // Refresh para pegar os novos dados
            setView('details');
            
            // Reset fields
            setFichaComercio(0); setFichaIndustria(0); setFichaServico(0); setFichaServicoRetido(0); setFichaLocacao(0);
            setFichaFilialComercio(0); setFichaFilialIndustria(0); setFichaFilialServico(0);
            setFichaIpi(0); setFichaDevolucoes(0); setFichaCmv(0); setFichaFolha(0); setFichaDespesas(0); setFichaIcmsVendas(0);
            setFichaMonofasico(0); setIsMonofasicoOption(false);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const selectedEmpresa = useMemo(() => empresas.find(e => e.id === selectedEmpresaId), [empresas, selectedEmpresaId]);
    const selectedFicha = useMemo(() => selectedEmpresa?.fichaFinanceira.find(f => f.id === selectedFichaId), [selectedEmpresa, selectedFichaId]);

    const renderList = () => (
        <div className="space-y-6 animate-fade-in">
             <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Lucro Presumido e Real</h2>
                    <p className="mt-1 text-slate-500 dark:text-slate-400">Gestão de fichas financeiras e cálculo de impostos.</p>
                </div>
                <button
                    onClick={() => setView('new_company')}
                    className="btn-press flex items-center gap-2 px-4 py-2 bg-sky-600 text-white font-semibold rounded-lg hover:bg-sky-700 transition-colors"
                >
                    <PlusIcon className="w-5 h-5" /> Nova Empresa
                </button>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
                <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
                    <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-300">
                        <tr>
                            <th className="px-6 py-3">Empresa</th>
                            <th className="px-6 py-3">CNPJ</th>
                            <th className="px-6 py-3">Regime Padrão</th>
                            <th className="px-6 py-3 text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {empresas.map(emp => (
                            <tr key={emp.id} className="border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                <td className="px-6 py-4 font-bold text-slate-800 dark:text-slate-200">{emp.nome}</td>
                                <td className="px-6 py-4 font-mono">{emp.cnpj}</td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${emp.regimePadrao === 'Real' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                        {emp.regimePadrao || 'Presumido'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right flex justify-end gap-2">
                                    <button onClick={() => { setSelectedEmpresaId(emp.id); setView('details'); }} className="text-sky-600 hover:text-sky-800 font-medium">Abrir</button>
                                    <button onClick={() => handleDeleteCompany(emp.id)} className="text-red-500 hover:text-red-700"><TrashIcon className="w-4 h-4" /></button>
                                </td>
                            </tr>
                        ))}
                        {empresas.length === 0 && (
                            <tr>
                                <td colSpan={4} className="px-6 py-8 text-center text-slate-500">Nenhuma empresa cadastrada.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const renderNewCompany = () => (
        <div className="max-w-xl mx-auto bg-white dark:bg-slate-800 p-8 rounded-lg shadow-sm animate-fade-in">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-6">Nova Empresa</h2>
            <form onSubmit={handleSaveNewCompany} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">CNPJ</label>
                    <div className="mt-1 flex gap-2">
                        <input 
                            type="text" 
                            value={newCnpj} 
                            onChange={e => setNewCnpj(e.target.value)} 
                            placeholder="00.000.000/0001-00"
                            required 
                            className="flex-grow p-2 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-sky-500 font-mono" 
                        />
                        <button
                            type="button"
                            onClick={handleCnpjVerification}
                            disabled={isCnpjLoading}
                            className="btn-press flex-shrink-0 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-wait"
                        >
                            {isCnpjLoading ? '...' : 'Verificar Receita'}
                        </button>
                    </div>
                    {cnpjError && <p className="mt-1 text-xs text-red-500">{cnpjError}</p>}
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Razão Social</label>
                    <input type="text" value={newName} onChange={e => setNewName(e.target.value)} required className="w-full mt-1 p-2 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-sky-500" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">CNAE Principal (Opcional)</label>
                    <input type="text" value={newCnae} onChange={e => setNewCnae(e.target.value)} className="w-full mt-1 p-2 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-sky-500" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Regime Tributário Padrão</label>
                    <select value={newRegime} onChange={e => setNewRegime(e.target.value as any)} className="w-full mt-1 p-2 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-sky-500">
                        <option value="Presumido">Lucro Presumido</option>
                        <option value="Real">Lucro Real</option>
                    </select>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                    <button type="button" onClick={() => setView('list')} className="px-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg font-medium text-slate-700 dark:text-slate-300">Cancelar</button>
                    <button type="submit" disabled={loading} className="px-4 py-2 bg-sky-600 text-white rounded-lg font-bold hover:bg-sky-700">{loading ? 'Salvando...' : 'Salvar Empresa'}</button>
                </div>
            </form>
        </div>
    );

    const renderNewFicha = () => (
        <div className="max-w-4xl mx-auto bg-white dark:bg-slate-800 p-8 rounded-lg shadow-sm animate-fade-in pb-20">
            <div className="flex items-center gap-4 mb-6">
                <button onClick={() => setView('details')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"><ArrowLeftIcon className="w-5 h-5" /></button>
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Nova Competência (Ficha Financeira)</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Coluna 1: Receitas */}
                <div className="space-y-4">
                    <div className="bg-sky-50 dark:bg-sky-900/20 p-4 rounded-lg border border-sky-100 dark:border-sky-800">
                        <h3 className="font-bold text-sky-700 dark:text-sky-300 mb-3 flex items-center gap-2">
                            <CalculatorIcon className="w-4 h-4" /> Receitas da Matriz
                        </h3>
                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Mês de Referência</label>
                                <input type="month" value={fichaMes} onChange={e => setFichaMes(e.target.value)} className="w-full p-2 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700" />
                            </div>
                            <CurrencyInput label="Comércio (Revenda)" value={fichaComercio} onChange={setFichaComercio} />
                            <CurrencyInput label="Indústria" value={fichaIndustria} onChange={setFichaIndustria} />
                            <CurrencyInput label="Serviços (Geral)" value={fichaServico} onChange={setFichaServico} />
                            <CurrencyInput label="Serviços (C/ Retenção)" value={fichaServicoRetido} onChange={setFichaServicoRetido} />
                            <CurrencyInput label="Locação de Bens" value={fichaLocacao} onChange={setFichaLocacao} />
                            <CurrencyInput label="Receita Financeira" value={fichaRecFinanceira} onChange={setFichaRecFinanceira} className="pt-2 border-t border-sky-200 dark:border-sky-700" />
                        </div>
                    </div>

                    <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-lg border border-indigo-100 dark:border-indigo-800">
                        <h3 className="font-bold text-indigo-700 dark:text-indigo-300 mb-3 flex items-center gap-2">
                            <BuildingIcon className="w-4 h-4" /> Faturamento Filiais (Consolidação)
                        </h3>
                        <div className="space-y-3">
                            <CurrencyInput label="Filiais - Comércio" value={fichaFilialComercio} onChange={setFichaFilialComercio} />
                            <CurrencyInput label="Filiais - Indústria" value={fichaFilialIndustria} onChange={setFichaFilialIndustria} />
                            <CurrencyInput label="Filiais - Serviço" value={fichaFilialServico} onChange={setFichaFilialServico} />
                        </div>
                    </div>
                </div>

                {/* Coluna 2: Deduções, Custos e Retenções */}
                <div className="space-y-4">
                    <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg border border-orange-100 dark:border-orange-800">
                        <h3 className="font-bold text-orange-700 dark:text-orange-300 mb-3">Deduções e Ajustes</h3>
                        <div className="space-y-3">
                            <CurrencyInput label="IPI Faturado" value={fichaIpi} onChange={setFichaIpi} />
                            <CurrencyInput label="Devoluções de Vendas" value={fichaDevolucoes} onChange={setFichaDevolucoes} />
                            <CurrencyInput label="ICMS sobre Vendas (Para dedução PIS/COFINS)" value={fichaIcmsVendas} onChange={setFichaIcmsVendas} />
                            
                            <div className="pt-2 border-t border-orange-200 dark:border-orange-700">
                                <label className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300 cursor-pointer mb-2">
                                    <input 
                                        type="checkbox" 
                                        checked={isMonofasicoOption} 
                                        onChange={e => setIsMonofasicoOption(e.target.checked)} 
                                        className="w-4 h-4 text-sky-600 rounded"
                                    />
                                    <TagIcon className="w-4 h-4" />
                                    Opção Monofásico?
                                </label>
                                {isMonofasicoOption && (
                                    <div className="animate-fade-in pl-6">
                                        <CurrencyInput 
                                            label="Valor Receita Monofásica" 
                                            value={fichaMonofasico} 
                                            onChange={setFichaMonofasico}
                                            className="bg-white dark:bg-slate-800 rounded-lg p-2 border border-slate-200 dark:border-slate-600"
                                        />
                                        <p className="text-[10px] text-slate-500 mt-1">
                                            * Base PIS/COFINS será ajustada (Faturamento Bruto - IPI - Devolução) conforme regra STF/Monofásico.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-700/30 p-4 rounded-lg border border-slate-100 dark:border-slate-600">
                        <h3 className="font-bold text-slate-700 dark:text-slate-300 mb-3">Custos e Despesas</h3>
                        <div className="space-y-3">
                            <CurrencyInput label="CMV (Custo Mercadoria)" value={fichaCmv} onChange={setFichaCmv} />
                            <CurrencyInput label="Folha de Pagamento" value={fichaFolha} onChange={setFichaFolha} />
                            <CurrencyInput label="Despesas Operacionais" value={fichaDespesas} onChange={setFichaDespesas} />
                        </div>
                    </div>

                    <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-100 dark:border-green-800">
                        <h3 className="font-bold text-green-700 dark:text-green-300 mb-3">Retenções (A Compensar)</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <CurrencyInput label="Ret. PIS" value={fichaRetPis} onChange={setFichaRetPis} />
                            <CurrencyInput label="Ret. COFINS" value={fichaRetCofins} onChange={setFichaRetCofins} />
                            <CurrencyInput label="Ret. IRPJ" value={fichaRetIrpj} onChange={setFichaRetIrpj} />
                            <CurrencyInput label="Ret. CSLL" value={fichaRetCsll} onChange={setFichaRetCsll} />
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-8 flex justify-end gap-3">
                <button onClick={() => setView('details')} className="px-6 py-3 bg-slate-100 dark:bg-slate-700 rounded-lg font-bold text-slate-600 dark:text-slate-300">Cancelar</button>
                <button onClick={handleSaveFicha} disabled={loading} className="px-8 py-3 bg-sky-600 text-white rounded-lg font-bold hover:bg-sky-700 shadow-lg flex items-center gap-2">
                    {loading ? 'Salvando...' : <><SaveIcon className="w-5 h-5" /> Salvar Competência</>}
                </button>
            </div>
        </div>
    );

    const renderDetails = () => {
        if (!selectedEmpresa) return null;
        return (
            <div className="space-y-6 animate-fade-in">
                <div className="flex items-center gap-4">
                    <button onClick={() => setView('list')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"><ArrowLeftIcon className="w-5 h-5" /></button>
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{selectedEmpresa.nome}</h2>
                        <p className="text-slate-500 dark:text-slate-400 font-mono text-sm">{selectedEmpresa.cnpj}</p>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                            <CalculatorIcon className="w-5 h-5 text-sky-600" />
                            Fichas Financeiras (Competências)
                        </h3>
                         <button 
                            onClick={() => setView('new_ficha')}
                            className="btn-press flex items-center gap-2 px-4 py-2 bg-sky-600 text-white font-bold rounded-lg hover:bg-sky-700 transition-colors"
                        >
                            <PlusIcon className="w-4 h-4" /> Nova Competência
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {selectedEmpresa.fichaFinanceira && selectedEmpresa.fichaFinanceira.length > 0 ? selectedEmpresa.fichaFinanceira.map(ficha => (
                             <div key={ficha.id} onClick={() => { setSelectedFichaId(ficha.id); setView('report'); }} className="cursor-pointer bg-slate-50 dark:bg-slate-700/50 p-4 rounded-lg border border-slate-200 dark:border-slate-600 hover:border-sky-400 transition-all">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="font-bold text-slate-800 dark:text-white capitalize">{new Date(ficha.mesReferencia + '-02').toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}</span>
                                    <span className="text-xs bg-sky-100 dark:bg-sky-900 text-sky-700 dark:text-sky-300 px-2 py-0.5 rounded-full">{ficha.regime}</span>
                                </div>
                                <div className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
                                    <div className="flex justify-between"><span>Faturamento:</span> <span className="font-mono text-slate-900 dark:text-slate-200 font-bold">{ficha.faturamentoMesTotal.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</span></div>
                                    <div className="flex justify-between"><span>Impostos:</span> <span className="font-mono">{ficha.totalImpostos.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}</span></div>
                                </div>
                             </div>
                        )) : (
                            <p className="text-slate-500 col-span-3 text-center py-4">Nenhuma ficha financeira registrada.</p>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const renderReport = () => {
        if (!selectedFicha || !selectedEmpresa) return null;
        
        const financeiro = {
            cmv: selectedFicha.cmv || 0,
            folha: selectedFicha.folha || 0,
            despesas: (selectedFicha.despesas || 0) + (selectedFicha.despesasDedutiveis || 0),
        };
        const itensAvulsos = selectedFicha.itensAvulsos || [];
        const resultadoCalculado = calcularLucro(convertFichaToInput(selectedFicha, selectedEmpresa));
        const [ano, mes] = selectedFicha.mesReferencia.split('-');
        const dateObj = new Date(parseInt(ano), parseInt(mes) - 1, 1);
        const mesExtenso = dateObj.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

        // Cálculos para exibição de Bases no Relatório
        const baseIrpjCsll = selectedFicha.faturamentoMesTotal - (selectedFicha.valorIpi || 0) - (selectedFicha.valorDevolucoes || 0);
        // Base PIS/COFINS Estimada (Pode variar se for Real ou Presumido, mas aqui mostramos a base líquida de ICMS para referência visual)
        const basePisCofins = baseIrpjCsll - (selectedFicha.icmsVendas || 0);

        return (
            <div className="space-y-6 animate-fade-in pb-10">
                <div className="flex items-center gap-4 print:hidden">
                    <button onClick={() => setView('details')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"><ArrowLeftIcon className="w-5 h-5" /></button>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Relatório de Apuração</h2>
                </div>

                {/* PDF Template Container */}
                <div className="bg-white text-slate-800 p-0 md:p-8 max-w-4xl mx-auto rounded-none md:rounded-xl shadow-none md:shadow-lg overflow-hidden">
                    
                    {/* Header Report */}
                    <div className="flex justify-between items-start border-b-4 border-sky-600 pb-6 mb-8">
                        <div>
                            <h1 className="text-3xl font-black text-slate-800 tracking-tight">MEMÓRIA DE APURAÇÃO</h1>
                            <p className="text-sky-600 font-bold text-sm uppercase tracking-widest mt-1">SP ASSESSORIA CONTÁBIL • AUDITORIA E PLANEJAMENTO</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] text-slate-400 uppercase font-bold">Enquadramento Aplicado</p>
                            <p className="text-xl font-black text-sky-800 uppercase leading-none">{selectedFicha.regime}</p>
                            <p className="text-sm font-bold text-slate-500 uppercase mt-1">{mesExtenso}</p>
                        </div>
                    </div>

                    <div className="flex justify-between items-center bg-slate-50 rounded-2xl p-6 mb-8 border border-slate-100">
                        <div>
                            <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Empresa / Contribuinte</p>
                            <h2 className="text-xl font-black text-slate-800">{selectedEmpresa.nome}</h2>
                            <span className="inline-block bg-sky-100 text-sky-800 text-xs font-mono font-bold px-2 py-1 rounded mt-1">{selectedEmpresa.cnpj}</span>
                        </div>
                        <div className="bg-sky-600 text-white px-6 py-4 rounded-xl text-center shadow-lg transform -rotate-1">
                            <p className="text-[10px] font-bold opacity-80 uppercase">Carga Tributária Efetiva</p>
                            <p className="text-3xl font-black">{resultadoCalculado.cargaTributaria.toFixed(2)}%</p>
                            <p className="text-[9px] font-bold opacity-80 uppercase">Sobre Faturamento Bruto</p>
                        </div>
                    </div>

                    <div className="mb-6 flex items-center gap-2">
                        <div className="bg-sky-800 text-white p-2 rounded-lg">
                            <BuildingIcon className="w-5 h-5" />
                        </div>
                        <h3 className="text-lg font-black text-slate-800 uppercase">1. Fluxo Operacional de Receitas e Custos</h3>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Receitas */}
                        <div className="bg-white border-2 border-slate-100 rounded-[2rem] p-8 shadow-sm">
                            <h4 className="text-xs font-black text-slate-400 uppercase mb-6 border-b pb-2">Receitas Operacionais Brutas</h4>
                            <div className="space-y-2">
                                {selectedFicha.faturamentoMesComercio > 0 && <div className="flex justify-between text-sm font-bold text-slate-600"><span>Comércio (Matriz+Filial):</span><span>R$ {selectedFicha.faturamentoMesComercio.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span></div>}
                                {selectedFicha.faturamentoMesIndustria > 0 && <div className="flex justify-between text-sm font-bold text-slate-600"><span>Indústria (Matriz+Filial):</span><span>R$ {selectedFicha.faturamentoMesIndustria.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span></div>}
                                {selectedFicha.faturamentoMesServico > 0 && <div className="flex justify-between text-sm font-bold text-slate-600"><span>Serviços ISS Próprio (Matriz+Filial):</span><span>R$ {selectedFicha.faturamentoMesServico.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span></div>}
                                {selectedFicha.faturamentoMesServicoRetido > 0 && <div className="flex justify-between text-sm font-bold text-slate-600"><span>Serviços ISS Retido (Matriz+Filial):</span><span>R$ {selectedFicha.faturamentoMesServicoRetido.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span></div>}
                                {selectedFicha.faturamentoMesLocacao > 0 && <div className="flex justify-between text-sm font-bold text-slate-600"><span>Locação de Bens (Matriz+Filial):</span><span>R$ {selectedFicha.faturamentoMesLocacao.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span></div>}
                                {selectedFicha.faturamentoMesServicoHospitalar > 0 && <div className="flex justify-between text-sm font-bold text-slate-600"><span>Serviços Hospitalares (Matriz+Filial):</span><span>R$ {selectedFicha.faturamentoMesServicoHospitalar.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span></div>}
                                {selectedFicha.receitaFinanceira > 0 && <div className="flex justify-between text-sm font-bold text-amber-600"><span>(+) Receita Financeira:</span><span>R$ {selectedFicha.receitaFinanceira.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span></div>}
                                
                                {/* Deduções e Bases */}
                                {(selectedFicha.valorIpi > 0 || selectedFicha.valorDevolucoes > 0) && (
                                    <div className="pt-2 mt-2 border-t border-dashed border-slate-200">
                                        {selectedFicha.valorIpi > 0 && <div className="flex justify-between text-xs font-bold text-red-400 italic"><span>(-) Dedução IPI:</span><span>R$ {selectedFicha.valorIpi.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span></div>}
                                        {selectedFicha.valorDevolucoes > 0 && <div className="flex justify-between text-xs font-bold text-red-400 italic"><span>(-) Dedução Devoluções:</span><span>R$ {selectedFicha.valorDevolucoes.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span></div>}
                                    </div>
                                )}

                                <div className="flex justify-between text-base font-black text-slate-800 border-t pt-4 mt-2">
                                    <span>Base Cálculo IRPJ/CSLL:</span>
                                    <span>R$ {baseIrpjCsll.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                                </div>

                                {selectedFicha.icmsVendas > 0 && (
                                    <div className="flex justify-between text-xs font-bold text-blue-400 italic mt-1">
                                        <span>(-) Ded. ICMS s/ Vendas (STF):</span>
                                        <span>R$ {selectedFicha.icmsVendas.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                                    </div>
                                )}

                                <div className="flex justify-between text-sm font-black text-slate-700 mt-2">
                                    <span>Base Cálculo PIS/COFINS:</span>
                                    <span>R$ {basePisCofins.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                                </div>
                            </div>
                        </div>

                        {/* Custos, Gastos e IMPOSTOS */}
                        <div className="bg-white border-2 border-slate-100 rounded-[2rem] p-8 shadow-sm">
                            <h4 className="text-xs font-black text-slate-400 uppercase mb-6 border-b pb-2">Custos, Gastos e Impostos</h4>
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

                                {/* Detalhamento de Impostos - Lista Completa */}
                                <div className="pt-4 mt-2 border-t border-slate-100 space-y-2">
                                    {resultadoCalculado.detalhamento.map((det, idx) => (
                                        <div key={idx} className="flex justify-between text-sm font-bold text-amber-600">
                                            <span>{det.imposto}:</span>
                                            <span>R$ {det.valor.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                                        </div>
                                    ))}
                                    {resultadoCalculado.detalhamento.length === 0 && (
                                        <p className="text-xs text-slate-400 italic">Nenhum imposto apurado.</p>
                                    )}
                                </div>

                                <div className="flex justify-between text-base font-black text-sky-900 border-t border-sky-100 pt-4 mt-2">
                                    <span>Total Desembolsos:</span>
                                    <span>R$ {(financeiro.cmv + financeiro.folha + financeiro.despesas + itensAvulsos.filter(i => i.tipo === 'despesa').reduce((a, b) => a + b.valor, 0) + resultadoCalculado.totalImpostos).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    if (loading) return <LoadingSpinner />;

    return (
        <div className="pb-10">
            {view === 'list' && renderList()}
            {view === 'new_company' && renderNewCompany()}
            {view === 'details' && renderDetails()}
            {view === 'new_ficha' && renderNewFicha()}
            {view === 'report' && renderReport()}
        </div>
    );
};

export default LucroPresumidoRealDashboard;
