
import { SimplesNacionalAnexo, SimplesNacionalEmpresa, SimplesNacionalNota, SimplesNacionalResumo, SimplesHistoricoCalculo, SimplesCalculoMensal, SimplesNacionalImportResult, SimplesNacionalAtividade, DetalhamentoAnexo, SimplesItemCalculo } from '../types';
import { extractInvoiceDataFromPdf, extractPgdasDataFromPdf } from './geminiService';

// ----------------- CONSTANTES E LOCALSTORAGE -----------------

const STORAGE_KEY_EMPRESAS = 'simples_nacional_empresas';
const STORAGE_KEY_NOTAS = 'simples_nacional_notas';

export const ANEXOS_TABELAS: Record<'I' | 'II' | 'III' | 'IV' | 'V', { limite: number; aliquota: number; parcela: number }[]> = {
    "I": [  // Comércio
        {"limite": 180000.00,  "aliquota": 4.0,   "parcela": 0.0},
        {"limite": 360000.00,  "aliquota": 7.3,   "parcela": 5940.0},
        {"limite": 720000.00,  "aliquota": 9.5,   "parcela": 13860.0},
        {"limite": 1800000.00, "aliquota": 10.7,  "parcela": 22500.0},
        {"limite": 3600000.00, "aliquota": 14.3,  "parcela": 87300.0},
        {"limite": 4800000.00, "aliquota": 19.0,  "parcela": 378000.0},
    ],
    "II": [  // Indústria
        {"limite": 180000.00,  "aliquota": 4.5,   "parcela": 0.0},
        {"limite": 360000.00,  "aliquota": 7.8,   "parcela": 5940.0},
        {"limite": 720000.00,  "aliquota": 10.0,  "parcela": 13860.0},
        {"limite": 1800000.00, "aliquota": 11.2,  "parcela": 22500.0},
        {"limite": 3600000.00, "aliquota": 14.7,  "parcela": 85500.0},
        {"limite": 4800000.00, "aliquota": 30.0,  "parcela": 720000.0},
    ],
    "III": [  // Serviços – baixa complexidade
        {"limite": 180000.00,  "aliquota": 6.0,   "parcela": 0.0},
        {"limite": 360000.00,  "aliquota": 11.2,  "parcela": 9360.0},
        {"limite": 720000.00,  "aliquota": 13.5,  "parcela": 17640.0},
        {"limite": 1800000.00, "aliquota": 16.0,  "parcela": 35640.0},
        {"limite": 3600000.00, "aliquota": 21.0,  "parcela": 125640.0},
        {"limite": 4800000.00, "aliquota": 33.0,  "parcela": 648000.0},
    ],
    "IV": [  // Serviços – alta complexidade
        {"limite": 180000.00,  "aliquota": 4.5,   "parcela": 0.0},
        {"limite": 360000.00,  "aliquota": 9.0,   "parcela": 8100.0},
        {"limite": 720000.00,  "aliquota": 10.2,  "parcela": 12420.0},
        {"limite": 1800000.00, "aliquota": 14.0,  "parcela": 39780.0},
        {"limite": 3600000.00, "aliquota": 22.0,  "parcela": 183780.0},
        {"limite": 4800000.00, "aliquota": 33.0,  "parcela": 828000.0},
    ],
    "V": [  // Serviços especiais
        {"limite": 180000.00,  "aliquota": 15.5,  "parcela": 0.0},
        {"limite": 360000.00,  "aliquota": 18.0,   "parcela": 4500.0},
        {"limite": 720000.00,  "aliquota": 19.5,  "parcela": 9900.0},
        {"limite": 1800000.00, "aliquota": 20.5,  "parcela": 17100.0},
        {"limite": 3600000.00, "aliquota": 23.0,  "parcela": 62100.0},
        {"limite": 4800000.00, "aliquota": 30.5,  "parcela": 540000.0},
    ],
};

export const REPARTICAO_IMPOSTOS: Record<string, Array<Record<string, number>>> = {
    "I": [ // Comércio
        { "IRPJ": 5.50, "CSLL": 3.50, "COFINS": 12.74, "PIS/PASEP": 2.76, "CPP": 41.50, "ICMS": 34.00 },
        { "IRPJ": 5.50, "CSLL": 3.50, "COFINS": 12.74, "PIS/PASEP": 2.76, "CPP": 41.50, "ICMS": 34.00 },
        { "IRPJ": 5.50, "CSLL": 3.50, "COFINS": 12.74, "PIS/PASEP": 2.76, "CPP": 42.00, "ICMS": 33.50 },
        { "IRPJ": 5.50, "CSLL": 3.50, "COFINS": 12.74, "PIS/PASEP": 2.76, "CPP": 42.00, "ICMS": 33.50 },
        { "IRPJ": 5.50, "CSLL": 3.50, "COFINS": 12.74, "PIS/PASEP": 2.76, "CPP": 42.00, "ICMS": 33.50 },
        { "IRPJ": 13.50, "CSLL": 10.00, "COFINS": 28.27, "PIS/PASEP": 6.13, "CPP": 42.10, "ICMS": 0.00 },
    ],
    "II": [ // Indústria
        { "IRPJ": 5.50, "CSLL": 3.50, "COFINS": 11.51, "PIS/PASEP": 2.49, "CPP": 37.50, "ICMS": 32.00, "IPI": 7.50 },
        { "IRPJ": 5.50, "CSLL": 3.50, "COFINS": 11.51, "PIS/PASEP": 2.49, "CPP": 37.50, "ICMS": 32.00, "IPI": 7.50 },
        { "IRPJ": 5.50, "CSLL": 3.50, "COFINS": 11.51, "PIS/PASEP": 2.49, "CPP": 37.50, "ICMS": 32.00, "IPI": 7.50 },
        { "IRPJ": 5.50, "CSLL": 3.50, "COFINS": 11.51, "PIS/PASEP": 2.49, "CPP": 37.50, "ICMS": 32.00, "IPI": 7.50 },
        { "IRPJ": 5.50, "CSLL": 3.50, "COFINS": 11.51, "PIS/PASEP": 2.49, "CPP": 37.50, "ICMS": 32.00, "IPI": 7.50 },
        { "IRPJ": 8.50, "CSLL": 7.50, "COFINS": 20.96, "PIS/PASEP": 4.54, "CPP": 23.50, "ICMS": 0.00, "IPI": 35.00 },
    ],
    "III": [ // Serviços (Locação, Contabilidade, etc)
        { "IRPJ": 4.00, "CSLL": 3.50, "COFINS": 12.82, "PIS/PASEP": 2.78, "CPP": 43.40, "ISS": 33.50 },
        { "IRPJ": 4.00, "CSLL": 3.50, "COFINS": 14.05, "PIS/PASEP": 3.05, "CPP": 43.40, "ISS": 32.00 },
        { "IRPJ": 4.00, "CSLL": 3.50, "COFINS": 13.64, "PIS/PASEP": 2.96, "CPP": 43.40, "ISS": 32.50 },
        { "IRPJ": 4.00, "CSLL": 3.50, "COFINS": 13.64, "PIS/PASEP": 2.96, "CPP": 43.40, "ISS": 32.50 },
        { "IRPJ": 4.00, "CSLL": 3.50, "COFINS": 12.82, "PIS/PASEP": 2.78, "CPP": 43.40, "ISS": 33.50 },
        { "IRPJ": 35.00, "CSLL": 15.00, "COFINS": 16.03, "PIS/PASEP": 3.47, "CPP": 30.50, "ISS": 0.00 },
    ],
    "IV": [ // Serviços (Advocacia, Construção, etc - CPP recolhido fora)
        { "IRPJ": 18.80, "CSLL": 15.20, "COFINS": 17.67, "PIS/PASEP": 3.83, "ISS": 44.50, "CPP": 0.00 },
        { "IRPJ": 19.80, "CSLL": 15.20, "COFINS": 20.55, "PIS/PASEP": 4.45, "ISS": 40.00, "CPP": 0.00 },
        { "IRPJ": 20.80, "CSLL": 15.20, "COFINS": 19.73, "PIS/PASEP": 4.27, "ISS": 40.00, "CPP": 0.00 },
        { "IRPJ": 17.80, "CSLL": 19.20, "COFINS": 18.90, "PIS/PASEP": 4.10, "ISS": 40.00, "CPP": 0.00 },
        { "IRPJ": 18.80, "CSLL": 19.20, "COFINS": 18.08, "PIS/PASEP": 3.92, "ISS": 40.00, "CPP": 0.00 },
        { "IRPJ": 53.50, "CSLL": 21.50, "COFINS": 20.55, "PIS/PASEP": 4.45, "ISS": 0.00, "CPP": 0.00 },
    ],
    "V": [ // Serviços Especiais
        { "IRPJ": 5.50, "CSLL": 3.00, "COFINS": 11.49, "PIS/PASEP": 2.49, "CPP": 28.85, "ISS": 33.75, "ICMS": 14.92 },
        { "IRPJ": 5.50, "CSLL": 3.00, "COFINS": 11.49, "PIS/PASEP": 2.49, "CPP": 28.85, "ISS": 33.75 },
        { "IRPJ": 5.50, "CSLL": 3.00, "COFINS": 11.49, "PIS/PASEP": 2.49, "CPP": 28.85, "ISS": 33.75 },
        { "IRPJ": 5.50, "CSLL": 3.00, "COFINS": 11.49, "PIS/PASEP": 2.49, "CPP": 28.85, "ISS": 33.75 },
        { "IRPJ": 5.50, "CSLL": 3.00, "COFINS": 11.49, "PIS/PASEP": 2.49, "CPP": 28.85, "ISS": 33.75 },
        { "IRPJ": 5.50, "CSLL": 3.00, "COFINS": 11.49, "PIS/PASEP": 2.49, "CPP": 28.85, "ISS": 0.00 },
    ]
};

const SUBLIMITE_ESTADUAL_MUNICIPAL = 3600000;

// ----------------- PERSISTÊNCIA (LocalStorage) -----------------

export const getEmpresas = (): SimplesNacionalEmpresa[] => {
    try {
        const data = localStorage.getItem(STORAGE_KEY_EMPRESAS);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error('Erro ao carregar empresas', e);
        return [];
    }
};

export const saveEmpresa = (nome: string, cnpj: string, cnae: string, anexo: SimplesNacionalAnexo | 'auto', atividadesSecundarias?: SimplesNacionalAtividade[]): SimplesNacionalEmpresa => {
    const empresas = getEmpresas();
    
    // Sugestão automática básica se 'auto' for selecionado
    let finalAnexo: SimplesNacionalAnexo = 'III'; // Default seguro
    if (anexo === 'auto') {
        finalAnexo = sugerirAnexoPorCnae(cnae);
    } else {
        finalAnexo = anexo;
    }

    const newEmpresa: SimplesNacionalEmpresa = {
        id: crypto.randomUUID(),
        nome,
        cnpj,
        cnae,
        anexo: finalAnexo,
        folha12: 0,
        atividadesSecundarias: atividadesSecundarias || []
    };
    
    empresas.push(newEmpresa);
    localStorage.setItem(STORAGE_KEY_EMPRESAS, JSON.stringify(empresas));
    return newEmpresa;
};

export const updateEmpresa = (id: string, data: Partial<SimplesNacionalEmpresa>): SimplesNacionalEmpresa | null => {
    const empresas = getEmpresas();
    const index = empresas.findIndex(e => e.id === id);
    if (index === -1) return null;

    const updated = { ...empresas[index], ...data };
    empresas[index] = updated;
    localStorage.setItem(STORAGE_KEY_EMPRESAS, JSON.stringify(empresas));
    return updated;
};

export const getEmpresaById = (id: string): SimplesNacionalEmpresa | undefined => {
    const empresas = getEmpresas();
    return empresas.find(e => e.id === id);
};

export const getAllNotas = (): Record<string, SimplesNacionalNota[]> => {
    try {
        const data = localStorage.getItem(STORAGE_KEY_NOTAS);
        return data ? JSON.parse(data) : {};
    } catch (e) {
        console.error('Erro ao carregar notas', e);
        return {};
    }
};

export const getNotasByEmpresa = (empresaId: string): SimplesNacionalNota[] => {
    const allNotas = getAllNotas();
    return allNotas[empresaId] || [];
};

export const saveNotas = (notas: SimplesNacionalNota[]) => {
    const allNotas = getAllNotas();
    if (notas.length === 0) return;
    
    const empresaId = notas[0].empresaId;
    const existing = allNotas[empresaId] || [];
    
    // Evitar duplicatas exatas
    allNotas[empresaId] = [...existing, ...notas];
    
    localStorage.setItem(STORAGE_KEY_NOTAS, JSON.stringify(allNotas));
};

export const updateFolha12 = (empresaId: string, folha12: number): SimplesNacionalEmpresa | null => {
    return updateEmpresa(empresaId, { folha12 });
};

export const saveFaturamentoManual = (empresaId: string, faturamento: { [key: string]: number }): SimplesNacionalEmpresa | null => {
    return updateEmpresa(empresaId, { faturamentoManual: faturamento });
};

export const saveHistoricoCalculo = (empresaId: string, resumo: SimplesNacionalResumo, mesApuracao: Date): SimplesNacionalEmpresa | null => {
    const empresa = getEmpresaById(empresaId);
    if (!empresa) return null;

    const mesReferencia = mesApuracao.toLocaleString('pt-BR', { month: 'short', year: 'numeric' });
    
    const novoCalculo: SimplesHistoricoCalculo = {
        id: crypto.randomUUID(),
        dataCalculo: Date.now(),
        mesReferencia: mesReferencia,
        rbt12: resumo.rbt12,
        aliq_eff: resumo.aliq_eff,
        fator_r: resumo.fator_r,
        das_mensal: resumo.das_mensal,
        anexo_efetivo: `Anexo ${resumo.anexo_efetivo}`
    };

    // Remove cálculos anteriores para o mesmo mês de referência para evitar duplicação
    const historicoAtual = empresa.historicoCalculos ? empresa.historicoCalculos.filter(h => h.mesReferencia !== mesReferencia) : [];
    
    return updateEmpresa(empresaId, { historicoCalculos: [novoCalculo, ...historicoAtual] });
};


// ----------------- UTILITÁRIOS E CÁLCULOS -----------------

export const sugerirAnexoPorCnae = (cnae: string): SimplesNacionalAnexo => {
    const cleanCnae = cnae.replace(/\D/g, '');
    
    if (cleanCnae.startsWith('47')) return 'I'; // Comércio Varejista
    if (cleanCnae.startsWith('46')) return 'I'; // Comércio Atacadista
    if (cleanCnae.startsWith('10') || cleanCnae.startsWith('25') || cleanCnae.startsWith('31')) return 'II'; // Indústrias comuns
    if (cleanCnae.startsWith('620')) return 'III_V'; // TI (Fator R)
    if (cleanCnae.startsWith('692')) return 'III'; // Contabilidade
    if (cleanCnae.startsWith('691')) return 'IV'; // Advocacia
    if (cleanCnae.startsWith('412')) return 'IV'; // Construção Civil
    if (cleanCnae.startsWith('812')) return 'IV'; // Limpeza
    
    return 'III'; // Default mais comum para serviços
};

export const calcularAliquotaSimples = (receita12: number, anexo: keyof typeof ANEXOS_TABELAS): { nom: number; eff: number; faixaIndex: number } => {
    if (receita12 <= 0) {
        const primeiraFaixa = ANEXOS_TABELAS[anexo][0];
        return { nom: primeiraFaixa.aliquota, eff: primeiraFaixa.aliquota, faixaIndex: 0 }; 
    }

    const tabela = ANEXOS_TABELAS[anexo];
    let faixaEscolhida = tabela[tabela.length - 1];
    let faixaIndex = tabela.length - 1;

    for (let i = 0; i < tabela.length; i++) {
        if (receita12 <= tabela[i].limite) {
            faixaEscolhida = tabela[i];
            faixaIndex = i;
            break;
        }
    }

    const aliquota_nom = faixaEscolhida.aliquota;
    const parcela = faixaEscolhida.parcela;
    const aliq_eff = ((receita12 * (aliquota_nom / 100.0)) - parcela) / receita12 * 100.0;
    
    return { nom: aliquota_nom, eff: Math.max(0, aliq_eff), faixaIndex };
};

const resolverAnexoEfetivo = (anexoBase: SimplesNacionalAnexo, rbt12: number, folha12: number) => {
    const fatorR = rbt12 > 0 ? folha12 / rbt12 : 0;
    let anexoEfetivo: 'I' | 'II' | 'III' | 'IV' | 'V';

    if (anexoBase === 'III_V') {
        anexoEfetivo = fatorR >= 0.28 ? 'III' : 'V';
    } else {
        anexoEfetivo = anexoBase;
    }

    return { anexoEfetivo, fatorR };
};

export const calcularResumoEmpresa = (
    empresa: SimplesNacionalEmpresa,
    notasDaEmpresa: SimplesNacionalNota[],
    mesApuracao: Date,
    options: { fullHistory?: boolean; itensCalculo?: SimplesItemCalculo[] } = { fullHistory: true }
): SimplesNacionalResumo => {
    const faturamentoNotasPorMes: { [key: string]: number } = {};
    for (const nota of notasDaEmpresa) {
        const data = new Date(nota.data);
        const chave = `${data.getFullYear()}-${(data.getMonth() + 1).toString().padStart(2, '0')}`;
        faturamentoNotasPorMes[chave] = (faturamentoNotasPorMes[chave] || 0) + nota.valor;
    }

    const faturamentoConsolidado: { [key: string]: number } = { ...faturamentoNotasPorMes };
    if (empresa.faturamentoManual) {
        Object.entries(empresa.faturamentoManual).forEach(([key, value]) => {
            faturamentoConsolidado[key] = value as number;
        });
    }

    const calcularRBT12ParaMes = (dataReferencia: Date): number => {
        let sum = 0;
        const inicioRBT = new Date(dataReferencia.getFullYear(), dataReferencia.getMonth() - 12, 1);
        for (let i = 0; i < 12; i++) {
            const mesIteracao = new Date(inicioRBT.getFullYear(), inicioRBT.getMonth() + i, 1);
            const chave = `${mesIteracao.getFullYear()}-${(mesIteracao.getMonth() + 1).toString().padStart(2, '0')}`;
            sum += faturamentoConsolidado[chave] || 0;
        }
        return sum;
    };

    const rbt12Atual = calcularRBT12ParaMes(mesApuracao);
    const folha12 = empresa.folha12;

    // Resolução do Anexo Principal e Fator R GLOBAL (para referência)
    const { anexoEfetivo: anexoEfetivoPrincipal, fatorR: fatorRGlobal } = resolverAnexoEfetivo(empresa.anexo, rbt12Atual, folha12);
    const { nom, eff, faixaIndex } = calcularAliquotaSimples(rbt12Atual, anexoEfetivoPrincipal);
    
    // --- CÁLCULO DO DAS COMPOSTO (Múltiplas Atividades & Retenções) ---
    let totalDasMensal = 0;
    const detalhamentoAnexos: DetalhamentoAnexo[] = [];
    const mesApuracaoChave = `${mesApuracao.getFullYear()}-${(mesApuracao.getMonth() + 1).toString().padStart(2, '0')}`;

    // Se houver discriminação manual detalhada (Itens com Retenção/ST)
    if (options.itensCalculo && options.itensCalculo.length > 0) {
        for (const item of options.itensCalculo) {
            if (item.valor > 0) {
                // Resolve Anexo Efetivo para a atividade
                const { anexoEfetivo: anexoEfAtiv } = resolverAnexoEfetivo(item.anexo, rbt12Atual, folha12);
                
                // Calcula alíquota nominal e efetiva padrão
                const { eff: effAtiv, faixaIndex: faixaIdxAtiv } = calcularAliquotaSimples(rbt12Atual, anexoEfAtiv);
                
                let effFinal = effAtiv;

                // --- LOGICA DE DEDUÇÃO DE IMPOSTOS (Retenção / ST) ---
                // Se houver retenção, a alíquota efetiva é reduzida proporcionalmente à participação do imposto no DAS
                if (item.issRetido || item.icmsSt) {
                     const reparticao = REPARTICAO_IMPOSTOS[anexoEfAtiv];
                     if (reparticao) {
                        const indexSeguro = Math.min(faixaIdxAtiv, reparticao.length - 1);
                        const percentuais = reparticao[indexSeguro];
                        
                        let reducaoPercentual = 0;
                        if (item.issRetido && percentuais['ISS']) {
                            reducaoPercentual += percentuais['ISS'];
                        }
                        if (item.icmsSt && percentuais['ICMS']) {
                            reducaoPercentual += percentuais['ICMS'];
                        }
                        
                        // A nova alíquota efetiva é a original menos a parte percentual do imposto retido
                        // Ex: AliqEf 10%. ISS representa 33.5% do DAS.
                        // Nova Aliq = 10% * (1 - 0.335) = 6.65%
                        effFinal = effAtiv * (1 - (reducaoPercentual / 100));
                     }
                }

                const valorDasAtiv = item.valor * (effFinal / 100.0);
                totalDasMensal += valorDasAtiv;
                
                detalhamentoAnexos.push({
                    anexo: anexoEfAtiv,
                    faturamento: item.valor,
                    aliquotaEfetiva: effFinal,
                    valorDas: valorDasAtiv,
                    issRetido: item.issRetido,
                    icmsSt: item.icmsSt
                });
            }
        }
    } else {
        // Fallback: Assume tudo no anexo principal/efetivo padrão
        const faturamentoMesApuracao = faturamentoConsolidado[mesApuracaoChave] || 0;
        totalDasMensal = faturamentoMesApuracao * (eff / 100.0);
        
        if (faturamentoMesApuracao > 0) {
             detalhamentoAnexos.push({
                anexo: anexoEfetivoPrincipal,
                faturamento: faturamentoMesApuracao,
                aliquotaEfetiva: eff,
                valorDas: totalDasMensal
            });
        }
    }
    
    // DAS Estimado (projeção simples baseada na média 12m ou total)
    const dasEstimado = rbt12Atual * (eff / 100.0);

    // Histórico Simulado (Mantém lógica simples por mês, assumindo anexo principal para histórico passado visual)
    const historicoSimulado: SimplesCalculoMensal[] = [];
    const dataInicioGrafico = new Date(mesApuracao.getFullYear(), mesApuracao.getMonth() - 11, 1);

    for (let i = 0; i < 12; i++) {
        const dataRef = new Date(dataInicioGrafico.getFullYear(), dataInicioGrafico.getMonth() + i, 1);
        const chaveRef = `${dataRef.getFullYear()}-${(dataRef.getMonth() + 1).toString().padStart(2, '0')}`;
        const label = dataRef.toLocaleString('pt-BR', { month: 'short', year: 'numeric' });
        
        const faturamentoMes = faturamentoConsolidado[chaveRef] || 0;
        const rbt12Ref = calcularRBT12ParaMes(dataRef);
        const { anexoEfetivo, fatorR } = resolverAnexoEfetivo(empresa.anexo, rbt12Ref, folha12);
        const { eff: effRef } = calcularAliquotaSimples(rbt12Ref, anexoEfetivo);
        const dasCalculado = faturamentoMes * (effRef / 100.0);

        historicoSimulado.push({
            competencia: chaveRef,
            label: label.charAt(0).toUpperCase() + label.slice(1),
            faturamento: faturamentoMes,
            rbt12: rbt12Ref,
            aliquotaEfetiva: effRef,
            fatorR: fatorR,
            dasCalculado: dasCalculado,
            anexoAplicado: anexoEfetivo
        });
    }

    const sortedMensal = Object.fromEntries(Object.entries(faturamentoConsolidado).sort());
    const ultrapassou_sublimite = rbt12Atual > SUBLIMITE_ESTADUAL_MUNICIPAL;

    // Se houver detalhamento composto, calcula a alíquota efetiva média ponderada para exibição
    const aliquotaEfetivaFinal = totalDasMensal > 0 && detalhamentoAnexos.length > 0
        ? (totalDasMensal / detalhamentoAnexos.reduce((acc, curr) => acc + curr.faturamento, 0)) * 100
        : eff;

    return {
        rbt12: rbt12Atual,
        aliq_nom: nom,
        aliq_eff: aliquotaEfetivaFinal,
        das: dasEstimado,
        das_mensal: totalDasMensal,
        mensal: sortedMensal,
        historico_simulado: historicoSimulado,
        anexo_efetivo: anexoEfetivoPrincipal, // Mantém o principal como referência, mas o cálculo real está no detalhamento
        fator_r: fatorRGlobal,
        folha_12: empresa.folha12,
        ultrapassou_sublimite,
        faixa_index: faixaIndex,
        detalhamento_anexos: detalhamentoAnexos
    };
};

// Helper for cleaning money strings from OCR
const sanitizeMoneyValue = (value: any): number => {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return 0;

    // Remove typical noise "R$", spaces, etc.
    let clean = value.replace(/[R$\s]/g, '');
    
    // Handle common OCR errors
    clean = clean.replace(/O/g, '0').replace(/l/g, '1').replace(/S/g, '5');

    // Try to determine if it uses comma or dot as decimal separator
    const lastCommaIndex = clean.lastIndexOf(',');
    const lastDotIndex = clean.lastIndexOf('.');

    if (lastCommaIndex > lastDotIndex) {
        // Likely Brazilian format: 1.000,00
        clean = clean.replace(/\./g, '').replace(',', '.');
    } else {
        // Likely US format: 1,000.00 or already clean number
        clean = clean.replace(/,/g, '');
    }

    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
}

export const parseAndSaveNotas = async (empresaId: string, file: File): Promise<SimplesNacionalImportResult> => {
    const result: SimplesNacionalImportResult = { successCount: 0, failCount: 0, errors: [] };
    const notasToSave: SimplesNacionalNota[] = [];

    try {
        if (file.type === 'application/pdf') {
            // Convert File to Base64
            const buffer = await file.arrayBuffer();
            let binary = '';
            const bytes = new Uint8Array(buffer);
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            const base64 = btoa(binary);

            // Check if it's a PGDAS Extract (Revenue History) or Invoices
            if (file.name.toUpperCase().includes('PGDAS') || file.name.toUpperCase().includes('EXTRATO')) {
                try {
                    const pgdasData = await extractPgdasDataFromPdf(base64);
                    if (pgdasData && pgdasData.length > 0) {
                         const faturamentoManualUpdate: {[key: string]: number} = {};
                         pgdasData.forEach(item => {
                             const parts = item.competencia.split('/');
                             if (parts.length === 2) {
                                 // Format YYYY-MM
                                 const key = `${parts[1]}-${parts[0]}`; 
                                 faturamentoManualUpdate[key] = sanitizeMoneyValue(item.valor);
                             }
                         });
                         saveFaturamentoManual(empresaId, faturamentoManualUpdate);
                         result.successCount = pgdasData.length;
                         return result;
                    }
                } catch (e) {
                    // Fallback to invoice extraction
                }
            }

            // Invoice Extraction
            const extractedData = await extractInvoiceDataFromPdf(base64);
            
            extractedData.forEach(item => {
                 // Parse date DD/MM/YYYY
                 let timestamp = Date.now();
                 if (item.data) {
                    const dateParts = item.data.split('/');
                    if (dateParts.length === 3) {
                        timestamp = new Date(Number(dateParts[2]), Number(dateParts[1]) - 1, Number(dateParts[0])).getTime();
                    }
                 }
                 
                 const safeValue = sanitizeMoneyValue(item.valor);
                 
                 if (safeValue > 0) {
                     notasToSave.push({
                         id: crypto.randomUUID(),
                         empresaId,
                         data: timestamp,
                         valor: safeValue,
                         descricao: item.descricao || 'Nota importada via PDF',
                         origem: 'PDF Import'
                     });
                 }
            });

        } else if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
             const text = await file.text();
             const lines = text.split('\n');
             // Simple CSV parser: Date,Value,Description
             lines.forEach((line, idx) => {
                 if (!line.trim() || idx === 0) return; // Skip empty or header
                 const cols = line.split(',');
                 if (cols.length >= 2) {
                     const dateStr = cols[0].trim(); // Assume YYYY-MM-DD or DD/MM/YYYY
                     let timestamp = Date.parse(dateStr);
                     if (isNaN(timestamp)) {
                         // Try DD/MM/YYYY
                         const parts = dateStr.split('/');
                         if (parts.length === 3) {
                             timestamp = new Date(Number(parts[2]), Number(parts[1])-1, Number(parts[0])).getTime();
                         }
                     }

                     const val = parseFloat(cols[1].trim());
                     if (!isNaN(timestamp) && !isNaN(val)) {
                         notasToSave.push({
                             id: crypto.randomUUID(),
                             empresaId,
                             data: timestamp,
                             valor: val,
                             descricao: cols[2]?.trim() || 'Importado CSV',
                             origem: 'CSV'
                         });
                     } else {
                         result.failCount++;
                         result.errors.push(`Linha ${idx+1}: Dados inválidos`);
                     }
                 }
             });
        }

        if (notasToSave.length > 0) {
            saveNotas(notasToSave);
            result.successCount += notasToSave.length;
        }

    } catch (e: any) {
        result.errors.push(e.message || "Erro ao processar arquivo.");
    }

    return result;
};

export const calcularDiscriminacaoImpostos = (
    anexo: string,
    faixaIndex: number,
    valorDasTotal: number
): Record<string, number> => {
    const discriminacao: Record<string, number> = {};
    
    if (valorDasTotal <= 0) return discriminacao;
    
    // Ensure faixaIndex is within bounds (0-5)
    const safeIndex = Math.max(0, Math.min(faixaIndex, 5));
    const reparticao = REPARTICAO_IMPOSTOS[anexo]?.[safeIndex];

    if (reparticao) {
        Object.entries(reparticao).forEach(([imposto, percentual]) => {
            // Percentual is share of DAS (e.g. 34.00 for ICMS means 34% of the DAS value)
            discriminacao[imposto] = valorDasTotal * (percentual / 100);
        });
    }

    return discriminacao;
};
