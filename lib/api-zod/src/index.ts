// Only the zod schemas (VALUES) from the generated client are re-exported.
//
// The generated TS param types collide by name with orval's zod schemas for any
// GET endpoint that has BOTH a path param and a query param. That was a latent
// trap: the star export of ./generated/types sat here until GET
// /scenarios/{id} gained its `lang` query param and became the second such
// endpoint, at which point codegen stopped compiling on a name nobody had
// touched. Rather than add an exception per collision, the types star export is
// gone: every consumer of this package imports zod schemas (CreateAttemptBody,
// BuyOutfitBody, ...) and the react client package carries its own types.
// If a type is ever genuinely needed here, re-export it BY NAME.
export * from './generated/api';
