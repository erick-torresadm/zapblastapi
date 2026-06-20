import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Trash2, Plus, Ticket, Copy, Calendar as CalendarIcon } from "lucide-react";
import {
  adminListCouponsFn, adminCreateCouponFn, adminUpdateCouponFn,
  adminDeleteCouponFn, adminListRedemptionsFn, adminListPlansFn,
} from "@/lib/coupons.functions";

export const Route = createFileRoute("/_authenticated/_admin/app/admin/coupons")({
  component: CouponsAdminPage,
});

type CouponType = "percent" | "fixed" | "free" | "tool_credits";

function CouponsAdminPage() {
  const list = useServerFn(adminListCouponsFn);
  const listPlans = useServerFn(adminListPlansFn);
  const listRedemptions = useServerFn(adminListRedemptionsFn);

  const couponsQ = useQuery({ queryKey: ["admin-coupons"], queryFn: () => list() });
  const plansQ = useQuery({ queryKey: ["admin-plans"], queryFn: () => listPlans() });
  const redemptionsQ = useQuery({ queryKey: ["admin-redemptions"], queryFn: () => listRedemptions({ data: { coupon_id: undefined } }) });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Ticket className="h-6 w-6" /> Cupons de desconto
          </h1>
          <p className="text-muted-foreground">Crie cupons em %, valor fixo ou totalmente gratuitos.</p>
        </div>
        <NewCouponDialog plans={plansQ.data ?? []} />
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Cupons</TabsTrigger>
          <TabsTrigger value="history">Resgates</TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          <Card>
            <CardHeader>
              <CardTitle>Todos os cupons</CardTitle>
              <CardDescription>{couponsQ.data?.length ?? 0} cupons cadastrados</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Validade</TableHead>
                    <TableHead>Usos</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(couponsQ.data ?? []).map((c: any) => (
                    <CouponRow key={c.id} c={c} />
                  ))}
                  {!couponsQ.data?.length && (
                    <TableRow>
                      <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                        Nenhum cupom criado ainda.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Resgates recentes</CardTitle>
              <CardDescription>Últimos 200 resgates</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Cupom</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Desconto</TableHead>
                    <TableHead>Valor final</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(redemptionsQ.data ?? []).map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell>{new Date(r.created_at).toLocaleString("pt-BR")}</TableCell>
                      <TableCell><Badge variant="outline">{r.coupon?.code ?? "—"}</Badge></TableCell>
                      <TableCell>{r.plan?.name ?? "—"}</TableCell>
                      <TableCell>R$ {(r.discount_cents / 100).toFixed(2)}</TableCell>
                      <TableCell>R$ {(r.final_cents / 100).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                  {!redemptionsQ.data?.length && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        Nenhum resgate ainda.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CouponRow({ c }: { c: any }) {
  const qc = useQueryClient();
  const update = useServerFn(adminUpdateCouponFn);
  const remove = useServerFn(adminDeleteCouponFn);

  const toggle = async (active: boolean) => {
    await update({ data: { id: c.id, patch: { active } } });
    qc.invalidateQueries({ queryKey: ["admin-coupons"] });
  };
  const del = async () => {
    if (!confirm(`Excluir cupom ${c.code}?`)) return;
    await remove({ data: { id: c.id } });
    toast.success("Cupom excluído");
    qc.invalidateQueries({ queryKey: ["admin-coupons"] });
  };
  const copy = () => { navigator.clipboard.writeText(c.code); toast.success("Código copiado"); };

  const valueLabel = c.tool_scope && c.tool_free_uses > 0
    ? `${c.tool_free_uses} uso(s) em ${c.tool_scope}`
    : c.type === "percent"
      ? `${c.value}%`
      : c.type === "fixed"
        ? `R$ ${(Number(c.value) / 100).toFixed(2)}`
        : `${c.free_duration_days ?? 30} dias grátis`;

  const typeLabel = c.tool_scope && c.tool_free_uses > 0
    ? "Ferramenta"
    : c.type === "percent" ? "%" : c.type === "fixed" ? "R$" : "Grátis";

  return (
    <TableRow>
      <TableCell>
        <button onClick={copy} className="font-mono font-bold hover:underline inline-flex items-center gap-1">
          {c.code} <Copy className="h-3 w-3 opacity-50" />
        </button>
      </TableCell>
      <TableCell>
        <Badge variant={c.tool_scope ? "default" : c.type === "free" ? "default" : "secondary"}>
          {typeLabel}
        </Badge>
      </TableCell>
      <TableCell>{valueLabel}</TableCell>
      <TableCell>{c.plan?.name ?? <span className="text-muted-foreground">Qualquer</span>}</TableCell>
      <TableCell>{c.expires_at ? new Date(c.expires_at).toLocaleDateString("pt-BR") : "Sem validade"}</TableCell>
      <TableCell>{c.redemptions_count}{c.max_redemptions ? `/${c.max_redemptions}` : ""}</TableCell>
      <TableCell><Switch checked={c.active} onCheckedChange={toggle} /></TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="icon" onClick={del}><Trash2 className="h-4 w-4" /></Button>
      </TableCell>
    </TableRow>
  );
}

function NewCouponDialog({ plans }: { plans: any[] }) {
  const create = useServerFn(adminCreateCouponFn);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [type, setType] = useState<CouponType>("percent");
  const [value, setValue] = useState("10");
  const [planId, setPlanId] = useState<string>("any");
  const [freeDays, setFreeDays] = useState("30");
  const [expiresAt, setExpiresAt] = useState("");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [maxPerUser, setMaxPerUser] = useState("1");
  const [description, setDescription] = useState("");

  const submit = async () => {
    try {
      const valNum = Number(value);
      const finalValue = type === "fixed" ? Math.round(valNum * 100) : valNum;
      await create({
        data: {
          code: code.trim().toUpperCase(),
          description: description || null,
          type,
          value: finalValue,
          plan_id: planId === "any" ? null : planId,
          free_duration_days: type === "free" ? Number(freeDays) : null,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          max_redemptions: maxRedemptions ? Number(maxRedemptions) : null,
          max_per_user: Number(maxPerUser),
          active: true,
        },
      });
      toast.success("Cupom criado!");
      qc.invalidateQueries({ queryKey: ["admin-coupons"] });
      setOpen(false);
      setCode(""); setValue("10"); setDescription("");
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao criar cupom");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-2" /> Novo cupom</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Criar cupom</DialogTitle></DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Código</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="BLACKFRIDAY50" />
          </div>
          <div>
            <Label>Descrição (opcional)</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Promoção Black Friday" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={type} onValueChange={(v) => setType(v as CouponType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Porcentagem (%)</SelectItem>
                  <SelectItem value="fixed">Valor fixo (R$)</SelectItem>
                  <SelectItem value="free">Grátis (100%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {type !== "free" ? (
              <div>
                <Label>{type === "percent" ? "% desconto" : "R$ desconto"}</Label>
                <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} />
              </div>
            ) : (
              <div>
                <Label>Dias grátis</Label>
                <Input type="number" value={freeDays} onChange={(e) => setFreeDays(e.target.value)} />
              </div>
            )}
          </div>

          <div>
            <Label>Plano restrito (opcional)</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Qualquer plano</SelectItem>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Validade</Label>
              <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
            <div>
              <Label>Máx. total</Label>
              <Input type="number" value={maxRedemptions} onChange={(e) => setMaxRedemptions(e.target.value)} placeholder="∞" />
            </div>
            <div>
              <Label>Máx. por usuário</Label>
              <Input type="number" value={maxPerUser} onChange={(e) => setMaxPerUser(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={!code || !value}>Criar cupom</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
