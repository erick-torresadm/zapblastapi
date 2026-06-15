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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      campaign_messages: {
        Row: {
          attempts: number
          campaign_id: string
          contact_id: string
          created_at: string
          delivered_at: string | null
          error: string | null
          evolution_message_id: string | null
          id: string
          instance_id: string | null
          phone: string
          read_at: string | null
          rendered_message: string
          sent_at: string | null
          status: Database["public"]["Enums"]["message_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          campaign_id: string
          contact_id: string
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          evolution_message_id?: string | null
          id?: string
          instance_id?: string | null
          phone: string
          read_at?: string | null
          rendered_message: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          campaign_id?: string
          contact_id?: string
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          evolution_message_id?: string | null
          id?: string
          instance_id?: string | null
          phone?: string
          read_at?: string | null
          rendered_message?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_messages_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          completed_at: string | null
          created_at: string
          failed_count: number
          id: string
          instance_ids: string[]
          list_id: string
          max_delay_s: number
          media_filename: string | null
          media_type: string | null
          media_url: string | null
          message_template: string
          min_delay_s: number
          name: string
          scheduled_for: string | null
          sent_count: number
          started_at: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          total_messages: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          failed_count?: number
          id?: string
          instance_ids?: string[]
          list_id: string
          max_delay_s?: number
          media_filename?: string | null
          media_type?: string | null
          media_url?: string | null
          message_template: string
          min_delay_s?: number
          name: string
          scheduled_for?: string | null
          sent_count?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          total_messages?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          failed_count?: number
          id?: string
          instance_ids?: string[]
          list_id?: string
          max_delay_s?: number
          media_filename?: string | null
          media_type?: string | null
          media_url?: string | null
          message_template?: string
          min_delay_s?: number
          name?: string
          scheduled_for?: string | null
          sent_count?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          total_messages?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "contact_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_lists: {
        Row: {
          created_at: string
          id: string
          name: string
          total_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          total_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          total_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          created_at: string
          id: string
          list_id: string
          opted_out: boolean
          phone: string
          user_id: string
          variables: Json
        }
        Insert: {
          created_at?: string
          id?: string
          list_id: string
          opted_out?: boolean
          phone: string
          user_id: string
          variables?: Json
        }
        Update: {
          created_at?: string
          id?: string
          list_id?: string
          opted_out?: boolean
          phone?: string
          user_id?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "contacts_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "contact_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      evolution_servers: {
        Row: {
          api_key: string
          base_url: string
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
          webhook_token: string
        }
        Insert: {
          api_key: string
          base_url: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
          webhook_token?: string
        }
        Update: {
          api_key?: string
          base_url?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
          webhook_token?: string
        }
        Relationships: []
      }
      incoming_messages: {
        Row: {
          evolution_message_id: string | null
          from_phone: string
          id: string
          instance_id: string | null
          message_text: string | null
          raw_payload: Json | null
          received_at: string
          user_id: string
        }
        Insert: {
          evolution_message_id?: string | null
          from_phone: string
          id?: string
          instance_id?: string | null
          message_text?: string | null
          raw_payload?: Json | null
          received_at?: string
          user_id: string
        }
        Update: {
          evolution_message_id?: string | null
          from_phone?: string
          id?: string
          instance_id?: string | null
          message_text?: string | null
          raw_payload?: Json | null
          received_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "incoming_messages_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      opt_outs: {
        Row: {
          created_at: string
          id: string
          phone: string
          reason: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          phone: string
          reason?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          phone?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company_name: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      warmup_conversations: {
        Row: {
          category: Database["public"]["Enums"]["warmup_category"]
          created_at: string
          delivered_at: string | null
          evolution_message_id: string | null
          from_instance_id: string
          id: string
          message: string
          read_at: string | null
          replied: boolean
          reply_due_at: string | null
          sent_at: string
          to_instance_id: string
          user_id: string
        }
        Insert: {
          category: Database["public"]["Enums"]["warmup_category"]
          created_at?: string
          delivered_at?: string | null
          evolution_message_id?: string | null
          from_instance_id: string
          id?: string
          message: string
          read_at?: string | null
          replied?: boolean
          reply_due_at?: string | null
          sent_at?: string
          to_instance_id: string
          user_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["warmup_category"]
          created_at?: string
          delivered_at?: string | null
          evolution_message_id?: string | null
          from_instance_id?: string
          id?: string
          message?: string
          read_at?: string | null
          replied?: boolean
          reply_due_at?: string | null
          sent_at?: string
          to_instance_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warmup_conversations_from_instance_id_fkey"
            columns: ["from_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warmup_conversations_to_instance_id_fkey"
            columns: ["to_instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      warmup_messages: {
        Row: {
          active: boolean
          category: Database["public"]["Enums"]["warmup_category"]
          content: string
          created_at: string
          id: string
          user_id: string | null
          weight: number
        }
        Insert: {
          active?: boolean
          category: Database["public"]["Enums"]["warmup_category"]
          content: string
          created_at?: string
          id?: string
          user_id?: string | null
          weight?: number
        }
        Update: {
          active?: boolean
          category?: Database["public"]["Enums"]["warmup_category"]
          content?: string
          created_at?: string
          id?: string
          user_id?: string | null
          weight?: number
        }
        Relationships: []
      }
      whatsapp_instances: {
        Row: {
          active: boolean
          created_at: string
          daily_limit: number
          health_score: number
          id: string
          instance_name: string
          last_reset_date: string
          last_sent_at: string | null
          phone_number: string | null
          sent_today: number
          server_id: string
          status: Database["public"]["Enums"]["instance_status"]
          updated_at: string
          user_id: string
          warmup_enabled: boolean
          warmup_intensity: Database["public"]["Enums"]["warmup_intensity"]
          warmup_last_at: string | null
          warmup_received_today: number
          warmup_sent_today: number
          warmup_started_at: string | null
          warmup_total_sent: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          daily_limit?: number
          health_score?: number
          id?: string
          instance_name: string
          last_reset_date?: string
          last_sent_at?: string | null
          phone_number?: string | null
          sent_today?: number
          server_id: string
          status?: Database["public"]["Enums"]["instance_status"]
          updated_at?: string
          user_id: string
          warmup_enabled?: boolean
          warmup_intensity?: Database["public"]["Enums"]["warmup_intensity"]
          warmup_last_at?: string | null
          warmup_received_today?: number
          warmup_sent_today?: number
          warmup_started_at?: string | null
          warmup_total_sent?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          daily_limit?: number
          health_score?: number
          id?: string
          instance_name?: string
          last_reset_date?: string
          last_sent_at?: string | null
          phone_number?: string | null
          sent_today?: number
          server_id?: string
          status?: Database["public"]["Enums"]["instance_status"]
          updated_at?: string
          user_id?: string
          warmup_enabled?: boolean
          warmup_intensity?: Database["public"]["Enums"]["warmup_intensity"]
          warmup_last_at?: string | null
          warmup_received_today?: number
          warmup_sent_today?: number
          warmup_started_at?: string | null
          warmup_total_sent?: number
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instances_server_id_fkey"
            columns: ["server_id"]
            isOneToOne: false
            referencedRelation: "evolution_servers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      campaign_status:
        | "draft"
        | "scheduled"
        | "running"
        | "paused"
        | "completed"
        | "failed"
      instance_status:
        | "disconnected"
        | "connecting"
        | "connected"
        | "banned"
        | "error"
      message_status:
        | "pending"
        | "sending"
        | "sent"
        | "delivered"
        | "read"
        | "failed"
        | "replied"
      warmup_category:
        | "saudacao"
        | "pergunta"
        | "resposta"
        | "casual"
        | "emoji"
        | "despedida"
      warmup_intensity: "leve" | "medio" | "forte"
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
    Enums: {
      app_role: ["admin", "user"],
      campaign_status: [
        "draft",
        "scheduled",
        "running",
        "paused",
        "completed",
        "failed",
      ],
      instance_status: [
        "disconnected",
        "connecting",
        "connected",
        "banned",
        "error",
      ],
      message_status: [
        "pending",
        "sending",
        "sent",
        "delivered",
        "read",
        "failed",
        "replied",
      ],
      warmup_category: [
        "saudacao",
        "pergunta",
        "resposta",
        "casual",
        "emoji",
        "despedida",
      ],
      warmup_intensity: ["leve", "medio", "forte"],
    },
  },
} as const
