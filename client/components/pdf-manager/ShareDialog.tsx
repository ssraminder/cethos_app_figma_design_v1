// client/components/pdf-manager/ShareDialog.tsx
// Generate share link with expiry and permissions

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Link2, Copy, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import type { PdfDocument, SharePermission } from '../../types/pdf-manager';

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: PdfDocument | null;
}

export default function ShareDialog({ open, onOpenChange, document }: ShareDialogProps) {
  const [permission, setPermission] = useState<SharePermission>('view');
  const [expiryDays, setExpiryDays] = useState('7');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCreate = async () => {
    if (!document) return;
    setIsCreating(true);

    try {
      const days = parseInt(expiryDays, 10);
      const expiresAt = days > 0
        ? new Date(Date.now() + days * 86400000).toISOString()
        : null;

      const { data, error } = await supabase
        .from('pdf_shares')
        .insert({
          document_id: document.id,
          permission,
          expires_at: expiresAt,
        })
        .select('share_token')
        .single();

      if (error) throw error;

      const url = `${window.location.origin}/share/${data.share_token}`;
      setShareUrl(url);
      toast.success('Share link created');
    } catch (err: any) {
      toast.error(`Failed: ${err.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Link copied');
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setShareUrl(null);
      setCopied(false);
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-teal-600" />
            Share Document
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {document && (
            <p className="text-sm text-gray-600">
              Sharing: <span className="font-medium">{document.name}</span>
            </p>
          )}

          {!shareUrl ? (
            <>
              {/* Permission */}
              <div className="space-y-1.5">
                <Label>Permission</Label>
                <div className="flex gap-2">
                  {(['view', 'annotate', 'edit'] as SharePermission[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPermission(p)}
                      className={`flex-1 py-1.5 px-2 text-xs rounded border transition-colors capitalize ${
                        permission === p
                          ? 'border-teal-500 bg-teal-50 text-teal-700 font-medium'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Expiry */}
              <div className="space-y-1.5">
                <Label htmlFor="expiry">Expires in (days)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="expiry"
                    type="number"
                    min="0"
                    value={expiryDays}
                    onChange={(e) => setExpiryDays(e.target.value)}
                    className="w-24"
                  />
                  <span className="text-xs text-gray-500">0 = never expires</span>
                </div>
              </div>
            </>
          ) : (
            /* Show share URL */
            <div className="space-y-2">
              <Label>Share Link</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={shareUrl}
                  readOnly
                  className="text-xs"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button
                  onClick={handleCopy}
                  className="p-2 rounded border border-gray-300 hover:bg-gray-50 shrink-0"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4 text-gray-600" />
                  )}
                </button>
              </div>
              <p className="text-xs text-gray-500">
                Permission: <span className="capitalize font-medium">{permission}</span>
                {expiryDays !== '0' && ` — Expires in ${expiryDays} day(s)`}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            onClick={() => handleClose(false)}
            className="px-4 py-2 text-sm rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
          >
            {shareUrl ? 'Done' : 'Cancel'}
          </button>
          {!shareUrl && (
            <button
              onClick={handleCreate}
              disabled={isCreating}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-40"
            >
              {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Create Link
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
