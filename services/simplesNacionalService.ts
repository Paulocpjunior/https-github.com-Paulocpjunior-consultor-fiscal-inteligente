
import { SimplesNacionalAnexo, SimplesNacionalEmpresa, SimplesNacionalNota, SimplesNacionalResumo, SimplesHistoricoCalculo } from '../types';

// ----------------- TABELAS SIMPLES – ANEXOS I–V (2025) -----------------
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

// Sub-limite para recolhimento de ICMS/ISS dentro do Simples (R$ 3.600.000,00)
const SUBLIMITE_ESTADUAL_MUNICIPAL = 3600000;

// ----------------- CÁLCULOS -----------------

export const calcularAliquotaSimples = (receita12: number, anexo: keyof typeof ANEXOS_TABELAS): { nom: number; eff: number } => {
    if (receita12 <= 0) {
        return { nom: 0.0, eff: 0.0 };
    }

    const tabela = ANEXOS_TABELAS[anexo];
    let faixaEscolhida = tabela[tabela.length - 1];
    for (const f of tabela) {
        if (receita12 <= f.limite) {
            faixaEscolhida = f;
            break;
        }
    }

    const aliquota_nom = faixaEscolhida.aliquota;
    const parcela = faixaEscolhida.parcela;
    const aliq_eff = ((receita12 * (aliquota_nom / 100.0)) - parcela) / receita12 * 100.0;
    
    return { nom: aliquota_nom, eff: Math.max(0, aliq_eff) };
};

const resolverAnexoEfetivo = (empresa: SimplesNacionalEmpresa, rbt12: number) => {
    const anexoBase = empresa.anexo;
    const folha12 = empresa.folha12;
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
    options: { fullHistory?: boolean } = { fullHistory: true }
): SimplesNacionalResumo => {
    // 1. Agrupar faturamento das notas por mês
    const faturamentoNotasPorMes: { [key: string]: number } = {};
    for (const nota of notasDaEmpresa) {
        const data = new Date(nota.data);
        const chave = `${data.getFullYear()}-${(data.getMonth() + 1).toString().padStart(2, '0')}`;
        faturamentoNotasPorMes[chave] = (faturamentoNotasPorMes[chave] || 0) + nota.valor;
    }

    // Consolidar com faturamento manual (Manual overrides Notas)
    const faturamentoConsolidado: { [key: string]: number } = { ...faturamentoNotasPorMes };
    if (empresa.faturamentoManual) {
        Object.entries(empresa.faturamentoManual).forEach(([key, value]) => {
            faturamentoConsolidado[key] = value as number;
        });
    }

    // 2. Calcular RBT12 (Faturamento dos 12 meses ANTERIORES ao mês de apuração)
    let rbt12 = 0;
    const dataInicioPeriodoRBT12 = new Date(mesApuracao.getFullYear(), mesApuracao.getMonth() - 12, 1);
    
    for (let i = 0; i < 12; i++) {
        const mesCorrente = new Date(dataInicioPeriodoRBT12.getFullYear(), dataInicioPeriodoRBT12.getMonth() + i, 1);
        const mesChave = `${mesCorrente.getFullYear()}-${(mesCorrente.getMonth() + 1).toString().padStart(2, '0')}`;
        const valorMes = faturamentoConsolidado[mesChave] || 0;
        rbt12 += valorMes;
    }

    // 3. Resolver anexo e calcular alíquotas com base no RBT12
    const { anexoEfetivo, fatorR } = resolverAnexoEfetivo(empresa, rbt12);
    const { nom, eff } = calcularAliquotaSimples(rbt12, anexoEfetivo);
    
    // DAS Estimado Anual
    const dasEstimado = rbt12 * (eff / 100.0);

    // 4. Calcular DAS Mensal (Valor exato para o mês de apuração)
    const mesApuracaoChave = `${mesApuracao.getFullYear()}-${(mesApuracao.getMonth() + 1).toString().padStart(2, '0')}`;
    const faturamentoMesApuracao = faturamentoConsolidado[mesApuracaoChave] || 0;
    const dasMensal = faturamentoMesApuracao * (eff / 100.0);

    // 5. Preparar faturamento mensal histórico para o gráfico
    const mensalFonte = options.fullHistory ? faturamentoConsolidado : {}; 
    
    if (!options.fullHistory) {
         // Adicionar os 12 meses do RBT12
         for (let i = 0; i < 12; i++) {
            const mesCorrente = new Date(dataInicioPeriodoRBT12.getFullYear(), dataInicioPeriodoRBT12.getMonth() + i, 1);
            const mesChave = `${mesCorrente.getFullYear()}-${(mesCorrente.getMonth() + 1).toString().padStart(2, '0')}`;
            mensalFonte[mesChave] = faturamentoConsolidado[mesChave] || 0;
        }
        // Adicionar o mês de apuração atual
        mensalFonte[mesApuracaoChave] = faturamentoMesApuracao;
    }

    const sortedMensal = Object.fromEntries(Object.entries(mensalFonte).sort());

    // 6. Verificar Sub-limite
    const ultrapassou_sublimite = rbt12 > SUBLIMITE_ESTADUAL_MUNICIPAL;

    return {
        rbt12,
        aliq_nom: nom,
        aliq_eff: eff,
        das: dasEstimado,
        das_mensal: dasMensal,
        mensal: sortedMensal,
        anexo_efetivo: anexoEfetivo,
        fator_r: fatorR,
        folha_12: empresa.folha12,
        ultrapassou_sublimite,
    };
};


// ----------------- PARSERS DE ARQUIVO -----------------

const parseDataBrOuIso = (s: string | null | undefined): Date | null => {
    if (!s) return null;
    s = s.trim();
    
    // Tenta DD/MM/YYYY
    const brMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (brMatch) {
        return new Date(parseInt(brMatch[3]), parseInt(brMatch[2]) - 1, parseInt(brMatch[1]));
    }
    
    // Tenta formatos ISO-like
    try {
        const dt = new Date(s);
        if (!isNaN(dt.getTime())) {
            return dt;
        }
    } catch (e) { /* ignora */ }
    
    return null;
};

const parseCsvToNotas = async (file: File): Promise<Omit<SimplesNacionalNota, 'id' | 'empresaId'>[]> => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) return [];

    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const dataIndex = header.indexOf('data');
    const valorIndex = header.indexOf('valor');
    const descIndex = header.indexOf('descricao');

    if (dataIndex === -1 || valorIndex === -1) {
        throw new Error("Arquivo CSV deve conter as colunas 'data' e 'valor'.");
    }

    const notas: Omit<SimplesNacionalNota, 'id' | 'empresaId'>[] = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        const dataStr = values[dataIndex];
        const valorStr = values[valorIndex]?.replace(',', '.');
        const descStr = descIndex > -1 ? values[descIndex] : '';

        const data = parseDataBrOuIso(dataStr);
        const valor = parseFloat(valorStr);

        if (data && !isNaN(valor)) {
            notas.push({
                data: data.getTime(),
                valor,
                origem: 'CSV',
                descricao: descStr,
            });
        }
    }
    return notas;
};

const parseXmlToNotas = async (file: File): Promise<Omit<SimplesNacionalNota, 'id' | 'empresaId'>[]> => {
    const text = await file.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, "application/xml");
    
    // Helper para buscar valor de tag independente de namespace
    const getFirstTagValue = (...tags: string[]) => {
        for (const tag of tags) {
            const elements = xmlDoc.getElementsByTagName(tag);
            if (elements.length > 0 && elements[0].textContent) {
                return elements[0].textContent;
            }
            // Tenta buscar com namespace genérico se falhar
            const elementsNS = xmlDoc.getElementsByTagNameNS("*", tag);
             if (elementsNS.length > 0 && elementsNS[0].textContent) {
                return elementsNS[0].textContent;
            }
        }
        return null;
    }

    const dataEmissaoStr = getFirstTagValue('dhEmi', 'dEmi');
    const dataPadrao = parseDataBrOuIso(dataEmissaoStr) || new Date();

    const notas: Omit<SimplesNacionalNota, 'id' | 'empresaId'>[] = [];
    // Tenta buscar 'det' com ou sem namespace
    let dets = xmlDoc.getElementsByTagName('det');
    if (dets.length === 0) {
        dets = xmlDoc.getElementsByTagNameNS("*", "det");
    }
    
    if (dets.length === 0) throw new Error("Nenhum item <det> encontrado no XML. Verifique se é uma NF-e válida.");

    for (const det of Array.from(dets)) {
        const vProdEl = det.getElementsByTagName('vProd')[0] || det.getElementsByTagNameNS("*", "vProd")[0];
        const xProdEl = det.getElementsByTagName('xProd')[0] || det.getElementsByTagNameNS("*", "xProd")[0];
        
        const valor = vProdEl ? parseFloat(vProdEl.textContent || '0') : 0;
        const descricao = xProdEl ? xProdEl.textContent : '';

        if (!isNaN(valor) && valor > 0) {
            notas.push({
                data: dataPadrao.getTime(),
                valor,
                origem: 'XML NFe',
                descricao,
            });
        }
    }
    return notas;
};

export const parseAndSaveNotas = async (empresaId: string, file: File): Promise<SimplesNacionalNota[]> => {
    let novasNotasData: Omit<SimplesNacionalNota, 'id' | 'empresaId'>[] = [];
    
    if (file.name.toLowerCase().endsWith('.csv')) {
        novasNotasData = await parseCsvToNotas(file);
    } else if (file.name.toLowerCase().endsWith('.xml')) {
        novasNotasData = await parseXmlToNotas(file);
    } else {
        throw new Error("Formato de arquivo não suportado. Use .csv ou .xml");
    }

    if (novasNotasData.length > 0) {
        const todasAsNotas = getAllNotas();
        const notasEmpresa = todasAsNotas[empresaId] || [];
        
        const notasParaAdicionar: SimplesNacionalNota[] = novasNotasData.map(n => ({
            ...n,
            id: crypto.randomUUID(),
            empresaId,
        }));

        const notasAtualizadas = [...notasEmpresa, ...notasParaAdicionar];
        todasAsNotas[empresaId] = notasAtualizadas;
        localStorage.setItem('simples-nacional-notas', JSON.stringify(todasAsNotas));
        return notasParaAdicionar;
    }
    return [];
};


// ----------------- LOCALSTORAGE PERSISTENCE -----------------

export const getEmpresas = (): SimplesNacionalEmpresa[] => {
    try {
        const stored = localStorage.getItem('simples-nacional-empresas');
        if (stored) {
            return JSON.parse(stored) as SimplesNacionalEmpresa[];
        }
    } catch (e) {
        console.error("Erro ao ler empresas do localStorage", e);
    }
    return [];
};

export const sugerirAnexoPorCnae = (cnae: string): SimplesNacionalAnexo => {
    if (!cnae) return 'III';
    const digitos = cnae.replace(/\D/g, '');
    if (digitos.length < 2) return 'III';
    
    const prefix = parseInt(digitos.substring(0, 2), 10);

    if ([45, 46, 47].includes(prefix)) return 'I';
    if (prefix >= 10 && prefix <= 33) return 'II';
    if (prefix >= 68 && prefix <= 75) return 'III_V';
    
    return 'III';
};

export const saveEmpresa = (nome: string, cnpj: string, cnae: string, anexo: SimplesNacionalAnexo | 'auto'): SimplesNacionalEmpresa => {
    
    const anexoDefinido = anexo === 'auto' ? sugerirAnexoPorCnae(cnae) : anexo;

    const newEmpresa: SimplesNacionalEmpresa = {
        id: crypto.randomUUID(),
        nome,
        cnpj,
        cnae,
        anexo: anexoDefinido,
        folha12: 0,
    };
    
    const allEmpresas = getEmpresas();
    allEmpresas.push(newEmpresa);
    localStorage.setItem('simples-nacional-empresas', JSON.stringify(allEmpresas));
    
    return newEmpresa;
};

export const updateEmpresa = (id: string, data: Partial<SimplesNacionalEmpresa>): SimplesNacionalEmpresa | null => {
    const allEmpresas = getEmpresas();
    let updatedEmpresa: SimplesNacionalEmpresa | null = null;

    const updatedEmpresas = allEmpresas.map(e => {
        if (e.id === id) {
            updatedEmpresa = { ...e, ...data };
            return updatedEmpresa;
        }
        return e;
    });

    if (updatedEmpresa) {
        localStorage.setItem('simples-nacional-empresas', JSON.stringify(updatedEmpresas));
    }

    return updatedEmpresa;
};

export const updateFolha12 = (empresaId: string, folha12: number): SimplesNacionalEmpresa | null => {
    return updateEmpresa(empresaId, { folha12 });
};

export const saveFaturamentoManual = (empresaId: string, faturamento: { [key: string]: number }): SimplesNacionalEmpresa | null => {
    return updateEmpresa(empresaId, { faturamentoManual: faturamento });
};

export const saveHistoricoCalculo = (empresaId: string, resumo: SimplesNacionalResumo, mesApuracao: Date): SimplesNacionalEmpresa | null => {
    const empresa = getEmpresas().find(e => e.id === empresaId);
    if (!empresa) return null;

    const novoCalculo: SimplesHistoricoCalculo = {
        id: crypto.randomUUID(),
        dataCalculo: Date.now(),
        mesReferencia: mesApuracao.toLocaleString('pt-BR', { month: 'short', year: 'numeric' }),
        rbt12: resumo.rbt12,
        aliq_eff: resumo.aliq_eff,
        fator_r: resumo.fator_r,
        das_mensal: resumo.das_mensal,
        anexo_efetivo: resumo.anexo_efetivo
    };

    const historicoAtual = empresa.historicoCalculos || [];
    // Opcional: Limitar histórico para não crescer infinitamente ou substituir cálculos do mesmo mês
    return updateEmpresa(empresaId, { historicoCalculos: [novoCalculo, ...historicoAtual] });
};

export const getAllNotas = (): Record<string, SimplesNacionalNota[]> => {
    try {
        const stored = localStorage.getItem('simples-nacional-notas');
        return stored ? JSON.parse(stored) : {};
    } catch (e) {
        console.error("Erro ao ler notas do localStorage", e);
    }
    return {};
};
