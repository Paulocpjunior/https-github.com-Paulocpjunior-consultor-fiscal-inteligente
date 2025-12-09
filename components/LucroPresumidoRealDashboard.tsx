
import React, { useState, useEffect, useMemo } from 'react';
import { LucroPresumidoEmpresa, User, FichaFinanceiraRegistro, SearchType, LucroInput, LucroResult, IssConfig } from '../types';
import * as lucroService from '../services/lucroPresumidoService';
import { calcularLucro } from '../services/lucroService';
import { fetchCnpjFromBrasilAPI } from '../services/externalApiService';
import { CalculatorIcon, BuildingIcon, SearchIcon, DownloadIcon, DocumentTextIcon, PlusIcon, TrashIcon, EyeIcon, ArrowLeftIcon, SaveIcon, ShieldIcon, InfoIcon, UserIcon } from './Icons';
import LoadingSpinner from './LoadingSpinner';
import Tooltip from './Tooltip';

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
        // Novos campos de retenção
        retencaoPisCofins: 0,
        retencaoIrpj: 0,
        retencaoCsll: 0
    });

    // Resultado Calculado em Tempo Real
    const [resultadoCalculado, setResultadoCalculado] = useState<LucroResult | null>(null);

    const isMasterAdmin = currentUser?.email === MASTER_ADMIN_EMAIL || currentUser?.role === 'admin';

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
                setFinanceiro({
                    acumuladoAno: registro.acumuladoAno,
                    faturamentoMesComercio: registro.faturamentoMesComercio,
                    faturamentoMesServico: registro.faturamentoMesServico,
                    faturamentoMonofasico: registro.faturamentoMonofasico || 0,
                    despesas: registro.despesas,
                    despesasDedutiveis: registro.despesasDedutiveis || 0,
                    folha: registro.folha,
                    cmv: registro.cmv,
                    // Load Retentions
                    retencaoPisCofins: registro.retencaoPisCofins || 0,
                    retencaoIrpj: registro.retencaoIrpj || 0,
                    retencaoCsll: registro.retencaoCsll || 0
                });
                if (registro.regime) setRegimeSelecionado(registro.regime);
                if (registro.periodoApuracao) setPeriodoApuracao(registro.periodoApuracao);
                // Carrega configuração de Equiparação Hospitalar se existir no registro, senão usa o padrão da empresa
                if (registro.isEquiparacaoHospitalar !== undefined) {
                    setIsEquiparacaoHospitalar(registro.isEquiparacaoHospitalar);
                } else {
                    // Fallback para config da empresa se registro antigo
                    setIsEquiparacaoHospitalar(!!empresa.isEquiparacaoHospitalar);
                }

                // Restaurar config de ISS se salvo
                if (registro.issTipo) {
                    setIssConfig(prev => ({
                        ...prev,
                        tipo: registro.issTipo || 'aliquota_municipal',
                        aliquota: registro.issTipo === 'aliquota_municipal' ? (registro.issValorOuAliquota || 5) : prev.aliquota,
                        valorPorSocio: registro.issTipo === 'sup_fixo' ? (registro.issValorOuAliquota || 0) : prev.valorPorSocio
                    }));
                }
            } else {
                // Reset fields for new month
                setFinanceiro({
                    acumuladoAno: 0, faturamentoMesComercio: 0, faturamentoMesServico: 0, faturamentoMonofasico: 0,
                    despesas: 0, despesasDedutiveis: 0, folha: 0, cmv: 0,
                    retencaoPisCofins: 0, retencaoIrpj: 0, retencaoCsll: 0
                });
                // Default settings from company profile
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
            // Passar Retenções para o Cálculo
            retencaoPisCofins: financeiro.retencaoPisCofins,
            retencaoIrpj: financeiro.retencaoIrpj,
            retencaoCsll: financeiro.retencaoCsll,
            // Configurações Especiais
            isEquiparacaoHospitalar
        };
        const result = calcularLucro(input);
        setResultadoCalculado(result);
    }, [financeiro, regimeSelecionado, periodoApuracao, issConfig, isEquiparacaoHospitalar]);

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
        setEmpresa({ nome: '', cnpj: '', nomeFantasia: '', cnaePrincipal: undefined, cnaesSecundarios: [], endereco: '', regimePadrao: 'Presumido' });
        setTiposAtividade({ comercio: true, industria: false, servico: false });
        setFinanceiro({ 
            acumuladoAno: 0, faturamentoMesComercio: 0, faturamentoMesServico: 0, faturamentoMonofasico: 0, 
            despesas: 0, despesasDedutiveis: 0, folha: 0, cmv: 0,
            retencaoPisCofins: 0, retencaoIrpj: 0, retencaoCsll: 0
        });
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
            // Saving Retentions
            retencaoPisCofins: financeiro.retencaoPisCofins,
            retencaoIrpj: financeiro.retencaoIrpj,
            retencaoCsll: financeiro.retencaoCsll,
            // Saving Config
            isEquiparacaoHospitalar: isEquiparacaoHospitalar
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
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            
            // --- HEADER SP Assessoria Contábil ---
            doc.setFillColor(10, 40, 90); // Azul Escuro Institucional
            doc.rect(0, 0, pageWidth, 40, 'F');
            
            // Logo Text
            doc.setFontSize(22);
            doc.setTextColor(255);
            doc.setFont("helvetica", "bold");
            doc.text("SP ASSESSORIA CONTÁBIL", pageWidth / 2, 20, { align: 'center' });
            
            // Subtítulo Autoria
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.text("Desenvolvido BY SP Contábil", pageWidth / 2, 28, { align: 'center' });

            // Título do Relatório
            doc.setTextColor(0);
            doc.setFontSize(16);
            doc.setFont("helvetica", "bold");
            let titleY = 55;
            doc.text(`EXTRATO DE APURAÇÃO - ${regimeSelecionado.toUpperCase()}`, pageWidth / 2, titleY, { align: 'center' });

            // Dados da Empresa e Emissão
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            
            const leftX = 20;
            const rightX = pageWidth - 20;
            let infoY = 70;

            doc.setFont("helvetica", "bold");
            doc.text("Empresa:", leftX, infoY);
            doc.setFont("helvetica", "normal");
            doc.text(empresa.nome || '', leftX + 20, infoY);

            doc.setFont("helvetica", "bold");
            doc.text("CNPJ:", rightX - 50, infoY);
            doc.setFont("helvetica", "normal");
            doc.text(empresa.cnpj || '', rightX, infoY, { align: 'right' });

            infoY += 6;
            doc.setFont("helvetica", "bold");
            doc.text("Competência:", leftX, infoY);
            doc.setFont("helvetica", "normal");
            doc.text(`${mesReferencia} (${periodoApuracao})`, leftX + 25, infoY);

            doc.setFont("helvetica", "bold");
            doc.text("Emitido por:", rightX - 60, infoY);
            doc.setFont("helvetica", "normal");
            doc.text(currentUser.name, rightX, infoY, { align: 'right' });

            infoY += 6;
            const now = new Date();
            const dataEmissao = now.toLocaleDateString('pt-BR') + ' às ' + now.toLocaleTimeString('pt-BR');
            doc.setFont("helvetica", "bold");
            doc.text("Emissão:", rightX - 60, infoY);
            doc.setFont("helvetica", "normal");
            doc.text(dataEmissao, rightX, infoY, { align: 'right' });

            // --- Lógica de RETIFICADO ---
            // Verifica se JÁ existe um registro salvo no banco para este mês
            const registroSalvo = empresa.fichaFinanceira?.find(f => f.mesReferencia === mesReferencia);
            
            if (registroSalvo) {
                // Se existe registro, consideramos que é uma retificação ou visualização de algo já calculado
                const dataRetificacao = new Date(registroSalvo.dataRegistro).toLocaleString('pt-BR');
                
                infoY += 12;
                // Caixa de Destaque
                doc.setDrawColor(200, 0, 0);
                doc.setFillColor(255, 240, 240);
                doc.roundedRect(leftX, infoY - 5, pageWidth - 40, 10, 1, 1, 'FD');
                
                doc.setTextColor(200, 0, 0); // Vermelho
                doc.setFont("helvetica", "bold");
                doc.text(`STATUS: RETIFICADO / CALCULADO EM ${dataRetificacao}`, pageWidth / 2, infoY + 1, { align: 'center' });
                doc.setTextColor(0); // Reset Black
            }

            infoY += 15;

            // --- Resumo Financeiro ---
            doc.setDrawColor(200);
            doc.setLineWidth(0.5);
            doc.line(leftX, infoY, rightX, infoY);
            infoY += 8;

            doc.setFont("helvetica", "bold");
            doc.text("Resumo Financeiro e Ajustes", leftX, infoY);
            infoY += 8;
            
            doc.setFont("helvetica", "normal");
            doc.text(`Receita Total (Período):`, leftX, infoY);
            doc.text(`${new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(totalMesVigente)}`, rightX, infoY, { align: 'right' });
            
            if(financeiro.faturamentoMonofasico > 0) {
                infoY += 6;
                doc.text(`(-) Receita Monofásica:`, leftX, infoY);
                doc.text(`${new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(financeiro.faturamentoMonofasico)}`, rightX, infoY, { align: 'right' });
            }
            if(regimeSelecionado === 'Real') {
                infoY += 6;
                doc.text(`(-) Despesas Dedutíveis (Trimestre):`, leftX, infoY);
                doc.text(`${new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(financeiro.despesasDedutiveis)}`, rightX, infoY, { align: 'right' });
            }
            // Exibir Retenções no Resumo
            if (financeiro.retencaoPisCofins > 0 || financeiro.retencaoIrpj > 0 || financeiro.retencaoCsll > 0) {
                infoY += 6;
                doc.setFont("helvetica", "bold");
                doc.text("Retenções na Fonte:", leftX, infoY);
                if (financeiro.retencaoPisCofins > 0) doc.text(`- PIS/COFINS: R$ ${new Intl.NumberFormat('pt-BR', {minimumFractionDigits: 2}).format(financeiro.retencaoPisCofins)}`, leftX + 40, infoY);
                if (financeiro.retencaoIrpj > 0) doc.text(`- IRPJ: R$ ${new Intl.NumberFormat('pt-BR', {minimumFractionDigits: 2}).format(financeiro.retencaoIrpj)}`, leftX + 90, infoY);
                if (financeiro.retencaoCsll > 0) doc.text(`- CSLL: R$ ${new Intl.NumberFormat('pt-BR', {minimumFractionDigits: 2}).format(financeiro.retencaoCsll)}`, leftX + 130, infoY);
                doc.setFont("helvetica", "normal");
            }
            
            infoY += 6;
            doc.text(`Método ISS: ${issConfig.tipo === 'sup_fixo' ? 'Fixo (SUP)' : `Variável (${issConfig.aliquota || 5}%)`}`, leftX, infoY);
            
            if (isEquiparacaoHospitalar) {
                infoY += 6;
                doc.setTextColor(0, 100, 0); // Verde Escuro
                doc.setFont("helvetica", "bold");
                doc.text(`REGIME ESPECIAL: EQUIPARAÇÃO HOSPITALAR (Base Reduzida: IRPJ 8% / CSLL 12%)`, leftX, infoY);
                doc.setTextColor(0);
                doc.setFont("helvetica", "normal");
            }

            // --- Tabela de Impostos ---
            infoY += 15;
            doc.setFont("helvetica", "bold");
            doc.text("Detalhamento de Tributos a Recolher", leftX, infoY);
            infoY += 5;
            
            // Cabeçalho Tabela
            doc.setFillColor(240, 240, 240);
            doc.rect(leftX, infoY, pageWidth - 40, 8, 'F');
            doc.setFontSize(9);
            
            const col1 = leftX + 2;
            const col2 = leftX + 70; // Base Calc
            const col3 = leftX + 105; // Aliq
            const col4 = leftX + 130; // Valor
            const col5 = leftX + 160; // Obs
            
            const textY = infoY + 5;
            doc.text("Tributo", col1, textY);
            doc.text("Base Calc.", col2, textY, { align: 'right' });
            doc.text("Alíq.", col3, textY, { align: 'center' });
            doc.text("Valor a Recolher", col4, textY, { align: 'right' });
            doc.text("Observações", col5, textY);
            
            infoY += 10;

            doc.setFont("helvetica", "normal");
            resultadoCalculado.detalhamento.forEach(item => {
                doc.text(item.imposto, col1, infoY);
                doc.text(new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(item.baseCalculo), col2, infoY, { align: 'right' });
                doc.text(`${item.aliquota.toFixed(2)}%`, col3, infoY, { align: 'center' });
                doc.text(new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(item.valor), col4, infoY, { align: 'right' });
                
                let obsText = item.observacao || '';
                if (item.cotaInfo && item.cotaInfo.disponivel) {
                    obsText += ` | Opção: 3 Cotas de ${new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(item.cotaInfo.valorPrimeiraCota)}`;
                }
                
                if(obsText) {
                    const obsLines = doc.splitTextToSize(obsText, 45);
                    doc.text(obsLines, col5, infoY);
                    // Adjust spacing based on lines
                    infoY += (Math.max(1, obsLines.length) * 5) + 3; 
                } else {
                    infoY += 8;
                }
            });

            infoY += 5;
            doc.setDrawColor(0);
            doc.setLineWidth(0.5);
            doc.line(leftX, infoY, rightX, infoY);
            infoY += 8;
            
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.text(`TOTAL A RECOLHER:`, rightX - 60, infoY);
            doc.text(`${new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(resultadoCalculado.totalImpostos)}`, rightX, infoY, { align: 'right' });
            
            infoY += 6;
            doc.setFontSize(10);
            doc.setFont("helvetica", "normal");
            doc.text(`Carga Tributária Efetiva: ${resultadoCalculado.cargaTributaria.toFixed(2)}%`, rightX, infoY, { align: 'right' });

            // --- Footer ---
            const footerY = pageHeight - 15;
            doc.setFontSize(8);
            doc.setTextColor(100);
            doc.line(leftX, footerY - 5, rightX, footerY - 5);
            doc.text("SP Assessoria Contábil - Soluções Inteligentes", leftX, footerY);
            doc.text("Desenvolvido BY SP Contabil", pageWidth / 2, footerY, { align: 'center' });
            doc.text(`Página 1/1`, rightX, footerY, { align: 'right' });

            doc.save(`extrato-${empresa.nome}-${mesReferencia}.pdf`);
        } catch (e) {
            console.error(e);
        } finally {
            setIsExporting(false);
        }
    };

    const toggleTipoAtividade = (type: 'comercio' | 'industria' | 'servico') => {
        setTiposAtividade(prev => ({ ...prev, [type]: !prev[type] }));
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

                    {/* Selector de Regime e Período */}
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
                            {periodoApuracao === 'Trimestral' && (
                                <p className="text-[10px] text-sky-600 mt-2 font-bold text-center">
                                    * Informe os valores ACUMULADOS do trimestre. Limite Adicional IRPJ sobe para R$ 60k.
                                </p>
                            )}
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
                                {/* Checkbox Equiparação Hospitalar - Só aparece para serviços */}
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
                        
                        {/* Novo Campo: Receita Monofásica */}
                        <CurrencyInput 
                            label="Receita Monofásica (Isenta PIS/COFINS)" 
                            tooltip="Valor da receita de produtos com tributação monofásica (ex: bebidas frias, autopeças). Este valor será deduzido da base de cálculo de PIS/COFINS."
                            value={financeiro.faturamentoMonofasico} 
                            onChange={v => setFinanceiro(prev => ({ ...prev, faturamentoMonofasico: v }))} 
                            className="bg-green-50/50 p-2 rounded border border-green-100"
                        />

                        {/* SEÇÃO DE RETENÇÕES NA FONTE */}
                        <div className="border-t border-slate-200 dark:border-slate-600 my-2 pt-2"></div>
                        <p className="text-xs font-bold text-red-600 dark:text-red-400 mb-2 uppercase">Retenções na Fonte (Créditos)</p>
                        
                        <CurrencyInput 
                            label="Retenção PIS/COFINS (CSRF)" 
                            tooltip="Valor retido na fonte (normalmente 4,65%). Será deduzido do PIS e COFINS a pagar."
                            value={financeiro.retencaoPisCofins} 
                            onChange={v => setFinanceiro(prev => ({ ...prev, retencaoPisCofins: v }))}
                            className="mb-2"
                        />
                        <div className="grid grid-cols-2 gap-4">
                            <CurrencyInput 
                                label="Retenção IRPJ" 
                                tooltip="Valor retido de IRPJ (ex: 1.5%). Será deduzido do IRPJ final."
                                value={financeiro.retencaoIrpj} 
                                onChange={v => setFinanceiro(prev => ({ ...prev, retencaoIrpj: v }))} 
                            />
                            <CurrencyInput 
                                label="Retenção CSLL" 
                                tooltip="Valor retido de CSLL (ex: 1.0%). Será deduzido da CSLL final."
                                value={financeiro.retencaoCsll} 
                                onChange={v => setFinanceiro(prev => ({ ...prev, retencaoCsll: v }))} 
                            />
                        </div>

                        <div className="border-t border-slate-200 dark:border-slate-600 my-2 pt-2"></div>
                        <p className="text-xs font-bold text-sky-600 mb-2 uppercase">Custos e Despesas</p>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <CurrencyInput label="Despesas Operacionais" value={financeiro.despesas} onChange={v => setFinanceiro(prev => ({ ...prev, despesas: v }))} />
                            <CurrencyInput label="Folha de Pagamento" value={financeiro.folha} onChange={v => setFinanceiro(prev => ({ ...prev, folha: v }))} />
                        </div>
                        
                        {/* Novo Campo: Despesas Dedutíveis */}
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
                    </div>

                    {/* Resumo de Impostos (Tabela Detalhada) */}
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
        </div>
    );
};

export default LucroPresumidoRealDashboard;
