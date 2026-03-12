import { Outlet } from "react-router-dom";
import { NavigationRail } from "./NavigationRail";
import { useIsMobile } from "@/hooks/use-mobile";

export function AppLayout() {
  const isMobile = useIsMobile();

  return (
    <div className="flex flex-col md:flex-row h-screen w-full overflow-hidden">
      {!isMobile && <NavigationRail />}
      <main className="flex-1 min-h-0 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
