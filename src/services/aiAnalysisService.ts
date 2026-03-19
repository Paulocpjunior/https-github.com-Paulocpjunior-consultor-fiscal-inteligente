import { GoogleGenAI } from "@google/genai";
import { ManualPendencia } from '../components/ManualEntry';
import {
  calcularSelicAcumulada,
  calcularMultaObrigacaoAcessoria,
  PARCELAMENTOS_VIGENTES,
  simularParcelamento,
  SelicResult,
} from './selicCalculator';

export interface AnaliseItem {
  pendencia: ManualPendencia;
  selicCalculo?: SelicResult;
  multaObrigacao?: { multa: number; fundamentoLegal: string; descricao: string };
  categoria: 'debito' | 'obrigacao_ausente' | 'certidao_vencida' | 'parcelamento_ativo';
  urgencia: 'Critica' | 'Alta' | 'Media' | 'Baixa';
}

export interface ParcelamentoSugestao {
  nome: string;
  lei: string;
  parcelas: number;
  valorEntrada: number;
  valorComDesconto: number;
  valorParcela: number;
  economiaTotal: number;
  descontoMulta: number;
  descontoJuros: number;
  observacao: string;
  maisVantajoso: boolean;
}

export interface AnaliseCompleta {
  itens: AnaliseItem[];
  totalOriginal: number;
  totalAtualizado: number;
  totalMultas: number;
  totalJuros: number;
  parcelamentosAtuais: ManualPendencia[];
  sugestoesParcelamento: ParcelamentoSugestao[];
  planoAcao: string;
  resumoIA: string;
  score: number;
  nivelRisco: 'Low' | 'Medium' | 'High' | 'Critical';
}

function parseDataBR(dateStr: string): Date | null {
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
  }
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

function classificarUrgencia(item: ManualPendencia): 'Critica' | 'Alta' | 'Media' | 'Baixa' {
  const valor = item.valor || 0;
  const tipo = item.tipo.toUpperCase();

  if (item.vencimento) {
    const venc = parseDataBR(item.vencimento);
    if (venc) {
      const dias = Math.ceil((Date.now() - venc.getTime()) / (1000 * 60 * 60 * 24));
      if (dias > 180) return 'Critica';
      if (dias > 90) return 'Alta';
      if (dias > 30) return 'Media';
    }
  }

  if (valor > 100000) return 'Critica';
  if (valor > 50000) return 'Alta';
  if (tipo.includes('FGTS') || tipo.includes('DIVIDA ATIVA')) return 'Critica';
  if (tipo.includes('DCTF') || tipo.includes('ECF') || tipo.includes('ECD')) return 'Alta';

  return 'Media';
}

function classificarCategoria(item: ManualPendencia): AnaliseItem['categoria'] {
  const tipo = item.tipo.toUpperCase();
  const cat = item.categoria.toUpperCase();

  if (cat === 'PARCELAMENTO' || tipo.includes('PARCELAMENTO')) return 'parcelamento_ativo';
  if (cat === 'CERTIDAO' || cat === 'CERTIDÃO' || tipo.includes('CND') || tipo.includes('CERTIDAO')) return 'certidao_vencida';
  if (cat === 'DECLARACAO' || cat === 'DECLARAÇÃO' || cat === 'OBRIGACAO' || cat === 'OBRIGAÇÃO' ||
    tipo.includes('DCTF') || tipo.includes('EFD') || tipo.includes('SPED') || tipo.includes('DEFIS') ||
    tipo.includes('ECD') || tipo.includes('ECF') || tipo.includes('DIRF') || tipo.includes('PGDAS') ||
    tipo.includes('GFIP') || tipo.includes('RAIS') || tipo.includes('DCTFWEB')) {
    return 'obrigacao_ausente';
  }

  return 'debito';
}


function determinarTiposDebitoRelevantes(pendencias: ManualPendencia[]): Set<string> {
  const tipos = new Set<string>();
  pendencias.forEach(p => {
    const orgao = (p.orgao || '').toUpperCase();
    const tipo  = (p.tipo  || '').toUpperCase();
    if (orgao.includes('RECEITA FEDERAL') || orgao.includes('RFB') || orgao.includes('INSS'))
      tipos.add('Federal');
    if (orgao.includes('PGFN') || tipo.includes('DIVIDA ATIVA'))
      { tipos.add('PGFN'); tipos.add('Divida Ativa'); }
    if (tipo.includes('SIMPLES') || tipo.includes('DAS') || tipo.includes('RELP'))
      tipos.add('Simples Nacional');
    if (orgao.includes('FGTS') || orgao.includes('CEF') || tipo.includes('FGTS'))
      tipos.add('FGTS');
    if (orgao.includes('PREFEITURA') || tipo.includes('ISS') || tipo.includes('PPI'))
      { tipos.add('Municipal'); tipos.add('ISS'); }
  });
  if (tipos.size === 0)
    ['Federal','PGFN','Simples Nacional','FGTS','Municipal','ISS'].forEach(t => tipos.add(t));
  return tipos;
}

export function analisarPendencias(pendencias: ManualPendencia[]): Omit<AnaliseCompleta, 'planoAcao' | 'resumoIA'> {
  const itens: AnaliseItem[] = [];
  let totalOriginal = 0;
  let totalAtualizado = 0;
  let totalMultas = 0;
  let totalJuros = 0;
  const parcelamentosAtuais: ManualPendencia[] = [];

  pendencias.forEach(p => {
    const categoria = classificarCategoria(p);
    const urgencia = classificarUrgencia(p);
    let selicCalculo: SelicResult | undefined;
    let multaObrigacao: AnaliseItem['multaObrigacao'] | undefined;

    if (categoria === 'parcelamento_ativo') {
      parcelamentosAtuais.push(p);
    }

    if (p.valor && p.valor > 0 && categoria === 'debito') {
      const venc = p.vencimento ? parseDataBR(p.vencimento) : null;
      if (venc) {
        selicCalculo = calcularSelicAcumulada(p.valor, venc);
        totalOriginal += p.valor;
        totalAtualizado += selicCalculo.valorAtualizado;
        totalJuros += selicCalculo.jurosAcumulados;
        totalMultas += selicCalculo.multaMora;
      } else {
        totalOriginal += p.valor;
        totalAtualizado += p.valor;
      }
    }

    if (categoria === 'obrigacao_ausente') {
      const venc = p.vencimento ? parseDataBR(p.vencimento) : null;
      const mesesAtraso = venc
        ? Math.max(1, Math.ceil((Date.now() - venc.getTime()) / (1000 * 60 * 60 * 24 * 30)))
        : 1;
      multaObrigacao = calcularMultaObrigacaoAcessoria(p.tipo, mesesAtraso);
      totalMultas += multaObrigacao.multa;
    }

    itens.push({ pendencia: p, selicCalculo, multaObrigacao, categoria, urgencia });
  });

  // Ordenar por urgência
  const ordem = { Critica: 0, Alta: 1, Media: 2, Baixa: 3 };
  itens.sort((a, b) => ordem[a.urgencia] - ordem[b.urgencia]);

  // Sugestões de parcelamento
  const tiposRelevantes = determinarTiposDebitoRelevantes(pendencias);
  const parcelamentosAplicaveis = PARCELAMENTOS_VIGENTES.filter(
    p => p.vigente && p.tiposDebito.some(t => tiposRelevantes.has(t))
  );
  const sugestoesParcelamento: ParcelamentoSugestao[] = [];
  if (totalAtualizado > 0) {
    let menorParcela = Infinity;
    parcelamentosAplicaveis.forEach(parc => {
      const sim = simularParcelamento(totalAtualizado, parc);
      const sugestao: ParcelamentoSugestao = {
        nome: parc.nome,
        lei: parc.lei,
        parcelas: parc.parcelas,
        valorEntrada: sim.valorEntrada,
        valorComDesconto: sim.valorComDesconto,
        valorParcela: sim.valorParcela,
        economiaTotal: sim.economiaTotal,
        descontoMulta: parc.descontoMulta * 100,
        descontoJuros: parc.descontoJuros * 100,
        observacao: parc.observacao,
        maisVantajoso: false,
      };
      if (sim.economiaTotal > 0 && sim.valorParcela < menorParcela) {
        menorParcela = sim.valorParcela;
      }
      sugestoesParcelamento.push(sugestao);
    });

    // Marcar o mais vantajoso (maior economia)
    let maiorEconomia = 0;
    sugestoesParcelamento.forEach(s => {
      if (s.economiaTotal > maiorEconomia) maiorEconomia = s.economiaTotal;
    });
    sugestoesParcelamento.forEach(s => {
      if (s.economiaTotal === maiorEconomia && maiorEconomia > 0) s.maisVantajoso = true;
    });
  }

  // Calcular score de risco
  const criticas = itens.filter(i => i.urgencia === 'Critica').length;
  const altas = itens.filter(i => i.urgencia === 'Alta').length;
  let score = 100;
  score -= criticas * 20;
  score -= altas * 10;
  score -= itens.filter(i => i.urgencia === 'Media').length * 5;
  if (totalAtualizado > 100000) score -= 15;
  if (totalAtualizado > 500000) score -= 15;
  score = Math.max(0, Math.min(100, score));

  const nivelRisco: AnaliseCompleta['nivelRisco'] =
    score <= 25 ? 'Critical' :
    score <= 50 ? 'High' :
    score <= 75 ? 'Medium' : 'Low';

  return {
    itens,
    totalOriginal,
    totalAtualizado,
    totalMultas,
    totalJuros,
    parcelamentosAtuais,
    sugestoesParcelamento,
    score,
    nivelRisco,
  };
}

export async function gerarAnaliseIA(
  analise: Omit<AnaliseCompleta, 'planoAcao' | 'resumoIA'>,
  nomeEmpresa: string
): Promise<{ planoAcao: string; resumoIA: string }> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  const debitosTexto = analise.itens
    .filter(i => i.categoria === 'debito')
    .map(i => `- ${i.pendencia.tipo} (${i.pendencia.orgao}): R$ ${(i.pendencia.valor || 0).toFixed(2)} | Venc: ${i.pendencia.vencimento || 'N/A'} | Atualizado SELIC: R$ ${(i.selicCalculo?.valorAtualizado || i.pendencia.valor || 0).toFixed(2)}`)
    .join('\n');

  const obrigacoesTexto = analise.itens
    .filter(i => i.categoria === 'obrigacao_ausente')
    .map(i => `- ${i.pendencia.tipo} (${i.pendencia.orgao}): ${i.pendencia.descricao} | Multa estimada: R$ ${(i.multaObrigacao?.multa || 0).toFixed(2)} | Base legal: ${i.multaObrigacao?.fundamentoLegal || 'N/A'}`)
    .join('\n');

  const parcelamentosTexto = analise.parcelamentosAtuais
    .map(p => `- ${p.tipo}: R$ ${(p.valor || 0).toFixed(2)} (${p.descricao})`)
    .join('\n');

  const sugestoesTexto = analise.sugestoesParcelamento
    .filter(s => s.economiaTotal > 0)
    .map(s => `- ${s.nome} (${s.lei}): ${s.parcelas}x de R$ ${s.valorParcela.toFixed(2)} | Economia: R$ ${s.economiaTotal.toFixed(2)} | Desc. multa: ${s.descontoMulta}% | Desc. juros: ${s.descontoJuros}%${s.maisVantajoso ? ' [MAIS VANTAJOSO]' : ''}`)
    .join('\n');

  const prompt = `Você é um consultor tributário sênior brasileiro. Analise a situação fiscal da empresa "${nomeEmpresa}" e forneça:

DADOS DA ANÁLISE:
- Score de Compliance: ${analise.score}/100 (Risco: ${analise.nivelRisco})
- Total Original: R$ ${analise.totalOriginal.toFixed(2)}
- Total Atualizado (SELIC): R$ ${analise.totalAtualizado.toFixed(2)}
- Total Juros SELIC: R$ ${analise.totalJuros.toFixed(2)}
- Total Multas: R$ ${analise.totalMultas.toFixed(2)}

DÉBITOS EM ABERTO:
${debitosTexto || 'Nenhum débito identificado.'}

OBRIGAÇÕES ACESSÓRIAS AUSENTES:
${obrigacoesTexto || 'Nenhuma obrigação ausente.'}

PARCELAMENTOS ATIVOS:
${parcelamentosTexto || 'Nenhum parcelamento ativo.'}

OPÇÕES DE PARCELAMENTO DISPONÍVEIS:
${sugestoesTexto || 'N/A'}

Forneça ESTRITAMENTE em Português do Brasil:

1. **RESUMO EXECUTIVO** (3-4 linhas): Situação geral da empresa com tom profissional.

2. **PLANO DE AÇÃO** com itens numerados por prioridade:
   - Ação concreta a tomar
   - Prazo recomendado
   - Impacto esperado
   - Fundamentação legal quando aplicável

3. **ANÁLISE DE PARCELAMENTOS**: Compare os parcelamentos ativos (se houver) com as opções disponíveis. Recomende migração se mais vantajoso, explicando a economia.

4. **PENALIDADES E RISCOS**: Detalhe as multas aplicáveis para cada obrigação não entregue, citando a legislação.

5. **RECOMENDAÇÃO FINAL**: Síntese com próximos passos imediatos.

Formate em Markdown. Seja objetivo e técnico.`;

  if (!apiKey) {
    // Gerar análise local sem IA
    const planoLocal = gerarPlanoLocal(analise);
    return { planoAcao: planoLocal, resumoIA: 'Análise gerada localmente (chave de IA não configurada). Para análise avançada, configure VITE_GEMINI_API_KEY.' };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    const texto = response.text || '';
    const resumo = texto.split('\n').slice(0, 5).join('\n');
    return { planoAcao: texto, resumoIA: resumo };
  } catch (err) {
    console.error('Erro na análise IA:', err);
    const planoLocal = gerarPlanoLocal(analise);
    return { planoAcao: planoLocal, resumoIA: 'Falha na análise IA. Plano gerado localmente.' };
  }
}

function gerarPlanoLocal(analise: Omit<AnaliseCompleta, 'planoAcao' | 'resumoIA'>): string {
  const linhas: string[] = [];
  linhas.push('## Plano de Ação Corretivo\n');

  linhas.push(`**Score de Compliance:** ${analise.score}/100 | **Nível de Risco:** ${analise.nivelRisco}\n`);
  linhas.push(`**Total em Aberto:** R$ ${analise.totalAtualizado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (Original: R$ ${analise.totalOriginal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})\n`);

  let step = 1;

  // Obrigações ausentes primeiro
  const ausentes = analise.itens.filter(i => i.categoria === 'obrigacao_ausente');
  if (ausentes.length > 0) {
    linhas.push('### Obrigações Acessórias Pendentes\n');
    ausentes.forEach(item => {
      linhas.push(`**${step++}. Entregar ${item.pendencia.tipo}** (${item.pendencia.orgao})`);
      linhas.push(`   - Situação: ${item.pendencia.descricao}`);
      linhas.push(`   - Multa estimada: R$ ${(item.multaObrigacao?.multa || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
      linhas.push(`   - Base legal: ${item.multaObrigacao?.fundamentoLegal || 'N/A'}`);
      linhas.push(`   - Urgência: **${item.urgencia}**\n`);
    });
  }

  // Débitos
  const debitos = analise.itens.filter(i => i.categoria === 'debito');
  if (debitos.length > 0) {
    linhas.push('### Débitos em Aberto\n');
    debitos.forEach(item => {
      linhas.push(`**${step++}. ${item.pendencia.tipo}** (${item.pendencia.orgao})`);
      linhas.push(`   - Valor original: R$ ${(item.pendencia.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
      if (item.selicCalculo) {
        linhas.push(`   - Valor atualizado (SELIC): R$ ${item.selicCalculo.valorAtualizado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
        linhas.push(`   - Juros acumulados: R$ ${item.selicCalculo.jurosAcumulados.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
        linhas.push(`   - Multa de mora: R$ ${item.selicCalculo.multaMora.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
        linhas.push(`   - Dias em atraso: ${item.selicCalculo.diasAtraso}`);
      }
      linhas.push(`   - Urgência: **${item.urgencia}**\n`);
    });
  }

  // Sugestões de parcelamento
  const sugestoes = analise.sugestoesParcelamento.filter(s => s.economiaTotal > 0);
  if (sugestoes.length > 0) {
    linhas.push('### Opções de Parcelamento\n');
    sugestoes.forEach(s => {
      linhas.push(`**${s.nome}** (${s.lei})${s.maisVantajoso ? ' ⭐ MAIS VANTAJOSO' : ''}`);
      linhas.push(`   - Parcelas: ${s.parcelas}x de R$ ${s.valorParcela.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
      linhas.push(`   - Economia total: R$ ${s.economiaTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`);
      linhas.push(`   - Desconto multa: ${s.descontoMulta}% | Desconto juros: ${s.descontoJuros}%`);
      linhas.push(`   - ${s.observacao}\n`);
    });
  }

  return linhas.join('\n');
}
