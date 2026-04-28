"use client";
import { apiFetch } from '@/lib/api/client';
import { toast } from 'sonner';

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { safeStorage } from "@/lib/browser-compat";
import { useTranslation } from "@/lib/i18n";
import AdminSidebar from "@/components/ui/AdminSidebar";
import { StatsCard } from "@/components/ui/StatsCard";
import { FilterBar } from "@/components/ui/FilterBar";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { Modal } from "@/components/ui/Modal";
import { FormField, inputClass } from "@/components/ui/FormField";
import {
  FaTooth,
  FaBoxes,
  FaEdit,
  FaTrash,
  FaExclamationTriangle,
  FaCheckCircle,
  FaBoxOpen,
  FaSyringe,
  FaTeeth,
  FaCamera,
} from "react-icons/fa";

// NOTE FOR BACKEND TEAM:
// inventory_items needs an `image_url` (string, nullable) column.
// Add a POST /api/inventory/:id/image endpoint that accepts multipart/form-data
// with a field named "image" (image/jpeg, image/png, image/webp, max 5 MB).
// It should store the file and return { image_url: string }.

type InventoryItem = {
  id: number;
  name: string;
  category: string;
  currentStock: number;
  minimumStock: number;
  unit: string;
  supplier: string;
  lastRestocked: string;
  status: string;
  image_url?: string;
  cost_price?: number;
};

const categoryKeys = ["all", "disposables", "materials", "medications", "instruments"] as const;
const categoryValues = ["All", "Disposables", "Materials", "Medications", "Instruments"];

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

// Clickable image upload box with preview
function ImageUploadBox({
  preview,
  onFileChange,
}: {
  preview: string | null;
  onFileChange: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onClick={() => inputRef.current?.click()}
      className="relative w-full h-40 rounded-xl border-2 border-dashed border-gray-300 hover:border-dental-blue cursor-pointer overflow-hidden flex items-center justify-center bg-gray-50 transition-colors group"
    >
      {preview ? (
        <>
          <img src={preview} alt="preview" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span className="text-white text-sm font-medium flex items-center gap-2">
              <FaCamera /> Change photo
            </span>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 text-gray-400 group-hover:text-dental-blue transition-colors">
          <FaCamera className="text-3xl" />
          <span className="text-sm font-medium">Upload item photo</span>
          <span className="text-xs">PNG, JPG, WEBP · max 5 MB</span>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFileChange(file);
        }}
      />
    </div>
  );
}

async function uploadItemImage(itemId: number, file: File): Promise<string | null> {
  try {
    const form = new FormData();
    form.append("image", file);
    const res = await apiFetch(`/api/inventory/${itemId}/image`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.image_url ?? null;
  } catch {
    return null;
  }
}

export default function InventoryManagement() {
  const router = useRouter();
  const { t } = useTranslation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);

  const [addImageFile, setAddImageFile] = useState<File | null>(null);
  const [addImagePreview, setAddImagePreview] = useState<string | null>(null);
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);

  // Direct photo upload (table row camera button)
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoTargetId, setPhotoTargetId] = useState<number | null>(null);
  const [uploadingPhotoId, setUploadingPhotoId] = useState<number | null>(null);
  const [photoError, setPhotoError] = useState("");

  // Delete loading state
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Add form state
  const [addForm, setAddForm] = useState({
    name: "", category: "Disposables", unit: "piece",
    quantity: "", minimum_quantity: "", description: "", cost_price: "",
  });
  const [addSaving, setAddSaving] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState({ name: "", minimum_quantity: "" as string | number, cost_price: "" as string | number });
  const [editSaving, setEditSaving] = useState(false);

  // Stock adjustment state
  const [stockQty, setStockQty] = useState(1);
  const [stockType, setStockType] = useState<"in" | "out">("in");
  const [stockNote, setStockNote] = useState("");
  const [stockSaving, setStockSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<number>(1);

  const fetchInventory = async () => {
    try {
      const res = await apiFetch(`/api/inventory`);
      const data = await res.json();
      const normalizeCategory = (cat: string) => {
        const c = (cat || "").toLowerCase();
        if (c === "disposables") return "Disposables";
        if (c === "materials") return "Materials";
        if (c === "medications") return "Medications";
        if (c === "instruments") return "Instruments";
        return cat || "General";
      };
      const mapped = (data.data || []).map((item: any) => ({
        id: Number(item.id),
        name: item.name,
        category: normalizeCategory(item.category),
        currentStock: item.quantity,
        minimumStock: item.minimum_quantity,
        unit: item.unit,
        supplier: item.description || "",
        lastRestocked: item.updated_at?.split("T")[0] || "",
        status: item.quantity <= item.minimum_quantity ? "low" : "ok",
        image_url: item.image_url ?? undefined,
        cost_price: item.cost_price ? Number(item.cost_price) : 0,
      }));
      setInventoryItems(mapped);
    } catch (e) {
      console.error("Failed to fetch inventory", e);
    }
  };

  useEffect(() => {
    fetchInventory();
    apiFetch("/api/auth/me").then((r) => r.ok ? r.json() : null).then((u) => { if (u?.id) setCurrentUserId(Number(u.id)); });
  }, []);

  const handleLogout = () => {
    toast.success("Logged out.");
    safeStorage.removeItem("adminAuth");
    safeStorage.removeItem("adminUser");
    safeStorage.removeItem("authToken");
    safeStorage.removeItem("userRole");
    router.push("/login");
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

  const filteredItems = inventoryItems.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.supplier.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "All" || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const lowStockCount = inventoryItems.filter((item) => item.status === "low").length;

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "Disposables": return <FaBoxOpen className="text-blue-500" />;
      case "Materials":   return <FaTeeth className="text-purple-500" />;
      case "Medications": return <FaSyringe className="text-green-500" />;
      case "Instruments": return <FaTooth className="text-orange-500" />;
      default:            return <FaBoxes className="text-gray-500" />;
    }
  };

  const handleOpenEdit = (item: InventoryItem) => {
    setSelectedItem(item);
    setEditImageFile(null);
    setEditImagePreview(item.image_url ?? null);
    setEditForm({ name: item.name, minimum_quantity: item.minimumStock, cost_price: item.cost_price ?? 0 });
    setStockQty(0);
    setStockType("in");
    setStockNote("");
    setShowEditModal(true);
  };

  const handleStockAdjustment = async () => {
    if (!selectedItem || stockQty <= 0) return;
    setStockSaving(true);
    try {
      const res = await apiFetch(`/api/inventory/${selectedItem.id}/movements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movement_type: stockType, quantity: stockQty, note: stockNote || undefined, performed_by: currentUserId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message || "Failed to adjust stock.");
        return;
      }
      toast.success(stockType === "in" ? `Added ${stockQty} to stock.` : `Removed ${stockQty} from stock.`);
      setStockQty(1);
      setStockNote("");
      await fetchInventory();
      // Update selectedItem's current stock to reflect change
      setSelectedItem((prev) => prev ? { ...prev, currentStock: prev.currentStock + (stockType === "in" ? stockQty : -stockQty) } : prev);
    } finally {
      setStockSaving(false);
    }
  };

  const handleDirectPhotoUpload = async (file: File) => {
    if (!photoTargetId) return;
    setUploadingPhotoId(photoTargetId);
    setPhotoError("");
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await apiFetch(`/api/inventory/${photoTargetId}/image`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg = err.message || `Upload failed (${res.status})`;
        setPhotoError(msg);
        toast.error(msg);
        return;
      }
      toast.success("Photo updated.");
      await fetchInventory();
    } catch (e: any) {
      setPhotoError(e.message || "Upload failed");
    } finally {
      setUploadingPhotoId(null);
      setPhotoTargetId(null);
    }
  };

  const handleAddClose = () => {
    setShowAddModal(false);
    setAddImageFile(null);
    setAddImagePreview(null);
    setAddForm({ name: "", category: "Disposables", unit: "piece", quantity: "", minimum_quantity: "", description: "", cost_price: "" });
  };

  const handleAddSave = async () => {
    if (!addForm.name.trim()) return;
    setAddSaving(true);
    try {
      const res = await apiFetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...addForm,
          quantity: Number(addForm.quantity) || 0,
          minimum_quantity: Number(addForm.minimum_quantity) || 0,
          cost_price: Number(addForm.cost_price) || 0,
        }),
      });
      if (!res.ok) { toast.error("Failed to add item."); return; }
      const newItem = await res.json();
      const newId = Number(newItem.id);
      if (addImageFile) await uploadItemImage(newId, addImageFile);
      await fetchInventory();
      toast.success("Item added.");
      handleAddClose();
    } finally {
      setAddSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      const res = await apiFetch(`/api/inventory/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Item deleted.");
        setInventoryItems((prev) => prev.filter((item) => item.id !== id));
      } else {
        toast.error("Failed to delete item.");
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleEditSave = async () => {
    if (!selectedItem) return;
    setEditSaving(true);
    try {
      await apiFetch(`/api/inventory/${selectedItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          minimum_quantity: Number(editForm.minimum_quantity) || 0,
          cost_price: Number(editForm.cost_price) || 0,
        }),
      });
      if (editImageFile) await uploadItemImage(selectedItem.id, editImageFile);
      if (stockQty > 0) {
        const res = await apiFetch(`/api/inventory/${selectedItem.id}/movements`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ movement_type: stockType, quantity: stockQty, note: stockNote || undefined, performed_by: currentUserId }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast.error(err.message || "Failed to adjust stock.");
          return;
        }
      }
      await fetchInventory();
      toast.success("Item updated.");
    } finally {
      setEditSaving(false);
      setShowEditModal(false);
      setEditImageFile(null);
      setEditImagePreview(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AdminSidebar activePage="inventory" sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)} onLogout={handleLogout} />

      <div className="flex-1 flex flex-col">
        <AdminPageHeader
          title={t("inventory.inventoryManagement")}
          subtitle={t("inventory.manageSupplies")}
          data={inventoryItems}
          filename="inventory"
          onImport={async (rows) => {
            let ok = 0; let fail = 0;
            for (const row of rows as Record<string, unknown>[]) {
              try {
                const payload = {
                  name: String(row.name ?? ""),
                  category: String(row.category ?? ""),
                  unit: String(row.unit ?? "piece"),
                  quantity: Number(row.currentStock ?? row.quantity ?? 0),
                  minimum_quantity: Number(row.minimumStock ?? row.minimum_quantity ?? 0),
                  description: row.description ? String(row.description) : undefined,
                };
                if (!payload.name) { fail++; continue; }
                const res = await apiFetch("/api/inventory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
                if (res.ok) { ok++; } else {
                  const err = await res.text().catch(() => res.status.toString());
                  console.error("Inventory import row failed:", res.status, err, payload);
                  fail++;
                }
              } catch (e) { console.error("Inventory import exception:", e); fail++; }
            }
            await fetchInventory();
            if (ok > 0) toast.success(`${ok} item${ok > 1 ? "s" : ""} imported.`);
            if (fail > 0) toast.error(`${fail} row${fail > 1 ? "s" : ""} failed — check browser console.`);
          }}
          onAdd={() => setShowAddModal(true)}
          addLabel={t("inventory.addItem")}
        />

        <main className="flex-1 p-8 overflow-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <StatsCard icon={FaBoxes} iconBgClass="bg-blue-100" iconColorClass="text-blue-600" value={inventoryItems.length} label={t("inventory.totalItems")} />
            <StatsCard icon={FaExclamationTriangle} iconBgClass="bg-red-100" iconColorClass="text-red-600" value={lowStockCount} label={t("inventory.lowStock")} />
            <StatsCard icon={FaCheckCircle} iconBgClass="bg-green-100" iconColorClass="text-green-600" value={inventoryItems.length - lowStockCount} label={t("inventory.wellStocked")} />
          </div>

          <FilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder={t("inventory.searchPlaceholder")}
            filters={categoryValues.map((category, idx) => ({
              value: category,
              label: t(`inventory.${categoryKeys[idx]}`),
            }))}
            activeFilter={selectedCategory}
            onFilterChange={setSelectedCategory}
          />

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left rtl:text-right py-4 px-6 text-sm font-semibold text-gray-600">{t("inventory.item")}</th>
                    <th className="text-left rtl:text-right py-4 px-6 text-sm font-semibold text-gray-600">{t("inventory.category")}</th>
                    <th className="text-center py-4 px-6 text-sm font-semibold text-gray-600">{t("inventory.stock")}</th>
                    <th className="text-left rtl:text-right py-4 px-6 text-sm font-semibold text-gray-600">{t("inventory.supplier")}</th>
                    <th className="text-center py-4 px-6 text-sm font-semibold text-gray-600">{t("common.status")}</th>
                    <th className="text-center py-4 px-6 text-sm font-semibold text-gray-600">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0">
                            {item.image_url ? (
                              <img
                                src={item.image_url}
                                alt={item.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              getCategoryIcon(item.category)
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{item.name}</p>
                            <p className="text-xs text-gray-500">
                              {t("inventory.lastRestocked")} {new Date(item.lastRestocked).toLocaleDateString()}
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
                      <td className="py-4 px-6">
                        <p className="text-gray-700 text-sm">{item.supplier}</p>
                      </td>
                      <td className="py-4 px-6 text-center">
                        {item.status === "low" ? (
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">
                            <FaExclamationTriangle className="text-xs" /> {t("inventory.lowStockBadge")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                            <FaCheckCircle className="text-xs" /> {t("inventory.okBadge")}
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex justify-center gap-2">
                          <button
                            title="Upload photo"
                            disabled={uploadingPhotoId === item.id}
                            onClick={() => { setPhotoTargetId(item.id); setPhotoError(""); setTimeout(() => photoInputRef.current?.click(), 0); }}
                            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-green-600 transition-colors disabled:opacity-40"
                          >
                            {uploadingPhotoId === item.id ? (
                              <span className="block w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <FaCamera />
                            )}
                          </button>
                          <button
                            onClick={() => handleOpenEdit(item)}
                            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-dental-blue transition-colors"
                          >
                            <FaEdit />
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            disabled={deletingId === item.id}
                            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hover:text-red-500 transition-colors disabled:opacity-40"
                          >
                            {deletingId === item.id ? (
                              <span className="block w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <FaTrash />
                            )}
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
      <Modal isOpen={showAddModal} onClose={handleAddClose} title={t("inventory.addNewItem")}>
        <div className="space-y-4">
          <FormField label="Item Photo">
            <ImageUploadBox
              preview={addImagePreview}
              onFileChange={(file) => {
                setAddImageFile(file);
                setAddImagePreview(URL.createObjectURL(file));
              }}
            />
          </FormField>
          <FormField label={t("inventory.itemName")}>
            <input
              type="text"
              placeholder={t("inventory.itemNamePlaceholder")}
              className={inputClass}
              value={addForm.name}
              onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label={t("inventory.category")}>
              <select
                className={inputClass}
                value={addForm.category}
                onChange={(e) => setAddForm((f) => ({ ...f, category: e.target.value }))}
              >
                <option value="Disposables">{t("inventory.disposables")}</option>
                <option value="Materials">{t("inventory.materials")}</option>
                <option value="Medications">{t("inventory.medications")}</option>
                <option value="Instruments">{t("inventory.instruments")}</option>
              </select>
            </FormField>
            <FormField label={t("inventory.unit")}>
              <input
                type="text"
                placeholder={t("inventory.unitPlaceholder")}
                className={inputClass}
                value={addForm.unit}
                onChange={(e) => setAddForm((f) => ({ ...f, unit: e.target.value }))}
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label={t("inventory.currentStock")}>
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                className={inputClass}
                value={addForm.quantity}
                onChange={(e) => setAddForm((f) => ({ ...f, quantity: e.target.value.replace(/[^0-9]/g, "") }))}
              />
            </FormField>
            <FormField label={t("inventory.minimumStock")}>
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                className={inputClass}
                value={addForm.minimum_quantity}
                onChange={(e) => setAddForm((f) => ({ ...f, minimum_quantity: e.target.value.replace(/[^0-9]/g, "") }))}
              />
            </FormField>
          </div>
          <FormField label="Unit Cost Price">
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              className={inputClass}
              value={addForm.cost_price}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9.]/g, "");
                if ((v.match(/\./g) || []).length <= 1) setAddForm((f) => ({ ...f, cost_price: v }));
              }}
            />
          </FormField>
          <FormField label={t("inventory.supplier")}>
            <input
              type="text"
              placeholder={t("inventory.supplierName")}
              className={inputClass}
              value={addForm.description}
              onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))}
            />
          </FormField>
        </div>
        <div className="flex gap-3 mt-6">
          <Button variant="outline" className="flex-1" onClick={handleAddClose}>
            {t("common.cancel")}
          </Button>
          <Button
            className="flex-1 bg-dental-blue hover:bg-dental-blue/90"
            disabled={!addForm.name.trim() || addSaving}
            onClick={handleAddSave}
          >
            {addSaving ? "Adding..." : t("inventory.addItem")}
          </Button>
        </div>
      </Modal>

      {/* Edit Item Modal */}
      <Modal isOpen={showEditModal && !!selectedItem} onClose={() => setShowEditModal(false)} title={t("inventory.editItem")}>
        {selectedItem && (
          <>
            <div className="space-y-4">
              <FormField label="Item Photo">
                <ImageUploadBox
                  preview={editImagePreview}
                  onFileChange={(file) => {
                    setEditImageFile(file);
                    setEditImagePreview(URL.createObjectURL(file));
                  }}
                />
              </FormField>
              <FormField label={t("inventory.itemName")}>
                <input
                  type="text"
                  className={inputClass}
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                />
              </FormField>
              <FormField label={t("inventory.minimumStock")}>
                <input
                  type="text"
                  inputMode="numeric"
                  className={inputClass}
                  value={editForm.minimum_quantity}
                  onChange={(e) => setEditForm((f) => ({ ...f, minimum_quantity: e.target.value.replace(/[^0-9]/g, "") }))}
                />
              </FormField>
              <FormField label="Unit Cost Price">
                <input
                  type="text"
                  inputMode="decimal"
                  className={inputClass}
                  value={editForm.cost_price}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9.]/g, "");
                    if ((v.match(/\./g) || []).length <= 1) setEditForm((f) => ({ ...f, cost_price: v }));
                  }}
                />
              </FormField>
            </div>

            {/* Stock Adjustment */}
            <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
              <p className="text-sm font-semibold text-gray-700 mb-3">
                Adjust Stock
                <span className="ml-2 text-xs font-normal text-gray-500">
                  Current: <span className="font-semibold text-gray-800">{selectedItem.currentStock} {selectedItem.unit}</span>
                </span>
              </p>
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setStockType("in")}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${stockType === "in" ? "bg-green-500 text-white" : "bg-white border border-gray-300 text-gray-600 hover:bg-gray-50"}`}
                >
                  + Add Stock
                </button>
                <button
                  type="button"
                  onClick={() => setStockType("out")}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${stockType === "out" ? "bg-red-500 text-white" : "bg-white border border-gray-300 text-gray-600 hover:bg-gray-50"}`}
                >
                  − Decrease Stock
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={0}
                  value={stockQty || ""}
                  onChange={(e) => setStockQty(Math.max(0, Number(e.target.value)))}
                  className={`${inputClass} w-24`}
                  placeholder="Qty"
                />
                <input
                  type="text"
                  value={stockNote}
                  onChange={(e) => setStockNote(e.target.value)}
                  className={`${inputClass} flex-1`}
                  placeholder="Note (optional)"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => setShowEditModal(false)}>
                {t("common.cancel")}
              </Button>
              <Button className="flex-1 bg-dental-blue hover:bg-dental-blue/90" onClick={handleEditSave} disabled={editSaving}>
                {editSaving ? "Saving..." : t("inventory.saveChanges")}
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* Hidden file input for direct photo upload */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleDirectPhotoUpload(file);
          e.target.value = "";
        }}
      />

      {/* Upload error toast */}
      {photoError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-red-600 text-white text-sm px-5 py-3 rounded-xl shadow-lg z-50 flex items-center gap-3">
          {photoError}
          <button onClick={() => setPhotoError("")} className="font-bold text-white/80 hover:text-white">✕</button>
        </div>
      )}
    </div>
  );
}
