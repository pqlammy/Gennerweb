export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      contributions: {
        Row: {
          id: string
          user_id: string
          amount: number
          first_name: string
          last_name: string
          email: string
          address: string
          city: string
          postal_code: string
          gennervogt_id: string | null
          paid: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          amount: number
          first_name: string
          last_name: string
          email: string
          address: string
          city: string
          postal_code: string
          gennervogt_id?: string | null
          paid?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          amount?: number
          first_name?: string
          last_name?: string
          email?: string
          address?: string
          city?: string
          postal_code?: string
          gennervogt_id?: string | null
          paid?: boolean
          created_at?: string
        }
      }
      login_logs: {
        Row: {
          id: string
          user_id: string | null
          ip_address: string
          success: boolean
          created_at: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          ip_address: string
          success: boolean
          created_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string | null
          ip_address?: string
          success?: boolean
          created_at?: string | null
        }
      }
    }
    Views: {
      user_data: {
        Row: {
          id: string | null
          email: string | null
          role: string | null
        }
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
