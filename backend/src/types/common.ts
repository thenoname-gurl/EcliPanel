export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];

export type JSONObject = Record<string, unknown>;
export type JSONArray = Array<unknown>;
export type JSONValue = string | number | boolean | null | JSONObject | JSONArray;

export type DeepPartial<T> = T extends object ? { [P in keyof T]?: DeepPartial<T[P]> } : T;

export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

export type OptionalFields<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I
) => void
  ? I
  : never;

export type Constructor<T = unknown> = new (...args: any[]) => T;

export type AsyncFunction<T = unknown, A extends any[] = any[]> = (...args: A) => Promise<T>;

export type AnyFunction = (...args: any[]) => any;

export type Nullable<T> = T | null;

export type Maybe<T> = T | undefined;

export type NonUndefined<T> = T extends undefined ? never : T;

export type Override<T, U> = Omit<T, keyof U> & U;
