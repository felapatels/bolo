// bolo-india.app/join/<CODE> opening IN THE APP.
//
// WHY THIS FILE EXISTS SEPARATELY FROM index.tsx. expo-router matches on the
// path, and `join/index.tsx` answers only the bare `/join`. A shared referral
// link carries the code as a path SEGMENT, matching the web's /join/:code, so
// without a dynamic route the universal link would resolve to nothing and iOS
// would hand the URL back to Safari. The whole point of the associated domain
// is that it does not.
//
// It renders the same screen rather than a copy: useLocalSearchParams returns
// route params and query params alike, so `/join/ABC12` and `/join?code=ABC12`
// both arrive as { code: "ABC12" } and the screen cannot tell them apart. Two
// entry points, one implementation, no chance of them drifting.
export { default } from "./index";
