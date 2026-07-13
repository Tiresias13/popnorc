type BadgeTone = "emerald" | "amber" | "red" | "blue" | "purple" | "gray";

const TONE_CLASSES: Record<BadgeTone, string> = {
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  red: "bg-red-50 text-red-600",
  blue: "bg-blue-50 text-blue-600",
  purple: "bg-purple-50 text-purple-600",
  gray: "bg-gray-100 text-gray-600",
};

export function Badge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}
