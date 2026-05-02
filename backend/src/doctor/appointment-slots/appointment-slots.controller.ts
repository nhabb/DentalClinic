import {
  UseGuards,
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/common/guards/jwt-auth.guard';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import { AppointmentSlotsService } from './appointment-slots.service';
import { CreateSlotDto } from './dto/create-slot.dto';

@ApiBearerAuth() //Tells Swagger "this controller requires a Bearer token"
//Adds a 🔒 lock icon on Swagger UI so testers know they need to login first
//Does absolutely nothing to protect the route
@UseGuards(JwtAuthGuard) //Protects all routes in this controller with JWT authentication, ensuring that only authenticated users can access these endpoints. This is important for security, especially since these endpoints involve managing appointment slots which should only be accessible to authorized users (e.g., doctors).
@ApiTags('Appointment Slots') //Groups all routes under "Appointment Slots" in Swagger UI
@Controller('appointment-slots') //Every route here starts with /appointment-slots
export class AppointmentSlotsController {
  constructor(private readonly slotsService: AppointmentSlotsService) {} // is there any object returned? No, this is just dependency injection. We are injecting the AppointmentSlotsService into the controller so that we can use its methods to handle the business logic for managing appointment slots. The controller itself does not return any object from the constructor; it simply receives an instance of the service that it can use in its route handlers to perform operations related to appointment slots, such as creating, retrieving, and deleting slots. This allows us to keep our controller focused on handling HTTP requests and delegating the actual data manipulation and retrieval logic to the service layer, which is responsible for interacting with the database and implementing the necessary functionality for managing appointment slots.
  //from this dependency injection, we can use this.slotsService in our route handlers to call the methods defined in the AppointmentSlotsService, such as createBulk, create, findAll, findOne, and remove, to perform the necessary operations for managing appointment slots based on the incoming HTTP requests.
  @Post('bulk')
  @ApiOperation({ summary: 'Doctor creates multiple slots from a time range' })
  createBulk(
    @Body()
    dto: {
      doctor_id: number;
      slot_date: string;
      from_time: string;
      to_time: string;
      duration_minutes: number;
    },
  ) {
    // Body — hidden in the request payload, used for POST/PUT requests. Here we expect a JSON object with doctor_id, slot_date, from_time, to_time, and duration_minutes properties to create multiple appointment slots in bulk based on the provided time range and duration.
    return this.slotsService.createBulk(dto); //calling the createBulk method of the AppointmentSlotsService to handle the business logic of creating multiple appointment slots based on the provided data in the request body. This allows us to keep the controller focused on handling HTTP requests and delegating the actual slot creation logic to the service layer, which is responsible for interacting with the database and implementing the necessary functionality for managing appointment slots.
  }

  @Post()
  @ApiOperation({ summary: 'Doctor creates a single available slot' })
  create(@Body() dto: CreateSlotDto) {
    // Body — hidden in the request payload, used for POST/PUT requests. Here we expect a JSON object that matches the CreateSlotDto structure, which includes properties like slot_date, start_time, and doctor_id to create a single appointment slot.
    return this.slotsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List slots with optional filters' })
  @ApiQuery({ name: 'doctor_id', required: false, type: Number })
  @ApiQuery({
    name: 'date',
    required: false,
    type: String,
    description: 'YYYY-MM-DD',
  })
  @ApiQuery({ name: 'available_only', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number }) //all of these @ApiQuery are for swagger fdocumentation not needed for the actual functionality of the endpoint. They are used to describe the query parameters that can be accepted by this GET endpoint for listing appointment slots with optional filters such as doctor_id, date, available_only, page, and limit. This helps generate accurate API documentation in Swagger UI, allowing developers and testers to understand how to use the endpoint and what parameters they can include in their requests to filter and paginate the results effectively.
  findAll(
    //this is the http request handler for the GET endpoint extracts the query parameters and then it calls the findAll method of the slotsService
    @Query('doctor_id') doctor_id?: string,
    @Query('date') date?: string,
    @Query('available_only') available_only?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number, //matches the name not the position, so we can pass the parameters in any order and also have optional parameters with default values. This allows us to easily handle pagination and filtering of appointment slots based on the provided query parameters in the request URL, making it flexible for clients to retrieve the desired data according to their needs.
  ) {
    return this.slotsService.findAll({
      doctor_id: doctor_id ? Number(doctor_id) : undefined,
      date,
      available_only: available_only === 'true', //converting the available_only query parameter from a string to a boolean. Since query parameters are always received as strings, we check if the value is equal to the string 'true' to determine if it should be treated as a boolean true or false when passing it to the service layer for filtering appointment slots based on their availability.
      page,
      limit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single slot by ID' }) //here i used param instead of query because we are getting a specific slot by its ID, which is a common RESTful convention for retrieving a single resource. The slot ID is part of the URL path (e.g., /appointment-slots/123) rather than being passed as a query parameter (e.g., /appointment-slots?id=123). Using @Param allows us to extract the slot ID directly from the URL path and use it to retrieve the specific appointment slot from the database through the service layer.
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.slotsService.findOne(BigInt(id));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Doctor deletes an unbooked slot' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.slotsService.remove(BigInt(id));
  }
}
