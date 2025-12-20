
import { GoogleGenAI, Type } from "@google/genai";
import { Product, Transaction, InventoryStats } from "../types.ts";

/**
 * Uses Gemini 3 Pro to analyze store data and provide simple growth strategies.
 */
export const getStoreStrategy = async (
  products: Product[], 
  transactions: Transaction[], 
  stats: InventoryStats,
  branchName: string
) => {
  // Always initialize right before use as per security guidelines
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Prepare highly detailed context for the AI
  const productPerformance = products.map(p => {
    const profit = p.price - p.costPrice;
    const margin = p.price > 0 ? ((profit / p.price) * 100).toFixed(1) : "0";
    return `${p.name}: Stock=${p.quantity}, Cost=₦${p.costPrice}, Sell=₦${p.price}, Profit=₦${profit} (${margin}% margin)`;
  }).join('\n');

  const recentSales = transactions.slice(0, 10).map(t => 
    `${new Date(t.timestamp).toLocaleDateString()}: ₦${t.total} (${t.items.length} items)`
  ).join(', ');

  const prompt = `
    I am the owner of "${branchName}" supermarket. I need your help to grow my business.
    Use very simple, easy grammar. No "business school" talk. Just clear, friendly advice.

    MY STORE DATA:
    - Current Product List & Profits:
    ${productPerformance || "No products currently listed."}
    
    - Last 10 Sales:
    ${recentSales || "No recent sales found."}
    
    - Store Overview:
    Total items: ${stats.totalItems}
    Money I spent on stock (Capital): ₦${stats.totalCostValue}
    Potential total sales (Revenue): ₦${stats.totalValue}
    Profit if all sells: ₦${stats.totalValue - stats.totalCostValue}

    PLEASE PROVIDE ADVICE ON:
    1. SUMMARY: A quick check-up on how I'm doing.
    2. RESTOCK: Which items are running low but make good profit? How much more should I buy?
    3. REMOVAL: Which items are just sitting there, taking up space, or making no money?
    4. GROWTH: 3 simple, specific things I can do today to get more customers or sell more.
  `;

  // Use Gemini 3 Pro for its superior reasoning on business data
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: [{ parts: [{ text: prompt }] }],
    config: {
      systemInstruction: `You are a helpful, simple-speaking Business Growth Coach. 
      Your specialty is helping local supermarket owners grow.
      Rules:
      1. Use EXTREMELY SIMPLE grammar. Short sentences.
      2. No jargon like "optimization" or "KPIs".
      3. Be very specific about which products to buy or remove based on the data.
      4. Always return valid JSON.`,
      thinkingConfig: { thinkingBudget: 2000 }, // Allow the model to calculate before answering
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          restockAdvice: { type: Type.ARRAY, items: { type: Type.STRING } },
          removalAdvice: { type: Type.ARRAY, items: { type: Type.STRING } },
          growthTips: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["summary", "restockAdvice", "removalAdvice", "growthTips"],
      },
    },
  });

  const text = response.text;
  if (!text) throw new Error("Growth Advisor did not provide a response.");
  
  return JSON.parse(text);
};
