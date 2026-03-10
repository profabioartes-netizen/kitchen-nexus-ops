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
        }
        Insert: {
          active?: boolean
          created_at?: string
          group_id: string
          id?: string
          name: string
          price?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          group_id?: string
          id?: string
          name?: string
          price?: number
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
          preparation_status: string
          preparing_at: string | null
          price: number
          product_id: string
          product_name: string
          quantity: number
          ready_at: string | null
          sent_at: string | null
          sent_to_kitchen: boolean
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          id?: string
          notes?: string | null
          order_id: string
          preparation_status?: string
          preparing_at?: string | null
          price: number
          product_id: string
          product_name: string
          quantity?: number
          ready_at?: string | null
          sent_at?: string | null
          sent_to_kitchen?: boolean
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          preparation_status?: string
          preparing_at?: string | null
          price?: number
          product_id?: string
          product_name?: string
          quantity?: number
          ready_at?: string | null
          sent_at?: string | null
          sent_to_kitchen?: boolean
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
          id: string
          merged_from: string[] | null
          status: string
          table_id: string | null
          total: number
          updated_at: string
          waiter_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          merged_from?: string[] | null
          status?: string
          table_id?: string | null
          total?: number
          updated_at?: string
          waiter_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          merged_from?: string[] | null
          status?: string
          table_id?: string | null
          total?: number
          updated_at?: string
          waiter_name?: string | null
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
          id: string
          name: string
          prep_time_minutes: number
          price: number
          station: string
          stock: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          category_id?: string | null
          created_at?: string
          id?: string
          name: string
          prep_time_minutes?: number
          price?: number
          station?: string
          stock?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          category_id?: string | null
          created_at?: string
          id?: string
          name?: string
          prep_time_minutes?: number
          price?: number
          station?: string
          stock?: number | null
          updated_at?: string
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
      restaurant_tables: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          position_x: number | null
          position_y: number | null
          seats: number
          sort_order: number | null
          status: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          position_x?: number | null
          position_y?: number | null
          seats?: number
          sort_order?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          position_x?: number | null
          position_y?: number | null
          seats?: number
          sort_order?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: []
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
      [_ in never]: never
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
