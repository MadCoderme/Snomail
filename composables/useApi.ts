export function useApi() {
    const backendApiUrl = 'http://localhost:8080';

    return {
        backendApiUrl,
        async fetch(endpoint: string, options = {}) {
            const response = await fetch(`${backendApiUrl}${endpoint}`, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers,
                },
            });
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || `HTTP error! status: ${response.status}`);
            }
            
            return data;
        }
    };
}