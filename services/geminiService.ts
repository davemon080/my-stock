
import { GoogleGenAI, Type } from "@google/genai";
import { Product, Transaction, InventoryStats } from "../types.ts";

/**
 * Uses Gemini AI to analyze the store and give simple, actionable growth advice.
 */
export const getStoreStrategy = async (
  products: Product[], 
  transactions: Transaction[], 
  stats: InventoryStats,
  branchName: string
) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Create a simple list of products with profit margins for the AI to study
  const productPerformance = products.map(p => {
    const profit = p.price - p.costPrice;
    const margin = ((profit / (p.price || 1)) * 100).toFixed(1);
    return `${p.name}: Stock=${p.quantity}, Price=₦${p.price}, Profit/Item=₦${profit} (${margin}% margin)`;
  }).join('\n');

  // Summarize recent sales trends
  const salesTrend = transactions.slice(0, 15).map(t => 
    `${new Date(t.timestamp).toLocaleDateString()}: ₦${t.total} total`
  ).join(', ');

  const prompt = `
    Study the current state of my supermarket branch "${branchName}" and give me advice in very simple, easy-to-understand English. No complex business words.

    HERE IS MY STORE DATA:
    
    1. PRODUCT LIST & PROFITABILITY:
    ${productPerformance}
    
    2. RECENT SALES TRENDS:
    ${salesTrend}
    
    3. OVERALL STATS:
    - Total items in list: ${stats.totalItems}
    - Money tied up in stock: ₦${stats.totalCostValue}
    - Potential total sales value: ₦${stats.totalValue}

    BASED ON THIS, PLEASE PROVIDE:
    - A very simple summary of how the store is doing.
    - RESTOCK ADVICE: Which specific items should I buy more of, and how many?
    - REMOVAL ADVICE: Which items are not making enough profit or selling too slowly and should be removed?
    - GROWTH TIPS: 3 simple things I can do to make more money or attract more customers.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: `You are a friendly, expert Supermarket Success Coach. 
        Your goal is to help the store owner grow their business. 
        USE SIMPLE GRAMMAR. Speak like a helpful neighbor who is also a genius at retail. 
        Avoid words like 'optimization', 'utilization', or 'synergy'. 
        Instead of 'inventory turnover', say 'how fast things sell'.
        Return your answer in a clear JSON format.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: "A simple summary of store health.",
            },
            restockAdvice: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Clear list of what to buy more of.",
            },
            removalAdvice: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "List of items to consider removing or stopping.",
            },
            growthTips: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Simple steps to grow the business.",
            },
          },
          required: ["summary", "restockAdvice", "removalAdvice", "growthTips"],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("AI did not return any text.");

    return JSON.parse(text);
  } catch (error) {
    console.error("AI Strategic Analysis Error:", error);
    return {
      summary: "I'm having a little trouble connecting to your live data, but I can still give you general store tips!",
      restockAdvice: [
        "Check your 5 fastest-selling items and make sure you have enough for 2 weeks.",
        "If an item is below 10 units, consider ordering more now."
      ],
      removalAdvice: [
        "Look for items that haven't sold a single unit in the last 30 days.",
        "Check for any items that are past their expiry date."
      ],
      growthTips: [
        "Keep the most popular items at the back of the store so customers walk past everything else.",
        "Offer a small discount if people buy two of the same item.",
        "Make sure the store entrance is very bright and welcoming."
      ]
    };
  }
};
