import { Request, Response } from 'express';
import { logger, performanceLogger } from './logger';
import { storage } from './storage';
import { NotFoundError, ValidationError, asyncHandler } from './error-handler';
import { z } from 'zod';

// Share link schema
const createShareLinkSchema = z.object({
  recipeId: z.string().min(1, 'Recipe ID is required'),
  expiresIn: z.number().optional().default(30), // days
  allowPublicAccess: z.boolean().optional().default(true)
});

// In-memory storage for share links (in production, use Redis or database)
interface ShareLink {
  id: string;
  recipeId: string;
  createdAt: Date;
  expiresAt: Date;
  allowPublicAccess: boolean;
  accessCount: number;
  lastAccessedAt: Date | null;
}

class ShareLinkStore {
  private links: Map<string, ShareLink> = new Map();
  private readonly maxLinks = 10000;

  generateShareId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  createShareLink(recipeId: string, expiresIn: number = 30, allowPublicAccess: boolean = true): ShareLink {
    const id = this.generateShareId();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresIn * 24 * 60 * 60 * 1000);

    const shareLink: ShareLink = {
      id,
      recipeId,
      createdAt: now,
      expiresAt,
      allowPublicAccess,
      accessCount: 0,
      lastAccessedAt: null
    };

    // Clean up old links if we're at the limit
    if (this.links.size >= this.maxLinks) {
      this.cleanupExpiredLinks();
    }

    this.links.set(id, shareLink);
    
    logger.info('Share link created', {
      shareId: id,
      recipeId,
      expiresAt: expiresAt.toISOString(),
      allowPublicAccess
    });

    return shareLink;
  }

  getShareLink(shareId: string): ShareLink | null {
    const link = this.links.get(shareId);
    
    if (!link) {
      return null;
    }

    // Check if expired
    if (new Date() > link.expiresAt) {
      this.links.delete(shareId);
      logger.info('Share link expired and removed', { shareId });
      return null;
    }

    // Update access tracking
    link.accessCount++;
    link.lastAccessedAt = new Date();

    logger.info('Share link accessed', {
      shareId,
      recipeId: link.recipeId,
      accessCount: link.accessCount
    });

    return link;
  }

  revokeShareLink(shareId: string): boolean {
    const deleted = this.links.delete(shareId);
    if (deleted) {
      logger.info('Share link revoked', { shareId });
    }
    return deleted;
  }

  getShareLinksForRecipe(recipeId: string): ShareLink[] {
    return Array.from(this.links.values()).filter(link => 
      link.recipeId === recipeId && new Date() <= link.expiresAt
    );
  }

  cleanupExpiredLinks(): number {
    const now = new Date();
    const initialSize = this.links.size;
    
    for (const [shareId, link] of this.links.entries()) {
      if (now > link.expiresAt) {
        this.links.delete(shareId);
      }
    }

    const cleaned = initialSize - this.links.size;
    if (cleaned > 0) {
      logger.info('Share links cleanup completed', {
        removed: cleaned,
        remaining: this.links.size
      });
    }

    return cleaned;
  }

  getStats() {
    const now = new Date();
    const activeLinks = Array.from(this.links.values()).filter(link => now <= link.expiresAt);
    
    return {
      total: this.links.size,
      active: activeLinks.length,
      expired: this.links.size - activeLinks.length,
      totalAccesses: activeLinks.reduce((sum, link) => sum + link.accessCount, 0)
    };
  }
}

export const shareLinkStore = new ShareLinkStore();

// Create share link endpoint
export const createRecipeShareLink = asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { recipeId, expiresIn, allowPublicAccess } = createShareLinkSchema.parse(req.body);
    
    // Verify recipe exists
    const recipe = await storage.getRecipe(recipeId);
    if (!recipe) {
      throw new NotFoundError('Recipe', recipeId);
    }

    // Create share link
    const shareLink = shareLinkStore.createShareLink(recipeId, expiresIn, allowPublicAccess);
    
    const shareUrl = `${req.protocol}://${req.get('host')}/share/recipe/${shareLink.id}`;
    
    const responseTime = Date.now() - startTime;
    performanceLogger.info('Share link created', {
      recipeId,
      shareId: shareLink.id,
      responseTime,
      expiresIn
    });

    res.status(201).json({
      shareId: shareLink.id,
      shareUrl,
      expiresAt: shareLink.expiresAt.toISOString(),
      allowPublicAccess: shareLink.allowPublicAccess,
      createdAt: shareLink.createdAt.toISOString()
    });
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(`Invalid share link data: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw error;
  }
});

// Access shared recipe endpoint
export const getSharedRecipe = asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { shareId } = req.params;
  
  if (!shareId) {
    throw new ValidationError('Share ID is required');
  }

  // Get share link
  const shareLink = shareLinkStore.getShareLink(shareId);
  if (!shareLink) {
    throw new NotFoundError('Share link', shareId);
  }

  // Get recipe
  const recipe = await storage.getRecipe(shareLink.recipeId);
  if (!recipe) {
    // Clean up orphaned share link
    shareLinkStore.revokeShareLink(shareId);
    throw new NotFoundError('Recipe', shareLink.recipeId);
  }

  const responseTime = Date.now() - startTime;
  performanceLogger.info('Shared recipe accessed', {
    shareId,
    recipeId: recipe.id,
    recipeName: recipe.name,
    responseTime,
    accessCount: shareLink.accessCount
  });

  res.json({
    recipe,
    shareInfo: {
      shareId: shareLink.id,
      createdAt: shareLink.createdAt.toISOString(),
      expiresAt: shareLink.expiresAt.toISOString(),
      accessCount: shareLink.accessCount,
      allowPublicAccess: shareLink.allowPublicAccess
    }
  });
});

// Get share links for a recipe
export const getRecipeShareLinks = asyncHandler(async (req: Request, res: Response) => {
  const { recipeId } = req.params;
  
  if (!recipeId) {
    throw new ValidationError('Recipe ID is required');
  }

  // Verify recipe exists
  const recipe = await storage.getRecipe(recipeId);
  if (!recipe) {
    throw new NotFoundError('Recipe', recipeId);
  }

  const shareLinks = shareLinkStore.getShareLinksForRecipe(recipeId);
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  
  const linksWithUrls = shareLinks.map(link => ({
    shareId: link.id,
    shareUrl: `${baseUrl}/share/recipe/${link.id}`,
    createdAt: link.createdAt.toISOString(),
    expiresAt: link.expiresAt.toISOString(),
    allowPublicAccess: link.allowPublicAccess,
    accessCount: link.accessCount,
    lastAccessedAt: link.lastAccessedAt?.toISOString() || null
  }));

  res.json({
    recipeId,
    shareLinks: linksWithUrls
  });
});

// Revoke share link endpoint
export const revokeShareLink = asyncHandler(async (req: Request, res: Response) => {
  const { shareId } = req.params;
  
  if (!shareId) {
    throw new ValidationError('Share ID is required');
  }

  const revoked = shareLinkStore.revokeShareLink(shareId);
  
  if (!revoked) {
    throw new NotFoundError('Share link', shareId);
  }

  res.json({ 
    message: 'Share link revoked successfully',
    shareId 
  });
});

// Export recipe in various formats
export const exportRecipe = asyncHandler(async (req: Request, res: Response) => {
  const { recipeId } = req.params;
  const { format = 'json' } = req.query;
  
  if (!recipeId) {
    throw new ValidationError('Recipe ID is required');
  }

  // Get recipe
  const recipe = await storage.getRecipe(recipeId);
  if (!recipe) {
    throw new NotFoundError('Recipe', recipeId);
  }

  switch (format) {
    case 'json':
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${recipe.name.replace(/[^a-z0-9]/gi, '_')}_recipe.json"`);
      res.json(recipe);
      break;
      
    case 'text':
      const textContent = formatRecipeAsText(recipe);
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${recipe.name.replace(/[^a-z0-9]/gi, '_')}_recipe.txt"`);
      res.send(textContent);
      break;
      
    case 'markdown':
      const markdownContent = formatRecipeAsMarkdown(recipe);
      res.setHeader('Content-Type', 'text/markdown');
      res.setHeader('Content-Disposition', `attachment; filename="${recipe.name.replace(/[^a-z0-9]/gi, '_')}_recipe.md"`);
      res.send(markdownContent);
      break;
      
    default:
      throw new ValidationError('Unsupported export format. Supported formats: json, text, markdown');
  }

  logger.info('Recipe exported', {
    recipeId,
    recipeName: recipe.name,
    format,
    fileSize: res.get('content-length')
  });
});

// Share statistics endpoint
export const getShareStatistics = asyncHandler(async (req: Request, res: Response) => {
  const stats = shareLinkStore.getStats();
  
  res.json({
    shareLinks: stats,
    timestamp: new Date().toISOString()
  });
});

// Utility functions for formatting recipes
function formatRecipeAsText(recipe: any): string {
  const lines = [];
  
  lines.push(recipe.name.toUpperCase());
  lines.push('='.repeat(recipe.name.length));
  lines.push('');
  
  if (recipe.description) {
    lines.push(recipe.description);
    lines.push('');
  }
  
  lines.push(`Difficulty: ${recipe.difficulty}`);
  lines.push(`Servings: ${recipe.servings}`);
  lines.push(`Prep Time: ${recipe.prepTime || 'N/A'} minutes`);
  lines.push(`Cook Time: ${recipe.cookTime || 'N/A'} minutes`);
  
  if (recipe.dietaryTags && recipe.dietaryTags.length > 0) {
    lines.push(`Tags: ${recipe.dietaryTags.join(', ')}`);
  }
  
  lines.push('');
  lines.push('INGREDIENTS:');
  lines.push('-----------');
  
  if (recipe.ingredients && Array.isArray(recipe.ingredients)) {
    recipe.ingredients.forEach((ing: any) => {
      lines.push(`• ${ing.quantity} ${ing.unit} ${ing.name}`.trim());
    });
  }
  
  lines.push('');
  lines.push('INSTRUCTIONS:');
  lines.push('------------');
  lines.push(recipe.instructions || 'No instructions provided');
  
  lines.push('');
  lines.push('---');
  lines.push(`Generated by MealMate on ${new Date().toLocaleDateString()}`);
  
  return lines.join('\n');
}

function formatRecipeAsMarkdown(recipe: any): string {
  const lines = [];
  
  lines.push(`# ${recipe.name}`);
  lines.push('');
  
  if (recipe.description) {
    lines.push(`*${recipe.description}*`);
    lines.push('');
  }
  
  lines.push('## Recipe Info');
  lines.push('');
  lines.push(`- **Difficulty:** ${recipe.difficulty}`);
  lines.push(`- **Servings:** ${recipe.servings}`);
  lines.push(`- **Prep Time:** ${recipe.prepTime || 'N/A'} minutes`);
  lines.push(`- **Cook Time:** ${recipe.cookTime || 'N/A'} minutes`);
  
  if (recipe.dietaryTags && recipe.dietaryTags.length > 0) {
    lines.push(`- **Tags:** ${recipe.dietaryTags.map((tag: string) => `\`${tag}\``).join(', ')}`);
  }
  
  lines.push('');
  lines.push('## Ingredients');
  lines.push('');
  
  if (recipe.ingredients && Array.isArray(recipe.ingredients)) {
    recipe.ingredients.forEach((ing: any) => {
      lines.push(`- ${ing.quantity} ${ing.unit} ${ing.name}`.trim());
    });
  }
  
  lines.push('');
  lines.push('## Instructions');
  lines.push('');
  lines.push(recipe.instructions || '*No instructions provided*');
  
  lines.push('');
  lines.push('---');
  lines.push(`*Generated by MealMate on ${new Date().toLocaleDateString()}*`);
  
  return lines.join('\n');
}

// Cleanup expired links periodically
setInterval(() => {
  shareLinkStore.cleanupExpiredLinks();
}, 60 * 60 * 1000); // Every hour