import { ChatWidget } from "@/widgets/chat";
import { Header } from "@/widgets/header";
import { Sidebar } from "@/widgets/sidebar";

export default function Home() {
  return (
    <div className="flex h-screen bg-surface-950">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <Header />

        {/* Chat Area */}
        <main className="flex-1 overflow-hidden">
          <ChatWidget />
        </main>
      </div>
    </div>
  );
}

