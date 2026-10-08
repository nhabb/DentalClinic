import type { ExpensesService } from '../../../doctor/expenses/expenses.service';
import type { ToolHandlers } from './tool-handler';

/** Clinic expenses (read-only). */
export function expenseTools(expenses: ExpensesService): ToolHandlers {
  return {
    list_expenses: (a) =>
      expenses.findAll({
        category: a.str('category'),
        from: a.str('from'),
        to: a.str('to'),
        page: a.numOr(1, 'page'),
        limit: a.numOr(20, 'limit'),
      }),

    get_expenses_analytics: (a) => expenses.getAnalytics(a.numOr(12, 'months')),
  };
}
