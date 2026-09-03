import { BarChart2, type LucideIcon } from "lucide-react";

// Honest placeholder for a Performance/Communication sub-tab that has no
// dedicated real data source yet for this account — never fabricated
// numbers/content, per the task's explicit "display an appropriate empty
// state rather than invented values."
export function PerformanceEmptyState({ message, icon: Icon = BarChart2 }: { message: string; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center rounded-2xl border border-gray-100 dark:border-gray-700/60 bg-white dark:bg-gray-800">
      <Icon className="w-8 h-8 text-gray-300 dark:text-gray-600" />
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">{message}</p>
    </div>
  );
}
