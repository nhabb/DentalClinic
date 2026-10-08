import type { ExpensesService } from '../../../doctor/expenses/expenses.service';
import { todayIso, type ToolHandlers } from './tool-handler';

/** Clinic expenses. */
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

    create_expense: (a) =>
      expenses.create({
        title: a.reqStr('title'),
        category: a.strOr('other', 'category'),
        amount: a.reqNum('amount'),
        description: a.str('description'),
        expense_date: a.strOr(todayIso(), 'expense_date'),
      }),

    get_expenses_analytics: (a) => expenses.getAnalytics(a.numOr(12, 'months')),
  };
}
