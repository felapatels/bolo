import { absoluteCallUrl } from '@/lib/chachaCallApi';

jest.mock('@workspace/api-client-react', () => ({
  getConfiguredBaseUrl: () => 'https://bolo-india.app',
  getConfiguredAuthToken: async () => 'tok',
}));

// THE API IS MOUNTED AT /api AND THE BASE URL IS ONLY THE DOMAIN. app.ts does
// app.use("/api", router), and the generated client carries the prefix in each
// operation path rather than in the base, so this client must too.
//
// This shipped WITHOUT the prefix and nothing caught it, because nothing on a
// Mac ever points at a real server: Metro runs here without EXPO_PUBLIC_DOMAIN,
// so setBaseUrl is never called and every request died at "base URL is not
// configured" long before the path mattered. Against a real server it would
// have missed the API, hit the web catch-all, returned 200 with a page of HTML
// and died in res.json() as a parse error.
describe('chacha call api paths', () => {
  it('puts the audio URL under /api, not at the domain root', () => {
    expect(absoluteCallUrl('/openai/chat/audio/abc123')).toBe(
      'https://bolo-india.app/api/openai/chat/audio/abc123',
    );
  });

  it('never builds a URL that misses the api mount', () => {
    const url = absoluteCallUrl('/openai/chacha-call/xyz/turn/0');
    expect(url.startsWith('https://bolo-india.app/api/')).toBe(true);
    expect(url).not.toBe('https://bolo-india.app/openai/chacha-call/xyz/turn/0');
  });
});
