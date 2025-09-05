import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileText, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';

interface ImportOptions {
  format: 'json' | 'zip';
  mergeStrategy: 'replace' | 'merge' | 'skip';
  validateData: boolean;
}

interface ImportResult {
  recipes: { imported: number; skipped: number; errors: number };
  mealPlans: { imported: number; skipped: number; errors: number };
  shoppingLists: { imported: number; skipped: number; errors: number };
  errors: string[];
  summary: {
    totalImported: number;
    totalErrors: number;
    duration: number;
  };
}

export default function DataImport() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importOptions, setImportOptions] = useState<ImportOptions>({
    format: 'json',
    mergeStrategy: 'merge',
    validateData: true
  });
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async ({ file, options }: { file: File; options: ImportOptions }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('format', options.format);
      formData.append('mergeStrategy', options.mergeStrategy);
      formData.append('validateData', options.validateData.toString());

      const response = await fetch('/api/data/import', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Import failed' }));
        throw new Error(error.message || 'Import failed');
      }

      return response.json();
    },
    onSuccess: (result: ImportResult) => {
      setImportResult(result);
      const { totalImported, totalErrors } = result.summary;
      
      if (totalErrors === 0) {
        toast.success(`Import completed successfully! Imported ${totalImported} items.`);
      } else if (totalImported > 0) {
        toast.warning(`Import completed with ${totalErrors} errors. Imported ${totalImported} items.`);
      } else {
        toast.error(`Import failed. ${totalErrors} errors occurred.`);
      }

      // Clear the file input
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    onError: (error) => {
      toast.error(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setImportResult(null);
    }
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setImportResult(null);
      
      // Auto-detect format from file extension
      if (file.name.endsWith('.json')) {
        setImportOptions(prev => ({ ...prev, format: 'json' }));
      } else if (file.name.endsWith('.zip')) {
        setImportOptions(prev => ({ ...prev, format: 'zip' }));
      }
    }
  };

  const handleImport = () => {
    if (!selectedFile) {
      toast.error('Please select a file to import');
      return;
    }

    importMutation.mutate({ file: selectedFile, options: importOptions });
  };

  const getMergeStrategyDescription = (strategy: string) => {
    switch (strategy) {
      case 'replace':
        return 'Replace existing items with imported data. Existing items will be overwritten.';
      case 'merge':
        return 'Update existing items and add new ones. Safe option that preserves existing data.';
      case 'skip':
        return 'Only import new items. Skip items that already exist in the system.';
      default:
        return '';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const isValidFileType = (file: File) => {
    return file.name.endsWith('.json') || file.name.endsWith('.zip');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Upload className="h-5 w-5" />
          <span>Data Import</span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Import your data from JSON or ZIP files to restore or merge with existing data
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* File Selection */}
        <div className="space-y-4">
          <Label className="text-base font-medium">Select Import File</Label>
          <div 
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              selectedFile ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.zip"
              onChange={handleFileChange}
              className="hidden"
              id="import-file"
            />
            <label htmlFor="import-file" className="cursor-pointer">
              <div className="flex flex-col items-center space-y-2">
                <FileText className="h-10 w-10 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">
                    {selectedFile ? selectedFile.name : 'Click to select file'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedFile 
                      ? `${formatFileSize(selectedFile.size)} • ${selectedFile.type || 'Unknown type'}`
                      : 'JSON or ZIP files only (max 50MB)'
                    }
                  </p>
                </div>
              </div>
            </label>
          </div>

          {selectedFile && !isValidFileType(selectedFile) && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Invalid file type. Please select a JSON or ZIP file.
              </AlertDescription>
            </Alert>
          )}
        </div>

        {selectedFile && isValidFileType(selectedFile) && (
          <>
            <Separator />

            {/* Import Options */}
            <div className="space-y-4">
              <Label className="text-base font-medium">Import Options</Label>
              
              {/* Format Selection */}
              <div className="space-y-2">
                <Label>File Format</Label>
                <Select 
                  value={importOptions.format} 
                  onValueChange={(value) => 
                    setImportOptions(prev => ({ ...prev, format: value as 'json' | 'zip' }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="json">JSON</SelectItem>
                    <SelectItem value="zip">ZIP Archive</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Merge Strategy */}
              <div className="space-y-2">
                <Label>Merge Strategy</Label>
                <Select 
                  value={importOptions.mergeStrategy} 
                  onValueChange={(value) => 
                    setImportOptions(prev => ({ ...prev, mergeStrategy: value as 'replace' | 'merge' | 'skip' }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="merge">Merge (Recommended)</SelectItem>
                    <SelectItem value="skip">Skip Existing</SelectItem>
                    <SelectItem value="replace">Replace All</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  {getMergeStrategyDescription(importOptions.mergeStrategy)}
                </p>
              </div>

              {/* Validation Option */}
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="validate"
                  checked={importOptions.validateData}
                  onCheckedChange={(checked) => 
                    setImportOptions(prev => ({ ...prev, validateData: !!checked }))
                  }
                />
                <Label htmlFor="validate" className="cursor-pointer">
                  Validate imported data (recommended)
                </Label>
              </div>
            </div>

            <Separator />

            {/* Import Button */}
            <div>
              <Button 
                onClick={handleImport} 
                disabled={importMutation.isPending || !selectedFile || !isValidFileType(selectedFile)}
                className="w-full"
                size="lg"
              >
                {importMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Import Data
                  </>
                )}
              </Button>
            </div>
          </>
        )}

        {/* Import Results */}
        {importResult && (
          <>
            <Separator />
            <div className="space-y-4">
              <Label className="text-base font-medium flex items-center space-x-2">
                {importResult.summary.totalErrors === 0 ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : importResult.summary.totalImported > 0 ? (
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                <span>Import Results</span>
              </Label>

              {/* Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {importResult.summary.totalImported}
                  </div>
                  <div className="text-sm text-muted-foreground">Imported</div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-red-600">
                    {importResult.summary.totalErrors}
                  </div>
                  <div className="text-sm text-muted-foreground">Errors</div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-2xl font-bold text-primary">
                    {Math.round(importResult.summary.duration / 1000)}s
                  </div>
                  <div className="text-sm text-muted-foreground">Duration</div>
                </div>
              </div>

              {/* Detailed Results */}
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 border rounded">
                  <span className="font-medium">Recipes</span>
                  <div className="text-sm space-x-4">
                    <span className="text-green-600">{importResult.recipes.imported} imported</span>
                    <span className="text-yellow-600">{importResult.recipes.skipped} skipped</span>
                    <span className="text-red-600">{importResult.recipes.errors} errors</span>
                  </div>
                </div>
                <div className="flex justify-between items-center p-3 border rounded">
                  <span className="font-medium">Meal Plans</span>
                  <div className="text-sm space-x-4">
                    <span className="text-green-600">{importResult.mealPlans.imported} imported</span>
                    <span className="text-yellow-600">{importResult.mealPlans.skipped} skipped</span>
                    <span className="text-red-600">{importResult.mealPlans.errors} errors</span>
                  </div>
                </div>
                <div className="flex justify-between items-center p-3 border rounded">
                  <span className="font-medium">Shopping Lists</span>
                  <div className="text-sm space-x-4">
                    <span className="text-green-600">{importResult.shoppingLists.imported} imported</span>
                    <span className="text-yellow-600">{importResult.shoppingLists.skipped} skipped</span>
                    <span className="text-red-600">{importResult.shoppingLists.errors} errors</span>
                  </div>
                </div>
              </div>

              {/* Error Details */}
              {importResult.errors.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-red-600">Error Details</Label>
                  <div className="max-h-40 overflow-y-auto p-3 bg-red-50 border border-red-200 rounded text-sm space-y-1">
                    {importResult.errors.map((error, index) => (
                      <div key={index} className="text-red-700">
                        • {error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}