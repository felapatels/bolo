import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Mascot } from "@/components/mascot";
import { CANONICAL_POSE_FILES, MASCOT_BASE } from "@/lib/mascot-outfits";

// ---------------------------------------------------------------------------
// The mascot wears what the learner equipped.
//
// Every surface renders <Mascot pose=...> and nothing else, so the outfit has
// to reach the art through the component itself: the equipped value comes from
// context (null outside the provider — signed-out chrome must never look
// broken), and the optional `outfit` prop is the shop's preview override.
// ---------------------------------------------------------------------------

vi.mock("@workspace/api-client-react", () => ({
  useGetTokens: () => ({ data: undefined }),
  getGetTokensQueryKey: () => ["/api/tokens"],
}));

function srcOf(): string {
  // A fresh mount has exactly one image; the crossfade only doubles up while
  // a look is changing. Queried by tag, not by role: Bolo is decorative art
  // with an empty alt, so he is deliberately not an `img` role.
  const imgs = document.body.querySelectorAll("img");
  expect(imgs).toHaveLength(1);
  return imgs[0]?.getAttribute("src") ?? "";
}

describe("mascot outfit plumbing", () => {
  test("outside the provider he is canonical, not blank", () => {
    render(<Mascot pose="wave" />);
    expect(srcOf()).toBe(MASCOT_BASE + CANONICAL_POSE_FILES.wave);
  });

  test("the preview override dresses him", () => {
    render(<Mascot pose="thumbsup" outfit="navratri" />);
    expect(srcOf()).toBe(MASCOT_BASE + "outfits/navratri/mascot-thumbsup.png");
  });

  test("an explicit null forces canonical Bolo", () => {
    // The shop's back-out: show me my bird as he is, whatever he owns.
    render(<Mascot pose="cheer" outfit={null} />);
    expect(srcOf()).toBe(MASCOT_BASE + CANONICAL_POSE_FILES.cheer);
  });
});
