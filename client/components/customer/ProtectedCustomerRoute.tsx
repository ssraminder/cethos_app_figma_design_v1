import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/CustomerAuthContext";

export default function ProtectedCustomerRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { customer, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !customer) {
      // Redirect to login if not authenticated
      navigate("/", { replace: true });
    }
  }, [customer, loading, navigate]);

  // Show loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render anything if not authenticated (will redirect)
  if (!customer) {
    return null;
  }

  return <>{children}</>;
}
