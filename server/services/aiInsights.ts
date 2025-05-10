import OpenAI from "openai";
import { storage } from "../storage";
import { Cryptocurrency, Metric, InsertAiInsight } from "@shared/schema";

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "demo-api-key" });

export async function getAiInsightsForCrypto(
  cryptocurrency: Cryptocurrency,
  metrics: Metric
): Promise<string> {
  try {
    // Create a prompt with the cryptocurrency data and metrics
    const prompt = `
      Please analyze the following cryptocurrency data and provide a concise insight:
      
      Cryptocurrency: ${cryptocurrency.name} (${cryptocurrency.symbol})
      Current Price: $${cryptocurrency.price}
      24h Price Change: ${cryptocurrency.priceChange24h}%
      Market Cap: $${cryptocurrency.marketCap}
      24h Volume: $${cryptocurrency.volume24h}
      Rank: ${cryptocurrency.rank}
      
      Blockchain Metrics:
      ${metrics.activeAddresses ? `Active Addresses: ${metrics.activeAddresses}` : ''}
      ${metrics.totalTransactions ? `Total Transactions: ${metrics.totalTransactions}` : ''}
      ${metrics.transactionsPerSecond ? `Transactions Per Second: ${metrics.transactionsPerSecond}` : ''}
      ${metrics.hashrate ? `Hash Rate: ${metrics.hashrate}` : ''}
      ${metrics.averageTransactionValue ? `Average Transaction Value: ${metrics.averageTransactionValue}` : ''}
      
      Additional Metrics: ${JSON.stringify(metrics.metrics)}
      
      Based on this data, provide a concise insight about the cryptocurrency's current state, 
      notable patterns, and potential developments. Focus on on-chain activity and network health.
      Keep the response under 200 words. Your response should be factual and based on the provided data.
    `;

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

    const insight = response.choices[0].message.content?.trim() || "";
    const confidence = 0.85; // Hardcoded confidence as this is just for demo purposes

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
    const fallbackInsight = `Analysis for ${cryptocurrency.name} could not be generated at this time due to technical issues. Please try again later.`;
    
    // Store the fallback insight
    const aiInsight: InsertAiInsight = {
      cryptocurrencyId: cryptocurrency.id,
      content: fallbackInsight,
      confidence: 0
    };
    
    await storage.createAiInsight(aiInsight);
    
    return fallbackInsight;
  }
}
