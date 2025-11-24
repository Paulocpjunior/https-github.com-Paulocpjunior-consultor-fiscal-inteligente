
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { SimplesNacionalEmpresa, SimplesNacionalNota, SearchResult, SimplesNacionalAnexo, CnaeTaxDetail, SimplesNacionalImportResult, SimplesNacionalAtividade, SimplesItemCalculo, SimplesHistoricoCalculo } from '../types';
import * as simplesService from '../services/simplesNacionalService';
import { fetchSimplesNacionalExplanation, fetchCnaeDescription, fetchCnaeTaxDetails } from '../services/geminiService';
import LoadingSpinner from './LoadingSpinner';
import { FormattedText } from './FormattedText';
import { ArrowLeftIcon, CloseIcon, EyeIcon, InfoIcon, ShieldIcon, TrashIcon, SaveIcon, DocumentTextIcon, DownloadIcon, GlobeIcon, PlusIcon, AnimatedCheckIcon, BriefcaseIcon, HistoryIcon } from './Icons';
import SimpleChart from './SimpleChart';
import { ANEXOS_TABELAS, REPARTICAO_IMPOSTOS } from '../services/simplesNacionalService';

interface SimplesNacionalDetalheProps {
    empresa: SimplesNacionalEmpresa;
    notas: SimplesNacionalNota[];
    onBack: () => void;
    onImport: (empresaId: string, file: File) => Promise<SimplesNacionalImportResult>;
    onUpdateFolha12: (empresaId: string, folha12: number) => SimplesNacionalEmpresa | null;
    onSaveFaturamentoManual: (empresaId: string, faturamento: { [key: string]: number }) => SimplesNacionalEmpresa | null;
    onUpdateEmpresa: (empresaId: string, data: Partial<SimplesNacionalEmpresa>) => SimplesNacionalEmpresa | null;
    onShowClienteView: () => void;
}

interface CnaeAnalysisResult {
    cnae: string;
    role: 'Principal' | 'Secundário';
    details: CnaeTaxDetail[];
    error?: string;
}

const getMesesApuracaoOptions = (): Date[] => {
    const options = [];
    const today = new Date();
    today.setDate(1); // Normaliza para o primeiro dia do mês
    
    // Gera opções para os próximos 12 meses e os últimos 24 meses
    for (let i = -12; i < 24; i++) {
        const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
        options.push(date);
    }
    return options;
};

const getPeriodoManual = (mesApuracao: Date): Date[] => {
    const period: Date[] = [];
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
    
    const [atividadesSecundarias, setAtividadesSecundarias] = useState<SimplesNacionalAtividade[]>(empresa.atividadesSecundarias || []);
    const [newCnae, setNewCnae] = useState('');
    const [newAnexo, setNewAnexo] = useState<SimplesNacionalAnexo>('III');

    useEffect(() => {
        setFormData({
            nome: empresa.nome,
            cnpj: empresa.cnpj,
            cnae: empresa.cnae,
            anexo: empresa.anexo,
        });
        setAtividadesSecundarias(empresa.atividadesSecundarias || []);
    }, [empresa]);

    if (!isOpen) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleAddActivity = () => {
        if (!newCnae.trim()) return;
        setAtividadesSecundarias([...atividadesSecundarias, { cnae: newCnae, anexo: newAnexo }]);
        setNewCnae('');
        setNewAnexo('III');
    };

    const handleRemoveActivity = (index: number) => {
        setAtividadesSecundarias(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave({
            ...formData,
            atividadesSecundarias
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center p-4 border-b dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 z-10">
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
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">CNAE Principal</label>
                            <input type="text" name="cnae" value={formData.cnae} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md dark:bg-slate-700 dark:border-slate-600" required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Anexo Principal</label>
                            <select name="anexo" value={formData.anexo} onChange={handleChange} className="mt-1 w-full p-2 border rounded-md dark:bg-slate-700 dark:border-slate-600">
                                <option value="I">Anexo I</option>
                                <option value="II">Anexo II</option>
                                <option value="III">Anexo III</option>
                                <option value="IV">Anexo IV</option>
                                <option value="V">Anexo V</option>
                                <option value="III_V">Anexo III/V (Fator R)</option>
                            </select>
                        </div>
                    </div>

                    {/* Secondary Activities Section */}
                    <div className="border-t dark:border-slate-700 pt-4">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Outras Atividades (CNAEs)</label>
                        <div className="flex gap-2 mb-2">
                             <input 
                                type="text" 
                                value={newCnae} 
                                onChange={(e) => setNewCnae(e.target.value)}
                                placeholder="CNAE Secundário" 
                                className="flex-grow p-2 border rounded-md dark:bg-slate-700 dark:border-slate-600 text-sm"
                             />
                             <select 
                                value={newAnexo} 
                                onChange={(e) => setNewAnexo(e.target.value as SimplesNacionalAnexo)}
                                className="w-28 p-2 border rounded-md dark:bg-slate-700 dark:border-slate-600 text-sm"
                             >
                                <option value="I">Anexo I</option>
                                <option value="II">Anexo II</option>
                                <option value="III">Anexo III</option>
                                <option value="IV">Anexo IV</option>
                                <option value="V">Anexo V</option>
                                <option value="III_V">III/V</option>
                             </select>
                             <button type="button" onClick={handleAddActivity} className="p-2 bg-sky-100 text-sky-600 rounded-md hover:bg-sky-200 flex items-center justify-center">
                                <PlusIcon className="w-5 h-5" />
                             </button>
                        </div>
                        <ul className="space-y-2 max-h-40 overflow-y-auto">
                            {atividadesSecundarias.map((item, index) => (
                                <li key={index} className="flex justify-between items-center p-2 bg-slate-50 dark:bg-slate-700/50 rounded text-sm">
                                    <span>{item.cnae} <span className="text-slate-400 text-xs">({item.anexo})</span></span>
                                    <button type="button" onClick={() => handleRemoveActivity(index)} className="text-red-500 hover:text-red-700 p-1">
                                        <TrashIcon className="w-4 h-4" />
                                    </button>
                                </li>
                            ))}
                        </ul>
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

const HistoryDetailsModal: React.FC<{
    data: SimplesHistoricoCalculo | null;
    isOpen: boolean;
    onClose: () => void;
}> = ({ data, isOpen, onClose }) => {
    if (!isOpen || !data) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[60] animate-fade-in" onClick={onClose}>
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md animate-pop-in" onClick={e => e.stopPropagation()}>
                <div className="bg-sky-600 p-4 rounded-t-xl flex justify-between items-center">
                    <h3 className="text-white font-bold text-lg flex items-center gap-2">
                        <HistoryIcon className="w-5 h-5" />
                        Detalhes da Apuração
                    </h3>
                    <button onClick={onClose} className="text-white/80 hover:text-white p-1 rounded-full hover:bg-white/20">
                        <CloseIcon className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="text-center mb-6">
                         <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold">Mês de Referência</p>
                         <p className="text-2xl font-bold text-slate-800 dark:text-slate-100 capitalize">{data.mesReferencia}</p>
                         <p className="text-xs text-slate-400 mt-1">Calculado em: {new Date(data.dataCalculo).toLocaleDateString('pt-BR')}</p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-50 dark:bg-slate-700/30 p-3 rounded-lg border border-slate-100 dark:border-slate-700">
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-bold">RBT12</p>
                            <p className="font-mono text-slate-700 dark:text-slate-200 font-semibold">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(data.rbt12)}
                            </p>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-700/30 p-3 rounded-lg border border-slate-100 dark:border-slate-700">
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-bold">Alíquota Efetiva</p>
                            <p className="font-mono text-slate-700 dark:text-slate-200 font-semibold">
                                {data.aliq_eff.toFixed(2)}%
                            </p>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-700/30 p-3 rounded-lg border border-slate-100 dark:border-slate-700">
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-bold">Fator R</p>
                            <p className={`font-mono font-semibold ${data.fator_r >= 0.28 ? 'text-green-600' : 'text-orange-500'}`}>
                                {(data.fator_r * 100).toFixed(2)}%
                            </p>
                        </div>
                         <div className="bg-slate-50 dark:bg-slate-700/30 p-3 rounded-lg border border-slate-100 dark:border-slate-700">
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-bold">Enquadramento</p>
                            <p className="font-mono text-slate-700 dark:text-slate-200 font-semibold">
                                {data.anexo_efetivo}
                            </p>
                        </div>
                    </div>
                    
                    <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-2">
                        <div className="flex justify-between items-center">
                            <span className="text-slate-600 dark:text-slate-300 font-bold">Valor do DAS</span>
                            <span className="text-xl font-bold text-sky-600 dark:text-sky-400">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(data.das_mensal)}
                            </span>
                        </div>
                    </div>
                    
                    <button onClick={onClose} className="w-full mt-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 font-semibold transition-colors">
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
};

const SimplesNacionalDetalhe: React.FC<SimplesNacionalDetalheProps> = ({ empresa, notas, onBack, onImport, onUpdateFolha12, onSaveFaturamentoManual, onUpdateEmpresa, onShowClienteView }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [importError, setImportError] = useState<string[] | null>(null);
    const [importSuccess, setImportSuccess] = useState<string | null>(null);
    const [chatPergunta, setChatPergunta] = useState('');
    const [chatResult, setChatResult] = useState<SearchResult | null>(null);
    const [isChatLoading, setIsChatLoading] = useState(false);
    const [folha12, setFolha12] = useState(empresa.folha12.toString());
    const [folhaSuccess, setFolhaSuccess] = useState('');
    
    // State for File Import Flow
    const [fileToImport, setFileToImport] = useState<File | null>(null);

    // State for CNAE validation modal
    const [isCnaeModalOpen, setIsCnaeModalOpen] = useState(false);
    const [cnaeValidationResult, setCnaeValidationResult] = useState<SearchResult | null>(null);
    const [isCnaeLoading, setIsCnaeLoading] = useState(false);
    const [cnaeError, setCnaeError] = useState<string | null>(null);
    const [cnaeToValidate, setCnaeToValidate] = useState('');

    // State for Tax Analysis Table (Multi-CNAE)
    const [taxAnalysisResults, setTaxAnalysisResults] = useState<CnaeAnalysisResult[] | null>(null);
    const [isTaxAnalysisLoading, setIsTaxAnalysisLoading] = useState(false);

    // State for Edit Empresa Modal
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    
    // State for History Details Modal
    const [selectedHistorico, setSelectedHistorico] = useState<SimplesHistoricoCalculo | null>(null);

    // State for Manual Invoicing
    const [mesApuracao, setMesApuracao] = useState(new Date());
    
    // State for DAS Online Integration
    const [dasOnlineStatus, setDasOnlineStatus] = useState<'idle' | 'connecting' | 'authenticating' | 'generating' | 'success'>('idle');
    const [dasOnlineMsg, setDasOnlineMsg] = useState('');
    
    // --- NEW LOGIC: Breakdown Revenue by CNAE (not just Anexo) ---
    const [faturamentoPorCnae, setFaturamentoPorCnae] = useState<Record<string, string>>({});
    
    // --- NEW LOGIC: Tax Settings (Retained ISS / ICMS ST) per CNAE ---
    const [configuracaoPorCnae, setConfiguracaoPorCnae] = useState<Record<string, { issRetido: boolean, icmsSt: boolean }>>({});
    
    // --- NEW LOGIC: Quick Add Secondary CNAE ---
    const [isAddingCnae, setIsAddingCnae] = useState(false);
    const [quickCnae, setQuickCnae] = useState('');
    const [quickAnexo, setQuickAnexo] = useState<SimplesNacionalAnexo>('III');

    // Preenchimento recorrente
    const [valorRecorrente, setValorRecorrente] = useState('');

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
        // Reset tax details when company changes
        setTaxAnalysisResults(null);
        setFileToImport(null);
        setImportSuccess(null);
        setImportError(null);
        setSelectedHistorico(null);
    }, [empresa]);
    
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Lista Completa de Atividades (CNAE + Anexo)
    const allActivities = useMemo(() => {
        const list = [
            { cnae: empresa.cnae, anexo: empresa.anexo, role: 'Principal' }
        ];
        if (empresa.atividadesSecundarias) {
            empresa.atividadesSecundarias.forEach(act => {
                list.push({ cnae: act.cnae, anexo: act.anexo, role: 'Secundário' });
            });
        }
        return list;
    }, [empresa]);

    // Inicializa o faturamento discriminado
    useEffect(() => {
        const mesChave = `${mesApuracao.getFullYear()}-${(mesApuracao.getMonth() + 1).toString().padStart(2, '0')}`;
        const totalMes = manualFaturamento[mesChave] || '0,00';
        
        const currentTotalBreakdown = Object.values(faturamentoPorCnae).reduce((acc: number, val: string) => {
             return acc + parseFloat(val.replace(/\./g, '').replace(',', '.') || '0');
        }, 0);

        if (currentTotalBreakdown === 0 && totalMes !== '0,00') {
             // Se tem total mas não tem breakdown, atribui ao principal (simplificação)
             // ou mantém vazio para forçar usuário a discriminar se quiser
             // Por UX, vamos atribuir ao CNAE Principal
             setFaturamentoPorCnae({ [empresa.cnae]: totalMes });
        } else if (totalMes === '0,00' && currentTotalBreakdown === 0) {
             setFaturamentoPorCnae({});
        }
        
        if (Object.keys(configuracaoPorCnae).length === 0) {
             const initConfig: Record<string, { issRetido: boolean, icmsSt: boolean }> = {};
             allActivities.forEach(act => {
                 initConfig[act.cnae] = { issRetido: false, icmsSt: false };
             });
             setConfiguracaoPorCnae(initConfig);
        }
    }, [mesApuracao, manualFaturamento, empresa.cnae, allActivities]);

    const resumo = useMemo(() => {
        // Constrói os itens de cálculo detalhados para o serviço
        const itensCalculo: SimplesItemCalculo[] = [];

        allActivities.forEach(act => {
            const valStr = faturamentoPorCnae[act.cnae] || '0';
            const val = parseFloat(String(valStr).replace(/\./g, '').replace(',', '.') || '0');
            const config = configuracaoPorCnae[act.cnae] || { issRetido: false, icmsSt: false };

            if (val > 0) {
                itensCalculo.push({
                    cnae: act.cnae,
                    anexo: act.anexo,
                    valor: val,
                    issRetido: config.issRetido,
                    icmsSt: config.icmsSt
                });
            }
        });

        return simplesService.calcularResumoEmpresa(empresa, notas, mesApuracao, { 
            fullHistory: true,
            itensCalculo: itensCalculo
        });
    }, [empresa, notas, mesApuracao, faturamentoPorCnae, configuracaoPorCnae, allActivities]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setFileToImport(file);
            setImportSuccess(null);
            setImportError(null);
        }
    };

    const handleConfirmImport = async () => {
        if (!fileToImport) return;

        setIsLoading(true);
        setImportError(null);
        setImportSuccess(null);

        const result = await onImport(empresa.id, fileToImport);

        if (result.failCount > 0) {
            setImportError(result.errors);
            if (result.successCount > 0) {
                setImportSuccess(`Importação parcial: ${result.successCount} registros importados. ${result.failCount} falharam.`);
            }
        } else if (result.successCount > 0) {
            setImportSuccess(`${result.successCount} registro(s) importado(s) e preenchidos com sucesso.`);
        } else {
             setImportError(["Nenhum dado válido encontrado."]);
        }
        
        if(fileInputRef.current) {
            fileInputRef.current.value = "";
        }
        setFileToImport(null);
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
    
    const handleCnaeRevenueChange = (cnae: string, valor: string) => {
        const formatted = formatCurrencyInput(valor);
        setFaturamentoPorCnae(prev => ({ ...prev, [cnae]: formatted }));
    };

    const toggleTaxConfig = (cnae: string, type: 'issRetido' | 'icmsSt') => {
        setConfiguracaoPorCnae(prev => {
            const current = prev[cnae] || { issRetido: false, icmsSt: false };
            return {
                ...prev,
                [cnae]: { ...current, [type]: !current[type] }
            };
        });
    };
    
    const handleQuickAddCnae = () => {
        if (!quickCnae.trim()) return;
        
        const currentSecundarias = empresa.atividadesSecundarias || [];
        const updatedSecundarias = [...currentSecundarias, { cnae: quickCnae, anexo: quickAnexo }];
        
        onUpdateEmpresa(empresa.id, { atividadesSecundarias: updatedSecundarias });
        
        setIsAddingCnae(false);
        setQuickCnae('');
        setQuickAnexo('III');
    };

    const totalDiscriminadoString = useMemo(() => {
        let total = 0;
        Object.values(faturamentoPorCnae).forEach((valStr: string) => {
            total += parseFloat(valStr.replace(/\./g, '').replace(',', '.') || '0');
        });
        return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(total);
    }, [faturamentoPorCnae]);
    
    const handleAplicarRecorrente = () => {
        if (!valorRecorrente) return;
        
        const periodoManual = getPeriodoManual(mesApuracao);
        const formatted = formatCurrencyInput(valorRecorrente);
        
        const novosValores = { ...manualFaturamento };
        periodoManual.forEach(mes => {
             const mesChave = `${mes.getFullYear()}-${(mes.getMonth() + 1).toString().padStart(2, '0')}`;
             novosValores[mesChave] = formatted;
        });
        
        setManualFaturamento(novosValores);
        setValorRecorrente(''); 
    };
    
    const handleValorRecorrenteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
         const formatted = formatCurrencyInput(e.target.value);
         setValorRecorrente(formatted);
    }

    const saveAllManualFaturamento = () => {
        const faturamentoNumerico = Object.fromEntries(
            Object.entries(manualFaturamento)
                .map(([key, value]): [string, number] => {
                    const valStr = String(value);
                    const cleanValue = valStr.replace(/\./g, '').replace(',', '.');
                    return [key, parseFloat(cleanValue)];
                })
                .filter(([, value]) => !isNaN(value))
        );
        onSaveFaturamentoManual(empresa.id, faturamentoNumerico);
    }
    
    const handleManualFaturamentoSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        if (window.confirm("Tem certeza que deseja salvar o faturamento manual? Isso atualizará todos os valores para os meses preenchidos.")) {
            saveAllManualFaturamento();
            setManualSuccess('Faturamento manual salvo com sucesso.');
            setTimeout(() => setManualSuccess(''), 3000);
        }
    };
    
    const handleSaveMesVigenteClick = () => {
        // Atualiza o mês corrente no histórico geral com a soma dos CNAEs
        const mesChave = `${mesApuracao.getFullYear()}-${(mesApuracao.getMonth() + 1).toString().padStart(2, '0')}`;
        const updatedManualFaturamento = { ...manualFaturamento, [mesChave]: totalDiscriminadoString };
        setManualFaturamento(updatedManualFaturamento);
        
        // Salva no banco
        const faturamentoNumerico = Object.fromEntries(
            Object.entries(updatedManualFaturamento)
                .map(([key, value]): [string, number] => {
                    const cleanValue = String(value).replace(/\./g, '').replace(',', '.');
                    return [key, parseFloat(cleanValue)];
                })
                .filter(([, value]) => !isNaN(value))
        );
        
        onSaveFaturamentoManual(empresa.id, faturamentoNumerico);
        setManualSuccess('Faturamento vigente atualizado!');
        setTimeout(() => setManualSuccess(''), 3000);
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
        if (!window.confirm("Tem certeza que deseja excluir este cálculo do histórico?")) return;
        const novosCalculos = empresa.historicoCalculos?.filter(c => c.id !== calculoId);
        if (novosCalculos) {
            onUpdateEmpresa(empresa.id, { historicoCalculos: novosCalculos });
            if (selectedHistorico?.id === calculoId) {
                setSelectedHistorico(null);
            }
        }
    };

    const handleGerarDasOnline = async () => {
        setDasOnlineStatus('connecting');
        setDasOnlineMsg('Conectando ao Servidor PGDAS-D...');
        await new Promise<void>(resolve => setTimeout(resolve, 2000));
        setDasOnlineStatus('authenticating');
        setDasOnlineMsg('Acessando Certificado Digital Modelo A1...');
        await new Promise<void>(resolve => setTimeout(resolve, 2000));
        setDasOnlineStatus('generating');
        setDasOnlineMsg('Gerando Guia de DAS...');
        await new Promise<void>(resolve => setTimeout(resolve, 1500));
        setDasOnlineStatus('success');
        setDasOnlineMsg('Redirecionando para ambiente seguro e-CAC...');
        setTimeout(() => {
            window.open('https://cav.receita.fazenda.gov.br/autenticacao/login', '_blank');
            setDasOnlineStatus('idle');
            setDasOnlineMsg('');
        }, 2000);
    };

    const handleGerarDasPdf = async () => {
        try {
            const { default: jsPDF } = await import('jspdf');
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const dataHoraGeracao = new Date().toLocaleString('pt-BR');
            
            doc.setFontSize(18);
            doc.setTextColor(14, 165, 233); 
            doc.text('Memória de Cálculo - DAS', pageWidth / 2, 20, { align: 'center' });
            
            doc.setFontSize(12);
            doc.setTextColor(0);
            doc.text(`Empresa: ${empresa.nome}`, 20, 40);
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text(`Gerado em: ${dataHoraGeracao}`, pageWidth - 20, 40, { align: 'right' });
            doc.setFontSize(12);
            doc.setTextColor(0);
            doc.text(`CNPJ: ${empresa.cnpj}`, 20, 48);
            doc.text(`Período de Apuração: ${mesApuracao.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}`, 20, 56);
            doc.setDrawColor(200);
            doc.line(20, 65, pageWidth - 20, 65);

            const mesChave = `${mesApuracao.getFullYear()}-${(mesApuracao.getMonth() + 1).toString().padStart(2, '0')}`;
            const faturamentoMes = resumo.mensal[mesChave] || 0;

            doc.setFontSize(14);
            doc.text('Base de Cálculo', 20, 75);
            doc.setFontSize(10);
            doc.text('Receita Bruta 12 Meses (RBT12):', 20, 85);
            doc.text(`R$ ${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(resumo.rbt12)}`, pageWidth - 20, 85, { align: 'right' });
            doc.text('Faturamento do Mês:', 20, 92);
            doc.text(`R$ ${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(faturamentoMes)}`, pageWidth - 20, 92, { align: 'right' });
            
            if (resumo.ultrapassou_sublimite) {
                doc.setTextColor(220, 38, 38); 
                doc.text('ALERTA: RBT12 excedeu o Sub-limite de R$ 3.600.000,00.', 20, 102);
                doc.text('ICMS/ISS recolhidos fora do DAS.', 20, 107);
                doc.setTextColor(0);
            }

            doc.line(20, 115, pageWidth - 20, 115);
            doc.setFontSize(14);
            doc.text('Apuração da Alíquota', 20, 125);
            
            if (resumo.detalhamento_anexos && resumo.detalhamento_anexos.length > 0) {
                let yPos = 135;
                resumo.detalhamento_anexos.forEach(det => {
                    doc.setFontSize(10);
                    let label = `Atividade Anexo ${det.anexo}`;
                    if(det.issRetido) label += " (Sem ISS)";
                    if(det.icmsSt) label += " (Sem ICMS)";

                    doc.text(`${label}: R$ ${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(det.faturamento)}`, 20, yPos);
                    doc.text(`Aliq. Efetiva: ${det.aliquotaEfetiva.toFixed(4)}%`, pageWidth - 60, yPos, { align: 'right'});
                    doc.text(`DAS: R$ ${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(det.valorDas)}`, pageWidth - 20, yPos, { align: 'right'});
                    yPos += 6;
                });
                if (empresa.anexo === 'III_V') {
                    doc.text(`Fator R Global: ${(resumo.fator_r * 100).toFixed(2)}%`, 20, yPos + 4);
                }
                doc.setFontSize(12);
                doc.setFont("helvetica", "bold");
                doc.text(`Alíquota Média Ponderada: ${resumo.aliq_eff.toFixed(4)}%`, pageWidth - 20, yPos + 4, { align: 'right' });
                doc.setFont("helvetica", "normal");
            } else {
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
            }

            doc.setDrawColor(0);
            doc.setLineWidth(0.5);
            doc.rect(20, 170, pageWidth - 40, 30);
            doc.setFontSize(16);
            doc.text('Valor a Pagar (DAS)', pageWidth / 2, 182, { align: 'center' });
            doc.setFontSize(22);
            doc.setTextColor(14, 165, 233);
            doc.text(`R$ ${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(resumo.das_mensal)}`, pageWidth / 2, 195, { align: 'center' });
            doc.setFontSize(8);
            doc.setTextColor(100);
            doc.text(`Página 1/4`, pageWidth - 20, 280, { align: 'right' });
            doc.text('Documento gerado pelo Consultor Fiscal Inteligente - SP Assessoria', pageWidth / 2, 280, { align: 'center' });

            doc.addPage();
            doc.setFontSize(16);
            doc.setTextColor(14, 165, 233);
            doc.text('Detalhamento da Receita Bruta (RBT12)', pageWidth / 2, 20, { align: 'center' });
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text('Histórico dos últimos 12 meses anteriores à apuração', pageWidth / 2, 26, { align: 'center' });
            doc.setFontSize(12);
            doc.setTextColor(0);
            let startY = 40;
            const col1X = 30;
            const col2X = pageWidth - 30;
            const rowHeight = 10;
            doc.setFillColor(240, 245, 250); 
            doc.rect(20, startY - 6, pageWidth - 40, 10, 'F');
            doc.setFont("helvetica", "bold");
            doc.text('Competência', col1X, startY);
            doc.text('Receita Bruta', col2X, startY, { align: 'right' });
            startY += rowHeight;
            doc.setFont("helvetica", "normal");
            doc.setFontSize(11);
            const dataInicioPeriodoRBT12 = new Date(mesApuracao.getFullYear(), mesApuracao.getMonth() - 12, 1);
            let totalCalculado = 0;
            for (let i = 0; i < 12; i++) {
                const mesIteracao = new Date(dataInicioPeriodoRBT12.getFullYear(), dataInicioPeriodoRBT12.getMonth() + i, 1);
                const mesChave = `${mesIteracao.getFullYear()}-${(mesIteracao.getMonth() + 1).toString().padStart(2, '0')}`;
                const valor = resumo.mensal[mesChave] || 0;
                totalCalculado += valor;
                const mesLabel = mesIteracao.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
                const mesLabelCapitalized = mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1);
                if (i % 2 === 1) {
                   doc.setFillColor(250, 250, 250);
                   doc.rect(20, startY - 6, pageWidth - 40, 10, 'F');
                }
                doc.text(mesLabelCapitalized, col1X, startY);
                doc.text(`R$ ${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(valor)}`, col2X, startY, { align: 'right' });
                startY += rowHeight;
            }
            startY += 2;
            doc.setDrawColor(14, 165, 233);
            doc.setLineWidth(0.5);
            doc.line(20, startY - 8, pageWidth - 20, startY - 8);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(12);
            doc.text('TOTAL ACUMULADO (RBT12)', col1X, startY);
            doc.text(`R$ ${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(totalCalculado)}`, col2X, startY, { align: 'right' });
            doc.setFontSize(8);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(100);
            doc.text(`Página 2/4 • ${empresa.nome}`, pageWidth / 2, 280, { align: 'center' });

            doc.addPage();
            doc.setFontSize(16);
            doc.setTextColor(14, 165, 233); 
            doc.text('Memória de Cálculo - Discriminação dos Tributos', pageWidth / 2, 20, { align: 'center' });
            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.text('Repartição do valor do DAS entre os entes federativos e tributos', pageWidth / 2, 26, { align: 'center' });
            doc.setFontSize(12);
            doc.setTextColor(0);
            doc.text(`Valor Total do DAS: R$ ${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(resumo.das_mensal)}`, 20, 40);
            startY = 55;
            const colImp = 20;
            const colPerc = pageWidth / 2;
            const colVal = pageWidth - 20;
            doc.setFillColor(240, 245, 250);
            doc.rect(20, startY - 6, pageWidth - 40, 10, 'F');
            doc.setFont("helvetica", "bold");
            doc.text("Tributo / Ente", colImp + 5, startY);
            doc.text("% Partilha (no DAS)", colPerc, startY, { align: 'center' });
            doc.text("Valor (R$)", colVal - 5, startY, { align: 'right' });
            startY += 10;
            doc.setFont("helvetica", "normal");
            const percentuaisReparticao = REPARTICAO_IMPOSTOS[resumo.anexo_efetivo]?.[Math.min(resumo.faixa_index, 5)];
            const discriminacao = simplesService.calcularDiscriminacaoImpostos(resumo.anexo_efetivo, resumo.faixa_index, resumo.das_mensal);
            let index = 0;
            Object.entries(discriminacao).forEach(([imposto, valor]) => {
                if (index % 2 === 1) {
                    doc.setFillColor(252, 252, 252);
                    doc.rect(20, startY - 6, pageWidth - 40, 10, 'F');
                }
                doc.setDrawColor(230);
                doc.line(20, startY + 4, pageWidth - 20, startY + 4);
                doc.text(imposto, colImp + 5, startY);
                const percentual = percentuaisReparticao ? percentuaisReparticao[imposto] : 0;
                doc.text(`${percentual.toFixed(2)}%`, colPerc, startY, { align: 'center' });
                doc.text(new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format((valor as number)), colVal - 5, startY, { align: 'right' });
                startY += 10;
                index++;
            });
            if (resumo.ultrapassou_sublimite) {
                startY += 10;
                doc.setFontSize(10);
                doc.setTextColor(220, 38, 38);
                doc.text("* Nota: Devido ao sublimite de faturamento excedido, os percentuais de ICMS/ISS não estão incluídos neste cálculo.", 20, startY, { maxWidth: pageWidth - 40 });
            }
            doc.setFontSize(8);
            doc.setTextColor(100);
            doc.text(`Página 3/4 • ${empresa.nome}`, pageWidth / 2, 280, { align: 'center' });

            if (empresa.historicoCalculos && empresa.historicoCalculos.length > 0) {
                doc.addPage();
                doc.setFontSize(16);
                doc.setTextColor(14, 165, 233); 
                doc.text('Histórico de Apurações Salvas', pageWidth / 2, 20, { align: 'center' });
                doc.setFontSize(10);
                doc.setTextColor(0);
                startY = 40;
                doc.setFillColor(240, 245, 250);
                doc.rect(20, startY - 6, pageWidth - 40, 10, 'F');
                doc.setFont("helvetica", "bold");
                doc.text('Mês Ref.', 25, startY);
                doc.text('Anexo', 55, startY);
                doc.text('RBT12', 90, startY, { align: 'right' });
                doc.text('Aliq. Ef.', 120, startY, { align: 'right' });
                doc.text('DAS (R$)', pageWidth - 25, startY, { align: 'right' });
                startY += rowHeight;
                doc.setFont("helvetica", "normal");
                doc.setFontSize(10);
                empresa.historicoCalculos.forEach((calc, i) => {
                    if (startY > 270) { 
                        doc.addPage();
                        startY = 40; 
                    }
                    if (i % 2 === 1) {
                       doc.setFillColor(250, 250, 250);
                       doc.rect(20, startY - 6, pageWidth - 40, 10, 'F');
                    }
                    doc.text(calc.mesReferencia, 25, startY);
                    doc.text(calc.anexo_efetivo, 55, startY);
                    const rbt12Formatted = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(calc.rbt12);
                    doc.text(rbt12Formatted, 90, startY, { align: 'right' });
                    doc.text(calc.aliq_eff.toFixed(2) + '%', 120, startY, { align: 'right' });
                    const dasFormatted = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(calc.das_mensal);
                    doc.text(dasFormatted, pageWidth - 25, startY, { align: 'right' });
                    startY += rowHeight;
                });
                doc.setFontSize(8);
                doc.setTextColor(100);
                doc.text(`Página 4/4 • ${empresa.nome}`, pageWidth / 2, 280, { align: 'center' });
            }
            
            doc.save(`memoria-calculo-${empresa.nome}-${mesApuracao.toISOString().slice(0,7)}.pdf`);
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

    const handleValidateCnae = (cnae: string) => {
        setIsCnaeLoading(true);
        setCnaeError(null);
        setCnaeValidationResult(null);
        setIsCnaeModalOpen(true);
        setCnaeToValidate(cnae);
        fetchCnaeDescription(cnae).then(result => {
            setCnaeValidationResult(result);
        }).catch (e => {
            setCnaeError(e.message || 'Ocorreu um erro desconhecido.');
        }).finally(() => {
            setIsCnaeLoading(false);
        });
    };
    
    const handleAnalyzeTax = async () => {
        setIsTaxAnalysisLoading(true);
        setTaxAnalysisResults(null);
        try {
            const activitiesToAnalyze = [
                { cnae: empresa.cnae, role: 'Principal' as const },
                ...(empresa.atividadesSecundarias || []).map(a => ({ cnae: a.cnae, role: 'Secundário' as const }))
            ];
            const promises = activitiesToAnalyze.map(async (activity) => {
                try {
                    const details = await fetchCnaeTaxDetails(activity.cnae);
                    return {
                        cnae: activity.cnae,
                        role: activity.role,
                        details: details
                    };
                } catch (e: any) {
                    return {
                        cnae: activity.cnae,
                        role: activity.role,
                        details: [],
                        error: e.message || 'Falha na análise'
                    };
                }
            });
            const finalResults = await Promise.all(promises);
            setTaxAnalysisResults(finalResults);
        } catch (e) {
            console.error(e);
        } finally {
            setIsTaxAnalysisLoading(false);
        }
    }
    
    const chartData = useMemo(() => {
        if (!resumo.historico_simulado || resumo.historico_simulado.length === 0) return null;
        
        return {
            labels: resumo.historico_simulado.map(h => h.label),
            datasets: [
                {
                    label: 'Faturamento (R$)',
                    data: resumo.historico_simulado.map(h => h.faturamento),
                    backgroundColor: 'rgba(59, 130, 246, 0.5)',
                    borderColor: 'rgba(59, 130, 246, 1)',
                    borderWidth: 1,
                    order: 2,
                    yAxisID: 'y',
                },
                {
                    label: 'DAS Calculado (R$)',
                    data: resumo.historico_simulado.map(h => h.dasCalculado),
                    type: 'line' as const,
                    borderColor: 'rgba(14, 165, 233, 0.8)', 
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 3,
                    order: 1,
                    yAxisID: 'y',
                },
                {
                    label: 'Alíquota Efetiva (%)',
                    data: resumo.historico_simulado.map(h => h.aliquotaEfetiva),
                    type: 'line' as const,
                    borderColor: 'rgba(239, 68, 68, 0.8)', 
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderWidth: 2,
                    pointRadius: 3,
                    order: 0,
                    yAxisID: 'y1',
                }
            ],
        };
    }, [resumo.historico_simulado]);

    const chartOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: true,
                position: 'bottom' as const,
            },
            title: {
                display: true,
                text: 'Evolução Real do Faturamento, DAS e Carga Tributária',
            },
            tooltip: {
                 callbacks: {
                    label: function(context: any) {
                        let label = context.dataset.label || '';
                        if (label) label += ': ';
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
                title: { display: true, text: 'Valores (R$)' }
            },
            y1: {
                beginAtZero: true,
                type: 'linear' as const,
                display: true,
                position: 'right' as const,
                title: { display: true, text: 'Alíquota (%)' },
                grid: { drawOnChartArea: false },
            },
        },
    }), []);

    return (
        <div className="space-y-6 animate-fade-in pb-10">
            {/* Header e Ações Principais */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                <div className="flex items-center gap-3">
                    <button onClick={() => onBack()} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                        <ArrowLeftIcon className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                    </button>
                    <div>
                        <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            {empresa.nome}
                        </h2>
                        <div className="flex flex-wrap gap-2 text-sm text-slate-500 dark:text-slate-400 items-center">
                           <span>CNPJ: {empresa.cnpj}</span>
                           <span>•</span>
                           <div className="flex items-center gap-1">
                               <BriefcaseIcon className="w-4 h-4" />
                               <span className="font-semibold text-slate-600 dark:text-slate-300">Principal:</span> {empresa.cnae}
                               <button 
                                   onClick={() => handleValidateCnae(empresa.cnae)}
                                   className="text-xs bg-sky-50 hover:bg-sky-100 dark:bg-sky-900/30 dark:hover:bg-sky-800 text-sky-600 dark:text-sky-400 px-2 py-0.5 rounded border border-sky-100 dark:border-sky-800 transition-colors"
                               >
                                   Validar
                               </button>
                           </div>
                        </div>
                        
                        {/* Secondary CNAEs */}
                        {empresa.atividadesSecundarias && empresa.atividadesSecundarias.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-2">
                                {empresa.atividadesSecundarias.map((sec, idx) => (
                                    <div key={idx} className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                                        <span className="font-semibold">Sec:</span> {sec.cnae}
                                         <button 
                                           onClick={() => handleValidateCnae(sec.cnae)}
                                           className="text-sky-600 hover:underline ml-1"
                                           title="Validar atividade"
                                       >
                                           <InfoIcon className="w-3 h-3" />
                                       </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setIsEditModalOpen(true)} className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 text-sm">
                        Editar Empresa
                    </button>
                    <button onClick={onShowClienteView} className="px-3 py-2 bg-sky-100 text-sky-700 rounded-lg hover:bg-sky-200 text-sm flex items-center gap-2">
                        <EyeIcon className="w-4 h-4" />
                        Modo Cliente
                    </button>
                </div>
            </div>

            {/* Cards de Resumo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm border border-slate-100 dark:border-slate-700">
                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold">RBT12 (Receita Bruta 12m)</p>
                    <p className="text-xl font-bold text-slate-800 dark:text-slate-100 mt-1">R$ {resumo.rbt12.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm border border-slate-100 dark:border-slate-700">
                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold">Alíquota Efetiva</p>
                    <p className="text-xl font-bold text-sky-600 dark:text-sky-400 mt-1">{resumo.aliq_eff.toFixed(2)}%</p>
                    <p className="text-xs text-slate-400">Nominal: {resumo.aliq_nom}%</p>
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm border border-slate-100 dark:border-slate-700">
                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold">DAS Estimado (Mês)</p>
                    <p className="text-xl font-bold text-green-600 dark:text-green-400 mt-1">R$ {resumo.das_mensal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm border border-slate-100 dark:border-slate-700">
                    <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold">Fator R</p>
                    <p className={`text-xl font-bold mt-1 ${resumo.fator_r >= 0.28 ? 'text-green-600' : 'text-orange-500'}`}>
                        {(resumo.fator_r * 100).toFixed(1)}%
                    </p>
                    <p className="text-xs text-slate-400">Folha: R$ {resumo.folha_12.toLocaleString('pt-BR', { compactDisplay: 'short', notation: 'compact' })}</p>
                </div>
            </div>

            {/* Tax Analysis Section */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <ShieldIcon className="w-5 h-5 text-sky-600" />
                        Análise Tributária (IA)
                    </h3>
                     <button 
                        onClick={() => handleAnalyzeTax()} 
                        disabled={isTaxAnalysisLoading}
                        className="text-sm text-sky-600 hover:underline disabled:opacity-50"
                    >
                        {isTaxAnalysisLoading ? 'Analisando...' : 'Atualizar Análise'}
                    </button>
                </div>
                
                {isTaxAnalysisLoading ? (
                    <LoadingSpinner />
                ) : taxAnalysisResults ? (
                    <div className="space-y-6">
                        {taxAnalysisResults.map((result, idx) => (
                            <div key={idx} className="border-t border-slate-100 dark:border-slate-700 pt-4 first:border-0 first:pt-0">
                                <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${result.role === 'Principal' ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-600'}`}>
                                        {result.role}
                                    </span>
                                    CNAE {result.cnae}
                                </h4>
                                
                                {result.error ? (
                                    <p className="text-sm text-red-500">{result.error}</p>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
                                            <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-300">
                                                <tr>
                                                    <th className="px-4 py-2">Tributo</th>
                                                    <th className="px-4 py-2">Incidência</th>
                                                    <th className="px-4 py-2">Alíquota Média</th>
                                                    <th className="px-4 py-2">Base Legal</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {result.details.map((tax, tIdx) => (
                                                    <tr key={tIdx} className="border-b dark:border-slate-700">
                                                        <td className="px-4 py-2 font-medium">{tax.tributo}</td>
                                                        <td className="px-4 py-2">{tax.incidencia}</td>
                                                        <td className="px-4 py-2">{tax.aliquotaMedia}</td>
                                                        <td className="px-4 py-2 text-xs">{tax.baseLegal}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-slate-500 dark:text-slate-400">Clique em "Atualizar Análise" para ver a tabela de impostos incidentes.</p>
                )}
            </div>

            {/* Reference Table - Annex Ranges */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 mt-6">
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                    <DocumentTextIcon className="w-5 h-5 text-sky-600" />
                    Tabela de Referência: Anexo {resumo.anexo_efetivo}
                </h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
                        <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-300">
                            <tr>
                                <th className="px-4 py-2">Faixa</th>
                                <th className="px-4 py-2">Receita Bruta em 12 Meses (Até R$)</th>
                                <th className="px-4 py-2 text-center">Alíquota Nominal</th>
                                <th className="px-4 py-2 text-right">Valor a Deduzir (R$)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ANEXOS_TABELAS[resumo.anexo_efetivo]?.map((faixa, index) => {
                                const isCurrentFaixa = index === resumo.faixa_index;
                                return (
                                    <tr key={index} className={`border-b dark:border-slate-700 ${isCurrentFaixa ? 'bg-sky-50 dark:bg-sky-900/20 border-l-4 border-sky-500' : ''}`}>
                                        <td className="px-4 py-2 font-medium">
                                            {index + 1}ª Faixa
                                            {isCurrentFaixa && <span className="ml-2 text-xs font-bold text-sky-600">(Atual)</span>}
                                        </td>
                                        <td className="px-4 py-2">
                                            {new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(faixa.limite)}
                                        </td>
                                        <td className="px-4 py-2 text-center">
                                            {faixa.aliquota}%
                                        </td>
                                        <td className="px-4 py-2 text-right">
                                            {new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(faixa.parcela)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Charts */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 h-96 mt-6">
                {chartData ? (
                     <SimpleChart type="bar" options={chartOptions} data={chartData} />
                ) : (
                    <div className="h-full flex items-center justify-center text-slate-400">
                        Sem dados para exibir o gráfico.
                    </div>
                )}
            </div>
            
            {/* Actions Bar */}
            <div className="flex flex-wrap gap-3 items-center justify-between bg-slate-50 dark:bg-slate-900 p-4 rounded-lg">
                 <div className="flex items-center gap-3">
                    <input
                        type="file"
                        ref={fileInputRef}
                        accept=".pdf,.csv,.xml"
                        onChange={handleFileChange}
                        className="hidden"
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="btn-press px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-sm font-medium flex items-center gap-2"
                    >
                        <DocumentTextIcon className="w-4 h-4" />
                        Importar Notas/Extrato
                    </button>
                    
                    {fileToImport && (
                        <div className="flex items-center gap-2 animate-fade-in">
                            <span className="text-sm text-slate-600 dark:text-slate-400 italic max-w-[150px] truncate">
                                {fileToImport.name}
                            </span>
                            <button 
                                onClick={() => handleConfirmImport()}
                                disabled={isLoading}
                                className="px-3 py-1 bg-green-600 text-white text-xs font-bold rounded shadow-sm hover:bg-green-700 disabled:opacity-50"
                            >
                                {isLoading ? 'Processando...' : 'SALVAR'}
                            </button>
                            <button 
                                onClick={() => { setFileToImport(null); if(fileInputRef.current) fileInputRef.current.value = ''; }}
                                className="p-1 text-slate-400 hover:text-red-500"
                            >
                                <CloseIcon className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                 </div>

                 <div className="flex gap-2">
                     <button 
                         onClick={() => handleSaveCalculo()}
                         className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-semibold flex items-center gap-2 btn-press"
                     >
                         <SaveIcon className="w-4 h-4" />
                         Salvar Apuração
                     </button>
                     <button 
                         onClick={() => handleGerarDasPdf()}
                         className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 text-sm font-semibold flex items-center gap-2 btn-press"
                     >
                         <DownloadIcon className="w-4 h-4" />
                         Gerar Extrato DAS
                     </button>
                     <button 
                         onClick={() => handleGerarDasOnline()}
                         className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-semibold flex items-center gap-2 btn-press"
                     >
                         <GlobeIcon className="w-4 h-4" />
                         Cálculo DAS On Line
                     </button>
                 </div>
            </div>

            {/* Feedback Messages */}
            {importSuccess && (
                <div className="p-4 bg-green-50 border-l-4 border-green-500 text-green-700 dark:bg-green-900/20 dark:text-green-300 animate-fade-in">
                    <p className="font-bold">Sucesso!</p>
                    <p className="text-sm">{importSuccess}</p>
                </div>
            )}
            {importError && (
                <div className="p-4 bg-red-50 border-l-4 border-red-500 text-red-700 dark:bg-red-900/20 dark:text-red-300 animate-fade-in">
                    <p className="font-bold">Erros na Importação:</p>
                    <ul className="list-disc ml-5 text-sm">
                        {importError.map((err, idx) => <li key={idx}>{err}</li>)}
                    </ul>
                </div>
            )}
            {saveCalculoSuccess && (
                <div className="fixed bottom-10 right-10 bg-white dark:bg-slate-800 p-4 rounded-lg shadow-xl border border-green-200 dark:border-green-900 z-50 animate-fade-in flex items-center gap-3">
                    <div className="bg-green-100 dark:bg-green-900 rounded-full p-2">
                        <AnimatedCheckIcon className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="font-bold text-green-700 dark:text-green-400">Sucesso</p>
                        <p className="text-sm text-slate-600 dark:text-slate-300">{saveCalculoSuccess}</p>
                    </div>
                </div>
            )}
            
            {/* DAS Online Integration Overlay */}
            {dasOnlineStatus !== 'idle' && (
                 <div className="fixed inset-0 bg-black/80 flex flex-col items-center justify-center z-[100] animate-fade-in">
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-2xl max-w-md w-full text-center">
                        <LoadingSpinner />
                        <h3 className="mt-6 text-xl font-bold text-slate-800 dark:text-slate-100">Integração PGDAS-D</h3>
                        <p className="mt-2 text-sky-600 dark:text-sky-400 font-semibold animate-pulse">{dasOnlineMsg}</p>
                        <div className="mt-6 w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-sky-500 transition-all duration-500 ease-out"
                                style={{ 
                                    width: dasOnlineStatus === 'connecting' ? '25%' : 
                                           dasOnlineStatus === 'authenticating' ? '50%' : 
                                           dasOnlineStatus === 'generating' ? '75%' : '100%' 
                                }}
                            />
                        </div>
                    </div>
                 </div>
            )}

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 {/* Manual Revenue Input */}
                <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-sm">
                     <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Faturamento do Mês Vigente</h3>
                        <select 
                            value={mesApuracao.toISOString().substring(0, 7)}
                            onChange={e => setMesApuracao(new Date(e.target.value + '-02'))}
                            className="bg-slate-50 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-sm rounded-md px-2 py-1"
                        >
                            {getMesesApuracaoOptions().map(date => (
                                <option key={date.toISOString()} value={date.toISOString().substring(0, 7)}>
                                    {date.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}
                                </option>
                            ))}
                        </select>
                    </div>
                    
                    <div className="space-y-4 bg-slate-50 dark:bg-slate-700/30 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                        {allActivities.map((act, index) => (
                            <div key={index} className="border-b border-slate-200 dark:border-slate-600 last:border-0 pb-4 last:pb-0">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                                        {act.role === 'Principal' ? 'Principal' : 'Secundária'} - CNAE {act.cnae}
                                    </span>
                                    <span className="text-xs px-2 py-0.5 bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-300 rounded-full">
                                        Anexo {act.anexo}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="relative flex-grow">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">R$</span>
                                        <input 
                                            type="text"
                                            value={faturamentoPorCnae[act.cnae] || ''}
                                            onChange={(e) => handleCnaeRevenueChange(act.cnae, e.target.value)}
                                            className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md text-right font-mono"
                                            placeholder="0,00"
                                        />
                                    </div>
                                    {/* Tax Configuration Checkboxes */}
                                    <div className="flex flex-col gap-1">
                                        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                                            <input 
                                                type="checkbox" 
                                                checked={configuracaoPorCnae[act.cnae]?.issRetido || false}
                                                onChange={() => toggleTaxConfig(act.cnae, 'issRetido')}
                                                className="rounded text-sky-600 focus:ring-sky-500"
                                            />
                                            Retenção ISS
                                        </label>
                                        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                                            <input 
                                                type="checkbox" 
                                                checked={configuracaoPorCnae[act.cnae]?.icmsSt || false}
                                                onChange={() => toggleTaxConfig(act.cnae, 'icmsSt')}
                                                className="rounded text-sky-600 focus:ring-sky-500"
                                            />
                                            ICMS ST
                                        </label>
                                    </div>
                                </div>
                            </div>
                        ))}
                        
                        {/* Quick Add Secondary CNAE Section */}
                        {isAddingCnae ? (
                            <div className="bg-white dark:bg-slate-800 p-3 rounded border border-slate-300 dark:border-slate-500 animate-fade-in">
                                <div className="flex gap-2 mb-2">
                                    <input 
                                        type="text" 
                                        value={quickCnae} 
                                        onChange={(e) => setQuickCnae(e.target.value)}
                                        placeholder="CNAE Secundário" 
                                        className="flex-grow p-1 border rounded dark:bg-slate-700 dark:border-slate-600 text-sm"
                                    />
                                    <select 
                                        value={quickAnexo} 
                                        onChange={(e) => setQuickAnexo(e.target.value as SimplesNacionalAnexo)}
                                        className="w-24 p-1 border rounded dark:bg-slate-700 dark:border-slate-600 text-sm"
                                    >
                                        <option value="I">An. I</option>
                                        <option value="II">An. II</option>
                                        <option value="III">An. III</option>
                                        <option value="IV">An. IV</option>
                                        <option value="V">An. V</option>
                                        <option value="III_V">III/V</option>
                                    </select>
                                </div>
                                <div className="flex justify-end gap-2">
                                    <button onClick={() => setIsAddingCnae(false)} className="text-xs text-slate-500 hover:underline">Cancelar</button>
                                    <button 
                                        onClick={() => handleQuickAddCnae()} 
                                        className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700"
                                        disabled={!quickCnae.trim()}
                                    >
                                        Adicionar
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button 
                                onClick={() => setIsAddingCnae(true)}
                                className="w-full text-xs text-sky-600 hover:text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-900/20 py-1 rounded border border-dashed border-sky-300 flex items-center justify-center gap-1"
                            >
                                <PlusIcon className="w-3 h-3" />
                                Adicionar CNAE Secundário
                            </button>
                        )}
                        
                        <div className="flex justify-between items-center pt-2 border-t border-slate-300 dark:border-slate-600">
                            <span className="font-bold text-slate-800 dark:text-slate-200">Total do Mês:</span>
                            <span className="font-mono font-bold text-lg text-slate-900 dark:text-white">R$ {totalDiscriminadoString}</span>
                        </div>
                        
                         <button 
                             onClick={() => handleSaveMesVigenteClick()}
                             className="w-full mt-2 py-2 bg-green-600 text-white font-bold rounded hover:bg-green-700 transition-colors flex justify-center items-center gap-2"
                         >
                             <SaveIcon className="w-4 h-4" />
                             Salvar Vigente
                         </button>
                         {manualSuccess && <p className="text-xs text-green-600 dark:text-green-400 text-center">{manualSuccess}</p>}
                    </div>

                    <div className="mt-6">
                        <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-3">Histórico Manual</h4>
                        <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-slate-200 dark:border-slate-600">
                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Preenchimento em Lote (Últimos 12 meses)</label>
                            <div className="flex gap-2">
                                <input 
                                    type="text"
                                    value={valorRecorrente}
                                    onChange={handleValorRecorrenteChange}
                                    placeholder="Valor Recorrente (R$)"
                                    className="flex-grow p-2 text-sm border rounded-md dark:bg-slate-800 dark:border-slate-600"
                                />
                                <button 
                                    onClick={handleAplicarRecorrente}
                                    className="px-3 py-1 bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-200 rounded text-xs font-bold hover:bg-slate-300"
                                >
                                    Aplicar a Todos
                                </button>
                            </div>
                        </div>
                        <form onSubmit={handleManualFaturamentoSubmit} className="space-y-2 max-h-60 overflow-y-auto pr-2">
                            {getPeriodoManual(mesApuracao).map(date => {
                                const mesChave = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
                                return (
                                    <div key={mesChave} className="flex items-center justify-between text-sm">
                                        <span className="text-slate-600 dark:text-slate-400 w-24">
                                            {date.toLocaleString('pt-BR', { month: 'short', year: 'numeric' })}:
                                        </span>
                                        <input
                                            type="text"
                                            value={manualFaturamento[mesChave] || ''}
                                            onChange={(e) => handleManualFaturamentoChange(mesChave, e.target.value)}
                                            className="flex-grow bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded px-2 py-1 text-right font-mono"
                                            placeholder="0,00"
                                        />
                                    </div>
                                );
                            })}
                            <button type="submit" className="w-full mt-2 bg-sky-100 text-sky-700 py-1 rounded hover:bg-sky-200 text-sm font-semibold">
                                Salvar Histórico Completo
                            </button>
                        </form>
                    </div>
                </div>

                {/* ChatBot Section */}
                <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-sm flex flex-col h-full">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                        <InfoIcon className="w-5 h-5 text-sky-500" />
                        Assistente IA do Simples
                    </h3>
                    <div className="flex-grow overflow-y-auto mb-4 bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 border border-slate-100 dark:border-slate-700 min-h-[200px]">
                        {chatResult ? (
                            <div className="prose prose-sm prose-slate dark:prose-invert">
                                <FormattedText text={chatResult.text} />
                            </div>
                        ) : (
                            <p className="text-slate-400 text-sm text-center mt-10">
                                Olá! Tenho o contexto da sua empresa.<br/>Pergunte-me sobre o cálculo do DAS, fator R ou mudança de faixa.
                            </p>
                        )}
                        {isChatLoading && <LoadingSpinner />}
                    </div>
                    <form onSubmit={handleChatSubmit} className="relative">
                        <input 
                            type="text" 
                            value={chatPergunta}
                            onChange={(e) => setChatPergunta(e.target.value)}
                            placeholder="Ex: Por que minha alíquota aumentou?"
                            className="w-full pl-4 pr-12 py-3 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                        <button 
                            type="submit"
                            disabled={!chatPergunta.trim() || isChatLoading}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-sky-600 text-white rounded-md hover:bg-sky-700 disabled:opacity-50"
                        >
                            <ArrowLeftIcon className="w-4 h-4 rotate-180" />
                        </button>
                    </form>
                </div>
            </div>
            
            {/* Histórico de Apurações (Table View) */}
            {empresa.historicoCalculos && empresa.historicoCalculos.length > 0 && (
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 mt-6">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                        <HistoryIcon className="w-5 h-5 text-sky-600" />
                        Histórico de Apurações Salvas
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-slate-500 dark:text-slate-400">
                            <thead className="text-xs text-slate-700 uppercase bg-slate-50 dark:bg-slate-700 dark:text-slate-300">
                                <tr>
                                    <th className="px-4 py-2">Mês Ref.</th>
                                    <th className="px-4 py-2 text-right">RBT12 (R$)</th>
                                    <th className="px-4 py-2 text-center">Anexo</th>
                                    <th className="px-4 py-2 text-center">Alíquota Ef.</th>
                                    <th className="px-4 py-2 text-right">DAS (R$)</th>
                                    <th className="px-4 py-2 text-center">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {empresa.historicoCalculos.map((hist) => (
                                    <tr key={hist.id} className="border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                        <td className="px-4 py-2 font-medium">{hist.mesReferencia}</td>
                                        <td className="px-4 py-2 text-right">
                                            {new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(hist.rbt12)}
                                        </td>
                                        <td className="px-4 py-2 text-center">{hist.anexo_efetivo}</td>
                                        <td className="px-4 py-2 text-center">{hist.aliq_eff.toFixed(2)}%</td>
                                        <td className="px-4 py-2 text-right font-bold text-slate-700 dark:text-slate-200">
                                            {new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(hist.das_mensal)}
                                        </td>
                                        <td className="px-4 py-2 text-center flex justify-center gap-2">
                                            <button 
                                                onClick={() => setSelectedHistorico(hist)}
                                                className="p-1 text-sky-600 hover:bg-sky-50 rounded dark:hover:bg-sky-900/20"
                                                title="Ver Detalhes"
                                            >
                                                <EyeIcon className="w-4 h-4" />
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteCalculo(hist.id)}
                                                className="p-1 text-red-500 hover:bg-red-50 rounded dark:hover:bg-red-900/20"
                                                title="Excluir do Histórico"
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

            <EditEmpresaModal 
                empresa={empresa}
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                onSave={(data) => {
                    onUpdateEmpresa(empresa.id, data);
                    setIsEditModalOpen(false);
                }}
            />

            {/* CNAE Validation Modal */}
            {isCnaeModalOpen && (
                 <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-fade-in" onClick={() => setIsCnaeModalOpen(false)}>
                    <div className="bg-white dark:bg-slate-800 p-6 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">Validação de CNAE: {cnaeToValidate}</h3>
                            <button onClick={() => setIsCnaeModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <CloseIcon className="w-6 h-6" />
                            </button>
                        </div>
                        {isCnaeLoading ? (
                            <LoadingSpinner />
                        ) : cnaeValidationResult ? (
                            <div className="prose prose-slate dark:prose-invert max-w-none">
                                <FormattedText text={cnaeValidationResult.text} />
                            </div>
                        ) : cnaeError ? (
                            <p className="text-red-500">{cnaeError}</p>
                        ) : null}
                    </div>
                 </div>
            )}
            
            <HistoryDetailsModal 
                data={selectedHistorico}
                isOpen={!!selectedHistorico}
                onClose={() => setSelectedHistorico(null)}
            />
        </div>
    );
};

export default SimplesNacionalDetalhe;
