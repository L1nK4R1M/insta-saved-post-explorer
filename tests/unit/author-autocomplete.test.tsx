import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { AuthorAutocomplete } from "@/features/library/components/author-autocomplete";

describe("AuthorAutocomplete", () => {
  it("filtre, sélectionne au clavier et permet l’effacement", async () => {
    function Harness() {
      const [value, setValue] = useState("");
      return <AuthorAutocomplete options={["alice", "bob", "bobby"]} value={value} onValueChange={setValue} />;
    }
    render(<Harness />);
    const input = screen.getByRole("combobox", { name: "Filtrer par auteur" });

    fireEvent.change(input, { target: { value: "bo" } });
    expect(input).toHaveValue("bo");
    await screen.findByRole("listbox", { name: "Suggestions d’auteurs" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveValue("bob");

    fireEvent.click(screen.getByRole("button", { name: "Effacer le filtre auteur" }));
    expect(input).toHaveValue("");
  });
});
