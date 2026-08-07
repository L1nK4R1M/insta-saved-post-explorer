// Required to protect the keyboard selection path for the canvas-adjacent a11y seam.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { PlacesMapItem } from "@/server/places/map-view";
import { PlacesMapA11yList } from "@/features/places/components/places-renderer";

function place(id: string, displayName: string): PlacesMapItem {
  return {
    id,
    displayName,
    category: "catering.restaurant",
    categoryGroup: "restaurant",
    city: "Dubai",
    region: null,
    country: "Émirats arabes unis",
    countryCode: "AE",
    latitude: 25.1,
    longitude: 55.1,
    precision: "EXACT",
    confidence: 0.9,
    approximationRadiusMeters: null,
    reviewStatus: "UNREVIEWED",
    isUserConfirmed: false,
    postCount: 1,
    sourceThemes: ["Restaurant"],
    previewThumbnailUrl: null,
  };
}

describe("Places map accessibility seam", () => {
  it("exposes every visible place as a selectable accessible button", () => {
    const onSelect = vi.fn();
    render(
      <PlacesMapA11yList
        places={[place("p1", "Nobu Dubai"), place("p2", "L'Atelier") ]}
        selectedId="p1"
        onSelect={onSelect}
      />,
    );

    const group = screen.getByRole("group", { name: "Lieux affichés sur la carte" });
    expect(group).toHaveAttribute("tabindex", "0");
    const buttons = screen.getAllByRole("button", { name: /Sélectionner/ });
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAttribute("tabindex", "-1");
    expect(buttons[0]).toHaveAttribute("aria-pressed", "true");
    expect(buttons[1]).toHaveAttribute("aria-pressed", "false");

    fireEvent.keyDown(group, { key: "ArrowDown" });
    expect(document.activeElement).toBe(buttons[0]);
    fireEvent.keyDown(buttons[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(buttons[1]);
    fireEvent.click(buttons[1]);
    expect(onSelect).toHaveBeenCalledWith("p2");
  });
});
