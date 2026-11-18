export type Role = "gestor" | "garcom" | "caixa" | "cozinha" | "bar";
export type Station = "cozinha" | "bar" | "direto";
export type Channel = "salao" | "balcao" | "retirada" | "delivery";
export type PaymentMethod = "pix" | "credito" | "debito" | "dinheiro";
export type ItemStatus = "rascunho" | "enviado" | "preparo" | "pronto" | "entregue" | "cancelado";
export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  timezone: string;
  serviceRateBps: number;
  reservationMinutes: number;
  deliveryFeeCents: number;
  address: string;
  phone: string;
  createdAt: string;
}
export interface Actor {
  userId: string;
  memberId: string;
  restaurantId: string;
  name: string;
  role: Role;
}
export interface Profile {
  id: string;
  name: string;
  email: string;
  image: string | null;
}
export interface TeamMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
}
export interface DiningTable {
  id: string;
  number: number;
  capacity: number;
  sector: string;
  active: boolean;
}
export interface Occupancy {
  id: string;
  tableId: string;
  visitId: string;
  openedAt: string;
  releasedAt: string | null;
}
export interface Visit {
  id: string;
  label: string;
  channel: Channel;
  people: number;
  groupId: string | null;
  openedAt: string;
  closedAt: string | null;
  createdBy: string;
  customerName: string;
  phone: string;
  address: string;
  deliveryStatus: "aguardando" | "despachado" | "entregue";
  deliveryFeeCents: number;
}
export interface TableGroup {
  id: string;
  label: string;
  mode: "unica" | "separadas";
  createdAt: string;
  closedAt: string | null;
}
export interface Tab {
  id: string;
  visitId: string;
  label: string;
  status: "aberta" | "fechada";
  serviceRateBps: number;
  discountCents: number;
  extraCents: number;
  openedAt: string;
  closedAt: string | null;
}
export interface Category {
  id: string;
  name: string;
  active: boolean;
}
export interface RecipeLine {
  stockItemId: string;
  quantityMilli: number;
}
export interface ProductOption {
  id: string;
  name: string;
  priceCents: number;
  recipe: RecipeLine[];
}
export interface Product {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  priceCents: number;
  station: Station;
  active: boolean;
  imageUrl: string | null;
  tag: string;
  recipe: RecipeLine[];
  options: ProductOption[];
  recipeVersion: number;
}
export interface StockItem {
  id: string;
  name: string;
  unit: "g" | "ml" | "un";
  quantityMilli: number;
  reservedMilli: number;
  minimumMilli: number;
  averageCostMicros: number;
  active: boolean;
}
export interface StockSnapshot extends RecipeLine {
  unitCostMicros: number;
}
export interface Order {
  id: string;
  visitId: string;
  createdAt: string;
  createdBy: string;
}
export interface OrderItem {
  id: string;
  orderId: string | null;
  tabId: string;
  productId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  status: ItemStatus;
  station: Station;
  notes: string;
  options: string[];
  optionLabels?: string[];
  recipe: StockSnapshot[];
  recipeVersion: number;
  createdAt: string;
  sentAt: string | null;
  startedAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  costCents: number;
  startedQuantity?: number;
  readyQuantity?: number;
  deliveredQuantity?: number;
}
export interface StockMovement {
  id: string;
  stockItemId: string;
  itemId: string | null;
  kind: "entrada" | "reserva" | "liberacao" | "consumo" | "perda" | "ajuste";
  quantityMilli: number;
  costCents: number;
  reason: string;
  createdAt: string;
  createdBy: string;
}
export interface PaymentAllocation {
  tabId: string;
  amountCents: number;
  itemId?: string;
}
export interface Payment {
  id: string;
  cashSessionId: string;
  method: PaymentMethod;
  amountCents: number;
  tenderedCents: number;
  changeCents: number;
  allocations: PaymentAllocation[];
  createdAt: string;
  createdBy: string;
  reference: string;
}
export interface Refund {
  id: string;
  paymentId: string;
  cashSessionId: string;
  amountCents: number;
  allocations: PaymentAllocation[];
  reason: string;
  createdAt: string;
  createdBy: string;
}
export interface CashSession {
  id: string;
  label: string;
  openedBy: string;
  openedAt: string;
  closedAt: string | null;
  openingCents: number;
  countedCents: number | null;
  differenceCents: number | null;
  closeReason: string;
}
export interface CashMovement {
  id: string;
  cashSessionId: string;
  kind: "suprimento" | "sangria";
  amountCents: number;
  reason: string;
  createdAt: string;
  createdBy: string;
}
export interface Reservation {
  id: string;
  customerName: string;
  phone: string;
  people: number;
  tableIds: string[];
  startsAt: string;
  endsAt: string;
  notes: string;
  status: "confirmada" | "chegou" | "cancelada" | "ausente";
  visitId: string | null;
}
export interface WaitEntry {
  id: string;
  customerName: string;
  phone: string;
  people: number;
  createdAt: string;
  status: "aguardando" | "chamado" | "atendido" | "cancelado";
  visitId: string | null;
}
export interface ServiceCall {
  id: string;
  visitId: string | null;
  destination: "cozinha" | "bar" | "salao";
  message: string;
  status: "aberto" | "atendido" | "concluido";
  createdAt: string;
  createdBy: string;
  kind?: "cancelamento";
  itemId?: string;
  quantity?: number;
  actorName?: string;
}
export interface AuditEvent {
  id: string;
  action: string;
  entityId: string | null;
  detail: string;
  createdAt: string;
  createdBy: string;
  actorName: string;
}
export interface Supplier {
  id: string;
  name: string;
  phone: string;
  active: boolean;
}
export interface RestaurantState {
  restaurant: Restaurant;
  tables: DiningTable[];
  occupancies: Occupancy[];
  visits: Visit[];
  groups: TableGroup[];
  tabs: Tab[];
  categories: Category[];
  products: Product[];
  stockItems: StockItem[];
  orders: Order[];
  items: OrderItem[];
  stockMovements: StockMovement[];
  payments: Payment[];
  refunds: Refund[];
  cashSessions: CashSession[];
  cashMovements: CashMovement[];
  reservations: Reservation[];
  waitlist: WaitEntry[];
  calls: ServiceCall[];
  audits: AuditEvent[];
  suppliers: Supplier[];
}
export interface AppSnapshot extends RestaurantState {
  actor: Actor;
  profile: Profile;
  team: TeamMember[];
  version: number;
}
export interface Command {
  action: string;
  payload: Record<string, unknown>;
  operationId: string;
  expectedVersion?: number;
}
export interface CommandContext {
  actor: Actor;
  now: string;
  id: () => string;
}
export interface CommandResult {
  entityId?: string;
  message: string;
}
export interface TabTotals {
  subtotalCents: number;
  serviceCents: number;
  discountCents: number;
  extraCents: number;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
}
