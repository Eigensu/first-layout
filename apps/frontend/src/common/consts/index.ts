 // Centralized common constants for the frontend app
 // Re-export API base URL from config constants to avoid duplication
 export { API_BASE_URL } from '@/config/constants';

 // Storage keys used for auth/session persistence
 export const LS_KEYS = {
   ACCESS_TOKEN: 'access_token',
   REFRESH_TOKEN: 'refresh_token',
   USER: 'user',
 } as const;

 // HTTP header names and values
 export const AUTH = {
   HEADER: 'Authorization',
   BEARER_PREFIX: 'Bearer ',
 } as const;

 export const CONTENT_TYPES = {
   JSON: 'application/json',
 } as const;

 // API client related config
 export const API = {
   PREFIX: '/api',
   TIMEOUT_MS: 30_000,
 } as const;

 // App routes referenced across the UI
 export const ROUTES = {
   HOME: '/',
   LOGIN: '/auth/login',
   REGISTER: '/auth/register',
 } as const;

 // Pagination defaults used by lists/tables
 export const PAGINATION = {
   DEFAULT_PAGE_SIZE: 20,
   MAX_PAGE_SIZE: 100,
 } as const;

 // Contest related enums reused across admin/public API modules and pages
 export const CONTEST = {
   STATUSES: ['draft', 'active', 'paused', 'completed', 'archived'] as const,
   VISIBILITIES: ['public', 'private'] as const,
   POINTS_SCOPES: ['time_window', 'snapshot'] as const,
 } as const;

