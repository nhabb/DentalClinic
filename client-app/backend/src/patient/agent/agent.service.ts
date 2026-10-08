import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import OpenAI from 'openai';
import { AppointmentsService } from '../../doctor/appointments/appointments.service';
import { AppointmentSlotsService } from '../../doctor/appointment-slots/appointment-slots.service';
import { PatientsService } from '../patients/patients.service';
import { InventoryService } from '../../doctor/inventory/inventory.service';
import { UsersService } from '../../shared/users/users.service';
import { NotificationsService } from '../../shared/notifications/notifications.service';
import { ExpensesService } from '../../doctor/expenses/expenses.service';
import { BillingService } from '../../doctor/billing/billing.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RolesService } from '../../shared/authorization/roles.service';
import type { RequestUser } from '../../shared/common/guards/jwt-auth.guard';
import {
  describeAccess,
  isSensitiveColumn,
  redactSensitiveFields,
  sqlDenial,
  toolDenial,
  toolsFor,
} from './agent-access';
import { buildSystemPrompt } from './agent-prompt';
import {
  MAX_ROWS,
  isDatabasePermissionRefusal,
  runGuardedSelect,
} from './guarded-select';
import { ToolArgs } from './tool-args';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const MODEL = 'gpt-4o-mini';

/** JSON for the model: Prisma returns BigInt ids, which JSON.stringify rejects. */
function serialize(data: unknown): string {
  return JSON.stringify(
    data,
    (_, v: unknown) => (typeof v === 'bigint' ? Number(v) : v),
    2,
  );
}

const errorResult = (message: string) => JSON.stringify({ error: message });

/** Today as YYYY-MM-DD, the format the services and the model use. */
const todayIso = () => new Date().toISOString().split('T')[0];

/**
 * The clinic AI assistant: an OpenAI function-calling loop over the clinic's
 * own services.
 *
 * Authorization is the caller's, not the assistant's. The model only sees the
 * tools the user's role may use (agent-access.ts), every tool call is checked
 * again before it runs, and every service call happens inside the request's
 * tenant context, so row-level security applies exactly as it does for the
 * REST API.
 */
@Injectable()
export class AgentService implements OnModuleInit {
  private readonly logger = new Logger(AgentService.name);
  private openai: OpenAI | null = null;
  private dbSchema = '';

  constructor(
    private readonly appointments: AppointmentsService,
    private readonly slots: AppointmentSlotsService,
    private readonly patients: PatientsService,
    private readonly inventory: InventoryService,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
    private readonly expenses: ExpensesService,
    private readonly billing: BillingService,
    private readonly roles: RolesService,
    private readonly prisma: PrismaService,
  ) {}

  /** Created on first use so the API key is only needed when someone chats. */
  private get client(): OpenAI {
    this.openai ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return this.openai;
  }

  /** Load "table: columns" once so the model uses real column names in SQL. */
  async onModuleInit() {
    try {
      const rows = await this.prisma.$queryRaw<
        { table_name: string; column_name: string; data_type: string }[]
      >`
        SELECT table_name::text, column_name::text, data_type::text
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position
      `;
      const tables = new Map<string, string[]>();
      for (const row of rows) {
        // Credential columns are never readable, so the model need not know them.
        if (isSensitiveColumn(row.column_name)) continue;
        const cols = tables.get(row.table_name) ?? [];
        cols.push(`${row.column_name} (${row.data_type})`);
        tables.set(row.table_name, cols);
      }
      this.dbSchema = [...tables]
        .map(([table, cols]) => `  ${table}: ${cols.join(', ')}`)
        .join('\n');
    } catch (err) {
      // Not fatal: the model then works without column names until a restart.
      const e = err as Error & { code?: string; meta?: unknown };
      this.logger.warn(
        `Could not load DB schema (${e.code ?? e.name}): ${e.message.trim()} ${e.meta ? JSON.stringify(e.meta) : ''}`,
      );
    }
  }

  async chat(messages: ChatMessage[], user: RequestUser): Promise<string> {
    const tools = toolsFor(user);
    const systemPrompt = buildSystemPrompt({
      user,
      displayName: await this.displayNameOf(user),
      today: new Date().toLocaleDateString('en-CA'),
      dbSchema: this.dbSchema,
    });

    let conversation: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    let response = await this.client.chat.completions.create({
      model: MODEL,
      tools,
      messages: conversation,
    });

    // The model asks for tools until it has what it needs to answer.
    while (response.choices[0].finish_reason === 'tool_calls') {
      const assistantMessage = response.choices[0].message;
      const toolResults = await Promise.all(
        (assistantMessage.tool_calls ?? []).map(async (call) => ({
          role: 'tool' as const,
          tool_call_id: call.id,
          content:
            call.type === 'function'
              ? await this.executeTool(
                  user,
                  call.function.name,
                  ToolArgs.parse(call.function.arguments),
                )
              : errorResult('Unsupported tool call type'),
        })),
      );
      conversation = [...conversation, assistantMessage, ...toolResults];

      response = await this.client.chat.completions.create({
        model: MODEL,
        tools,
        messages: conversation,
      });
    }

    return response.choices[0].message.content ?? 'No response generated.';
  }

  private async displayNameOf(user: RequestUser): Promise<string | null> {
    try {
      const row = await this.users.findById(BigInt(user.id));
      return row?.first_name
        ? `${row.first_name} ${row.last_name ?? ''}`.trim()
        : null;
    } catch {
      return null;
    }
  }

  /**
   * Run one tool on the user's behalf. The permission check here is the
   * second layer: the model only receives allowed tools, but it can still name
   * one it was not given.
   */
  async executeTool(
    user: RequestUser,
    name: string,
    args: ToolArgs,
  ): Promise<string> {
    const denial = toolDenial(user, name);
    if (denial) {
      this.logger.warn(
        `Refused tool ${name} for user ${user.id} (${user.role}): ${denial}`,
      );
      return errorResult(denial);
    }
    this.logger.log(`Tool ${name} by user ${user.id} (${user.role})`);

    try {
      return await this.runTool(user, name, args);
    } catch (err) {
      if (isDatabasePermissionRefusal(err)) {
        // The application-side check should have refused first: investigate.
        this.logger.error(
          `Database refused a read for user ${user.id} (${user.role}) that passed the application check: ${(err as Error).message}`,
        );
      }
      return errorResult((err as Error).message ?? 'Tool execution failed');
    }
  }

  private async runTool(
    user: RequestUser,
    name: string,
    a: ToolArgs,
  ): Promise<string> {
    switch (name) {
      // ── Permissions and roles ──────────────────────────────────
      case 'get_my_permissions':
        return serialize({ role: user.role, ...describeAccess(user) });

      case 'list_roles':
        return serialize(await this.roles.list());

      // ── Appointments ───────────────────────────────────────────
      case 'list_appointments':
        return serialize(
          await this.appointments.findAll({
            doctor_id: a.num('doctor_id'),
            patient_id: a.num('patient_id'),
            status: a.str('status'),
            date: a.str('date'),
            page: a.numOr(1, 'page'),
            limit: a.numOr(10, 'limit'),
          }),
        );

      case 'get_appointment':
        return serialize(await this.appointments.findOne(a.id('id')));

      case 'confirm_appointment':
        return serialize({
          success: true,
          appointment: await this.appointments.confirm(a.id('id')),
        });

      case 'complete_appointment':
        return serialize({
          success: true,
          appointment: await this.appointments.complete(a.id('id')),
        });

      case 'cancel_appointment':
        return serialize({
          success: true,
          appointment: await this.appointments.cancel(a.id('id'), {
            reason: a.str('reason'),
          }),
        });

      case 'update_appointment_notes':
        return serialize({
          success: true,
          appointment: await this.appointments.updateNotes(a.id('id'), {
            notes: a.str('notes'),
            reason: a.str('reason'),
          }),
        });

      // ── Slots ──────────────────────────────────────────────────
      case 'list_slots':
        return serialize(
          await this.slots.findAll({
            doctor_id: a.num('doctor_id'),
            date: a.str('date'),
            available_only: a.bool('available_only'),
            limit: 50,
          }),
        );

      case 'delete_slot':
        return serialize(await this.slots.remove(a.id('id')));

      // ── Patients ───────────────────────────────────────────────
      case 'list_patients':
        return serialize(
          await this.patients.findAll(
            a.numOr(1, 'page'),
            a.numOr(10, 'limit'),
            a.str('search'),
          ),
        );

      case 'get_patient':
        return serialize(await this.patients.findById(a.id('id')));

      case 'list_patient_documents': {
        const page = a.numOr(1, 'page');
        const limit = a.numOr(20, 'limit');
        const where = { patient_id: a.id('patient_id') };
        const [docs, total] = await Promise.all([
          this.prisma.patient_documents.findMany({
            where,
            orderBy: { uploaded_at: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
          }),
          this.prisma.patient_documents.count({ where }),
        ]);
        return serialize({
          data: docs,
          meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
      }

      // ── Inventory ──────────────────────────────────────────────
      case 'list_inventory':
        return serialize(
          await this.inventory.findAll({
            search: a.str('search'),
            category: a.str('category'),
            low_stock_only: a.bool('low_stock_only'),
            page: 1,
            limit: 20,
          }),
        );

      case 'get_low_stock_items':
        return serialize(await this.inventory.findLowStock());

      case 'list_inventory_movements':
        return serialize(
          await this.inventory.listMovements({
            item_id: a.idOrUndefined('item_id'),
            movement_type: a.str('movement_type'),
            page: a.numOr(1, 'page'),
            limit: a.numOr(20, 'limit'),
          }),
        );

      // ── Team ───────────────────────────────────────────────────
      case 'list_doctors':
        // Active staff: in some clinics the treating doctors hold the admin role.
        return serialize(await this.users.findStaff());

      case 'send_notification':
        await this.notifications.create({
          user_id: a.id('user_id'),
          title: a.reqStr('title'),
          message: a.reqStr('message'),
          type: 'appointment_booked',
        });
        return serialize({ success: true });

      // ── Financial KPIs / summary ───────────────────────────────
      case 'get_financial_kpis':
        return serialize(await this.billing.getKpis());

      case 'get_financial_summary':
        return serialize(
          await this.billing.getSummary({
            from: a.str('from'),
            to: a.str('to'),
          }),
        );

      case 'get_payments_analytics':
        return serialize(
          await this.billing.getPaymentsAnalytics(a.numOr(12, 'months')),
        );

      case 'get_outstanding_payments':
        return serialize(await this.billing.getOutstandingPayments());

      case 'get_aging_report':
        return serialize(await this.billing.getAgingReport());

      case 'get_patient_financials':
        return serialize(
          await this.billing.getPatientFinancials(a.num('patient_id')),
        );

      // ── Treatment billing ──────────────────────────────────────
      case 'list_invoices':
      case 'list_payments': // alias kept for older conversations
        return serialize(
          await this.billing.findAll({
            patient_id: a.num('patient_id'),
            status: a.str('status'),
            from: a.str('from'),
            to: a.str('to'),
            page: a.numOr(1, 'page'),
            limit: a.numOr(20, 'limit'),
          }),
        );

      case 'get_invoice':
        return serialize(await this.billing.findOne(a.id('id')));

      case 'create_invoice':
      case 'create_payment': // alias kept for older conversations
        return serialize(
          await this.billing.create({
            patient_id: a.reqNum('patient_id'),
            procedure_date: a.strOr(todayIso(), 'procedure_date', 'date'),
            notes: a.str('notes', 'description'),
            line_items: a.objects('line_items')?.map((item) => ({
              procedure_name: item.strOr('Procedure', 'procedure_name'),
              amount: item.numOr(0, 'amount'),
            })) ?? [
              { procedure_name: 'Checkup', amount: a.numOr(0, 'amount') },
            ],
          }),
        );

      case 'record_invoice_payment':
      case 'record_payment': // alias kept for older conversations
        return serialize(
          await this.billing.recordPayment(a.id('invoice_id', 'id'), {
            amount: a.reqNum('amount', 'amount_paid'),
            payment_method: a.strOr('cash', 'payment_method'),
            notes: a.str('notes'),
          }),
        );

      // ── Expenses ───────────────────────────────────────────────
      case 'list_expenses':
        return serialize(
          await this.expenses.findAll({
            category: a.str('category'),
            from: a.str('from'),
            to: a.str('to'),
            page: a.numOr(1, 'page'),
            limit: a.numOr(20, 'limit'),
          }),
        );

      case 'create_expense':
        return serialize(
          await this.expenses.create({
            title: a.reqStr('title'),
            category: a.strOr('other', 'category'),
            amount: a.reqNum('amount'),
            description: a.str('description'),
            expense_date: a.strOr(todayIso(), 'expense_date'),
          }),
        );

      case 'get_expenses_analytics':
        return serialize(
          await this.expenses.getAnalytics(a.numOr(12, 'months')),
        );

      // ── Raw SQL ────────────────────────────────────────────────
      case 'query_database': {
        const sql = a.strOr('', 'sql');
        const refused = sqlDenial(user, sql);
        if (refused) {
          this.logger.warn(
            `Refused SQL for user ${user.id} (${user.role}): ${refused}`,
          );
          return errorResult(refused);
        }
        // Runs on the request's tenant connection (SET ROLE dental_app + RLS),
        // read-only, row-capped, rolled back if it touched session settings.
        const { rows, truncated } = await runGuardedSelect(
          this.prisma,
          sql,
          user.role === 'superadmin' ? '*' : user.permissions,
        );
        const data = redactSensitiveFields(rows);
        return serialize(
          truncated
            ? {
                rows: data,
                truncated: true,
                note: `Only the first ${MAX_ROWS} rows are shown; narrow the query.`,
              }
            : data,
        );
      }

      default:
        // toolDenial() already refuses unknown names; this is a safety net.
        return errorResult(`Unknown tool "${name}".`);
    }
  }
}
