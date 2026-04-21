export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    /** Must match @supabase/postgrest-js `GenericSchema`: Tables, Views, Functions only. */
    Views: { [_ in never]: never };
    Functions: {
      consume_one_credit: {
        Args: Record<string, unknown>;
        Returns: boolean;
      };
      consume_generation_credit: {
        Args: Record<string, unknown>;
        Returns: boolean;
      };
      refund_generation_credit: {
        Args: Record<string, unknown>;
        Returns: undefined;
      };
      increment_share_public_view: {
        Args: { p_token: string };
        Returns: Json;
      };
      increment_share_views_by_public_id: {
        Args: { p_public_id: string };
        Returns: Json;
      };
      consume_one_credit_for_user: {
        Args: { target_user: string };
        Returns: boolean;
      };
      match_semantic_story_cache: {
        Args: { query_embedding: string; match_threshold: number; match_count: number };
        Returns: {
          prompt_hash: string;
          story: Json;
          audio_storage_path: string | null;
          distance: number;
        }[];
      };
      upsert_semantic_story_cache: {
        Args: {
          p_prompt_hash: string;
          p_embedding: string;
          p_story: Json;
          p_audio_storage_path: string | null;
        };
        Returns: null;
      };
      set_generation_prompt_embedding: {
        Args: { p_id: string; p_embedding: string };
        Returns: null;
      };
      claim_generation_queue_batch: {
        Args: { batch_size?: number };
        Returns: Json;
      };
    };
    Tables: {
      profiles: {
        Row: {
          id: string;
          credits: number;
          plan: string;
          daily_credits_reset_on: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          credits?: number;
          plan?: string;
          daily_credits_reset_on?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          credits?: number;
          plan?: string;
          daily_credits_reset_on?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      generations: {
        Row: {
          id: string;
          user_id: string;
          prompt: string;
          narrative: string;
          disclaimer_ack: boolean;
          audio_storage_path: string | null;
          voice_id: string | null;
          generation_meta: Json;
          share_slug: string;
          share_view_count: number;
          is_public: boolean;
          created_at: string;
          prompt_hash: string | null;
          prompt_embedding: string | null;
          image_storage_path: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          prompt: string;
          narrative: string;
          disclaimer_ack?: boolean;
          audio_storage_path?: string | null;
          voice_id?: string | null;
          generation_meta?: Json;
          share_slug?: string;
          share_view_count?: number;
          is_public?: boolean;
          created_at?: string;
          prompt_hash?: string | null;
          prompt_embedding?: string | null;
          image_storage_path?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          prompt?: string;
          narrative?: string;
          disclaimer_ack?: boolean;
          audio_storage_path?: string | null;
          voice_id?: string | null;
          generation_meta?: Json;
          share_slug?: string;
          share_view_count?: number;
          is_public?: boolean;
          created_at?: string;
          prompt_hash?: string | null;
          prompt_embedding?: string | null;
          image_storage_path?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "shares_generation_id_fkey",
            columns: ["id"],
            isOneToOne: false,
            referencedRelation: "shares",
            referencedColumns: ["generation_id"],
          },
        ];
      };
      prompt_completion_cache: {
        Row: {
          prompt_hash: string;
          prompt: string;
          response_text: string;
          tone: string;
          suggested_voice_style: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          prompt_hash: string;
          prompt: string;
          response_text: string;
          tone: string;
          suggested_voice_style: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          prompt_hash?: string;
          prompt?: string;
          response_text?: string;
          tone?: string;
          suggested_voice_style?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      semantic_story_cache: {
        Row: {
          prompt_hash: string;
          embedding: string;
          story: Json;
          audio_storage_path: string | null;
          hit_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          prompt_hash: string;
          embedding: string;
          story: Json;
          audio_storage_path?: string | null;
          hit_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          prompt_hash?: string;
          embedding?: string;
          story?: Json;
          audio_storage_path?: string | null;
          hit_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      generation_queue: {
        Row: {
          id: string;
          user_id: string;
          prompt: string;
          prompt_hash: string;
          fingerprint: string;
          status: "pending" | "processing" | "completed" | "failed";
          generation_id: string | null;
          error: string | null;
          result: Json | null;
          created_at: string;
          updated_at: string;
          started_at: string | null;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          prompt: string;
          prompt_hash: string;
          fingerprint: string;
          status?: "pending" | "processing" | "completed" | "failed";
          generation_id?: string | null;
          error?: string | null;
          result?: Json | null;
          created_at?: string;
          updated_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          prompt?: string;
          prompt_hash?: string;
          fingerprint?: string;
          status?: "pending" | "processing" | "completed" | "failed";
          generation_id?: string | null;
          error?: string | null;
          result?: Json | null;
          created_at?: string;
          updated_at?: string;
          started_at?: string | null;
          completed_at?: string | null;
        };
        Relationships: [];
      };
      shares: {
        Row: {
          id: string;
          generation_id: string;
          public_id: string;
          views: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          generation_id: string;
          public_id?: string;
          views?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          generation_id?: string;
          public_id?: string;
          views?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "shares_generation_id_fkey",
            columns: ["generation_id"],
            isOneToOne: false,
            referencedRelation: "generations",
            referencedColumns: ["id"],
          },
        ];
      };
      payments: {
        Row: {
          id: string;
          user_id: string;
          provider: "razorpay" | "nowpayments";
          status: "pending" | "processing" | "success" | "failed";
          amount: number;
          currency: string;
          transaction_id: string | null;
          provider_order_id: string;
          credits_granted: number;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider: "razorpay" | "nowpayments";
          status?: "pending" | "processing" | "success" | "failed";
          amount: number;
          currency?: string;
          transaction_id?: string | null;
          provider_order_id: string;
          credits_granted?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider?: "razorpay" | "nowpayments";
          status?: "pending" | "processing" | "success" | "failed";
          amount?: number;
          currency?: string;
          transaction_id?: string | null;
          provider_order_id?: string;
          credits_granted?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      webhook_events: {
        Row: {
          id: string;
          provider: "razorpay" | "nowpayments";
          event_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          provider: "razorpay" | "nowpayments";
          event_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          provider?: "razorpay" | "nowpayments";
          event_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      payment_orders: {
        Row: {
          id: string;
          user_id: string;
          razorpay_order_id: string;
          razorpay_payment_id: string | null;
          amount_paise: number;
          credits_purchased: number;
          status: "created" | "paid" | "failed" | "refunded";
          idempotency_key: string | null;
          raw_webhook: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          razorpay_order_id: string;
          razorpay_payment_id?: string | null;
          amount_paise: number;
          credits_purchased: number;
          status?: "created" | "paid" | "failed" | "refunded";
          idempotency_key?: string | null;
          raw_webhook?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          razorpay_order_id?: string;
          razorpay_payment_id?: string | null;
          amount_paise?: number;
          credits_purchased?: number;
          status?: "created" | "paid" | "failed" | "refunded";
          idempotency_key?: string | null;
          raw_webhook?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
  };
}
