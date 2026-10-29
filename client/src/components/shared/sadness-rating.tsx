import { FaMeh, FaFrown, FaSadTear, FaSadCry, FaAngry } from "react-icons/fa";
import type { IconType } from "react-icons";

// Shared 5-level "sadness" rating (task: "Redesign Maintenance Reports Using
// the Avis Modal Pattern and Add Admin Moderation") — the Report system's own
// equivalent of the Avis modal's 5-star picker, built to be reused as-is by
// Print/Barista/Academy/Marketing/Shop when each of those gets the same
// redesign. Uses react-icons/fa (already a project dependency, unused
// elsewhere in the client until now) instead of lucide-react: lucide only has
// 4 distinct "negative" face icons (meh/annoyed/frown/angry), not enough for 5
// clearly distinct levels, while Font Awesome's meh/frown/sad-tear/sad-cry/
// angry set maps directly onto the 5 levels requested, in ascending order of
// severity.
export const SADNESS_LEVELS: { value: 1 | 2 | 3 | 4 | 5; label: string; Icon: IconType }[] = [
  { value: 1, label: "Légèrement préoccupé", Icon: FaMeh },
  { value: 2, label: "Déçu", Icon: FaFrown },
  { value: 3, label: "Mécontent", Icon: FaSadTear },
  { value: 4, label: "Très mécontent", Icon: FaSadCry },
  { value: 5, label: "Extrêmement mécontent", Icon: FaAngry },
];

interface PickerProps {
  value: number;
  onChange: (value: number) => void;
  isDark?: boolean;
  disabled?: boolean;
  // Tailwind text-color class applied to the selected icon — lets each
  // module keep its own theme accent (Maintenance: orange/amber) without
  // this shared component hardcoding one palette.
  accentClassName?: string;
}

// Controlled, single-selection, accessible (radiogroup/radio + arrow-key
// navigation, same interaction pattern as a native radio group).
export function SadnessRatingPicker({
  value, onChange, isDark = false, disabled = false, accentClassName = "text-orange-500",
}: PickerProps) {
  const muted = isDark ? "text-gray-600" : "text-gray-300";
  const hoverBg = isDark ? "hover:bg-gray-800" : "hover:bg-gray-100";

  const focusSibling = (index: number, delta: number) => {
    const next = SADNESS_LEVELS[(index + delta + SADNESS_LEVELS.length) % SADNESS_LEVELS.length];
    const el = document.getElementById(`sadness-rating-${next.value}`);
    el?.focus();
    if (!disabled) onChange(next.value);
  };

  return (
    <div role="radiogroup" aria-label="Note de l'expérience" className="flex items-center justify-between gap-1">
      {SADNESS_LEVELS.map(({ value: level, label, Icon }, index) => {
        const selected = value === level;
        return (
          <button
            key={level}
            id={`sadness-rating-${level}`}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            disabled={disabled}
            onClick={() => !disabled && onChange(level)}
            onKeyDown={(e) => {
              if (disabled) return;
              if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); focusSibling(index, 1); }
              if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); focusSibling(index, -1); }
            }}
            tabIndex={selected || (value === 0 && index === 0) ? 0 : -1}
            data-testid={`button-sadness-rating-${level}`}
            className={`flex flex-col items-center gap-1 p-1.5 rounded-xl transition-colors flex-1 ${disabled ? "opacity-60 cursor-not-allowed" : `cursor-pointer ${hoverBg}`} ${selected ? accentClassName : muted}`}
          >
            <Icon className="w-6 h-6" />
          </button>
        );
      })}
    </div>
  );
}

// Read-only display — a single face for an already-known rating (report
// cards, admin moderation rows). Renders nothing meaningful (a muted dash)
// when the rating is null — a legacy report submitted before this feature
// existed, never reinterpreted as a real level.
export function SadnessRatingDisplay({
  rating, isDark = false, size = "sm", accentClassName = "text-orange-500",
}: { rating: number | null; isDark?: boolean; size?: "sm" | "md"; accentClassName?: string }) {
  const level = rating != null ? SADNESS_LEVELS.find((l) => l.value === rating) : undefined;
  const dim = size === "md" ? "w-5 h-5" : "w-4 h-4";
  if (!level) {
    return <span className={`text-xs italic ${isDark ? "text-gray-500" : "text-gray-400"}`}>Note non disponible</span>;
  }
  const { Icon, label } = level;
  return (
    <span className="inline-flex items-center gap-1.5" title={label}>
      <Icon className={`${dim} ${accentClassName}`} />
      <span className={`text-xs font-medium ${isDark ? "text-gray-300" : "text-gray-600"}`}>{label}</span>
    </span>
  );
}
