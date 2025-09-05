import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import OptimizedImage from "@/components/optimized-image";
import { Clock, Users, Eye, Calendar, Share2, Download, AlertCircle } from "lucide-react";
import { type Recipe } from "@shared/schema";

interface ShareInfo {
  shareId: string;
  createdAt: string;
  expiresAt: string;
  accessCount: number;
  allowPublicAccess: boolean;
}

interface SharedRecipeData {
  recipe: Recipe;
  shareInfo: ShareInfo;
}

export default function SharedRecipe() {
  const [, params] = useRoute("/share/recipe/:shareId");
  const [data, setData] = useState<SharedRecipeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const fetchSharedRecipe = async () => {
      if (!params?.shareId) return;

      try {
        setLoading(true);
        const response = await fetch(`/api/share/recipe/${params.shareId}`);
        
        if (!response.ok) {
          throw new Error(response.status === 404 ? 'Shared recipe not found or expired' : 'Failed to load shared recipe');
        }

        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load shared recipe');
      } finally {
        setLoading(false);
      }
    };

    fetchSharedRecipe();
  }, [params?.shareId]);

  const exportRecipe = async (format: 'json' | 'text' | 'markdown') => {
    if (!data) return;

    try {
      const response = await fetch(`/api/recipes/${data.recipe.id}/export?format=${format}`);
      
      if (!response.ok) {
        throw new Error('Failed to export recipe');
      }

      if (format === 'json') {
        const jsonData = await response.json();
        downloadJson(jsonData, `${data.recipe.name}_recipe.json`);
      } else {
        const text = await response.text();
        const extension = format === 'markdown' ? 'md' : 'txt';
        downloadText(text, `${data.recipe.name}_recipe.${extension}`);
      }

      toast({ title: "Recipe exported successfully!" });
    } catch (err) {
      toast({ 
        title: "Failed to export recipe", 
        variant: "destructive" 
      });
    }
  };

  const downloadJson = (data: any, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadText = (text: string, filename: string) => {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({ title: "Link copied to clipboard!" });
    } catch (err) {
      toast({ 
        title: "Failed to copy link", 
        variant: "destructive" 
      });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading shared recipe...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-6 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Recipe Not Found</h2>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={() => window.location.href = '/'}>
              Go to MealMate
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const { recipe, shareInfo } = data;
  const totalTime = (recipe.prepTime || 0) + (recipe.cookTime || 0);
  const isExpiringSoon = new Date(shareInfo.expiresAt).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000; // 7 days

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">MealMate</h1>
              <p className="text-sm text-muted-foreground">Shared Recipe</p>
            </div>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" onClick={copyUrl}>
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => exportRecipe('json')}
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recipe Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Recipe Header */}
            <Card>
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="md:w-1/3">
                    <OptimizedImage
                      src={recipe.imageUrl}
                      alt={recipe.name}
                      className="w-full h-48 rounded-lg object-cover"
                    />
                  </div>
                  <div className="md:w-2/3 space-y-4">
                    <div>
                      <h1 className="text-3xl font-bold text-foreground mb-2">
                        {recipe.name}
                      </h1>
                      {recipe.description && (
                        <p className="text-muted-foreground">
                          {recipe.description}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-4 text-sm">
                      {totalTime > 0 && (
                        <div className="flex items-center">
                          <Clock className="h-4 w-4 mr-2 text-primary" />
                          <span>{totalTime} minutes</span>
                        </div>
                      )}
                      <div className="flex items-center">
                        <Users className="h-4 w-4 mr-2 text-primary" />
                        <span>{recipe.servings} servings</span>
                      </div>
                      <div className="flex items-center">
                        <Eye className="h-4 w-4 mr-2 text-primary" />
                        <span>{shareInfo.accessCount} views</span>
                      </div>
                    </div>

                    {recipe.dietaryTags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {recipe.dietaryTags.map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Ingredients */}
            <Card>
              <CardHeader>
                <CardTitle>Ingredients</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {recipe.ingredients.map((ingredient, index) => (
                    <div key={index} className="flex items-center p-2 rounded border border-border">
                      <span className="font-medium text-primary mr-2">
                        {ingredient.quantity}
                      </span>
                      {ingredient.unit && (
                        <span className="text-muted-foreground mr-2">
                          {ingredient.unit}
                        </span>
                      )}
                      <span>{ingredient.name}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Instructions */}
            <Card>
              <CardHeader>
                <CardTitle>Instructions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <div className="whitespace-pre-wrap">
                    {recipe.instructions}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Recipe Details */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recipe Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Difficulty</div>
                    <div className="font-medium capitalize">{recipe.difficulty}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Servings</div>
                    <div className="font-medium">{recipe.servings}</div>
                  </div>
                  {recipe.prepTime && (
                    <div>
                      <div className="text-muted-foreground">Prep Time</div>
                      <div className="font-medium">{recipe.prepTime} min</div>
                    </div>
                  )}
                  {recipe.cookTime && (
                    <div>
                      <div className="text-muted-foreground">Cook Time</div>
                      <div className="font-medium">{recipe.cookTime} min</div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Share Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Share Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Views</span>
                  <span className="font-medium">{shareInfo.accessCount}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Shared On</span>
                  <span className="font-medium">{formatDate(shareInfo.createdAt)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Expires On</span>
                  <span className={`font-medium ${isExpiringSoon ? 'text-orange-500' : ''}`}>
                    {formatDate(shareInfo.expiresAt)}
                  </span>
                </div>
                {isExpiringSoon && (
                  <div className="text-xs text-orange-500 bg-orange-50 dark:bg-orange-950/20 p-2 rounded">
                    ⚠️ This shared recipe will expire soon
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Export Options */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Export Recipe</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => exportRecipe('json')}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download as JSON
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => exportRecipe('text')}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download as Text
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start"
                  onClick={() => exportRecipe('markdown')}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download as Markdown
                </Button>
              </CardContent>
            </Card>

            {/* MealMate Branding */}
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-sm text-muted-foreground mb-2">
                  Recipe shared via
                </div>
                <div className="font-bold text-primary text-lg">MealMate</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Your digital recipe companion
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full mt-3"
                  onClick={() => window.open('/', '_blank')}
                >
                  Visit MealMate
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}