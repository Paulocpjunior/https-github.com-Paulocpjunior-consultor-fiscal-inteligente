
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
}
