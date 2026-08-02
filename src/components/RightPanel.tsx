"use client";

import SidebarLLMChat from "@/components/SidebarLLMChat";
import ResizableRightPanelShell from "@/components/ResizableRightPanelShell";

export default function RightPanel() {
  return (
    <ResizableRightPanelShell>
      <SidebarLLMChat />
    </ResizableRightPanelShell>
  );
}
