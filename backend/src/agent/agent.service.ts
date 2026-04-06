import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { AppointmentsService } from '../appointments/appointments.service';
import { AppointmentSlotsService } from '../appointment-slots/appointment-slots.service';
import { PatientsService } from '../patients/patients.service';
import { InventoryService } from '../inventory/inventory.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
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
  ) {}

  async chat(messages: ChatMessage[], context: { doctorName: string; doctorId?: number }): Promise<string> {
    const today = new Date().toLocaleDateString('en-CA');
    const systemPrompt = `You are the AI assistant for BrightSmile Dental Clinic's admin panel.
You help doctors and staff manage appointments, patients, inventory, and clinic operations.
Today's date is ${today}.
You are speaking with ${context.doctorName}${context.doctorId ? ` (Doctor ID: ${context.doctorId})` : ''}.

Guidelines:
- Be concise and professional.
- When listing data, present it clearly using bullet points or short lists.
- Always confirm before taking irreversible actions (cancel, delete).
- If a tool call fails, explain the error clearly.
- Appointment flow: scheduled → confirmed → completed. cancelled and no_show are terminal states.`;

    let openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content }) as OpenAI.ChatCompletionMessageParam),
    ];

    let response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      tools: AGENT_TOOLS,
      messages: openaiMessages,
    });

    // Tool use loop
    while (response.choices[0].finish_reason === 'tool_calls') {
      const assistantMessage = response.choices[0].message;
      openaiMessages.push(assistantMessage);

      const toolResults: OpenAI.ChatCompletionToolMessageParam[] = await Promise.all(
        (assistantMessage.tool_calls ?? []).map(async (call) => {
          const fn = (call as any).function;
          const input = JSON.parse(fn.arguments);
          const result = await this.executeTool(fn.name, input);
          return {
            role: 'tool' as const,
            tool_call_id: call.id,
            content: result,
          };
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
        // ── Appointments ──────────────────────────────────────────
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

        default:
          return JSON.stringify({ error: `Unknown tool: ${name}` });
      }
    } catch (err: any) {
      return JSON.stringify({ error: err.message ?? 'Tool execution failed' });
    }
  }
}
