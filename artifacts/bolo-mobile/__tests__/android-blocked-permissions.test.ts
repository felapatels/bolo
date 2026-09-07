// THE FOREGROUND SERVICE PERMISSION NOBODY ASKED FOR, AND WHY IT MUST STAY OUT.
//
// Play marked "Foreground service permissions" OVERDUE on this app's App
// content page, with "To keep releasing app updates, complete one of the
// following required actions", while 1.0.15 was in review.
//
// expo-audio's own AndroidManifest.xml contributes FOREGROUND_SERVICE and
// FOREGROUND_SERVICE_MEDIA_PLAYBACK to every app that depends on it. Play sees
// them in the merged manifest and raises a declaration whose only answers are
// Media playback, Show picture in picture and Other. All three assert that the
// app does something the user can notice while they are NOT interacting with
// it. This app does no such thing, so every available answer is a false
// declaration to Google, and the honest move is to stop shipping the
// permissions rather than to pick the least wrong box.
//
// VERIFIED IN THIS REPO, NOT INHERITED. Both of expo-audio's services are
// opt-in and neither is opted into HERE, checked rather than assumed:
//
//   AudioControlsService  (mediaPlayback) starts only from
//     AudioPlayer.setActiveForLockScreen(true). Zero call sites in
//     artifacts/bolo-mobile.
//   AudioRecordingService (microphone) starts only when useForegroundService
//     is true, which AudioModule sets from the audio mode's
//     allowsBackgroundRecording. lib/audio.ts sets exactly two keys, in both
//     of its modes: allowsRecording and playsInSilentMode. Zero references to
//     allowsBackgroundRecording, so it stays at its Kotlin default of false.
//
// A sweep for staysActiveInBackground, shouldPlayInBackground,
// showNowPlayingNotification and UIBackgroundModes also comes back empty, so
// nothing else in the app wants background audio either. Chacha-ji's call is
// the one feature that sounds like it might: it does not, it is a foreground
// screen and it ends when the screen does.
//
// Google's own instruction for exactly this case, quoted from the overdue
// notice: "If your use of Foreground service permissions is not permitted
// according to Google Play policy, remove it from your app."
// blockedPermissions is how that removal is spelled in an Expo config.
//
// PORTED FROM europe/e1d04214, AND THE PORT IS NOT THE CHERRY-PICK. Europe's
// version asserts a four-permission ask ending in READ_MEDIA_IMAGES. India
// BLOCKS that permission and has since 1107932f, because Play rejected version
// code 536 over it ("Use alternative system pickers for the photos / videos").
// So Europe's test fails here, and the tempting way to make it pass, adding
// READ_MEDIA_IMAGES back to the ask, would re-ship the exact permission a Play
// rejection made us remove. That is why the two media blocks are pinned below
// rather than left as background.
//
// If a future release genuinely wants lock-screen controls or background
// recording, DELETE the matching entry here rather than working around it, and
// answer the Play declaration honestly at the same time.
import appConfig from '../app.json';

const blocked: string[] = appConfig.expo.android.blockedPermissions ?? [];
const asked: string[] = appConfig.expo.android.permissions ?? [];

describe('the Android permissions this app refuses to ship', () => {
  it('blocks both foreground service permissions expo-audio contributes', () => {
    expect(blocked).toContain('android.permission.FOREGROUND_SERVICE');
    expect(blocked).toContain(
      'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
    );
  });

  it('still blocks the two media reads a Play rejection made us drop', () => {
    // 1107932f, after Play rejected version code 536. READ_MEDIA_IMAGES was
    // declared TWICE, by hand and again by the expo-image-picker plugin, so
    // only blocking strips it from the merged manifest. These are not
    // incidental neighbours of the lines above; they are a shipped fix.
    expect(blocked).toContain('android.permission.READ_MEDIA_IMAGES');
    expect(blocked).toContain('android.permission.READ_MEDIA_VIDEO');
  });

  it('still asks for the three permissions the app really uses', () => {
    // Blocking is a narrow tool and it is easy to over-apply. The recording
    // permission in particular sits one line above the blocked list, and the
    // whole product is a microphone.
    expect(asked).toEqual([
      'android.permission.RECORD_AUDIO',
      'android.permission.MODIFY_AUDIO_SETTINGS',
      'android.permission.CAMERA',
    ]);
  });

  it('never asks for and blocks the same permission', () => {
    // The contradiction that would be invisible in the merged manifest: the
    // ask wins nothing and the block wins silently, so the feature simply
    // stops working with no error anywhere.
    for (const permission of asked) {
      expect(blocked).not.toContain(permission);
    }
  });
});
