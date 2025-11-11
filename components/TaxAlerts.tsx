import React from 'react';
import { SearchResult, SearchType } from '../types';
import { FormattedText } from '../App';

const ShieldIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
);


const extractTaxInfo = (text: string): string => {
    const lines = text.split('\n');
    const startIndex = lines.findIndex(line => line.includes('**Incidência de Impostos**'));
    
    if (startIndex === -1) {
        return 'Nenhuma informação sobre impostos encontrada.';
    }

    let endIndex = lines.findIndex((line, index) => index > startIndex && line.startsWith('**') && line.endsWith('**'));
    if (endIndex === -1) {
        endIndex = lines.length;
    }
    
    return lines.slice(startIndex + 1, endIndex).join('\n').trim();
};


interface TaxAlertsProps {
    results: SearchResult[];
    searchType: SearchType;
}

const TaxAlerts: React.FC<TaxAlertsProps> = ({ results, searchType }) => {
    if (!results || results.length === 0) {
        return null;
    }

    return (
        <section className="mt-8 p-6 bg-white dark:bg-slate-800 rounded-lg shadow-sm animate-fade-in">
            <div className="flex items-center mb-4">
                <ShieldIcon className="w-7 h-7 text-sky-600 dark:text-sky-400" />
                <h2 className="ml-3 text-2xl font-bold text-slate-800 dark:text-slate-100">
                    Alertas de Impostos
                </h2>
            </div>
            <p className="mb-6 text-slate-500 dark:text-slate-400">
                Resumo rápido da incidência de impostos para os códigos consultados.
            </p>

            <div className={`grid grid-cols-1 ${results.length > 1 ? 'md:grid-cols-2' : ''} gap-6`}>
                {results.map((result) => (
                    <div key={result.query} className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg">
                        <h3 className="font-bold text-lg text-sky-700 dark:text-sky-400 mb-2">
                            {searchType} {result.query}
                        </h3>
                        <div className="prose prose-sm prose-slate dark:prose-invert max-w-none text-slate-600 dark:text-slate-300">
                           <FormattedText text={extractTaxInfo(result.text)} />
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
};

export default TaxAlerts;