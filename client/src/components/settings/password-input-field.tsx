import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

// Shared show/hide-eye password field for every "Sécurité" password-change form
// (AccountSecurityCard's 7 accounts, Admin, Supplier, Coffee Owner) — self-contained
// visibility state per instance, same pattern already used by the public
// Connexion/Inscription modal's own password fields (landing-page.tsx's FormField).
export function PasswordInputField({
  value,
  onChange,
  className,
  disabled,
  autoComplete,
  testId,
  toggleTestId,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  autoComplete?: string;
  testId?: string;
  toggleTestId?: string;
  ariaLabel: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        autoComplete={autoComplete}
        data-testid={testId}
        className={cn("pr-10", className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? `Masquer : ${ariaLabel}` : `Afficher : ${ariaLabel}`}
        title={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        data-testid={toggleTestId}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}
