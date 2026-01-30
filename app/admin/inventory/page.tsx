"use client";

import Link from "next/link";
import { useState } from "react";
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
  FaEdit,
  FaTrash,
  FaExclamationTriangle,
  FaCheckCircle,
  FaFilter,
  FaSortAmountDown,
  FaBoxOpen,
  FaSyringe,
  FaTeeth,
  FaShieldAlt,
} from "react-icons/fa";

// TODO: Fetch from API
const inventoryItems: {
  id: number;
  name: string;
  category: string;
  currentStock: number;
  minimumStock: number;
  unit: string;
  costPerUnit: number;
  supplier: string;
  lastRestocked: string;
  status: string;
}[] = [];

const categories = ["All", "Disposables", "Materials", "Medications", "Instruments"];

export default function InventoryManagement() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<typeof inventoryItems[0] | null>(null);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-LB").format(amount) + " LBP";
  };

  const filteredItems = inventoryItems.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.supplier.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "All" || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const lowStockCount = inventoryItems.filter((item) => item.status === "low").length;
  const totalValue = inventoryItems.reduce(
    (sum, item) => sum + item.currentStock * item.costPerUnit,
    0
  );

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "Disposables":
        return <FaBoxOpen className="text-blue-500" />;
      case "Materials":
        return <FaTeeth className="text-purple-500" />;
      case "Medications":
        return <FaSyringe className="text-green-500" />;
      case "Instruments":
        return <FaTooth className="text-orange-500" />;
      default:
        return <FaBoxes className="text-gray-500" />;
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
            className="flex items-center space-x-3 px-4 py-3 bg-dental-blue/20 text-dental-lightblue rounded-xl"
          >
            <FaBoxes className="text-lg" />
            <span className="font-medium">Inventory</span>
          </Link>
          <Link
            href="/admin/transactions"
            className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-gray-700/50 hover:text-white rounded-xl transition-colors"
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
          <Link
            href="/"
            className="flex items-center space-x-3 px-4 py-3 text-gray-300 hover:bg-red-500/20 hover:text-red-400 rounded-xl transition-colors"
          >
            <FaSignOutAlt className="text-lg" />
            <span className="font-medium">Logout</span>
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white shadow-sm px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Inventory Management</h1>
            <p className="text-gray-500 text-sm">Manage your dental supplies and equipment</p>
          </div>
          <Button onClick={() => setShowAddModal(true)} className="bg-dental-blue hover:bg-dental-blue/90">
            <FaPlus className="mr-2" />
            Add Item
          </Button>
        </header>

        {/* Content */}
        <main className="flex-1 p-8 overflow-auto">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <FaBoxes className="text-blue-600 text-xl" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{inventoryItems.length}</p>
                  <p className="text-sm text-gray-500">Total Items</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                  <FaExclamationTriangle className="text-red-600 text-xl" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{lowStockCount}</p>
                  <p className="text-sm text-gray-500">Low Stock</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                  <FaCheckCircle className="text-green-600 text-xl" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {inventoryItems.length - lowStockCount}
                  </p>
                  <p className="text-sm text-gray-500">Well Stocked</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                  <FaMoneyBillWave className="text-purple-600 text-xl" />
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900">{formatCurrency(totalValue)}</p>
                  <p className="text-sm text-gray-500">Total Value</p>
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search items or suppliers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
                />
              </div>
              <div className="flex gap-2">
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      selectedCategory === category
                        ? "bg-dental-blue text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Inventory Table */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-gray-600">Item</th>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-gray-600">Category</th>
                    <th className="text-center py-4 px-6 text-sm font-semibold text-gray-600">Stock</th>
                    <th className="text-right py-4 px-6 text-sm font-semibold text-gray-600">Unit Cost</th>
                    <th className="text-left py-4 px-6 text-sm font-semibold text-gray-600">Supplier</th>
                    <th className="text-center py-4 px-6 text-sm font-semibold text-gray-600">Status</th>
                    <th className="text-center py-4 px-6 text-sm font-semibold text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                            {getCategoryIcon(item.category)}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{item.name}</p>
                            <p className="text-xs text-gray-500">
                              Last restocked: {new Date(item.lastRestocked).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        <span className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full">
                          {item.category}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-center">
                        <p className="font-semibold text-gray-900">
                          {item.currentStock} <span className="text-gray-400 font-normal">/ {item.minimumStock}</span>
                        </p>
                        <p className="text-xs text-gray-500">{item.unit}</p>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <p className="font-medium text-gray-900">{formatCurrency(item.costPerUnit)}</p>
                      </td>
                      <td className="py-4 px-6">
                        <p className="text-gray-700 text-sm">{item.supplier}</p>
                      </td>
                      <td className="py-4 px-6 text-center">
                        {item.status === "low" ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">
                            <FaExclamationTriangle className="text-xs" /> Low Stock
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                            <FaCheckCircle className="text-xs" /> OK
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => {
                              setSelectedItem(item);
                              setShowEditModal(true);
                            }}
                            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-dental-blue transition-colors"
                          >
                            <FaEdit />
                          </button>
                          <button className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-red-500 transition-colors">
                            <FaTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {/* Add Item Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Add New Item</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Item Name</label>
                <input
                  type="text"
                  placeholder="e.g., Dental Gloves (M)"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                  <select className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue">
                    <option>Disposables</option>
                    <option>Materials</option>
                    <option>Medications</option>
                    <option>Instruments</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Unit</label>
                  <input
                    type="text"
                    placeholder="e.g., boxes, pieces"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Current Stock</label>
                  <input
                    type="number"
                    placeholder="0"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Minimum Stock</label>
                  <input
                    type="number"
                    placeholder="0"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Cost per Unit (LBP)</label>
                  <input
                    type="number"
                    placeholder="0"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Supplier</label>
                  <input
                    type="text"
                    placeholder="Supplier name"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
              <Button className="flex-1 bg-dental-blue hover:bg-dental-blue/90">Add Item</Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Item Modal */}
      {showEditModal && selectedItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Edit Item</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Item Name</label>
                <input
                  type="text"
                  defaultValue={selectedItem.name}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Current Stock</label>
                  <input
                    type="number"
                    defaultValue={selectedItem.currentStock}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Minimum Stock</label>
                  <input
                    type="number"
                    defaultValue={selectedItem.minimumStock}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Cost per Unit (LBP)</label>
                <input
                  type="number"
                  defaultValue={selectedItem.costPerUnit}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-dental-blue/20 focus:border-dental-blue"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => setShowEditModal(false)}>
                Cancel
              </Button>
              <Button className="flex-1 bg-dental-blue hover:bg-dental-blue/90">Save Changes</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
