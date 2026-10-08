/**
 * Prints every API route with how it is protected, as JSON.
 *
 *   npm run routes            # JSON on stdout
 *   npm run routes -- --table # human-readable table
 *
 * Used by scripts/smoke-permissions.js to know what to expect from each route.
 */
import { join } from 'node:path';
import { inventoryRoutes } from '../src/shared/authorization/route-inventory';

const routes = inventoryRoutes(join(__dirname, '..', 'src'));

if (process.argv.includes('--table')) {
  console.table(
    routes.map((r) => ({
      route: `${r.method} ${r.path}`,
      access:
        r.access.kind === 'permissions'
          ? r.access.permissions.join(', ')
          : r.access.kind,
      handler: `${r.controller}.${r.handler}`,
    })),
  );
} else {
  process.stdout.write(JSON.stringify(routes, null, 2));
}
