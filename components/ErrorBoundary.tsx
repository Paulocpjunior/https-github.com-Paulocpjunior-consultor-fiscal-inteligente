import React from 'react';

interface Props {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}
interface State { hasError: boolean; error?: Error; }

export class ErrorBoundary extends React.Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('ErrorBoundary caught:', error, info);
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) return this.props.fallback;
            return (
                <div className="p-8 text-center bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
                    <p className="text-red-700 dark:text-red-300 font-bold text-lg mb-2">Erro ao carregar esta seção</p>
                    <p className="text-red-500 dark:text-red-400 text-sm mb-4">{this.state.error?.message}</p>
                    <button onClick={() => this.setState({ hasError: false })} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-bold">
                        Tentar novamente
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
