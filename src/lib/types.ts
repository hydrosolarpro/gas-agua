export type Role = "cliente" | "dueno" | "repartidor";
/** Rol efectivo en la app: el administrador se identifica con `profiles.is_admin`. */
export type AppRole = Role | "admin";
export type OrderStatus = "pendiente" | "aceptado" | "en_camino" | "entregado" | "cancelado";
export type PaymentMethod = "yape" | "plin" | "efectivo" | "otro";
export type PaymentStatus = "pendiente" | "reportado" | "validado" | "rechazado";
export type Category = "gas" | "agua" | "otro";

export type Profile = {
  id: string;
  full_name: string;
  phone: string | null;
  role: Role;
  is_admin: boolean;
  onboarded: boolean;
  has_pin: boolean;
  address_text: string | null;
  reference: string | null;
  lat: number | null;
  lng: number | null;
  last_business_id: string | null;
};

export type PlatformSettings = {
  admin_name: string | null;
  admin_email: string | null;
  admin_phone: string | null;
  account_holder: string | null;
  bank_name: string | null;
  bank_account: string | null;
  bank_cci: string | null;
  yape_number: string | null;
  plin_number: string | null;
  monthly_fee: number;
};

export type SubscriptionMethod = "yape" | "plin" | "transferencia" | "deposito" | "efectivo" | "otro";

export type SubscriptionPayment = {
  id: string;
  business_id: string;
  amount: number;
  period: string;
  method: SubscriptionMethod;
  operation_code: string | null;
  proof_path: string | null;
  status: "pendiente" | "validado" | "rechazado";
  reported_at: string;
  paid_at: string;
  valid_from: string | null;
  valid_to: string | null;
  validated_at: string | null;
};

export type Business = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  fee_override?: number | null;
  created_at: string;
  phone: string | null;
  yape_number: string | null;
  plin_number: string | null;
  other_pay_name?: string | null;
  other_pay_value?: string | null;
  payment_holder: string | null;
  address_text: string | null;
  lat: number | null;
  lng: number | null;
  active: boolean;
  /** Logo público del negocio (bucket `logos`). */
  /** Cuándo el dueño se dio de baja (el negocio queda inactivo). */
  deactivated_at?: string | null;
  logo_url?: string | null;
  /** Horario de atención por día: { lun: { abre: "08:00", cierra: "20:00" }, … }. Un día ausente = cerrado. */
  opening_hours?: import("./hours").OpeningHours | null;
};

export type Product = {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  category: Category;
  price: number;
  active: boolean;
  sort_order: number;
  /** null = no se controla el stock */
  stock: number | null;
};

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  name: string;
  category: Category;
  unit_price: number;
  quantity: number;
  subtotal: number;
};

export type Order = {
  id: string;
  code: string;
  business_id: string;
  customer_id: string;
  driver_id: string | null;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  total: number;
  cash_amount: number | null;
  amount_received: number | null;
  operation_code: string | null;
  customer_name: string;
  customer_phone: string | null;
  address_text: string;
  reference: string | null;
  lat: number;
  lng: number;
  notes: string | null;
  cancel_reason: string | null;
  created_at: string;
  accepted_at: string | null;
  picked_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  payment_reported_at: string | null;
  eta_at: string | null;
  eta_minutes: number | null;
  eta_source: "ruta" | "local" | "referencial" | null;
  arrived_at: string | null;
  payment_validated_at: string | null;
  order_items?: OrderItem[];
  /** Solo lo ve el dueño del negocio (tabla privada order_finance). */
  order_finance?: OrderFinance | OrderFinance[] | null;
  /** Lo ven el dueño y el repartidor de ese pedido (tabla order_driver_pay). */
  order_driver_pay?: OrderDriverPay | OrderDriverPay[] | null;
};

export type OrderFinance = { cost_total: number; gross_profit: number | null; net_profit: number | null };
export type OrderDriverPay = { driver_id: string; pay_type: string | null; pay_value: number | null; distance_km: number | null; amount: number | null };

export type DriverLocation = {
  driver_id: string;
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  accuracy: number | null;
  updated_at: string;
};

export type LatLng = { lat: number; lng: number };

export type OrderProof = {
  id: string;
  order_id: string;
  concept: "gas" | "agua" | "otro";
  method: "yape" | "plin" | "transferencia" | "otro";
  amount: number;
  operation_code: string | null;
  proof_path: string;
  extra_paths: string[];
  created_at: string;
};
