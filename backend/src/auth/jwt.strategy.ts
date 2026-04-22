import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../shared/prisma/prisma.service';

@Injectable()//by default PassportStrategy(Strategy) is jwt strategy, so we don't need to specify the name explicitly. When we extend PassportStrategy(Strategy), it automatically registers this strategy under the name 'jwt', which is why we can use AuthGuard('jwt') in our JwtAuthGuard without needing to specify the strategy name again. This convention allows us to keep our code clean and straightforward when implementing JWT authentication in our NestJS application.
export class JwtStrategy extends PassportStrategy(Strategy) {//we are obliged to implement a strategy to tell Passport how to validate the JWT token when a protected route is accessed. This JwtStrategy class extends the PassportStrategy class from the passport-jwt package, which provides a base implementation for JWT authentication strategies. By extending this class, we can define our own logic for validating JWT tokens and retrieving user information from the database based on the token's payload.
  constructor(private readonly prisma: PrismaService) {//why is took prisma as a dependency? Because we need to look up the user in the database based on the user ID (sub) from the JWT token payload to validate that the user exists and is active. By injecting the PrismaService, we can easily access our database and perform this lookup in the validate() method of our JwtStrategy.
    super({//super() calls the constructor of the parent class (PassportStrategy) and passes it the configuration object for the JWT strategy. This configuration includes:
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),//so we are using the ExtractJwt helper function to specify that the JWT token should be extracted from the Authorization header as a Bearer token. This means that when a request is made to a protected route, the strategy will look for the JWT token in the Authorization header and extract it for validation.
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'changeme',//and the secretOrKey property is set to the value of the JWT_SECRET environment variable, or 'changeme' if the environment variable is not set. This secret key is used to verify the signature of the JWT token and ensure that it has not been tampered with. It's important to use a strong and secure secret key in production environments to protect against unauthorized access.
    });
  }

  async validate(payload: { sub: string; email: string; role: string }) {// it is returned in the request object as req.user for any protected route that uses the JwtAuthGuard. The payload parameter contains the decoded JWT token data, which includes the user ID (sub), email, and role. In this validate method, we use the user ID from the token payload to look up the corresponding user in the database using the PrismaService. If the user is found and is active, we return the user object, which will be attached to req.user for use in protected routes. If the user is not found or is not active, we throw an UnauthorizedException to indicate that authentication has failed.
    const user = await this.prisma.users.findUnique({//here we are using the this.prisma which we injected in the constructor to look up the user in the database based on the user ID (sub) from the JWT token payload. We use the findUnique method of Prisma to find a single user that matches the specified criteria, which in this case is the user ID. We also specify a select object to only retrieve certain fields from the user record, such as id, email, first_name, last_name, phone, role, and is_active. This allows us to efficiently validate the user's existence and active status without retrieving unnecessary data from the database.
      where: { id: parseInt(payload.sub) },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        phone: true,
        role: true,
        is_active: true,
      },
    });

    if (!user || !user.is_active) {
      throw new UnauthorizedException();
    }

    return user;
  } //here we validate the JWT token by looking up the user in the database using the user ID (sub) from the token payload. If the user is not found or is not active, we throw an UnauthorizedException to indicate that the authentication has failed. If the user is valid, we return the user object, which will be attached to the request object (req.user) for use in protected routes.
}
