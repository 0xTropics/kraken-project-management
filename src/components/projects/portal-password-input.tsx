"use client";

import * as React from "react";
import { Eye, EyeOff, Shuffle } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Input } from "@/components/ui/field";

/** Two words and a number, the same shape as the seeded portal passwords. */
const WORDS = [
  "seagrass", "lantern", "harbour", "quartz", "meadow", "cobalt", "thistle",
  "marble", "tundra", "willow", "cinder", "pelican", "juniper", "anchor",
  "zephyr", "basalt", "orchard", "kestrel", "saffron", "driftwood",
];

function passphrase(): string {
  const values = new Uint32Array(3);
  crypto.getRandomValues(values);
  const first = WORDS[values[0] % WORDS.length];
  let second = WORDS[values[1] % WORDS.length];
  if (second === first) second = WORDS[(values[1] + 1) % WORDS.length];
  return `${first}-${second}-${10 + (values[2] % 90)}`;
}

/**
 * A new portal password: masked until revealed, and Generate fills a
 * passphrase and reveals it. Reveal state is local, so it resets whenever the
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
    onChange(passphrase());
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
