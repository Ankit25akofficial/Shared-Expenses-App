import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: {
    signIn: '/login',
    error: '/login',
  },
});

// Match all private routes and API endpoints that require authentication
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/groups/:path*',
    '/api/groups/:path*',
    '/api/expenses/:path*',
    '/api/settlements/:path*',
    '/api/imports/:path*',
  ],
};
