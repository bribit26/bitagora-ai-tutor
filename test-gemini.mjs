import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function test() {
  try {
    console.log("Testing key:", process.env.GEMINI_API_KEY);
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-pro',
      contents: 'Say hello'
    });
    console.log("Success:", response.text);
  } catch (e) {
    console.error("Error:", e);
  }
}

test();
