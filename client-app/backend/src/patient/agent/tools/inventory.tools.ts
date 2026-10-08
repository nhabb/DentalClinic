import type { InventoryService } from '../../../doctor/inventory/inventory.service';
import type { ToolHandlers } from './tool-handler';

/** Stock levels and movements. */
export function inventoryTools(inventory: InventoryService): ToolHandlers {
  return {
    list_inventory: (a) =>
      inventory.findAll({
        search: a.str('search'),
        category: a.str('category'),
        low_stock_only: a.bool('low_stock_only'),
        page: 1,
        limit: 20,
      }),

    get_low_stock_items: () => inventory.findLowStock(),

    list_inventory_movements: (a) =>
      inventory.listMovements({
        item_id: a.idOrUndefined('item_id'),
        movement_type: a.str('movement_type'),
        page: a.numOr(1, 'page'),
        limit: a.numOr(20, 'limit'),
      }),
  };
}
