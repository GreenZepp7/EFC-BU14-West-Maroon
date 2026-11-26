export type Database = {
  public: {
    Tables: {
      beta_members: {
        Row: {
          user_id: string
          email: string | null
          display_name: string
          role: 'parent' | 'coach' | 'player'
          active: boolean
          created_at: string
        }
        Insert: {
          user_id: string
          email?: string | null
          display_name: string
          role: 'parent' | 'coach' | 'player'
          active?: boolean
          created_at?: string
        }
        Update: {
          user_id?: string
          email?: string | null
          display_name?: string
          role?: 'parent' | 'coach' | 'player'
          active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      beta_messages: {
        Row: {
          id: number
          sender_id: string
          body: string
          created_at: string
        }
        Insert: {
          id?: number
          sender_id: string
          body: string
          created_at?: string
        }
        Update: {
          id?: number
          sender_id?: string
          body?: string
          created_at?: string
        }
        Relationships: [{
          foreignKeyName: 'beta_messages_sender_id_fkey'
          columns: ['sender_id']
          isOneToOne: false
          referencedRelation: 'beta_members'
          referencedColumns: ['user_id']
        }]
      }
      beta_push_subscriptions: {
        Row: {
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          created_at: string
        }
        Insert: {
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          created_at?: string
        }
        Update: {
          user_id?: string
          endpoint?: string
          p256dh?: string
          auth?: string
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      is_beta_member: { Args: Record<PropertyKey, never>; Returns: boolean }
      is_beta_coach: { Args: Record<PropertyKey, never>; Returns: boolean }
    }
    Enums: {
      beta_role: 'parent' | 'coach' | 'player'
    }
    CompositeTypes: { [_ in never]: never }
  }
}
