"use client";

import * as React from "react";
import { Eye, EyeOff, Shuffle } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

/** No 0, o, 1, i or l: clients read the password off a message and type it. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** Three groups of four, like `k7fq-m2xp-9wtd`: 31^12 values, about 59 bits. */
export function generatePortalPassword(): string {
  const values = crypto.getRandomValues(new Uint32Array(12));
  const chars = Array.from(values, (value) => ALPHABET[value % ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
}

/**
 * A new portal password: masked until revealed, and Generate fills a
 * password and reveals it. Reveal state is local, so it resets whenever the
 * input unmounts (the rotate dialog closing). `compact` is the icon-only
 * Generate the rotate dialog uses.
 */
export function PortalPasswordInput({
  id,
  value,
  onChange,
  invalid,
  autoFocus,
  compact = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const [revealed, setRevealed] = React.useState(false);

  function generate() {
    onChange(generatePortalPassword());
    setRevealed(true);
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        id={id}
        value={value}
        type={revealed ? "text" : "password"}
        required
        minLength={10}
        maxLength={200}
        autoComplete="new-password"
        spellCheck={false}
        autoFocus={autoFocus}
        className="min-w-0 flex-1 font-mono text-sm"
        aria-invalid={invalid ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      <IconButton
        label={revealed ? "Hide password" : "Show password"}
        variant="secondary"
        size="md"
        onClick={() => setRevealed((current) => !current)}
      >
        {revealed ? <EyeOff /> : <Eye />}
      </IconButton>
      {compact ? (
        <IconButton label="Generate a password" variant="secondary" size="md" onClick={generate}>
          <Shuffle />
        </IconButton>
      ) : (
        <Button
          variant="secondary"
          size="md"
          className="shrink-0"
          aria-label="Generate a portal password"
          onClick={generate}
        >
          <Shuffle />
          <span className="hidden sm:inline">Generate</span>
        </Button>
      )}
    </div>
  );
}
