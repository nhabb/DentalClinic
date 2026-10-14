import { UsersService } from './users.service';
import { DOCTOR_ROLE_KEY } from '../authorization/permissions';

/**
 * The public doctor list (booking page, admin doctor filters, the assistant's
 * list_doctors tool) offers only active accounts with the doctor role. Admins
 * and secretaries are staff but nobody books an appointment with them.
 */
describe('UsersService.findDoctors', () => {
  function build() {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new UsersService(
      { users: { findMany } } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, findMany };
  }

  it('asks only for active users with the doctor role', async () => {
    const { service, findMany } = build();
    await service.findDoctors();
    expect(findMany).toHaveBeenCalledTimes(1);
    const args = findMany.mock.calls[0][0];
    expect(args.where).toEqual({ role: DOCTOR_ROLE_KEY, is_active: true });
  });

  it('never selects credential columns', async () => {
    const { service, findMany } = build();
    await service.findDoctors();
    const select = findMany.mock.calls[0][0].select;
    expect(select.password_hash).toBeUndefined();
    expect(select.id).toBe(true);
    expect(select.first_name).toBe(true);
  });
});
