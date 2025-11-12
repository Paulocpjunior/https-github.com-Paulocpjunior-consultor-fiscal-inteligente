
export enum SearchType {
  CFOP = 'CFOP',
  NCM = 'NCM',
  SERVICO = 'Serviço',
}

export interface GroundingSource {
  web: {
    uri: string;
    title: string;
  };
}

export interface SearchResult {
  text: string;
  sources: GroundingSource[];
  query: string;
  description?: string; // Optional description for favorites
}

export interface ComparisonResult {
    summary: string;
    result1: SearchResult;
    result2: SearchResult;
}

export interface FavoriteItem {
    code: string;
    description: string;
    type: SearchType;
}

export interface HistoryItem {
    id: string; // Unique ID for each history item
    queries: string[];
    type: SearchType;
    mode: 'single' | 'compare';
    timestamp: number;
    // Optional fields for service searches
    municipio?: string;
    alias?: string;
    responsavel?: string;
}
