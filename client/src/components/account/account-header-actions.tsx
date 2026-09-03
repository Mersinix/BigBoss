import { Link } from "wouter";
import { MessageCircle, Star, Settings } from "lucide-react";
import { NotificationBellPopover } from "@/components/account/notification-bell-popover";
import type { NotificationService } from "@shared/schema";

// Header action icons (Message / Notification / Avis / Settings), reused by
// every professional account shell next to the existing "Se déconnecter"
// action. Each icon deep-links straight into the account's own existing
// Communication (Messages/Notifications/Avis) or Paramètres routes — no new
// pages, no new data, just direct navigation shortcuts from the header.
export function AccountHeaderActions({
  messagesPath, reviewsPath, settingsPath, notificationService, notificationViewAllPath, accentLinkTextClass,
}: {
  messagesPath: string;
  reviewsPath: string;
  settingsPath: string;
  notificationService: NotificationService;
  notificationViewAllPath: string;
  // Full Tailwind class string for the notification popover's "Voir tout" link,
  // e.g. "text-fuchsia-600 dark:text-fuchsia-400" (never interpolated).
  accentLinkTextClass: string;
}) {
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <Link href={messagesPath}>
        <a
          aria-label="Messages"
          title="Messages"
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white hover:bg-white/15 transition-colors"
          data-testid="button-header-messages"
        >
          <MessageCircle className="w-4 h-4" />
        </a>
      </Link>
      <NotificationBellPopover
        service={notificationService}
        viewAllPath={notificationViewAllPath}
        linkTextClass={accentLinkTextClass}
      />
      <Link href={reviewsPath}>
        <a
          aria-label="Avis"
          title="Avis"
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white hover:bg-white/15 transition-colors"
          data-testid="button-header-reviews"
        >
          <Star className="w-4 h-4" />
        </a>
      </Link>
      <Link href={settingsPath}>
        <a
          aria-label="Paramètres"
          title="Paramètres"
          className="w-9 h-9 rounded-xl flex items-center justify-center text-white hover:bg-white/15 transition-colors"
          data-testid="button-header-settings"
        >
          <Settings className="w-4 h-4" />
        </a>
      </Link>
    </div>
  );
}
