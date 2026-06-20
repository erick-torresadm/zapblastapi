import { useState, useMemo, useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MapPin, Search, Loader2, Download, Star, ExternalLink, Phone, Globe, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { searchMapsLeadsFn } from "@/lib/maps.functions";
import { formatPhone } from "@/lib/format-instance";

declare global {
  interface Window { google: any; initMapsTool?: () => void }
}

function brl(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const CATEGORIES: Array<{ label: string; value: string }> = [
  { label: "Restaurante", value: "restaurant" },
  { label: "Lanchonete / Café", value: "cafe" },
  { label: "Pizzaria", value: "pizza_restaurant" },
  { label: "Salão de Beleza", value: "beauty_salon" },
  { label: "Barbearia", value: "barber_shop" },
  { label: "Academia", value: "gym" },
  { label: "Clínica / Consultório", value: "doctor" },
  { label: "Dentista", value: "dental_clinic" },
  { label: "Mercado", value: "grocery_store" },
  { label: "Pet Shop", value: "pet_store" },
  { label: "Imobiliária", value: "real_estate_agency" },
  { label: "Advogado", value: "lawyer" },
  { label: "Contador", value: "accounting" },
  { label: "Hotel / Pousada", value: "lodging" },
  { label: "Loja de Roupas", value: "clothing_store" },
  { label: "Oficina Mecânica", value: "car_repair" },
];

export function MapsExtractorCard({
  flatPrice,
  waCheckPrice,
  maxLeads,
  balance,
  instances,
  onSuccess,
}: {
  flatPrice: number;
  waCheckPrice: number;
  maxLeads: number;
  balance: number;
  instances: any[];
  onSuccess: () => void;
}) {
  const run = useServerFn(searchMapsLeadsFn);
  const [mode, setMode] = useState<"text" | "nearby">("text");
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState<string>("");
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusKm, setRadiusKm] = useState(5);
  const [onlyWithPhone, setOnlyWithPhone] = useState(true);
  const [waCheck, setWaCheck] = useState(false);
  const [waInstance, setWaInstance] = useState<string>("");
  const [result, setResult] = useState<any | null>(null);

  const insufficient = balance < flatPrice;

  const mut = useMutation({
    mutationFn: () => run({
      data: {
        mode,
        query,
        city: city || undefined,
        category: mode === "nearby" ? category || undefined : undefined,
        lat: mode === "nearby" ? center?.lat : undefined,
        lng: mode === "nearby" ? center?.lng : undefined,
        radius_m: mode === "nearby" ? radiusKm * 1000 : undefined,
        only_with_phone: onlyWithPhone,
        whatsapp_check: waCheck,
        whatsapp_instance_id: waCheck ? waInstance || null : null,
      },
    }),
    onSuccess: (r) => {
      setResult(r);
      if (r.refunded) {
        toast.warning("Nenhum lead retornado — saldo reembolsado");
      } else {
        toast.success(`${r.total} leads encontrados • debitado ${brl(r.cost_cents)}`);
      }
      onSuccess();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function exportCsv() {
    if (!result) return;
    const rows: string[][] = [["nome", "telefone", "endereco", "website", "categoria", "rating", "avaliacoes", "tem_whatsapp", "maps_url"]];
    for (const l of result.leads) {
      rows.push([
        l.name,
        l.phone_intl ?? l.phone ?? "",
        l.address ?? "",
        l.website ?? "",
        l.category ?? "",
        l.rating?.toString() ?? "",
        l.reviews?.toString() ?? "0",
        l.has_whatsapp == null ? "" : l.has_whatsapp ? "sim" : "nao",
        l.maps_url ?? "",
      ]);
    }
    downloadCsv(`maps-leads-${Date.now()}.csv`, rows);
  }

  const phonesEst = result?.leads?.filter((l: any) => l.phone)?.length ?? 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" /> Extrator de leads do Google Maps
            </CardTitle>
            <CardDescription>
              Busque negócios reais no Google Maps. Devolve nome, telefone, endereço e site — pronto pra atacar.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="shrink-0">{brl(flatPrice)} / busca</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
          <TabsList>
            <TabsTrigger value="text">Busca rápida</TabsTrigger>
            <TabsTrigger value="nearby">Por mapa + raio</TabsTrigger>
          </TabsList>

          <TabsContent value="text" className="space-y-3 pt-3">
            <div className="grid gap-3 md:grid-cols-[1fr,200px]">
              <div className="space-y-1.5">
                <Label>O que você procura?</Label>
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Ex: pizzaria, dentista, academia..." />
              </div>
              <div className="space-y-1.5">
                <Label>Cidade (opcional)</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="São Paulo" />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="nearby" className="space-y-3 pt-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Termo de busca</Label>
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="restaurante japonês" />
              </div>
              <div className="space-y-1.5">
                <Label>Categoria (filtro fino)</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue placeholder="Qualquer categoria" /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <MapPicker center={center} radiusKm={radiusKm} onCenterChange={setCenter} />

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Raio: {radiusKm} km</Label>
                <span className="text-xs text-muted-foreground">1–50 km</span>
              </div>
              <Slider value={[radiusKm]} min={1} max={50} step={1} onValueChange={(v) => setRadiusKm(v[0])} />
            </div>
          </TabsContent>
        </Tabs>

        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label className="text-sm">Apenas leads com telefone</Label>
              <p className="text-xs text-muted-foreground">Descarta os que não têm contato — sem cobrar a mais</p>
            </div>
            <Switch checked={onlyWithPhone} onCheckedChange={setOnlyWithPhone} />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border/40 pt-2">
            <div>
              <Label className="text-sm">Validar WhatsApp na hora</Label>
              <p className="text-xs text-muted-foreground">
                + {brl(waCheckPrice)} por lead validado. Usa um chip seu.
              </p>
            </div>
            <Switch checked={waCheck} onCheckedChange={setWaCheck} />
          </div>
          {waCheck && (
            <div className="space-y-1.5 pt-1">
              <Label className="text-xs">Chip pra validar</Label>
              <Select value={waInstance} onValueChange={setWaInstance}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Escolha um chip conectado" /></SelectTrigger>
                <SelectContent>
                  {instances.map((i: any) => (
                    <SelectItem key={i.id} value={i.id}>
                      <span className="flex items-center gap-1.5">
                        <span className="font-medium">{i.instance_name}</span>
                        <span className="text-muted-foreground text-xs">{formatPhone(i.phone_number)}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
          <div>
            <strong className="text-foreground">{brl(flatPrice)} fixo por busca</strong>
            <p className="text-xs text-muted-foreground">Até {maxLeads} leads • Reembolso automático se vier 0</p>
          </div>
          <span className={insufficient ? "font-semibold text-destructive" : "text-muted-foreground"}>
            Saldo: {brl(balance)}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => mut.mutate()}
            disabled={
              !query.trim() ||
              mut.isPending ||
              insufficient ||
              (mode === "nearby" && !center) ||
              (waCheck && !waInstance)
            }
          >
            {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Buscar leads
          </Button>
          {insufficient && (
            <Link to="/app/wallet"><Button variant="outline">Adicionar saldo</Button></Link>
          )}
        </div>

        {result && result.leads.length > 0 && (
          <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">{result.total} leads encontrados</div>
                <div className="text-xs text-muted-foreground">
                  {phonesEst} com telefone
                  {result.whatsapp_valid_count > 0 && ` • ${result.whatsapp_valid_count} com WhatsApp ativo`}
                </div>
              </div>
              <Button onClick={exportCsv} variant="outline" size="sm">
                <Download className="mr-2 h-4 w-4" /> CSV
              </Button>
            </div>
            <div className="max-h-[400px] space-y-2 overflow-y-auto">
              {result.leads.slice(0, 50).map((l: any) => (
                <div key={l.place_id} className="flex items-start justify-between gap-2 rounded-md border border-border/40 bg-background p-3 text-xs">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{l.name}</span>
                      {l.rating && (
                        <span className="flex items-center gap-0.5 text-amber-500">
                          <Star className="h-3 w-3 fill-current" />
                          {l.rating} <span className="text-muted-foreground">({l.reviews})</span>
                        </span>
                      )}
                      {l.has_whatsapp === true && (
                        <Badge variant="secondary" className="bg-green-500/10 text-green-700 dark:text-green-400">WhatsApp ✓</Badge>
                      )}
                    </div>
                    {l.address && <div className="text-muted-foreground">{l.address}</div>}
                    <div className="flex flex-wrap items-center gap-3 pt-0.5">
                      {l.phone_intl && (
                        <span className="inline-flex items-center gap-1 font-mono">
                          <Phone className="h-3 w-3" /> {l.phone_intl}
                        </span>
                      )}
                      {l.website && (
                        <a href={l.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                          <Globe className="h-3 w-3" /> Site
                        </a>
                      )}
                      {l.maps_url && (
                        <a href={l.maps_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                          <ExternalLink className="h-3 w-3" /> Maps
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {result.leads.length > 50 && (
                <div className="py-2 text-center text-xs text-muted-foreground">+{result.leads.length - 50} no CSV</div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Interactive map picker
// ============================================================================

function MapPicker({
  center,
  radiusKm,
  onCenterChange,
}: {
  center: { lat: number; lng: number } | null;
  radiusKm: number;
  onCenterChange: (c: { lat: number; lng: number }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const [loaded, setLoaded] = useState(false);
  const apiKey = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;

  // Load script once
  useEffect(() => {
    if (!apiKey) return;
    if (window.google?.maps) {
      setLoaded(true);
      return;
    }
    if (document.getElementById("gmaps-script")) {
      const id = setInterval(() => {
        if (window.google?.maps) { setLoaded(true); clearInterval(id); }
      }, 200);
      return () => clearInterval(id);
    }
    (window as any).initMapsTool = () => setLoaded(true);
    const s = document.createElement("script");
    s.id = "gmaps-script";
    s.async = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&loading=async&callback=initMapsTool${channel ? `&channel=${channel}` : ""}`;
    document.head.appendChild(s);
  }, [apiKey, channel]);

  // Init map after load
  useEffect(() => {
    if (!loaded || !ref.current || mapRef.current) return;
    const g = window.google;
    const initial = center ?? { lat: -23.55052, lng: -46.633308 }; // SP default
    mapRef.current = new g.maps.Map(ref.current, {
      center: initial,
      zoom: 12,
      disableDefaultUI: true,
      zoomControl: true,
    });
    mapRef.current.addListener("click", (e: any) => {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      onCenterChange({ lat, lng });
    });
  }, [loaded, center, onCenterChange]);

  // Update marker + circle when center / radius changes
  useEffect(() => {
    if (!loaded || !mapRef.current || !center) return;
    const g = window.google;
    if (markerRef.current) markerRef.current.setMap(null);
    if (circleRef.current) circleRef.current.setMap(null);
    markerRef.current = new g.maps.Marker({ position: center, map: mapRef.current });
    circleRef.current = new g.maps.Circle({
      map: mapRef.current,
      center,
      radius: radiusKm * 1000,
      fillColor: "#3b82f6",
      fillOpacity: 0.15,
      strokeColor: "#3b82f6",
      strokeOpacity: 0.6,
      strokeWeight: 2,
    });
    mapRef.current.panTo(center);
    mapRef.current.fitBounds(circleRef.current.getBounds());
  }, [loaded, center, radiusKm]);

  if (!apiKey) {
    return (
      <div className="rounded-md border border-dashed border-warning/40 bg-warning/5 p-3 text-xs text-muted-foreground">
        Google Maps não configurado. Avise o suporte.
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        {center
          ? <>Centro: <code className="rounded bg-muted px-1">{center.lat.toFixed(4)}, {center.lng.toFixed(4)}</code></>
          : <span className="text-muted-foreground"><MessageCircle className="mr-1 inline h-3 w-3" />Clique no mapa pra definir o centro da busca</span>}
      </Label>
      <div ref={ref} className="h-64 w-full overflow-hidden rounded-md border border-border" />
    </div>
  );
}
