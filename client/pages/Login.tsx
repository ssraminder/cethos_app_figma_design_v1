export default function Login() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl shadow-sm p-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
          Portal Login
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          Sign in to access your portal.
        </p>

        <form className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              className="w-full h-11 px-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-cethos-teal focus:border-transparent"
              placeholder="you@company.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              className="w-full h-11 px-3 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-cethos-teal focus:border-transparent"
              placeholder="••••••••"
            />
          </div>
          <button
            type="button"
            className="w-full h-11 bg-cethos-teal text-white rounded-lg font-semibold hover:bg-cethos-teal-light transition-colors"
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}
