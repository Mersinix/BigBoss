## Packages
zustand | Client-side cart state management
date-fns | Formatting dates for orders
@hookform/resolvers | Form validation with Zod
react-hook-form | Form state management
recharts | Dashboard analytics charts
lucide-react | High-quality icons

## Notes
- Tailwind Config - extend fontFamily:
  fontFamily: {
    sans: ["var(--font-sans)"],
    display: ["var(--font-display)"],
  }
- Uses Shadcn Sidebar for core layout
- Cart enforces single-supplier checkout to match backend Order schema
