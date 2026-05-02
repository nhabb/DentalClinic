import 'dotenv/config';

// Allow JSON serialization of BigInt values
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './shared/common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule); //what nest factory does is it creates an instance of the NestJS application based on the root module (AppModule) that we defined. It sets up the entire application context, including all the modules, controllers, services, and other components that we have defined in our application. This is the entry point of our application where we can configure global settings, middleware, and start listening for incoming HTTP requests.

  app.setGlobalPrefix('api'); //what is api and where will it be used? This sets a global prefix for all routes in the application, meaning that every route defined in our controllers will be prefixed with /api. For example, if we have a route defined as @Get('users') in one of our controllers, it will be accessible at /api/users instead of just /users. This is useful for versioning our API or grouping all our endpoints under a common path to avoid conflicts with other routes that might exist in the future. It also helps to clearly indicate that these routes are part of our API when they are accessed by clients.
  //this is for the backend only, the frontend will be accessable with http://localhost:3000 and the backend with http://localhost:5000/api

  app.useGlobalPipes(
    //what is a global pipe? A global pipe is a way to apply a transformation or validation logic to all incoming requests in the application. By using app.useGlobalPipes(), we can set up a pipe that will run for every request that hits our controllers, allowing us to automatically validate and transform the incoming data according to the rules defined in the pipe. In this case, we are using the built-in ValidationPipe from NestJS, which provides powerful validation capabilities based on class-validator decorators defined in our DTOs (Data Transfer Objects). This means that any request that contains data matching our DTOs will be automatically validated against the rules we have set, and if the validation fails, an appropriate error response will be sent back to the client without needing to write manual validation logic in each controller method.
    new ValidationPipe({
      //for dto validation, it will automatically validate the incoming request data against the rules defined in our DTO classes using class-validator decorators. If the validation fails, it will return a 400 Bad Request response with details about the validation errors. The options we have set here include:
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter()); //what is a global filter? A global filter is a way to handle exceptions and errors that occur during the processing of incoming requests in a centralized manner. By using app.useGlobalFilters(), we can set up an exception filter that will catch any unhandled exceptions thrown in our controllers or services and provide a consistent response format for errors across the entire application. In this case, we are using a custom GlobalExceptionFilter that we have defined, which likely extends the built-in ExceptionFilter from NestJS. This allows us to catch specific types of exceptions (e.g., HTTP exceptions) and return custom error responses with appropriate status codes and messages, improving the overall error handling and user experience of our API.
  //what is the defference between a filter and a pipe? A pipe is used for transforming and validating incoming request data before it reaches the controller, while a filter is used for handling exceptions and errors that occur during the processing of requests in the controller or service layer. Pipes are focused on data manipulation and validation, while filters are focused on error handling and providing consistent error responses to clients.

  app.enableCors(); //what is CORS and why do we need it? CORS (Cross-Origin Resource Sharing) is a security feature implemented by web browsers that restricts web pages from making requests to a different domain than the one that served the web page. By enabling CORS in our NestJS application, we allow our frontend application (which may be served from a different domain or port) to make HTTP requests to our backend API without being blocked by the browser's same-origin policy. This is essential for allowing our frontend and backend to communicate with each other, especially during development when they are often served from different ports (e.g., frontend on http://localhost:3000 and backend on http://localhost:5000). Enabling CORS ensures that our frontend can successfully interact with our backend API without running into cross-origin issues.
  //how it will know which port can communicate with which? By default, enabling CORS with app.enableCors() allows requests from any origin. However, in a production environment, you may want to restrict this to specific origins (e.g., your frontend domain) for security reasons. You can do this by passing an options object to enableCors(), such as app.enableCors({ origin: 'http://your-frontend-domain.com' }), which will only allow requests from that specific origin. During development, you can keep it open to allow requests from localhost or any other origin as needed.
  //can any port communicate with 5000? Yes, if you enable CORS without specifying any restrictions, any origin (including any port) can communicate with your backend API on port 5000. This is useful during development when you may have multiple frontend applications running on different ports that need to access the same backend API. However, in a production environment, it's recommended to restrict CORS to only allow trusted origins to enhance security.

  const config = new DocumentBuilder()
    .setTitle('Dental Clinic API')
    .setDescription('Backend API for the Dental Clinic management system')
    .setVersion('1.0')
    .addBearerAuth() //what does addBearerAuth do? It adds a security scheme to our Swagger documentation that indicates that the API uses Bearer token authentication (specifically JWT in our case). This allows us to include an Authorization header with a Bearer token when making requests to protected endpoints through the Swagger UI. When we use @ApiBearerAuth() on our controllers, it tells Swagger that those endpoints require this type of authentication, and it will prompt users to enter a valid JWT token in the Swagger UI before they can test those endpoints. This helps ensure that only authenticated users can access the protected routes when testing through Swagger.
    //what happens without the addBearerAuth? Without addBearerAuth(), our Swagger documentation would not include the necessary information about the authentication mechanism used by our API. This means that when we try to test protected endpoints through the Swagger UI, we would not have the option to provide a JWT token in the Authorization header, and all requests to those endpoints would fail with an unauthorized error. By adding addBearerAuth(), we ensure that our API documentation accurately reflects the security requirements of our endpoints and allows testers to authenticate properly when using the Swagger UI.
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 5000);
}
bootstrap();
