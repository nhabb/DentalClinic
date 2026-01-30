"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  FaTooth,
  FaArrowLeft,
  FaCreditCard,
  FaFileInvoiceDollar,
  FaMoneyBillWave,
  FaCheckCircle,
  FaClock,
  FaExclamationCircle,
  FaDownload,
  FaEye,
  FaCalendarAlt,
  FaReceipt,
  FaWallet,
  FaUniversity,
  FaSearch,
  FaFilter,
  FaChevronRight,
  FaShieldAlt,
  FaPercentage,
} from "react-icons/fa";

// TODO: Fetch from API
const billingSummary = {
  totalOutstanding: 0,
  dueDate: "",
  lastPayment: {
    amount: 0,
    date: "",
  },
  insurancePending: 0,
};

// TODO: Fetch from API
const invoices: {
  id: string;
  date: string;
  description: string;
  amount: number;
  insuranceCovered: number;
  patientResponsibility: number;
  status: string;
  paidDate?: string;
  dueDate?: string;
}[] = [];

// TODO: Fetch from API
const paymentHistory: {
  id: number;
  date: string;
  amount: number;
  method: string;
  cardLast4?: string;
  reference?: string;
  invoiceId: string;
  status: string;
}[] = [];

// TODO: Fetch from API
const paymentMethods: {
  id: number;
  type: string;
  name: string;
  expiry?: string;
  accountLast4?: string;
  isDefault: boolean;
}[] = [];

// TODO: Fetch from API
const insuranceClaims: {
  id: string;
  invoiceId: string;
  submittedDate: string;
  amount: number;
  status: string;
  provider: string;
  paidDate?: string;
}[] = [];

export default function Billing() {
  const [activeTab, setActiveTab] = useState<"invoices" | "payments" | "insurance">("invoices");
  const [searchQuery, setSearchQuery] = useState("");
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-LB").format(amount) + " LBP";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
      case "completed":
      case "approved":
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
            <FaCheckCircle className="text-xs" />
            {status === "approved" ? "Approved" : "Paid"}
          </span>
        );
      case "pending":
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">
            <FaClock className="text-xs" />
            Pending
          </span>
        );
      case "insurance_pending":
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
            <FaShieldAlt className="text-xs" />
            Insurance Pending
          </span>
        );
      case "processing":
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
            <FaClock className="text-xs" />
            Processing
          </span>
        );
      case "overdue":
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">
            <FaExclamationCircle className="text-xs" />
            Overdue
          </span>
        );
      default:
        return null;
    }
  };

  const pendingInvoices = invoices.filter(
    (inv) => inv.status === "pending" || inv.status === "insurance_pending"
  );
  const totalPending = pendingInvoices.reduce((sum, inv) => sum + inv.patientResponsibility, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-primary-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <Link href="/patient-dashboard" className="flex items-center space-x-2">
              <div className="w-10 h-10 bg-gradient-to-br from-dental-blue to-dental-teal rounded-lg flex items-center justify-center">
                <FaTooth className="text-white text-xl" />
              </div>
              <span className="text-xl font-bold text-gray-900">BrightSmile</span>
            </Link>
            <Link
              href="/patient-dashboard"
              className="text-gray-600 hover:text-dental-blue transition-colors flex items-center gap-2"
            >
              <FaArrowLeft className="text-sm" />
              Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Title */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Billing & Payments</h1>
            <p className="text-gray-600">Manage your invoices, payments, and insurance claims</p>
          </div>
          {totalPending > 0 && (
            <Button
              onClick={() => setShowPaymentModal(true)}
              className="bg-dental-blue hover:bg-dental-blue/90"
            >
              <FaCreditCard className="mr-2" />
              Make a Payment
            </Button>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                <FaFileInvoiceDollar className="text-red-600 text-xl" />
              </div>
              {totalPending > 0 && (
                <span className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded-full font-medium">
                  Due {new Date(billingSummary.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mb-1">Outstanding Balance</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalPending)}</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <FaShieldAlt className="text-blue-600 text-xl" />
              </div>
            </div>
            <p className="text-sm text-gray-500 mb-1">Insurance Pending</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(billingSummary.insurancePending)}</p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <FaMoneyBillWave className="text-green-600 text-xl" />
              </div>
            </div>
            <p className="text-sm text-gray-500 mb-1">Last Payment</p>
            <p className="text-2xl font-bold text-gray-900">{formatCurrency(billingSummary.lastPayment.amount)}</p>
            <p className="text-xs text-gray-400 mt-1">
              {new Date(billingSummary.lastPayment.date).toLocaleDateString()}
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                <FaPercentage className="text-purple-600 text-xl" />
              </div>
            </div>
            <p className="text-sm text-gray-500 mb-1">Insurance Coverage</p>
            <p className="text-2xl font-bold text-gray-900">80%</p>
            <p className="text-xs text-gray-400 mt-1">Globemed Plan</p>
          </div>
        </div>

        {/* Outstanding Balance Alert */}
        {totalPending > 0 && (
          <div className="bg-gradient-to-r from-dental-blue to-dental-teal rounded-2xl p-6 mb-8 text-white">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
                  <FaWallet className="text-2xl" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Outstanding Balance</h3>
                  <p className="text-white/80 text-sm">
                    You have {pendingInvoices.length} pending invoice(s) totaling {formatCurrency(totalPending)}
                  </p>
                </div>
              </div>
              <Button
                onClick={() => setShowPaymentModal(true)}
                className="bg-white text-dental-blue hover:bg-white/90"
              >
                Pay Now
                <FaChevronRight className="ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* Payment Methods */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-gray-900">Payment Methods</h2>
            <Button variant="outline" size="sm">
              Add New
            </Button>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {paymentMethods.map((method) => (
              <div
                key={method.id}
                className={`flex items-center justify-between p-4 rounded-xl border-2 ${
                  method.isDefault ? "border-dental-blue bg-dental-blue/5" : "border-gray-200"
                }`}
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      method.type === "credit_card" ? "bg-blue-100" : "bg-green-100"
                    }`}
                  >
                    {method.type === "credit_card" ? (
                      <FaCreditCard className="text-blue-600 text-xl" />
                    ) : (
                      <FaUniversity className="text-green-600 text-xl" />
                    )}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{method.name}</p>
                    <p className="text-sm text-gray-500">
                      {method.type === "credit_card" ? `Expires ${method.expiry}` : `****${method.accountLast4}`}
                    </p>
                  </div>
                </div>
                {method.isDefault && (
                  <span className="text-xs text-dental-blue bg-dental-blue/10 px-2 py-1 rounded-full font-medium">
                    Default
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab("invoices")}
            className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === "invoices"
                ? "bg-white text-dental-blue shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <FaFileInvoiceDollar className="inline mr-2" />
            Invoices
          </button>
          <button
            onClick={() => setActiveTab("payments")}
            className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === "payments"
                ? "bg-white text-dental-blue shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <FaReceipt className="inline mr-2" />
            Payment History
          </button>
          <button
            onClick={() => setActiveTab("insurance")}
            className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === "insurance"
                ? "bg-white text-dental-blue shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <FaShieldAlt className="inline mr-2" />
            Insurance Claims
          </button>
        </div>

        {/* Invoices Tab */}
        {activeTab === "invoices" && (
          <div className="animate-fadeIn">
            {/* Search */}
            <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
              <div className="flex gap-4">
                <div className="flex-1 relative">
                  <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search invoices..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
                  />
                </div>
                <Button variant="outline" className="px-4">
                  <FaFilter className="mr-2" />
                  Filter
                </Button>
              </div>
            </div>

            {/* Invoice List */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left py-4 px-6 text-sm font-semibold text-gray-600">Invoice</th>
                      <th className="text-left py-4 px-6 text-sm font-semibold text-gray-600">Description</th>
                      <th className="text-right py-4 px-6 text-sm font-semibold text-gray-600">Amount</th>
                      <th className="text-right py-4 px-6 text-sm font-semibold text-gray-600">Insurance</th>
                      <th className="text-right py-4 px-6 text-sm font-semibold text-gray-600">Your Cost</th>
                      <th className="text-center py-4 px-6 text-sm font-semibold text-gray-600">Status</th>
                      <th className="text-center py-4 px-6 text-sm font-semibold text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {invoices.map((invoice) => (
                      <tr key={invoice.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-4 px-6">
                          <p className="font-semibold text-gray-900">{invoice.id}</p>
                          <p className="text-xs text-gray-500">
                            {new Date(invoice.date).toLocaleDateString()}
                          </p>
                        </td>
                        <td className="py-4 px-6">
                          <p className="text-gray-700 text-sm">{invoice.description}</p>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <p className="font-medium text-gray-900">{formatCurrency(invoice.amount)}</p>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <p className="text-green-600 text-sm">-{formatCurrency(invoice.insuranceCovered)}</p>
                        </td>
                        <td className="py-4 px-6 text-right">
                          <p className="font-bold text-gray-900">{formatCurrency(invoice.patientResponsibility)}</p>
                        </td>
                        <td className="py-4 px-6 text-center">{getStatusBadge(invoice.status)}</td>
                        <td className="py-4 px-6">
                          <div className="flex justify-center gap-2">
                            <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-dental-blue transition-colors">
                              <FaEye />
                            </button>
                            <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-dental-blue transition-colors">
                              <FaDownload />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Payment History Tab */}
        {activeTab === "payments" && (
          <div className="animate-fadeIn">
            <div className="space-y-4">
              {paymentHistory.map((payment) => (
                <div
                  key={payment.id}
                  className="bg-white rounded-2xl shadow-sm p-6 flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-green-100 rounded-2xl flex items-center justify-center">
                      <FaCheckCircle className="text-green-600 text-2xl" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-lg">{formatCurrency(payment.amount)}</p>
                      <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                        <span className="flex items-center gap-1">
                          <FaCalendarAlt className="text-dental-blue" />
                          {new Date(payment.date).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </span>
                        <span>•</span>
                        <span>{payment.method}</span>
                        {payment.cardLast4 && <span>****{payment.cardLast4}</span>}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">Invoice: {payment.invoiceId}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {getStatusBadge(payment.status)}
                    <Button variant="outline" size="sm">
                      <FaDownload className="mr-2" />
                      Receipt
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Insurance Claims Tab */}
        {activeTab === "insurance" && (
          <div className="animate-fadeIn">
            {/* Insurance Info Card */}
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-6 mb-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                  <FaShieldAlt className="text-blue-600 text-2xl" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">Globemed Insurance</h3>
                  <p className="text-gray-600 text-sm">Policy: GLB-2025-78945 • Coverage: 80%</p>
                  <p className="text-xs text-gray-500 mt-1">Valid until December 31, 2026</p>
                </div>
              </div>
            </div>

            {/* Claims List */}
            <div className="space-y-4">
              {insuranceClaims.map((claim) => (
                <div
                  key={claim.id}
                  className="bg-white rounded-2xl shadow-sm p-6"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                          claim.status === "approved"
                            ? "bg-green-100"
                            : "bg-purple-100"
                        }`}
                      >
                        <FaShieldAlt
                          className={
                            claim.status === "approved" ? "text-green-600 text-xl" : "text-purple-600 text-xl"
                          }
                        />
                      </div>
                      <div>
                        <p className="font-bold text-gray-900">{claim.id}</p>
                        <p className="text-sm text-gray-500">Invoice: {claim.invoiceId}</p>
                      </div>
                    </div>
                    {getStatusBadge(claim.status)}
                  </div>

                  <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-xl">
                    <div>
                      <p className="text-xs text-gray-500">Claim Amount</p>
                      <p className="font-semibold text-gray-900">{formatCurrency(claim.amount)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Submitted</p>
                      <p className="font-semibold text-gray-900">
                        {new Date(claim.submittedDate).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">
                        {claim.status === "approved" ? "Paid On" : "Status"}
                      </p>
                      <p className="font-semibold text-gray-900">
                        {claim.paidDate
                          ? new Date(claim.paidDate).toLocaleDateString()
                          : "In Review"}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payment Modal Placeholder */}
        {showPaymentModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Make a Payment</h2>

              <div className="bg-gray-50 rounded-xl p-4 mb-6">
                <p className="text-sm text-gray-500">Amount Due</p>
                <p className="text-3xl font-bold text-gray-900">{formatCurrency(totalPending)}</p>
              </div>

              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Payment Method
                  </label>
                  <select className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue">
                    <option>Visa ending in 4242</option>
                    <option>Bank Audi - Savings</option>
                    <option>Add new payment method</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Amount
                  </label>
                  <input
                    type="text"
                    defaultValue={formatCurrency(totalPending)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setShowPaymentModal(false)}
                >
                  Cancel
                </Button>
                <Button className="flex-1 bg-dental-blue hover:bg-dental-blue/90">
                  Pay {formatCurrency(totalPending)}
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
