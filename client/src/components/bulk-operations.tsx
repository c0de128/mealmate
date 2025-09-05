import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Upload, Download, Trash2, Edit, FileText, Globe, Settings } from "lucide-react";

interface BulkOperationsProps {
  selectedRecipeIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
}

interface BulkResult {
  successful: any[];
  failed: any[];
  total: number;
}

export default function BulkOperations({ selectedRecipeIds = [], onSelectionChange }: BulkOperationsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("export");
  const [exportFormat, setExportFormat] = useState<"json" | "csv" | "text">("json");
  const [includeImages, setIncludeImages] = useState(false);
  const [importData, setImportData] = useState("");
  const [urlList, setUrlList] = useState("");
  const [textList, setTextList] = useState("");
  const [lastResult, setLastResult] = useState<BulkResult | null>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (recipeIds: string[]) => {
      const response = await apiRequest('DELETE', '/api/recipes/bulk', { recipeIds });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/recipes'] });
      setLastResult(data.results);
      toast({ 
        title: "Bulk deletion completed", 
        description: `${data.results.successful.length}/${data.results.total} recipes deleted`
      });
      onSelectionChange?.([]);
    },
    onError: () => {
      toast({ 
        title: "Bulk deletion failed", 
        variant: "destructive" 
      });
    },
  });

  // Bulk export mutation
  const bulkExportMutation = useMutation({
    mutationFn: async ({ recipeIds, format, includeImages }: { 
      recipeIds?: string[], 
      format: string, 
      includeImages: boolean 
    }) => {
      const params = new URLSearchParams();
      if (recipeIds && recipeIds.length > 0) {
        recipeIds.forEach(id => params.append('recipeIds', id));
      }
      params.append('format', format);
      params.append('includeImages', includeImages.toString());
      
      const response = await fetch(`/api/recipes/bulk/export?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error('Export failed');
      }

      return response;
    },
    onSuccess: async (response) => {
      const contentType = response.headers.get('content-type');
      const contentDisposition = response.headers.get('content-disposition');
      
      let filename = 'recipes_export';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      let blob;
      if (contentType?.includes('application/json')) {
        const data = await response.json();
        blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      } else {
        blob = await response.blob();
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({ title: "Export completed successfully!" });
    },
    onError: () => {
      toast({ 
        title: "Export failed", 
        variant: "destructive" 
      });
    },
  });

  // Bulk import mutation
  const bulkImportMutation = useMutation({
    mutationFn: async (recipes: any[]) => {
      const response = await apiRequest('POST', '/api/recipes/bulk', { recipes });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/recipes'] });
      setLastResult(data.results);
      toast({ 
        title: "Bulk import completed", 
        description: `${data.results.successful.length}/${data.results.total} recipes imported`
      });
      setImportData("");
    },
    onError: () => {
      toast({ 
        title: "Bulk import failed", 
        variant: "destructive" 
      });
    },
  });

  // Bulk URL import mutation
  const bulkUrlImportMutation = useMutation({
    mutationFn: async (urls: string[]) => {
      const response = await apiRequest('POST', '/api/recipes/bulk/import-urls', { urls });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/recipes'] });
      setLastResult(data.results);
      toast({ 
        title: "Bulk URL import completed", 
        description: `${data.results.successful.length}/${data.results.total} recipes imported`
      });
      setUrlList("");
    },
    onError: () => {
      toast({ 
        title: "Bulk URL import failed", 
        variant: "destructive" 
      });
    },
  });

  // Bulk text parsing mutation
  const bulkTextParseMutation = useMutation({
    mutationFn: async (recipeTexts: string[]) => {
      const response = await apiRequest('POST', '/api/recipes/bulk/parse-text', { recipeTexts });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/recipes'] });
      setLastResult(data.results);
      toast({ 
        title: "Bulk text parsing completed", 
        description: `${data.results.successful.length}/${data.results.total} recipes parsed and imported`
      });
      setTextList("");
    },
    onError: () => {
      toast({ 
        title: "Bulk text parsing failed", 
        variant: "destructive" 
      });
    },
  });

  const handleExport = () => {
    bulkExportMutation.mutate({
      recipeIds: selectedRecipeIds.length > 0 ? selectedRecipeIds : undefined,
      format: exportFormat,
      includeImages
    });
  };

  const handleImport = () => {
    try {
      const recipes = JSON.parse(importData);
      if (!Array.isArray(recipes)) {
        throw new Error("Import data must be an array of recipes");
      }
      bulkImportMutation.mutate(recipes);
    } catch (error) {
      toast({
        title: "Invalid import data",
        description: "Please provide valid JSON data",
        variant: "destructive"
      });
    }
  };

  const handleUrlImport = () => {
    const urls = urlList.split('\n').filter(url => url.trim()).map(url => url.trim());
    if (urls.length === 0) {
      toast({
        title: "No URLs provided",
        description: "Please enter at least one URL",
        variant: "destructive"
      });
      return;
    }
    bulkUrlImportMutation.mutate(urls);
  };

  const handleTextParse = () => {
    const texts = textList.split('\n---\n').filter(text => text.trim());
    if (texts.length === 0) {
      toast({
        title: "No recipe texts provided",
        description: "Please enter at least one recipe text",
        variant: "destructive"
      });
      return;
    }
    bulkTextParseMutation.mutate(texts);
  };

  const handleBulkDelete = () => {
    if (selectedRecipeIds.length === 0) {
      toast({
        title: "No recipes selected",
        description: "Please select recipes to delete",
        variant: "destructive"
      });
      return;
    }

    if (confirm(`Are you sure you want to delete ${selectedRecipeIds.length} recipes? This action cannot be undone.`)) {
      bulkDeleteMutation.mutate(selectedRecipeIds);
    }
  };

  const isLoading = bulkDeleteMutation.isPending || 
                   bulkExportMutation.isPending || 
                   bulkImportMutation.isPending || 
                   bulkUrlImportMutation.isPending || 
                   bulkTextParseMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-bulk-operations">
          <Settings className="h-4 w-4 mr-2" />
          Bulk Operations
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Recipe Operations</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="export">Export</TabsTrigger>
            <TabsTrigger value="import">Import</TabsTrigger>
            <TabsTrigger value="urls">From URLs</TabsTrigger>
            <TabsTrigger value="text">Parse Text</TabsTrigger>
            <TabsTrigger value="delete">Delete</TabsTrigger>
          </TabsList>

          {/* Export Tab */}
          <TabsContent value="export" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Download className="h-5 w-5 mr-2" />
                  Export Recipes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Export Format</Label>
                    <Select value={exportFormat} onValueChange={(value) => setExportFormat(value as any)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="json">JSON</SelectItem>
                        <SelectItem value="csv">CSV</SelectItem>
                        <SelectItem value="text">Text</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center space-x-2 mt-6">
                    <input
                      type="checkbox"
                      id="include-images"
                      checked={includeImages}
                      onChange={(e) => setIncludeImages(e.target.checked)}
                      className="rounded"
                    />
                    <Label htmlFor="include-images">Include image URLs</Label>
                  </div>
                </div>
                
                <div className="text-sm text-muted-foreground">
                  {selectedRecipeIds.length > 0 
                    ? `Export ${selectedRecipeIds.length} selected recipes`
                    : "Export all recipes"
                  }
                </div>

                <Button 
                  onClick={handleExport}
                  disabled={isLoading}
                  className="w-full"
                >
                  <Download className="h-4 w-4 mr-2" />
                  {bulkExportMutation.isPending ? "Exporting..." : "Export Recipes"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Import Tab */}
          <TabsContent value="import" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Upload className="h-5 w-5 mr-2" />
                  Import Recipe Data
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Recipe Data (JSON Array)</Label>
                  <Textarea
                    placeholder='[{"name": "Recipe Name", "ingredients": [...], ...}]'
                    value={importData}
                    onChange={(e) => setImportData(e.target.value)}
                    rows={8}
                    className="font-mono text-sm"
                  />
                </div>

                <div className="text-sm text-muted-foreground">
                  Provide an array of recipe objects in JSON format. Maximum 50 recipes per import.
                </div>

                <Button 
                  onClick={handleImport}
                  disabled={isLoading || !importData.trim()}
                  className="w-full"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {bulkImportMutation.isPending ? "Importing..." : "Import Recipes"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* URL Import Tab */}
          <TabsContent value="urls" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Globe className="h-5 w-5 mr-2" />
                  Import from URLs
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Recipe URLs (one per line)</Label>
                  <Textarea
                    placeholder="https://example.com/recipe1&#10;https://example.com/recipe2&#10;https://example.com/recipe3"
                    value={urlList}
                    onChange={(e) => setUrlList(e.target.value)}
                    rows={8}
                  />
                </div>

                <div className="text-sm text-muted-foreground">
                  Enter recipe URLs, one per line. Maximum 10 URLs per import. 
                  URLs will be scraped and parsed using AI.
                </div>

                <Button 
                  onClick={handleUrlImport}
                  disabled={isLoading || !urlList.trim()}
                  className="w-full"
                >
                  <Globe className="h-4 w-4 mr-2" />
                  {bulkUrlImportMutation.isPending ? "Importing..." : "Import from URLs"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Text Parsing Tab */}
          <TabsContent value="text" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <FileText className="h-5 w-5 mr-2" />
                  Parse Recipe Texts
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Recipe Texts (separate with ---)</Label>
                  <Textarea
                    placeholder="Chocolate Chip Cookies&#10;2 cups flour, 1 cup butter...&#10;---&#10;Pasta Marinara&#10;1 lb pasta, 2 cups tomato sauce..."
                    value={textList}
                    onChange={(e) => setTextList(e.target.value)}
                    rows={10}
                  />
                </div>

                <div className="text-sm text-muted-foreground">
                  Enter recipe texts separated by "---" on its own line. Maximum 20 recipes per batch. 
                  AI will parse and structure the recipes automatically.
                </div>

                <Button 
                  onClick={handleTextParse}
                  disabled={isLoading || !textList.trim()}
                  className="w-full"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  {bulkTextParseMutation.isPending ? "Parsing..." : "Parse Recipe Texts"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Delete Tab */}
          <TabsContent value="delete" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Trash2 className="h-5 w-5 mr-2 text-destructive" />
                  Delete Selected Recipes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center py-6">
                  <div className="text-lg font-semibold mb-2">
                    {selectedRecipeIds.length} recipes selected
                  </div>
                  <div className="text-sm text-muted-foreground mb-4">
                    This action cannot be undone. Deleted recipes will be permanently removed.
                  </div>
                  
                  {selectedRecipeIds.length > 0 && (
                    <div className="bg-destructive/10 border border-destructive/20 rounded p-3 mb-4">
                      <p className="text-sm font-medium text-destructive">
                        ⚠️ Warning: You are about to delete {selectedRecipeIds.length} recipes
                      </p>
                    </div>
                  )}
                </div>

                <Button 
                  onClick={handleBulkDelete}
                  disabled={isLoading || selectedRecipeIds.length === 0}
                  variant="destructive"
                  className="w-full"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {bulkDeleteMutation.isPending ? "Deleting..." : `Delete ${selectedRecipeIds.length} Recipes`}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Results Display */}
        {lastResult && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg">Operation Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{lastResult.successful.length}</div>
                  <div className="text-sm text-muted-foreground">Successful</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">{lastResult.failed.length}</div>
                  <div className="text-sm text-muted-foreground">Failed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{lastResult.total}</div>
                  <div className="text-sm text-muted-foreground">Total</div>
                </div>
              </div>
              
              <Progress 
                value={(lastResult.successful.length / lastResult.total) * 100} 
                className="mb-4" 
              />

              {lastResult.failed.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-destructive">Failed Operations:</h4>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {lastResult.failed.map((fail: any, index: number) => (
                      <Badge key={index} variant="destructive" className="mr-2 mb-1">
                        {fail.error}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </DialogContent>
    </Dialog>
  );
}