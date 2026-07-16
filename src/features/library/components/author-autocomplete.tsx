"use client";

import * as Popover from "@radix-ui/react-popover";
import { Check, Search, X } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type AuthorOption = string | { username: string; postCount: number };
export type AuthorAutocompleteProps = { options: AuthorOption[]; value: string; onValueChange: (value: string) => void; label?: string; placeholder?: string; forceBelow?: boolean };

export function AuthorAutocomplete({ options, value, onValueChange, label = "Filtrer par auteur", placeholder = "Auteur", forceBelow = false }: AuthorAutocompleteProps) {
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const suggestions = useMemo(() => {
    const query = normalize(value.replace(/^@/, ""));
    return options.filter((option) => !query || normalize(optionName(option).replace(/^@/, "")).includes(query)).slice(0, 8);
  }, [options, value]);
  const activeOption = suggestions[activeIndex];
  const select = (option: AuthorOption) => { onValueChange(optionName(option)); setOpen(false); inputRef.current?.focus(); };

  return <Popover.Root open={open && suggestions.length > 0} onOpenChange={setOpen}>
    <div className="author-autocomplete">
      <Popover.Anchor asChild><div className="author-input-shell">
        <Search aria-hidden="true" className="size-4" />
        <input ref={inputRef} className="compact-filter" role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={open && suggestions.length > 0} aria-controls={listboxId} aria-activedescendant={open && activeOption ? `${listboxId}-${activeIndex}` : undefined} autoComplete="off" placeholder={placeholder} value={value}
          onChange={(event) => { onValueChange(event.target.value); setActiveIndex(0); setOpen(true); }} onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if ((event.key === "ArrowDown" || event.key === "ArrowUp") && suggestions.length) { event.preventDefault(); setOpen(true); setActiveIndex((current) => (current + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length); }
            else if (event.key === "Enter" && open && activeOption) { event.preventDefault(); select(activeOption); }
            else if (event.key === "Escape") setOpen(false);
          }} />
        {value ? <button type="button" className="author-clear" aria-label="Effacer le filtre auteur" onClick={() => { onValueChange(""); setActiveIndex(0); inputRef.current?.focus(); }}><X aria-hidden="true" className="size-3.5" /></button> : null}
      </div></Popover.Anchor>
      <Popover.Portal><Popover.Content className="author-suggestions" side="bottom" sideOffset={5} align="start" avoidCollisions={!forceBelow} collisionPadding={8} onOpenAutoFocus={(event) => event.preventDefault()}>
        <div id={listboxId} role="listbox" aria-label="Suggestions d’auteurs">{suggestions.map((option, index) => { const username = optionName(option); return <button id={`${listboxId}-${index}`} key={username} type="button" role="option" aria-selected={value === username} className={cn(index === activeIndex && "is-active")} onPointerMove={() => setActiveIndex(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => select(option)}><span className="truncate">@{username.replace(/^@/, "")}</span>{typeof option === "string" ? null : <span className="author-post-count tabular-nums">{option.postCount}</span>}{value === username ? <Check aria-hidden="true" className="size-4" /> : null}</button>; })}</div>
      </Popover.Content></Popover.Portal>
    </div>
  </Popover.Root>;
}

function normalize(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR").trim(); }
function optionName(option: AuthorOption) { return typeof option === "string" ? option : option.username; }
