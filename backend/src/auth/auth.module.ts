import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';//JwtModule — handles everything related to JWT tokens creating validating, signing, etc.
import { PassportModule } from '@nestjs/passport';
//Without Passport you'd have to write all this yourself:
//// manually check JWT
// const token = request.headers.authorization.split(' ')[1];
// const decoded = jwt.verify(token, secret);
// if (!decoded) throw new UnauthorizedException();
// do this on EVERY protected route 😫

//instead we use Passport and JwtStrategy to handle this logic for us, so we can just add @UseGuards(JwtAuthGuard) to any route we want to protect and it will automatically check the JWT token for us and populate req.user with the decoded token data if it's valid, or throw an UnauthorizedException if it's not.
import { PrismaModule } from '../shared/prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';// defines HOW to validate a JWT token when a protected route is accessed

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'changeme',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],//each route needs to check for strategy,Without it in providers → Passport doesn't know how to validate tokens → every protected route breaks ❌
})//AuthModule doesn't need exports — nobody needs its services, they just import the guard file directly. ✅ so they can import @UseGuards(JwtAuthGuard) without needing to import the entire AuthModule just for the service. This keeps our module dependencies clean and focused, allowing other modules to use the authentication guard without being tightly coupled to the AuthModule itself.
export class AuthModule {}
