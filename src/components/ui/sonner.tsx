import { Toaster as Sonner, toast } from "sonner";
import { useEffect, useState } from "react";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");

  useEffect(() => {
    // Check for dark mode preference
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const storedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
    setTheme(storedTheme || (isDark ? "dark" : "light"));

    // Listen for changes
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem("theme")) {
        setTheme(e.matches ? "dark" : "light");
      }
    };
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          error:
            "group toast group-[.toaster]:bg-destructive group-[.toaster]:text-destructive-foreground group-[.toaster]:border-destructive/50 group-[.toaster]:shadow-lg",
          success:
            "group toast group-[.toaster]:bg-emerald-500/10 group-[.toaster]:text-emerald-500 group-[.toaster]:border-emerald-500/30 group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
