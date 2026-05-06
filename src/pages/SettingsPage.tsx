import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Settings, Lock, ArrowLeft, Upload, KeyRound, Store, Trash2, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSecurityPin } from "@/hooks/useSecurityPinEnabled";
import { useTenant } from "@/contexts/TenantContext";

function useUpsertSetting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { data: existing } = await supabase
        .from("restaurant_settings")
        .select("key")
        .eq("key", key)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase.from("restaurant_settings").update({ value }).eq("key", key);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("restaurant_settings").insert({ key, value });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["restaurant_setting"] });
      queryClient.invalidateQueries({ queryKey: ["security_pin"] });
    },
  });
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { tenant, reload: reloadTenant } = useTenant();
  const { pin: ADMIN_PIN, pinEnabled, loading: pinLoading } = useSecurityPin();
  const [unlocked, setUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState("");
  useEffect(() => {
    if (!pinLoading && !pinEnabled) setUnlocked(true);
  }, [pinEnabled, pinLoading]);

  const upsert = useUpsertSetting();

  // Establishment info
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  useEffect(() => {
    if (tenant?.nome_comercio) setName(tenant.nome_comercio);
  }, [tenant?.nome_comercio]);

  // Contato (impressão de recibos)
  const { data: contactSettings } = useQuery({
    queryKey: ["restaurant_setting", "contact"],
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurant_settings")
        .select("key, value")
        .in("key", ["business_phone", "business_address"]);
      const map: Record<string, string> = {};
      for (const s of data || []) map[s.key] = s.value;
      return map;
    },
  });
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [savingContact, setSavingContact] = useState(false);
  useEffect(() => {
    if (contactSettings) {
      setPhone(contactSettings.business_phone || "");
      setAddress(contactSettings.business_address || "");
    }
  }, [contactSettings]);

  // Logo
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // PIN management
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [savingPin, setSavingPin] = useState(false);
  const [removingPin, setRemovingPin] = useState(false);

  const handleSaveContact = async () => {
    setSavingContact(true);
    try {
      await upsert.mutateAsync({ key: "business_phone", value: phone.trim() });
      await upsert.mutateAsync({ key: "business_address", value: address.trim() });
      toast.success("Dados de contato salvos!");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingContact(false);
    }
  };

  // ── Mutations ──
  const handleSaveName = async () => {
    if (!tenant?.id) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Nome não pode ficar vazio");
      return;
    }
    setSavingName(true);
    try {
      const { error } = await supabase
        .from("tenants")
        .update({ nome_comercio: trimmed })
        .eq("id", tenant.id);
      if (error) throw error;
      toast.success("Nome atualizado!");
      await reloadTenant();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingName(false);
    }
  };

  const handleUploadLogo = async (file: File) => {
    if (!tenant?.id || !tenant.slug) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx. 5MB)");
      return;
    }
    setUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `tenants/${tenant.slug}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("product-images")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
      const url = pub.publicUrl;
      const { error: updErr } = await supabase
        .from("tenants")
        .update({ logo_url: url })
        .eq("id", tenant.id);
      if (updErr) throw updErr;
      toast.success("Logo atualizada!");
      await reloadTenant();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveLogo = async () => {
    if (!tenant?.id) return;
    if (!confirm("Remover a logo do estabelecimento?")) return;
    try {
      const { error } = await supabase.from("tenants").update({ logo_url: null }).eq("id", tenant.id);
      if (error) throw error;
      toast.success("Logo removida");
      await reloadTenant();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleSavePin = async () => {
    if (!/^\d{4}$/.test(newPin)) {
      toast.error("O PIN deve ter exatamente 4 dígitos");
      return;
    }
    if (newPin !== confirmPin) {
      toast.error("Os PINs não conferem");
      return;
    }
    setSavingPin(true);
    try {
      await upsert.mutateAsync({ key: "security_pin", value: newPin });
      toast.success("PIN de segurança definido!");
      setNewPin("");
      setConfirmPin("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSavingPin(false);
    }
  };

  const handleRemovePin = async () => {
    if (!confirm("Remover o PIN? As áreas sensíveis ficarão desbloqueadas.")) return;
    setRemovingPin(true);
    try {
      await upsert.mutateAsync({ key: "security_pin", value: "" });
      toast.success("PIN removido. Áreas sensíveis desbloqueadas.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRemovingPin(false);
    }
  };

  // ── PIN gate ──
  if (!unlocked) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6">
        <Lock className="h-8 w-8 text-muted-foreground" />
        <h2 className="font-semibold text-lg">Área Restrita</h2>
        <p className="text-sm text-muted-foreground">Digite o PIN de administrador</p>
        <input
          type="password"
          autoFocus
          inputMode="numeric"
          maxLength={4}
          value={pinInput}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, "");
            setPinInput(val);
            if (ADMIN_PIN && val === ADMIN_PIN) setUnlocked(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (ADMIN_PIN && pinInput === ADMIN_PIN) setUnlocked(true);
              else { setPinInput(""); toast.error("PIN incorreto!"); }
            }
          }}
          className="w-40 text-center text-2xl tracking-[0.5em] rounded-md border bg-background px-3 py-2.5 outline-none focus:ring-2 focus:ring-ring"
          placeholder="••••"
        />
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mt-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-2xl mx-auto h-full overflow-auto">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Configurações</h1>
      </div>

      {/* Estabelecimento */}
      <section className="rounded-xl border bg-card p-5 space-y-5">
        <div className="flex items-center gap-2">
          <Store className="h-5 w-5 text-accent" />
          <h2 className="font-semibold text-lg">Estabelecimento</h2>
        </div>

        {/* Logo */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Logo</label>
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-lg border bg-secondary/50 flex items-center justify-center overflow-hidden">
              {tenant?.logo_url ? (
                <img src={tenant.logo_url} alt="Logo" className="h-full w-full object-contain" />
              ) : (
                <Store className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUploadLogo(f);
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingLogo}
                className="flex items-center gap-2 rounded-md bg-accent text-accent-foreground px-3 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {tenant?.logo_url ? "Alterar logo" : "Enviar logo"}
              </button>
              {tenant?.logo_url && (
                <button
                  onClick={handleRemoveLogo}
                  className="flex items-center gap-1.5 text-xs text-destructive hover:underline"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remover logo
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">PNG, JPG, WebP ou SVG. Máx. 5MB.</p>
        </div>

        {/* Nome */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Nome do estabelecimento</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="Ex.: Espetinho do Marcelo"
            />
            <button
              onClick={handleSaveName}
              disabled={savingName || name.trim() === (tenant?.nome_comercio || "").trim()}
              className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60 transition-opacity"
            >
              {savingName ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>

        {/* Contato (impressão) */}
        <div className="space-y-3 pt-2 border-t">
          <div>
            <label className="text-sm font-medium">Telefone</label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ex.: (37) 99182-1347"
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-[11px] text-muted-foreground mt-1">Aparece no topo do recibo impresso.</p>
          </div>
          <div>
            <label className="text-sm font-medium">Endereço (opcional)</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Rua, número — Cidade/UF"
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            onClick={handleSaveContact}
            disabled={savingContact}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60 transition-opacity"
          >
            {savingContact ? "Salvando..." : "Salvar contato"}
          </button>
        </div>
      </section>

      {/* PIN de Segurança */}
      <section className="rounded-xl border bg-card p-5 space-y-5">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-accent" />
          <h2 className="font-semibold text-lg">PIN de Segurança</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Protege as telas de <span className="font-medium text-foreground">Faturamento</span>,{" "}
          <span className="font-medium text-foreground">Vendas</span>,{" "}
          <span className="font-medium text-foreground">Impressoras</span>,{" "}
          <span className="font-medium text-foreground">Usuários</span> e{" "}
          <span className="font-medium text-foreground">Configurações</span>.
          Por padrão, todas as áreas ficam desbloqueadas.
        </p>

        <div className="rounded-md bg-secondary/40 px-3 py-2 text-sm flex items-center gap-2">
          <Lock className="h-4 w-4" />
          Status:{" "}
          <span className={pinEnabled ? "font-semibold text-accent" : "font-semibold text-muted-foreground"}>
            {pinEnabled ? "PIN ativo (áreas protegidas)" : "Sem PIN — áreas desbloqueadas"}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Novo PIN (4 dígitos)</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
              className="w-full text-center text-xl tracking-[0.5em] rounded-md border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
              placeholder="••••"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Confirmar PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
              className="w-full text-center text-xl tracking-[0.5em] rounded-md border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
              placeholder="••••"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleSavePin}
            disabled={savingPin || newPin.length !== 4 || confirmPin.length !== 4}
            className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60 transition-opacity"
          >
            {savingPin ? "Salvando..." : pinEnabled ? "Alterar PIN" : "Definir PIN"}
          </button>
          {pinEnabled && (
            <button
              onClick={handleRemovePin}
              disabled={removingPin}
              className="flex items-center gap-1.5 rounded-md border border-destructive/40 text-destructive px-4 py-2 text-sm font-medium hover:bg-destructive/10 disabled:opacity-60 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              {removingPin ? "Removendo..." : "Remover PIN"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
