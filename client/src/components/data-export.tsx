import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Download, FileDown, Package, Calendar } from 'lucide-react';
import { toast } from 'sonner';

interface ExportStats {
  totalRecipes: number;
  totalMealPlans: number;
  totalShoppingLists: number;
  lastUpdated: string;
}

interface ExportOptions {
  includeRecipes: boolean;
  includeMealPlans: boolean;
  includeShoppingLists: boolean;
  format: 'json' | 'csv' | 'zip';
  dateRange?: {
    startDate: string;
    endDate: string;
  };
}

export default function DataExport() {
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    includeRecipes: true,
    includeMealPlans: true,
    includeShoppingLists: true,
    format: 'json'
  });

  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: ''
  });

  const [useDateRange, setUseDateRange] = useState(false);

  // Fetch export statistics
  const { data: stats, isLoading: statsLoading } = useQuery<ExportStats>({
    queryKey: ['/api/data/export/stats'],
    queryFn: async () => {
      const response = await fetch('/api/data/export/stats');
      if (!response.ok) throw new Error('Failed to fetch export stats');
      return response.json();
    }
  });

  // Export mutation
  const exportMutation = useMutation({
    mutationFn: async (options: ExportOptions) => {
      const requestOptions = {
        ...options,
        ...(useDateRange && dateRange.startDate && dateRange.endDate ? {
          dateRange: {
            startDate: new Date(dateRange.startDate).toISOString(),
            endDate: new Date(dateRange.endDate).toISOString()
          }
        } : {})
      };

      const response = await fetch('/api/data/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestOptions),
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Get filename from response headers
      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition
        ? contentDisposition.split('filename=')[1]?.replace(/"/g, '')
        : `mealmate-export-${new Date().toISOString().split('T')[0]}.${options.format}`;

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      return { filename };
    },
    onSuccess: (data) => {
      toast.success(`Export completed successfully! Downloaded: ${data.filename}`);
    },
    onError: (error) => {
      toast.error(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  const handleExport = () => {
    if (!exportOptions.includeRecipes && !exportOptions.includeMealPlans && !exportOptions.includeShoppingLists) {
      toast.error('Please select at least one data type to export');
      return;
    }

    if (useDateRange && (!dateRange.startDate || !dateRange.endDate)) {
      toast.error('Please provide both start and end dates for date range filtering');
      return;
    }

    exportMutation.mutate(exportOptions);
  };

  const getFormatDescription = (format: string) => {
    switch (format) {
      case 'json':
        return 'Single JSON file with all data. Best for backup and import.';
      case 'csv':
        return 'ZIP archive with separate CSV files. Good for spreadsheet analysis.';
      case 'zip':
        return 'ZIP archive with JSON files. Organized structure with metadata.';
      default:
        return '';
    }
  };

  if (statsLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Download className="h-5 w-5" />
            <span>Data Export</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-3/4"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
            <div className="h-4 bg-muted rounded w-2/3"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Download className="h-5 w-5" />
          <span>Data Export</span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Export your data in various formats for backup or analysis
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Data Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="text-center p-4 border rounded-lg">
            <div className="text-2xl font-bold text-primary">{stats?.totalRecipes || 0}</div>
            <div className="text-sm text-muted-foreground">Recipes</div>
          </div>
          <div className="text-center p-4 border rounded-lg">
            <div className="text-2xl font-bold text-primary">{stats?.totalMealPlans || 0}</div>
            <div className="text-sm text-muted-foreground">Meal Plans</div>
          </div>
          <div className="text-center p-4 border rounded-lg">
            <div className="text-2xl font-bold text-primary">{stats?.totalShoppingLists || 0}</div>
            <div className="text-sm text-muted-foreground">Shopping Lists</div>
          </div>
        </div>

        <Separator />

        {/* Data Type Selection */}
        <div className="space-y-4">
          <Label className="text-base font-medium">Select Data Types</Label>
          <div className="grid grid-cols-1 gap-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="recipes"
                checked={exportOptions.includeRecipes}
                onCheckedChange={(checked) => 
                  setExportOptions(prev => ({ ...prev, includeRecipes: !!checked }))
                }
              />
              <Label htmlFor="recipes" className="cursor-pointer">
                Recipes ({stats?.totalRecipes || 0} items)
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="mealplans"
                checked={exportOptions.includeMealPlans}
                onCheckedChange={(checked) => 
                  setExportOptions(prev => ({ ...prev, includeMealPlans: !!checked }))
                }
              />
              <Label htmlFor="mealplans" className="cursor-pointer">
                Meal Plans ({stats?.totalMealPlans || 0} items)
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="shopping"
                checked={exportOptions.includeShoppingLists}
                onCheckedChange={(checked) => 
                  setExportOptions(prev => ({ ...prev, includeShoppingLists: !!checked }))
                }
              />
              <Label htmlFor="shopping" className="cursor-pointer">
                Shopping Lists ({stats?.totalShoppingLists || 0} items)
              </Label>
            </div>
          </div>
        </div>

        <Separator />

        {/* Date Range Filter */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="daterange"
              checked={useDateRange}
              onCheckedChange={(checked) => setUseDateRange(!!checked)}
            />
            <Label htmlFor="daterange" className="cursor-pointer flex items-center space-x-2">
              <Calendar className="h-4 w-4" />
              <span>Filter by Date Range</span>
            </Label>
          </div>
          
          {useDateRange && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-lg bg-muted/50">
              <div>
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="endDate">End Date</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                />
              </div>
              <div className="col-span-full text-sm text-muted-foreground">
                Date range applies to meal plans and shopping lists based on their creation dates.
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Format Selection */}
        <div className="space-y-4">
          <Label className="text-base font-medium">Export Format</Label>
          <Select 
            value={exportOptions.format} 
            onValueChange={(value) => 
              setExportOptions(prev => ({ ...prev, format: value as 'json' | 'csv' | 'zip' }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select format" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="json">
                <div className="flex items-center space-x-2">
                  <FileDown className="h-4 w-4" />
                  <span>JSON</span>
                </div>
              </SelectItem>
              <SelectItem value="csv">
                <div className="flex items-center space-x-2">
                  <Package className="h-4 w-4" />
                  <span>CSV (ZIP)</span>
                </div>
              </SelectItem>
              <SelectItem value="zip">
                <div className="flex items-center space-x-2">
                  <Package className="h-4 w-4" />
                  <span>ZIP Archive</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            {getFormatDescription(exportOptions.format)}
          </p>
        </div>

        {/* Export Button */}
        <div className="pt-4">
          <Button 
            onClick={handleExport} 
            disabled={exportMutation.isPending}
            className="w-full"
            size="lg"
          >
            {exportMutation.isPending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Export Data
              </>
            )}
          </Button>
        </div>

        {stats?.lastUpdated && (
          <p className="text-xs text-muted-foreground text-center">
            Last updated: {new Date(stats.lastUpdated).toLocaleString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}