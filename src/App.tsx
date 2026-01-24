// src/App.tsx

import { useEffect } from "react";
import { Shell } from "./shell/Shell";
import { LibraryModule } from "./modules/library/LibraryModule";
import { WorkModule } from "./modules/work/WorkModule";
import { InboxModule } from "./modules/inbox/InboxModule";
import { CrmModule } from "./modules/crm/CrmModule";
import { ConsoleModule } from "./modules/console/ConsoleModule";
import { useAppStore, ModuleId } from "./stores/appStore";

const modules: Record<ModuleId, React.ComponentType> = {
  library: LibraryModule,
  work: WorkModule,
  inbox: InboxModule,
  crm: CrmModule,
  console: ConsoleModule,
};

export default function App() {
  const { activeModule, setActiveModule } = useAppStore();

  // Keyboard shortcuts: ⌘1-5 to switch modules
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key >= "1" && e.key <= "5") {
        e.preventDefault();
        const moduleKeys: ModuleId[] = [
          "library",
          "work",
          "inbox",
          "crm",
          "console",
        ];
        setActiveModule(moduleKeys[parseInt(e.key) - 1]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setActiveModule]);

  const ActiveModule = modules[activeModule];

  return (
    <Shell activeModule={activeModule} onModuleChange={setActiveModule}>
      <ActiveModule />
    </Shell>
  );
}
