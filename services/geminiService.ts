
import { GoogleGenAI, Type } from "@google/genai";
import { Product } from "../types";

export const getInventoryInsights = async (products: Product[]) => {
  // Use named parameter and assume process.env.API_KEY is provided
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const inventoryContext = products.map(p => ({
    name: p.name,
    category: p.category,
    qty: p.quantity,
    min: p.minThreshold,
    expiry: p.expiryDate
  }));

  const prompt = `
    Analyze this supermarket inventory data and provide actionable insights.
    Data: ${JSON.stringify(inventoryContext)}
    
    Identify:
    1. Critical low stock items that need immediate reordering.
    2. Items nearing expiry that should be discounted or promoted.
    3. General suggestions for inventory optimization.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            insight: { type: Type.STRING, description: "A high level summary of the current inventory state." },
            recommendations: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "A list of specific bulleted recommendations."
            }
          },
          required: ["insight", "recommendations"]
        }
      }
    });

    // Access .text property directly from GenerateContentResponse
    const jsonStr = response.text?.trim() || "{}";
    return JSON.parse(jsonStr);
  } catch (error) {
    console.error("Gemini Error:", error);
    return {
      insight: "Failed to connect to AI. Please try again later.",
      recommendations: ["Check manual stock levels", "Monitor expiry dates manually"]
    };
  }
};
