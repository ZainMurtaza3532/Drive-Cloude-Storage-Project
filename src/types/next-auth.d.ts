import 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth' {
    interface User {
        id: string
    }

    interface Session {
        user: {
            id: string
            name?: string | null
            email?: string | null
            image?: string | null
            themePreference?: "LIGHT" | "DARK" | "SYSTEM"
        }
    }
}

declare module 'next-auth/jwt' {
    interface JWT {
        id?: string
        themePreference?: "LIGHT" | "DARK" | "SYSTEM"
    }
}
