
import { SimplesNacionalAnexo, SimplesNacionalEmpresa, SimplesNacionalNota, SimplesNacionalResumo, SimplesHistoricoCalculo, SimplesCalculoMensal, SimplesNacionalImportResult, SimplesNacionalAtividade, DetalhamentoAnexo, SimplesItemCalculo, User } from '../types';
import { extractDocumentData, extractPgdasDataFromPdf } from './geminiService';
import { db, isFirebaseConfigured, auth } from './firebaseConfig';
import { collection, getDocs, doc, updateDoc, setDoc, addDoc, getDoc, query, where } from 'firebase/firestore';

const STORAGE_KEY_EMPRESAS = 'simples_nacional_empresas';
const STORAGE_KEY_NOTAS = 'simples_nacional_notas';
const MASTER_ADMIN_EMAIL = 'junior@spassessoriacontabil.com.br';

export const ANEXOS_TABELAS: any = {
    "I": [{"limite": 180000,"aliquota":4,"parcela":0},{"limite":360000,"aliquota":7.3,"parcela":5940},{"limite":720000,"aliquota":9.5,"parcela":13860},{"limite":1800000,"aliquota":10.7,"parcela":22500},{"limite":3600000,"aliquota":14.3,"parcela":87300},{"limite":4800000,"aliquota":19,"parcela":378000}],
    "II": [{"limite":180000,"aliquota":4.5,"parcela":0},{"limite":360000,"aliquota":7.8,"parcela":5940},{"limite":720000,"aliquota":10,"parcela":13860},{"limite":1800000,"aliquota":11.2,"parcela":22500},{"limite":3600000,"aliquota":14.7,"parcela":85500},{"limite":4800000,"aliquota":30,"parcela":720000}],
    "III": [{"limite":180000,"aliquota":6,"parcela":0},{"limite":360000,"aliquota":11.2,"parcela":9360},{"limite":720000,"aliquota":13.5,"parcela":17640},{"limite":1800000,"aliquota":16,"parcela":35640},{"limite":3600000,"aliquota":21,"parcela":125640},{"limite":4800000,"aliquota":33,"parcela":648000}],
    "IV": [{"limite":180000,"aliquota":4.5,"parcela":0},{"limite":360000,"aliquota":9,"parcela":8100},{"limite":720000,"aliquota":10.2,"parcela":12420},{"limite":1800000,"aliquota":14,"parcela":39780},{"limite":3600000,"aliquota":22,"parcela":183780},{"limite":4800000,"aliquota":33,"parcela":828000}],
    "V": [{"limite":180000,"aliquota":15.5,"parcela":0},{"limite":360000,"aliquota":18,"parcela":4500},{"limite":720000,"aliquota":19.5,"parcela":9900},{"limite":1800000,"aliquota":20.5,"parcela":17100},{"limite":3600000,"aliquota":23,"parcela":62100},{"limite":4800000,"aliquota":30.5,"parcela":540000}]
};

// Tabela Completa de Repartição dos Tributos (Percentuais da Alíquota Efetiva)
// Fonte: LC 123/2006 atualizada
export const REPARTICAO_IMPOSTOS: any = {
    "I": { // Comércio
        0: { "IRPJ": 5.50, "CSLL": 3.50, "COFINS": 12.74, "PIS": 2.76, "CPP": 41.50, "ICMS": 34.00 }, // 1ª Faixa
        1: { "IRPJ": 5.50, "CSLL": 3.50, "COFINS": 12.74, "PIS": 2.76, "CPP": 41.50, "ICMS": 34.00 }, // 2ª Faixa
        2: { "IRPJ": 5.50, "CSLL": 3.50, "COFINS": 12.74, "PIS": 2.76, "CPP": 42.00, "ICMS": 33.50 }, // 3ª Faixa
        3: { "IRPJ": 5.50, "CSLL": 3.50, "COFINS": 12.74, "PIS": 2.76, "CPP": 42.00, "ICMS": 33.50 }, // 4ª Faixa
        4: { "IRPJ": 5.50, "CSLL": 3.50, "COFINS": 12.74, "PIS": 2.76, "CPP": 42.00, "ICMS": 33.50 }, // 5ª Faixa
        5: { "IRPJ": 13.50, "CSLL": 10.00, "COFINS": 28.27, "PIS": 6.13, "CPP": 42.10, "ICMS": 0.00 }  // 6ª Faixa (ICMS Fixo/Separado em alguns casos, mas na regra geral segue. Ajustado conforme LC)
    },
    "II": { // Indústria
        0: { "IRPJ": 5.50, "CSLL": 3.50, "COFINS": 11.51, "PIS": 2.49, "CPP": 37.50, "IPI": 7.50, "ICMS": 32.00 },
        1: { "IRPJ": 5.50, "CSLL": 3.50, "COFINS": 11.51, "PIS": 2.49, "CPP": 37.50, "IPI": 7.50, "ICMS": 32.00 },
        2: { "IRPJ": 5.50, "CSLL": 3.50, "COFINS": 11.51, "PIS": 2.49, "CPP": 37.50, "IPI": 7.50, "ICMS": 32.00 },
        3: { "IRPJ": 5.50, "CSLL": 3.50, "COFINS": 11.51, "PIS": 2.49, "CPP": 37.50, "IPI": 7.50, "ICMS": 32.00 },
        4: { "IRPJ": 5.50, "CSLL": 3.50, "COFINS": 11.51, "PIS": 2.49, "CPP": 37.50, "IPI": 7.50, "ICMS": 32.00 },
        5: { "IRPJ": 8.50, "CSLL": 7.50, "COFINS": 20.96, "PIS": 4.54, "CPP": 23.50, "IPI": 35.00, "ICMS": 0.00 }
    },
    "III": { // Serviços (Sem CPP separado)
        0: { "IRPJ": 4.00, "CSLL": 3.50, "COFINS": 12.82, "PIS": 2.78, "CPP": 43.40, "ISS": 33.50 },
        1: { "IRPJ": 4.00, "CSLL": 3.50, "COFINS": 14.05, "PIS": 3.05, "CPP": 43.40, "ISS": 32.00 },
        2: { "IRPJ": 4.00, "CSLL": 3.50, "COFINS": 13.64, "PIS": 2.96, "CPP": 43.40, "ISS": 32.50 },
        3: { "IRPJ": 4.00, "CSLL": 3.50, "COFINS": 13.64, "PIS": 2.96, "CPP": 43.40, "ISS": 32.50 },
        4: { "IRPJ": 4.00, "CSLL": 3.50, "COFINS": 12.82, "PIS": 2.78, "CPP": 43.40, "ISS": 33.50 },
        5: { "IRPJ": 35.00, "CSLL": 15.00, "COFINS": 16.03, "PIS": 3.47, "CPP": 30.50, "ISS": 0.00 } // ISS fixo em valor
    },
    "IV": { // Serviços (CPP Separado)
        0: { "IRPJ": 18.80, "CSLL": 15.20, "COFINS": 17.67, "PIS": 3.83, "ISS": 44.50, "CPP": 0.00 },
        1: { "IRPJ": 19.80, "CSLL": 15.20, "COFINS": 20.55, "PIS": 4.45, "ISS": 40.00, "CPP": 0.00 },
        2: { "IRPJ": 20.80, "CSLL": 15.20, "COFINS": 19.73, "PIS": 4.27, "ISS": 40.00, "CPP": 0.00 },
        3: { "IRPJ": 17.80, "CSLL": 19.20, "COFINS": 18.90, "PIS": 4.10, "ISS": 40.00, "CPP": 0.00 },
        4: { "IRPJ": 18.80, "CSLL": 19.20, "COFINS": 18.08, "PIS": 3.92, "ISS": 40.00, "CPP": 0.00 },
        5: { "IRPJ": 53.50, "CSLL": 21.50, "COFINS": 20.55, "PIS": 4.45, "ISS": 0.00, "CPP": 0.00 }
    },
    "V": { // Serviços
        0: { "IRPJ": 4.00, "CSLL": 3.50, "COFINS": 12.82, "PIS": 2.78, "CPP": 28.85, "ISS": 48.05 },
        1: { "IRPJ": 4.00, "CSLL": 3.50, "COFINS": 14.05, "PIS": 3.05, "CPP": 27.85, "ISS": 47.55 },
        2: { "IRPJ": 4.00, "CSLL": 3.50, "COFINS": 13.64, "PIS": 2.96, "CPP": 23.85, "ISS": 52.05 },
        3: { "IRPJ": 4.00, "CSLL": 3.50, "COFINS": 13.64, "PIS": 2.96, "CPP": 23.85, "ISS": 52.05 },
        4: { "IRPJ": 4.00, "CSLL": 3.50, "COFINS": 12.82, "PIS": 2.78, "CPP": 23.85, "ISS": 53.05 },
        5: { "IRPJ": 6.25, "CSLL": 7.50, "COFINS": 24.20, "PIS": 5.25, "CPP": 42.10, "ISS": 14.70 } // Ajuste na 6 faixa
    }
};

const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

// Helper to remove undefined values which Firestore dislikes
const sanitizePayload = (obj: any) => {
    return JSON.parse(JSON.stringify(obj));
};

// --- LOCAL STORAGE FUNCTIONS (Used as Fallback) ---
const getLocalEmpresas = (): SimplesNacionalEmpresa[] => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY_EMPRESAS);
        return stored ? JSON.parse(stored) : [];
    } catch { return []; }
};

const saveLocalEmpresas = (empresas: SimplesNacionalEmpresa[]) => {
    localStorage.setItem(STORAGE_KEY_EMPRESAS, JSON.stringify(empresas));
};

// --- HYBRID DATA ACCESS ---

export const getEmpresas = async (user?: User | null): Promise<SimplesNacionalEmpresa[]> => {
    if (!user) return [];
    let firebaseEmpresas: SimplesNacionalEmpresa[] = [];
    
    const isMasterAdmin = user.role === 'admin' || user.email.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase();

    // 1. Tenta buscar do Firebase
    if (isFirebaseConfigured && db && auth?.currentUser) {
        try {
            let q;
            const uid = auth.currentUser.uid;
            
            // Se for Master Admin, busca TUDO. Se não, busca apenas as criadas pelo usuário.
            if (isMasterAdmin) {
                q = collection(db, 'simples_empresas');
            } else {
                q = query(collection(db, 'simples_empresas'), where('createdBy', '==', uid));
            }
            
            const snapshot = await getDocs(q);
            firebaseEmpresas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SimplesNacionalEmpresa));
        } catch (e: any) {
            // Silently fail to local storage on permission/network errors
            if (e.code !== 'permission-denied' && e.code !== 'failed-precondition') {
                console.warn("Firestore Warning:", e.message);
            }
        }
    }

    // 2. Busca do Local Storage (Fallback ou modo Offline)
    const localEmpresas = getLocalEmpresas();
    let filteredLocal = localEmpresas;
    
    if (!isMasterAdmin) {
        // Filtro local inteligente: mostra empresas do usuário OU empresas antigas sem dono (legacy)
        filteredLocal = localEmpresas.filter(e => e.createdBy === user.id || !e.createdBy);
    }

    // 3. Mescla Inteligente (Unifica listas por ID)
    const empresaMap = new Map<string, SimplesNacionalEmpresa>();

    firebaseEmpresas.forEach(e => empresaMap.set(e.id, e));

    filteredLocal.forEach(e => {
        if (!empresaMap.has(e.id)) {
            empresaMap.set(e.id, e);
        }
    });

    return Array.from(empresaMap.values());
};

export const saveEmpresa = async (nome: string, cnpj: string, cnae: string, anexo: string, atividadesSecundarias: any[], userId: string): Promise<SimplesNacionalEmpresa> => {
    const finalAnexo = anexo === 'auto' ? sugerirAnexoPorCnae(cnae) : anexo;
    const newEmpresa: any = {
        id: generateUUID(),
        nome, cnpj, cnae, anexo: finalAnexo, atividadesSecundarias: atividadesSecundarias || [],
        folha12: 0, faturamentoManual: {}, faturamentoMensalDetalhado: {}, historicoCalculos: [], createdBy: userId
    };

    // 1. Salva no Local Storage (Sempre, para garantir backup)
    const localEmpresas = getLocalEmpresas();
    localEmpresas.push(newEmpresa);
    saveLocalEmpresas(localEmpresas);

    // 2. Tenta salvar no Firebase (Blindado com setDoc e UID direto)
    if (isFirebaseConfigured && db && auth?.currentUser) {
        try {
            newEmpresa.createdBy = auth.currentUser.uid; 
            const payload = sanitizePayload(newEmpresa);
            await setDoc(doc(db, 'simples_empresas', newEmpresa.id), payload);
        } catch (e: any) {
            if (e.code !== 'permission-denied') {
                console.warn("Firestore Save Warning:", e.message);
            }
        }
    }

    return newEmpresa;
};

export const updateEmpresa = async (id: string, data: Partial<SimplesNacionalEmpresa>): Promise<SimplesNacionalEmpresa | null> => {
    const localEmpresas = getLocalEmpresas();
    const index = localEmpresas.findIndex(e => e.id === id);
    if (index !== -1) {
        localEmpresas[index] = { ...localEmpresas[index], ...data };
        saveLocalEmpresas(localEmpresas);
    }

    if (isFirebaseConfigured && db && auth?.currentUser) {
        try {
            const docRef = doc(db, 'simples_empresas', id);
            const { id: _, createdBy: __, ...safeData } = data as any;
            
            if (Object.keys(safeData).length > 0) {
                const payload = sanitizePayload(safeData);
                await updateDoc(docRef, payload);
            }
        } catch (e: any) { 
             if (e.code !== 'permission-denied') {
                console.warn("Firestore Update Warning:", e.message);
            }
        }
    }

    return index !== -1 ? localEmpresas[index] : null;
};

export const getAllNotas = async (): Promise<Record<string, SimplesNacionalNota[]>> => {
    const stored = localStorage.getItem(STORAGE_KEY_NOTAS);
    return stored ? JSON.parse(stored) : {};
};

// --- PARSER HELPERS ---

const parseXmlNfe = (xmlContent: string): any[] => {
    try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlContent, "text/xml");
        const notes: any[] = [];
        
        if (xmlDoc.getElementsByTagName("parsererror").length > 0) return [];

        const nfeNodes = xmlDoc.getElementsByTagName("infNFe");
        
        for (let i = 0; i < nfeNodes.length; i++) {
            const node = nfeNodes[i];
            const dhEmi = node.getElementsByTagName("dhEmi")[0]?.textContent || node.getElementsByTagName("dEmi")[0]?.textContent;
            const vNF = node.getElementsByTagName("vNF")[0]?.textContent; // Total Value
            const xNome = node.getElementsByTagName("emit")[0]?.getElementsByTagName("xNome")[0]?.textContent;
            
            if (dhEmi && vNF) {
                notes.push({
                    data: dhEmi.split('T')[0],
                    valor: parseFloat(vNF),
                    descricao: "NFe Importada (XML)",
                    origem: xNome || "XML"
                });
            }
        }
        return notes;
    } catch (e) {
        console.warn("Falha no parser local de XML, tentando via IA:", e);
        return [];
    }
};

export const parseAndSaveNotas = async (empresaId: string, file: File): Promise<SimplesNacionalImportResult> => {
    const buffer = await file.arrayBuffer();
    const fileType = file.name.toLowerCase();
    let extractedData: any[] = [];

    try {
        if (fileType.endsWith('.pdf')) {
            const base64 = btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
            const pgdasHistory = await extractPgdasDataFromPdf(base64);
            
            if (pgdasHistory && pgdasHistory.length > 0) {
                const empresas = await getEmpresas({ id: 'temp', role: 'admin', name: '', email: '' } as any);
                const emp = empresas.find(e => e.id === empresaId);
                if (emp) {
                    const currentHistory = emp.faturamentoManual || {};
                    let updatesCount = 0;
                    
                    pgdasHistory.forEach((item: any) => {
                        if (item.periodo && (typeof item.valor === 'number')) {
                            let key = item.periodo; // Esperado MM/YYYY ou YYYY-MM
                            if (key.includes('/')) {
                                const parts = key.split('/');
                                if (parts.length === 2) key = `${parts[1]}-${parts[0]}`;
                            }
                            
                            currentHistory[key] = item.valor;
                            updatesCount++;
                        }
                    });
                    
                    if (updatesCount > 0) {
                        await updateEmpresa(empresaId, { faturamentoManual: currentHistory });
                        return { 
                            successCount: updatesCount, 
                            failCount: 0, 
                            errors: [`Extrato PGDAS processado! ${updatesCount} meses de histórico atualizados.`] 
                        };
                    }
                }
            }
            extractedData = await extractDocumentData(base64, 'application/pdf');

        } else if (fileType.endsWith('.xml')) {
            const textDecoder = new TextDecoder('utf-8');
            const xmlContent = textDecoder.decode(buffer);
            extractedData = parseXmlNfe(xmlContent);

            if (extractedData.length === 0) {
                const base64 = btoa(unescape(encodeURIComponent(xmlContent))); 
                extractedData = await extractDocumentData(base64, 'text/xml');
            }

        } else if (fileType.endsWith('.xlsx') || fileType.endsWith('.xls')) {
            const base64 = btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
            const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
            extractedData = await extractDocumentData(base64, mimeType);
        } else {
            throw new Error("Formato de arquivo não suportado.");
        }
    } catch (e: any) {
        throw new Error("Erro no processamento do arquivo: " + e.message);
    }

    if (!extractedData || extractedData.length === 0) return { successCount: 0, failCount: 0, errors: ["Nenhum dado válido encontrado pelo sistema inteligente."] };

    const stored = localStorage.getItem(STORAGE_KEY_NOTAS);
    const notasMap = stored ? JSON.parse(stored) : {};
    if (!notasMap[empresaId]) notasMap[empresaId] = [];
    
    let success = 0;
    extractedData.forEach(item => {
        if(item.data && (item.valor !== undefined && item.valor !== null)) {
            let dateVal = new Date(item.data).getTime();
            if (isNaN(dateVal) && item.data.includes('/')) {
                const parts = item.data.split('/');
                if (parts.length === 3) dateVal = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
            }

            if (!isNaN(dateVal)) {
                notasMap[empresaId].push({
                    id: generateUUID(),
                    empresaId,
                    data: dateVal,
                    valor: typeof item.valor === 'string' ? parseFloat(item.valor.replace('R$', '').replace('.', '').replace(',', '.')) : item.valor,
                    descricao: item.descricao || "Importado via IA",
                    origem: item.origem || (fileType.toUpperCase().replace('.', '') + " Import")
                });
                success++;
            }
        }
    });
    
    localStorage.setItem(STORAGE_KEY_NOTAS, JSON.stringify(notasMap));
    return { successCount: success, failCount: extractedData.length - success, errors: [] };
};

export const updateFolha12 = async (empresaId: string, value: number) => updateEmpresa(empresaId, { folha12: value });

// Atualizado para suportar o detalhamento por CNAE (opcional)
export const saveFaturamentoManual = async (empresaId: string, faturamento: any, faturamentoDetalhado?: any) => {
    const data: Partial<SimplesNacionalEmpresa> = { faturamentoManual: faturamento };
    if (faturamentoDetalhado) {
        data.faturamentoMensalDetalhado = faturamentoDetalhado;
    }
    return updateEmpresa(empresaId, data);
};

export const saveHistoricoCalculo = async (empresaId: string, resumo: SimplesNacionalResumo, mesRefDate: Date) => {
    const mesStr = mesRefDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
    const novoCalculo: SimplesHistoricoCalculo = {
        id: generateUUID(), dataCalculo: Date.now(), mesReferencia: mesStr,
        rbt12: resumo.rbt12, aliq_eff: resumo.aliq_eff, fator_r: resumo.fator_r,
        das_mensal: resumo.das_mensal, anexo_efetivo: resumo.anexo_efetivo
    };
    
    const currentEmpresas = await getEmpresas({ id: 'temp', role: 'admin', name: '', email: '' } as any); 
    const emp = currentEmpresas.find(e => e.id === empresaId);
    const currentHistory = emp?.historicoCalculos || [];
    
    return updateEmpresa(empresaId, { historicoCalculos: [...currentHistory, novoCalculo] });
};

export const sugerirAnexoPorCnae = (cnae: string): any => {
    const code = cnae.replace(/[^0-9]/g, '');
    if (code.startsWith('47')) return 'I';
    if (code.startsWith('10')) return 'II';
    if (code.startsWith('62')) return 'V';
    return 'III';
};

export const calcularResumoEmpresa = (empresa: SimplesNacionalEmpresa, notas: SimplesNacionalNota[], mesReferencia: Date, options?: any): SimplesNacionalResumo => {
    const mesChave = `${mesReferencia.getFullYear()}-${(mesReferencia.getMonth() + 1).toString().padStart(2, '0')}`;
    let rbt12 = 0;
    const mensal: any = empresa.faturamentoManual || {};
    
    const dataInicioRBT12 = new Date(mesReferencia.getFullYear(), mesReferencia.getMonth() - 12, 1);
    for (let i = 0; i < 12; i++) {
        const d = new Date(dataInicioRBT12.getFullYear(), dataInicioRBT12.getMonth() + i, 1);
        const k = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        rbt12 += (mensal[k] || 0);
    }

    // Calcula Fator R padrão, mas aceita override manual se fornecido nas opções
    let fator_r = rbt12 > 0 ? (empresa.folha12 / rbt12) : 0;
    if (options && options.fatorRManual !== undefined && options.fatorRManual !== null && !isNaN(options.fatorRManual)) {
        fator_r = options.fatorRManual;
    }

    // Se itens de cálculo (entradas manuais do dashboard) não forem fornecidos, cria um padrão com o total do mês
    let itensCalculo: SimplesItemCalculo[] = options?.itensCalculo || [];
    
    if (itensCalculo.length === 0) {
        const faturamentoTotalMes = mensal[mesChave] || 0;
        if (faturamentoTotalMes > 0) {
            itensCalculo.push({
                cnae: empresa.cnae,
                anexo: empresa.anexo,
                valor: faturamentoTotalMes,
                issRetido: false,
                icmsSt: false
            });
        }
    }

    let dasTotal = 0;
    let faturamentoTotalMes = 0;
    const detalhamentoAnexos: DetalhamentoAnexo[] = [];

    // Cálculo por Item (CNAE/Anexo)
    itensCalculo.forEach(item => {
        faturamentoTotalMes += item.valor;
        
        let anexoAplicado = item.anexo;
        if (anexoAplicado === 'III_V') {
            anexoAplicado = fator_r >= 0.28 ? 'III' : 'V';
        }

        const tabela = ANEXOS_TABELAS[anexoAplicado];
        if (!tabela) return;

        // 1. Determina a Faixa
        let faixaIndex = tabela.findIndex((f: any) => rbt12 <= f.limite);
        if (faixaIndex === -1) faixaIndex = tabela.length - 1; // Faixa 6
        const faixa = tabela[faixaIndex];

        // 2. Calcula Alíquota Efetiva Base
        let aliq_eff = 0;
        if (rbt12 > 0) {
            aliq_eff = (((rbt12 * faixa.aliquota / 100) - faixa.parcela) / rbt12) * 100;
        } else {
            // Se RBT12 é 0, usa a alíquota nominal da 1ª faixa
            aliq_eff = tabela[0].aliquota;
        }

        // 3. Aplica Retenções (ISS e ICMS ST)
        // A lógica é: Nova Alíquota = Alíquota Efetiva * (1 - (Percentual do Tributo / 100))
        let percentualReducao = 0;
        const reparticao = REPARTICAO_IMPOSTOS[anexoAplicado]?.[Math.min(faixaIndex, 5)];
        
        if (reparticao) {
            if (item.issRetido && reparticao['ISS']) {
                percentualReducao += reparticao['ISS'];
            }
            if (item.icmsSt && reparticao['ICMS']) {
                percentualReducao += reparticao['ICMS'];
            }
        }

        const aliq_final = Math.max(0, aliq_eff * (1 - (percentualReducao / 100)));
        const valorDasItem = (item.valor * aliq_final) / 100;
        dasTotal += valorDasItem;

        detalhamentoAnexos.push({
            anexo: anexoAplicado as any,
            faturamento: item.valor,
            aliquotaNominal: faixa.aliquota,
            aliquotaEfetiva: aliq_final,
            valorDas: valorDasItem,
            issRetido: item.issRetido,
            icmsSt: item.icmsSt
        });
    });

    const aliq_eff_global = faturamentoTotalMes > 0 ? (dasTotal / faturamentoTotalMes) * 100 : 0;

    // Determine main range for generic display logic
    const tabelaPrincipal = ANEXOS_TABELAS[empresa.anexo === 'III_V' ? (fator_r >= 0.28 ? 'III' : 'V') : empresa.anexo];
    let faixaIndexPrincipal = 0;
    if(tabelaPrincipal) {
        faixaIndexPrincipal = tabelaPrincipal.findIndex((f: any) => rbt12 <= f.limite);
        if (faixaIndexPrincipal === -1) faixaIndexPrincipal = 5;
    }

    return {
        rbt12, 
        aliq_nom: tabelaPrincipal ? tabelaPrincipal[faixaIndexPrincipal].aliquota : 0, 
        aliq_eff: aliq_eff_global, 
        das: dasTotal * 12, // Estimativa anualizada simplista
        das_mensal: dasTotal,
        mensal, 
        historico_simulado: [], 
        anexo_efetivo: empresa.anexo, 
        fator_r,
        folha_12: empresa.folha12, 
        ultrapassou_sublimite: rbt12 > 3600000,
        faixa_index: faixaIndexPrincipal, // Use main activity range for general distribution chart if needed
        detalhamento_anexos: detalhamentoAnexos
    };
};

export const calcularDiscriminacaoImpostos = (anexo: string, faixaIndex: number, valorDas: number) => {
    // Busca a distribuição correta baseada no Anexo e Faixa
    const distribuicao = REPARTICAO_IMPOSTOS[anexo]?.[Math.min(faixaIndex, 5)];
    
    if (!distribuicao || valorDas === 0) return {};

    const resultado: Record<string, number> = {};
    for (const [imposto, percentual] of Object.entries(distribuicao)) {
        resultado[imposto] = valorDas * ((percentual as number) / 100);
    }
    
    return resultado;
};
