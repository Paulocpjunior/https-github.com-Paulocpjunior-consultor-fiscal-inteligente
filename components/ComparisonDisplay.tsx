
import React from 'react';
import { type ComparisonResult } from '../types';
import { FormattedText } from '../App';

const ResultCard: React.FC<{ result: ComparisonResult['result1'] }> = ({ result }) => (
    <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg h-full">
        <h2 className="text-xl font-bold text-sky-700 dark:text-sky-400 mb-3">{result.query}</h2>
        <div className="prose prose-slate dark:prose-invert max-w-none text-slate-600 dark:text-slate-300 text-sm">
            <FormattedText text={result.text} />
        </div>
        {result.sources && result.sources.length > 0 && (
            <div className="mt-6 pt-3 border-t border-slate-200 dark:border-slate-700">
                <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Fontes:</h4>
                <ul className="space-y-1">
                    {result.sources.map((source, index) => (
                        <li key={index}>
                            <a
                                href={source.web.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sky-600 dark:text-sky-400 hover:underline text-xs truncate"
                                title={source.web.title}
                            >
                                {source.web.title || source.web.uri}
                            </a>
                        </li>
                    ))}
                </ul>
            </div>
        )}
    </div>
);

const ComparisonDisplay: React.FC<{ result: ComparisonResult | null }> = ({ result }) => {
    if (!result) {
        return null;
    }

    return (
        <div className="space-y-6 animate-fade-in">
            {/* AI Summary Section */}
            <div className="p-6 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                 <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-4">Análise Comparativa por IA</h2>
                 <div className="prose prose-slate dark:prose-invert max-w-none text-slate-600 dark:text-slate-300">
                    <FormattedText text={result.summary} />
                </div>
            </div>

            {/* Side-by-Side Comparison */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ResultCard result={result.result1} />
                <ResultCard result={result.result2} />
            </div>
        </div>
    );
};

export default ComparisonDisplay;
