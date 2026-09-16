import { ConversationObject, Tick } from "@/components/landing/objects";

export function InboundReturn() {
  return (
    <div id="inbound" className="mx-auto grid w-full max-w-3xl gap-6 lg:grid-cols-2">
      <div className="srf-sheet px-5 py-6">
        <Tick>Studio published</Tick>
        <p className="mt-4 text-[22px] leading-snug font-light tracking-[-0.03em] text-ink">
          “You don’t modernize legacy software by replacing everything.”
        </p>
      </div>
      <ConversationObject
        from="Client / Alex"
        time="Just now"
        body="“This is exactly the problem we’re in. Can we talk?”"
        intent="Inbound opportunity"
        next="Prepare reply"
      />
    </div>
  );
}
