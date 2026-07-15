// Only the zod schemas (values) from the generated client are re-exported.
// The generated TS param types collide by name with orval's path-param zod
// schemas (e.g. ListCategoryPhrasesParams) for GET endpoints that have BOTH a
// path param and a query param, and no consumer imports the TS types from here
// — the react client package carries its own types. Keep this values-only.
export * from "./generated/api";
