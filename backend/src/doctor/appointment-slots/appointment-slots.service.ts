import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreateSlotDto } from './dto/create-slot.dto';

@Injectable() //this means that the class can be injected as a dependency into other classes, allowing for better modularity and separation of concerns. In this case, the AppointmentSlotsService can be injected into controllers or other services that need to use its functionality related to managing appointment slots.
export class AppointmentSlotsService {
  constructor(private readonly prisma: PrismaService) {} //this is a constructor that takes an instance of PrismaService as a parameter and assigns it to a private readonly property called prisma. This allows the AppointmentSlotsService to use the PrismaService for database operations related to appointment slots, such as creating, retrieving, updating, and deleting appointment slots in the database.

  //The buildEndTime method takes a start time in the format of HH:MM, splits it into hours and minutes, adds one hour to the time, and returns the end time in the same HH:MM format. This is used to calculate the end time of an appointment slot based on its start time.
  private buildEndTime(startTime: string): string {
    const [h, m] = startTime.split(':').map(Number);
    const end = new Date(0, 0, 0, h + 1, m);
    return `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
  }
  //splits the input time string into hours and minutes, creates a new Date object initialized to the epoch (January 1, 1970), sets the hours and minutes of the Date object using UTC methods to avoid timezone issues, and returns the resulting Date object. This method is used to convert a time string in HH:MM format into a Date object that can be stored in the database for appointment slots.
  //the resultant for example for input "09:30" would be a Date object representing January 1, 1970, 09:30:00 UTC. due to setUTCHours
  private toTimeDate(timeStr: string): Date {
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date(0);
    d.setUTCHours(h, m, 0, 0);
    return d;
  }
  //what is async? it allows the function to perform asynchronous operations, such as database queries, without blocking the execution of other code. When an async function is called, it returns a Promise that resolves to the value returned by the function. Inside the async function, you can use the await keyword to wait for asynchronous operations to complete before proceeding with the next line of code. This makes it easier to write and read asynchronous code in a more synchronous-like manner.

  async createBulk(dto: {
    doctor_id: number;
    slot_date: string;
    from_time: string;
    to_time: string;
    duration_minutes: number;
  }) {
    const doctor = await this.prisma.users.findFirst({
      //waiting for the result of a database query that checks if a doctor with the specified doctor_id exists in the users table and has a role of either 'admin' or 'doctor'. If no such doctor is found, it throws a NotFoundException with the message 'Doctor not found'. This is a validation step to ensure that the doctor for whom the appointment slots are being created actually exists in the system before proceeding with creating the slots.
      where: { id: BigInt(dto.doctor_id), role: { in: ['admin', 'doctor'] } },
    });
    if (!doctor) throw new NotFoundException('Doctor not found');

    const [fromH, fromM] = dto.from_time.split(':').map(Number); //what is .map(Number)? it takes an array of strings (in this case, the result of splitting the from_time string by the colon) and applies the Number function to each element of the array, converting them from strings to numbers. So, if from_time is "09:30", after splitting and mapping, fromH would be 9 and fromM would be 30 as numbers.
    const [toH, toM] = dto.to_time.split(':').map(Number);
    const fromMinutes = fromH * 60 + fromM;
    const toMinutes = toH * 60 + toM;
    //this will result for example
    //fromMinutes = 9 * 60 + 30 = 570 9:30 in minutes
    //toMinutes = 17 * 60 + 0 = 1020  17:00 in minutes
    if (fromMinutes >= toMinutes)
      throw new BadRequestException('from_time must be before to_time');

    const slotDate = new Date(dto.slot_date); //the slot_date for example "2026-04-15" will be converted to a Date object representing April 15, 2026. This Date object can then be used to store the date of the appointment slots in the database and perform date-related operations if needed.
    const created: any[] = []; //FOR multiple created slots, we will store them in this array to return at the end of the function. This allows us to keep track of all the appointment slots that were successfully created during the bulk creation process and return them as part of the response, along with counts of how many were created and how many were skipped due to conflicts with existing slots.
    const skipped: Date[] = []; //This array will store the start times of any appointment slots that were skipped during the bulk creation process because they conflicted with existing slots for the same doctor, date, and time. By keeping track of these skipped slots, we can provide feedback to the user about which specific time slots were not created due to conflicts, allowing them to make informed decisions about scheduling or adjusting their appointment slots accordingly. and notify them about the conflicts that occurred during the bulk creation process.

    for (
      let min = fromMinutes;
      min + dto.duration_minutes <= toMinutes;
      min += dto.duration_minutes
    ) {
      const startH = Math.floor(min / 60);
      const startM = min % 60;
      const endMin = min + dto.duration_minutes;
      const endH = Math.floor(endMin / 60);
      const endM = endMin % 60;

      const startTime = this.toTimeDate(
        `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`,
      );
      const endTime = this.toTimeDate(
        `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`,
      );

      const existing = await this.prisma.appointment_slots.findFirst({
        where: {
          doctor_id: BigInt(dto.doctor_id),
          slot_date: slotDate,
          start_time: startTime,
        },
      });

      if (existing) {
        skipped.push(startTime);
        continue;
      }

      const slot = await this.prisma.appointment_slots.create({
        data: {
          doctor_id: BigInt(dto.doctor_id),
          slot_date: slotDate,
          start_time: startTime,
          end_time: endTime,
          is_booked: false,
        },
      });
      created.push(slot);
    }

    return { created: created.length, skipped: skipped.length, slots: created };
  }

  async create(dto: CreateSlotDto) {
    const doctor = await this.prisma.users.findFirst({
      where: { id: BigInt(dto.doctor_id), role: { in: ['admin', 'doctor'] } },
    });
    if (!doctor) throw new NotFoundException('Doctor not found');

    const slotDate = new Date(dto.slot_date);
    const startTime = this.toTimeDate(dto.start_time);
    const endTime = this.toTimeDate(dto.end_time);

    if (startTime >= endTime) {
      throw new BadRequestException('end_time must be after start_time');
    }

    // Prevent duplicate slot for same doctor/date/time
    const existing = await this.prisma.appointment_slots.findFirst({
      where: {
        doctor_id: BigInt(dto.doctor_id),
        slot_date: slotDate,
        start_time: startTime,
      },
    });
    if (existing) {
      throw new BadRequestException(
        'A slot already exists for this doctor at this date and time',
      );
    }

    return this.prisma.appointment_slots.create({
      data: {
        doctor_id: BigInt(dto.doctor_id),
        slot_date: slotDate,
        start_time: startTime,
        end_time: endTime,
        is_booked: false,
      }, //Why include the user?
      // So the frontend knows which doctor this slot belongs to without making a second API call. this is useful for displaying the doctor's name or other information alongside the appointment slot in the UI, improving the user experience by reducing the number of API calls needed to fetch related data.
      include: {
        users: {
          select: { id: true, first_name: true, last_name: true },
        },
      },
    });
  }

  async findAll(filters: {
    //here arguments are passed as an object and can be passed in any order, and we can also have optional parameters with default values (like page and limit). This is a common pattern for functions that accept multiple parameters, especially when some of them are optional or when there are many parameters, as it improves readability and flexibility when calling the function.
    doctor_id?: number;
    date?: string;
    available_only?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { doctor_id, date, available_only, page = 1, limit = 20 } = filters;
    const skip = (page - 1) * limit; //this calculates the number of records to skip based on the current page and the limit of records per page. For example, if page is 1, skip will be 0 (no records skipped), if page is 2, skip will be 20 (the first 20 records are skipped), if page is 3, skip will be 40 (the first 40 records are skipped), and so on. This is used for pagination when retrieving appointment slots from the database, allowing us to fetch a specific subset of records based on the requested page and limit.

    const where: any = {}; //start with an empty where object and conditionally add filters based on the presence of doctor_id, date, and available_only parameters. This allows us to build a dynamic query for retrieving appointment slots from the database based on the provided filters, ensuring that we only fetch the relevant records that match the specified criteria.
    if (doctor_id) where.doctor_id = BigInt(doctor_id); //if doctor_id is provided in the filters, we add a condition to the where object to filter appointment slots by the specified doctor_id. This allows us to retrieve only the appointment slots that belong to the specified doctor when fetching data from the database.
    if (date) {
      //if date is provided in the filters, we add a condition to the where object to filter appointment slots by the specified date. We use a range query to find slots that fall within the entire day of the specified date, from 00:00:00 to 23:59:59. This allows us to retrieve all appointment slots that are scheduled for the specified date when fetching data from the database.
      where.slot_date = {
        gte: new Date(`${date}T00:00:00.000Z`),
        lte: new Date(`${date}T23:59:59.999Z`),
      };
    }
    if (available_only) where.is_booked = false;

    const [data, total] = await Promise.all([
      //what is promise.all? it allows us to execute multiple asynchronous operations (in this case, fetching appointment slots and counting the total number of matching slots) in parallel and wait for all of them to complete before proceeding. This can improve performance by reducing the overall time taken to fetch data from the database, especially when we need both the data and the total count for pagination purposes. By using Promise.all, we can efficiently retrieve the necessary information in a single step without having to wait for one operation to finish before starting the other.
      this.prisma.appointment_slots.findMany({
        where,
        include: {
          users: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
        skip,
        take: limit,
        orderBy: [{ slot_date: 'asc' }, { start_time: 'asc' }],
      }),
      this.prisma.appointment_slots.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) }, //the meta object in the returned response includes pagination information such as the total number of matching appointment slots (total), the current page number (page), the number of records per page (limit), and the total number of pages (totalPages) calculated based on the total count and the limit. This metadata is useful for the frontend to implement pagination controls and display relevant information about the dataset being retrieved.
    };
  }

  async findOne(id: bigint) {
    const slot = await this.prisma.appointment_slots.findUnique({
      where: { id },
      include: {
        users: { select: { id: true, first_name: true, last_name: true } },
      },
    });
    if (!slot) throw new NotFoundException('Appointment slot not found');
    return slot;
  }

  async remove(id: bigint) {
    const slot = await this.findOne(id);
    if (slot.is_booked) {
      throw new BadRequestException(
        'Cannot delete a slot that is already booked',
      );
    }
    await this.prisma.appointment_slots.delete({ where: { id } });
    return { message: 'Slot deleted successfully' };
  }
}
