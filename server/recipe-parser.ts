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
      model: "mistral-large-latest",
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
      responseFormat: { type: "json_object" },
      temperature: 0.1
    });

    console.log('Mistral API response:', response);
    console.log('Response choices:', response.choices);
    console.log('Message content type:', typeof response.choices[0].message.content);
    console.log('Message content:', response.choices[0].message.content);

    const messageContent = typeof response.choices[0].message.content === 'string' 
      ? response.choices[0].message.content 
      : "";
    
    console.log('Extracted message content:', messageContent);
    const parsedData = JSON.parse(messageContent || "{}");
    console.log('Parsed JSON data:', parsedData);
    
    // Validate and clean the parsed data
    return {
      name: parsedData.name || "Unnamed Recipe",
      description: parsedData.description || "",
      prepTime: parseInt(parsedData.prepTime) || 10,
      cookTime: parseInt(parsedData.cookTime) || 20,
      difficulty: ["easy", "medium", "hard"].includes(parsedData.difficulty) 
        ? parsedData.difficulty : "easy",
      servings: parseInt(parsedData.servings) || 4,
      ingredients: Array.isArray(parsedData.ingredients) 
        ? parsedData.ingredients.map((ing: any) => ({
            name: String(ing.name || ""),
            quantity: String(ing.quantity || "1"),
            unit: String(ing.unit || "")
          }))
        : [],
      instructions: String(parsedData.instructions || ""),
      dietaryTags: Array.isArray(parsedData.dietaryTags) 
        ? parsedData.dietaryTags.filter((tag: any) => typeof tag === "string")
        : []
    };
  } catch (error) {
    console.error("Recipe parsing error:", error);
    throw new Error("Failed to parse recipe. Please check the format and try again.");
  }
}