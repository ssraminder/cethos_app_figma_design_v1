// client/components/pdf-manager/CombinePreview.tsx
// Shows thumbnail preview of combined result with page count badges

import { useEffect, useState } from 'react';
import { Loader2, FileText } from 'lucide-react';
import { usePdfManager } from '../../context/PdfManagerContext';
import { generateThumbnail } from '../../utils/pdfOperations';

interface ThumbnailEntry {
  clientId: string;
  name: string;
  thumbnailUrl: string | null;
  pageCount: number;
}

export default function CombinePreview() {
  const { state } = usePdfManager();
  const [thumbnails, setThumbnails] = useState<ThumbnailEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (state.files.length === 0) {
      setThumbnails([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    async function loadThumbnails() {
      const results: ThumbnailEntry[] = [];

      for (const pdfFile of state.files) {
        if (cancelled) return;

        let thumbnailUrl: string | null = null;
        try {
          if (pdfFile.file.type === 'application/pdf') {
            const ab = await pdfFile.file.arrayBuffer();
            thumbnailUrl = await generateThumbnail(ab, 1, 0.25);
          } else {
            // For images, create object URL
            thumbnailUrl = URL.createObjectURL(pdfFile.file);
          }
        } catch {
          // Thumbnail generation failed — show placeholder
        }

        results.push({
          clientId: pdfFile.clientId,
          name: pdfFile.name,
          thumbnailUrl,
          pageCount: pdfFile.pageCount,
        });
      }

      if (!cancelled) {
        setThumbnails(results);
        setLoading(false);
      }
    }

    loadThumbnails();

    return () => {
      cancelled = true;
      // Revoke image object URLs
      thumbnails.forEach(t => {
        if (t.thumbnailUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(t.thumbnailUrl);
        }
      });
    };
  }, [state.files]);

  if (state.files.length === 0) return null;

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Combined Preview
      </h3>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 text-teal-600 animate-spin" />
          <span className="ml-2 text-sm text-gray-500">Generating previews...</span>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {thumbnails.map((thumb, idx) => (
            <div
              key={thumb.clientId}
              className="relative group"
              title={thumb.name}
            >
              {thumb.thumbnailUrl ? (
                <img
                  src={thumb.thumbnailUrl}
                  alt={thumb.name}
                  className="h-24 w-auto rounded border border-gray-200 shadow-sm object-cover"
                />
              ) : (
                <div className="h-24 w-[68px] rounded border border-gray-200 bg-gray-100 flex items-center justify-center">
                  <FileText className="h-6 w-6 text-gray-400" />
                </div>
              )}

              {/* Page count badge */}
              <span className="absolute -top-1.5 -right-1.5 bg-teal-600 text-white text-[10px] font-bold rounded-full h-5 min-w-[20px] flex items-center justify-center px-1">
                {thumb.pageCount}
              </span>

              {/* Order number */}
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] rounded px-1.5">
                {idx + 1}
              </span>
            </div>
          ))}

          {/* Arrow showing combined result */}
          {thumbnails.length >= 2 && (
            <div className="flex items-center px-2">
              <div className="text-center">
                <div className="text-lg text-gray-400">&rarr;</div>
                <span className="text-[10px] text-gray-400 block">
                  {state.files.reduce((s, f) => s + f.pageCount, 0)} pages
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
