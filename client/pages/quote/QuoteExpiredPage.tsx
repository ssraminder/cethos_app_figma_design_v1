import { useNavigate, useLocation } from 'react-router-dom';
import { Clock, FileText, RefreshCw } from 'lucide-react';

const QuoteExpiredPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const quoteNumber = location.state?.quoteNumber || 'Unknown';
  const documentsCount = location.state?.documentsCount || 0;

  const handleStartNewQuote = () => {
    // Get entry point before clearing
    let entryPoint = 'upload_form';
    try {
      const uploadDraft = localStorage.getItem('cethos_upload_draft');
      const quoteDraft = localStorage.getItem('cethos_quote_draft');
      
      if (uploadDraft) {
        entryPoint = JSON.parse(uploadDraft)?.entryPoint || 'upload_form';
      } else if (quoteDraft) {
        entryPoint = JSON.parse(quoteDraft)?.entryPoint || 'upload_form';
      }
    } catch (e) {
      console.error('Error reading entryPoint:', e);
    }

    // Clear storage
    localStorage.removeItem('cethos_upload_draft');
    localStorage.removeItem('cethos_quote_draft');

    // Navigate based on entry point
    if (entryPoint === 'order_form') {
      navigate('/quote?step=1', { replace: true });
    } else {
      navigate('/upload?step=1', { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-xl shadow-lg p-8 text-center">
          {/* Icon */}
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Clock className="w-10 h-10 text-red-600" />
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Quote Expired
          </h1>

          {/* Message */}
          <p className="text-gray-600 mb-6">
            This quote has expired and is no longer valid. Quotes are valid for 30 days from creation.
          </p>

          {/* Quote Details Box */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-center gap-2 text-gray-600 mb-2">
              <FileText className="w-4 h-4" />
              <span className="text-sm">Quote Reference</span>
            </div>
            <p className="text-lg font-semibold text-gray-900">{quoteNumber}</p>
            {documentsCount > 0 && (
              <p className="text-sm text-gray-500 mt-1">
                {documentsCount} document{documentsCount > 1 ? 's' : ''}
              </p>
            )}
          </div>

          {/* Info Box */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm text-amber-800">
              <strong>Why do quotes expire?</strong><br />
              Translation pricing may change based on current rates and document complexity. 
              A new quote ensures you receive accurate, up-to-date pricing.
            </p>
          </div>

          {/* CTA Button */}
          <button
            onClick={handleStartNewQuote}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
            Request New Quote
          </button>

          {/* Help Link */}
          <p className="mt-4 text-sm text-gray-500">
            Need help?{' '}
            <a href="mailto:support@cethos.com" className="text-teal-600 hover:underline">
              Contact Support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default QuoteExpiredPage;
