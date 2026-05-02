import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
//This is the security checkpoint — the first thing that runs when a request hits a protected route. It checks for the presence of a JWT token in the Authorization header, validates it using the JwtStrategy, and if valid, allows the request to proceed and attaches the decoded user information to req.user. If the token is missing or invalid, it will automatically throw an UnauthorizedException and block access to the protected route.
@Injectable() //why did we make it injectable? Because we want to be able to inject it into our controllers and use it as a guard for our protected routes. By making it injectable, we can easily apply it to any route we want to protect by using the @UseGuards(JwtAuthGuard) decorator, without having to write any additional logic for checking the JWT token on each route. This keeps our code clean and allows us to centralize our authentication logic in one place (the JwtStrategy).
//how do we inject it? We don't need to manually inject it anywhere. By extending AuthGuard('jwt'), we create a new guard that automatically uses the 'jwt' strategy defined in our JwtStrategy class to validate incoming requests. Then, we can simply use @UseGuards(JwtAuthGuard) on any route we want to protect, and NestJS will handle the rest for us, checking the JWT token and populating req.user with the decoded token data if it's valid, or throwing an UnauthorizedException if it's not.
export class JwtAuthGuard extends AuthGuard('jwt') {} //AuthGuard('jwt') creates a guard that uses the 'jwt' strategy defined in our JwtStrategy class to validate incoming requests. By extending this AuthGuard, we can easily apply it to any route we want to protect by using the @UseGuards(JwtAuthGuard) decorator, without having to write any additional logic for checking the JWT token on each route. This keeps our code clean and allows us to centralize our authentication logic in one place (the JwtStrategy).

/*
1. Something to INTERCEPT the request     → JwtAuthGuard
2. Something to VALIDATE the token        → JwtStrategy
3. Something to CHECK the user exists     → validate() in JwtStrategy
*/
