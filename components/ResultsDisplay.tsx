import React, { useState } from 'react';
import { FormattedText } from './FormattedText';
import { type SearchResult, SearchType } from '../types';
import { DownloadIcon, ExternalLinkIcon, LightBulbIcon, StarIcon } from './Icons';

interface ResultsDisplayProps {
    result: SearchResult | null;
    error: string | null;
    onStartCompare: () => void;
    isFavorite: boolean;
    onToggleFavorite: () => void;
    onError: (message: string) => void;
    searchType: SearchType;
    onFindSimilar: () => void;
}


const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ result, error, onStartCompare, isFavorite, onToggleFavorite, onError, searchType, onFindSimilar }) => {
    const [isExporting, setIsExporting] = useState(false);
    const [animateFavorite, setAnimateFavorite] = useState(false);

    const handleToggleFavoriteClick = () => {
        onToggleFavorite();
        setAnimateFavorite(true);
        setTimeout(() => setAnimateFavorite(false), 300); // Reset animation class
    };

    const handleExportPDF = async () => {
        if (!result) return;
        setIsExporting(true);
        try {
            const { default: jsPDF } = await import('jspdf');
            const { default: html2canvas } = await import('html2canvas');

            const element = document.getElementById(`result-content-${result.query}`);
            if (!element) {
                console.error("Elemento para exportar não encontrado.");
                return;
            }
            
            const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';

            const canvas = await html2canvas(element, { 
                scale: 2,
                backgroundColor: theme === 'dark' ? '#1e293b' : '#ffffff',
            });
            const imgData = canvas.toDataURL('image/png');

            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const imgProps = pdf.getImageProperties(imgData);
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
            
            let heightLeft = pdfHeight;
            let position = 0;
            const pageHeight = pdf.internal.pageSize.getHeight();

            pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
            heightLeft -= pageHeight;

            while (heightLeft > 0) {
                position = heightLeft - pdfHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
                heightLeft -= pageHeight;
            }
            
            pdf.save(`consulta-${result.query.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`);
        } catch (e) {
            console.error("Erro ao exportar PDF:", e);
            onError("Falha ao gerar o PDF. Tente novamente.");
        } finally {
            setIsExporting(false);
        }
    };

    if (error) {
        return (
            <div className="mt-6 p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30 rounded-lg text-red-700 dark:text-red-300">
                <p className="font-semibold">Ocorreu um erro</p>
                <p>{error}</p>
            </div>
        );
    }

    if (!result) {
        return null;
    }

    return (
        <div id={`result-content-${result.query}`} className="mt-6 p-6 bg-white dark:bg-slate-800 rounded-lg shadow-sm animate-fade-in">
            <div className="prose prose-slate dark:prose-invert max-w-none text-slate-600 dark:text-slate-300">
                <FormattedText text={result.text} />
            </div>

            {searchType === SearchType.SERVICO && (
                <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border-l-4 border-sky-500 dark:border-sky-400">
                    <div className="flex items-start">
                        <ExternalLinkIcon className="w-5 h-5 text-sky-600 dark:text-sky-400 mr-3 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="text-sm text-slate-600 dark:text-slate-300 mb-1">
                                Para mais detalhes e a lista completa, consulte a fonte oficial:
                            </p>
                            <a 
                                href="https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp116.htm" 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="font-semibold text-sky-600 dark:text-sky-400 hover:underline text-sm break-words"
                            >
                                Lei Complementar Nº 116, de 31 de Julho de 2003 (Lista de Serviços)
                            </a>
                        </div>
                    </div>
                </div>
            )}
            
            <div className="mt-6 flex flex-col sm:flex-row gap-4 flex-wrap">
                <button
                    onClick={onStartCompare}
                    className="btn-press w-full sm:w-auto px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 transition-colors"
                >
                    Comparar este código
                </button>
                 <button
                    onClick={handleToggleFavoriteClick}
                    title={isFavorite ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos'}
                    className={`btn-press w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 font-semibold rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 transition-colors ${
                        isFavorite 
                        ? 'bg-amber-100 dark:bg-amber-800/50 text-amber-600 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-800' 
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                >
                    <StarIcon className={`w-5 h-5 ${animateFavorite ? 'animate-pop-in' : ''}`} solid={isFavorite} />
                    {isFavorite ? 'Favorito' : 'Favoritar'}
                </button>
                 {searchType === SearchType.SERVICO && (
                     <button
                        onClick={onFindSimilar}
                        className="btn-press w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 transition-colors"
                    >
                        <LightBulbIcon className="w-5 h-5" />
                        Serviços Similares
                    </button>
                )}
                <button
                    onClick={handleExportPDF}
                    disabled={isExporting}
                    className="btn-press w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <DownloadIcon className="w-5 h-5" />
                    {isExporting ? 'Exportando...' : 'Exportar PDF'}
                </button>
            </div>
        </div>
    );
};

export default ResultsDisplay;
