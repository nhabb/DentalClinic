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
import { AGENT_TOOLS } from './agent.tools';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Safely serialize Prisma results (BigInt → number) */
function serialize(data: any): string {
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

Financial guidelines:
- For money questions use get_financial_kpis first for an overview.
- Use get_aging_report to identify overdue payments.
- Use get_patient_financials to see what a specific patient owes.
- Amounts are in the clinic's local currency.
- When recording a payment use record_payment with the amount received this time (it accumulates automatically).`;

    let openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content }) as OpenAI.ChatCompletionMessageParam),
    ];

    let response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      tools: AGENT_TOOLS,
      messages: openaiMessages,
    });

    while (response.choices[0].finish_reason === 'tool_calls') {
      const assistantMessage = response.choices[0].message;
      openaiMessages.push(assistantMessage);

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
        model: 'gpt-4o',
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

        default:
          return JSON.stringify({ error: `Unknown tool: ${name}` });
      }
    } catch (err: any) {
      return JSON.stringify({ error: err.message ?? 'Tool execution failed' });
    }
  }
}
