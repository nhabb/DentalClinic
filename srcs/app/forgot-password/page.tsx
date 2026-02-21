"use client";

import Link from "next/link";
import { useState } from "react";
import { FaTooth } from "react-icons/fa";
import { ArrowLeft, CheckCircle } from "lucide-react";

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const API_URL = process.env.DEFAULT_API_UTL;
  const [password, setPassword] = useState({
    oldPass: "",
    newPass: "",
    confirmPass: "",
  });

  const handleSubmit = () => {
    setSubmitted(true);
    console.log(password);
    console.log("test");
  };
  const handleChange = (e: any) => {
    setPassword({
      ...password,
      [e.target.name]: e.target.value,
    });
  };
  // const checkPass=()=>
  // {
  //     if (password.confirmPass === password.newPass)
  //         //
  //     else
  //       //
  // }
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
                  No worries! Reset your password.
                </p>
              </div>

              {/* Reset Form */}
              <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                <div>
                  <label
                    htmlFor="oldpass"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Old Password
                  </label>
                  <input
                    id="oldPass"
                    name="oldPass"
                    type="password"
                    autoComplete="password"
                    required
                    value={password.oldPass}
                    onChange={handleChange}
                    className="appearance-none relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-auth-blue focus:border-transparent transition-all"
                    placeholder="Enter your email"
                  />
                </div>
                <div>
                  <label
                    htmlFor="newPass"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    New Password
                  </label>
                  <input
                    id="newPass"
                    name="newPass"
                    type="password"
                    autoComplete="password"
                    required
                    value={password.newPass}
                    onChange={handleChange}
                    className="appearance-none relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-auth-blue focus:border-transparent transition-all"
                    placeholder="Enter your email"
                  />
                </div>

                <div>
                  <label
                    htmlFor="confirmPass"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Confirm Password
                  </label>
                  <input
                    id="confirmPass"
                    name="confirmPass"
                    type="password"
                    autoComplete="email"
                    required
                    value={password.confirmPass}
                    onChange={handleChange}
                    className="appearance-none relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-auth-blue focus:border-transparent transition-all"
                    placeholder="Enter your email"
                  />
                </div>
                {/* Submit Button */}
                <div>
                  <button
                    type="submit"
                    className="w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white gradient-auth-card hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-auth-blue transition-all transform hover:scale-[1.02]"
                    onClick={handleSubmit}
                  >
                    Reset Password
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
