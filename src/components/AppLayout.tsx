import { Outlet } from "react-router-dom";
import { NavigationRail } from "./NavigationRail";

export function AppLayout() {
  return (
    <div className="flex min-h-screen w-full">
      <NavigationRail />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
