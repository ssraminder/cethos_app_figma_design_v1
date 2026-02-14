import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { setCustomerSession } from "@/context/CustomerAuthContext";

export default function LoginVerify() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState<"verifying" | "success" | "error">(
    "verifying",
  );
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("error");
      setErrorMessage("Invalid login link. No token found.");
      return;
    }
    verifyToken(token);
  }, [searchParams]);

  const verifyToken = async (token: string) => {
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/verify-customer-login-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
            apikey: supabaseKey,
          },
          body: JSON.stringify({ token }),
        },
      );

      const data = await response.json();

      if (!data.success) {
        setStatus("error");
        setErrorMessage(
          data.error || "This login link is invalid or has expired.",
        );
        return;
      }

      setCustomerSession(data.session, data.customer);
      setStatus("success");
      setTimeout(() => navigate("/dashboard", { replace: true }), 1500);
    } catch (err) {
      setStatus("error");
      setErrorMessage("Something went wrong. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="https://lmzoyezvsjgsxveoakdr.supabase.co/storage/v1/object/public/web-assets/png_logo_cethos_light_bg.png"
            alt="Cethos Translation Services"
            className="h-10 mx-auto"
          />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          {/* Verifying */}
          {status === "verifying" && (
            <>
              <div className="flex justify-center mb-4">
                <div
                  className="w-10 h-10 border-4 border-gray-200 rounded-full animate-spin"
                  style={{ borderTopColor: "#0891B2" }}
                />
              </div>
              <h1
                className="text-xl font-bold mb-2"
                style={{ color: "#0C2340" }}
              >
                Verifying your login...
              </h1>
              <p className="text-gray-500 text-sm">Please wait.</p>
            </>
          )}

          {/* Success */}
          {status === "success" && (
            <>
              <div className="text-5xl mb-4">&#9989;</div>
              <h1
                className="text-xl font-bold mb-2"
                style={{ color: "#0C2340" }}
              >
                Login successful!
              </h1>
              <p className="text-gray-500 text-sm">
                Redirecting to your dashboard...
              </p>
            </>
          )}

          {/* Error */}
          {status === "error" && (
            <>
              <div className="text-5xl mb-4">&#9888;&#65039;</div>
              <h1
                className="text-xl font-bold mb-2"
                style={{ color: "#0C2340" }}
              >
                Login link expired
              </h1>
              <p className="text-gray-500 text-sm mb-6">{errorMessage}</p>
              <Link
                to="/login"
                className="inline-block w-full py-3 rounded-lg text-white font-semibold text-sm text-center"
                style={{ backgroundColor: "#0891B2" }}
              >
                Request a New Login Link
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
