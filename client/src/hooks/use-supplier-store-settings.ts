import { useQuery } from "@tanstack/react-query";

export type SupplierStoreSettings = {
  storeTabVisible: boolean;
  openControlVisible: boolean;
  marketplaceVisibilityControlVisible: boolean;
  imagesTabVisible: boolean;
  videoTabVisible: boolean;
  maxCoverImages: number;
  musicVisible: boolean;
  videoUrlFieldVisible: boolean;
  hoursTabVisible: boolean;
};

export const DEFAULT_SUPPLIER_STORE_SETTINGS: SupplierStoreSettings = {
  storeTabVisible: true,
  openControlVisible: true,
  marketplaceVisibilityControlVisible: true,
  imagesTabVisible: true,
  videoTabVisible: true,
  maxCoverImages: 5,
  musicVisible: true,
  videoUrlFieldVisible: true,
  hoursTabVisible: true,
};

export function useSupplierStoreSettings() {
  const { data, isLoading } = useQuery<SupplierStoreSettings>({
    queryKey: ["/api/supplier-store-settings"],
  });
  return { settings: data ?? DEFAULT_SUPPLIER_STORE_SETTINGS, isLoading };
}
