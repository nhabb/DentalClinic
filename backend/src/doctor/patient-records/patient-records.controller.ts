import {
  UseGuards,
  Controller,
  Get,
  Post,
  Patch,
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
import { PatientRecordsService } from './patient-records.service';
import { CreatePatientRecordDto } from './dto/create-record.dto';
import { UpdatePatientRecordDto } from './dto/update-record.dto';

@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiTags('Patient Records') //for swagger documentation, groups all routes in this controller under "Patient Records" section in Swagger UI
@Controller('patient-records') //base route for all endpoints in this controller will be /patient-records
export class PatientRecordsController {
  constructor(private readonly patientRecordsService: PatientRecordsService) {} //dependency injection of the PatientRecordsService to handle the business logic for patient records, allowing us to keep the controller focused on handling HTTP requests and delegating the actual data manipulation and retrieval logic to the service layer, which is responsible for interacting with the database and implementing the necessary functionality for managing patient records.

  @Post()
  @ApiOperation({ summary: 'Doctor creates a clinical record for a patient' })
  create(@Body() dto: CreatePatientRecordDto) {
    //it is sent in the request body as JSON, used for POST/PUT requests. Here we expect a JSON object that matches the CreatePatientRecordDto structure, which includes properties like patient_id, record_type, description, and optionally file_url to create a new patient record.
    return this.patientRecordsService.create(dto);
  }
  //why dont we use dto get requests? Because GET requests are meant for retrieving data and should not have a request body according to HTTP standards. Instead, we use query parameters for GET requests to filter and paginate the results when retrieving patient records. This allows us to adhere to RESTful API design principles and ensures that our endpoints are used in a way that is consistent with standard HTTP methods and their intended purposes. By using query parameters for GET requests, we can easily handle filtering and pagination of patient records without violating HTTP conventions or causing confusion for API consumers.
  @Get() // the get are sent int eh query string, used for GET requests. Here we can accept optional query parameters such as patient_id, record_type, page, and limit to filter and paginate the list of patient records when retrieving them from the database.
  @ApiOperation({ summary: 'List patient records with filters' })
  @ApiQuery({ name: 'patient_id', required: false, type: Number })
  @ApiQuery({
    name: 'record_type',
    required: false,
    enum: [
      'general_note',
      'diagnosis',
      'treatment',
      'prescription',
      'xray',
      'lab_result',
      'follow_up',
    ],
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('patient_id') patient_id?: string,
    @Query('record_type') record_type?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.patientRecordsService.findAll({
      patient_id: patient_id ? Number(patient_id) : undefined,
      record_type,
      page,
      limit,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single patient record' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.patientRecordsService.findOne(BigInt(id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Doctor updates a patient record' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePatientRecordDto,
  ) {
    return this.patientRecordsService.update(BigInt(id), dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Doctor deletes a patient record' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.patientRecordsService.remove(BigInt(id));
  }
}
