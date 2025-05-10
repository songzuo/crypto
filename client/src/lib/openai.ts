import { apiRequest } from "./queryClient";

// Function to analyze crypto data using AI
export async function getAiInsight(cryptocurrencyData: any): Promise<{ insight: string; confidence: number }> {
  try {
    const response = await apiRequest(
      "POST",
      "/api/ai-analyze",
      { data: cryptocurrencyData }
    );
    
    const result = await response.json();
    return result;
  } catch (error) {
    console.error("Error getting AI insight:", error);
    throw new Error("Failed to get AI insight");
  }
}

// Function to search for cryptocurrencies
export async function searchCryptocurrencies(query: string): Promise<any[]> {
  if (!query || query.length < 2) {
    return [];
  }
  
  try {
    const response = await apiRequest(
      "GET",
      `/api/search?q=${encodeURIComponent(query)}`
    );
    
    const results = await response.json();
    return results;
  } catch (error) {
    console.error("Error searching cryptocurrencies:", error);
    return [];
  }
}
