export interface ItemRow {
  id: number;
  code: string;
  name: string;
  categoryId: number;
  itemType: string;
  manufacturer: string | null;
  model: string | null;
  partNumber: string | null;
  description: string | null;
  unitOfMeasure: string;
  hsnCode: string | null;
  standardCost: string | null;
  warrantyMonths: number | null;
  reorderLevel: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  category: { id: number; code: string; name: string };
}

export interface CategoryOption {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
}
