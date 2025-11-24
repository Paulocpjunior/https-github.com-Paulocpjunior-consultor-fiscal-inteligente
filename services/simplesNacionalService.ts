
import { SimplesNacionalAnexo, SimplesNacionalEmpresa, SimplesNacionalNota, SimplesNacionalResumo, SimplesHistoricoCalculo, SimplesCalculoMensal, SimplesNacionalImportResult, SimplesNacionalAtividade, DetalhamentoAnexo, SimplesItemCalculo } from '../types';
import { extractInvoiceDataFromPdf, extractPgdasDataFromPdf } from './geminiService';
import { db, isFirebaseConfigured } from './firebaseConfig';
import { collection, getDocs, doc, setDoc, updateDoc, getDoc, addDoc } from 'firebase/firestore';

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

// ----------------- DATA ACCESS LAYER (HYBRID) -----------------

export const getEmpresas = async (): Promise<SimplesNacionalEmpresa[]> => {
    if (isFirebaseConfigured && db) {
        try {
            const snapshot = await getDocs(collection(db, 'simples_empresas'));
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SimplesNacionalEmpresa));
        } catch (e) {
            console.error("Erro ao buscar empresas no Firebase", e);
            return [];
        }
    } else {
        try {
            const data = localStorage.getItem(STORAGE_KEY_EMPRESAS);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            return [];
        }
    }
};

export const saveEmpresa = async (nome: string, cnpj: string, cnae: string, anexo: SimplesNacionalAnexo | 'auto', atividadesSecundarias?: SimplesNacionalAtividade[]): Promise<SimplesNacionalEmpresa> => {
    let finalAnexo: SimplesNacionalAnexo = 'III';
    if (anexo === 'auto') {
        finalAnexo = sugerirAnexoPorCnae(cnae);
    } else {
        finalAnexo = anexo;
    }

    const newEmpresaData = {
        nome,
        cnpj,
        cnae,
        anexo: finalAnexo,
        folha12: 0,
        atividadesSecundarias: atividadesSecundarias || []
    };

    if (isFirebaseConfigured && db) {
        const docRef = await addDoc(collection(db, 'simples_empresas'), newEmpresaData);
        return { id: docRef.id, ...newEmpresaData };
    } else {
        const empresas = await getEmpresas(); // Local call is fast
        const newEmpresa = { id: crypto.randomUUID(), ...newEmpresaData };
        empresas.push(newEmpresa);
        localStorage.setItem(STORAGE_KEY_EMPRESAS, JSON.stringify(empresas));
        return newEmpresa;
    }
};

export const updateEmpresa = async (id: string, data: Partial<SimplesNacionalEmpresa>): Promise<SimplesNacionalEmpresa | null> => {
    if (isFirebaseConfigured && db) {
        const docRef = doc(db, 'simples_empresas', id);
        await updateDoc(docRef, data);
        const updatedSnap = await getDoc(docRef);
        return { id: updatedSnap.id, ...updatedSnap.data() } as SimplesNacionalEmpresa;
    } else {
        const empresas = await getEmpresas();
        const index = empresas.findIndex(e => e.id === id);
        if (index === -1) return null;
        const updated = { ...empresas[index], ...data };
        empresas[index] = updated;
        localStorage.setItem(STORAGE_KEY_EMPRESAS, JSON.stringify(empresas));
        return updated;
    }
};

export const getAllNotas = async (): Promise<Record<string, SimplesNacionalNota[]>> => {
    if (isFirebaseConfigured && db) {
        // In Firestore, we might store notes in a subcollection or main collection with empresaId
        // For simplicity, let's assume a 'simples_notas' collection
        const snapshot = await getDocs(collection(db, 'simples_notas'));
        const notas: Record<string, SimplesNacionalNota[]> = {};
        snapshot.forEach(doc => {
            const data = doc.data() as SimplesNacionalNota;
            if (!notas[data.empresaId]) notas[data.empresaId] = [];
            notas[data.empresaId].push({ id: doc.id, ...data });
        });
        return notas;
    } else {
        try {
            const data = localStorage.getItem(STORAGE_KEY_NOTAS);
            return data ? JSON.parse(data) : {};
        } catch (e) {
            return {};
        }
    }
};

export const saveNotas = async (notas: SimplesNacionalNota[]) => {
    if (isFirebaseConfigured && db) {
        const batchPromises = notas.map(nota => {
            // Remove ID if it was locally generated or let Firestore generate one
            const { id, ...data } = nota;
            return addDoc(collection(db, 'simples_notas'), data);
        });
        await Promise.all(batchPromises);
    } else {
        const allNotas = await getAllNotas();
        if (notas.length === 0) return;
        const empresaId = notas[0].empresaId;
        const existing = allNotas[empresaId] || [];
        allNotas[empresaId] = [...existing, ...notas];
        localStorage.setItem(STORAGE_KEY_NOTAS, JSON.stringify(allNotas));
    }
};

export const updateFolha12 = async (empresaId: string, folha12: number): Promise<SimplesNacionalEmpresa | null> => {
    return updateEmpresa(empresaId, { folha12 });
};

export const saveFaturamentoManual = async (empresaId: string, faturamento: { [key: string]: number }): Promise<SimplesNacionalEmpresa | null> => {
    return updateEmpresa(empresaId, { faturamentoManual: faturamento });
};

export const saveHistoricoCalculo = async (empresaId: string, resumo: SimplesNacionalResumo, mesApuracao: Date): Promise<SimplesNacionalEmpresa | null> => {
    // Fetch current state first to append
    let empresa: SimplesNacionalEmpresa | undefined;
    
    if (isFirebaseConfigured && db) {
        const snap = await getDoc(doc(db, 'simples_empresas', empresaId));
        if (snap.exists()) empresa = { id: snap.id, ...snap.data() } as SimplesNacionalEmpresa;
    } else {
        empresa = (await getEmpresas()).find(e => e.id === empresaId);
    }

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

    const historicoAtual = empresa.historicoCalculos ? empresa.historicoCalculos.filter(h => h.mesReferencia !== mesReferencia) : [];
    
    return updateEmpresa(empresaId, { historicoCalculos: [novoCalculo, ...historicoAtual] });
};


// ----------------- UTILITÁRIOS E CÁLCULOS (Síncronos) -----------------

export const sugerirAnexoPorCnae = (cnae: string): SimplesNacionalAnexo => {
    const cleanCnae = cnae.replace(/\D/g, '');
    
    if (cleanCnae.startsWith('47')) return 'I'; 
    if (cleanCnae.startsWith('46')) return 'I'; 
    if (cleanCnae.startsWith('10') || cleanCnae.startsWith('25') || cleanCnae.startsWith('31')) return 'II'; 
    if (cleanCnae.startsWith('620')) return 'III_V'; 
    if (cleanCnae.startsWith('692')) return 'III'; 
    if (cleanCnae.startsWith('691')) return 'IV'; 
    if (cleanCnae.startsWith('412')) return 'IV'; 
    if (cleanCnae.startsWith('812')) return 'IV'; 
    
    return 'III'; 
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
    
    let totalDasMensal = 0;
    const detalhamentoAnexos: DetalhamentoAnexo[] = [];
    const mesApuracaoChave = `${mesApuracao.getFullYear()}-${(mesApuracao.getMonth() + 1).toString().padStart(2, '0')}`;

    if (options.itensCalculo && options.itensCalculo.length > 0) {
        for (const item of options.itensCalculo) {
            if (item.valor > 0) {
                const { anexoEfetivo: anexoEfAtiv } = resolverAnexoEfetivo(item.anexo, rbt12Atual, folha12);
                const { eff: effAtiv, faixaIndex: faixaIdxAtiv } = calcularAliquotaSimples(rbt12Atual, anexoEfAtiv);
                
                let effFinal = effAtiv;

                if (item.issRetido || item.icmsSt) {
                     const reparticao = REPARTICAO_IMPOSTOS[anexoEfAtiv];
                     if (reparticao) {
                        const indexSeguro = Math.min(faixaIdxAtiv, reparticao.length - 1);
                        const percentuais = reparticao[indexSeguro];
                        
                        let reducaoPercentual = 0;
                        if (item.issRetido && percentuais['ISS']) reducaoPercentual += percentuais['ISS'];
                        if (item.icmsSt && percentuais['ICMS']) reducaoPercentual += percentuais['ICMS'];
                        
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
    
    const dasEstimado = rbt12Atual * (eff / 100.0);

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
        anexo_efetivo: anexoEfetivoPrincipal, 
        fator_r: fatorRGlobal,
        folha_12: empresa.folha12,
        ultrapassou_sublimite,
        faixa_index: faixaIndex,
        detalhamento_anexos: detalhamentoAnexos
    };
};

const sanitizeMoneyValue = (value: any): number => {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return 0;
    let clean = value.replace(/[R$\s]/g, '');
    clean = clean.replace(/O/g, '0').replace(/l/g, '1').replace(/S/g, '5');
    const lastCommaIndex = clean.lastIndexOf(',');
    const lastDotIndex = clean.lastIndexOf('.');
    if (lastCommaIndex > lastDotIndex) {
        clean = clean.replace(/\./g, '').replace(',', '.');
    } else {
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
            const buffer = await file.arrayBuffer();
            let binary = '';
            const bytes = new Uint8Array(buffer);
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            const base64 = btoa(binary);

            if (file.name.toUpperCase().includes('PGDAS') || file.name.toUpperCase().includes('EXTRATO')) {
                try {
                    const pgdasData = await extractPgdasDataFromPdf(base64);
                    if (pgdasData && pgdasData.length > 0) {
                         const faturamentoManualUpdate: {[key: string]: number} = {};
                         pgdasData.forEach(item => {
                             const parts = item.competencia.split('/');
                             if (parts.length === 2) {
                                 const key = `${parts[1]}-${parts[0]}`; 
                                 faturamentoManualUpdate[key] = sanitizeMoneyValue(item.valor);
                             }
                         });
                         await saveFaturamentoManual(empresaId, faturamentoManualUpdate);
                         result.successCount = pgdasData.length;
                         return result;
                    }
                } catch (e) { }
            }

            const extractedData = await extractInvoiceDataFromPdf(base64);
            
            extractedData.forEach(item => {
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
             lines.forEach((line, idx) => {
                 if (!line.trim() || idx === 0) return; 
                 const cols = line.split(',');
                 if (cols.length >= 2) {
                     const dateStr = cols[0].trim();
                     let timestamp = Date.parse(dateStr);
                     if (isNaN(timestamp)) {
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
            await saveNotas(notasToSave);
            result.successCount += notasToSave.length;
        }

    } catch (e: any) {
        result.errors.push(e.message || "Erro ao processar arquivo.");
    }

    return result;
};

export const calcularDiscriminacaoImpostos = (anexo: string, faixaIndex: number, valorDasTotal: number): Record<string, number> => {
    const discriminacao: Record<string, number> = {};
    if (valorDasTotal <= 0) return discriminacao;
    const safeIndex = Math.max(0, Math.min(faixaIndex, 5));
    const reparticao = REPARTICAO_IMPOSTOS[anexo]?.[safeIndex];
    if (reparticao) {
        Object.entries(reparticao).forEach(([imposto, percentual]) => {
            discriminacao[imposto] = valorDasTotal * (percentual / 100);
        });
    }
    return discriminacao;
};
