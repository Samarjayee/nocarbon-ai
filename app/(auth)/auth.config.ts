import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { getUser } from '@/lib/db/queries';

export const authConfig = {
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials: Partial<Record<"email" | "password", unknown>>, request: Request) {
        console.log('authorize called with credentials:', credentials);
        const [user] = await getUser(credentials.email as string);
        console.log('User from getUser:', user);

        if (!user) {
          console.log('No user found');
          return null;
        }

        const isValidPassword = user.password === credentials.password;
        console.log('Password valid:', isValidPassword);

        if (!isValidPassword) {
          console.log('Invalid password');
          return null;
        }

        return { id: user.id, email: user.email };
      },
    }),
  ],
  session: {
    strategy: "jwt" as const,
  },
  callbacks: {
    async jwt({ token, user }: { token: any, user?: any }) {
      console.log('JWT callback - token:', token, 'user:', user);
      if (user) {
        token.id = user.id;
        token.email = user.email;
      }
      return token;
    },
    async session({ session, token }: { session: any, token: any }) {
      console.log('Session callback - session:', session, 'token:', token);
      if (token) {
        session.user.id = token.id;
        session.user.email = token.email;
      }
      return session;
    },
    async authorized({ auth, request: { nextUrl } }: { auth: any, request: { nextUrl: URL } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLoginPage = nextUrl.pathname === '/login';
      const isOnRegisterPage = nextUrl.pathname === '/register';

      console.log('Middleware - Path:', nextUrl.pathname, 'isLoggedIn:', isLoggedIn, 'Session:', auth);

      if (isLoggedIn && (isOnLoginPage || isOnRegisterPage)) {
        console.log('Redirecting to / because user is logged in');
        return Response.redirect(new URL('/', nextUrl));
      }

      if (!isLoggedIn && !isOnLoginPage && !isOnRegisterPage) {
        console.log('Redirecting to /login because user is not logged in');
        const loginUrl = new URL('/login', nextUrl);
        if (!isOnLoginPage) {
          loginUrl.searchParams.set('callbackUrl', nextUrl.toString());
        }
        return Response.redirect(loginUrl);
      }

      console.log('Allowing request to proceed');
      return true;
    },
  },
  pages: {
    signIn: '/login',
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);