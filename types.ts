
export enum SearchType {
  CFOP = 'CFOP',
  NCM = 'NCM',
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
}

export interface ComparisonResult {
    summary: string;
    result1: SearchResult;
    result2: SearchResult;
}
