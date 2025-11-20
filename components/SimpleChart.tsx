
import React, { useEffect, useRef } from 'react';
import { Chart, registerables, ChartTypeRegistry, ChartConfiguration } from 'chart.js';

// Registra todos os componentes necessários do Chart.js (controladores, elementos, escalas, etc.)
// Isso é equivalente a usar o 'chart.js/auto' mas funciona melhor em alguns ambientes ESM.
Chart.register(...registerables);

interface SimpleChartProps {
    type: keyof ChartTypeRegistry;
    data: any;
    options?: any;
}

const SimpleChart: React.FC<SimpleChartProps> = ({ type, data, options }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const chartRef = useRef<Chart | null>(null);

    useEffect(() => {
        if (!canvasRef.current) return;

        // Destrói instância anterior se existir para evitar vazamento de memória ou sobreposição
        if (chartRef.current) {
            chartRef.current.destroy();
        }

        // Cria nova instância do gráfico
        chartRef.current = new Chart(canvasRef.current, {
            type,
            data,
            options
        } as ChartConfiguration);

        // Limpeza ao desmontar
        return () => {
            if (chartRef.current) {
                chartRef.current.destroy();
            }
        };
    }, [type, data, options]);

    return <canvas ref={canvasRef} />;
};

export default SimpleChart;
