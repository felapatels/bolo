// Task #1117 web mock entry. Reads ?theme=dark exactly the way the app does, 
// by putting the `dark` class on <html>, so the shots are the real tokens.
import { createRoot } from "react-dom/client";
import Harness from "./harness";

const theme = new URLSearchParams(location.search).get("theme");
if (theme === "dark") document.documentElement.classList.add("dark");

createRoot(document.getElementById("root")!).render(<Harness />);
