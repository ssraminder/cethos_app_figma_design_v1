import { useNavigate } from "react-router-dom";
import { ManualQuoteForm } from "@/components/admin/manual-quote";

export default function ManualQuoteCreate() {
  const navigate = useNavigate();

  const handleComplete = (quoteId: string) => {
    // Navigate to quote detail page
    navigate(`/admin/quotes/${quoteId}`);
  };

  const handleCancel = () => {
    // Navigate back to quotes list
    navigate("/admin/quotes");
  };

  return (
    <ManualQuoteForm onComplete={handleComplete} onCancel={handleCancel} />
  );
}
