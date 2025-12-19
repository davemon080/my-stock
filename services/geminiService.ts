
import { GoogleGenAI, Type } from "@google/genai";
import { Product } from "../types.ts";

/**
 * Uses Gemini AI to analyze inventory data and provide actionable insights for store management.
 */
export const getInventoryInsights = async (products: Product[]) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const inventoryContext = products.map(p => 
    `Product: ${p.name}, SKU: ${p.sku}, Qty: ${p.quantity}, Min Threshold: ${p.minThreshold}, Price: ₦${p.price}`
  ).join('\n');

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analyze the following store inventory and provide a concise summary (insight) and 3-5 specific actionable recommendations for the manager. Focus on stock-outs, low inventory, and potential sales opportunities. Note that SKUs are formatted as FirstLetter+LastLetter+ID.\n\nCurrent Inventory Data:\n${inventoryContext}`,
      config: {
        systemInstruction: "You are a senior inventory management AI. You analyze product stock levels against thresholds and market prices to provide smart business advice. Return your findings strictly in JSON format.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            insight: {
              type: Type.STRING,
              description: "A summary sentence about the overall inventory health.",
            },
            recommendations: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Specific actionable steps for the store manager.",
            },
          },
          required: ["insight", "recommendations"],
          propertyOrdering: ["insight", "recommendations"],
        },
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("Empty response from Gemini API");
    }

    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini Inventory Insight Error:", error);
    return {
      insight: "Automated analysis is currently unavailable. Please review low-stock alerts manually.",
      recommendations: [
        "Check all products marked with Red/Amber alerts.",
        "Verify physical stock against digital records.",
        "Update minimum threshold levels based on recent sales trends."
      ]
    };
  }
};
