import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function performOCR(imageBase64: string, mimeType: string = "image/jpeg", correctMistakes: boolean = false): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            {
              text: `You are an expert OCR system specialized in student handwritten notes. Convert the handwritten text in this image into clear, formatted, typed text. 
Preserve the structure (bullet points, headings, equations) if present. 
For mathematical equations, symbols, and signs, use standard LaTeX syntax with single dollar signs for inline math (e.g., $E=mc^2$) and double dollar signs for block math (e.g., $$x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}$$). Ensure all symbols (Greek letters, operators, fractions) are correctly transcribed.
If you detect a table, represent it STRICTLY using standard Markdown table syntax (| Header | Header |\n| --- | --- |\n| Cell | Cell |). Ensure the header row is followed directly by the separator line. 
${correctMistakes ? "Acting as a teacher, please also fix any English grammar, spelling, and punctuation mistakes found in the handwritten text to provide a polished, academic version. If the user made a clear mistake in facts or logic that a teacher would notice, correct it subtly." : "Provide a verbatim transcription of the handwriting, preserving all text exactly as written."}
Return ONLY the transcribed text in Markdown format.`,
            },
            {
              inlineData: {
                data: imageBase64.split(",")[1] || imageBase64,
                mimeType: mimeType,
              },
            },
          ],
        },
      ],
    });

    return response.text || "";
  } catch (error) {
    console.error("OCR Error:", error);
    throw new Error("Failed to process handwriting. Please try again.");
  }
}
