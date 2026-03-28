export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      cash_movements: {
        Row: {
          amount: number
          created_at: string
          created_by_name: string
          description: string
          id: string
          session_id: string
          type: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by_name?: string
          description?: string
          id?: string
          session_id: string
          type: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by_name?: string
          description?: string
          id?: string
          session_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cash_register_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_register_sessions: {
        Row: {
          closed_at: string | null
          closed_by_name: string | null
          closing_amount: number | null
          created_at: string
          id: string
          notes: string | null
          opened_at: string
          opened_by_name: string
          opening_amount: number
          status: string
        }
        Insert: {
          closed_at?: string | null
          closed_by_name?: string | null
          closing_amount?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by_name?: string
          opening_amount?: number
          status?: string
        }
        Update: {
          closed_at?: string | null
          closed_by_name?: string | null
          closing_amount?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by_name?: string
          opening_amount?: number
          status?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      comanda_locks: {
        Row: {
          id: string
          lock_expires_at: string
          locked_at: string
          locked_by_user_id: string
          locked_by_user_name: string
          table_id: string
        }
        Insert: {
          id?: string
          lock_expires_at?: string
          locked_at?: string
          locked_by_user_id: string
          locked_by_user_name?: string
          table_id: string
        }
        Update: {
          id?: string
          lock_expires_at?: string
          locked_at?: string
          locked_by_user_id?: string
          locked_by_user_name?: string
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comanda_locks_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: true
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      complement_groups: {
        Row: {
          created_at: string
          id: string
          max_select: number
          min_select: number
          name: string
          required: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_select?: number
          min_select?: number
          name: string
          required?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          max_select?: number
          min_select?: number
          name?: string
          required?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      complements: {
        Row: {
          active: boolean
          created_at: string
          group_id: string
          id: string
          name: string
          price: number
          sort_order: number | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          group_id: string
          id?: string
          name: string
          price?: number
          sort_order?: number | null
        }
        Update: {
          active?: boolean
          created_at?: string
          group_id?: string
          id?: string
          name?: string
          price?: number
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "complements_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "complement_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      nfce_records: {
        Row: {
          chave_acesso: string | null
          created_at: string
          error_message: string | null
          id: string
          order_id: string
          raw_response: Json | null
          reference: string
          status: string
          updated_at: string
          url_danfe: string | null
        }
        Insert: {
          chave_acesso?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          order_id: string
          raw_response?: Json | null
          reference: string
          status?: string
          updated_at?: string
          url_danfe?: string | null
        }
        Update: {
          chave_acesso?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          order_id?: string
          raw_response?: Json | null
          reference?: string
          status?: string
          updated_at?: string
          url_danfe?: string | null
        }
        Relationships: []
      }
      order_item_complements: {
        Row: {
          complement_id: string
          complement_name: string
          created_at: string
          id: string
          order_item_id: string
          price: number
          quantity: number
        }
        Insert: {
          complement_id: string
          complement_name: string
          created_at?: string
          id?: string
          order_item_id: string
          price?: number
          quantity?: number
        }
        Update: {
          complement_id?: string
          complement_name?: string
          created_at?: string
          id?: string
          order_item_id?: string
          price?: number
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_item_complements_complement_id_fkey"
            columns: ["complement_id"]
            isOneToOne: false
            referencedRelation: "complements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_item_complements_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          delivered_at: string | null
          id: string
          notes: string | null
          order_id: string
          paid_quantity: number
          preparation_status: string
          preparing_at: string | null
          price: number
          product_id: string
          product_name: string
          quantity: number
          ready_at: string | null
          sent_at: string | null
          sent_to_kitchen: boolean
          viewed_at: string | null
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          id?: string
          notes?: string | null
          order_id: string
          paid_quantity?: number
          preparation_status?: string
          preparing_at?: string | null
          price: number
          product_id: string
          product_name: string
          quantity?: number
          ready_at?: string | null
          sent_at?: string | null
          sent_to_kitchen?: boolean
          viewed_at?: string | null
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          paid_quantity?: number
          preparation_status?: string
          preparing_at?: string | null
          price?: number
          product_id?: string
          product_name?: string
          quantity?: number
          ready_at?: string | null
          sent_at?: string | null
          sent_to_kitchen?: boolean
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          current_location: string | null
          customer_name: string | null
          delivered_at: string | null
          guests: number | null
          id: string
          merged_from: string[] | null
          origin_location: string | null
          status: string
          table_id: string | null
          total: number
          updated_at: string
          waiter_name: string | null
          whatsapp_phone: string | null
        }
        Insert: {
          created_at?: string
          current_location?: string | null
          customer_name?: string | null
          delivered_at?: string | null
          guests?: number | null
          id?: string
          merged_from?: string[] | null
          origin_location?: string | null
          status?: string
          table_id?: string | null
          total?: number
          updated_at?: string
          waiter_name?: string | null
          whatsapp_phone?: string | null
        }
        Update: {
          created_at?: string
          current_location?: string | null
          customer_name?: string | null
          delivered_at?: string | null
          guests?: number | null
          id?: string
          merged_from?: string[] | null
          origin_location?: string | null
          status?: string
          table_id?: string | null
          total?: number
          updated_at?: string
          waiter_name?: string | null
          whatsapp_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: string
          order_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method: string
          order_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      print_jobs: {
        Row: {
          created_at: string
          id: string
          payload: Json
          printed_at: string | null
          printer_id: string | null
          station: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          printed_at?: string | null
          printer_id?: string | null
          station: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          printed_at?: string | null
          printer_id?: string | null
          station?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_jobs_printer_id_fkey"
            columns: ["printer_id"]
            isOneToOne: false
            referencedRelation: "printers"
            referencedColumns: ["id"]
          },
        ]
      }
      printers: {
        Row: {
          active: boolean
          created_at: string
          id: string
          ip: string
          last_seen_at: string | null
          model: string
          name: string
          port: number
          station: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          ip?: string
          last_seen_at?: string | null
          model?: string
          name: string
          port?: number
          station?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          ip?: string
          last_seen_at?: string | null
          model?: string
          name?: string
          port?: number
          station?: string
        }
        Relationships: []
      }
      product_complement_groups: {
        Row: {
          group_id: string
          id: string
          product_id: string
        }
        Insert: {
          group_id: string
          id?: string
          product_id: string
        }
        Update: {
          group_id?: string
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_complement_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "complement_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_complement_groups_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          category_id: string | null
          created_at: string
          description: string | null
          featured_on_menu: boolean
          id: string
          image_url: string | null
          menu_image_url: string | null
          name: string
          prep_time_minutes: number
          price: number
          sort_order: number | null
          station: string
          stock: number | null
          updated_at: string
          visible_on_menu: boolean
        }
        Insert: {
          active?: boolean
          category_id?: string | null
          created_at?: string
          description?: string | null
          featured_on_menu?: boolean
          id?: string
          image_url?: string | null
          menu_image_url?: string | null
          name: string
          prep_time_minutes?: number
          price?: number
          sort_order?: number | null
          station?: string
          stock?: number | null
          updated_at?: string
          visible_on_menu?: boolean
        }
        Update: {
          active?: boolean
          category_id?: string | null
          created_at?: string
          description?: string | null
          featured_on_menu?: boolean
          id?: string
          image_url?: string | null
          menu_image_url?: string | null
          name?: string
          prep_time_minutes?: number
          price?: number
          sort_order?: number | null
          station?: string
          stock?: number | null
          updated_at?: string
          visible_on_menu?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id: string
          role?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      restaurant_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value?: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      restaurant_tables: {
        Row: {
          active: boolean
          created_at: string
          default_name: string
          id: string
          internal_number: string | null
          name: string
          position_x: number | null
          position_y: number | null
          seats: number
          sector: string | null
          self_service_enabled: boolean
          sort_order: number | null
          status: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_name?: string
          id?: string
          internal_number?: string | null
          name: string
          position_x?: number | null
          position_y?: number | null
          seats?: number
          sector?: string | null
          self_service_enabled?: boolean
          sort_order?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_name?: string
          id?: string
          internal_number?: string | null
          name?: string
          position_x?: number | null
          position_y?: number | null
          seats?: number
          sector?: string | null
          self_service_enabled?: boolean
          sort_order?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      self_service_sessions: {
        Row: {
          created_at: string
          customer_name: string
          expires_at: string
          id: string
          order_id: string | null
          session_token: string
          table_id: string
        }
        Insert: {
          created_at?: string
          customer_name?: string
          expires_at?: string
          id?: string
          order_id?: string | null
          session_token?: string
          table_id: string
        }
        Update: {
          created_at?: string
          customer_name?: string
          expires_at?: string
          id?: string
          order_id?: string | null
          session_token?: string
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "self_service_sessions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "self_service_sessions_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      table_activity_log: {
        Row: {
          action: string
          created_at: string
          description: string
          id: string
          order_id: string | null
          table_id: string
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          description: string
          id?: string
          order_id?: string | null
          table_id: string
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          description?: string
          id?: string
          order_id?: string | null
          table_id?: string
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "table_activity_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_activity_log_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acquire_comanda_lock: {
        Args: {
          p_duration_seconds?: number
          p_table_id: string
          p_user_id: string
          p_user_name: string
        }
        Returns: Json
      }
      get_or_create_open_order:
        | {
            Args: {
              p_customer_name?: string
              p_guests?: number
              p_table_id: string
              p_waiter_name?: string
              p_whatsapp_phone?: string
            }
            Returns: {
              created_at: string
              current_location: string | null
              customer_name: string | null
              delivered_at: string | null
              guests: number | null
              id: string
              merged_from: string[] | null
              origin_location: string | null
              status: string
              table_id: string | null
              total: number
              updated_at: string
              waiter_name: string | null
              whatsapp_phone: string | null
            }
            SetofOptions: {
              from: "*"
              to: "orders"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_customer_name?: string
              p_guests?: number
              p_location?: string
              p_table_id: string
              p_waiter_name?: string
              p_whatsapp_phone?: string
            }
            Returns: {
              created_at: string
              current_location: string | null
              customer_name: string | null
              delivered_at: string | null
              guests: number | null
              id: string
              merged_from: string[] | null
              origin_location: string | null
              status: string
              table_id: string | null
              total: number
              updated_at: string
              waiter_name: string | null
              whatsapp_phone: string | null
            }
            SetofOptions: {
              from: "*"
              to: "orders"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      get_or_create_self_service_order: {
        Args: {
          p_customer_name?: string
          p_guests?: number
          p_session_id: string
          p_table_id: string
          p_whatsapp_phone?: string
        }
        Returns: {
          created_at: string
          current_location: string | null
          customer_name: string | null
          delivered_at: string | null
          guests: number | null
          id: string
          merged_from: string[] | null
          origin_location: string | null
          status: string
          table_id: string | null
          total: number
          updated_at: string
          waiter_name: string | null
          whatsapp_phone: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      recalculate_order_total: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      release_comanda_lock: {
        Args: { p_table_id: string; p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
