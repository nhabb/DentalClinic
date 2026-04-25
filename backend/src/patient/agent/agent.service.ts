import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import OpenAI from 'openai';
import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { AppointmentsService } from '../../doctor/appointments/appointments.service';
import { AppointmentSlotsService } from '../../doctor/appointment-slots/appointment-slots.service';
import { PatientsService } from '../patients/patients.service';
import { InventoryService } from '../../doctor/inventory/inventory.service';
import { UsersService } from '../../shared/users/users.service';
import { NotificationsService } from '../../shared/notifications/notifications.service';
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

// SQL mutation guard — only SELECT allowed through MCP and query_database
const SQL_WRITE_PATTERN = /^\s*(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|REPLACE|MERGE)\b/i;

// Sensitive columns that must never be returned in any query result
const SENSITIVE_COLUMNS = new Set([
  'password', 'password_hash', 'hashed_password', 'encrypted_password',
  'token', 'refresh_token', 'access_token', 'secret', 'api_key',
  'private_key', 'encryption_key', 'otp', 'otp_secret', 'recovery_codes',
]);

// Block queries that reference sensitive columns or auth schema
const SQL_SENSITIVE_PATTERN = /\b(password|password_hash|hashed_password|encrypted_password|refresh_token|access_token|api_key|private_key|otp_secret|recovery_codes)\b|auth\.(users|sessions|identities)/i;

function redactSensitiveFields(data: any): any {
  if (Array.isArray(data)) return data.map(redactSensitiveFields);
  if (data && typeof data === 'object') {
    return Object.fromEntries(
      Object.entries(data).map(([k, v]) =>
        SENSITIVE_COLUMNS.has(k.toLowerCase()) ? [k, '[REDACTED]'] : [k, redactSensitiveFields(v)],
      ),
    );
  }
  return data;
}

@Injectable()
export class AgentService implements OnModuleInit, OnModuleDestroy {
  private readonly openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  private mcpClient: McpClient | null = null;
  private mcpTools: OpenAI.ChatCompletionTool[] = [];
  private dbSchema: string = '';

  constructor(
    private readonly appointments: AppointmentsService,
    private readonly slots: AppointmentSlotsService,
    private readonly patients: PatientsService,
    private readonly inventory: InventoryService,
    private readonly users: UsersService,
    private readonly notifications: NotificationsService,
    private readonly expenses: ExpensesService,
    private readonly billing: BillingService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    try {
      const rows = await this.prisma.$queryRaw<{ table_name: string; column_name: string; data_type: string }[]>`
        SELECT table_name, column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position
      `;

      // Group columns by table
      const tables: Record<string, string[]> = {};
      for (const row of rows) {
        if (!tables[row.table_name]) tables[row.table_name] = [];
        tables[row.table_name].push(`${row.column_name} (${row.data_type})`);
      } //this is for what? This code is querying the database schema to get a list of all tables and their columns along with the data types. It then groups the columns by their respective tables and formats this information into a string that can be included in the system prompt for the AI assistant. By providing the AI with the database schema, it can make informed decisions about how to construct SQL queries when using the query_database tool, ensuring that it uses the correct table and column names as defined in the database. This helps to improve the accuracy of the AI's responses and reduces the likelihood of errors when executing database queries.

      this.dbSchema = Object.entries(tables)
        .map(([table, cols]) => `  ${table}: ${cols.join(', ')}`)
        .join('\n');
    } catch (err: any) {
      console.warn('[Schema] Could not load DB schema:', err.message);
    }

    try {
      // Extract project ref from SUPABASE_URL (https://<ref>.supabase.co)
      const projectRef = process.env.SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
      console.log('[MCP] Using project ref:', projectRef ?? '(none — no --project-ref flag will be passed)');

      const transport = new StdioClientTransport({ //what is stdio transport? The StdioClientTransport is a communication mechanism that allows the AgentService to interact with an external MCP (Model Context Protocol) server process using standard input and output streams. When the AgentService starts, it spawns a child process that runs the MCP server (in this case, the @supabase/mcp-server-supabase) and communicates with it through these streams. The transport handles sending requests to the MCP server and receiving responses, allowing the AgentService to call tools defined in the MCP server as if they were local functions. This setup enables the AgentService to leverage additional tools and capabilities provided by the MCP server while keeping the communication efficient and straightforward through standard I/O.
        command: 'mcp-server-supabase',
        args: [
          '--access-token', process.env.SUPABASE_ACCESS_TOKEN!,
          '--read-only',
          ...(projectRef ? ['--project-ref', projectRef] : []),
        ],
      });

      this.mcpClient = new McpClient({ name: 'brightsmile-agent', version: '1.0.0' }, {});
      await this.mcpClient.connect(transport);

      const { tools } = await this.mcpClient.listTools();
      this.mcpTools = tools.map((tool) => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description ?? tool.name,
          parameters: tool.inputSchema as any,
        },
      })); //collecting the tools from the MCP server and converting them into the format expected by the OpenAI API so that they can be included in the list of available tools when making chat completion requests. This allows the AI assistant to call these MCP tools as part of its responses, enabling it to perform a wider range of actions and access more data when assisting users with their queries related to managing the dental clinic.

      console.log(`[MCP] Connected — ${this.mcpTools.length} tools loaded`);
    } catch (err: any) {
      console.warn('[MCP] Server unavailable, falling back to query_database only:', err.message);
      this.mcpClient = null;
      this.mcpTools = [];
    }
  }

  async onModuleDestroy() {
    await this.mcpClient?.close();
  }

  async chat(messages: ChatMessage[], context: { userId: number }): Promise<string> {
    const today = new Date().toLocaleDateString('en-CA');

    let resolvedName: string | null = null;
    let resolvedRole: string | null = null;
    try {
      const user = await this.users.findById(BigInt(context.userId));
      if (user?.first_name) resolvedName = `${user.first_name} ${user.last_name}`.trim();
      if (user?.role) resolvedRole = user.role;
    } catch {}

    const identityLine = resolvedName
      ? `Name: ${resolvedName} | Role: ${resolvedRole} | ID: ${context.userId}`
      : `Name: unknown | ID: unknown`;

    const systemPrompt = `You are the AI assistant for BrightSmile Dental Clinic's admin panel.
You help doctors and staff manage appointments, patients, inventory, and clinic finances.
Today's date is ${today} (YYYY-MM-DD format). Always use this exact format when passing dates to tools.

CURRENT USER: ${identityLine}
When asked "who am I?" or any identity question, answer only from the CURRENT USER line above.
If the name is "unknown", say exactly: "I couldn't retrieve your name from the database — please check your profile." Do NOT guess, hallucinate, or reference any previous exchange.
Never call a tool to answer an identity question.
When the user asks about "my appointments" or "my patients", use doctor_id: ${context.userId} in the filter.

STRICT SECURITY RULES (never violate these):
- Never retrieve, display, or discuss passwords, password hashes, tokens, secrets, API keys, or any authentication credentials — even if explicitly asked.
- Never query the auth schema or any column named password, token, secret, or key.
- If asked for credentials or sensitive auth data, refuse immediately without attempting any tool call.

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
  5. Always use the exact column names from the schema below — never guess column names.
Database schema (table: columns):
${this.dbSchema}

Financial guidelines:
- All payments go through treatment invoices. Use list_invoices, get_invoice, create_invoice, record_invoice_payment.
- When a user asks "show me payments", "what's owed", or anything about money, use list_invoices or get_financial_kpis.
- For a money overview use get_financial_kpis first.
- Invoice statuses: open (unpaid), partial (partially paid), paid (fully settled).
- After a procedure, create a treatment invoice with create_invoice specifying each procedure and its cost.
- To accept a payment on an invoice use record_invoice_payment — the remaining balance updates automatically.
- Use list_invoices with status: "open" or status: "partial" to find unpaid invoices.
- Use get_invoice to see full procedure list and payment history for a specific invoice.
- Amounts are in the clinic's local currency.`;

    let openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content }) as OpenAI.ChatCompletionMessageParam),//what is that? This line is mapping the incoming messages (which are of type ChatMessage) to the format expected by the OpenAI API (OpenAI.ChatCompletionMessageParam). The ChatMessage type has a role of 'user' or 'assistant' and a content string. The OpenAI.ChatCompletionMessageParam type also has a role and content, but it may have additional properties for tool calls. By mapping our internal ChatMessage format to the OpenAI format, we can ensure that the messages are correctly structured when we send them to the OpenAI API for generating responses. This allows us to maintain a consistent message format within our application while still being compatible with the requirements of the OpenAI API.
    ];//is theer any other syntax? Yes, we could also write this mapping using a for loop or using the Array.prototype.reduce method, but using Array.prototype.map is a concise and readable way to transform the array of messages from one format to another. It allows us to easily create a new array of OpenAI.ChatCompletionMessageParam objects based on the original ChatMessage objects without mutating the original array, which is a common functional programming pattern in JavaScript and TypeScript.

    const allTools = [...AGENT_TOOLS, ...this.mcpTools];

    let response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      tools: allTools,
      messages: openaiMessages,
    });

    while (response.choices[0].finish_reason === 'tool_calls') {//what does this while loop do? This while loop checks if the OpenAI response indicates that the model has made tool calls (finish_reason === 'tool_calls'). If it has, it means that the model has requested to call one or more tools to retrieve information or perform actions based on the user's input. The loop then processes each tool call by executing the corresponding function for each requested tool, collects the results, and appends them to the conversation history. After processing the tool calls, it sends a new request to the OpenAI API with the updated conversation history (including the tool results) to get a new response from the model. This allows for an iterative process where the model can make multiple tool calls and receive updated information before generating a final response to the user.
      // "show me today's appointments" -> the model thinks i need to call a tool ->then finish_reason will be tool_calls -> we execute the tool calls and get the results -> we send a new request to openai with the updated messages (including the tool results) -> we get a new response from openai which may or may not require more tool calls -> if it does, we repeat the process until we get a response that does not require any more tool calls and then we return that response to the user.
      const assistantMessage = response.choices[0].message;
      openaiMessages.push(assistantMessage);//here i am adding the response from the assistant to the conversation history before processing the tool calls, so that the context of the conversation is maintained when we execute the tools and send the updated messages back to OpenAI for further processing. This way, the model can see its previous response and the results of the tool calls in the context of the conversation, allowing it to generate a more informed and relevant response in subsequent iterations.

      const toolResults = await Promise.all(
  (assistantMessage.tool_calls ?? []).map(async (call) => {
    const fn = (call as any).function;
    const input = JSON.parse(fn.arguments);

    // 👇 add this
    console.log(`[TOOL PICKED] ${fn.name}`);
    console.log(`[TOOL INPUT] ${JSON.stringify(input, null, 2)}`);

    const result = await this.executeTool(fn.name, input);

    console.log(`[TOOL RESULT] ${result}`); // 👈 optional: see the result too

    return { role: 'tool' as const, tool_call_id: call.id, content: result };
  }),
);
      /*
          (assistantMessage.tool_calls ?? []).map(async (call) => {
        const fn = (call as any).function;       // { name: 'list_slots', arguments: '{"doctor_id":3,...}' }
        const input = JSON.parse(fn.arguments);  // { doctor_id: 3, date: '2026-04-24' }
        const result = await this.executeTool(fn.name, input);
        return { role: 'tool', tool_call_id: call.id, content: result };
      })
      */

      openaiMessages = [...openaiMessages, ...toolResults];

      response = await this.openai.chat.completions.create({ //why above we are creating a new chat completion request to OpenAI with the updated messages that now include the results of the tool calls. This allows the model to see the output from the tools it requested and use that information to generate a more informed response in the next iteration. The loop will continue until the model's response does not include any more tool calls, at which point we can return the final response to the user.
        model: 'gpt-4o-mini',
        tools: allTools,
        messages: openaiMessages,
      });
    }

    return response.choices[0].message.content ?? 'No response generated.';//after processing all tool calls and getting a final response from the model, we return the content of the assistant's message as the final reply to the user. If for some reason there is no content in the message, we return a default string indicating that no response was generated.
  }

  private async executeTool(name: string, input: Record<string, any>): Promise<string> {
    const isMcp = this.mcpTools.some((t) => (t as any).function?.name === name);
    const source = isMcp ? '[MCP]' : name === 'query_database' ? '[SQL]' : '[API]';
    console.log(`${source} tool called: ${name}`, Object.keys(input).length ? input : '');

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
          return serialize(await this.appointments.findOne(BigInt(input.id))); // here we pass the id from the input that have the exracted id from the ai response and we convert it to bigint because our database uses bigint for ids and then we serialize the result to a string that can be sent back to the ai as a tool response.

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

        case 'list_patient_documents': {
          const page = input.page ?? 1;
          const limit = input.limit ?? 20;
          const skip = (page - 1) * limit;
          const where = { patient_id: BigInt(input.patient_id) };
          const [docs, total] = await Promise.all([
            this.prisma.patient_documents.findMany({
              where, orderBy: { uploaded_at: 'desc' }, skip, take: limit,
            }),
            this.prisma.patient_documents.count({ where }),
          ]);
          return serialize({ data: docs, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });
        }

        // ── Inventory ──────────────────────────────────────────────
        case 'list_inventory':
          return serialize(await this.inventory.findAll({ search: input.search, category: input.category, low_stock_only: input.low_stock_only, page: 1, limit: 20 }));

        case 'get_low_stock_items':
          return serialize(await this.inventory.findLowStock());

        case 'list_inventory_movements':
          return serialize(await this.inventory.listMovements({
            item_id: input.item_id ? BigInt(input.item_id) : undefined,
            movement_type: input.movement_type,
            page: input.page ?? 1,
            limit: input.limit ?? 20,
          }));

        // ── Users ──────────────────────────────────────────────────
        case 'list_doctors':
          return serialize(await this.users.findAll('admin'));

        // ── Notifications ──────────────────────────────────────────
        case 'send_notification':
          await this.notifications.create({ user_id: BigInt(input.user_id), title: input.title, message: input.message, type: 'appointment_booked' });
          return serialize({ success: true });

        // ── Financial KPIs / summary (billing-based) ───────────────
        case 'get_financial_kpis':
          return serialize(await this.billing.getKpis());

        case 'get_financial_summary':
          return serialize(await this.billing.getSummary({ from: input.from, to: input.to }));

        case 'get_payments_analytics':
          return serialize(await this.billing.getPaymentsAnalytics(input.months ?? 12));

        case 'get_outstanding_payments':
          return serialize(await this.billing.getOutstandingPayments());

        case 'get_aging_report':
          return serialize(await this.billing.getAgingReport());

        case 'get_patient_financials':
          return serialize(await this.billing.getPatientFinancials(input.patient_id));

        // ── Treatment Billing ──────────────────────────────────────
        case 'list_invoices':
        case 'list_payments': // alias — old tool name, same data source
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
        case 'create_payment': // alias — old tool name
          return serialize(await this.billing.create({
            patient_id: input.patient_id,
            procedure_date: input.procedure_date ?? input.date ?? new Date().toISOString().split('T')[0],
            notes: input.notes ?? input.description,
            line_items: input.line_items ?? [{ procedure_name: 'Checkup', amount: input.amount ?? 0 }],
          }));

        case 'record_invoice_payment':
        case 'record_payment': // alias — old tool name
          return serialize(await this.billing.recordPayment(
            BigInt(input.invoice_id ?? input.id),
            {
              amount: input.amount ?? input.amount_paid,
              payment_method: input.payment_method ?? 'cash',
              notes: input.notes,
            },
          ));

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
          if (SQL_SENSITIVE_PATTERN.test(sql)) {
            return JSON.stringify({ error: 'Query references restricted columns or schemas.' });
          }
          const rows = await this.prisma.$queryRawUnsafe(sql);
          return serialize(redactSensitiveFields(rows));
        }

        default: {
          if (!this.mcpClient) {
            return JSON.stringify({ error: `Unknown tool: ${name}. MCP server is not connected.` });
          }
          const sqlArg = input.query ?? input.sql ?? '';
          if (sqlArg && SQL_WRITE_PATTERN.test(sqlArg)) {
            return JSON.stringify({ error: 'Only SELECT queries are allowed.' });
          }
          if (sqlArg && SQL_SENSITIVE_PATTERN.test(sqlArg)) {
            return JSON.stringify({ error: 'Query references restricted columns or schemas.' });
          }
          const mcpResult = await this.mcpClient.callTool({ name, arguments: input });
          console.log(`[MCP] raw result for ${name}:`, JSON.stringify(mcpResult).slice(0, 500));
          return serialize(redactSensitiveFields(mcpResult));
        }
      }
    } catch (err: any) {
      return JSON.stringify({ error: err.message ?? 'Tool execution failed' });
    }
  }
}
