import { Link } from "wouter";
import { MessageCircle, Star, Settings } from "lucide-react";
import { NotificationBellPopover } from "@/components/account/notification-bell-popover";
import type { NotificationService } from "@shared/schema";

type ActionKey = "messages" | "notifications" | "avis" | "settings";

// Header action icons (Message / Notification / Avis / Settings), reused by
// every professional account shell next to the existing "Se déconnecter"
// action. Each icon deep-links straight into the account's own existing
// Communication (Messages/Notifications/Avis) or Paramètres routes — no new
// pages, no new data, just direct navigation shortcuts from the header.
// Icon-only, no wrapping row div — the one unified navbar layout (mobile,
// tablet, desktop alike) places these directly into its own 2x3 icon grid,
// so this component only needs to emit bare cells in whatever order/subset
// the caller asks for (Settings sits in its own call, separated from
// Messages/Notifications/Avis by Dark Mode + Se déconnecter in between).
export function AccountHeaderActions({
  messagesPath, reviewsPath, settingsPath, notificationService, notificationViewAllPath, accentLinkTextClass,
  order = ["messages", "notifications", "avis", "settings"],
}: {
  messagesPath: string;
  reviewsPath: string;
  settingsPath: string;
  notificationService: NotificationService;
  notificationViewAllPath: string;
  // Full Tailwind class string for the notification popover's "Voir tout" link,
  // e.g. "text-fuchsia-600 dark:text-fuchsia-400" (never interpolated).
  accentLinkTextClass: string;
  // Which of the 4 icons to render, and in what order.
  order?: ActionKey[];
}) {
  const render: Record<ActionKey, React.ReactNode> = {
    messages: (
      <Link key="messages" href={messagesPath}>
        <a
          aria-label="Messages"
          title="Messagerie"
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white hover:bg-white/15 transition-colors"
          data-testid="button-header-messages"
        >
          <MessageCircle className="w-4 h-4" />
        </a>
      </Link>
    ),
    notifications: (
      <NotificationBellPopover
        key="notifications"
        service={notificationService}
        viewAllPath={notificationViewAllPath}
        linkTextClass={accentLinkTextClass}
      />
    ),
    avis: (
      <Link key="avis" href={reviewsPath}>
        <a
          aria-label="Avis"
          title="Avis"
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white hover:bg-white/15 transition-colors"
          data-testid="button-header-reviews"
        >
          <Star className="w-4 h-4" />
        </a>
      </Link>
    ),
    settings: (
      <Link key="settings" href={settingsPath}>
        <a
          aria-label="Paramètres"
          title="Paramètres"
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white hover:bg-white/15 transition-colors"
          data-testid="button-header-settings"
        >
          <Settings className="w-4 h-4" />
        </a>
      </Link>
    ),
  };
  return <>{order.map((key) => render[key])}</>;
}
