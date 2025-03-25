import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { getUser } from '@/lib/db/queries';
import { Pool } from 'pg';
import { PostgresAdapter } from '@auth/pg-adapter';

// Configure your database connection
const pool = new Pool({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  port: 5432,
});

export const authConfig = {
  adapter: PostgresAdapter(pool), // Add the PostgreSQL adapter
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const [user] = await getUser(credentials.email as string);
        if (!user) return null;

        const isValidPassword = user.password === credentials.password;
        if (!isValidPassword) return null;

        return { id: user.id, email: user.email };
      },
    }),
  ],
  session: {
    strategy: 'database', // Change from 'jwt' (default) to 'database'
  },
  callbacks: {
    async authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLoginPage = nextUrl.pathname === '/login';
      const isOnRegisterPage = nextUrl.pathname === '/register';

      if (isLoggedIn && (isOnLoginPage || isOnRegisterPage)) {
        return Response.redirect(new URL('/', nextUrl));
      }

      if (!isLoggedIn && !isOnLoginPage && !isOnRegisterPage) {
        return Response.redirect(new URL('/login', nextUrl));
      }

      return true;
    },
  },
  pages: {
    signIn: '/login',
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);