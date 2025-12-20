
import { GoogleGenAI, Type } from "@google/genai";
import { Product, Transaction, InventoryStats } from "../types.ts";

/**
 * Uses Gemini 3 Flash to analyze store data. 
 * Flash is used here for maximum reliability and speed on free/standard API tiers.
 */
export const getStoreStrategy = async (
  products: Product[], 
  transactions: Transaction[], 
  stats: InventoryStats,
  branchName: string
) => {
  // Ensure the API Key is available from the environment
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing. Please ensure your environment is configured.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  // Format product data into a simple string for the AI to digest
  const productDataSummary = products.map(p => {
    const profit = p.price - p.costPrice;
    const margin = p.price > 0 ? ((profit / p.price) * 100).toFixed(0) : "0";
    return `${p.name}: [Stock: ${p.quantity}, Profit: ₦${profit}, Margin: ${margin}%]`;
  }).join('\n');

  const salesSummary = transactions.slice(0, 5).map(t => 
    `Sale: ₦${t.total} (${new Date(t.timestamp).toLocaleDateString()})`
  ).join(', ');

  const prompt = `
    I run a supermarket called "${branchName}". I need your advice to grow my business.
    Please talk to me like a helpful friend using simple English. No big business words.

    STORE DATA:
    - Products I have:
    ${productDataSummary || "No items in stock yet."}
    
    - Recent Sales:
    ${salesSummary || "No sales yet."}
    
    - Finances:
    Total Stock Value: ₦${stats.totalValue}
    Money spent on items: ₦${stats.totalCostValue}

    ADVICE NEEDED:
    1. Summary: How is my store doing overall?
    2. Restock: Which items should I buy more of right now?
    3. Removal: Which items are not selling well and should be removed?
    4. Growth: 3 simple things to do today to get more customers.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        systemInstruction: `You are a Supermarket Growth Coach. 
        You use simple English and provide actionable advice. 
        Always return your response as a clean JSON object.`,
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
    if (!text) throw new Error("The Advisor returned an empty message.");
    
    // Clean potential markdown formatting if the model adds it unexpectedly
    const cleanJson = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error("Gemini API Error Details:", error);
    throw error; // Re-throw so the UI can show the correct error state
  }
};
