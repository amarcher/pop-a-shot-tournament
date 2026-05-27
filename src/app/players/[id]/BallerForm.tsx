"use client";

import { useFormStatus } from "react-dom";
import {
  BALLER_ARCHETYPES,
  type BallerArchetype,
} from "@/lib/baller-types";
import { generateBallerAction } from "@/app/events/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="jam-button text-sm">
      {pending ? "Sending to the painter…" : "Generate baller ->"}
    </button>
  );
}

export function BallerForm({
  playerId,
  defaultArchetype,
  hasSeedImage,
}: {
  playerId: string;
  defaultArchetype?: BallerArchetype;
  hasSeedImage?: boolean;
}) {
  const initial: BallerArchetype = defaultArchetype ?? "allstar";

  return (
    <form
      action={generateBallerAction}
      encType="multipart/form-data"
      className="space-y-6"
    >
      <input type="hidden" name="playerId" value={playerId} />

      <fieldset>
        <legend className="arcade-sm text-sm">Pick your archetype</legend>
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {BALLER_ARCHETYPES.map((a) => (
            <li key={a.id}>
              <label className="grid h-full cursor-pointer gap-2 rounded-lg border-2 border-jam-blue bg-black/50 px-3 py-3 text-sm text-foreground/85 transition hover:border-jam-cyan has-[:checked]:border-jam-yellow has-[:checked]:bg-jam-red/30 has-[:checked]:text-foreground">
                <input
                  type="radio"
                  name="archetype"
                  value={a.id}
                  required
                  defaultChecked={a.id === initial}
                  className="sr-only"
                />
                <span
                  className="block h-1.5 rounded-full"
                  style={{
                    background: `linear-gradient(90deg, ${a.accent[0]}, ${a.accent[1]})`,
                  }}
                />
                <span className="block font-bold uppercase tracking-wider">
                  {a.label}
                </span>
                <span className="block text-xs leading-snug text-foreground/65">
                  {a.tagline}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <label className="block">
        <span className="arcade-sm text-sm">
          {hasSeedImage ? "Replace seed image" : "Upload a selfie"}
        </span>
        <input
          type="file"
          name="selfie"
          required={!hasSeedImage}
          accept="image/heic,image/heif,image/jpeg,image/png,image/webp,image/*"
          className="mt-2 block w-full rounded-lg border-2 border-jam-blue bg-black/50 px-3 py-2 text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-jam-yellow file:px-3 file:py-1 file:text-xs file:font-bold file:text-bezel hover:file:bg-jam-orange"
        />
        <span className="mt-1 block text-xs text-foreground/70">
          {hasSeedImage
            ? "Leave blank to reuse the saved seed image. Upload a new selfie to replace it."
            : "Shoulders-up works best. HEIC, JPEG, PNG, WebP all welcome."}
        </span>
      </label>

      <label className="block">
        <span className="arcade-sm text-sm">Optional flair (freeform)</span>
        <input
          type="text"
          name="freeform"
          autoComplete="off"
          placeholder="e.g. holding two basketballs, wearing a championship ring"
          className="mt-2 w-full rounded-lg border-2 border-jam-blue bg-black/50 px-3 py-2 text-sm text-foreground placeholder:text-foreground/30 focus:border-jam-cyan focus:outline-none"
        />
      </label>

      <SubmitButton />
    </form>
  );
}
