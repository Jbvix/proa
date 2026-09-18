import { useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { VoiceButton, VoiceSheet } from "@/components/voice-assistant";

export function DeckTools() {
  const [voice, setVoice] = useState(false);
  return (
    <>
      <ThemeToggle />
      <VoiceButton onOpen={() => setVoice(true)} />
      <VoiceSheet open={voice} onClose={() => setVoice(false)} />
    </>
  );
}
