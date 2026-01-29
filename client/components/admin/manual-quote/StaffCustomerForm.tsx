import { AlertCircle } from "lucide-react";

export default function StaffCustomerForm() {
  return (
    <div className="space-y-4">
      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 flex gap-2">
        <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-yellow-800">
          Customer form component - Placeholder
        </p>
      </div>
    </div>
  );
}
