import { Mistral } from "@mistralai/mistralai";
import { type Ingredient } from "@shared/schema";

const mistral = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY || ""
});

interface ParsedRecipe {
  name: string;
  description: string;
  prepTime: number;
  cookTime: number;
  difficulty: "easy" | "medium" | "hard";
  servings: number;
  ingredients: Ingredient[];
  instructions: string;
  dietaryTags: string[];
}

export async function parseRecipeText(recipeText: string): Promise<ParsedRecipe> {
  try {
    console.log('Parsing recipe text:', recipeText.substring(0, 100) + '...');

    const prompt = `Parse the following recipe text and extract structured information. Return a JSON object with the exact structure shown below. If information is missing, use reasonable defaults.

Recipe text:
${recipeText}

Required JSON structure:
{
  "name": "Recipe Name",
  "description": "Brief description of the dish",
  "prepTime": 15,
  "cookTime": 30,
  "difficulty": "easy",
  "servings": 4,
  "ingredients": [
    {"name": "ingredient name", "quantity": "1", "unit": "cup"},
    {"name": "another ingredient", "quantity": "2", "unit": "tbsp"}
  ],
  "instructions": "Step-by-step cooking instructions separated by newlines",
  "dietaryTags": ["vegetarian", "gluten-free"]
}

Guidelines:
- Extract prep time and cook time as numbers (minutes only)
- Difficulty should be "easy", "medium", or "hard" based on complexity
- Parse ingredients carefully, separating quantity, unit, and name
- Clean up instructions to be clear step-by-step format
- Identify dietary tags like vegetarian, vegan, gluten-free, dairy-free, keto, low-carb, healthy, protein
- If servings not specified, default to 4
- If times not specified, estimate reasonable values

Return only valid JSON.`;

    console.log('Calling Mistral API...');
    const response = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: [
        {
          role: "system",
          content: "You are a recipe parsing expert. Extract structured recipe data from text and return valid JSON only."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.1
    });

    console.log('Mistral API response object keys:', Object.keys(response));
    console.log('Response choices:', response.choices);
    console.log('First choice:', response.choices?.[0]);
    console.log('Message:', response.choices?.[0]?.message);
    console.log('Message content:', response.choices?.[0]?.message?.content);
    console.log('Message content type:', typeof response.choices?.[0]?.message?.content);

    let messageContent = "";
    const content = response.choices?.[0]?.message?.content;
    
    if (typeof content === 'string') {
      messageContent = content;
    } else if (Array.isArray(content)) {
      // Handle ContentChunk[] format
      messageContent = content.map(chunk => {
        if ('text' in chunk) return chunk.text;
        return '';
      }).join('');
    }
    
    console.log('Final message content:', messageContent);
    
    let parsedData: any = {};
    if (messageContent) {
      try {
        parsedData = JSON.parse(messageContent);
        console.log('Successfully parsed JSON:', parsedData);
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        console.log('Raw content that failed to parse:', messageContent);
        // Try to extract JSON from the response if it's wrapped in text
        const jsonMatch = messageContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsedData = JSON.parse(jsonMatch[0]);
            console.log('Successfully parsed extracted JSON:', parsedData);
          } catch (secondError) {
            console.error('Second JSON parse failed:', secondError);
          }
        }
      }
    } else {
      console.log('No message content found in response');
    }
    
    // Validate and clean the parsed data
    const result: ParsedRecipe = {
      name: (parsedData as any)?.name || "Unnamed Recipe",
      description: (parsedData as any)?.description || "",
      prepTime: parseInt((parsedData as any)?.prepTime) || 10,
      cookTime: parseInt((parsedData as any)?.cookTime) || 20,
      difficulty: ["easy", "medium", "hard"].includes((parsedData as any)?.difficulty) 
        ? (parsedData as any).difficulty : "easy",
      servings: parseInt((parsedData as any)?.servings) || 4,
      ingredients: Array.isArray((parsedData as any)?.ingredients) 
        ? (parsedData as any).ingredients.map((ing: any) => ({
            name: String(ing?.name || ""),
            quantity: String(ing?.quantity || "1"),
            unit: String(ing?.unit || "")
          }))
        : [],
      instructions: String((parsedData as any)?.instructions || ""),
      dietaryTags: Array.isArray((parsedData as any)?.dietaryTags) 
        ? (parsedData as any).dietaryTags.filter((tag: any) => typeof tag === "string")
        : []
    };
    
    console.log('Final parsed result:', result);
    return result;
  } catch (error) {
    console.error("Recipe parsing error:", error);
    throw new Error("Failed to parse recipe. Please check the format and try again.");
  }
}