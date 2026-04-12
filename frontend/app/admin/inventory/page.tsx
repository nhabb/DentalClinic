"use client";
import { apiFetch } from '@/lib/api/client';

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
};

const categoryKeys = ["all", "disposables", "materials", "medications", "instruments"] as const;
const categoryValues = ["All", "Disposables", "Materials", "Medications", "Instruments"];

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

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

  const fetchInventory = async () => {
    try {
      const res = await apiFetch(`/api/inventory`);
      const data = await res.json();
      const mapped = (data.data || []).map((item: any) => ({
        id: Number(item.id),
        name: item.name,
        category: item.category || "General",
        currentStock: item.quantity,
        minimumStock: item.minimum_quantity,
        unit: item.unit,
        supplier: item.description || "",
        lastRestocked: item.updated_at?.split("T")[0] || "",
        status: item.quantity <= item.minimum_quantity ? "low" : "ok",
        image_url: item.image_url ?? undefined,
      }));
      setInventoryItems(mapped);
    } catch (e) {
      console.error("Failed to fetch inventory", e);
    }
  };

  useEffect(() => { fetchInventory(); }, []);

  const handleLogout = () => {
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
    setShowEditModal(true);
  };

  const handleAddClose = () => {
    setShowAddModal(false);
    setAddImageFile(null);
    setAddImagePreview(null);
  };

  // Called after the backend creates the item and returns its id
  const handleAfterAdd = async (newItemId: number) => {
    if (addImageFile) await uploadItemImage(newItemId, addImageFile);
    await fetchInventory();
    handleAddClose();
  };

  const handleEditSave = async () => {
    if (selectedItem && editImageFile) {
      const url = await uploadItemImage(selectedItem.id, editImageFile);
      if (url) {
        setInventoryItems((prev) =>
          prev.map((it) => it.id === selectedItem.id ? { ...it, image_url: url } : it)
        );
      }
    }
    setShowEditModal(false);
    setEditImageFile(null);
    setEditImagePreview(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AdminSidebar activePage="inventory" sidebarOpen={sidebarOpen} onLogout={handleLogout} />

      <div className="flex-1 flex flex-col">
        <AdminPageHeader
          title={t("inventory.inventoryManagement")}
          subtitle={t("inventory.manageSupplies")}
          data={inventoryItems}
          filename="inventory"
          onImport={(rows) => setInventoryItems((prev) => [...prev, ...(rows as InventoryItem[])])}
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
                            onClick={() => handleOpenEdit(item)}
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
            <input type="text" placeholder={t("inventory.itemNamePlaceholder")} className={inputClass} />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label={t("inventory.category")}>
              <select className={inputClass}>
                <option>{t("inventory.disposables")}</option>
                <option>{t("inventory.materials")}</option>
                <option>{t("inventory.medications")}</option>
                <option>{t("inventory.instruments")}</option>
              </select>
            </FormField>
            <FormField label={t("inventory.unit")}>
              <input type="text" placeholder={t("inventory.unitPlaceholder")} className={inputClass} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label={t("inventory.currentStock")}>
              <input type="number" placeholder="0" className={inputClass} />
            </FormField>
            <FormField label={t("inventory.minimumStock")}>
              <input type="number" placeholder="0" className={inputClass} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label={t("inventory.supplier")}>
              <input type="text" placeholder={t("inventory.supplierName")} className={inputClass} />
            </FormField>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <Button variant="outline" className="flex-1" onClick={handleAddClose}>
            {t("common.cancel")}
          </Button>
          <Button className="flex-1 bg-dental-blue hover:bg-dental-blue/90">{t("inventory.addItem")}</Button>
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
                <input type="text" defaultValue={selectedItem.name} className={inputClass} />
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label={t("inventory.currentStock")}>
                  <input type="number" defaultValue={selectedItem.currentStock} className={inputClass} />
                </FormField>
                <FormField label={t("inventory.minimumStock")}>
                  <input type="number" defaultValue={selectedItem.minimumStock} className={inputClass} />
                </FormField>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => setShowEditModal(false)}>
                {t("common.cancel")}
              </Button>
              <Button className="flex-1 bg-dental-blue hover:bg-dental-blue/90" onClick={handleEditSave}>
                {t("inventory.saveChanges")}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
