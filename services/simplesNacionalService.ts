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

export const REPARTICAO_IMPOSTOS: any = {
    "I": { 0: { "IRPJ": 5.5, "CSLL": 3.5, "COFINS": 12.74, "PIS": 2.76, "CPP": 41.5, "ICMS": 34.0 }, 5: { "IRPJ": 13.5, "CSLL": 10.0, "COFINS": 28.27, "PIS": 6.13, "CPP": 42.1, "ICMS": 0.0 } },
    "II": { 0: { "IRPJ": 5.5, "CSLL": 3.5, "COFINS": 11.51, "PIS": 2.49, "CPP": 37.5, "IPI": 7.5, "ICMS": 32.0 } },
    "III": { 0: { "IRPJ": 4.0, "CSLL": 3.5, "COFINS": 12.82, "PIS": 2.78, "CPP": 43.4, "ISS": 33.5 } },
    "IV": { 0: { "IRPJ": 18.8, "CSLL": 15.2, "COFINS": 17.67, "PIS": 3.83, "CPP": 0.0, "ISS": 44.5 } }, // CPP recolhido fora
    "V": { 0: { "IRPJ": 4.0, "CSLL": 3.5, "COFINS": 12.82, "PIS": 2.78, "CPP": 28.85, "ISS": 48.05 } }
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

    // Adiciona as da nuvem primeiro
    firebaseEmpresas.forEach(e => empresaMap.set(e.id, e));

    // Adiciona/Sobrescreve com as locais
    // Isso garante que se uma empresa foi criada/editada offline (local), ela apareça mesmo se não estiver na nuvem
    filteredLocal.forEach(e => {
        // Prioridade para o local se não existir na nuvem ou se quisermos forçar o estado local
        // Neste caso, se a nuvem falhou ao salvar (permissão negada), a versão local é a única que existe ou a mais atual.
        if (!empresaMap.has(e.id)) {
            empresaMap.set(e.id, e);
        } else {
            // Se existe em ambos, normalmente a nuvem ganha.
            // MAS, se tivermos problemas de permissão de escrita, a versão local pode ter alterações não salvas.
            // Para segurança neste cenário específico de "permissão negada", podemos manter o local como fallback.
            // No entanto, para evitar sobrescrever dados da nuvem com dados obsoletos locais em sessões normais, 
            // a estratégia padrão é Nuvem > Local. 
            // Apenas itens NOVOS (que falharam o save inicial) estarão apenas no local.
            // Portanto, o `if (!empresaMap.has(e.id))` acima já resolve o problema de "não salvando novas empresas".
        }
    });

    return Array.from(empresaMap.values());
};

export const saveEmpresa = async (nome: string, cnpj: string, cnae: string, anexo: string, atividadesSecundarias: any[], userId: string): Promise<SimplesNacionalEmpresa> => {
    const finalAnexo = anexo === 'auto' ? sugerirAnexoPorCnae(cnae) : anexo;
    const newEmpresa: any = {
        id: generateUUID(),
        nome, cnpj, cnae, anexo: finalAnexo, atividadesSecundarias: atividadesSecundarias || [],
        folha12: 0, faturamentoManual: {}, historicoCalculos: [], createdBy: userId
    };

    // 1. Salva no Local Storage (Sempre, para garantir backup)
    const localEmpresas = getLocalEmpresas();
    localEmpresas.push(newEmpresa);
    saveLocalEmpresas(localEmpresas);

    // 2. Tenta salvar no Firebase (Blindado com setDoc e UID direto)
    if (isFirebaseConfigured && db && auth?.currentUser) {
        try {
            // Força o UID da sessão ativa para garantir que a regra de segurança permita a gravação
            newEmpresa.createdBy = auth.currentUser.uid; 
            
            // Sanitize to remove undefined values
            const payload = sanitizePayload(newEmpresa);

            // setDoc garante que o ID do documento seja o mesmo do objeto
            await setDoc(doc(db, 'simples_empresas', newEmpresa.id), payload);
        } catch (e: any) {
            // Fallback silencioso se permissão negada
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
            
            // IMPORTANTE: Filtra campos protegidos (id, createdBy) para evitar erro de permissão no update
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
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, "text/xml");
    const notes: any[] = [];
    
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
};

export const parseAndSaveNotas = async (empresaId: string, file: File): Promise<SimplesNacionalImportResult> => {
    const buffer = await file.arrayBuffer();
    const fileType = file.name.toLowerCase();
    let extractedData: any[] = [];

    try {
        if (fileType.endsWith('.pdf')) {
            const base64 = btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
            
            // Try PGDAS Extraction first (official extract)
            const pgdasHistory = await extractPgdasDataFromPdf(base64);
            
            if (pgdasHistory && pgdasHistory.length > 0) {
                const empresas = await getEmpresas({ id: 'temp', role: 'admin', name: '', email: '' } as any);
                const emp = empresas.find(e => e.id === empresaId);
                if (emp) {
                    const currentHistory = emp.faturamentoManual || {};
                    pgdasHistory.forEach((item: any) => {
                        if (item.periodo && item.valor) {
                            let key = item.periodo;
                            if (key.includes('/')) {
                                const parts = key.split('/');
                                if (parts.length === 2) key = `${parts[1]}-${parts[0]}`;
                            }
                            currentHistory[key] = item.valor;
                        }
                    });
                    await updateEmpresa(empresaId, { faturamentoManual: currentHistory });
                    return { successCount: pgdasHistory.length, failCount: 0, errors: ["Histórico PGDAS atualizado com sucesso!"] };
                }
            }
            
            // If not PGDAS, try generic invoice
            extractedData = await extractDocumentData(base64, 'application/pdf');
        } else if (fileType.endsWith('.xml')) {
            const textDecoder = new TextDecoder('utf-8');
            const xmlContent = textDecoder.decode(buffer);
            extractedData = parseXmlNfe(xmlContent);
        } else {
            const base64 = btoa(new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
            const mimeType = fileType.endsWith('.xlsx') || fileType.endsWith('.xls') 
                ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
                : 'application/pdf';
            extractedData = await extractDocumentData(base64, mimeType);
        }
    } catch (e: any) {
        throw new Error("Erro na importação: " + e.message);
    }

    if (!extractedData || extractedData.length === 0) return { successCount: 0, failCount: 0, errors: ["Nenhum dado válido encontrado."] };

    const stored = localStorage.getItem(STORAGE_KEY_NOTAS);
    const notasMap = stored ? JSON.parse(stored) : {};
    if (!notasMap[empresaId]) notasMap[empresaId] = [];
    
    let success = 0;
    extractedData.forEach(item => {
        if(item.data && item.valor) {
            notasMap[empresaId].push({
                id: generateUUID(),
                empresaId,
                data: new Date(item.data).getTime(),
                valor: typeof item.valor === 'string' ? parseFloat(item.valor) : item.valor,
                descricao: item.descricao || "Importado",
                origem: item.origem || (fileType.endsWith('.xml') ? "XML" : "Importação AI")
            });
            success++;
        }
    });
    localStorage.setItem(STORAGE_KEY_NOTAS, JSON.stringify(notasMap));
    return { successCount: success, failCount: extractedData.length - success, errors: [] };
};

export const updateFolha12 = async (empresaId: string, value: number) => updateEmpresa(empresaId, { folha12: value });
export const saveFaturamentoManual = async (empresaId: string, faturamento: any) => updateEmpresa(empresaId, { faturamentoManual: faturamento });

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

    const fator_r = rbt12 > 0 ? (empresa.folha12 / rbt12) : 0;

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

    itensCalculo.forEach(item => {
        faturamentoTotalMes += item.valor;
        
        let anexoAplicado = item.anexo;
        if (anexoAplicado === 'III_V') {
            anexoAplicado = fator_r >= 0.28 ? 'III' : 'V';
        }

        const tabela = ANEXOS_TABELAS[anexoAplicado];
        if (!tabela) return;

        let faixaIndex = tabela.findIndex((f: any) => rbt12 <= f.limite);
        if (faixaIndex === -1) faixaIndex = tabela.length - 1; 
        const faixa = tabela[faixaIndex];

        let aliq_eff = 0;
        if (rbt12 > 0) {
            aliq_eff = (((rbt12 * faixa.aliquota / 100) - faixa.parcela) / rbt12) * 100;
        } else {
            aliq_eff = tabela[0].aliquota;
        }

        let percentualReducao = 0;
        const reparticao = REPARTICAO_IMPOSTOS[anexoAplicado]?.[Math.min(faixaIndex, 5)];
        
        if (reparticao) {
            if (item.issRetido && reparticao['ISS']) percentualReducao += reparticao['ISS'];
            if (item.icmsSt && reparticao['ICMS']) percentualReducao += reparticao['ICMS'];
        }

        const aliq_final = Math.max(0, aliq_eff * (1 - (percentualReducao / 100)));
        const valorDasItem = (item.valor * aliq_final) / 100;
        dasTotal += valorDasItem;

        detalhamentoAnexos.push({
            anexo: anexoAplicado as any,
            faturamento: item.valor,
            aliquotaEfetiva: aliq_final,
            valorDas: valorDasItem,
            issRetido: item.issRetido,
            icmsSt: item.icmsSt
        });
    });

    const aliq_eff_global = faturamentoTotalMes > 0 ? (dasTotal / faturamentoTotalMes) * 100 : 0;

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
        das: dasTotal * 12, 
        das_mensal: dasTotal,
        mensal, 
        historico_simulado: [], 
        anexo_efetivo: empresa.anexo, 
        fator_r,
        folha_12: empresa.folha12, 
        ultrapassou_sublimite: rbt12 > 3600000,
        faixa_index: faixaIndexPrincipal, 
        detalhamento_anexos: detalhamentoAnexos
    };
};

export const calcularDiscriminacaoImpostos = (anexo: string, faixaIndex: number, valorDas: number) => {
    return { "IRPJ": valorDas * 0.05, "CSLL": valorDas * 0.03, "CPP": valorDas * 0.4, "COFINS": valorDas * 0.12, "PIS": valorDas * 0.03, "ISS/ICMS": valorDas * 0.37 };
};