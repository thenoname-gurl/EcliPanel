declare module "fengari" {
  const lua: any
  const lauxlib: any
  const lualib: any
  const to_luastring: (s: string) => Uint8Array
  const to_jsstring: (s: Uint8Array) => string
  export { lua, lauxlib, lualib, to_luastring, to_jsstring }
}