import 'reflect-metadata';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { PERMISSIONS_KEY } from './permissions.decorator';

/**
 * How a route is protected, as declared by its decorators. The guards read the
 * same metadata, so this is exactly what the API enforces:
 *   public      – no token needed (@Public)
 *   superadmin  – platform operator only (@Roles('superadmin'))
 *   permissions – the caller's role must hold every listed permission
 *   signed-in   – any valid token; the handler itself checks ownership
 */
export type RouteAccess =
  | { kind: 'public' }
  | { kind: 'superadmin' }
  | { kind: 'permissions'; permissions: string[] }
  | { kind: 'signed-in' };

export interface RouteInfo {
  method: string;
  /** Full path without the global prefix, e.g. `/users/:id/assignment`. */
  path: string;
  controller: string;
  handler: string;
  access: RouteAccess;
}

type Constructor = new (...args: unknown[]) => unknown;

const joinPaths = (...parts: string[]) =>
  '/' +
  parts
    .flatMap((p) => p.split('/'))
    .filter(Boolean)
    .join('/');

/** Handler metadata wins over controller metadata, like Reflector.getAllAndOverride. */
function metadataOf<T>(
  key: string,
  handler: Function,
  controller: Function,
): T | undefined {
  const own = Reflect.getMetadata(key, handler) as T | undefined;
  return own ?? (Reflect.getMetadata(key, controller) as T | undefined);
}

function accessOf(handler: Function, controller: Function): RouteAccess {
  if (metadataOf<boolean>(IS_PUBLIC_KEY, handler, controller))
    return { kind: 'public' };
  const roles = metadataOf<string[]>(ROLES_KEY, handler, controller);
  if (roles?.includes('superadmin')) return { kind: 'superadmin' };
  const permissions = metadataOf<string[]>(
    PERMISSIONS_KEY,
    handler,
    controller,
  );
  if (permissions?.length) return { kind: 'permissions', permissions };
  return { kind: 'signed-in' };
}

/** Every route a controller class declares, with how it is protected. */
export function routesOf(controller: Constructor): RouteInfo[] {
  const prefix = Reflect.getMetadata(PATH_METADATA, controller) as
    | string
    | undefined;
  if (prefix === undefined) return [];
  const prototype = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(prototype)
    .filter(
      (name) => name !== 'constructor' && typeof prototype[name] === 'function',
    )
    .flatMap((name) => {
      const handler = prototype[name] as Function;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as
        | RequestMethod
        | undefined;
      if (method === undefined) return [];
      const path =
        (Reflect.getMetadata(PATH_METADATA, handler) as string) ?? '/';
      return [
        {
          method: RequestMethod[method],
          path: joinPaths(prefix, path),
          controller: controller.name,
          handler: name,
          access: accessOf(handler, controller),
        },
      ];
    });
}

const isController = (value: unknown): value is Constructor =>
  typeof value === 'function' && Reflect.hasMetadata(PATH_METADATA, value);

function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory())
      return entry === 'generated' ? [] : controllerFiles(full);
    return entry.endsWith('.controller.ts') || entry.endsWith('.controller.js')
      ? [full]
      : [];
  });
}

/**
 * Loads every `*.controller.ts` under `srcDir` and lists its routes. Reading
 * the files instead of the module tree means a controller forgotten in a
 * module still shows up here (and fails the coverage test).
 */
export function inventoryRoutes(srcDir: string): RouteInfo[] {
  return controllerFiles(srcDir)
    .sort()
    .flatMap((file) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const exported = require(file) as Record<string, unknown>;
      return Object.values(exported).filter(isController).flatMap(routesOf);
    });
}
