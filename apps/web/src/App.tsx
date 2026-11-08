import React, { useCallback, useState } from "react";
import { ConnectionHelp } from "./ui/ConnectionHelp.js";
import { OverlayProvider } from "./ui/Overlay.js";
import { useSession } from "./hooks/useSession.js";
import { readLaunchFragment } from "./judge/launch-fragment.js";
import { HINDI_OBJECTIVES, type DemoScenario } from "./judge/demo-scenarios.js";
import { AppShell } from "./shell/AppShell.js";
import { useRoute } from "./shell/router.js";
import { HomePage } from "./pages/HomePage.js";
import { StudioPage } from "./pages/StudioPage.js";
import { VoiceLabPage } from "./pages/VoiceLabPage.js";
import { TrustPage } from "./pages/TrustPage.js";
import { DeveloperLabPage } from "./pages/DeveloperLabPage.js";

/** A single session survives visitor navigation. Diagnosis has a separate local-only entry. */
export function App() {
  const session = useSession();
  const [route, navigate] = useRoute();
  const [stack] = useState(() => readLaunchFragment().stack);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [preset, setPreset] = useState<DemoScenario | undefined>(undefined);
  const [scenario, setScenario] = useState<DemoScenario | undefined>(undefined);
  const { startRealCall, resetSession } = session;

  const startScenario = useCallback(
    (picked: DemoScenario) => {
      setScenario(picked);
      void startRealCall(picked.request);
    },
    [startRealCall],
  );
  const reset = useCallback(() => {
    setScenario(undefined);
    resetSession();
  }, [resetSession]);
  const openSettings = useCallback(() => setIsSettingsOpen(true), []);

  let page: React.ReactNode;
  switch (route) {
    case "studio":
      page = <StudioPage session={session} stack={stack} scenario={scenario} initialObjective={preset} onStartScenario={startScenario} onReset={reset} onOpenSettings={openSettings} onNavigate={navigate} />;
      break;
    case "lab":
      page = <VoiceLabPage onNavigate={navigate} />;
      break;
    case "trust":
      page = <TrustPage onNavigate={navigate} onOpenSettings={openSettings} />;
      break;
    case "developer":
      page = <DeveloperLabPage onNavigate={navigate} />;
      break;
    default:
      page = <HomePage onNavigate={navigate} onChooseObjective={key => { const picked = HINDI_OBJECTIVES.find(s => s.key === key); if (picked) setPreset(picked); navigate("studio"); }} />;
  }

  return (
    <OverlayProvider>
      <AppShell route={route} onNavigate={navigate} session={session} stack={stack} onOpenSettings={openSettings}>
        {page}
      </AppShell>
      <ConnectionHelp
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        session={session}
      />
    </OverlayProvider>
  );
}
export default App;
