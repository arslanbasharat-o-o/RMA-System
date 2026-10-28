# RMA design language

Source-derived baseline for the current interface; update alongside UI changes. No separate owner-provided custom design-language skill was located in the local skill directories or GitHub repository names checked on 2026-10-28. This document describes existing code, not a separately approved brand specification.

## Color and themes

`src/app/globals.css` defines semantic light/dark tokens: background `#f8fafc` / `#09090b`, foreground `#0f172a` / `#f4f4f5`, surface `#ffffff` / `#121215`, subtle surface `#f1f5f9` / `#18181b`, border `#e2e8f0` / `#27272a`, stronger border `#cbd5e1` / `#3f3f46`, muted `#64748b` / `#a1a1aa`. Accent `#4f46e5`, success `#10b981`, warning `#f59e0b`, destructive `#ef4444` apply to both. Some components use Tailwind slate, neutral, zinc, indigo and rose classes directly; inspect the component instead of assuming every surface uses the semantic variables.

`src/components/theme/ThemeProvider.tsx` supports light, dark and system modes. `src/app/layout.tsx` applies the initial dark class before hydration. Preserve both themes and visible contrast.

## Type, layout and spacing

The shell uses Tailwind `font-sans`; the root layout does not load a named custom font (`src/app/layout.tsx`, `src/components/layout/AppShell.tsx`). Small operational labels use `text-xs` or `text-sm`, medium/semibold weights and compact tracking; some metadata uses `font-mono`. Check the surrounding page before choosing type scale.

The shell uses a responsive mobile navigation drawer (`w-72`) and desktop sidebar (`w-64`, collapsed `w-16`) at the `lg` breakpoint. Main content uses `p-4 sm:p-6 lg:p-8`, `max-w-7xl`, and scrollable content (`src/components/layout/AppShell.tsx`). Buttons use `h-8`, `h-9` or `h-11` and compact gaps; inputs use `h-9`, `px-3` and `py-1.5` (`src/components/ui/button.tsx`, `input.tsx`). Tailwind utilities, not a separately defined spacing scale, are the implementation source.

## Components and behavior

Reuse `src/components/ui/` primitives and the shell before adding new variants. Buttons provide primary, secondary, outline, ghost and destructive treatments, focus-visible rings, disabled states and loading indicators. Inputs provide focus, disabled and error states. Modals use a labeled dialog, Escape and scroll-lock hooks, overlay, rounded surface and responsive padding (`src/components/ui/modal.tsx`); check keyboard behavior for each change. Sidebar navigation uses clear active states and accessible labels. Preserve desktop and mobile workflows, especially camera intake and review.

Motion tokens in `src/lib/motion/tokens.ts` set instant 0.12 s, fast 0.16 s, standard 0.22 s, dialog 0.26 s and layout 0.30 s, with shared easing and spring values. `src/app/globals.css` contains reduced-motion handling; `src/components/motion/` provides shared motion wrappers. Avoid relying on motion alone to convey status.

For new UI work, inspect the applicable existing components and verify accessibility, responsive behavior and both themes. The current code is authoritative when this summary becomes stale.
