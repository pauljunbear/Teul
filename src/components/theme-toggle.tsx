import * as React from "react"
import { Moon, Sun } from "lucide-react"
import { setTheme } from "../lib/utils"
import { Button } from "./ui/button"

interface ThemeToggleProps {
  className?: string
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const [theme, setThemeState] = React.useState<"light" | "dark">("dark")

  React.useEffect(() => {
    const root = window.document.documentElement
    if (!root.classList.contains("light") && !root.classList.contains("dark")) {
      root.classList.add("dark")
    }
    setThemeState(root.classList.contains("dark") ? "dark" : "light")
  }, [])

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light"
    setThemeState(newTheme)
    setTheme(newTheme)
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      className={className}
      aria-label="Toggle theme"
    >
      {theme === "light" ? (
        <Moon className="h-4 w-4" />
      ) : (
        <Sun className="h-4 w-4" />
      )}
    </Button>
  )
}
