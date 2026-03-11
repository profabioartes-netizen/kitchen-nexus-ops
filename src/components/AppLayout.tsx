import { Outlet } from "react-router-dom";
import { NavigationRail } from "./NavigationRail";

export function AppLayout() {
  return (
    <div className="flex flex-col md:flex-row min-h-screen w-full">
      <NavigationRail />
      <main className="flex-1 overflow-auto pb-20 md:pb-0">
        <Outlet />
      </main>
    </div>
  );
}
