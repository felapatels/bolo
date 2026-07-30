import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  TimezoneSelect,
  canonicalTimezone,
  detectedTimezone,
  groupTimezones,
  timezoneMatchScore,
} from "@/components/timezone-select";

// ---------------------------------------------------------------------------
// Account settings timezone picker: a searchable select fed by
// Intl.supportedValuesOf("timeZone"), grouped by IANA region, that always
// contains the saved value and the detected zone. Legacy CLDR ids are
// modernized (Asia/Calcutta → Asia/Kolkata) and search uses substring-only
// ranking, not cmdk's fuzzy scorer. Lives in its own file so it can exercise
// the component directly, without the account page's mocks.
// ---------------------------------------------------------------------------

describe("groupTimezones", () => {
  test("groups zones by their IANA region prefix, preserving order", () => {
    const groups = groupTimezones([
      "America/Chicago",
      "America/New_York",
      "Asia/Kolkata",
      "Europe/London",
      "UTC",
    ]);

    expect(groups.map((g) => g.region)).toEqual([
      "America",
      "Asia",
      "Europe",
      "Other",
    ]);
    expect(groups[0].zones).toEqual(["America/Chicago", "America/New_York"]);
    // Zones with no region prefix (UTC, GMT aliases) fall under "Other".
    expect(groups[3].zones).toEqual(["UTC"]);
  });
});

describe("timezoneMatchScore", () => {
  test("city-segment prefix outranks substring; fuzzy subsequences score 0", () => {
    // The original bug: cmdk's fuzzy scorer matched "Kolk" against
    // Asia/Srednekolymsk (K…OL…K subsequence). Substring-only scoring drops it.
    expect(timezoneMatchScore("Asia/Srednekolymsk", "Kolk", [])).toBe(0);
    expect(timezoneMatchScore("Asia/Kolkata", "Kolk", [])).toBe(1);
    // Prefix (1) > city substring (0.85) > region substring (0.6).
    expect(timezoneMatchScore("America/New_York", "york", [])).toBe(0.85);
    expect(timezoneMatchScore("America/Chicago", "amer", [])).toBe(0.6);
    // Legacy-id keywords count, city-segment first.
    expect(timezoneMatchScore("Asia/Kolkata", "Calcutta", ["Asia/Calcutta"])).toBe(1);
    // Underscores and spaces are interchangeable.
    expect(timezoneMatchScore("America/New_York", "new york", [])).toBe(1);
  });
});

describe("canonicalTimezone", () => {
  test("modernizes deprecated CLDR ids and passes modern ids through", () => {
    expect(canonicalTimezone("Asia/Calcutta")).toBe("Asia/Kolkata");
    expect(canonicalTimezone("Europe/Kiev")).toBe("Europe/Kyiv");
    expect(canonicalTimezone("Asia/Kolkata")).toBe("Asia/Kolkata");
    expect(canonicalTimezone("UTC")).toBe("UTC");
    // Both spellings must stay valid Intl zones or saving would break.
    for (const zone of ["Asia/Kolkata", "Asia/Calcutta", "Europe/Kyiv"]) {
      expect(() => new Intl.DateTimeFormat("en", { timeZone: zone })).not.toThrow();
    }
  });
});

describe("TimezoneSelect", () => {
  test("shows the saved zone on the closed trigger, modernizing legacy ids", () => {
    const { rerender } = render(
      <TimezoneSelect value="Asia/Kolkata" onChange={vi.fn()} />,
    );
    expect(screen.getByTestId("timezone-trigger")).toHaveTextContent(
      "Asia/Kolkata",
    );
    // A value saved before modernization still displays the modern name.
    rerender(<TimezoneSelect value="Asia/Calcutta" onChange={vi.fn()} />);
    expect(screen.getByTestId("timezone-trigger")).toHaveTextContent(
      "Asia/Kolkata",
    );
  });

  test("falls back to the detected zone when nothing is saved", () => {
    render(<TimezoneSelect value="" onChange={vi.fn()} />);
    expect(screen.getByTestId("timezone-trigger")).toHaveTextContent(
      detectedTimezone(),
    );
  });

  test("opens a searchable, region-grouped list and saves the picked zone", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TimezoneSelect value="UTC" onChange={onChange} />);

    await user.click(screen.getByTestId("timezone-trigger"));

    // Region group headings come from the IANA prefix.
    expect(screen.getByText("America")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Search timezones…"), "Tokyo");
    await user.click(screen.getByRole("option", { name: /Asia\/Tokyo/ }));

    expect(onChange).toHaveBeenCalledWith("Asia/Tokyo");
  });

  test('"Kolk" ranks Asia/Kolkata first and hides fuzzy-only matches', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TimezoneSelect value="UTC" onChange={onChange} />);

    await user.click(screen.getByTestId("timezone-trigger"));
    await user.type(screen.getByPlaceholderText("Search timezones…"), "Kolk");

    const options = screen.getAllByRole("option");
    // This ICU lists legacy Asia/Calcutta; the picker modernizes it.
    expect(options[0]).toHaveTextContent("Asia/Kolkata");
    expect(
      screen.queryByRole("option", { name: /Srednekolymsk/ }),
    ).not.toBeInTheDocument();

    await user.click(options[0]);
    expect(onChange).toHaveBeenCalledWith("Asia/Kolkata");
  });

  test('"New" and "Lond" rank the exact city prefix first', async () => {
    const user = userEvent.setup();
    render(<TimezoneSelect value="UTC" onChange={vi.fn()} />);
    await user.click(screen.getByTestId("timezone-trigger"));

    const input = screen.getByPlaceholderText("Search timezones…");
    await user.type(input, "New");
    expect(screen.getAllByRole("option")[0]).toHaveTextContent(
      "America/New York",
    );

    await user.clear(input);
    await user.type(input, "Lond");
    expect(screen.getAllByRole("option")[0]).toHaveTextContent(
      "Europe/London",
    );
  });

  test("legacy spelling still finds the modernized zone (Calcutta → Kolkata)", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TimezoneSelect value="UTC" onChange={onChange} />);

    await user.click(screen.getByTestId("timezone-trigger"));
    await user.type(
      screen.getByPlaceholderText("Search timezones…"),
      "Calcutta",
    );
    await user.click(screen.getByRole("option", { name: /Asia\/Kolkata/ }));

    expect(onChange).toHaveBeenCalledWith("Asia/Kolkata");
  });

  test("re-selecting the current zone closes without a redundant save", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TimezoneSelect value="UTC" onChange={onChange} />);

    await user.click(screen.getByTestId("timezone-trigger"));
    await user.type(screen.getByPlaceholderText("Search timezones…"), "UTC");
    // Role-scoped: the closed trigger also reads "UTC".
    await user.click(screen.getByRole("option", { name: /^UTC$/ }));

    expect(onChange).not.toHaveBeenCalled();
  });

  test("keeps a saved zone visible even if the browser list omits it", async () => {
    const user = userEvent.setup();
    render(
      <TimezoneSelect value="Legacy/Saved_Zone" onChange={vi.fn()} />,
    );

    await user.click(screen.getByTestId("timezone-trigger"));
    // Options render underscores as spaces for readability.
    expect(
      screen.getByRole("option", { name: /Legacy\/Saved Zone/ }),
    ).toBeInTheDocument();
  });
});
