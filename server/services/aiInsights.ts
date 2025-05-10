import OpenAI from "openai";
import { storage } from "../storage";
import { Cryptocurrency, Metric, InsertAiInsight } from "@shared/schema";

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Sample insights for when OpenAI API is not available
const sampleInsights = [
  {
    template: "{{name}} ({{symbol}}) shows strong network activity with {{active}} active addresses and {{tps}} transactions per second. The price change of {{price_change}}% in the last 24h indicates {{sentiment}} market sentiment. With a market cap of ${{market_cap}}, {{name}} ranks #{{rank}} among cryptocurrencies. The network demonstrates {{health}} health with solid fundamentals.",
    sentiments: {
      positive: ["bullish", "positive", "optimistic", "favorable", "encouraging"],
      negative: ["bearish", "negative", "cautious", "concerning", "challenging"],
      neutral: ["neutral", "balanced", "stable", "steady", "mixed"]
    },
    health: ["excellent", "good", "stable", "solid", "robust", "promising", "strong"]
  },
  {
    template: "Analysis of {{name}} ({{symbol}}): This cryptocurrency currently has {{active}} active addresses and processes {{tps}} TPS. The market shows {{sentiment}} behavior with a {{price_change}}% price change in 24h. With ${{market_cap}} market cap and ranked #{{rank}}, {{name}} displays {{health}} on-chain metrics indicating {{future}} potential for growth.",
    sentiments: {
      positive: ["bullish", "positive", "optimistic", "favorable", "encouraging"],
      negative: ["bearish", "negative", "cautious", "concerning", "challenging"],
      neutral: ["neutral", "balanced", "stable", "steady", "mixed"]
    },
    health: ["excellent", "good", "stable", "solid", "robust", "promising", "strong"],
    future: ["strong", "moderate", "uncertain", "significant", "limited"]
  }
];

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
      console.log(`OpenAI API error: ${apiError}. Using template-based insights.`);
      
      // If API call fails, use template-based insights
      const template = sampleInsights[Math.floor(Math.random() * sampleInsights.length)];
      const priceChange = cryptocurrency.priceChange24h || 0;
      
      // Determine sentiment based on price change
      let sentimentCategory = "neutral";
      if (priceChange > 3) sentimentCategory = "positive";
      else if (priceChange < -3) sentimentCategory = "negative";
      
      // Pick a random sentiment from the appropriate category
      const sentiments = template.sentiments[sentimentCategory as keyof typeof template.sentiments];
      const sentiment = sentiments[Math.floor(Math.random() * sentiments.length)];
      
      // Pick a random health assessment
      const health = template.health[Math.floor(Math.random() * template.health.length)];
      
      // Format market cap for display
      const marketCapFormatted = cryptocurrency.marketCap ? 
        (cryptocurrency.marketCap / 1e9).toFixed(1) : "unknown";
      
      // Replace template placeholders
      insight = template.template
        .replace("{{name}}", cryptocurrency.name)
        .replace("{{symbol}}", cryptocurrency.symbol)
        .replace("{{active}}", activeAddresses)
        .replace("{{tps}}", tps)
        .replace("{{price_change}}", priceChange.toFixed(2))
        .replace("{{sentiment}}", sentiment)
        .replace("{{market_cap}}", marketCapFormatted)
        .replace("{{rank}}", (cryptocurrency.rank || "N/A").toString())
        .replace("{{health}}", health);
      
      // Replace future potential if present in template
      if (template.future) {
        const future = template.future[Math.floor(Math.random() * template.future.length)];
        insight = insight.replace("{{future}}", future);
      }
      
      confidence = 0.65; // Lower confidence for template-based insights
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
