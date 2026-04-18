import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn("GEMINI_API_KEY is missing. AI features will be disabled.");
}

export const genAI = new GoogleGenAI({ apiKey: apiKey || "" });

/**
 * Analyzes a frame to detect road hazards.
 * Note: Input image should be blurred locally before sending to Gemini.
 */
export async function detectHazard(base64Image: string) {
  if (!apiKey) throw new Error("Gemini API Key is not configured.");

  const response = await genAI.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Image,
          },
        },
        {
          text: `You are a road safety expert. Analyze this image captured from a moving vehicle. 
          Identify if there is a "pothole", "debris", or "speed_bump". 
          Return ONLY one of these strings, or "none" if no hazard is detected.
          Ignore faces or license plates if they appear blurred.`,
        },
      ],
    },
    config: {
      temperature: 0.1,
    },
  });

  const result = response.text.trim().toLowerCase();
  return ["pothole", "debris", "speed_bump"].includes(result) ? result : "none";
}
