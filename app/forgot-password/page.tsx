"use client";

import Link from "next/link";
import { useState } from "react";
import { FaTooth } from "react-icons/fa";
import { ArrowLeft, CheckCircle } from "lucide-react";

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const [email, setEmail] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Handle password reset request
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 sm:px-6 lg:px-8 gradient-auth-bg">
      <div className="max-w-md w-full">
        {/* Card Container */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 md:p-10 space-y-8">
          {/* Logo and Back Button */}
          <div className="text-center">
            <Link href="/" className="inline-flex items-center space-x-2">
              <div className="w-12 h-12 bg-gradient-to-br from-dental-blue to-dental-teal rounded-lg flex items-center justify-center shadow-lg">
                <FaTooth className="text-white text-2xl" />
              </div>
              <span className="text-2xl font-bold text-gray-900">
                BrightSmile
              </span>
            </Link>
          </div>

          {!submitted ? (
            <>
              {/* Header */}
              <div className="text-center">
                <h2 className="text-3xl font-bold text-gray-900">
                  Forgot Password?
                </h2>
                <p className="mt-2 text-sm text-gray-600">
                  No worries! Enter your email and we'll send you reset
                  instructions.
                </p>
              </div>

              {/* Reset Form */}
              <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Email address
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="appearance-none relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-auth-blue focus:border-transparent transition-all"
                    placeholder="Enter your email"
                  />
                </div>

                {/* Submit Button */}
                <div>
                  <button
                    type="submit"
                    className="w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white gradient-auth-card hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-auth-blue transition-all transform hover:scale-[1.02]"
                  >
                    Send Reset Link
                  </button>
                </div>

                {/* Back to Login */}
                <div className="text-center">
                  <Link
                    href="/login"
                    className="inline-flex items-center text-sm font-medium text-auth-blue hover:text-auth-blue-light"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to login
                  </Link>
                </div>
              </form>
            </>
          ) : (
            <>
              {/* Success Message */}
              <div className="text-center space-y-6">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>

                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    Check your email
                  </h2>
                  <p className="text-sm text-gray-600 mb-1">
                    We've sent password reset instructions to:
                  </p>
                  <p className="text-sm font-medium text-auth-blue">{email}</p>
                </div>

                <div className="bg-blue-50 rounded-lg p-4 text-left">
                  <p className="text-sm text-gray-700">
                    Didn't receive the email? Check your spam folder or{" "}
                    <button
                      onClick={() => setSubmitted(false)}
                      className="font-medium text-auth-blue hover:text-auth-blue-light underline"
                    >
                      try again
                    </button>
                  </p>
                </div>

                <Link
                  href="/login"
                  className="inline-flex items-center text-sm font-medium text-auth-blue hover:text-auth-blue-light"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to login
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
