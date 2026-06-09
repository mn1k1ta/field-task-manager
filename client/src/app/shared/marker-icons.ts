/**
 * Curated emoji icon palette for task markers (the glyph centered inside the
 * status-colored pin). Field-work relevant, grouped for a tidy picker but also
 * exposed flat for validation / random access.
 *
 * Keep these single-codepoint where possible so they render consistently in
 * the divIcon glyph and in selects across platforms.
 */

export interface MarkerIconGroup {
  /** Section heading for the picker UI (English fallback). */
  label: string;
  /** i18n dotted key for the section heading (localized via the `t` pipe). */
  labelKey: string;
  /** Emoji glyphs in this group. */
  icons: readonly string[];
}

/** The default marker glyph used when a task has no explicit icon. */
export const DEFAULT_ICON = '📍';

/** Grouped icons for a sectioned picker. */
export const MARKER_ICON_GROUPS: readonly MarkerIconGroup[] = [
  {
    label: 'Tools & Equipment',
    labelKey: 'form.iconGroupTools',
    icons: ['🔧', '🛠️', '🪛', '🧰', '🪜', '🔌', '🔋', '🪫', '💡', '🛢️'],
  },
  {
    label: 'Work & Sites',
    labelKey: 'form.iconGroupSites',
    icons: ['🚧', '🏗️', '🏭', '🏢', '🧱', '🪵', '🚜', '🚚', '⚡', '🚰'],
  },
  {
    label: 'Hazards & Safety',
    labelKey: 'form.iconGroupHazards',
    icons: ['⚠️', '🔥', '🧯', '🚿', '🌡️', '🧪', '♻️', '🛎️', '📋', '📦'],
  },
  {
    label: 'Location & Survey',
    labelKey: 'form.iconGroupSurvey',
    icons: ['📍', '🗺️', '🧭', '🛰️', '📡', '🔭', '🌳', '🌊', '🪙', '🪨'],
  },
];

/** Flat list of all marker icons (deduped, group order preserved). */
export const MARKER_ICONS: readonly string[] = Array.from(
  new Set(MARKER_ICON_GROUPS.flatMap((g) => g.icons)),
);

/** True if `icon` is one of the curated marker glyphs. */
export function isKnownMarkerIcon(icon: string | null | undefined): boolean {
  return icon != null && MARKER_ICONS.includes(icon);
}

/** The icon to render for a task: its own icon if present, else the default. */
export function resolveIcon(icon: string | null | undefined): string {
  return icon != null && icon.trim() !== '' ? icon : DEFAULT_ICON;
}
