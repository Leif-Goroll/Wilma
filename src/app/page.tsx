import ChatWindow from "@/components/ChatWindow";

export default function Home() {
  return (
    <main className="flex flex-1 justify-center px-3 py-6 sm:px-6 sm:py-10">
      <div className="w-full max-w-3xl">
        <ChatWindow />
      </div>
    </main>
  );
}
