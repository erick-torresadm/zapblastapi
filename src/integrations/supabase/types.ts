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
      admin_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          ip: string | null
          payload: Json | null
          target_id: string | null
          target_type: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          payload?: Json | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          payload?: Json | null
          target_id?: string | null
          target_type?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
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
          rendered_message: string | null
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
          rendered_message?: string | null
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
          rendered_message?: string | null
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
          flow_id: string | null
          id: string
          instance_ids: string[]
          list_id: string
          max_delay_s: number
          media_filename: string | null
          media_type: string | null
          media_url: string | null
          message_template: string | null
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
          flow_id?: string | null
          id?: string
          instance_ids?: string[]
          list_id: string
          max_delay_s?: number
          media_filename?: string | null
          media_type?: string | null
          media_url?: string | null
          message_template?: string | null
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
          flow_id?: string | null
          id?: string
          instance_ids?: string[]
          list_id?: string
          max_delay_s?: number
          media_filename?: string | null
          media_type?: string | null
          media_url?: string | null
          message_template?: string | null
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
            foreignKeyName: "campaigns_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "contact_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          caption: string | null
          chat_type: string
          contact_jid: string | null
          contact_phone: string
          created_at: string
          deleted_at: string | null
          direction: string
          duration_seconds: number | null
          evolution_message_id: string | null
          id: string
          instance_id: string | null
          is_ptt: boolean | null
          media_filename: string | null
          media_mime: string | null
          media_size: number | null
          media_type: string | null
          media_url: string | null
          quoted_text: string | null
          reaction: string | null
          reactions: Json
          read_at: string | null
          reply_to_id: string | null
          sent_by_agent_id: string | null
          starred: boolean
          status: string
          text: string | null
          user_id: string
        }
        Insert: {
          caption?: string | null
          chat_type?: string
          contact_jid?: string | null
          contact_phone: string
          created_at?: string
          deleted_at?: string | null
          direction: string
          duration_seconds?: number | null
          evolution_message_id?: string | null
          id?: string
          instance_id?: string | null
          is_ptt?: boolean | null
          media_filename?: string | null
          media_mime?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          quoted_text?: string | null
          reaction?: string | null
          reactions?: Json
          read_at?: string | null
          reply_to_id?: string | null
          sent_by_agent_id?: string | null
          starred?: boolean
          status?: string
          text?: string | null
          user_id: string
        }
        Update: {
          caption?: string | null
          chat_type?: string
          contact_jid?: string | null
          contact_phone?: string
          created_at?: string
          deleted_at?: string | null
          direction?: string
          duration_seconds?: number | null
          evolution_message_id?: string | null
          id?: string
          instance_id?: string | null
          is_ptt?: boolean | null
          media_filename?: string | null
          media_mime?: string | null
          media_size?: number | null
          media_type?: string | null
          media_url?: string | null
          quoted_text?: string | null
          reaction?: string | null
          reactions?: Json
          read_at?: string | null
          reply_to_id?: string | null
          sent_by_agent_id?: string | null
          starred?: boolean
          status?: string
          text?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chip_catalog: {
        Row: {
          active: boolean
          country_code: string
          created_at: string
          description: string | null
          id: string
          name: string
          price_cents: number
          provider: Database["public"]["Enums"]["chip_provider"]
          provider_cost_cents: number
          provider_service_code: string
          sort_order: number
          ttl_minutes: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          country_code?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          price_cents: number
          provider?: Database["public"]["Enums"]["chip_provider"]
          provider_cost_cents?: number
          provider_service_code?: string
          sort_order?: number
          ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          country_code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          price_cents?: number
          provider?: Database["public"]["Enums"]["chip_provider"]
          provider_cost_cents?: number
          provider_service_code?: string
          sort_order?: number
          ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      chip_purchases: {
        Row: {
          catalog_item_id: string | null
          created_at: string
          error: string | null
          expires_at: string | null
          id: string
          instance_id: string | null
          phone_number: string | null
          price_paid_cents: number
          provider: Database["public"]["Enums"]["chip_provider"]
          provider_order_id: string | null
          sms_code: string | null
          status: Database["public"]["Enums"]["chip_purchase_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          catalog_item_id?: string | null
          created_at?: string
          error?: string | null
          expires_at?: string | null
          id?: string
          instance_id?: string | null
          phone_number?: string | null
          price_paid_cents: number
          provider: Database["public"]["Enums"]["chip_provider"]
          provider_order_id?: string | null
          sms_code?: string | null
          status?: Database["public"]["Enums"]["chip_purchase_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          catalog_item_id?: string | null
          created_at?: string
          error?: string | null
          expires_at?: string | null
          id?: string
          instance_id?: string | null
          phone_number?: string | null
          price_paid_cents?: number
          provider?: Database["public"]["Enums"]["chip_provider"]
          provider_order_id?: string | null
          sms_code?: string | null
          status?: Database["public"]["Enums"]["chip_purchase_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chip_purchases_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "chip_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chip_purchases_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
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
          list_id: string | null
          name: string | null
          opted_out: boolean
          phone: string
          user_id: string
          variables: Json
        }
        Insert: {
          created_at?: string
          id?: string
          list_id?: string | null
          name?: string | null
          opted_out?: boolean
          phone: string
          user_id: string
          variables?: Json
        }
        Update: {
          created_at?: string
          id?: string
          list_id?: string | null
          name?: string | null
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
      coupon_redemptions: {
        Row: {
          coupon_id: string
          created_at: string
          discount_cents: number
          final_cents: number
          id: string
          payment_intent_id: string | null
          plan_id: string | null
          subscription_id: string | null
          user_id: string
        }
        Insert: {
          coupon_id: string
          created_at?: string
          discount_cents?: number
          final_cents?: number
          id?: string
          payment_intent_id?: string | null
          plan_id?: string | null
          subscription_id?: string | null
          user_id: string
        }
        Update: {
          coupon_id?: string
          created_at?: string
          discount_cents?: number
          final_cents?: number
          id?: string
          payment_intent_id?: string | null
          plan_id?: string | null
          subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          expires_at: string | null
          free_duration_days: number | null
          id: string
          max_per_user: number
          max_redemptions: number | null
          plan_id: string | null
          redemptions_count: number
          type: Database["public"]["Enums"]["coupon_type"]
          updated_at: string
          value: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          free_duration_days?: number | null
          id?: string
          max_per_user?: number
          max_redemptions?: number | null
          plan_id?: string | null
          redemptions_count?: number
          type: Database["public"]["Enums"]["coupon_type"]
          updated_at?: string
          value?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          expires_at?: string | null
          free_duration_days?: number | null
          id?: string
          max_per_user?: number
          max_redemptions?: number | null
          plan_id?: string | null
          redemptions_count?: number
          type?: Database["public"]["Enums"]["coupon_type"]
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupons_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_agents: {
        Row: {
          active: boolean
          agent_user_id: string
          created_at: string
          display_name: string | null
          id: string
          owner_user_id: string
          role: string
        }
        Insert: {
          active?: boolean
          agent_user_id: string
          created_at?: string
          display_name?: string | null
          id?: string
          owner_user_id: string
          role?: string
        }
        Update: {
          active?: boolean
          agent_user_id?: string
          created_at?: string
          display_name?: string | null
          id?: string
          owner_user_id?: string
          role?: string
        }
        Relationships: []
      }
      crm_contacts_profile: {
        Row: {
          contact_phone: string
          created_at: string
          id: string
          instance_id: string | null
          owner_user_id: string
          profile_pic_fetched_at: string | null
          profile_pic_url: string | null
          push_name: string | null
          saved_name: string | null
          updated_at: string
          verified_name: string | null
        }
        Insert: {
          contact_phone: string
          created_at?: string
          id?: string
          instance_id?: string | null
          owner_user_id: string
          profile_pic_fetched_at?: string | null
          profile_pic_url?: string | null
          push_name?: string | null
          saved_name?: string | null
          updated_at?: string
          verified_name?: string | null
        }
        Update: {
          contact_phone?: string
          created_at?: string
          id?: string
          instance_id?: string | null
          owner_user_id?: string
          profile_pic_fetched_at?: string | null
          profile_pic_url?: string | null
          push_name?: string | null
          saved_name?: string | null
          updated_at?: string
          verified_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_contacts_profile_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_conversations: {
        Row: {
          archived_at: string | null
          assigned_agent_id: string | null
          chat_type: string
          contact_about: string | null
          contact_avatar_url: string | null
          contact_company: string | null
          contact_email: string | null
          contact_jid: string | null
          contact_name: string | null
          contact_phone: string
          created_at: string
          custom_fields: Json
          id: string
          instance_id: string | null
          last_message_at: string
          last_message_direction: string | null
          last_message_text: string | null
          last_message_type: string | null
          last_seen_at: string | null
          muted_until: string | null
          owner_user_id: string
          pinned_at: string | null
          presence: string | null
          presence_at: string | null
          profile_synced_at: string | null
          status: string
          tags: Json
          unread_count: number
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          assigned_agent_id?: string | null
          chat_type?: string
          contact_about?: string | null
          contact_avatar_url?: string | null
          contact_company?: string | null
          contact_email?: string | null
          contact_jid?: string | null
          contact_name?: string | null
          contact_phone: string
          created_at?: string
          custom_fields?: Json
          id?: string
          instance_id?: string | null
          last_message_at?: string
          last_message_direction?: string | null
          last_message_text?: string | null
          last_message_type?: string | null
          last_seen_at?: string | null
          muted_until?: string | null
          owner_user_id: string
          pinned_at?: string | null
          presence?: string | null
          presence_at?: string | null
          profile_synced_at?: string | null
          status?: string
          tags?: Json
          unread_count?: number
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          assigned_agent_id?: string | null
          chat_type?: string
          contact_about?: string | null
          contact_avatar_url?: string | null
          contact_company?: string | null
          contact_email?: string | null
          contact_jid?: string | null
          contact_name?: string | null
          contact_phone?: string
          created_at?: string
          custom_fields?: Json
          id?: string
          instance_id?: string | null
          last_message_at?: string
          last_message_direction?: string | null
          last_message_text?: string | null
          last_message_type?: string | null
          last_seen_at?: string | null
          muted_until?: string | null
          owner_user_id?: string
          pinned_at?: string | null
          presence?: string | null
          presence_at?: string | null
          profile_synced_at?: string | null
          status?: string
          tags?: Json
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_conversations_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_invite_links: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          display_name: string | null
          expires_at: string | null
          id: string
          max_uses: number | null
          owner_user_id: string
          role: string
          token: string
          updated_at: string
          uses: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          owner_user_id: string
          role?: string
          token: string
          updated_at?: string
          uses?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          owner_user_id?: string
          role?: string
          token?: string
          updated_at?: string
          uses?: number
        }
        Relationships: []
      }
      crm_notes: {
        Row: {
          author_user_id: string
          conversation_id: string
          created_at: string
          id: string
          owner_user_id: string
          text: string
        }
        Insert: {
          author_user_id: string
          conversation_id: string
          created_at?: string
          id?: string
          owner_user_id: string
          text: string
        }
        Update: {
          author_user_id?: string
          conversation_id?: string
          created_at?: string
          id?: string
          owner_user_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "crm_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_quick_replies: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          owner_user_id: string
          shortcut: string
          text: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          owner_user_id: string
          shortcut: string
          text: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          owner_user_id?: string
          shortcut?: string
          text?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      disposable_email_domains: {
        Row: {
          added_at: string
          domain: string
        }
        Insert: {
          added_at?: string
          domain: string
        }
        Update: {
          added_at?: string
          domain?: string
        }
        Relationships: []
      }
      evolution_servers: {
        Row: {
          api_key: string
          base_url: string
          created_at: string
          id: string
          is_shared: boolean
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
          is_shared?: boolean
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
          is_shared?: boolean
          name?: string
          updated_at?: string
          user_id?: string
          webhook_token?: string
        }
        Relationships: []
      }
      flow_export_log: {
        Row: {
          exported_at: string
          fingerprint_hash: string | null
          flow_id: string | null
          id: string
          user_id: string
        }
        Insert: {
          exported_at?: string
          fingerprint_hash?: string | null
          flow_id?: string | null
          id?: string
          user_id: string
        }
        Update: {
          exported_at?: string
          fingerprint_hash?: string | null
          flow_id?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      flow_keyword_audit: {
        Row: {
          contact_jid: string | null
          contact_phone: string | null
          created_at: string
          from_me: boolean
          id: string
          instance_id: string | null
          matched_flow_ids: string[]
          matched_trigger_ids: string[]
          note: string | null
          remote_jid: string | null
          resolution_status: string
          run_ids: string[]
          text_excerpt: string | null
          triggers_evaluated: number
          triggers_matched: number
          user_id: string
        }
        Insert: {
          contact_jid?: string | null
          contact_phone?: string | null
          created_at?: string
          from_me?: boolean
          id?: string
          instance_id?: string | null
          matched_flow_ids?: string[]
          matched_trigger_ids?: string[]
          note?: string | null
          remote_jid?: string | null
          resolution_status: string
          run_ids?: string[]
          text_excerpt?: string | null
          triggers_evaluated?: number
          triggers_matched?: number
          user_id: string
        }
        Update: {
          contact_jid?: string | null
          contact_phone?: string | null
          created_at?: string
          from_me?: boolean
          id?: string
          instance_id?: string | null
          matched_flow_ids?: string[]
          matched_trigger_ids?: string[]
          note?: string | null
          remote_jid?: string | null
          resolution_status?: string
          run_ids?: string[]
          text_excerpt?: string | null
          triggers_evaluated?: number
          triggers_matched?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_keyword_audit_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_keyword_triggers: {
        Row: {
          active: boolean
          allow_from_me: boolean
          cooldown_seconds: number
          created_at: string
          created_by_admin: boolean
          delay_seconds: number
          flow_id: string
          id: string
          instance_id: string | null
          keywords: string[]
          last_triggered_at: string | null
          match_mode: string
          per_contact_cooldown_seconds: number
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          allow_from_me?: boolean
          cooldown_seconds?: number
          created_at?: string
          created_by_admin?: boolean
          delay_seconds?: number
          flow_id: string
          id?: string
          instance_id?: string | null
          keywords?: string[]
          last_triggered_at?: string | null
          match_mode?: string
          per_contact_cooldown_seconds?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          allow_from_me?: boolean
          cooldown_seconds?: number
          created_at?: string
          created_by_admin?: boolean
          delay_seconds?: number
          flow_id?: string
          id?: string
          instance_id?: string | null
          keywords?: string[]
          last_triggered_at?: string | null
          match_mode?: string
          per_contact_cooldown_seconds?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_keyword_triggers_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_keyword_triggers_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_run_steps: {
        Row: {
          created_at: string
          duration_ms: number | null
          error: string | null
          flow_id: string
          id: string
          node_id: string
          node_type: string
          output: Json | null
          run_id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          flow_id: string
          id?: string
          node_id: string
          node_type: string
          output?: Json | null
          run_id: string
          status: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          flow_id?: string
          id?: string
          node_id?: string
          node_type?: string
          output?: Json | null
          run_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_run_steps_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_run_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "flow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_runs: {
        Row: {
          contact_id: string | null
          contact_phone: string
          created_at: string
          current_node_id: string | null
          error: string | null
          finished_at: string | null
          flow_id: string
          id: string
          instance_id: string | null
          started_at: string
          status: string
          updated_at: string
          user_id: string
          variables: Json
          version_id: string | null
          wait_until: string | null
          waiting_for: string | null
        }
        Insert: {
          contact_id?: string | null
          contact_phone: string
          created_at?: string
          current_node_id?: string | null
          error?: string | null
          finished_at?: string | null
          flow_id: string
          id?: string
          instance_id?: string | null
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
          variables?: Json
          version_id?: string | null
          wait_until?: string | null
          waiting_for?: string | null
        }
        Update: {
          contact_id?: string | null
          contact_phone?: string
          created_at?: string
          current_node_id?: string | null
          error?: string | null
          finished_at?: string | null
          flow_id?: string
          id?: string
          instance_id?: string | null
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
          variables?: Json
          version_id?: string | null
          wait_until?: string | null
          waiting_for?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "flow_runs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_runs_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_runs_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_runs_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "flow_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_versions: {
        Row: {
          edges: Json
          flow_id: string
          id: string
          nodes: Json
          published_at: string
          user_id: string
          version: number
        }
        Insert: {
          edges: Json
          flow_id: string
          id?: string
          nodes: Json
          published_at?: string
          user_id: string
          version: number
        }
        Update: {
          edges?: Json
          flow_id?: string
          id?: string
          nodes?: Json
          published_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "flow_versions_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      flows: {
        Row: {
          created_at: string
          current_version_id: string | null
          description: string | null
          draft_edges: Json
          draft_nodes: Json
          id: string
          instance_id: string | null
          name: string
          status: string
          trigger_config: Json
          trigger_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_version_id?: string | null
          description?: string | null
          draft_edges?: Json
          draft_nodes?: Json
          id?: string
          instance_id?: string | null
          name?: string
          status?: string
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_version_id?: string | null
          description?: string | null
          draft_edges?: Json
          draft_nodes?: Json
          id?: string
          instance_id?: string | null
          name?: string
          status?: string
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flows_current_version_fk"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "flow_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flows_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_instances"
            referencedColumns: ["id"]
          },
        ]
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
      login_attempts: {
        Row: {
          created_at: string
          email: string | null
          id: string
          ip: string | null
          success: boolean
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          ip?: string | null
          success?: boolean
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          ip?: string | null
          success?: boolean
          user_agent?: string | null
        }
        Relationships: []
      }
      maps_searches: {
        Row: {
          category: string | null
          city: string | null
          cost_cents: number
          created_at: string
          id: string
          lat: number | null
          leads_returned: number
          lng: number | null
          mode: string
          only_with_phone: boolean
          query: string
          radius_m: number | null
          refunded: boolean
          results: Json
          user_id: string
          whatsapp_check: boolean
          whatsapp_valid_count: number
        }
        Insert: {
          category?: string | null
          city?: string | null
          cost_cents?: number
          created_at?: string
          id?: string
          lat?: number | null
          leads_returned?: number
          lng?: number | null
          mode?: string
          only_with_phone?: boolean
          query: string
          radius_m?: number | null
          refunded?: boolean
          results?: Json
          user_id: string
          whatsapp_check?: boolean
          whatsapp_valid_count?: number
        }
        Update: {
          category?: string | null
          city?: string | null
          cost_cents?: number
          created_at?: string
          id?: string
          lat?: number | null
          leads_returned?: number
          lng?: number | null
          mode?: string
          only_with_phone?: boolean
          query?: string
          radius_m?: number | null
          refunded?: boolean
          results?: Json
          user_id?: string
          whatsapp_check?: boolean
          whatsapp_valid_count?: number
        }
        Relationships: []
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
      security_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          ip: string | null
          metadata: Json | null
          severity: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          ip?: string | null
          metadata?: Json | null
          severity?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          ip?: string | null
          metadata?: Json | null
          severity?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      signup_device_log: {
        Row: {
          asn: string | null
          country: string | null
          created_at: string
          email_norm_hash: string | null
          fingerprint_hash: string | null
          id: string
          ip: string | null
          ip_subnet: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          asn?: string | null
          country?: string | null
          created_at?: string
          email_norm_hash?: string | null
          fingerprint_hash?: string | null
          id?: string
          ip?: string | null
          ip_subnet?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          asn?: string | null
          country?: string | null
          created_at?: string
          email_norm_hash?: string | null
          fingerprint_hash?: string | null
          id?: string
          ip?: string | null
          ip_subnet?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      signup_ip_log: {
        Row: {
          asn: string | null
          country: string | null
          created_at: string
          id: string
          ip: string
          ip_subnet: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          asn?: string | null
          country?: string | null
          created_at?: string
          id?: string
          ip: string
          ip_subnet?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          asn?: string | null
          country?: string | null
          created_at?: string
          id?: string
          ip?: string
          ip_subnet?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          efi_plan_id_prod: number | null
          efi_plan_id_sandbox: number | null
          featured: boolean
          id: string
          max_active_campaigns: number
          max_chips: number
          max_contacts_per_list: number
          max_crm_agents: number
          max_messages_per_day: number
          name: string
          price_annual_cents: number | null
          price_cents: number
          slug: string
          sort_order: number
          stripe_price_id: string | null
          stripe_price_id_annual: string | null
          warmup_tier: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          efi_plan_id_prod?: number | null
          efi_plan_id_sandbox?: number | null
          featured?: boolean
          id?: string
          max_active_campaigns?: number
          max_chips?: number
          max_contacts_per_list?: number
          max_crm_agents?: number
          max_messages_per_day?: number
          name: string
          price_annual_cents?: number | null
          price_cents: number
          slug: string
          sort_order?: number
          stripe_price_id?: string | null
          stripe_price_id_annual?: string | null
          warmup_tier?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          efi_plan_id_prod?: number | null
          efi_plan_id_sandbox?: number | null
          featured?: boolean
          id?: string
          max_active_campaigns?: number
          max_chips?: number
          max_contacts_per_list?: number
          max_crm_agents?: number
          max_messages_per_day?: number
          name?: string
          price_annual_cents?: number | null
          price_cents?: number
          slug?: string
          sort_order?: number
          stripe_price_id?: string | null
          stripe_price_id_annual?: string | null
          warmup_tier?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          canceled_at: string | null
          cancellation_feedback: string | null
          cancellation_reason: string | null
          card_brand: string | null
          card_last4: string | null
          created_at: string
          current_period_end: string | null
          efi_subscription_id: number | null
          id: string
          next_charge_at: string | null
          payment_method: string | null
          plan_id: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          cancellation_feedback?: string | null
          cancellation_reason?: string | null
          card_brand?: string | null
          card_last4?: string | null
          created_at?: string
          current_period_end?: string | null
          efi_subscription_id?: number | null
          id?: string
          next_charge_at?: string | null
          payment_method?: string | null
          plan_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          cancellation_feedback?: string | null
          cancellation_reason?: string | null
          card_brand?: string | null
          card_last4?: string | null
          created_at?: string
          current_period_end?: string | null
          efi_subscription_id?: number | null
          id?: string
          next_charge_at?: string | null
          payment_method?: string | null
          plan_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      trial_abuse_blocklist: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          kind: string
          reason: string | null
          value_hash: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          kind: string
          reason?: string | null
          value_hash: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          reason?: string | null
          value_hash?: string
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
      wallet_transactions: {
        Row: {
          amount_cents: number
          balance_after_cents: number
          chip_purchase_id: string | null
          created_at: string
          description: string | null
          id: string
          stripe_payment_intent_id: string | null
          type: Database["public"]["Enums"]["wallet_tx_type"]
          user_id: string
        }
        Insert: {
          amount_cents: number
          balance_after_cents: number
          chip_purchase_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          stripe_payment_intent_id?: string | null
          type: Database["public"]["Enums"]["wallet_tx_type"]
          user_id: string
        }
        Update: {
          amount_cents?: number
          balance_after_cents?: number
          chip_purchase_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          stripe_payment_intent_id?: string | null
          type?: Database["public"]["Enums"]["wallet_tx_type"]
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          balance_cents: number
          created_at: string
          total_topped_up_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_cents?: number
          created_at?: string
          total_topped_up_cents?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_cents?: number
          created_at?: string
          total_topped_up_cents?: number
          updated_at?: string
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
          hourly_limit: number
          id: string
          instance_name: string
          last_qr_at: string | null
          last_qr_base64: string | null
          last_qr_error: string | null
          last_reset_date: string
          last_sent_at: string | null
          max_delay_ms: number
          min_delay_ms: number
          phone_number: string | null
          quiet_end_hour: number
          quiet_start_hour: number
          sent_hour: number
          sent_hour_at: string | null
          sent_today: number
          server_id: string
          status: Database["public"]["Enums"]["instance_status"]
          typing_enabled: boolean
          typing_wpm: number
          updated_at: string
          user_id: string
          validate_numbers: boolean
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
          hourly_limit?: number
          id?: string
          instance_name: string
          last_qr_at?: string | null
          last_qr_base64?: string | null
          last_qr_error?: string | null
          last_reset_date?: string
          last_sent_at?: string | null
          max_delay_ms?: number
          min_delay_ms?: number
          phone_number?: string | null
          quiet_end_hour?: number
          quiet_start_hour?: number
          sent_hour?: number
          sent_hour_at?: string | null
          sent_today?: number
          server_id: string
          status?: Database["public"]["Enums"]["instance_status"]
          typing_enabled?: boolean
          typing_wpm?: number
          updated_at?: string
          user_id: string
          validate_numbers?: boolean
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
          hourly_limit?: number
          id?: string
          instance_name?: string
          last_qr_at?: string | null
          last_qr_base64?: string | null
          last_qr_error?: string | null
          last_reset_date?: string
          last_sent_at?: string | null
          max_delay_ms?: number
          min_delay_ms?: number
          phone_number?: string | null
          quiet_end_hour?: number
          quiet_start_hour?: number
          sent_hour?: number
          sent_hour_at?: string | null
          sent_today?: number
          server_id?: string
          status?: Database["public"]["Enums"]["instance_status"]
          typing_enabled?: boolean
          typing_wpm?: number
          updated_at?: string
          user_id?: string
          validate_numbers?: boolean
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
      accept_invite_link: { Args: { _token: string }; Returns: Json }
      apply_free_coupon: {
        Args: { _code: string; _plan_id: string }
        Returns: Json
      }
      check_login_lockout: {
        Args: { _email: string; _ip: string }
        Returns: Json
      }
      credit_wallet: {
        Args: {
          _amount_cents: number
          _chip_purchase_id?: string
          _description: string
          _stripe_pi?: string
          _type: Database["public"]["Enums"]["wallet_tx_type"]
          _user_id: string
        }
        Returns: number
      }
      crm_is_workspace_admin: { Args: { _owner: string }; Returns: boolean }
      crm_is_workspace_member: { Args: { _owner: string }; Returns: boolean }
      debit_wallet: {
        Args: {
          _amount_cents: number
          _chip_purchase_id?: string
          _description: string
        }
        Returns: number
      }
      expire_trials: { Args: never; Returns: number }
      get_user_plan_limits: { Args: { _user_id: string }; Returns: Json }
      grant_manual_plan: {
        Args: {
          _amount_paid_cents: number
          _duration_days: number
          _method: string
          _note: string
          _plan_id: string
          _target_user: string
        }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_admin_action: {
        Args: {
          _action: string
          _actor: string
          _ip: string
          _payload: Json
          _target_id: string
          _target_type: string
          _user_agent: string
        }
        Returns: string
      }
      lookup_lid_phone: {
        Args: { p_instance_id: string; p_lid_jid: string; p_user_id: string }
        Returns: string
      }
      normalize_email: { Args: { _email: string }; Returns: string }
      preview_invite_link: { Args: { _token: string }; Returns: Json }
      record_login_attempt: {
        Args: {
          _email: string
          _ip: string
          _success: boolean
          _user_agent: string
        }
        Returns: undefined
      }
      redeem_coupon: {
        Args: {
          _code: string
          _payment_intent_id?: string
          _plan_id: string
          _subscription_id?: string
        }
        Returns: Json
      }
      validate_coupon: {
        Args: { _code: string; _plan_id?: string }
        Returns: Json
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
      chip_provider: "mock" | "sms_activate" | "fivesim" | "smspool"
      chip_purchase_status:
        | "pending"
        | "provisioning"
        | "active"
        | "failed"
        | "refunded"
        | "expired"
      coupon_type: "percent" | "fixed" | "free"
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
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "incomplete"
      wallet_tx_type: "topup" | "purchase" | "refund" | "adjustment"
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
      chip_provider: ["mock", "sms_activate", "fivesim", "smspool"],
      chip_purchase_status: [
        "pending",
        "provisioning",
        "active",
        "failed",
        "refunded",
        "expired",
      ],
      coupon_type: ["percent", "fixed", "free"],
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
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "incomplete",
      ],
      wallet_tx_type: ["topup", "purchase", "refund", "adjustment"],
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
