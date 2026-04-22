import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { AppointmentsService } from '../../doctor/appointments/appointments.service';
import { AppointmentSlotsService } from '../../doctor/appointment-slots/appointment-slots.service';
import { PatientsService } from '../patients/patients.service';
import { InventoryService } from '../../doctor/inventory/inventory.service';
import { UsersService } from '../../shared/users/users.service';
import { NotificationsService } from '../../shared/notifications/notifications.service';
import { PaymentsService } from '../../doctor/payments/payments.service';
import { ExpensesService } from '../../doctor/expenses/expenses.service';
import { BillingService } from '../../doctor/billing/billing.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AGENT_TOOLS } from './agent.tools';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;//it can be other than string, it can be an object with image_url or other properties, but for simplicity we will keep it as string and we can stringify the objects before sending them to the chat function and parse them back when we receive them in the tool calls.
}

/** Safely serialize Prisma results (BigInt → number) */
function serialize(data: any): string {//why ?? Because Prisma often returns BigInt values for IDs and other numeric fields, which can cause issues when trying to serialize the data to JSON for sending it back to the OpenAI API or for logging purposes. The standard JSON.stringify does not support BigInt and will throw an error if it encounters one. By using a custom replacer function in JSON.stringify, we can convert any BigInt values to regular numbers before serialization, ensuring that the data can be safely converted to a JSON string without errors. This allows us to handle Prisma results that contain BigInt values without running into serialization issues.
  return JSON.stringify(data, (_, v) => (typeof v === 'bigint' ? Number(v) : v), 2);
}

@Injectable()
export class AgentService {
  private readonly openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  constructor(
    private readonly appointments: AppointmentsService,
    private readonly slots: AppointmentSlotsService,
    private readonly patients: PatientsService,
    private readonly inventory: InventoryService,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
    private readonly payments: PaymentsService,
    private readonly expenses: ExpensesService,
    private readonly billing: BillingService,
    private readonly prisma: PrismaService,
  ) {}

  async chat(messages: ChatMessage[], context: { doctorName: string; doctorId?: number }): Promise<string> {
    const today = new Date().toLocaleDateString('en-CA');

    let displayName = context.doctorName;
    if (context.doctorId) {
      try {
        const user = await this.users.findById(BigInt(context.doctorId));
        if (user?.first_name) displayName = `${user.first_name} ${user.last_name}`;
      } catch {}
    }

    const systemPrompt = `You are the AI assistant for BrightSmile Dental Clinic's admin panel.
You help doctors and staff manage appointments, patients, inventory, and clinic finances.
Today's date is ${today} (YYYY-MM-DD format). Always use this exact format when passing dates to tools.
You are speaking with Dr. ${displayName}${context.doctorId ? ` (Doctor ID: ${context.doctorId})` : ''}.
When the user asks about "my appointments" or "my patients", use doctor_id: ${context.doctorId ?? 'unknown'} in the filter.

Guidelines:
- Be concise and professional.
- When listing data, present it clearly using bullet points or short lists.
- Always confirm before taking irreversible actions (cancel, delete).
- If a tool call fails, explain the error clearly.
- Appointment flow: scheduled → confirmed → completed. cancelled and no_show are terminal states.
- Always pass dates in YYYY-MM-DD format (e.g., ${today}).
- You have a query_database tool that runs any PostgreSQL SELECT directly against the database. Use it proactively:
  1. When a dedicated tool returns empty results and the user seems confident the data exists, do NOT ask the user to try a different keyword — immediately use query_database to investigate, then retry with the correct values.
  2. For any question not covered by dedicated tools (aggregations, joins, counts, schema discovery) go straight to query_database.
  3. Never tell the user "I cannot find X" before trying query_database first.
  4. Never use query_database for mutations (INSERT, UPDATE, DELETE, DROP).
  Database table reference (always use these exact names in SQL):
    - appointments
    - appointment_slots
    - patient_profiles       (patient demographic info)
    - patient_records        (clinical/treatment notes)
    - patient_documents      (uploaded files)
    - users                  (doctors, secretaries, admins)
    - payments               (standalone legacy payment invoices)
    - treatment_invoices     (itemized invoices — NOT "invoices")
    - invoice_line_items     (procedures inside a treatment_invoice)
    - invoice_payments       (payment transactions against a treatment_invoice)
    - expenses               (clinic operating expenses)
    - inventory_items        (stock/supply items)
    - inventory_movements    (stock movement history)
    - notifications
    - clinic_profile
    - audit_logs

Financial guidelines:
- The clinic has TWO payment systems — always check both when users ask about payments or outstanding balances:
  1. Treatment invoices (new system): use list_invoices, get_invoice, create_invoice, record_invoice_payment. These are itemized procedure invoices with line items and per-payment history.
  2. Standalone payments (legacy system): use list_payments, create_payment, record_payment. These are simple payment records without procedure breakdown.
- When a user asks "show me payments", "what's owed", or anything about money, check BOTH list_invoices AND list_payments.
- For money overview use get_financial_kpis first.
- Use get_aging_report to identify overdue payments.
- Use get_patient_financials to see what a specific patient owes (legacy payments only).
- Amounts are in the clinic's local currency.
- When recording a payment on an invoice use record_invoice_payment (NOT record_payment).
- When recording a payment on a standalone payment record use record_payment.

Treatment billing guidelines:
- After a procedure, create a treatment invoice with create_invoice specifying each procedure and its cost.
- Invoice statuses: open (unpaid), partial (partially paid), paid (fully settled).
- To accept a payment on an invoice use record_invoice_payment — the remaining balance updates automatically.
- Use list_invoices with status: "open" or status: "partial" to find unpaid invoices.
- Use get_invoice to see full procedure list and payment history for a specific invoice.`;

    let openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content }) as OpenAI.ChatCompletionMessageParam),//what is that? This line is mapping the incoming messages (which are of type ChatMessage) to the format expected by the OpenAI API (OpenAI.ChatCompletionMessageParam). The ChatMessage type has a role of 'user' or 'assistant' and a content string. The OpenAI.ChatCompletionMessageParam type also has a role and content, but it may have additional properties for tool calls. By mapping our internal ChatMessage format to the OpenAI format, we can ensure that the messages are correctly structured when we send them to the OpenAI API for generating responses. This allows us to maintain a consistent message format within our application while still being compatible with the requirements of the OpenAI API.
    ];//is theer any other syntax? Yes, we could also write this mapping using a for loop or using the Array.prototype.reduce method, but using Array.prototype.map is a concise and readable way to transform the array of messages from one format to another. It allows us to easily create a new array of OpenAI.ChatCompletionMessageParam objects based on the original ChatMessage objects without mutating the original array, which is a common functional programming pattern in JavaScript and TypeScript.

    let response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      tools: AGENT_TOOLS,
      messages: openaiMessages,
    });

    while (response.choices[0].finish_reason === 'tool_calls') {//what does this while loop do? This while loop checks if the OpenAI response indicates that the model has made tool calls (finish_reason === 'tool_calls'). If it has, it means that the model has requested to call one or more tools to retrieve information or perform actions based on the user's input. The loop then processes each tool call by executing the corresponding function for each requested tool, collects the results, and appends them to the conversation history. After processing the tool calls, it sends a new request to the OpenAI API with the updated conversation history (including the tool results) to get a new response from the model. This allows for an iterative process where the model can make multiple tool calls and receive updated information before generating a final response to the user.
      // "show me today's appointments" -> the model thinks i need to call a tool ->then finish_reason will be tool_calls -> we execute the tool calls and get the results -> we send a new request to openai with the updated messages (including the tool results) -> we get a new response from openai which may or may not require more tool calls -> if it does, we repeat the process until we get a response that does not require any more tool calls and then we return that response to the user.
      const assistantMessage = response.choices[0].message;
      openaiMessages.push(assistantMessage);//here i am adding the response from the assistant to the conversation history before processing the tool calls, so that the context of the conversation is maintained when we execute the tools and send the updated messages back to OpenAI for further processing. This way, the model can see its previous response and the results of the tool calls in the context of the conversation, allowing it to generate a more informed and relevant response in subsequent iterations.

      const toolResults: OpenAI.ChatCompletionToolMessageParam[] = await Promise.all(
        (assistantMessage.tool_calls ?? []).map(async (call) => {
          const fn = (call as any).function;
          const input = JSON.parse(fn.arguments);
          const result = await this.executeTool(fn.name, input);
          return { role: 'tool' as const, tool_call_id: call.id, content: result };
        }),
      );

      openaiMessages = [...openaiMessages, ...toolResults];

      response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        tools: AGENT_TOOLS,
        messages: openaiMessages,
      });
    }

    return response.choices[0].message.content ?? 'No response generated.';
  }

  private async executeTool(name: string, input: Record<string, any>): Promise<string> {
    try {
      switch (name) {
        // ── Appointments ───────────────────────────────────────────
        case 'list_appointments':
          return serialize(await this.appointments.findAll({
            doctor_id: input.doctor_id,
            patient_id: input.patient_id,
            status: input.status,
            date: input.date,
            page: input.page ?? 1,
            limit: input.limit ?? 10,
          }));

        case 'get_appointment':
          return serialize(await this.appointments.findOne(BigInt(input.id)));

        case 'confirm_appointment':
          return serialize({ success: true, appointment: await this.appointments.confirm(BigInt(input.id)) });

        case 'complete_appointment':
          return serialize({ success: true, appointment: await this.appointments.complete(BigInt(input.id)) });

        case 'cancel_appointment':
          return serialize({ success: true, appointment: await this.appointments.cancel(BigInt(input.id), { reason: input.reason }) });

        case 'update_appointment_notes':
          return serialize({ success: true, appointment: await this.appointments.updateNotes(BigInt(input.id), { notes: input.notes, reason: input.reason }) });

        // ── Slots ──────────────────────────────────────────────────
        case 'list_slots':
          return serialize(await this.slots.findAll({ doctor_id: input.doctor_id, date: input.date, available_only: input.available_only, limit: 50 }));

        case 'delete_slot':
          return serialize(await this.slots.remove(BigInt(input.id)));

        // ── Patients ───────────────────────────────────────────────
        case 'list_patients':
          return serialize(await this.patients.findAll(input.page ?? 1, input.limit ?? 10, input.search));

        case 'get_patient':
          return serialize(await this.patients.findById(BigInt(input.id)));

        // ── Inventory ──────────────────────────────────────────────
        case 'list_inventory':
          return serialize(await this.inventory.findAll({ search: input.search, category: input.category, low_stock_only: input.low_stock_only, page: 1, limit: 20 }));

        case 'get_low_stock_items':
          return serialize(await this.inventory.findLowStock());

        // ── Users ──────────────────────────────────────────────────
        case 'list_doctors':
          return serialize(await this.users.findAll('admin'));

        // ── Notifications ──────────────────────────────────────────
        case 'send_notification':
          await this.notifications.create({ user_id: BigInt(input.user_id), title: input.title, message: input.message, type: 'appointment_booked' });
          return serialize({ success: true });

        // ── Payments ───────────────────────────────────────────────
        case 'get_financial_kpis':
          return serialize(await this.payments.getKpis());

        case 'get_financial_summary':
          return serialize(await this.payments.getSummary({ from: input.from, to: input.to }));

        case 'get_payments_analytics':
          return serialize(await this.payments.getAnalytics(input.months ?? 12));

        case 'get_outstanding_payments':
          return serialize(await this.payments.getOutstanding());

        case 'get_aging_report':
          return serialize(await this.payments.getAging());

        case 'get_patient_financials':
          return serialize(await this.payments.getPatientFinancials(input.patient_id ? BigInt(input.patient_id) : undefined));

        case 'list_payments':
          return serialize(await this.payments.findAll({
            patient_id: input.patient_id,
            status: input.status,
            from: input.from,
            to: input.to,
            page: input.page ?? 1,
            limit: input.limit ?? 20,
          }));

        case 'create_payment':
          return serialize(await this.payments.create({
            patient_id: input.patient_id,
            appointment_id: input.appointment_id,
            amount: input.amount,
            payment_method: input.payment_method ?? 'cash',
            description: input.description,
          }));

        case 'record_payment':
          return serialize(await this.payments.updateStatus(BigInt(input.id), {
            amount_paid: input.amount_paid,
            paid_at: input.paid_at,
          }));

        // ── Treatment Billing ──────────────────────────────────────
        case 'list_invoices':
          return serialize(await this.billing.findAll({
            patient_id: input.patient_id,
            status: input.status,
            from: input.from,
            to: input.to,
            page: input.page ?? 1,
            limit: input.limit ?? 20,
          }));

        case 'get_invoice':
          return serialize(await this.billing.findOne(BigInt(input.id)));

        case 'create_invoice':
          return serialize(await this.billing.create({
            patient_id: input.patient_id,
            procedure_date: input.procedure_date,
            notes: input.notes,
            line_items: input.line_items,
          }));

        case 'record_invoice_payment':
          return serialize(await this.billing.recordPayment(BigInt(input.invoice_id), {
            amount: input.amount,
            payment_method: input.payment_method ?? 'cash',
            notes: input.notes,
          }));

        // ── Expenses ───────────────────────────────────────────────
        case 'list_expenses':
          return serialize(await this.expenses.findAll({
            category: input.category,
            from: input.from,
            to: input.to,
            page: input.page ?? 1,
            limit: input.limit ?? 20,
          }));

        case 'create_expense':
          return serialize(await this.expenses.create({
            title: input.title,
            category: input.category ?? 'other',
            amount: input.amount,
            description: input.description,
            expense_date: input.expense_date,
          }));

        case 'get_expenses_analytics':
          return serialize(await this.expenses.getAnalytics(input.months ?? 12));

        // ── Raw Database Query ─────────────────────────────────────
        case 'query_database': {
          const sql: string = input.sql ?? '';
          if (!/^\s*SELECT\b/i.test(sql)) {
            return JSON.stringify({ error: 'Only SELECT queries are allowed.' });
          }
          const rows = await this.prisma.$queryRawUnsafe(sql);
          return serialize(rows);
        }

        default:
          return JSON.stringify({ error: `Unknown tool: ${name}` });
      }
    } catch (err: any) {
      return JSON.stringify({ error: err.message ?? 'Tool execution failed' });
    }
  }
}
