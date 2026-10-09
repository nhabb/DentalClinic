import { Injectable, Logger } from '@nestjs/common';
import { AppointmentsService } from '../../../doctor/appointments/appointments.service';
import { AppointmentSlotsService } from '../../../doctor/appointment-slots/appointment-slots.service';
import { PatientsService } from '../../patients/patients.service';
import { InventoryService } from '../../../doctor/inventory/inventory.service';
import { UsersService } from '../../../shared/users/users.service';
import { ExpensesService } from '../../../doctor/expenses/expenses.service';
import { BillingService } from '../../../doctor/billing/billing.service';
import { RolesService } from '../../../shared/authorization/roles.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ConsultationsService } from '../../../doctor/specialists/consultations.service';
import { LabOrdersService } from '../../../doctor/lab/lab-orders.service';
import type { RequestUser } from '../../../shared/common/guards/jwt-auth.guard';
import { toolDenial } from '../agent-access';
import { isDatabasePermissionRefusal } from '../guarded-select';
import type { ToolArgs } from '../tool-args';
import { appointmentTools } from './appointment.tools';
import { billingTools } from './billing.tools';
import { caseTools } from './cases.tools';
import { expenseTools } from './expense.tools';
import { inventoryTools } from './inventory.tools';
import { patientTools } from './patient.tools';
import { rolesTools } from './roles.tools';
import { sqlTools } from './sql.tools';
import { teamTools } from './team.tools';
import { withCoverage } from './result-coverage';
import { ToolRefusedError, type ToolHandler } from './tool-handler';

/**
 * Runs one tool call on the user's behalf.
 *
 * The permission check here is the second layer: the model only receives the
 * tools the user may use (agent-access.ts), but it can still name one it was
 * not given. Every handler runs inside the request's tenant context, so
 * row-level security applies exactly as it does for the REST API.
 *
 * List results are annotated with `coverage` (result-coverage.ts) so the
 * model knows when it holds a page of a larger set and says so.
 */
@Injectable()
export class ToolRunner {
  private readonly logger = new Logger(ToolRunner.name);
  private readonly handlers: ReadonlyMap<string, ToolHandler>;

  constructor(
    appointments: AppointmentsService,
    slots: AppointmentSlotsService,
    patients: PatientsService,
    inventory: InventoryService,
    users: UsersService,
    expenses: ExpensesService,
    billing: BillingService,
    roles: RolesService,
    prisma: PrismaService,
    consultations: ConsultationsService,
    labOrders: LabOrdersService,
  ) {
    this.handlers = new Map(
      Object.entries({
        ...rolesTools(roles),
        ...appointmentTools(appointments, slots),
        ...patientTools(patients, prisma),
        ...inventoryTools(inventory),
        ...teamTools(users),
        ...billingTools(billing),
        ...expenseTools(expenses),
        ...caseTools(consultations, labOrders),
        ...sqlTools(prisma),
      }),
    );
  }

  /** Names of the tools that have a handler (tool-runner.spec.ts matches them to agent.tools.ts). */
  toolNames(): string[] {
    return [...this.handlers.keys()];
  }

  /** The tool's result as JSON for the model, or `{ error }` when it could not run. */
  async run(user: RequestUser, name: string, args: ToolArgs): Promise<string> {
    const who = `user ${user.id} (${user.role})`;

    const denial = toolDenial(user, name);
    if (denial) {
      this.logger.warn(`Refused tool ${name} for ${who}: ${denial}`);
      return errorResult(denial);
    }
    const handler = this.handlers.get(name);
    if (!handler) return errorResult(`Unknown tool "${name}".`);

    this.logger.log(`Tool ${name} by ${who}`);
    try {
      return serialize(withCoverage(await handler(args, { user })));
    } catch (err) {
      const message = (err as Error).message ?? 'Tool execution failed';
      if (err instanceof ToolRefusedError) {
        this.logger.warn(`Refused ${name} for ${who}: ${message}`);
      } else if (isDatabasePermissionRefusal(err)) {
        // The application-side check should have refused first: investigate.
        this.logger.error(
          `Database refused a read for ${who} that passed the application check: ${message}`,
        );
      }
      return errorResult(message);
    }
  }
}

/** JSON for the model: Prisma returns BigInt ids, which JSON.stringify rejects. */
function serialize(data: unknown): string {
  return JSON.stringify(
    data,
    (_, v: unknown) => (typeof v === 'bigint' ? Number(v) : v),
    2,
  );
}

const errorResult = (message: string): string =>
  JSON.stringify({ error: message });
