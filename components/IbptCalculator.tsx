
import React, { useState, useEffect } from 'react';
import { IbptRates } from '../types';
import { CalculatorIcon, InfoIcon } from './Icons';
import Tooltip from './Tooltip';

interface IbptCalculatorProps {
    initialRates?: IbptRates;
    queryCode: string;
}

const IbptCalculator: React.FC<IbptCalculatorProps> = ({ initialRates, queryCode }) => {
    const [productValue, setProductValue] = useState<number>(100);
    const [rates, setRates] = useState<IbptRates>({
        nacional: 0,
        importado: 0,
        estadual: 0,
        municipal: 0
    });

    // Load initial rates from Gemini or set defaults based on typical averages if missing
    useEffect(() => {
        if (initialRates) {
            setRates(initialRates);
        } else {
            // Default Fallback estimations if API doesn't return data
            // These are broad averages just to populate the UI initially
            setRates({
                nacional: 13.45,
                importado: 0,
                estadual: 17.00,
                municipal: 0
            });
        }
    }, [initialRates]);

    const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value.replace(/\D/g, '');
        const val = parseFloat(raw) / 100;
        setProductValue(isNaN(val) ? 0 : val);
    };

    const handleRateChange = (key: keyof IbptRates, value: string) => {
        const num = parseFloat(value);
        setRates(prev => ({ ...prev, [key]: isNaN(num) ? 0 : num }));
    };

    const calculateTax = (rate: number) => {
        return productValue * (rate / 100);
    };

    const totalBurden = calculateTax(rates.nacional) + calculateTax(rates.estadual) + calculateTax(rates.municipal);
    const totalPercentage = rates.nacional + rates.estadual + rates.municipal;

    return (
        <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-xl border border-slate-200 dark:border-slate-700 animate-fade-in mt-6">
            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-200 dark:border-slate-700">
                <CalculatorIcon className="w-6 h-6 text-sky-600 dark:text-sky-400" />
                <div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Calculadora de Carga Tributária (IBPT)</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        Estimativa aproximada de tributos (Lei 12.741/12) para o item <span className="font-mono font-bold">{queryCode}</span>.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Inputs */}
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1">Valor do Produto / Serviço</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">R$</span>
                            <input 
                                type="text"
                                value={new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(productValue)}
                                onChange={handleValueChange}
                                className="w-full pl-9 pr-3 py-3 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none text-xl font-bold text-slate-800 dark:text-white text-right"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase flex items-center gap-1">
                            Alíquotas Médias Estimadas (%)
                            <Tooltip content="Você pode ajustar estas alíquotas conforme a tabela IBPT vigente para seu estado.">
                                <InfoIcon className="w-3 h-3 text-slate-400 cursor-help" />
                            </Tooltip>
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                            <div>
                                <label className="text-[10px] block text-slate-500 mb-1">Federal</label>
                                <input 
                                    type="number" 
                                    value={rates.nacional} 
                                    onChange={(e) => handleRateChange('nacional', e.target.value)}
                                    className="w-full p-2 text-sm bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-center font-bold text-slate-700 dark:text-slate-200"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] block text-slate-500 mb-1">Estadual</label>
                                <input 
                                    type="number" 
                                    value={rates.estadual} 
                                    onChange={(e) => handleRateChange('estadual', e.target.value)}
                                    className="w-full p-2 text-sm bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-center font-bold text-slate-700 dark:text-slate-200"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] block text-slate-500 mb-1">Municipal</label>
                                <input 
                                    type="number" 
                                    value={rates.municipal} 
                                    onChange={(e) => handleRateChange('municipal', e.target.value)}
                                    className="w-full p-2 text-sm bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded text-center font-bold text-slate-700 dark:text-slate-200"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Results Visualization */}
                <div className="bg-white dark:bg-slate-900 rounded-lg p-6 border border-slate-100 dark:border-slate-700 flex flex-col justify-center">
                    <div className="space-y-4">
                        <div className="flex justify-between items-end border-b border-slate-100 dark:border-slate-800 pb-2">
                            <div>
                                <p className="text-xs font-bold text-sky-600 uppercase">Federal (IPI, PIS, COFINS)</p>
                                <p className="text-xs text-slate-400">Aprox. {rates.nacional}%</p>
                            </div>
                            <p className="text-lg font-bold text-slate-800 dark:text-slate-200">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(calculateTax(rates.nacional))}
                            </p>
                        </div>
                        <div className="flex justify-between items-end border-b border-slate-100 dark:border-slate-800 pb-2">
                            <div>
                                <p className="text-xs font-bold text-amber-600 uppercase">Estadual (ICMS)</p>
                                <p className="text-xs text-slate-400">Aprox. {rates.estadual}%</p>
                            </div>
                            <p className="text-lg font-bold text-slate-800 dark:text-slate-200">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(calculateTax(rates.estadual))}
                            </p>
                        </div>
                        <div className="flex justify-between items-end border-b border-slate-100 dark:border-slate-800 pb-2">
                            <div>
                                <p className="text-xs font-bold text-purple-600 uppercase">Municipal (ISS)</p>
                                <p className="text-xs text-slate-400">Aprox. {rates.municipal}%</p>
                            </div>
                            <p className="text-lg font-bold text-slate-800 dark:text-slate-200">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(calculateTax(rates.municipal))}
                            </p>
                        </div>
                        
                        <div className="pt-2">
                            <div className="flex justify-between items-center bg-slate-100 dark:bg-slate-800 p-3 rounded-lg">
                                <p className="text-sm font-bold text-slate-600 dark:text-slate-400 uppercase">Carga Total Estimada</p>
                                <div className="text-right">
                                    <p className="text-xl font-extrabold text-slate-900 dark:text-white">
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalBurden)}
                                    </p>
                                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
                                        ({totalPercentage.toFixed(2)}%)
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-4 text-center">
                * Valores aproximados baseados na Lei da Transparência Fiscal (12.741/2012). Fonte IBPT. 
                As alíquotas foram estimadas via IA ou médias de mercado e podem variar por estado (UF).
            </p>
        </div>
    );
};

export default IbptCalculator;
