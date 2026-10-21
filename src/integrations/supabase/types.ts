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
    PostgrestVersion: "14.15"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      api_rate_limits: {
        Row: {
          request_count: number
          scope: string
          subject: string
          updated_at: string
          window_started_at: string
        }
        Insert: {
          request_count?: number
          scope: string
          subject: string
          updated_at?: string
          window_started_at?: string
        }
        Update: {
          request_count?: number
          scope?: string
          subject?: string
          updated_at?: string
          window_started_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          gym_id: string
          id: number
          metadata: Json
          role: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          gym_id: string
          id?: number
          metadata?: Json
          role: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          gym_id?: string
          id?: number
          metadata?: Json
          role?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_operations: {
        Row: {
          completed_at: string | null
          created_at: string
          gym_id: string
          idempotency_key: string
          operation: string
          provider: string
          response: Json | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          gym_id: string
          idempotency_key: string
          operation: string
          provider: string
          response?: Json | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          gym_id?: string
          idempotency_key?: string
          operation?: string
          provider?: string
          response?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_operations_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_transactions: {
        Row: {
          amount_minor: number
          created_at: string
          currency: string
          gym_id: string
          id: string
          kind: string
          metadata: Json
          occurred_at: string
          owner_id: string
          provider: string
          provider_payment_id: string
          provider_refund_id: string
          provider_subscription_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_minor?: number
          created_at?: string
          currency?: string
          gym_id: string
          id?: string
          kind?: string
          metadata?: Json
          occurred_at?: string
          owner_id: string
          provider: string
          provider_payment_id: string
          provider_refund_id?: string
          provider_subscription_id?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          currency?: string
          gym_id?: string
          id?: string
          kind?: string
          metadata?: Json
          occurred_at?: string
          owner_id?: string
          provider?: string
          provider_payment_id?: string
          provider_refund_id?: string
          provider_subscription_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_transactions_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_webhook_events: {
        Row: {
          attempt_count: number
          claim_token: string | null
          claimed_at: string
          error_code: string | null
          event_key: string
          event_type: string | null
          payload_sha256: string
          processed_at: string | null
          provider: string
          received_at: string
          status: string
        }
        Insert: {
          attempt_count?: number
          claim_token?: string | null
          claimed_at?: string
          error_code?: string | null
          event_key: string
          event_type?: string | null
          payload_sha256: string
          processed_at?: string | null
          provider: string
          received_at?: string
          status?: string
        }
        Update: {
          attempt_count?: number
          claim_token?: string | null
          claimed_at?: string
          error_code?: string | null
          event_key?: string
          event_type?: string | null
          payload_sha256?: string
          processed_at?: string | null
          provider?: string
          received_at?: string
          status?: string
        }
        Relationships: []
      }
      gym_member_attendance: {
        Row: {
          attendance_date: string
          checked_in_at: string
          checked_in_by: string | null
          gym_id: string
          id: string
          member_id: string
        }
        Insert: {
          attendance_date: string
          checked_in_at?: string
          checked_in_by?: string | null
          gym_id: string
          id?: string
          member_id: string
        }
        Update: {
          attendance_date?: string
          checked_in_at?: string
          checked_in_by?: string | null
          gym_id?: string
          id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_member_attendance_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_users: {
        Row: {
          created_at: string
          display_name: string
          email: string
          enabled: boolean
          gym_id: string
          permissions: Json
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          email?: string
          enabled?: boolean
          gym_id: string
          permissions?: Json
          role: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string
          enabled?: boolean
          gym_id?: string
          permissions?: Json
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_users_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      gym_workspaces: {
        Row: {
          created_at: string
          gym_id: string
          id: string
          owner_id: string
          revision: number
          state: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          gym_id: string
          id?: string
          owner_id: string
          revision?: number
          state?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          gym_id?: string
          id?: string
          owner_id?: string
          revision?: number
          state?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gym_workspaces_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      gyms: {
        Row: {
          account_status: string
          created_at: string
          id: string
          is_member_migration_source: boolean
          name: string
          owner_user_id: string
          subscription_plan: string
          subscription_status: string
          suspended_at: string | null
          suspended_by: string | null
          suspension_note: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          account_status?: string
          created_at?: string
          id?: string
          is_member_migration_source?: boolean
          name: string
          owner_user_id: string
          subscription_plan?: string
          subscription_status?: string
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_note?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          account_status?: string
          created_at?: string
          id?: string
          is_member_migration_source?: boolean
          name?: string
          owner_user_id?: string
          subscription_plan?: string
          subscription_status?: string
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_note?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      platform_admin_audit_logs: {
        Row: {
          action: string
          admin_user_id: string | null
          created_at: string
          gym_id: string | null
          id: number
          metadata: Json
          result: string
        }
        Insert: {
          action: string
          admin_user_id?: string | null
          created_at?: string
          gym_id?: string | null
          id?: never
          metadata?: Json
          result?: string
        }
        Update: {
          action?: string
          admin_user_id?: string | null
          created_at?: string
          gym_id?: string | null
          id?: never
          metadata?: Json
          result?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_admin_audit_logs_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          created_by: string | null
          enabled: boolean
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_app_releases: {
        Row: {
          artifact_path: string | null
          created_at: string
          created_by: string | null
          download_url: string | null
          file_name: string | null
          id: string
          platform: string
          published_at: string
          release_notes: string
          status: string
          version: string
        }
        Insert: {
          artifact_path?: string | null
          created_at?: string
          created_by?: string | null
          download_url?: string | null
          file_name?: string | null
          id?: string
          platform: string
          published_at?: string
          release_notes: string
          status?: string
          version: string
        }
        Update: {
          artifact_path?: string | null
          created_at?: string
          created_by?: string | null
          download_url?: string | null
          file_name?: string | null
          id?: string
          platform?: string
          published_at?: string
          release_notes?: string
          status?: string
          version?: string
        }
        Relationships: []
      }
      platform_gym_backups: {
        Row: {
          backup_type: string
          created_at: string
          created_by: string | null
          gym_id: string
          id: string
          size_bytes: number
          snapshot: Json
          status: string
        }
        Insert: {
          backup_type?: string
          created_at?: string
          created_by?: string | null
          gym_id: string
          id?: string
          size_bytes?: number
          snapshot: Json
          status?: string
        }
        Update: {
          backup_type?: string
          created_at?: string
          created_by?: string | null
          gym_id?: string
          id?: string
          size_bytes?: number
          snapshot?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_gym_backups_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_member_migration_items: {
        Row: {
          created_at: string
          destination_member_id: string | null
          message: string
          operation_id: string
          outcome: string
          request_digest: string | null
          row_number: number
          source_member_id: string | null
        }
        Insert: {
          created_at?: string
          destination_member_id?: string | null
          message?: string
          operation_id: string
          outcome: string
          request_digest?: string | null
          row_number: number
          source_member_id?: string | null
        }
        Update: {
          created_at?: string
          destination_member_id?: string | null
          message?: string
          operation_id?: string
          outcome?: string
          request_digest?: string | null
          row_number?: number
          source_member_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_member_migration_items_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "platform_member_migration_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_member_migration_links: {
        Row: {
          destination_gym_id: string
          destination_member_id: string
          operation_id: string
          source_gym_id: string
          source_member_id: string
          transferred_at: string
        }
        Insert: {
          destination_gym_id: string
          destination_member_id: string
          operation_id: string
          source_gym_id: string
          source_member_id: string
          transferred_at?: string
        }
        Update: {
          destination_gym_id?: string
          destination_member_id?: string
          operation_id?: string
          source_gym_id?: string
          source_member_id?: string
          transferred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_member_migration_links_destination_gym_id_fkey"
            columns: ["destination_gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_member_migration_links_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "platform_member_migration_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_member_migration_links_source_gym_id_fkey"
            columns: ["source_gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_member_migration_operations: {
        Row: {
          admin_user_id: string | null
          config: Json
          created_at: string
          destination_gym_id: string | null
          failed_count: number
          id: string
          operation_type: string
          skipped_count: number
          source_gym_id: string | null
          status: string
          successful_count: number
          total_count: number
          updated_at: string
        }
        Insert: {
          admin_user_id?: string | null
          config?: Json
          created_at?: string
          destination_gym_id?: string | null
          failed_count?: number
          id: string
          operation_type: string
          skipped_count?: number
          source_gym_id?: string | null
          status?: string
          successful_count?: number
          total_count?: number
          updated_at?: string
        }
        Update: {
          admin_user_id?: string | null
          config?: Json
          created_at?: string
          destination_gym_id?: string | null
          failed_count?: number
          id?: string
          operation_type?: string
          skipped_count?: number
          source_gym_id?: string | null
          status?: string
          successful_count?: number
          total_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_member_migration_operations_destination_gym_id_fkey"
            columns: ["destination_gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_member_migration_operations_source_gym_id_fkey"
            columns: ["source_gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_signup_allowlist: {
        Row: {
          consumed_at: string | null
          email: string
          gym_name: string
          invited_at: string
          invited_by: string | null
          note: string
          revoked_at: string | null
          revoked_by: string | null
        }
        Insert: {
          consumed_at?: string | null
          email: string
          gym_name?: string
          invited_at?: string
          invited_by?: string | null
          note?: string
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Update: {
          consumed_at?: string | null
          email?: string
          gym_name?: string
          invited_at?: string
          invited_by?: string | null
          note?: string
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Relationships: []
      }
      recharge_codes: {
        Row: {
          batch_label: string | null
          code_hash: string
          created_at: string
          created_by: string | null
          duration_days: number
          id: string
          redeemed_at: string | null
          redeemed_by: string | null
          revoked_at: string | null
          revoked_by: string | null
          target_email: string | null
          target_user_id: string | null
          valid_until: string | null
        }
        Insert: {
          batch_label?: string | null
          code_hash: string
          created_at?: string
          created_by?: string | null
          duration_days?: number
          id?: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          target_email?: string | null
          target_user_id?: string | null
          valid_until?: string | null
        }
        Update: {
          batch_label?: string | null
          code_hash?: string
          created_at?: string
          created_by?: string | null
          duration_days?: number
          id?: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          target_email?: string | null
          target_user_id?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      subscription_entitlements: {
        Row: {
          created_at: string
          current_period_end: string | null
          gym_id: string | null
          last_verified_at: string
          manual_period_end: string | null
          owner_id: string
          provider_customer_id: string | null
          provider_period_end: string | null
          provider_source: string | null
          provider_status: string | null
          provider_subscription_id: string | null
          recharge_period_end: string | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          gym_id?: string | null
          last_verified_at?: string
          manual_period_end?: string | null
          owner_id: string
          provider_customer_id?: string | null
          provider_period_end?: string | null
          provider_source?: string | null
          provider_status?: string | null
          provider_subscription_id?: string | null
          recharge_period_end?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          gym_id?: string | null
          last_verified_at?: string
          manual_period_end?: string | null
          owner_id?: string
          provider_customer_id?: string | null
          provider_period_end?: string | null
          provider_source?: string | null
          provider_status?: string | null
          provider_subscription_id?: string | null
          recharge_period_end?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_entitlements_gym_id_fkey"
            columns: ["gym_id"]
            isOneToOne: false
            referencedRelation: "gyms"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_billing_webhook_event: {
        Args: {
          p_claim_token: string
          p_event_key: string
          p_event_type: string
          p_payload_sha256: string
          p_provider: string
          p_reclaim_after_seconds?: number
        }
        Returns: string
      }
      consume_api_rate_limit: {
        Args: {
          p_limit: number
          p_scope: string
          p_subject: string
          p_window_seconds: number
        }
        Returns: boolean
      }
      ensure_owner_gym: {
        Args: { p_initial_state: Json; p_name: string }
        Returns: Json
      }
      generate_recharge_codes: {
        Args: {
          p_batch_label?: string
          p_count?: number
          p_days?: number
          p_target_email?: string
          p_valid_days?: number
        }
        Returns: {
          batch_label: string
          code: string
          duration_days: number
          redeem_by: string
          target_email: string
        }[]
      }
      get_current_gym_context: { Args: never; Returns: Json }
      iv_before_user_created: { Args: { event: Json }; Returns: Json }
      iv_has_permission: {
        Args: { p_key: string; p_permissions: Json }
        Returns: boolean
      }
      iv_is_platform_admin: { Args: never; Returns: boolean }
      iv_validate_membership_plans: {
        Args: { p_state: Json }
        Returns: undefined
      }
      iv_validate_private_asset_references: {
        Args: { p_state: Json }
        Returns: undefined
      }
      iv_validate_workspace: { Args: { p_state: Json }; Returns: undefined }
      load_current_gym_workspace: { Args: never; Returns: Json }
      platform_add_signup_invite: {
        Args: { p_email: string; p_note?: string }
        Returns: Json
      }
      platform_archive_app_release: {
        Args: { p_release_id: string }
        Returns: Json
      }
      platform_create_gym_backup: { Args: { p_gym_id: string }; Returns: Json }
      platform_current_app_releases: {
        Args: never
        Returns: {
          artifact_path: string
          download_url: string
          file_name: string
          id: string
          platform: string
          published_at: string
          release_notes: string
          version: string
        }[]
      }
      platform_dashboard_summary: { Args: never; Returns: Json }
      platform_download_gym_backup: {
        Args: { p_backup_id: string }
        Returns: Json
      }
      platform_export_gym_backup: { Args: { p_gym_id: string }; Returns: Json }
      platform_finalize_member_migration: {
        Args: { p_operation_id: string }
        Returns: Json
      }
      platform_generate_recharge_code: {
        Args: {
          p_batch_label?: string
          p_days: number
          p_owner_id: string
          p_valid_days: number
        }
        Returns: {
          batch_label: string
          code: string
          duration_days: number
          redeem_by: string
          target_email: string
        }[]
      }
      platform_get_member_migration_context: {
        Args: { p_destination_gym_id: string; p_source_gym_id: string }
        Returns: Json
      }
      platform_grant_manual_pro: {
        Args: { p_days: number; p_gym_id: string }
        Returns: Json
      }
      platform_import_migration_members: {
        Args: {
          p_final?: boolean
          p_operation_id: string
          p_rows: Json
          p_source_gym_id: string
        }
        Returns: Json
      }
      platform_invite_gym_owner: {
        Args: { p_email: string; p_gym_name: string; p_note?: string }
        Returns: Json
      }
      platform_list_app_releases: {
        Args: never
        Returns: {
          artifact_path: string
          created_at: string
          created_by: string
          download_url: string
          file_name: string
          id: string
          platform: string
          published_at: string
          release_notes: string
          status: string
          version: string
        }[]
      }
      platform_list_audit_logs: {
        Args: { p_page?: number; p_page_size?: number }
        Returns: {
          action: string
          admin_email: string
          created_at: string
          gym_id: string
          gym_name: string
          id: number
          metadata: Json
          result: string
          total_count: number
        }[]
      }
      platform_list_gym_backups: {
        Args: { p_gym_id: string }
        Returns: {
          backup_id: string
          backup_type: string
          created_at: string
          created_by_email: string
          gym_id: string
          gym_name: string
          size_bytes: number
          status: string
        }[]
      }
      platform_list_gym_invites: {
        Args: never
        Returns: {
          consumed_at: string
          email: string
          gym_name: string
          invited_at: string
          note: string
          revoked_at: string
        }[]
      }
      platform_list_gyms: {
        Args: {
          p_page?: number
          p_page_size?: number
          p_search?: string
          p_status?: string
        }
        Returns: {
          account_status: string
          created_at: string
          days_remaining: number
          gym_id: string
          gym_name: string
          last_activity_at: string
          member_count: number
          owner_email: string
          owner_id: string
          owner_name: string
          subscription_expires_at: string
          subscription_source: string
          subscription_status: string
          total_count: number
        }[]
      }
      platform_list_member_migration_gyms: {
        Args: never
        Returns: {
          account_status: string
          gym_id: string
          gym_name: string
          has_workspace: boolean
          is_source: boolean
          member_count: number
          owner_email: string
        }[]
      }
      platform_list_member_migration_history: {
        Args: { p_page?: number; p_page_size?: number }
        Returns: {
          admin_email: string
          created_at: string
          destination_gym_name: string
          failed_count: number
          operation_id: string
          operation_type: string
          row_count: number
          skipped_count: number
          source_gym_name: string
          status: string
          successful_count: number
          total_count: number
          updated_at: string
        }[]
      }
      platform_list_member_migration_items: {
        Args: { p_operation_id: string }
        Returns: {
          destination_member_id: string
          message: string
          outcome: string
          row_number: number
          source_member_id: string
        }[]
      }
      platform_list_member_migration_members: {
        Args: {
          p_destination_gym_id?: string
          p_page?: number
          p_page_size?: number
          p_search?: string
          p_source_gym_id: string
        }
        Returns: {
          current_membership: Json
          member: Json
          possible_duplicate: boolean
          total_count: number
        }[]
      }
      platform_list_owners: {
        Args: never
        Returns: {
          can_revoke_bonus: boolean
          current_period_end: string
          days_remaining: number
          gym_id: string
          gym_name: string
          owner_email: string
          owner_id: string
          source: string
          status: string
        }[]
      }
      platform_list_recharge_codes: {
        Args: never
        Returns: {
          assigned_owner: string
          batch_label: string
          code_id: string
          code_status: string
          created_at: string
          duration_days: number
          issued_by: string
          redeem_by: string
          redeemed_at: string
          redeemed_by: string
          revoked_at: string
          revoked_by: string
        }[]
      }
      platform_list_signup_invites: {
        Args: never
        Returns: {
          consumed_at: string
          email: string
          invited_at: string
          note: string
          revoked_at: string
        }[]
      }
      platform_publish_app_release: {
        Args: {
          p_artifact_path?: string
          p_download_url?: string
          p_file_name?: string
          p_platform: string
          p_release_notes: string
          p_version: string
        }
        Returns: {
          artifact_path: string
          created_at: string
          created_by: string
          download_url: string
          file_name: string
          id: string
          platform: string
          published_at: string
          release_notes: string
          status: string
          version: string
        }[]
      }
      platform_restore_gym_backup: {
        Args: { p_backup_id: string; p_confirm_gym_name: string }
        Returns: Json
      }
      platform_revoke_pro: { Args: { p_gym_id: string }; Returns: Json }
      platform_revoke_recharge_code: {
        Args: { p_code_id: string }
        Returns: undefined
      }
      platform_revoke_signup_invite: {
        Args: { p_email: string }
        Returns: undefined
      }
      platform_set_bonus_pro_days: {
        Args: { p_days: number; p_gym_id: string }
        Returns: Json
      }
      platform_set_gym_status: {
        Args: { p_gym_id: string; p_note?: string; p_status: string }
        Returns: Json
      }
      platform_set_member_migration_source: {
        Args: { p_confirm_gym_name: string; p_gym_id: string }
        Returns: Json
      }
      platform_transfer_members: {
        Args: {
          p_all_member_ids: string[]
          p_destination_gym_id: string
          p_final?: boolean
          p_member_ids: string[]
          p_operation_id: string
          p_override_duplicates?: string[]
          p_plan_mapping: Json
          p_row_offset: number
          p_source_gym_id: string
          p_transfer_active_payments?: boolean
        }
        Returns: Json
      }
      platform_write_audit: {
        Args: {
          p_action: string
          p_gym_id?: string
          p_metadata?: Json
          p_result?: string
        }
        Returns: undefined
      }
      record_audit_event: {
        Args: {
          p_action: string
          p_entity_id?: string
          p_entity_type?: string
          p_metadata?: Json
        }
        Returns: undefined
      }
      record_current_member_attendance: {
        Args: { p_attendance_date: string; p_member_id: string }
        Returns: Json
      }
      redeem_recharge_code: { Args: { p_code: string }; Returns: Json }
      save_current_gym_workspace: {
        Args: { p_expected_revision: number; p_state: Json }
        Returns: Json
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
