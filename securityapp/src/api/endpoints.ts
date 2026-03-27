/**
 * Security Officer API Endpoints
 * Base URL: /api/security/ (configured in axios.config.ts)
 * All endpoints are relative to the base URL - DO NOT include /api/security/ prefix
 */
export const API_ENDPOINTS = {
  // ==================== AUTHENTICATION ====================
  LOGIN: '/login/',
  LOGOUT: '/logout/', // Optional - may not exist on backend (404 is handled gracefully)
  REFRESH_TOKEN: '/token/refresh/', // Optional - may not exist on backend (404 is handled gracefully)
  FORGOT_PASSWORD: '/password-reset/', // Password reset - sends email to user

  // ==================== PROFILE ====================
  GET_PROFILE: '/profile/',
  UPDATE_PROFILE: '/profile/', // PATCH

  // ==================== SOS ALERTS ====================
  // Note: These match the documented API - using /sos/ instead of /alerts/
  LIST_SOS: '/sos/',
  CREATE_SOS: '/sos/', // POST - for officers to create new alerts
  GET_SOS: '/sos/{id}/',
  UPDATE_SOS: '/sos/{id}/', // PATCH/PUT
  DELETE_SOS: '/sos/{id}/', // DELETE
  RESOLVE_SOS: '/sos/{id}/resolve/', // PATCH
  GET_ACTIVE_SOS: '/sos/active/',
  GET_RESOLVED_SOS: '/sos/resolved/',

  // Legacy alerts endpoints (for backward compatibility)
  GET_SECURITY_ALERTS: '/alerts/', // Maps to /sos/
  GET_ALERT_DETAILS: '/alerts/{id}/',
  ACCEPT_ALERT: '/alerts/{id}/accept/',
  CLOSE_ALERT: '/alerts/{id}/close/',

  // // ==================== CASES ====================
  // LIST_CASES: '/case/',
  // GET_CASE: '/case/{id}/',
  // CREATE_CASE: '/case/', // POST
  // UPDATE_CASE: '/case/{id}/', // PATCH/PUT
  // UPDATE_CASE_STATUS: '/case/{id}/update_status/', // PATCH
  // ACCEPT_CASE: '/case/{id}/accept/', // POST
  // REJECT_CASE: '/case/{id}/reject/', // POST
  // RESOLVE_CASE: '/case/{id}/resolve/', // POST

  // // ==================== INCIDENTS ====================
  // LIST_INCIDENTS: '/incidents/',
  // CREATE_INCIDENT: '/incidents/', // POST

  // ==================== NOTIFICATIONS ====================
  LIST_NOTIFICATIONS: '/notifications/',
  ACKNOWLEDGE_NOTIFICATIONS: '/notifications/acknowledge/', // POST

  // Legacy notifications endpoint
  NOTIFICATIONS: '/notifications/',

  // ==================== DASHBOARD ====================
  DASHBOARD: '/dashboard/',

  // ==================== NAVIGATION ====================
  NAVIGATION: '/navigation/',

  // ==================== LIVE LOCATION ====================
  START_LIVE_LOCATION: '/live_location/', // POST
  GET_LIVE_LOCATION_SESSIONS: '/live_location/', // GET
  UPDATE_LIVE_LOCATION: '/live_location/{session_id}/', // PATCH
  STOP_LIVE_LOCATION: '/live_location/{session_id}/', // DELETE

  // ==================== ADMIN/SUBADMIN ASSIGNMENT ====================
  // Geofence assignment APIs for subadmin functionality
  ASSIGN_GEOFENCE_TO_OFFICER: '/admin/officers/{officer_id}/geofences/', // POST
  DEACTIVATE_GEOFENCE_ASSIGNMENT: '/admin/officers/{officer_id}/geofences/{geofence_id}/', // PATCH
  GET_OFFICER_GEOFENCES: '/officers/{officer_id}/geofences/', // GET

  // ==================== LEGACY/ADDITIONAL (not in documented API) ====================
  // These are kept for backward compatibility or may be used by frontend
  // NOTE: These endpoints may not exist - use live_location endpoints instead
  UPDATE_LOCATION: '/live_location/', // Maps to live_location
  GET_USER_LOCATION: '/live_location/', // User location might be in SOS alert data
  GET_GEOFENCE_DETAILS: '/geofence/',
  GET_USERS_IN_AREA: '/geofence/{geofence_id}/users/',

  SEND_BROADCAST: '/broadcast/',
  GET_LOGS: '/logs/', // May map to incidents or cases
};