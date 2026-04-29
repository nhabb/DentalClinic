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

/** Safely serialize Prisma results to a JSON string for the OpenAI API.
 *  Prisma $queryRaw can return types that JSON.stringify cannot handle:
 *  - BigInt (IDs)         → number
 *  - Date (timestamps)    → ISO string
 *  - Decimal (amounts)    → number
 *  - Buffer (binary)      → base64 string
 */
function serialize(data: any): string {
  return JSON.stringify(data, (_, v) => {
    if (typeof v === 'bigint') return Number(v);
    if (v instanceof Date) return v.toISOString();
    // Fallback for date-like objects Prisma may return that aren't native Date instances
    if (v && typeof v === 'object' && typeof v.toISOString === 'function') return v.toISOString();
    // Prisma Decimal (used for NUMERIC/DECIMAL columns like invoice amounts)
    if (v && typeof v === 'object' && v.constructor?.name === 'Decimal') return Number(v);
    // Buffer (used for BYTEA columns like stored files)
    if (Buffer.isBuffer(v)) return v.toString('base64');
    return v;
  }, 2);
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
      const [columns, fkeys] = await Promise.all([
        this.prisma.$queryRaw<{ table_name: string; column_name: string; data_type: string }[]>`
          SELECT table_name, column_name, data_type
          FROM information_schema.columns
          WHERE table_schema = 'public'
          ORDER BY table_name, ordinal_position
        `,
        this.prisma.$queryRaw<{ table_name: string; column_name: string; foreign_table: string; foreign_column: string }[]>`
          SELECT
            kcu.table_name,
            kcu.column_name,
            ccu.table_name  AS foreign_table,
            ccu.column_name AS foreign_column
          FROM information_schema.table_constraints        AS tc
          JOIN information_schema.key_column_usage         AS kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage  AS ccu ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_schema = 'public'
        `,
      ]);

      // Group columns by table
      const tables: Record<string, string[]> = {};
      for (const row of columns) {
        if (!tables[row.table_name]) tables[row.table_name] = [];
        tables[row.table_name].push(`${row.column_name} (${row.data_type})`);
      }

      // Build FK map: "table.column → foreign_table.foreign_column"
      const fkLines: string[] = fkeys.map(
        (fk) => `  ${fk.table_name}.${fk.column_name} → ${fk.foreign_table}.${fk.foreign_column}`,
      );

      const tableSchema = Object.entries(tables)
        .map(([table, cols]) => `  ${table}: ${cols.join(', ')}`)
        .join('\n');

      const fkSchema = fkLines.length
        ? '\nForeign key relationships (use these for JOINs):\n' + fkLines.join('\n')
        : '';

      const businessContext = `
Business context (what each table means):
  users — every person in the system (patients, doctors, secretaries, admins). role column = 'patient'|'doctor'|'secretary'|'admin'.
  patient_profiles — extra profile info for patients; linked to users via user_id.
  appointments — scheduled visits; links patient_profiles (patient_id) and users (doctor_id).
  appointment_slots — available time slots a doctor has opened.
  treatment_invoices — bills issued to patients; procedure_date = the date shown to users as the bill date (what users mean when they say "invoice date"); created_at = internal system timestamp, never shown in the UI.
  invoice_line_items — individual procedures/charges on a treatment invoice.
  invoice_payments — payments recorded against a treatment invoice.
  inventory_items — clinic supplies (gloves, materials, etc.).
  inventory_movements — stock additions/removals for inventory items.
  patient_records — clinical notes and treatment records per patient.
  patient_documents — uploaded files/documents for a patient.
  notifications — in-app notifications sent to users.
  expenses — clinic operational expenses (rent, utilities, etc.).
  audit_logs — history of important actions.
  clinic_profile — single-row table with clinic name, address, contact info.`;

      this.dbSchema = tableSchema + fkSchema + businessContext;
    } catch (err: any) {
      console.warn('[Schema] Could not load DB schema:', err.message);
    }

    try {
      // Extract project ref from SUPABASE_URL (https://<ref>.supabase.co)
      const projectRef = process.env.SUPABASE_URL?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
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
      }));

      console.log(`[MCP] Connected — ${this.mcpTools.length} tools loaded:`);
      this.mcpTools.forEach((t) => console.log(`  • ${(t as any).function.name}`));

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
- GLOBAL SQL RULE — apply to every query you write without exception: any date, timestamp, or time column MUST be cast to text using ::text (e.g. date_of_birth::text, created_at::text, appointment_date::text). Never select a date/timestamp column without ::text — it will return {} and be unreadable. If you are unsure whether a column is a date type, cast it anyway.
- You have a query_database tool that runs any PostgreSQL SELECT directly against the database. Use it proactively:
  1. When a dedicated tool returns empty results and the user seems confident the data exists, do NOT ask the user to try a different keyword — immediately use query_database to investigate, then retry with the correct values.
  2. For any question not covered by dedicated tools (aggregations, joins, counts, schema discovery) go straight to query_database.
  3. Never tell the user "I cannot find X" before trying query_database first.
  4. Never use query_database for mutations (INSERT, UPDATE, DELETE, DROP).
  5. Always use the exact column names from the schema below — never guess column names.
  6. NEVER use a value from one query as a filter in another query issued in the same batch. If Query B needs an ID or value that comes from Query A, you MUST wait for Query A's result before writing Query B. When in doubt, collapse both into a single SQL query using a JOIN or subquery instead of two separate tool calls.
Database schema (table: columns):
${this.dbSchema}

CRITICAL QUERY PATTERNS:

"Last/most recent appointment" → list_appointments with order:"desc" + limit:1. NEVER use order:"asc" + limit:1 for a "last" query.

IMPORTANT — date casting rule: ALWAYS cast date/timestamp columns to text in raw SQL using ::text.
This is mandatory because date objects do not serialize to JSON correctly.
Example: appointment_date::text, created_at::text, MAX(appointment_date)::text AS last_visit

"Last completed appointment for a doctor":
  SELECT a.id, a.appointment_date::text, a.start_time::text, a.status, u.first_name, u.last_name
  FROM appointments a
  JOIN patient_profiles pp ON pp.id = a.patient_id
  JOIN users u ON u.id = pp.user_id
  WHERE a.doctor_id = <id> AND a.status = 'completed'
  ORDER BY a.appointment_date DESC, a.start_time DESC LIMIT 1

"Last visit for a specific patient" (use query_database):
  SELECT MAX(a.appointment_date)::text AS last_visit
  FROM appointments a
  JOIN patient_profiles pp ON pp.id = a.patient_id
  JOIN users u ON u.id = pp.user_id
  WHERE a.status = 'completed'
    AND (u.first_name ILIKE '%<token1>%' OR u.last_name ILIKE '%<token2>%')

"Patients who attended/completed after a date" (use query_database — list_appointments only does exact date):
  SELECT DISTINCT pp.id, u.first_name, u.last_name, u.email, u.phone,
         MAX(a.appointment_date)::text AS last_visit
  FROM appointments a
  JOIN patient_profiles pp ON pp.id = a.patient_id
  JOIN users u ON u.id = pp.user_id
  WHERE a.status = 'completed'
    AND a.appointment_date > '<YYYY-MM-DD>'
  GROUP BY pp.id, u.first_name, u.last_name, u.email, u.phone
  ORDER BY last_visit DESC
- "came" / "visited" / "attended" = status = 'completed'. Never use 'scheduled' or 'confirmed' for this.
- ">= date" means on-or-after, "> date" means strictly after — match the user's wording exactly.

"When did X become a patient" / "registration date" / "patient since":
  Use a SINGLE query — do NOT split into two steps. Search by name and return the date in one go:
  SELECT u.first_name, u.last_name, u.created_at::text AS registered_at, pp.id AS patient_id
  FROM users u
  JOIN patient_profiles pp ON pp.user_id = u.id
  WHERE u.role = 'patient'
    AND (u.first_name ILIKE '%<token1>%' OR u.last_name ILIKE '%<token1>%'
      OR u.first_name ILIKE '%<token2>%' OR u.last_name ILIKE '%<token2>%')
  - If one result: report their name and registered_at date directly.
  - If multiple results: list all of them with their registered_at dates and ask which one the user means.
  - The registration date is users.created_at — NOT patient_profiles.created_at.

PATIENT NAME SEARCH — run ALL THREE queries every time, never stop early:

Extensions installed: pg_trgm (similarity) and fuzzystrmatch (soundex, levenshtein).

MANDATORY: Always run all three queries below for every name search and MERGE the results before replying. Do NOT stop because one query returned results — run all three regardless. Collect every unique patient ID across all three queries and present the full combined list.

IMPORTANT — token rules:
- Split the user's input into at most two tokens: token1 = first word, token2 = second word (or repeat token1 if only one word given).
- Do NOT break tokens into individual characters or sub-strings.
- Copy these SQL templates exactly — do NOT add extra OR conditions, do NOT change the thresholds.

Query A — ILIKE (catches case differences and partial matches):
  SELECT DISTINCT pp.id, u.first_name, u.last_name, u.email, u.phone
  FROM users u JOIN patient_profiles pp ON pp.user_id = u.id
  WHERE u.role = 'patient'
    AND (u.first_name ILIKE '%<token1>%' OR u.last_name ILIKE '%<token1>%'
      OR u.first_name ILIKE '%<token2>%' OR u.last_name ILIKE '%<token2>%')

Query B — Trigram similarity (catches typos, swapped letters, partial spellings):
  SELECT DISTINCT pp.id, u.first_name, u.last_name, u.email, u.phone
  FROM users u JOIN patient_profiles pp ON pp.user_id = u.id
  WHERE u.role = 'patient'
    AND GREATEST(
      similarity(u.first_name, '<token1>'), similarity(u.last_name, '<token1>'),
      similarity(u.first_name, '<token2>'), similarity(u.last_name, '<token2>')
    ) > 0.3

Query C — Soundex + Levenshtein (catches transliterations and phonetic variants):
  SELECT DISTINCT pp.id, u.first_name, u.last_name, u.email, u.phone
  FROM users u JOIN patient_profiles pp ON pp.user_id = u.id
  WHERE u.role = 'patient'
    AND (
      soundex(u.first_name) = soundex('<token1>') OR soundex(u.last_name) = soundex('<token1>')
      OR soundex(u.first_name) = soundex('<token2>') OR soundex(u.last_name) = soundex('<token2>')
      OR (length('<token1>') >= 4 AND levenshtein(lower(u.first_name), lower('<token1>')) <= 2)
      OR (length('<token1>') >= 4 AND levenshtein(lower(u.last_name),  lower('<token1>')) <= 2)
      OR (length('<token2>') >= 4 AND levenshtein(lower(u.first_name), lower('<token2>')) <= 2)
      OR (length('<token2>') >= 4 AND levenshtein(lower(u.last_name),  lower('<token2>')) <= 2)
    )

After all three queries:
- Deduplicate by patient ID.
- VALIDATION STEP (mandatory): for each result, confirm that its name has a genuine phonetic or spelling link to at least one search token. If a result shares NO clear phonetic or spelling connection to ANY token, silently drop it — do NOT include it in the final answer.
- Present every result that passes validation (name + email + phone).
- If multiple patients found, list them ALL and ask which one the user means.
- Only report "not found" if all three queries return zero combined results after validation.
- NEVER use exact = for name matching.
- Arabic transliteration equivalents: Yousef/Youssef/Yusuf, Hussein/Hussain/Hossein, Mohamed/Mohammed/Muhammad, Ahmad/Ahmed, Nour/Nur, Rima/Reema.

Patient status guidelines:
- A patient's active/inactive status is stored in the users table as the is_active column (boolean, default true).
- Setting a patient inactive sets users.is_active = false. Active = true, Inactive = false.
- NEVER use profile_complete from patient_profiles to determine active/inactive status. profile_complete only means the patient has finished filling in their onboarding form — it has nothing to do with whether they are active or inactive.
- To find inactive patients: JOIN patient_profiles pp ON pp.user_id = u.id WHERE u.is_active = false AND u.role = 'patient'.
- To find active patients: same join WHERE u.is_active = true AND u.role = 'patient'.

Financial guidelines:

BILLING BUSINESS LOGIC — understand this flow before answering any billing question:

1. A procedure happens at the clinic.
2. Staff creates a bill in the system → one row in treatment_invoices is created.
   - procedure_date = the date the dental work was done (e.g. the patient's visit date).
   - created_at     = the date/time the bill was entered into the system. This is "when the bill was issued."
   - total_amount   = sum of all procedures on the bill.
   - amount_paid    = how much the patient has paid so far (starts at 0).
   - remaining_amount = total_amount − amount_paid (what the patient still owes).
   - status: open (nothing paid yet), partial (some paid), paid (fully settled — remaining = 0).
3. Each individual procedure on the bill is a row in invoice_line_items (linked by treatment_invoice_id).
   Example: "Veneers: 700", "Orthodontic: 500" → two line items on one invoice.
4. Each time the patient makes a payment, staff records it → one row added to invoice_payments (linked by invoice_id).
   After recording: amount_paid increases, remaining_amount decreases, status updates automatically.
5. The invoice is "paid" only when remaining_amount = 0.

KEY RULES from this logic:
- procedure_date is the date SHOWN TO USERS in the frontend as the invoice date. When users say "bill date", "first bill", "last bill", "issued on April 15" — they always mean procedure_date.
- created_at is internal (when the record was saved in the system). Users never see this date. Do NOT use created_at for any user-facing date question.
- "First bill" → ORDER BY procedure_date ASC LIMIT 1.
- "Last bill"  → ORDER BY procedure_date DESC LIMIT 1.
- "Outstanding" or "unpaid" → status IN ('open', 'partial').
- "How much does patient X owe?" → remaining_amount on their open/partial invoices.
- "Payment history for invoice X" → query invoice_payments WHERE invoice_id = X.
- "First payment ever" / "when did the first patient pay":
    SELECT ip.amount::text, ip.payment_date::text, ip.payment_method,
           ti.id AS invoice_id, u.first_name || ' ' || u.last_name AS patient_name
    FROM invoice_payments ip
    JOIN treatment_invoices ti ON ti.id = ip.invoice_id
    JOIN patient_profiles pp ON pp.id = ti.patient_id
    JOIN users u ON u.id = pp.user_id
    ORDER BY ip.payment_date ASC LIMIT 1
- "How much did patient X pay" / "payment details for patient X":
    SELECT ip.id, ip.amount::text, ip.payment_date::text, ip.payment_method, ti.id AS invoice_id
    FROM invoice_payments ip
    JOIN treatment_invoices ti ON ti.id = ip.invoice_id
    JOIN patient_profiles pp ON pp.id = ti.patient_id
    JOIN users u ON u.id = pp.user_id
    WHERE u.first_name ILIKE '%<name>%' OR u.last_name ILIKE '%<name>%'
    ORDER BY ip.payment_date ASC
- CONTEXT RULE: if the user asks a follow-up like "how much?" or "which invoice?" after you already identified a patient and date, do NOT re-run a name search — use the patient and date from your previous answer to query invoice_payments directly. Never say a payment doesn't exist without first querying invoice_payments.
- GLOBAL SQL RULE for monetary columns: always cast NUMERIC/DECIMAL to text using ::text (e.g. total_amount::text).

Tool usage:
- list_invoices, get_invoice, create_invoice, record_invoice_payment for standard operations.
- get_financial_kpis for a revenue/collection overview.
- For first/last invoice or cross-status sorting, use query_database:
    SELECT ti.id, ti.procedure_date::text AS bill_date, ti.total_amount::text, ti.status,
           u.first_name || ' ' || u.last_name AS patient_name
    FROM treatment_invoices ti
    JOIN patient_profiles pp ON pp.id = ti.patient_id
    JOIN users u ON u.id = pp.user_id
    ORDER BY ti.created_at ASC LIMIT 1;
    -- Change ASC to DESC for the last invoice.`;

    let openaiMessages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content }) as OpenAI.ChatCompletionMessageParam),//what is that? This line is mapping the incoming messages (which are of type ChatMessage) to the format expected by the OpenAI API (OpenAI.ChatCompletionMessageParam). The ChatMessage type has a role of 'user' or 'assistant' and a content string. The OpenAI.ChatCompletionMessageParam type also has a role and content, but it may have additional properties for tool calls. By mapping our internal ChatMessage format to the OpenAI format, we can ensure that the messages are correctly structured when we send them to the OpenAI API for generating responses. This allows us to maintain a consistent message format within our application while still being compatible with the requirements of the OpenAI API.
    ];//is theer any other syntax? Yes, we could also write this mapping using a for loop or using the Array.prototype.reduce method, but using Array.prototype.map is a concise and readable way to transform the array of messages from one format to another. It allows us to easily create a new array of OpenAI.ChatCompletionMessageParam objects based on the original ChatMessage objects without mutating the original array, which is a common functional programming pattern in JavaScript and TypeScript.

    const allTools = [...AGENT_TOOLS, ...this.mcpTools];

    const agentStart = Date.now();
    let totalToolCalls = 0;

    let response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      tools: allTools,
      messages: openaiMessages,
    });

    while (response.choices[0].finish_reason === 'tool_calls') {
      const assistantMessage = response.choices[0].message;
      openaiMessages.push(assistantMessage);

      const toolResults = await Promise.all(
        (assistantMessage.tool_calls ?? []).map(async (call) => {
          const fn = (call as any).function;
          const input = JSON.parse(fn.arguments);

          const toolType = this.mcpTools.some((t) => (t as any).function?.name === fn.name)
            ? 'MCP'
            : fn.name === 'query_database' ? 'SQL' : 'API';

          totalToolCalls++;
          const toolStart = Date.now();

          console.log(`\n[TOOL CALL #${totalToolCalls}][${toolType}] ${fn.name}`);
          console.log(`[TOOL INPUT]`, JSON.stringify(input, null, 2));

          const result = await this.executeTool(fn.name, input);
          const toolMs = Date.now() - toolStart;

          console.log(`[TOOL RESULT] (${toolMs}ms)`, result.slice(0, 500));

          return { role: 'tool' as const, tool_call_id: call.id, content: result };
        }),
      );

      openaiMessages = [...openaiMessages, ...toolResults];

      response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        tools: allTools,
        messages: openaiMessages,
      });
    }

    const totalMs = Date.now() - agentStart;
    console.log(`\n[AGENT DONE] tools called: ${totalToolCalls} | total time: ${totalMs}ms`);

    return response.choices[0].message.content ?? 'No response generated.';
  }

  async *chatStream(messages: ChatMessage[], context: { userId: number }): AsyncGenerator<string> {
    const fullReply = await this.chat(messages, context);
    const words = fullReply.split(' ');
    for (const word of words) {
      yield word + ' ';
      await Promise.resolve();
    }
  }

  private async executeTool(name: string, input: Record<string, any>): Promise<string> {
    const isMcp = this.mcpTools.some((t) => (t as any).function?.name === name);
    const source = isMcp ? '[MCP]' : name === 'query_database' ? '[SQL]' : '[API]';
    console.log(`${source} routing → ${name}`);

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
            order: input.order ?? 'asc',
          }));

        case 'get_appointment':
          return serialize(await this.appointments.findOne(BigInt(input.id))); // here we pass the id from the input that have the exracted id from the ai response and we convert it to bigint because our database uses bigint for ids and then we serialize the result to a string that can be sent back to the ai as a tool response.


        // ── Slots ──────────────────────────────────────────────────
        case 'list_slots':
          return serialize(await this.slots.findAll({ doctor_id: input.doctor_id, date: input.date, available_only: input.available_only, limit: 50 }));

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


        // ── Expenses ───────────────────────────────────────────────
        case 'list_expenses':
          return serialize(await this.expenses.findAll({
            category: input.category,
            from: input.from,
            to: input.to,
            page: input.page ?? 1,
            limit: input.limit ?? 20,
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
          const normalized = (rows as any[]).map((row) =>
            Object.fromEntries(
              Object.entries(row as Record<string, any>).map(([k, v]) => {
                if (v instanceof Date) return [k, v.toISOString()];
                if (v && typeof v === 'object' && typeof (v as any).toISOString === 'function') return [k, (v as any).toISOString()];
                if (typeof v === 'bigint') return [k, Number(v)];
                if (v && typeof v === 'object' && v.constructor?.name === 'Decimal') return [k, Number(v)];
                if (v && typeof v === 'object' && typeof (v as any).toNumber === 'function') return [k, (v as any).toNumber()];
                return [k, v];
              }),
            ),
          );
          return serialize(redactSensitiveFields(normalized));
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
          return serialize(redactSensitiveFields(mcpResult));
        }
      }
    } catch (err: any) {
      return JSON.stringify({ error: err.message ?? 'Tool execution failed' });
    }
  }
}

