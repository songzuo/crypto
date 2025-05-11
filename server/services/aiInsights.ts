import OpenAI from "openai";
import { storage } from "../storage";
import { Cryptocurrency, Metric, InsertAiInsight } from "@shared/schema";

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function getAiInsightsForCrypto(
  cryptocurrency: Cryptocurrency,
  metrics: Metric
): Promise<string> {
  try {
    console.log(`Generating AI insights for ${cryptocurrency.name}...`);
    
    // Format key metrics for better analysis
    const formattedMarketCap = cryptocurrency.marketCap ? 
      `$${(cryptocurrency.marketCap >= 1e9 ? 
        (cryptocurrency.marketCap / 1e9).toFixed(2) + "B" : 
        (cryptocurrency.marketCap / 1e6).toFixed(2) + "M")}` : 
      "unknown";
    
    const activeAddresses = metrics.activeAddresses ? 
      metrics.activeAddresses.toLocaleString() : 
      "unknown number of";
    
    const tps = metrics.transactionsPerSecond ? 
      metrics.transactionsPerSecond.toFixed(2) : 
      "unknown";
    
    // Create a prompt with the cryptocurrency data and metrics
    const prompt = `
      Please analyze the following cryptocurrency data and provide a concise insight:
      
      Cryptocurrency: ${cryptocurrency.name} (${cryptocurrency.symbol})
      Current Price: $${cryptocurrency.price}
      24h Price Change: ${cryptocurrency.priceChange24h}%
      Market Cap: ${formattedMarketCap}
      24h Volume: $${cryptocurrency.volume24h?.toLocaleString() || "unknown"}
      Rank: ${cryptocurrency.rank || "unknown"}
      
      Blockchain Metrics:
      ${metrics.activeAddresses ? `Active Addresses: ${activeAddresses}` : ''}
      ${metrics.totalTransactions ? `Total Transactions: ${metrics.totalTransactions.toLocaleString()}` : ''}
      ${metrics.transactionsPerSecond ? `Transactions Per Second: ${tps}` : ''}
      ${metrics.hashrate ? `Hash Rate: ${metrics.hashrate}` : ''}
      ${metrics.averageTransactionValue ? `Average Transaction Value: ${metrics.averageTransactionValue}` : ''}
      
      Additional Metrics: ${JSON.stringify(metrics.metrics || {})}
      
      Based on this data, provide a concise insight about the cryptocurrency's current state, 
      notable patterns, and potential developments. Focus on on-chain activity and network health.
      Keep the response under 200 words. Your response should be factual and based on the provided data.
      Format your analysis in a professional manner with clear paragraphs and avoid repetitive phrases.
    `;

    let insight = "";
    let confidence = 0;
    
    // Save these variables for use in the catch block too
    const formattedMarketCapForFallback = formattedMarketCap;
    const activeAddressesForFallback = activeAddresses;
    const tpsForFallback = tps;

    // Try to use OpenAI API
    try {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error("OpenAI API key not available");
      }

      // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are a blockchain analytics expert specializing in cryptocurrency metrics analysis."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 250,
        temperature: 0.7,
      });

      insight = response.choices[0].message.content?.trim() || "";
      confidence = 0.92; // High confidence for API-generated insights
      console.log(`Successfully generated OpenAI insight for ${cryptocurrency.name}`);
    } catch (apiError) {
      console.log(`OpenAI API error: ${apiError}. Using factual summary instead.`);
      
      // Generate a factual summary based only on available data
      // No synthetic data or random sentiment analysis - just the facts
      confidence = 0.5; // Medium confidence for factual summaries
      
      // Format market cap for better readability
      const marketCapFormatted = cryptocurrency.marketCap ? 
        (cryptocurrency.marketCap >= 1e9 ? 
         `$${(cryptocurrency.marketCap / 1e9).toFixed(2)}B` : 
         `$${(cryptocurrency.marketCap / 1e6).toFixed(2)}M`) : 
        "unknown market cap";
      
      // Format price change with proper sign
      const priceChangeFormatted = cryptocurrency.priceChange24h !== null && cryptocurrency.priceChange24h !== undefined ?
        (cryptocurrency.priceChange24h > 0 ? 
         `+${cryptocurrency.priceChange24h.toFixed(2)}%` : 
         `${cryptocurrency.priceChange24h.toFixed(2)}%`) :
        "unknown price change";
      
      // Create a factual summary with available data
      insight = `${cryptocurrency.name} (${cryptocurrency.symbol}) Summary:\n\n`;
      
      // Add market data
      insight += `Market Data: ${cryptocurrency.name} has a current price of $${cryptocurrency.price?.toFixed(2) || "unknown"} `;
      insight += `with ${priceChangeFormatted} in the last 24 hours. `;
      insight += `It has a ${marketCapFormatted} market capitalization`;
      if (cryptocurrency.rank) {
        insight += ` and ranks #${cryptocurrency.rank} by market cap.`;
      } else {
        insight += `.`;
      }
      
      // Add blockchain metrics if available
      let hasMetrics = false;
      let metricsInsight = "\n\nBlockchain Metrics: ";
      
      if (metrics.activeAddresses) {
        metricsInsight += `${metrics.activeAddresses.toLocaleString()} active addresses. `;
        hasMetrics = true;
      }
      
      if (metrics.transactionsPerSecond) {
        metricsInsight += `Processing ${metrics.transactionsPerSecond.toFixed(2)} transactions per second. `;
        hasMetrics = true;
      }
      
      if (metrics.totalTransactions) {
        metricsInsight += `Total of ${metrics.totalTransactions.toLocaleString()} transactions recorded. `;
        hasMetrics = true;
      }
      
      if (metrics.hashrate) {
        metricsInsight += `Network hashrate: ${metrics.hashrate}. `;
        hasMetrics = true;
      }
      
      if (hasMetrics) {
        insight += metricsInsight;
      } else {
        insight += "\n\nBlockchain Metrics: No on-chain metrics are currently available for this cryptocurrency.";
      }
      
      insight += "\n\nNote: This is a factual summary based on available data. For advanced analysis, please check back later.";
    }

    // Store the insight in the database
    const aiInsight: InsertAiInsight = {
      cryptocurrencyId: cryptocurrency.id,
      content: insight,
      confidence
    };

    await storage.createAiInsight(aiInsight);
    return insight;
  } catch (error) {
    console.error(`Error generating AI insights for ${cryptocurrency.name}:`, error);
    
    // Create a fallback insight
    const fallbackInsight = `${cryptocurrency.name} (${cryptocurrency.symbol}) is currently ranked #${cryptocurrency.rank || 'N/A'} with a price of $${cryptocurrency.price || 'unknown'} and market cap of $${cryptocurrency.marketCap ? (cryptocurrency.marketCap / 1e9).toFixed(2) + 'B' : 'unknown'}. Network metrics show standard on-chain activity. Monitor for changes in transaction volume and active addresses.`;
    
    // Store the fallback insight
    const aiInsight: InsertAiInsight = {
      cryptocurrencyId: cryptocurrency.id,
      content: fallbackInsight,
      confidence: 0.3 // Low confidence for fallback
    };
    
    await storage.createAiInsight(aiInsight);
    return fallbackInsight;
  }
}
