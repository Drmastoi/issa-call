import { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function MediTask() {
  const [isLoading, setIsLoading] = useState(true);

  const externalUrl = 'https://med-task-genesis.lovable.app';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-card">
        <div>
          <h1 className="text-xl font-semibold text-foreground">MediTask</h1>
          <p className="text-sm text-muted-foreground">Care Home Task Management</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open(externalUrl, '_blank')}
          className="gap-2"
        >
          <ExternalLink className="h-4 w-4" />
          Open in new tab
        </Button>
      </div>

      {/* Iframe Container */}
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading MediTask...</p>
            </div>
          </div>
        )}
        <iframe
          src={externalUrl}
          className="w-full h-full border-0"
          title="MediTask - Care Home Task Management"
          onLoad={() => setIsLoading(false)}
          allow="clipboard-write"
        />
      </div>
    </div>
  );
}
