

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { SimplesNacionalEmpresa, SimplesNacionalNota, SearchResult, SimplesNacionalAnexo } from '../types';
import * as simplesService from '../services/simplesNacionalService';
import { fetchSimplesNacionalExplanation, fetchCnaeDescription } from '../services/geminiService';
import LoadingSpinner from './LoadingSpinner';
import { FormattedText } from './FormattedText';
import { ArrowLeftIcon, CloseIcon, EyeIcon, InfoIcon, ShieldIcon, TrashIcon, SaveIcon } from './Icons';
import SimpleChart from './SimpleChart';
import { ANEXOS_TABELAS } from '../services/simplesNacionalService';

interface SimplesNacionalDetalheProps {
    empresa: SimplesNacionalEmpresa;
    notas: SimplesNacionalNota[];
    onBack: () => void;
    onImport: (empresaId: string, file: File) => Promise<{count: number, error?: string}>;
    onUpdateFolha12: (empresaId: string, folha12: number) => SimplesNacionalEmpresa | null;
    onSaveFaturamentoManual: (empresaId: string, faturamento: { [key: string]: number }) => SimplesNacionalEmpresa | null;
    onUpdateEmpresa: (empresaId: string, data: Partial<SimplesNacionalEmpresa>) => SimplesNacionalEmpresa | null;
    onShowClienteView: () => void;
}

const getMesesApuracaoOptions = (): Date[] => {
    const options = [];
    const today = new Date();
    today.setDate(1); // Normaliza para o primeiro dia do mês
    
    // Gera opções para os próximos 12 meses e os últimos 24 meses
    // Total: 36 meses de flexibilidade
    for (let i = -12; i < 24; i++) {
        const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
        options.push(date);
    }
    return options;
};

const getPeriodoManual = (mesApuracao: Date): Date[] => {
    const period = [];
    const dataInicioPeriodo = new Date(mesApuracao.getFullYear(), mesApuracao.getMonth() - 12, 1);
     for (let i = 0; i < 12; i++) {
        const date = new Date(dataInicioPeriodo.getFullYear(), dataInicioPeriodo.getMonth() + i, 1);
        period.push(date);
    }
    return period;
}

const EditEmpresaModal: React.FC<{
    empresa: SimplesNacionalEmpresa;
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: Partial<SimplesNacionalEmpresa>) => void;
}> = ({ empresa, isOpen, onClose, onSave }) => {
    const [formData, setFormData] = useState({
        nome: empresa.nome,
        cnpj: empresa.cnpj,
        cnae: empresa.cnae,
        anexo: empresa.anexo,
    });

    useEffect(() => {
        setFormData({
            nome: empresa.nome,
            cnpj: empresa.cnpj,
            cnae: empresa.cnae,
            anexo: empresa.anexo,
        });
    }, [empresa]);

    if (!isOpen) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-4 border-b dark:border-slate-700">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Editar Empresa</h3>
                    <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
                        <CloseIcon className="w-5 h-5" />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Nome</label>
                        <input type="text" name="nome" value={formData.nome} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md dark:bg-slate-700 dark:border-slate-600" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">CNPJ</label>
                        <input type="text" name="cnpj" value={formData.cnpj} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md dark:bg-slate-700 dark:border-slate-600" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">CNAE</label>
                        <input type="text" name="cnae" value={formData.cnae} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md dark:bg-slate-700 dark:border-slate-600" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Anexo</label>
                        <select name="anexo" value={formData.anexo} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md dark:bg-slate-700 dark:border-slate-600">
                            <option value="I">Anexo I</option>
                            <option value="II">Anexo II</option>
                            <option value="III">Anexo III</option>
                            <option value="IV">Anexo IV</option>
                            <option value="V">Anexo V</option>
                            <option value="III_V">Anexo III/V (Fator R)</option>
                        </select>
                    </div>
                    <div className="flex justify-end pt-4">
                        <button type="button" onClick={onClose} className="mr-2 px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-md dark:text-slate-300 dark:hover:bg-slate-700">Cancelar</button>
                        <button type="submit" className="px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700">Salvar</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const SimplesNacionalDetalhe: React.FC<SimplesNacionalDetalheProps> = ({ empresa, notas, onBack, onImport, onUpdateFolha12, onSaveFaturamentoManual, onUpdateEmpresa, onShowClienteView }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const [importSuccess, setImportSuccess] = useState<string | null>(null);
    const [chatPergunta, setChatPergunta] = useState('');
    const [chatResult, setChatResult] = useState<SearchResult | null>(null);
    const [isChatLoading, setIsChatLoading] = useState(false);
    const [folha12, setFolha12] = useState(empresa.folha12.toString());
    const [folhaSuccess, setFolhaSuccess] = useState('');
    
    // State for CNAE validation modal
    const [isCnaeModalOpen, setIsCnaeModalOpen] = useState(false);
    const [cnaeValidationResult, setCnaeValidationResult] = useState<SearchResult | null>(null);
    const [isCnaeLoading, setIsCnaeLoading] = useState(false);
    const [cnaeError, setCnaeError] = useState<string | null>(null);

    // State for Edit Empresa Modal
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    // State for Manual Invoicing
    const [mesApuracao, setMesApuracao] = useState(new Date());
    
    // Apuração do mês vigente input state
    const [faturamentoMesVigente, setFaturamentoMesVigente] = useState('');

    // Formatar valores iniciais para exibição com máscara
    const [manualFaturamento, setManualFaturamento] = useState<{ [key: string]: string }>(
      Object.fromEntries(
          Object.entries(empresa.faturamentoManual || {}).map(([key, value]) => [
              key, 
              new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value as number)
          ])
      )
    );
    const [manualSuccess, setManualSuccess] = useState('');
    
    // Estado para histórico salvo
    const [saveCalculoSuccess, setSaveCalculoSuccess] = useState('');


    useEffect(() => {
        setFolha12(empresa.folha12.toString());
        setManualFaturamento(
            Object.fromEntries(
                Object.entries(empresa.faturamentoManual || {}).map(([key, value]) => [
                    key, 
                    new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value as number)
                ])
            )
        );
    }, [empresa]);
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    const resumo = useMemo(() => {
        return simplesService.calcularResumoEmpresa(empresa, notas, mesApuracao);
    }, [empresa, notas, mesApuracao]);
    
    // Sincronizar o input do mês vigente com o manualFaturamento
    useEffect(() => {
        const mesChave = `${mesApuracao.getFullYear()}-${(mesApuracao.getMonth() + 1).toString().padStart(2, '0')}`;
        setFaturamentoMesVigente(manualFaturamento[mesChave] || '');
    }, [mesApuracao, manualFaturamento]);


    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsLoading(true);
        setImportError(null);
        setImportSuccess(null);

        const result = await onImport(empresa.id, file);

        if (result.error) {
            setImportError(result.error);
        } else {
            setImportSuccess(`${result.count} nota(s) importada(s) com sucesso.`);
        }
        
        if(fileInputRef.current) {
            fileInputRef.current.value = "";
        }
        setIsLoading(false);
    };

    const handleFolhaSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const valor = parseFloat(folha12.replace(',', '.'));
        if (!isNaN(valor)) {
            onUpdateFolha12(empresa.id, valor);
            setFolhaSuccess('Folha 12 meses atualizada com sucesso.');
            setTimeout(() => setFolhaSuccess(''), 3000);
        }
    };

    const formatCurrencyInput = (value: string): string => {
        const numericValue = value.replace(/\D/g, '');
        if (!numericValue) return '';
        const floatValue = parseFloat(numericValue) / 100;
        return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(floatValue);
    }

    const handleManualFaturamentoChange = (mesChave: string, valor: string) => {
        const formatted = formatCurrencyInput(valor);
        setManualFaturamento(prev => ({ ...prev, [mesChave]: formatted }));
    };
    
    const handleFaturamentoMesVigenteChange = (valor: string) => {
        const mesChave = `${mesApuracao.getFullYear()}-${(mesApuracao.getMonth() + 1).toString().padStart(2, '0')}`;
        const formatted = formatCurrencyInput(valor);
        setManualFaturamento(prev => ({ ...prev, [mesChave]: formatted }));
        // A atualização do estado manualFaturamento já vai disparar o recálculo do resumo
    };

    const saveAllManualFaturamento = () => {
        const faturamentoNumerico = Object.fromEntries(
            Object.entries(manualFaturamento)
                .map(([key, value]): [string, number] => {
                    const cleanValue = (value as string).replace(/\./g, '').replace(',', '.');
                    return [key, parseFloat(cleanValue)];
                })
                .filter(([, value]) => !isNaN(value))
        );
        onSaveFaturamentoManual(empresa.id, faturamentoNumerico);
    }
    
    const handleManualFaturamentoSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        saveAllManualFaturamento();
        setManualSuccess('Faturamento manual salvo com sucesso.');
        setTimeout(() => setManualSuccess(''), 3000);
    };
    
    // Salvar automaticamente ao alterar o mês vigente (debounce ou blur seria melhor, mas simples serve aqui)
    const handleMesVigenteBlur = () => {
        saveAllManualFaturamento();
    };

    const handleSaveCalculo = () => {
        const updatedEmpresa = simplesService.saveHistoricoCalculo(empresa.id, resumo, mesApuracao);
        if (updatedEmpresa) {
            onUpdateEmpresa(empresa.id, { historicoCalculos: updatedEmpresa.historicoCalculos });
            setSaveCalculoSuccess('Apuração salva no histórico!');
            setTimeout(() => setSaveCalculoSuccess(''), 3000);
        }
    };
    
    const handleDeleteCalculo = (calculoId: string) => {
        const novosCalculos = empresa.historicoCalculos?.filter(c => c.id !== calculoId);
        onUpdateEmpresa(empresa.id, { historicoCalculos: novosCalculos });
    };

    const handleGerarDasPdf = async () => {
        try {
            const { default: jsPDF } = await import('jspdf');
            
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            
            // Header Page 1
            doc.setFontSize(18);
            doc.setTextColor(14, 165, 233); // Sky 600
            doc.text('Memória de Cálculo - DAS', pageWidth / 2, 20, { align: 'center' });
            
            doc.setFontSize(12);
            doc.setTextColor(0);
            doc.text(`Empresa: ${empresa.nome}`, 20, 40);
            doc.text(`CNPJ: ${empresa.cnpj}`, 20, 48);
            doc.text(`Período de Apuração: ${mesApuracao.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}`, 20, 56);

            // Linha divisória
            doc.setDrawColor(200);
            doc.line(20, 65, pageWidth - 20, 65);

            // Dados de Cálculo
            doc.setFontSize(14);
            doc.text('Base de Cálculo', 20, 75);
            
            doc.setFontSize(10);
            doc.text('Receita Bruta 12 Meses (RBT12):', 20, 85);
            doc.text(`R$ ${resumo.rbt12.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth - 20, 85, { align: 'right' });
            
            doc.text('Faturamento do Mês:', 20, 92);
            doc.text(`R$ ${resumo.das_mensal > 0 ? (resumo.das_mensal / (resumo.aliq_eff / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '0,00'}`, pageWidth - 20, 92, { align: 'right' });
            
            if (resumo.ultrapassou_sublimite) {
                doc.setTextColor(220, 38, 38); // Red
                doc.text('ALERTA: RBT12 excedeu o Sub-limite de R$ 3.600.000,00.', 20, 102);
                doc.text('ICMS/ISS recolhidos fora do DAS.', 20, 107);
                doc.setTextColor(0);
            }

            doc.line(20, 115, pageWidth - 20, 115);

            // Alíquotas
            doc.setFontSize(14);
            doc.text('Apuração da Alíquota', 20, 125);
            
            doc.setFontSize(10);
            doc.text('Anexo Aplicado:', 20, 135);
            doc.text(`Anexo ${resumo.anexo_efetivo}`, pageWidth - 20, 135, { align: 'right' });
            
            if (empresa.anexo === 'III_V') {
                doc.text('Fator R:', 20, 142);
                doc.text(`${(resumo.fator_r * 100).toFixed(2)}%`, pageWidth - 20, 142, { align: 'right' });
            }
            
            doc.text('Alíquota Efetiva Calculada:', 20, 149);
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.text(`${resumo.aliq_eff.toFixed(4)}%`, pageWidth - 20, 149, { align: 'right' });
            doc.setFont("helvetica", "normal");

            doc.setDrawColor(0);
            doc.setLineWidth(0.5);
            doc.rect(20, 160, pageWidth - 40, 30);
            
            doc.setFontSize(16);
            doc.text('Valor a Pagar (DAS)', pageWidth / 2, 172, { align: 'center' });
            doc.setFontSize(22);
            doc.setTextColor(14, 165, 233);
            doc.text(`R$ ${resumo.das_mensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, pageWidth / 2, 185, { align: 'center' });
            
            doc.setFontSize(8);
            doc.setTextColor(100);
            doc.text(`Página 1/2`, pageWidth - 20, 280, { align: 'right' });
            doc.text('Documento gerado pelo Consultor Fiscal Inteligente - SP Assessoria', pageWidth / 2, 280, { align: 'center' });

            // Add Page 2: Detalhamento RBT12
            doc.addPage();

            // Header Page 2
            doc.setFontSize(16);
            doc.setTextColor(14, 165, 233); // Sky 600
            doc.text('Detalhamento da Receita Bruta (RBT12)', pageWidth / 2, 20, { align: 'center' });

            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text('Histórico dos últimos 12 meses anteriores à apuração', pageWidth / 2, 26, { align: 'center' });
            
            doc.setFontSize(12);
            doc.setTextColor(0);
            
            // Table Setup
            let startY = 40;
            const col1X = 30;
            const col2X = pageWidth - 30;
            const rowHeight = 10;
            
            // Table Header
            doc.setFillColor(240, 245, 250); // Light blueish gray
            doc.rect(20, startY - 6, pageWidth - 40, 10, 'F');
            doc.setFont("helvetica", "bold");
            doc.text('Competência', col1X, startY);
            doc.text('Receita Bruta', col2X, startY, { align: 'right' });
            
            startY += rowHeight;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(11);

            // Data Rows
            const dataInicioPeriodoRBT12 = new Date(mesApuracao.getFullYear(), mesApuracao.getMonth() - 12, 1);
            let totalCalculado = 0;

            for (let i = 0; i < 12; i++) {
                const mesIteracao = new Date(dataInicioPeriodoRBT12.getFullYear(), dataInicioPeriodoRBT12.getMonth() + i, 1);
                const mesChave = `${mesIteracao.getFullYear()}-${(mesIteracao.getMonth() + 1).toString().padStart(2, '0')}`;
                const valor = resumo.mensal[mesChave] || 0;
                totalCalculado += valor;

                const mesLabel = mesIteracao.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
                const mesLabelCapitalized = mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1);
                
                // Striping for readability
                if (i % 2 === 1) {
                   doc.setFillColor(250, 250, 250);
                   doc.rect(20, startY - 6, pageWidth - 40, 10, 'F');
                }

                doc.text(mesLabelCapitalized, col1X, startY);
                doc.text(`R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, col2X, startY, { align: 'right' });
                
                startY += rowHeight;
            }

            // Total Row
            startY += 2;
            doc.setDrawColor(14, 165, 233);
            doc.setLineWidth(0.5);
            doc.line(20, startY - 8, pageWidth - 20, startY - 8);
            
            doc.setFont("helvetica", "bold");
            doc.setFontSize(12);
            doc.text('TOTAL ACUMULADO (RBT12)', col1X, startY);
            doc.text(`R$ ${totalCalculado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, col2X, startY, { align: 'right' });
            
            // Footer Page 2
            doc.setFontSize(8);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(100);
            doc.text(`Página 2/2 • ${empresa.nome}`, pageWidth / 2, 280, { align: 'center' });
            
            doc.save(`memoria-calculo-${empresa.nome}-${mesApuracao.toISOString().slice(0,7)}.pdf`);
            
            // Salvar automaticamente ao gerar o PDF
            handleSaveCalculo();
            
        } catch (e) {
            console.error('Erro ao gerar PDF', e);
            alert('Não foi possível gerar o PDF.');
        }
    };

    const handleChatSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatPergunta.trim()) return;

        setIsChatLoading(true);
        setChatResult(null);
        try {
            const result = await fetchSimplesNacionalExplanation(empresa, resumo, chatPergunta);
            setChatResult(result);
        } catch (error: any) {
            setChatResult({ text: `Erro ao consultar o assistente: ${error.message}`, sources: [], query: chatPergunta });
        } finally {
            setIsChatLoading(false);
        }
    };

    const handleValidateCnae = async () => {
        setIsCnaeLoading(true);
        setCnaeError(null);
        setCnaeValidationResult(null);
        setIsCnaeModalOpen(true);
        try {
            const result = await fetchCnaeDescription(empresa.cnae);
            setCnaeValidationResult(result);
        } catch (e: any) {
            setCnaeError(e.message || 'Ocorreu um erro desconhecido.');
        } finally {
            setIsCnaeLoading(false);
        }
    };
    
    const chartData = {
        labels: Object.keys(resumo.mensal),
        datasets: [
            {
                label: 'Faturamento Mensal (R$)',
                data: Object.values(resumo.mensal),
                backgroundColor: 'rgba(59, 130, 246, 0.5)',
                borderColor: 'rgba(59, 130, 246, 1)',
                borderWidth: 1,
                order: 2
            },
             {
                label: 'DAS Estimado (R$)',
                data: Object.values(resumo.mensal).map((v: number) => v * (resumo.aliq_eff / 100)),
                type: 'line' as const,
                borderColor: 'rgba(14, 165, 233, 0.8)', // Sky 500
                borderWidth: 2,
                borderDash: [5, 5],
                pointRadius: 0,
                order: 1,
                 yAxisID: 'y',
            },
             {
                label: 'Alíquota Efetiva (%)',
                data: Array(Object.keys(resumo.mensal).length).fill(resumo.aliq_eff), // Simplificação para visualização
                type: 'line' as const,
                borderColor: 'rgba(239, 68, 68, 0.6)', // Red 500
                borderWidth: 2,
                pointRadius: 0,
                order: 0,
                yAxisID: 'y1',
            }
        ],
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: true,
                position: 'bottom' as const,
            },
            title: {
                display: true,
                text: 'Evolução do Faturamento e Carga Tributária',
            },
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
                type: 'linear' as const,
                display: true,
                position: 'left' as const,
                title: {
                    display: true,
                    text: 'Valor (R$)'
                }
            },
            y1: {
                beginAtZero: true,
                type: 'linear' as const,
                display: true,
                position: 'right' as const,
                title: {
                    display: true,
                    text: 'Alíquota (%)'
                },
                grid: {
                    drawOnChartArea: false,
                },
            },
        }
    };

    const mesesApuracaoOptions = getMesesApuracaoOptions();
    const periodoManual = getPeriodoManual(mesApuracao);

    const TabelaAnexo: React.FC = () => {
        const tabela = ANEXOS_TABELAS[resumo.anexo_efetivo];
        
        if (!tabela) return null;

        return (
            <div className="p-6 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                <h3 className="text-lg font-bold text-sky-700 dark:text-sky-400 mb-4">
                    Enquadramento Atual: Tabela do Anexo {resumo.anexo_efetivo}
                </h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
                        <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-300">
                            <tr>
                                <th className="px-4 py-2">Faixa</th>
                                <th className="px-4 py-2">Receita Bruta em 12 meses (R$)</th>
                                <th className="px-4 py-2 text-center">Alíquota Nominal</th>
                                <th className="px-4 py-2 text-right">Valor a Deduzir (R$)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tabela.map((faixa, index) => {
                                const isLast = index === tabela.length - 1;
                                const prevLimit = index > 0 ? tabela[index - 1].limite : 0;
                                const currentLimit = faixa.limite;
                                
                                // Verifica se é a faixa ativa baseada no RBT12
                                let isActive = false;
                                if (index === 0) {
                                    isActive = resumo.rbt12 <= currentLimit;
                                } else {
                                    isActive = resumo.rbt12 > prevLimit && resumo.rbt12 <= currentLimit;
                                }
                                // Se estourou a última faixa
                                if (isLast && resumo.rbt12 > currentLimit) {
                                    isActive = true; 
                                }

                                return (
                                    <tr 
                                        key={index} 
                                        className={`border-b dark:border-slate-700 ${isActive ? 'bg-emerald-50 dark:bg-emerald-900/20 border-l-4 border-l-emerald-500' : ''}`}
                                    >
                                        <td className={`px-4 py-2 ${isActive ? 'font-bold text-emerald-700 dark:text-emerald-400' : ''}`}>
                                            {index + 1}ª Faixa
                                            {isActive && <span className="ml-2 text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">Atual</span>}
                                        </td>
                                        <td className="px-4 py-2">
                                            {index === 0 
                                                ? `Até ${currentLimit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                                                : `De ${(prevLimit + 0.01).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} até ${currentLimit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                                            }
                                        </td>
                                        <td className="px-4 py-2 text-center">{faixa.aliquota.toFixed(2)}%</td>
                                        <td className="px-4 py-2 text-right">{faixa.parcela.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6 animate-fade-in">
             <div className="flex justify-between items-center">
                <button onClick={onBack} className="flex items-center gap-2 text-sm font-semibold text-sky-600 dark:text-sky-400 hover:underline">
                    <ArrowLeftIcon className="w-4 h-4" />
                    Voltar para o Painel
                </button>
                 <button onClick={onShowClienteView} className="flex items-center gap-2 text-sm font-semibold text-sky-600 dark:text-sky-400 hover:underline">
                     <EyeIcon className="w-4 h-4" />
                    Visualização do Cliente
                </button>
            </div>
            
            <div className="p-6 bg-white dark:bg-slate-800 rounded-lg shadow-sm flex justify-between items-start">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{empresa.nome}</h2>
                    <p className="mt-1 text-slate-500 dark:text-slate-400">{empresa.cnpj}</p>
                </div>
                <button onClick={() => setIsEditModalOpen(true)} className="btn-press text-sm text-sky-600 dark:text-sky-400 hover:underline">
                    Editar Empresa
                </button>
            </div>

            {/* Seção de Apuração do Mês Vigente */}
            <div className="p-6 bg-gradient-to-r from-sky-50 to-blue-50 dark:from-slate-800 dark:to-slate-800 border border-sky-100 dark:border-slate-700 rounded-lg shadow-sm">
                 <div className="flex flex-col md:flex-row justify-between md:items-end gap-6">
                    <div className="flex-grow">
                        <label htmlFor="mes-apuracao" className="block text-xs font-bold text-sky-800 dark:text-sky-300 uppercase tracking-wider mb-2">
                            Mês de Apuração
                        </label>
                        <select 
                            id="mes-apuracao"
                            value={mesApuracao.toISOString().substring(0, 7)}
                            onChange={e => setMesApuracao(new Date(e.target.value + '-02'))}
                            className="w-full md:max-w-xs pl-4 pr-10 py-2.5 bg-white dark:bg-slate-700 border border-sky-200 dark:border-slate-600 text-lg font-semibold rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-sm"
                        >
                            {mesesApuracaoOptions.map(date => (
                                <option key={date.toISOString()} value={date.toISOString().substring(0, 7)}>
                                    {date.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex-grow">
                        <label htmlFor="faturamento-vigente" className="block text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-2">
                            Faturamento do Mês (R$)
                        </label>
                        <div className="relative">
                             <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">R$</span>
                             <input 
                                type="text" 
                                id="faturamento-vigente"
                                value={faturamentoMesVigente}
                                onChange={e => handleFaturamentoMesVigenteChange(e.target.value)}
                                onBlur={handleMesVigenteBlur}
                                placeholder="0,00"
                                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-lg font-mono text-right focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-inner"
                            />
                        </div>
                    </div>

                    <div className="flex-grow p-4 bg-white dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600 text-center md:text-right">
                         <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-semibold">Valor a Recolher (DAS)</p>
                         <p className="text-2xl font-bold text-sky-600 dark:text-sky-400 mt-1">
                            R$ {resumo.das_mensal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                         </p>
                    </div>
                     <div className="flex-shrink-0 flex flex-col gap-2">
                         <button 
                            onClick={handleGerarDasPdf}
                            className="w-full md:w-auto btn-press px-6 py-3 bg-sky-600 text-white font-bold rounded-lg hover:bg-sky-700 shadow-md flex items-center justify-center gap-2"
                        >
                            <span>Gerar Extrato DAS</span>
                         </button>
                         <button 
                            onClick={handleSaveCalculo}
                            className="w-full md:w-auto btn-press px-6 py-2 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 shadow-sm flex items-center justify-center gap-2 text-sm"
                        >
                            <SaveIcon className="w-4 h-4" />
                            <span>Salvar Apuração</span>
                        </button>
                         {saveCalculoSuccess && <p className="text-center text-xs text-emerald-600 font-medium animate-fade-in">{saveCalculoSuccess}</p>}
                    </div>
                 </div>
            </div>

            {/* Alerta de Sub-limite */}
            {resumo.ultrapassou_sublimite && (
                <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border-l-4 border-orange-500 dark:border-orange-400 rounded-r-lg animate-fade-in">
                    <div className="flex items-start">
                        <ShieldIcon className="w-6 h-6 text-orange-600 dark:text-orange-400 mr-3 mt-0.5" />
                        <div>
                            <h3 className="font-bold text-orange-800 dark:text-orange-200">Atenção: Sub-limite Estadual/Municipal Excedido</h3>
                            <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">
                                O RBT12 da empresa ultrapassou R$ 3.600.000,00. O ICMS e o ISS <strong>não estão incluídos</strong> no cálculo do DAS acima e devem ser apurados e recolhidos separadamente em guias próprias (DAM/GARE), conforme a legislação estadual e municipal.
                            </p>
                        </div>
                    </div>
                </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="p-6 bg-white dark:bg-slate-800 rounded-lg shadow-sm space-y-3">
                    <h3 className="text-lg font-bold text-sky-700 dark:text-sky-400 mb-2">Dados da Empresa</h3>
                     <div className="flex justify-between items-center text-sm">
                         <span className="text-slate-500">CNAE:</span>
                         <div className="flex items-center gap-2">
                            <span className="font-semibold">{empresa.cnae}</span>
                            <button onClick={handleValidateCnae} title="Validar CNAE com fonte oficial" className="btn-press text-slate-400 hover:text-sky-600 dark:hover:text-sky-400">
                                <InfoIcon className="w-5 h-5" />
                            </button>
                         </div>
                     </div>
                    <div className="flex justify-between text-sm"><span className="text-slate-500">Anexo Base:</span><span className="font-semibold">{empresa.anexo === 'III_V' ? 'Fator R (III/V)' : `Anexo ${empresa.anexo}`}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-slate-500">Anexo Efetivo:</span><span className="font-semibold">Anexo {resumo.anexo_efetivo}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-slate-500">Notas cadastradas:</span><span className="font-semibold">{notas.length}</span></div>

                     <h3 className="text-lg font-bold text-sky-700 dark:text-sky-400 pt-4 border-t dark:border-slate-700">RBT12 & Fator R (Apuração: {mesApuracao.toLocaleString('pt-BR', { month: 'short', year: 'numeric' })})</h3>
                    <div className="flex justify-between text-sm"><span className="text-slate-500">RBT12:</span><span className="font-semibold">R$ {resumo.rbt12.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-slate-500">Folha 12 Meses:</span><span className="font-semibold">R$ {resumo.folha_12.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-slate-500">Fator R:</span><span className="font-semibold">{(resumo.fator_r * 100).toFixed(1)}%</span></div>
                    
                     <h3 className="text-lg font-bold text-sky-700 dark:text-sky-400 pt-4 border-t dark:border-slate-700">Tributação Estimada</h3>
                    <div className="flex justify-between text-sm"><span className="text-slate-500">Alíquota Nominal:</span><span className="font-semibold">{resumo.aliq_nom.toFixed(2)}%</span></div>
                    <div className="flex justify-between font-bold"><span className="text-slate-500">Alíquota Efetiva:</span><span className="text-sky-600 dark:text-sky-400">{resumo.aliq_eff.toFixed(2)}%</span></div>
                    <div className="flex justify-between font-bold py-1 border-t border-b border-slate-100 dark:border-slate-700 my-1">
                         <span className="text-slate-700 dark:text-slate-200">DAS (Mês Apuração):</span>
                         <span className="text-sky-600 dark:text-sky-400">R$ {resumo.das_mensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-400"><span className="">DAS Estimado (12m):</span><span className="">R$ {resumo.das.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
                 </div>

                 <div className="p-6 bg-white dark:bg-slate-800 rounded-lg shadow-sm space-y-6">
                    <div>
                        <h3 className="text-lg font-bold text-sky-700 dark:text-sky-400 mb-4">Atualizar Folha 12 meses (Fator R)</h3>
                        <form onSubmit={handleFolhaSubmit} className="flex items-center gap-2">
                             <input
                                type="text"
                                value={folha12}
                                onChange={(e) => setFolha12(e.target.value)}
                                className="w-full pl-4 pr-4 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                            />
                            <button type="submit" className="btn-press px-4 py-2 bg-sky-600 text-white font-semibold rounded-lg hover:bg-sky-700">Salvar</button>
                        </form>
                        {folhaSuccess && <p className="mt-2 text-sm text-green-600 dark:text-green-400">{folhaSuccess}</p>}
                    </div>
                     <div>
                        <h3 className="text-lg font-bold text-sky-700 dark:text-sky-400 mb-4">Importar Notas/Extrato</h3>
                        <form>
                            <label htmlFor="file-upload" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                                Arquivo CSV (data,valor) ou XML (NF-e) ou Extrato PDF
                            </label>
                            <input
                                ref={fileInputRef}
                                id="file-upload"
                                type="file"
                                accept=".csv,.xml,.pdf"
                                onChange={handleFileChange}
                                disabled={isLoading}
                                className="mt-2 block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100 dark:file:bg-slate-700 dark:file:text-sky-300 dark:hover:file:bg-slate-600"
                            />
                        </form>
                        {isLoading && <div className="mt-4"><LoadingSpinner /></div>}
                        {importError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{importError}</p>}
                        {importSuccess && <p className="mt-2 text-sm text-green-600 dark:text-green-400">{importSuccess}</p>}
                    </div>
                 </div>
            </div>
            
            {/* Seção de Histórico de Apurações Salvas */}
            {empresa.historicoCalculos && empresa.historicoCalculos.length > 0 && (
                <div className="p-6 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                    <h3 className="text-lg font-bold text-sky-700 dark:text-sky-400 mb-4">Histórico de Apurações Salvas</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
                            <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-300">
                                <tr>
                                    <th className="px-4 py-2">Mês Ref.</th>
                                    <th className="px-4 py-2">Anexo</th>
                                    <th className="px-4 py-2 text-right">RBT12</th>
                                    <th className="px-4 py-2 text-center">Aliq. Efetiva</th>
                                    <th className="px-4 py-2 text-center">Fator R</th>
                                    <th className="px-4 py-2 text-right">Valor DAS</th>
                                    <th className="px-4 py-2 text-center">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {empresa.historicoCalculos.map((calc) => (
                                    <tr key={calc.id} className="border-b dark:border-slate-700">
                                        <td className="px-4 py-2 font-medium">{calc.mesReferencia}</td>
                                        <td className="px-4 py-2"><span className="bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded text-xs font-semibold">{calc.anexo_efetivo || '-'}</span></td>
                                        <td className="px-4 py-2 text-right">R$ {calc.rbt12.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                        <td className="px-4 py-2 text-center">{calc.aliq_eff.toFixed(2)}%</td>
                                        <td className="px-4 py-2 text-center">{(calc.fator_r * 100).toFixed(2)}%</td>
                                        <td className="px-4 py-2 text-right font-bold text-sky-600">R$ {calc.das_mensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                        <td className="px-4 py-2 text-center">
                                            <button 
                                                onClick={() => handleDeleteCalculo(calc.id)}
                                                className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                                                title="Excluir apuração salva"
                                            >
                                                <TrashIcon className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div className="p-6 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                <h3 className="text-lg font-bold text-sky-700 dark:text-sky-400 mb-4">Faturamento Manual (Últimos 12 Meses)</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                    Preencha os campos abaixo para usar um faturamento específico no cálculo do RBT12. Se um campo estiver vazio, o sistema usará o valor das notas importadas para aquele mês.
                </p>
                <form onSubmit={handleManualFaturamentoSubmit}>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {periodoManual.map(mes => {
                            const mesChave = `${mes.getFullYear()}-${(mes.getMonth() + 1).toString().padStart(2, '0')}`;
                            return (
                                <div key={mesChave}>
                                    <label htmlFor={`fat-${mesChave}`} className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                                        {mes.toLocaleString('pt-BR', { month: 'short', year: 'numeric' })}
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold pointer-events-none">R$</span>
                                        <input
                                            type="text"
                                            id={`fat-${mesChave}`}
                                            value={manualFaturamento[mesChave] || ''}
                                            onChange={e => handleManualFaturamentoChange(mesChave, e.target.value)}
                                            placeholder="0,00"
                                            className="w-full pl-8 pr-2 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 text-right font-mono"
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="text-right mt-6">
                        <button type="submit" className="btn-press px-6 py-2 bg-sky-600 text-white font-semibold rounded-lg hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500">
                            Salvar Faturamento Manual
                        </button>
                    </div>
                    {manualSuccess && <p className="mt-2 text-sm text-green-600 dark:text-green-400 text-right font-medium">{manualSuccess}</p>}
                </form>
            </div>

            {/* NOVA SEÇÃO: TABELA DO ANEXO */}
            <TabelaAnexo />

            <div className="p-6 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                <h3 className="text-lg font-bold text-sky-700 dark:text-sky-400 mb-4">Faturamento Histórico (Importado + Manual)</h3>
                {Object.keys(resumo.mensal).length > 0 ? (
                    <div className="relative h-64">
                       <SimpleChart type="bar" options={chartOptions} data={chartData} />
                    </div>
                ) : (
                    <p className="text-sm text-center text-slate-500 dark:text-slate-400 py-8">Nenhuma nota cadastrada para exibir o gráfico.</p>
                )}
            </div>
            
             <div className="p-6 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                <h3 className="text-lg font-bold text-sky-700 dark:text-sky-400 mb-4">Assistente Tributário IA</h3>
                <form onSubmit={handleChatSubmit}>
                    <textarea 
                        value={chatPergunta}
                        onChange={(e) => setChatPergunta(e.target.value)}
                        placeholder="Ex: Explique por que o DAS estimado está nesse valor e se há risco de mudança de faixa."
                        className="w-full p-2 bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                        rows={3}
                        disabled={isChatLoading}
                    />
                    <div className="text-right mt-2">
                         <button type="submit" className="btn-press px-6 py-2 bg-sky-600 text-white font-semibold rounded-lg hover:bg-sky-700 disabled:opacity-50" disabled={isChatLoading}>
                            {isChatLoading ? 'Analisando...' : 'Perguntar'}
                        </button>
                    </div>
                </form>
                {isChatLoading && <div className="mt-4"><LoadingSpinner /></div>}
                {chatResult && (
                    <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                        <div className="prose prose-sm prose-slate dark:prose-invert max-w-none text-slate-700 dark:text-slate-200">
                           <FormattedText text={chatResult.text} />
                        </div>
                         {chatResult.sources && chatResult.sources.length > 0 && (
                            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
                                <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Fontes Consultadas:</h4>
                                <ul className="mt-2 space-y-1 text-xs">
                                    {chatResult.sources.map((source, index) => (
                                        <li key={index}>
                                            <a 
                                                href={source.web.uri} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="text-sky-600 dark:text-sky-400 hover:underline break-all"
                                            >
                                                {source.web.title || source.web.uri}
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {isCnaeModalOpen && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-fade-in" onClick={() => setIsCnaeModalOpen(false)}>
                    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center p-4 border-b dark:border-slate-700">
                            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Descrição Oficial do CNAE: {empresa.cnae}</h3>
                             <button onClick={() => setIsCnaeModalOpen(false)} className="p-1 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700">
                                <CloseIcon className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto">
                            {isCnaeLoading && <LoadingSpinner />}
                            {cnaeError && <p className="text-red-600 dark:text-red-400">{cnaeError}</p>}
                            {cnaeValidationResult && (
                                <div className="prose prose-sm prose-slate dark:prose-invert max-w-none">
                                    <FormattedText text={cnaeValidationResult.text} />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            
            <EditEmpresaModal 
                empresa={empresa} 
                isOpen={isEditModalOpen} 
                onClose={() => setIsEditModalOpen(false)} 
                onSave={(data) => onUpdateEmpresa(empresa.id, data)} 
            />
        </div>
    );
};

export default SimplesNacionalDetalhe;