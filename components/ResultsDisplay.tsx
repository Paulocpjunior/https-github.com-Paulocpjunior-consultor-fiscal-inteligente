
import React, { useState } from 'react';
import { FormattedText } from './FormattedText';
import { type SearchResult, SearchType } from '../types';
import { DownloadIcon, ExternalLinkIcon, LightBulbIcon, StarIcon, CalculatorIcon } from './Icons';

interface ResultsDisplayProps {
    result: SearchResult | null;
    error: string | null;
    onStartCompare: () => void;
    isFavorite: boolean;
    onToggleFavorite: () => void;
    onError: (message: string) => void;
    searchType: SearchType;
    onFindSimilar: () => void;
    onShowToast?: (message: string) => void;
}


const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ result, error, onStartCompare, isFavorite, onToggleFavorite, onError, searchType, onFindSimilar, onShowToast }) => {
    const [isExporting, setIsExporting] = useState(false);
    const [animateFavorite, setAnimateFavorite] = useState(false);

    const handleToggleFavoriteClick = () => {
        onToggleFavorite();
        setAnimateFavorite(true);
        setTimeout(() => setAnimateFavorite(false), 300); // Reset animation class
        if (onShowToast) {
            // Message is actually set in parent state, this just ensures visual feedback loop is complete if needed
        }
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
            
            // Force light theme for PDF capture to ensure contrast
            const wasDark = document.documentElement.classList.contains('dark');
            if (wasDark) {
                // Temporarily remove dark class for capture if needed, 
                // but html2canvas backgroundColor option usually handles it.
                // Better to explicitly set white background in html2canvas.
            }

            const canvas = await html2canvas(element, { 
                scale: 2,
                backgroundColor: '#ffffff', // Force white background for PDF
                logging: false,
                useCORS: true
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

            // Add Header
            pdf.setFontSize(10);
            pdf.setTextColor(100);
            pdf.text('Consultor Fiscal Inteligente - Análise Gerada por IA', 10, 10);

            // Add Image
            pdf.addImage(imgData, 'PNG', 0, position + 15, pdfWidth, pdfHeight); // Offset for header
            heightLeft -= (pageHeight - 15);

            while (heightLeft > 0) {
                position = heightLeft - pdfHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
                heightLeft -= pageHeight;
            }
            
            // Add Footer
            const pageCount = pdf.getNumberOfPages();
            for(let i = 1; i <= pageCount; i++) {
                pdf.setPage(i);
                pdf.setFontSize(8);
                pdf.setTextColor(150);
                pdf.text(`Página ${i} de ${pageCount}`, pdf.internal.pageSize.getWidth() - 30, pdf.internal.pageSize.getHeight() - 10);
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
            <div className="mt-6 p-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30 rounded-lg text-red-700 font-bold dark:text-red-300">
                <p className="font-bold">Ocorreu um erro</p>
                <p>{error}</p>
            </div>
        );
    }

    if (!result) {
        return null;
    }

    return (
        <div className="animate-fade-in">
            <div id={`result-content-${result.query}`} className="mt-6 p-8 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                {/* Header visible in PDF */}
                <div className="mb-4 border-b border-slate-100 dark:border-slate-700 pb-4">
                     <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                        Resultado da Análise
                    </h2>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-400 dark:font-normal">
                        Consulta: <span className="font-bold text-sky-700 dark:text-sky-400">{result.query}</span>
                    </p>
                </div>

                {/* Optional Context Display */}
                {result.context && (result.context.aliquotaIcms || result.context.aliquotaPisCofins || result.context.aliquotaIss) && (
                    <div className="mb-6 p-3 bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-slate-200 dark:border-slate-600 flex items-start gap-3">
                         <CalculatorIcon className="w-5 h-5 text-sky-600 dark:text-sky-400 mt-0.5 flex-shrink-0" />
                         <div>
                             <p className="text-sm font-bold text-slate-900 dark:text-slate-200">Contexto Tributário Considerado:</p>
                             <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm font-bold text-slate-800 dark:text-slate-300 dark:font-normal">
                                 {result.context.aliquotaIss && <span>• ISS: <strong>{result.context.aliquotaIss}%</strong></span>}
                                 {result.context.aliquotaIcms && <span>• ICMS: <strong>{result.context.aliquotaIcms}%</strong></span>}
                                 {result.context.aliquotaPisCofins && <span>• PIS/COFINS: <strong>{result.context.aliquotaPisCofins}%</strong></span>}
                             </div>
                         </div>
                    </div>
                )}

                <div className="prose prose-slate dark:prose-invert max-w-none text-slate-900 font-bold dark:text-slate-300 dark:font-normal">
                    <FormattedText text={result.text} />
                </div>

                {searchType === SearchType.SERVICO && (
                    <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border-l-4 border-sky-500 dark:border-sky-400">
                        <div className="flex items-start">
                            <ExternalLinkIcon className="w-5 h-5 text-sky-600 dark:text-sky-400 mr-3 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="text-sm font-bold text-slate-800 dark:text-slate-300 dark:font-normal mb-1">
                                    Para mais detalhes e a lista completa, consulte a fonte oficial:
                                </p>
                                <a 
                                    href="https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp116.htm" 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="font-bold text-sky-700 dark:text-sky-400 hover:underline text-sm break-words"
                                >
                                    Lei Complementar Nº 116, de 31 de Julho de 2003 (Lista de Serviços)
                                </a>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            
            <div className="mt-6 flex flex-col sm:flex-row gap-4 flex-wrap justify-end">
                <button
                    onClick={onStartCompare}
                    className="btn-press w-full sm:w-auto px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-800 font-bold dark:text-slate-200 dark:font-semibold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 transition-colors"
                >
                    Comparar este código
                </button>
                 <button
                    onClick={handleToggleFavoriteClick}
                    title={isFavorite ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos'}
                    className={`btn-press w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 font-bold rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 transition-colors ${
                        isFavorite 
                        ? 'bg-amber-100 dark:bg-amber-800/50 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-800' 
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600'
                    }`}
                >
                    <StarIcon className={`w-5 h-5 ${animateFavorite ? 'animate-pop-in' : ''}`} solid={isFavorite} />
                    {isFavorite ? 'Favorito' : 'Favoritar'}
                </button>
                 {searchType === SearchType.SERVICO && (
                     <button
                        onClick={onFindSimilar}
                        className="btn-press w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-800 font-bold dark:text-slate-200 dark:font-semibold rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 transition-colors"
                    >
                        <LightBulbIcon className="w-5 h-5" />
                        Serviços Similares
                    </button>
                )}
                <button
                    onClick={handleExportPDF}
                    disabled={isExporting}
                    className="btn-press w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-sky-600 text-white font-bold rounded-lg hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <DownloadIcon className="w-5 h-5" />
                    {isExporting ? 'Exportando...' : 'Exportar PDF'}
                </button>
            </div>
        </div>
    );
};

export default ResultsDisplay;
