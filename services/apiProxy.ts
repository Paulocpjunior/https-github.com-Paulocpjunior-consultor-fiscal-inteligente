export const callGeminiProxy = async (prompt: string, model = 'gemini-2.0-flash'): Promise<string> => {
    const response = await fetch('/api/fiscal/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model }),
    });
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Erro na API');
    }
    const data = await response.json();
    return data.text;
};
