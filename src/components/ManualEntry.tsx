import React, { useState, useRef, useEffect } from 'react';
import {
  Plus, Trash2, FileText, Upload, AlertTriangle, DollarSign,
  Calendar, Building2, ClipboardList, X, ChevronDown, Save, Paperclip, RotateCcw
} from 'lucide-react';

const DRAFT_KEY = 'consultor_fiscal_manual_draft';

export interface ManualPendencia {
  id: string;
  categoria: string;
  orgao: string;
  tipo: string;
  descricao: string;
  valor?: number;
  vencimento?: string;
  status: string;
  anexo?: File;
  anexoNome?: string;
  parcelamentoAtivo?: boolean;
  parcelamentoLei?: string;
  parcelamentoParcelas?: number;
  parcelamentoValorParcela?: number;
}

interface ManualEntryProps {
  onAnalyze: (pendencias: ManualPendencia[], nomeEmpresa: string, cnpj: string) => void;
  loading: boolean;
}

const CATEGORIAS = [
  'Débito',
  'Declaração',
  'Obrigação Acessória',
  'Certidão',
  'Parcelamento',
];

const ORGAOS = [
  'Receita Federal (RFB)',
  'PGFN',
  'SEFAZ/SP',
  'Prefeitura Municipal',
  'INSS',
  'FGTS/CEF',
  'eSocial',
  'Outro',
];

const TIPOS_SUGERIDOS: Record<string, string[]> = {
  'Débito': ['IRPJ', 'CSLL', 'PIS', 'COFINS', 'IPI', 'ISS', 'ICMS', 'FGTS', 'INSS Patronal', 'Simples Nacional', 'Dívida Ativa', 'Outro'],
  'Declaração': ['DCTF', 'DCTFWeb', 'EFD-Contribuições', 'ECD', 'ECF', 'DEFIS', 'PGDAS-D', 'DIRF', 'EFD ICMS/IPI', 'GFIP/SEFIP', 'RAIS', 'Outra'],
  'Obrigação Acessória': ['DCTF', 'DCTFWeb', 'EFD-Contribuições', 'ECD', 'ECF', 'SPED Fiscal', 'GFIP', 'RAIS', 'eSocial Eventos', 'Outra'],
  'Certidão': ['CND Federal', 'CND Estadual', 'CND Municipal', 'CRF (FGTS)', 'CNDT (Trabalhista)', 'Outra'],
  'Parcelamento': ['Parcelamento Ordinário', 'Parcelamento Simplificado', 'RELP', 'Transação Tributária', 'PPI Municipal', 'Outro'],
};

const emptyItem = (): ManualPendencia => ({
  id: crypto.randomUUID(),
  categoria: 'Débito',
  orgao: 'Receita Federal (RFB)',
  tipo: '',
  descricao: '',
  valor: undefined,
  vencimento: '',
  status: 'Pendente',
});

export function ManualEntry({ onAnalyze, loading }: ManualEntryProps) {
  const [nomeEmpresa, setNomeEmpresa] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [items, setItems] = useState<ManualPendencia[]>([emptyItem()]);
  const [expandedIdx, setExpandedIdx] = useState<number>(0);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const { nomeEmpresa: ne, cnpj: cn, items: it } = JSON.parse(saved);
        if (ne) setNomeEmpresa(ne);
        if (cn) setCnpj(cn);
        if (it && Array.isArray(it) && it.length > 0)
          setItems(it.map((i: any) => ({ ...i, anexo: undefined })));
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ nomeEmpresa, cnpj, items }));
    } catch {}
  }, [nomeEmpresa, cnpj, items]);

  const handleLimparRascunho = () => {
    if (!confirm('Limpar todo o rascunho salvo?')) return;
    localStorage.removeItem(DRAFT_KEY);
    setNomeEmpresa(''); setCnpj(''); setItems([emptyItem()]); setExpandedIdx(0);
  };

  const formatCNPJ = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 14);
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
    if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
    if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  };

  const addItem = () => {
    const newItem = emptyItem();
    setItems([...items, newItem]);
    setExpandedIdx(items.length);
  };

  const removeItem = (idx: number) => {
    if (items.length === 1) return;
    const next = items.filter((_, i) => i !== idx);
    setItems(next);
    if (expandedIdx >= next.length) setExpandedIdx(next.length - 1);
  };

  const updateItem = (idx: number, field: keyof ManualPendencia, value: any) => {
    const next = [...items];
    (next[idx] as any)[field] = value;
    if (field === 'categoria') {
      next[idx].tipo = '';
    }
    setItems(next);
  };

  const handleFileAttach = (idx: number, file: File | null) => {
    if (!file) return;
    const next = [...items];
    next[idx].anexo = file;
    next[idx].anexoNome = file.name;
    setItems(next);
  };

  const handleSubmit = () => {
    if (!nomeEmpresa.trim()) return;
    const valid = items.filter(i => i.tipo.trim() && i.descricao.trim());
    if (valid.length === 0) return;
    onAnalyze(valid, nomeEmpresa, cnpj);
  };

  const isValid = nomeEmpresa.trim() && items.some(i => i.tipo.trim() && i.descricao.trim());

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-6 rounded-2xl text-white">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-xl bg-white/10">
            <ClipboardList size={24} />
          </div>
          <div>
            <h3 className="font-black text-lg">Entrada Manual de Pendencias</h3>
            <p className="text-indigo-200 text-sm">Insira manualmente as pendencias, certidoes, declaracoes e obrigacoes para analise completa pela IA.</p>
          </div>
        </div>
      </div>

      {/* Dados da Empresa */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Building2 size={14} /> Dados da Empresa
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">Razao Social / Nome *</label>
            <input
              type="text"
              value={nomeEmpresa}
              onChange={e => setNomeEmpresa(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Nome da empresa..."
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">CNPJ</label>
            <input
              type="text"
              value={cnpj}
              onChange={e => setCnpj(formatCNPJ(e.target.value))}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="00.000.000/0000-00"
            />
          </div>
        </div>
      </div>

      {/* Lista de Pendências */}
      <div className="space-y-3">
        {items.map((item, idx) => {
          const isExpanded = expandedIdx === idx;
          const tiposSugeridos = TIPOS_SUGERIDOS[item.categoria] || [];

          return (
            <div key={item.id} className={`bg-white rounded-2xl shadow-sm border transition-all ${isExpanded ? 'border-indigo-200 shadow-md' : 'border-slate-100'}`}>
              {/* Collapsed header */}
              <div
                className="p-4 flex items-center justify-between cursor-pointer"
                onClick={() => setExpandedIdx(isExpanded ? -1 : idx)}
              >
                <div className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-black">
                    {idx + 1}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      {item.tipo || 'Nova Pendencia'}
                      {item.categoria && <span className="ml-2 text-xs font-medium text-slate-400">({item.categoria})</span>}
                    </p>
                    {item.valor && item.valor > 0 && (
                      <p className="text-xs text-slate-500">R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {item.anexoNome && (
                    <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                      <Paperclip size={10} /> Anexo
                    </span>
                  )}
                  {items.length > 1 && (
                    <button
                      onClick={e => { e.stopPropagation(); removeItem(idx); }}
                      className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  <ChevronDown size={16} className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </div>
              </div>

              {/* Expanded form */}
              {isExpanded && (
                <div className="px-4 pb-5 border-t border-slate-100 pt-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Categoria */}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Categoria *</label>
                      <select
                        value={item.categoria}
                        onChange={e => updateItem(idx, 'categoria', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500"
                      >
                        {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>

                    {/* Orgão */}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Orgao *</label>
                      <select
                        value={item.orgao}
                        onChange={e => updateItem(idx, 'orgao', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500"
                      >
                        {ORGAOS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>

                    {/* Tipo */}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Tipo / Obrigacao *</label>
                      <div className="relative">
                        <input
                          type="text"
                          list={`tipos-${item.id}`}
                          value={item.tipo}
                          onChange={e => updateItem(idx, 'tipo', e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500"
                          placeholder="Ex: DCTF, IRPJ, CND..."
                        />
                        <datalist id={`tipos-${item.id}`}>
                          {tiposSugeridos.map(t => <option key={t} value={t} />)}
                        </datalist>
                      </div>
                    </div>
                  </div>

                  {/* Descrição */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">Descricao *</label>
                    <textarea
                      value={item.descricao}
                      onChange={e => updateItem(idx, 'descricao', e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 resize-none"
                      placeholder="Descreva a pendencia, situacao, periodo de referencia..."
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Valor */}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-1">
                        <DollarSign size={10} /> Valor (R$)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.valor || ''}
                        onChange={e => updateItem(idx, 'valor', e.target.value ? parseFloat(e.target.value) : undefined)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500"
                        placeholder="0,00"
                      />
                    </div>

                    {/* Vencimento */}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-1">
                        <Calendar size={10} /> Vencimento / Data Limite
                      </label>
                      <input
                        type="date"
                        value={item.vencimento || ''}
                        onChange={e => updateItem(idx, 'vencimento', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    {/* Status */}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Status</label>
                      <select
                        value={item.status}
                        onChange={e => updateItem(idx, 'status', e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="Pendente">Pendente</option>
                        <option value="Em Negociacao">Em Negociacao</option>
                        <option value="Parcelado">Parcelado</option>
                        <option value="Vencido">Vencido</option>
                        <option value="Inscrito Divida Ativa">Inscrito em Divida Ativa</option>
                      </select>
                    </div>
                  </div>

                  {/* Parcelamento fields */}
                  {item.categoria === 'Parcelamento' && (
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 space-y-3">
                      <p className="text-xs font-bold text-blue-700 uppercase">Dados do Parcelamento Ativo</p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-blue-600 mb-1">Lei / Programa</label>
                          <input
                            type="text"
                            value={item.parcelamentoLei || ''}
                            onChange={e => updateItem(idx, 'parcelamentoLei', e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                            placeholder="Ex: Lei 13.988/2020"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-blue-600 mb-1">Nº Parcelas</label>
                          <input
                            type="number"
                            min="1"
                            value={item.parcelamentoParcelas || ''}
                            onChange={e => updateItem(idx, 'parcelamentoParcelas', parseInt(e.target.value) || undefined)}
                            className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                            placeholder="60"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-blue-600 mb-1">Valor Parcela (R$)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={item.parcelamentoValorParcela || ''}
                            onChange={e => updateItem(idx, 'parcelamentoValorParcela', parseFloat(e.target.value) || undefined)}
                            className="w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                            placeholder="0,00"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Anexo */}
                  <div className="flex items-center gap-3">
                    <input
                      type="file"
                      ref={el => { fileInputRefs.current[item.id] = el; }}
                      onChange={e => handleFileAttach(idx, e.target.files?.[0] || null)}
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                    />
                    <button
                      onClick={() => fileInputRefs.current[item.id]?.click()}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-slate-500 bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
                    >
                      <Paperclip size={12} /> Anexar Documento
                    </button>
                    {item.anexoNome && (
                      <div className="flex items-center gap-2 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">
                        <FileText size={12} />
                        <span className="font-medium truncate max-w-[200px]">{item.anexoNome}</span>
                        <button onClick={() => { updateItem(idx, 'anexo', undefined); updateItem(idx, 'anexoNome', ''); }}>
                          <X size={12} className="text-blue-400 hover:text-red-500" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <button
          onClick={addItem}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors border border-indigo-200"
        >
          <Plus size={16} /> Adicionar Pendencia
        </button>

        <button onClick={handleLimparRascunho}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-slate-400 hover:text-red-500 bg-slate-50 hover:bg-red-50 rounded-xl transition-colors border border-slate-200">
          <RotateCcw size={16} /> Limpar Rascunho
        </button>

        <div className="flex-1" />

        <span className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200">
          <Save size={12} /> Salvo automaticamente
        </span>

        <p className="text-xs text-slate-400">
          {items.length} {items.length === 1 ? 'item' : 'itens'} cadastrado{items.length > 1 ? 's' : ''}
        </p>

        <button
          onClick={handleSubmit}
          disabled={!isValid || loading}
          className="flex items-center gap-2 px-6 py-3 text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <><span className="animate-spin">⟳</span> Analisando...</>
          ) : (
            <><AlertTriangle size={16} /> Analisar com IA</>
          )}
        </button>
      </div>
    </div>
  );
}
