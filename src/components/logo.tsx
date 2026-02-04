import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("text-primary", className)}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M50 0C27.9 0 10 17.9 10 40c0 28.1 36.6 57.2 37.8 58.4.8.8 2.1.8 2.8 0C51.8 97.2 90 68.1 90 40 90 17.9 72.1 0 50 0zm0 60c-11 0-20-9-20-20s9-20 20-20 20 9 20 20-9 20-20 20z"
        fillOpacity="0.3"
      />
      <path d="M50 20c-11 0-20 9-20 20s9 20 20 20 20 9 20 20-9-20-20-20z" />
    </svg>
  );
}
