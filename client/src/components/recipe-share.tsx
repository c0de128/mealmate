import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Share2, Copy, Download, Eye, Trash2, ExternalLink, Clock } from "lucide-react";

interface RecipeShareProps {
  recipeId: string;
  recipeName: string;
}

interface ShareLink {
  shareId: string;
  shareUrl: string;
  createdAt: string;
  expiresAt: string;
  allowPublicAccess: boolean;
  accessCount: number;
  lastAccessedAt: string | null;
}

export default function RecipeShare({ recipeId, recipeName }: RecipeShareProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expiresIn, setExpiresIn] = useState(30);
  const [allowPublicAccess, setAllowPublicAccess] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch existing share links
  const { data: shareLinks = [] } = useQuery({
    queryKey: [`/api/recipes/${recipeId}/share-links`],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/recipes/${recipeId}/share-links`);
      const data = await response.json();
      return data.shareLinks || [];
    },
    enabled: isOpen,
  });

  // Create share link mutation
  const createShareLinkMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/recipes/${recipeId}/share`, {
        recipeId,
        expiresIn,
        allowPublicAccess,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/recipes/${recipeId}/share-links`] });
      copyToClipboard(data.shareUrl);
      toast({ 
        title: "Share link created!", 
        description: "Link copied to clipboard" 
      });
    },
    onError: () => {
      toast({ 
        title: "Failed to create share link", 
        variant: "destructive" 
      });
    },
  });

  // Revoke share link mutation
  const revokeShareLinkMutation = useMutation({
    mutationFn: async (shareId: string) => {
      return apiRequest('DELETE', `/api/share/${shareId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/recipes/${recipeId}/share-links`] });
      toast({ title: "Share link revoked" });
    },
    onError: () => {
      toast({ 
        title: "Failed to revoke share link", 
        variant: "destructive" 
      });
    },
  });

  // Export recipe mutation
  const exportRecipeMutation = useMutation({
    mutationFn: async (format: string) => {
      const response = await apiRequest('GET', `/api/recipes/${recipeId}/export?format=${format}`);
      
      if (format === 'json') {
        const data = await response.json();
        downloadJson(data, `${recipeName}_recipe.json`);
      } else {
        const text = await response.text();
        const extension = format === 'markdown' ? 'md' : 'txt';
        downloadText(text, `${recipeName}_recipe.${extension}`);
      }
    },
    onSuccess: () => {
      toast({ title: "Recipe exported successfully!" });
    },
    onError: () => {
      toast({ 
        title: "Failed to export recipe", 
        variant: "destructive" 
      });
    },
  });

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isExpired = (expiresAt: string) => {
    return new Date(expiresAt) < new Date();
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-share-recipe">
          <Share2 className="h-4 w-4 mr-2" />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share Recipe: {recipeName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Create New Share Link */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Create Share Link</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="expires-in">Expires in (days)</Label>
                  <Input
                    id="expires-in"
                    type="number"
                    min="1"
                    max="365"
                    value={expiresIn}
                    onChange={(e) => setExpiresIn(parseInt(e.target.value) || 30)}
                    data-testid="input-expires-in"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="public-access">Allow Public Access</Label>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="public-access"
                      checked={allowPublicAccess}
                      onCheckedChange={setAllowPublicAccess}
                      data-testid="switch-public-access"
                    />
                    <span className="text-sm text-muted-foreground">
                      {allowPublicAccess ? "Anyone with link" : "Private"}
                    </span>
                  </div>
                </div>
              </div>
              
              <Button
                onClick={() => createShareLinkMutation.mutate()}
                disabled={createShareLinkMutation.isPending}
                className="w-full"
                data-testid="button-create-share-link"
              >
                <Share2 className="h-4 w-4 mr-2" />
                {createShareLinkMutation.isPending ? "Creating..." : "Create Share Link"}
              </Button>
            </CardContent>
          </Card>

          {/* Export Options */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Export Recipe</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportRecipeMutation.mutate('json')}
                  disabled={exportRecipeMutation.isPending}
                  data-testid="button-export-json"
                >
                  <Download className="h-4 w-4 mr-2" />
                  JSON
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportRecipeMutation.mutate('text')}
                  disabled={exportRecipeMutation.isPending}
                  data-testid="button-export-text"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Text
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportRecipeMutation.mutate('markdown')}
                  disabled={exportRecipeMutation.isPending}
                  data-testid="button-export-markdown"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Markdown
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Existing Share Links */}
          {shareLinks.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Active Share Links</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {shareLinks.map((link: ShareLink) => (
                    <div
                      key={link.shareId}
                      className={`p-3 border rounded-lg ${
                        isExpired(link.expiresAt) ? 'bg-muted/50 border-muted' : 'bg-background border-border'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center space-x-2">
                            <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                              {link.shareId}
                            </code>
                            {isExpired(link.expiresAt) ? (
                              <Badge variant="destructive">Expired</Badge>
                            ) : (
                              <Badge variant="secondary">Active</Badge>
                            )}
                            {!link.allowPublicAccess && (
                              <Badge variant="outline">Private</Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            <div className="flex items-center space-x-4">
                              <span className="flex items-center">
                                <Clock className="h-3 w-3 mr-1" />
                                Expires: {formatDate(link.expiresAt)}
                              </span>
                              <span className="flex items-center">
                                <Eye className="h-3 w-3 mr-1" />
                                {link.accessCount} views
                              </span>
                            </div>
                            {link.lastAccessedAt && (
                              <div className="text-xs mt-1">
                                Last accessed: {formatDate(link.lastAccessedAt)}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(link.shareUrl)}
                            disabled={isExpired(link.expiresAt)}
                            data-testid={`button-copy-link-${link.shareId}`}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(link.shareUrl, '_blank')}
                            disabled={isExpired(link.expiresAt)}
                            data-testid={`button-open-link-${link.shareId}`}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => revokeShareLinkMutation.mutate(link.shareId)}
                            disabled={revokeShareLinkMutation.isPending}
                            className="text-destructive hover:text-destructive"
                            data-testid={`button-revoke-link-${link.shareId}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}