import React, { useState, useCallback } from 'react';

// ─── Tipos ────────────────────────────────────────────────────────────────────
type Regime = 'LUCRO_REAL' | 'LUCRO_PRESUMIDO' | 'SIMPLES';
type TipoEntrada = 'manual' | 'excel';
type TipoNota = 'PRODUTO' | 'SERVICO';
type TipoResultado = 'APROVADO' | 'PARCIAL' | 'NEGADO' | 'REVISAR';

interface NotaManual {
  numero: string;
  emitente: string;
  cfop: string;
  cst: string;
  natureza: string;
  valorTotal: string;
  tipo: TipoNota;
}

interface ResultadoNota {
  pisCofins: {
    tipo: TipoResultado;
    creditoPIS: number;
    creditoCOFINS: number;
    observacao: string;
    fundamentoLegal: string;
    avisos: string[];
  } | null;
  icms: {
    tipo: TipoResultado;
    creditoIcms: number;
    observacao: string;
    fundamentoLegal: string;
    avisos: string[];
  } | null;
}

interface Totais {
  creditoPIS: number;
  creditoCOFINS: number;
  creditoIcms: number;
  creditoTotal: number;
  notasAnalisadas: number;
  resumo: {
    pisCofins: { totalAprovado: number; totalParcial: number; totalNegado: number; totalRevisar: number };
    icms: { totalAprovado: number; totalParcial: number; totalNegado: number; totalRevisar: number };
  };
}

interface Alerta { nivel: 'ATENCAO' | 'INFO'; mensagem: string; }

interface ResultadoAnalise {
  totais: Totais;
  detalhes: Array<{ nota: NotaManual; pisCofins: ResultadoNota['pisCofins']; icms: ResultadoNota['icms'] }>;
  alertas: Alerta[];
}

// ─── Constantes ───────────────────────────────────────────────────────────────
const API_BASE = window.location.origin;

const NOTA_VAZIA: NotaManual = {
  numero: '', emitente: '', cfop: '', cst: '',
  natureza: '', valorTotal: '', tipo: 'PRODUTO',
};

const COR_TIPO: Record<TipoResultado, string> = {
  APROVADO: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  PARCIAL:  'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  NEGADO:   'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  REVISAR:  'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
};

const ICONE_TIPO: Record<TipoResultado, string> = {
  APROVADO: '✅', PARCIAL: '⚠️', NEGADO: '❌', REVISAR: '🔍',
};

const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// ─── Componente principal ─────────────────────────────────────────────────────
const AnaliseCreditos: React.FC = () => {
  const [regime, setRegime] = useState<Regime>('LUCRO_REAL');
  const [uf, setUf]         = useState('SP');
  const [tipoEntrada, setTipoEntrada] = useState<TipoEntrada>('manual');
  const [notas, setNotas]   = useState<NotaManual[]>([{ ...NOTA_VAZIA }]);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro]     = useState('');
  const [resultado, setResultado] = useState<ResultadoAnalise | null>(null);
  const [abaAtiva, setAbaAtiva] = useState<'resumo' | 'detalhes'>('resumo');

  // ── Notas manuais ────────────────────────────────────────────────────────────
  const adicionarNota = () => setNotas(n => [...n, { ...NOTA_VAZIA }]);
  const removerNota   = (i: number) => setNotas(n => n.filter((_, idx) => idx !== i));
  const atualizarNota = (i: number, campo: keyof NotaManual, valor: string) =>
    setNotas(n => n.map((nota, idx) => idx === i ? { ...nota, [campo]: valor } : nota));

  // ── Envio manual ─────────────────────────────────────────────────────────────
  const analisarManual = useCallback(async () => {
    setErro(''); setLoading(true); setResultado(null);
    try {
      const notasNormalizadas = notas.map(n => ({
        ...n,
        valorTotal: parseFloat(n.valorTotal.replace(',', '.')) || 0,
      }));

      const resp = await fetch(`${API_BASE}/api/analise-creditos/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notas: notasNormalizadas,
          perfilCliente: { regime, uf },
        }),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.erro || 'Erro ao analisar');
      setResultado(data.resultado);
      setAbaAtiva('resumo');
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, [notas, regime, uf]);

  // ── Envio de arquivo ─────────────────────────────────────────────────────────
  const analisarArquivo = useCallback(async () => {
    if (!arquivo) { setErro('Selecione um arquivo'); return; }
    setErro(''); setLoading(true); setResultado(null);
    try {
      const form = new FormData();
      form.append('arquivo', arquivo);
      form.append('perfil', JSON.stringify({ regime, uf }));

      const resp = await fetch(`${API_BASE}/api/analise-creditos/upload`, {
        method: 'POST',
        body: form,
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.erro || 'Erro ao processar arquivo');
      setResultado(data.resultado);
      setAbaAtiva('resumo');
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }, [arquivo, regime, uf]);

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 p-2">

      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-blue-900 to-blue-700 rounded-xl p-5 text-white">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <span>🧾</span> Analisador de Créditos Fiscais
        </h2>
        <p className="text-blue-200 text-sm mt-1">
          PIS/COFINS · ICMS · ISS — com base legal automática
        </p>
      </div>

      {/* ── Perfil do cliente ── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
        <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-3">Perfil do Cliente</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">Regime Tributário</label>
            <select
              value={regime}
              onChange={e => setRegime(e.target.value as Regime)}
              className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-white"
            >
              <option value="LUCRO_REAL">Lucro Real</option>
              <option value="LUCRO_PRESUMIDO">Lucro Presumido</option>
              <option value="SIMPLES">Simples Nacional</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 block">UF</label>
            <select
              value={uf}
              onChange={e => setUf(e.target.value)}
              className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-white"
            >
              {['AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'].map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Tipo de entrada ── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
        <div className="flex gap-2 mb-4">
          {(['manual', 'excel'] as TipoEntrada[]).map(t => (
            <button
              key={t}
              onClick={() => setTipoEntrada(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tipoEntrada === t
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
            >
              {t === 'manual' ? '✏️ Digitação Manual' : '📊 Upload Excel/XML'}
            </button>
          ))}
        </div>

        {/* Manual */}
        {tipoEntrada === 'manual' && (
          <div className="space-y-4">
            {notas.map((nota, i) => (
              <div key={i} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 relative">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">NOTA {i + 1}</span>
                  {notas.length > 1 && (
                    <button onClick={() => removerNota(i)} className="text-red-400 hover:text-red-600 text-xs">✕ Remover</button>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {[
                    { campo: 'numero',    label: 'Nº Nota',     placeholder: '000001' },
                    { campo: 'emitente',  label: 'Emitente',    placeholder: 'Razão Social' },
                    { campo: 'cfop',      label: 'CFOP',        placeholder: '1101' },
                    { campo: 'cst',       label: 'CST/CSOSN',   placeholder: '50' },
                    { campo: 'natureza',  label: 'Natureza',    placeholder: 'Compra p/ revenda' },
                    { campo: 'valorTotal',label: 'Valor Total', placeholder: '1000,00' },
                  ].map(({ campo, label, placeholder }) => (
                    <div key={campo}>
                      <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">{label}</label>
                      <input
                        value={(nota as any)[campo]}
                        onChange={e => atualizarNota(i, campo as keyof NotaManual, e.target.value)}
                        placeholder={placeholder}
                        className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-white"
                      />
                    </div>
                  ))}
                  <div>
                    <label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Tipo</label>
                    <select
                      value={nota.tipo}
                      onChange={e => atualizarNota(i, 'tipo', e.target.value)}
                      className="w-full border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-700 dark:text-white"
                    >
                      <option value="PRODUTO">Produto (NF-e)</option>
                      <option value="SERVICO">Serviço (NFS-e)</option>
                    </select>
                  </div>
                </div>
              </div>
            ))}

            <button
              onClick={adicionarNota}
              className="w-full border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg py-3 text-sm text-slate-500 hover:border-blue-400 hover:text-blue-500 transition-colors"
            >
              + Adicionar Nota
            </button>

            <button
              onClick={analisarManual}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              {loading ? '⏳ Analisando...' : '🔍 Analisar Créditos'}
            </button>
          </div>
        )}

        {/* Upload */}
        {tipoEntrada === 'excel' && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center hover:border-blue-400 transition-colors cursor-pointer"
              onClick={() => document.getElementById('fileInput')?.click()}
            >
              <div className="text-4xl mb-2">📂</div>
              <p className="text-slate-600 dark:text-slate-300 font-medium">
                {arquivo ? arquivo.name : 'Clique para selecionar'}
              </p>
              <p className="text-slate-400 text-xs mt-1">.xlsx · .csv · .xml (NF-e)</p>
              <input
                id="fileInput"
                type="file"
                accept=".xlsx,.xls,.csv,.xml"
                className="hidden"
                onChange={e => setArquivo(e.target.files?.[0] || null)}
              />
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-300">
              <strong>Colunas esperadas no Excel:</strong> CFOP · CST/CSOSN · Valor Total · Emitente · Natureza · Tipo (Produto/Serviço)
            </div>

            <button
              onClick={analisarArquivo}
              disabled={loading || !arquivo}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors"
            >
              {loading ? '⏳ Processando...' : '📊 Processar Arquivo'}
            </button>
          </div>
        )}
      </div>

      {/* ── Erro ── */}
      {erro && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-red-700 dark:text-red-300 text-sm">
          ❌ {erro}
        </div>
      )}

      {/* ── Resultado ── */}
      {resultado && (
        <div className="space-y-4">

          {/* Totais */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Crédito PIS',    valor: resultado.totais.creditoPIS,    cor: 'blue'  },
              { label: 'Crédito COFINS', valor: resultado.totais.creditoCOFINS, cor: 'indigo'},
              { label: 'Crédito ICMS',   valor: resultado.totais.creditoIcms,   cor: 'purple'},
              { label: 'Total Créditos', valor: resultado.totais.creditoTotal,  cor: 'green' },
            ].map(({ label, valor, cor }) => (
              <div key={label} className={`bg-${cor}-50 dark:bg-${cor}-900/20 border border-${cor}-200 dark:border-${cor}-800 rounded-xl p-4 text-center`}>
                <p className={`text-xs font-medium text-${cor}-600 dark:text-${cor}-400 mb-1`}>{label}</p>
                <p className={`text-lg font-bold text-${cor}-800 dark:text-${cor}-200`}>{formatBRL(valor)}</p>
              </div>
            ))}
          </div>

          {/* Alertas */}
          {resultado.alertas.length > 0 && (
            <div className="space-y-2">
              {resultado.alertas.map((a, i) => (
                <div key={i} className={`rounded-lg px-4 py-3 text-sm flex items-start gap-2 ${
                  a.nivel === 'ATENCAO'
                    ? 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800'
                    : 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                }`}>
                  <span>{a.nivel === 'ATENCAO' ? '⚠️' : 'ℹ️'}</span>
                  <span>{a.mensagem}</span>
                </div>
              ))}
            </div>
          )}

          {/* Abas */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="flex border-b border-slate-200 dark:border-slate-700">
              {(['resumo', 'detalhes'] as const).map(aba => (
                <button
                  key={aba}
                  onClick={() => setAbaAtiva(aba)}
                  className={`flex-1 py-3 text-sm font-medium transition-colors ${
                    abaAtiva === aba
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {aba === 'resumo' ? '📊 Resumo' : '📋 Por Nota'}
                </button>
              ))}
            </div>

            <div className="p-4">
              {/* Resumo */}
              {abaAtiva === 'resumo' && (
                <div className="space-y-4">
                  {[
                    { titulo: 'PIS/COFINS', dados: resultado.totais.resumo.pisCofins },
                    { titulo: 'ICMS',       dados: resultado.totais.resumo.icms      },
                  ].map(({ titulo, dados }) => (
                    <div key={titulo}>
                      <h4 className="font-semibold text-slate-700 dark:text-slate-200 mb-2">{titulo}</h4>
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { label: '✅ Aprovado', val: dados.totalAprovado, cor: 'green'  },
                          { label: '⚠️ Parcial',  val: dados.totalParcial,  cor: 'yellow' },
                          { label: '❌ Negado',   val: dados.totalNegado,   cor: 'red'    },
                          { label: '🔍 Revisar',  val: dados.totalRevisar,  cor: 'orange' },
                        ].map(({ label, val, cor }) => (
                          <div key={label} className={`text-center p-2 rounded-lg bg-${cor}-50 dark:bg-${cor}-900/20`}>
                            <p className={`text-xl font-bold text-${cor}-700 dark:text-${cor}-300`}>{val}</p>
                            <p className={`text-xs text-${cor}-600 dark:text-${cor}-400`}>{label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Detalhes por nota */}
              {abaAtiva === 'detalhes' && (
                <div className="space-y-4">
                  {resultado.detalhes.map((d, i) => (
                    <div key={i} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                      <div className="bg-slate-50 dark:bg-slate-700 px-4 py-2 flex justify-between items-center">
                        <span className="font-medium text-sm text-slate-700 dark:text-slate-200">
                          Nota {d.nota.numero || i + 1} — {d.nota.emitente || 'Emitente'}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">CFOP {d.nota.cfop}</span>
                      </div>
                      <div className="divide-y divide-slate-100 dark:divide-slate-700">
                        {d.pisCofins && (
                          <div className="p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">PIS/COFINS</span>
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${COR_TIPO[d.pisCofins.tipo]}`}>
                                {ICONE_TIPO[d.pisCofins.tipo]} {d.pisCofins.tipo}
                              </span>
                            </div>
                            <p className="text-sm text-slate-700 dark:text-slate-300">{d.pisCofins.observacao}</p>
                            {d.pisCofins.fundamentoLegal && (
                              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">⚖️ {d.pisCofins.fundamentoLegal}</p>
                            )}
                            {d.pisCofins.creditoPIS > 0 && (
                              <p className="text-xs text-green-600 dark:text-green-400 mt-1 font-medium">
                                PIS: {formatBRL(d.pisCofins.creditoPIS)} · COFINS: {formatBRL(d.pisCofins.creditoCOFINS)}
                              </p>
                            )}
                          </div>
                        )}
                        {d.icms && (
                          <div className="p-3">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">ICMS</span>
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${COR_TIPO[d.icms.tipo]}`}>
                                {ICONE_TIPO[d.icms.tipo]} {d.icms.tipo}
                              </span>
                            </div>
                            <p className="text-sm text-slate-700 dark:text-slate-300">{d.icms.observacao}</p>
                            {d.icms.fundamentoLegal && (
                              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">⚖️ {d.icms.fundamentoLegal}</p>
                            )}
                            {d.icms.creditoIcms > 0 && (
                              <p className="text-xs text-green-600 dark:text-green-400 mt-1 font-medium">
                                ICMS: {formatBRL(d.icms.creditoIcms)}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnaliseCreditos;
