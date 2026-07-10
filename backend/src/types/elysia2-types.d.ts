/*
* Elysia 2 exp (2.0.0-exp.x) is missing type declarations for
* t.Any(), t.Unknown(), and t.Enum(). These exist at runtime but the
* TypeScript type builder omits them.
* Nutshell: Remove this file when Elysia 2 stable ships.
*/

import 'elysia';

declare module 'elysia/dist/type/exports.js' {
  namespace exports_d_exports {
    function Any(this: void, options?: Record<string, unknown>): unknown;
    function Unknown(this: void, options?: Record<string, unknown>): unknown;
    function Enum<T extends Record<string, string | number>>(
      this: void,
      enumObject: T,
    ): T[keyof T];
  }
}
