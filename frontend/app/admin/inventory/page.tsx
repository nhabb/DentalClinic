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
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { AdminPageHeader } from "@/components/ui/AdminPageHeader";
import { BulkActionBar } from "@/components/ui/BulkActionBar";
import { useImportExport } from "@/components/ui/useImportExport";
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
  FaSearch,
  FaTimes,
  FaSort,
  FaSortUp,
  FaSortDown,
  FaArrowUp,
  FaArrowDown,
  FaHistory,
  FaFileExport,
} from "react-icons/fa";
import type { IconType } from "react-icons";

// NOTE FOR BACKEND TEAM:
// inventory_items needs an `image_url` (string, nullable) column.
// Add a POST /api/inventory/:id/image endpoint that accepts multipart/form-data
// with a field named "image" (image/jpeg, image/png, image/webp, max 5 MB).
// It should store the file and return { image_url: string }.

type InventoryMovement = {
  id: number;
  type: string;
  quantity: number;
  note: string;
  by: string;
  date: string;
};

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

type CategoryMeta = { icon: IconType; color: string; chip: string };
const CATEGORY_META: Record<string, CategoryMeta> = {
  Disposables: { icon: FaBoxOpen, color: "text-blue-500", chip: "bg-blue-50 text-blue-700" },
  Materials: { icon: FaTeeth, color: "text-purple-500", chip: "bg-purple-50 text-purple-700" },
  Medications: { icon: FaSyringe, color: "text-green-500", chip: "bg-green-50 text-green-700" },
  Instruments: { icon: FaTooth, color: "text-orange-500", chip: "bg-orange-50 text-orange-700" },
};
const DEFAULT_CATEGORY_META: CategoryMeta = { icon: FaBoxes, color: "text-gray-500", chip: "bg-gray-100 text-gray-700" };
const categoryMeta = (category: string) => CATEGORY_META[category] ?? DEFAULT_CATEGORY_META;

type StatusFilter = "All" | "OK" | "Low" | "Out";
const STATUS_FILTERS: { value: StatusFilter; labelKey: string; dot?: string }[] = [
  { value: "All", labelKey: "inventory.statusAll" },
  { value: "OK", labelKey: "inventory.statusOk", dot: "bg-emerald-500" },
  { value: "Low", labelKey: "inventory.statusLow", dot: "bg-amber-500" },
  { value: "Out", labelKey: "inventory.statusOut", dot: "bg-red-500" },
];
const STATUS_RANK: Record<string, number> = { out: 0, low: 1, ok: 2 };

type SortKey = "name" | "category" | "stock" | "supplier" | "status";

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
      className="relative w-full h-40 rounded-xl border-2 border-dashed border-gray-300 hover:border-brand cursor-pointer overflow-hidden flex items-center justify-center bg-gray-50 transition-colors group"
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
        <div className="flex flex-col items-center gap-2 text-gray-400 group-hover:text-brand transition-colors">
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
    quantity: 0, minimum_quantity: 0, description: "", cost_price: "" as string,
  });
  const [addSaving, setAddSaving] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState({ name: "", minimum_quantity: 0, cost_price: "" as string });
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
        status: item.quantity === 0 ? "out" : item.quantity <= item.minimum_quantity ? "low" : "ok",
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
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>("All");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "status", dir: "asc" });
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  // Details drawer
  const [detailItem, setDetailItem] = useState<InventoryItem | null>(null);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);

  const q = searchQuery.trim().toLowerCase();
  const matchesSearch = (item: InventoryItem) =>
    !q || item.name.toLowerCase().includes(q) || item.supplier.toLowerCase().includes(q);
  const matchesCategory = (item: InventoryItem, cat: string = selectedCategory) => cat === "All" || item.category === cat;
  const matchesStatus = (item: InventoryItem, st: StatusFilter = selectedStatus) =>
    st === "All" || (st === "OK" && item.status === "ok") || (st === "Low" && item.status === "low") || (st === "Out" && item.status === "out");

  const filteredItems = inventoryItems
    .filter((item) => matchesSearch(item) && matchesCategory(item) && matchesStatus(item))
    .sort((a, b) => {
      let r = 0;
      switch (sort.key) {
        case "name": r = a.name.localeCompare(b.name); break;
        case "category": r = a.category.localeCompare(b.category); break;
        case "stock": r = a.currentStock - b.currentStock; break;
        case "supplier": r = a.supplier.localeCompare(b.supplier); break;
        case "status": r = (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3); break;
      }
      if (r === 0) r = a.name.localeCompare(b.name);
      return sort.dir === "asc" ? r : -r;
    });

  // Faceted counts: each group is counted against the *other* active filters.
  const categoryCounts: Record<string, number> = Object.fromEntries(
    categoryValues.map((c) => [c, inventoryItems.filter((i) => matchesSearch(i) && matchesStatus(i) && matchesCategory(i, c)).length]),
  );
  const statusCounts: Record<StatusFilter, number> = Object.fromEntries(
    STATUS_FILTERS.map((s) => [s.value, inventoryItems.filter((i) => matchesSearch(i) && matchesCategory(i) && matchesStatus(i, s.value)).length]),
  ) as Record<StatusFilter, number>;

  const hasActiveFilters = !!q || selectedCategory !== "All" || selectedStatus !== "All";
  const clearFilters = () => { setSearchQuery(""); setSelectedCategory("All"); setSelectedStatus("All"); };
  const toggleSort = (key: SortKey) =>
    setSort((p) => (p.key === key ? { key, dir: p.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  const categoryLabel = (category: string) => {
    const idx = categoryValues.indexOf(category);
    return idx >= 0 ? t(`inventory.${categoryKeys[idx]}`) : category;
  };
  const statusTone = (status: string) =>
    status === "out"
      ? { bar: "bg-red-500", badge: "bg-red-50 text-red-700 ring-red-200", dot: "bg-red-500", label: t("inventory.statusOut") }
      : status === "low"
        ? { bar: "bg-amber-500", badge: "bg-amber-50 text-amber-700 ring-amber-200", dot: "bg-amber-500", label: t("inventory.lowStockBadge") }
        : { bar: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500", label: t("inventory.okBadge") };

  const renderSortTh = (key: SortKey, label: string, align: "start" | "center" = "start") => (
    <th className={cn("py-3 px-5 text-[11px] font-semibold uppercase tracking-wide text-gray-500", align === "center" ? "text-center" : "text-start")}>
      <button
        type="button"
        onClick={() => toggleSort(key)}
        aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
        className={cn("inline-flex items-center gap-1.5 transition-colors hover:text-gray-900", sort.key === key && "text-brand")}
      >
        {label}
        {sort.key === key ? (sort.dir === "asc" ? <FaSortUp className="text-xs" /> : <FaSortDown className="text-xs" />) : <FaSort className="text-xs text-gray-300" />}
      </button>
    </th>
  );

  const lowStockCount = inventoryItems.filter((item) => item.status === "low" || item.status === "out").length;

  const openDetails = async (item: InventoryItem) => {
    setDetailItem(item);
    setMovements([]);
    setMovementsLoading(true);
    try {
      const res = await apiFetch(`/api/inventory/${item.id}/movements?limit=25`);
      const json = res.ok ? await res.json() : { data: [] };
      setMovements(
        (json.data || []).map((m: any) => ({
          id: Number(m.id),
          type: String(m.movement_type ?? ""),
          quantity: Number(m.quantity ?? 0),
          note: m.note ? String(m.note) : "",
          by: m.users ? `${m.users.first_name ?? ""} ${m.users.last_name ?? ""}`.trim() : "",
          date: m.created_at ? String(m.created_at) : "",
        })),
      );
    } catch {
      setMovements([]);
    } finally {
      setMovementsLoading(false);
    }
  };

  // Keep the open details card current after edits / stock adjustments
  useEffect(() => {
    if (!detailItem) return;
    const fresh = inventoryItems.find((i) => i.id === detailItem.id);
    if (fresh && fresh !== detailItem) setDetailItem(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventoryItems]);

  const handleOpenEdit = (item: InventoryItem) => {
    setSelectedItem(item);
    setEditImageFile(null);
    setEditImagePreview(item.image_url ?? null);
    setEditForm({ name: item.name, minimum_quantity: item.minimumStock, cost_price: String(item.cost_price ?? "") });
    setStockQty(1);
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
    setAddForm({ name: "", category: "Disposables", unit: "piece", quantity: 0, minimum_quantity: 0, description: "", cost_price: "" });
  };

  const handleAddSave = async () => {
    if (!addForm.name.trim()) return;
    const parsedCost = parseFloat(addForm.cost_price as string) || 0;
    if (parsedCost > 100000) { toast.error("Cost price cannot exceed $100,000."); return; }
    setAddSaving(true);
    try {
      const res = await apiFetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...addForm, cost_price: parsedCost }),
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

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allVisibleSelected = filteredItems.length > 0 && filteredItems.every((item) => selectedIds.has(item.id));

  const toggleSelectAll = () => {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(filteredItems.map((item) => item.id)));
  };

  const selectedItems = inventoryItems.filter((item) => selectedIds.has(item.id));
  const bulkExport = useImportExport({ data: selectedItems, filename: "inventory-selected", onImport: () => {} });

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    try {
      await Promise.all(ids.map((id) => apiFetch(`/api/inventory/${id}`, { method: "DELETE" })));
      setInventoryItems((prev) => prev.filter((item) => !selectedIds.has(item.id)));
      toast.success(`${ids.length} item${ids.length === 1 ? "" : "s"} deleted.`);
    } catch {
      toast.error("Failed to delete selected items.");
    } finally {
      setSelectedIds(new Set());
    }
  };

  const handleEditSave = async () => {
    if (!selectedItem) return;
    const parsedCost = parseFloat(editForm.cost_price as string) || 0;
    if (parsedCost > 100000) { toast.error("Cost price cannot exceed $100,000."); return; }
    setEditSaving(true);
    try {
      await apiFetch(`/api/inventory/${selectedItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editForm, cost_price: parsedCost }),
      });
      if (editImageFile) await uploadItemImage(selectedItem.id, editImageFile);
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
    <div className="min-h-screen bg-white flex">
      <AdminSidebar activePage="inventory" sidebarOpen={sidebarOpen} onToggle={() => setSidebarOpen((v) => !v)} onLogout={handleLogout} />

      <div className="flex-1 flex flex-col min-w-0">
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

          <ListToolbar
            search={{ value: searchQuery, onChange: setSearchQuery, placeholder: t("inventory.searchPlaceholder") }}
            shown={filteredItems.length}
            total={inventoryItems.length}
            unitLabel={t("inventory.items")}
            hasActiveFilters={hasActiveFilters}
            onClear={clearFilters}
            clearLabel={t("common.clearFilters")}
            groups={[
              {
                key: "category",
                label: t("inventory.category"),
                variant: "chips",
                value: selectedCategory,
                onChange: setSelectedCategory,
                options: categoryValues.map((category, idx) => {
                  const meta = categoryMeta(category);
                  const Icon = meta.icon;
                  return {
                    value: category,
                    label: t(`inventory.${categoryKeys[idx]}`),
                    count: categoryCounts[category] ?? 0,
                    icon: category === "All" ? undefined : <Icon className={meta.color} />,
                  };
                }),
              },
              {
                key: "status",
                variant: "segmented",
                value: selectedStatus,
                onChange: (v) => setSelectedStatus(v as StatusFilter),
                options: STATUS_FILTERS.map((s) => ({ value: s.value, label: t(s.labelKey), count: statusCounts[s.value], dot: s.dot })),
              },
            ]}
          />

          {/* Listing */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {filteredItems.length === 0 ? (
              <>
                <EmptyState
                  icon={FaBoxes}
                  title={inventoryItems.length === 0 ? t("inventory.noItems") : t("inventory.noMatches")}
                  description={inventoryItems.length === 0 ? undefined : t("inventory.noMatchesHint")}
                />
                {hasActiveFilters && (
                  <div className="-mt-6 pb-10 text-center">
                    <button type="button" onClick={clearFilters} className="text-sm font-medium text-brand hover:underline">
                      {t("common.clearFilters")}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full table-fixed">
                  <colgroup>
                    <col className="w-[4%]" />
                    <col className="w-[26%]" />
                    <col className="w-[13%]" />
                    <col className="w-[14%]" />
                    <col className="w-[16%]" />
                    <col className="w-[13%]" />
                    <col className="w-[13%]" />
                  </colgroup>
                  <thead className="bg-gray-50/80 border-b border-gray-200">
                    <tr>
                      <th className="py-3 pl-5 pr-2">
                        <input
                          type="checkbox"
                          aria-label="Select all"
                          checked={allVisibleSelected}
                          onChange={toggleSelectAll}
                          className="size-4 rounded border-gray-300 accent-accent-blue-500"
                        />
                      </th>
                      {renderSortTh("name", t("inventory.item"))}
                      {renderSortTh("category", t("inventory.category"))}
                      {renderSortTh("stock", t("inventory.stock"), "center")}
                      {renderSortTh("supplier", t("inventory.supplier"))}
                      {renderSortTh("status", t("common.status"), "center")}
                      <th className="py-3 px-5 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-500">{t("common.actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 stagger">
                    {filteredItems.map((item) => {
                      const tone = statusTone(item.status);
                      const meta = categoryMeta(item.category);
                      const Icon = meta.icon;
                      const pct =
                        item.minimumStock > 0
                          ? Math.min(100, Math.round((item.currentStock / (item.minimumStock * 2)) * 100))
                          : item.currentStock > 0 ? 100 : 0;
                      return (
                        <tr
                          key={item.id}
                          onClick={() => openDetails(item)}
                          title={t("inventory.viewDetails")}
                          className={cn(
                            "group cursor-pointer transition-colors hover:bg-gray-50/80",
                            item.status === "out" && "bg-red-50/30",
                            selectedIds.has(item.id) && "bg-accent-blue-50/40 hover:bg-accent-blue-50/60",
                          )}
                        >
                          <td className="py-3.5 pl-5 pr-2" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              aria-label={`Select ${item.name}`}
                              checked={selectedIds.has(item.id)}
                              onChange={() => toggleSelect(item.id)}
                              className="size-4 rounded border-gray-300 accent-accent-blue-500"
                            />
                          </td>
                          <td className="py-3.5 px-5">
                            <div className="flex items-center gap-3">
                              <div className="w-11 h-11 rounded-xl overflow-hidden flex items-center justify-center shrink-0 bg-gray-100 ring-1 ring-gray-200/60">
                                {item.image_url ? (
                                  <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                                ) : (
                                  <Icon className={cn("text-lg", meta.color)} />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-gray-900 truncate">{item.name}</p>
                                <p className="text-xs text-gray-500">
                                  {t("inventory.lastRestocked")} {item.lastRestocked ? new Date(item.lastRestocked).toLocaleDateString() : "—"}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-5">
                            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", meta.chip)}>
                              <Icon className="text-[11px]" /> {categoryLabel(item.category)}
                            </span>
                          </td>
                          <td className="py-3.5 px-5">
                            <div className="mx-auto w-28">
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="font-semibold text-gray-900 tabular-nums">
                                  {item.currentStock} <span className="text-xs font-normal text-gray-400">{item.unit}</span>
                                </span>
                                <span className="min-w-0 truncate text-[11px] text-gray-400 tabular-nums">{t("inventory.min")} {item.minimumStock}</span>
                              </div>
                              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                                <div className={cn("h-full rounded-full transition-all", tone.bar)} style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-5 text-sm text-gray-700">
                            {item.supplier || <span className="text-gray-300">—</span>}
                          </td>
                          <td className="py-3.5 px-5 text-center">
                            <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset", tone.badge)}>
                              <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
                              {tone.label}
                            </span>
                          </td>
                          <td className="py-3.5 px-5" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-center gap-1 whitespace-nowrap">
                              <button
                                type="button"
                                title="Upload photo"
                                disabled={uploadingPhotoId === item.id}
                                onClick={() => { setPhotoTargetId(item.id); setPhotoError(""); setTimeout(() => photoInputRef.current?.click(), 0); }}
                                className="p-2 rounded-full text-gray-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-40"
                              >
                                {uploadingPhotoId === item.id ? (
                                  <span className="block w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <FaCamera />
                                )}
                              </button>
                              <button
                                type="button"
                                title={t("common.edit")}
                                onClick={() => handleOpenEdit(item)}
                                className="p-2 rounded-full text-gray-400 transition-colors hover:bg-brand/10 hover:text-brand"
                              >
                                <FaEdit />
                              </button>
                              <button
                                type="button"
                                title={t("common.delete")}
                                onClick={() => handleDelete(item.id)}
                                disabled={deletingId === item.id}
                                className="p-2 rounded-full text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
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
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Add Item Modal */}
      {/* Item details */}
      <Modal isOpen={!!detailItem} onClose={() => setDetailItem(null)} title={t("inventory.itemDetails")} maxWidth="max-w-2xl">
        {detailItem && (() => {
          const item = detailItem;
          const tone = statusTone(item.status);
          const meta = categoryMeta(item.category);
          const Icon = meta.icon;
          const pct = item.minimumStock > 0 ? Math.min(100, Math.round((item.currentStock / (item.minimumStock * 2)) * 100)) : item.currentStock > 0 ? 100 : 0;
          const cost = Number(item.cost_price ?? 0);
          const fmtMoney = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          return (
            <div className="space-y-5">
              {/* Identity */}
              <div className="flex items-start gap-4">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-gray-100 ring-1 ring-gray-200/60 flex items-center justify-center">
                  {item.image_url ? <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" /> : <Icon className={cn("text-3xl", meta.color)} />}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-lg font-bold text-gray-900" title={item.name}>{item.name}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", meta.chip)}>
                      <Icon className="text-[11px]" /> {categoryLabel(item.category)}
                    </span>
                    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset", tone.badge)}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
                      {tone.label}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-gray-500">
                    {t("inventory.lastRestocked")} {item.lastRestocked ? new Date(item.lastRestocked).toLocaleDateString() : "—"}
                  </p>
                </div>
              </div>

              {/* Stock tiles */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl bg-gray-50 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">{t("inventory.currentStock")}</p>
                  <p className="text-lg font-bold tabular-nums text-gray-900">{item.currentStock} <span className="text-xs font-normal text-gray-400">{item.unit}</span></p>
                </div>
                <div className="rounded-xl bg-gray-50 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">{t("inventory.minimumStock")}</p>
                  <p className="text-lg font-bold tabular-nums text-gray-900">{item.minimumStock} <span className="text-xs font-normal text-gray-400">{item.unit}</span></p>
                </div>
                <div className="rounded-xl bg-gray-50 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">{t("inventory.costPrice")}</p>
                  <p className="text-lg font-bold tabular-nums text-gray-900">{cost > 0 ? fmtMoney(cost) : "—"}</p>
                </div>
                <div className="rounded-xl bg-gray-50 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-wide text-gray-400">{t("inventory.stockValue")}</p>
                  <p className="text-lg font-bold tabular-nums text-gray-900">{cost > 0 ? fmtMoney(cost * item.currentStock) : "—"}</p>
                </div>
              </div>

              {/* Level bar */}
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-gray-500">{t("inventory.stockLevel")}</span>
                  <span className="tabular-nums text-gray-700">
                    {item.minimumStock > 0 ? `${Math.round((item.currentStock / item.minimumStock) * 100)}% ${t("inventory.ofMinimum")}` : "—"}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div className={cn("h-full rounded-full", tone.bar)} style={{ width: `${pct}%` }} />
                </div>
              </div>

              {/* Supplier / notes */}
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-400">{t("inventory.supplierNotes")}</p>
                <p className="mt-1 text-sm text-gray-700">{item.supplier || <span className="text-gray-300">—</span>}</p>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => { setDetailItem(null); handleOpenEdit(item); }} className="bg-brand hover:bg-brand/90">
                  <FaEdit className="me-2" /> {t("inventory.adjustStock")}
                </Button>
                <Button
                  variant="outline"
                  disabled={uploadingPhotoId === item.id}
                  onClick={() => { setPhotoTargetId(item.id); setPhotoError(""); setTimeout(() => photoInputRef.current?.click(), 0); }}
                >
                  <FaCamera className="me-2" /> {t("inventory.uploadPhoto")}
                </Button>
                <Button
                  variant="outline"
                  className="ms-auto border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  disabled={deletingId === item.id}
                  onClick={async () => { await handleDelete(item.id); setDetailItem(null); }}
                >
                  <FaTrash className="me-2" /> {t("common.delete")}
                </Button>
              </div>

              {/* Movement history */}
              <div className="rounded-2xl border border-gray-100">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-gray-900"><FaHistory className="text-gray-400" /> {t("inventory.movementHistory")}</h4>
                  <span className="text-xs text-gray-400 tabular-nums">{movements.length}</span>
                </div>
                {movementsLoading ? (
                  <p className="px-4 py-6 text-center text-sm text-gray-400">…</p>
                ) : movements.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-gray-400">{t("inventory.noMovements")}</p>
                ) : (
                  <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto">
                    {movements.map((m) => {
                      const isIn = m.type === "in";
                      const isOut = m.type === "out";
                      return (
                        <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                          <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs", isIn ? "bg-emerald-50 text-emerald-600" : isOut ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500")}>
                            {isIn ? <FaArrowUp /> : isOut ? <FaArrowDown /> : <FaHistory />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-gray-900">
                              <span className={cn("font-semibold tabular-nums", isIn ? "text-emerald-700" : isOut ? "text-red-700" : "text-gray-700")}>
                                {isIn ? "+" : isOut ? "−" : ""}{m.quantity} {item.unit}
                              </span>
                              <span className="ms-2 text-gray-500">{isIn ? t("inventory.stockIn") : isOut ? t("inventory.stockOut") : m.type}</span>
                            </p>
                            {m.note && <p className="truncate text-xs text-gray-500" title={m.note}>{m.note}</p>}
                          </div>
                          <div className="shrink-0 text-end text-xs text-gray-500">
                            <p>{m.date ? new Date(m.date).toLocaleDateString() : "—"}</p>
                            {m.by && <p className="text-gray-400">{m.by}</p>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          );
        })()}
      </Modal>

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
                type="number"
                placeholder="0"
                className={inputClass}
                value={addForm.quantity}
                onChange={(e) => setAddForm((f) => ({ ...f, quantity: Number(e.target.value) }))}
              />
            </FormField>
            <FormField label={t("inventory.minimumStock")}>
              <input
                type="number"
                placeholder="0"
                className={inputClass}
                value={addForm.minimum_quantity}
                onChange={(e) => setAddForm((f) => ({ ...f, minimum_quantity: Number(e.target.value) }))}
              />
            </FormField>
          </div>
          <FormField label="Unit Cost Price">
            <input
              type="number"
              step="0.01"
              min="0"
              max={100000}
              placeholder="0.00"
              className={inputClass}
              value={addForm.cost_price}
              onChange={(e) => setAddForm((f) => ({ ...f, cost_price: e.target.value }))}
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
            className="flex-1 bg-brand hover:bg-brand/90"
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
                  type="number"
                  className={inputClass}
                  value={editForm.minimum_quantity}
                  onChange={(e) => setEditForm((f) => ({ ...f, minimum_quantity: Number(e.target.value) }))}
                />
              </FormField>
              <FormField label="Unit Cost Price">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={100000}
                  className={inputClass}
                  value={editForm.cost_price}
                  onChange={(e) => setEditForm((f) => ({ ...f, cost_price: e.target.value }))}
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
                  min={1}
                  value={stockQty}
                  onChange={(e) => setStockQty(Math.max(1, Number(e.target.value)))}
                  className={cn(inputClass, "w-24 shrink-0")}
                  placeholder="Qty"
                />
                <input
                  type="text"
                  value={stockNote}
                  onChange={(e) => setStockNote(e.target.value)}
                  className={cn(inputClass, "min-w-0 flex-1")}
                  placeholder={t("inventory.notePlaceholder")}
                />
                <Button
                  onClick={handleStockAdjustment}
                  disabled={stockSaving || stockQty <= 0}
                  className={`shrink-0 ${stockType === "in" ? "bg-green-500 hover:bg-green-600" : "bg-red-500 hover:bg-red-600"}`}
                >
                  {stockSaving ? "..." : "Apply"}
                </Button>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => setShowEditModal(false)}>
                {t("common.cancel")}
              </Button>
              <Button className="flex-1 bg-brand hover:bg-brand/90" onClick={handleEditSave} disabled={editSaving}>
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

      <BulkActionBar
        count={selectedIds.size}
        onClear={() => setSelectedIds(new Set())}
        itemLabel="item"
        actions={[
          { key: "export", label: "Export", icon: <FaFileExport className="h-3 w-3" />, onClick: bulkExport.exportExcel },
          { key: "delete", label: "Delete", icon: <FaTrash className="h-3 w-3" />, onClick: handleBulkDelete, tone: "danger" },
        ]}
      />
    </div>
  );
}
