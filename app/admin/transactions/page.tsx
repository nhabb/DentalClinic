"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  FaTooth,
  FaCalendarAlt,
  FaBoxes,
  FaMoneyBillWave,
  FaUsers,
  FaChartLine,
  FaCog,
  FaSignOutAlt,
  FaSearch,
  FaPlus,
  FaArrowUp,
  FaArrowDown,
  FaFilter,
  FaDownload,
  FaWallet,
  FaReceipt,
  FaFileInvoiceDollar,
  FaShoppingCart,
  FaTools,
  FaUserMd,
  FaCheckCircle,
  FaClock,
  FaExclamationCircle,
} from "react-icons/fa";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

interface Transaction {
  id: number;
  date: string;
  time: string;
  type: string;
  category: string;
  description: string;
  amount: number;
  paymentMethod: string;
  reference: string;
  status: string;
}

interface ClinicFunds {
  currentBalance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  pendingPayments: number;
}

interface ExpenseCategory {
  name: string;
  icon: string;
  color: string;
  total: number;
}

export default function TransactionsPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "income" | "expense">(
    "all",
  );
  const [showAddModal, setShowAddModal] = useState(false);
  const [transactionType, setTransactionType] = useState<"income" | "expense">(
    "income",
  );

  // Role-based state
  const [userRole, setUserRole] = useState<string>("doctor");
  const [doctorId, setDoctorId] = useState<number | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Data state
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [clinicFunds, setClinicFunds] = useState<ClinicFunds>({
    currentBalance: 0,
    monthlyIncome: 0,
    monthlyExpenses: 0,
    pendingPayments: 0,
  });
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(true);

  // New transaction form state
  const [newTransaction, setNewTransaction] = useState({
    description: "",
    amount: "",
    category: "",
    paymentMethod: "Cash",
    date: new Date().toISOString().split("T")[0],
    notes: "",
  });

  // Check auth and load user data (auth disabled)
  useEffect(() => {
    // Auth disabled - allow access
    // const isAuthenticated = localStorage.getItem("adminAuth") === "true";
    // if (!isAuthenticated) {
    //   router.push("/admin/login");
    //   return;
    // }

    const role = localStorage.getItem("userRole") || "doctor";
    const storedDoctorId = localStorage.getItem("doctorId");
    const storedUser = localStorage.getItem("adminUser");

    // Only doctors can access this page (disabled for now)
    // if (role !== "doctor") {
    //   router.push("/admin");
    //   return;
    // }

    setUserRole(role);
    if (storedDoctorId) setDoctorId(parseInt(storedDoctorId));
    if (storedUser) setCurrentUser(JSON.parse(storedUser));
  }, [router]);

  // Fetch transactions and stats
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(false);
    };

    if (userRole === "doctor" && doctorId) {
      fetchData();
    }
  }, [userRole, doctorId]);

  const handleLogout = () => {
    localStorage.removeItem("adminAuth");
    localStorage.removeItem("authToken");
    localStorage.removeItem("adminUser");
    localStorage.removeItem("userRole");
    localStorage.removeItem("doctorId");
    localStorage.removeItem("assignedDoctorIds");
    // Logout disabled - no redirect
    // router.push("/admin/login");
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-LB").format(Math.abs(amount)) + " LBP";
  };

  const filteredTransactions = transactions.filter((txn) => {
    const matchesSearch =
      txn.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      txn.reference.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === "all" || txn.type === filterType;
    return matchesSearch && matchesType;
  });

  const totalIncome = transactions
    .filter((t) => t.type === "income" && t.status === "completed")
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExpenses = transactions
    .filter((t) => t.type === "expense" && t.status === "completed")
    .reduce((sum, t) => sum + t.amount, 0);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "Patient Payment":
        return <FaReceipt className="text-green-500" />;
      case "Insurance":
        return <FaFileInvoiceDollar className="text-blue-500" />;
      case "Supplies":
        return <FaShoppingCart className="text-orange-500" />;
      case "Maintenance":
        return <FaTools className="text-yellow-500" />;
      case "Utilities":
        return <FaMoneyBillWave className="text-red-500" />;
      case "Salary":
        return <FaUserMd className="text-purple-500" />;
      default:
        return <FaMoneyBillWave className="text-gray-500" />;
    }
  };

  const handleAddTransaction = async () => {
    // API call removed
    console.log("Transaction:", newTransaction, transactionType);

    // Reset form and close modal
    setNewTransaction({
      description: "",
      amount: "",
      category: "",
      paymentMethod: "Cash",
      date: new Date().toISOString().split("T")[0],
      notes: "",
    });
      setShowAddModal(false);
    } catch (error) {
      console.error("Failed to add transaction:", error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gradient-to-b from-gray-900 to-gray-800 text-white flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-gray-700">
          <Link href="/admin" className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-dental-blue to-dental-teal rounded-lg flex items-center justify-center">
              <FaTooth className="text-white text-xl" />
            </div>
            <div>
              <span className="text-lg font-bold">BrightSmile</span>
              <p className="text-xs text-gray-400">Admin Panel</p>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-2">
          <Link
            href="/admin"
            className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors"
          >
            <FaChartLine className="text-lg" />
            <span className="font-medium">Dashboard</span>
          </Link>
          <Link
            href="/admin/appointments"
            className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors"
          >
            <FaCalendarAlt className="text-lg" />
            <span className="font-medium">Appointments</span>
          </Link>
          <Link
            href="/admin/inventory"
            className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors"
          >
            <FaBoxes className="text-lg" />
            <span className="font-medium">Inventory</span>
          </Link>
          <Link
            href="/admin/transactions"
            className="flex items-center space-x-3 px-4 py-3 bg-dental-blue/20 text-dental-lightblue rounded-xl"
          >
            <FaMoneyBillWave className="text-lg" />
            <span className="font-medium">Transactions</span>
          </Link>
          <Link
            href="/admin/patients"
            className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors"
          >
            <FaUsers className="text-lg" />
            <span className="font-medium">Patients</span>
          </Link>
        </nav>

        {/* Bottom Section */}
        <div className="p-4 border-t border-gray-700 space-y-2">
          <Link
            href="/admin/settings"
            className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors"
          >
            <FaCog className="text-lg" />
            <span className="font-medium">Settings</span>
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-red-500/20 hover:text-red-400 rounded-xl transition-colors"
          >
            <FaSignOutAlt className="text-lg" />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white shadow-sm px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Transactions & Finance
            </h1>
            <p className="text-gray-500 text-sm">
              {currentUser
                ? `${currentUser.firstName} ${currentUser.lastName}'s`
                : "Manage"}{" "}
              clinic funds
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="border-green-500 text-green-600 hover:bg-green-50"
              onClick={() => {
                setTransactionType("income");
                setShowAddModal(true);
              }}
            >
              <FaArrowUp className="mr-2" />
              Add Income
            </Button>
            <Button
              variant="outline"
              className="border-red-500 text-red-600 hover:bg-red-50"
              onClick={() => {
                setTransactionType("expense");
                setShowAddModal(true);
              }}
            >
              <FaArrowDown className="mr-2" />
              Add Expense
            </Button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-8 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-4 border-dental-blue/30 border-t-dental-blue rounded-full animate-spin"></div>
            </div>
          ) : (
            <>
              {/* Clinic Funds Card */}
              <div className="bg-gradient-to-r from-dental-blue to-dental-teal rounded-2xl p-8 mb-8 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <FaWallet className="text-2xl" />
                      <span className="text-lg font-medium text-white/80">
                        Clinic Balance
                      </span>
                    </div>
                    <p className="text-4xl font-bold">
                      {formatCurrency(clinicFunds.currentBalance)}
                    </p>
                    <p className="text-white/70 mt-2">Total available funds</p>
                  </div>
                  <div className="grid grid-cols-3 gap-8">
                    <div className="text-center">
                      <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center mx-auto mb-2">
                        <FaArrowUp className="text-2xl" />
                      </div>
                      <p className="text-2xl font-bold">
                        {formatCurrency(clinicFunds.monthlyIncome)}
                      </p>
                      <p className="text-sm text-white/70">This Month Income</p>
                    </div>
                    <div className="text-center">
                      <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center mx-auto mb-2">
                        <FaArrowDown className="text-2xl" />
                      </div>
                      <p className="text-2xl font-bold">
                        {formatCurrency(clinicFunds.monthlyExpenses)}
                      </p>
                      <p className="text-sm text-white/70">
                        This Month Expenses
                      </p>
                    </div>
                    <div className="text-center">
                      <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center mx-auto mb-2">
                        <FaClock className="text-2xl" />
                      </div>
                      <p className="text-2xl font-bold">
                        {formatCurrency(clinicFunds.pendingPayments)}
                      </p>
                      <p className="text-sm text-white/70">Pending Payments</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-500 text-sm">
                      Total Income (This Page)
                    </span>
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <FaArrowUp className="text-green-600" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-green-600">
                    +{formatCurrency(totalIncome)}
                  </p>
                </div>
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-500 text-sm">
                      Total Expenses (This Page)
                    </span>
                    <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                      <FaArrowDown className="text-red-600" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-red-600">
                    -{formatCurrency(totalExpenses)}
                  </p>
                </div>
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-500 text-sm">Net This Page</span>
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <FaChartLine className="text-blue-600" />
                    </div>
                  </div>
                  <p
                    className={`text-2xl font-bold ${totalIncome - totalExpenses >= 0 ? "text-green-600" : "text-red-600"}`}
                  >
                    {totalIncome - totalExpenses >= 0 ? "+" : "-"}
                    {formatCurrency(totalIncome - totalExpenses)}
                  </p>
                </div>
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-500 text-sm">Transactions</span>
                    <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                      <FaReceipt className="text-purple-600" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">
                    {transactions.length}
                  </p>
                </div>
              </div>

              {/* Filters */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
                <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                  <div className="flex-1 relative">
                    <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search transactions..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setFilterType("all")}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        filterType === "all"
                          ? "bg-dental-blue text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setFilterType("income")}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        filterType === "income"
                          ? "bg-green-500 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      Income
                    </button>
                    <button
                      onClick={() => setFilterType("expense")}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                        filterType === "expense"
                          ? "bg-red-500 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      Expenses
                    </button>
                  </div>
                  <Button variant="outline">
                    <FaDownload className="mr-2" />
                    Export
                  </Button>
                </div>
              </div>

              {/* Transactions Table */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {filteredTransactions.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left py-4 px-6 text-sm font-semibold text-gray-600">
                            Date & Time
                          </th>
                          <th className="text-left py-4 px-6 text-sm font-semibold text-gray-600">
                            Description
                          </th>
                          <th className="text-left py-4 px-6 text-sm font-semibold text-gray-600">
                            Category
                          </th>
                          <th className="text-left py-4 px-6 text-sm font-semibold text-gray-600">
                            Payment Method
                          </th>
                          <th className="text-right py-4 px-6 text-sm font-semibold text-gray-600">
                            Amount
                          </th>
                          <th className="text-center py-4 px-6 text-sm font-semibold text-gray-600">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredTransactions.map((txn) => (
                          <tr
                            key={txn.id}
                            className="hover:bg-gray-50 transition-colors"
                          >
                            <td className="py-4 px-6">
                              <p className="font-medium text-gray-900">
                                {new Date(txn.date).toLocaleDateString(
                                  "en-US",
                                  {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                  },
                                )}
                              </p>
                              <p className="text-xs text-gray-500">
                                {txn.time}
                              </p>
                            </td>
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-3">
                                <div
                                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                    txn.type === "income"
                                      ? "bg-green-100"
                                      : "bg-red-100"
                                  }`}
                                >
                                  {txn.type === "income" ? (
                                    <FaArrowUp className="text-green-600" />
                                  ) : (
                                    <FaArrowDown className="text-red-600" />
                                  )}
                                </div>
                                <div>
                                  <p className="font-medium text-gray-900">
                                    {txn.description}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {txn.reference}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-2">
                                {getCategoryIcon(txn.category)}
                                <span className="text-gray-700">
                                  {txn.category}
                                </span>
                              </div>
                            </td>
                            <td className="py-4 px-6">
                              <span className="text-gray-700">
                                {txn.paymentMethod}
                              </span>
                            </td>
                            <td className="py-4 px-6 text-right">
                              <p
                                className={`font-bold ${
                                  txn.type === "income"
                                    ? "text-green-600"
                                    : "text-red-600"
                                }`}
                              >
                                {txn.type === "income" ? "+" : "-"}
                                {formatCurrency(txn.amount)}
                              </p>
                            </td>
                            <td className="py-4 px-6 text-center">
                              {txn.status === "completed" ? (
                                <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                                  <FaCheckCircle className="text-xs" />{" "}
                                  Completed
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">
                                  <FaClock className="text-xs" /> Pending
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-12 text-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <FaReceipt className="text-gray-400 text-2xl" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      No Transactions
                    </h3>
                    <p className="text-gray-500">
                      No transactions match your search criteria.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* Add Transaction Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              {transactionType === "income" ? "Add Income" : "Add Expense"}
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              {transactionType === "income"
                ? "Record a new payment or income"
                : "Record a new expense or purchase"}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <input
                  type="text"
                  value={newTransaction.description}
                  onChange={(e) =>
                    setNewTransaction({
                      ...newTransaction,
                      description: e.target.value,
                    })
                  }
                  placeholder={
                    transactionType === "income"
                      ? "e.g., Payment from Ahmad Khoury"
                      : "e.g., Dental supplies purchase"
                  }
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Amount (LBP)
                  </label>
                  <input
                    type="number"
                    value={newTransaction.amount}
                    onChange={(e) =>
                      setNewTransaction({
                        ...newTransaction,
                        amount: e.target.value,
                      })
                    }
                    placeholder="0"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Category
                  </label>
                  <select
                    value={newTransaction.category}
                    onChange={(e) =>
                      setNewTransaction({
                        ...newTransaction,
                        category: e.target.value,
                      })
                    }
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
                  >
                    <option value="">Select category</option>
                    {transactionType === "income" ? (
                      <>
                        <option value="Patient Payment">Patient Payment</option>
                        <option value="Insurance">Insurance</option>
                        <option value="Other Income">Other Income</option>
                      </>
                    ) : (
                      <>
                        <option value="Supplies">Supplies</option>
                        <option value="Maintenance">Maintenance</option>
                        <option value="Utilities">Utilities</option>
                        <option value="Salary">Salary</option>
                        <option value="Other Expense">Other Expense</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Payment Method
                  </label>
                  <select
                    value={newTransaction.paymentMethod}
                    onChange={(e) =>
                      setNewTransaction({
                        ...newTransaction,
                        paymentMethod: e.target.value,
                      })
                    }
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
                  >
                    <option value="Cash">Cash</option>
                    <option value="Credit Card">Credit Card</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date
                  </label>
                  <input
                    type="date"
                    value={newTransaction.date}
                    onChange={(e) =>
                      setNewTransaction({
                        ...newTransaction,
                        date: e.target.value,
                      })
                    }
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={newTransaction.notes}
                  onChange={(e) =>
                    setNewTransaction({
                      ...newTransaction,
                      notes: e.target.value,
                    })
                  }
                  placeholder="Add any additional notes"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue resize-none"
                />
              </div>

              {/* Fund Impact Preview */}
              {newTransaction.amount && (
                <div
                  className={`p-4 rounded-xl ${transactionType === "income" ? "bg-green-50" : "bg-red-50"}`}
                >
                  <p className="text-sm text-gray-600 mb-1">
                    After this transaction:
                  </p>
                  <p
                    className={`text-lg font-bold ${transactionType === "income" ? "text-green-600" : "text-red-600"}`}
                  >
                    Clinic Balance: {formatCurrency(clinicFunds.currentBalance)}{" "}
                    →{" "}
                    {formatCurrency(
                      transactionType === "income"
                        ? clinicFunds.currentBalance +
                            parseFloat(newTransaction.amount || "0")
                        : clinicFunds.currentBalance -
                            parseFloat(newTransaction.amount || "0"),
                    )}
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowAddModal(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddTransaction}
                disabled={
                  !newTransaction.description ||
                  !newTransaction.amount ||
                  !newTransaction.category
                }
                className={`flex-1 ${
                  transactionType === "income"
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                {transactionType === "income" ? (
                  <>
                    <FaArrowUp className="mr-2" /> Add Income
                  </>
                ) : (
                  <>
                    <FaArrowDown className="mr-2" /> Add Expense
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
