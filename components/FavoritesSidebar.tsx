
import React, { useState } from 'react';
import { FavoriteItem, HistoryItem, SearchType } from '../types';

const TrashIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

const CloseIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
);

const HistoryIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const StarIcon: React.FC<{ className?: string }> = ({ className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="currentColor" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
);

type SidebarTab = 'favorites' | 'history';

interface FavoritesSidebarProps {
    favorites: FavoriteItem[];
    onFavoriteRemove: (favorites: FavoriteItem[]) => void;
    onFavoriteSelect: (item: FavoriteItem) => void;
    history: HistoryItem[];
    onHistorySelect: (item: HistoryItem) => void;
    onHistoryRemove: (id: string) => void;
    onHistoryClear: () => void;
    isVisible: boolean;
    onClose: () => void;
}

const formatTimestamp = (timestamp: number) => {
    const now = new Date();
    const date = new Date(timestamp);
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 3600 * 24));

    if (diffDays === 0) return 'Hoje';
    if (diffDays === 1) return 'Ontem';
    return date.toLocaleDateString('pt-BR');
};

const TypeBadge: React.FC<{ type: SearchType }> = ({ type }) => {
    const typeClasses: Record<SearchType, string> = {
        [SearchType.CFOP]: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
        [SearchType.NCM]: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
        [SearchType.SERVICO]: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    };
    return (
        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${typeClasses[type]}`}>
            {type}
        </span>
    );
};

const FavoritesSidebar: React.FC<FavoritesSidebarProps> = ({ 
    favorites, onFavoriteRemove, onFavoriteSelect, 
    history, onHistorySelect, onHistoryRemove, onHistoryClear,
    isVisible, onClose 
}) => {
    const [activeTab, setActiveTab] = useState<SidebarTab>('favorites');

    const handleRemoveFavorite = (itemToRemove: FavoriteItem) => {
        onFavoriteRemove(favorites.filter(item => !(item.code === itemToRemove.code && item.type === itemToRemove.type)));
    };

    const favoritesByType = (type: SearchType) => favorites.filter(fav => fav.type === type);

    const FavoriteSection: React.FC<{type: SearchType, title: string}> = ({ type, title }) => {
        const items = favoritesByType(type);
        if (items.length === 0) return null;

        return (
            <div>
                <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">{title}</h3>
                <ul className="space-y-1">
                    {items.map(item => (
                        <li key={`${item.type}-${item.code}`} className="group flex items-center justify-between p-2 rounded-md hover:bg-sky-100 dark:hover:bg-slate-700">
                            <button onClick={() => onFavoriteSelect(item)} className="text-left flex-grow">
                                <p className="font-semibold text-slate-700 dark:text-slate-200">{item.code}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{item.description}</p>
                            </button>
                            <button 
                                onClick={() => handleRemoveFavorite(item)} 
                                className="ml-2 p-1 text-slate-400 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Remover favorito"
                            >
                                <TrashIcon className="w-4 h-4" />
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        )
    }
    
    const renderContent = () => {
        if (activeTab === 'favorites') {
            return favorites.length === 0 ? (
                <div className="text-center py-8">
                    <p className="text-slate-500 dark:text-slate-400 text-sm">Nenhum favorito adicionado.</p>
                    <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">Clique na estrela ★ nos resultados da busca para adicionar aqui.</p>
                </div>
            ) : (
                <div className="space-y-6">
                    <FavoriteSection type={SearchType.CFOP} title="CFOPs" />
                    <FavoriteSection type={SearchType.NCM} title="NCMs" />
                    <FavoriteSection type={SearchType.SERVICO} title="Serviços" />
                </div>
            );
        }

        if (activeTab === 'history') {
            return history.length === 0 ? (
                 <div className="text-center py-8">
                    <p className="text-slate-500 dark:text-slate-400 text-sm">Nenhuma consulta no histórico.</p>
                    <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">Suas buscas recentes aparecerão aqui.</p>
                </div>
            ) : (
                <div>
                    <div className="flex justify-end mb-2">
                         <button onClick={onHistoryClear} className="text-xs text-sky-600 dark:text-sky-400 hover:underline">
                            Limpar Histórico
                        </button>
                    </div>
                    <ul className="space-y-1">
                        {history.map(item => (
                            <li key={item.id} className="group flex items-center justify-between p-2 rounded-md hover:bg-sky-100 dark:hover:bg-slate-700">
                                <button onClick={() => onHistorySelect(item)} className="text-left flex-grow">
                                    <div className="flex items-center justify-between">
                                        <p className="font-semibold text-slate-700 dark:text-slate-200 truncate pr-2">
                                            {item.queries.join(' vs ')}
                                        </p>
                                        <TypeBadge type={item.type} />
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">{formatTimestamp(item.timestamp)}</p>
                                </button>
                                <button 
                                    onClick={() => onHistoryRemove(item.id)} 
                                    className="ml-2 p-1 text-slate-400 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Remover do histórico"
                                >
                                    <TrashIcon className="w-4 h-4" />
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            );
        }
        return null;
    }

    return (
        <aside className={`w-80 flex-shrink-0 bg-white dark:bg-slate-800 rounded-xl shadow-md p-4 transition-all duration-300 ease-in-out ${isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 hidden'}`}>
            <div className="flex justify-between items-center mb-4 border-b border-slate-200 dark:border-slate-700">
                <div className="flex">
                    <button 
                        onClick={() => setActiveTab('favorites')}
                        className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${activeTab === 'favorites' ? 'border-b-2 border-sky-500 text-sky-600 dark:text-sky-400' : 'text-slate-500 dark:text-slate-400 hover:text-sky-600'}`}>
                        <StarIcon className="w-4 h-4" /> Favoritos
                    </button>
                    <button 
                        onClick={() => setActiveTab('history')}
                        className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${activeTab === 'history' ? 'border-b-2 border-sky-500 text-sky-600 dark:text-sky-400' : 'text-slate-500 dark:text-slate-400 hover:text-sky-600'}`}>
                        <HistoryIcon className="w-4 h-4" /> Histórico
                    </button>
                </div>
                <button onClick={onClose} className="p-1 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700">
                    <CloseIcon className="w-5 h-5" />
                </button>
            </div>
            
            <div className="overflow-y-auto max-h-[70vh] pr-1">
                {renderContent()}
            </div>
        </aside>
    );
};

export default FavoritesSidebar;
