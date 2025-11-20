
import React, { useState, useEffect } from 'react';
import { SimplesNacionalAnexo } from '../types';
import { fetchCnpjFromBrasilAPI } from '../services/externalApiService';
import { sugerirAnexoPorCnae } from '../services/simplesNacionalService';

interface SimplesNacionalNovaEmpresaProps {
    onSave: (nome: string, cnpj: string, cnae: string, anexo: SimplesNacionalAnexo | 'auto') => void;
    onCancel: () => void;
}

const anexoDescriptions: Record<SimplesNacionalAnexo, string> = {
    'I': 'Anexo I – Comércio',
    'II': 'Anexo II – Indústria',
    'III': 'Anexo III – Serviços (baixa complexidade)',
    'IV': 'Anexo IV – Serviços (alta complexidade)',
    'V': 'Anexo V – Serviços especiais',
    'III_V': 'Serviços com Fator R (III/V automático)',
};

const SimplesNacionalNovaEmpresa: React.FC<SimplesNacionalNovaEmpresaProps> = ({ onSave, onCancel }) => {
    const [nome, setNome] = useState('');
    const [cnpj, setCnpj] = useState('');
    const [cnae, setCnae] = useState('');
    const [anexo, setAnexo] = useState<'auto' | SimplesNacionalAnexo>('auto');
    const [error, setError] = useState('');

    const [isCnpjLoading, setIsCnpjLoading] = useState(false);
    const [cnpjError, setCnpjError] = useState('');
    const [nomeFantasia, setNomeFantasia] = useState('');
    const [suggestionMessage, setSuggestionMessage] = useState<string | null>(null);

    useEffect(() => {
      if (anexo === 'auto' && cnae.trim().length >= 2) {
        const suggestedAnexo = sugerirAnexoPorCnae(cnae);
        const anexoDescription = anexoDescriptions[suggestedAnexo] || 'Anexo desconhecido';
        setSuggestionMessage(`Sugestão automática: ${anexoDescription}`);
      } else {
        setSuggestionMessage(null);
      }
    }, [cnae, anexo]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!nome.trim() || !cnpj.trim() || !cnae.trim()) {
            setError('Todos os campos são obrigatórios.');
            return;
        }
        setError('');
        onSave(nome, cnpj, cnae, anexo);
    };

    const handleCnpjVerification = async () => {
        if (!cnpj.trim()) {
            setCnpjError('Digite um CNPJ para verificar.');
            return;
        }
        setIsCnpjLoading(true);
        setCnpjError('');
        setNomeFantasia('');
        setError('');
        try {
            const data = await fetchCnpjFromBrasilAPI(cnpj);
            if (data && data.razaoSocial) {
                setNome(data.razaoSocial);
                if (data.nomeFantasia && data.nomeFantasia.toLowerCase() !== data.razaoSocial.toLowerCase()) {
                    setNomeFantasia(data.nomeFantasia);
                }
            }
        } catch (e: any) {
            setCnpjError(e.message || 'Erro ao verificar o CNPJ.');
        } finally {
            setIsCnpjLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto animate-fade-in">
             <div className="p-8 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-6">
                    Cadastrar Nova Empresa
                </h2>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="cnpj" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            CNPJ
                        </label>
                        <div className="mt-1 flex gap-2">
                            <input
                                type="text"
                                id="cnpj"
                                value={cnpj}
                                onChange={(e) => setCnpj(e.target.value)}
                                placeholder="00.000.000/0001-00"
                                className="flex-grow w-full pl-4 pr-4 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                                required
                            />
                            <button
                                type="button"
                                onClick={handleCnpjVerification}
                                disabled={isCnpjLoading}
                                className="btn-press flex-shrink-0 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-wait"
                            >
                                {isCnpjLoading ? '...' : 'Verificar Receita Federal'}
                            </button>
                        </div>
                        {cnpjError && <p className="mt-1 text-xs text-red-500">{cnpjError}</p>}
                    </div>

                    <div>
                        <label htmlFor="nome" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            Nome da Empresa (Razão Social)
                        </label>
                        <input
                            type="text"
                            id="nome"
                            value={nome}
                            onChange={(e) => setNome(e.target.value)}
                            className="mt-1 w-full pl-4 pr-4 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                            required
                        />
                         {nomeFantasia && <p className="mt-1 text-xs text-green-600 dark:text-green-400">Nome Fantasia: {nomeFantasia}</p>}
                    </div>
                    
                    <div>
                        <label htmlFor="cnae" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                            CNAE Principal
                        </label>
                        <input
                            type="text"
                            id="cnae"
                            value={cnae}
                            onChange={(e) => setCnae(e.target.value)}
                            placeholder="Ex: 69.20-6-01"
                            className="mt-1 w-full pl-4 pr-4 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                            required
                        />
                    </div>
                     <div>
                        <label htmlFor="anexo" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                           Anexo do Simples
                        </label>
                        <select
                            id="anexo"
                            value={anexo}
                            onChange={(e) => setAnexo(e.target.value as 'auto' | SimplesNacionalAnexo)}
                            className="mt-1 w-full pl-4 pr-10 py-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                        >
                            <option value="auto">Automático (sugerir pelo CNAE)</option>
                            <option value="I">Anexo I – Comércio</option>
                            <option value="II">Anexo II – Indústria</option>
                            <option value="III">Anexo III – Serviços (baixa complexidade)</option>
                            <option value="IV">Anexo IV – Serviços (alta complexidade)</option>
                            <option value="V">Anexo V – Serviços especiais</option>
                             <option value="III_V">Serviços com Fator R (III/V automático)</option>
                        </select>
                        {suggestionMessage && (
                            <div className="mt-2 p-2 bg-sky-50 dark:bg-sky-900/30 border-l-4 border-sky-500 text-sky-700 dark:text-sky-300 text-sm rounded-r-lg">
                                <p>{suggestionMessage}</p>
                            </div>
                        )}
                    </div>
                    {error && <p className="text-sm text-red-500">{error}</p>}
                    <div className="flex justify-end gap-4 pt-4">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="btn-press px-6 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="btn-press px-6 py-2 bg-sky-600 text-white font-semibold rounded-lg hover:bg-sky-700"
                        >
                            Salvar Empresa
                        </button>
                    </div>
                </form>
             </div>
        </div>
    );
};

export default SimplesNacionalNovaEmpresa;
