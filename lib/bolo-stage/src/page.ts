/**
 * The page the phone shows in its WebView, and the web can iframe.
 *
 * Commands arrive as JSON strings from react-native-webview's postMessage
 * (dispatched on `window` on iOS and on `document` on Android), or as
 * `{ boloStage: command }` from a parent window. Events go back the same way.
 */

import type { StageCommand, StageConfig, StageEvent } from '@workspace/bolo-character';
import { BoloStage } from './stage';

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage(message: string): void };
    boloStage?: BoloStage;
    boloEvents?: StageEvent[];
  }
}

const canvas = document.getElementById('stage') as HTMLCanvasElement;

function emit(event: StageEvent) {
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(event));
  else if (window.parent !== window) window.parent.postMessage({ boloStage: event }, '*');
  // Kept for anyone inspecting the page directly (and the headless checks).
  window.boloEvents = [...(window.boloEvents ?? []), event].slice(-100);
  if (event.type === 'ready') document.title = 'READY';
  if (event.type === 'error') document.title = 'ERROR';
}

const stage = new BoloStage(canvas, emit);
window.boloStage = stage;

function receive(raw: unknown) {
  let data = raw;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return;
    }
  }
  if (data && typeof data === 'object' && 'boloStage' in data) data = (data as { boloStage: unknown }).boloStage;
  if (data && typeof data === 'object' && 'type' in data) stage.command(data as StageCommand);
}

window.addEventListener('message', (event) => receive(event.data));
document.addEventListener('message' as keyof DocumentEventMap, (event) => receive((event as MessageEvent).data));
window.addEventListener('error', (event) => emit({ type: 'error', message: String(event.message) }));

emit({ type: 'booted' });

// A config in the URL fragment boots the page with no host at all.
if (location.hash.length > 1) {
  try {
    void stage.load(JSON.parse(decodeURIComponent(location.hash.slice(1))) as StageConfig);
  } catch (error) {
    emit({ type: 'error', message: `bad config in URL: ${String(error)}` });
  }
}
