import { Module } from '@nestjs/common'; //making this class a NestJS module, which is a way to organize related components, services, and controllers together in a cohesive block of functionality.
import { AppointmentSlotsService } from './appointment-slots.service'; //the chef of this module, responsible for the business logic related to appointment slots. It will handle tasks such as creating, retrieving, updating, and deleting appointment slots.
import { AppointmentSlotsController } from './appointment-slots.controller'; //the waiter of this module, responsible for handling incoming HTTP requests related to appointment slots and returning appropriate responses. It will define the routes and endpoints for managing appointment slots.
import { PrismaModule } from '../../shared/prisma/prisma.module';

@Module({
  imports: [PrismaModule], //what it NEEDS from outside (PrismaModule), which provides database access functionality that the AppointmentSlotsService will likely use to interact with the database for managing appointment slots.
  controllers: [AppointmentSlotsController], //handles HTTP requests related to appointment slots, defining the routes and endpoints for managing appointment slots.
  providers: [AppointmentSlotsService], // business logic (private by default) related to appointment slots, such as creating, retrieving, updating, and deleting appointment slots. It will likely use the PrismaModule to interact with the database for managing appointment slots.
  exports: [AppointmentSlotsService], //what it SHARES with other modules (AppointmentSlotsService), allowing other modules to use the functionality provided by the AppointmentSlotsService, such as creating, retrieving, updating, and deleting appointment slots. This is useful if other modules need to interact with appointment slots or use the business logic defined in the AppointmentSlotsService.
})
export class AppointmentSlotsModule {}
