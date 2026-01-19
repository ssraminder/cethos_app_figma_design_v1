import { useState } from "react";
import { Save } from "lucide-react";

export default function SaveForLater() {
  const [email, setEmail] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle email submission
    console.log("Email:", email);
  };

  const isValidEmail = email.length > 0 && email.includes("@");

  return (
    <div className="w-full border-2 border-dashed border-cethos-border rounded-xl bg-background p-6">
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-1">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-cethos-blue"
            >
              <path
                d="M15.2 3C15.7275 3.00751 16.2307 3.22317 16.6 3.6L20.4 7.4C20.7768 7.76926 20.9925 8.27246 21 8.8V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H15.2Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M17 21V14C17 13.7348 16.8946 13.4804 16.7071 13.2929C16.5196 13.1054 16.2652 13 16 13H8C7.73478 13 7.48043 13.1054 7.29289 13.2929C7.10536 13.4804 7 13.7348 7 14V21"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M7 3V7C7 7.26522 7.10536 7.51957 7.29289 7.70711C7.48043 7.89464 7.73478 8 8 8H15"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="flex-1">
            <h3 className="text-cethos-slate-dark text-base font-semibold mb-1">
              Save and continue later?
            </h3>
            <p className="text-cethos-slate text-sm">
              We'll email you a link to return to your quote
            </p>
          </div>
        </div>

        {/* Email Input Form */}
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
            className="flex-1 h-10 px-4 rounded-lg border border-cethos-border focus:outline-none focus:ring-2 focus:ring-cethos-blue focus:border-transparent text-sm"
          />
          <button
            type="submit"
            disabled={!isValidEmail}
            className={`h-10 px-4 rounded-lg font-semibold text-sm text-white transition-all whitespace-nowrap ${
              isValidEmail
                ? "bg-cethos-blue hover:bg-blue-600"
                : "bg-secondary cursor-not-allowed"
            }`}
          >
            Send Link
          </button>
        </form>
      </div>
    </div>
  );
}
