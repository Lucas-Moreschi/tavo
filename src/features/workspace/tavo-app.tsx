"use client";

import type { Editor, ViewProps } from "@/shared/types/operation";
import { useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  ChefHat,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  Package,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Truck,
  Users,
  Utensils,
  Wallet,
  WifiOff,
  X,
} from "lucide-react";
import { Brand } from "@/shared/ui/brand";
import { FormModal } from "@/shared/ui/dialog";
import { useOperation } from "@/shared/hooks/use-operation";
import { roleNames } from "@/shared/lib/operation-utils";
import { Overview } from "@/features/workspace/overview";
import { OperationGuide } from "@/features/workspace/operation-guide";
import { TablesView } from "@/features/service/tables";
import { TabsView } from "@/features/service/tabs";
import { CatalogView } from "@/features/catalog/catalog";
import { StockView } from "@/features/inventory/stock";
import { ReservationsView } from "@/features/service/reservations";
import { ChannelsView } from "@/features/service/channels";
import { TeamView } from "@/features/team/team";
import { SettingsView } from "@/features/settings/settings";
import { ProfileView } from "@/features/settings/profile";
import { ProductionView } from "@/features/production/production";
import { CashView } from "@/features/finance/cash";
import { CallsView } from "@/features/service/calls";
import { ReportsView } from "@/features/finance/reports";
import { VisitDetail } from "@/features/service/visit-detail";

const navigation = [
  {
    id: "inicio",
    label: "Visão geral",
    icon: LayoutDashboard,
    section: "OPERAÇÃO",
    roles: ["gestor", "garcom", "caixa"],
  },
  { id: "mesas", label: "Mesas e salão", icon: Utensils, roles: ["gestor", "garcom", "caixa"] },
  { id: "comandas", label: "Comandas", icon: ClipboardList, roles: ["gestor", "garcom", "caixa"] },
  {
    id: "producao",
    label: "Cozinha e bar",
    icon: ChefHat,
    roles: ["gestor", "garcom", "cozinha", "bar"],
  },
  { id: "caixa", label: "Caixa", icon: Wallet, roles: ["gestor", "caixa"] },
  {
    id: "reservas",
    label: "Reservas e fila",
    icon: CalendarDays,
    roles: ["gestor", "garcom", "caixa"],
  },
  { id: "canais", label: "Balcão e delivery", icon: Truck, roles: ["gestor", "garcom", "caixa"] },
  { id: "cardapio", label: "Cardápio", icon: Utensils, section: "GESTÃO", roles: ["gestor"] },
  { id: "estoque", label: "Estoque", icon: Package, roles: ["gestor"] },
  { id: "equipe", label: "Equipe", icon: Users, roles: ["gestor"] },
  { id: "relatorios", label: "Relatórios", icon: ChartNoAxesCombined, roles: ["gestor", "caixa"] },
  { id: "configuracoes", label: "Configurações", icon: Settings2, roles: ["gestor"] },
];

export function TavoApp() {
  const operation = useOperation();
  const { snapshot, loading, offline, busy, error, notice } = operation;
  const [view, setView] = useState("inicio");
  const [visitId, setVisitId] = useState<string | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setView(params.get("view") || "inicio");
    setVisitId(params.get("visit"));
  }, []);
  function navigate(next: string) {
    setView(next);
    setVisitId(null);
    setMobileMenu(false);
    window.history.replaceState(null, "", `/?view=${next}`);
    window.scrollTo({ top: 0 });
  }
  function inspect(id: string) {
    setVisitId(id);
    window.history.replaceState(null, "", `/?view=${view}&visit=${id}`);
    window.scrollTo({ top: 0 });
  }
  function run(action: () => Promise<unknown>) {
    void action().catch((cause) =>
      operation.setNotice(cause instanceof Error ? cause.message : "Não foi possível concluir."),
    );
  }
  async function logout() {
    await fetch("/api/auth/sign-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    for (const key of Object.keys(sessionStorage).filter((key) => key.startsWith("tavo:pending:")))
      sessionStorage.removeItem(key);
    window.location.assign("/login");
  }
  if (loading || !snapshot)
    return (
      <main className="app-loading">
        <Brand />
        <div className="loading-orbit">
          <LoaderCircle size={32} className="spin" />
        </div>
        <h1>{error ? "Vamos reconectar?" : "Preparando sua operação"}</h1>
        <p className="muted">{error || "Mesas, pedidos e equipe. Tudo no mesmo lugar."}</p>
        {error && (
          <button className="btn btn-primary" onClick={() => void operation.refresh()}>
            <RefreshCw size={16} />
            Tentar novamente
          </button>
        )}
      </main>
    );
  const allowed = navigation.filter((item) => item.roles.includes(snapshot.actor.role));
  const safeView =
    allowed.some((item) => item.id === view) || ["perfil", "chamados"].includes(view)
      ? view
      : allowed[0]?.id || "perfil";
  const active = navigation.find((item) => item.id === safeView);
  const ready = snapshot.items.filter(
    (item) =>
      item.status !== "cancelado" &&
      (item.readyQuantity ?? (item.status === "pronto" ? item.quantity : 0)) >
        (item.deliveredQuantity ?? 0),
  ).length;
  const notificationCount =
    ready + snapshot.calls.filter((call) => call.status !== "concluido").length;
  const currentCash = snapshot.cashSessions.find((session) => !session.closedAt);
  const props: ViewProps = {
    state: snapshot,
    disabled: offline || busy,
    command: operation.command,
    account: operation.account,
    edit: setEditor,
    run,
    inspect,
    navigate,
  };
  const panels: Record<string, React.ReactNode> = {
    inicio: <Overview {...props} />,
    mesas: <TablesView {...props} />,
    comandas: <TabsView {...props} />,
    cardapio: <CatalogView {...props} />,
    estoque: <StockView {...props} />,
    reservas: <ReservationsView {...props} />,
    canais: <ChannelsView {...props} />,
    equipe: <TeamView {...props} />,
    relatorios: <ReportsView {...props} />,
    configuracoes: <SettingsView {...props} />,
    perfil: <ProfileView {...props} />,
    producao: <ProductionView {...props} />,
    caixa: <CashView {...props} />,
    chamados: <CallsView {...props} />,
  };
  return (
    <div className="application">
      <a className="skip-link" href="#main-content">
        Pular para o conteúdo
      </a>
      <aside id="main-sidebar" className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-btn mobile-only"
            aria-label="Fechar menu"
            onClick={() => setMobileMenu(false)}
          >
            <X size={20} />
          </button>
        </div>
        <button
          className="restaurant-switch"
          onClick={() => window.location.assign("/restaurantes")}
        >
          <span className="restaurant-mark">{snapshot.restaurant.name.slice(0, 1)}</span>
          <span>
            <strong>{snapshot.restaurant.name}</strong>
            <small>Seu espaço de trabalho</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <nav className="side-nav" aria-label="Navegação principal">
          {allowed.map((item, index) => (
            <div key={item.id}>
              {(index === 0 || item.section) && (
                <p className="nav-section">{item.section || "OPERAÇÃO"}</p>
              )}
              <button
                className={`side-link ${safeView === item.id ? "active" : ""}`}
                onClick={() => navigate(item.id)}
                aria-current={safeView === item.id ? "page" : undefined}
              >
                <item.icon size={18} />
                <span>{item.label}</span>
                {item.id === "producao" && ready > 0 && <span className="nav-count">{ready}</span>}
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-status">
            <span className={`status-dot ${offline ? "dot-red" : "dot-green"}`} />
            {offline ? "Sem conexão" : "Operação conectada"}
            <ShieldCheck size={14} />
          </div>
          <button className="profile-button" onClick={() => navigate("perfil")}>
            <span className="avatar">
              {snapshot.profile.name
                .split(" ")
                .map((part) => part[0])
                .slice(0, 2)
                .join("")}
            </span>
            <span>
              <strong>{snapshot.profile.name}</strong>
              <small>{roleNames[snapshot.actor.role]}</small>
            </span>
            <ChevronRight size={16} />
          </button>
        </div>
      </aside>
      {mobileMenu && (
        <button
          className="sidebar-backdrop"
          onClick={() => setMobileMenu(false)}
          aria-label="Fechar menu"
        />
      )}
      <div className="app-body">
        <header className="app-header">
          <div className="header-path">
            <button
              className="icon-btn mobile-only"
              onClick={() => setMobileMenu(true)}
              aria-label="Abrir menu"
              aria-expanded={mobileMenu}
              aria-controls="main-sidebar"
            >
              <Menu size={22} />
            </button>
            <span className="desktop-only">Workspace</span>
            <ChevronRight size={14} className="desktop-only" />
            <strong>
              {visitId
                ? "Detalhe do atendimento"
                : active?.label || (safeView === "perfil" ? "Meu perfil" : "Central de chamados")}
            </strong>
          </div>
          <div className="header-actions">
            <span className="header-date">
              {new Date().toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                timeZone: snapshot.restaurant.timezone,
              })}
            </span>
            <span className={`cash-status ${currentCash ? "" : "cash-closed"}`}>
              <span className="status-dot" />
              {currentCash ? "Caixa aberto" : "Caixa fechado"}
            </span>
            <button
              className="btn btn-secondary btn-small header-help"
              aria-haspopup="dialog"
              onClick={() => setGuideOpen(true)}
            >
              <CircleHelp size={16} aria-hidden />
              Ajuda
            </button>
            <button
              className="icon-btn notification-button"
              title="Pedidos prontos e chamados"
              aria-label={`${notificationCount} avisos. Abrir central de chamados`}
              onClick={() => navigate("chamados")}
            >
              <Bell size={19} />
              {notificationCount > 0 && <span>{notificationCount}</span>}
            </button>
            <button
              className="header-avatar"
              onClick={() => navigate("perfil")}
              aria-label="Abrir perfil"
            >
              {snapshot.profile.name[0]}
            </button>
          </div>
        </header>
        {offline && (
          <div className="connection-banner" role="alert">
            <WifiOff size={17} />
            <span>Você está sem conexão. As alterações estão bloqueadas até reconectar.</span>
            <button onClick={() => void operation.refresh()}>Reconectar</button>
          </div>
        )}
        {error && !offline && (
          <div className="connection-banner" role="alert">
            <Activity size={17} />
            <span>{error}</span>
            <button onClick={() => void operation.refresh()}>Atualizar</button>
          </div>
        )}
        <main className="main-content" id="main-content" tabIndex={-1} key={visitId || safeView}>
          {snapshot.team.find((member) => member.id === snapshot.actor.memberId)
            ?.mustChangePassword &&
            safeView !== "perfil" && (
              <div className="notice-banner">
                <ShieldCheck size={18} />
                <span>Sua senha é temporária. Atualize-a para proteger seu acesso.</span>
                <button className="text-button" onClick={() => navigate("perfil")}>
                  Trocar senha <ArrowUpRight size={14} />
                </button>
              </div>
            )}
          {visitId ? (
            <VisitDetail
              {...props}
              visitId={visitId}
              onBack={() => {
                setVisitId(null);
                window.history.replaceState(null, "", `/?view=${view}`);
              }}
            />
          ) : (
            panels[safeView]
          )}
        </main>
        <footer className="app-footer">
          <span>TAVO · Gestão inteligente</span>
          <span>Seu restaurante, em sintonia.</span>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="Atalhos">
        {allowed.slice(0, 4).map((item) => (
          <button
            key={item.id}
            className={safeView === item.id ? "active" : ""}
            aria-current={safeView === item.id ? "page" : undefined}
            onClick={() => navigate(item.id)}
          >
            <item.icon size={20} />
            <span>
              {item.id === "inicio"
                ? "Início"
                : item.id === "mesas"
                  ? "Mesas"
                  : item.id === "producao"
                    ? "Produção"
                    : item.label}
            </span>
          </button>
        ))}
        <button
          aria-expanded={mobileMenu}
          aria-controls="main-sidebar"
          onClick={() => setMobileMenu(true)}
        >
          <Menu size={20} />
          <span>Mais</span>
        </button>
      </nav>
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button aria-label="Dispensar mensagem" onClick={() => operation.setNotice("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {guideOpen && (
        <OperationGuide state={snapshot} navigate={navigate} onClose={() => setGuideOpen(false)} />
      )}
      {editor && <FormModal {...editor} onSubmit={editor.submit} onClose={() => setEditor(null)} />}
    </div>
  );
}
