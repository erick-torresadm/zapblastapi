import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShoppingCart } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/marketplace")({ component: MarketplacePage });

function MarketplacePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <Card className="rounded-3xl text-center">
        <CardHeader className="items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <ShoppingCart className="h-7 w-7 text-muted-foreground" />
          </div>
          <CardTitle>Marketplace em breve</CardTitle>
          <CardDescription>
            Estamos finalizando a integração com nossos fornecedores de chips BR. Em breve você poderá comprar direto pelo painel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/app/instances">Voltar para instâncias</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
