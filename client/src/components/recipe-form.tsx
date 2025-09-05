import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { insertRecipeSchema, type Ingredient } from "@shared/schema";
import { Plus, Trash2, Save, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { z } from "zod";

interface RecipeFormProps {
  onSuccess?: () => void;
}

const formSchema = insertRecipeSchema.extend({
  prepTime: z.coerce.number().min(0).optional(),
  cookTime: z.coerce.number().min(0).optional(),
});

type FormData = z.infer<typeof formSchema>;

const dietaryOptions = [
  "vegetarian",
  "vegan", 
  "gluten-free",
  "dairy-free",
  "keto",
  "low-carb",
  "healthy",
  "protein"
];

export default function RecipeForm({ onSuccess }: RecipeFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [ingredients, setIngredients] = useState<Ingredient[]>([
    { name: "", quantity: "", unit: "" }
  ]);
  const [selectedDietaryTags, setSelectedDietaryTags] = useState<string[]>([]);
  const [showSmartImport, setShowSmartImport] = useState(false);
  const [recipeText, setRecipeText] = useState("");
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      prepTime: 0,
      cookTime: 0,
      difficulty: "easy",
      servings: 4,
      ingredients: [],
      instructions: "",
      dietaryTags: [],
      imageUrl: "",
    },
  });

  const parseRecipeMutation = useMutation({
    mutationFn: async (recipeText: string) => {
      const response = await apiRequest('POST', '/api/recipes/parse', { recipeText });
      const data = await response.json();
      return data;
    },
    onSuccess: (parsedData: any) => {
      // Populate form with parsed data
      form.reset({
        name: parsedData.name || "",
        description: parsedData.description || "",
        prepTime: parsedData.prepTime || 10,
        cookTime: parsedData.cookTime || 20,
        difficulty: parsedData.difficulty || "easy",
        servings: parsedData.servings || 4,
        instructions: parsedData.instructions || "",
        imageUrl: "",
        ingredients: parsedData.ingredients || [],
        dietaryTags: parsedData.dietaryTags || []
      });
      
      setIngredients(parsedData.ingredients || [{ name: "", quantity: "", unit: "" }]);
      setSelectedDietaryTags(parsedData.dietaryTags || []);
      setShowSmartImport(false);
      setRecipeText("");
      toast({ title: "Recipe parsed successfully! Review and save." });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to parse recipe", 
        description: error?.message || "Please check the format and try again.",
        variant: "destructive" 
      });
    }
  });

  const createRecipeMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const validIngredients = ingredients.filter(ing => 
        ing.name.trim() && ing.quantity.trim()
      );
      
      return apiRequest('POST', '/api/recipes', {
        ...data,
        ingredients: validIngredients,
        dietaryTags: selectedDietaryTags,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recipes'] });
      toast({ title: "Recipe created successfully!" });
      handleReset();
      onSuccess?.();
    },
    onError: () => {
      toast({ title: "Failed to create recipe", variant: "destructive" });
    }
  });

  const addIngredient = () => {
    setIngredients([...ingredients, { name: "", quantity: "", unit: "" }]);
  };

  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const updateIngredient = (index: number, field: keyof Ingredient, value: string) => {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], [field]: value };
    setIngredients(updated);
  };

  const toggleDietaryTag = (tag: string) => {
    setSelectedDietaryTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const handleReset = () => {
    form.reset();
    setIngredients([{ name: "", quantity: "", unit: "" }]);
    setSelectedDietaryTags([]);
    setShowSmartImport(false);
    setRecipeText("");
    setIsOpen(false);
  };

  const handleSmartImport = () => {
    if (!recipeText.trim()) {
      toast({ title: "Please paste recipe text first", variant: "destructive" });
      return;
    }
    parseRecipeMutation.mutate(recipeText);
  };

  const onSubmit = (data: FormData) => {
    const validIngredients = ingredients.filter(ing => 
      ing.name.trim() && ing.quantity.trim()
    );
    
    if (validIngredients.length === 0) {
      toast({ title: "Please add at least one ingredient", variant: "destructive" });
      return;
    }
    
    createRecipeMutation.mutate(data);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button 
          size="lg"
          className="w-full sm:w-auto"
          data-testid="button-add-recipe"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Recipe
          {isOpen ? (
            <ChevronUp className="h-4 w-4 ml-2" />
          ) : (
            <ChevronDown className="h-4 w-4 ml-2" />
          )}
        </Button>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="mt-4 space-y-6 animate-in slide-in-from-top-2 duration-200">
        {/* Smart Import Section */}
        <Collapsible open={showSmartImport} onOpenChange={setShowSmartImport}>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="w-full flex items-center justify-between"
              data-testid="button-smart-import-toggle"
            >
              <div className="flex items-center space-x-2">
                <Sparkles className="h-4 w-4" />
                <span>Smart Import</span>
              </div>
              {showSmartImport ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          
          <CollapsibleContent className="mt-4">
            <div className="space-y-4 p-4 bg-secondary/50 rounded-lg border border-border">
              <div className="flex items-center space-x-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Smart Recipe Import</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Paste any recipe text below and I'll automatically extract the ingredients, instructions, and details for you.
              </p>
              <Textarea
                placeholder="Paste your recipe here... 

Example:
Teriyaki Salmon Bowls
Prep: 10 min | Cook: 15 min | Serves: 4
Ingredients:
- 4 salmon fillets
- 1/2 cup teriyaki sauce
- 2 cups cooked rice
Instructions:
1. Marinate salmon in teriyaki sauce...
2. Bake for 10-12 minutes..."
                value={recipeText}
                onChange={(e) => setRecipeText(e.target.value)}
                rows={6}
                className="resize-none"
                data-testid="textarea-recipe-import"
              />
              <div className="flex space-x-2">
                <Button
                  type="button"
                  onClick={handleSmartImport}
                  disabled={parseRecipeMutation.isPending || !recipeText.trim()}
                  className="flex items-center space-x-2"
                  data-testid="button-parse-recipe"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>
                    {parseRecipeMutation.isPending ? "Parsing..." : "Parse Recipe"}
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setRecipeText("");
                    setShowSmartImport(false);
                  }}
                  data-testid="button-clear-import"
                >
                  Clear
                </Button>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Recipe Name</FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="Enter recipe name..." 
                        {...field}
                        data-testid="input-recipe-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="difficulty"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Difficulty Level</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-difficulty">
                          <SelectValue placeholder="Select difficulty" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="easy">Easy</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="hard">Hard</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Brief description of the recipe..." 
                      rows={3}
                      {...field}
                      value={field.value || ''}
                      data-testid="textarea-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Timing and Servings */}
            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="prepTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prep Time (min)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        min="0"
                        placeholder="15"
                        {...field}
                        data-testid="input-prep-time"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="cookTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cook Time (min)</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        min="0"
                        placeholder="30"
                        {...field}
                        data-testid="input-cook-time"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="servings"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Servings</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        min="1"
                        {...field}
                        data-testid="input-servings"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Dietary Tags */}
            <div>
              <FormLabel className="block mb-3">Dietary Tags</FormLabel>
              <div className="flex flex-wrap gap-2">
                {dietaryOptions.map((tag) => (
                  <Badge
                    key={tag}
                    variant={selectedDietaryTags.includes(tag) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => toggleDietaryTag(tag)}
                    data-testid={`badge-dietary-${tag}`}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Ingredients */}
            <div>
              <FormLabel className="block mb-3">Ingredients</FormLabel>
              <div className="space-y-2">
                {ingredients.map((ingredient, index) => (
                  <div key={index} className="flex items-center space-x-2">
                    <Input
                      placeholder="Ingredient name"
                      value={ingredient.name}
                      onChange={(e) => updateIngredient(index, 'name', e.target.value)}
                      className="flex-1"
                      data-testid={`input-ingredient-name-${index}`}
                    />
                    <Input
                      placeholder="Qty"
                      value={ingredient.quantity}
                      onChange={(e) => updateIngredient(index, 'quantity', e.target.value)}
                      className="w-20"
                      data-testid={`input-ingredient-quantity-${index}`}
                    />
                    <Input
                      placeholder="Unit"
                      value={ingredient.unit}
                      onChange={(e) => updateIngredient(index, 'unit', e.target.value)}
                      className="w-20"
                      data-testid={`input-ingredient-unit-${index}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeIngredient(index)}
                      disabled={ingredients.length === 1}
                      data-testid={`button-remove-ingredient-${index}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={addIngredient}
                className="mt-3"
                data-testid="button-add-ingredient"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Ingredient
              </Button>
            </div>

            {/* Instructions */}
            <FormField
              control={form.control}
              name="instructions"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cooking Instructions</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Step-by-step cooking instructions..." 
                      rows={6}
                      {...field}
                      data-testid="textarea-instructions"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Image URL */}
            <FormField
              control={form.control}
              name="imageUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Image URL (optional)</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="https://example.com/recipe-image.jpg" 
                      {...field}
                      value={field.value || ''}
                      data-testid="input-image-url"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Form Actions */}
            <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3 pt-4 border-t">
              <Button 
                type="button" 
                variant="outline"
                onClick={handleReset}
                className="order-2 sm:order-1"
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={createRecipeMutation.isPending}
                className="order-1 sm:order-2"
                data-testid="button-save-recipe"
              >
                <Save className="h-4 w-4 mr-2" />
                {createRecipeMutation.isPending ? "Saving..." : "Save Recipe"}
              </Button>
            </div>
          </form>
        </Form>
      </CollapsibleContent>
    </Collapsible>
  );
}