import Navigation from "@/components/navigation";
import DataExport from "@/components/data-export";
import DataImport from "@/components/data-import";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Database, Shield, Bell } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center space-x-3">
            <Settings className="h-8 w-8 text-primary" />
            <div>
              <h2 className="text-3xl font-bold text-foreground">Settings</h2>
              <p className="text-muted-foreground mt-1">Manage your MealMate application settings</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="data" className="space-y-6">
          <TabsList className="grid w-full grid-cols-1 lg:grid-cols-4">
            <TabsTrigger value="data" className="flex items-center space-x-2">
              <Database className="h-4 w-4" />
              <span>Data Management</span>
            </TabsTrigger>
            <TabsTrigger value="privacy" className="flex items-center space-x-2" disabled>
              <Shield className="h-4 w-4" />
              <span>Privacy</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center space-x-2" disabled>
              <Bell className="h-4 w-4" />
              <span>Notifications</span>
            </TabsTrigger>
            <TabsTrigger value="advanced" className="flex items-center space-x-2" disabled>
              <Settings className="h-4 w-4" />
              <span>Advanced</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="data" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Database className="h-5 w-5" />
                  <span>Data Management</span>
                </CardTitle>
                <CardDescription>
                  Export your data for backup or migration, and import data from other sources.
                  Your data includes recipes, meal plans, and shopping lists.
                </CardDescription>
              </CardHeader>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <DataExport />
              <DataImport />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Important Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <h4 className="font-medium">Data Export:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                    <li>• JSON format is best for complete backup and re-import</li>
                    <li>• CSV format is ideal for spreadsheet analysis and reporting</li>
                    <li>• ZIP format provides organized structure with metadata</li>
                    <li>• Date range filtering applies to meal plans and shopping lists</li>
                  </ul>
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-medium">Data Import:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                    <li>• "Merge" strategy is recommended for importing additional data</li>
                    <li>• "Replace" strategy will overwrite existing items with the same IDs</li>
                    <li>• "Skip" strategy will only import new items, ignoring duplicates</li>
                    <li>• Data validation is recommended to ensure data integrity</li>
                  </ul>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium">Supported Formats:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                    <li>• JSON files (.json) - Full data structure with all fields</li>
                    <li>• ZIP archives (.zip) - Multiple JSON files organized by type</li>
                    <li>• Maximum file size: 50MB</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="privacy">
            <Card>
              <CardHeader>
                <CardTitle>Privacy Settings</CardTitle>
                <CardDescription>
                  Control how your data is shared and used.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Privacy settings will be available in a future update.</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle>Notification Settings</CardTitle>
                <CardDescription>
                  Manage your notification preferences.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Notification settings will be available in a future update.</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="advanced">
            <Card>
              <CardHeader>
                <CardTitle>Advanced Settings</CardTitle>
                <CardDescription>
                  Advanced configuration options for power users.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Advanced settings will be available in a future update.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}