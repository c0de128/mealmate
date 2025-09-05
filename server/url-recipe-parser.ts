import { parseRecipeText } from './recipe-parser';
import { ExternalAPIError } from './error-handler';
import { logger, performanceLogger, errorLogger } from './logger';
import * as cheerio from 'cheerio';

interface RecipeMetadata {
  url: string;
  title?: string;
  description?: string;
  author?: string;
  siteName?: string;
  image?: string;
  publishedDate?: string;
}

interface URLParseResult {
  recipe: any;
  metadata: RecipeMetadata;
  extractedText: string;
}

// Common recipe selectors for different recipe websites
const RECIPE_SELECTORS = {
  // JSON-LD structured data (most reliable)
  jsonLd: 'script[type="application/ld+json"]',
  
  // Common recipe microdata selectors
  microdata: {
    name: '[itemprop="name"]',
    description: '[itemprop="description"]',
    prepTime: '[itemprop="prepTime"]',
    cookTime: '[itemprop="cookTime"]',
    ingredients: '[itemprop="recipeIngredient"]',
    instructions: '[itemprop="recipeInstructions"]',
    servings: '[itemprop="recipeYield"], [itemprop="servings"]',
    author: '[itemprop="author"]'
  },
  
  // Common CSS selectors used by recipe sites
  common: {
    title: 'h1, .recipe-title, .entry-title, .recipe-name',
    ingredients: '.recipe-ingredient, .ingredient, .ingredients li, .recipe-ingredients li',
    instructions: '.recipe-instruction, .instruction, .instructions li, .recipe-instructions li, .recipe-directions li',
    description: '.recipe-description, .entry-content p:first-of-type, .summary',
    prepTime: '.prep-time, .prepTime, [class*="prep"]',
    cookTime: '.cook-time, .cookTime, [class*="cook"]',
    servings: '.servings, .yield, .recipe-yield'
  }
};

export async function parseRecipeFromURL(url: string): Promise<URLParseResult> {
  const startTime = Date.now();
  logger.info('Starting recipe URL import', { url });

  try {
    // Validate URL
    const parsedUrl = new URL(url);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new ExternalAPIError('URL_PARSER', 'Only HTTP and HTTPS URLs are supported', 400);
    }

    // Fetch webpage content
    const html = await fetchWebpage(url);
    const $ = cheerio.load(html);
    
    // Extract metadata
    const metadata = extractMetadata($, url);
    
    // Try different extraction methods in order of reliability
    let extractedText = '';
    let recipe = null;

    // 1. Try JSON-LD structured data first (most reliable)
    try {
      recipe = extractFromJsonLD($);
      if (recipe) {
        extractedText = 'Extracted from JSON-LD structured data';
        logger.info('Recipe extracted using JSON-LD', { url });
      }
    } catch (error) {
      logger.debug('JSON-LD extraction failed', { url, error: (error as Error).message });
    }

    // 2. Try microdata if JSON-LD failed
    if (!recipe) {
      try {
        const microdataResult = extractFromMicrodata($);
        if (microdataResult.recipe) {
          recipe = microdataResult.recipe;
          extractedText = microdataResult.text;
          logger.info('Recipe extracted using microdata', { url });
        }
      } catch (error) {
        logger.debug('Microdata extraction failed', { url, error: (error as Error).message });
      }
    }

    // 3. Try common selectors if previous methods failed
    if (!recipe) {
      const commonResult = extractFromCommonSelectors($);
      if (commonResult.text.length > 100) {
        extractedText = commonResult.text;
        logger.info('Recipe extracted using common selectors', { url, textLength: extractedText.length });
      }
    }

    // If we have extracted text but no structured recipe, parse with AI
    if (!recipe && extractedText) {
      recipe = await parseRecipeText(extractedText);
    }

    // If still no recipe, try to extract all text and parse
    if (!recipe) {
      const fallbackText = extractFallbackText($);
      if (fallbackText.length > 50) {
        extractedText = fallbackText;
        recipe = await parseRecipeText(fallbackText);
        logger.info('Recipe extracted using fallback text parsing', { url, textLength: fallbackText.length });
      }
    }

    if (!recipe) {
      throw new ExternalAPIError('URL_PARSER', 'Could not extract recipe data from the provided URL', 422);
    }

    // Enhance recipe with metadata if available
    if (metadata.title && !recipe.name) {
      recipe.name = metadata.title;
    }
    if (metadata.description && !recipe.description) {
      recipe.description = metadata.description;
    }

    const responseTime = Date.now() - startTime;
    performanceLogger.info('Recipe URL parsing completed', {
      url,
      responseTime,
      extractedTextLength: extractedText.length,
      method: recipe ? 'structured' : 'ai_parsing'
    });

    return {
      recipe,
      metadata,
      extractedText: extractedText.substring(0, 1000) // Limit for logging
    };

  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    if (error instanceof ExternalAPIError) {
      throw error;
    }

    errorLogger.error('Recipe URL parsing failed', {
      url,
      error: (error as Error).message,
      stack: (error as Error).stack,
      responseTime
    });

    throw new ExternalAPIError('URL_PARSER', 
      `Failed to parse recipe from URL: ${(error as Error).message}`, 
      500
    );
  }
}

async function fetchWebpage(url: string): Promise<string> {
  logger.debug('Fetching webpage content', { url });
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MealMate Recipe Bot; +https://github.com/mealmate)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new ExternalAPIError('URL_PARSER', 
        `Failed to fetch URL: ${response.status} ${response.statusText}`, 
        response.status
      );
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      throw new ExternalAPIError('URL_PARSER', 
        'URL does not return HTML content', 
        400
      );
    }

    const html = await response.text();
    logger.debug('Webpage fetched successfully', { 
      url, 
      contentLength: html.length,
      contentType 
    });

    return html;

  } catch (error) {
    if (error instanceof ExternalAPIError) {
      throw error;
    }

    if ((error as Error).name === 'AbortError') {
      throw new ExternalAPIError('URL_PARSER', 'Request timeout - webpage took too long to load', 504);
    }

    throw new ExternalAPIError('URL_PARSER', 
      `Network error: ${(error as Error).message}`, 
      503
    );
  }
}

function extractMetadata($: cheerio.CheerioAPI, url: string): RecipeMetadata {
  return {
    url,
    title: $('meta[property="og:title"]').attr('content') || 
           $('meta[name="twitter:title"]').attr('content') ||
           $('title').text() || 
           undefined,
    description: $('meta[property="og:description"]').attr('content') ||
                $('meta[name="twitter:description"]').attr('content') ||
                $('meta[name="description"]').attr('content') ||
                undefined,
    author: $('meta[name="author"]').attr('content') || undefined,
    siteName: $('meta[property="og:site_name"]').attr('content') || undefined,
    image: $('meta[property="og:image"]').attr('content') ||
           $('meta[name="twitter:image"]').attr('content') ||
           undefined,
    publishedDate: $('meta[property="article:published_time"]').attr('content') ||
                  $('meta[name="date"]').attr('content') ||
                  undefined
  };
}

function extractFromJsonLD($: cheerio.CheerioAPI): any {
  const scripts = $(RECIPE_SELECTORS.jsonLd);
  
  for (let i = 0; i < scripts.length; i++) {
    const script = scripts.eq(i);
    const content = script.html();
    
    if (!content) continue;
    
    try {
      const data = JSON.parse(content);
      const recipes = Array.isArray(data) ? data : [data];
      
      for (const item of recipes) {
        if (item['@type'] === 'Recipe' || 
            (Array.isArray(item['@type']) && item['@type'].includes('Recipe'))) {
          
          return {
            name: item.name || '',
            description: item.description || '',
            prepTime: parseTime(item.prepTime) || 10,
            cookTime: parseTime(item.cookTime) || 20,
            difficulty: 'medium', // JSON-LD rarely includes difficulty
            servings: parseServings(item.recipeYield || item.yield) || 4,
            ingredients: parseIngredients(item.recipeIngredient || []),
            instructions: parseInstructions(item.recipeInstructions || []),
            dietaryTags: parseDietaryInfo(item)
          };
        }
      }
    } catch (error) {
      logger.debug('Failed to parse JSON-LD script', { error: (error as Error).message });
      continue;
    }
  }
  
  return null;
}

function extractFromMicrodata($: cheerio.CheerioAPI): { recipe: any; text: string } {
  const elements = $('[itemtype*="Recipe"]');
  if (elements.length === 0) {
    return { recipe: null, text: '' };
  }

  const recipeElement = elements.first();
  const extractedParts: string[] = [];

  const name = recipeElement.find(RECIPE_SELECTORS.microdata.name).first().text().trim();
  const description = recipeElement.find(RECIPE_SELECTORS.microdata.description).first().text().trim();
  
  if (name) extractedParts.push(`Recipe: ${name}`);
  if (description) extractedParts.push(`Description: ${description}`);

  // Extract ingredients
  const ingredients: string[] = [];
  recipeElement.find(RECIPE_SELECTORS.microdata.ingredients).each((_, el) => {
    const ingredient = $(el).text().trim();
    if (ingredient) ingredients.push(ingredient);
  });
  
  if (ingredients.length > 0) {
    extractedParts.push(`Ingredients: ${ingredients.join(', ')}`);
  }

  // Extract instructions
  const instructions: string[] = [];
  recipeElement.find(RECIPE_SELECTORS.microdata.instructions).each((_, el) => {
    const instruction = $(el).text().trim();
    if (instruction) instructions.push(instruction);
  });
  
  if (instructions.length > 0) {
    extractedParts.push(`Instructions: ${instructions.join('. ')}`);
  }

  const text = extractedParts.join('\n\n');
  
  return {
    recipe: text.length > 100 ? null : null, // Let AI parse the text
    text
  };
}

function extractFromCommonSelectors($: cheerio.CheerioAPI): { text: string } {
  const extractedParts: string[] = [];

  // Extract title
  const title = $(RECIPE_SELECTORS.common.title).first().text().trim();
  if (title) extractedParts.push(`Recipe: ${title}`);

  // Extract description
  const description = $(RECIPE_SELECTORS.common.description).first().text().trim();
  if (description) extractedParts.push(`Description: ${description}`);

  // Extract ingredients
  const ingredients: string[] = [];
  $(RECIPE_SELECTORS.common.ingredients).each((_, el) => {
    const ingredient = $(el).text().trim();
    if (ingredient && ingredient.length > 2) ingredients.push(ingredient);
  });
  
  if (ingredients.length > 0) {
    extractedParts.push(`Ingredients:\n${ingredients.map(ing => `- ${ing}`).join('\n')}`);
  }

  // Extract instructions
  const instructions: string[] = [];
  $(RECIPE_SELECTORS.common.instructions).each((_, el) => {
    const instruction = $(el).text().trim();
    if (instruction && instruction.length > 10) instructions.push(instruction);
  });
  
  if (instructions.length > 0) {
    extractedParts.push(`Instructions:\n${instructions.map((inst, i) => `${i + 1}. ${inst}`).join('\n')}`);
  }

  return { text: extractedParts.join('\n\n') };
}

function extractFallbackText($: cheerio.CheerioAPI): string {
  // Remove unwanted elements
  $('script, style, nav, header, footer, aside, .ad, .advertisement, .social, .comments').remove();
  
  // Try to find main content area
  const mainContent = $('main, .main, .content, .recipe, .entry-content, article').first();
  
  if (mainContent.length > 0) {
    return mainContent.text().replace(/\s+/g, ' ').trim();
  }
  
  // Fallback to body content
  return $('body').text().replace(/\s+/g, ' ').trim().substring(0, 5000);
}

// Utility functions for parsing structured data
function parseTime(timeStr: string | undefined): number {
  if (!timeStr) return 0;
  
  // Handle ISO 8601 duration format (PT30M)
  const isoDuration = timeStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (isoDuration) {
    const hours = parseInt(isoDuration[1] || '0');
    const minutes = parseInt(isoDuration[2] || '0');
    return hours * 60 + minutes;
  }
  
  // Handle simple number formats
  const numberMatch = timeStr.match(/(\d+)/);
  return numberMatch ? parseInt(numberMatch[1]) : 0;
}

function parseServings(servingsStr: string | number | undefined): number {
  if (typeof servingsStr === 'number') return servingsStr;
  if (!servingsStr) return 4;
  
  const match = String(servingsStr).match(/(\d+)/);
  return match ? parseInt(match[1]) : 4;
}

function parseIngredients(ingredients: any[]): Array<{ name: string; quantity: string; unit: string }> {
  return ingredients.map(ing => {
    if (typeof ing === 'string') {
      return parseIngredientString(ing);
    }
    return {
      name: ing.name || String(ing),
      quantity: ing.quantity || '1',
      unit: ing.unit || ''
    };
  });
}

function parseIngredientString(ingredient: string): { name: string; quantity: string; unit: string } {
  // Basic parsing of ingredient strings like "2 cups flour" or "1 lb ground beef"
  const parts = ingredient.trim().split(/\s+/);
  
  if (parts.length >= 3) {
    const quantity = parts[0];
    const unit = parts[1];
    const name = parts.slice(2).join(' ');
    
    return { name, quantity, unit };
  } else if (parts.length === 2) {
    const quantity = parts[0];
    const name = parts[1];
    
    return { name, quantity, unit: '' };
  }
  
  return { name: ingredient, quantity: '1', unit: '' };
}

function parseInstructions(instructions: any[]): string {
  return instructions.map((inst, index) => {
    if (typeof inst === 'string') {
      return `${index + 1}. ${inst}`;
    }
    if (inst.text) {
      return `${index + 1}. ${inst.text}`;
    }
    return `${index + 1}. ${String(inst)}`;
  }).join('\n');
}

function parseDietaryInfo(recipe: any): string[] {
  const tags: string[] = [];
  
  if (recipe.keywords) {
    const keywords = Array.isArray(recipe.keywords) ? recipe.keywords : [recipe.keywords];
    keywords.forEach((keyword: string) => {
      const lower = keyword.toLowerCase();
      if (lower.includes('vegetarian')) tags.push('vegetarian');
      if (lower.includes('vegan')) tags.push('vegan');
      if (lower.includes('gluten-free')) tags.push('gluten-free');
      if (lower.includes('dairy-free')) tags.push('dairy-free');
      if (lower.includes('keto')) tags.push('keto');
      if (lower.includes('low-carb')) tags.push('low-carb');
    });
  }
  
  if (recipe.suitableForDiet) {
    const diets = Array.isArray(recipe.suitableForDiet) ? recipe.suitableForDiet : [recipe.suitableForDiet];
    diets.forEach((diet: string) => {
      const lower = diet.toLowerCase();
      if (lower.includes('vegetarian')) tags.push('vegetarian');
      if (lower.includes('vegan')) tags.push('vegan');
      if (lower.includes('glutenfree')) tags.push('gluten-free');
    });
  }
  
  return [...new Set(tags)]; // Remove duplicates
}