// Supabase database types for tv-desktop
// Based on tv-app schema

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      // ============================================================
      // WORK MODULE TABLES
      // ============================================================
      projects: {
        Row: {
          id: string;
          name: string;
          summary: string | null;
          description: string | null;
          icon: string;
          color: string;
          slug: string;
          identifier_prefix: string;
          next_task_number: number;
          created_at: string;
          updated_at: string;
          archived_at: string | null;
          sort_order: number;
          health: "on_track" | "at_risk" | "off_track";
          priority: number;
          lead: string | null;
          lead_id: string | null;
          target_date: string | null;
          status: "planned" | "active" | "completed" | "paused";
        };
        Insert: {
          id?: string;
          name: string;
          summary?: string | null;
          description?: string | null;
          icon?: string;
          color?: string;
          slug: string;
          identifier_prefix?: string;
          next_task_number?: number;
          created_at?: string;
          updated_at?: string;
          archived_at?: string | null;
          sort_order?: number;
          health?: "on_track" | "at_risk" | "off_track";
          priority?: number;
          lead?: string | null;
          lead_id?: string | null;
          target_date?: string | null;
          status?: "planned" | "active" | "completed" | "paused";
        };
        Update: {
          id?: string;
          name?: string;
          summary?: string | null;
          description?: string | null;
          icon?: string;
          color?: string;
          slug?: string;
          identifier_prefix?: string;
          next_task_number?: number;
          created_at?: string;
          updated_at?: string;
          archived_at?: string | null;
          sort_order?: number;
          health?: "on_track" | "at_risk" | "off_track";
          priority?: number;
          lead?: string | null;
          lead_id?: string | null;
          target_date?: string | null;
          status?: "planned" | "active" | "completed" | "paused";
        };
      };
      task_statuses: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          description: string | null;
          color: string;
          icon: string;
          type:
            | "backlog"
            | "unstarted"
            | "started"
            | "review"
            | "completed"
            | "canceled";
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          name: string;
          description?: string | null;
          color?: string;
          icon?: string;
          type:
            | "backlog"
            | "unstarted"
            | "started"
            | "review"
            | "completed"
            | "canceled";
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          name?: string;
          description?: string | null;
          color?: string;
          icon?: string;
          type?:
            | "backlog"
            | "unstarted"
            | "started"
            | "review"
            | "completed"
            | "canceled";
          sort_order?: number;
          created_at?: string;
        };
      };
      tasks: {
        Row: {
          id: string;
          project_id: string;
          status_id: string;
          task_number: number;
          title: string;
          description: string | null;
          priority: number;
          due_date: string | null;
          created_at: string;
          updated_at: string;
          completed_at: string | null;
          sort_order: number;
          linked_document_path: string | null;
          linked_document_repo: string | null;
          ai_generated: boolean;
          ai_suggestion_source: string | null;
          milestone_id: string | null;
          assignee_id: string | null;
          created_by: string | null;
          depends_on: string[];
          session_ref: string | null;
          requires_review: boolean;
          crm_deal_id: string | null;
          notion_page_id: string | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          status_id: string;
          task_number: number;
          title: string;
          description?: string | null;
          priority?: number;
          due_date?: string | null;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
          sort_order?: number;
          linked_document_path?: string | null;
          linked_document_repo?: string | null;
          ai_generated?: boolean;
          ai_suggestion_source?: string | null;
          milestone_id?: string | null;
          assignee_id?: string | null;
          created_by?: string | null;
          depends_on?: string[];
          session_ref?: string | null;
          requires_review?: boolean;
          crm_deal_id?: string | null;
          notion_page_id?: string | null;
        };
        Update: {
          id?: string;
          project_id?: string;
          status_id?: string;
          task_number?: number;
          title?: string;
          description?: string | null;
          priority?: number;
          due_date?: string | null;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
          sort_order?: number;
          linked_document_path?: string | null;
          linked_document_repo?: string | null;
          ai_generated?: boolean;
          ai_suggestion_source?: string | null;
          milestone_id?: string | null;
          assignee_id?: string | null;
          created_by?: string | null;
          depends_on?: string[];
          session_ref?: string | null;
          requires_review?: boolean;
          crm_deal_id?: string | null;
          notion_page_id?: string | null;
        };
      };
      labels: {
        Row: {
          id: string;
          name: string;
          color: string;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          color?: string;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          color?: string;
          description?: string | null;
          created_at?: string;
        };
      };
      task_labels: {
        Row: {
          task_id: string;
          label_id: string;
          created_at: string;
        };
        Insert: {
          task_id: string;
          label_id: string;
          created_at?: string;
        };
        Update: {
          task_id?: string;
          label_id?: string;
          created_at?: string;
        };
      };
      task_activity: {
        Row: {
          id: string;
          task_id: string;
          action: string;
          old_value: Json | null;
          new_value: Json | null;
          actor_name: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          action: string;
          old_value?: Json | null;
          new_value?: Json | null;
          actor_name?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string;
          action?: string;
          old_value?: Json | null;
          new_value?: Json | null;
          actor_name?: string | null;
          created_at?: string;
        };
      };
      initiatives: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          slug: string;
          icon: string;
          color: string;
          owner: string | null;
          owner_id: string | null;
          status: "planned" | "active" | "completed" | "paused";
          health: "on_track" | "at_risk" | "off_track";
          target_date: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
          archived_at: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          slug: string;
          icon?: string;
          color?: string;
          owner?: string | null;
          owner_id?: string | null;
          status?: "planned" | "active" | "completed" | "paused";
          health?: "on_track" | "at_risk" | "off_track";
          target_date?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
          archived_at?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          slug?: string;
          icon?: string;
          color?: string;
          owner?: string | null;
          owner_id?: string | null;
          status?: "planned" | "active" | "completed" | "paused";
          health?: "on_track" | "at_risk" | "off_track";
          target_date?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
          archived_at?: string | null;
        };
      };
      initiative_projects: {
        Row: {
          initiative_id: string;
          project_id: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          initiative_id: string;
          project_id: string;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          initiative_id?: string;
          project_id?: string;
          sort_order?: number;
          created_at?: string;
        };
      };
      milestones: {
        Row: {
          id: string;
          project_id: string;
          name: string;
          description: string | null;
          target_date: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          name: string;
          description?: string | null;
          target_date?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          name?: string;
          description?: string | null;
          target_date?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      users: {
        Row: {
          id: string;
          type: "human" | "bot";
          name: string;
          email: string | null;
          avatar_url: string | null;
          github_id: number | null;
          github_username: string | null;
          bot_folder_id: string | null;
          bot_department: string | null;
          created_at: string;
          updated_at: string;
          last_active_at: string | null;
        };
        Insert: {
          id?: string;
          type?: "human" | "bot";
          name: string;
          email?: string | null;
          avatar_url?: string | null;
          github_id?: number | null;
          github_username?: string | null;
          bot_folder_id?: string | null;
          bot_department?: string | null;
          created_at?: string;
          updated_at?: string;
          last_active_at?: string | null;
        };
        Update: {
          id?: string;
          type?: "human" | "bot";
          name?: string;
          email?: string | null;
          avatar_url?: string | null;
          github_id?: number | null;
          github_username?: string | null;
          bot_folder_id?: string | null;
          bot_department?: string | null;
          created_at?: string;
          updated_at?: string;
          last_active_at?: string | null;
        };
      };
      project_updates: {
        Row: {
          id: string;
          project_id: string;
          health: "on_track" | "at_risk" | "off_track";
          content: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          health?: "on_track" | "at_risk" | "off_track";
          content: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          health?: "on_track" | "at_risk" | "off_track";
          content?: string;
          created_by?: string | null;
          created_at?: string;
        };
      };

      // ============================================================
      // CRM TABLES
      // ============================================================
      crm_companies: {
        Row: {
          id: string;
          name: string;
          display_name: string | null;
          industry: string | null;
          website: string | null;
          stage: "prospect" | "opportunity" | "client" | "churned" | "partner";
          source: "apollo" | "inbound" | "referral" | "manual" | "existing";
          source_id: string | null;
          client_folder_path: string | null;
          domain_id: string | null;
          notes: string | null;
          tags: string[] | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          display_name?: string | null;
          industry?: string | null;
          website?: string | null;
          stage?: "prospect" | "opportunity" | "client" | "churned" | "partner";
          source?: "apollo" | "inbound" | "referral" | "manual" | "existing";
          source_id?: string | null;
          client_folder_path?: string | null;
          domain_id?: string | null;
          notes?: string | null;
          tags?: string[] | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          display_name?: string | null;
          industry?: string | null;
          website?: string | null;
          stage?: "prospect" | "opportunity" | "client" | "churned" | "partner";
          source?: "apollo" | "inbound" | "referral" | "manual" | "existing";
          source_id?: string | null;
          client_folder_path?: string | null;
          domain_id?: string | null;
          notes?: string | null;
          tags?: string[] | null;
          updated_at?: string;
        };
      };
      crm_contacts: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          email: string;
          phone: string | null;
          role: string | null;
          department: string | null;
          is_primary: boolean;
          is_active: boolean;
          notes: string | null;
          linkedin_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          email: string;
          phone?: string | null;
          role?: string | null;
          department?: string | null;
          is_primary?: boolean;
          is_active?: boolean;
          notes?: string | null;
          linkedin_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          name?: string;
          email?: string;
          phone?: string | null;
          role?: string | null;
          department?: string | null;
          is_primary?: boolean;
          is_active?: boolean;
          notes?: string | null;
          linkedin_url?: string | null;
          updated_at?: string;
        };
      };
      crm_deals: {
        Row: {
          id: string;
          company_id: string;
          name: string;
          description: string | null;
          value: number | null;
          currency: string;
          stage:
            | "prospect"
            | "lead"
            | "qualified"
            | "pilot"
            | "proposal"
            | "negotiation"
            | "won"
            | "lost";
          expected_close_date: string | null;
          actual_close_date: string | null;
          lost_reason: string | null;
          won_notes: string | null;
          notes: string | null;
          proposal_path: string | null;
          order_form_path: string | null;
          contact_ids: string[] | null;
          solution: string | null;
          stage_changed_at: string | null;
          stale_snoozed_until: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          name: string;
          description?: string | null;
          value?: number | null;
          currency?: string;
          stage?:
            | "prospect"
            | "lead"
            | "qualified"
            | "pilot"
            | "proposal"
            | "negotiation"
            | "won"
            | "lost";
          expected_close_date?: string | null;
          actual_close_date?: string | null;
          lost_reason?: string | null;
          won_notes?: string | null;
          notes?: string | null;
          proposal_path?: string | null;
          order_form_path?: string | null;
          contact_ids?: string[] | null;
          solution?: string | null;
          stage_changed_at?: string | null;
          stale_snoozed_until?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          name?: string;
          description?: string | null;
          value?: number | null;
          currency?: string;
          stage?:
            | "prospect"
            | "lead"
            | "qualified"
            | "pilot"
            | "proposal"
            | "negotiation"
            | "won"
            | "lost";
          expected_close_date?: string | null;
          actual_close_date?: string | null;
          lost_reason?: string | null;
          won_notes?: string | null;
          notes?: string | null;
          proposal_path?: string | null;
          order_form_path?: string | null;
          contact_ids?: string[] | null;
          solution?: string | null;
          stage_changed_at?: string | null;
          stale_snoozed_until?: string | null;
          updated_at?: string;
        };
      };
      crm_activities: {
        Row: {
          id: string;
          company_id: string;
          contact_id: string | null;
          deal_id: string | null;
          type: "note" | "call" | "meeting" | "email" | "task" | "stage_change";
          subject: string | null;
          content: string | null;
          activity_date: string;
          old_value: string | null;
          new_value: string | null;
          email_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          company_id: string;
          contact_id?: string | null;
          deal_id?: string | null;
          type: "note" | "call" | "meeting" | "email" | "task" | "stage_change";
          subject?: string | null;
          content?: string | null;
          activity_date?: string;
          old_value?: string | null;
          new_value?: string | null;
          email_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          company_id?: string;
          contact_id?: string | null;
          deal_id?: string | null;
          type?: "note" | "call" | "meeting" | "email" | "task" | "stage_change";
          subject?: string | null;
          content?: string | null;
          activity_date?: string;
          old_value?: string | null;
          new_value?: string | null;
          email_id?: string | null;
          created_at?: string;
        };
      };
      crm_email_company_links: {
        Row: {
          id: string;
          email_id: string;
          company_id: string;
          contact_id: string | null;
          match_type: "contact_email" | "domain" | "manual";
          created_at: string;
        };
        Insert: {
          id?: string;
          email_id: string;
          company_id: string;
          contact_id?: string | null;
          match_type?: "contact_email" | "domain" | "manual";
          created_at?: string;
        };
        Update: {
          id?: string;
          email_id?: string;
          company_id?: string;
          contact_id?: string | null;
          match_type?: "contact_email" | "domain" | "manual";
          created_at?: string;
        };
      };
      task_deal_links: {
        Row: {
          task_id: string;
          deal_id: string;
          created_at: string;
        };
        Insert: {
          task_id: string;
          deal_id: string;
          created_at?: string;
        };
        Update: {
          task_id?: string;
          deal_id?: string;
          created_at?: string;
        };
      };

      // ============================================================
      // PRODUCT MODULE TABLES
      // ============================================================
      product_modules: {
        Row: {
          id: string;
          name: string;
          slug: string;
          layer: "connectivity" | "application" | "experience";
          description: string | null;
          icon: string | null;
          doc_path: string | null;
          status: "active" | "maintenance" | "deprecated";
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          layer: "connectivity" | "application" | "experience";
          description?: string | null;
          icon?: string | null;
          doc_path?: string | null;
          status?: "active" | "maintenance" | "deprecated";
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          layer?: "connectivity" | "application" | "experience";
          description?: string | null;
          icon?: string | null;
          doc_path?: string | null;
          status?: "active" | "maintenance" | "deprecated";
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      product_features: {
        Row: {
          id: string;
          name: string;
          module_id: string;
          category: string | null;
          description: string | null;
          priority: number;
          tags: string[] | null;
          doc_path: string | null;
          status: "planned" | "alpha" | "beta" | "ga" | "deprecated";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          module_id: string;
          category?: string | null;
          description?: string | null;
          priority?: number;
          tags?: string[] | null;
          doc_path?: string | null;
          status?: "planned" | "alpha" | "beta" | "ga" | "deprecated";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          module_id?: string;
          category?: string | null;
          description?: string | null;
          priority?: number;
          tags?: string[] | null;
          doc_path?: string | null;
          status?: "planned" | "alpha" | "beta" | "ga" | "deprecated";
          created_at?: string;
          updated_at?: string;
        };
      };
      product_connectors: {
        Row: {
          id: string;
          name: string;
          platform_category: string;
          connector_type: "api" | "report_translator" | "rpa" | "hybrid";
          description: string | null;
          region: string | null;
          doc_path: string | null;
          status: "planned" | "development" | "active" | "maintenance" | "deprecated";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          platform_category: string;
          connector_type: "api" | "report_translator" | "rpa" | "hybrid";
          description?: string | null;
          region?: string | null;
          doc_path?: string | null;
          status?: "planned" | "development" | "active" | "maintenance" | "deprecated";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          platform_category?: string;
          connector_type?: "api" | "report_translator" | "rpa" | "hybrid";
          description?: string | null;
          region?: string | null;
          doc_path?: string | null;
          status?: "planned" | "development" | "active" | "maintenance" | "deprecated";
          created_at?: string;
          updated_at?: string;
        };
      };
      product_solutions: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          target_industry: string | null;
          roi_summary: string | null;
          doc_path: string | null;
          status: "draft" | "active" | "sunset";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          target_industry?: string | null;
          roi_summary?: string | null;
          doc_path?: string | null;
          status?: "draft" | "active" | "sunset";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          target_industry?: string | null;
          roi_summary?: string | null;
          doc_path?: string | null;
          status?: "draft" | "active" | "sunset";
          created_at?: string;
          updated_at?: string;
        };
      };
      product_releases: {
        Row: {
          id: string;
          version: string;
          name: string | null;
          description: string | null;
          release_date: string | null;
          notion_sync_path: string | null;
          status: "planned" | "in_progress" | "released";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          version: string;
          name?: string | null;
          description?: string | null;
          release_date?: string | null;
          notion_sync_path?: string | null;
          status?: "planned" | "in_progress" | "released";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          version?: string;
          name?: string | null;
          description?: string | null;
          release_date?: string | null;
          notion_sync_path?: string | null;
          status?: "planned" | "in_progress" | "released";
          created_at?: string;
          updated_at?: string;
        };
      };
      product_deployments: {
        Row: {
          id: string;
          domain_id: string;
          company_id: string | null;
          description: string | null;
          go_live_date: string | null;
          domain_path: string | null;
          status: "active" | "inactive" | "trial";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          domain_id: string;
          company_id?: string | null;
          description?: string | null;
          go_live_date?: string | null;
          domain_path?: string | null;
          status?: "active" | "inactive" | "trial";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          domain_id?: string;
          company_id?: string | null;
          description?: string | null;
          go_live_date?: string | null;
          domain_path?: string | null;
          status?: "active" | "inactive" | "trial";
          created_at?: string;
          updated_at?: string;
        };
      };

      // Product junction tables
      product_feature_connectors: {
        Row: {
          id: string;
          feature_id: string;
          connector_id: string;
          relation: "depends_on" | "integrates_with" | "optional";
          created_at: string;
        };
        Insert: {
          id?: string;
          feature_id: string;
          connector_id: string;
          relation?: "depends_on" | "integrates_with" | "optional";
          created_at?: string;
        };
        Update: {
          id?: string;
          feature_id?: string;
          connector_id?: string;
          relation?: "depends_on" | "integrates_with" | "optional";
          created_at?: string;
        };
      };
      product_solution_features: {
        Row: {
          id: string;
          solution_id: string;
          feature_id: string;
          is_core: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          solution_id: string;
          feature_id: string;
          is_core?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          solution_id?: string;
          feature_id?: string;
          is_core?: boolean;
          sort_order?: number;
          created_at?: string;
        };
      };
      product_solution_connectors: {
        Row: {
          id: string;
          solution_id: string;
          connector_id: string;
          is_required: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          solution_id: string;
          connector_id: string;
          is_required?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          solution_id?: string;
          connector_id?: string;
          is_required?: boolean;
          created_at?: string;
        };
      };
      product_release_items: {
        Row: {
          id: string;
          release_id: string;
          type: "feature" | "bugfix" | "connector" | "improvement";
          title: string;
          description: string | null;
          feature_id: string | null;
          connector_id: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          release_id: string;
          type: "feature" | "bugfix" | "connector" | "improvement";
          title: string;
          description?: string | null;
          feature_id?: string | null;
          connector_id?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          release_id?: string;
          type?: "feature" | "bugfix" | "connector" | "improvement";
          title?: string;
          description?: string | null;
          feature_id?: string | null;
          connector_id?: string | null;
          sort_order?: number;
          created_at?: string;
        };
      };
      product_deployment_connectors: {
        Row: {
          id: string;
          deployment_id: string;
          connector_id: string;
          status: "active" | "inactive" | "trial";
          enabled_date: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          deployment_id: string;
          connector_id: string;
          status?: "active" | "inactive" | "trial";
          enabled_date?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          deployment_id?: string;
          connector_id?: string;
          status?: "active" | "inactive" | "trial";
          enabled_date?: string | null;
          created_at?: string;
        };
      };
      product_deployment_solutions: {
        Row: {
          id: string;
          deployment_id: string;
          solution_id: string;
          status: "active" | "inactive" | "trial";
          enabled_date: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          deployment_id: string;
          solution_id: string;
          status?: "active" | "inactive" | "trial";
          enabled_date?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          deployment_id?: string;
          solution_id?: string;
          status?: "active" | "inactive" | "trial";
          enabled_date?: string | null;
          created_at?: string;
        };
      };

      // Product supporting tables
      product_activity: {
        Row: {
          id: string;
          entity_type: "module" | "feature" | "connector" | "solution" | "release" | "deployment";
          entity_id: string;
          action: string;
          old_value: Json | null;
          new_value: Json | null;
          content: string | null;
          actor_name: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          entity_type: "module" | "feature" | "connector" | "solution" | "release" | "deployment";
          entity_id: string;
          action: string;
          old_value?: Json | null;
          new_value?: Json | null;
          content?: string | null;
          actor_name?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          entity_type?: "module" | "feature" | "connector" | "solution" | "release" | "deployment";
          entity_id?: string;
          action?: string;
          old_value?: Json | null;
          new_value?: Json | null;
          content?: string | null;
          actor_name?: string | null;
          created_at?: string;
        };
      };
      product_task_links: {
        Row: {
          id: string;
          task_id: string;
          entity_type: "module" | "feature" | "connector" | "solution" | "release" | "deployment";
          entity_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          entity_type: "module" | "feature" | "connector" | "solution" | "release" | "deployment";
          entity_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          task_id?: string;
          entity_type?: "module" | "feature" | "connector" | "solution" | "release" | "deployment";
          entity_id?: string;
          created_at?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
