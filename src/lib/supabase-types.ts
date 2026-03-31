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
      _task_audit: {
        Row: {
          changed_at: string | null
          id: number
          new_project_id: string | null
          new_task_number: number | null
          old_project_id: string | null
          old_task_number: number | null
          query_source: string | null
          task_id: string | null
        }
        Insert: {
          changed_at?: string | null
          id?: number
          new_project_id?: string | null
          new_task_number?: number | null
          old_project_id?: string | null
          old_task_number?: number | null
          query_source?: string | null
          task_id?: string | null
        }
        Update: {
          changed_at?: string | null
          id?: number
          new_project_id?: string | null
          new_task_number?: number | null
          old_project_id?: string | null
          old_task_number?: number | null
          query_source?: string | null
          task_id?: string | null
        }
        Relationships: []
      }
      analytics_page_views: {
        Row: {
          created_at: string | null
          domain: string | null
          id: number
          is_internal: boolean
          page_path: string
          source: string
          user_id: string
          view_date: string
          views: number
        }
        Insert: {
          created_at?: string | null
          domain?: string | null
          id?: never
          is_internal?: boolean
          page_path: string
          source?: string
          user_id?: string
          view_date: string
          views?: number
        }
        Update: {
          created_at?: string | null
          domain?: string | null
          id?: never
          is_internal?: boolean
          page_path?: string
          source?: string
          user_id?: string
          view_date?: string
          views?: number
        }
        Relationships: []
      }
      api_task_logs: {
        Row: {
          completed_at: string | null
          duration_secs: number | null
          error: string | null
          id: string
          skill: string
          skill_name: string
          started_at: string
          status: string
          triggered_by: string
        }
        Insert: {
          completed_at?: string | null
          duration_secs?: number | null
          error?: string | null
          id?: string
          skill: string
          skill_name: string
          started_at?: string
          status?: string
          triggered_by: string
        }
        Update: {
          completed_at?: string | null
          duration_secs?: number | null
          error?: string | null
          id?: string
          skill?: string
          skill_name?: string
          started_at?: string
          status?: string
          triggered_by?: string
        }
        Relationships: []
      }
      blog_articles: {
        Row: {
          author: string | null
          category: string | null
          color: string | null
          content: string | null
          created_at: string | null
          description: string | null
          featured: boolean | null
          id: string
          illustration: string | null
          published_at: string | null
          read_time: string | null
          slug: string
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          author?: string | null
          category?: string | null
          color?: string | null
          content?: string | null
          created_at?: string | null
          description?: string | null
          featured?: boolean | null
          id?: string
          illustration?: string | null
          published_at?: string | null
          read_time?: string | null
          slug: string
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          author?: string | null
          category?: string | null
          color?: string | null
          content?: string | null
          created_at?: string | null
          description?: string | null
          featured?: boolean | null
          id?: string
          illustration?: string | null
          published_at?: string | null
          read_time?: string | null
          slug?: string
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      crm_activities: {
        Row: {
          activity_date: string
          company_id: string | null
          contact_id: string | null
          content: string | null
          created_at: string | null
          created_by: string | null
          email_id: string | null
          id: string
          new_value: string | null
          old_value: string | null
          project_id: string | null
          subject: string | null
          type: string
        }
        Insert: {
          activity_date?: string
          company_id?: string | null
          contact_id?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          email_id?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          project_id?: string | null
          subject?: string | null
          type: string
        }
        Update: {
          activity_date?: string
          company_id?: string | null
          contact_id?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          email_id?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          project_id?: string | null
          subject?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_companies: {
        Row: {
          annual_revenue: number | null
          client_folder_path: string | null
          created_at: string | null
          deal_folder_path: string | null
          display_name: string | null
          domain_id: string | null
          email_domains: string[] | null
          employee_count: number | null
          id: string
          industry: string | null
          name: string
          notes: string | null
          partner_id: string | null
          referred_by: string | null
          research_folder_path: string | null
          source: string | null
          source_id: string | null
          stage: string
          tags: string[] | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          annual_revenue?: number | null
          client_folder_path?: string | null
          created_at?: string | null
          deal_folder_path?: string | null
          display_name?: string | null
          domain_id?: string | null
          email_domains?: string[] | null
          employee_count?: number | null
          id?: string
          industry?: string | null
          name: string
          notes?: string | null
          partner_id?: string | null
          referred_by?: string | null
          research_folder_path?: string | null
          source?: string | null
          source_id?: string | null
          stage?: string
          tags?: string[] | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          annual_revenue?: number | null
          client_folder_path?: string | null
          created_at?: string | null
          deal_folder_path?: string | null
          display_name?: string | null
          domain_id?: string | null
          email_domains?: string[] | null
          employee_count?: number | null
          id?: string
          industry?: string | null
          name?: string
          notes?: string | null
          partner_id?: string | null
          referred_by?: string | null
          research_folder_path?: string | null
          source?: string | null
          source_id?: string | null
          stage?: string
          tags?: string[] | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_companies_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_access"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_contacts: {
        Row: {
          company_id: string
          created_at: string | null
          department: string | null
          email: string
          email_outreach_msg: string | null
          email_status: string | null
          id: string
          is_active: boolean | null
          is_primary: boolean | null
          linkedin_connect_msg: string | null
          linkedin_connected: boolean | null
          linkedin_dm_msg: string | null
          linkedin_url: string | null
          name: string
          notes: string | null
          phone: string | null
          prospect_stage: string | null
          prospect_type: string[] | null
          prospect_type_reason: string | null
          role: string | null
          seniority: string | null
          source: string | null
          source_id: string | null
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          department?: string | null
          email: string
          email_outreach_msg?: string | null
          email_status?: string | null
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          linkedin_connect_msg?: string | null
          linkedin_connected?: boolean | null
          linkedin_dm_msg?: string | null
          linkedin_url?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          prospect_stage?: string | null
          prospect_type?: string[] | null
          prospect_type_reason?: string | null
          role?: string | null
          seniority?: string | null
          source?: string | null
          source_id?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          department?: string | null
          email?: string
          email_outreach_msg?: string | null
          email_status?: string | null
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          linkedin_connect_msg?: string | null
          linkedin_connected?: boolean | null
          linkedin_dm_msg?: string | null
          linkedin_url?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          prospect_stage?: string | null
          prospect_type?: string[] | null
          prospect_type_reason?: string | null
          role?: string | null
          seniority?: string | null
          source?: string | null
          source_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_email_company_links: {
        Row: {
          company_id: string
          contact_id: string | null
          created_at: string | null
          email_id: string
          id: string
          match_type: string
        }
        Insert: {
          company_id: string
          contact_id?: string | null
          created_at?: string | null
          email_id: string
          id?: string
          match_type: string
        }
        Update: {
          company_id?: string
          contact_id?: string | null
          created_at?: string | null
          email_id?: string
          id?: string
          match_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_email_company_links_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_email_company_links_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      discussions: {
        Row: {
          author: string
          body: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          author: string
          body: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          author?: string
          body?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discussions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "discussions"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_artifacts: {
        Row: {
          action: string | null
          calculated_column_count: number | null
          category: string | null
          column_count: number | null
          created_date: string | null
          creator_name: string | null
          cron_expression: string | null
          dashboard_count: number | null
          data_category: string | null
          data_source: string | null
          data_sub_category: string | null
          data_type: string | null
          days_since_created: number | null
          days_since_update: number | null
          description: string | null
          domain: string
          field_count: number | null
          folder_path: string | null
          global_path: string | null
          has_overview: boolean | null
          id: string
          include_sitemap: boolean | null
          is_scheduled: boolean | null
          is_stale: boolean | null
          name: string | null
          plugin_count: number | null
          query_count: number | null
          resource_id: string
          resource_type: string
          resource_url: string | null
          row_count: number | null
          scheduled_workflow_count: number | null
          sitemap_group1: string | null
          sitemap_group2: string | null
          solution: string | null
          source_system: string | null
          space: string | null
          suggested_name: string | null
          summary_full: string | null
          summary_short: string | null
          synced_at: string | null
          table_name: string | null
          tags: string | null
          updated_date: string | null
          usage_status: string | null
          widget_count: number | null
          workflow_count: number | null
        }
        Insert: {
          action?: string | null
          calculated_column_count?: number | null
          category?: string | null
          column_count?: number | null
          created_date?: string | null
          creator_name?: string | null
          cron_expression?: string | null
          dashboard_count?: number | null
          data_category?: string | null
          data_source?: string | null
          data_sub_category?: string | null
          data_type?: string | null
          days_since_created?: number | null
          days_since_update?: number | null
          description?: string | null
          domain: string
          field_count?: number | null
          folder_path?: string | null
          global_path?: string | null
          has_overview?: boolean | null
          id?: string
          include_sitemap?: boolean | null
          is_scheduled?: boolean | null
          is_stale?: boolean | null
          name?: string | null
          plugin_count?: number | null
          query_count?: number | null
          resource_id: string
          resource_type: string
          resource_url?: string | null
          row_count?: number | null
          scheduled_workflow_count?: number | null
          sitemap_group1?: string | null
          sitemap_group2?: string | null
          solution?: string | null
          source_system?: string | null
          space?: string | null
          suggested_name?: string | null
          summary_full?: string | null
          summary_short?: string | null
          synced_at?: string | null
          table_name?: string | null
          tags?: string | null
          updated_date?: string | null
          usage_status?: string | null
          widget_count?: number | null
          workflow_count?: number | null
        }
        Update: {
          action?: string | null
          calculated_column_count?: number | null
          category?: string | null
          column_count?: number | null
          created_date?: string | null
          creator_name?: string | null
          cron_expression?: string | null
          dashboard_count?: number | null
          data_category?: string | null
          data_source?: string | null
          data_sub_category?: string | null
          data_type?: string | null
          days_since_created?: number | null
          days_since_update?: number | null
          description?: string | null
          domain?: string
          field_count?: number | null
          folder_path?: string | null
          global_path?: string | null
          has_overview?: boolean | null
          id?: string
          include_sitemap?: boolean | null
          is_scheduled?: boolean | null
          is_stale?: boolean | null
          name?: string | null
          plugin_count?: number | null
          query_count?: number | null
          resource_id?: string
          resource_type?: string
          resource_url?: string | null
          row_count?: number | null
          scheduled_workflow_count?: number | null
          sitemap_group1?: string | null
          sitemap_group2?: string | null
          solution?: string | null
          source_system?: string | null
          space?: string | null
          suggested_name?: string | null
          summary_full?: string | null
          summary_short?: string | null
          synced_at?: string | null
          table_name?: string | null
          tags?: string | null
          updated_date?: string | null
          usage_status?: string | null
          widget_count?: number | null
          workflow_count?: number | null
        }
        Relationships: []
      }
      domain_health_checks: {
        Row: {
          check_type: string
          checked_at: string
          details: Json
          domain: string
          status: string
        }
        Insert: {
          check_type: string
          checked_at?: string
          details?: Json
          domain: string
          status: string
        }
        Update: {
          check_type?: string
          checked_at?: string
          details?: Json
          domain?: string
          status?: string
        }
        Relationships: []
      }
      domain_metadata: {
        Row: {
          created_at: string
          domain: string
          domain_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          domain: string
          domain_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          domain?: string
          domain_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      domain_sync_status: {
        Row: {
          artifact: string
          count: number
          domain: string
          duration_ms: number | null
          last_sync: string
          phase: string
          status: string
        }
        Insert: {
          artifact: string
          count?: number
          domain: string
          duration_ms?: number | null
          last_sync?: string
          phase: string
          status?: string
        }
        Update: {
          artifact?: string
          count?: number
          domain?: string
          duration_ms?: number | null
          last_sync?: string
          phase?: string
          status?: string
        }
        Relationships: []
      }
      email_cache: {
        Row: {
          body_preview: string | null
          cached_at: string | null
          cached_by: string | null
          cc_emails: Json | null
          from_email: string
          from_name: string | null
          id: string
          received_at: string | null
          subject: string | null
          to_emails: Json | null
        }
        Insert: {
          body_preview?: string | null
          cached_at?: string | null
          cached_by?: string | null
          cc_emails?: Json | null
          from_email: string
          from_name?: string | null
          id: string
          received_at?: string | null
          subject?: string | null
          to_emails?: Json | null
        }
        Update: {
          body_preview?: string | null
          cached_at?: string | null
          cached_by?: string | null
          cc_emails?: Json | null
          from_email?: string
          from_name?: string | null
          id?: string
          received_at?: string | null
          subject?: string | null
          to_emails?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "email_cache_cached_by_fkey"
            columns: ["cached_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          bcc_email: string | null
          category: string | null
          content_path: string | null
          created_at: string
          from_email: string
          from_name: string
          group_id: string | null
          html_body: string | null
          id: string
          name: string
          report_path: string | null
          report_uploaded_at: string | null
          report_url: string | null
          scheduled_at: string | null
          sent_at: string | null
          status: string
          subject: string
          tokens: Record<string, string> | null
          updated_at: string
        }
        Insert: {
          bcc_email?: string | null
          category?: string | null
          content_path?: string | null
          created_at?: string
          from_email: string
          from_name: string
          group_id?: string | null
          html_body?: string | null
          id?: string
          name: string
          report_path?: string | null
          report_uploaded_at?: string | null
          report_url?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          subject: string
          tokens?: Record<string, string> | null
          updated_at?: string
        }
        Update: {
          bcc_email?: string | null
          category?: string | null
          content_path?: string | null
          created_at?: string
          from_email?: string
          from_name?: string
          group_id?: string | null
          html_body?: string | null
          id?: string
          name?: string
          report_path?: string | null
          report_uploaded_at?: string | null
          report_url?: string | null
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          tokens?: Record<string, string> | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_campaigns_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "email_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      email_contact_groups: {
        Row: {
          added_at: string
          contact_id: string
          group_id: string
        }
        Insert: {
          added_at?: string
          contact_id: string
          group_id: string
        }
        Update: {
          added_at?: string
          contact_id?: string
          group_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_contact_groups_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "email_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_contact_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "email_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      email_contacts: {
        Row: {
          company: string | null
          created_at: string
          domain: string | null
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          domain?: string | null
          email: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company?: string | null
          created_at?: string
          domain?: string | null
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_drafts: {
        Row: {
          company_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          from_email: string
          from_name: string
          html_body: string
          id: string
          sent_at: string | null
          status: string
          subject: string
          to_email: string
        }
        Insert: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          from_email?: string
          from_name?: string
          html_body: string
          id?: string
          sent_at?: string | null
          status?: string
          subject: string
          to_email: string
        }
        Update: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          from_email?: string
          from_name?: string
          html_body?: string
          id?: string
          sent_at?: string | null
          status?: string
          subject?: string
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_drafts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_drafts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_drafts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_entity_links: {
        Row: {
          created_at: string | null
          email_id: string
          email_type: string
          entity_id: string
          entity_type: string
          id: string
          match_method: string | null
          relevance_score: number | null
        }
        Insert: {
          created_at?: string | null
          email_id: string
          email_type: string
          entity_id: string
          entity_type: string
          id?: string
          match_method?: string | null
          relevance_score?: number | null
        }
        Update: {
          created_at?: string | null
          email_id?: string
          email_type?: string
          entity_id?: string
          entity_type?: string
          id?: string
          match_method?: string | null
          relevance_score?: number | null
        }
        Relationships: []
      }
      email_events: {
        Row: {
          campaign_id: string | null
          contact_id: string | null
          crm_contact_id: string | null
          draft_id: string | null
          event_type: string
          id: string
          ip_address: string | null
          occurred_at: string
          url_clicked: string | null
          user_agent: string | null
        }
        Insert: {
          campaign_id?: string | null
          contact_id?: string | null
          crm_contact_id?: string | null
          draft_id?: string | null
          event_type: string
          id?: string
          ip_address?: string | null
          occurred_at?: string
          url_clicked?: string | null
          user_agent?: string | null
        }
        Update: {
          campaign_id?: string | null
          contact_id?: string | null
          crm_contact_id?: string | null
          draft_id?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
          occurred_at?: string
          url_clicked?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "email_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_events_crm_contact_id_fkey"
            columns: ["crm_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_events_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "email_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      email_groups: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      emails: {
        Row: {
          action_required: boolean | null
          action_type: string | null
          analysis_summary: string | null
          body_preview: string | null
          cc_emails: Json | null
          classification_category: string | null
          classification_confidence: number | null
          classification_entity: string | null
          company_id: string | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string | null
          file_path: string | null
          folder: string | null
          from_email: string
          from_name: string | null
          has_attachments: boolean | null
          id: string
          is_read: boolean | null
          message_id: string | null
          outlook_id: string | null
          priority_score: number | null
          received_at: string | null
          subject: string | null
          to_emails: Json | null
          updated_at: string | null
          urgency: string | null
        }
        Insert: {
          action_required?: boolean | null
          action_type?: string | null
          analysis_summary?: string | null
          body_preview?: string | null
          cc_emails?: Json | null
          classification_category?: string | null
          classification_confidence?: number | null
          classification_entity?: string | null
          company_id?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          file_path?: string | null
          folder?: string | null
          from_email: string
          from_name?: string | null
          has_attachments?: boolean | null
          id?: string
          is_read?: boolean | null
          message_id?: string | null
          outlook_id?: string | null
          priority_score?: number | null
          received_at?: string | null
          subject?: string | null
          to_emails?: Json | null
          updated_at?: string | null
          urgency?: string | null
        }
        Update: {
          action_required?: boolean | null
          action_type?: string | null
          analysis_summary?: string | null
          body_preview?: string | null
          cc_emails?: Json | null
          classification_category?: string | null
          classification_confidence?: number | null
          classification_entity?: string | null
          company_id?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string | null
          file_path?: string | null
          folder?: string | null
          from_email?: string
          from_name?: string | null
          has_attachments?: boolean | null
          id?: string
          is_read?: boolean | null
          message_id?: string | null
          outlook_id?: string | null
          priority_score?: number | null
          received_at?: string | null
          subject?: string | null
          to_emails?: Json | null
          updated_at?: string | null
          urgency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emails_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emails_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      event_cache: {
        Row: {
          attendees: Json | null
          body_preview: string | null
          cached_at: string | null
          cached_by: string | null
          end_at: string | null
          end_timezone: string | null
          id: string
          is_all_day: boolean | null
          is_online_meeting: boolean | null
          location: string | null
          online_meeting_url: string | null
          organizer_email: string | null
          organizer_name: string | null
          start_at: string | null
          start_timezone: string | null
          subject: string | null
          web_link: string | null
        }
        Insert: {
          attendees?: Json | null
          body_preview?: string | null
          cached_at?: string | null
          cached_by?: string | null
          end_at?: string | null
          end_timezone?: string | null
          id: string
          is_all_day?: boolean | null
          is_online_meeting?: boolean | null
          location?: string | null
          online_meeting_url?: string | null
          organizer_email?: string | null
          organizer_name?: string | null
          start_at?: string | null
          start_timezone?: string | null
          subject?: string | null
          web_link?: string | null
        }
        Update: {
          attendees?: Json | null
          body_preview?: string | null
          cached_at?: string | null
          cached_by?: string | null
          end_at?: string | null
          end_timezone?: string | null
          id?: string
          is_all_day?: boolean | null
          is_online_meeting?: boolean | null
          location?: string | null
          online_meeting_url?: string | null
          organizer_email?: string | null
          organizer_name?: string | null
          start_at?: string | null
          start_timezone?: string | null
          subject?: string | null
          web_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_cache_cached_by_fkey"
            columns: ["cached_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      event_entity_links: {
        Row: {
          created_at: string
          end_at: string | null
          entity_id: string
          entity_type: string
          event_id: string
          id: string
          location: string | null
          match_method: string | null
          organizer_email: string | null
          organizer_name: string | null
          relevance_score: number | null
          start_at: string | null
          subject: string | null
        }
        Insert: {
          created_at?: string
          end_at?: string | null
          entity_id: string
          entity_type: string
          event_id: string
          id?: string
          location?: string | null
          match_method?: string | null
          organizer_email?: string | null
          organizer_name?: string | null
          relevance_score?: number | null
          start_at?: string | null
          subject?: string | null
        }
        Update: {
          created_at?: string
          end_at?: string | null
          entity_id?: string
          entity_type?: string
          event_id?: string
          id?: string
          location?: string | null
          match_method?: string | null
          organizer_email?: string | null
          organizer_name?: string | null
          relevance_score?: number | null
          start_at?: string | null
          subject?: string | null
        }
        Relationships: []
      }
      feed_cards: {
        Row: {
          archived: boolean
          author: Json | null
          badge: string
          body: string
          card_type: string
          category: string
          chips: string[] | null
          created_at: string
          created_by: string | null
          cta_action: string | null
          cta_label: string | null
          features: string[] | null
          id: string
          pinned: boolean
          scheduled_date: string | null
          series_id: string | null
          series_order: number
          source: string
          source_detail: string | null
          source_ref: string | null
          stats: Json | null
          title: string
          triggers: string[] | null
          updated_at: string
          visual: string | null
        }
        Insert: {
          archived?: boolean
          author?: Json | null
          badge: string
          body: string
          card_type: string
          category: string
          chips?: string[] | null
          created_at?: string
          created_by?: string | null
          cta_action?: string | null
          cta_label?: string | null
          features?: string[] | null
          id?: string
          pinned?: boolean
          scheduled_date?: string | null
          series_id?: string | null
          series_order?: number
          source: string
          source_detail?: string | null
          source_ref?: string | null
          stats?: Json | null
          title: string
          triggers?: string[] | null
          updated_at?: string
          visual?: string | null
        }
        Update: {
          archived?: boolean
          author?: Json | null
          badge?: string
          body?: string
          card_type?: string
          category?: string
          chips?: string[] | null
          created_at?: string
          created_by?: string | null
          cta_action?: string | null
          cta_label?: string | null
          features?: string[] | null
          id?: string
          pinned?: boolean
          scheduled_date?: string | null
          series_id?: string | null
          series_order?: number
          source?: string
          source_detail?: string | null
          source_ref?: string | null
          stats?: Json | null
          title?: string
          triggers?: string[] | null
          updated_at?: string
          visual?: string | null
        }
        Relationships: []
      }
      feed_interactions: {
        Row: {
          card_id: string
          id: string
          liked: boolean
          liked_at: string | null
          saved: boolean
          saved_at: string | null
          seen: boolean
          seen_at: string | null
          user_id: string
        }
        Insert: {
          card_id: string
          id?: string
          liked?: boolean
          liked_at?: string | null
          saved?: boolean
          saved_at?: string | null
          seen?: boolean
          seen_at?: string | null
          user_id: string
        }
        Update: {
          card_id?: string
          id?: string
          liked?: boolean
          liked_at?: string | null
          saved?: boolean
          saved_at?: string | null
          seen?: boolean
          seen_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_interactions_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "feed_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      initiative_activity: {
        Row: {
          action: string
          actor_name: string | null
          created_at: string | null
          id: string
          initiative_id: string
          new_value: Json | null
          old_value: Json | null
        }
        Insert: {
          action: string
          actor_name?: string | null
          created_at?: string | null
          id?: string
          initiative_id: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Update: {
          action?: string
          actor_name?: string | null
          created_at?: string | null
          id?: string
          initiative_id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "initiative_activity_initiative_id_fkey"
            columns: ["initiative_id"]
            isOneToOne: false
            referencedRelation: "initiatives"
            referencedColumns: ["id"]
          },
        ]
      }
      initiative_projects: {
        Row: {
          created_at: string | null
          initiative_id: string
          project_id: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          initiative_id: string
          project_id: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          initiative_id?: string
          project_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "initiative_projects_initiative_id_fkey"
            columns: ["initiative_id"]
            isOneToOne: false
            referencedRelation: "initiatives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "initiative_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      initiatives: {
        Row: {
          archived_at: string | null
          color: string | null
          created_at: string | null
          description: string | null
          health: string | null
          icon: string | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          slug: string
          sort_order: number | null
          status: string
          target_date: string | null
          updated_at: string | null
        }
        Insert: {
          archived_at?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          health?: string | null
          icon?: string | null
          id?: string
          name: string
          owner?: string | null
          owner_id?: string | null
          slug: string
          sort_order?: number | null
          status?: string
          target_date?: string | null
          updated_at?: string | null
        }
        Update: {
          archived_at?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          health?: string | null
          icon?: string | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          slug?: string
          sort_order?: number | null
          status?: string
          target_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "initiatives_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      job_run_steps: {
        Row: {
          cache_creation_tokens: number | null
          cache_read_tokens: number | null
          created_at: string | null
          id: number
          input_tokens: number | null
          output_tokens: number | null
          run_id: string
          stop_reason: string | null
          tool_details: Json | null
          tools: string[] | null
          turn_number: number
        }
        Insert: {
          cache_creation_tokens?: number | null
          cache_read_tokens?: number | null
          created_at?: string | null
          id?: never
          input_tokens?: number | null
          output_tokens?: number | null
          run_id: string
          stop_reason?: string | null
          tool_details?: Json | null
          tools?: string[] | null
          turn_number: number
        }
        Update: {
          cache_creation_tokens?: number | null
          cache_read_tokens?: number | null
          created_at?: string | null
          id?: never
          input_tokens?: number | null
          output_tokens?: number | null
          run_id?: string
          stop_reason?: string | null
          tool_details?: Json | null
          tools?: string[] | null
          turn_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "scheduler_run_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "job_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_runs: {
        Row: {
          cache_creation_tokens: number | null
          cache_read_tokens: number | null
          cost_usd: number | null
          created_at: string
          duration_secs: number | null
          error: string | null
          finished_at: string | null
          id: string
          input_tokens: number | null
          job_id: string | null
          job_name: string
          num_turns: number | null
          output: string | null
          output_preview: string | null
          output_tokens: number | null
          slack_posted: boolean | null
          started_at: string
          status: string
          trigger: string
        }
        Insert: {
          cache_creation_tokens?: number | null
          cache_read_tokens?: number | null
          cost_usd?: number | null
          created_at?: string
          duration_secs?: number | null
          error?: string | null
          finished_at?: string | null
          id: string
          input_tokens?: number | null
          job_id?: string | null
          job_name: string
          num_turns?: number | null
          output?: string | null
          output_preview?: string | null
          output_tokens?: number | null
          slack_posted?: boolean | null
          started_at: string
          status: string
          trigger: string
        }
        Update: {
          cache_creation_tokens?: number | null
          cache_read_tokens?: number | null
          cost_usd?: number | null
          created_at?: string
          duration_secs?: number | null
          error?: string | null
          finished_at?: string | null
          id?: string
          input_tokens?: number | null
          job_id?: string | null
          job_name?: string
          num_turns?: number | null
          output?: string | null
          output_preview?: string | null
          output_tokens?: number | null
          slack_posted?: boolean | null
          started_at?: string
          status?: string
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_job_runs_job"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          allowed_tools: string[] | null
          bot_path: string | null
          created_at: string
          cron_expression: string | null
          enabled: boolean
          generate_report: boolean
          id: string
          last_run_at: string | null
          last_run_status: string | null
          max_budget: number | null
          model: string
          name: string
          report_prefix: string | null
          skill_prompt: string
          skill_refs: Json | null
          slack_channel_name: string | null
          slack_webhook_url: string | null
          sod_reports_folder: string | null
          updated_at: string
        }
        Insert: {
          allowed_tools?: string[] | null
          bot_path?: string | null
          created_at?: string
          cron_expression?: string | null
          enabled?: boolean
          generate_report?: boolean
          id: string
          last_run_at?: string | null
          last_run_status?: string | null
          max_budget?: number | null
          model?: string
          name: string
          report_prefix?: string | null
          skill_prompt: string
          skill_refs?: Json | null
          slack_channel_name?: string | null
          slack_webhook_url?: string | null
          sod_reports_folder?: string | null
          updated_at?: string
        }
        Update: {
          allowed_tools?: string[] | null
          bot_path?: string | null
          created_at?: string
          cron_expression?: string | null
          enabled?: boolean
          generate_report?: boolean
          id?: string
          last_run_at?: string | null
          last_run_status?: string | null
          max_budget?: number | null
          model?: string
          name?: string
          report_prefix?: string | null
          skill_prompt?: string
          skill_refs?: Json | null
          slack_channel_name?: string | null
          slack_webhook_url?: string | null
          sod_reports_folder?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      labels: {
        Row: {
          color: string
          created_at: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          color?: string
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          color?: string
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      lookup_values: {
        Row: {
          color: string | null
          created_at: string | null
          icon: string | null
          id: string
          label: string
          metadata: Json | null
          sort_order: number
          type: string
          updated_at: string | null
          value: string
          weight: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          label: string
          metadata?: Json | null
          sort_order?: number
          type: string
          updated_at?: string | null
          value: string
          weight?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string
          label?: string
          metadata?: Json | null
          sort_order?: number
          type?: string
          updated_at?: string | null
          value?: string
          weight?: number | null
        }
        Relationships: []
      }
      milestones: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          project_id: string
          sort_order: number | null
          target_date: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          project_id: string
          sort_order?: number | null
          target_date?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          sort_order?: number | null
          target_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor: string
          body_preview: string
          created_at: string
          discussion_id: string | null
          entity_id: string
          entity_type: string
          id: string
          read: boolean
          recipient: string
          type: string
        }
        Insert: {
          actor: string
          body_preview: string
          created_at?: string
          discussion_id?: string | null
          entity_id: string
          entity_type: string
          id?: string
          read?: boolean
          recipient: string
          type?: string
        }
        Update: {
          actor?: string
          body_preview?: string
          created_at?: string
          discussion_id?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          read?: boolean
          recipient?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_discussion_id_fkey"
            columns: ["discussion_id"]
            isOneToOne: false
            referencedRelation: "discussions"
            referencedColumns: ["id"]
          },
        ]
      }
      notion_sync_configs: {
        Row: {
          created_at: string | null
          enabled: boolean | null
          field_mapping: Json
          filter: Json | null
          id: string
          last_synced_at: string | null
          name: string
          notion_database_id: string
          sync_interval_minutes: number | null
          target_project_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          enabled?: boolean | null
          field_mapping?: Json
          filter?: Json | null
          id?: string
          last_synced_at?: string | null
          name: string
          notion_database_id: string
          sync_interval_minutes?: number | null
          target_project_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          enabled?: boolean | null
          field_mapping?: Json
          filter?: Json | null
          id?: string
          last_synced_at?: string | null
          name?: string
          notion_database_id?: string
          sync_interval_minutes?: number | null
          target_project_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notion_sync_configs_target_project_id_fkey"
            columns: ["target_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_access: {
        Row: {
          active: boolean | null
          code: string
          company: string | null
          created_at: string | null
          email: string | null
          id: string
          last_accessed: string | null
          name: string
          phone: string | null
        }
        Insert: {
          active?: boolean | null
          code: string
          company?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          last_accessed?: string | null
          name: string
          phone?: string | null
        }
        Update: {
          active?: boolean | null
          code?: string
          company?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          last_accessed?: string | null
          name?: string
          phone?: string | null
        }
        Relationships: []
      }
      plans: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          ends_at: string
          horizon: string
          id: string
          sort_order: number | null
          starts_at: string
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          ends_at: string
          horizon: string
          id?: string
          sort_order?: number | null
          starts_at: string
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          ends_at?: string
          horizon?: string
          id?: string
          sort_order?: number | null
          starts_at?: string
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      portal_banners: {
        Row: {
          auto_dismiss_seconds: number | null
          bg_color: string | null
          content: string
          created_at: string | null
          cta_text: string | null
          cta_url: string | null
          dismissible: boolean | null
          ends_at: string | null
          id: string
          is_active: boolean | null
          starts_at: string | null
          target_sites: string[] | null
          text_color: string | null
          title: string
          type: string | null
          updated_at: string | null
        }
        Insert: {
          auto_dismiss_seconds?: number | null
          bg_color?: string | null
          content: string
          created_at?: string | null
          cta_text?: string | null
          cta_url?: string | null
          dismissible?: boolean | null
          ends_at?: string | null
          id?: string
          is_active?: boolean | null
          starts_at?: string | null
          target_sites?: string[] | null
          text_color?: string | null
          title: string
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          auto_dismiss_seconds?: number | null
          bg_color?: string | null
          content?: string
          created_at?: string | null
          cta_text?: string | null
          cta_url?: string | null
          dismissible?: boolean | null
          ends_at?: string | null
          id?: string
          is_active?: boolean | null
          starts_at?: string | null
          target_sites?: string[] | null
          text_color?: string | null
          title?: string
          type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      portal_changelog: {
        Row: {
          body: string
          category: string | null
          created_at: string | null
          id: string
          is_published: boolean | null
          published_at: string | null
          target_sites: string[] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          body: string
          category?: string | null
          created_at?: string | null
          id?: string
          is_published?: boolean | null
          published_at?: string | null
          target_sites?: string[] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string | null
          id?: string
          is_published?: boolean | null
          published_at?: string | null
          target_sites?: string[] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      portal_config: {
        Row: {
          domain: string
          id: string
          section_order: Json | null
          tab_order: Json | null
          updated_at: string | null
        }
        Insert: {
          domain: string
          id?: string
          section_order?: Json | null
          tab_order?: Json | null
          updated_at?: string | null
        }
        Update: {
          domain?: string
          id?: string
          section_order?: Json | null
          tab_order?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      portal_conversations: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          customer_email: string | null
          customer_name: string | null
          id: string
          incident_id: string | null
          metadata: Json | null
          resolved_at: string | null
          site_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string | null
          id?: string
          incident_id?: string | null
          metadata?: Json | null
          resolved_at?: string | null
          site_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string | null
          id?: string
          incident_id?: string | null
          metadata?: Json | null
          resolved_at?: string | null
          site_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_conversations_incident"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "portal_incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portal_conversations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "portal_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_docs: {
        Row: {
          category: string | null
          content: string
          created_at: string | null
          doc_type: string
          domain: string | null
          file_type: string | null
          file_url: string | null
          id: string
          is_widget_visible: boolean | null
          search_vector: unknown
          sort_order: number | null
          summary: string | null
          tags: string[] | null
          target_sites: string[]
          title: string
          updated_at: string | null
          view_count: number | null
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string | null
          doc_type: string
          domain?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_widget_visible?: boolean | null
          search_vector?: unknown
          sort_order?: number | null
          summary?: string | null
          tags?: string[] | null
          target_sites?: string[]
          title: string
          updated_at?: string | null
          view_count?: number | null
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string | null
          doc_type?: string
          domain?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_widget_visible?: boolean | null
          search_vector?: unknown
          sort_order?: number | null
          summary?: string | null
          tags?: string[] | null
          target_sites?: string[]
          title?: string
          updated_at?: string | null
          view_count?: number | null
        }
        Relationships: []
      }
      portal_events: {
        Row: {
          created_at: string | null
          event_data: Json | null
          event_type: string
          id: string
          session_id: string | null
          site_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          session_id?: string | null
          site_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          session_id?: string | null
          site_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_events_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "portal_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_incident_activity: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string | null
          id: string
          incident_id: string
          new_value: string | null
          note: string | null
          old_value: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string | null
          id?: string
          incident_id: string
          new_value?: string | null
          note?: string | null
          old_value?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string | null
          id?: string
          incident_id?: string
          new_value?: string | null
          note?: string | null
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_incident_activity_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "portal_incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_incidents: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          deal_id: string | null
          description: string | null
          display_id: string
          id: string
          metadata: Json | null
          priority: string | null
          reporter_email: string | null
          reporter_name: string | null
          site_id: string
          sla_resolved_at: string | null
          sla_response_at: string | null
          status: string | null
          task_id: string | null
          title: string
          type: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          deal_id?: string | null
          description?: string | null
          display_id: string
          id?: string
          metadata?: Json | null
          priority?: string | null
          reporter_email?: string | null
          reporter_name?: string | null
          site_id: string
          sla_resolved_at?: string | null
          sla_response_at?: string | null
          status?: string | null
          task_id?: string | null
          title: string
          type: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          deal_id?: string | null
          description?: string | null
          display_id?: string
          id?: string
          metadata?: Json | null
          priority?: string | null
          reporter_email?: string | null
          reporter_name?: string | null
          site_id?: string
          sla_resolved_at?: string | null
          sla_response_at?: string | null
          status?: string | null
          task_id?: string | null
          title?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_incidents_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "portal_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_messages: {
        Row: {
          attachments: Json | null
          content: string
          content_type: string | null
          conversation_id: string
          created_at: string | null
          id: string
          sender_id: string | null
          sender_name: string | null
          sender_type: string
        }
        Insert: {
          attachments?: Json | null
          content: string
          content_type?: string | null
          conversation_id: string
          created_at?: string | null
          id?: string
          sender_id?: string | null
          sender_name?: string | null
          sender_type: string
        }
        Update: {
          attachments?: Json | null
          content?: string
          content_type?: string | null
          conversation_id?: string
          created_at?: string | null
          id?: string
          sender_id?: string | null
          sender_name?: string | null
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "portal_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_popups: {
        Row: {
          body: string
          created_at: string | null
          cta_text: string | null
          cta_url: string | null
          frequency: string | null
          frequency_days: number | null
          id: string
          image_url: string | null
          is_active: boolean | null
          target_sites: string[] | null
          title: string
          trigger_type: string | null
          trigger_value: string | null
          updated_at: string | null
          url_pattern: string | null
        }
        Insert: {
          body: string
          created_at?: string | null
          cta_text?: string | null
          cta_url?: string | null
          frequency?: string | null
          frequency_days?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          target_sites?: string[] | null
          title: string
          trigger_type?: string | null
          trigger_value?: string | null
          updated_at?: string | null
          url_pattern?: string | null
        }
        Update: {
          body?: string
          created_at?: string | null
          cta_text?: string | null
          cta_url?: string | null
          frequency?: string | null
          frequency_days?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          target_sites?: string[] | null
          title?: string
          trigger_type?: string | null
          trigger_value?: string | null
          updated_at?: string | null
          url_pattern?: string | null
        }
        Relationships: []
      }
      portal_resources: {
        Row: {
          created_at: string | null
          description: string | null
          domain: string
          id: string
          include_sitemap: boolean | null
          name: string
          portal_content: string | null
          resource_id: string
          resource_type: string
          resource_url: string | null
          sitemap_group1: string
          sitemap_group2: string
          solution: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          domain: string
          id?: string
          include_sitemap?: boolean | null
          name: string
          portal_content?: string | null
          resource_id: string
          resource_type: string
          resource_url?: string | null
          sitemap_group1: string
          sitemap_group2: string
          solution?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          domain?: string
          id?: string
          include_sitemap?: boolean | null
          name?: string
          portal_content?: string | null
          resource_id?: string
          resource_type?: string
          resource_url?: string | null
          sitemap_group1?: string
          sitemap_group2?: string
          solution?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      portal_search_logs: {
        Row: {
          article_clicked: string | null
          created_at: string | null
          id: string
          query: string
          results_count: number | null
          site_id: string | null
        }
        Insert: {
          article_clicked?: string | null
          created_at?: string | null
          id?: string
          query: string
          results_count?: number | null
          site_id?: string | null
        }
        Update: {
          article_clicked?: string | null
          created_at?: string | null
          id?: string
          query?: string
          results_count?: number | null
          site_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_search_logs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "portal_sites"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_sites: {
        Row: {
          base_url: string | null
          company_id: string | null
          config: Json | null
          created_at: string | null
          domain_id: string | null
          id: string
          name: string
          slug: string
          updated_at: string | null
        }
        Insert: {
          base_url?: string | null
          company_id?: string | null
          config?: Json | null
          created_at?: string | null
          domain_id?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string | null
        }
        Update: {
          base_url?: string | null
          company_id?: string | null
          config?: Json | null
          created_at?: string | null
          domain_id?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      product_activity: {
        Row: {
          action: string
          actor_name: string | null
          content: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          new_value: Json | null
          old_value: Json | null
        }
        Insert: {
          action: string
          actor_name?: string | null
          content?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Update: {
          action?: string
          actor_name?: string | null
          content?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Relationships: []
      }
      product_connectors: {
        Row: {
          connector_type: string
          created_at: string
          description: string | null
          doc_path: string | null
          id: string
          name: string
          platform_category: string
          region: string | null
          status: string
          updated_at: string
        }
        Insert: {
          connector_type: string
          created_at?: string
          description?: string | null
          doc_path?: string | null
          id?: string
          name: string
          platform_category: string
          region?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          connector_type?: string
          created_at?: string
          description?: string | null
          doc_path?: string | null
          id?: string
          name?: string
          platform_category?: string
          region?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_deployment_connectors: {
        Row: {
          connector_id: string
          created_at: string
          deployment_id: string
          enabled_date: string | null
          id: string
          status: string
        }
        Insert: {
          connector_id: string
          created_at?: string
          deployment_id: string
          enabled_date?: string | null
          id?: string
          status?: string
        }
        Update: {
          connector_id?: string
          created_at?: string
          deployment_id?: string
          enabled_date?: string | null
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_deployment_connectors_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "product_connectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_deployment_connectors_deployment_id_fkey"
            columns: ["deployment_id"]
            isOneToOne: false
            referencedRelation: "product_deployments"
            referencedColumns: ["id"]
          },
        ]
      }
      product_deployment_solutions: {
        Row: {
          created_at: string
          deployment_id: string
          enabled_date: string | null
          id: string
          solution_id: string
          status: string
        }
        Insert: {
          created_at?: string
          deployment_id: string
          enabled_date?: string | null
          id?: string
          solution_id: string
          status?: string
        }
        Update: {
          created_at?: string
          deployment_id?: string
          enabled_date?: string | null
          id?: string
          solution_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_deployment_solutions_deployment_id_fkey"
            columns: ["deployment_id"]
            isOneToOne: false
            referencedRelation: "product_deployments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_deployment_solutions_solution_id_fkey"
            columns: ["solution_id"]
            isOneToOne: false
            referencedRelation: "product_solutions"
            referencedColumns: ["id"]
          },
        ]
      }
      product_deployments: {
        Row: {
          company_id: string | null
          created_at: string
          description: string | null
          domain_id: string
          domain_path: string | null
          go_live_date: string | null
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          domain_id: string
          domain_path?: string | null
          go_live_date?: string | null
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          domain_id?: string
          domain_path?: string | null
          go_live_date?: string | null
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_deployments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      product_feature_connectors: {
        Row: {
          connector_id: string
          created_at: string
          feature_id: string
          id: string
          relation: string
        }
        Insert: {
          connector_id: string
          created_at?: string
          feature_id: string
          id?: string
          relation?: string
        }
        Update: {
          connector_id?: string
          created_at?: string
          feature_id?: string
          id?: string
          relation?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_feature_connectors_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "product_connectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_feature_connectors_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "product_features"
            referencedColumns: ["id"]
          },
        ]
      }
      product_features: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          doc_path: string | null
          id: string
          module_id: string
          name: string
          priority: number
          status: string
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          doc_path?: string | null
          id?: string
          module_id: string
          name: string
          priority?: number
          status?: string
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          doc_path?: string | null
          id?: string
          module_id?: string
          name?: string
          priority?: number
          status?: string
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_features_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "product_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      product_modules: {
        Row: {
          created_at: string
          description: string | null
          doc_path: string | null
          icon: string | null
          id: string
          layer: string
          name: string
          slug: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          doc_path?: string | null
          icon?: string | null
          id?: string
          layer: string
          name: string
          slug: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          doc_path?: string | null
          icon?: string | null
          id?: string
          layer?: string
          name?: string
          slug?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_release_items: {
        Row: {
          connector_id: string | null
          created_at: string
          description: string | null
          feature_id: string | null
          id: string
          release_id: string
          sort_order: number
          title: string
          type: string
        }
        Insert: {
          connector_id?: string | null
          created_at?: string
          description?: string | null
          feature_id?: string | null
          id?: string
          release_id: string
          sort_order?: number
          title: string
          type: string
        }
        Update: {
          connector_id?: string | null
          created_at?: string
          description?: string | null
          feature_id?: string | null
          id?: string
          release_id?: string
          sort_order?: number
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_release_items_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "product_connectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_release_items_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "product_features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_release_items_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "product_releases"
            referencedColumns: ["id"]
          },
        ]
      }
      product_releases: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string | null
          notion_sync_path: string | null
          release_date: string | null
          status: string
          updated_at: string
          version: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string | null
          notion_sync_path?: string | null
          release_date?: string | null
          status?: string
          updated_at?: string
          version: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string | null
          notion_sync_path?: string | null
          release_date?: string | null
          status?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      product_solution_connectors: {
        Row: {
          connector_id: string
          created_at: string
          id: string
          is_required: boolean
          solution_id: string
        }
        Insert: {
          connector_id: string
          created_at?: string
          id?: string
          is_required?: boolean
          solution_id: string
        }
        Update: {
          connector_id?: string
          created_at?: string
          id?: string
          is_required?: boolean
          solution_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_solution_connectors_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "product_connectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_solution_connectors_solution_id_fkey"
            columns: ["solution_id"]
            isOneToOne: false
            referencedRelation: "product_solutions"
            referencedColumns: ["id"]
          },
        ]
      }
      product_solution_features: {
        Row: {
          created_at: string
          feature_id: string
          id: string
          is_core: boolean
          solution_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          feature_id: string
          id?: string
          is_core?: boolean
          solution_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          feature_id?: string
          id?: string
          is_core?: boolean
          solution_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_solution_features_feature_id_fkey"
            columns: ["feature_id"]
            isOneToOne: false
            referencedRelation: "product_features"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_solution_features_solution_id_fkey"
            columns: ["solution_id"]
            isOneToOne: false
            referencedRelation: "product_solutions"
            referencedColumns: ["id"]
          },
        ]
      }
      product_solutions: {
        Row: {
          created_at: string
          description: string | null
          doc_path: string | null
          id: string
          name: string
          roi_summary: string | null
          status: string
          target_industry: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          doc_path?: string | null
          id?: string
          name: string
          roi_summary?: string | null
          status?: string
          target_industry?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          doc_path?: string | null
          id?: string
          name?: string
          roi_summary?: string | null
          status?: string
          target_industry?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      product_task_links: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          task_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_task_links_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      project_artifacts: {
        Row: {
          created_at: string
          id: string
          label: string
          preview_content: string | null
          project_id: string | null
          reference: string
          session_id: string | null
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          preview_content?: string | null
          project_id?: string | null
          reference: string
          session_id?: string | null
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          preview_content?: string | null
          project_id?: string | null
          reference?: string
          session_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_artifacts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_artifacts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "project_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      project_context: {
        Row: {
          context_summary: string | null
          current_state: string | null
          id: string
          key_decisions: Json | null
          project_id: string | null
          updated_at: string
        }
        Insert: {
          context_summary?: string | null
          current_state?: string | null
          id?: string
          key_decisions?: Json | null
          project_id?: string | null
          updated_at?: string
        }
        Update: {
          context_summary?: string | null
          current_state?: string | null
          id?: string
          key_decisions?: Json | null
          project_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_context_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_sessions: {
        Row: {
          conversation_id: string | null
          created_at: string
          date: string
          decisions: Json | null
          id: string
          next_steps: string[] | null
          notes: string | null
          open_questions: string[] | null
          project_id: string | null
          summary: string | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          date?: string
          decisions?: Json | null
          id?: string
          next_steps?: string[] | null
          notes?: string | null
          open_questions?: string[] | null
          project_id?: string | null
          summary?: string | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          date?: string
          decisions?: Json | null
          id?: string
          next_steps?: string[] | null
          notes?: string | null
          open_questions?: string[] | null
          project_id?: string | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspace_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_updates: {
        Row: {
          content: string
          created_at: string | null
          created_by: string | null
          health: string
          id: string
          project_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by?: string | null
          health?: string
          id?: string
          project_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string | null
          health?: string
          id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_updates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_updates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          archived_at: string | null
          color: string | null
          company_id: string | null
          created_at: string | null
          deal_actual_close: string | null
          deal_contact_ids: string[] | null
          deal_currency: string | null
          deal_expected_close: string | null
          deal_lost_reason: string | null
          deal_notes: string | null
          deal_order_form_path: string | null
          deal_proposal_path: string | null
          deal_solution: string | null
          deal_stage: string | null
          deal_stage_changed_at: string | null
          deal_stale_snoozed_until: string | null
          deal_tags: string[] | null
          deal_value: number | null
          deal_won_notes: string | null
          description: string | null
          health: string | null
          icon: string | null
          id: string
          identifier_prefix: string | null
          lead: string | null
          lead_id: string | null
          name: string
          next_task_number: number | null
          priority: number | null
          project_type: string
          slug: string
          sort_order: number | null
          status: string | null
          summary: string | null
          target_date: string | null
          updated_at: string | null
        }
        Insert: {
          archived_at?: string | null
          color?: string | null
          company_id?: string | null
          created_at?: string | null
          deal_actual_close?: string | null
          deal_contact_ids?: string[] | null
          deal_currency?: string | null
          deal_expected_close?: string | null
          deal_lost_reason?: string | null
          deal_notes?: string | null
          deal_order_form_path?: string | null
          deal_proposal_path?: string | null
          deal_solution?: string | null
          deal_stage?: string | null
          deal_stage_changed_at?: string | null
          deal_stale_snoozed_until?: string | null
          deal_tags?: string[] | null
          deal_value?: number | null
          deal_won_notes?: string | null
          description?: string | null
          health?: string | null
          icon?: string | null
          id?: string
          identifier_prefix?: string | null
          lead?: string | null
          lead_id?: string | null
          name: string
          next_task_number?: number | null
          priority?: number | null
          project_type?: string
          slug: string
          sort_order?: number | null
          status?: string | null
          summary?: string | null
          target_date?: string | null
          updated_at?: string | null
        }
        Update: {
          archived_at?: string | null
          color?: string | null
          company_id?: string | null
          created_at?: string | null
          deal_actual_close?: string | null
          deal_contact_ids?: string[] | null
          deal_currency?: string | null
          deal_expected_close?: string | null
          deal_lost_reason?: string | null
          deal_notes?: string | null
          deal_order_form_path?: string | null
          deal_proposal_path?: string | null
          deal_solution?: string | null
          deal_stage?: string | null
          deal_stage_changed_at?: string | null
          deal_stale_snoozed_until?: string | null
          deal_tags?: string[] | null
          deal_value?: number | null
          deal_won_notes?: string | null
          description?: string | null
          health?: string | null
          icon?: string | null
          id?: string
          identifier_prefix?: string | null
          lead?: string | null
          lead_id?: string | null
          name?: string
          next_task_number?: number | null
          priority?: number | null
          project_type?: string
          slug?: string
          sort_order?: number | null
          status?: string | null
          summary?: string | null
          target_date?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_activity: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          file_path: string
          id: string
          machine: string | null
          new_value: string | null
          old_value: string | null
          skill_slug: string
          summary: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          file_path: string
          id?: string
          machine?: string | null
          new_value?: string | null
          old_value?: string | null
          skill_slug: string
          summary?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          file_path?: string
          id?: string
          machine?: string | null
          new_value?: string | null
          old_value?: string | null
          skill_slug?: string
          summary?: string | null
        }
        Relationships: []
      }
      skill_library: {
        Row: {
          category: string
          created_at: string
          description: string | null
          featured: boolean
          file_name: string
          id: string
          metrics: string[] | null
          published: boolean
          report_url: string | null
          skill_slug: string
          solution: string
          sort_order: number
          sources: string[] | null
          subcategory: string | null
          thumbnail_url: string | null
          title: string
          type: string
          updated_at: string
          writeup: string | null
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          featured?: boolean
          file_name: string
          id?: string
          metrics?: string[] | null
          published?: boolean
          report_url?: string | null
          skill_slug: string
          solution?: string
          sort_order?: number
          sources?: string[] | null
          subcategory?: string | null
          thumbnail_url?: string | null
          title: string
          type?: string
          updated_at?: string
          writeup?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          featured?: boolean
          file_name?: string
          id?: string
          metrics?: string[] | null
          published?: boolean
          report_url?: string | null
          skill_slug?: string
          solution?: string
          sort_order?: number
          sources?: string[] | null
          subcategory?: string | null
          thumbnail_url?: string | null
          title?: string
          type?: string
          updated_at?: string
          writeup?: string | null
        }
        Relationships: []
      }
      skills: {
        Row: {
          action: string | null
          category: string
          command: string | null
          created_at: string
          demo_uploaded: boolean
          demo_url: string | null
          description: string
          distributions: Json
          domain: string | null
          gallery_order: number | null
          gallery_pinned: boolean
          has_deck: boolean
          has_demo: boolean
          has_examples: boolean
          has_guide: boolean
          last_audited: string | null
          name: string
          needs_work: string | null
          outcome: string | null
          owner: string | null
          rating: number | null
          skill_type: string
          slug: string
          status: string
          subcategory: string | null
          target: string
          updated_at: string
          verified: boolean
          work_notes: string | null
        }
        Insert: {
          action?: string | null
          category?: string
          command?: string | null
          created_at?: string
          demo_uploaded?: boolean
          demo_url?: string | null
          description?: string
          distributions?: Json
          domain?: string | null
          gallery_order?: number | null
          gallery_pinned?: boolean
          has_deck?: boolean
          has_demo?: boolean
          has_examples?: boolean
          has_guide?: boolean
          last_audited?: string | null
          name: string
          needs_work?: string | null
          outcome?: string | null
          owner?: string | null
          rating?: number | null
          skill_type?: string
          slug: string
          status?: string
          subcategory?: string | null
          target?: string
          updated_at?: string
          verified?: boolean
          work_notes?: string | null
        }
        Update: {
          action?: string | null
          category?: string
          command?: string | null
          created_at?: string
          demo_uploaded?: boolean
          demo_url?: string | null
          description?: string
          distributions?: Json
          domain?: string | null
          gallery_order?: number | null
          gallery_pinned?: boolean
          has_deck?: boolean
          has_demo?: boolean
          has_examples?: boolean
          has_guide?: boolean
          last_audited?: string | null
          name?: string
          needs_work?: string | null
          outcome?: string | null
          owner?: string | null
          rating?: number | null
          skill_type?: string
          slug?: string
          status?: string
          subcategory?: string | null
          target?: string
          updated_at?: string
          verified?: boolean
          work_notes?: string | null
        }
        Relationships: []
      }
      task_activity: {
        Row: {
          action: string
          actor_name: string | null
          created_at: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
          task_id: string
        }
        Insert: {
          action: string
          actor_name?: string | null
          created_at?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          task_id: string
        }
        Update: {
          action?: string
          actor_name?: string | null
          created_at?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_activity_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assignees: {
        Row: {
          created_at: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      task_attachments: {
        Row: {
          created_at: string | null
          file_name: string
          file_type: string | null
          id: string
          notion_block_id: string | null
          size_bytes: number | null
          source: string
          task_id: string
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_type?: string | null
          id?: string
          notion_block_id?: string | null
          size_bytes?: number | null
          source?: string
          task_id: string
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_type?: string | null
          id?: string
          notion_block_id?: string | null
          size_bytes?: number | null
          source?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_labels: {
        Row: {
          created_at: string | null
          label_id: string
          task_id: string
        }
        Insert: {
          created_at?: string | null
          label_id: string
          task_id: string
        }
        Update: {
          created_at?: string | null
          label_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_labels_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_labels_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_statuses: {
        Row: {
          color: string
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          name: string
          project_id: string | null
          sort_order: number
          type: string
        }
        Insert: {
          color?: string
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          project_id?: string | null
          sort_order?: number
          type: string
        }
        Update: {
          color?: string
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          project_id?: string | null
          sort_order?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_statuses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          ai_generated: boolean | null
          ai_suggestion_source: string | null
          company_id: string | null
          completed_at: string | null
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          depends_on: string[] | null
          description: string | null
          due_date: string | null
          id: string
          last_pushed_at: string | null
          last_triaged_at: string | null
          linked_document_path: string | null
          linked_document_repo: string | null
          milestone_id: string | null
          notion_page_id: string | null
          priority: number | null
          project_id: string
          requires_review: boolean | null
          session_ref: string | null
          sort_order: number | null
          source: string
          status_id: string
          task_number: number | null
          task_type: string | null
          task_type_changed_at: string | null
          title: string
          triage_action: string | null
          triage_reason: string | null
          triage_score: number | null
          updated_at: string | null
        }
        Insert: {
          ai_generated?: boolean | null
          ai_suggestion_source?: string | null
          company_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          depends_on?: string[] | null
          description?: string | null
          due_date?: string | null
          id?: string
          last_pushed_at?: string | null
          last_triaged_at?: string | null
          linked_document_path?: string | null
          linked_document_repo?: string | null
          milestone_id?: string | null
          notion_page_id?: string | null
          priority?: number | null
          project_id: string
          requires_review?: boolean | null
          session_ref?: string | null
          sort_order?: number | null
          source?: string
          status_id: string
          task_number?: number | null
          task_type?: string | null
          task_type_changed_at?: string | null
          title: string
          triage_action?: string | null
          triage_reason?: string | null
          triage_score?: number | null
          updated_at?: string | null
        }
        Update: {
          ai_generated?: boolean | null
          ai_suggestion_source?: string | null
          company_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          depends_on?: string[] | null
          description?: string | null
          due_date?: string | null
          id?: string
          last_pushed_at?: string | null
          last_triaged_at?: string | null
          linked_document_path?: string | null
          linked_document_repo?: string | null
          milestone_id?: string | null
          notion_page_id?: string | null
          priority?: number | null
          project_id?: string
          requires_review?: boolean | null
          session_ref?: string | null
          sort_order?: number | null
          source?: string
          status_id?: string
          task_number?: number | null
          task_type?: string | null
          task_type_changed_at?: string | null
          title?: string
          triage_action?: string | null
          triage_reason?: string | null
          triage_score?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "task_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      triage_config: {
        Row: {
          id: string
          summary_max_tokens: number | null
          summary_model: string | null
          summary_system_prompt: string
          updated_at: string | null
        }
        Insert: {
          id?: string
          summary_max_tokens?: number | null
          summary_model?: string | null
          summary_system_prompt: string
          updated_at?: string | null
        }
        Update: {
          id?: string
          summary_max_tokens?: number | null
          summary_model?: string | null
          summary_system_prompt?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      triage_runs: {
        Row: {
          created_at: string | null
          created_by: string | null
          details: Json | null
          id: string
          summary: string | null
          tasks_scored: number | null
          view: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          details?: Json | null
          id?: string
          summary?: string | null
          tasks_scored?: number | null
          view: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          details?: Json | null
          id?: string
          summary?: string | null
          tasks_scored?: number | null
          view?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          avatar_url: string | null
          bot_department: string | null
          bot_folder_id: string | null
          created_at: string | null
          email: string | null
          github_id: number | null
          github_username: string | null
          id: string
          last_active_at: string | null
          microsoft_email: string | null
          microsoft_id: string | null
          name: string
          role: string
          type: string
          updated_at: string | null
          visible_modules: string[] | null
        }
        Insert: {
          avatar_url?: string | null
          bot_department?: string | null
          bot_folder_id?: string | null
          created_at?: string | null
          email?: string | null
          github_id?: number | null
          github_username?: string | null
          id?: string
          last_active_at?: string | null
          microsoft_email?: string | null
          microsoft_id?: string | null
          name: string
          role?: string
          type?: string
          updated_at?: string | null
          visible_modules?: string[] | null
        }
        Update: {
          avatar_url?: string | null
          bot_department?: string | null
          bot_folder_id?: string | null
          created_at?: string | null
          email?: string | null
          github_id?: number | null
          github_username?: string | null
          id?: string
          last_active_at?: string | null
          microsoft_email?: string | null
          microsoft_id?: string | null
          name?: string
          role?: string
          type?: string
          updated_at?: string | null
          visible_modules?: string[] | null
        }
        Relationships: []
      }
      whatsapp_summaries: {
        Row: {
          action_items: Json | null
          client_folder: string
          created_at: string | null
          date: string
          id: string
          initiative_id: string
          key_topics: Json | null
          media_notes: string | null
          message_count: number | null
          participants: Json | null
          source_file: string | null
          summary: string
          updated_at: string | null
        }
        Insert: {
          action_items?: Json | null
          client_folder: string
          created_at?: string | null
          date: string
          id?: string
          initiative_id: string
          key_topics?: Json | null
          media_notes?: string | null
          message_count?: number | null
          participants?: Json | null
          source_file?: string | null
          summary: string
          updated_at?: string | null
        }
        Update: {
          action_items?: Json | null
          client_folder?: string
          created_at?: string | null
          date?: string
          id?: string
          initiative_id?: string
          key_topics?: Json | null
          media_notes?: string | null
          message_count?: number | null
          participants?: Json | null
          source_file?: string | null
          summary?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_summaries_initiative_id_fkey"
            columns: ["initiative_id"]
            isOneToOne: false
            referencedRelation: "initiatives"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      scan_emails_for_entity: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: {
          already_linked: boolean
          email_id: string
          email_type: string
          from_email: string
          from_name: string
          match_method: string
          received_at: string
          relevance_score: number
          subject: string
        }[]
      }
      search_all: {
        Args: { entity_types?: string[]; query: string; result_limit?: number }
        Returns: {
          entity_id: string
          entity_type: string
          rank: number
          subtitle: string
          title: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sync_notion_task: {
        Args: {
          p_assignee_id?: string
          p_company_id?: string
          p_created_at?: string
          p_description?: string
          p_due_date?: string
          p_notion_content?: string
          p_notion_page_id: string
          p_priority?: number
          p_status_id?: string
          p_target_project_id: string
          p_title: string
          p_updated_at?: string
        }
        Returns: Json
      }
    }
    Enums: {
      task_type: "general" | "target" | "prospect" | "follow_up"
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
      task_type: ["general", "target", "prospect", "follow_up"],
    },
  },
} as const
