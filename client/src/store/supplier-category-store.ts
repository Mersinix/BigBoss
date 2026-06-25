import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SupplierCategoryStore {
  selectedCategoryId: number | null;
  selectedSubCategoryId: number | null;
  setSelectedCategory: (id: number | null) => void;
  setSelectedSubCategory: (id: number | null) => void;
  clearSelection: () => void;
}

export const useSupplierCategoryStore = create<SupplierCategoryStore>()(
  persist(
    (set) => ({
      selectedCategoryId: null,
      selectedSubCategoryId: null,
      setSelectedCategory: (id) => set({ selectedCategoryId: id, selectedSubCategoryId: null }),
      setSelectedSubCategory: (id) => set({ selectedSubCategoryId: id }),
      clearSelection: () => set({ selectedCategoryId: null, selectedSubCategoryId: null }),
    }),
    {
      name: "supplier-category-selection",
    }
  )
);
