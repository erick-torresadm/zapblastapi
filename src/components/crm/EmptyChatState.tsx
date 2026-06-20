// Estado vazio — quando nenhuma conversa está selecionada (estilo WhatsApp Web).
import { MessageCircle, Lock } from "lucide-react";

export function EmptyChatState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="relative">
        <div className="absolute inset-0 blur-3xl rounded-full bg-primary/30" />
        <div className="relative flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-glow">
          <MessageCircle className="h-14 w-14" strokeWidth={1.5} />
        </div>
      </div>
      <div className="max-w-md space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">CRM Perseidas</h2>
        <p className="text-sm text-muted-foreground">
          Selecione uma conversa à esquerda para começar a atender, ou aguarde uma mensagem entrar pela fila.
        </p>
      </div>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Lock className="h-3 w-3" />
        Mensagens criptografadas pela Evolution + Lovable Cloud
      </div>
    </div>
  );
}
